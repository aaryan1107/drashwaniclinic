# Clinic production release handoff

Updated 18 November 2026. The public web host is Cloudflare Pages. The Android application ID is `com.drashwani.familyclinic`. Use synthetic records for acceptance and store review.

- [Cloudflare release preview](https://0c86ce32.drashwaniclinic.pages.dev/)
- [Preview privacy policy](https://0c86ce32.drashwaniclinic.pages.dev/privacy.html) and [account deletion request](https://0c86ce32.drashwaniclinic.pages.dev/account-deletion.html)
- Signed Android candidate: `.codex-artifacts/clinic-release-candidate.aab`. Package `com.drashwani.familyclinic`, version code 1, target API 36. SHA-256 `615ca590c64460c0bb397f51d0638f3d4c7c6067c0d7f13e63e1825bc7525415`. Gradle and JAR signature verification passed. Play upload acceptance and the registered upload certificate still need confirmation.

## App flow

| Role | Workflow |
| --- | --- |
| Patient | Welcome → Continue → Google or email sign-in → complete the medical profile → Your care. Book a clinic visit or use the available online consultation. For paid consultation, complete Razorpay checkout and wait for capture and clinic verification before opening WhatsApp. Use Updates to submit readings, Prescriptions for issued medication directions and follow-up dates, and Learn for clinic education. Enable phone reminders from the care plan. Account settings includes privacy and a deletion request link. |
| Doctor | Use the same sign-in with an approved clinic account. Today shows patient workload and alerts. Use Live to publish availability. Open Patients → patient record → Appointment to book a slot or check in, or Start visit to document the consultation. Review the draft and medication instructions, issue the prescription to the linked patient, then share or print the PDF when needed. The follow-up date comes from the doctor. Review hosted-payment receipts before manually confirming them. |
| Front desk | Use the same sign-in with an approved staff account. Search prescriptions by patient name or Rx number and print when requested. Issuing, editing, and voiding prescriptions require doctor access. |

## Release checks

| Check | Current evidence | Release action |
| --- | --- | --- |
| Source and web hosting | Local web build, unit tests, and mocked browser flows are independently verifiable. The latest build is published on a Cloudflare preview. GitHub main and public Cloudflare Pages still serve the prior release. | Review the release diff, commit the exact tested source, deploy a Cloudflare preview, and smoke-test the deployed asset and auth origins. Promote that reviewed build after clinic acceptance. |
| Backend schema | Supabase migration ledger already contains the eight existing versions, including care plans, prescriptions, and consultation workspace. The known test doctor’s allowlist access was disabled. Its Auth user was retained. | Test access rules using an approved doctor, staff account, and two synthetic patient accounts. Check that each patient can read only their own issued prescriptions and care plan. Review the remaining security advisor findings and perform a backup restore drill before rollout. |
| Consultation payment | The hardened order, verify, and webhook paths have mocked regression coverage for account ownership, currency, authorization, capture, failed writes, and duplicate or late events. All three functions are deployed. The gateway denied unauthenticated order and verification probes and the webhook rejected an unsigned request. Supabase and the candidate use the same Razorpay test-mode key. | Exercise the matching build and Razorpay test-mode environment. Verify capture, the intended account, persistence across restart, a duplicate webhook, and reconciliation for a captured payment whose draft is missing. Confirm the clinic's live account and refund workflow before opening production payments. |
| Visit and appointment | Doctor drafts and carry-forward vitals now use doctor-scoped keys. Appointment saves only show confirmation after a server response and retry the same request ID for an unchanged submission. | Keep previous-device data until the clinic reviews old drafts. On a test device, complete booking, check-in, visit, prescription issuance, patient receipt, and PDF sharing. Verify account switching and legacy offline records before retiring devices or clearing storage. |
| Privacy and deletion | The candidate includes privacy and account-deletion pages and links in the account menu. The public request page opens an email to the clinic. | The clinic designates an inbox owner, approves the policy text and retention periods, and runs one synthetic deletion request through identity verification, account removal, and any required clinical/payment retention. Verify both public links once deployed. |
| Notifications | App reminders are opt-in and schedule medicine alerts in a 48-hour window plus follow-up alerts. | On the Play-installed app, check opt-in, lock screen, app closed, restart, reboot, changed plan, and sign-out. Extended unattended or immediate remote updates need a separately verified delivery mechanism if promised. |
| Android release | Candidate targets API 36 and builds as an AAB using the local upload signing configuration. | Verify that the signing certificate belongs to the Play app and that the version code exceeds every prior upload. Install from the Internal testing track, then complete the release checks below. |
| Optional launch features | Phone OTP is disabled. The server-backed assistant was absent from the deployed function list. The cloud term dictionary was empty and the app has an offline vocabulary and manual entry. | Keep these out of launch claims unless each feature is deliberately enabled and tested. Review medical vocabulary and assistant responses with the clinic before expanding either. |

## Actions requiring the clinic or Play Console owner

1. Confirm the public clinic name, support and privacy inbox, approved doctors and staff, retention schedule, refund process, and the privacy and deletion text. Confirm whether to disable or delete the old test Auth user after checking its data dependencies. Give testers and Play reviewers synthetic data.
2. Confirm which Razorpay environment and account is used, webhook events and delivery history, capture settings, and who reconciles receipts. Complete a controlled payment and refund acceptance run.
3. In Play Console, verify the developer account and app identity, enable Play App Signing, and confirm the next version code and upload key. Upload the signed candidate to **Internal testing** and share the opt-in link with the clinic testers. Some newer personal accounts must finish a closed test with at least 12 testers opted in continuously for 14 days before applying for production access.
4. Complete the store listing, Data safety, Health apps declaration, content rating, and App access instructions. Enter the deployed Privacy and Account deletion URLs. Resolve pre-launch report findings and submit for review after sign-off.
5. Approve the tested Cloudflare and Play releases and nominate an owner to monitor login, failed payment verification, reminder reports, and support after launch.

See the [detailed Google Play release steps](google-play-release.md), [backend setup](backend-setup-checklist.md), and [Google Play's closed testing rules](https://support.google.com/googleplay/android-developer/answer/14151465).
