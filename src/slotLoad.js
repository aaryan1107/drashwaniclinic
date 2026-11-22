// How many patients are booked per slot, and which slot to suggest. Pure functions, no network.
// A booking counts as reserved unless it was cancelled, failed or refunded.

// Soft target per half-hour slot. Above this a slot reads as busy. Set with Dr Ashwani; it is a suggestion, not a limit.
export const SLOT_TARGET = 3;

const minutesOf = (slot) => {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(slot).trim());
  if (!match) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  return hours * 60 + Number(match[2]);
};

export function isReserved(row) {
  const status = String(row.status || "");
  const payment = String(row.payment_status || "");
  if (/cancell?ed|rejected|declined/i.test(status)) return false;
  if (["FAILED", "REFUNDED"].includes(payment)) return false;
  return true;
}

// rows: [{ appointment_date, appointment_time, status, payment_status }] -> { "2026-11-23": { "6:30 PM": 2 } }
export function loadByDay(rows = []) {
  const map = {};
  for (const row of rows) {
    if (!isReserved(row)) continue;
    const day = (map[row.appointment_date] ||= {});
    day[row.appointment_time] = (day[row.appointment_time] || 0) + 1;
  }
  return map;
}

// The rpc returns already-counted rows: [{ appointment_date, appointment_time, reserved }].
export function loadFromCounts(rows = []) {
  const map = {};
  for (const row of rows) {
    const day = (map[row.appointment_date] ||= {});
    day[row.appointment_time] = Number(row.reserved) || 0;
  }
  return map;
}

export const reservedAt = (load, date, slot) => load?.[date]?.[slot] || 0;
export const reservedOnDay = (load, date) => Object.values(load?.[date] || {}).reduce((sum, n) => sum + n, 0);

export function slotState(count, target = SLOT_TARGET) {
  if (count >= target) return "busy";
  if (count >= Math.max(2, Math.ceil(target / 2))) return "moderate";
  return "quiet";
}

// Quietest slot, earliest on ties. Returns null when there are no slots.
export function recommendSlot(slots, load, date, target = SLOT_TARGET) {
  const open = slots.filter((slot) => minutesOf(slot) !== null);
  if (!open.length) return null;
  let best = null;
  for (const slot of open) {
    const count = reservedAt(load, date, slot);
    if (count >= target * 2) continue;
    if (!best || count < best.count || (count === best.count && minutesOf(slot) < minutesOf(best.slot))) best = { slot, count };
  }
  return best ? { slot: best.slot, reserved: best.count, state: slotState(best.count, target) } : null;
}

// Sorted list for the doctor: [{ slot, reserved }] for one day.
export function dayTimeline(load, date) {
  return Object.entries(load?.[date] || {})
    .map(([slot, reserved]) => ({ slot, reserved }))
    .sort((a, b) => (minutesOf(a.slot) ?? 0) - (minutesOf(b.slot) ?? 0));
}
