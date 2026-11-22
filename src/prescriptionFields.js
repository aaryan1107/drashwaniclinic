// Prescription medicine fields in the layout Indian clinics use: morning-afternoon-night pattern, timing
// against meals, duration, English remarks and a plain Hindi instruction line. Pure functions, no React.

export const FREQUENCIES = [
  { value: "1-0-0", label: "1-0-0 Morning" },
  { value: "0-1-0", label: "0-1-0 Afternoon" },
  { value: "0-0-1", label: "0-0-1 Night" },
  { value: "1-0-1", label: "1-0-1 Morning, night" },
  { value: "1-1-0", label: "1-1-0 Morning, noon" },
  { value: "0-1-1", label: "0-1-1 Noon, night" },
  { value: "1-1-1", label: "1-1-1 Three times" },
  { value: "1-1-1-1", label: "1-1-1-1 Four times" },
  { value: "SOS", label: "SOS If needed" },
  { value: "Stat", label: "Stat Once, now" },
  { value: "Weekly", label: "Weekly" }
];

export const TIMINGS = ["", "After meal", "Before meal", "With meal", "After breakfast", "After dinner", "Empty stomach", "At bedtime"];
export const FORMS = ["", "Tablet", "Capsule", "Syrup", "Drops", "Spray", "Cream or ointment", "Injection", "Inhaler", "Other"];
export const DURATION_UNITS = [["days", "Days"], ["weeks", "Weeks"], ["months", "Months"], ["continue", "Continue"]];
export const DURATION_CHIPS = [3, 5, 7, 10, 15, 30];

// Older drafts and prescriptions stored "OD (once daily)" style codes. Map them onto the pattern list.
const LEGACY = { OD: "1-0-0", BD: "1-0-1", TDS: "1-1-1", QID: "1-1-1-1", HS: "0-0-1", SOS: "SOS", WEEKLY: "Weekly" };

export function normalizeFrequency(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const first = text.split(/\s+/)[0];
  if (FREQUENCIES.some((item) => item.value === first)) return first;
  return LEGACY[first.toUpperCase()] || "";
}

// Active dose slots for a pattern: ["morning", "afternoon", "night"] subsets; a fourth slot reads "evening".
export function slotsOf(pattern) {
  if (!/^[0-9]-[0-9]-[0-9](-[0-9])?$/.test(pattern)) return [];
  const parts = pattern.split("-").map(Number);
  const names = parts.length === 4 ? ["morning", "afternoon", "evening", "night"] : ["morning", "afternoon", "night"];
  return names.filter((_, index) => parts[index] > 0);
}

const TIMES_BY_SLOT = { morning: "08:00", afternoon: "14:00", evening: "18:00", night: "21:00" };
export const timesFor = (pattern) => slotsOf(pattern).map((slot) => TIMES_BY_SLOT[slot]);

const UNIT_DAYS = { days: 1, weeks: 7, months: 30 };

// Number of days a finite course runs, or 0 for "continue" and for a missing duration.
export function durationDays(details = {}) {
  const amount = Number(details.duration) || 0;
  const unit = details.duration_unit || "days";
  return amount > 0 && UNIT_DAYS[unit] ? amount * UNIT_DAYS[unit] : 0;
}

export function durationText(details = {}) {
  if ((details.duration_unit || "") === "continue") return "Continue";
  const amount = Number(details.duration) || 0;
  if (!amount) return "";
  const unit = details.duration_unit || "days";
  const word = { days: "Day", weeks: "Week", months: "Month" }[unit] || "Day";
  return `${amount} ${word}${amount === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------- Hindi instruction line
const HINDI_FORM = [
  [/^(tab|tablet|tablets|goli)$/i, "गोली"],
  [/^(cap|capsule|capsules)$/i, "कैप्सूल"],
  [/^(ml)$/i, "मिली"],
  [/^(drop|drops)$/i, "बूँद"],
  [/^(puff|puffs)$/i, "पफ"],
  [/^(spray|sprays)$/i, "स्प्रे"],
  [/^(tsp|teaspoon|teaspoons)$/i, "चम्मच"]
];

// "1 tablet" -> "1 गोली", "7.5 ml" -> "7.5 मिली", "500 mg" stays "500 mg". Returns "" when there is no dose.
export function hindiDose(dose = "") {
  const text = String(dose).trim();
  if (!text) return "";
  const match = /^(\d+(?:\.\d+)?|\d+\/\d+|half|one|two)\s*([A-Za-z]+)?/i.exec(text);
  if (!match) return text;
  const words = { half: "आधी", one: "1", two: "2" };
  const amount = words[match[1].toLowerCase()] || match[1];
  const unit = match[2] || "";
  const hindiUnit = HINDI_FORM.find(([pattern]) => pattern.test(unit))?.[1];
  if (hindiUnit) return `${amount} ${hindiUnit}`;
  return unit ? `${amount} ${unit}` : amount;
}

const SLOT_PHRASE = { morning: "सुबह", afternoon: "दोपहर में", evening: "शाम को", night: "रात को" };
const MEAL = { morning: "नाश्ते", afternoon: "दोपहर के खाने", evening: "शाम के नाश्ते", night: "रात के खाने" };

function timingPhrase(timing, slots) {
  const text = String(timing || "").toLowerCase();
  if (!text) return "";
  if (text.includes("empty")) return "खाली पेट";
  if (text.includes("bed")) return "सोने से पहले";
  const only = (slot, phrase) => (slots.length === 1 && slots[0] === slot ? phrase : "");
  if (text.includes("breakfast")) return only("morning", "नाश्ते के बाद") || joinSlots(slots, "के बाद");
  if (text.includes("dinner")) return only("night", "रात के खाने के बाद") || joinSlots(slots, "के बाद");
  if (text.includes("before")) return joinSlots(slots, "से पहले");
  if (text.includes("with")) return joinSlots(slots, "के साथ");
  if (text.includes("after") || text.includes("food") || text.includes("meal")) return joinSlots(slots, "के बाद");
  return "";
}

function joinSlots(slots, suffix) {
  if (!slots.length) return `खाने ${suffix}`;
  const parts = slots.map((slot) => `${MEAL[slot]} ${suffix}`);
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} और ${parts[parts.length - 1]}`;
}

const COUNT = { 1: "एक", 2: "दो", 3: "तीन", 4: "चार" };

function frequencyPhrase(pattern, slots) {
  if (pattern === "SOS") return "ज़रूरत पड़ने पर";
  if (pattern === "Stat") return "तुरंत, एक बार";
  if (pattern === "Weekly") return "सप्ताह में एक बार";
  if (slots.length === 1) return SLOT_PHRASE[slots[0]];
  return `दिन में ${COUNT[slots.length] || slots.length} बार`;
}

function hindiDuration(details) {
  if ((details.duration_unit || "") === "continue") return "डॉक्टर के कहने तक";
  const amount = Number(details.duration) || 0;
  if (!amount) return "";
  const unit = details.duration_unit || "days";
  if (unit === "weeks") return `${amount} सप्ताह तक`;
  if (unit === "months") return `${amount} महीने तक`;
  return `${amount} दिनों तक`;
}

const ROUTE_VERB = {
  Topical: "लगाएँ", "Eye drops": "आँख में डालें", "Ear drops": "कान में डालें", Inhaled: "इनहेलर से लें", Injection: "इंजेक्शन लगवाएँ"
};

// One plain-Hindi sentence from the structured fields, e.g.
// "1 गोली - दिन में दो बार, नाश्ते के बाद और रात के खाने के बाद, 5 दिनों तक लें।"
// Returns "" when there is no pattern, so the PDF shows only the doctor's English remarks.
export function hindiInstruction(details = {}) {
  const pattern = normalizeFrequency(details.frequency);
  if (!pattern) return "";
  const slots = slotsOf(pattern);
  const dose = hindiDose(details.dose);
  const parts = [frequencyPhrase(pattern, slots)];
  const timing = timingPhrase(details.when, slots);
  if (timing) parts.push(timing);
  const duration = pattern === "Stat" ? "" : hindiDuration(details);
  if (duration) parts.push(duration);
  const verb = ROUTE_VERB[details.route] || "लें";
  return `${dose ? `${dose} - ` : ""}${parts.join(", ")} ${verb}।`;
}

// Short line for lists and the care plan note: "1-0-1 · After meal · 5 Days · remark".
export function composeNotes(details = {}) {
  const pattern = normalizeFrequency(details.frequency) || String(details.frequency || "");
  return [pattern, details.when, durationText(details), String(details.remarks || "").trim()].filter(Boolean).join(" · ").slice(0, 500);
}
