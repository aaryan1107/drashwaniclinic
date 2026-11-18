// Best-effort Supabase sync for the visit workspace. Every call is optional: when the doctor is
// offline, signed out, or RLS refuses, the call returns null and the on-device copy carries on.
import { supabase } from "./supabase.js";
import { cloudToVisit, isUuid, mergeTemplates, mergeUsage, usageRows, visitToCloud } from "./visitSync.js";

const quiet = (error) => { if (error && !["42P01", "PGRST205", "PGRST202", "42501"].includes(error.code)) console.warn("Visit sync:", error.message); };
async function signedIn() {
  try { const { data } = await supabase.auth.getSession(); return Boolean(data?.session?.user); } catch { return false; }
}

// Upsert the draft and replace its items. Returns the cloud visit id, or null.
export async function pushDraft(visit, clinicId) {
  if (!navigator.onLine || !(await signedIn())) return null;
  try {
    const { row, items } = visitToCloud(visit, clinicId);
    let id = visit.cloud_id;
    if (id) {
      const { data, error } = await supabase.from("visits").update(row).eq("id", id).eq("status", "draft").select("id");
      if (error) { quiet(error); return null; }
      if (!data?.length) {
        // Not an editable draft any more. If it was sent, stop: a late autosave must never reopen it as a new draft.
        const found = await supabase.from("visits").select("id").eq("id", id).maybeSingle();
        if (found.error || found.data) { quiet(found.error); return null; }
        id = null;                           // removed elsewhere: start a fresh draft
      }
    }
    if (!id) {
      const { data, error } = await supabase.from("visits").insert({ ...row, status: "draft" }).select("id").single();
      if (error) { quiet(error); return null; }
      id = data.id;
    }
    const del = await supabase.from("visit_items").delete().eq("visit_id", id);
    if (del.error) { quiet(del.error); return id; }
    if (items.length) { const ins = await supabase.from("visit_items").insert(items.map((i) => ({ ...i, visit_id: id }))); quiet(ins.error); }
    return id;
  } catch { return null; }
}

export async function pullDraft(patientId) {
  if (!navigator.onLine || !(await signedIn())) return null;
  try {
    const { data, error } = await supabase.from("visits").select("*").eq("patient_id", String(patientId)).eq("status", "draft")
      .order("updated_at", { ascending: false }).limit(1);
    if (error) { quiet(error); return null; }
    if (!data?.length) return null;
    const items = await supabase.from("visit_items").select("*").eq("visit_id", data[0].id);
    if (items.error) { quiet(items.error); return null; }
    return cloudToVisit(data[0], items.data || []);
  } catch { return null; }
}

// Called after the prescription row is safely stored: push the final draft, then lock it as sent.
export async function markSent(visit, clinicId) {
  const id = await pushDraft(visit, clinicId);
  if (!id) return null;
  try { const { error } = await supabase.from("visits").update({ status: "sent" }).eq("id", id); quiet(error); return error ? null : id; } catch { return null; }
}

export async function pullUsage(local) {
  if (!navigator.onLine || !(await signedIn())) return null;
  try {
    const { data, error } = await supabase.from("doctor_term_usage").select("term_id,use_count,last_used_at").order("use_count", { ascending: false }).limit(2000);
    if (error) { quiet(error); return null; }
    return mergeUsage(local, data || []);
  } catch { return null; }
}
export async function pushUsage(usage, termIds) {
  const rows = usageRows(usage, termIds);
  if (!rows.length || !navigator.onLine || !(await signedIn())) return;
  try { const { error } = await supabase.from("doctor_term_usage").upsert(rows, { onConflict: "doctor_id,term_id" }); quiet(error); } catch { /* offline */ }
}

// Pull cloud templates, upload local-only ones, return the merged list (with cloud ids where known).
export async function syncTemplates(local) {
  if (!navigator.onLine || !(await signedIn())) return null;
  try {
    const { data, error } = await supabase.from("rx_templates").select("id,name,items").order("name");
    if (error) { quiet(error); return null; }
    const merged = mergeTemplates(local, data || []);
    for (const t of merged.filter((x) => !isUuid(x.id))) {
      const ins = await supabase.from("rx_templates").insert({ name: t.name, items: t.items }).select("id").single();
      if (ins.error) { quiet(ins.error); continue; }
      t.id = ins.data.id;
    }
    return merged;
  } catch { return null; }
}
export async function deleteCloudTemplate(id, name) {
  if (!navigator.onLine || !(await signedIn())) return;
  try {
    const q = supabase.from("rx_templates").delete();
    const { error } = isUuid(id) ? await q.eq("id", id) : await q.eq("name", name);
    quiet(error);
  } catch { /* offline */ }
}

// Save (or overwrite by name) one template in the cloud. Returns its cloud id, or null.
export async function saveCloudTemplate(name, items) {
  if (!navigator.onLine || !(await signedIn())) return null;
  try {
    const { data, error } = await supabase.from("rx_templates").select("id,name");
    if (error) { quiet(error); return null; }
    const same = (data || []).filter((r) => r.name.toLowerCase() === name.toLowerCase()).map((r) => r.id);
    if (same.length) { const del = await supabase.from("rx_templates").delete().in("id", same); if (del.error) { quiet(del.error); return null; } }
    const ins = await supabase.from("rx_templates").insert({ name, items }).select("id").single();
    if (ins.error) { quiet(ins.error); return null; }
    return ins.data.id;
  } catch { return null; }
}
