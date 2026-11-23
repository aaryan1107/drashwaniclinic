# Account deletion and retention runbook

For the app administrator. This is what the published Account deletion page promises, so follow it exactly. Nothing here is run automatically. Run SQL in the Supabase SQL editor for project `aswxzeklbabtflgmjszz`. Back up first and read each query before running it.

Published commitments: acknowledge within 48 hours, complete within 30 days of verifying the person, confirm by email, keep clinical records in restricted form for 3 years after the last visit, keep payment records as tax and payment law requires.

## A. Handling a deletion request

1. **Acknowledge** within 48 hours by replying to the sender. Do not ask for passwords, card details or health information.
2. **Verify.** The request must come from the email on the account. If it does not, or if the person signed up by phone, send a one-time code to the account's email or phone and have them reply with it. Write down how you verified.
3. **Find the account** (replace the email):
   ```sql
   select id, email, phone from auth.users where lower(email) = lower('PATIENT_EMAIL');
   ```
   Note the `id` (the user id).
4. **Check what exists** (counts only, no content):
   ```sql
   select 'patient_records' as tbl, count(*) from public.patient_records where owner_id = 'USER_ID'
   union all select 'patient_readings', count(*) from public.patient_readings where patient_id = 'USER_ID'
   union all select 'clinic_login_audit', count(*) from public.clinic_login_audit where user_id = 'USER_ID' or lower(email) = lower('PATIENT_EMAIL');
   ```
5. **Delete the sign-in record by hand.** Deleting the user only blanks `user_id` on these rows and leaves the email and phone behind, so remove them first:
   ```sql
   delete from public.clinic_login_audit where user_id = 'USER_ID' or lower(email) = lower('PATIENT_EMAIL');
   ```
6. **Delete the sign-in account** in the Supabase dashboard: Authentication, Users, select the user, Delete user. This removes the login and, through cascading deletes, `clinic_profiles` and `patient_readings`. It also clears the link (`owner_id` or `patient_id`) on the retained records below, so they no longer belong to any login.
7. **Verify** (each should be 0, except the last, which should show a null `owner_id`):
   ```sql
   select count(*) from public.clinic_profiles where id = 'USER_ID';
   select count(*) from public.patient_readings where patient_id = 'USER_ID';
   select count(*) from public.clinic_login_audit where lower(email) = lower('PATIENT_EMAIL');
   select id, owner_id from public.patient_records where id = 'USER_ID';
   ```
8. **Confirm by email** that the deletion is done, and say which records are kept, why, and until when.
9. **Keep a short note**: the date of the request, the email, how you verified, the date you finished. Put no health information in it. Store it outside the app.

### What is deleted and what is kept
| Deleted now | Kept in restricted form (no login, doctor and front desk only) |
|---|---|
| Sign-in account (`auth.users`) | `patient_records` |
| `clinic_profiles` | `prescriptions` |
| `patient_readings` | `visits`, `visit_items`, `visit_audit` |
| `clinic_login_audit` rows | `patient_care_plans` |
| Reminders on the phone (cleared at sign-out) | `appointment_requests` |
| | `consultation_payments` |

Cloud backups: copies in the provider's routine backups expire on the provider's schedule. Check the Supabase project's backup settings and write the actual period in the note above, so the page's wording ("removed when those backups expire") stays true.

## B. Deleting records at the end of their retention

Run quarterly. The clinic's clinical period is 3 years after the last visit. Review the list before deleting anything. A person must decide whether a record has to be kept longer (for example a dispute or a legal request).

1. **List candidates:**
   ```sql
   with last_activity as (
     select r.id,
       greatest(
         coalesce((select max(v.visit_date) from public.visits v where v.patient_id = r.id), date '1900-01-01'),
         coalesce((select max(p.created_at)::date from public.prescriptions p where p.patient_id = r.id), date '1900-01-01'),
         coalesce((select max(a.appointment_date) from public.appointment_requests a
                   where a.patient_record_id = r.id or a.patient_id::text = r.id), date '1900-01-01'),
         r.created_at::date
       ) as last_seen
     from public.patient_records r
   )
   select id, last_seen from last_activity
   where last_seen < current_date - interval '3 years'
   order by last_seen;
   ```
2. **Review** the list with the doctor.
3. **Delete** approved records. This cascades to `prescriptions`, `visits`, `visit_items` and `patient_care_plans`. Remove the rows that do not cascade:
   ```sql
   delete from public.visit_audit where visit_id in (select id from public.visits where patient_id = any (ARRAY['ID1','ID2']));
   delete from public.appointment_requests where patient_record_id = any (ARRAY['ID1','ID2']) or patient_id::text = any (ARRAY['ID1','ID2']);
   delete from public.patient_records where id = any (ARRAY['ID1','ID2']);
   ```
   Run the `visit_audit` delete first, because it needs the visits to still exist to find them.
4. **Payment records** (`consultation_payments`) follow tax and payment law, not the clinical period. Ask the clinic's accountant for the retention period and write it here: `PERIOD NOT YET CONFIRMED` is a flag for the owner, not text to publish. Delete rows older than that period only after the accountant approves.

## C. When a patient asks for a copy of their data

Verify as in A, then send them an export of their own rows from `patient_records`, `patient_readings`, `appointment_requests`, `prescriptions`, `patient_care_plans`, and the public notes of their `visits`. Never include `visits.notes_private`. Send it to the account email only.

## D. Doctors and staff

Removing a doctor: set `active = false` in `clinic_doctors`. Removing front-desk staff: set `active = false` in `clinic_staff`. Do not delete a doctor's auth user while visit records reference it: `visits.doctor_id` has no cascade and the delete will fail.
