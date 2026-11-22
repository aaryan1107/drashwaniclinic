-- Online consultation fees are now tiered by age: Rs 800 general, Rs 600 for patients aged 60 and over.
-- The prices are enforced by the payment functions (supabase/functions/_shared/consultationFee.js).
-- clinic_availability.consultation_fee is a single integer, so it records the general fee only.
alter table public.clinic_availability alter column consultation_fee set default 800;

update public.clinic_availability
set consultation_fee = 800
where id = 'live';
