import assert from "node:assert/strict";
import { bookingRow, dayLabel, groupSlots, longDate } from "./booking.js";

assert.deepEqual(groupSlots(["8:00 AM", "11:30 AM", "12:00 PM", "4:30 PM", "5:00 PM", "7:30 PM"]), [
  { label: "Morning", slots: ["8:00 AM", "11:30 AM"] },
  { label: "Afternoon", slots: ["12:00 PM", "4:30 PM"] },
  { label: "Evening", slots: ["5:00 PM", "7:30 PM"] }
]);
assert.deepEqual(groupSlots(["12:30 AM"]), [{ label: "Morning", slots: ["12:30 AM"] }]);
assert.deepEqual(groupSlots([]), []);

assert.equal(dayLabel("2026-11-19", "2026-11-19"), "Today");
assert.equal(dayLabel("2026-11-20", "2026-11-19"), "Tomorrow");
assert.equal(dayLabel("2026-11-23", "2026-11-19"), "Mon");
assert.match(longDate("2026-11-20"), /20 Nov/);

const base = {
  appointment: { date: "2026-11-20", time: "9:30 AM", reason: "Thyroid" },
  user: { id: "u1", name: "Test Patient", phone: "" },
  clinic: { id: "c1", name: "Clinic One" },
  paymentId: "pay_1"
};
const paid = bookingRow({ ...base, paid: true });
assert.equal(paid.payment_status, "PAID_CONFIRMED");
assert.equal(paid.payment_reference, "pay_1");
assert.equal(paid.mode, "Clinic visit");
assert.equal(paid.patient_phone, null);
assert.equal(bookingRow({ ...base, paid: false }).payment_status, "PAYMENT_PENDING");

console.log("booking tests passed");
