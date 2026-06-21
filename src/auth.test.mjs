import assert from "node:assert/strict";
import {
  isApprovedDoctorEmail,
  normalizeClinicIdentifier
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

console.log("auth helper tests passed");
