import assert from "node:assert/strict";
import {
  NATIVE_AUTH_CALLBACK,
  isApprovedDoctorEmail,
  normalizeClinicIdentifier,
  readOAuthCallback
} from "./auth.js";

assert.equal(
  normalizeClinicIdentifier("patienttest"),
  "patienttest@drashwaniclinic.local",
  "plain patient username should map to clinic-local email"
);

assert.equal(
  normalizeClinicIdentifier("doctortest"),
  "doctortest@drashwaniclinic.local",
  "plain doctor username should map to clinic-local email"
);

assert.equal(
  normalizeClinicIdentifier("+91 98765 43210"),
  "+91 98765 43210",
  "phone values should stay as phone values"
);

assert.equal(
  normalizeClinicIdentifier("patient@example.com"),
  "patient@example.com",
  "real emails should not be rewritten"
);

assert.equal(isApprovedDoctorEmail("doctortest@drashwaniclinic.local"), true);
assert.equal(isApprovedDoctorEmail("patienttest@drashwaniclinic.local"), false);

assert.deepEqual(readOAuthCallback(`${NATIVE_AUTH_CALLBACK}?code=test-code`, NATIVE_AUTH_CALLBACK), {
  code: "test-code",
  error: null
});
assert.equal(readOAuthCallback("https://auth/callback?code=test-code", NATIVE_AUTH_CALLBACK), null);
assert.equal(readOAuthCallback("com.drashwani.familyclinic://other/callback?code=test-code", NATIVE_AUTH_CALLBACK), null);
assert.equal(readOAuthCallback("not a URL", NATIVE_AUTH_CALLBACK), null);
assert.equal(readOAuthCallback(`${NATIVE_AUTH_CALLBACK}#error=access_denied`, NATIVE_AUTH_CALLBACK).error, "access_denied");

console.log("auth helper tests passed");
