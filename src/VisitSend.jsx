import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Printer, Send, Share2 } from "lucide-react";
import { supabase } from "./supabase.js";
import { indiaDate } from "./carePlan.js";
import { rxNumber, scheduleText, toCarePlan, validatePrescription } from "./prescription.js";
import { prescribingWarnings, visitToPrescriptionRow } from "./visitRx.js";
import { Button } from "./ui/Button.jsx";


const DOCTOR_NAME = "Dr. Ashwani Kansal";
export function SendScreen({ visit, patient, clinic, onEdit, onSent }) {
  const row = useMemo(() => visitToPrescriptionRow(visit, { patient, clinic, doctorName: DOCTOR_NAME }), [visit, patient, clinic]);
  const error = validatePrescription(row, indiaDate());
  const meds = visit.items.filter((i) => i.kind === "medicine");
  const allergyHits = prescribingWarnings(meds, visit.history).flatMap((w, i) => w.allergies.map((a) => `${meds[i].display}: ${a.allergy}`));
  const [ack, setAck] = useState(false);
  const [state, setState] = useState({ busy: false, message: "" });
  const fixTarget = /diagnosis/i.test(error) ? "dx" : /medicine/i.test(error) ? "rx" : /follow-up/i.test(error) ? "followup" : "rx";

  async function send() {
    setState({ busy: true, message: "Sending…" });
    const { data, error: dbError } = await supabase.from("prescriptions").insert(row).select("*").single();
    if (dbError) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setState({ busy: false, message: offline ? "You are offline. Nothing was sent; your draft is safe. Try again when connected." : "Could not send the prescription. Nothing was sent; your draft is safe." });
      return;
    }
    onSent(data);
  }

  return (
    <>
      <h3 className="vt-title">Review and send</h3>
      {error ? (
        <div className="vt-warn vt-warn-amber" role="alert"><AlertTriangle size={16} />
          <span>{error} <button type="button" className="vt-link" onClick={() => onEdit(fixTarget)}>Fix it</button></span>
        </div>
      ) : null}
      {allergyHits.length > 0 && (
        <div className="vt-warn vt-warn-red" role="alert"><AlertTriangle size={16} />
          <span>Allergy warning (decision support): {allergyHits.join("; ")}.</span>
        </div>
      )}
      <article className="vt-rx-preview" aria-label="Prescription preview">
        <header><strong>{row.patient_name}</strong><span>{[row.patient_age && `${row.patient_age} y`, row.patient_gender].filter(Boolean).join(" · ")}</span></header>
        <p><b>Diagnosis:</b> {row.diagnosis || "Not recorded"}</p>
        <ol>{row.medicines.map((m) => <li key={m.id}><b>{m.name}</b> · {m.dose} · {scheduleText(m)}{m.frequency !== "instructions" ? ` · ${m.start} to ${m.end}` : ""}{m.notes ? ` · ${m.notes}` : ""}</li>)}</ol>
        {row.instructions && <pre className="vt-pre">{row.instructions}</pre>}
        <p><b>Follow-up:</b> {row.follow_up_date || "Not set"}</p>
        <p className="vt-note">Private notes are not included. Once sent, the patient can see this prescription in their app and it cannot be edited (only voided).</p>
      </article>
      {allergyHits.length > 0 && (
        <label className="vt-switch"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have reviewed the allergy warning and still want to prescribe.</label>
      )}
      {state.message && <p className="vt-note" role="status">{state.message}</p>}
      <div className="vt-footer">
        <Button intent="secondary" onClick={() => onEdit("home")}>Back</Button>
        <Button loading={state.busy} disabled={Boolean(error) || (allergyHits.length > 0 && !ack)} onClick={send} icon={<Send size={18} />}>Send Rx</Button>
      </div>
    </>
  );
}

export function SentScreen({ rx, patient, clinic, onDone }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const run = (label, fn) => async () => {
    setBusy(label); setMsg("");
    try { await fn(); } catch { setMsg(`Could not ${label.toLowerCase()}. Try again.`); } finally { setBusy(""); }
  };
  const pdf = () => import("./prescriptionPdf.js");

  return (
    <>
      <div className="vt-sent" role="status"><CheckCircle2 size={28} /><div><strong>Sent {rxNumber(rx)}</strong><span>The patient can now see it in their app.</span></div></div>
      <div className="vt-actions">
        <Button loading={busy === "Share"} disabled={!!busy} icon={<Share2 size={18} />} onClick={run("Share", async () => { const r = await (await pdf()).sharePrescriptionPdf(rx, clinic, { phone: patient.mobile }); if (r.via === "download-and-whatsapp") setMsg("PDF downloaded. WhatsApp opened: attach the downloaded PDF to the chat."); })}>Share on WhatsApp</Button>
        <Button intent="secondary" loading={busy === "Print"} disabled={!!busy} icon={<Printer size={18} />} onClick={run("Print", async () => (await pdf()).printPrescriptionPdf(rx, clinic))}>Print</Button>
        <Button intent="secondary" loading={busy === "Download"} disabled={!!busy} icon={<Download size={18} />} onClick={run("Download", async () => (await pdf()).savePrescriptionPdf(rx, clinic))}>Download PDF</Button>
        <Button intent="secondary" loading={busy === "Update care plan"} disabled={!!busy} onClick={run("Update care plan", async () => {
          if (!window.confirm("Replace this patient's care plan with these medicines? Their reminders will update.")) return;
          const { publishCarePlan } = await import("./CarePlan.jsx");
          const result = await publishCarePlan(patient.id, toCarePlan(rx));
          setMsg(result.message);
        })}>Add to care plan reminders</Button>
      </div>
      {msg && <p className="vt-note" role="status">{msg}</p>}
      <div className="vt-footer"><Button intent="secondary" onClick={onDone}>Back to patient</Button></div>
    </>
  );
}
