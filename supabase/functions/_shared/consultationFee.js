// Single source of truth for what the clinic charges through Razorpay.
// Imported by the app (Vite) and by the Supabase Edge Functions, so the price shown, the price
// charged and the price accepted can never disagree. Plain JavaScript so Deno, Node and Vite all load it.

// Both fees (online consultation and clinic visit booked in the app) follow the patient's age.
export const GENERAL_FEE_RUPEES = 800;
export const SENIOR_FEE_RUPEES = 600;
export const SENIOR_MIN_AGE = 60; // age 60 and over pays the senior fee

// Stored on consultation_payments.clinic so a visit payment never unlocks the WhatsApp consultation.
export const VISIT_PAYMENT_PURPOSE = "clinic_visit";

const toAge = (age) => {
  const value = typeof age === "number" ? age : Number.parseInt(String(age ?? ""), 10);
  return Number.isFinite(value) ? value : null;
};

export const isSenior = (age) => {
  const value = toAge(age);
  return value !== null && value >= SENIOR_MIN_AGE;
};

// An unknown or missing age pays the general fee.
export const consultationFeeRupees = (age) => (isSenior(age) ? SENIOR_FEE_RUPEES : GENERAL_FEE_RUPEES);
export const consultationFeeTier = (age) => (isSenior(age) ? "senior" : "general");
// A clinic visit booked in the app costs the same as an online consultation.
export const visitFeeRupees = consultationFeeRupees;

// The one amount the server will accept for this kind of payment, in paise.
export function expectedFeePaise({ purpose, age } = {}) {
  const rupees = purpose === VISIT_PAYMENT_PURPOSE ? visitFeeRupees(age) : consultationFeeRupees(age);
  return rupees * 100;
}

// Every amount a genuine order can have. The webhook and verify checks use this as a backstop.
// 70000 is the old fixed Rs 700 visit fee: orders created before 23 November 2026 must still verify,
// capture and refund. New orders are priced by expectedFeePaise, which never returns it.
export const LEGACY_FEE_PAISE = [70000];
export const ALLOWED_FEE_PAISE = [SENIOR_FEE_RUPEES * 100, ...LEGACY_FEE_PAISE, GENERAL_FEE_RUPEES * 100];
export const isAllowedFeePaise = (amount) => ALLOWED_FEE_PAISE.includes(amount);

export const feeSummary = () =>
  `Rs ${GENERAL_FEE_RUPEES}, or Rs ${SENIOR_FEE_RUPEES} for patients aged ${SENIOR_MIN_AGE} and over`;
