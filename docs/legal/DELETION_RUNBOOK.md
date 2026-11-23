# Account deletion and retention runbook

For the app administrator. Updated 24 November 2026 (legal pages version 1.2).

## How deletion works now

Patients delete their own account in the app: profile menu, **Delete account**, type DELETE, confirm. It is immediate. Nobody has to email anyone.

1. The `delete-account` Edge Function checks who is asking from their own sign-in token. A user id in the request body is ignored.
2. Doctor and front-desk accounts are refused before anything is touched (role in `clinic_profiles`, or email in `clinic_doctors` / `clinic_staff`). The database function checks again.
3. It removes the patient's prescription PDFs from the private `prescription-pdfs` bucket (`<patient record id>/...`).
4. It calls `public.clinic_delete_patient_account(target)` (migration `20261124120000_patient_self_deletion.sql`, service role only). That deletes all of the following in one transaction:
   - the patient record, which also removes prescriptions, visits, visit items and the care plan through cascading deletes;
   - visit audit rows;
   - appointments;
   - readings;
   - sign-in history, matched by user id or email;
   - the app profile.
5. Payment rows are **kept but stripped** to `{name, account_deleted_at}`. Amount, date, purpose and Razorpay references stay. Email, phone and `user_id` go.
6. It deletes the sign-in account (`auth.users`).

Every step is safe to repeat. If one fails, the patient sees an error, keeps their login, and can try again.

### What is deleted and what is kept
| Deleted at once | Kept |
|---|---|
| Sign-in account, `clinic_profiles`, `clinic_login_audit` | `consultation_payments`: name, amount, date, purpose and Razorpay ids only, for 7 tax years |
| `patient_records`, `prescriptions` and their PDFs, `visits`, `visit_items`, `visit_audit`, `patient_care_plans` | `razorpay_webhook_events` (no personal data) |
| `appointment_requests`, `patient_readings` | Provider backups until they expire |
| Phone reminders (cleared at sign-out) | Razorpay's own records |

**Why payments are kept:** Income-tax Rules 2026, Rule 46(6) and Form No. 25 (formerly Rule 6F and Form 3C) require a doctor's daily case register with patient name, service, fee and date for 7 tax years. The DPDP Act s.8(7) allows keeping what a law requires. A practice whose gross receipts are Rs 1.5 lakh a year or less is not covered by the rule. Ask the clinic's accountant once whether that applies.

## Manual fallback (patient cannot sign in)

The deletion page offers email only for this case, with a promise of 7 days.

1. Reply from the privacy inbox. Verify that the request comes from the account's email, or send a one-time code to that email. Never ask for a password or card details.
2. Find the user id:
   ```sql
   select id from auth.users where lower(email) = lower('PATIENT_EMAIL');
   ```
3. Remove their PDFs: Storage → `prescription-pdfs` → delete the folder named after each record id:
   ```sql
   select id from public.patient_records where owner_id = 'USER_ID' or id = 'USER_ID';
   ```
4. Delete their rows:
   ```sql
   select public.clinic_delete_patient_account('USER_ID');
   ```
5. Delete the user: Authentication → Users → Delete user.
6. Reply to confirm the deletion, and keep a dated note of the request with no health data in it.

## Yearly: payment records past 7 tax years

In April, run the following. It deletes payments older than the last 7 complete tax years (April–March):
```sql
delete from public.consultation_payments
where created_at < make_date(extract(year from now())::int - 7 - case when extract(month from now()) < 4 then 1 else 0 end, 4, 1);
```

Record ids used in testing: only synthetic accounts. Never run any of this on a real patient to "try it".
