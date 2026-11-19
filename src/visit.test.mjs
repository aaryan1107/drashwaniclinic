import assert from "node:assert/strict";
import { blankVisit, bmi, bmiCategory, carryForward, completedCount, egfr, sectionDone, toCelsius, vitalFlag, weightDose } from "./visit.js";

assert.equal(bmi(170, 70), 24.2);
assert.equal(bmi("", 70), null);
assert.equal(bmi(0, 70), null);
assert.equal(bmi(170, 700), null);                      // implausible
assert.equal(bmi(67, 154, { heightUnit: "in", weightUnit: "lb" }), 24.1);
assert.equal(bmiCategory(24.2), "Overweight risk (Asian cut-off)");
assert.equal(egfr(1.0, 50, "male"), 92);                // CKD-EPI 2021, hand-checked
assert.equal(egfr(1.0, 50, "female"), 69);
assert.equal(egfr(1.0, 10, "male"), null);              // adult formula only
assert.deepEqual(weightDose(20, 30, 3), { daily: 600, perDose: 200 });
assert.equal(weightDose(0, 30, 3), null);
assert.equal(Math.round(toCelsius(98.6, "F") * 10) / 10, 37);
assert.equal(vitalFlag("bp", { bp_sys: 150, bp_dia: 95 }), "High");
assert.equal(vitalFlag("bp", { bp_sys: 120, bp_dia: 80 }), "");
assert.equal(vitalFlag("temp", { temp: 101, units: { temp: "F" } }), "Fever");
assert.equal(vitalFlag("spo2", { spo2: 91 }), "Low");

const v = blankVisit("p1", "2026-11-18");
assert.equal(completedCount(v), 0);
v.vitals.pulse = "78";
v.items.push({ kind: "symptom", free_text: "fever" }, { kind: "medicine", term_id: "m" });
v.notes_private = "private";
assert.deepEqual(["vitals", "dx", "rx", "notes"].map((s) => sectionDone(s, v)), [true, true, true, true]);
assert.equal(completedCount(v), 4);

const cf = carryForward({ height: "170", weight: "70", pulse: "80", locked: { height: true }, units: { height: "cm" } });
assert.equal(cf.height, "170");
assert.equal(cf.weight, undefined);                     // only locked values carry forward
console.log("visit tests passed");
