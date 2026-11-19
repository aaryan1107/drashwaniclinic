-- Consultation workspace (phase 1): term dictionary, per-doctor usage, visit drafts, templates, audit.
-- NOT yet applied to any remote project. Review, then apply with the Supabase CLI / SQL editor.
-- The app works without these tables: it keeps drafts and usage counts on-device and syncs when they exist.
-- All seed terms, default doses and warnings must be reviewed by a qualified doctor before real use.

create table if not exists public.terms (
  id text primary key,                      -- deterministic, e.g. 'symptom:fever' (seed) or 'custom:<uuid>'
  type text not null check (type in ('symptom','diagnosis','finding','lab_test','lab_panel','medicine')),
  code_system text not null default 'LOCAL' check (code_system in ('ICD10','SNOMED','LOINC','ATC','LOCAL')),
  code text not null default '',
  display text not null check (char_length(btrim(display)) between 1 and 200),
  synonyms text[] not null default '{}',
  is_global boolean not null default true,
  created_by_doctor_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','pending_review')),
  created_at timestamptz not null default now()
);
create index if not exists terms_type_idx on public.terms (type);
create extension if not exists pg_trgm;
create index if not exists terms_display_trgm on public.terms using gin (lower(display) gin_trgm_ops);
-- array_to_string is only STABLE, so wrap it in an IMMUTABLE helper to use it in index expressions.
create or replace function public.terms_search_text(display text, synonyms text[]) returns text
language sql immutable parallel safe as $$ select lower(display || ' ' || coalesce(array_to_string(synonyms, ' '), '')) $$;
create index if not exists terms_search_trgm on public.terms using gin (public.terms_search_text(display, synonyms) gin_trgm_ops);
create index if not exists terms_fts on public.terms
  using gin (to_tsvector('simple', public.terms_search_text(display, synonyms)));

create table if not exists public.doctor_term_usage (
  doctor_id uuid not null references auth.users(id) on delete cascade,
  term_id text not null,
  use_count integer not null default 0 check (use_count >= 0),
  last_used_at timestamptz not null default now(),
  primary key (doctor_id, term_id)
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patient_records(id) on delete cascade,
  doctor_id uuid not null default auth.uid() references auth.users(id),
  clinic_id text not null default '' check (char_length(clinic_id) <= 60),
  status text not null default 'draft' check (status in ('draft','sent')),
  vitals jsonb not null default '{}'::jsonb,
  history jsonb not null default '{}'::jsonb,
  notes_public text not null default '' check (char_length(notes_public) <= 4000),
  notes_private text not null default '' check (char_length(notes_private) <= 4000),
  follow_up jsonb not null default '{}'::jsonb,
  visit_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visits_patient_idx on public.visits (patient_id, created_at desc);

create table if not exists public.visit_items (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  kind text not null check (kind in ('symptom','diagnosis','finding','lab','medicine')),
  term_id text,
  free_text text not null default '' check (char_length(free_text) <= 300),
  details jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  check (term_id is not null or btrim(free_text) <> '')
);
create index if not exists visit_items_visit_idx on public.visit_items (visit_id);

create table if not exists public.rx_templates (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Append-only audit of visit/prescription creation, edits and sends.
create table if not exists public.visit_audit (
  id bigint generated always as identity primary key,
  visit_id uuid not null,
  actor uuid not null default auth.uid(),
  action text not null check (action in ('created','edited','sent')),
  at timestamptz not null default now()
);

create or replace function public.visits_audit_trigger() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.visit_audit (visit_id, action) values (new.id, 'created');
  elsif old.status = 'sent' then
    raise exception 'A sent visit cannot be edited.';
  else
    insert into public.visit_audit (visit_id, action)
    values (new.id, case when new.status = 'sent' then 'sent' else 'edited' end);
  end if;
  return new;
end $$;
drop trigger if exists visits_audit on public.visits;
create trigger visits_audit after insert or update on public.visits
for each row execute function public.visits_audit_trigger();
drop trigger if exists visits_updated_at on public.visits;
create trigger visits_updated_at before update on public.visits
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- RLS: doctors only (clinic allowlist)
alter table public.terms enable row level security;
alter table public.doctor_term_usage enable row level security;
alter table public.visits enable row level security;
alter table public.visit_items enable row level security;
alter table public.rx_templates enable row level security;
alter table public.visit_audit enable row level security;
revoke all on public.terms, public.doctor_term_usage, public.visits, public.visit_items, public.rx_templates, public.visit_audit from anon, authenticated;
grant select, insert on public.terms to authenticated;
grant select, insert, update on public.doctor_term_usage to authenticated;
grant select, insert, update on public.visits to authenticated;
grant select, insert, update, delete on public.visit_items to authenticated;
grant select, insert, update, delete on public.rx_templates to authenticated;
grant select on public.visit_audit to authenticated;

create policy "doctors read terms" on public.terms for select to authenticated
  using (public.clinic_is_doctor() and (is_global or created_by_doctor_id = (select auth.uid())));
create policy "doctors add own terms" on public.terms for insert to authenticated
  with check (public.clinic_is_doctor() and not is_global and status = 'pending_review'
              and created_by_doctor_id = (select auth.uid()));

create policy "doctor own usage" on public.doctor_term_usage for all to authenticated
  using (public.clinic_is_doctor() and doctor_id = (select auth.uid()))
  with check (public.clinic_is_doctor() and doctor_id = (select auth.uid()));

create policy "doctor own visits read" on public.visits for select to authenticated
  using (public.clinic_is_doctor() and doctor_id = (select auth.uid()));
create policy "doctor creates visits" on public.visits for insert to authenticated
  with check (public.clinic_is_doctor() and doctor_id = (select auth.uid()) and status = 'draft');
create policy "doctor edits own draft visits" on public.visits for update to authenticated
  using (public.clinic_is_doctor() and doctor_id = (select auth.uid()) and status = 'draft')
  with check (public.clinic_is_doctor() and doctor_id = (select auth.uid()));

create policy "doctor own visit items" on public.visit_items for all to authenticated
  using (exists (select 1 from public.visits v where v.id = visit_id and v.doctor_id = (select auth.uid()) and v.status = 'draft' and public.clinic_is_doctor()))
  with check (exists (select 1 from public.visits v where v.id = visit_id and v.doctor_id = (select auth.uid()) and v.status = 'draft' and public.clinic_is_doctor()));
create policy "doctor reads sent visit items" on public.visit_items for select to authenticated
  using (exists (select 1 from public.visits v where v.id = visit_id and v.doctor_id = (select auth.uid()) and public.clinic_is_doctor()));

create policy "doctor own templates" on public.rx_templates for all to authenticated
  using (public.clinic_is_doctor() and doctor_id = (select auth.uid()))
  with check (public.clinic_is_doctor() and doctor_id = (select auth.uid()));

create policy "doctor reads own audit" on public.visit_audit for select to authenticated
  using (public.clinic_is_doctor() and exists (select 1 from public.visits v where v.id = visit_id and v.doctor_id = (select auth.uid())));

-- Seed terms: generated by `node scripts/build-seed.mjs --sql` into supabase/seed_terms.sql (run after this migration).

-- ---------------------------------------------------------------- Appointment sheet (doctor/front desk booking + check-in)
alter table public.appointment_requests
  add column if not exists visit_type text not null default 'in_clinic' check (visit_type in ('in_clinic','tele')),
  add column if not exists slot_type text not null default 'fixed' check (slot_type in ('fixed','flexible')),
  add column if not exists duration_min integer check (duration_min is null or duration_min between 5 and 120),
  add column if not exists tags text[] not null default '{}',
  add column if not exists checked_in_at timestamptz,
  add column if not exists patient_record_id text references public.patient_records(id) on delete set null,
  add column if not exists booked_by text not null default lower(coalesce(auth.jwt() ->> 'email', ''));

drop policy if exists "doctors book appointments" on public.appointment_requests;
create policy "doctors book appointments" on public.appointment_requests for insert to authenticated
  with check (public.clinic_is_doctor() and booked_by = lower(coalesce(auth.jwt() ->> 'email', '')));
