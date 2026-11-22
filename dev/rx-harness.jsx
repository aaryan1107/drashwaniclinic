// Dev-only: builds the prescription PDF from sample data shaped like the clinic's reference prescription.
import { buildPrescriptionPdf } from "../src/prescriptionPdf.js";
import { toRxMedicine } from "../src/visitRx.js";

const item = (display, details, generic = "") => ({ display, details: { generic, ...details } });
const day = "2026-11-22";
const meds = [
  item("Otrivin Paediatric 0.05% Nasal Spray", { form: "Spray", frequency: "1-0-1", when: "After meal", duration: 5, duration_unit: "days", remarks: "Steam inhalation twice daily with karvol plus cap", route: "Other" }),
  item("Ebast-DC Tablet", { form: "Tablet", dose: "1 tablet", frequency: "0-0-1", when: "After dinner", duration: 5, duration_unit: "days", route: "Oral" }, "Ebastine (10mg) + Phenylephrine (10mg)"),
  item("Amigra M 10mg/120mg Tablet", { form: "Tablet", dose: "1 tablet", frequency: "0-0-1", when: "After dinner", duration: 10, duration_unit: "days", route: "Oral" }, "Montelukast (10mg) + Fexofenadine (120mg)"),
  item("Asthakind-DX Syrup Sugar Free", { form: "Syrup", dose: "7.5 ml", frequency: "1-1-1", when: "After meal", duration: 5, duration_unit: "days", route: "Oral" }, "Phenylephrine (5mg/5ml) + Chlorpheniramine Maleate (2mg/5ml) + Dextromethorphan Hydrobromide (15mg/5ml)"),
  item("Cepodem 200 Tablet", { form: "Tablet", dose: "1 tablet", frequency: "1-0-1", when: "After meal", duration: 5, duration_unit: "days", route: "Oral" }, "Cefpodoxime Proxetil (200mg)"),
  item("Tab Vankesh", { form: "Tablet", dose: "1 tablet", frequency: "1-0-0", when: "After breakfast", duration: 1, duration_unit: "months", remarks: "For skin", route: "Oral" }),
  item("Cap Ironemic Plus", { form: "Capsule", dose: "1 capsule", frequency: "0-0-1", when: "After dinner", duration: 1, duration_unit: "months", remarks: "For skin", route: "Oral" }),
  item("Calpol 500mg Tablet", { form: "Tablet", dose: "1 tablet", frequency: "1-1-1", when: "After meal", duration: 3, duration_unit: "days", remarks: "On fever more than 99 degree", route: "Oral" }, "Paracetamol (500mg)")
];
const rx = {
  id: "23a4b0ca-1bda-5453-9a0e-8f1388086064", status: "issued", created_at: "2026-11-22T14:18:00Z",
  patient_name: "Test Patient (fake)", patient_age: 33, patient_gender: "Female",
  diagnosis: "Symptoms: Cold with nasal blockage, Cough",
  medicines: Array.from({ length: Number(new URLSearchParams(location.search).get("copies") || 1) }, () => meds).flat().map((m, i) => toRxMedicine(m, day, i)),
  instructions: "Advice: Plenty of oral fluids. Warm water with ginger, tulsi and honey three times a day.",
  follow_up_date: "2026-12-22", doctor_name: "Dr. Ashwani Kansal"
};
const doc = await buildPrescriptionPdf(rx, { name: "Dr Ashwani Family Clinic", address: "Fake address for development only" }, { phone: "+91 90000 00000" });
document.getElementById("pdf").src = URL.createObjectURL(doc.output("blob"));
window.__pages = doc.getNumberOfPages();
