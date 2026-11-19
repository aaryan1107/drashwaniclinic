// Dev-only harness for the first-run patient tutorial. Uses a fake user id; the seen flag is cleared on load.
import "./theme.js";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import PatientTutorial from "../src/PatientTutorial.jsx";

const userId = "fake-user";
try { localStorage.removeItem(`clinic-tutorial-seen:${userId}`); } catch { /* ignore */ }

function Harness() {
  const [open, setOpen] = useState(true);
  return open ? <PatientTutorial userId={userId} onClose={() => setOpen(false)} />
    : <button type="button" className="primary-button" onClick={() => setOpen(true)}>Show again</button>;
}
createRoot(document.getElementById("root")).render(<Harness />);
