-- Booked-patient counts per slot, with no names or details, so the patient Book tab can show how busy a slot is.
-- Patients cannot read other people's bookings directly (row level security), so this runs as the table owner
-- and returns only counts. NOT YET APPLIED to the live project: until it is, the app simply shows no counts.

create or replace function public.clinic_slot_load(p_clinic text, p_from date, p_to date)
returns table (appointment_date date, appointment_time text, reserved integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.appointment_date, r.appointment_time, count(*)::integer
  from public.appointment_requests r
  where r.clinic_id = p_clinic
    and r.appointment_date between p_from and least(p_to, p_from + 14)
    and r.status !~* '(cancell?ed|rejected|declined)'
    and r.payment_status not in ('FAILED', 'REFUNDED')
  group by r.appointment_date, r.appointment_time
$$;

revoke all on function public.clinic_slot_load(text, date, date) from public, anon;
grant execute on function public.clinic_slot_load(text, date, date) to authenticated;
