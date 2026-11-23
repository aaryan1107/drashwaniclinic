// Dev-only harness for the new-patient medical profile. Prints the saved result below the form.
import "./theme.js";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import PatientMedicalInfo from "../src/MedicalProfile.jsx";
import { profileToRecordFields } from "../src/medicalProfile.js";

function Harness() {
  const [done, setDone] = useState(null);
  return done
    ? <pre style={{ whiteSpace: "pre-wrap", padding: 16, color: "var(--ink)" }}>{JSON.stringify(profileToRecordFields(done), null, 2)}</pre>
    : <PatientMedicalInfo source="google" googleProfile={{ name: "Aaryan Kansal", email: "test@example.com" }} onBack={() => {}} onDone={async (p) => setDone(p)} />;
}
createRoot(document.getElementById("root")).render(<Harness />);
