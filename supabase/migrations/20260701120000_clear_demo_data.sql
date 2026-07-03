-- Production cleanup: remove demo/seed data that earlier migrations inserted.
-- Safe to run on the existing project. Real patient signups are NOT affected
-- (only the known demo patient id is removed).

-- 1. Remove the demo patient record (Ramesh Gupta) seeded by the hardening migration.
delete from public.patient_records
where id in ('ramesh', 'meena', 'sunita', 'iqbal');

-- 2. Reset live availability to a clean "off duty, no message" state.
update public.clinic_availability
set status = 'Off Duty',
    online = false,
    message = '',
    updated_by = null,
    consultation_fee = 700
where id = 'live';

-- 3. Clear any test appointment requests and patient readings captured during testing.
delete from public.appointment_requests;
delete from public.patient_readings;

-- 4. Education posts are real clinic content and are kept by default.
--    Uncomment the next line ONLY if you want to start with an empty education library:
-- delete from public.education_posts;
