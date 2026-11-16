-- Persistent consultation unlock.
--
-- Flow:
--   1. Patient opens the hosted Razorpay page -> app inserts a PAYMENT_LINK_OPENED row for them.
--   2. Doctor sees pending rows and confirms -> row becomes MANUALLY_VERIFIED.
--   3. Razorpay Checkout path -> verify-consultation-payment Edge Function writes PAID_CONFIRMED
--      (uses the service role, so it bypasses these policies).
--   4. Patient app reads its own latest row on sign-in and when returning to the app.
--
-- Existing policies already cover: patients and doctors can SELECT (see harden migration).

-- Patients may create a pending row for themselves, and only in the pending state.
-- They can never create or edit a paid row, so they cannot unlock themselves.
grant insert on public.consultation_payments to authenticated;

drop policy if exists "patients can open own payment link records" on public.consultation_payments;
create policy "patients can open own payment link records"
on public.consultation_payments for insert
to authenticated
with check (
  (patient ->> 'user_id') = auth.uid()::text
  and payment_status = 'PAYMENT_LINK_OPENED'
);

-- Doctors can confirm (or revert) pending hosted-link payments.
grant update on public.consultation_payments to authenticated;

drop policy if exists "doctors can confirm consultation payments" on public.consultation_payments;
create policy "doctors can confirm consultation payments"
on public.consultation_payments for update
to authenticated
using (
  public.clinic_is_doctor()
  and payment_status in ('PAYMENT_LINK_OPENED', 'MANUALLY_VERIFIED')
)
with check (
  public.clinic_is_doctor()
  and payment_status in ('PAYMENT_LINK_OPENED', 'MANUALLY_VERIFIED')
);
