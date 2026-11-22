-- Run with psql -v ON_ERROR_STOP=1 against a disposable database with the clinic migrations applied.
begin;

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'intake-one@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'intake-two@example.invalid'),
  ('10000000-0000-4000-8000-000000000003', 'intake-three@example.invalid'),
  ('10000000-0000-4000-8000-000000000004', 'intake-doctor@example.invalid');

insert into public.clinic_profiles (id, role, full_name)
select id, case when email = 'intake-doctor@example.invalid' then 'doctor' else 'patient' end, 'Synthetic'
from auth.users where id::text like '10000000-0000-4000-8000-00000000000%' and email like 'intake-%@example.invalid';

insert into public.clinic_doctors (email, name) values ('intake-doctor@example.invalid', 'Synthetic doctor');
insert into public.patient_records (id, owner_id, name, notes, history, symptoms, medicines, vitals)
values
  ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   'Existing patient', 'Existing doctor note', array['Prior surgery'], array['Prior symptom'],
   array['Prior medication'], '{"bp":"120/80","fasting":""}'),
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
   'Conflicting owner', 'Other patient note', '{}', '{}', '{}', '{}');

set local role authenticated;

do $$
declare
  patient_one constant uuid := '10000000-0000-4000-8000-000000000001';
  patient_two constant uuid := '10000000-0000-4000-8000-000000000002';
  patient_three constant uuid := '10000000-0000-4000-8000-000000000003';
  doctor constant uuid := '10000000-0000-4000-8000-000000000004';
  profile constant jsonb := '{"consent":true,"drugAllergies":["Penicillin"],"allergyReaction":"Itchy rash","medicines":[{"name":"Metformin","dose":"500 mg nightly"}],"symptoms":["Tiredness"]}';
  record_fields constant jsonb := '{"name":"Synthetic intake","age":42,"mobile":"9000000000","source":"email","risk":"Low","latest":"Fasting 110 mg/dL","conditions":[],"vitals":{"bp":"130/90","fasting":"110 mg/dL"},"history":["Allergies: Penicillin (reaction: Itchy rash)","Patient intake: Emergency contact: Synthetic contact"],"symptoms":["Tiredness"],"medicines":["Taking: Metformin 500 mg nightly"],"notes":"Intake notes"}';
  saved_profile jsonb;
  result jsonb;
  saved_record public.patient_records;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', patient_one)::text, true);

  begin
    perform public.clinic_save_patient_intake(patient_two, profile, record_fields);
    raise exception 'Another patient ID was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.clinic_save_patient_intake(patient_one, profile - 'consent', record_fields);
    raise exception 'Missing consent was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.clinic_save_patient_intake(patient_one, profile, record_fields - 'risk');
    raise exception 'Invalid record was accepted';
  exception when not_null_violation then null;
  end;

  if not exists (
    select from public.clinic_profiles
    where id = patient_one and medical_profile = '{}'::jsonb and full_name = 'Synthetic' and phone is null
  ) or exists (select from public.patient_records where id = patient_one::text) then
    raise exception 'Record failure left a partially saved intake';
  end if;

  result := public.clinic_save_patient_intake(patient_one, profile, record_fields || jsonb_build_object('id', patient_two, 'owner_id', patient_two));
  if result ->> 'patient_id' is distinct from patient_one::text then
    raise exception 'The RPC did not return the authenticated patient ID';
  end if;
  select medical_profile into strict saved_profile from public.clinic_profiles where id = patient_one;
  select * into strict saved_record from public.patient_records where id = patient_one::text;
  if not (saved_profile @> profile) or saved_profile ->> 'consentedAt' is null
     or saved_record.history is distinct from array['Allergies: Penicillin (reaction: Itchy rash)', 'Patient intake: Emergency contact: Synthetic contact']
     or saved_record.medicines is distinct from array['Taking: Metformin 500 mg nightly']
     or saved_record.symptoms is distinct from array['Tiredness']
     or saved_record.owner_id is distinct from patient_one then
    raise exception 'New patient intake was not persisted in both tables';
  end if;
  if exists (select from public.patient_records where owner_id = patient_two) then
    raise exception 'Another patient record was visible';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', patient_three)::text, true);
  begin
    perform public.clinic_save_patient_intake(patient_three, profile, record_fields);
    raise exception 'A conflicting patient record was accepted';
  exception when insufficient_privilege or no_data_found then null;
  end;
  if (select medical_profile from public.clinic_profiles where id = patient_three) <> '{}'::jsonb then
    raise exception 'The owner conflict left the profile marked complete';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', patient_two)::text, true);
  perform public.clinic_save_patient_intake(patient_two, profile, record_fields);
  result := public.clinic_save_patient_intake(patient_two, profile || '{"consentedAt":"ignored retry timestamp"}', record_fields);
  if (result -> 'earlier_details_saved') is distinct from 'false'::jsonb then
    raise exception 'An identical retry was not confirmed';
  end if;
  result := public.clinic_save_patient_intake(
    patient_two,
    profile || '{"medicines":[{"name":"Metformin","dose":"250 mg nightly"}]}',
    record_fields || '{"medicines":["Taking: Metformin 250 mg nightly"]}'
  );
  if (result -> 'earlier_details_saved') is distinct from 'true'::jsonb
     or not ((select medical_profile from public.clinic_profiles where id = patient_two) @> profile) then
    raise exception 'An edited retry replaced the confirmed profile';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', doctor, 'email', 'intake-doctor@example.invalid')::text, true);
  if not public.clinic_is_doctor() then
    raise exception 'Doctor fixture is not authorized';
  end if;
  if not exists (select from public.patient_records where id = patient_one::text) then
    raise exception 'Authorized doctor cannot read the new record';
  end if;

  select * into strict saved_record from public.patient_records where id = patient_two::text;
  if saved_record.notes is distinct from 'Existing doctor note'
     or saved_record.history is distinct from array['Prior surgery', 'Allergies: Penicillin (reaction: Itchy rash)', 'Patient intake: Emergency contact: Synthetic contact']
     or saved_record.symptoms is distinct from array['Prior symptom', 'Tiredness']
     or saved_record.medicines is distinct from array['Prior medication', 'Taking: Metformin 500 mg nightly']
     or saved_record.latest is distinct from 'Fasting 110 mg/dL'
     or saved_record.vitals is distinct from '{"bp":"120/80","fasting":"110 mg/dL"}'::jsonb then
    raise exception 'Existing clinician data was changed or retry duplicated intake fields';
  end if;
  if not exists (
    select from public.patient_records where id = patient_three::text and notes = 'Other patient note'
  ) then
    raise exception 'A conflicting record was modified';
  end if;

  begin
    perform public.clinic_save_patient_intake(doctor, profile, record_fields);
    raise exception 'The doctor entered a patient intake';
  exception when no_data_found then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  if has_function_privilege(current_user, 'public.clinic_save_patient_intake(uuid,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'The intake RPC is granted to the anonymous role';
  end if;
  begin
    perform public.clinic_save_patient_intake(null, '{}'::jsonb, '{}'::jsonb);
    raise exception 'An anonymous caller can execute the intake RPC';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select '1..1';
select 'ok 1 - patient intake authorization, rollback, persistence and retries';
rollback;
