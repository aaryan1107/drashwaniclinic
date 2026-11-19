// On-device storage for visit drafts and the doctor's term usage. Works offline.
// visitCloud.js syncs drafts, usage and templates best-effort; this device copy is always the working copy.
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

const draftKey = (doctorId, patientId) => `clinic.visit.draft.${doctorId}.${patientId}`;
const usageKey = "clinic.term.usage";
const customKey = "clinic.term.custom";

export const loadDraft = (doctorId, patientId) => safe(() => JSON.parse(localStorage.getItem(draftKey(doctorId, patientId)) || "null"), null);
export const saveDraft = (doctorId, patientId, visit) => safe(() => { localStorage.setItem(draftKey(doctorId, patientId), JSON.stringify({ ...visit, saved_at: Date.now() })); return true; }, false);
export const clearDraft = (doctorId, patientId) => safe(() => localStorage.removeItem(draftKey(doctorId, patientId)), null);

export function loadUsage() {
  const raw = safe(() => JSON.parse(localStorage.getItem(usageKey) || "{}"), {});
  return new Map(Object.entries(raw));
}
export function bumpUsage(usage, termId) {
  const next = new Map(usage);
  const cur = next.get(termId) || { count: 0, last: 0 };
  next.set(termId, { count: cur.count + 1, last: Date.now() });
  safe(() => localStorage.setItem(usageKey, JSON.stringify(Object.fromEntries(next))), null);
  return next;
}

export const loadCustomTerms = () => safe(() => JSON.parse(localStorage.getItem(customKey) || "[]"), []);
export function addCustomTerm(type, display) {
  const list = loadCustomTerms();
  const id = `custom:${type}:${display.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
  if (!list.some((t) => t.id === id)) {
    list.push({ id, type, code_system: "LOCAL", code: "", display, synonyms: [], is_global: false, status: "pending_review" });
    safe(() => localStorage.setItem(customKey, JSON.stringify(list)), null);
  }
  return list.find((t) => t.id === id);
}

const lastKey = (doctorId, patientId) => `clinic.visit.lastvitals.${doctorId}.${patientId}`;
export const loadLastVitals = (doctorId, patientId) => safe(() => JSON.parse(localStorage.getItem(lastKey(doctorId, patientId)) || "null"), null);
export const saveLastVitals = (doctorId, patientId, vitals) => safe(() => localStorage.setItem(lastKey(doctorId, patientId), JSON.stringify(vitals)), null);

const tplKey = "clinic.rx.templates";
export const loadTemplates = () => safe(() => JSON.parse(localStorage.getItem(tplKey) || "[]"), []);
export function saveTemplate(name, items) {
  const list = loadTemplates().filter((t) => t.name.toLowerCase() !== name.toLowerCase());
  list.push({ id: `tpl:${Date.now()}`, name, items });
  safe(() => localStorage.setItem(tplKey, JSON.stringify(list)), null);
  return list;
}
export const replaceTemplates = (list) => { safe(() => localStorage.setItem(tplKey, JSON.stringify(list)), null); return list; };
export const replaceUsage = (usage) => { safe(() => localStorage.setItem(usageKey, JSON.stringify(Object.fromEntries(usage))), null); return usage; };
export function deleteTemplate(id) {
  const list = loadTemplates().filter((t) => t.id !== id);
  safe(() => localStorage.setItem(tplKey, JSON.stringify(list)), null);
  return list;
}

const fuKey = "clinic.followup.days";
export const loadFollowUpDays = () => safe(() => JSON.parse(localStorage.getItem(fuKey) || "null"), null);
export const saveFollowUpDays = (days) => safe(() => localStorage.setItem(fuKey, JSON.stringify(days)), null);
