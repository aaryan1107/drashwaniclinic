// Patient Book tab: pick a day, time and reason for a clinic visit, then pay the fee to book it.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, Check, Clock, MapPin } from "lucide-react";
import { Button } from "./ui/Button.jsx";
import { BOOKING_REASONS, VISIT_FEE_RUPEES, bookingWhatsAppUrl, dayLabel, groupSlots, longDate, savedVisitState } from "./booking.js";
import { supabase } from "./supabase.js";
import "./book.css";

function SavedVisitCard({ visit, state }) {
  const confirmed = state === "booked";
  const titles = {
    booked: "Your visit is booked",
    pending: "Payment is being confirmed",
    cancelled: "Visit cancelled",
    refunded: "Payment refunded",
    failed: "Payment failed"
  };
  return (
    <section className={`bk-done ${confirmed ? "is-booked" : "is-pending"}`} aria-label="Saved clinic visit">
      <span className="bk-done-icon" aria-hidden="true">{confirmed ? <Check size={22} /> : <Clock size={22} />}</span>
      <h3>{titles[state]}</h3>
      <dl className="bk-facts">
        <div><dt>Day</dt><dd>{longDate(visit.appointment_date)}</dd></div>
        <div><dt>Time</dt><dd>{visit.appointment_time}</dd></div>
        <div><dt>Clinic</dt><dd>{visit.clinic_name}</dd></div>
        {visit.reason && <div><dt>Reason</dt><dd>{visit.reason}</dd></div>}
        {visit.payment_reference && <div><dt>Payment ID</dt><dd className="bk-mono">{visit.payment_reference}</dd></div>}
      </dl>
      {confirmed && <a className="secondary-button bk-confirmation-share" href={bookingWhatsAppUrl(visit)}
        target="_blank" rel="noopener noreferrer">Share confirmation on WhatsApp</a>}
    </section>
  );
}

export default function BookVisit({ appointment, setAppointment, clinic, onDuty, days, todayValue, getSlots, onPayAndBook, userId }) {
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState([]);
  const [savedError, setSavedError] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(Boolean(userId));
  const [bookAnother, setBookAnother] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let requestVersion = 0;
    const reload = async () => {
      const version = ++requestVersion;
      try {
        const { data: visits, error } = await supabase.from("appointment_requests")
          .select("id,appointment_date,appointment_time,clinic_name,reason,payment_reference,payment_status,status")
          .eq("patient_id", userId).eq("mode", "Clinic visit").not("payment_reference", "is", null)
          .order("appointment_date", { ascending: false }).order("created_at", { ascending: false }).limit(10);
        if (error) throw error;
        const refs = visits.map((visit) => visit.payment_reference).filter(Boolean);
        const { data: payments, error: paymentError } = refs.length ? await supabase.from("consultation_payments")
          .select("razorpay_payment_id,payment_status")
          .filter("patient->>user_id", "eq", userId).in("razorpay_payment_id", refs) : { data: [] };
        if (paymentError) throw paymentError;
        if (!active || version !== requestVersion) return;
        const byReference = new Map((payments || []).map((row) => [row.razorpay_payment_id, row]));
        setSaved(visits.map((visit) => ({ visit, state: savedVisitState(visit, byReference.get(visit.payment_reference)) })));
        setSavedError(false);
      } catch {
        if (active && version === requestVersion) setSavedError(true);
      } finally {
        if (active && version === requestVersion) setLoadingSaved(false);
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void reload(); };
    void reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, refresh]);

  const showForm = bookAnother || (!loadingSaved && !saved.length);

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
    if (outcome.state === "booked" || outcome.state === "pending") {
      setBookAnother(false);
      setRefresh((value) => value + 1);
    }
  };

  const justBooked = result && (result.state === "booked" || result.state === "pending") ? result : null;
  const showTemporaryReceipt = justBooked && !saved.some(({ visit }) => visit.payment_reference === justBooked.paymentId);
  if (!showForm || showTemporaryReceipt) {
    return (
      <div className="bk">
        {loadingSaved && <p role="status">Loading your bookings…</p>}
        {savedError && <p role="alert">Couldn’t refresh your bookings. <button type="button" onClick={() => setRefresh((value) => value + 1)}>Try again</button></p>}
        {showTemporaryReceipt && <SavedVisitCard state={justBooked.state} visit={{
          appointment_date: appointment.date, appointment_time: appointment.time,
          clinic_name: clinic.name, reason: appointment.reason, payment_reference: justBooked.paymentId
        }} />}
        {saved.length > 0 && <h3>My bookings</h3>}
        {saved.map(({ visit, state }) => <SavedVisitCard key={visit.id} visit={visit} state={state} />)}
        {!loadingSaved && <Button intent="secondary" block onClick={() => { setBookAnother(true); setResult(null); }}>Book another visit</Button>}
      </div>
    );
  }

  return (
    <div className="bk">
      {saved.length > 0 && <Button intent="secondary" block onClick={() => setBookAnother(false)}>View my bookings</Button>}
      {savedError && <p role="alert">Couldn’t load your saved bookings. <button type="button" onClick={() => setRefresh((value) => value + 1)}>Try again</button></p>}
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
