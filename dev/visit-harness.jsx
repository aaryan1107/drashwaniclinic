// Dev-only harness: renders the visit workspace with an obviously fake patient. Not part of the production build.
// ?sent=1 renders the post-send screen with a fake prescription row (no network) to test PDF/share/print.
import "./theme.js";
import "../src/visit.css";
import { createRoot } from "react-dom/client";
import Visit from "../src/Visit.jsx";
import { SentScreen } from "../src/VisitSend.jsx";
import { visitToPrescriptionRow } from "../src/visitRx.js";

const patient = { id: "fake-001", name: "Test Patient (fake)", age: 45, gender: "Male", mobile: "" };
const clinic = { id: "test", name: "Test Clinic (fake)", address: "Fake address for development only" };
const root = createRoot(document.getElementById("root"));
if (new URLSearchParams(location.search).has("sent")) {
  const visit = JSON.parse(localStorage.getItem("clinic.visit.draft.fake-001") || "null");
  const rx = { ...visitToPrescriptionRow(visit, { patient, clinic, doctorName: "Dr. Ashwani Kansal" }), id: "fake0000-0000", created_at: new Date().toISOString(), status: "issued" };
  root.render(<div className="vt"><SentScreen rx={rx} patient={patient} clinic={clinic} onDone={() => {}} /></div>);
} else {
  root.render(<Visit patient={patient} clinic={clinic} onBack={() => {}} />);
}
