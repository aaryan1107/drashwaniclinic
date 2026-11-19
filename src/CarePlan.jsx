import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Plus } from "lucide-react";
import { supabase } from "./supabase.js";
import { directions, emptyPlan, indiaDate, routes, upcomingReminders, validatePlan, weekdays } from "./carePlan.js";

const native = Capacitor.isNativePlatform();
const channelId = "clinic-reminders";
const preference = (userId) => `clinic-reminders:${userId}`;
let notificationWork = Promise.resolve();

function reconcileNotifications(plan, isCurrent = () => true) {
  if (!native) return Promise.resolve();
  const job = notificationWork.then(async () => {
    if (!isCurrent()) return;
    const { notifications: pending } = await LocalNotifications.getPending();
    const permitted = plan && (await LocalNotifications.checkPermissions()).display === "granted";
    const wanted = permitted ? upcomingReminders(plan).map(({ kind, at }) => ({
      id: Math.floor(+at / 60000) + (kind === "follow-up" ? 1000000000 : 0),
      title: "Clinic reminder",
      body: "Open the clinic app to review your current care plan.",
      channelId,
      isExactNotification: false,
      schedule: { at, allowWhileIdle: true }
    })) : [];
    if (!isCurrent()) return;

    const wantedIds = new Set(wanted.map(({ id }) => id));
    const remove = pending.filter(({ id }) => !wantedIds.has(id));
    if (remove.length) await LocalNotifications.cancel({ notifications: remove });
    if (!plan) await LocalNotifications.removeAllDeliveredNotifications();

    const pendingIds = new Set(pending.map(({ id }) => id));
    const add = wanted.filter(({ id, schedule }) => !pendingIds.has(id) && +schedule.at > Date.now() + 1000);
    if (isCurrent() && add.length) {
      if (Capacitor.getPlatform() === "android") {
        await LocalNotifications.createChannel({ id: channelId, name: "Clinic reminders", visibility: 0 });
      }
      if (isCurrent()) await LocalNotifications.schedule({ notifications: add });
    }
  });
  notificationWork = job.catch(() => {});
  return job;
}

export function clearCareReminders() {
  return reconcileNotifications(null);
}

async function readPlan(patientId) {
  const { data, error } = await supabase.from("patient_care_plans").select("*").eq("patient_id", patientId).maybeSingle();
  if (error) throw error;
  return data;
}

export function newMedicine() {
  return { id: crypto.randomUUID(), name: "", dose: "", route: "", site: "", frequency: "daily",
    start: indiaDate(), end: "", times: [""], days: [], notes: "" };
}

// Replaces the patient's current care plan with the given medicines and follow-up.
// Reads the latest revision first so a plan edited elsewhere is never silently overwritten.
export async function publishCarePlan(patientId, { medicines, follow_up_date, follow_up_notes }) {
  const error = validatePlan({ medicines, follow_up_date });
  if (error) return { ok: false, message: error };
  try {
    const current = await readPlan(patientId);
    const revision = crypto.randomUUID();
    const payload = { patient_id: patientId, medicines, revision, follow_up_date: follow_up_date || null, follow_up_notes: follow_up_notes || "" };
    const table = supabase.from("patient_care_plans");
    const write = current
      ? table.update(payload).eq("patient_id", patientId).eq("revision", current.revision)
      : table.insert(payload);
    const result = await write.select("revision").maybeSingle();
    if (result.error?.code === "23505" || (!result.error && !result.data)) {
      return { ok: false, message: "The care plan changed elsewhere. Reopen this patient and try again." };
    }
    if (result.error) return { ok: false, message: "Could not publish to the care plan." };
    return { ok: true, message: "Published to the patient's care plan." };
  } catch {
    return { ok: false, message: "Could not confirm publication. Reopen this patient to check the care plan." };
  }
}

export function MedicineFields({ medicine: m, index, change, remove, listId = "clinic-medicine-catalog" }) {
  return (
    <fieldset className="care-fields">
      <legend>Medicine {index + 1}</legend>
      <label>Medicine name, strength and form
        <input required maxLength={180} list={listId} value={m.name} onChange={(e) => change({ name: e.target.value })} />
      </label>
      <label>Dose or amount per use
        <input required maxLength={160} value={m.dose} onChange={(e) => change({ dose: e.target.value })} />
      </label>
      <label>Route
        <select required value={m.route} onChange={(e) => change({ route: e.target.value })}>
          <option value="">Select route</option>
          {routes.map((route) => <option key={route}>{route}</option>)}
        </select>
      </label>
      <label>Application site or administration method
        <input placeholder="e.g. left eye or affected area on face" required={Boolean(m.route && m.route !== routes[0])}
          maxLength={160} value={m.site} onChange={(e) => change({ site: e.target.value })} />
      </label>
      <label>Frequency
        <select value={m.frequency} onChange={(e) => change({ frequency: e.target.value })}>
          <option value="daily">Every day</option>
          <option value="weekly">Selected days each week</option>
          <option value="instructions">As needed or custom instructions</option>
        </select>
      </label>
      {m.frequency === "weekly" && (
        <div className="care-days" role="group" aria-label="Days of week">
          {weekdays.map((d, day) => (
            <label key={d}><input type="checkbox" checked={m.days.includes(day)} onChange={(e) => change({
              days: e.target.checked ? [...m.days, day] : m.days.filter((n) => n !== day)
            })} />{d}</label>
          ))}
        </div>
      )}
      {m.frequency !== "instructions" && <>
        <label>Start date<input type="date" required value={m.start} onChange={(e) => change({ start: e.target.value })} /></label>
        <label>Last date<input type="date" required min={m.start || undefined} value={m.end} onChange={(e) => change({ end: e.target.value })} /></label>
        {m.times.map((time, slot) => (
          <div className="care-time" key={slot}>
            <label>Time {slot + 1} (IST)<input type="time" required value={time}
              onChange={(e) => change({ times: m.times.map((value, i) => i === slot ? e.target.value : value) })} /></label>
            {m.times.length > 1 && <button type="button" className="secondary-button"
              aria-label={`Remove time ${slot + 1}`} onClick={() => change({ times: m.times.filter((_, i) => i !== slot) })}>Remove</button>}
          </div>
        ))}
        {m.times.length < 8 && <button type="button" className="secondary-button" onClick={() => change({ times: [...m.times, ""] })}><Plus size={16} /> Add time</button>}
      </>}
      <label>Instructions
        <textarea required={m.frequency === "instructions"} maxLength={1000} value={m.notes} onChange={(e) => change({ notes: e.target.value })} />
      </label>
      {m.frequency === "instructions" && <p className="detail-copy">These directions are displayed in the care plan without timed alerts.</p>}
      <button type="button" className="secondary-button" onClick={remove}>Remove medicine {index + 1}</button>
    </fieldset>
  );
}

export function DoctorCarePlan({ patientId }) {
  const [plan, setPlan] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [status, setStatus] = useState("Loading care plan…");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    readPlan(patientId).then((data) => {
      if (active) {
        setPlan(data ? { ...data, follow_up_date: data.follow_up_date || "" } : emptyPlan);
        setStatus("");
      }
    }).catch(() => { if (active) setStatus("Could not load the care plan. Reopen this patient to retry."); });
    import("./medicine-catalog.json").then(({ default: names }) => { if (active) setCatalog(names); }).catch(() => {});
    return () => { active = false; };
  }, [patientId]);

  async function publish(event) {
    event.preventDefault();
    const error = validatePlan(plan);
    if (error) { setStatus(error); return; }
    setSaving(true);
    setStatus("Publishing…");
    const revision = crypto.randomUUID();
    const payload = {
      patient_id: patientId, medicines: plan.medicines, revision,
      follow_up_date: plan.follow_up_date || null, follow_up_notes: plan.follow_up_notes
    };
    try {
      const table = supabase.from("patient_care_plans");
      const write = plan.revision
        ? table.update(payload).eq("patient_id", patientId).eq("revision", plan.revision)
        : table.insert(payload);
      const result = await write.select("revision").maybeSingle();
      if (result.error?.code === "23505" || (!result.error && !result.data)) {
        setStatus("The plan changed elsewhere. Reopen this patient and review the latest plan before publishing.");
      } else if (result.error) {
        setStatus("Could not publish the plan. Your draft is still here.");
      } else {
        setPlan((current) => ({ ...current, revision }));
        setStatus("Care plan published.");
      }
    } catch {
      setStatus("Could not confirm publication. Reopen this patient to check the saved plan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="doctor-section care-plan">
      <h3>Care plan and reminders</h3>
      {plan && <form onSubmit={publish}>
        <fieldset className="care-fields care-plan-form" disabled={saving}>
          <p className="detail-copy">Type any medicine or choose a generic name from India’s NLEM. Confirm the formulation and all directions before publishing.</p>
          <datalist id="clinic-medicine-catalog">{catalog.map((name) => <option key={name} value={name} />)}</datalist>
          {plan.medicines.map((m, index) => <MedicineFields key={m.id} medicine={m} index={index}
            change={(patch) => setPlan((p) => ({ ...p, medicines: p.medicines.map((item) => item.id === m.id ? { ...item, ...patch } : item) }))}
            remove={() => setPlan((p) => ({ ...p, medicines: p.medicines.filter((item) => item.id !== m.id) }))} />)}
          <button type="button" className="secondary-button" disabled={plan.medicines.length >= 20}
            onClick={() => setPlan((p) => ({ ...p, medicines: [...p.medicines, newMedicine()] }))}><Plus size={18} /> Add medicine</button>
          <label>Next follow-up date
            <input type="date" value={plan.follow_up_date} onChange={(e) => setPlan((p) => ({ ...p, follow_up_date: e.target.value }))} />
          </label>
          <label>Follow-up instructions
            <textarea maxLength={1000} value={plan.follow_up_notes} onChange={(e) => setPlan((p) => ({ ...p, follow_up_notes: e.target.value }))} />
          </label>
          <button type="submit" className="primary-button">Publish care plan</button>
        </fieldset>
      </form>}
      <p className="detail-copy" role="status">{status}</p>
    </section>
  );
}

export function PatientCarePlan({ patient, userId, onBook }) {
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState("");
  const [syncError, setSyncError] = useState(false);
  const [enabled, setEnabled] = useState(() => native && localStorage.getItem(preference(userId)) === "on");

  useEffect(() => {
    let active = true;
    let reading = false;
    async function refresh() {
      if (reading || document.visibilityState === "hidden") return;
      reading = true;
      try {
        const data = patient?.id ? await readPlan(patient.id) : null;
        if (!active) return;
        if (data && validatePlan(data)) throw new Error("Invalid care plan");
        setPlan(data);
        setSyncError(false);
        await reconcileNotifications(enabled ? data : null, () => active);
      } catch {
        if (active) setSyncError(true);
      } finally {
        reading = false;
      }
    }
    refresh();
    const interval = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    const listener = native ? App.addListener("resume", refresh) : null;
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      listener?.then((handle) => handle.remove());
    };
  }, [patient?.id, enabled]);

  useEffect(() => () => { clearCareReminders().catch(() => {}); }, [userId]);

  async function toggle() {
    setStatus("");
    try {
      if (enabled) {
        localStorage.removeItem(preference(userId));
        setEnabled(false);
        await clearCareReminders();
      } else {
        const { display } = await LocalNotifications.requestPermissions();
        if (display !== "granted") {
          setStatus("Allow notifications in your device settings, then try again.");
          return;
        }
        localStorage.setItem(preference(userId), "on");
        setEnabled(true);
      }
    } catch {
      setStatus("Could not change reminders. Check your device settings and try again.");
    }
  }

  const legacy = patient?.medicines || [];
  const legacyFollowUp = patient?.followUp && patient.followUp !== "Not scheduled" ? patient.followUp : "";
  return (
    <section className="doctor-section care-plan">
      <h3>My care plan</h3>
      {syncError && <p className="detail-copy" role="status">Could not refresh the care plan or its alerts. Reopen the app when connected to check for updates.</p>}
      {plan?.medicines.map((m) => (
        <div className="care-item" key={m.id}>
          <strong>{m.name}</strong>
          <p>{directions(m)}</p>
          {m.frequency !== "instructions" && <>
            <p>{m.frequency === "daily" ? "Daily" : m.days.map((day) => weekdays[day]).join(", ")} · {m.times.join(", ")} IST</p>
            <p>{m.start} to {m.end}</p>
          </>}
          {m.notes && <p className="care-notes">{m.notes}</p>}
        </div>
      ))}
      {!plan?.medicines.length && <p className="detail-copy">Your doctor’s published medicines will appear here.</p>}
      {legacy.length > 0 && <details><summary>Earlier prescription notes</summary><ul>{legacy.map((item, i) => <li key={i}>{item}</li>)}</ul></details>}
      {plan?.follow_up_date && <div className="care-item">
        <strong>Follow-up due {plan.follow_up_date}</strong>
        {plan.follow_up_notes && <p className="care-notes">{plan.follow_up_notes}</p>}
        <button className="secondary-button" onClick={onBook}>Book follow-up</button>
      </div>}
      {!plan && legacyFollowUp && <p className="detail-copy">Earlier follow-up note: {legacyFollowUp}</p>}
      {native && <>
        <button className="secondary-button" onClick={toggle}>{enabled ? "Turn off reminders" : "Enable reminders"}</button>
        <p className="detail-copy">Open the app daily to refresh medicine alerts for the next two days. Device settings can delay delivery. Check your latest care plan before taking a dose.</p>
        {status && <p role="status">{status}</p>}
      </>}
    </section>
  );
}
