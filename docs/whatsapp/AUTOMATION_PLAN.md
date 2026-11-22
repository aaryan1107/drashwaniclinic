# WhatsApp automation plan

Status: plan only. Nothing here sends automatically yet. Today the doctor taps **Send on WhatsApp** and WhatsApp opens with the message and a 30 day prescription link already filled in.

## What gets sent

| Message | Trigger | Type | Contains |
|---|---|---|---|
| Booking confirmed | Razorpay payment captured (the `consultation_payments` row becomes `PAID_CONFIRMED`) | Template, utility | Day, time, clinic (or online), Razorpay payment reference, amount paid |
| Payment pending | Booking saved while payment is still confirming | Template, utility | Reference, "we will confirm shortly" |
| Booking reminder | 1 day before and 2 hours before `appointment_date` + `appointment_time` | Template, utility | Day, time, clinic, how to reschedule |
| Prescription ready | Doctor taps **Send Rx** (PDF link is created at that moment) | Template, utility | Patient first name, 30 day link |
| Follow-up reminder | 1 day before `follow_up_date` on a prescription | Template, utility | Date, how to book |
| Bot replies | Patient writes to the clinic number | Free-form, inside the 24 hour window | Answer from the clinic assistant |

Messages that contain no offer and are expected by the patient are **utility**. Do not add offers or news to them or Meta will bill them as marketing (about 7 times the price).

## How it would work

1. **Outbox table** `whatsapp_outbox` (patient id, phone, template name, parameters, send at, status, provider message id). Triggers on bookings, payments and prescriptions insert rows. A reminder is just a row with a future `send_at`.
2. **Sender function** (Supabase Edge Function) runs every minute, picks due rows, calls the WhatsApp Cloud API, and records delivered or failed. Failed sends are retried, then flagged for the front desk.
3. **Inbound webhook** (Edge Function) receives patient messages and delivery receipts from Meta, checks the signature, and answers.
4. **Bot**: the inbound function passes the patient's text to the clinic assistant (same safety rules as the in-app chat: emergency words, no diagnosis, verified records only). The model behind it can be Gemini; the current assistant function uses OpenAI, so this is a swap of the model call, not a new design. The reply goes back as a free-form message inside the 24 hour window.
5. **Consent**: store a WhatsApp opt-in with a timestamp at sign-up (the medical profile consent line already covers reminders; add WhatsApp wording). Honour STOP.

## Cost (India)

Per delivered message, from Meta's India rate card as quoted by a third-party site (check on Meta's page before budgeting):

- Utility template: **Rs 0.115**
- Marketing template: Rs 0.8631 (avoid)
- Replies to a patient who messaged first: free for the first 1,000 a month per number, then Rs 0.115
- Messages the patient sends: free
- GST is probably added. A provider (BSP) may add a fee on top, for example Rs 0.20 per message at one provider quoted online. Going straight to Meta has no platform fee.

Example: a visit with confirmation, 2 reminders, prescription and a follow-up reminder is 5 messages, about **Rs 0.58 per visit**. 1,000 visits a month is about Rs 575 before GST. The bot is extra: model usage for Gemini or OpenAI, plus Rs 0.115 per reply past the first 1,000 a month.

## What has to be set up first (cannot be done from code)

1. Meta developer account and a **business portfolio** for the clinic.
2. A WhatsApp **phone number** for the clinic. A number already used in the normal WhatsApp app has to be moved to the API or run through Meta's coexistence option (confirm current rules with Meta).
3. **Display name** approved by Meta. **Business verification** for higher sending limits (may need the clinic's registration papers).
4. **Message templates** created and approved (the five above), in the utility category.
5. A **permanent access token** (system user) and the phone number id, stored as Supabase function secrets. Never in the repository.
6. A **payment method** on the WhatsApp Business account.
7. A **Gemini API key** if the bot should use Gemini.

## Build order

1. Outbox table and the confirmation, prescription and follow-up triggers (works with a fake sender in tests).
2. Sender function, then connect real credentials.
3. Reminder scheduling.
4. Inbound webhook and bot.

## Already in the app

- Prescription PDF in the clinic layout, uploaded to private storage with a 30 day link at the moment the prescription is sent (migration `20261122120000_prescription_pdf_storage.sql`).
- Reserved-patient counts and a recommended time on the Book tab and on the doctor's Today screen (migration `20261122130000_clinic_slot_load.sql` for the patient counts).
