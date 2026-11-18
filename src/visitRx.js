// Pure helpers for history, notes, follow-up and prescribing safety checks. No React, no network.
import { normalize } from "./termSearch.js";

export const HISTORY_CATEGORIES = [
  { id: "patient_history", label: "Patient history", hints: ["Diabetes", "Hypertension", "Thyroid disorder", "Asthma", "Heart disease", "Kidney disease", "Epilepsy", "Tuberculosis (treated)", "Jaundice (past)"] },
  { id: "family_history", label: "Family history", hints: ["Diabetes in family", "Hypertension in family", "Heart disease in family", "Cancer in family", "Thyroid disorder in family", "Stroke in family"] },
  { id: "lifestyle", label: "Lifestyle habit", hints: ["Smoker", "Tobacco chewer", "Alcohol occasionally", "Alcohol regularly", "Sedentary", "Vegetarian", "Non-vegetarian", "Poor sleep", "Regular exercise"] },
  { id: "allergy_other", label: "Food / other allergy", hints: ["Peanut allergy", "Dust allergy", "Seafood allergy", "Egg allergy", "Latex allergy", "Pollen allergy"] },
  { id: "drug_allergy", label: "Drug allergy", medicine: true, hints: ["Penicillin", "Sulfa drugs", "NSAIDs", "Cephalosporins", "Aspirin"] },
  { id: "past_procedure", label: "Past procedure", hints: ["Appendectomy", "Cesarean section", "Hernia repair", "Cataract surgery", "Angioplasty", "Cholecystectomy"] },
  { id: "current_medication", label: "Current medication", medicine: true, hints: [] },
  { id: "travel", label: "Travel history", hints: ["Recent travel within India", "Recent international travel", "Malaria-endemic area visit"] },
  { id: "other", label: "Other", hints: [] }
];

// Small history index entries so the shared search can suggest them. Types are namespaced per category.
export const historyTerms = () => HISTORY_CATEGORIES.flatMap((c) =>
  c.hints.map((h) => ({ id: `hx:${c.id}:${normalize(h).replace(/ /g, "-")}`, type: `hx_${c.id}`, code_system: "LOCAL", code: "", display: h, synonyms: [] })));

export const historyListText = (items = []) => items.map((i) => i.display).join(", ");

// ---------------------------------------------------------------- Notes: tiny markup (**bold**, _italic_, "- " bullets)
export function parseLite(text = "") {
  return String(text).split("\n").map((line) => {
    const bullet = /^\s*[-*•]\s+/.test(line);
    const body = bullet ? line.replace(/^\s*[-*•]\s+/, "") : line;
    const runs = [];
    const re = /\*\*(.+?)\*\*|_(.+?)_/g;
    let last = 0, m;
    while ((m = re.exec(body))) {
      if (m.index > last) runs.push({ text: body.slice(last, m.index) });
      runs.push(m[1] != null ? { text: m[1], b: true } : { text: m[2], i: true });
      last = m.index + m[0].length;
    }
    if (last < body.length) runs.push({ text: body.slice(last) });
    return { type: bullet ? "li" : "p", runs };
  });
}

// ---------------------------------------------------------------- Follow-up
export const DEFAULT_FOLLOWUP_DAYS = [3, 7, 15, 30];

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(+d) || !Number.isFinite(Number(days))) return "";
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

export const sanitizeDays = (list) => [...new Set((list || []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 365))].sort((a, b) => a - b).slice(0, 12);

// ---------------------------------------------------------------- Prescribing checks (decision support only)
const ALLERGY_CLASSES = [
  { match: ["penicillin", "beta lactam"], drugs: ["penicillin", "amoxicillin", "ampicillin", "cloxacillin", "flucloxacillin", "piperacillin", "benzathine", "phenoxymethyl"] },
  { match: ["cephalosporin"], drugs: ["cef", "cephalexin", "cephradine"] },
  { match: ["sulfa", "sulpha", "sulfonamide", "cotrimoxazole"], drugs: ["sulfa", "sulpha", "sulfamethoxazole", "cotrimoxazole", "trimethoprim", "sulfasalazine"] },
  { match: ["nsaid", "aspirin", "ibuprofen", "diclofenac"], drugs: ["aspirin", "acetylsalicylic", "ibuprofen", "diclofenac", "naproxen", "ketorolac", "piroxicam", "aceclofenac", "etoricoxib", "mefenamic", "indomethacin", "nimesulide"] }
];
const IGNORE = new Set(["allergy", "allergic", "reaction", "drug", "drugs", "to", "rash", "known"]);

// Returns [{allergy, reason}] for allergies that plausibly match this medicine name.
export function allergyMatches(medicineName, allergies = []) {
  const med = normalize(medicineName);
  const out = [];
  for (const a of allergies) {
    const text = normalize(a.display || a.free_text || "");
    if (!text) continue;
    const words = text.split(" ").filter((w) => w.length >= 4 && !IGNORE.has(w));
    const direct = words.some((w) => med.includes(w)) || med.split(" ").some((w) => w.length >= 5 && text.includes(w));
    const cls = ALLERGY_CLASSES.find((c) => c.match.some((m) => text.includes(m)) && c.drugs.some((d) => (d === "cef" ? med.split(" ").some((w) => w.startsWith("cef")) : med.includes(d))));
    if (direct) out.push({ allergy: a.display, reason: "name match" });
    else if (cls) out.push({ allergy: a.display, reason: "same drug class" });
  }
  return out;
}

const STOP = new Set(["tablet", "capsule", "injection", "syrup", "cream", "with", "acid", "sodium"]);
const ingredients = (name) => new Set(normalize(name).split(" ").filter((w) => w.length >= 5 && !STOP.has(w) && !/^\d/.test(w)));

export function duplicateWith(name, others = []) {
  const mine = ingredients(name);
  return others.filter((o) => { const theirs = ingredients(o.display || o.free_text || ""); return [...mine].some((w) => theirs.has(w)); }).map((o) => o.display);
}

// Warnings for every prescribed medicine. medicines: [{display, ...}], history: visit.history.
export function prescribingWarnings(medicines, history = {}) {
  const allergies = history.drug_allergy || [];
  const current = history.current_medication || [];
  return medicines.map((m, idx) => {
    const others = medicines.filter((_, j) => j !== idx);
    return {
      allergies: allergyMatches(m.display, allergies),
      duplicates: duplicateWith(m.display, others),
      alreadyTaking: duplicateWith(m.display, current)
    };
  });
}

// ---------------------------------------------------------------- Templates
export function applyTemplate(items, template) {
  const have = new Set(items.filter((i) => i.kind === "medicine").map((i) => i.term_id || `free:${i.free_text}`));
  const add = template.items.filter((t) => !have.has(t.term_id || `free:${t.free_text}`)).map((t) => ({ ...t, kind: "medicine", details: { ...(t.details || {}) } }));
  return [...items, ...add];
}

// ---------------------------------------------------------------- What may leave the doctor's device when "Send Rx" is tapped.
// Private notes are never included. Keep this the single place that builds the outgoing payload.
export function buildSendPayload(visit) {
  return {
    visit_date: visit.visit_date,
    vitals: visit.vitals,
    history: { ...visit.history },
    items: visit.items,
    notes_public: visit.notes_public || "",
    follow_up: visit.follow_up || {}
  };
}

// ---------------------------------------------------------------- Visit -> public.prescriptions row
// The row shape is the one src/prescription.js already validates, prints and publishes.
const TIMES = { OD: ["09:00"], BD: ["09:00", "21:00"], TDS: ["08:00", "14:00", "20:00"], QID: ["08:00", "12:00", "16:00", "20:00"], HS: ["21:00"] };
const ROUTE_MAP = { Oral: "Oral (swallow)", Topical: "Topical (skin)", Inhaled: "Inhaled", "Eye drops": "Eye", "Ear drops": "Ear", Injection: "Injection", Other: "Other" };

export function toRxMedicine(item, visitDate, index = 0) {
  const d = item.details || {};
  const code = String(d.frequency || "").split(" ")[0];
  const route = ROUTE_MAP[d.route || "Oral"] || "Oral (swallow)";
  const duration = Number(d.duration) || 0;
  const notes = [d.frequency, d.when, duration ? `${duration} days` : ""].filter(Boolean).join(" · ");
  const base = {
    id: `v${index + 1}`,
    name: String(item.display || item.free_text || "").slice(0, 180),
    dose: String(d.dose || "").trim() || "As directed",
    route,
    site: route === "Oral (swallow)" ? "" : (d.route || "As directed"),
    days: [],
    notes: notes.slice(0, 500)
  };
  if (TIMES[code] && duration > 0) {
    return { ...base, frequency: "daily", times: TIMES[code], start: visitDate, end: addDays(visitDate, duration - 1) };
  }
  return { ...base, frequency: "instructions", times: [], start: "", end: "", notes: base.notes || "As directed by the doctor" };
}

const plainLite = (text) => parseLite(text).map((l) => `${l.type === "li" ? "- " : ""}${l.runs.map((r) => r.text).join("")}`).join("\n").trim();

export function vitalsLine(v = {}) {
  const u = v.units || {};
  const parts = [];
  if (v.bp_sys && v.bp_dia) parts.push(`BP ${v.bp_sys}/${v.bp_dia} mmHg`);
  if (v.pulse) parts.push(`Pulse ${v.pulse}/min`);
  if (v.temp) parts.push(`Temp ${v.temp} °${u.temp || "F"}`);
  if (v.spo2) parts.push(`SpO2 ${v.spo2}%`);
  if (v.weight) parts.push(`Wt ${v.weight} ${u.weight || "kg"}`);
  if (v.height) parts.push(`Ht ${v.height} ${u.height || "cm"}`);
  return parts.join(", ");
}

// Builds the insert payload from buildSendPayload() only, so private notes can never leak into it.
export function visitToPrescriptionRow(visit, { patient, clinic, doctorName }) {
  const p = buildSendPayload(visit);
  const of = (k) => p.items.filter((i) => i.kind === k);
  const label = (i) => (i.code ? `${i.display} (${i.code})` : i.display);
  const dx = of("diagnosis").map(label);
  const sx = of("symptom").map((i) => i.display);
  const diagnosis = (dx.length ? dx.join(", ") + (sx.length ? `\nSymptoms: ${sx.join(", ")}` : "") : sx.length ? `Symptoms: ${sx.join(", ")}` : "").slice(0, 1000);
  const sections = [
    ["Vitals", vitalsLine(p.vitals)],
    ["Findings", of("finding").map((i) => i.display).join(", ")],
    ["Tests advised", of("lab").map((i) => i.display).join(", ")],
    ["Advice", plainLite(p.notes_public)],
    ["Follow-up note", (p.follow_up.note || "").trim()]
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  const age = Number.parseInt(patient.age, 10);
  return {
    patient_id: patient.id,
    patient_name: String(patient.name || "Patient").trim(),
    patient_age: Number.isFinite(age) && age > 0 ? age : null,
    patient_gender: patient.gender && patient.gender !== "Patient" ? patient.gender : "",
    diagnosis,
    medicines: of("medicine").map((m, i) => toRxMedicine(m, p.visit_date, i)),
    instructions: sections.join("\n").slice(0, 2000),
    follow_up_date: p.follow_up.date || null,
    clinic_id: clinic?.id || "",
    doctor_name: doctorName || ""
  };
}
