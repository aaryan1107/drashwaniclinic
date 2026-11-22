// Getting a finished prescription to the patient: upload the PDF to private storage, make a time-limited link,
// and hand a ready message to WhatsApp. Today the doctor taps send in WhatsApp; a later automatic sender
// (WhatsApp Business Platform) only needs to take `buildPatientMessage` / `link` from here.
import { rxNumber } from "./prescription.js";

export const PDF_BUCKET = "prescription-pdfs";
export const LINK_DAYS = 30;
export const CLINIC_APP_URL = "https://drashwaniclinic.pages.dev";

// Last ten digits of an Indian mobile number, or "" when there are not ten.
export function indianMobile(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? digits : "";
}

export const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

// Plain text (no emoji, no clinical detail): the link carries the prescription.
export function buildPatientMessage({ patientName, link, doctorName = "Dr Ashwani", appUrl = CLINIC_APP_URL }) {
  return [
    `Hi ${firstName(patientName)}, ${doctorName} has sent you a prescription.`,
    `You can open it here: ${link}`,
    `The link works for ${LINK_DAYS} days. You can also find it in the clinic app, where you can book your next visit: ${appUrl}`
  ].join("\n");
}

export function whatsappChatUrl(phone, message) {
  const mobile = indianMobile(phone);
  const text = encodeURIComponent(message);
  return mobile ? `https://wa.me/91${mobile}?text=${text}` : `https://wa.me/?text=${text}`;
}

// Storage path keeps each patient's files under their own id so storage policies can match on the first folder.
export const pdfPath = (rx) => `${rx.patient_id}/${rxNumber(rx)}.pdf`;

// Uploads the PDF and returns a signed link, or null when storage is not set up or the call fails.
// Callers fall back to sharing the PDF file itself.
export async function uploadPrescription(supabase, rx, blob) {
  const path = pdfPath(rx);
  const bucket = supabase.storage.from(PDF_BUCKET);
  const { error } = await bucket.upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) return null;
  const { data, error: signError } = await bucket.createSignedUrl(path, LINK_DAYS * 24 * 60 * 60);
  return signError || !data?.signedUrl ? null : data.signedUrl;
}
