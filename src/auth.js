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

export const NATIVE_AUTH_CALLBACK = "com.drashwani.familyclinic://auth/callback";

export function readOAuthCallback(value, expectedUrl) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const expected = new URL(expectedUrl);
  if (url.protocol !== expected.protocol || url.host !== expected.host ||
      url.pathname !== expected.pathname || url.username || url.password) return null;

  const fragment = new URLSearchParams(url.hash.slice(1));
  return {
    code: url.searchParams.get("code"),
    error: url.searchParams.get("error") || fragment.get("error")
  };
}
