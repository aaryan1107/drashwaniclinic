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
- Online consultation fee Rs 800, or Rs 600 for patients aged 60 and over; clinic visit booking Rs 700 (set in `supabase/functions/_shared/consultationFee.js`)
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

Deploy both payment functions with JWT verification enabled:

```bash
supabase functions deploy create-consultation-order --project-ref aswxzeklbabtflgmjszz
supabase functions deploy verify-consultation-payment --project-ref aswxzeklbabtflgmjszz
```

Deploy the Razorpay webhook **without** JWT verification (Razorpay cannot send a Supabase JWT; the function checks the HMAC signature instead). Apply the `20261119120000_razorpay_webhook_events.sql` migration first: refund events write the new `amount_refunded` / `refunded_at` columns.

```bash
supabase functions deploy razorpay-webhook --no-verify-jwt --project-ref aswxzeklbabtflgmjszz
```

## Required Supabase Secrets

Set these in Supabase Edge Function secrets:

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_live_or_test_key --project-ref aswxzeklbabtflgmjszz
supabase secrets set RAZORPAY_KEY_SECRET=your_razorpay_secret --project-ref aswxzeklbabtflgmjszz
supabase secrets set RAZORPAY_WEBHOOK_SECRET=your_webhook_secret --project-ref aswxzeklbabtflgmjszz
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

- The price is set by the server, never by the app: an online consultation is Rs 800, or Rs 600 when the age on the patient's own record is 60 or over (a missing age pays Rs 800); a clinic visit booking is Rs 700.
- Frontend creates a Razorpay order through `create-consultation-order`.
- The order function rejects unauthenticated users and any amount other than that patient's price (80000 or 60000 paise for an online consultation, 70000 for a clinic visit). If the age lookup fails it creates no order. The verify function requires the payment to equal the order it created.
- Razorpay Checkout verifies through `verify-consultation-payment`.
- WhatsApp consult unlocks only after verification returns success.
- If live Checkout keys are missing, the hosted Razorpay payment link can open, but the doctor/admin must manually verify the receipt.

## Razorpay Webhook

The webhook is the backup path when the patient closes the app before `verify-consultation-payment` finishes, and the only path that hears about refunds.

Razorpay Dashboard > Account & Settings > Webhooks > Add new webhook:

- URL: `https://aswxzeklbabtflgmjszz.supabase.co/functions/v1/razorpay-webhook`
- Secret: the same value as the `RAZORPAY_WEBHOOK_SECRET` Supabase secret.
- Alert email: the clinic admin inbox, so a failing webhook is noticed.
- Active events (tick all of these, in both Test and Live mode):

| Event | What the webhook does |
| --- | --- |
| `payment.authorized` | Row moves to `CAPTURE_PENDING` |
| `payment.captured` | Row moves to `PAID_CONFIRMED` (unlocks the consultation) |
| `payment.failed` | Row moves to `FAILED`, only for that same payment attempt |
| `order.paid` | Row moves to `PAID_CONFIRMED` |
| `refund.processed` | Records `amount_refunded`; a full refund moves the row to `REFUNDED` (consultation locked again) |
| `refund.created` | Audit log only |
| `refund.failed` | Audit log only |
| `payment.dispute.created` | Audit log only, for the doctor to follow up |
| `payment.dispute.won` | Audit log only |
| `payment.dispute.lost` | Audit log only |
| `payment.dispute.closed` | Audit log only |

Safety rules the webhook keeps:

- The `x-razorpay-signature` HMAC is checked on the raw body before anything is parsed.
- State-changing events must be 60000, 70000 or 80000 paise in `INR`, and the update only applies to an order whose recorded amount equals the event's amount, or they are rejected.
- Statuses only move forward (`ORDER_CREATED` -> `CAPTURE_PENDING` -> `PAID_CONFIRMED` -> `REFUNDED`), so late or replayed events cannot downgrade a payment. `REFUNDED` is final.
- Each delivery is recorded in `razorpay_webhook_events` by `x-razorpay-event-id`. Razorpay's retries of an event that was already handled are skipped; a delivery that failed to save is retried normally. Only Razorpay IDs, amounts and outcomes are stored, and only doctors can read the table.

Check recent deliveries in the Supabase SQL editor:

```sql
select received_at, event, outcome, payment_status, razorpay_order_id, razorpay_payment_id
from public.razorpay_webhook_events
order by received_at desc
limit 50;
```

## Front-desk staff (read-only prescriptions)

Front-desk staff can search, view and print prescriptions but cannot issue, edit or void them. They are allowlisted by email in `public.clinic_staff`, which the app can never write to. Add or remove staff in the Supabase SQL editor:

```sql
insert into public.clinic_staff (email, name) values (lower('frontdesk@example.com'), 'Front Desk')
on conflict (email) do update set active = true;

-- To remove access:
update public.clinic_staff set active = false where email = 'frontdesk@example.com';
```

The staff member signs in with that email through the normal sign-in screen; the app routes them to the front-desk screen automatically. Create their account with a verified email address.
