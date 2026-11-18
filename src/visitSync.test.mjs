import assert from "node:assert/strict";
import { cloudToVisit, isUuid, mergeTemplates, mergeUsage, pickNewerDraft, usageRows, visitToCloud } from "./visitSync.js";

const visit = {
  patient_id: "fake-001", visit_date: "2026-11-18", saved_at: 1000,
  vitals: { pulse: "80" }, history: { drug_allergy: [{ display: "Penicillin" }] },
  notes_public: "Rest", notes_private: "Doctor only", follow_up: { days: 7 },
  items: [
    { kind: "diagnosis", term_id: "diagnosis:fever", display: "Fever", type: "diagnosis", details: {} },
    { kind: "medicine", term_id: "custom:medicine:brand-x", free_text: "Brand X", display: "Brand X", type: "medicine", details: { dose: "1 tab" } },
    { kind: "symptom", term_id: null, free_text: "", display: "", details: {} },
    { kind: "bogus", term_id: "x" }
  ]
};
const { row, items } = visitToCloud(visit, "clinic-1");
assert.equal(row.patient_id, "fake-001");
assert.equal(row.notes_private, "Doctor only");        // stays in the doctor-only visits row
assert.equal(items.length, 2);                          // empty and unknown kinds dropped
assert.equal(items[1].term_id, null);
assert.equal(items[1].free_text, "Brand X");
assert.equal(items[1].details.dose, "1 tab");

const back = cloudToVisit({ ...row, id: "11111111-1111-1111-1111-111111111111", updated_at: new Date(5000).toISOString() }, items.map((i, n) => ({ ...i, position: 1 - n })).reverse());
assert.equal(back.cloud_id, "11111111-1111-1111-1111-111111111111");
assert.deepEqual(back.items.map((i) => i.display), ["Brand X", "Fever"]);
assert.equal(back.items[0].term_id, "custom:medicine:brand-x");
assert.deepEqual(back.items[0].details, { dose: "1 tab" });
assert.equal(back.saved_at, 5000);

assert.equal(pickNewerDraft(visit, back).cloud_id, back.cloud_id);
assert.equal(pickNewerDraft({ ...visit, saved_at: 9999 }, back).notes_public, "Rest");
assert.equal(pickNewerDraft({ ...visit, saved_at: 9999 }, back).cloud_id, back.cloud_id);
assert.equal(pickNewerDraft(null, back), back);
assert.equal(pickNewerDraft(visit, null), visit);

const local = new Map([["a", { count: 5, last: 10 }], ["custom:x", { count: 1, last: 1 }]]);
const merged = mergeUsage(local, [{ term_id: "a", use_count: 3, last_used_at: new Date(50).toISOString() }, { term_id: "b", use_count: 2, last_used_at: new Date(5).toISOString() }]);
assert.deepEqual(merged.get("a"), { count: 5, last: 50 });
assert.equal(merged.get("b").count, 2);
assert.deepEqual(usageRows(merged, ["a", "custom:x", "zzz"]).map((r) => r.term_id), ["a"]);

const t = mergeTemplates([{ id: "tpl:1", name: "Fever", items: [1] }, { id: "tpl:2", name: "Cough", items: [] }], [{ id: "22222222-2222-2222-2222-222222222222", name: "fever", items: [2] }]);
assert.equal(t.length, 2);
assert.ok(isUuid(t.find((x) => x.name.toLowerCase() === "fever").id));
assert.ok(!isUuid("tpl:2"));
console.log("visit sync tests passed");
