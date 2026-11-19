// Dev-only harness for the patient Book tab with a fake clinic. ?result=booked|pending|error|cancelled fakes the payment outcome.
import "./theme.js";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import BookVisit from "../src/BookVisit.jsx";

const clinic = { id: "test", name: "Test Clinic (fake)", timing: "8:00 AM - 7:00 PM", address: "Fake address for development only" };
const pad = (n) => String(n).padStart(2, "0");
const toValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return { dateValue: toValue(d), day: pad(d.getDate()) }; });
const allSlots = ["8:00 AM", "8:30 AM", "9:00 AM", "11:30 AM", "12:00 PM", "1:30 PM", "4:30 PM", "5:00 PM", "6:30 PM"];
const getSlots = (date) => (date === days[2].dateValue ? [] : allSlots);
const outcome = new URLSearchParams(location.search).get("result") || "booked";
const fake = {
  booked: { state: "booked", paymentId: "pay_FAKE0000000001", message: "See you at Test Clinic (fake)." },
  pending: { state: "pending", paymentId: "pay_FAKE0000000001", message: "Razorpay has your payment and is confirming it. Your slot is held." },
  error: { state: "error", message: "The payment did not go through. Nothing was booked. You can try again." },
  cancelled: { state: "cancelled", message: "Payment was not completed, so nothing was booked." }
};

function Harness() {
  const [appointment, setAppointment] = useState({ mode: "Clinic visit", date: days[0].dateValue, time: "8:00 AM", reason: "Diabetes follow-up" });
  return <BookVisit appointment={appointment} setAppointment={setAppointment} clinic={clinic} onDuty days={days} todayValue={days[0].dateValue}
    getSlots={getSlots} onPayAndBook={() => new Promise((r) => setTimeout(() => r(fake[outcome]), 400))} />;
}
createRoot(document.getElementById("root")).render(<Harness />);
