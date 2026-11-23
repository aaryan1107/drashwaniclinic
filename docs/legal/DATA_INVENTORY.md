# Data inventory (evidence for the published policy)

Last checked 22 November 2026 against the code and migrations in this repository. Every statement on `public/privacy.html` must be backed by a row here. `src/legal.test.mjs` fails when a table or an outside host in the code is missing from this evidence, so update this file and the policy together.

Operator: Tanu Kansal, trading as Dr Ashwanis Family Clinic Diagnostic Centre. Privacy contact and app administrator: Aaryan Kansal. Treating doctor: Dr. Ashwani Kansal.

## 1. Database tables (Supabase project in ap-northeast-2, Seoul)

Access is enforced by row-level security. "Patient" means the signed-in patient and only their own rows. The access rules were tested on a local copy with 52 checks (see the 22 November 2026 prescriptions work).

### Personal data about patients

| Table | Contents | Source | Purpose | Who can read | Retention |
|---|---|---|---|---|---|
| `clinic_profiles` | Name, email, phone, avatar link, sign-in provider, role, medical profile (JSON) | `20260621124500_create_clinic_app_tables.sql`; written by `upsertClinicProfile` in `src/main.jsx` | Account | Patient, doctor | Until the account is deleted |
| `clinic_login_audit` | User id, email, phone, provider, role, action, time | same migration; written in `src/main.jsx` | Security and audit | Doctor | Until the account is deleted (rows must be deleted by hand; see runbook) |
| `patient_records` | Name, age, gender, mobile, WhatsApp, ABHA number, conditions, vitals, history, labs, symptoms, medicines, notes, follow-up | `20260622183000_harden_clinic_backend.sql` | Care | Patient (own), doctor | Clinical period (3 years after last visit) |
| `patient_readings` | Fasting and post-meal sugar, BP, weight, HbA1c, report name, symptoms, note | `20260621124500_create_clinic_app_tables.sql` | Care | Patient (own), doctor | Until the account is deleted |
| `appointment_requests` | Patient name, phone, clinic, mode, date, time, reason, payment status and reference, status | `20260622183000_harden_clinic_backend.sql` and `20261118100000_consultation_workspace.sql` | Booking | Patient (own), doctor | Clinical period |
| `consultation_payments` | Razorpay order and payment ids, amount, currency, method, status, patient name, email, contact, clinic. Holds online consultation payments (Rs 800, or Rs 600 for age 60 and over) and clinic visit payments (Rs 700, marked `clinic_visit`), and refund amount and date when Razorpay reports a refund | `20260611140000_create_consultation_payments.sql`; written by the payment functions | Fee collection | Patient (own), doctor | As tax and payment law requires |
| `razorpay_webhook_events` | Razorpay event id, event type, order, payment and refund references, amount, currency, outcome, resulting status, time. No payer contact details or notes | `20261119120000_razorpay_webhook_events.sql`; written by the `razorpay-webhook` function | Payment audit and duplicate-event protection | Doctor | As tax and payment law requires |
| `patient_care_plans` | Medicines, schedule, follow-up date and note | `20261117120000_patient_care_plans.sql` | Care and reminders | Patient (own), doctor | Clinical period |
| `prescriptions` | Patient snapshot (name, age, gender), diagnosis, medicines, instructions, follow-up, doctor, status | `20261117130000_prescriptions.sql` | Care and record-keeping | Patient (own), doctor, front desk | Clinical period |
| `visits` | Vitals, history, public and private notes, follow-up, date, status | `20261118100000_consultation_workspace.sql` | Care and record-keeping | The doctor who made it | Clinical period |
| `visit_items` | Symptoms, diagnoses, findings, labs, medicines for a visit | same | Care and record-keeping | The doctor who made it | Clinical period |
| `visit_audit` | Visit id, who acted, action (created, edited, sent), time | same | Audit | The doctor who acted | Clinical period |

Private visit notes (`visits.notes_private`) are never returned to patients and are not part of the PDF. The administrator can technically reach them in the database, which the policy states.

### Staff and reference data (no patient data)

| Table | Contents | Source | Purpose | Who can read |
|---|---|---|---|---|
| `clinic_doctors` | Doctor email, name, active flag | `20260622183000_harden_clinic_backend.sql` | Decides doctor access | The doctor (own row) |
| `clinic_staff` | Front-desk email, name, active flag | `20261117130000_prescriptions.sql` | Decides front-desk access; changed by SQL only | The staff member (own row) |
| `clinic_availability` | Live status, clinic, online flag, message, fee, updated by | `20260621124500_create_clinic_app_tables.sql` | Shows availability | Everyone |
| `education_posts` | Health education articles | same | Patient education | Everyone |
| `medicine_catalog` | Medicine names, strength, form | `20261117130000_prescriptions.sql` | Doctor workflow | Doctor, front desk |
| `terms` | Clinical search terms | `20261118100000_consultation_workspace.sql` | Doctor workflow | Doctor |
| `doctor_term_usage` | How often a doctor used each term | same | "Frequently used" suggestions | That doctor |
| `rx_templates` | A doctor's prescription templates | same | Doctor workflow | That doctor |

## 2. Data on the device

| Item | Where | Source | Notes |
|---|---|---|---|
| Appearance setting (`clinicAppearance`, `clinic-mesh-motion`) | Browser storage | `src/main.jsx` | Preference only |
| Sign-in session | Browser storage (Supabase client) | `src/supabase.js` | Cleared on sign-out |
| `clinicAuthNeedsMedicalProfile`, `clinicPasswordRecovery` | Browser storage | `src/main.jsx` | Screen-state flags |
| Doctor visit drafts (`clinic.visit.draft.*`) | Browser storage | `src/visitStore.js` | Doctor only; offline drafts |
| Care reminders | Phone notifications | `src/CarePlan.jsx` | Opt-in; text does not contain medicine names |
| Reminder preference (`clinic-reminders:*`) | Browser storage | `src/CarePlan.jsx` | Per user |
| Temporary prescription PDF | App cache | `src/prescriptionPdf.js` | Deleted right after sharing |
| App files cache | Service worker (web) | `public/sw.js` | App shell only |

## 3. Recipients (outside services reached by the code)

| Name | Host | Why | What is sent | Source |
|---|---|---|---|---|
| Supabase | `*.supabase.co` | Database, sign-in, server functions | All records above | `src/supabase.js`, functions |
| Google | Sign-in via Supabase | Only if the user chooses Continue with Google | Sign-in identity | `handleGoogleSignIn` in `src/main.jsx` |
| Razorpay | `checkout.razorpay.com`, `api.razorpay.com`, `razorpay.me` | Payments and payment events | Order, amount, patient name, email, contact; the card or UPI details go straight to Razorpay | `src/main.jsx`, payment functions |
| Cloudflare | `drashwaniclinic.pages.dev` | Hosts the web app and the legal pages | Ordinary request data | `privacyPage` in `src/main.jsx` |
| WhatsApp | `wa.me` | Only when a link is tapped | The message text the user or doctor chooses | `src/main.jsx` |
| Google Maps | `maps.app.goo.gl` | Directions link for a clinic | Nothing from the app | `clinics` in `src/main.jsx` |
| ABHA | `healthid.ndhm.gov.in` | A link to look up an ABHA number | Nothing from the app | `src/main.jsx` |
| Groq (AI model hosting, US) | `api.groq.com` | Runs the model that writes the clinic assistant's replies, only when the patient sends a chat message | The message, up to 6 earlier plain-text turns of the same chat, and the records the assistant looks up for that reply (the patient's prescriptions, care plan, bookings, latest payment, clinic availability). Groq's Services Agreement bars training on inputs and outputs. By default Groq keeps request logs up to 30 days for abuse and reliability, so the function refuses to run unless the `GROQ_ZERO_RETENTION` secret is `confirmed` (Zero Data Retention turned on in Groq's Data Controls). | `supabase/functions/clinic-assistant/index.ts` |

## 4. Not used (and guarded by the test)

- Analytics, advertising, attribution and crash-reporting libraries: none in `package.json`.
- AI services: only the clinic assistant, which calls Groq's chat completions API from the `clinic-assistant` Edge Function (see Recipients). It reads records with the patient's own token, so row-level security limits it to that patient's rows, and it never writes to the database: bookings and readings come back as drafts that the patient confirms in the app. The old OpenAI function (`clinic-ai-assistant`) was removed on 23 November 2026. `src/legal.test.mjs` fails if any other AI service is added, or if the assistant loses the zero-retention check or the patient-token reads. The assistant first used Google's Gemini API; it moved to Groq on 23 November 2026, before going live, because Gemini's free tier trains on content.
- Assistant chats are not saved by the app. They live in the chat screen's memory until the patient leaves.
- Location, contacts, microphone, camera, files, SMS: not requested. The merged Android manifest (checked 22 November 2026) declares only `INTERNET`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK`. The last three come from the local-notifications plugin so care reminders can be shown and restored after a phone restart. `SCHEDULE_EXACT_ALARM` is removed in `android/app/src/main/AndroidManifest.xml`.
- Selling or sharing data for advertising: none.

## 5. Things the administrator can do that patients should know about

The administrator has database access through the Supabase dashboard. The policy discloses this and limits it to running, fixing and securing the service and answering privacy requests.
