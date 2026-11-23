import assert from "node:assert/strict";
import { BOOKING_REASON_LIMIT, bookingReason, bookingRow, bookingWhatsAppUrl, dayLabel, groupSlots, longDate, savedVisitState } from "./booking.js";

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
assert.equal(bookingReason("  Dizziness after meals  "), "Dizziness after meals");
assert.equal(bookingReason("   "), "");
assert.equal(bookingReason(null), "");
assert.equal(bookingReason("a".repeat(BOOKING_REASON_LIMIT)).length, BOOKING_REASON_LIMIT);
assert.equal(bookingReason("a".repeat(BOOKING_REASON_LIMIT + 1)), "");

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

const visit = { appointment_date: "2026-11-25", appointment_time: "6:30 PM", clinic_name: "Fixture Clinic",
  reason: "Private fixture reason", payment_reference: "pay_fixture", payment_status: "PAYMENT_PENDING" };
assert.equal(savedVisitState(visit, { payment_status: "PAID_CONFIRMED" }), "booked");
assert.equal(savedVisitState(visit, { payment_status: "AUTHORIZED" }), "pending");
assert.equal(savedVisitState({ ...visit, payment_status: "PAID_CONFIRMED" }, { payment_status: "REFUNDED" }), "refunded");
assert.equal(savedVisitState({ ...visit, status: "Cancelled" }, { payment_status: "PAID_CONFIRMED" }), "cancelled");
const share = new URL(bookingWhatsAppUrl(visit));
assert.match(share.searchParams.get("text"), /6:30 PM/);
assert.doesNotMatch(share.searchParams.get("text"), /Private fixture reason/);
console.log("booking tests passed");
