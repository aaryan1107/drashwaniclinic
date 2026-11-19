# Google Play release checklist

App package: `com.drashwani.familyclinic`. The Android project targets API 36. Release starts on Play’s Internal testing track after staging and device verification.

## 1. Backend and clinical workflow

- [ ] Back up the target Supabase project, verify previously applied migration versions, and apply `20261117120000_patient_care_plans.sql` to staging. Verify doctor publishing, patient read access, cross-account denial, and denied patient writes with two synthetic patient accounts and an allowlisted staging doctor. Repeat the migration on production after staging passes.
- [ ] Verify roster and patient linkage. Each intended recipient needs a patient record tied to their authenticated account. Remove the production test doctor and confirm that non-allowlisted users cannot enter the doctor workspace. Give reviewers synthetic records through an isolated review account or review environment.
- [ ] Check Google sign-in from the Play build on cold launch and resume. Keep `com.drashwani.familyclinic://auth/callback` in Supabase Auth redirect URLs. Check logout and account switching on a shared device.
- [ ] Confirm the Razorpay environment and the Supabase order, verification and webhook functions. Run a staging checkout with the backend's test keys, then confirm payment capture, owner, order ID, expected amount, duplicate/retried webhook behavior and payment unlock after app restart. Complete a controlled live checkout and reconciliation before opening production payments. Follow-up dates come from the doctor; accepting payment does not set a clinical return date. Review Google Play's treatment of [regulated clinical services](https://support.google.com/googleplay/android-developer/answer/10281818).
- [ ] Review and resolve applicable dependency advisories from `npm audit`, with a web rebuild and native smoke test after updates.
- [ ] Publish a public privacy policy and an external account deletion request page. Implement an accessible in-app account deletion request and document identity checks, payment or clinical records retained where applicable, retention periods and support handling. Verify backup restoration, support ownership, and monitoring for auth and payment failures.

## 2. Prescription and reminder acceptance

- [ ] Publish a synthetic prescription with an oral medicine, a topical medicine with a body site, a selected-day schedule, and a custom schedule with instructions. Confirm the exact directions appear for the intended patient. Verify legacy notes remain visible.
- [ ] On a Play-installed Android build, test opt-in and refusal, screen locked, app backgrounded and after reboot. Check India time against a device in another time zone, start/end dates, two-day medicine schedule renewal, coincident doses, follow-up alerts the day before and on the date, and cancellation after a plan edit, sign-out or opt-out. Verify no medication, dose or patient data is shown on the lock screen.
- [ ] Decide whether patients need remote updates while the app is closed. This build schedules up to 58 distinct medicine times over the next 48 hours and up to two follow-up alerts. Android may deliver alerts late. Plan changes cancel or replace alerts when the device fetches the revised plan. If faster cancellation or operation without daily opens is required, implement and validate backend push with authenticated device tokens and version checks before offering those guarantees.
- [ ] Review vocabulary and catalog coverage with the doctor. The offline suggestions contain the 384 numbered generic headings from the [official NLEM PDF](https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadConsumer/nlem2022.pdf), alphabetical section. The list contains no brand-level approval, product selection, routing, dose or substitution recommendations. Manual entry covers other products. For brand autocomplete, onboard a licensed or regulator/manufacturer-authorized feed, check manufacturer and formulation IDs, validate against applicable approvals and withdrawals, and add a review and update process. The [PMBI catalog](https://www.pmbi.co.in/ProductList.aspx) covers its own product basket; [CDSCO’s new-drug lists](https://www.cdsco.gov.in/opencms/opencms/en/Approval_new/Approved-New-Drugs/) cover their published approvals.

## 3. Build and sign the Android App Bundle

1. Install JDK 21 and the Android SDK including API 36. Populate the production build environment according to `.env.example`. Keep server secrets out of all Vite variables and the bundle.
2. Create or recover the clinic's upload key. Keep the keystore and passwords outside Git. The Gradle signing config reads `android/keystore.properties` with `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`. Use a path relative to `android/` or an absolute path for `storeFile`.
3. Set a `versionCode` higher than the largest existing upload and update `versionName` in `android/app/build.gradle`. Build from the release checkout:

   ```sh
   npm ci
   npm run build
   npx cap sync android
   cd android
   ./gradlew :app:bundleRelease
   jarsigner -verify app/build/outputs/bundle/release/app-release.aab
   ```

4. Inspect the manifest in the bundle and confirm the expected package, version, target API, permission list and signing. Check 16 KB compatibility if the bundle ships native libraries. [Android App Bundle guide](https://developer.android.com/guide/app-bundle/configure-base) · [16 KB page sizes](https://developer.android.com/guide/practices/page-sizes) · [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)

## 4. Play Console

1. Finish developer identity and account verification. Create the Play Console app with the clinic's name, select the release countries, and configure Play App Signing. Upload the signed AAB to Internal testing and install from the opt-in link.
2. Add app icon, phone screenshots, feature graphic, description, contact email and privacy policy. Complete App content, including Health apps declaration (medication management and relevant healthcare features), Data safety reflecting actual data use and SDKs, content rating, audience, ads, account deletion and App access instructions for authenticated screens. Use only synthetic patient data in screenshots and reviewer access. [Health declaration](https://support.google.com/googleplay/android-developer/answer/14738291) · [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) · [Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111).
3. Resolve Play pre-launch report findings and complete closed testing. Personal developer accounts created after November 13, 2023 need at least 12 continuously opted-in testers for 14 days before applying for production access. [Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
4. Submit the tested bundle and release notes for production review. Once approved, monitor Android vitals, login and payment verification, and patient support after launch. Keep the upload key and next version code available for a corrective release.
