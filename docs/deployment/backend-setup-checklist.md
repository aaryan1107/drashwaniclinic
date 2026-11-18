# Backend Setup Checklist

Supabase project for this app:

```text
https://aswxzeklbabtflgmjszz.supabase.co
```

## Required Supabase SQL

Apply migrations in order from `supabase/migrations`:

```bash
supabase db push --project-ref aswxzeklbabtflgmjszz
```

Important migration added for final backend hardening:

```text
supabase/migrations/20260622183000_harden_clinic_backend.sql
```

It adds:

- Doctor allowlist table: `clinic_doctors`
- Doctor-safe RLS helper: `clinic_is_doctor()`
- Persistent doctor/patient records: `patient_records`
- Persistent appointment requests: `appointment_requests`
- Payment read policies for `consultation_payments`
- Rs 700 default online consultation fee
- RLS policies based on approved doctor email, not editable user metadata

## Required Supabase Auth Setup

Create the real doctor account (`drashwanikansal@gmail.com`) and set its password in Supabase Auth only. Never write passwords in this repository.

Do not keep shared test logins on a production project. If test accounts are needed, create them in a separate staging project. The earlier `doctortest@drashwaniclinic.local` test doctor must be deactivated on production:

```sql
update public.clinic_doctors set active = false where email = 'doctortest@drashwaniclinic.local';
```

Then delete that user in Supabase Auth, and rotate any password that was ever written in this repository's history.

Doctor access is allowed only if the email exists in `public.clinic_doctors`.

Add the real doctor email in SQL if needed:

```sql
insert into public.clinic_doctors (email, name, active)
values ('drashwanikansal@gmail.com', 'Dr. Ashwani Kansal', true)
on conflict (email) do update set active = true;
```

## Required Edge Functions

Deploy both functions with JWT verification enabled:

```bash
supabase functions deploy create-consultation-order --project-ref aswxzeklbabtflgmjszz
supabase functions deploy verify-consultation-payment --project-ref aswxzeklbabtflgmjszz
```

## Required Supabase Secrets

Set these in Supabase Edge Function secrets:

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_live_or_test_key --project-ref aswxzeklbabtflgmjszz
supabase secrets set RAZORPAY_KEY_SECRET=your_razorpay_secret --project-ref aswxzeklbabtflgmjszz
supabase secrets set PROJECT_URL=https://aswxzeklbabtflgmjszz.supabase.co --project-ref aswxzeklbabtflgmjszz
supabase secrets set SERVICE_ROLE_KEY=your_service_role_key --project-ref aswxzeklbabtflgmjszz
supabase secrets set OPENAI_API_KEY=your_openai_key --project-ref aswxzeklbabtflgmjszz
supabase secrets set OPENAI_MODEL=gpt-4.1-mini --project-ref aswxzeklbabtflgmjszz
```

The functions read `PROJECT_URL` and `SERVICE_ROLE_KEY`. Do not use `SUPABASE_`-prefixed secret names: the functions would fail to authenticate users and every payment or AI call would return 401.

## Required Frontend Environment

Set these wherever the app is deployed:

```text
VITE_SUPABASE_URL=https://aswxzeklbabtflgmjszz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
VITE_RAZORPAY_KEY_ID=rzp_live_or_test_key
VITE_RAZORPAY_API_BASE=https://aswxzeklbabtflgmjszz.supabase.co/functions/v1
VITE_RAZORPAY_PAYMENT_LINK=https://razorpay.me/@drashwanisfamilyclinicdiagnos
```

## Razorpay Flow

- Online consultation amount is locked to Rs 700.
- Frontend creates a Razorpay order through `create-consultation-order`.
- Edge Function rejects unauthenticated users and any amount other than `70000` paise.
- Razorpay Checkout verifies through `verify-consultation-payment`.
- WhatsApp consult unlocks only after verification returns success.
- If live Checkout keys are missing, the hosted Razorpay payment link can open, but the doctor/admin must manually verify the receipt.

## Front-desk staff (read-only prescriptions)

Front-desk staff can search, view and print prescriptions but cannot issue, edit or void them. They are allowlisted by email in `public.clinic_staff`, which the app can never write to. Add or remove staff in the Supabase SQL editor:

```sql
insert into public.clinic_staff (email, name) values (lower('frontdesk@example.com'), 'Front Desk')
on conflict (email) do update set active = true;

-- To remove access:
update public.clinic_staff set active = false where email = 'frontdesk@example.com';
```

The staff member signs in with that email through the normal sign-in screen; the app routes them to the front-desk screen automatically. Create their account with a verified email address.
