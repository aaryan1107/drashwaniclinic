-- Production cleanup: remove demo/seed data that earlier migrations inserted.
-- Only touches known demo rows. Real patient signups, appointment requests and
-- patient readings are NOT deleted by this migration.

-- 1. Remove the demo patient records seeded for the demo/testing app state.
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

-- 3. Education posts are real clinic content and are kept by default.
--    Uncomment the next line ONLY if you want to start with an empty education library:
-- delete from public.education_posts;
