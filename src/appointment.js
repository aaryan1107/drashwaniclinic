// Pure helpers for the doctor-side appointment sheet.
export const DURATIONS = [5, 10, 15, 20, 30, 45];
export const DEFAULT_TAGS = ["New patient", "Follow-up", "Diabetes review", "Report review", "BP check", "Urgent"];

export const blankAppointment = (today) => ({ visit_type: "in_clinic", slot_type: "fixed", duration_min: 15, date: today, time: "", tags: [], reason: "" });

export function validateAppointment(a, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || "")) return "Choose a date.";
  if (a.date < today) return "The date cannot be in the past.";
  if (a.slot_type === "fixed" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(a.time || "")) return "Choose a time for a fixed slot.";
  if (!DURATIONS.includes(Number(a.duration_min))) return "Choose a duration.";
  if ((a.tags || []).length > 8) return "Use up to 8 tags.";
  return "";
}

// Row for public.appointment_requests. Columns added by 20261118100000 (visit_type, slot_type, ...)
// are included; legacy columns (mode, reason, status) stay filled so existing screens keep working.
export function buildAppointmentRow(a, { patient, clinic, status }) {
  const tele = a.visit_type === "tele";
  const summary = [tele ? "Tele consultation" : "In clinic", a.slot_type === "flexible" ? "flexible slot" : "fixed slot", `${a.duration_min} min`, ...(a.tags || [])].join(" · ");
  return {
    patient_id: patient.ownerId || null,
    patient_record_id: patient.id,
    patient_name: patient.name,
    patient_phone: patient.mobile || null,
    clinic_id: clinic?.id || "",
    clinic_name: clinic?.name || "",
    mode: tele ? "Online consultation" : "Clinic visit",
    appointment_date: a.date,
    appointment_time: a.slot_type === "flexible" ? "Flexible" : a.time,
    reason: [summary, (a.reason || "").trim()].filter(Boolean).join(" — ").slice(0, 500),
    payment_status: "NOT_REQUIRED",
    status,
    visit_type: a.visit_type,
    slot_type: a.slot_type,
    duration_min: Number(a.duration_min),
    tags: a.tags || []
  };
}
