import assert from "node:assert/strict";
import { addDays, allergyMatches, applyTemplate, buildSendPayload, duplicateWith, parseLite, prescribingWarnings, sanitizeDays } from "./visitRx.js";

assert.equal(addDays("2026-11-18", 7), "2026-11-25");
assert.equal(addDays("2026-12-28", 7), "2027-01-04");
assert.equal(addDays("bad", 3), "");
assert.deepEqual(sanitizeDays([30, "7", 7, 0, -2, 400, 3.5, "x", 3]), [3, 7, 30]);

// allergy: direct name, drug class, and a clean non-match
const pen = [{ display: "Penicillin" }];
assert.equal(allergyMatches("Amoxicillin", pen)[0].reason, "same drug class");
assert.equal(allergyMatches("Amoxicillin (A) + Clavulanic acid (B)", pen).length, 1);
assert.equal(allergyMatches("Penicillin V", pen)[0].reason, "name match");
assert.equal(allergyMatches("Paracetamol", pen).length, 0);
assert.equal(allergyMatches("Diclofenac", [{ display: "NSAIDs" }]).length, 1);
assert.equal(allergyMatches("Cefixime", [{ display: "Cephalosporins" }]).length, 1);
assert.equal(allergyMatches("Metformin", [{ display: "" }]).length, 0);

// duplicates share an active ingredient
assert.deepEqual(duplicateWith("Amoxicillin", [{ display: "Amoxicillin (A) + Clavulanic acid (B)" }]), ["Amoxicillin (A) + Clavulanic acid (B)"]);
assert.deepEqual(duplicateWith("Paracetamol", [{ display: "Metformin" }]), []);

const meds = [{ display: "Amoxicillin" }, { display: "Amoxicillin" }, { display: "Atorvastatin" }];
const w = prescribingWarnings(meds, { drug_allergy: pen, current_medication: [{ display: "Atorvastatin" }] });
assert.equal(w[0].allergies.length, 1);
assert.equal(w[0].duplicates.length, 1);
assert.equal(w[2].alreadyTaking.length, 1);
assert.equal(w[2].allergies.length, 0);

// templates append and de-duplicate
const tpl = { items: [{ term_id: "medicine:a", display: "A", details: { dose: "1" } }, { term_id: "medicine:b", display: "B" }] };
assert.equal(applyTemplate([{ kind: "medicine", term_id: "medicine:a", display: "A" }], tpl).length, 2);

// rich text
const lines = parseLite("**Drink** water\n- rest _well_");
assert.deepEqual(lines[0].runs, [{ text: "Drink", b: true }, { text: " water" }]);
assert.equal(lines[1].type, "li");
assert.deepEqual(lines[1].runs[1], { text: "well", i: true });

// SAFETY: private notes never reach the outgoing payload (and so never the PDF).
const visit = { visit_date: "2026-11-18", vitals: {}, history: {}, items: [], notes_public: "Take rest", notes_private: "SECRET-PRIVATE-NOTE", follow_up: {} };
const payload = buildSendPayload(visit);
assert.equal(JSON.stringify(payload).includes("SECRET-PRIVATE-NOTE"), false);
assert.equal(payload.notes_public, "Take rest");
assert.equal("notes_private" in payload, false);
console.log("visitRx tests passed");

// ---- visit -> prescription row, validated by the existing prescription validator
const { visitToPrescriptionRow, toRxMedicine } = await import("./visitRx.js");
const { validatePrescription } = await import("./prescription.js");
const full = {
  visit_date: "2026-11-18",
  vitals: { bp_sys: "150", bp_dia: "95", pulse: "78", units: {} },
  history: {},
  items: [
    { kind: "symptom", display: "Fever" },
    { kind: "diagnosis", display: "Essential hypertension", code: "I10" },
    { kind: "lab", display: "HbA1c" },
    { kind: "medicine", display: "Amlodipine", details: { dose: "5 mg", frequency: "OD (once daily)", duration: 30, route: "Oral", when: "After food" } },
    { kind: "medicine", display: "Paracetamol", details: { frequency: "SOS (if needed)" } }
  ],
  notes_public: "**Low salt** diet",
  notes_private: "SECRET-PRIVATE-NOTE",
  follow_up: { date: "2026-12-18", note: "Bring BP log" }
};
const row = visitToPrescriptionRow(full, { patient: { id: "p1", name: "Test Patient", age: "45", gender: "Male" }, clinic: { id: "c1" }, doctorName: "Dr Test" });
assert.equal(validatePrescription(row, "2026-11-18"), "");
assert.match(row.diagnosis, /Essential hypertension \(I10\)/);
assert.match(row.instructions, /BP 150\/95/);
assert.match(row.instructions, /Tests advised: HbA1c/);
assert.match(row.instructions, /Advice: Low salt diet/);
assert.equal(JSON.stringify(row).includes("SECRET-PRIVATE-NOTE"), false);
assert.equal(row.medicines[0].frequency, "daily");
assert.equal(row.medicines[0].end, "2026-12-17");
assert.equal(row.medicines[1].frequency, "instructions");
assert.equal(toRxMedicine({ display: "Eye drop X", details: { route: "Eye drops" } }, "2026-11-18").site, "Eye drops");

// ---- PDF: the rendered document must not contain private notes.
const { buildPrescriptionPdf } = await import("./prescriptionPdf.js");
const doc = await buildPrescriptionPdf({ ...row, id: "abc123", created_at: "2026-11-18T05:00:00Z", status: "issued" }, { name: "Test Clinic", address: "Test address" });
const pdfText = Buffer.from(doc.output("arraybuffer")).toString("latin1");
assert.ok(pdfText.includes("Amlodipine"), "PDF contains medicines");
assert.ok(pdfText.includes("Low salt"), "PDF contains public advice");
assert.equal(pdfText.includes("SECRET-PRIVATE-NOTE"), false, "PDF must never contain private notes");
console.log("visit -> prescription and PDF tests passed");
