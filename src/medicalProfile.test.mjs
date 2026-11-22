import assert from "node:assert/strict";
import {
  bmi, bmiBand, emptyProfile, hasDiabetes, historyLines, medicineLines, profileForStorage, profileToRecordFields, riskHint, stepProblems
} from "./medicalProfile.js";

const filled = () => ({
  ...emptyProfile({ name: "Test Patient" }),
  phone: "+91 98765 43210",
  age: "52",
  heightCm: "170",
  weight: "78",
  conditions: ["Type 2 diabetes", "High BP"],
  diabetes: { duration: "5 to 10 years", treatment: "Tablets and insulin", homeChecks: "Regularly", complications: ["Eye problems"] },
  fasting: "142",
  hba1c: "8.1",
  bp: "128/82",
  medicines: [{ name: "Metformin", dose: "500 mg twice a day" }, { name: "", dose: "" }],
  drugAllergies: ["Penicillin"],
  allergyReaction: "rash",
  surgeries: ["Appendix removed, 2015", "  "],
  familyHistory: ["Diabetes", "Heart disease"],
  smoking: "Currently",
  smokingPerDay: "5",
  emergencyName: "Meera",
  emergencyRelation: "Wife",
  emergencyPhone: "9876500000",
  consent: true
});

// BMI and band
assert.equal(bmi("170", "78"), 27);
assert.equal(bmi("", "78"), null);
assert.equal(bmi("20", "78"), null);
assert.equal(bmiBand(27), "Overweight");
assert.equal(bmiBand(null), "");

// Step checks: only the first and last steps can block
assert.deepEqual(stepProblems(1, emptyProfile()), []);
assert.equal(stepProblems(0, emptyProfile()).length, 3);
assert.deepEqual(stepProblems(0, filled()), []);
assert.equal(stepProblems(3, { ...filled(), consent: false }).length, 1);
assert.equal(stepProblems(3, { ...filled(), emergencyPhone: "123" }).length, 1);
assert.deepEqual(stepProblems(3, filled()), []);

// Diabetes detection and risk hint
assert.equal(hasDiabetes(filled()), true);
assert.equal(hasDiabetes(emptyProfile()), false);
assert.equal(riskHint(filled()), "Medium");
assert.equal(riskHint({ ...filled(), hba1c: "9.4" }), "High");
assert.equal(riskHint(emptyProfile()), "Low");

// Medicines skip blank rows
assert.deepEqual(medicineLines(filled()), ["Taking: Metformin 500 mg twice a day"]);

// History lines carry the facts a doctor needs
const history = historyLines(filled()).join("\n");
for (const part of [
  "Diabetes: 5 to 10 years, tablets and insulin, checks sugar at home: regularly",
  "Diabetes complications: Eye problems",
  "Allergies: Penicillin (reaction: rash)",
  "Past surgery or hospital stay: Appendix removed, 2015",
  "Family history: Diabetes, Heart disease",
  "smoking: currently (5 a day)",
  "BMI 27 (overweight)"
]) assert.ok(history.includes(part), `missing: ${part}`);
assert.ok(!history.includes("Past surgery or hospital stay: \n"));

// Record fields
const fields = profileToRecordFields(filled());
assert.deepEqual(fields.conditions, ["Type 2 diabetes", "High BP"]);
assert.equal(fields.vitals.fasting, "142 mg/dL");
assert.equal(fields.vitals.hba1c, "8.1%");
assert.equal(fields.vitals.weight, "78 kg");
assert.ok(fields.notes.includes("Emergency contact: Meera, Wife, 9876500000"));

// Stored copy
const stored = profileForStorage(filled());
assert.equal(stored.whatsapp, "+91 98765 43210");
assert.equal(stored.medicines.length, 1);
assert.deepEqual(stored.surgeries, ["Appendix removed, 2015"]);
assert.ok(stored.consentedAt);

console.log("Medical profile tests passed.");
