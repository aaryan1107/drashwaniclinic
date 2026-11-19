import assert from "node:assert/strict";
import { blankAppointment, buildAppointmentRow, validateAppointment } from "./appointment.js";

const today = "2026-11-18";
const a = blankAppointment(today);
assert.match(validateAppointment(a, today), /time for a fixed slot/);
assert.equal(validateAppointment({ ...a, slot_type: "flexible" }, today), "");
assert.equal(validateAppointment({ ...a, time: "10:30" }, today), "");
assert.match(validateAppointment({ ...a, time: "10:30", date: "2026-11-17" }, today), /past/);
assert.match(validateAppointment({ ...a, time: "25:00" }, today), /time/);
assert.match(validateAppointment({ ...a, time: "10:30", duration_min: 7 }, today), /duration/);

const row = buildAppointmentRow({ ...a, visit_type: "tele", time: "10:30", tags: ["Follow-up"] }, { patient: { id: "rec1", ownerId: null, name: "Test Patient" }, clinic: { id: "c", name: "Clinic" }, status: "Booked by clinic" });
assert.equal(row.mode, "Online consultation");
assert.equal(row.appointment_time, "10:30");
assert.match(row.reason, /Tele consultation · fixed slot · 15 min · Follow-up/);
assert.equal(row.patient_id, null);
assert.equal(row.patient_record_id, "rec1");
assert.equal(buildAppointmentRow({ ...a, slot_type: "flexible" }, { patient: { id: "r" }, clinic: {}, status: "x" }).appointment_time, "Flexible");
console.log("appointment tests passed");
