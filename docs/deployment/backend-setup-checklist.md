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

Create or confirm these users:

```text
patienttest@drashwaniclinic.local / 21stjune@2026
doctortest@drashwaniclinic.local / 21stjune@2026
drashwanikansal@gmail.com / set the private doctor password in Supabase Auth only
```

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
```

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
