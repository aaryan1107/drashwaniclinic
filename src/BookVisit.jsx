// Patient Book tab: pick a day, time and reason for a clinic visit, then pay the fee to book it.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarCheck, Check, ChevronRight, Clock, MapPin, Search, Share2 } from "lucide-react";
import { Button } from "./ui/Button.jsx";
import { recommendSlot, reservedAt, slotState } from "./slotLoad.js";
import { BOOKING_REASONS, BOOKING_REASON_LIMIT, bookingReason, bookingWhatsAppUrl, dayLabel, groupSlots, longDate } from "./booking.js";
import { createTermIndex, normalize } from "./termSearch.js";
import { GENERAL_FEE_RUPEES } from "../supabase/functions/_shared/consultationFee.js";
import "./book.css";

const monthFormat = new Intl.DateTimeFormat("en-IN", { month: "short" });

function VisitReasonField({ value, onChange, disabled }) {
  const [index, setIndex] = useState(null);
  const input = useRef(null);
  const query = normalize(value);
  const searching = query.length >= 2;
  useEffect(() => {
    if (!searching || index) return;
    let active = true;
    import("./data/terms.seed.json").then(({ default: rows }) => {
      if (active) setIndex(createTermIndex(rows.filter(([, type]) => type === "symptom")));
    }).catch(() => {});
    return () => { active = false; };
  }, [searching, index]);
  const symptomMatches = searching ? index?.search(query, { limit: 5 }).map((term) => term.display) || [] : [];
  const suggestions = searching
    ? [...new Set([...BOOKING_REASONS.filter((reason) => normalize(reason).includes(query)), ...symptomMatches])]
      .filter((reason) => normalize(reason) !== query).slice(0, 5)
    : query ? [] : BOOKING_REASONS.slice(0, 4);
  return (
    <div className="bk-reason-card">
      <label htmlFor="bk-visit-reason">What brings you in?</label>
      <div className="bk-reason-field">
        <Search size={18} aria-hidden="true" />
        <input ref={input} id="bk-visit-reason" value={value} maxLength={BOOKING_REASON_LIMIT} disabled={disabled}
          onChange={(event) => onChange(event.target.value)} placeholder="e.g. dizziness for two days"
          autoComplete="off" aria-describedby="bk-reason-help" />
      </div>
      <p id="bk-reason-help">Use your own words or pick a suggestion.</p>
      {suggestions.length > 0 && (
        <div className="bk-reasons" role="group" aria-label={searching ? "Matching reasons" : "Common reasons"}>
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="bk-reason" disabled={disabled}
              onClick={() => {
                onChange(suggestion);
                input.current?.focus();
              }}>{suggestion}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function VisitDateTile({ date }) {
  const value = new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) return <span className="bk-date-tile" aria-hidden="true"><CalendarCheck size={24} /></span>;
  return (
    <span className="bk-date-tile" aria-hidden="true">
      <span>{monthFormat.format(value)}</span>
      <strong>{value.getDate()}</strong>
    </span>
  );
}

export function NextVisitCard({ entry, onOpen }) {
  const { visit, state } = entry;
  const confirmed = state === "booked";
  return (
    <button type="button" className={`bk-next ${confirmed ? "is-booked" : "is-pending"}`} onClick={onOpen}>
      <VisitDateTile date={visit.appointment_date} />
      <span className="bk-next-copy">
        <span className="bk-next-label">Next visit</span>
        <strong>{longDate(visit.appointment_date)} · {visit.appointment_time}</strong>
        <span className="bk-next-clinic">{visit.clinic_name}</span>
        <span className="bk-visit-status">
          {confirmed ? <Check size={15} aria-hidden="true" /> : <Clock size={15} aria-hidden="true" />}
          {confirmed ? "Confirmed" : "Payment pending"}
        </span>
      </span>
      <ChevronRight size={19} className="bk-next-chevron" aria-hidden="true" />
    </button>
  );
}

function SavedVisitCard({ visit, state }) {
  const confirmed = state === "booked";
  const titles = {
    booked: "Your visit is booked",
    pending: "Payment is being confirmed",
    cancelled: "Visit cancelled",
    refunded: "Payment refunded",
    failed: "Payment failed"
  };
  const StatusIcon = confirmed ? Check : state === "pending" ? Clock : AlertTriangle;

  return (
    <section className={`bk-done is-${state}`} aria-label="Saved clinic visit">
      <div className="bk-visit-status">
        <StatusIcon size={18} aria-hidden="true" />
        <h3>{titles[state]}</h3>
      </div>
      <div className="bk-receipt-visit">
        <VisitDateTile date={visit.appointment_date} />
        <div>
          <h4>{longDate(visit.appointment_date)} · {visit.appointment_time}</h4>
          <span><MapPin size={16} aria-hidden="true" /> {visit.clinic_name}</span>
        </div>
      </div>
      {(visit.reason || visit.payment_reference) && (
        <dl className="bk-facts">
          {visit.reason && <div><dt>Reason</dt><dd>{visit.reason}</dd></div>}
          {visit.payment_reference && <div><dt>Payment ID</dt><dd className="bk-mono">{visit.payment_reference}</dd></div>}
        </dl>
      )}
      {confirmed && <a className="secondary-button bk-confirmation-share" href={bookingWhatsAppUrl(visit)}
        target="_blank" rel="noopener noreferrer"><Share2 size={17} aria-hidden="true" /> Share confirmation on WhatsApp</a>}
    </section>
  );
}

export default function BookVisit({ appointment, setAppointment, clinic, onDuty, days, todayValue, getSlots, onPayAndBook, savedVisits = {}, nextVisit, feeRupees = GENERAL_FEE_RUPEES, load }) {
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState(null);
  const [bookAnother, setBookAnother] = useState(false);
  const { saved = [], savedError, loadingSaved, reload } = savedVisits;
  const orderedSaved = nextVisit ? [nextVisit, ...saved.filter((entry) => entry !== nextVisit)] : saved;

  const showForm = bookAnother || (!loadingSaved && !saved.length);

  const slotsByDay = useMemo(
    () => Object.fromEntries(days.map((day) => [day.dateValue, getSlots(day.dateValue)])),
    [days, getSlots]
  );
  const slots = slotsByDay[appointment.date] || [];
  const timeChosen = slots.includes(appointment.time);
  const reason = bookingReason(appointment.reason);
  const recommended = recommendSlot(slots, load, appointment.date);
  const update = (patch) => setAppointment((current) => ({ ...current, ...patch }));

  const pickDay = (dateValue) => {
    const daySlots = slotsByDay[dateValue] || [];
    update({ date: dateValue, time: daySlots.includes(appointment.time) ? appointment.time : daySlots[0] || "" });
    setResult(null);
  };

  const payAndBook = async () => {
    if (!timeChosen || !reason || paying) return;
    setPaying(true);
    setResult(null);
    const outcome = await onPayAndBook({ ...appointment, reason });
    setPaying(false);
    setResult(outcome);
    if (outcome.state === "booked" || outcome.state === "pending") {
      setBookAnother(false);
      reload?.();
    }
  };

  const justBooked = result && (result.state === "booked" || result.state === "pending") ? result : null;
  const showTemporaryReceipt = justBooked && !saved.some(({ visit }) => visit.payment_reference === justBooked.paymentId);
  if (!showForm || showTemporaryReceipt) {
    return (
      <div className="bk">
        {loadingSaved && <p role="status">Loading your bookings…</p>}
        {savedError && <p role="alert">Couldn’t refresh your bookings. <button type="button" onClick={reload}>Try again</button></p>}
        {showTemporaryReceipt && <SavedVisitCard state={justBooked.state} visit={{
          appointment_date: appointment.date, appointment_time: appointment.time,
          clinic_name: clinic.name, reason: appointment.reason, payment_reference: justBooked.paymentId
        }} />}
        {saved.length > 0 && <h3>My bookings</h3>}
        {orderedSaved.map(({ visit, state }) => <SavedVisitCard key={visit.id} visit={visit} state={state} />)}
        {!loadingSaved && <Button intent="secondary" block onClick={() => { update({ reason: "" }); setBookAnother(true); setResult(null); }}>Book another visit</Button>}
      </div>
    );
  }

  return (
    <div className="bk">
      {saved.length > 0 && <Button intent="secondary" block onClick={() => setBookAnother(false)}>View my bookings</Button>}
      {savedError && <p role="alert">Couldn’t load your saved bookings. <button type="button" onClick={reload}>Try again</button></p>}
      <p className="bk-intro">Pick a day and time to see Dr Ashwani at the clinic. Your slot is booked once the ₹{feeRupees} fee is paid.</p>

      <section className="bk-clinic" aria-label="Clinic">
        <span className="bk-clinic-icon" aria-hidden="true"><CalendarCheck size={20} /></span>
        <div>
          <p className="bk-eyebrow">{onDuty ? "Doctor is at this clinic today" : "Doctor is off duty now"}</p>
          <strong>{clinic.name}</strong>
          <small><Clock size={14} aria-hidden="true" /> {clinic.timing}</small>
          {clinic.address && <small><MapPin size={14} aria-hidden="true" /> {clinic.address}</small>}
        </div>
      </section>

      <section className="bk-step" aria-labelledby="bk-day">
        <h3 id="bk-day" className="bk-eyebrow">1 · Day</h3>
        <div className="bk-days" role="radiogroup" aria-labelledby="bk-day">
          {days.map((day) => {
            const open = (slotsByDay[day.dateValue] || []).length > 0;
            const on = appointment.date === day.dateValue;
            return (
              <button key={day.dateValue} type="button" role="radio" aria-checked={on} disabled={!open}
                className={`bk-day${on ? " is-on" : ""}`} onClick={() => pickDay(day.dateValue)}>
                <span>{dayLabel(day.dateValue, todayValue)}</span>
                <strong>{day.day}</strong>
                <small>{open ? new Date(`${day.dateValue}T00:00:00`).toLocaleDateString("en-IN", { month: "short" }) : "No slots"}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="bk-step" aria-labelledby="bk-time">
        <h3 id="bk-time" className="bk-eyebrow">2 · Time</h3>
        {recommended && load && (
          <p className="bk-recommend">Quietest time: <strong>{recommended.slot}</strong>{recommended.reserved ? ` (${recommended.reserved} booked)` : " (no one booked yet)"}</p>
        )}
        {slots.length === 0 ? (
          <p className="bk-empty">No slots left on this day. Pick another day.</p>
        ) : groupSlots(slots).map((group) => (
          <div key={group.label} className="bk-slot-group" role="radiogroup" aria-label={`${group.label} slots`}>
            <span className="bk-slot-label">{group.label}</span>
            <div className="bk-slots">
              {group.slots.map((time) => {
                const count = reservedAt(load, appointment.date, time);
                const state = slotState(count);
                const best = recommended?.slot === time;
                return (
                  <button key={time} type="button" role="radio" aria-checked={appointment.time === time}
                    className={`bk-slot${appointment.time === time ? " is-on" : ""}${best ? " is-best" : ""}`} onClick={() => update({ time })}>
                    <span>{time}</span>
                    {load && <small className={`bk-load bk-load-${state}`}>{best ? "Recommended" : count === 0 ? "Open" : `${count} booked`}</small>}
                  </button>
                );
              })}
              </div>
          </div>
        ))}
      </section>

      <section className="bk-step" aria-labelledby="bk-reason">
        <h3 id="bk-reason" className="bk-eyebrow">3 · Reason for visit</h3>
        <VisitReasonField value={appointment.reason} onChange={(value) => update({ reason: value })} disabled={paying} />
      </section>

      <section className="bk-summary" aria-labelledby="bk-summary">
        <h3 id="bk-summary" className="bk-eyebrow">Your visit</h3>
        <dl className="bk-facts">
          <div><dt>Day</dt><dd>{longDate(appointment.date)}</dd></div>
          <div><dt>Time</dt><dd>{timeChosen ? appointment.time : "Pick a time"}</dd></div>
          <div><dt>Reason</dt><dd>{reason || "Add a reason"}</dd></div>
          <div className="bk-fee"><dt>Consultation fee</dt><dd>₹{feeRupees}</dd></div>
        </dl>
      </section>

      {result && (
        <p className={`bk-alert ${result.state === "cancelled" ? "is-quiet" : ""}`} role="alert">
          {result.state !== "cancelled" && <AlertTriangle size={16} aria-hidden="true" />} {result.message}
        </p>
      )}

      <Button block loading={paying} disabled={!timeChosen || !reason} onClick={payAndBook}>
        {paying ? "Opening secure payment…" : `Pay ₹${feeRupees} and book`}
      </Button>
      <p className="bk-note">Payments are handled by Razorpay. If a payment fails, nothing is booked, and Razorpay returns any money that was deducted.</p>
    </div>
  );
}
