import assert from "node:assert/strict";
import {
  composeNotes, durationDays, durationText, hindiDose, hindiInstruction, normalizeFrequency, slotsOf, timesFor
} from "./prescriptionFields.js";

// Legacy codes map onto patterns
assert.equal(normalizeFrequency("BD (twice daily)"), "1-0-1");
assert.equal(normalizeFrequency("HS (at night)"), "0-0-1");
assert.equal(normalizeFrequency("1-1-1"), "1-1-1");
assert.equal(normalizeFrequency("SOS (if needed)"), "SOS");
assert.equal(normalizeFrequency("whatever"), "");
assert.equal(normalizeFrequency(""), "");

assert.deepEqual(slotsOf("1-0-1"), ["morning", "night"]);
assert.deepEqual(slotsOf("1-1-1-1"), ["morning", "afternoon", "evening", "night"]);
assert.deepEqual(slotsOf("SOS"), []);
assert.deepEqual(timesFor("1-1-1"), ["08:00", "14:00", "21:00"]);

// Duration
assert.equal(durationDays({ duration: 5, duration_unit: "days" }), 5);
assert.equal(durationDays({ duration: 2, duration_unit: "weeks" }), 14);
assert.equal(durationDays({ duration: 1, duration_unit: "months" }), 30);
assert.equal(durationDays({ duration_unit: "continue" }), 0);
assert.equal(durationText({ duration: 1, duration_unit: "months" }), "1 Month");
assert.equal(durationText({ duration: 5 }), "5 Days");
assert.equal(durationText({ duration_unit: "continue" }), "Continue");

// Hindi dose
assert.equal(hindiDose("1 tablet"), "1 गोली");
assert.equal(hindiDose("7.5 ml"), "7.5 मिली");
assert.equal(hindiDose("500 mg"), "500 mg");
assert.equal(hindiDose("2 drops"), "2 बूँद");
assert.equal(hindiDose(""), "");

// Hindi lines for the cases in the clinic's sample prescription
assert.equal(
  hindiInstruction({ dose: "1 tablet", frequency: "1-0-1", when: "After meal", duration: 10, duration_unit: "days" }),
  "1 गोली - दिन में दो बार, नाश्ते के बाद और रात के खाने के बाद, 10 दिनों तक लें।"
);
assert.equal(
  hindiInstruction({ dose: "1 tablet", frequency: "0-0-1", when: "After dinner", duration: 5, duration_unit: "days" }),
  "1 गोली - रात को, रात के खाने के बाद, 5 दिनों तक लें।"
);
assert.equal(
  hindiInstruction({ dose: "7.5 ml", frequency: "1-1-1", when: "After meal", duration: 5, duration_unit: "days" }),
  "7.5 मिली - दिन में तीन बार, नाश्ते के बाद, दोपहर के खाने के बाद और रात के खाने के बाद, 5 दिनों तक लें।"
);
assert.equal(
  hindiInstruction({ dose: "1 tablet", frequency: "1-0-0", when: "After breakfast", duration: 1, duration_unit: "months" }),
  "1 गोली - सुबह, नाश्ते के बाद, 1 महीने तक लें।"
);
assert.equal(hindiInstruction({ dose: "1 tablet", frequency: "SOS", duration: 3, duration_unit: "days" }), "1 गोली - ज़रूरत पड़ने पर, 3 दिनों तक लें।");
assert.equal(hindiInstruction({ frequency: "Stat" }), "तुरंत, एक बार लें।");
assert.equal(hindiInstruction({ dose: "2 drops", frequency: "1-0-1", route: "Eye drops", duration: 7 }), "2 बूँद - दिन में दो बार, 7 दिनों तक आँख में डालें।");
assert.equal(hindiInstruction({ dose: "1 tablet", frequency: "" }), "");

// Notes line used by lists and the care plan
assert.equal(composeNotes({ frequency: "1-0-1", when: "After meal", duration: 5, remarks: "With karvol" }), "1-0-1 · After meal · 5 Days · With karvol");

console.log("Prescription field tests passed.");
