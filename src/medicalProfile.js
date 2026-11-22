// Patient medical profile: option lists, empty state, and the mapping into the patient record the doctor sees.
// Pure functions only, so they can be tested without React. Condition and symptom wording follows the
// primary-care lists in docs/seed (development lists, pending review by Dr Ashwani).

export const CONDITION_GROUPS = [
  { id: "metabolic", label: "Sugar and metabolism", items: ["Type 2 diabetes", "Type 1 diabetes", "Prediabetes", "Gestational diabetes", "Obesity", "High cholesterol", "Fatty liver", "High uric acid or gout", "Low vitamin D or B12"] },
  { id: "thyroid", label: "Thyroid", items: ["Underactive thyroid", "Overactive thyroid", "Goitre"] },
  { id: "heart", label: "Heart and blood pressure", items: ["High BP", "Heart disease", "Past heart attack or stent", "Past stroke"] },
  { id: "organs", label: "Kidney and liver", items: ["Kidney disease", "Kidney stones", "Liver disease"] },
  { id: "chest", label: "Lungs", items: ["Asthma", "COPD", "Past TB"] },
  { id: "mind", label: "Mind and sleep", items: ["Anxiety", "OCD", "Depression", "Poor sleep"] },
  { id: "body", label: "Bones and nerves", items: ["Arthritis", "Back or joint pain", "Numbness or tingling in feet", "Epilepsy"] },
  { id: "women", label: "Women's health", items: ["PCOS", "Irregular periods", "Menopause"], femaleOnly: true },
  { id: "other", label: "Other", items: ["Cancer", "Skin condition", "Anaemia"] }
];

export const DIABETES_CONDITIONS = ["Type 2 diabetes", "Type 1 diabetes", "Prediabetes", "Gestational diabetes"];
export const CHRONIC_CONDITIONS = [
  ...DIABETES_CONDITIONS, "Underactive thyroid", "Overactive thyroid", "High BP", "Heart disease",
  "Past heart attack or stent", "Past stroke", "Kidney disease", "Liver disease", "COPD", "Asthma", "Epilepsy", "Cancer"
];

export const DIABETES_COMPLICATIONS = ["Eye problems", "Kidney problems", "Nerve pain or numbness", "Foot ulcer or wound", "Heart problems"];
export const DIABETES_DURATIONS = ["Just diagnosed", "Under 1 year", "1 to 5 years", "5 to 10 years", "More than 10 years"];
export const DIABETES_TREATMENTS = ["Diet and exercise only", "Tablets", "Insulin", "Tablets and insulin", "Not on treatment"];
export const HOME_CHECKS = ["Never", "Sometimes", "Regularly"];

export const SYMPTOMS_NOW = [
  "Excess thirst", "Passing urine often", "Tiredness", "Blurred vision", "Tingling in feet", "Weight change",
  "Dizziness", "Chest discomfort", "Breathlessness", "Swelling in feet", "Poor sleep", "Low mood or worry",
  "Slow healing wounds", "Hunger and sweating spells"
];

export const COMMON_DRUG_ALLERGIES = ["Penicillin", "Sulfa drugs", "Aspirin or pain killers", "Other antibiotics"];
export const FAMILY_HISTORY = ["Diabetes", "High BP", "Heart disease", "Stroke", "Thyroid", "Kidney disease", "Cancer", "Mental health"];
export const BLOOD_GROUPS = ["Not sure", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const SMOKING = ["Never", "Used to", "Currently"];
export const ALCOHOL = ["Never", "Occasionally", "Regularly"];
export const ACTIVITY = ["Mostly sitting", "Light walking", "Regular exercise"];
export const DIET = ["Vegetarian", "Eggs but no meat", "Non-vegetarian"];
export const SLEEP = ["Under 5 hours", "5 to 6 hours", "7 to 8 hours", "More than 8 hours"];
export const LANGUAGES = ["English", "Hindi", "Both"];
export const CONSULT_MODES = ["Clinic visit", "WhatsApp consultation", "Online consultation"];

export const emptyMedicine = () => ({ name: "", dose: "" });

export const emptyProfile = (googleProfile) => ({
  fullName: googleProfile?.name || "",
  phone: "",
  whatsapp: "",
  sameWhatsapp: true,
  age: "",
  gender: "Male",
  bloodGroup: "Not sure",
  heightCm: "",
  weight: "",
  pregnant: "No",
  abha: "",
  language: "English",
  conditions: [],
  otherCondition: "",
  diabetes: { duration: "", treatment: "", homeChecks: "", complications: [] },
  fasting: "",
  postMeal: "",
  hba1c: "",
  bp: "",
  symptoms: [],
  reason: "",
  medicines: [emptyMedicine()],
  supplements: "",
  drugAllergies: [],
  otherAllergy: "",
  allergyReaction: "",
  surgeries: [],
  familyHistory: [],
  familyNote: "",
  smoking: "Never",
  smokingPerDay: "",
  alcohol: "Never",
  chewsTobacco: false,
  activity: "Light walking",
  diet: "Vegetarian",
  sleep: "7 to 8 hours",
  emergencyName: "",
  emergencyRelation: "",
  emergencyPhone: "",
  preferredMode: "Clinic visit",
  consent: false
});

export const digits = (value) => `${value || ""}`.replace(/\D/g, "");

export const hasDiabetes = (profile) => profile.conditions.some((item) => DIABETES_CONDITIONS.includes(item));

// Body mass index from height in cm and weight in kg. Returns null when either is missing or implausible.
export function bmi(heightCm, weightKg) {
  const h = Number(heightCm) / 100;
  const w = Number(weightKg);
  if (!(h >= 0.9 && h <= 2.4) || !(w >= 15 && w <= 300)) return null;
  return Math.round((w / (h * h)) * 10) / 10;
}

// Asian-Indian cut-offs used by RSSDI-ESI 2020 and ICMR: overweight from 23, obese from 25.
export function bmiBand(value) {
  if (value === null) return "";
  if (value < 18.5) return "Underweight";
  if (value < 23) return "Healthy range";
  if (value < 25) return "Overweight";
  return "Obese";
}

// Step checks. Only step 0 blocks progress; the rest are optional so a patient can skip what they do not know.
export function stepProblems(step, profile) {
  const problems = [];
  if (step === 0) {
    if (!profile.fullName.trim()) problems.push("Enter your full name.");
    if (digits(profile.phone).length < 10) problems.push("Enter a 10 digit mobile number.");
    const age = Number(profile.age);
    if (!(age >= 1 && age <= 120)) problems.push("Enter your age in years.");
    if (!profile.sameWhatsapp && profile.whatsapp.trim() && digits(profile.whatsapp).length < 10) problems.push("Enter a 10 digit WhatsApp number or tick the same-number box.");
  }
  if (step === 3) {
    if (profile.emergencyPhone.trim() && digits(profile.emergencyPhone).length < 10) problems.push("Enter a 10 digit emergency contact number.");
    if (!profile.consent) problems.push("Tick the consent box to continue.");
  }
  return problems;
}

const clean = (items) => items.map((item) => `${item}`.trim()).filter(Boolean);
const withUnit = (value, unit) => (value && `${value}`.trim() ? `${`${value}`.trim()} ${unit}` : "");

// Medicines a patient says they take now, as short lines for the doctor ("Metformin 500 mg twice a day").
export function medicineLines(profile) {
  const lines = profile.medicines
    .filter((item) => item.name.trim())
    .map((item) => `Taking: ${item.name.trim()}${item.dose.trim() ? ` ${item.dose.trim()}` : ""}`);
  if (profile.supplements.trim()) lines.push(`Supplements: ${profile.supplements.trim()}`);
  return lines;
}

// One line per fact, shown in the doctor's Medical History list.
export function historyLines(profile) {
  const lines = [];
  const diabetes = profile.diabetes;
  if (hasDiabetes(profile)) {
    const parts = [];
    if (diabetes.duration) parts.push(diabetes.duration.toLowerCase());
    if (diabetes.treatment) parts.push(diabetes.treatment.toLowerCase());
    if (diabetes.homeChecks) parts.push(`checks sugar at home: ${diabetes.homeChecks.toLowerCase()}`);
    if (parts.length) lines.push(`Diabetes: ${parts.join(", ")}`);
    if (diabetes.complications.length) lines.push(`Diabetes complications: ${diabetes.complications.join(", ")}`);
  }
  if (profile.otherCondition.trim()) lines.push(`Other condition: ${profile.otherCondition.trim()}`);
  const allergies = clean([...profile.drugAllergies, profile.otherAllergy]);
  if (allergies.length) lines.push(`Allergies: ${allergies.join(", ")}${profile.allergyReaction.trim() ? ` (reaction: ${profile.allergyReaction.trim()})` : ""}`);
  clean(profile.surgeries).forEach((item) => lines.push(`Past surgery or hospital stay: ${item}`));
  if (profile.familyHistory.length) lines.push(`Family history: ${profile.familyHistory.join(", ")}${profile.familyNote.trim() ? ` (${profile.familyNote.trim()})` : ""}`);
  const lifestyle = [];
  if (profile.smoking !== "Never") lifestyle.push(`smoking: ${profile.smoking.toLowerCase()}${profile.smoking === "Currently" && profile.smokingPerDay ? ` (${profile.smokingPerDay} a day)` : ""}`);
  if (profile.alcohol !== "Never") lifestyle.push(`alcohol: ${profile.alcohol.toLowerCase()}`);
  if (profile.chewsTobacco) lifestyle.push("chews tobacco");
  lifestyle.push(`activity: ${profile.activity.toLowerCase()}`, `diet: ${profile.diet.toLowerCase()}`, `sleep: ${profile.sleep.toLowerCase()}`);
  lines.push(`Lifestyle: ${lifestyle.join(", ")}`);
  const value = bmi(profile.heightCm, profile.weight);
  if (profile.heightCm) lines.push(`Height ${profile.heightCm} cm${value ? `, BMI ${value} (${bmiBand(value).toLowerCase()})` : ""}`);
  if (profile.bloodGroup && profile.bloodGroup !== "Not sure") lines.push(`Blood group: ${profile.bloodGroup}`);
  if (profile.gender === "Female" && profile.pregnant !== "No") lines.push(`Pregnancy: ${profile.pregnant.toLowerCase()}`);
  return lines;
}

export function symptomLines(profile) {
  const lines = [...profile.symptoms];
  if (profile.reason.trim()) lines.push(`Reason for joining: ${profile.reason.trim()}`);
  return lines;
}

export function noteText(profile) {
  const parts = [`Preferred consult mode: ${profile.preferredMode}`, `Language: ${profile.language}`];
  if (profile.emergencyName.trim() || profile.emergencyPhone.trim()) {
    parts.push(`Emergency contact: ${[profile.emergencyName.trim(), profile.emergencyRelation.trim(), profile.emergencyPhone.trim()].filter(Boolean).join(", ")}`);
  }
  return parts.join(". ");
}

// Risk is only a first sorting hint for the doctor's list; the doctor sets the real level.
export function riskHint(profile) {
  if (Number(profile.hba1c) >= 9) return "High";
  return profile.conditions.some((item) => CHRONIC_CONDITIONS.includes(item)) ? "Medium" : "Low";
}

// Everything the doctor's patient record needs from a finished profile. Vitals and units are left to the caller's formatter.
export function profileToRecordFields(profile) {
  const conditions = [...profile.conditions];
  if (profile.otherCondition.trim()) conditions.push(profile.otherCondition.trim());
  return {
    conditions,
    history: historyLines(profile),
    symptoms: symptomLines(profile),
    medicines: medicineLines(profile),
    notes: noteText(profile),
    risk: riskHint(profile),
    vitals: {
      fasting: withUnit(profile.fasting, "mg/dL"),
      postMeal: withUnit(profile.postMeal, "mg/dL"),
      bp: profile.bp.trim(),
      weight: withUnit(profile.weight, "kg"),
      hba1c: profile.hba1c && `${profile.hba1c}`.trim() ? `${`${profile.hba1c}`.trim().replace(/\s*%$/, "")}%` : "",
      thyroid: ""
    }
  };
}

// The stored copy: the whole profile minus the consent tick and empty rows.
export function profileForStorage(profile) {
  return {
    ...profile,
    whatsapp: profile.sameWhatsapp ? profile.phone : profile.whatsapp,
    medicines: profile.medicines.filter((item) => item.name.trim()),
    surgeries: clean(profile.surgeries),
    consentedAt: new Date().toISOString()
  };
}
