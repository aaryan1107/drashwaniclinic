create function public.clinic_save_patient_intake(
  p_patient_id uuid,
  p_profile jsonb,
  p_record jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  patient_id uuid := auth.uid();
  intake public.patient_records;
  saved_profile public.clinic_profiles;
begin
  if patient_id is null or p_patient_id is distinct from patient_id then
    raise insufficient_privilege using message = 'Patient session does not match intake';
  end if;

  if jsonb_typeof(p_profile) is distinct from 'object'
     or (p_profile -> 'consent') is distinct from 'true'::jsonb then
    raise invalid_parameter_value using message = 'Intake consent is required';
  end if;

  select * into saved_profile
  from public.clinic_profiles
  where id = patient_id and role = 'patient'
  for update;

  if not found then
    raise no_data_found using message = 'Intake needs an existing patient profile';
  end if;

  -- A prior response may have been lost after the transaction committed.
  if saved_profile.medical_profile ->> 'intakeCompletedAt' is not null
     and exists (
       select from public.patient_records where id = patient_id::text and owner_id = patient_id
     ) then
    return jsonb_build_object(
      'patient_id', patient_id,
      'full_name', saved_profile.full_name,
      'phone', saved_profile.phone,
      'earlier_details_saved', (saved_profile.medical_profile - 'consentedAt' - 'intakeCompletedAt')
        is distinct from (p_profile - 'consentedAt' - 'intakeCompletedAt')
    );
  end if;

  intake := jsonb_populate_record(null::public.patient_records, p_record);
  update public.clinic_profiles
  set full_name = intake.name,
      phone = intake.mobile,
      medical_profile = p_profile || jsonb_build_object(
        'consentedAt', coalesce(nullif(saved_profile.medical_profile -> 'consentedAt', 'null'::jsonb), to_jsonb(now())),
        'intakeCompletedAt', now()
      )
  where id = patient_id;

  if not found then
    raise no_data_found using message = 'Intake could not update the patient profile';
  end if;

  insert into public.patient_records as saved (
    id, owner_id, name, age, gender, mobile, whatsapp, abha, source,
    conditions, latest, risk, vitals, history, symptoms, medicines, follow_up, last_visit
  )
  values (
    patient_id::text, patient_id, intake.name, intake.age, intake.gender, intake.mobile,
    intake.whatsapp, intake.abha, intake.source, intake.conditions, intake.latest, intake.risk,
    intake.vitals, intake.history, intake.symptoms, intake.medicines,
    intake.follow_up, intake.last_visit
  )
  on conflict (id) do update
  set name = excluded.name,
      age = excluded.age,
      gender = excluded.gender,
      mobile = excluded.mobile,
      whatsapp = excluded.whatsapp,
      abha = coalesce(excluded.abha, saved.abha),
      conditions = saved.conditions || array(
        select entry from unnest(excluded.conditions) as entry where array_position(saved.conditions, entry) is null
      ),
      latest = case
        when nullif(saved.vitals ->> 'fasting', '') is null
             and nullif(excluded.vitals ->> 'fasting', '') is not null then excluded.latest
        else saved.latest
      end,
      vitals = excluded.vitals || coalesce((
        select jsonb_object_agg(key, value) from jsonb_each(saved.vitals)
        where value not in ('""'::jsonb, 'null'::jsonb)
      ), '{}'::jsonb),
      history = saved.history || array(
        select entry from unnest(excluded.history) as entry where array_position(saved.history, entry) is null
      ),
      symptoms = saved.symptoms || array(
        select entry from unnest(excluded.symptoms) as entry where array_position(saved.symptoms, entry) is null
      ),
      medicines = saved.medicines || array(
        select entry from unnest(excluded.medicines) as entry where array_position(saved.medicines, entry) is null
      )
  where saved.owner_id = patient_id;

  if not found then
    raise no_data_found using message = 'Intake could not update the patient record';
  end if;

  return jsonb_build_object(
    'patient_id', patient_id, 'full_name', intake.name, 'phone', intake.mobile, 'earlier_details_saved', false
  );
end;
$$;

revoke execute on function public.clinic_save_patient_intake(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.clinic_save_patient_intake(uuid, jsonb, jsonb) to authenticated;
