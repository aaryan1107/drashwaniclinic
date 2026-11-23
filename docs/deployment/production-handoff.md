# Clinic production checklist

Updated 24 November 2026. The web app and legal pages are on Cloudflare Pages (`drashwaniclinic.pages.dev`), deployed from GitHub `main`. Supabase project `aswxzeklbabtflgmjszz`. The Android app ID is `com.drashwani.familyclinic`. Use synthetic accounts for every test.

## Done
- Fees are Rs 800, or Rs 600 for patients 60 and over, for both online consultations and clinic visits. The payment functions are deployed, and the server checks the amount.
- The clinic assistant runs on Groq with zero data retention, and has been tested live.
- Legal pages v1.2 are finished: privacy, terms, refunds, account deletion, about and contact. Patients delete their own account in the app, at once. Payment records are kept 7 tax years, as the Income-tax Rules require.
- Prescriptions, care plans, visit workspace, front-desk role and PDF sharing are built.

## Left before launch

### 1. Ship what is waiting
- [ ] Merge PR #16 (assistant fee by age), then redeploy `clinic-assistant`.
- [ ] Account deletion branch: apply migration `20261124120000_patient_self_deletion.sql`, deploy `delete-account`, then merge.
  ```
  supabase db push --remote=aswxzeklbabtflgmjszz --yes
  supabase functions deploy delete-account --remote=aswxzeklbabtflgmjszz --use-api --yes
  ```
- [ ] Delete one synthetic patient account from the live app, and check its rows, PDFs and login are gone.

### 2. Payments
- [ ] Run Razorpay test mode end to end: book, pay, capture, webhook, duplicate webhook, refund.
- [ ] Check that a captured payment whose booking draft was lost is recovered on the server.
- [ ] Switch to live keys, confirm the webhook URL and events in the Razorpay dashboard, then make one real low-value payment and refund it.

### 3. Sign-in
- [ ] Google sign-in, email sign-up with verification, and password reset on the production URL and in the Android app.
- [ ] Supabase Auth redirect URLs include the production site and the app's return scheme.

### 4. Prescriptions
- [ ] Set `VITE_RX_REGISTRATION` (the doctor's medical registration number) in Cloudflare Pages, so it prints on PDFs.

### 5. Android and Play Store
- [ ] `npx cap sync android`, build a signed AAB, and raise the version code above every earlier upload.
- [ ] Upload to Internal testing, install on a phone, and check reminders, PDF sharing and deletion.
- [ ] Fill in the Play Console forms from `docs/legal/PLAY_FORMS.md`: Data safety (in-app deletion: yes), Health apps, content rating, app access with a synthetic review account, and the privacy and deletion URLs.
- [ ] Closed testing: personal developer accounts need 12 testers opted in for 14 days before applying for production.

### 6. WhatsApp integration
- [ ] Build automated WhatsApp messages (booking confirmations, reminders, consult hand-off) per `docs/whatsapp/AUTOMATION_PLAN.md`.

### Before real volume
- [ ] Move Groq to a paid tier. The free tier returns 429 under load.
- [ ] Optional: delete the unused `GEMINI_API_KEY` secret.
- [ ] Name someone to watch failed payments, sign-in errors and the privacy inbox after launch.

See [Google Play release steps](google-play-release.md) and [backend setup](backend-setup-checklist.md).
