create table if not exists public.clinic_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('patient', 'doctor')),
  full_name text not null,
  email text,
  phone text,
  avatar_url text,
  provider text not null default 'email',
  medical_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinic_login_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  phone text,
  provider text,
  role text not null check (role in ('patient', 'doctor')),
  action text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_readings (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  fasting text,
  post_meal text,
  bp text,
  weight text,
  hba1c text,
  report_name text,
  symptoms text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.clinic_availability (
  id text primary key default 'live',
  status text not null default 'On Duty',
  clinic_id text not null default 'clinic-2',
  online boolean not null default true,
  message text not null default 'Running 20 minutes late. Please check before visiting.',
  consultation_fee integer,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.education_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  tone text not null default 'tone-0',
  tag text not null default 'Doctor-approved',
  author text not null default 'Dr. Ashwani Kansal',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clinic_profiles_updated_at on public.clinic_profiles;
create trigger clinic_profiles_updated_at
before update on public.clinic_profiles
for each row execute function public.set_updated_at();

drop trigger if exists clinic_availability_updated_at on public.clinic_availability;
create trigger clinic_availability_updated_at
before update on public.clinic_availability
for each row execute function public.set_updated_at();

drop trigger if exists education_posts_updated_at on public.education_posts;
create trigger education_posts_updated_at
before update on public.education_posts
for each row execute function public.set_updated_at();

alter table public.clinic_profiles enable row level security;
alter table public.clinic_login_audit enable row level security;
alter table public.patient_readings enable row level security;
alter table public.clinic_availability enable row level security;
alter table public.education_posts enable row level security;

grant select, insert, update on public.clinic_profiles to authenticated;
grant insert on public.clinic_login_audit to authenticated;
grant select on public.clinic_login_audit to authenticated;
grant select, insert on public.patient_readings to authenticated;
grant select on public.clinic_availability to anon, authenticated;
grant update, insert on public.clinic_availability to authenticated;
grant select on public.education_posts to anon, authenticated;
grant insert, update, delete on public.education_posts to authenticated;

drop policy if exists "profiles can read own profile" on public.clinic_profiles;
create policy "profiles can read own profile"
on public.clinic_profiles for select
to authenticated
using (
  id = auth.uid()
  or (auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor'
);

drop policy if exists "profiles can upsert own profile" on public.clinic_profiles;
create policy "profiles can upsert own profile"
on public.clinic_profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles can update own profile" on public.clinic_profiles;
create policy "profiles can update own profile"
on public.clinic_profiles for update
to authenticated
using (
  id = auth.uid()
  or (auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor'
)
with check (
  id = auth.uid()
  or (auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor'
);

drop policy if exists "users can insert own audit" on public.clinic_login_audit;
create policy "users can insert own audit"
on public.clinic_login_audit for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "doctors can read audit" on public.clinic_login_audit;
create policy "doctors can read audit"
on public.clinic_login_audit for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor');

drop policy if exists "patients can add readings" on public.patient_readings;
create policy "patients can add readings"
on public.patient_readings for insert
to authenticated
with check (patient_id = auth.uid());

drop policy if exists "patients and doctors can read readings" on public.patient_readings;
create policy "patients and doctors can read readings"
on public.patient_readings for select
to authenticated
using (
  patient_id = auth.uid()
  or (auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor'
);

drop policy if exists "everyone can read live availability" on public.clinic_availability;
create policy "everyone can read live availability"
on public.clinic_availability for select
to anon, authenticated
using (true);

drop policy if exists "doctors can manage live availability" on public.clinic_availability;
create policy "doctors can manage live availability"
on public.clinic_availability for all
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor');

drop policy if exists "everyone can read published education" on public.education_posts;
create policy "everyone can read published education"
on public.education_posts for select
to anon, authenticated
using (published = true);

drop policy if exists "doctors can manage education" on public.education_posts;
create policy "doctors can manage education"
on public.education_posts for all
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'doctor');

insert into public.clinic_availability (id, status, clinic_id, online, message, consultation_fee, updated_by)
values ('live', 'On Duty', 'clinic-2', true, 'Running 20 minutes late. Please check before visiting.', null, 'Dr. Ashwani')
on conflict (id) do nothing;

insert into public.education_posts (title, body, tone, tag, author)
values
  ('Diabetes reversal', 'Follow-up, diet, weight and medicines reviewed together.', 'tone-0', 'Doctor-approved', 'Dr. Ashwani Kansal'),
  ('Fatty liver', 'Why insulin resistance and liver health are connected.', 'tone-1', 'Doctor-approved', 'Dr. Ashwani Kansal'),
  ('CGM basics', 'When to discuss continuous glucose monitoring.', 'tone-2', 'Doctor-approved', 'Dr. Ashwani Kansal'),
  ('Injection therapy', 'Side effects and doctor review reminders.', 'tone-3', 'Doctor-approved', 'Dr. Ashwani Kansal')
on conflict do nothing;
