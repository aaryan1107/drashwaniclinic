import { useCallback, useEffect, useState } from "react";
import { FileDown, Plus } from "lucide-react";
import { supabase } from "./supabase.js";
import { indiaDate } from "./carePlan.js";
import { MedicineFields, newMedicine, publishCarePlan } from "./CarePlan.jsx";
import {
  buildPrescriptionRow, catalogLabel, rxNumber, searchCatalog, toCarePlan, validatePrescription
} from "./prescription.js";
import { savePrescriptionPdf } from "./prescriptionPdf.js";

const blankForm = () => ({ diagnosis: "", medicines: [newMedicine()], instructions: "", follow_up_date: "" });
const clinicFor = (rx, clinics) => clinics.find((clinic) => clinic.id === rx.clinic_id) || clinics[0];
const shortDate = (iso) => new Date(iso).toLocaleDateString("en-IN", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata"
});

// Loads prescriptions for one patient, or every prescription the signed-in role may see (front desk).
// Row-level security decides what comes back; the filter only narrows it.
function usePrescriptionRows(patientId, { all = false } = {}) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const enabled = all || Boolean(patientId);

  const reload = useCallback(async () => {
    if (!enabled) return;
    let query = supabase.from("prescriptions").select("*").order("created_at", { ascending: false }).limit(100);
    if (!all) query = query.eq("patient_id", patientId);
    const { data, error } = await query;
    if (error) {
      setState("error");
      return;
    }
    setRows(data || []);
    setState("ready");
  }, [enabled, all, patientId]);

  useEffect(() => {
    reload();
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return { rows, state, reload };
}

function PrescriptionRow({ rx, clinics, actions }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function pdf() {
    setBusy(true);
    setNote("");
    try {
      await savePrescriptionPdf(rx, clinicFor(rx, clinics));
    } catch {
      setNote("Could not create the PDF. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`care-item rx-item${rx.status === "void" ? " rx-void" : ""}`}>
      <strong>{rxNumber(rx)} · {shortDate(rx.created_at)}{rx.status === "void" ? " · VOID" : ""}</strong>
      {rx.patient_name && <p>{rx.patient_name}</p>}
      <p>{rx.diagnosis}</p>
      <p className="detail-copy">{rx.medicines.map((m) => m.name).join(", ")}</p>
      {rx.follow_up_date && <p className="detail-copy">Follow-up {rx.follow_up_date}</p>}
      {rx.status === "void" && rx.void_reason && <p className="detail-copy">Voided: {rx.void_reason}</p>}
      <div className="rx-actions">
        <button type="button" className="secondary-button" onClick={pdf} disabled={busy}>
          <FileDown size={16} /> {busy ? "Preparing…" : "PDF"}
        </button>
        {actions}
      </div>
      {note && <p className="detail-copy" role="status">{note}</p>}
    </div>
  );
}

function VoidControl({ rx, onVoid }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <button type="button" className="secondary-button" onClick={() => setOpen(true)}>Void</button>;
  return (
    <div className="rx-void-form">
      <label>Reason for voiding
        <input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button type="button" className="secondary-button" disabled={reason.trim().length < 3}
        onClick={() => onVoid(rx, reason.trim())}>Confirm void</button>
      <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

function CatalogManager({ catalog, reload }) {
  const [entry, setEntry] = useState({ name: "", strength: "", form: "" });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const matches = searchCatalog(catalog, query, 20, { includeInactive: true });

  async function add(event) {
    event.preventDefault();
    const name = entry.name.trim();
    if (!name) return;
    const { error } = await supabase.from("medicine_catalog").insert({
      name, strength: entry.strength.trim(), form: entry.form.trim()
    });
    if (error?.code === "23505") setStatus("That medicine is already in the catalog.");
    else if (error) setStatus("Could not add the medicine.");
    else {
      setStatus(`Added ${catalogLabel({ ...entry, name })}.`);
      setEntry({ name: "", strength: "", form: "" });
      reload();
    }
  }

  async function toggle(item) {
    const { data, error } = await supabase.from("medicine_catalog")
      .update({ active: !item.active }).eq("id", item.id).select("id").maybeSingle();
    if (error || !data) setStatus("Could not update the medicine.");
    else reload();
  }

  return (
    <details className="rx-catalog">
      <summary>Medicine catalog ({catalog.filter((item) => item.active).length} active)</summary>
      <form className="care-fields" onSubmit={add}>
        <label>Medicine name
          <input required maxLength={180} value={entry.name} onChange={(e) => setEntry({ ...entry, name: e.target.value })} />
        </label>
        <label>Strength
          <input maxLength={60} placeholder="e.g. 500 mg" value={entry.strength} onChange={(e) => setEntry({ ...entry, strength: e.target.value })} />
        </label>
        <label>Form
          <input maxLength={60} placeholder="e.g. tablet" value={entry.form} onChange={(e) => setEntry({ ...entry, form: e.target.value })} />
        </label>
        <button type="submit" className="secondary-button"><Plus size={16} /> Add to catalog</button>
      </form>
      <label>Find a medicine to hide or restore
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {matches.map((item) => (
        <div className="rx-catalog-row" key={item.id}>
          <span>{catalogLabel(item)}{item.active ? "" : " (hidden)"}</span>
          <button type="button" className="secondary-button" onClick={() => toggle(item)}>{item.active ? "Hide" : "Restore"}</button>
        </div>
      ))}
      {status && <p className="detail-copy" role="status">{status}</p>}
    </details>
  );
}

export function DoctorPrescriptions({ patient, clinics, activeClinic, doctorName = "Dr. Ashwani Kansal", onCarePlanPublished }) {
  const { rows, state, reload } = usePrescriptionRows(patient.id);
  const [catalog, setCatalog] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const loadCatalog = useCallback(async () => {
    const { data } = await supabase.from("medicine_catalog")
      .select("id,name,strength,form,active").order("name").limit(2000);
    setCatalog(data || []);
  }, []);
  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const change = (patch) => setForm((current) => ({ ...current, ...patch }));

  async function issue(event) {
    event.preventDefault();
    const error = validatePrescription(form);
    if (error) { setStatus(error); return; }
    setSaving(true);
    setStatus("Issuing…");
    const row = buildPrescriptionRow({ patient, form, clinic: activeClinic, doctorName });
    const { data, error: dbError } = await supabase.from("prescriptions").insert(row).select("*").single();
    setSaving(false);
    if (dbError) {
      setStatus("Could not issue the prescription. Your draft is still here.");
      return;
    }
    setForm(blankForm());
    setStatus(`Issued ${rxNumber(data)}.`);
    reload();
  }

  async function publish(rx) {
    if (!window.confirm("Replace this patient's current care plan with this prescription? Their reminders will update.")) return;
    const result = await publishCarePlan(patient.id, toCarePlan(rx));
    setStatus(result.message);
    if (result.ok) onCarePlanPublished?.();
  }

  async function voidRx(rx, reason) {
    const { data, error } = await supabase.from("prescriptions")
      .update({ status: "void", void_reason: reason }).eq("id", rx.id).select("id").maybeSingle();
    if (error || !data) setStatus("Could not void the prescription.");
    else { setStatus(`${rxNumber(rx)} voided.`); reload(); }
  }

  return (
    <section className="doctor-section care-plan">
      <h3>Issue prescription</h3>
      <datalist id="rx-medicine-catalog">
        {catalog.filter((item) => item.active).map((item) => <option key={item.id} value={catalogLabel(item)} />)}
      </datalist>
      <form onSubmit={issue}>
        <fieldset className="care-fields care-plan-form" disabled={saving}>
          <label>Diagnosis
            <textarea required maxLength={1000} value={form.diagnosis} onChange={(e) => change({ diagnosis: e.target.value })} />
          </label>
          {form.medicines.map((m, index) => (
            <MedicineFields key={m.id} medicine={m} index={index} listId="rx-medicine-catalog"
              change={(patch) => change({ medicines: form.medicines.map((item) => item.id === m.id ? { ...item, ...patch } : item) })}
              remove={() => change({ medicines: form.medicines.filter((item) => item.id !== m.id) })} />
          ))}
          <button type="button" className="secondary-button" disabled={form.medicines.length >= 20}
            onClick={() => change({ medicines: [...form.medicines, newMedicine()] })}><Plus size={18} /> Add medicine</button>
          <label>Advice and instructions
            <textarea maxLength={2000} value={form.instructions} onChange={(e) => change({ instructions: e.target.value })} />
          </label>
          <label>Next follow-up date
            <input type="date" min={indiaDate()} value={form.follow_up_date} onChange={(e) => change({ follow_up_date: e.target.value })} />
          </label>
          <p className="detail-copy">An issued prescription cannot be edited. If something is wrong, void it and issue a new one.</p>
          <button type="submit" className="primary-button">Issue prescription</button>
        </fieldset>
      </form>
      <p className="detail-copy" role="status">{status}</p>

      <CatalogManager catalog={catalog} reload={loadCatalog} />

      <h3>Prescription history</h3>
      {state === "loading" && <p className="detail-copy">Loading…</p>}
      {state === "error" && <p className="detail-copy" role="status">Could not load the prescription history. Reopen this patient to retry.</p>}
      {state === "ready" && !rows.length && <p className="detail-copy">No prescriptions issued yet.</p>}
      {rows.map((rx) => (
        <PrescriptionRow key={rx.id} rx={rx} clinics={clinics} actions={rx.status === "issued" && <>
          <button type="button" className="secondary-button" onClick={() => publish(rx)}>Publish to care plan</button>
          <VoidControl rx={rx} onVoid={voidRx} />
        </>} />
      ))}
    </section>
  );
}

export function PatientPrescriptions({ patient, clinics }) {
  const { rows, state } = usePrescriptionRows(patient?.id);
  if (!patient?.id) return null;
  return (
    <section className="doctor-section care-plan">
      <h3>My prescriptions</h3>
      {state === "error" && <p className="detail-copy" role="status">Could not load your prescriptions. Reopen the app when connected.</p>}
      {state === "ready" && !rows.length && <p className="detail-copy">Prescriptions your doctor issues will appear here.</p>}
      {rows.map((rx) => <PrescriptionRow key={rx.id} rx={rx} clinics={clinics} />)}
    </section>
  );
}

// Read-only list for front-desk staff: search, view and print. No issue, edit or void controls.
export function ReceptionPrescriptions({ clinics }) {
  const { rows, state } = usePrescriptionRows(null, { all: true });
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter((rx) => rx.patient_name.toLowerCase().includes(q) || rxNumber(rx).toLowerCase().includes(q))
    : rows;
  return (
    <section className="doctor-section care-plan">
      <h3>Prescriptions</h3>
      <label>Search by patient name or Rx number
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {state === "error" && <p className="detail-copy" role="status">Could not load prescriptions. Check your connection and reopen the app.</p>}
      {state === "ready" && !visible.length && <p className="detail-copy">No prescriptions found.</p>}
      {visible.map((rx) => <PrescriptionRow key={rx.id} rx={rx} clinics={clinics} />)}
    </section>
  );
}
