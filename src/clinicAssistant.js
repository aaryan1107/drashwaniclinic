import { formatMedicineLine, rxNumber } from "./prescription.js";

export const CLINIC_ASSISTANT_SCOPE = "I’m the clinic chatbot. I can show your issued prescription, check a recorded payment, or help you book a visit.";

export function clinicAssistantIntent(message, topic) {
  const text = message.toLowerCase();
  if (/\b(api key|system prompt|developer prompt|credentials|secret|ignore (?:your|previous|all) instructions|what model|who (?:are|made) you)\b/.test(text)) return "scope";
  if (/\b(diagnos\w*|side effects?|interactions?|missed|forgot|skip|double|change|increase|decrease|reduce|stop|should i take|can i take)\b/.test(text)) return "medical";
  if (/\b(?:my prescribed (?:medicines|medications)|my medication schedule|when (?:do|am) i (?:supposed to )?take my (?:medicine|medication))\b/.test(text)) return "prescription";
  if (/\b(?:my|current|latest|issued) prescription\b|^\s*(?:show |open |read )?(?:the )?prescription[?.!]?\s*$/.test(text)) return "prescription";
  if (/\b(?:my payment|payment status|payment verified|did my payment|did i pay|check payment|verify payment|was i charged)\b/.test(text)) return "payment";
  if (/\b(?:book (?:a |an |my )?(?:visit|appointment|consultation)|schedule (?:a |an )?(?:visit|appointment)|how (?:do|can) i book)\b/.test(text)) return "book";
  if (/\b(?:clinic hours|opening hours|clinic timings|where is (?:the )?(?:doctor|clinic)|doctor availability|clinic availability)\b/.test(text)) return "availability";
  if (topic === "prescription" && /^\s*(?:(?:when|what date) (?:is|was) (?:my |the )?(?:follow[- ]?up|next visit)|follow[- ]?up date)[?.! ]*$/i.test(text)) return "prescription-date";
  if (topic === "prescription" && /^\s*(?:when (?:do i take (?:it|them)|is it due)|(?:show )?(?:the )?(?:medicine )?schedule|how often)[?.! ]*$/i.test(text)) return "prescription-schedule";
  if (topic === "payment" && /^\s*(?:is it (?:confirmed|paid|done|captured)|(?:what(?:'s| is) (?:the |my )?)?(?:payment )?reference|check again)[?.! ]*$/i.test(text)) return "payment-followup";
  if (topic === "book" && /^\s*(?:what happens next|is it confirmed|how do i confirm|where do i pay)[?.! ]*$/i.test(text)) return "book-followup";
  if (/\b(?:update (?:my )?(?:readings|sugar|bp)|log (?:my )?(?:readings|sugar|bp))\b/.test(text)) return "updates";
  return "scope";
}

export function formatAssistantPrescription(rx, detail) {
  if (detail === "prescription-date") {
    return rx.follow_up_date
      ? `The doctor recorded ${rx.follow_up_date} as your follow-up date on ${rxNumber(rx)}.`
      : `No follow-up date is recorded on ${rxNumber(rx)}.`;
  }
  if (detail === "prescription-schedule") {
    return [`Medicine schedule on ${rxNumber(rx)}`, ...rx.medicines.map((medicine) => {
      const line = formatMedicineLine(medicine);
      return [line.name, line.schedule, line.duration].filter(Boolean).join(" · ");
    })].join("\n");
  }
  return [
    `Latest issued prescription · ${rxNumber(rx)}`,
    ...rx.medicines.map((medicine) => {
      const line = formatMedicineLine(medicine);
      return [line.name, line.directions, line.schedule, line.duration, line.notes].filter(Boolean).join(" · ");
    }),
    rx.instructions && `Doctor’s instructions: ${rx.instructions}`,
    rx.follow_up_date && `Recorded follow-up date: ${rx.follow_up_date}`
  ].filter(Boolean).join("\n");
}

export function formatAssistantPayment(payment, visitPurpose) {
  if (!payment) return "I found no clinic payment record for your account.";
  const type = payment.clinic?.purpose === visitPurpose ? "clinic visit" : "online consultation";
  const prefix = `Your latest recorded ${type} payment`;
  const reference = payment.razorpay_payment_id ? ` Reference: ${payment.razorpay_payment_id}.` : "";
  switch (payment.payment_status) {
    case "PAID_CONFIRMED": return `${prefix} is confirmed.${reference}`;
    case "MANUALLY_VERIFIED": return `${prefix} was verified by the clinic.${reference}`;
    case "FAILED": return `${prefix} is marked failed.${reference}`;
    case "CAPTURE_PENDING":
    case "AUTHORIZED": return `${prefix} is awaiting capture. It has no payment confirmation yet.${reference}`;
    default: return `${prefix} has no payment confirmation yet.${reference}`;
  }
}
