import { directions, indiaDate, isValidDate, validateMedicine, weekdays } from "./carePlan.js";

// Pure helpers for prescriptions. No JSX, no Supabase: these run under Node for tests.

export const MAX_MEDICINES = 20;
export const MAX_DIAGNOSIS = 1000;
export const MAX_INSTRUCTIONS = 2000;
const CARE_PLAN_NOTES_MAX = 1000;

// Returns an error message, or "" when the prescription can be issued.
export function validatePrescription(rx, today = indiaDate()) {
  const diagnosis = typeof rx.diagnosis === "string" ? rx.diagnosis.trim() : "";
  if (!diagnosis) return "Enter the diagnosis.";
  if (diagnosis.length > MAX_DIAGNOSIS) return `Keep the diagnosis under ${MAX_DIAGNOSIS} characters.`;
  if (!Array.isArray(rx.medicines) || rx.medicines.length < 1) return "Add at least one medicine.";
  if (rx.medicines.length > MAX_MEDICINES) return `A prescription can contain up to ${MAX_MEDICINES} medicines.`;
  if ((rx.instructions || "").length > MAX_INSTRUCTIONS) return `Keep the instructions under ${MAX_INSTRUCTIONS} characters.`;
  if (rx.follow_up_date) {
    if (!isValidDate(rx.follow_up_date)) return "Choose a valid follow-up date.";
    if (rx.follow_up_date < today) return "The follow-up date cannot be in the past.";
  }
  for (const [index, medicine] of rx.medicines.entries()) {
    const error = validateMedicine(medicine, index);
    if (error) return error;
  }
  return "";
}

// "RX-20261117-3F9A2C": India-date of issue plus the first six characters of the row id.
export function rxNumber(rx) {
  const created = rx.created_at ? new Date(rx.created_at) : new Date();
  const day = indiaDate(created).replaceAll("-", "");
  const short = String(rx.id || "").replaceAll("-", "").slice(0, 6).toUpperCase() || "DRAFT0";
  return `RX-${day}-${short}`;
}

// Human-readable schedule for one medicine, for the PDF and the history lists.
export function scheduleText(m) {
  if (m.frequency === "instructions") return "As directed";
  const times = (m.times || []).join(", ");
  const days = m.frequency === "weekly" ? `${(m.days || []).map((d) => weekdays[d]).join(", ")} - ` : "Daily - ";
  return `${days}${times}`;
}

export function formatMedicineLine(m) {
  return { name: m.name, directions: directions(m), schedule: scheduleText(m), duration: m.frequency === "instructions" ? "" : `${m.start} to ${m.end}`, notes: m.notes || "" };
}

// The care plan has the same medicine shape, so publishing is a straight copy.
export function toCarePlan(rx) {
  return {
    medicines: JSON.parse(JSON.stringify(rx.medicines)),
    follow_up_date: rx.follow_up_date || null,
    follow_up_notes: (rx.instructions || "").slice(0, CARE_PLAN_NOTES_MAX)
  };
}

// Insert payload for public.prescriptions. Patient details are snapshotted on purpose.
export function buildPrescriptionRow({ patient, form, clinic, doctorName }) {
  const age = Number.parseInt(patient.age, 10);
  return {
    patient_id: patient.id,
    patient_name: String(patient.name || "Patient").trim(),
    patient_age: Number.isFinite(age) && age > 0 ? age : null,
    patient_gender: patient.gender && patient.gender !== "Patient" ? patient.gender : "",
    diagnosis: form.diagnosis.trim(),
    medicines: form.medicines,
    instructions: (form.instructions || "").trim(),
    follow_up_date: form.follow_up_date || null,
    clinic_id: clinic?.id || "",
    doctor_name: doctorName || ""
  };
}

export const catalogLabel = (entry) => [entry.name, entry.strength, entry.form].filter(Boolean).join(" ");

// Name-prefix matches first, then substring matches. Inactive entries are hidden unless
// the catalog manager asks for them (includeInactive) so they can be reactivated.
export function searchCatalog(entries, query, limit = 8, { includeInactive = false } = {}) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const entry of entries) {
    if (entry.active === false && !includeInactive) continue;
    const label = catalogLabel(entry).toLowerCase();
    if (label.startsWith(q)) starts.push(entry);
    else if (label.includes(q)) contains.push(entry);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
