export const CLINIC_LOGIN_DOMAIN = "drashwaniclinic.local";

export const APPROVED_DOCTOR_EMAILS = [
  "drashwanikansal@gmail.com",
  `doctortest@${CLINIC_LOGIN_DOMAIN}`
];

export function isPhoneIdentifier(value) {
  return /^\+?\d[\d\s-]{7,}$/.test(String(value || "").trim());
}

export function normalizeClinicIdentifier(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean || clean.includes("@") || isPhoneIdentifier(clean)) return clean;
  return `${clean}@${CLINIC_LOGIN_DOMAIN}`;
}

export function isApprovedDoctorEmail(email) {
  return APPROVED_DOCTOR_EMAILS.includes(String(email || "").trim().toLowerCase());
}
