import assert from "node:assert/strict";
import {
  bmi, bmiBand, emptyProfile, hasDiabetes, historyLines, medicineLines, moodScores, profileForStorage, profileToRecordFields, riskHint, stepProblems
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
assert.equal(bmiBand(22.9), "Healthy range");
assert.equal(bmiBand(23), "Overweight");
assert.equal(bmiBand(25), "Obese");
assert.equal(bmiBand(27), "Obese");
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
  "BMI 27 (obese)"
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

// Added items: hypoglycaemia, last checks, adherence, mood screen, vaccines, infections, support
const extra = {
  ...filled(),
  diabetes: { ...filled().diabetes, device: "Glucose meter", hypoFrequency: "Every week or more", hypoAwareness: "I usually do not feel it", hospitalStays: "Once", lastEye: "More than 2 years ago", lastFoot: "Never", lastDental: "Within 1 year" },
  mood: { interest: "More than half the days", down: "Several days", nervous: "Not at all", worry: "Several days" },
  sleepSigns: ["Loud snoring"],
  missedDoses: "Sometimes",
  costSkipping: "Yes",
  sideEffects: "stomach upset",
  vaccines: ["Flu (this year)"],
  pastInfections: ["Hepatitis B"],
  support: "Family helps me",
  sexualHealth: "I would rather talk in person"
};
const moods = moodScores(extra.mood);
assert.deepEqual([moods.low, moods.worry, moods.lowFlag, moods.worryFlag], [3, 1, true, false]);
assert.equal(moodScores({ interest: "", down: "", nervous: "", worry: "" }).any, false);
assert.equal(moodScores({ interest: "Nearly every day", down: "", nervous: "", worry: "" }).lowFlag, false);
const extraHistory = historyLines(extra).join("\n");
for (const part of [
  "checks sugar at home: regularly, home device: glucose meter",
  "Low sugar episodes: every week or more; i usually do not feel it",
  "Hospital stays because of diabetes: once",
  "Last checks: eye more than 2 years ago, foot never, dental within 1 year",
  "Medicines: misses doses sometimes; skips medicine because of cost: yes; side effects: stomach upset",
  "Vaccines had: Flu (this year)",
  "Past infections: Hepatitis B",
  "Sleep apnoea signs: Loud snoring",
  "Mood screen: low mood 3 of 6 (at or above screening cut-off of 3), worry 1 of 6. Needs doctor review",
  "Sexual health: i would rather talk in person",
  "Support at home: family helps me"
]) assert.ok(extraHistory.includes(part), `missing: ${part}`);
assert.equal(riskHint({ ...filled(), diabetes: { ...filled().diabetes, hypoFrequency: "Every week or more" } }), "High");
assert.equal(riskHint(filled()), "Medium");
const deviceOnly = historyLines({ ...emptyProfile(), conditions: ["Type 2 diabetes"], diabetes: { ...emptyProfile().diabetes, device: "Sensor (CGM)" } }).join("\n");
assert.ok(deviceOnly.includes("Diabetes: home device: sensor (cgm)"));
const quiet = historyLines(emptyProfile()).join("\n");
for (const absent of ["Low sugar", "Mood screen", "Vaccines", "Medicines:", "Last checks"]) assert.ok(!quiet.includes(absent), `unexpected: ${absent}`);
const female = { ...emptyProfile(), gender: "Female", planningPregnancy: "Yes" };
assert.ok(historyLines(female).join("\n").includes("Planning pregnancy: yes"));
console.log("Added-item tests passed.");
