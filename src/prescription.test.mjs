import assert from "node:assert/strict";
import {
  buildPrescriptionRow, catalogLabel, formatMedicineLine, rxNumber, scheduleText, searchCatalog,
  toCarePlan, validatePrescription
} from "./prescription.js";

const today = "2026-11-17";
const med = (over = {}) => ({
  id: "m1", name: "Metformin 500 mg tablet", dose: "1 tablet", route: "Oral (swallow)", site: "",
  frequency: "daily", start: "2026-11-17", end: "2026-12-17", times: ["08:00", "20:00"], days: [], notes: "After food", ...over
});
const rx = (over = {}) => ({ diagnosis: "Type 2 diabetes", medicines: [med()], instructions: "Walk 30 minutes daily", follow_up_date: "2026-12-17", ...over });

// --- validation
assert.equal(validatePrescription(rx(), today), "");
assert.equal(validatePrescription(rx({ follow_up_date: "" }), today), "");
assert.match(validatePrescription(rx({ diagnosis: "   " }), today), /Enter the diagnosis/);
assert.match(validatePrescription(rx({ diagnosis: "x".repeat(1001) }), today), /diagnosis under 1000/);
assert.match(validatePrescription(rx({ medicines: [] }), today), /at least one medicine/);
assert.match(validatePrescription(rx({ medicines: Array.from({ length: 21 }, () => med()) }), today), /up to 20 medicines/);
assert.match(validatePrescription(rx({ medicines: [med(), med({ dose: "" })] }), today), /^Medicine 2:/);
assert.match(validatePrescription(rx({ instructions: "x".repeat(2001) }), today), /instructions under 2000/);
assert.match(validatePrescription(rx({ follow_up_date: "2026-11-16" }), today), /cannot be in the past/);
assert.match(validatePrescription(rx({ follow_up_date: "2026-13-01" }), today), /valid follow-up date/);
assert.equal(validatePrescription(rx({ follow_up_date: today }), today), "");

// --- the prescription number uses the India date (UTC+5:30), not the UTC date
assert.equal(rxNumber({ id: "3f9a2c11-0000-4000-8000-000000000000", created_at: "2026-11-17T20:00:00Z" }), "RX-20261118-3F9A2C");
assert.equal(rxNumber({ id: "3f9a2c11-0000-4000-8000-000000000000", created_at: "2026-11-17T10:00:00Z" }), "RX-20261117-3F9A2C");
assert.match(rxNumber({}), /^RX-\d{8}-DRAFT0$/);

// --- schedule and display lines
assert.equal(scheduleText(med()), "Daily - 08:00, 20:00");
assert.equal(scheduleText(med({ frequency: "weekly", days: [1, 4], times: ["09:00"] })), "Mon, Thu - 09:00");
assert.equal(scheduleText(med({ frequency: "instructions" })), "As directed");
const line = formatMedicineLine(med({ route: "Eye", site: "left eye" }));
assert.equal(line.directions, "1 tablet · Eye · left eye");
assert.equal(line.duration, "2026-11-17 to 2026-12-17");
assert.equal(formatMedicineLine(med({ frequency: "instructions", notes: "Use if itchy" })).duration, "");

// --- publishing to the care plan copies medicines (no shared references) and caps the notes
const source = rx({ instructions: "n".repeat(1500) });
const plan = toCarePlan(source);
assert.deepEqual(plan.medicines, source.medicines);
assert.notEqual(plan.medicines[0], source.medicines[0]);
plan.medicines[0].name = "changed";
assert.equal(source.medicines[0].name, "Metformin 500 mg tablet");
assert.equal(plan.follow_up_notes.length, 1000);
assert.equal(plan.follow_up_date, "2026-12-17");
assert.equal(toCarePlan(rx({ follow_up_date: "" })).follow_up_date, null);

// --- insert payload snapshots the patient and trims text
const row = buildPrescriptionRow({
  patient: { id: "abc", name: "  Asha Verma ", age: "47", gender: "Female" },
  form: rx({ diagnosis: "  Type 2 diabetes ", instructions: " Walk " }),
  clinic: { id: "clinic-2", name: "Dr. Ashwani Family Clinic" },
  doctorName: "Dr. Ashwani Kansal"
});
assert.equal(row.patient_id, "abc");
assert.equal(row.patient_name, "Asha Verma");
assert.equal(row.patient_age, 47);
assert.equal(row.patient_gender, "Female");
assert.equal(row.diagnosis, "Type 2 diabetes");
assert.equal(row.instructions, "Walk");
assert.equal(row.clinic_id, "clinic-2");
const placeholder = buildPrescriptionRow({ patient: { id: "p", name: "", age: 0, gender: "Patient" }, form: rx(), clinic: null, doctorName: "" });
assert.equal(placeholder.patient_name, "Patient");
assert.equal(placeholder.patient_age, null);
assert.equal(placeholder.patient_gender, "");
assert.equal(placeholder.clinic_id, "");

// --- catalog search: prefix matches first, inactive hidden, limited
const catalog = [
  { name: "Metformin", strength: "500 mg", form: "tablet" },
  { name: "Glimepiride", strength: "1 mg", form: "tablet" },
  { name: "Metformin", strength: "1000 mg", form: "SR tablet", active: false },
  { name: "Sitagliptin + Metformin", strength: "50/500 mg", form: "tablet" }
];
assert.equal(catalogLabel(catalog[0]), "Metformin 500 mg tablet");
assert.equal(catalogLabel({ name: "Insulin glargine" }), "Insulin glargine");
const found = searchCatalog(catalog, "metf");
assert.deepEqual(found.map(catalogLabel), ["Metformin 500 mg tablet", "Sitagliptin + Metformin 50/500 mg tablet"]);
const withInactive = searchCatalog(catalog, "metf", 8, { includeInactive: true }).map(catalogLabel);
assert.equal(withInactive.length, 3);
assert.ok(withInactive.includes("Metformin 1000 mg SR tablet"));
assert.deepEqual(searchCatalog(catalog, ""), []);
assert.deepEqual(searchCatalog(catalog, "zzz"), []);
assert.equal(searchCatalog(catalog, "t", 2).length, 2);

console.log("prescription tests passed");
