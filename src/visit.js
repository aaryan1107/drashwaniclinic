// Pure helpers for the visit workspace: vitals, calculators, section completion, draft shape.

export const SECTIONS = [
  { id: "vitals", label: "Vitals" },
  { id: "history", label: "Medical history" },
  { id: "dx", label: "Symptoms & diagnosis" },
  { id: "exam", label: "Examination findings" },
  { id: "labs", label: "Lab tests" },
  { id: "notes", label: "Notes" },
  { id: "rx", label: "Prescribe" },
  { id: "followup", label: "Follow-up" }
];

export const blankVisit = (patientId, today) => ({
  patient_id: patientId,
  visit_date: today,
  status: "draft",
  vitals: {},          // { bp_sys, bp_dia, height, weight, pulse, temp, spo2, units:{height,weight,temp}, locked:{key:true} }
  history: {},         // { patient_history:[items], ... }
  items: [],           // { kind, term_id, free_text, details }
  notes_public: "",
  notes_private: "",
  follow_up: {},
  rx: { medicines: [] }
});

const num = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const cmToM = (v, unit = "cm") => (unit === "in" ? v * 0.0254 : v / 100);
export const toKg = (v, unit = "kg") => (unit === "lb" ? v * 0.45359237 : v);
export const toCelsius = (v, unit = "F") => (unit === "F" ? ((v - 32) * 5) / 9 : v);
export const toFahrenheit = (v, unit = "F") => (unit === "F" ? v : (v * 9) / 5 + 32);

// Height unit "cm" | "in"; weight "kg" | "lb". Returns null when inputs are missing or implausible.
export function bmi(height, weight, { heightUnit = "cm", weightUnit = "kg" } = {}) {
  const h = num(height), w = num(weight);
  if (h == null || w == null || h <= 0 || w <= 0) return null;
  const m = cmToM(h, heightUnit);
  const kg = toKg(w, weightUnit);
  const v = kg / (m * m);
  if (!Number.isFinite(v) || v < 5 || v > 90) return null;
  return Math.round(v * 10) / 10;
}

export function bmiCategory(v) {
  if (v == null) return "";
  if (v < 18.5) return "Underweight";
  if (v < 23) return "Normal (Asian cut-off)";
  if (v < 25) return "Overweight risk (Asian cut-off)";
  if (v < 30) return "Overweight";
  return "Obese";
}

// CKD-EPI 2021 (race-free). Creatinine in mg/dL, age in years, sex "male" | "female".
export function egfr(creatinine, age, sex) {
  const scr = num(creatinine), a = num(age);
  if (scr == null || a == null || scr <= 0 || a < 18 || a > 120) return null;
  const female = String(sex).toLowerCase().startsWith("f");
  const k = female ? 0.7 : 0.9;
  const alpha = female ? -0.241 : -0.302;
  const v = 142 * Math.min(scr / k, 1) ** alpha * Math.max(scr / k, 1) ** -1.2 * 0.9938 ** a * (female ? 1.012 : 1);
  return Math.round(v);
}

// Weight-based dose: mg/kg/day split into N doses. Arithmetic only; the doctor decides the dose.
export function weightDose(weightKg, mgPerKgPerDay, dosesPerDay) {
  const w = num(weightKg), d = num(mgPerKgPerDay), n = num(dosesPerDay);
  if (w == null || d == null || n == null || w <= 0 || d <= 0 || n < 1) return null;
  const daily = w * d;
  return { daily: Math.round(daily * 10) / 10, perDose: Math.round((daily / n) * 10) / 10 };
}

// Plain-language flags for display next to a value. Informational, never blocks saving.
export function vitalFlag(key, vitals) {
  const v = (k) => num(vitals[k]);
  if (key === "bp") {
    const s = v("bp_sys"), d = v("bp_dia");
    if (s == null || d == null) return "";
    if (s >= 180 || d >= 120) return "Very high";
    if (s >= 140 || d >= 90) return "High";
    if (s < 90 || d < 60) return "Low";
    return "";
  }
  if (key === "pulse") { const p = v("pulse"); return p == null ? "" : p > 100 ? "High" : p < 60 ? "Low" : ""; }
  if (key === "spo2") { const p = v("spo2"); return p == null ? "" : p < 94 ? "Low" : ""; }
  if (key === "temp") {
    const t = v("temp");
    if (t == null) return "";
    const f = toFahrenheit(t, (vitals.units?.temp || "F"));
    return f >= 100.4 ? "Fever" : f < 95 ? "Low" : "";
  }
  return "";
}

const FIELD_KEYS = ["bp_sys", "bp_dia", "height", "weight", "pulse", "temp", "spo2"];
export const vitalsFilled = (vitals = {}) => FIELD_KEYS.some((k) => vitals[k] !== "" && vitals[k] != null);

// Carry-forward: copy locked values from the previous visit's vitals into a new visit.
export function carryForward(prev = {}) {
  const out = { units: { ...(prev.units || {}) }, locked: {} };
  for (const k of Object.keys(prev.locked || {})) {
    if (prev.locked[k] && prev[k] != null && prev[k] !== "") { out[k] = prev[k]; out.locked[k] = true; }
  }
  return out;
}

export function sectionDone(id, visit) {
  const items = (kinds) => visit.items.some((i) => kinds.includes(i.kind));
  switch (id) {
    case "vitals": return vitalsFilled(visit.vitals);
    case "history": return Object.values(visit.history || {}).some((a) => Array.isArray(a) ? a.length > 0 : Boolean(a));
    case "dx": return items(["symptom", "diagnosis"]);
    case "exam": return items(["finding"]);
    case "labs": return items(["lab"]);
    case "notes": return Boolean((visit.notes_public || "").trim() || (visit.notes_private || "").trim());
    case "rx": return items(["medicine"]);
    case "followup": return Boolean(visit.follow_up?.date || visit.follow_up?.days);
    default: return false;
  }
}

export const completedCount = (visit) => SECTIONS.filter((s) => sectionDone(s.id, visit)).length;
