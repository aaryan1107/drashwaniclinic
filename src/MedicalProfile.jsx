// New-patient medical profile: four short steps. Only the first step (name, mobile, age) and the consent tick
// block progress; everything else can be skipped and filled in later with the doctor.
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, Plus, ShieldCheck, X } from "lucide-react";
import { Button } from "./ui/Button.jsx";
import {
  ACTIVITY, ALCOHOL, BLOOD_GROUPS, COMMON_DRUG_ALLERGIES, CONDITION_GROUPS, CONSULT_MODES, DIABETES_COMPLICATIONS,
  COST_SKIPPING, DIABETES_DURATIONS, DIABETES_TREATMENTS, DIET, FAMILY_HISTORY, HOME_CHECKS, HOME_DEVICES, HOSPITAL_STAYS,
  HYPO_AWARENESS, HYPO_FREQUENCY, LANGUAGES, LAST_CHECK, MISSED_DOSES, MOOD_ANSWERS, MOOD_QUESTIONS, PAST_INFECTIONS,
  PREGNANCY_PLANS, SEXUAL_HEALTH, SLEEP, SLEEP_SIGNS, SMOKING, SUPPORT, SYMPTOMS_NOW, VACCINES,
  bmi, bmiBand, emptyMedicine, emptyProfile, hasDiabetes, profileForStorage, stepProblems
} from "./medicalProfile.js";
import "./medical-profile.css";

const STEPS = [
  ["About you", "Basic details so the clinic can reach you."],
  ["Your health", "What you live with and how it is going."],
  ["Medicines and allergies", "What you take, and what you must not take."],
  ["Daily life and contacts", "Habits, an emergency contact and consent."]
];

function Chips({ options, value, onChange, legend }) {
  const toggle = (item) => onChange(value.includes(item) ? value.filter((entry) => entry !== item) : [...value, item]);
  return (
    <div className="chip-wrap" role="group" aria-label={legend}>
      {options.map((item) => (
        <label className="chip-check" key={item}>
          <input type="checkbox" checked={value.includes(item)} onChange={() => toggle(item)} />
          <span>{item}</span>
        </label>
      ))}
    </div>
  );
}

function Choice({ options, value, onChange, legend }) {
  return (
    <div className="mp-choice" role="radiogroup" aria-label={legend}>
      {options.map((item) => (
        <button key={item} type="button" role="radio" aria-checked={value === item}
          className={value === item ? "is-on" : ""} onClick={() => onChange(value === item ? "" : item)}>
          {item}
        </button>
      ))}
    </div>
  );
}

function Block({ title, hint, children }) {
  return (
    <section className="mp-block">
      <h3>{title}</h3>
      {hint && <p className="mp-hint">{hint}</p>}
      {children}
    </section>
  );
}

function AboutStep({ profile, set }) {
  const value = bmi(profile.heightCm, profile.weight);
  return (
    <>
      <div className="form-card">
        <label>Full name<input value={profile.fullName} autoComplete="name" onChange={(e) => set("fullName", e.target.value)} placeholder="Patient full name" /></label>
        <label>Mobile number<input value={profile.phone} inputMode="tel" autoComplete="tel" onChange={(e) => set("phone", e.target.value)} placeholder="10 digit mobile number" /></label>
        <label className="mp-check">
          <input type="checkbox" checked={profile.sameWhatsapp} onChange={(e) => set("sameWhatsapp", e.target.checked)} />
          WhatsApp is on the same number
        </label>
        {!profile.sameWhatsapp && (
          <label>WhatsApp number<input value={profile.whatsapp} inputMode="tel" onChange={(e) => set("whatsapp", e.target.value)} placeholder="10 digit WhatsApp number" /></label>
        )}
        <div className="two-col">
          <label>Age<input value={profile.age} inputMode="numeric" onChange={(e) => set("age", e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Years" /></label>
          <label>Gender<select value={profile.gender} onChange={(e) => set("gender", e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select></label>
        </div>
      </div>

      <div className="form-card">
        <div className="two-col">
          <label>Height<input value={profile.heightCm} inputMode="decimal" onChange={(e) => set("heightCm", e.target.value)} placeholder="cm" /></label>
          <label>Weight<input value={profile.weight} inputMode="decimal" onChange={(e) => set("weight", e.target.value)} placeholder="kg" /></label>
        </div>
        {value !== null && <p className="mp-bmi"><strong>BMI {value}</strong> <span>{bmiBand(value)}</span></p>}
        <div className="two-col">
          <label>Blood group<select value={profile.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>{BLOOD_GROUPS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Language<select value={profile.language} onChange={(e) => set("language", e.target.value)}>{LANGUAGES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        {profile.gender === "Female" && (
          <label>Pregnant or breastfeeding?<select value={profile.pregnant} onChange={(e) => set("pregnant", e.target.value)}><option>No</option><option>Pregnant</option><option>Breastfeeding</option></select></label>
        )}
        {profile.gender === "Female" && !(Number(profile.age) > 50) && (
          <div className="mp-field"><span>Planning a pregnancy?</span><Choice legend="Planning pregnancy" options={PREGNANCY_PLANS} value={profile.planningPregnancy} onChange={(v) => set("planningPregnancy", v)} /></div>
        )}
        <label>ABHA number (optional)<input value={profile.abha} inputMode="numeric" onChange={(e) => set("abha", e.target.value)} placeholder="14 digit health ID" /></label>
      </div>
    </>
  );
}

function HealthStep({ profile, set }) {
  const showWomen = profile.gender === "Female";
  const diabetes = hasDiabetes(profile);
  const setDiabetes = (key, value) => set("diabetes", (current) => ({ ...current, [key]: value }));
  return (
    <>
      <Block title="Conditions you have" hint="Tick everything that applies. Leave blank if none.">
        {CONDITION_GROUPS.filter((group) => !group.femaleOnly || showWomen).map((group) => (
          <div className="mp-group" key={group.id}>
            <h4>{group.label}</h4>
            <Chips legend={group.label} options={group.items} value={profile.conditions} onChange={(next) => set("conditions", next)} />
          </div>
        ))}
        <label>Anything else?<input value={profile.otherCondition} onChange={(e) => set("otherCondition", e.target.value)} placeholder="Another condition not listed" /></label>
      </Block>

      {diabetes && (
        <Block title="About your diabetes" hint="Helps Dr Ashwani plan your first visit.">
          <div className="mp-field"><span>Since when?</span><Choice legend="Diabetes duration" options={DIABETES_DURATIONS} value={profile.diabetes.duration} onChange={(v) => setDiabetes("duration", v)} /></div>
          <div className="mp-field"><span>Treatment now</span><Choice legend="Diabetes treatment" options={DIABETES_TREATMENTS} value={profile.diabetes.treatment} onChange={(v) => setDiabetes("treatment", v)} /></div>
          <div className="mp-field"><span>Check sugar at home?</span><Choice legend="Home sugar checks" options={HOME_CHECKS} value={profile.diabetes.homeChecks} onChange={(v) => setDiabetes("homeChecks", v)} /></div>
          <div className="mp-field"><span>Home sugar device</span><Choice legend="Home sugar device" options={HOME_DEVICES} value={profile.diabetes.device} onChange={(v) => setDiabetes("device", v)} /></div>
          <div className="mp-field"><span>Low sugar episodes (sweating, shaking, feeling faint)</span><Choice legend="Low sugar episodes" options={HYPO_FREQUENCY} value={profile.diabetes.hypoFrequency} onChange={(v) => setDiabetes("hypoFrequency", v)} /></div>
          {profile.diabetes.hypoFrequency && profile.diabetes.hypoFrequency !== "Never" && (
            <div className="mp-field"><span>Do you feel a low coming?</span><Choice legend="Low sugar awareness" options={HYPO_AWARENESS} value={profile.diabetes.hypoAwareness} onChange={(v) => setDiabetes("hypoAwareness", v)} /></div>
          )}
          <div className="mp-field"><span>Hospital stays because of diabetes</span><Choice legend="Hospital stays for diabetes" options={HOSPITAL_STAYS} value={profile.diabetes.hospitalStays} onChange={(v) => setDiabetes("hospitalStays", v)} /></div>
          <div className="mp-field"><span>Any complications?</span><Chips legend="Diabetes complications" options={DIABETES_COMPLICATIONS} value={profile.diabetes.complications} onChange={(v) => setDiabetes("complications", v)} /></div>
          <div className="mp-field"><span>Last eye check (dilated)</span><Choice legend="Last eye check" options={LAST_CHECK} value={profile.diabetes.lastEye} onChange={(v) => setDiabetes("lastEye", v)} /></div>
          <div className="mp-field"><span>Last foot check by a doctor</span><Choice legend="Last foot check" options={LAST_CHECK} value={profile.diabetes.lastFoot} onChange={(v) => setDiabetes("lastFoot", v)} /></div>
          <div className="mp-field"><span>Last dental check</span><Choice legend="Last dental check" options={LAST_CHECK} value={profile.diabetes.lastDental} onChange={(v) => setDiabetes("lastDental", v)} /></div>
        </Block>
      )}

      <Block title="Latest numbers" hint="From your last test or home reading. Skip what you do not have.">
        <div className="mp-plain">
          <div className="two-col">
            <label>Fasting sugar<input value={profile.fasting} inputMode="decimal" onChange={(e) => set("fasting", e.target.value)} placeholder="mg/dL" /></label>
            <label>After meals<input value={profile.postMeal} inputMode="decimal" onChange={(e) => set("postMeal", e.target.value)} placeholder="mg/dL" /></label>
            <label>HbA1c<input value={profile.hba1c} inputMode="decimal" onChange={(e) => set("hba1c", e.target.value)} placeholder="%" /></label>
            <label>Blood pressure<input value={profile.bp} onChange={(e) => set("bp", e.target.value)} placeholder="Top / bottom" /></label>
          </div>
        </div>
      </Block>

      <Block title="What are you feeling now?">
        <Chips legend="Current symptoms" options={SYMPTOMS_NOW} value={profile.symptoms} onChange={(next) => set("symptoms", next)} />
        <label>In your own words<textarea rows={3} value={profile.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Why are you joining the clinic app?" /></label>
      </Block>

      <Block title="Mood and worry" hint="Over the last 2 weeks, how often have you been bothered by these? Only you and Dr Ashwani see the answers.">
        {MOOD_QUESTIONS.map(([key, question]) => (
          <div className="mp-field" key={key}>
            <span>{question}</span>
            <Choice legend={question} options={MOOD_ANSWERS} value={profile.mood[key]} onChange={(v) => set("mood", (current) => ({ ...current, [key]: v }))} />
          </div>
        ))}
      </Block>

      <Block title="Sleep and private health" hint="Optional. Skip anything you prefer to discuss in person.">
        <div className="mp-field"><span>Sleep problems you notice</span><Chips legend="Sleep signs" options={SLEEP_SIGNS} value={profile.sleepSigns} onChange={(next) => set("sleepSigns", next)} /></div>
        <div className="mp-field"><span>Sexual health</span><Choice legend="Sexual health" options={SEXUAL_HEALTH} value={profile.sexualHealth} onChange={(v) => set("sexualHealth", v)} /></div>
      </Block>
    </>
  );
}

function MedicinesStep({ profile, set }) {
  const listId = useId();
  const [medicineCatalog, setMedicineCatalog] = useState([]);
  useEffect(() => { import("./medicine-catalog.json").then((module) => setMedicineCatalog(module.default)); }, []);
  const setMedicine = (index, key, value) => set("medicines", profile.medicines.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  const removeMedicine = (index) => set("medicines", profile.medicines.length === 1 ? [emptyMedicine()] : profile.medicines.filter((_, i) => i !== index));
  const setSurgery = (index, value) => set("surgeries", profile.surgeries.map((item, i) => (i === index ? value : item)));
  return (
    <>
      <Block title="Medicines you take now" hint="Include tablets, insulin and anything from another doctor. Check the strip if unsure.">
        <datalist id={listId}>{medicineCatalog.map((name) => <option key={name} value={name} />)}</datalist>
        {profile.medicines.map((item, index) => (
          <div className="mp-medicine" key={index}>
            <label>Medicine<input list={listId} value={item.name} onChange={(e) => setMedicine(index, "name", e.target.value)} placeholder="e.g. Metformin" /></label>
            <label>Dose and timing<input value={item.dose} onChange={(e) => setMedicine(index, "dose", e.target.value)} placeholder="500 mg, twice a day" /></label>
            <button type="button" className="mp-icon" onClick={() => removeMedicine(index)} aria-label={`Remove medicine ${index + 1}`}><X size={18} /></button>
          </div>
        ))}
        <Button intent="secondary" icon={<Plus size={18} />} onClick={() => set("medicines", [...profile.medicines, emptyMedicine()])}>Add another medicine</Button>
        <label>Vitamins or supplements<input value={profile.supplements} onChange={(e) => set("supplements", e.target.value)} placeholder="e.g. Vitamin D, B12, ayurvedic" /></label>
      </Block>

      <Block title="Taking your medicines" hint="No judgement. This helps the doctor choose a plan you can stick to.">
        <div className="mp-field"><span>Missed doses</span><Choice legend="Missed doses" options={MISSED_DOSES} value={profile.missedDoses} onChange={(v) => set("missedDoses", v)} /></div>
        <div className="mp-field"><span>Skipped medicine because of cost</span><Choice legend="Skipped medicine because of cost" options={COST_SKIPPING} value={profile.costSkipping} onChange={(v) => set("costSkipping", v)} /></div>
        <label>Side effects you notice<input value={profile.sideEffects} onChange={(e) => set("sideEffects", e.target.value)} placeholder="e.g. stomach upset, dizziness" /></label>
      </Block>

      <Block title="Allergies" hint="Medicines that caused a reaction.">
        <Chips legend="Drug allergies" options={COMMON_DRUG_ALLERGIES} value={profile.drugAllergies} onChange={(next) => set("drugAllergies", next)} />
        <label>Other allergy (medicine, food, dust)<input value={profile.otherAllergy} onChange={(e) => set("otherAllergy", e.target.value)} placeholder="Name it here" /></label>
        <label>What happened?<input value={profile.allergyReaction} onChange={(e) => set("allergyReaction", e.target.value)} placeholder="Rash, swelling, breathing trouble" /></label>
      </Block>

      <Block title="Past surgeries or hospital stays">
        {profile.surgeries.map((item, index) => (
          <div className="mp-row" key={index}>
            <input aria-label={`Surgery or stay ${index + 1}`} value={item} onChange={(e) => setSurgery(index, e.target.value)} placeholder="What and when, e.g. Appendix removed 2015" />
            <button type="button" className="mp-icon" onClick={() => set("surgeries", profile.surgeries.filter((_, i) => i !== index))} aria-label={`Remove entry ${index + 1}`}><X size={18} /></button>
          </div>
        ))}
        <Button intent="secondary" icon={<Plus size={18} />} onClick={() => set("surgeries", [...profile.surgeries, ""])}>Add surgery or stay</Button>
      </Block>

      <Block title="Vaccines and past infections" hint="Optional. Tick what applies.">
        <div className="mp-field"><span>Vaccines you have had</span><Chips legend="Vaccines" options={VACCINES} value={profile.vaccines} onChange={(next) => set("vaccines", next)} /></div>
        <div className="mp-field"><span>Past infections</span><Chips legend="Past infections" options={PAST_INFECTIONS} value={profile.pastInfections} onChange={(next) => set("pastInfections", next)} /></div>
      </Block>

      <Block title="Family history" hint="Parents, brothers or sisters.">
        <Chips legend="Family history" options={FAMILY_HISTORY} value={profile.familyHistory} onChange={(next) => set("familyHistory", next)} />
        <label>Who?<input value={profile.familyNote} onChange={(e) => set("familyNote", e.target.value)} placeholder="e.g. Father had diabetes at 45" /></label>
      </Block>
    </>
  );
}

function LifeStep({ profile, set, problems }) {
  return (
    <>
      <Block title="Habits">
        <div className="mp-field"><span>Smoking</span><Choice legend="Smoking" options={SMOKING} value={profile.smoking} onChange={(v) => set("smoking", v || "Never")} /></div>
        {profile.smoking === "Currently" && <label>Cigarettes or bidis a day<input value={profile.smokingPerDay} inputMode="numeric" onChange={(e) => set("smokingPerDay", e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="5" /></label>}
        <div className="mp-field"><span>Alcohol</span><Choice legend="Alcohol" options={ALCOHOL} value={profile.alcohol} onChange={(v) => set("alcohol", v || "Never")} /></div>
        <label className="mp-check"><input type="checkbox" checked={profile.chewsTobacco} onChange={(e) => set("chewsTobacco", e.target.checked)} />I chew tobacco or gutka</label>
        <div className="mp-field"><span>Activity</span><Choice legend="Activity" options={ACTIVITY} value={profile.activity} onChange={(v) => set("activity", v || "Light walking")} /></div>
        <div className="mp-field"><span>Diet</span><Choice legend="Diet" options={DIET} value={profile.diet} onChange={(v) => set("diet", v || "Vegetarian")} /></div>
        <div className="mp-field"><span>Who helps you with your health?</span><Choice legend="Support at home" options={SUPPORT} value={profile.support} onChange={(v) => set("support", v)} /></div>
        <div className="mp-field"><span>Sleep</span><Choice legend="Sleep" options={SLEEP} value={profile.sleep} onChange={(v) => set("sleep", v || "7 to 8 hours")} /></div>
      </Block>

      <Block title="Emergency contact" hint="Someone the clinic can call if you cannot be reached.">
        <div className="mp-plain">
          <label>Name<input value={profile.emergencyName} autoComplete="off" onChange={(e) => set("emergencyName", e.target.value)} placeholder="Contact name" /></label>
          <div className="two-col">
            <label>Relation<input value={profile.emergencyRelation} onChange={(e) => set("emergencyRelation", e.target.value)} placeholder="Wife, son" /></label>
            <label>Mobile<input value={profile.emergencyPhone} inputMode="tel" onChange={(e) => set("emergencyPhone", e.target.value)} placeholder="98765 43210" /></label>
          </div>
        </div>
      </Block>

      <Block title="How would you like to consult?">
        <Choice legend="Preferred consult mode" options={CONSULT_MODES} value={profile.preferredMode} onChange={(v) => set("preferredMode", v || "Clinic visit")} />
      </Block>

      <label className="consent-line">
        <input type="checkbox" checked={profile.consent} onChange={(e) => set("consent", e.target.checked)} />
        I consent to my health information being stored on servers outside India (South Korea) and used to look after my care, and to follow-up reminders.
      </label>
      <p className="legal-links">
        Read the <button type="button" className="legal-link" onClick={() => window.location.assign("/privacy.html")}>Privacy policy</button> and
        the <button type="button" className="legal-link" onClick={() => window.location.assign("/terms.html")}>Terms of use</button>.
        You can withdraw consent at any time.
      </p>
      <p className="mp-note"><ShieldCheck size={16} aria-hidden="true" /> Only you and Dr Ashwani can see this. It supports the doctor and does not replace a visit.</p>
      {problems.length > 0 && <ul className="mp-problems" role="alert">{problems.map((item) => <li key={item}>{item}</li>)}</ul>}
    </>
  );
}

export default function PatientMedicalInfo({ source, googleProfile, initialProfile, onBack, onDone, onSavingChange }) {
  const [profile, setProfile] = useState(() => {
    const defaults = emptyProfile(googleProfile);
    if (!initialProfile) return defaults;
    return {
      ...defaults,
      ...initialProfile,
      diabetes: { ...defaults.diabetes, ...initialProfile.diabetes },
      mood: { ...defaults.mood, ...initialProfile.mood },
      medicines: Array.isArray(initialProfile.medicines) && initialProfile.medicines.length
        ? initialProfile.medicines : defaults.medicines,
      consent: false
    };
  });
  const [step, setStep] = useState(0);
  const [problems, setProblems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [openSavedIntake, setOpenSavedIntake] = useState(null);
  const top = useRef(null);
  const set = (key, value) => { setProfile((current) => ({ ...current, [key]: typeof value === "function" ? value(current[key]) : value })); setProblems([]); };
  const last = step === STEPS.length - 1;

  const goTo = (next) => {
    setStep(next);
    setProblems([]);
    setSaveFailed(false);
    top.current?.scrollIntoView({ block: "start" });
  };
  const next = async () => {
    if (submitting) return;
    const found = stepProblems(step, profile);
    if (found.length) { setProblems(found); return; }
    if (!last) { goTo(step + 1); return; }
    setSubmitting(true);
    onSavingChange?.(true);
    setSaveFailed(false);
    try {
      const open = await onDone(profileForStorage(profile));
      if (typeof open === "function") setOpenSavedIntake(() => open);
    } catch {
      setSaveFailed(true);
    } finally {
      setSubmitting(false);
      onSavingChange?.(false);
    }
  };

  const StepBody = [AboutStep, HealthStep, MedicinesStep, LifeStep][step];
  return (
    <section className="screen signup-screen mp">
      <div className="top-action" ref={top}>
        <button type="button" disabled={submitting || Boolean(openSavedIntake)} onClick={() => (step === 0 ? onBack() : goTo(step - 1))} aria-label="Back"><ChevronLeft size={20} /></button>
        <strong>Medical profile</strong>
        <span />
      </div>

      <div className="mp-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map(([name], index) => <span key={name} className={index <= step ? "is-done" : ""} />)}
      </div>
      <p className="mp-step">Step {step + 1} of {STEPS.length}</p>
      <h2>{step === 0 && source === "google" ? "Complete your health profile" : STEPS[step][0]}</h2>
      <p className="screen-copy">{STEPS[step][1]}</p>

      {step === 0 && googleProfile && (
        <div className="integration-card google-connected">
          <span className="google-dot">G</span>
          <div>
            <strong>Google connected</strong>
            <small>{googleProfile.email} will be linked after consent.</small>
          </div>
        </div>
      )}

      {openSavedIntake ? (
        <p role="status">Your earlier intake was saved. Contact the clinic to update any additional details.</p>
      ) : <StepBody profile={profile} set={set} problems={problems} />}
      {!last && problems.length > 0 && <ul className="mp-problems" role="alert">{problems.map((item) => <li key={item}>{item}</li>)}</ul>}

      <div className="mp-actions">
        {saveFailed && <p className="mp-problems" role="alert">We could not save your medical profile. Please try again.</p>}
        <Button block loading={submitting} icon={last ? <Check size={18} /> : null} onClick={openSavedIntake || next}>
          {openSavedIntake ? "Continue to Home" : last ? (saveFailed ? "Retry save" : "Create patient app") : <>Continue <ArrowRight size={18} /></>}
        </Button>
        {(step === 1 || step === 2) && <Button intent="ghost" block onClick={() => goTo(step + 1)}>Skip for now</Button>}
      </div>
    </section>
  );
}
