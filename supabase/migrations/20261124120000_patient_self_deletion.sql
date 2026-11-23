-- Patients delete their own account from the app. The delete-account Edge Function verifies the
-- signed-in user, removes their prescription PDFs from storage, calls this function, then deletes the
-- sign-in account. Everything runs in one transaction here, so a failure leaves nothing half-deleted.
--
-- Deleted: medical profile and patient record, readings, appointments, prescriptions, care plans,
-- visit records and their audit rows, sign-in history and the app profile.
-- Kept: payment rows, because the Income-tax Rules require a doctor's daily case register (patient
-- name, service, fee, date) for 7 tax years. Their email, phone and account link are removed, so only
-- the name, amount, date, purpose and Razorpay references remain.
--
-- Only the service role can run it. Doctors and front-desk staff cannot delete themselves this way.

create or replace function public.clinic_delete_patient_account(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  record_ids text[];
  account_email text;
  counts jsonb := '{}'::jsonb;
  n integer;
begin
  if target is null then
    raise invalid_parameter_value using message = 'A user id is required';
  end if;
  select email into account_email from auth.users where id = target;
  if exists (select 1 from public.clinic_profiles where id = target and role <> 'patient')
     or exists (select 1 from public.clinic_doctors where lower(email) = lower(account_email))
     or exists (select 1 from public.clinic_staff where lower(email) = lower(account_email)) then
    raise insufficient_privilege using message = 'Only patient accounts can be deleted here';
  end if;
  select coalesce(array_agg(id), '{}') into record_ids
  from public.patient_records where owner_id = target or id = target::text;

  delete from public.visit_audit
  where visit_id in (select id from public.visits where patient_id = any (record_ids));
  get diagnostics n = row_count; counts := counts || jsonb_build_object('visit_audit', n);

  delete from public.appointment_requests
  where patient_id = target or patient_record_id = any (record_ids);
  get diagnostics n = row_count; counts := counts || jsonb_build_object('appointment_requests', n);

  -- Keep what the tax register needs; drop contact details and the link to the account.
  update public.consultation_payments
  set patient = jsonb_strip_nulls(jsonb_build_object('name', patient->>'name', 'account_deleted_at', now())),
      updated_at = now()
  where patient->>'user_id' = target::text;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('payments_anonymised', n);

  -- Cascades to prescriptions, visits, visit_items and patient_care_plans.
  delete from public.patient_records where id = any (record_ids);
  get diagnostics n = row_count; counts := counts || jsonb_build_object('patient_records', n);

  delete from public.patient_readings where patient_id = target;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('patient_readings', n);

  delete from public.clinic_login_audit
  where user_id = target or (account_email is not null and lower(email) = lower(account_email));
  get diagnostics n = row_count; counts := counts || jsonb_build_object('clinic_login_audit', n);

  delete from public.clinic_profiles where id = target;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('clinic_profiles', n);

  return jsonb_build_object('record_ids', to_jsonb(record_ids), 'deleted', counts);
end;
$$;

revoke all on function public.clinic_delete_patient_account(uuid) from public, anon, authenticated;
grant execute on function public.clinic_delete_patient_account(uuid) to service_role;
