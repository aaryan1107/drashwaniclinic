import assert from "node:assert/strict";

// Replicate patientToRecordRow and patientToPatientPartialRow logic for direct assertion
const patientToRecordRow = (patient, ownerId = null) => ({
  id: String(patient.id),
  ...(ownerId ? { owner_id: ownerId } : {}),
  name: patient.name || "Clinic Patient",
  age: Number(patient.age) || null,
  gender: patient.gender || null,
  mobile: patient.mobile || null,
  whatsapp: patient.whatsapp || patient.mobile || null,
  abha: patient.abha || null,
  source: patient.source || "Patient app",
  conditions: patient.conditions || [],
  latest: patient.latest || null,
  risk: patient.risk || "Low",
  vitals: patient.vitals || {},
  history: patient.history || [],
  labs: patient.labs || [],
  symptoms: patient.symptoms || [],
  medicines: patient.medicines || [],
  notes: patient.notes || null,
  follow_up: patient.followUp || null,
  last_visit: patient.lastVisit || null
});

const patientToPatientPartialRow = (patient, ownerId = null) => {
  const row = {
    name: patient.name || "Clinic Patient",
    ...(patient.age !== undefined && patient.age !== null ? { age: Number(patient.age) || 0 } : {}),
    ...(patient.gender ? { gender: patient.gender } : {}),
    ...(patient.mobile ? { mobile: patient.mobile } : {}),
    ...(patient.whatsapp ? { whatsapp: patient.whatsapp } : {}),
    ...(patient.abha ? { abha: patient.abha } : {}),
    ...(patient.source ? { source: patient.source } : {}),
    ...(patient.conditions ? { conditions: patient.conditions } : {}),
    ...(patient.latest ? { latest: patient.latest } : {}),
    ...(patient.vitals ? { vitals: patient.vitals } : {}),
    ...(patient.symptoms ? { symptoms: patient.symptoms } : {}),
    ...(patient.lastVisit ? { last_visit: patient.lastVisit } : {}),
    ...(ownerId ? { owner_id: ownerId } : {})
  };
  if (patient.labs && patient.labs.length > 0) {
    row.labs = patient.labs;
  }
  return row;
};

// 1. Doctor sets clinical fields on an existing patient record
const existingDoctorRecord = {
  id: "patient_123",
  name: "Ramesh Sharma",
  age: 52,
  risk: "High",
  medicines: ["Metformin 500mg BID", "Telmisartan 40mg QD"],
  history: ["Type 2 Diabetes since 2018", "Hypertension"],
  notes: "Patient needs follow up in 2 weeks.",
  followUp: "2026-08-20"
};

// 2. Patient submits a new reading from patient app
const patientUpdatePayload = {
  id: "patient_123",
  name: "Ramesh Sharma",
  vitals: { fasting: "145 mg/dL", postMeal: "210 mg/dL" },
  latest: "Fasting 145 mg/dL",
  risk: "Low", // Default constructed in patient flow
  medicines: [], // Default constructed in patient flow
  history: [], // Default constructed in patient flow
  notes: "Patient updated readings from app.",
  followUp: "Not scheduled", // Default constructed in patient flow
  lastVisit: "Just now"
};

// Test 1: Full upsert row (doctor path) includes risk, medicines, history, notes, follow_up
const fullRow = patientToRecordRow(existingDoctorRecord, "doctor_id");
assert.equal(fullRow.risk, "High");
assert.deepEqual(fullRow.medicines, ["Metformin 500mg BID", "Telmisartan 40mg QD"]);
assert.deepEqual(fullRow.history, ["Type 2 Diabetes since 2018", "Hypertension"]);
assert.equal(fullRow.notes, "Patient needs follow up in 2 weeks.");
assert.equal(fullRow.follow_up, "2026-08-20");

// Test 2: Partial update row (patient path) MUST NOT include doctor-owned clinical fields
const partialRow = patientToPatientPartialRow(patientUpdatePayload, "patient_123");
assert.equal("risk" in partialRow, false, "risk must NOT be present in patient partial update");
assert.equal("medicines" in partialRow, false, "medicines must NOT be present in patient partial update");
assert.equal("history" in partialRow, false, "history must NOT be present in patient partial update");
assert.equal("notes" in partialRow, false, "notes must NOT be present in patient partial update");
assert.equal("follow_up" in partialRow, false, "follow_up must NOT be present in patient partial update");

// Test 3: Partial update row includes patient controllable fields
assert.equal(partialRow.name, "Ramesh Sharma");
assert.deepEqual(partialRow.vitals, { fasting: "145 mg/dL", postMeal: "210 mg/dL" });
assert.equal(partialRow.latest, "Fasting 145 mg/dL");
assert.equal(partialRow.last_visit, "Just now");

console.log("Patient record sync partial update unit tests passed successfully!");
