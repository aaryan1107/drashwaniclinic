-- Keep prescribing authority separate from patient-editable record fields.
create table public.patient_care_plans (
  patient_id text primary key references public.patient_records(id) on delete cascade,
  medicines jsonb not null default '[]'::jsonb,
  follow_up_date date,
  follow_up_notes text not null default '',
  revision uuid not null default gen_random_uuid(),
  constraint care_plan_medicines_array check (
    jsonb_typeof(medicines) = 'array' and jsonb_array_length(medicines) <= 20
  ),
  constraint care_plan_follow_up_notes_length check (char_length(follow_up_notes) <= 1000)
);

alter table public.patient_care_plans enable row level security;
revoke all on public.patient_care_plans from anon, authenticated;
grant select, insert, update on public.patient_care_plans to authenticated;

create policy "doctors manage care plans"
on public.patient_care_plans for all to authenticated
using (public.clinic_is_doctor()) with check (public.clinic_is_doctor());

create policy "patients read their own care plan"
on public.patient_care_plans for select to authenticated
using (exists (
  select 1 from public.patient_records r
  where r.id = patient_care_plans.patient_id and r.owner_id = (select auth.uid())
));
