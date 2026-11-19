import assert from "node:assert/strict";
import { upcomingReminders, validateMedicine, validatePlan } from "./carePlan.js";

const daily = (over = {}) => ({
  id: "m1", name: "Metformin 500 mg tablet", dose: "1 tablet", route: "Oral (swallow)", site: "",
  frequency: "daily", start: "2026-11-17", end: "2026-11-20", times: ["21:00"], days: [], notes: "", ...over
});

// --- validation behaves as before the refactor
assert.equal(validatePlan({ medicines: [daily()], follow_up_date: "" }), "");
assert.match(validatePlan({ medicines: [daily({ route: "" })] }), /Medicine 1: enter a name, dose and route/);
assert.match(validatePlan({ medicines: [daily({ route: "Eye" })] }), /specify the application site/);
assert.equal(validatePlan({ medicines: [daily({ route: "Eye", site: "left eye" })] }), "");
assert.match(validatePlan({ medicines: [daily({ frequency: "instructions", notes: "" })] }), /frequency and instructions/);
assert.equal(validatePlan({ medicines: [daily({ frequency: "instructions", notes: "Use when needed" })] }), "");
assert.match(validatePlan({ medicines: [daily({ frequency: "weekly", days: [] })] }), /at least one day/);
assert.match(validatePlan({ medicines: [daily({ end: "2026-11-10" })] }), /valid start and end date/);
assert.match(validatePlan({ medicines: [daily({ times: ["21:00", "21:00"] })] }), /distinct reminder times/);
assert.match(validatePlan({ medicines: [daily({ times: ["25:00"] })] }), /distinct reminder times/);
assert.match(validatePlan({ medicines: [daily()], follow_up_date: "2026-02-31" }), /valid follow-up date/);
assert.match(validatePlan({ medicines: Array.from({ length: 21 }, () => daily()) }), /up to 20 medicines/);

// --- the extracted per-medicine validator reports the right position
assert.equal(validateMedicine(daily(), 0), "");
assert.match(validateMedicine(daily({ dose: "" }), 2), /^Medicine 3:/);

// --- reminders: 09:30 IST on 17 Nov. A 21:00 IST daily dose gives 17 and 18 Nov inside the 2-day window.
const now = new Date("2026-11-17T04:00:00Z");
const reminders = upcomingReminders({ medicines: [daily()], follow_up_date: "" }, now);
assert.equal(reminders.length, 2);
assert.ok(reminders.every((r) => r.kind === "medicine"));
assert.equal(reminders[0].at.toISOString(), "2026-11-17T15:30:00.000Z");
assert.equal(reminders[1].at.toISOString(), "2026-11-18T15:30:00.000Z");

// --- an invalid plan schedules nothing; follow-up adds a day-before and a day-of alert
assert.deepEqual(upcomingReminders({ medicines: [daily({ route: "" })] }, now), []);
const withFollowUp = upcomingReminders({ medicines: [], follow_up_date: "2026-11-25" }, now);
assert.equal(withFollowUp.length, 2);
assert.ok(withFollowUp.every((r) => r.kind === "follow-up"));

console.log("care plan tests passed");
