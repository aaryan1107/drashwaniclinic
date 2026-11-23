// Patient medical profile: option lists, empty state, and the mapping into the patient record the doctor sees.
// Pure functions only, so they can be tested without React. Condition and symptom wording follows the
// primary-care lists in docs/seed (development lists, pending review by Dr Ashwani).

export const CONDITION_GROUPS = [
  { id: "metabolic", label: "Sugar and metabolism", items: ["Type 2 diabetes", "Type 1 diabetes", "Prediabetes", "Gestational diabetes", "Obesity", "High cholesterol", "Fatty liver", "High uric acid or gout", "Low vitamin D or B12"] },
  { id: "thyroid", label: "Thyroid", items: ["Underactive thyroid", "Overactive thyroid", "Goitre"] },
  { id: "heart", label: "Heart and blood pressure", items: ["High BP", "Heart disease", "Past heart attack or stent", "Past stroke"] },
  { id: "organs", label: "Kidney and liver", items: ["Kidney disease", "Kidney stones", "Liver disease"] },
  { id: "chest", label: "Lungs", items: ["Asthma", "COPD"] },
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
export const HOME_DEVICES = ["No meter", "Glucose meter", "Sensor (CGM)"];
export const HYPO_FREQUENCY = ["Never", "Once or twice a year", "Every month", "Every week or more"];
export const HYPO_AWARENESS = ["I feel it coming", "Sometimes I do not", "I usually do not feel it"];
export const HOSPITAL_STAYS = ["None", "Once", "More than once"];
export const LAST_CHECK = ["Within 1 year", "1 to 2 years ago", "More than 2 years ago", "Never"];
export const MOOD_ANSWERS = ["Not at all", "Several days", "More than half the days", "Nearly every day"];
export const MOOD_QUESTIONS = [
  ["interest", "Little interest or pleasure in doing things"],
  ["down", "Feeling down, low or hopeless"],
  ["nervous", "Feeling nervous, anxious or on edge"],
  ["worry", "Not being able to stop or control worrying"]
];
export const SLEEP_SIGNS = ["Loud snoring", "Sleepy in the daytime", "Someone saw me stop breathing in sleep"];
export const SEXUAL_HEALTH = ["No concern", "Yes, I have a concern", "I would rather talk in person"];
export const PREGNANCY_PLANS = ["No", "Yes", "Not sure"];
export const MISSED_DOSES = ["Never", "Sometimes", "Often"];
export const COST_SKIPPING = ["No", "Sometimes", "Yes"];
export const VACCINES = ["Flu (this year)", "Pneumonia", "Hepatitis B", "Tetanus (last 10 years)", "COVID-19"];
export const PAST_INFECTIONS = ["Tuberculosis (TB)", "Hepatitis B", "Hepatitis C", "HIV"];
export const SUPPORT = ["I manage on my own", "Family helps me", "A caregiver helps me"];

export const SYMPTOMS_NOW = [
  "Excess thirst", "Passing urine often", "Tiredness", "Blurred vision", "Tingling in feet", "Weight change",
  "Dizziness", "Chest discomfort", "Breathlessness", "Swelling in feet", "Poor sleep", "Low mood or worry",
  "Slow healing wounds", "Hunger and sweating spells"
];

export const COMMON_DRUG_ALLERGIES = ["Penicillin", "Sulfa drugs", "Aspirin or pain killers", "Other antibiotics"];
export const FAMILY_HISTORY = ["Diabetes", "High BP", "Heart disease", "Heart attack when young (men under 55, women under 65)", "Stroke", "Thyroid", "Kidney disease", "Cancer", "Mental health"];
export const BLOOD_GROUPS = ["Not sure", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const SMOKING = ["Never", "Used to", "Currently"];
export const ALCOHOL = ["Never", "Occasionally", "Regularly"];
export const ACTIVITY = ["Mostly sitting", "Light walking", "Regular exercise"];
export const DIET = ["Vegetarian", "Eggs but no meat", "Non-vegetarian"];
export const SLEEP = ["Under 5 hours", "5 to 6 hours", "7 to 8 hours", "More than 8 hours"];
export const LANGUAGES = ["English", "Hindi", "Both"];
export const CONSULT_MODES = ["Clinic visit", "WhatsApp consultation", "Online consultation"];

export const emptyMedicine = () => ({ name: "", dose: "" });

export const emptyProfile = (identity) => ({
  fullName: identity?.name || "",
  phone: "",
  whatsapp: "",
  sameWhatsapp: true,
  age: "",
  gender: "",
  bloodGroup: "",
  heightCm: "",
  weight: "",
  pregnant: "",
  planningPregnancy: "",
  abha: "",
  language: "",
  conditions: [],
  otherCondition: "",
  diabetes: {
    duration: "", treatment: "", homeChecks: "", device: "", complications: [],
    hypoFrequency: "", hypoAwareness: "", hospitalStays: "", lastEye: "", lastFoot: "", lastDental: ""
  },
  fasting: "",
  postMeal: "",
  hba1c: "",
  bp: "",
  symptoms: [],
  reason: "",
  mood: { interest: "", down: "", nervous: "", worry: "" },
  sleepSigns: [],
  sexualHealth: "",
  medicines: [emptyMedicine()],
  supplements: "",
  missedDoses: "",
  costSkipping: "",
  sideEffects: "",
  vaccines: [],
  pastInfections: [],
  drugAllergies: [],
  otherAllergy: "",
  allergyReaction: "",
  surgeries: [],
  familyHistory: [],
  familyNote: "",
  smoking: "",
  smokingPerDay: "",
  alcohol: "",
  chewsTobacco: false,
  activity: "",
  diet: "",
  sleep: "",
  support: "",
  emergencyName: "",
  emergencyRelation: "",
  emergencyPhone: "",
  preferredMode: "",
  consent: false
});

export const digits = (value) => `${value || ""}`.replace(/\D/g, "");

export function normalizePatientWhatsapp(value) {
  const number = digits(value);
  const national = number.length === 12 && number.startsWith("91") ? number.slice(2) : number;
  return /^[6-9][0-9]{9}$/.test(national) ? `+91${national}` : "";
}

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
    if (!normalizePatientWhatsapp(profile.sameWhatsapp ? profile.phone : profile.whatsapp)) problems.push("Enter a valid Indian WhatsApp number.");
  }
  if (step === 3) {
    if (profile.emergencyPhone.trim() && digits(profile.emergencyPhone).length < 10) problems.push("Enter a 10 digit emergency contact number.");
    if (!profile.consent) problems.push("Tick the consent box to continue.");
  }
  return problems;
}

// Two-item screens in the usual scoring: each answer is worth 0 to 3, and 3 or more on a pair needs a doctor's review.
const moodPoints = (answer) => Math.max(MOOD_ANSWERS.indexOf(answer), 0);
export function moodScores(mood) {
  const pair = (a, b) => ({ score: moodPoints(mood[a]) + moodPoints(mood[b]), answered: Boolean(mood[a] && mood[b]) });
  const low = pair("interest", "down");
  const worry = pair("nervous", "worry");
  return { low: low.score, worry: worry.score, lowFlag: low.answered && low.score >= 3, worryFlag: worry.answered && worry.score >= 3, any: low.answered || worry.answered };
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
    if (diabetes.device) parts.push(`home device: ${diabetes.device.toLowerCase()}`);
    if (parts.length) lines.push(`Diabetes: ${parts.join(", ")}`);
    if (diabetes.complications.length) lines.push(`Diabetes complications: ${diabetes.complications.join(", ")}`);
    if (diabetes.hypoFrequency) lines.push(`Low sugar episodes: ${diabetes.hypoFrequency.toLowerCase()}${diabetes.hypoFrequency !== "Never" && diabetes.hypoAwareness ? `; ${diabetes.hypoAwareness.toLowerCase()}` : ""}`);
    if (diabetes.hospitalStays && diabetes.hospitalStays !== "None") lines.push(`Hospital stays because of diabetes: ${diabetes.hospitalStays.toLowerCase()}`);
    const checks = [["eye", diabetes.lastEye], ["foot", diabetes.lastFoot], ["dental", diabetes.lastDental]].filter(([, value]) => value);
    if (checks.length) lines.push(`Last checks: ${checks.map(([name, value]) => `${name} ${value.toLowerCase()}`).join(", ")}`);
  }
  if (profile.otherCondition.trim()) lines.push(`Other condition: ${profile.otherCondition.trim()}`);
  const allergies = clean([...profile.drugAllergies, profile.otherAllergy]);
  if (allergies.length) lines.push(`Allergies: ${allergies.join(", ")}${profile.allergyReaction.trim() ? ` (reaction: ${profile.allergyReaction.trim()})` : ""}`);
  const adherence = [];
  if (profile.missedDoses && profile.missedDoses !== "Never") adherence.push(`misses doses ${profile.missedDoses.toLowerCase()}`);
  if (profile.costSkipping && profile.costSkipping !== "No") adherence.push(`skips medicine because of cost: ${profile.costSkipping.toLowerCase()}`);
  if (profile.sideEffects.trim()) adherence.push(`side effects: ${profile.sideEffects.trim()}`);
  if (adherence.length) lines.push(`Medicines: ${adherence.join("; ")}`);
  if (profile.vaccines.length) lines.push(`Vaccines had: ${profile.vaccines.join(", ")}`);
  if (profile.pastInfections.length) lines.push(`Past infections: ${profile.pastInfections.join(", ")}`);
  clean(profile.surgeries).forEach((item) => lines.push(`Past surgery or hospital stay: ${item}`));
  if (profile.familyHistory.length) lines.push(`Family history: ${profile.familyHistory.join(", ")}${profile.familyNote.trim() ? ` (${profile.familyNote.trim()})` : ""}`);
  const lifestyle = [];
  if (profile.smoking) lifestyle.push(`smoking: ${profile.smoking.toLowerCase()}${profile.smoking === "Currently" && profile.smokingPerDay ? ` (${profile.smokingPerDay} a day)` : ""}`);
  if (profile.alcohol) lifestyle.push(`alcohol: ${profile.alcohol.toLowerCase()}`);
  if (profile.chewsTobacco) lifestyle.push("chews tobacco");
  if (profile.activity) lifestyle.push(`activity: ${profile.activity.toLowerCase()}`);
  if (profile.diet) lifestyle.push(`diet: ${profile.diet.toLowerCase()}`);
  if (profile.sleep) lifestyle.push(`sleep: ${profile.sleep.toLowerCase()}`);
  if (lifestyle.length) lines.push(`Lifestyle: ${lifestyle.join(", ")}`);
  if (profile.sleepSigns.length) lines.push(`Sleep apnoea signs: ${profile.sleepSigns.join(", ")}`);
  const mood = moodScores(profile.mood);
  if (mood.any) {
    const parts = [
      profile.mood.interest && profile.mood.down && `low mood ${mood.low} of 6${mood.lowFlag ? " (at or above screening cut-off of 3)" : ""}`,
      profile.mood.nervous && profile.mood.worry && `worry ${mood.worry} of 6${mood.worryFlag ? " (at or above screening cut-off of 3)" : ""}`
    ].filter(Boolean);
    lines.push(`Mood screen: ${parts.join(", ")}${mood.lowFlag || mood.worryFlag ? ". Needs doctor review" : ""}`);
  }
  if (profile.sexualHealth && profile.sexualHealth !== "No concern") lines.push(`Sexual health: ${profile.sexualHealth.toLowerCase()}`);
  if (profile.support) lines.push(`Support at home: ${profile.support.toLowerCase()}`);
  const value = bmi(profile.heightCm, profile.weight);
  if (profile.heightCm) lines.push(`Height ${profile.heightCm} cm${value ? `, BMI ${value} (${bmiBand(value).toLowerCase()})` : ""}`);
  if (profile.bloodGroup && profile.bloodGroup !== "Not sure") lines.push(`Blood group: ${profile.bloodGroup}`);
  if (profile.gender === "Female" && profile.pregnant && profile.pregnant !== "No") lines.push(`Pregnancy: ${profile.pregnant.toLowerCase()}`);
  if (profile.gender === "Female" && profile.planningPregnancy && profile.planningPregnancy !== "No") lines.push(`Planning pregnancy: ${profile.planningPregnancy.toLowerCase()}`);
  return lines;
}

export function symptomLines(profile) {
  const lines = [...profile.symptoms];
  if (profile.reason.trim()) lines.push(`Reason for joining: ${profile.reason.trim()}`);
  return lines;
}

export function noteText(profile) {
  const parts = [];
  if (profile.preferredMode) parts.push(`Preferred consult mode: ${profile.preferredMode}`);
  if (profile.language) parts.push(`Language: ${profile.language}`);
  if (profile.emergencyName.trim() || profile.emergencyPhone.trim()) {
    parts.push(`Emergency contact: ${[profile.emergencyName.trim(), profile.emergencyRelation.trim(), profile.emergencyPhone.trim()].filter(Boolean).join(", ")}`);
  }
  return parts.join(". ");
}

// Risk is only a first sorting hint for the doctor's list; the doctor sets the real level.
export function riskHint(profile) {
  if (Number(profile.hba1c) >= 9) return "High";
  if (hasDiabetes(profile) && profile.diabetes.hypoFrequency === "Every week or more") return "High";
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
    whatsapp: normalizePatientWhatsapp(profile.sameWhatsapp ? profile.phone : profile.whatsapp),
    medicines: profile.medicines.filter((item) => item.name.trim()),
    surgeries: clean(profile.surgeries),
    consentedAt: new Date().toISOString()
  };
}
