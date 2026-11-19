const indiaDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
});

export function indiaDate(date = new Date()) {
  const parts = Object.fromEntries(indiaDateFormat.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const routes = ["Oral (swallow)", "Topical (skin)", "Inside mouth", "Under tongue", "Eye", "Ear", "Nose", "Inhaled", "Injection", "Rectal", "Vaginal", "Other"];
export const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const directions = (m) => [m.dose, m.route, m.site].filter(Boolean).join(" · ");
export const emptyPlan = { medicines: [], follow_up_date: "", follow_up_notes: "" };
const dayMs = 86400000;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T00:00:00Z");
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date;
}

export function isValidDate(date) {
  return validDate(date);
}

// Returns an error message for one medicine, or "" when it is valid. Shared by the care plan
// and by prescriptions, which use the same medicine shape.
export function validateMedicine(m, index) {
  const prefix = `Medicine ${index + 1}`;
  if (!m || ![m.name, m.dose, m.route].every((v) => typeof v === "string" && v.trim())) {
    return `${prefix}: enter a name, dose and route.`;
  }
  if (m.route !== routes[0] && !m.site?.trim()) return `${prefix}: specify the application site or administration method.`;
  if (m.frequency === "instructions") {
    if (!m.notes?.trim()) return `${prefix}: enter the frequency and instructions.`;
    return "";
  }
  if (!["daily", "weekly"].includes(m.frequency)) return `${prefix}: choose a frequency.`;
  if (!validDate(m.start) || !validDate(m.end) || m.end < m.start) return `${prefix}: choose a valid start and end date.`;
  if (!Array.isArray(m.times) || !m.times.length || m.times.length > 8 ||
      !m.times.every((t) => TIME.test(t)) || new Set(m.times).size !== m.times.length) {
    return `${prefix}: enter distinct reminder times.`;
  }
  if (m.frequency === "weekly" && (!Array.isArray(m.days) || !m.days.length ||
      !m.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) return `${prefix}: choose at least one day.`;
  return "";
}

export function validatePlan(plan) {
  if (!Array.isArray(plan.medicines) || plan.medicines.length > 20) return "A care plan can contain up to 20 medicines.";
  if (plan.follow_up_date && !validDate(plan.follow_up_date)) return "Choose a valid follow-up date.";
  for (const [index, m] of plan.medicines.entries()) {
    const error = validateMedicine(m, index);
    if (error) return error;
  }
  return "";
}

export function upcomingReminders(plan, now = new Date()) {
  if (validatePlan(plan)) return [];
  const reminders = new Map();
  const today = Date.parse(indiaDate(now) + "T00:00:00Z");
  const add = (kind, at) => {
    if (+at > +now + 5000) reminders.set(`${kind}-${+at}`, { kind, at });
  };

  for (const m of plan.medicines) {
    if (m.frequency === "instructions") continue;
    for (let offset = 0; offset <= 2; offset++) {
      const day = new Date(today + offset * dayMs);
      const date = day.toISOString().slice(0, 10);
      if (date < m.start || date > m.end) continue;
      if (m.frequency === "weekly" && !m.days.includes(day.getUTCDay())) continue;
      for (const time of m.times) {
        const at = new Date(`${date}T${time}:00+05:30`);
        if (+at <= +now + 2 * dayMs) add("medicine", at);
      }
    }
  }
  if (plan.follow_up_date) {
    const due = Date.parse(plan.follow_up_date + "T09:00:00+05:30");
    add("follow-up", new Date(due - dayMs));
    add("follow-up", new Date(due));
  }
  const events = [...reminders.values()].sort((a, b) => a.at - b.at);
  return [...events.filter((e) => e.kind === "medicine").slice(0, 58), ...events.filter((e) => e.kind === "follow-up")];
}
