import assert from "node:assert/strict";
import { buildPatientMessage, indianMobile, pdfPath, uploadPrescription, whatsappChatUrl } from "./prescriptionDelivery.js";

assert.equal(indianMobile("+91 98765 43210"), "9876543210");
assert.equal(indianMobile("12345"), "");
assert.equal(indianMobile(""), "");

const message = buildPatientMessage({ patientName: "Test Patient", link: "https://example.test/p.pdf" });
assert.match(message, /^Hi Test, Dr Ashwani has sent you a prescription\./);
assert.ok(message.includes("https://example.test/p.pdf"));
assert.ok(message.includes("30 days"));
assert.ok(message.includes("https://drashwaniclinic.pages.dev"));
assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test(message), false, "no emoji");
assert.equal(message.includes("—"), false, "no em dash");

assert.equal(whatsappChatUrl("98765 43210", "hi there").startsWith("https://wa.me/919876543210?text=hi%20there"), true);
assert.equal(whatsappChatUrl("", "hi").startsWith("https://wa.me/?text="), true);

const rx = { id: "3f9a2c11-0000-0000-0000-000000000000", patient_id: "patient-1", created_at: "2026-11-22T10:00:00Z" };
assert.equal(pdfPath(rx), "patient-1/RX-20261122-3F9A2C.pdf");

// Upload returns a link, or null on any failure
const fake = (uploadError, signed) => ({
  storage: { from: () => ({
    upload: async () => ({ error: uploadError }),
    createSignedUrl: async (_path, seconds) => (signed ? { data: { signedUrl: `https://signed.test/x?expires=${seconds}` }, error: null } : { data: null, error: { message: "no" } })
  }) }
});
assert.equal(await uploadPrescription(fake(null, true), rx, new Blob(["x"])), `https://signed.test/x?expires=${30 * 86400}`);
assert.equal(await uploadPrescription(fake({ message: "bucket missing" }, true), rx, new Blob(["x"])), null);
assert.equal(await uploadPrescription(fake(null, false), rx, new Blob(["x"])), null);

console.log("Prescription delivery tests passed.");
