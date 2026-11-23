import assert from "node:assert/strict";
import { dayTimeline, isReserved, loadByDay, loadFromCounts, recommendSlot, reservedAt, reservedOnDay, slotState } from "./slotLoad.js";

assert.equal(isReserved({ status: "Booked - fee paid", payment_status: "PAID_CONFIRMED" }), true);
assert.equal(isReserved({ status: "Booked - payment confirming", payment_status: "PAYMENT_PENDING" }), true);
assert.equal(isReserved({ status: "Cancelled by patient", payment_status: "PAID_CONFIRMED" }), false);
assert.equal(isReserved({ status: "Booked", payment_status: "REFUNDED" }), false);
assert.equal(isReserved({ status: "Booked", payment_status: "FAILED" }), false);

const rows = [
  { appointment_date: "2026-11-23", appointment_time: "6:30 PM", status: "Booked - fee paid", payment_status: "PAID_CONFIRMED" },
  { appointment_date: "2026-11-23", appointment_time: "6:30 PM", status: "Booked - fee paid", payment_status: "PAID_CONFIRMED" },
  { appointment_date: "2026-11-23", appointment_time: "7:00 PM", status: "Booked - fee paid", payment_status: "PAID_CONFIRMED" },
  { appointment_date: "2026-11-23", appointment_time: "7:00 PM", status: "Cancelled", payment_status: "REFUNDED" }
];
const load = loadByDay(rows);
assert.equal(reservedAt(load, "2026-11-23", "6:30 PM"), 2);
assert.equal(reservedAt(load, "2026-11-23", "7:00 PM"), 1);
assert.equal(reservedAt(load, "2026-11-23", "8:00 PM"), 0);
assert.equal(reservedOnDay(load, "2026-11-23"), 3);
assert.deepEqual(loadFromCounts([{ appointment_date: "2026-11-23", appointment_time: "6:30 PM", reserved: 2 }]), { "2026-11-23": { "6:30 PM": 2 } });

assert.equal(slotState(0), "quiet");
assert.equal(slotState(1), "quiet");
assert.equal(slotState(2), "moderate");
assert.equal(slotState(3), "busy");

// Quietest, earliest on ties
const slots = ["6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM"];
assert.deepEqual(recommendSlot(slots, load, "2026-11-23"), { slot: "6:00 PM", reserved: 0, state: "quiet" });
const busy = { "2026-11-23": { "6:00 PM": 3, "6:30 PM": 3, "7:00 PM": 1, "7:30 PM": 1 } };
assert.equal(recommendSlot(slots, busy, "2026-11-23").slot, "7:00 PM");
assert.equal(recommendSlot([], busy, "2026-11-23"), null);
assert.equal(recommendSlot(["noon"], busy, "2026-11-23"), null);
assert.equal(recommendSlot(["6:00 PM"], { "2026-11-23": { "6:00 PM": 6 } }, "2026-11-23"), null);

assert.deepEqual(dayTimeline(load, "2026-11-23"), [{ slot: "6:30 PM", reserved: 2 }, { slot: "7:00 PM", reserved: 1 }]);
assert.deepEqual(dayTimeline({}, "2026-11-23"), []);
console.log("Slot load tests passed.");
