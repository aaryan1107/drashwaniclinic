import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bold, Italic, List, Trash2 } from "lucide-react";
import { TermSearch } from "./TermSearch.jsx";
import { HISTORY_CATEGORIES, addDays, applyTemplate, DEFAULT_FOLLOWUP_DAYS, parseLite, prescribingWarnings, sanitizeDays } from "./visitRx.js";
import { deleteTemplate, loadFollowUpDays, loadTemplates, replaceTemplates, saveFollowUpDays, saveTemplate } from "./visitStore.js";
import { deleteCloudTemplate, saveCloudTemplate, syncTemplates } from "./visitCloud.js";
import { Button } from "./ui/Button.jsx";
import { DURATION_CHIPS, DURATION_UNITS, FORMS, FREQUENCIES, TIMINGS, hindiInstruction, normalizeFrequency } from "./prescriptionFields.js";

const keyOf = (i) => i.term_id || `free:${(i.free_text || "").toLowerCase()}`;

// ---------------------------------------------------------------- Medical history
export function HistoryScreen({ visit, patch, index, usage, onUsed, onDone }) {
  const [cat, setCat] = useState(null);
  const history = visit.history || {};
  if (cat) {
    const c = HISTORY_CATEGORIES.find((x) => x.id === cat);
    const types = c.medicine ? ["medicine", `hx_${c.id}`] : [`hx_${c.id}`];
    return (
      <>
        <h3 className="vt-title">{c.label}</h3>
        <TermSearch key={cat} title={c.label} index={index} usage={usage} types={types} kind="history" freeType={types[0]}
          value={history[cat] || []}
          onSave={(pending) => { onUsed(pending); patch({ history: { ...history, [cat]: pending.map((i) => ({ ...i, kind: "history" })) } }); setCat(null); }}
          onBack={() => setCat(null)} />
      </>
    );
  }
  return (
    <>
      <h3 className="vt-title">Medical history</h3>
      <ul className="vt-sections">
        {HISTORY_CATEGORIES.map((c) => {
          const items = history[c.id] || [];
          return (
            <li key={c.id}>
              <button type="button" className="vt-section vt-section-simple" onClick={() => setCat(c.id)}>
                <span className="vt-section-text"><strong>{c.label}</strong><small>{items.length ? items.map((i) => i.display).join(", ") : "None recorded"}</small></span>
                <span className="vt-state">{items.length ? items.length : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="vt-note">Drug allergy and current medication are shown again on the Prescribe screen.</p>
      <div className="vt-footer"><Button onClick={onDone}>Done</Button></div>
    </>
  );
}

// ---------------------------------------------------------------- Notes
export function NotesScreen({ visit, patch, onDone }) {
  const [tab, setTab] = useState("public");
  const field = tab === "public" ? "notes_public" : "notes_private";
  const ref = useRef(null);
  const text = visit[field] || "";
  const set = (v) => patch({ [field]: v.slice(0, 4000) });

  function wrap(before, after = before) {
    const el = ref.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const sel = text.slice(a, b) || "text";
    set(`${text.slice(0, a)}${before}${sel}${after}${text.slice(b)}`);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + sel.length); });
  }
  function bullet() {
    const el = ref.current; if (!el) return;
    const a = el.selectionStart;
    const start = text.lastIndexOf("\n", a - 1) + 1;
    set(`${text.slice(0, start)}- ${text.slice(start)}`);
    requestAnimationFrame(() => el.focus());
  }

  return (
    <>
      <h3 className="vt-title">Notes</h3>
      <div className="vt-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "public"} className={tab === "public" ? "on" : ""} onClick={() => setTab("public")}>For patient (printed)</button>
        <button type="button" role="tab" aria-selected={tab === "private"} className={tab === "private" ? "on" : ""} onClick={() => setTab("private")}>Private (never printed)</button>
      </div>
      <p className="vt-note">{tab === "public" ? "Printed on the prescription and visible to the patient once you send it." : "Only you can see these. They are never printed, shared or sent to the patient."}</p>
      <div className="vt-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" aria-label="Bold" onClick={() => wrap("**")}><Bold size={18} /></button>
        <button type="button" aria-label="Italic" onClick={() => wrap("_")}><Italic size={18} /></button>
        <button type="button" aria-label="Bullet" onClick={bullet}><List size={18} /></button>
      </div>
      <label className="vt-sr" htmlFor="vt-notes">{tab === "public" ? "Notes for patient" : "Private notes"}</label>
      <textarea id="vt-notes" ref={ref} className="vt-textarea" rows={8} value={text} onChange={(e) => set(e.target.value)}
        placeholder={tab === "public" ? "Advice for the patient (diet, rest, warning signs)…" : "Your own notes for this patient…"} />
      {tab === "public" && text.trim() && (
        <div className="vt-preview" aria-label="Preview">
          {parseLite(text).map((l, i) => {
            const runs = l.runs.map((r, j) => (r.b ? <strong key={j}>{r.text}</strong> : r.i ? <em key={j}>{r.text}</em> : <span key={j}>{r.text}</span>));
            return l.type === "li" ? <div key={i} className="vt-li">• {runs}</div> : <div key={i}>{runs}</div>;
          })}
        </div>
      )}
      <div className="vt-footer"><Button onClick={onDone}>Done</Button></div>
    </>
  );
}

// ---------------------------------------------------------------- Follow-up
export function FollowUpScreen({ visit, patch, onDone }) {
  const [days, setDays] = useState(() => sanitizeDays(loadFollowUpDays()) .length ? sanitizeDays(loadFollowUpDays()) : DEFAULT_FOLLOWUP_DAYS);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const fu = visit.follow_up || {};
  const auto = fu.auto !== false;
  const set = (p) => patch({ follow_up: { ...fu, ...p } });
  const choose = (n) => set({ days: n, ...(auto ? { date: addDays(visit.visit_date, n) } : {}) });
  const saveDays = () => { const next = sanitizeDays(draft.split(/[ ,]+/)); if (next.length) { setDays(next); saveFollowUpDays(next); } setEditing(false); };

  return (
    <>
      <h3 className="vt-title">Follow-up</h3>
      <div className="vt-field">
        <label htmlFor="fu-days">Come back after</label>
        <select id="fu-days" value={fu.days || ""} onChange={(e) => (e.target.value ? choose(Number(e.target.value)) : set({ days: "", date: "" }))}>
          <option value="">No follow-up</option>
          {days.map((n) => <option key={n} value={n}>{n} days</option>)}
        </select>
      </div>
      <div className="vt-chips" aria-label="Quick follow-up">
        {days.map((n) => <button type="button" key={n} className={`vt-chip${fu.days === n ? " vt-chip-on" : ""}`} onClick={() => choose(n)}>{n} days</button>)}
        <button type="button" className="vt-chip" onClick={() => { setDraft(days.join(", ")); setEditing((e) => !e); }}>Edit options</button>
      </div>
      {editing && (
        <div className="vt-field">
          <label htmlFor="fu-edit">Quick options (days, comma separated)</label>
          <div className="vt-inputrow"><input id="fu-edit" value={draft} onChange={(e) => setDraft(e.target.value)} /><button type="button" className="secondary-button" onClick={saveDays}>Save</button></div>
        </div>
      )}
      <label className="vt-switch"><input type="checkbox" checked={auto} onChange={(e) => set({ auto: e.target.checked })} /> Set the date automatically from the visit date</label>
      <div className="vt-field">
        <label htmlFor="fu-date">Follow-up date</label>
        <input id="fu-date" type="date" min={visit.visit_date} value={fu.date || ""} onChange={(e) => set({ date: e.target.value })} />
      </div>
      <div className="vt-field">
        <label htmlFor="fu-note">Follow-up note</label>
        <textarea id="fu-note" className="vt-textarea" rows={3} maxLength={500} value={fu.note || ""} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Bring reports; come fasting" />
      </div>
      <div className="vt-footer"><Button onClick={onDone}>Done</Button></div>
    </>
  );
}

// ---------------------------------------------------------------- Prescribe
const ROUTE = ["Oral", "Topical", "Inhaled", "Eye drops", "Ear drops", "Injection", "Other"];

export function PrescribeScreen({ visit, patch, index, usage, onUsed, onOpenHistory, onDone }) {
  const [searching, setSearching] = useState(false);
  const [templates, setTemplates] = useState(loadTemplates);
  // Templates follow the doctor across devices; the local list works offline.
  useEffect(() => { let live = true; syncTemplates(loadTemplates()).then((list) => { if (live && list) setTemplates(replaceTemplates(list)); }); return () => { live = false; }; }, []);
  const [tplId, setTplId] = useState("");
  const [tplName, setTplName] = useState("");
  const [note, setNote] = useState("");
  const meds = visit.items.filter((i) => i.kind === "medicine");
  const others = visit.items.filter((i) => i.kind !== "medicine");
  const history = visit.history || {};
  const allergies = history.drug_allergy || [];
  const current = history.current_medication || [];
  const warnings = prescribingWarnings(meds, history);
  const setMeds = (next) => patch({ items: [...others, ...next] });
  const setDetail = (idx, d) => setMeds(meds.map((m, i) => (i === idx ? { ...m, details: { ...(m.details || {}), ...d } } : m)));

  if (searching) {
    return (
      <>
        <h3 className="vt-title">Add medicines</h3>
        <p className="vt-note">Generic names from India’s essential-medicines list. For a brand, add it as typed.</p>
        <TermSearch title="medicines" index={index} usage={usage} types={["medicine"]} kind="medicine" freeType="medicine" value={meds}
          onSave={(pending) => {
            onUsed(pending);
            const byKey = new Map(meds.map((m) => [keyOf(m), m]));
            setMeds(pending.map((p) => ({ ...p, kind: "medicine", details: byKey.get(keyOf(p))?.details || {} })));
            setSearching(false);
          }}
          onBack={() => setSearching(false)} />
      </>
    );
  }

  function apply() {
    const t = templates.find((x) => x.id === tplId);
    if (!t) return;
    patch({ items: applyTemplate(visit.items, t) });
    setNote(`Applied “${t.name}”. Check every dose before sending.`);
  }
  function saveAsTemplate() {
    const name = tplName.trim();
    if (!name || !meds.length) return;
    const items = meds.map(({ term_id, free_text, display, type, details }) => ({ term_id, free_text, display, type, details }));
    setTemplates(saveTemplate(name, items));
    saveCloudTemplate(name, items).then((id) => {
      if (id) setTemplates(replaceTemplates(loadTemplates().map((t) => (t.name.toLowerCase() === name.toLowerCase() ? { ...t, id } : t))));
    });
    setTplName(""); setNote(`Saved template “${name}”.`);
  }

  return (
    <>
      <h3 className="vt-title">Prescribe</h3>
      <div className="vt-alert" role="note">
        <strong>Decision support only.</strong> Warnings are simple matches and do not replace the doctor’s judgement. The doctor is responsible for every prescription.
      </div>
      <section className="vt-history-box" aria-label="Allergies and current medication">
        <div><b>Drug allergy:</b> {allergies.length ? allergies.map((a) => a.display).join(", ") : "None recorded"}</div>
        <div><b>Current medication:</b> {current.length ? current.map((a) => a.display).join(", ") : "None recorded"}</div>
        <button type="button" className="vt-link" onClick={onOpenHistory}>Edit in Medical history</button>
      </section>

      <div className="vt-field">
        <label htmlFor="rx-tpl">Template for common illnesses</label>
        <div className="vt-inputrow">
          <select id="rx-tpl" value={tplId} onChange={(e) => setTplId(e.target.value)} style={{ flex: 1 }}>
            <option value="">{templates.length ? "Choose a template" : "No templates saved yet"}</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.items.length})</option>)}
          </select>
          <button type="button" className="secondary-button" disabled={!tplId} onClick={apply}>Apply</button>
          {tplId && <button type="button" className="vt-lock" aria-label="Delete template" onClick={() => { const t = templates.find((x) => x.id === tplId); if (t) deleteCloudTemplate(t.id, t.name); setTemplates(deleteTemplate(tplId)); setTplId(""); }}><Trash2 size={18} /></button>}
        </div>
      </div>
      {note && <p className="vt-note" role="status">{note}</p>}

      <button type="button" className="primary-button vt-start" onClick={() => setSearching(true)}>Add medicines</button>

      {!meds.length && <p className="vt-empty">No medicines yet. Search the list, use a frequently used chip, or apply a template.</p>}
      <ul className="vt-meds">
        {meds.map((m, idx) => {
          const w = warnings[idx], d = m.details || {};
          return (
            <li key={keyOf(m)} className="vt-med">
              <div className="vt-med-head"><strong>{m.display}</strong>
                <button type="button" className="vt-icon" aria-label={`Remove ${m.display}`} onClick={() => setMeds(meds.filter((_, i) => i !== idx))}><Trash2 size={18} /></button>
              </div>
              {w.allergies.map((a, i) => <div key={i} className="vt-warn vt-warn-red" role="alert"><AlertTriangle size={16} /> Recorded allergy: {a.allergy} ({a.reason}). Review before prescribing.</div>)}
              {w.duplicates.length > 0 && <div className="vt-warn vt-warn-amber"><AlertTriangle size={16} /> Possible duplicate in this prescription: {w.duplicates.join(", ")}.</div>}
              {w.alreadyTaking.length > 0 && <div className="vt-warn vt-warn-amber"><AlertTriangle size={16} /> Patient already takes: {w.alreadyTaking.join(", ")}.</div>}
              <div className="vt-grid2">
                <div className="vt-field"><label htmlFor={`fm-${idx}`}>Form</label>
                  <select id={`fm-${idx}`} value={d.form || ""} onChange={(e) => setDetail(idx, { form: e.target.value })}>{FORMS.map((f) => <option key={f} value={f}>{f || "Not set"}</option>)}</select></div>
                <div className="vt-field"><label htmlFor={`d-${idx}`}>Dose</label><input id={`d-${idx}`} placeholder="e.g. 1 tablet, 7.5 ml" value={d.dose || ""} onChange={(e) => setDetail(idx, { dose: e.target.value })} /></div>
              </div>
              <div className="vt-field"><label htmlFor={`g-${idx}`}>Generic name or composition</label>
                <input id={`g-${idx}`} placeholder="e.g. Ebastine (10mg) + Phenylephrine (10mg)" value={d.generic || ""} onChange={(e) => setDetail(idx, { generic: e.target.value })} /></div>
              <div className="vt-grid2">
                <div className="vt-field"><label htmlFor={`f-${idx}`}>Frequency</label>
                  <select id={`f-${idx}`} value={normalizeFrequency(d.frequency)} onChange={(e) => setDetail(idx, { frequency: e.target.value })}><option value="">Select</option>{FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
                <div className="vt-field"><label htmlFor={`w-${idx}`}>When</label>
                  <select id={`w-${idx}`} value={d.when || ""} onChange={(e) => setDetail(idx, { when: e.target.value })}>{TIMINGS.map((r) => <option key={r} value={r}>{r || "Not set"}</option>)}</select></div>
              </div>
              <div className="vt-field"><label htmlFor={`n-${idx}`}>Duration</label>
                <div className="vt-inputrow">
                  {(d.duration_unit || "days") !== "continue" && <input id={`n-${idx}`} className="vt-narrow" inputMode="numeric" aria-label="Number" value={d.duration ?? ""} onChange={(e) => setDetail(idx, { duration: e.target.value.replace(/\D/g, "").slice(0, 3) })} />}
                  <select aria-label="Duration unit" value={d.duration_unit || "days"} onChange={(e) => setDetail(idx, { duration_unit: e.target.value })}>{DURATION_UNITS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                </div>
                {(d.duration_unit || "days") === "days" && <div className="vt-chips">{DURATION_CHIPS.map((n) => <button type="button" key={n} className={`vt-chip${Number(d.duration) === n ? " vt-chip-on" : ""}`} onClick={() => setDetail(idx, { duration: n, duration_unit: "days" })}>{n} days</button>)}</div>}
              </div>
              <div className="vt-grid2">
                <div className="vt-field"><label htmlFor={`r-${idx}`}>Route</label>
                  <select id={`r-${idx}`} value={d.route || "Oral"} onChange={(e) => setDetail(idx, { route: e.target.value })}>{ROUTE.map((r) => <option key={r}>{r}</option>)}</select></div>
                <div className="vt-field"><label htmlFor={`rm-${idx}`}>Remarks</label>
                  <input id={`rm-${idx}`} placeholder="e.g. With warm water" maxLength={300} value={d.remarks || ""} onChange={(e) => setDetail(idx, { remarks: e.target.value })} /></div>
              </div>
              {hindiInstruction(d) && <p className="vt-hindi" lang="hi"><span>Hindi on the prescription</span>{hindiInstruction(d)}</p>}
            </li>
          );
        })}
      </ul>

      {meds.length > 0 && (
        <div className="vt-field"><label htmlFor="tpl-name">Save these medicines as a template</label>
          <div className="vt-inputrow"><input id="tpl-name" placeholder="e.g. Viral fever" value={tplName} onChange={(e) => setTplName(e.target.value)} /><button type="button" className="secondary-button" disabled={!tplName.trim()} onClick={saveAsTemplate}>Save</button></div>
        </div>
      )}
      <p className="vt-note">Seed lists and any template doses are unreviewed. A qualified doctor must check them before real use.</p>
      <div className="vt-footer"><Button onClick={onDone}>Done</Button></div>
    </>
  );
}
