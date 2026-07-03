create table if not exists public.clinic_doctors (
  email text primary key,
  name text not null default 'Dr. Ashwani Kansal',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.clinic_doctors (email, name, active)
values
  ('drashwanikansal@gmail.com', 'Dr. Ashwani Kansal', true),
  ('doctortest@drashwaniclinic.local', 'Doctor Test', true)
on conflict (email) do update
set name = excluded.name,
    active = excluded.active;

create or replace function public.clinic_is_doctor()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.clinic_doctors
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and active = true
  );
$$;

create table if not exists public.patient_records (
  id text primary key,
  owner_id uuid references auth.users (id) on delete set null,
  name text not null,
  age integer,
  gender text,
  mobile text,
  whatsapp text,
  abha text,
  source text not null default 'Patient sign up',
  conditions text[] not null default '{}'::text[],
  latest text,
  risk text not null default 'Low',
  vitals jsonb not null default '{}'::jsonb,
  history text[] not null default '{}'::text[],
  labs text[] not null default '{}'::text[],
  symptoms text[] not null default '{}'::text[],
  medicines text[] not null default '{}'::text[],
  notes text,
  follow_up text,
  last_visit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references auth.users (id) on delete set null,
  patient_name text,
  patient_phone text,
  clinic_id text not null,
  clinic_name text not null,
  mode text not null,
  appointment_date date not null,
  appointment_time text not null,
  reason text not null,
  payment_status text not null default 'NOT_REQUIRED',
  payment_reference text,
  status text not null default 'Pending doctor approval',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists patient_records_updated_at on public.patient_records;
create trigger patient_records_updated_at
before update on public.patient_records
for each row execute function public.set_updated_at();

drop trigger if exists appointment_requests_updated_at on public.appointment_requests;
create trigger appointment_requests_updated_at
before update on public.appointment_requests
for each row execute function public.set_updated_at();

alter table public.clinic_doctors enable row level security;
alter table public.patient_records enable row level security;
alter table public.appointment_requests enable row level security;

alter table public.clinic_availability
  alter column consultation_fee set default 700;

update public.clinic_availability
set consultation_fee = 700
where id = 'live'
  and consultation_fee is null;

grant select on public.clinic_doctors to authenticated;
grant execute on function public.clinic_is_doctor() to authenticated;
grant select, insert, update on public.patient_records to authenticated;
grant select, insert, update on public.appointment_requests to authenticated;
grant select on public.consultation_payments to authenticated;
grant update on public.patient_readings to authenticated;

drop policy if exists "active doctors can read doctor allowlist" on public.clinic_doctors;
create policy "active doctors can read doctor allowlist"
on public.clinic_doctors for select
to authenticated
using (email = lower(coalesce(auth.jwt() ->> 'email', '')) and active = true);

drop policy if exists "profiles can read own profile" on public.clinic_profiles;
create policy "profiles can read own profile"
on public.clinic_profiles for select
to authenticated
using (id = auth.uid() or public.clinic_is_doctor());

drop policy if exists "profiles can update own profile" on public.clinic_profiles;
create policy "profiles can update own profile"
on public.clinic_profiles for update
to authenticated
using (id = auth.uid() or public.clinic_is_doctor())
with check (id = auth.uid() or public.clinic_is_doctor());

drop policy if exists "doctors can read audit" on public.clinic_login_audit;
create policy "doctors can read audit"
on public.clinic_login_audit for select
to authenticated
using (public.clinic_is_doctor());

drop policy if exists "patients and doctors can read readings" on public.patient_readings;
create policy "patients and doctors can read readings"
on public.patient_readings for select
to authenticated
using (patient_id = auth.uid() or public.clinic_is_doctor());

drop policy if exists "doctors can update readings" on public.patient_readings;
create policy "doctors can update readings"
on public.patient_readings for update
to authenticated
using (public.clinic_is_doctor())
with check (public.clinic_is_doctor());

drop policy if exists "doctors can manage live availability" on public.clinic_availability;
create policy "doctors can manage live availability"
on public.clinic_availability for all
to authenticated
using (public.clinic_is_doctor())
with check (public.clinic_is_doctor());

drop policy if exists "doctors can manage education" on public.education_posts;
create policy "doctors can manage education"
on public.education_posts for all
to authenticated
using (public.clinic_is_doctor())
with check (public.clinic_is_doctor());

drop policy if exists "patients can read own patient record" on public.patient_records;
create policy "patients can read own patient record"
on public.patient_records for select
to authenticated
using (owner_id = auth.uid() or public.clinic_is_doctor());

drop policy if exists "patients can create own patient record" on public.patient_records;
create policy "patients can create own patient record"
on public.patient_records for insert
to authenticated
with check (owner_id = auth.uid() or public.clinic_is_doctor());

drop policy if exists "patients and doctors can update patient record" on public.patient_records;
create policy "patients and doctors can update patient record"
on public.patient_records for update
to authenticated
using (owner_id = auth.uid() or public.clinic_is_doctor())
with check (owner_id = auth.uid() or public.clinic_is_doctor());

drop policy if exists "patients and doctors can read appointment requests" on public.appointment_requests;
create policy "patients and doctors can read appointment requests"
on public.appointment_requests for select
to authenticated
using (patient_id = auth.uid() or public.clinic_is_doctor());

drop policy if exists "patients can create appointment requests" on public.appointment_requests;
create policy "patients can create appointment requests"
on public.appointment_requests for insert
to authenticated
with check (patient_id = auth.uid());

drop policy if exists "doctors can update appointment requests" on public.appointment_requests;
create policy "doctors can update appointment requests"
on public.appointment_requests for update
to authenticated
using (public.clinic_is_doctor())
with check (public.clinic_is_doctor());

drop policy if exists "patients and doctors can read consultation payments" on public.consultation_payments;
create policy "patients and doctors can read consultation payments"
on public.consultation_payments for select
to authenticated
using (
  (patient ->> 'user_id') = auth.uid()::text
  or public.clinic_is_doctor()
);

-- No demo patient records are seeded. patient_records populates from real signups.
