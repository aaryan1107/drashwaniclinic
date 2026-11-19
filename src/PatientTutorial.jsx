// First-run tour of the patient app. Shows once per account, right after sign-up or first sign-in.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Activity, Bell, CalendarCheck, Pill } from "lucide-react";
import "./welcome.css";

const STEPS = [
  [CalendarCheck, "Book a clinic visit", "Pick a day and time, then pay the ₹700 fee in the app. Your slot is confirmed as soon as the payment goes through."],
  [Activity, "Log your readings", "Add blood sugar, blood pressure, weight and HbA1c so Dr Ashwani can see how you are doing between visits."],
  [Pill, "See your prescriptions", "Medicines and instructions from your visit appear here, ready to read or download."],
  [Bell, "Reminders and help", "Turn on reminders for medicines and follow-ups, and ask the clinic assistant if you get stuck."]
];

const seenKey = (userId) => `clinic-tutorial-seen:${userId}`;

export function shouldShowTutorial(userId) {
  if (!userId) return false;
  try { return localStorage.getItem(seenKey(userId)) !== "1"; } catch { return false; }
}

export default function PatientTutorial({ userId, onClose }) {
  const [step, setStep] = useState(0);
  const reduce = useReducedMotion();
  const nextRef = useRef(null);
  const last = step === STEPS.length - 1;
  const [Icon, title, body] = STEPS[step];

  const finish = () => {
    try { localStorage.setItem(seenKey(userId), "1"); } catch { /* shows again next time */ }
    onClose();
  };

  useEffect(() => { nextRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="tut-backdrop">
      <motion.section className="tut" role="dialog" aria-modal="true" aria-labelledby="tut-title"
        initial={reduce ? false : { y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}>
        <div className="tut-top">
          <span className="tut-count">{step + 1} of {STEPS.length}</span>
          <button type="button" className="tut-skip" onClick={finish}>Skip</button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} style={{ display: "grid", gap: 12 }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
            <span className="tut-icon" aria-hidden="true"><Icon size={24} /></span>
            <h2 id="tut-title">{title}</h2>
            <p>{body}</p>
          </motion.div>
        </AnimatePresence>
        <div className="tut-dots" aria-hidden="true">
          {STEPS.map(([, label], index) => <span key={label} className={index === step ? "is-on" : ""} />)}
        </div>
        <div className="tut-actions">
          <button type="button" className="secondary-button" onClick={() => setStep(step - 1)} disabled={step === 0}>Back</button>
          <button ref={nextRef} type="button" className="primary-button" onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? "Start using the app" : "Next"}
          </button>
        </div>
      </motion.section>
    </div>
  );
}
