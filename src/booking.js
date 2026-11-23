// Pure helpers for the patient Book tab: a clinic visit paid for at booking.
// The visit fee and the payment marker live in one shared module that the payment functions also use.
import { VISIT_PAYMENT_PURPOSE, visitFeeRupees } from "../supabase/functions/_shared/consultationFee.js";
export { VISIT_PAYMENT_PURPOSE, visitFeeRupees };

// One list and one limit for the Book screen and the clinic assistant.
import { BOOKING_REASONS, BOOKING_REASON_LIMIT, bookingReason } from "../supabase/functions/_shared/clinicAssistantRules.js";
export { BOOKING_REASONS, BOOKING_REASON_LIMIT, bookingReason };
import { indiaDate } from "./carePlan.js";


const minutesOf = (slot) => {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(slot).trim());
  if (!match) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  return hours * 60 + Number(match[2]);
};

// Splits "8:00 AM"-style slots into Morning / Afternoon / Evening, keeping their order.
export function groupSlots(slots) {
  const groups = [["Morning", []], ["Afternoon", []], ["Evening", []]];
  for (const slot of slots) {
    const minutes = minutesOf(slot);
    const index = minutes === null || minutes < 12 * 60 ? 0 : minutes < 17 * 60 ? 1 : 2;
    groups[index][1].push(slot);
  }
  return groups.filter(([, items]) => items.length).map(([label, items]) => ({ label, slots: items }));
}

const asDate = (dateValue) => new Date(`${dateValue}T00:00:00`);

export function dayLabel(dateValue, todayValue) {
  const days = Math.round((asDate(dateValue) - asDate(todayValue)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return asDate(dateValue).toLocaleDateString("en-IN", { weekday: "short" });
}

// "Fri, 20 Nov"
export function longDate(dateValue) {
  const date = asDate(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

// Row for public.appointment_requests once Razorpay has taken (or authorised) the fee.
// paid: the verify function reported the payment captured. Otherwise it is still confirming.
export function bookingRow({ appointment, user, clinic, paymentId, paid }) {
  return {
    patient_id: user.id,
    patient_name: user.name || "Clinic patient",
    patient_phone: user.phone || null,
    clinic_id: clinic.id,
    clinic_name: clinic.name,
    mode: "Clinic visit",
    visit_type: "in_clinic",
    appointment_date: appointment.date,
    appointment_time: appointment.time,
    reason: appointment.reason,
    payment_status: paid ? "PAID_CONFIRMED" : "PAYMENT_PENDING",
    payment_reference: paymentId,
    status: paid ? "Booked - fee paid" : "Booked - payment confirming"
  };
}

export function savedVisitState(visit, payment) {
  if (/\bcancell?ed\b/i.test(visit.status || "")) return "cancelled";
  if (payment?.payment_status === "REFUNDED" || visit.payment_status === "REFUNDED") return "refunded";
  if (payment?.payment_status === "FAILED" || visit.payment_status === "FAILED") return "failed";
  if ([payment?.payment_status, visit.payment_status].includes("PAID_CONFIRMED")) return "booked";
  return "pending";
}

export function nextSavedVisit(saved, now = new Date()) {
  const today = indiaDate(now);
  const [hours, minutes] = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).split(":").map(Number);
  const currentMinutes = hours * 60 + minutes;
  const time = (visit) => minutesOf(visit.appointment_time) ?? Infinity;

  return saved.filter(({ visit, state }) => (
    (state === "booked" || state === "pending") &&
    (visit.appointment_date > today ||
      (visit.appointment_date === today && time(visit) >= currentMinutes))
  )).sort(({ visit: a }, { visit: b }) => (
    a.appointment_date.localeCompare(b.appointment_date) || time(a) - time(b)
  ))[0];
}

export function bookingWhatsAppUrl(visit) {
  const text = [
    "Clinic visit confirmed",
    visit.clinic_name,
    `${longDate(visit.appointment_date)} at ${visit.appointment_time}`,
    visit.payment_reference && `Payment reference: ${visit.payment_reference}`
  ].filter(Boolean).join("\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
