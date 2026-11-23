# Google Play form answers (draft)

Derived from `docs/legal/DATA_INVENTORY.md` and Google's Data safety help (retrieved 22 November 2026, see `SOURCES.md`). These are drafts for the person who holds the Play Console account to enter. Check each against the live form before submitting, because Play changes labels and rules. Anything marked **Confirm** could not be settled from the help pages alone. The answers in the form must agree with the published privacy policy.

Play account holder: Tanu Kansal (to match the Razorpay merchant account). Listing name: Dr. Ashwani Family Clinic.

## URLs to enter (after the owner deploys the pages)
- Privacy policy: `https://drashwaniclinic.pages.dev/privacy.html`
- Account deletion: `https://drashwaniclinic.pages.dev/account-deletion.html`
- Confirm the final host before entering. If the site moves to a custom domain, update these in Play Console, Razorpay and the app (`privacyPage` in `src/main.jsx`).

## Data safety

**Does the app collect or share any required user data types?** Yes, it collects.

**Is all user data encrypted in transit?** Yes. All connections to the backend use HTTPS (TLS).

**Do you provide a way for users to request deletion?** Yes. The app's profile menu has "Request account deletion", which opens the web request page, and the same page is the web link. **Confirm** that Play accepts an in-app link to a request page as the in-app option. A request made fully inside the app is the safer follow-up (spec "Open items" 7).

### Data types

| Category | Type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|---|
| Personal info | Name | Yes | No | Required | App functionality; Account management |
| Personal info | Email address | Yes | No | Required | App functionality; Account management |
| Personal info | User IDs | Yes | No | Required | App functionality; Account management; Fraud prevention, security, and compliance |
| Personal info | Phone number | Yes | No | **Confirm** (collected in the medical profile and appointments) | App functionality; Account management |
| Health and fitness | Health info (readings, conditions, history, prescriptions, visit records, optional ABHA number) | Yes | No | Required for the app's core function | App functionality |
| Health and fitness | Fitness info | No | | | Weight, blood pressure and sugar entered by the user are declared as Health info |
| Financial info | User payment info | No | | | Card, UPI and bank details are entered on Razorpay's checkout and the app never accesses them (payment-processor exemption in the help page) |
| Financial info | Purchase history (order id, amount, status) | Yes | No | Required to take the fee | App functionality; Fraud prevention, security, and compliance. **Confirm** this is the right type |
| App activity | Other actions (sign-in record) | Yes | No | Required | Fraud prevention, security, and compliance. **Confirm** |
| Messages | Other in-app messages (clinic assistant chat) | Yes, processed but not stored by the app | **Confirm** (sent to Groq as a service provider) | Optional | App functionality |
| Photos and videos | Photos | No | | | Only a link to the Google profile photo is stored. **Confirm** that a stored photo link does not count |
| Device or other IDs | Device or other IDs | No | | | No advertising id or device id is collected |
| Location, Contacts, Messages, Audio, Files and docs, Calendar, Web browsing | all | No | | | Not collected |

### Sharing

Declare no data shared. The help page says transfers to a service provider that processes data on the developer's behalf, under the developer's instructions, need not be disclosed as sharing. The providers are:
- Supabase (database, sign-in, server functions), which stores everything above.
- Razorpay (payment processor), which receives the patient's name, email and contact number to create the order and takes the payment details directly.
- Google, only for sign-in when the user chooses it.
- Groq (AI model hosting, United States), only when the user sends a clinic assistant message. It processes the message and the records looked up for the reply on the clinic's behalf. Groq does not train on API content, and Zero Data Retention must be on in Groq's Data Controls before go-live.

**Confirm** this reading with the current form. If there is any doubt, the cautious choice is to declare sharing with Razorpay (Purpose: App functionality), and the policy already names every recipient.

### Security practices
- Data encrypted in transit: Yes.
- Deletion request available: Yes.
- Independent security review: No. Do not claim one.

## Health apps declaration

State these facts and pick the option labels in Play Console that match them. The labels are not copied here because they could not be fetched.
- The app lets patients record readings, book appointments and online consultations, receive prescriptions and care plans from a doctor, and turn on medicine and follow-up reminders.
- It does not diagnose, does not measure health with the phone's sensors or camera, does not use Health Connect, and is not a medical device.
- Medical care is provided by Dr. Ashwani Kansal. **Confirm** whether Play asks for his medical registration or proof of qualification, and have it ready.
- The privacy policy covers how health information is handled and is linked in the form.

## Other App content answers
- **Ads:** none.
- **Target audience:** adults. Patients under 18 use the app only through an account managed by a parent or guardian (see the Terms). Choose an adult audience so that the Families policy does not apply. **Confirm** the age groups offered in the form.
- **Financial features:** the app collects two fees: an online consultation fee (Rs 800, or Rs 600 for patients aged 60 and over) and a clinic visit booking fee (the same: Rs 800, or Rs 600 for patients aged 60 and over). It offers no loans, wallets, trading or crypto.
- **Payments:** online consultations and clinic visit bookings are paid through Razorpay, outside Google Play Billing. **Confirm** against the current Play Payments policy that this is allowed for a real-world medical service.
- **App access instructions:** the app needs a login. Create dedicated review accounts (a patient with no real data) and enter their instructions in Play Console and in Razorpay's website review. Never reuse the old test doctor account or any real patient's login.
- **AI-generated content:** the clinic assistant generates text replies with an open-weight model (gpt-oss) hosted by Groq. Play's AI-Generated Content policy requires a way to report or flag offensive output in the app: every assistant reply has **Report this reply**, which opens an email to the privacy contact with the reply text. It must never produce medical advice; the prompt, the fixed replies and `supabase/functions/clinic-assistant.test.mjs` enforce that. **Confirm** the current wording of the policy before submitting.
- **News, government, COVID, gambling, user-generated content:** not applicable.

## Keep this in step with the app
If a new analytics, advertising or crash tool, a new outside host, a new table or any AI service is added, `src/legal.test.mjs` will fail. Update the policy, `DATA_INVENTORY.md` and these answers, and update the live Data safety form, before releasing.
