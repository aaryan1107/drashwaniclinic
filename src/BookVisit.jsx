// Patient Book tab: pick a day, time and reason for a clinic visit, then pay the fee to book it.
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, Check, Clock, MapPin } from "lucide-react";
import { Button } from "./ui/Button.jsx";
import { BOOKING_REASONS, VISIT_FEE_RUPEES, dayLabel, groupSlots, longDate } from "./booking.js";
import "./book.css";

export default function BookVisit({ appointment, setAppointment, clinic, onDuty, days, todayValue, getSlots, onPayAndBook }) {
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState(null);
  const slotsByDay = useMemo(
    () => Object.fromEntries(days.map((day) => [day.dateValue, getSlots(day.dateValue)])),
    [days, getSlots]
  );
  const slots = slotsByDay[appointment.date] || [];
  const timeChosen = slots.includes(appointment.time);
  const update = (patch) => setAppointment((current) => ({ ...current, ...patch }));

  const pickDay = (dateValue) => {
    const daySlots = slotsByDay[dateValue] || [];
    update({ date: dateValue, time: daySlots.includes(appointment.time) ? appointment.time : daySlots[0] || "" });
    setResult(null);
  };

  const payAndBook = async () => {
    setPaying(true);
    setResult(null);
    const outcome = await onPayAndBook({ ...appointment });
    setPaying(false);
    setResult(outcome);
  };

  if (result && (result.state === "booked" || result.state === "pending")) {
    const booked = result.state === "booked";
    return (
      <div className="bk">
        <section className={`bk-done ${booked ? "is-booked" : "is-pending"}`} aria-live="polite">
          <span className="bk-done-icon" aria-hidden="true">{booked ? <Check size={22} /> : <Clock size={22} />}</span>
          <h3>{booked ? "Your visit is booked" : "Payment is being confirmed"}</h3>
          <p>{result.message}</p>
          <dl className="bk-facts">
            <div><dt>Day</dt><dd>{longDate(appointment.date)}</dd></div>
            <div><dt>Time</dt><dd>{appointment.time}</dd></div>
            <div><dt>Clinic</dt><dd>{clinic.name}</dd></div>
            <div><dt>Reason</dt><dd>{appointment.reason}</dd></div>
            <div><dt>Fee</dt><dd>₹{VISIT_FEE_RUPEES} {booked ? "paid" : "confirming"}</dd></div>
            {result.paymentId && <div><dt>Payment ID</dt><dd className="bk-mono">{result.paymentId}</dd></div>}
          </dl>
        </section>
        <p className="bk-note">Show this screen at reception, and bring your recent reports and current medicines.</p>
        <Button intent="secondary" block onClick={() => setResult(null)}>Book another visit</Button>
      </div>
    );
  }

  return (
    <div className="bk">
      <p className="bk-intro">Pick a day and time to see Dr Ashwani at the clinic. Your slot is booked once the ₹{VISIT_FEE_RUPEES} fee is paid.</p>

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
        {slots.length === 0 ? (
          <p className="bk-empty">No slots left on this day. Pick another day.</p>
        ) : groupSlots(slots).map((group) => (
          <div key={group.label} className="bk-slot-group" role="radiogroup" aria-label={`${group.label} slots`}>
            <span className="bk-slot-label">{group.label}</span>
            <div className="bk-slots">
              {group.slots.map((time) => (
                <button key={time} type="button" role="radio" aria-checked={appointment.time === time}
                  className={`bk-slot${appointment.time === time ? " is-on" : ""}`} onClick={() => update({ time })}>
                  {time}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="bk-step" aria-labelledby="bk-reason">
        <h3 id="bk-reason" className="bk-eyebrow">3 · Reason for visit</h3>
        <div className="bk-reasons" role="radiogroup" aria-labelledby="bk-reason">
          {BOOKING_REASONS.map((reason) => (
            <button key={reason} type="button" role="radio" aria-checked={appointment.reason === reason}
              className={`bk-reason${appointment.reason === reason ? " is-on" : ""}`} onClick={() => update({ reason })}>
              {reason}
            </button>
          ))}
        </div>
      </section>

      <section className="bk-summary" aria-labelledby="bk-summary">
        <h3 id="bk-summary" className="bk-eyebrow">Your visit</h3>
        <dl className="bk-facts">
          <div><dt>Day</dt><dd>{longDate(appointment.date)}</dd></div>
          <div><dt>Time</dt><dd>{timeChosen ? appointment.time : "Pick a time"}</dd></div>
          <div><dt>Reason</dt><dd>{appointment.reason}</dd></div>
          <div className="bk-fee"><dt>Consultation fee</dt><dd>₹{VISIT_FEE_RUPEES}</dd></div>
        </dl>
      </section>

      {result && (
        <p className={`bk-alert ${result.state === "cancelled" ? "is-quiet" : ""}`} role="alert">
          {result.state !== "cancelled" && <AlertTriangle size={16} aria-hidden="true" />} {result.message}
        </p>
      )}

      <Button block loading={paying} disabled={!timeChosen} onClick={payAndBook}>
        {paying ? "Opening secure payment…" : `Pay ₹${VISIT_FEE_RUPEES} and book`}
      </Button>
      <p className="bk-note">Payments are handled by Razorpay. If a payment fails, nothing is booked, and Razorpay returns any money that was deducted.</p>
    </div>
  );
}
