import { useRef, useState } from "react";
import { ArrowLeft, CalendarCheck, ClipboardCheck, PenLine } from "lucide-react";
import "./visit.css";
import { Button } from "./ui/Button.jsx";
import { supabase } from "./supabase.js";
import { indiaDate } from "./carePlan.js";
import { DEFAULT_TAGS, DURATIONS, blankAppointment, buildAppointmentRow, validateAppointment } from "./appointment.js";

// Doctor-side appointment sheet: in clinic / tele, fixed / flexible slot, duration, date & time, tags,
// and the three actions Write Rx, Check in, Book slot.
export default function AppointmentSheet({ patient, clinic, onBack, onWriteRx }) {
  const today = indiaDate();
  const [a, setA] = useState(() => blankAppointment(today));
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const attempt = useRef(null);
  const set = (p) => {
    attempt.current = null;
    setA((cur) => ({ ...cur, ...p }));
  };
  const toggleTag = (t) => set({ tags: a.tags.includes(t) ? a.tags.filter((x) => x !== t) : [...a.tags, t] });
  const error = validateAppointment(a, today);

  async function save(kind) {
    const now = new Date();
    const form = kind === "checkin"
      ? { ...a, date: today, slot_type: "fixed", time: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) }
      : a;
    const err = validateAppointment(form, today);
    if (err) { setStatus(err); return; }
    setBusy(true);
    if (attempt.current?.kind !== kind) {
      const row = buildAppointmentRow(form, { patient, clinic, status: kind === "checkin" ? "Checked in" : "Booked by clinic" });
      if (kind === "checkin") row.checked_in_at = now.toISOString();
      attempt.current = { kind, row: { id: crypto.randomUUID(), ...row } };
    }
    const { row } = attempt.current;
    let error;
    try {
      ({ error } = await supabase.from("appointment_requests").upsert(row, { onConflict: "id", ignoreDuplicates: true }));
    } catch (failure) {
      error = failure;
    } finally {
      setBusy(false);
    }
    if (error) {
      setStatus("The clinic server did not confirm this appointment. Keep this sheet open and retry.");
      return;
    }
    setStatus(kind === "checkin" ? `${patient.name} checked in at ${row.appointment_time}.` : `Booked ${row.appointment_date} ${row.appointment_time}.`);
  }

  return (
    <div className="vt">
      <header className="vt-head">
        <button type="button" className="circle-button" aria-label="Back to patient" onClick={onBack}><ArrowLeft size={20} /></button>
        <div><strong>{patient.name}</strong><span>Appointment</span></div>
        <span />
      </header>

      <div className="vt-tabs" role="radiogroup" aria-label="Visit type">
        {[["in_clinic", "In clinic"], ["tele", "Tele"]].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={a.visit_type === v} className={a.visit_type === v ? "on" : ""} onClick={() => set({ visit_type: v })}>{l}</button>)}
      </div>
      <div className="vt-tabs" role="radiogroup" aria-label="Slot type">
        {[["fixed", "Fixed slot"], ["flexible", "Flexible"]].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={a.slot_type === v} className={a.slot_type === v ? "on" : ""} onClick={() => set({ slot_type: v })}>{l}</button>)}
      </div>

      <div className="vt-field"><label>Duration</label>
        <div className="vt-chips">{DURATIONS.map((n) => <button key={n} type="button" className={`vt-chip${a.duration_min === n ? " vt-chip-on" : ""}`} aria-pressed={a.duration_min === n} onClick={() => set({ duration_min: n })}>{n} min</button>)}</div>
      </div>
      <div className="vt-grid2">
        <div className="vt-field"><label htmlFor="ap-date">Date</label><input id="ap-date" type="date" min={today} value={a.date} onChange={(e) => set({ date: e.target.value })} /></div>
        <div className="vt-field"><label htmlFor="ap-time">Time{a.slot_type === "flexible" ? " (any)" : ""}</label><input id="ap-time" type="time" disabled={a.slot_type === "flexible"} value={a.time} onChange={(e) => set({ time: e.target.value })} /></div>
      </div>
      <div className="vt-field"><label>Tags</label>
        <div className="vt-chips">
          {[...new Set([...DEFAULT_TAGS, ...a.tags])].map((t) => <button key={t} type="button" className={`vt-chip${a.tags.includes(t) ? " vt-chip-on" : ""}`} aria-pressed={a.tags.includes(t)} onClick={() => toggleTag(t)}>{t}</button>)}
        </div>
        <div className="vt-inputrow">
          <input aria-label="Custom tag" placeholder="Add a tag" maxLength={30} value={tag} onChange={(e) => setTag(e.target.value)} />
          <button type="button" className="secondary-button" disabled={!tag.trim()} onClick={() => { if (!a.tags.includes(tag.trim())) set({ tags: [...a.tags, tag.trim()] }); setTag(""); }}>Add</button>
        </div>
      </div>
      <div className="vt-field"><label htmlFor="ap-reason">Note</label><input id="ap-reason" maxLength={200} value={a.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Optional" /></div>

      {error && !status && <p className="vt-note">To book: {error.charAt(0).toLowerCase() + error.slice(1)}</p>}
      {status && <p className="vt-note" role="status">{status}</p>}
      <div className="vt-footer vt-footer-fixed">
        <Button intent="secondary" icon={<PenLine size={18} />} onClick={onWriteRx}>Write Rx</Button>
        <Button intent="secondary" disabled={busy} icon={<ClipboardCheck size={18} />} onClick={() => save("checkin")}>Check in</Button>
        <Button loading={busy} disabled={Boolean(error)} title={error || undefined} icon={<CalendarCheck size={18} />} onClick={() => save("book")}>Book slot</Button>
      </div>
    </div>
  );
}
