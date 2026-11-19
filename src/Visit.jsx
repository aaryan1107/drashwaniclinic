import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Lock, Unlock } from "lucide-react";
import "./visit.css";
import { Button } from "./ui/Button.jsx";
import seedRows from "./data/terms.seed.json";
import { createTermIndex } from "./termSearch.js";
import { TermSearch } from "./TermSearch.jsx";
import { FollowUpScreen, HistoryScreen, NotesScreen, PrescribeScreen } from "./VisitSections.jsx";
import { historyTerms } from "./visitRx.js";
import { SendScreen, SentScreen } from "./VisitSend.jsx";
import { addCustomTerm, bumpUsage, clearDraft, loadCustomTerms, loadDraft, loadLastVitals, loadUsage, replaceUsage, saveDraft, saveLastVitals } from "./visitStore.js";
import { markSent, pullDraft, pullUsage, pushDraft, pushUsage } from "./visitCloud.js";
import { pickNewerDraft } from "./visitSync.js";
import { SECTIONS, blankVisit, bmi, bmiCategory, carryForward, completedCount, egfr, sectionDone, toCelsius, vitalFlag, weightDose } from "./visit.js";

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// Sections backed by the shared term search (symptoms/diagnosis, findings, labs).
const TERM_SECTIONS = {
  dx: { title: "Symptoms & diagnosis", types: ["symptom", "diagnosis"], kinds: ["symptom", "diagnosis"], codes: true },
  exam: { title: "Examination findings", types: ["finding"], kinds: ["finding"] },
  labs: { title: "Lab tests", types: ["lab_panel", "lab_test"], kinds: ["lab"] }
};

function summary(id, v) {
  if (id === "vitals") {
    const x = v.vitals, parts = [];
    if (x.bp_sys && x.bp_dia) parts.push(`BP ${x.bp_sys}/${x.bp_dia}`);
    if (x.pulse) parts.push(`Pulse ${x.pulse}`);
    if (x.weight) parts.push(`${x.weight} ${x.units?.weight || "kg"}`);
    return parts.join(" · ") || "Not recorded";
  }
  const cfg = TERM_SECTIONS[id];
  if (cfg) {
    const items = v.items.filter((i) => cfg.kinds.includes(i.kind));
    return items.length ? items.map((i) => i.display).join(", ") : "Not recorded";
  }
  if (id === "history") { const n = Object.values(v.history || {}).filter((a) => a?.length).length; return n ? `${n} categor${n === 1 ? "y" : "ies"} recorded` : "Not recorded"; }
  if (id === "notes") return [v.notes_public?.trim() && "For patient", v.notes_private?.trim() && "Private"].filter(Boolean).join(" + ") || "Not recorded";
  if (id === "rx") { const m = v.items.filter((i) => i.kind === "medicine"); return m.length ? m.map((i) => i.display).join(", ") : "Not recorded"; }
  if (id === "followup") return v.follow_up?.date ? `On ${v.follow_up.date}` : v.follow_up?.days ? `After ${v.follow_up.days} days` : "Not recorded";
  return sectionDone(id, v) ? "Recorded" : "Not recorded";
}

const hhmm = (d) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export default function Visit({ doctorId, patient, clinic, onBack }) {
  const pid = String(patient.id);
  const [visit, setVisit] = useState(() => loadDraft(doctorId, pid) || { ...blankVisit(pid, todayIso()), vitals: carryForward(loadLastVitals(doctorId, pid) || {}) });
  const [screen, setScreen] = useState("home");
  const [usage, setUsage] = useState(() => loadUsage());
  const [customVersion, setCustomVersion] = useState(0);
  const [savedAt, setSavedAt] = useState(null);
  const [sentRx, setSentRx] = useState(null);
  const [cloudAt, setCloudAt] = useState(null);
  const first = useRef(true);
  const cloudId = useRef(visit.cloud_id || null);
  const pushing = useRef(Promise.resolve());
  const touched = useRef(false);

  // On open, take the newer of this device's draft and the cloud draft, and merge usage counts.
  useEffect(() => {
    let live = true;
    pullDraft(pid).then((remote) => {
      if (!live || !remote) return;
      cloudId.current = cloudId.current || remote.cloud_id;
      if (touched.current) return;          // the doctor already started typing here; keep that
      setVisit((local) => { const next = pickNewerDraft(local, remote); cloudId.current = next.cloud_id || cloudId.current; return next; });
    });
    pullUsage(loadUsage()).then((merged) => { if (live && merged) setUsage(replaceUsage(merged)); });
    return () => { live = false; };
  }, [pid]);

  const index = useMemo(() => createTermIndex(seedRows, [...loadCustomTerms(), ...historyTerms()]), [customVersion]);

  // Autosave the draft on this device 500 ms after the last change. Nothing is sent to the patient.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (sentRx) return;
    touched.current = true;
    const t = setTimeout(() => { if (saveDraft(doctorId, pid, { ...visit, cloud_id: cloudId.current })) setSavedAt(new Date()); }, 500);
    // Cloud copy every few seconds, one request chain at a time so a draft is never inserted twice.
    const c = setTimeout(() => {
      pushing.current = pushing.current.then(async () => {
        const id = await pushDraft({ ...visit, cloud_id: cloudId.current, saved_at: Date.now() }, clinic?.id);
        if (id) { cloudId.current = id; saveDraft(doctorId, pid, { ...visit, cloud_id: id }); setCloudAt(new Date()); }
      });
    }, 3000);
    return () => { clearTimeout(t); clearTimeout(c); };
  }, [visit, doctorId, pid, sentRx, clinic?.id]);

  const patch = useCallback((p) => setVisit((v) => ({ ...v, ...p })), []);
  const saveNow = () => { saveDraft(doctorId, pid, { ...visit, cloud_id: cloudId.current }); saveLastVitals(doctorId, pid, visit.vitals); setSavedAt(new Date()); };
  const done = completedCount(visit);

  function commitTerms(id, pending) {
    const cfg = TERM_SECTIONS[id];
    let nextUsage = usage;
    const prevKeys = new Set(visit.items.filter((i) => cfg.kinds.includes(i.kind)).map((i) => i.term_id || `free:${i.free_text}`));
    const items = pending.map((i) => {
      if (i.free_text && !i.term_id) {
        const t = addCustomTerm(i.type, i.free_text);   // remembered locally; flagged pending_review
        return { ...i, term_id: t.id };
      }
      return i;
    });
    for (const i of items) if (i.term_id && !prevKeys.has(i.term_id)) nextUsage = bumpUsage(nextUsage, i.term_id);
    setUsage(nextUsage);
    pushUsage(nextUsage, items.map((i) => i.term_id));
    setCustomVersion((n) => n + 1);
    const others = visit.items.filter((i) => !cfg.kinds.includes(i.kind));
    patch({ items: [...others, ...items.map((i) => ({ ...i, kind: i.kind }))] });
    setScreen("home");
  }

  const header = (
    <header className="vt-head">
      <button type="button" className="circle-button" aria-label={screen === "home" ? "Back to patient" : "Back to visit"} onClick={() => (screen === "home" ? onBack() : setScreen("home"))}><ArrowLeft size={20} /></button>
      <div>
        <strong>{patient.name}</strong>
        <span>{patient.age ? `${patient.age} y` : "Age not recorded"} · {patient.gender || "Sex not recorded"}</span>
      </div>
      <span className="vt-progress" aria-label={`${done} of ${SECTIONS.length} sections completed`}>{done}/{SECTIONS.length}</span>
    </header>
  );

  if (screen === "vitals") return <div className="vt">{header}<VitalsScreen visit={visit} patient={patient} patch={patch} onDone={() => { saveLastVitals(doctorId, pid, visit.vitals); setScreen("home"); }} /></div>;

  if (TERM_SECTIONS[screen]) {
    const cfg = TERM_SECTIONS[screen];
    return (
      <div className="vt">{header}
        <h3 className="vt-title">{cfg.title}</h3>
        <TermSearch key={screen} title={cfg.title} index={index} usage={usage} types={cfg.types} kind={cfg.kinds[0]}
          freeType={cfg.types[0]} showCodeToggle={cfg.codes}
          value={visit.items.filter((i) => cfg.kinds.includes(i.kind))}
          onSave={(pending) => commitTerms(screen, pending.map((i) => ({ ...i, kind: screen === "dx" ? (i.type === "diagnosis" ? "diagnosis" : "symptom") : cfg.kinds[0] })))}
          onBack={() => setScreen("home")} />
      </div>
    );
  }

  const used = (items) => {
    const next = items.reduce((acc, i) => (i.term_id && !i.term_id.startsWith("custom:") ? bumpUsage(acc, i.term_id) : acc), usage);
    setUsage(next);
    pushUsage(next, items.map((i) => i.term_id));
  };
  const toHome = () => setScreen("home");
  if (screen === "history") return <div className="vt">{header}<HistoryScreen visit={visit} patch={patch} index={index} usage={usage} onUsed={used} onDone={toHome} /></div>;
  if (screen === "notes") return <div className="vt">{header}<NotesScreen visit={visit} patch={patch} onDone={toHome} /></div>;
  if (screen === "followup") return <div className="vt">{header}<FollowUpScreen visit={visit} patch={patch} onDone={toHome} /></div>;
  if (sentRx) return <div className="vt">{header}<SentScreen rx={sentRx} patient={patient} clinic={clinic} onDone={onBack} /></div>;
  if (screen === "send") return (
    <div className="vt">{header}<SendScreen visit={{ ...visit, cloud_id: cloudId.current }} patient={patient} clinic={clinic} onEdit={setScreen}
      onSent={(rx) => {
        saveLastVitals(doctorId, pid, visit.vitals); clearDraft(doctorId, pid); setSentRx(rx);
        // Best-effort: the prescription row is the source of truth. Queue behind any autosave so the draft is never inserted twice.
        pushing.current = pushing.current.then(() => markSent({ ...visit, cloud_id: cloudId.current }, clinic?.id));
      }} /></div>
  );
  if (screen === "rx") return <div className="vt">{header}<PrescribeScreen visit={visit} patch={patch} index={index} usage={usage} onUsed={used} onOpenHistory={() => setScreen("history")} onDone={toHome} /></div>;

  return (
    <div className="vt">
      {header}
      <p className="vt-note" role="status">Draft · {savedAt ? `saved on this device at ${hhmm(savedAt)}${cloudAt ? `, synced at ${hhmm(cloudAt)}` : ""}` : "autosaves as you type"}. Nothing reaches the patient until you tap Send Rx.</p>
      <ul className="vt-sections">
        {SECTIONS.map((s) => {
          const ok = sectionDone(s.id, visit);
          return (
            <li key={s.id}>
              <button type="button" className="vt-section" onClick={() => setScreen(s.id)}>
                <span className={`vt-check${ok ? " vt-check-on" : ""}`} aria-hidden="true">{ok && <Check size={16} />}</span>
                <span className="vt-section-text"><strong>{s.label}</strong><small>{summary(s.id, visit)}</small></span>
                <span className="vt-state">{ok ? "Completed" : ""}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="vt-footer vt-footer-fixed">
        <Button intent="secondary" onClick={saveNow}>Save draft</Button>
        <Button intent="secondary" onClick={() => setScreen("rx")}>Template</Button>
        <Button onClick={() => setScreen("send")}>Send Rx</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Vitals
const UNITS = { height: ["cm", "in"], weight: ["kg", "lb"], temp: ["F", "C"] };

function VitalsScreen({ visit, patient, patch, onDone }) {
  const [tab, setTab] = useState("vitals");
  const v = visit.vitals;
  const set = (k, val) => patch({ vitals: { ...v, [k]: val } });
  const setUnit = (k, u) => patch({ vitals: { ...v, units: { ...(v.units || {}), [k]: u } } });
  const toggleLock = (k) => patch({ vitals: { ...v, locked: { ...(v.locked || {}), [k]: !v.locked?.[k] } } });
  const unit = (k) => v.units?.[k] || UNITS[k][0];
  const bmiVal = bmi(v.height, v.weight, { heightUnit: unit("height"), weightUnit: unit("weight") });
  const lockBtn = (k) => (
    <button type="button" className={`vt-lock${v.locked?.[k] ? " on" : ""}`} aria-pressed={!!v.locked?.[k]} aria-label={`${v.locked?.[k] ? "Unlock" : "Lock"} ${k} to carry forward to the next visit`} onClick={() => toggleLock(k)}>
      {v.locked?.[k] ? <Lock size={18} /> : <Unlock size={18} />}
    </button>
  );
  const unitSel = (k) => (
    <select aria-label={`${k} unit`} value={unit(k)} onChange={(e) => setUnit(k, e.target.value)}>{UNITS[k].map((u) => <option key={u}>{u}</option>)}</select>
  );
  const field = (k, label, extra = {}) => (
    <div className="vt-field" key={k}>
      <label htmlFor={`v-${k}`}>{label}</label>
      <div className="vt-inputrow">
        <input id={`v-${k}`} inputMode="decimal" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value.replace(/[^0-9.]/g, ""))} />
        {UNITS[k] ? unitSel(k) : <span className="vt-unit">{extra.unit}</span>}
        {lockBtn(k)}
      </div>
      {vitalFlag(k, v) && <span className="vt-flag">{vitalFlag(k, v)}</span>}
    </div>
  );
  const bpFlag = vitalFlag("bp", v);

  return (
    <div>
      <div className="vt-tabs" role="tablist">
        {["vitals", "calculators"].map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "vitals" ? "Vitals" : "Calculators"}</button>)}
      </div>
      {tab === "vitals" ? (
        <>
          <div className="vt-field">
            <label htmlFor="v-date">Date</label>
            <div className="vt-inputrow">
              <input id="v-date" type="date" value={visit.visit_date} max={todayIso()} onChange={(e) => patch({ visit_date: e.target.value || todayIso() })} />
              <button type="button" className="vt-chip" onClick={() => patch({ visit_date: todayIso() })}>Today</button>
            </div>
          </div>
          <div className="vt-field">
            <label htmlFor="v-bp_sys">Blood pressure (mmHg)</label>
            <div className="vt-inputrow">
              <input id="v-bp_sys" aria-label="Systolic" placeholder="Sys" inputMode="numeric" value={v.bp_sys ?? ""} onChange={(e) => set("bp_sys", e.target.value.replace(/\D/g, ""))} />
              <span className="vt-unit">/</span>
              <input aria-label="Diastolic" placeholder="Dia" inputMode="numeric" value={v.bp_dia ?? ""} onChange={(e) => set("bp_dia", e.target.value.replace(/\D/g, ""))} />
              {lockBtn("bp_sys")}
            </div>
            {bpFlag && <span className="vt-flag">{bpFlag}</span>}
          </div>
          {field("height", "Height")}
          {field("weight", "Weight")}
          <div className="vt-field">
            <label>BMI (calculated)</label>
            <div className="vt-readonly" aria-live="polite">{bmiVal ? `${bmiVal} kg/m² · ${bmiCategory(bmiVal)}` : "Enter height and weight"}</div>
          </div>
          {field("pulse", "Pulse", { unit: "/min" })}
          {field("temp", "Temperature")}
          {field("spo2", "SpO₂", { unit: "%" })}
          <div className="vt-footer"><Button onClick={onDone}>Save vitals</Button></div>
          <p className="vt-note">Flags are plain reference ranges for adults, not a diagnosis. Locked values are copied into the patient’s next visit.</p>
        </>
      ) : <Calculators patient={patient} visit={visit} />}
    </div>
  );
}

function Calculators({ patient, visit }) {
  const v = visit.vitals;
  const [cr, setCr] = useState("");
  const [mg, setMg] = useState("");
  const [n, setN] = useState("3");
  const [wt, setWt] = useState("");
  const [sex, setSex] = useState(/^f/i.test(patient.gender || "") ? "female" : "male");
  const [age, setAge] = useState(patient.age ? String(patient.age) : "");
  const bmiVal = bmi(v.height, v.weight, { heightUnit: v.units?.height || "cm", weightUnit: v.units?.weight || "kg" });
  const kg = wt || (v.weight ? String(v.units?.weight === "lb" ? (v.weight * 0.45359).toFixed(1) : v.weight) : "");
  const gfr = egfr(cr, age, sex);
  const dose = weightDose(kg, mg, n);
  return (
    <div className="vt-calcs">
      <section><h4>BMI</h4><p>{bmiVal ? `${bmiVal} kg/m² · ${bmiCategory(bmiVal)}` : "Enter height and weight on the Vitals tab."}</p></section>
      <section>
        <h4>eGFR (CKD-EPI 2021, adults)</h4>
        <div className="vt-inputrow">
          <input aria-label="Serum creatinine mg/dL" placeholder="Creatinine mg/dL" inputMode="decimal" value={cr} onChange={(e) => setCr(e.target.value)} />
          <input aria-label="Age in years" placeholder="Age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
          <select aria-label="Sex" value={sex} onChange={(e) => setSex(e.target.value)}><option value="male">Male</option><option value="female">Female</option></select>
        </div>
        <p>{gfr != null ? `${gfr} mL/min/1.73 m²` : "Enter creatinine and age (18+)."}</p>
      </section>
      <section>
        <h4>Weight-based dose</h4>
        <div className="vt-inputrow">
          <input aria-label="Weight in kg" placeholder="Weight kg" inputMode="decimal" value={wt || kg} onChange={(e) => setWt(e.target.value)} />
          <input aria-label="mg per kg per day" placeholder="mg/kg/day" inputMode="decimal" value={mg} onChange={(e) => setMg(e.target.value)} />
          <input aria-label="Doses per day" placeholder="Doses/day" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} />
        </div>
        <p>{dose ? `${dose.daily} mg/day · ${dose.perDose} mg per dose` : "Enter weight, mg/kg/day and doses per day."}</p>
      </section>
      <p className="vt-note">Arithmetic helpers only. Decision support; the doctor is responsible for every dose and decision.</p>
    </div>
  );
}
