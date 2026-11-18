// Pure helpers for syncing visit drafts, term usage and Rx templates with Supabase.
// No network here, so they can be unit-tested. The device copy is always the working copy.

const KINDS = new Set(["symptom", "diagnosis", "finding", "lab", "medicine"]);
const isCustom = (id) => typeof id === "string" && id.startsWith("custom:");
export const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));
const clip = (s, n) => String(s || "").slice(0, n);

// visits row (without id/doctor_id/status) plus visit_items rows for one draft.
export function visitToCloud(visit, clinicId = "") {
  const row = {
    patient_id: String(visit.patient_id),
    clinic_id: clip(clinicId, 60),
    vitals: visit.vitals || {},
    history: visit.history || {},
    notes_public: clip(visit.notes_public, 4000),
    notes_private: clip(visit.notes_private, 4000),
    follow_up: visit.follow_up || {},
    visit_date: visit.visit_date || undefined,
    updated_at: new Date(visit.saved_at || Date.now()).toISOString()
  };
  const items = (visit.items || []).filter((i) => KINDS.has(i.kind)).map((i, position) => {
    const local = !i.term_id || isCustom(i.term_id);
    const free_text = clip(local ? (i.free_text || i.display || "") : "", 300);
    // Display and type ride along in details so the draft reopens on another device without the index.
    return { kind: i.kind, term_id: local ? null : i.term_id, free_text, position,
      details: { ...(i.details || {}), _display: i.display || i.free_text || "", _type: i.type || "", _local_id: isCustom(i.term_id) ? i.term_id : undefined } };
  }).filter((i) => i.term_id || i.free_text.trim());
  return { row, items };
}

export function cloudToVisit(row, items = []) {
  const sorted = [...items].sort((a, b) => (a.position || 0) - (b.position || 0));
  return {
    patient_id: String(row.patient_id),
    visit_date: row.visit_date,
    vitals: row.vitals || {},
    history: row.history || {},
    notes_public: row.notes_public || "",
    notes_private: row.notes_private || "",
    follow_up: row.follow_up || {},
    cloud_id: row.id,
    saved_at: Date.parse(row.updated_at) || 0,
    items: sorted.map((i) => {
      const { _display, _type, _local_id, ...details } = i.details || {};
      const display = _display || i.free_text || i.term_id || "";
      return { kind: i.kind, term_id: i.term_id || _local_id || null, free_text: i.term_id ? "" : i.free_text, display, type: _type || "", details };
    })
  };
}

// Whichever draft was saved last wins; the local copy keeps the cloud id either way.
export function pickNewerDraft(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const l = Number(local.saved_at) || 0;
  const r = Number(remote.saved_at) || 0;
  return r > l ? { ...remote } : { ...local, cloud_id: local.cloud_id || remote.cloud_id };
}

// Usage map: termId -> { count, last }. Merge keeps the larger count and the latest use.
export function mergeUsage(local, rows = []) {
  const next = new Map(local);
  for (const r of rows) {
    const cur = next.get(r.term_id) || { count: 0, last: 0 };
    next.set(r.term_id, { count: Math.max(cur.count, r.use_count || 0), last: Math.max(cur.last, Date.parse(r.last_used_at) || 0) });
  }
  return next;
}
export const usageRows = (usage, termIds) => termIds.filter((id) => id && !isCustom(id) && usage.has(id)).map((id) => ({
  term_id: id, use_count: usage.get(id).count, last_used_at: new Date(usage.get(id).last || Date.now()).toISOString()
}));

// Templates: cloud rows (uuid ids) replace local ones of the same name; local-only ones are kept to upload.
export function mergeTemplates(local = [], rows = []) {
  const byName = new Map(local.map((t) => [t.name.toLowerCase(), t]));
  for (const r of rows) byName.set(r.name.toLowerCase(), { id: r.id, name: r.name, items: Array.isArray(r.items) ? r.items : [] });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
