-- Prescriptions, doctor-managed medicine catalog and read-only front-desk role.
-- Builds on patient_care_plans (20261117120000): a prescription is an immutable visit record
-- and the doctor can publish its medicines to the patient's care plan.

-- ---------------------------------------------------------------------------
-- Front-desk staff: allowlist mirroring clinic_doctors. Rows are added by an admin
-- in the Supabase SQL editor only; the app can never write to this table.
-- ---------------------------------------------------------------------------
create table public.clinic_staff (
  email text primary key check (email = lower(email)),
  name text not null default '',
  role text not null default 'receptionist' check (role = 'receptionist'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.clinic_staff enable row level security;
revoke all on public.clinic_staff from anon, authenticated;
grant select on public.clinic_staff to authenticated;

create policy "staff can read their own allowlist row"
on public.clinic_staff for select to authenticated
using (email = lower(coalesce(auth.jwt() ->> 'email', '')) and active = true);

create or replace function public.clinic_is_staff()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.clinic_staff
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and active = true
  );
$$;
grant execute on function public.clinic_is_staff() to authenticated;

-- Allow the receptionist role in profiles and the login audit.
alter table public.clinic_profiles drop constraint if exists clinic_profiles_role_check;
alter table public.clinic_profiles
  add constraint clinic_profiles_role_check check (role in ('patient', 'doctor', 'receptionist'));
alter table public.clinic_login_audit drop constraint if exists clinic_login_audit_role_check;
alter table public.clinic_login_audit
  add constraint clinic_login_audit_role_check check (role in ('patient', 'doctor', 'receptionist'));

-- ---------------------------------------------------------------------------
-- Medicine catalog (doctor-managed). Entries are deactivated, never deleted.
-- ---------------------------------------------------------------------------
create table public.medicine_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 180),
  strength text not null default '' check (char_length(strength) <= 60),
  form text not null default '' check (char_length(form) <= 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index medicine_catalog_unique_entry
  on public.medicine_catalog (lower(btrim(name)), lower(strength), lower(form));

drop trigger if exists medicine_catalog_updated_at on public.medicine_catalog;
create trigger medicine_catalog_updated_at
before update on public.medicine_catalog
for each row execute function public.set_updated_at();

alter table public.medicine_catalog enable row level security;
revoke all on public.medicine_catalog from anon, authenticated;
grant select, insert, update on public.medicine_catalog to authenticated;

create policy "doctors and staff read the medicine catalog"
on public.medicine_catalog for select to authenticated
using (public.clinic_is_doctor() or public.clinic_is_staff());

create policy "doctors add catalog medicines"
on public.medicine_catalog for insert to authenticated
with check (public.clinic_is_doctor());

create policy "doctors update catalog medicines"
on public.medicine_catalog for update to authenticated
using (public.clinic_is_doctor()) with check (public.clinic_is_doctor());

-- Starter list: generic names from India's NLEM (same list as src/medicine-catalog.json).
insert into public.medicine_catalog (name) values
  ('5-aminosalicylic acid (Mesalazine/Mesalaine)'),
  ('5-Fluorouracil'),
  ('6-Mercaptopurine'),
  ('Abacavir'),
  ('Abacavir (A) + Lamivudine (B)'),
  ('Acetazolamide'),
  ('Acetylsalicylic acid'),
  ('Actinomycin D'),
  ('Activated Charcoal'),
  ('Acyclovir'),
  ('Adenosine'),
  ('Adrenaline'),
  ('Albendazole'),
  ('Allopurinol'),
  ('All-trans retinoic acid'),
  ('Alprostadil'),
  ('Amikacin'),
  ('Amiodarone'),
  ('Amitriptyline'),
  ('Amlodipine'),
  ('Amoxicillin'),
  ('Amoxicillin (A) + Clavulanic acid (B)'),
  ('Amphotericin B'),
  ('Ampicillin'),
  ('Anti-D immunoglobulin'),
  ('Anti-rabies immunoglobulin'),
  ('Anti-tetanus immunoglobulin'),
  ('Arsenic trioxide'),
  ('Artemether (A) + Lumefantrine (B)'),
  ('Artesunate'),
  ('Artesunate (A) + Sulphadoxine Pyrimethamine (B)'),
  ('Ascorbic acid (Vitamin C)'),
  ('Atazanavir (A) + Ritonavir (B)'),
  ('Atorvastatin'),
  ('Atracurium'),
  ('Atropine'),
  ('Azathioprine'),
  ('Azithromycin'),
  ('Baclofen'),
  ('Barium sulphate'),
  ('BCG vaccine'),
  ('Bedaquiline'),
  ('Bendamustine Hydrochloride'),
  ('Benzathine benzylpenicillin'),
  ('Benzoyl peroxide'),
  ('Benzylpenicillin'),
  ('Betamethasone'),
  ('Betamethasone (valerate)'),
  ('Bicalutamide'),
  ('Bisacodyl'),
  ('Bleomycin'),
  ('Bortezomib'),
  ('Budesonide'),
  ('Budesonide (A) +Formoterol (B)'),
  ('Bupivacaine'),
  ('Buprenorphine'),
  ('Buprenorphine (A) + Naloxone (B)'),
  ('Caffeine'),
  ('Calamine'),
  ('Calcium carbonate'),
  ('Calcium folinate'),
  ('Calcium gluconate'),
  ('Capecitabine'),
  ('Carbamazepine'),
  ('Carbimazole'),
  ('Carboplatin'),
  ('Carboxymethyl cellulose'),
  ('Cefadroxil'),
  ('Cefazolin'),
  ('Cefixime'),
  ('Cefotaxime'),
  ('Ceftazidime'),
  ('Ceftriaxone'),
  ('Cefuroxime'),
  ('Cetirizine'),
  ('Chlorambucil'),
  ('Chlorhexidine'),
  ('Chloroquine'),
  ('Cholecalciferol'),
  ('Ciprofloxacin'),
  ('Cisplatin'),
  ('Clarithromycin'),
  ('Clindamycin'),
  ('Clobazam'),
  ('Clofazimine'),
  ('Clomiphene citrate'),
  ('Clomipramine'),
  ('Clonazepam'),
  ('Clopidogrel'),
  ('Clotrimazole'),
  ('Cloxacillin'),
  ('Clozapine'),
  ('Coagulation factor IX'),
  ('Coagulation factor VIII'),
  ('Coal tar (A) + Salicylic Acid (B)'),
  ('Colchicine'),
  ('Condom'),
  ('Co-trimoxazole [Sulphamethoxazole (A) + Trimethoprim (B)]'),
  ('Cryoprecipitate'),
  ('Cyclophosphamide'),
  ('Cycloserine'),
  ('Cyclosporine'),
  ('Cytosine arabinoside'),
  ('D- Penicillamine'),
  ('Dabigatran'),
  ('Dacarbazine'),
  ('Daclatasvir'),
  ('Dapsone'),
  ('Darunavir'),
  ('Darunavir (A) + Ritonavir (B)'),
  ('Daunorubicin'),
  ('Delamanid'),
  ('Desferrioxamine'),
  ('Dexamethasone'),
  ('Dextran-40'),
  ('Diazepam'),
  ('Diclofenac'),
  ('Dicyclomine'),
  ('Diethylcarbamazine'),
  ('Digoxin'),
  ('Diltiazem'),
  ('Dinoprostone'),
  ('Diphtheria antitoxin'),
  ('Dobutamine'),
  ('Docetaxel'),
  ('Dolutegravir'),
  ('Domperidone'),
  ('Donepezil'),
  ('Dopamine'),
  ('Doxorubicin'),
  ('Doxycycline'),
  ('DPT vaccine'),
  ('DPT+ Hib+ Hep B vaccine'),
  ('Efavirenz'),
  ('Enalapril'),
  ('Enoxaparin'),
  ('Entecavir'),
  ('Erythropoietin'),
  ('Escitalopram'),
  ('Esmolol'),
  ('Ethambutol'),
  ('Ethinylestradiol (A) + Levonorgestrel (B)'),
  ('Ethionamide'),
  ('Ethyl alcohol (Denatured)'),
  ('Etoposide'),
  ('Fentanyl'),
  ('Ferrous Salts (A) + Folic Acid (B)'),
  ('Ferrous salts'),
  ('Filgrastim'),
  ('Fluconazole'),
  ('Fludrocortisone'),
  ('Flunarizine'),
  ('Fluorescein'),
  ('Fluoxetine'),
  ('Fluphenazine'),
  ('Folic Acid'),
  ('Framycetin'),
  ('Fresh frozen plasma'),
  ('Furosemide'),
  ('Fusidic acid'),
  ('Gadobenate dimeglumine'),
  ('Gefitinib'),
  ('Gemcitabine'),
  ('Gentamicin'),
  ('Glimepiride'),
  ('Glucose'),
  ('Glucose(A) + Sodium chloride (B)'),
  ('Glutaraldehyde'),
  ('Glycerin'),
  ('Glyceryl trinitrate'),
  ('Glycopyrrolate'),
  ('Griseofulvin'),
  ('Haemodialysis fluid'),
  ('Haloperidol'),
  ('Halothane'),
  ('Heparin'),
  ('Hepatitis B immunoglobulin'),
  ('Hepatitis B vaccine'),
  ('Homatropine'),
  ('Hormone releasing IUD'),
  ('Human chorionic gonadotropin'),
  ('Human normal immunoglobulin'),
  ('Hydrochlorothiazide'),
  ('Hydrocortisone'),
  ('Hydrogen Peroxide'),
  ('Hydroxocobalamine'),
  ('Hydroxychloroquine'),
  ('Hydroxypropyl methylcellulose'),
  ('Hydroxyurea'),
  ('Hyoscine butylbromide'),
  ('Ibuprofen'),
  ('Ifosfamide'),
  ('Imatinib'),
  ('Insulin (Soluble)'),
  ('Insulin Glargine'),
  ('Insulin Intermediate Acting (NPH)'),
  ('Insulin Premix Injection 30:70 (Regular : NPH)'),
  ('Iohexol'),
  ('Ipratropium'),
  ('Irinotecan HCI Trihydrate'),
  ('Iron sucrose'),
  ('Isoflurane'),
  ('Isoniazid'),
  ('Isosorbide dinitrate'),
  ('Ispaghula'),
  ('Itraconazole'),
  ('IUD containing Copper'),
  ('Ivermectin'),
  ('Japanese Encephalitis Vaccine'),
  ('Ketamine'),
  ('Labetalol'),
  ('Lactulose'),
  ('Lamivudine'),
  ('L-Asparaginase'),
  ('Latanoprost'),
  ('Lenalidomide'),
  ('Letrozole'),
  ('Leuprolide acetate'),
  ('Levetiracetam'),
  ('Levodopa (A) + Carbidopa (B)'),
  ('Levofloxacin'),
  ('Levonorgestrel'),
  ('Levothyroxine'),
  ('Lignocaine'),
  ('Lignocaine (A) + Adrenaline (B)'),
  ('Linezolid'),
  ('Lithium'),
  ('Loperamide'),
  ('Lopinavir (A) + Ritonavir (B)'),
  ('Lorazepam'),
  ('Magnesium sulphate'),
  ('Mannitol'),
  ('Measles vaccine'),
  ('Mebendazole'),
  ('Medroxyprogesterone acetate'),
  ('Mefenamic acid'),
  ('Mefloquine'),
  ('Meglumine diatrizoate'),
  ('Melphalan'),
  ('Meropenem'),
  ('Mesna'),
  ('Metformin'),
  ('Methotrexate'),
  ('Methylergometrine'),
  ('Methylprednisolone'),
  ('Methylrosanilinium chloride (Gentian Violet)'),
  ('Methylthioninium chloride (Methylene blue)'),
  ('Metoclopramide'),
  ('Metoprolol'),
  ('Metronidazole'),
  ('Midazolam'),
  ('Mifepristone'),
  ('Miltefosine'),
  ('Misoprostol'),
  ('Montelukast'),
  ('Morphine'),
  ('Moxifloxacin'),
  ('Mupirocin'),
  ('Mycophenolate mofetil'),
  ('N-acetylcysteine'),
  ('Naloxone'),
  ('Natamycin'),
  ('Neostigmine'),
  ('Nevirapine'),
  ('Nicotine replacement therapy (NRT)'),
  ('Nifedipine'),
  ('Nitrofurantoin'),
  ('Nitrous oxide'),
  ('Noradrenaline'),
  ('Norethisterone'),
  ('Nystatin'),
  ('Omeprazole'),
  ('Ondansetron'),
  ('Oral poliomyelitis vaccine'),
  ('Oral rehydration salts'),
  ('Ormeloxifene (Centchroman)'),
  ('Oxaliplatin'),
  ('Oxygen'),
  ('Oxytocin'),
  ('Paclitaxel'),
  ('Pantoprazole'),
  ('Para- aminosalicylic acid'),
  ('Paracetamol'),
  ('Paromomycin'),
  ('Peritoneal dialysis solution'),
  ('Permethrin'),
  ('Pheniramine'),
  ('Phenobarbitone'),
  ('Phenoxymethyl penicillin'),
  ('Phenylephrine'),
  ('Phenytoin'),
  ('Phytomenadione(Vitamin K1)'),
  ('Pilocarpine'),
  ('Piperacillin (A) + Tazobactam (B)*'),
  ('Platelet rich plasma/ Platelet concentrates'),
  ('Podophyllin resin'),
  ('Potassium chloride'),
  ('Potassium permanganate'),
  ('Povidone iodine'),
  ('Pralidoxime chloride (2-PAM)'),
  ('Praziquantel'),
  ('Prednisolone'),
  ('Primaquine'),
  ('Procaine Benzylpenicillin'),
  ('Proparacaine'),
  ('Propofol'),
  ('Propranolol'),
  ('Protamine Sulphate'),
  ('Pyrazinamide'),
  ('Pyridoxine'),
  ('Quinine'),
  ('Rabies vaccine'),
  ('Raltegravir'),
  ('Ramipril'),
  ('Red blood cells/ Packed RBCs'),
  ('Ribavirin'),
  ('Riboflavin'),
  ('Rifampicin'),
  ('Ringer lactate'),
  ('Risperidone'),
  ('Ritonavir'),
  ('Rituximab'),
  ('Rotavirus vaccine'),
  ('Salbutamol'),
  ('Salicylic acid'),
  ('Sevoflurane'),
  ('Silver sulphadiazine'),
  ('Snake Venom Antiserum'),
  ('Sodium bicarbonate'),
  ('Sodium chloride'),
  ('Sodium nitrite'),
  ('Sodium nitroprusside'),
  ('Sodium thiosulphate'),
  ('Sodium Valproate'),
  ('Sofosbuvir'),
  ('Somatostatin'),
  ('Spironolactone'),
  ('Streptokinase'),
  ('Streptomycin'),
  ('Succinylcholine'),
  ('Sulfasalazine'),
  ('Sumatriptan'),
  ('Surfactant'),
  ('Tacrolimus'),
  ('Tamoxifen'),
  ('Telmisartan'),
  ('Temozolomide'),
  ('Tenecteplase'),
  ('Teneligliptin'),
  ('Tenofovir (A) + Lamivudine (B)'),
  ('Tenofovir (A) + Lamivudine (B) + Dolutegravir (C)'),
  ('Tenofovir (A) + Lamivudine (B) + Efavirenz (C)'),
  ('Tenofovir Alafenamide Fumarate (TAF)'),
  ('Tenofovir Disproxil Fumarate (TDF)'),
  ('Terbinafine'),
  ('Tetanus toxoid'),
  ('Thalidomide'),
  ('Thiamine'),
  ('Thiopentone'),
  ('Timolol'),
  ('Tiotropium'),
  ('Tramadol'),
  ('Tranexamic acid'),
  ('Trastuzumab'),
  ('Trihexyphenidyl'),
  ('Tropicamide'),
  ('Tuberculin, Purified Protein derivative'),
  ('Valganciclovir'),
  ('Vancomycin'),
  ('Vecuronium'),
  ('Verapamil'),
  ('Vinblastine'),
  ('Vincristine'),
  ('Vitamin A'),
  ('Warfarin'),
  ('Water for Injection'),
  ('Whole blood'),
  ('Xylometazoline'),
  ('Zidovudine'),
  ('Zidovudine (A) + Lamivudine (B)'),
  ('Zidovudine (A) + Lamivudine (B) + Nevirapine (C)'),
  ('Zinc Sulphate'),
  ('Zoledronic acid'),
  ('Zolpidem')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Prescriptions: one immutable record per visit. Patient details are snapshotted so the
-- PDF and the front-desk list never depend on later edits to the patient record.
-- ---------------------------------------------------------------------------
create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patient_records(id) on delete cascade,
  patient_name text not null check (char_length(btrim(patient_name)) between 1 and 160),
  patient_age integer check (patient_age is null or patient_age between 0 and 130),
  patient_gender text not null default '' check (char_length(patient_gender) <= 40),
  diagnosis text not null check (char_length(btrim(diagnosis)) between 1 and 1000),
  medicines jsonb not null check (
    jsonb_typeof(medicines) = 'array' and jsonb_array_length(medicines) between 1 and 20
  ),
  instructions text not null default '' check (char_length(instructions) <= 2000),
  follow_up_date date,
  clinic_id text not null default '' check (char_length(clinic_id) <= 60),
  doctor_name text not null default '' check (char_length(doctor_name) <= 120),
  issued_by text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  status text not null default 'issued' check (status in ('issued', 'void')),
  void_reason text not null default '' check (char_length(void_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prescriptions_patient_created_idx on public.prescriptions (patient_id, created_at desc);
create index prescriptions_created_idx on public.prescriptions (created_at desc);

-- Only status and void_reason may change after issue, and a void prescription is final.
create or replace function public.prescriptions_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'void' then
    raise exception 'A void prescription cannot be changed.';
  end if;
  if (new.id, new.patient_id, new.patient_name, new.patient_age, new.patient_gender, new.diagnosis,
      new.medicines, new.instructions, new.follow_up_date, new.clinic_id, new.doctor_name,
      new.issued_by, new.created_at)
     is distinct from
     (old.id, old.patient_id, old.patient_name, old.patient_age, old.patient_gender, old.diagnosis,
      old.medicines, old.instructions, old.follow_up_date, old.clinic_id, old.doctor_name,
      old.issued_by, old.created_at) then
    raise exception 'An issued prescription cannot be edited. Void it and issue a new one.';
  end if;
  return new;
end;
$$;

drop trigger if exists prescriptions_guard_trigger on public.prescriptions;
create trigger prescriptions_guard_trigger
before update on public.prescriptions
for each row execute function public.prescriptions_guard();

drop trigger if exists prescriptions_updated_at on public.prescriptions;
create trigger prescriptions_updated_at
before update on public.prescriptions
for each row execute function public.set_updated_at();

alter table public.prescriptions enable row level security;
revoke all on public.prescriptions from anon, authenticated;
grant select, insert, update on public.prescriptions to authenticated;

create policy "doctors issue prescriptions"
on public.prescriptions for insert to authenticated
with check (
  public.clinic_is_doctor()
  and status = 'issued'
  and issued_by = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "doctors void issued prescriptions"
on public.prescriptions for update to authenticated
using (public.clinic_is_doctor() and status = 'issued')
with check (public.clinic_is_doctor() and status = 'void');

create policy "doctors and staff read prescriptions"
on public.prescriptions for select to authenticated
using (public.clinic_is_doctor() or public.clinic_is_staff());

create policy "patients read their own prescriptions"
on public.prescriptions for select to authenticated
using (exists (
  select 1 from public.patient_records r
  where r.id = prescriptions.patient_id and r.owner_id = (select auth.uid())
));
