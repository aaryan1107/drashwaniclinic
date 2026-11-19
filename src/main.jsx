import { App as CapacitorApp } from "@capacitor/app";
import { clearCareReminders, DoctorCarePlan, PatientCarePlan } from "./CarePlan.jsx";
import { DoctorPrescriptions, PatientPrescriptions, ReceptionPrescriptions } from "./Prescription.jsx";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Popover } from "@base-ui/react/popover";
import React, { lazy, Suspense, useContext, useMemo, useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
const Visit = lazy(() => import("./Visit.jsx"));
const AppointmentSheet = lazy(() => import("./AppointmentSheet.jsx"));
import {
  Activity,
  AlertTriangle,
  Bell,
  Brain,
  BookOpen,
  Bot,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Droplet,
  ExternalLink,
  FileHeart,
  FileText,
  FlaskConical,
  HeartPulse,
  History,
  Home,
  Link as LinkIcon,
  LogOut,
  MapPin,
  MessageCircle,
  Eclipse,
  Leaf,
  Palette as AppearanceIcon,
  NotebookPen,
  Palette,
  Phone,
  Pill,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Stethoscope,
  Sun,
  Upload,
  UserRound,
  Users,
  Video,
  Weight
} from "lucide-react";
import {
  supabase
} from "./supabase";
import {
  NATIVE_AUTH_CALLBACK,
  readOAuthCallback,
  isPhoneIdentifier,
  normalizeClinicIdentifier
} from "./auth";
import "@fontsource-variable/geist";
import "./tailwind.css";
import "./styles.css";
import "./clinic-appearance.css";
import "./clinic-theme.css";
import "./clinic-brand.css";
import { useClinicNavigation } from "./useClinicNavigation";
import BookVisit from "./BookVisit.jsx";
import { VISIT_FEE_RUPEES, VISIT_PAYMENT_PURPOSE, bookingRow } from "./booking.js";
import ClinicMesh, { ClinicMotion } from "./ClinicMesh";
import { WelcomeHero, ConditionCards } from "./WelcomeHero.jsx";
import PatientTutorial, { shouldShowTutorial } from "./PatientTutorial.jsx";

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || "";
const RAZORPAY_API_BASE = import.meta.env.VITE_RAZORPAY_API_BASE || "/api";
const RAZORPAY_PAYMENT_LINK = (import.meta.env.VITE_RAZORPAY_PAYMENT_LINK || "https://razorpay.me/@drashwanisfamilyclinicdiagnos").trim();
const ONLINE_CONSULTATION_FEE = "700";
const CLINIC_HOTLINE_NUMBER = "+91 7303399370";
const DOCTOR_WHATSAPP_NUMBER = CLINIC_HOTLINE_NUMBER;
const isRazorpayConfigured = Boolean(RAZORPAY_KEY_ID.trim());
const hasRazorpayPaymentLink = Boolean(RAZORPAY_PAYMENT_LINK);
const razorpayScriptUrl = "https://checkout.razorpay.com/v1/checkout.js";

// consultation_payments.payment_status values that unlock WhatsApp consultation.
// PAID_CONFIRMED / AUTHORIZED are written by the verify Edge Function (Razorpay checkout).
// MANUALLY_VERIFIED is written by the doctor after receiving a hosted payment-link payment.
const CONSULT_PAID_STATUSES = ["PAID_CONFIRMED", "MANUALLY_VERIFIED"];
const CONSULT_LINK_PENDING_STATUS = "PAYMENT_LINK_OPENED";
const CONSULT_IN_FLIGHT_STATUSES = ["creating_order", "verifying"];

const makeDefaultConsultPayment = () => ({
  status: "not_started",
  message: hasRazorpayPaymentLink
    ? `Online consultation fee is Rs ${ONLINE_CONSULTATION_FEE}. Pay securely first; WhatsApp consultation unlocks only after payment is verified.`
    : "Consultation payment will appear once the doctor sets a fee.",
  paymentId: "",
  paidAt: "",
  paymentUrl: RAZORPAY_PAYMENT_LINK
});

const formatPaidAt = (value) => value
  ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })
  : "";

// Reads the patient's latest consultation payment from Supabase (RLS limits rows to the signed-in patient).
// Returns the state the app should show, or null when there is no paid or pending payment.
async function fetchConsultPayment(userId) {
  const { data, error } = await supabase
    .from("consultation_payments")
    .select("razorpay_payment_id, payment_status, verified_at, created_at")
    .filter("patient->>user_id", "eq", userId)
    // Clinic-visit fees are paid per booking and must not unlock WhatsApp consultation.
    .or(`clinic->>purpose.is.null,clinic->>purpose.neq.${VISIT_PAYMENT_PURPOSE}`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  const rows = data || [];

  const paid = rows.find((row) => CONSULT_PAID_STATUSES.includes(row.payment_status));
  if (paid) {
    return {
      status: "paid",
      message: "Payment verified. WhatsApp consultation is unlocked.",
      paymentId: paid.razorpay_payment_id || "",
      paidAt: formatPaidAt(paid.verified_at || paid.created_at),
      paymentUrl: ""
    };
  }

  // Only the latest attempt decides pending/failed, so an old attempt can never lock the Pay button.
  const latest = rows[0]?.payment_status;
  if (latest === "FAILED") {
    return { ...makeDefaultConsultPayment(), status: "failed", message: "Your last payment did not go through. If money was deducted, Razorpay returns it automatically. You can try again." };
  }
  if (["AUTHORIZED", "CAPTURE_PENDING"].includes(latest)) {
    return { status: "capture_pending", message: "Payment authorized. Waiting for Razorpay to confirm capture.", paymentId: "", paidAt: "", paymentUrl: "" };
  }

  if (rows.some((row) => row.payment_status === CONSULT_LINK_PENDING_STATUS)) {
    return {
      status: "payment_link",
      message: "Payment page opened. WhatsApp stays locked until the clinic confirms your payment.",
      paymentId: "",
      paidAt: "",
      paymentUrl: RAZORPAY_PAYMENT_LINK
    };
  }

  return null;
}

const clinics = [
  {
    id: "clinic-1",
    name: "Yatharth Super Speciality Hospital",
    short: "Greater Noida",
    address: "Plot No 32, Block A, Omega-I, Greater Noida, Uttar Pradesh 201315",
    timing: "8:00 AM - 3:00 PM",
    phone: "+91 7303399370",
    mapsUrl: "https://maps.app.goo.gl/FE6AMFbNSwBL3XSz7"
  },
  {
    id: "clinic-2",
    name: "Dr. Ashwani Family Clinic",
    short: "Ace City Square",
    address: "1st Floor, Shop Number 1011, Ace City Square Market, Ace City Road, Jalalpur, Greater Noida, Uttar Pradesh 203207, India",
    timing: "6:00 PM - 9:30 PM",
    phone: "+91 7303399370",
    mapsUrl: "https://maps.app.goo.gl/Z7gD6ivXDRBB75Ad8"
  }
];

// Patient records load from Supabase (patient_records). Empty by default for production.
const patients = [];

const whatsappTemplates = [
  ["Follow-up due", "Your follow-up with Dr. Ashwani Kansal is pending. Please book your diabetes/health follow-up."],
  ["Upload report", "Please upload your latest reports before your consultation."],
  ["Update sugar", "Please update your fasting and post-meal sugar readings in the app."],
  ["Availability", "Dr. Ashwani Kansal is available today. Please check live clinic status before visiting."]
];

const education = [
  ["Diabetes reversal", "Follow-up, diet, weight and medicines reviewed together."],
  ["Fatty liver", "Why insulin resistance and liver health are connected."],
  ["CGM basics", "When to discuss continuous glucose monitoring."],
  ["Injection therapy", "Side effects and doctor review reminders."]
];

const educationThemeOptions = [
  { id: "tone-0", label: "Diabetes blue", hint: "Reports, sugar, CGM" },
  { id: "tone-1", label: "Metabolic green", hint: "Diet, liver, weight" },
  { id: "tone-2", label: "Care lavender", hint: "Thyroid, follow-up" },
  { id: "tone-3", label: "Alert rose", hint: "Injection, side effects" }
];

const defaultVitals = {
  fasting: "",
  postMeal: "",
  bp: "",
  weight: "",
  hba1c: "",
  thyroid: ""
};

const isDoctorUser = (user) => user?.role === "doctor";

const availabilityRowToState = (row) => {
  const clinicId = row.clinic_id || "clinic-2";
  const hasActiveLocation = clinics.some((clinic) => clinic.id === clinicId);

  return {
    status: hasActiveLocation ? (row.status || "On Duty") : "Off Duty",
    clinicId: hasActiveLocation ? clinicId : "clinic-2",
    online: hasActiveLocation && (row.online ?? true),
    message: hasActiveLocation ? (row.message || "") : "",
    updatedBy: row.updated_by || "Dr. Ashwani",
    updatedAt: row.updated_at
      ? new Date(row.updated_at).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          hour: "numeric",
          minute: "2-digit"
        })
      : "Clinic default"
  };
};

const PATIENT_NOTE_LIMIT = 140;

const availabilityStateToRow = (availability) => ({
  id: "live",
  status: availability.status,
  clinic_id: availability.clinicId,
  online: availability.online,
  message: availability.message,
  consultation_fee: Number(ONLINE_CONSULTATION_FEE),
  updated_by: availability.updatedBy || "Dr. Ashwani"
});

const postRowToEducationPost = (row) => ({
  id: row.id,
  title: row.title,
  body: row.body,
  tone: row.tone,
  tag: row.tag,
  author: row.author,
  updatedAt: row.updated_at
    ? new Date(row.updated_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "Clinic post"
});

const educationPostToRow = (post) => ({
  title: post.title,
  body: post.body,
  tone: post.tone || "tone-0",
  tag: post.tag || "Doctor-approved",
  author: post.author || "Dr. Ashwani Kansal",
  published: true
});

const recordRowToPatient = (row) => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  age: row.age || 0,
  gender: row.gender || "Patient",
  mobile: row.mobile || "",
  whatsapp: row.whatsapp || row.mobile || DOCTOR_WHATSAPP_NUMBER,
  abha: row.abha || "Not linked",
  source: row.source || "Supabase patient record",
  conditions: row.conditions || [],
  latest: row.latest || "Updated in app",
  risk: row.risk || "Low",
  vitals: { ...defaultVitals, ...(row.vitals || {}) },
  history: row.history || [],
  labs: row.labs || [],
  symptoms: row.symptoms || [],
  medicines: row.medicines || [],
  notes: row.notes || "",
  followUp: row.follow_up || "Not scheduled",
  lastVisit: row.last_visit || "Not recorded"
});

const patientToRecordRow = (patient, ownerId = null) => ({
  id: String(patient.id),
  ...(ownerId ? { owner_id: ownerId } : {}),
  name: patient.name || "Clinic Patient",
  age: Number(patient.age) || null,
  gender: patient.gender || null,
  mobile: patient.mobile || null,
  whatsapp: patient.whatsapp || patient.mobile || null,
  abha: patient.abha || null,
  source: patient.source || "Patient app",
  conditions: patient.conditions || [],
  latest: patient.latest || null,
  risk: patient.risk || "Low",
  vitals: patient.vitals || {},
  history: patient.history || [],
  labs: patient.labs || [],
  symptoms: patient.symptoms || [],
  medicines: patient.medicines || [],
  notes: patient.notes || null,
  follow_up: patient.followUp || null,
  last_visit: patient.lastVisit || null
});

const patientToPatientPartialRow = (patient, ownerId = null) => {
  const row = {
    name: patient.name || "Clinic Patient",
    ...(patient.age !== undefined && patient.age !== null ? { age: Number(patient.age) || 0 } : {}),
    ...(patient.gender ? { gender: patient.gender } : {}),
    ...(patient.mobile ? { mobile: patient.mobile } : {}),
    ...(patient.whatsapp ? { whatsapp: patient.whatsapp } : {}),
    ...(patient.abha ? { abha: patient.abha } : {}),
    ...(patient.source ? { source: patient.source } : {}),
    ...(patient.conditions ? { conditions: patient.conditions } : {}),
    ...(patient.latest ? { latest: patient.latest } : {}),
    ...(patient.vitals ? { vitals: patient.vitals } : {}),
    ...(patient.symptoms ? { symptoms: patient.symptoms } : {}),
    ...(patient.lastVisit ? { last_visit: patient.lastVisit } : {}),
    ...(ownerId ? { owner_id: ownerId } : {})
  };
  if (patient.labs && patient.labs.length > 0) {
    row.labs = patient.labs;
  }
  return row;
};

export { patientToRecordRow, patientToPatientPartialRow };

const EMERGENCY_KEYWORDS = [
  "chest pain", "heart attack", "unconscious", "stroke", "can't breathe", "cannot breathe",
  "severe weakness", "confusion", "seizure", "collapsed", "paralysis", "slurred speech",
  "swelling of face", "swelling of throat"
];

const HIGH_RISK_KEYWORDS = [
  "sugar above 400", "sugar 400", "sugar below 60", "very high sugar", "very low sugar",
  "bp 200", "bp 180", "very high bp", "vomiting after injection", "foot wound",
  "foot ulcer", "diabetic foot", "pregnant", "fainted", "severe side effect"
];

const MEDICINE_CHANGE_KEYWORDS = [
  "stop medicine", "stop insulin", "change dose", "increase dose", "reduce dose",
  "double dose", "skip dose", "start medicine", "which medicine", "change insulin",
  "change mounjaro", "change semaglutide", "can i take", "should i take"
];

const MEDICAL_TOPICS = [
  "diabetes", "insulin", "sugar", "hba1c", "thyroid", "tsh", "bp", "blood pressure",
  "obesity", "weight", "fatty liver", "cholesterol", "neuropathy", "cgm", "semaglutide",
  "mounjaro", "medicine", "diet", "exercise", "reversal", "case", "profile"
];

const CLINIC_ASSISTANT_MODES = {
  EMERGENCY: "EMERGENCY",
  PROFILE_REVIEW: "PROFILE_REVIEW",
  VITALS_UPDATE: "VITALS_UPDATE",
  BOOKING: "BOOKING",
  LIFESTYLE_EDUCATION: "LIFESTYLE_EDUCATION"
};

const parseFirstNumber = (value) => {
  const match = `${value || ""}`.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const parseSystolicBP = (value) => {
  const match = `${value || ""}`.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return match ? Number(match[1]) : parseFirstNumber(value);
};

const hasAnyKeyword = (text, keywords) => keywords.some((word) => text.includes(word));

const hasCriticalReadings = ({ text = "", readings = {} }) => {
  const lowerText = text.toLowerCase();
  const sugarNumbers = [];
  const sugarPattern = /(sugar|glucose|fasting|post[-\s]?meal|pp|random)[^\d]{0,12}(\d{2,4})/gi;
  let sugarMatch = sugarPattern.exec(text);
  while (sugarMatch) {
    sugarNumbers.push(Number(sugarMatch[2]));
    sugarMatch = sugarPattern.exec(text);
  }

  const bpMatch = lowerText.match(/(?:bp|blood pressure)[^\d]{0,12}(\d{2,3})\s*\/\s*(\d{2,3})/);
  const messageSystolic = bpMatch ? Number(bpMatch[1]) : 0;
  const fastingReading = parseFirstNumber(readings.fasting);
  const readingSugar = Math.max(fastingReading, parseFirstNumber(readings.postMeal));
  const messageSugar = sugarNumbers.length ? Math.max(...sugarNumbers) : 0;
  const readingSystolic = parseSystolicBP(readings.bp);
  const messageLowSugar = sugarNumbers.some((value) => value > 0 && value < 70);
  const hasHypoglycemia = (fastingReading > 0 && fastingReading < 70) || messageLowSugar;

  return messageSugar > 400 || readingSugar > 400 || hasHypoglycemia || messageSystolic > 180 || readingSystolic > 180;
};

const classifyClinicAssistantMode = (message) => {
  const text = message.toLowerCase();
  if (hasAnyKeyword(text, EMERGENCY_KEYWORDS) || hasAnyKeyword(text, HIGH_RISK_KEYWORDS) || hasCriticalReadings({ text: message })) {
    return CLINIC_ASSISTANT_MODES.EMERGENCY;
  }
  if (hasAnyKeyword(text, ["my case", "my profile", "review", "what is wrong", "whats wrong", "what's wrong", "profile case"])) {
    return CLINIC_ASSISTANT_MODES.PROFILE_REVIEW;
  }
  if (hasAnyKeyword(text, ["upload", "report", "reading", "update reading", "update readings", "sugar update", "update sugar", "bp update", "update bp", "weight update", "log sugar", "log bp"])) {
    return CLINIC_ASSISTANT_MODES.VITALS_UPDATE;
  }
  if (hasAnyKeyword(text, ["book", "appointment", "consult", "follow up", "follow-up", "slot"])) {
    return CLINIC_ASSISTANT_MODES.BOOKING;
  }
  if (hasAnyKeyword(text, MEDICAL_TOPICS)) {
    return CLINIC_ASSISTANT_MODES.LIFESTYLE_EDUCATION;
  }
  return null;
};

const toDateValue = (date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
};

const getTodayDateValue = () => toDateValue(new Date());

const normalizePhone = (value = "") => {
  const trimmed = value.trim().replace(/\s+/g, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return trimmed;
};

const isPhoneProviderDisabled = (error) => {
  const message = `${error?.message || ""} ${error?.code || ""}`.toLowerCase();
  return message.includes("unsupported phone provider") || message.includes("phone_provider_disabled");
};

const friendlyAuthError = (error) => {
  if (isPhoneProviderDisabled(error)) {
    return "SMS sign-in is temporarily unavailable. Use your password or continue with Google.";
  }
  return error?.message || "Authentication failed. Please try again.";
};

const ensureUnit = (value, unit) => {
  const clean = `${value || ""}`.trim();
  if (!clean) return "";
  return clean.toLowerCase().includes(unit.toLowerCase()) ? clean : `${clean} ${unit}`;
};

const stripUnit = (value, unit) => `${value || ""}`.replace(new RegExp(`\\s*${unit.replace("/", "\\/")}$`, "i"), "");

const getAppointmentDays = () => {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      dateValue: toDateValue(date),
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      day: date.toLocaleDateString("en-US", { day: "2-digit" })
    };
  });
};

const formatAppointmentDate = (dateValue) => {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const parseClinicTime = (timeText, dateValue) => {
  const match = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  const date = new Date(`${dateValue}T00:00:00`);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const formatSlotTime = (date) => {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
};

const getSlotsFromClinicTiming = (clinic, dateValue, intervalMinutes = 30) => {
  const [startText, endText] = clinic.timing.split(/\s*-\s*/);
  const start = parseClinicTime(startText || "", dateValue);
  const end = parseClinicTime(endText || "", dateValue);
  if (!start || !end) return [];

  if (end <= start) end.setDate(end.getDate() + 1);

  const now = new Date();
  const slots = [];
  const cursor = new Date(start);
  while (cursor < end) {
    if (toDateValue(cursor) !== getTodayDateValue() || cursor > now) {
      slots.push(formatSlotTime(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + intervalMinutes);
  }
  return slots.slice(0, 12);
};

const findNextBookableDate = (clinic) => {
  const days = getAppointmentDays();
  return days.find((day) => getSlotsFromClinicTiming(clinic, day.dateValue).length > 0)?.dateValue
    || days[0]?.dateValue
    || getTodayDateValue();
};


const loadRazorpayCheckout = () => new Promise((resolve, reject) => {
  if (window.Razorpay) {
    resolve();
    return;
  }
  const existingScript = document.querySelector(`script[src="${razorpayScriptUrl}"]`);
  if (existingScript) {
    existingScript.addEventListener("load", resolve, { once: true });
    existingScript.addEventListener("error", reject, { once: true });
    return;
  }
  const script = document.createElement("script");
  script.src = razorpayScriptUrl;
  script.async = true;
  script.onload = resolve;
  script.onerror = reject;
  document.body.appendChild(script);
});

const getSupabaseAccessToken = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
};

const normalizeRupees = (value) => {
  const number = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : 0;
};

const createConsultationOrder = async ({ amountRupees, patient, clinic }) => {
  const accessToken = await getSupabaseAccessToken();
  const response = await fetch(`${RAZORPAY_API_BASE}/create-consultation-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify({
      amount: Math.round(amountRupees * 100),
      currency: "INR",
      patient,
      clinic,
      purpose: "doctor_consultation"
    })
  });

  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(response.status === 401
      ? "Your session has expired. Sign in again to pay for your consultation."
      : failure.error || "Could not create Razorpay order.");
  }
  return response.json();
};

const verifyConsultationPayment = async ({ order, response }) => {
  const accessToken = await getSupabaseAccessToken();
  const verifyResponse = await fetch(`${RAZORPAY_API_BASE}/verify-consultation-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify({
      order_id: order.order_id,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    })
  });

  if (!verifyResponse.ok) {
    const failure = await verifyResponse.json().catch(() => ({}));
    if (verifyResponse.status === 409 && failure.payment_status === "authorized") return failure;
    throw new Error(failure.error || "Payment completed, but verification failed.");
  }
  return verifyResponse.json();
};

const clinicThemes = [
  ["light", "Light", Sun],
  ["charcoal", "Charcoal", Eclipse],
  ["pine", "Pine", Leaf]
];

function getClinicTheme() {
  const saved = document.documentElement.dataset.clinicBootTheme;
  return clinicThemes.some(([id]) => id === saved)
    ? saved
    : window.matchMedia("(prefers-color-scheme: dark)").matches ? "charcoal" : "light";
}

function App() {
  const [screen, setScreen] = useState("intro");
  const [authMode, setAuthMode] = useState("signin");
  const [googleProfile, setGoogleProfile] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const directAuth = useRef(false);
  const recoveringPassword = useRef(false);
  const handledAuthUser = useRef(null);
  const [theme, setTheme] = useState(getClinicTheme);
  const [meshPaused, setMeshPaused] = useState(() => localStorage.getItem("clinic-mesh-motion") === "paused");
  function toggleMeshMotion() {
    const next = !meshPaused;
    localStorage.setItem("clinic-mesh-motion", next ? "paused" : "playing");
    setMeshPaused(next);
  }
  const changeTheme = (next) => {
    setTheme(next);
    document.documentElement.dataset.clinicBootTheme = next;
    try {
      localStorage.setItem("clinicAppearance", next);
    } catch {
      // Keep the selected appearance for this session.
    }
  };
  const [activeTab, setActiveTab] = useState("home");
  const [doctorTab, setDoctorTab] = useState("today");
  const [patientRecords, setPatientRecords] = useState(patients);
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id ?? null);
  const navigation = useClinicNavigation({
    scope: authMode === "reset" && screen === "auth" ? "recovery" : currentUser?.id || "guest",
    route: {
      screen,
      ...(screen === "auth" ? { authMode } : {}),
      ...(screen === "patient" ? { tab: activeTab } : {}),
      ...(screen === "doctor" ? { tab: doctorTab, ...(doctorTab === "patientDetail" ? { selectedPatientId } : {}) } : {})
    },
    restoreRoute: (route) => {
      setScreen(route.screen);
      if (route.screen === "auth") { setAuthMode(route.authMode); setAuthMessage(""); }
      if (route.screen === "patient") setActiveTab(route.tab);
      if (route.screen === "doctor") {
        if (route.selectedPatientId) setSelectedPatientId(route.selectedPatientId);
        setDoctorTab(route.tab);
      }
    }
  });
  const [availability, setAvailability] = useState({
    status: "Off Duty",
    clinicId: "clinic-2",
    online: false,
    message: "",
    updatedBy: "",
    updatedAt: ""
  });
  const [appointment, setAppointment] = useState({
    mode: "Clinic visit",
    date: getTodayDateValue(),
    time: "6:30 PM",
    reason: "Diabetes follow-up",
    status: "Pending doctor approval"
  });
  const [consultationFee] = useState({
    amount: ONLINE_CONSULTATION_FEE,
    label: `Rs ${ONLINE_CONSULTATION_FEE}`,
    updatedAt: "Clinic default"
  });
  const [consultPayment, setConsultPayment] = useState(makeDefaultConsultPayment);
  const [patientReadings, setPatientReadings] = useState({
    fasting: "",
    postMeal: "",
    bp: "",
    weight: "",
    hba1c: "",
    reportName: "",
    symptoms: "",
    note: "",
    updatedAt: "Not submitted yet"
  });
  const [educationPosts, setEducationPosts] = useState(() =>
    education.map(([title, body], index) => ({
      id: `seed-${index}`,
      title,
      body,
      tone: educationThemeOptions[index % educationThemeOptions.length].id,
      tag: "Doctor-approved",
      author: "Dr. Ashwani Kansal",
      updatedAt: "Clinic template"
    }))
  );

  const isMissingSupabaseTableError = (error) =>
    ["PGRST205", "42P01"].includes(error?.code) || /schema cache|does not exist/i.test(error?.message || "");

  const loadClinicBackendData = async () => {
    const [availabilityResult, educationResult] = await Promise.all([
      supabase.from("clinic_availability").select("*").eq("id", "live").maybeSingle(),
      supabase.from("education_posts").select("*").eq("published", true).order("updated_at", { ascending: false })
    ]);

    if (availabilityResult.data) {
      setAvailability(availabilityRowToState(availabilityResult.data));
    } else if (availabilityResult.error && !isMissingSupabaseTableError(availabilityResult.error)) {
      console.warn("Live availability load failed:", availabilityResult.error.message);
    }

    if (educationResult.data?.length) {
      setEducationPosts(educationResult.data.map(postRowToEducationPost));
    } else if (educationResult.error && !isMissingSupabaseTableError(educationResult.error)) {
      console.warn("Education posts load failed:", educationResult.error.message);
    }
  };

  const loadPatientRecords = async (user = currentUser) => {
    if (!user?.id) return;

    const query = supabase
      .from("patient_records")
      .select("*")
      .order("updated_at", { ascending: false });

    const { data, error } = isDoctorUser(user)
      ? await query
      : await query.eq("owner_id", user.id);

    if (error) {
      if (!isMissingSupabaseTableError(error)) {
        console.warn("Patient records load failed:", error.message);
      }
      return;
    }

    if (data?.length) {
      const records = data.map(recordRowToPatient);
      setPatientRecords((current) => {
        const seededById = new Map(current.map((patient) => [patient.id, patient]));
        records.forEach((patient) => seededById.set(patient.id, patient));
        return Array.from(seededById.values());
      });
      if (!isDoctorUser(user)) {
        setSelectedPatientId(records[0].id);
        setPatientReadings((current) => ({
          ...current,
          fasting: stripUnit(records[0].vitals.fasting || current.fasting, "mg/dL"),
          postMeal: stripUnit(records[0].vitals.postMeal || current.postMeal, "mg/dL"),
          bp: records[0].vitals.bp || current.bp,
          weight: stripUnit(records[0].vitals.weight || current.weight, "kg"),
          hba1c: stripUnit(records[0].vitals.hba1c || current.hba1c, "%"),
          symptoms: records[0].symptoms.join(", "),
          note: records[0].notes || current.note,
          updatedAt: records[0].lastVisit || current.updatedAt
        }));
      }
    }
  };

  const persistPatientRecord = async (patient, ownerId = patient.ownerId || null) => {
    const { error } = await supabase
      .from("patient_records")
      .upsert(patientToRecordRow(patient, ownerId), { onConflict: "id" });

    if (error && !isMissingSupabaseTableError(error)) {
      console.warn("Patient record sync failed:", error.message);
    }
  };

  const persistPatientVitals = async (patient, ownerId = patient.ownerId || null) => {
    const patientId = String(patient.id);
    const partialRow = patientToPatientPartialRow(patient, ownerId);
    const { data, error } = await supabase
      .from("patient_records")
      .update(partialRow)
      .eq("id", patientId)
      .select("id");

    if (error && !isMissingSupabaseTableError(error)) {
      console.warn("Patient vitals sync failed:", error.message);
      return;
    }

    // Update matched an existing row — done.
    if (data && data.length > 0) return;

    // 0 rows returned: either row doesn't exist, or RLS blocked the update.
    // Attempt a SELECT to disambiguate before falling back to full insert.
    const { data: existing } = await supabase
      .from("patient_records")
      .select("id")
      .eq("id", patientId)
      .maybeSingle();

    if (existing) {
      // Row exists but update was blocked (likely RLS / owner_id mismatch).
      console.warn(
        `persistPatientVitals: row ${patientId} exists but .update() returned 0 rows. ` +
        "This likely means RLS blocked the write (owner_id mismatch). Skipping fallback insert."
      );
      return;
    }

    // Row genuinely doesn't exist — first-time patient, insert with defaults.
    console.info(`persistPatientVitals: no existing row for ${patientId}, inserting new record.`);
    await persistPatientRecord(patient, ownerId);
  };

  const updatePatientRecord = (patientId, patch) => {
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    const existingPatient = patientRecords.find((patient) => patient.id === patientId);
    const nextPatient = existingPatient
      ? {
          ...existingPatient,
          ...cleanPatch,
          vitals: patch.vitals ? { ...existingPatient.vitals, ...patch.vitals } : existingPatient.vitals
        }
      : {
          id: patientId,
          name: patch.name || "Clinic Patient",
          age: patch.age || 0,
          gender: patch.gender || "Patient",
          mobile: patch.mobile || "",
          whatsapp: patch.whatsapp || patch.mobile || "",
          abha: patch.abha || "Not linked",
          source: patch.source || "Patient app",
          conditions: patch.conditions || [],
          latest: patch.latest || "Readings updated",
          risk: patch.risk || "Low",
          vitals: { ...defaultVitals, ...(patch.vitals || {}) },
          history: patch.history || [],
          labs: patch.labs || [],
          symptoms: patch.symptoms || [],
          medicines: patch.medicines || [],
          notes: patch.notes || "",
          followUp: patch.followUp || "Not scheduled",
          lastVisit: patch.lastVisit || "Just now"
        };

    setPatientRecords((records) => (
      records.some((patient) => patient.id === patientId)
        ? records.map((patient) => (patient.id === patientId ? nextPatient : patient))
        : [nextPatient, ...records]
    ));
    if (nextPatient && isDoctorUser(currentUser)) {
      persistPatientRecord(nextPatient);
    }
    return nextPatient;
  };

  const syncPatientReadingsToDoctor = async (readings) => {
    const patientId = currentUser?.id || selectedPatientId || "ramesh";
    const patientName = currentUser?.name || "Clinic Patient";
    const localPatch = {
      id: patientId,
      name: patientName,
      age: 0,
      gender: "Patient",
      mobile: currentUser?.phone || "",
      whatsapp: currentUser?.phone || "",
      abha: "Not linked",
      source: currentUser?.provider || "Patient app",
      conditions: readings.symptoms ? [readings.symptoms] : ["Patient update"],
      latest: readings.fasting ? `Fasting ${ensureUnit(readings.fasting, "mg/dL")}` : "Readings updated",
      vitals: {
        fasting: ensureUnit(readings.fasting, "mg/dL"),
        postMeal: ensureUnit(readings.postMeal, "mg/dL"),
        bp: readings.bp,
        weight: ensureUnit(readings.weight, "kg"),
        hba1c: readings.hba1c ? `${stripUnit(readings.hba1c, "%")}%` : ""
      },
      symptoms: readings.symptoms ? [readings.symptoms] : undefined,
      notes: readings.note || "Patient updated readings from app.",
      lastVisit: readings.updatedAt || "Just now"
    };

    updatePatientRecord(patientId, localPatch);

    if (!currentUser?.id) {
      return "Readings saved on this device. Sign in to sync them with Supabase.";
    }

    const { error } = await supabase.from("patient_readings").insert({
      patient_id: currentUser.id,
      fasting: readings.fasting || null,
      post_meal: readings.postMeal || null,
      bp: readings.bp || null,
      weight: readings.weight || null,
      hba1c: readings.hba1c || null,
      report_name: readings.reportName || null,
      symptoms: readings.symptoms || null,
      note: readings.note || null
    });

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        return "Readings saved locally. Apply the clinic app Supabase migration to enable cloud sync.";
      }
      return `Readings saved locally, but cloud sync failed: ${error.message}`;
    }

    await persistPatientVitals({
      id: patientId,
      name: patientName,
      age: 0,
      gender: "Patient",
      mobile: currentUser.phone || "",
      whatsapp: currentUser.phone || "",
      abha: "Not linked",
      source: currentUser.provider || "Patient app",
      conditions: localPatch.conditions,
      latest: localPatch.latest,
      risk: "Low",
      vitals: localPatch.vitals,
      history: [],
      labs: readings.reportName ? [`Uploaded report: ${readings.reportName}`] : [],
      symptoms: localPatch.symptoms || [],
      medicines: [],
      notes: localPatch.notes,
      followUp: "Not scheduled",
      lastVisit: localPatch.lastVisit
    }, currentUser.id);

    return "Readings saved for doctor review and synced to Supabase.";
  };

  const startConsultationPayment = async () => {
    if (["paid", "capture_pending", ...CONSULT_IN_FLIGHT_STATUSES].includes(consultPayment.status)) return;
    const amountRupees = normalizeRupees(consultationFee.amount);
    const openPaymentLink = async (message) => {
      // Open the page first so the browser treats this as a user gesture, then record it.
      window.open(RAZORPAY_PAYMENT_LINK, "_blank", "noopener,noreferrer");
      try {
        await recordPaymentLinkOpened();
        setConsultPayment({
          status: "payment_link",
          message,
          paymentId: "",
          paidAt: "",
          paymentUrl: RAZORPAY_PAYMENT_LINK
        });
      } catch (error) {
        console.warn("Could not record payment link request:", error.message);
        setConsultPayment({
          status: "failed",
          message: "The payment page opened, but we could not save your payment request. Please try again, or send the Razorpay receipt to the clinic.",
          paymentId: "",
          paidAt: "",
          paymentUrl: RAZORPAY_PAYMENT_LINK
        });
      }
      setAppointment((current) => ({
        ...current,
        mode: "Online consultation",
        status: "Pending payment verification"
      }));
    };

    if (!availability.online) {
      setConsultPayment({
        status: "offline",
        message: "Online consultation is not available right now. Please use WhatsApp or book a clinic visit.",
        paymentId: "",
        paidAt: "",
        paymentUrl: RAZORPAY_PAYMENT_LINK
      });
      return;
    }

    if (!amountRupees) {
      if (hasRazorpayPaymentLink) {
        await openPaymentLink(`Opening the clinic Razorpay payment page. Pay Rs ${ONLINE_CONSULTATION_FEE} unless the clinic has shared a different fee. WhatsApp consultation unlocks only after payment is verified.`);
        return;
      }

      setConsultPayment({
        status: "fee_pending",
        message: "Consultation fee is not set yet. Doctor/admin can set it from Live availability.",
        paymentId: "",
        paidAt: "",
        paymentUrl: ""
      });
      return;
    }

    if (!isRazorpayConfigured) {
      if (hasRazorpayPaymentLink) {
        await openPaymentLink(`Opening the clinic Razorpay payment page for the Rs ${amountRupees} consultation fee. WhatsApp consultation unlocks only after payment is verified.`);
        return;
      }

      setConsultPayment({
        status: "needs_config",
        message: "Razorpay public key is missing. Add VITE_RAZORPAY_KEY_ID before taking live payments.",
        paymentId: "",
        paidAt: "",
        paymentUrl: ""
      });
      return;
    }

    try {
      setConsultPayment((current) => ({
        ...current,
        status: "creating_order",
        message: "Creating secure Razorpay order..."
      }));
      await loadRazorpayCheckout();
      const patient = {
        user_id: currentUser?.id || "",
        name: currentUser?.name || "Patient",
        email: currentUser?.email || "",
        contact: currentUser?.phone || ""
      };
      const order = await createConsultationOrder({
        amountRupees,
        patient,
        clinic: activeClinic
      });

      let checkoutReportedResult = false;
      const checkout = new window.Razorpay({
        key: order.razorpay_key_id || RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Dr. Ashwani Metabolic Care",
        description: "Doctor consultation fee",
        order_id: order.order_id,
        prefill: patient,
        notes: {
          clinic: activeClinic.name,
          purpose: "doctor_consultation"
        },
        theme: { color: "#176763" },
        handler: async (response) => {
          checkoutReportedResult = true;
          setConsultPayment((current) => ({
            ...current,
            status: "verifying",
            message: "Verifying payment..."
          }));
          try {
            const verification = await verifyConsultationPayment({ order, response });
            if (verification.payment_status !== "captured") {
              setConsultPayment((current) => ({
                ...current,
                status: "capture_pending",
                message: "Payment authorized. Waiting for Razorpay to confirm capture.",
                paymentId: response.razorpay_payment_id
              }));
              return;
            }
            setConsultPayment({
              status: "paid",
              message: "Payment verified. WhatsApp consultation is unlocked.",
              paymentId: response.razorpay_payment_id,
              paidAt: new Date().toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                hour: "numeric",
                minute: "2-digit"
              }),
              paymentUrl: ""
            });
            setAppointment((current) => ({
              ...current,
              mode: "Online consultation",
              status: "Payment verified - ready for doctor/admin approval"
            }));
          } catch (error) {
            setConsultPayment({
              status: "failed",
              message: error.message || "Payment was received by Razorpay but clinic verification failed. Please share the Razorpay receipt with the clinic.",
              paymentId: response.razorpay_payment_id || "",
              paidAt: "",
              paymentUrl: RAZORPAY_PAYMENT_LINK
            });
          }
        },
        modal: {
          ondismiss: () => {
            if (checkoutReportedResult) return;
            setConsultPayment((current) => ({
              ...current,
              status: "not_started",
              message: "Payment was not completed."
            }));
          }
        }
      });
      if (typeof checkout.on === "function") {
        checkout.on("payment.failed", (response) => {
          checkoutReportedResult = true;
          setConsultPayment({
            status: "failed",
            message: response?.error?.description || "Razorpay payment failed. No WhatsApp consultation was unlocked.",
            paymentId: response?.error?.metadata?.payment_id || "",
            paidAt: "",
            paymentUrl: RAZORPAY_PAYMENT_LINK
          });
        });
      }
      checkout.open();
    } catch (error) {
      setConsultPayment({
        status: "failed",
        message: error.message || "Could not start Razorpay payment.",
        paymentId: "",
        paidAt: "",
        paymentUrl: RAZORPAY_PAYMENT_LINK
      });
    }
  };

  useEffect(() => {
    const boot = document.getElementById("clinic-boot");
    const frame = requestAnimationFrame(() => {
      boot?.setAttribute("aria-hidden", "true");
      boot?.classList.add("is-ready");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    loadClinicBackendData();
  }, []);

  useEffect(() => {
    if (currentUser?.id) {
      loadPatientRecords(currentUser);
    }
  }, [currentUser?.id, currentUser?.role]);

  const logAuthAction = async (user, role, action) => {
    if (!user?.id) return;
    const { error } = await supabase.from("clinic_login_audit").insert({
      user_id: user.id,
      email: user.email || null,
      phone: user.phone || null,
      provider: user.app_metadata?.provider || "email",
      role,
      action
    });
    if (error && !isMissingSupabaseTableError(error)) {
      console.warn("Clinic login audit failed:", error.message);
    }
  };

  const upsertClinicProfile = async (user, extra = {}) => {
    if (!user?.id) return null;
    const metadata = user.user_metadata || {};
    const email = user.email || extra.email || null;
    const { data: existing, error: profileError } = await supabase
      .from("clinic_profiles")
      .select("medical_profile, phone")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const { data: approved, error: roleError } = await supabase.rpc("clinic_is_doctor");
    if (roleError) throw roleError;
    let role = approved === true ? "doctor" : "patient";

    // Front-desk staff are allowlisted in clinic_staff. A failed check (for example before the
    // migration is deployed) leaves the account a normal patient, never grants extra access.
    if (role === "patient") {
      const { data: isStaff, error: staffError } = await supabase.rpc("clinic_is_staff");
      if (!staffError && isStaff === true) role = "receptionist";
    }

    const profile = {
      id: user.id,
      role,
      full_name: extra.fullName || metadata.full_name || metadata.name || user.email || user.phone || "Clinic User",
      email,
      phone: user.phone || extra.phone || existing?.phone || null,
      avatar_url: metadata.avatar_url || metadata.picture || null,
      provider: user.app_metadata?.provider || extra.provider || "email"
    };

    const { error } = await supabase
      .from("clinic_profiles")
      .upsert(profile, { onConflict: "id" });

    if (error) throw error;
    await logAuthAction(user, role, "sign_in");
    return { ...profile, hasMedicalProfile: Object.keys(existing?.medical_profile || {}).length > 0 };
  };

  const applySupabaseUser = async (user, extra = {}) => {
    const dbProfile = await upsertClinicProfile(user, extra);
    if (!dbProfile) return;
    handledAuthUser.current = user.id;

    const uiProfile = {
      name: dbProfile.full_name || "Clinic User",
      email: dbProfile.email,
      source: dbProfile.provider,
      avatar: dbProfile.avatar_url,
      phone: dbProfile.phone
    };

    setGoogleProfile(uiProfile.email ? uiProfile : null);

    if (dbProfile.role === "doctor") {
      setCurrentUser({
        id: dbProfile.id,
        role: "doctor",
        name: "Dr. Ashwani Kansal",
        email: dbProfile.email,
        phone: dbProfile.phone,
        avatar: dbProfile.avatar_url,
        provider: dbProfile.provider
      });
      setScreen("doctor");
      setDoctorTab("today");
      return;
    }

    if (dbProfile.role === "receptionist") {
      setCurrentUser({
        id: dbProfile.id,
        role: "receptionist",
        name: dbProfile.full_name || "Front desk",
        email: dbProfile.email,
        phone: dbProfile.phone,
        avatar: dbProfile.avatar_url,
        provider: dbProfile.provider
      });
      setScreen("reception");
      return;
    }

    setCurrentUser({
      id: dbProfile.id,
      role: "patient",
      name: dbProfile.full_name || "Clinic User",
      email: dbProfile.email,
      phone: dbProfile.phone,
      avatar: dbProfile.avatar_url,
      provider: dbProfile.provider
    });
    setScreen(extra.skipMedicalProfile || dbProfile.hasMedicalProfile ? "patient" : "patientMedicalInfo");
  };

  const showGoogleError = (message) => {
    window.localStorage.removeItem("clinicAuthRole");
    window.localStorage.removeItem("clinicAuthNeedsMedicalProfile");
    setScreen("auth");
    setAuthMessage(message);
  };

  useEffect(() => {
    let mounted = true;
    const webCallback = readOAuthCallback(window.location.href, window.location.origin + "/");
    if (webCallback?.error) {
      showGoogleError("Google sign-in could not be completed. Please try again.");
      window.history.replaceState(null, "", window.location.pathname);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.user) {
        recoveringPassword.current = true;
        window.localStorage.removeItem("clinicPasswordRecovery");
        window.localStorage.removeItem("clinicAuthNeedsMedicalProfile");
        setAuthMessage("");
        setAuthMode("reset");
        setScreen("auth");
        return;
      }
      if (event === "SIGNED_OUT") {
        recoveringPassword.current = false;
        handledAuthUser.current = null;
        setCurrentUser(null);
        setScreen("auth");
      }
      if (!session && (event === "INITIAL_SESSION" || event === "SIGNED_OUT")) {
        clearCareReminders().catch(() => {});
      }
      if ((event !== "INITIAL_SESSION" && event !== "SIGNED_IN") || !session?.user || directAuth.current) return;
      if (handledAuthUser.current === session.user.id) return;
      handledAuthUser.current = session.user.id;

      const needsMedicalProfile = window.localStorage.getItem("clinicAuthNeedsMedicalProfile") === "1";
      window.localStorage.removeItem("clinicAuthRole");
      window.localStorage.removeItem("clinicAuthNeedsMedicalProfile");

      // Supabase holds its auth lock while notifying listeners.
      window.setTimeout(async () => {
        if (!mounted || recoveringPassword.current) return;
        try {
          await applySupabaseUser(session.user, { skipMedicalProfile: !needsMedicalProfile });
        } catch (error) {
          if (!mounted) return;
          handledAuthUser.current = null;
          setScreen("auth");
          setAuthMessage(friendlyAuthError(error));
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let processedUrl;
    const finishGoogleSignIn = async ({ url }) => {
      const callback = readOAuthCallback(url, NATIVE_AUTH_CALLBACK);
      if (!active || !callback || processedUrl === url ||
          (window.localStorage.getItem("clinicAuthNeedsMedicalProfile") === null &&
           window.localStorage.getItem("clinicPasswordRecovery") === null)) return;
      processedUrl = url;
      const isRecovery = window.localStorage.getItem("clinicPasswordRecovery") !== null;
      window.localStorage.removeItem("clinicPasswordRecovery");
      void Browser.close().catch(() => {});

      if (callback.error || !callback.code) {
        showGoogleError(isRecovery ? "The password reset link could not be opened. Request a new link." : "Google sign-in could not be completed. Please try again.");
        return;
      }
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
        if (error) throw error;
      } catch (error) {
        if (active) showGoogleError(friendlyAuthError(error));
      }
    };
    const listener = CapacitorApp.addListener("appUrlOpen", finishGoogleSignIn);
    void listener.then(() => CapacitorApp.getLaunchUrl()).then((launch) => {
      if (launch) return finishGoogleSignIn(launch);
    }).catch(() => {
      if (active) showGoogleError("Google sign-in could not start on this device.");
    });

    return () => {
      active = false;
      void listener.then((handle) => handle.remove()).catch(() => {});
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthMessage("");
    try {
      const native = Capacitor.isNativePlatform();
      window.localStorage.removeItem("clinicPasswordRecovery");
      window.localStorage.setItem("clinicAuthNeedsMedicalProfile", "1");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: native ? NATIVE_AUTH_CALLBACK : window.location.origin + "/",
          skipBrowserRedirect: native,
          queryParams: { prompt: "select_account" }
        }
      });
      if (error) throw error;
      if (native) {
        if (!data.url) throw new Error("Google sign-in did not return an authorization URL.");
        await Browser.open({ url: data.url });
      }
    } catch (error) {
      showGoogleError(friendlyAuthError(error));
    }
  };

  const handleEmailAuth = async ({ mode, email, phone, password, fullName, identifierType = "email" }) => {
    setAuthMessage("");
    const normalizedIdentifier = normalizeClinicIdentifier(email || phone);
    const normalizedPhone = normalizePhone(phone || normalizedIdentifier);
    const usePhone = mode === "signin" && (identifierType === "phone" || isPhoneIdentifier(normalizedIdentifier));
    const normalizedEmail = usePhone ? "" : normalizedIdentifier;

    if (!password || (!normalizedEmail && !normalizedPhone)) {
      setAuthMessage("Please enter email or phone, and password.");
      return;
    }

    try {
      directAuth.current = true;
      const authCall = mode === "signup"
        ? supabase.auth.signUp({
            email: normalizeClinicIdentifier(email),
            password,
            options: {
              emailRedirectTo: Capacitor.isNativePlatform() ? NATIVE_AUTH_CALLBACK : window.location.origin + "/",
              data: { full_name: fullName, phone }
            }
          })
        : supabase.auth.signInWithPassword(
            usePhone ? { phone: normalizedPhone, password } : { email: normalizedEmail, password }
          );

      const { data, error } = await authCall;
      if (error) throw error;
      if (!data.session) {
        if (mode === "signup") window.localStorage.setItem("clinicAuthNeedsMedicalProfile", "1");
        setAuthMessage("Check your email to confirm the account, then sign in.");
        return;
      }

      await applySupabaseUser(data.user, {
        fullName,
        phone: normalizedPhone || phone,
        provider: "email",
        skipMedicalProfile: mode !== "signup"
      });
    } catch (error) {
      setAuthMessage(friendlyAuthError(error));
    } finally {
      directAuth.current = false;
    }
  };

  const handleSendPhoneOtp = async ({ phone }) => {
    setAuthMessage("");
    const normalizedPhone = normalizePhone(phone);
    if (!/^\+\d{8,15}$/.test(normalizedPhone)) {
      setAuthMessage("Enter your phone number with its country code, such as +91.");
      return false;
    }
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
      options: { shouldCreateUser: false }
    });
    setAuthMessage(error ? friendlyAuthError(error) : "Code sent to phone.");
    return !error;
  };

  const handleVerifyPhoneOtp = async ({ phone, token }) => {
    setAuthMessage("");
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone || !token) {
      setAuthMessage("Please enter phone number and OTP.");
      return;
    }

    directAuth.current = true;
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token,
        type: "sms"
      });
      if (error) throw error;
      await applySupabaseUser(data.user, {
        phone: normalizedPhone,
        provider: "phone",
        skipMedicalProfile: false
      });
    } catch (error) {
      setAuthMessage(friendlyAuthError(error));
    } finally {
      directAuth.current = false;
    }
  };

  const sendPasswordReset = async (email) => {
    setAuthMessage("");
    const native = Capacitor.isNativePlatform();
    window.localStorage.removeItem("clinicAuthNeedsMedicalProfile");
    if (native) window.localStorage.setItem("clinicPasswordRecovery", "1");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: native ? NATIVE_AUTH_CALLBACK : window.location.origin + "/"
    });
    if (error) window.localStorage.removeItem("clinicPasswordRecovery");
    setAuthMessage(error ? friendlyAuthError(error) : "If the email is registered, you’ll receive a password reset link.");
  };

  const saveNewPassword = async (password) => {
    setAuthMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setAuthMessage(friendlyAuthError(error));
      return;
    }
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) {
      setAuthMessage("Your password was updated. Close and reopen the app before signing in again.");
      return;
    }
    setAuthMode("signin");
    setAuthMessage("Password updated. Sign in with your new password.");
  };

  const activeClinic = clinics.find((clinic) => clinic.id === availability.clinicId) || clinics[0];
  const updateLiveAvailability = async (patch) => {
    const nextAvailability = {
      ...availability,
      ...patch,
      updatedBy: "Dr. Ashwani",
      updatedAt: "Just now"
    };
    setAvailability(nextAvailability);

    const { error } = await supabase
      .from("clinic_availability")
      .upsert(availabilityStateToRow(nextAvailability), { onConflict: "id" });

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        setAuthMessage("Live availability changed locally. Apply Supabase migrations to sync it for patients.");
        return;
      }
      setAuthMessage(`Live availability sync failed: ${error.message}`);
    }
  };

  const publishEducationPost = async (post) => {
    const nextPost = {
      id: `post-${Date.now()}`,
      ...post,
      title: post.title.trim(),
      body: post.body.trim(),
      author: "Dr. Ashwani Kansal",
      updatedAt: "Just now"
    };

    setEducationPosts((current) => [nextPost, ...current]);

    const { data, error } = await supabase
      .from("education_posts")
      .insert(educationPostToRow(nextPost))
      .select("*")
      .single();

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        setAuthMessage("Education post is local for now. Apply Supabase migrations to publish it to patients.");
        return;
      }
      setAuthMessage(`Education publish failed: ${error.message}`);
      return;
    }

    if (data) {
      setEducationPosts((current) => current.map((item) => (item.id === nextPost.id ? postRowToEducationPost(data) : item)));
    }
  };

  // Book tab: take the visit fee with Razorpay Checkout, then save the booking with the payment ID.
  // Resolves to { state: "booked" | "pending" | "cancelled" | "error", message, paymentId }.
  const payAndBookVisit = async (visit) => {
    if (!currentUser?.id) return { state: "error", message: "Please sign in before booking a visit." };
    if (!isRazorpayConfigured) {
      return { state: "error", message: `Online payment is not set up yet. Please book at the clinic reception for now.` };
    }

    const patient = {
      user_id: currentUser.id,
      name: currentUser.name || "Patient",
      email: currentUser.email || "",
      contact: currentUser.phone || ""
    };
    let order;
    try {
      await loadRazorpayCheckout();
      order = await createConsultationOrder({
        amountRupees: VISIT_FEE_RUPEES,
        patient,
        clinic: { id: activeClinic.id, name: activeClinic.name, purpose: VISIT_PAYMENT_PURPOSE, date: visit.date, time: visit.time }
      });
    } catch (error) {
      return { state: "error", message: error.message || "Could not open the payment. Check your connection and try again." };
    }

    const checkoutResult = await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
      const checkout = new window.Razorpay({
        key: order.razorpay_key_id || RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Dr Ashwani Family Clinic",
        description: `Clinic visit, ${visit.date} ${visit.time}`,
        order_id: order.order_id,
        prefill: patient,
        notes: { clinic: activeClinic.name, purpose: VISIT_PAYMENT_PURPOSE },
        theme: { color: "#176763" },
        handler: (response) => finish({ response }),
        modal: { ondismiss: () => finish({ cancelled: true }) }
      });
      checkout.on?.("payment.failed", (response) => finish({ failed: response?.error?.description || "The payment did not go through." }));
      checkout.open();
    });

    if (checkoutResult.cancelled) return { state: "cancelled", message: "Payment was not completed, so nothing was booked." };
    if (checkoutResult.failed) return { state: "error", message: `${checkoutResult.failed} Nothing was booked. You can try again.` };

    const paymentId = checkoutResult.response.razorpay_payment_id;
    let paid = false;
    try {
      const verification = await verifyConsultationPayment({ order, response: checkoutResult.response });
      paid = verification.payment_status === "captured";
    } catch (error) {
      console.warn("Visit payment verification failed:", error.message);
    }

    const { error } = await supabase.from("appointment_requests")
      .insert(bookingRow({ appointment: visit, user: currentUser, clinic: activeClinic, paymentId, paid }));
    const booked = { ...visit, mode: "Clinic visit", status: paid ? "Booked - fee paid" : "Booked - payment confirming" };
    setAppointment(booked);
    if (error) {
      console.warn("Booking save failed after payment:", error.message);
      return {
        state: "error",
        message: `Your payment went through (ID ${paymentId}) but we could not save the booking. Please call the clinic on ${CLINIC_HOTLINE_NUMBER} with this payment ID.`
      };
    }
    return paid
      ? { state: "booked", paymentId, message: `See you on ${formatAppointmentDate(visit.date)} at ${visit.time} at ${activeClinic.name}.` }
      : { state: "pending", paymentId, message: "Razorpay has your payment and is confirming it. Your slot is held. This usually takes a few minutes." };
  };

  const openAuthFromIntro = () => {
    setAuthMessage("");
    setAuthMode("signin");
    setScreen("auth");
  };

  useEffect(() => {
    setAppointment((current) => {
      const syncedDate = getSlotsFromClinicTiming(activeClinic, current.date).length > 0
        ? current.date
        : findNextBookableDate(activeClinic);
      const syncedSlots = getSlotsFromClinicTiming(activeClinic, syncedDate);
      const syncedMode = "Clinic visit";
      const syncedTime = syncedSlots.includes(current.time)
        ? current.time
        : syncedSlots[0] || current.time;

      if (
        syncedDate === current.date
        && syncedMode === current.mode
        && syncedTime === current.time
      ) {
        return current;
      }

      return {
        ...current,
        date: syncedDate,
        mode: syncedMode,
        time: syncedTime
      };
    });
  }, [activeClinic, availability.online, setAppointment]);

  // Restore the unlock from the database on sign-in, and re-check when the patient returns to the app
  // (e.g. after paying in the Razorpay page). Keeps the unlock across reloads and devices.
  useEffect(() => {
    if (currentUser?.role !== "patient" || !currentUser?.id) return undefined;

    let cancelled = false;
    const restore = () => {
      fetchConsultPayment(currentUser.id)
        .then((next) => {
          if (cancelled) return;
          setConsultPayment((current) => {
            if (CONSULT_IN_FLIGHT_STATUSES.includes(current.status)) return current;
            return next || (current.status === "capture_pending" ? current : makeDefaultConsultPayment());
          });
        })
        .catch((error) => console.warn("Consultation payment status load failed:", error.message));
    };

    restore();
    const onVisible = () => {
      if (document.visibilityState === "visible") restore();
    };
    document.addEventListener("visibilitychange", onVisible);
    const poll = consultPayment.status === "capture_pending" ? setInterval(onVisible, 8000) : null;
    return () => {
      clearInterval(poll);
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [currentUser?.id, currentUser?.role, consultPayment.status === "capture_pending"]);

  // Writes the "payment page opened" row the doctor confirms against. One pending row per patient.
  const recordPaymentLinkOpened = async () => {
    if (!currentUser?.id) return;

    const { data: existing, error: lookupError } = await supabase
      .from("consultation_payments")
      .select("razorpay_order_id")
      .eq("payment_status", CONSULT_LINK_PENDING_STATUS)
      .filter("patient->>user_id", "eq", currentUser.id)
      .limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) return;

    const reference = `link_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    const { error } = await supabase.from("consultation_payments").insert({
      razorpay_order_id: reference,
      amount: Math.round(Number(ONLINE_CONSULTATION_FEE) * 100),
      currency: "INR",
      payment_method: "payment_link",
      payment_status: CONSULT_LINK_PENDING_STATUS,
      patient: {
        user_id: currentUser.id,
        name: currentUser.name || "Patient",
        email: currentUser.email || "",
        contact: currentUser.phone || ""
      },
      clinic: { id: activeClinic.id, name: activeClinic.name }
    });
    if (error) throw error;
  };

  const enterPatient = async (medicalProfile = {}) => {
    const nextUser = currentUser || {
      role: "patient",
      name: medicalProfile.fullName || googleProfile?.name || "Clinic Patient",
      email: googleProfile?.email || "",
      avatar: googleProfile?.avatar || "",
      provider: googleProfile ? "Google" : "Clinic account"
    };

    setCurrentUser(nextUser);

    if (nextUser.id) {
      await supabase
        .from("clinic_profiles")
        .update({
          full_name: medicalProfile.fullName || nextUser.name || "Clinic Patient",
          phone: medicalProfile.phone || nextUser.phone || null,
          medical_profile: medicalProfile
        })
        .eq("id", nextUser.id);

      await persistPatientVitals({
        id: nextUser.id,
        name: medicalProfile.fullName || nextUser.name || "Clinic Patient",
        age: Number(medicalProfile.age) || 0,
        gender: medicalProfile.gender || "Patient",
        mobile: medicalProfile.phone || nextUser.phone || "",
        whatsapp: medicalProfile.whatsapp || medicalProfile.phone || nextUser.phone || "",
        abha: medicalProfile.abha || "Not linked",
        source: nextUser.provider || "Patient app",
        conditions: medicalProfile.conditions || [],
        latest: medicalProfile.fasting ? `Fasting ${ensureUnit(medicalProfile.fasting, "mg/dL")}` : "Medical intake completed",
        risk: medicalProfile.conditions?.includes("Diabetes") || medicalProfile.conditions?.includes("High BP") ? "Medium" : "Low",
        vitals: {
          fasting: ensureUnit(medicalProfile.fasting, "mg/dL"),
          postMeal: "",
          bp: medicalProfile.bp || "",
          weight: ensureUnit(medicalProfile.weight, "kg"),
          hba1c: medicalProfile.hba1c ? `${stripUnit(medicalProfile.hba1c, "%")}%` : "",
          thyroid: ""
        },
        history: medicalProfile.conditions || [],
        labs: [],
        symptoms: [],
        medicines: [],
        notes: `Preferred consult mode: ${medicalProfile.preferredMode || "Clinic visit"}`,
        followUp: "Not scheduled",
        lastVisit: "Medical intake"
      }, nextUser.id);
    }

    setScreen("patient");
    setActiveTab("home");
  };

  const signOut = async () => {
    const signedOutUserId = currentUser?.id;
    await supabase.auth.signOut();
    window.localStorage.removeItem("clinicAuthRole");
    if (signedOutUserId) {
      window.localStorage.removeItem(`clinic_patient_memory_${signedOutUserId}`);
    }
    window.localStorage.removeItem("clinic_patient_memory_guest");
    setCurrentUser(null);
    setGoogleProfile(null);
    setConsultPayment(makeDefaultConsultPayment());
    setAuthMode("signin");
    setScreen("auth");
  };

  return (
    <ClinicMotion.Provider value={{ paused: meshPaused, toggle: toggleMeshMotion }}>
    <main className={`app-stage ${theme === "light" ? "" : "dark-theme"}`} data-clinic-theme={theme}>
      <div className="phone-shell" ref={navigation.shell} onTouchStart={navigation.onTouchStart}
        onTouchEnd={navigation.onTouchEnd} onTouchCancel={navigation.onTouchCancel} onScrollCapture={navigation.onScrollCapture}>
        <ClinicMesh theme={theme} paused={meshPaused} />
        {screen === "intro" && (
          <IntroScreen
            theme={theme}
            setTheme={changeTheme}
            onContinue={openAuthFromIntro}
          />
        )}
        {screen === "auth" && (
          <AuthScreen
            onBack={authMode === "reset" ? signOut : () => { if (!navigation.goBack()) setScreen("intro"); }}
            authMode={authMode}
            setAuthMode={(next) => { setAuthMessage(""); setAuthMode(next); }}
            authMessage={authMessage}
            onEmailAuth={handleEmailAuth}
            onSendPhoneOtp={handleSendPhoneOtp}
            onVerifyPhoneOtp={handleVerifyPhoneOtp}
            onGoogleSignIn={handleGoogleSignIn}
            onPasswordReset={sendPasswordReset}
            onSavePassword={saveNewPassword}
            onError={(error) => setAuthMessage(friendlyAuthError(error))}
          />
        )}
        {screen === "patientMedicalInfo" && (
          <PatientMedicalInfo
            source={googleProfile ? "google" : "signup"}
            googleProfile={googleProfile}
            onBack={() => setScreen("auth")}
            onDone={enterPatient}
          />
        )}
        {screen === "patient" && (
          <PatientApp
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            currentUser={currentUser}
            theme={theme}
            setTheme={changeTheme}
            onSignOut={signOut}
            availability={availability}
            activeClinic={activeClinic}
            appointment={appointment}
            setAppointment={setAppointment}
            onPayAndBook={payAndBookVisit}
            educationPosts={educationPosts}
            patientReadings={patientReadings}
            setPatientReadings={setPatientReadings}
            onSubmitReadings={syncPatientReadingsToDoctor}
            patientRecords={patientRecords}
            consultationFee={consultationFee}
            consultPayment={consultPayment}
            onPayConsult={startConsultationPayment}
            onUpdatePatientRecord={(patientId, patch) => {
              const nextPatient = updatePatientRecord(patientId, patch);
              if (nextPatient && currentUser?.id) {
                persistPatientVitals(nextPatient, currentUser.id);
              }
            }}
          />
        )}
        {screen === "doctor" && (
          <DoctorApp
            doctorTab={doctorTab}
            setDoctorTab={setDoctorTab}
            currentUser={currentUser}
            theme={theme}
            setTheme={changeTheme}
            onSignOut={signOut}
            availability={availability}
            setAvailability={updateLiveAvailability}
            activeClinic={activeClinic}
            selectedPatientId={selectedPatientId}
            setSelectedPatientId={setSelectedPatientId}
            patients={patientRecords}
            updatePatientRecord={updatePatientRecord}
            educationPosts={educationPosts}
            onPublishEducationPost={publishEducationPost}
            consultationFee={consultationFee}
          />
        )}
        {screen === "reception" && (
          <ReceptionApp currentUser={currentUser} theme={theme} setTheme={changeTheme} onSignOut={signOut} />
        )}
      </div>
    </main>
    </ClinicMotion.Provider>
  );
}

// Front desk: read-only prescription lookup and printing. Staff cannot issue, edit or void.
function ReceptionApp({ currentUser, theme, setTheme, onSignOut }) {
  return (
    <section className="screen app-screen">
      <div className="app-header">
        <div>
          <span className="kicker">Front desk</span>
          <h2>Prescriptions</h2>
        </div>
        <ProfileButton user={currentUser} role="receptionist" theme={theme} setTheme={setTheme} onSignOut={onSignOut} />
      </div>
      <div className="scroll-area">
        <ReceptionPrescriptions clinics={clinics} />
      </div>
    </section>
  );
}

const clinicSpecialties = [
  [Droplet, "Diabetes", "Sugar and insulin plans"],
  [Activity, "Thyroid", "Tests and steady dose tuning"],
  [Weight, "Obesity care", "Diet and medicine plans"],
  [HeartPulse, "Hypertension", "BP control and heart care"],
  [Brain, "OCD", "Private, steady treatment"],
  [MessageCircle, "Anxiety", "Help with worry, panic, sleep"]
];

function ThemeChoices({ theme, setTheme }) {
  const motion = useContext(ClinicMotion);
  return (
    <div className="appearance-choices" role="group" aria-label="App appearance">
      {clinicThemes.map(([id, label, Icon]) => (
        <Popover.Close key={id} onClick={() => setTheme(id)} aria-pressed={theme === id}>
          <Icon size={17} />
          <span>{label}</span>
          {theme === id && <Check size={16} className="appearance-check" aria-hidden="true" />}
        </Popover.Close>
      ))}
      <button type="button" className="appearance-motion" onClick={motion.toggle}>
        {motion.paused ? "Resume background motion" : "Pause background motion"}
      </button>
    </div>
  );
}

function IntroScreen({ onContinue, theme, setTheme }) {
  const welcomeOverlaysRef = useRef(null);
  const ThemeIcon = clinicThemes.find(([id]) => id === theme)?.[2] || AppearanceIcon;

  return (
    <section className="screen intro-screen clinic-welcome" aria-labelledby="clinic-doctor-name">
      <header className="welcome-bar">
        <div className="welcome-identity">
          <span className="clinic-mark" aria-hidden="true" />
          <span className="clinic-wordmark"><b>Dr Ashwani</b><small>Family Clinic</small></span>
        </div>
        <div className="welcome-appearance-slot">
          <Popover.Root modal={false}>
            <Popover.Trigger className="welcome-appearance" aria-label="App appearance">
              <ThemeIcon size={20} aria-hidden="true" />
            </Popover.Trigger>
            <Popover.Portal container={welcomeOverlaysRef}>
              <Popover.Positioner positionMethod="fixed" side="bottom" align="end" sideOffset={8}
                viewportPadding={12} className="welcome-theme-positioner">
                <Popover.Popup className="profile-menu welcome-theme-menu">
                  <Popover.Title className="welcome-theme-title">Appearance</Popover.Title>
                  <ThemeChoices theme={theme} setTheme={setTheme} />
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </header>

      <WelcomeHero />

      <div className="welcome-sheet">
        <ConditionCards conditions={clinicSpecialties} />
        <div className="welcome-actions">
          <button type="button" className="primary-button w-full" onClick={onContinue}>
            Continue <ChevronRight size={19} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="welcome-overlays" ref={welcomeOverlaysRef} />
    </section>
  );
}

function AuthScreen({
  onBack, authMode, setAuthMode, authMessage, onEmailAuth, onSendPhoneOtp,
  onVerifyPhoneOtp, onGoogleSignIn, onPasswordReset, onSavePassword, onError
}) {
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", password: "", otp: "" });
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const isSignup = authMode === "signup";
  const isCode = authMode === "code";
  const isRecovery = authMode === "recover";
  const isReset = authMode === "reset";
  const passwordMode = authMode === "signin" || isSignup;
  const title = isSignup ? "Create an account" : isReset ? "Set a new password" :
    isRecovery ? "Reset your password" : isCode ? "Sign in with a code" : "Sign in to the clinic";

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "phone") setCodeSent(false);
  }

  function changeMode(next) {
    setForm((current) => ({ ...current, password: "", otp: "" }));
    setCodeSent(false);
    setAuthMode(next);
  }

  async function runAuth(action) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (isRecovery) return runAuth(() => onPasswordReset(form.email));
    if (isReset) return runAuth(() => onSavePassword(form.password));
    if (isCode) return runAuth(async () => {
      if (codeSent) await onVerifyPhoneOtp({ phone: form.phone, token: form.otp });
      else if (await onSendPhoneOtp({ phone: form.phone })) setCodeSent(true);
    });

    if (isSignup) return runAuth(() => onEmailAuth({ mode: "signup", ...form }));
    const phoneLogin = isPhoneIdentifier(form.email);
    return runAuth(() => onEmailAuth({
      mode: "signin", email: phoneLogin ? "" : form.email, phone: phoneLogin ? form.email : "",
      identifierType: phoneLogin ? "phone" : "email", password: form.password
    }));
  }

  return (
    <section className="screen auth-screen clinic-auth">
      <TopAction title="Clinic access" onBack={onBack} />
      <div className="clinic-auth-heading">
        <span className="clinic-mark" aria-hidden="true" />
        <h1>{title}</h1>
      </div>
      <div className="auth-card">
        <form className="auth-form clinic-account-form" onSubmit={submit}>
          {passwordMode && <>
            <div className="segmented auth-mode" role="group" aria-label="Account action">
              <button type="button" disabled={busy} className={!isSignup ? "active" : ""} aria-pressed={!isSignup} onClick={() => changeMode("signin")}>Sign in</button>
              <button type="button" disabled={busy} className={isSignup ? "active" : ""} aria-pressed={isSignup} onClick={() => changeMode("signup")}>Sign up</button>
            </div>
            <button type="button" className="google-button" disabled={busy} onClick={() => runAuth(onGoogleSignIn)}>
              <GoogleLogo /> Continue with Google
            </button>
            <div className="divider"><span />or<span /></div>
          </>}

          {isSignup && <label>Full name
            <input autoComplete="name" required value={form.fullName} onChange={(e) => updateField("fullName", e.target.value)} />
          </label>}
          {(isSignup || isCode) && <label>Phone number{isSignup && " (optional)"}
            <input type="tel" autoComplete="tel" required={isCode} placeholder="+91 98765 43210"
              value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
          </label>}
          {(passwordMode || isRecovery) && <label>{isSignup || isRecovery ? "Email address" : "Email or phone"}
            <input type={isSignup || isRecovery ? "email" : "text"} autoComplete={isSignup || isRecovery ? "email" : "username"}
              autoCapitalize="none" spellCheck={false} required value={form.email} onChange={(e) => updateField("email", e.target.value)} />
          </label>}
          {(passwordMode || isReset) && <label>{isReset ? "New password" : "Password"}
            <input key={isReset ? "reset" : "auth"} type="password" autoComplete={isSignup || isReset ? "new-password" : "current-password"}
              minLength={isSignup || isReset ? 6 : undefined} required value={form.password} onChange={(e) => updateField("password", e.target.value)} />
          </label>}
          {isCode && codeSent && <label>SMS code
            <input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6}
              value={form.otp} onChange={(e) => updateField("otp", e.target.value)} />
          </label>}

          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Please wait…" : isSignup ? "Create account" : isRecovery ? "Send reset link" :
              isReset ? "Save password" : isCode ? (codeSent ? "Verify code" : "Send code") : "Sign in"}
          </button>

          {authMode === "signin" && <div className="grid grid-cols-2 gap-2 clinic-auth-links">
            <button type="button" className="text-button" disabled={busy} onClick={() => changeMode("recover")}>Forgot password?</button>
            <button type="button" className="text-button" disabled={busy} onClick={() => changeMode("code")}>Use an SMS code</button>
          </div>}
          {(isRecovery || isCode) && <button type="button" className="text-button" disabled={busy} onClick={() => changeMode("signin")}>Back to sign in</button>}
          {authMessage && <div className="auth-message" role="status">{authMessage}</div>}
        </form>
      </div>
    </section>
  );
}

function GoogleLogo() {
  return (
    <svg className="google-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function PatientMedicalInfo({ source, googleProfile, onBack, onDone }) {
  const conditionOptions = ["Diabetes", "Obesity", "Thyroid", "Fatty liver", "High BP", "Cholesterol", "Neuropathy", "Weight"];
  const [profile, setProfile] = useState({
    fullName: googleProfile?.name || "",
    phone: "",
    whatsapp: "",
    age: "",
    gender: "Male",
    conditions: ["Diabetes"],
    fasting: "",
    hba1c: "",
    bp: "",
    weight: "",
    preferredMode: "Clinic visit"
  });
  const updateProfile = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  const toggleCondition = (condition) => {
    setProfile((current) => ({
      ...current,
      conditions: current.conditions.includes(condition)
        ? current.conditions.filter((item) => item !== condition)
        : [...current.conditions, condition]
    }));
  };

  return (
    <section className="screen signup-screen">
      <TopAction title="Medical profile" onBack={onBack} />
      <h2>{source === "google" ? "Complete your health profile" : "Add medical details"}</h2>
      <p className="screen-copy">These details help the clinic manage follow-ups and help Dr. Ashwani review your case.</p>

      {googleProfile && (
        <div className="integration-card google-connected">
          <span className="google-dot">G</span>
          <div>
            <strong>Google connected</strong>
            <small>{googleProfile.email} will be linked after consent.</small>
          </div>
        </div>
      )}

      <div className="form-card">
        <label>Full name<input value={profile.fullName} onChange={(event) => updateProfile("fullName", event.target.value)} placeholder="Patient full name" /></label>
        <label>Mobile number<input value={profile.phone} onChange={(event) => updateProfile("phone", event.target.value)} placeholder="+91 98765 43210" /></label>
        <label>WhatsApp number<input value={profile.whatsapp} onChange={(event) => updateProfile("whatsapp", event.target.value)} placeholder="+91 98765 43210" /></label>
        <div className="two-col">
          <label>Age<input value={profile.age} onChange={(event) => updateProfile("age", event.target.value)} placeholder="52" /></label>
          <label>Gender<select value={profile.gender} onChange={(event) => updateProfile("gender", event.target.value)}><option>Male</option><option>Female</option><option>Other</option></select></label>
        </div>
      </div>

      <div className="chip-panel">
        <strong>Existing conditions</strong>
        <div className="chip-wrap">
          {conditionOptions.map((item) => (
            <label className="chip-check" key={item}>
              <input type="checkbox" checked={profile.conditions.includes(item)} onChange={() => toggleCondition(item)} />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="form-card compact-form">
        <div className="two-col">
          <label>Fasting sugar<input value={profile.fasting} onChange={(event) => updateProfile("fasting", event.target.value)} placeholder="mg/dL" /></label>
          <label>HbA1c<input value={profile.hba1c} onChange={(event) => updateProfile("hba1c", event.target.value)} placeholder="%" /></label>
          <label>BP<input value={profile.bp} onChange={(event) => updateProfile("bp", event.target.value)} placeholder="128/82" /></label>
          <label>Weight<input value={profile.weight} onChange={(event) => updateProfile("weight", event.target.value)} placeholder="kg" /></label>
        </div>
        <label>Preferred consult mode<select value={profile.preferredMode} onChange={(event) => updateProfile("preferredMode", event.target.value)}><option>Clinic visit</option><option>WhatsApp consultation</option><option>Online consultation</option></select></label>
      </div>

      <label className="consent-line">
        <input type="checkbox" defaultChecked />
        I consent to storing health data and follow-up reminders.
      </label>

      <button className="primary-button" onClick={() => onDone(profile)}><Check size={18} /> Create patient app</button>
    </section>
  );
}

function privacyPage(path) {
  const url = Capacitor.isNativePlatform() ? `https://drashwaniclinic.pages.dev/${path}` : `/${path}`;
  if (Capacitor.isNativePlatform()) return Browser.open({ url });
  window.location.assign(url);
}

function ProfileButton({ user, role, theme, setTheme, onSignOut }) {
  const profileRef = useRef(null);
  const fallbackName = role === "doctor" ? "Dr. Ashwani Kansal" : "Patient";
  const displayName = user?.name || fallbackName;
  const initial = role === "doctor" ? "D" : getInitials(displayName).slice(0, 1);

  return (
    <div className="profile-wrap" ref={profileRef}>
      <Popover.Root>
        <Popover.Trigger className={`avatar-button ${role === "doctor" ? "doctor-avatar" : ""}`} aria-label="Open profile menu">
          {user?.avatar ? <img src={user.avatar} alt="" /> : initial}
        </Popover.Trigger>
        <Popover.Portal container={profileRef}>
          <Popover.Positioner align="end" sideOffset={8}>
            <Popover.Popup className="profile-menu">
              <div className="profile-menu-head">
                <span className="profile-mini-avatar">
                  {user?.avatar ? <img src={user.avatar} alt="" /> : <UserRound size={18} />}
                </span>
                <div>
                  <Popover.Title render={<strong />}>{displayName}</Popover.Title>
                  <small>{user?.email || user?.provider || "Clinic account"}</small>
                </div>
              </div>
              <ThemeChoices theme={theme} setTheme={setTheme} />
              <Popover.Close onClick={() => void privacyPage("privacy.html")}>Privacy policy</Popover.Close>
              <Popover.Close onClick={() => void privacyPage("account-deletion.html")}>Request account deletion</Popover.Close>
              <Popover.Close onClick={onSignOut}>
                <LogOut size={17} />
                Sign out
              </Popover.Close>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function PatientApp({
  activeTab,
  setActiveTab,
  currentUser,
  theme,
  setTheme,
  onSignOut,
  availability,
  activeClinic,
  appointment,
  setAppointment,
  onPayAndBook,
  educationPosts,
  patientReadings,
  setPatientReadings,
  onSubmitReadings,
  patientRecords,
  consultationFee,
  consultPayment,
  onPayConsult,
  onUpdatePatientRecord
}) {
  const userId = currentUser?.id;
  const activePatientProfile = userId
    ? patientRecords.find((patient) => patient.id === userId) || patientRecords.find((patient) => patient.ownerId === userId)
    : null;
  const bookingDays = useMemo(() => getAppointmentDays(), []);
  const getSlotsForClinic = React.useCallback((dateValue) => getSlotsFromClinicTiming(activeClinic, dateValue), [activeClinic]);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  useEffect(() => { setTutorialOpen(shouldShowTutorial(userId)); }, [userId]);

  return (
    <section className="screen app-screen">
      {tutorialOpen && <PatientTutorial userId={userId} onClose={() => setTutorialOpen(false)} />}
      <div className="app-header">
        <div>
          <span className="kicker">Dr Ashwani Family Clinic</span>
          <h2>{activeTab === "home" ? "Your care" : patientTabTitles[activeTab]}</h2>
        </div>
        <ProfileButton user={currentUser} role="patient" theme={theme} setTheme={setTheme} onSignOut={onSignOut} />
      </div>

      <div className="scroll-area">
        {currentUser?.id && (
          <div hidden={activeTab !== "care"}>
            <button className="secondary-button care-back" onClick={() => setActiveTab("home")}><ChevronLeft size={18} /> Home</button>
            <PatientCarePlan key={JSON.stringify([currentUser.id, activePatientProfile?.id])} patient={activePatientProfile}
              userId={currentUser.id} onBook={() => setActiveTab("book")} />
            <PatientPrescriptions key={activePatientProfile?.id || "none"} patient={activePatientProfile} clinics={clinics} />
          </div>
        )}
        <React.Fragment key={activeTab}>
          {activeTab === "home" && (
            <PatientHome
              availability={availability}
              activeClinic={activeClinic}
              appointment={appointment}
              setActiveTab={setActiveTab}
              patientReadings={patientReadings}
              consultationFee={consultationFee}
              consultPayment={consultPayment}
              onPayConsult={onPayConsult}
            />
          )}
          {activeTab === "updates" && (
            <HealthUpdates
              readings={patientReadings}
              setReadings={setPatientReadings}
              onSubmitReadings={onSubmitReadings}
            />
          )}
          {activeTab === "book" && (
            <BookVisit
              appointment={appointment}
              setAppointment={setAppointment}
              clinic={activeClinic}
              onDuty={availability.status === "On Duty"}
              days={bookingDays}
              todayValue={getTodayDateValue()}
              getSlots={getSlotsForClinic}
              onPayAndBook={onPayAndBook}
            />
          )}
          {activeTab === "chat" && (
            <PatientChat
              availability={availability}
              activeClinic={activeClinic}
              patientProfile={activePatientProfile}
              memoryOwnerId={currentUser?.id}
              setActiveTab={setActiveTab}
              onUpdatePatientRecord={onUpdatePatientRecord}
            />
          )}
          {activeTab === "library" && <EducationLibrary posts={educationPosts} />}
        </React.Fragment>
      </div>

      <PatientNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </section>
  );
}

const patientTabTitles = {
  care: "Prescription and follow-up",
  updates: "Update readings",
  book: "Book appointment",
  chat: "Clinic assistant",
  library: "Education library"
};

function PatientHome({
  availability,
  activeClinic,
  appointment,
  setActiveTab,
  patientReadings,
  consultationFee,
  consultPayment,
  onPayConsult
}) {
  const hasEmergencyReadings = hasCriticalReadings({ readings: patientReadings });
  const hasEmergencyNotes = hasAnyKeyword(
    `${patientReadings.symptoms || ""} ${patientReadings.note || ""}`.toLowerCase(),
    EMERGENCY_KEYWORDS
  );

  return (
    <>
      {(hasEmergencyReadings || hasEmergencyNotes) && <UrgentCareBanner />}

      <LiveAvailabilityViewer
        availability={availability}
        activeClinic={activeClinic}
        consultationFee={consultationFee}
        consultPayment={consultPayment}
        onPayConsult={onPayConsult}
        onBook={() => setActiveTab("book")}
      />

      <section className="patient-shortcuts" aria-labelledby="patient-shortcuts-heading">
        <h3 id="patient-shortcuts-heading">Quick actions</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            [Pill, "Prescriptions", "Medicines and follow-ups", "care"],
            [Activity, "Health readings", "Log readings and reports", "updates"],
            [CalendarCheck, "Appointments", "Request or review a visit", "book"],
            [Bot, "Clinic assistant", "Get help using the app", "chat"]
          ].map(([Icon, label, description, tab]) => (
            <button key={tab} type="button" className="patient-shortcut grid items-start text-left" onClick={() => setActiveTab(tab)}>
              <Icon size={18} aria-hidden="true" />
              <span><strong>{label}</strong><small>{description}</small></span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <div className="metric-grid">
        <MetricTile label="Fasting" value={patientReadings.fasting || "--"} suffix="mg/dL" tone="rose" />
        <MetricTile label="BP" value={patientReadings.bp || "--"} suffix="mmHg" tone="blue" />
        <MetricTile label="Weight" value={patientReadings.weight || "--"} suffix="kg" tone="green" />
        <MetricTile label="HbA1c" value={patientReadings.hba1c || "--"} suffix="%" tone="lavender" />
      </div>

      <div className="appointment-card mobile-card">
        <span>Appointment status</span>
        <strong>{appointment.reason}</strong>
        <div><Clock size={15} /> {formatAppointmentDate(appointment.date)} at {appointment.time}</div>
        <p>{appointment.status}</p>
      </div>

    </>
  );
}

function LiveAvailabilityViewer({ availability, activeClinic, consultationFee, consultPayment, onPayConsult, onBook }) {
  const isOnDuty = availability.status === "On Duty";
  const canStartConsultPayment = isOnDuty && availability.online;
  const feeAmount = normalizeRupees(consultationFee.amount);
  const isPaid = consultPayment.status === "paid";
  const usesPaymentLink = consultPayment.status === "payment_link";
  const doctorWhatsAppHref = doctorWhatsappUrl(`Payment verified for online consultation. Patient is ready to consult Dr. Ashwani Kansal. Payment reference: ${consultPayment.paymentId || "verified in app"}.`);
  const consultButtonLabel = isPaid
    ? "Open WhatsApp"
    : !canStartConsultPayment
      ? "Book instead"
      : feeAmount
        ? `Pay Rs ${feeAmount}`
        : hasRazorpayPaymentLink
          ? "Open Razorpay"
          : "Fee pending";
  return (
    <div className={`live-view-card ${isOnDuty ? "on" : "off"}`}>
      <div className="live-card-head">
        <span>{isOnDuty ? "ON DUTY NOW" : "OFF DUTY"}</span>
        <Bell size={18} />
      </div>
      <h3>{isOnDuty ? `${activeClinic.name} - ${activeClinic.short}` : "Doctor is currently off duty"}</h3>
      {availability.message
        ? <p className="live-note">{availability.message}</p>
        : <p>{isOnDuty ? "Walk in during clinic hours, or book a slot in the Book tab." : "You can still request an appointment."}</p>}
      <div className="clinic-detail-list">
        <span><Clock size={15} /> {activeClinic.timing}</span>
        {isOnDuty && <span><MapPin size={15} /> {activeClinic.address}</span>}
        <span><Video size={15} /> Online consultation {availability.online ? "available" : "not available"}</span>
        <span><ShieldCheck size={15} /> Consultation fee {feeAmount ? `Rs ${feeAmount}` : consultationFee.label}</span>
      </div>
      {canStartConsultPayment ? (
        <div className={`payment-status-card ${consultPayment.status}`}>
          <strong>{isPaid ? "Payment verified" : usesPaymentLink ? "Payment verification pending" : "Payment before consult"}</strong>
          <p>{consultPayment.message}</p>
          {consultPayment.paymentId && <small>Razorpay: {consultPayment.paymentId}</small>}
          {consultPayment.paymentUrl && !isPaid && (
            <a href={consultPayment.paymentUrl} target="_blank" rel="noreferrer">
              Open Razorpay payment page
            </a>
          )}
        </div>
      ) : (
        <div className="payment-status-card booking-only">
          <strong>Booking only right now</strong>
          <p>Online consultations are unavailable right now. You can still request a clinic visit.</p>
        </div>
      )}
      <div className="split-actions">
        {isOnDuty ? (
          <a
            className="map-action-button"
            href={activeClinic.mapsUrl}
            target="_blank"
            rel="noreferrer"
          >
            Directions
          </a>
        ) : null}
        {isPaid ? (
          <a className="consult-unlocked-button" href={doctorWhatsAppHref} target="_blank" rel="noreferrer">
            {consultButtonLabel}
          </a>
        ) : (
          <button disabled={canStartConsultPayment && ["capture_pending", ...CONSULT_IN_FLIGHT_STATUSES].includes(consultPayment.status)} onClick={canStartConsultPayment ? onPayConsult : onBook}>
            {consultPayment.status === "capture_pending" && canStartConsultPayment ? "Waiting for payment confirmation" : consultButtonLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function HealthUpdates({ readings, setReadings, onSubmitReadings }) {
  const [draft, setDraft] = useState(readings);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const submitReadings = async () => {
    const next = {
      ...draft,
      updatedAt: new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "numeric",
        minute: "2-digit"
      })
    };
    setSaving(true);
    setStatus("Saving readings...");
    setReadings(next);
    const result = await onSubmitReadings(next);
    setDraft(next);
    setStatus(result || "Readings saved for doctor review.");
    setSaving(false);
  };

  return (
    <div className="stack">
      <div className="updates-form-card">
        <div className="editor-title-row">
          <span><Activity size={19} /></span>
          <div>
            <strong>Today&apos;s readings</strong>
            <small>These values update the patient home cards and are marked for doctor review.</small>
          </div>
        </div>

        <div className="two-col">
          <label>Fasting sugar<input inputMode="numeric" value={draft.fasting} onChange={(event) => updateDraft("fasting", event.target.value)} placeholder="142" /></label>
          <label>Post-meal sugar<input inputMode="numeric" value={draft.postMeal} onChange={(event) => updateDraft("postMeal", event.target.value)} placeholder="186" /></label>
        </div>
        <div className="two-col">
          <label>BP<input value={draft.bp} onChange={(event) => updateDraft("bp", event.target.value)} placeholder="128/82" /></label>
          <label>Weight<input inputMode="decimal" value={draft.weight} onChange={(event) => updateDraft("weight", event.target.value)} placeholder="84.2" /></label>
        </div>
        <label>HbA1c<input inputMode="decimal" value={draft.hba1c} onChange={(event) => updateDraft("hba1c", event.target.value)} placeholder="7.4" /></label>
        <label className="file-upload-field">
          <span>Report upload</span>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(event) => updateDraft("reportName", event.target.files?.[0]?.name || "")}
          />
          <span className="file-upload-control">
            <Upload size={17} />
            {draft.reportName ? "Change report" : "Choose report"}
          </span>
        </label>
        {draft.reportName && (
          <div className="uploaded-file-chip">
            <Upload size={16} />
            <span>{draft.reportName}</span>
          </div>
        )}
        <label>Symptoms<input value={draft.symptoms} onChange={(event) => updateDraft("symptoms", event.target.value)} placeholder="Weakness, dizziness, burning feet..." /></label>
        <label>Note for doctor<input value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} placeholder="Medicine timing, diet change, missed dose..." /></label>

        <button className="primary-button" onClick={submitReadings} disabled={saving}>
          <Check size={18} /> {saving ? "Saving..." : "Submit readings"}
        </button>
      </div>

      <div className="update-summary-card">
        <span>Last update</span>
        <strong>{readings.updatedAt}</strong>
        <div className="detail-grid">
          <div className="detail-metric"><span>Fasting</span><strong>{readings.fasting || "--"} mg/dL</strong></div>
          <div className="detail-metric"><span>Post Meal</span><strong>{readings.postMeal || "--"} mg/dL</strong></div>
          <div className="detail-metric"><span>BP</span><strong>{readings.bp || "--"}</strong></div>
          <div className="detail-metric"><span>Weight</span><strong>{readings.weight || "--"} kg</strong></div>
        </div>
        {(status || readings.reportName || readings.symptoms || readings.note) && (
          <p>
            {status || "Saved for doctor review."}
            {readings.reportName ? ` Report: ${readings.reportName}.` : ""}
            {readings.symptoms ? ` Symptoms: ${readings.symptoms}.` : ""}
            {readings.note ? ` Note: ${readings.note}.` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function UrgentCareBanner({ onDismiss }) {
  const whatsappEmergencyMsg = doctorWhatsappUrl("EMERGENCY ALERT: Patient requires urgent medical review by Dr. Ashwani Kansal.");
  return (
    <div className="urgent-care-banner" role="alert">
      <div className="urgent-care-header">
        <AlertTriangle size={22} />
        <span>URGENT MEDICAL ESCALATION</span>
      </div>
      <div className="urgent-care-body">
        <p>Your message or logged vitals indicate a potential high-risk medical issue or severe sugar/BP spike.</p>
        <p><strong>First-aid for Low Sugar (&lt;70 mg/dL):</strong> Consume 15g fast-acting sugar (fruit juice or 3 tsp sugar) and recheck in 15 minutes.</p>
      </div>
      <div className="urgent-care-actions">
        <a href={`tel:${CLINIC_HOTLINE_NUMBER.replace(/\s/g, "")}`} className="urgent-btn-call">
          <Phone size={15} /> Call Clinic Hotline ({CLINIC_HOTLINE_NUMBER})
        </a>
        <a href={whatsappEmergencyMsg} target="_blank" rel="noreferrer" className="urgent-btn-whatsapp">
          <MessageCircle size={15} /> WhatsApp Emergency
        </a>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="urgent-btn-dismiss">
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

function PatientStoriesCarousel() {
  const stories = [
    {
      badge: "Diabetes care",
      title: "Post-meal walks can reduce sugar spikes",
      desc: "Discuss walking routines, meal timing, and glucose logs during follow-up with Dr. Ashwani Kansal."
    },
    {
      badge: "CGM insights",
      title: "Track patterns, not single readings",
      desc: "Continuous glucose trends can help identify food, stress, sleep, and medicine-timing triggers."
    },
    {
      badge: "BP safety",
      title: "Know when BP readings need urgent review",
      desc: "Repeated high readings, chest pain, breathlessness, or confusion should be escalated immediately."
    }
  ];

  return (
    <div className="stories-section">
      <div className="stories-header">
        <h3>Patient Journeys & Education</h3>
      </div>
      <div className="stories-scroll" tabIndex={0} aria-label="Patient education stories">
        {stories.map((story, index) => (
          <div className="story-card" key={index}>
            <span className="story-badge">{story.badge}</span>
            <strong>{story.title}</strong>
            <p>{story.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

async function getSemanticClinicAssistantReply(message, context) {
  const { data, error } = await supabase.functions.invoke("clinic-ai-assistant", {
    body: { message, ...context }
  });

  if (error) throw error;
  if (!data?.reply) throw new Error("Assistant response was empty");
  return data;
}

function PatientChat({ availability, activeClinic, patientProfile, memoryOwnerId, setActiveTab, onUpdatePatientRecord }) {
  const threadRef = useRef(null);
  const nextSlots = useMemo(() => getSlotsFromClinicTiming(activeClinic, getTodayDateValue()).slice(0, 4), [activeClinic]);
  const [messages, setMessages] = useState([
    {
      role: "bot",
      label: "Clinic assistant",
      text: "Hello! I am Dr. Ashwani Kansal's AI Clinic Assistant. I can review your health profile, guide your sugar & BP logs, explain metabolic health topics, and check live doctor availability.",
      actionCard: null
    }
  ]);
  const [draft, setDraft] = useState("");
  const [showUrgentBanner, setShowUrgentBanner] = useState(false);
  const [assistantThinking, setAssistantThinking] = useState(false);

  const [chatState, setChatState] = useState("idle");
  const [formData, setFormData] = useState({});

  const [appointmentRequests, setAppointmentRequests] = useState([]);
  const [healthUpdates, setHealthUpdates] = useState([]);
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [cardDraft, setCardDraft] = useState({ fasting: "", postMeal: "", systolic: "", diastolic: "" });

  // Persistent Patient Memory (CL4R1T4S context extraction)
  const patientMemoryKey = `clinic_patient_memory_${patientProfile?.id || memoryOwnerId || "guest"}`;
  const [patientMemory, setPatientMemory] = useState(() => {
    try {
      const saved = localStorage.getItem(patientMemoryKey);
      return saved ? JSON.parse(saved) : { keyFacts: [], lastSummary: "" };
    } catch {
      return { keyFacts: [], lastSummary: "" };
    }
  });
  const [loadedMemoryKey, setLoadedMemoryKey] = useState(patientMemoryKey);
  const patientMemorySummary = patientMemory.keyFacts.join("; ");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(patientMemoryKey);
      setPatientMemory(saved ? JSON.parse(saved) : { keyFacts: [], lastSummary: "" });
    } catch {
      setPatientMemory({ keyFacts: [], lastSummary: "" });
    } finally {
      setLoadedMemoryKey(patientMemoryKey);
    }
  }, [patientMemoryKey]);

  useEffect(() => {
    if (loadedMemoryKey !== patientMemoryKey) return;
    try {
      localStorage.setItem(patientMemoryKey, JSON.stringify(patientMemory));
    } catch (e) {
      console.warn("Failed to persist patient memory:", e);
    }
  }, [patientMemory, patientMemoryKey, loadedMemoryKey]);

  useEffect(() => {
    if (!patientProfile?.notes?.includes("AI memory:")) return;
    const noteMemory = patientProfile.notes
      .split("\n")
      .find((line) => line.trim().startsWith("AI memory:"))
      ?.replace("AI memory:", "")
      .trim();
    if (!noteMemory) return;
    setPatientMemory((prev) => {
      const incoming = noteMemory.split(";").map((part) => part.trim()).filter(Boolean);
      const missing = incoming.filter((fact) => !prev.keyFacts.includes(fact));
      if (!missing.length) return prev;
      const nextFacts = [...prev.keyFacts, ...missing].slice(-6);
      return { ...prev, keyFacts: nextFacts, lastSummary: nextFacts.join("; ") };
    });
  }, [patientProfile?.id, patientProfile?.notes]);

  useEffect(() => {
    if (!patientProfile || !Object.prototype.hasOwnProperty.call(patientProfile, "notes") || !onUpdatePatientRecord || !patientMemorySummary) return;
    const existingNotes = patientProfile.notes || "";
    const notesWithoutMemory = existingNotes
      .split("\n")
      .filter((line) => !line.trim().startsWith("AI memory:"))
      .join("\n")
      .trim();
    const nextNotes = [notesWithoutMemory, `AI memory: ${patientMemorySummary}`].filter(Boolean).join("\n");
    if (nextNotes === existingNotes) return;
    onUpdatePatientRecord(patientProfile.id, { notes: nextNotes });
  }, [onUpdatePatientRecord, patientMemorySummary, patientProfile]);

  const addBotMessage = (text, actionCard = null) => {
    setMessages((items) => [...items, { role: "bot", label: "Clinic assistant", text, actionCard }]);
  };

  const addUserMessage = (text) => {
    setMessages((items) => [...items, { role: "user", label: "You", text }]);
  };

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [messages]);

  const sendMessage = async (text) => {
    const cleanText = text.trim();
    if (!cleanText || assistantThinking) return;

    addUserMessage(cleanText);
    setDraft("");

    if (chatState !== "idle") {
      handleStateFlow(cleanText);
      return;
    }

    const lowerText = cleanText.toLowerCase();
    const mode = classifyClinicAssistantMode(cleanText);

    if (mode === CLINIC_ASSISTANT_MODES.EMERGENCY) {
      setShowUrgentBanner(true);
      setRiskAlerts((items) => [
        ...items,
        { type: "Emergency", message: cleanText, createdAt: new Date().toLocaleString() }
      ]);
      addBotMessage("URGENT: This message or reading may indicate an emergency. Please call Dr. Ashwani's clinic hotline or contact emergency services immediately.", "emergency_call");
      saveMemoryFact("Emergency or critical reading detected");
      return;
    }

    if (lowerText.includes("update sugar") || lowerText.includes("sugar update")) {
      setChatState("sugar_fasting");
      setFormData({});
      addBotMessage("Please enter your fasting sugar value (mg/dL).", "sugar_input");
      return;
    }

    if (lowerText.includes("update bp") || lowerText.includes("bp update") || lowerText.includes("blood pressure")) {
      setChatState("bp_systolic");
      setFormData({});
      addBotMessage("Please enter your systolic BP value (e.g. 120).", "bp_input");
      return;
    }

    if (lowerText.includes("book appointment") || lowerText.includes("appointment")) {
      setChatState("appointment_type");
      setFormData({});
      addBotMessage("Would you like a clinic visit or online consultation? You can also open a quick slot below.", "slot_picker");
      return;
    }

    const fallback = generateClinicAssistantReply(cleanText, {
      availability,
      activeClinic,
      patientProfile,
      patientMemory
    });

    let assistantReply = fallback;
    setAssistantThinking(true);
    try {
      assistantReply = await getSemanticClinicAssistantReply(cleanText, {
        availability,
        activeClinic,
        patientProfile,
        patientMemory
      });
    } catch (error) {
      console.warn("Semantic assistant unavailable, using local fallback:", error.message);
    } finally {
      setAssistantThinking(false);
    }

    const { reply, actionCard, extractedFact } = assistantReply;
    saveMemoryFact(extractedFact);

    addBotMessage(reply, actionCard);
  };

  const handleStateFlow = (text) => {
    const lowerText = text.toLowerCase();

    if (hasEmergencyText(lowerText)) {
      setShowUrgentBanner(true);
      setRiskAlerts((items) => [
        ...items,
        { type: "Emergency", message: text, createdAt: new Date().toLocaleString() }
      ]);
      setChatState("idle");
      setFormData({});
      addBotMessage("URGENT: This message indicates a potential emergency. Please contact emergency medical services or call Dr. Ashwani's clinic hotline directly.", "emergency_call");
      return;
    }

    if (chatState === "sugar_fasting") {
      setFormData((data) => ({ ...data, fastingSugar: text }));
      setChatState("sugar_post_meal");
      addBotMessage("Please enter your post-meal sugar value.");
      return;
    }

    if (chatState === "sugar_post_meal") {
      setFormData((data) => ({ ...data, postMealSugar: text }));
      setChatState("sugar_symptoms");
      addBotMessage("Do you have any symptoms like weakness, sweating, dizziness, confusion, vomiting, or uneasiness?");
      return;
    }

    if (chatState === "sugar_symptoms") {
      const update = {
        type: "Sugar Update",
        fastingSugar: formData.fastingSugar,
        postMealSugar: formData.postMealSugar,
        symptoms: text,
        createdAt: new Date().toLocaleString()
      };

      setHealthUpdates((items) => [...items, update]);

      const fastingVal = parseFirstNumber(formData.fastingSugar);
      const postMealVal = parseFirstNumber(formData.postMealSugar);
      const hasLowSugar = fastingVal > 0 && fastingVal < 70;
      if (fastingVal > 400 || postMealVal > 400 || hasLowSugar || hasHighRiskText(lowerText)) {
        setShowUrgentBanner(true);
        setRiskAlerts((items) => [
          ...items,
          { type: "Sugar Risk Alert", message: `Sugar update: ${formData.fastingSugar} mg/dL, symptoms: ${text}`, createdAt: new Date().toLocaleString() }
        ]);
      }

      setChatState("idle");
      setFormData({});
      addBotMessage("Your blood sugar update is saved in this chat session. Use the Updates tab when you want it synced into today's clinic reading for Dr. Ashwani Kansal's review.");
      return;
    }

    if (chatState === "bp_systolic") {
      setFormData((data) => ({ ...data, systolic: text }));
      setChatState("bp_diastolic");
      addBotMessage("Please enter your diastolic BP value (e.g. 80).");
      return;
    }

    if (chatState === "bp_diastolic") {
      setFormData((data) => ({ ...data, diastolic: text }));
      setChatState("bp_symptoms");
      addBotMessage("Do you have headache, dizziness, chest pain, breathlessness, confusion, or severe weakness?");
      return;
    }

    if (chatState === "bp_symptoms") {
      const update = {
        type: "BP Update",
        systolic: formData.systolic,
        diastolic: formData.diastolic,
        symptoms: text,
        createdAt: new Date().toLocaleString()
      };

      setHealthUpdates((items) => [...items, update]);

      const sysVal = parseFirstNumber(formData.systolic);
      if (sysVal > 180 || hasHighRiskText(lowerText)) {
        setShowUrgentBanner(true);
        setRiskAlerts((items) => [
          ...items,
          { type: "BP Risk Alert", message: `BP update: ${formData.systolic}/${formData.diastolic}, symptoms: ${text}`, createdAt: new Date().toLocaleString() }
        ]);
      }

      setChatState("idle");
      setFormData({});
      addBotMessage("Your BP update is saved in this chat session. Use the Updates tab when you want it synced into today's clinic reading. If you experience headache or chest uneasiness, seek urgent medical care.");
      return;
    }

    if (chatState === "appointment_type") {
      setFormData((data) => ({ ...data, consultationType: text }));
      setChatState("appointment_reason");
      addBotMessage("Please enter the reason for appointment (e.g. diabetes follow-up, report review, thyroid, BP, weight management).");
      return;
    }

    if (chatState === "appointment_reason") {
      setFormData((data) => ({ ...data, reason: text }));
      setChatState("appointment_date");
      addBotMessage("Please enter your preferred appointment date.");
      return;
    }

    if (chatState === "appointment_date") {
      setFormData((data) => ({ ...data, date: text }));
      setChatState("appointment_time");
      addBotMessage("Please enter your preferred appointment time.");
      return;
    }

    if (chatState === "appointment_time") {
      const request = {
        consultationType: formData.consultationType,
        reason: formData.reason,
        date: formData.date,
        time: text,
        status: "Pending",
        createdAt: new Date().toLocaleString()
      };

      setAppointmentRequests((items) => [...items, request]);
      setChatState("idle");
      setFormData({});
      addBotMessage("Your appointment preference is saved in this chat session. Please use the Book tab to submit it to the clinic team for confirmation.");
      return;
    }

    setChatState("idle");
    setFormData({});
    addBotMessage("Sorry, I could not process that step. Please select an option or try again.");
  };

  const hasEmergencyText = (text) => EMERGENCY_KEYWORDS.some((word) => text.includes(word));
  const hasHighRiskText = (text) => HIGH_RISK_KEYWORDS.some((word) => text.includes(word));
  const saveMemoryFact = (fact) => {
    if (!fact) return;
    setPatientMemory((prev) => {
      if (prev.keyFacts.includes(fact)) return prev;
      const nextFacts = [...prev.keyFacts, fact].slice(-6);
      return { ...prev, keyFacts: nextFacts, lastSummary: nextFacts.join("; ") };
    });
  };

  const submitChatSugar = () => {
    const fastingValue = parseFirstNumber(cardDraft.fasting);
    const postMealValue = parseFirstNumber(cardDraft.postMeal);
    if (!fastingValue && !postMealValue) {
      addBotMessage("Please enter fasting or post-meal sugar before saving.", "sugar_input");
      return;
    }
    const update = {
      type: "Sugar Update",
      fastingSugar: cardDraft.fasting,
      postMealSugar: cardDraft.postMeal,
      symptoms: "Logged from chat quick card",
      createdAt: new Date().toLocaleString()
    };
    setHealthUpdates((items) => [...items, update]);
    saveMemoryFact(`Sugar: fasting ${cardDraft.fasting || "--"}, post-meal ${cardDraft.postMeal || "--"}`);
    setCardDraft((current) => ({ ...current, fasting: "", postMeal: "" }));
    const hasLowSugar = fastingValue > 0 && fastingValue < 70;
    if (fastingValue > 400 || postMealValue > 400 || hasLowSugar) {
      setShowUrgentBanner(true);
      setRiskAlerts((items) => [...items, { type: "Critical Sugar", message: `${cardDraft.fasting}/${cardDraft.postMeal}`, createdAt: new Date().toLocaleString() }]);
      addBotMessage("This sugar value is critical. Please call the clinic hotline or seek urgent care now.", "emergency_call");
      return;
    }
    addBotMessage("Sugar reading saved in chat memory. Use Updates when you want this synced as today's clinic reading.");
  };

  const submitChatBp = () => {
    const systolicValue = parseFirstNumber(cardDraft.systolic);
    const diastolicValue = parseFirstNumber(cardDraft.diastolic);
    if (!systolicValue && !diastolicValue) {
      addBotMessage("Please enter systolic or diastolic BP before saving.", "bp_input");
      return;
    }
    const update = {
      type: "BP Update",
      systolic: cardDraft.systolic,
      diastolic: cardDraft.diastolic,
      symptoms: "Logged from chat quick card",
      createdAt: new Date().toLocaleString()
    };
    setHealthUpdates((items) => [...items, update]);
    saveMemoryFact(`BP: ${cardDraft.systolic || "--"}/${cardDraft.diastolic || "--"}`);
    setCardDraft((current) => ({ ...current, systolic: "", diastolic: "" }));
    if (systolicValue > 180) {
      setShowUrgentBanner(true);
      setRiskAlerts((items) => [...items, { type: "Critical BP", message: `${cardDraft.systolic}/${cardDraft.diastolic}`, createdAt: new Date().toLocaleString() }]);
      addBotMessage("This BP value is critical. Please call the clinic hotline or seek urgent care now.", "emergency_call");
      return;
    }
    addBotMessage("BP reading saved in chat memory. Use Updates when you want this synced as today's clinic reading.");
  };

  const quickPrompts = [
    "Book appointment",
    "Update sugar",
    "Update BP",
    "Where is doctor?",
    "Review my case",
    "Ask about diabetes"
  ];
  const latestVitalsActionIndex = messages.reduce(
    (latest, message, index) => (["vitals_input", "sugar_input", "bp_input"].includes(message.actionCard) ? index : latest),
    -1
  );

  return (
    <>
    <div className="chat-panel smart-chat">
      {showUrgentBanner && <UrgentCareBanner onDismiss={() => setShowUrgentBanner(false)} />}

      <div className="chat-context-card">
        <span><Bot size={19} /></span>
        <div>
          <strong>AI assistant</strong>
          <small>Clinic and health questions</small>
        </div>
        <button type="button" onClick={() => setActiveTab("book")}>
          <CalendarCheck size={16} /> Book
        </button>
      </div>

      <div className="chat-quick-prompts">
        {quickPrompts.map((prompt) => (
          <button key={prompt} onClick={() => void sendMessage(prompt)} disabled={assistantThinking}>{prompt}</button>
        ))}
      </div>

      <div className="chat-thread" ref={threadRef} aria-live="polite">
        {messages.map((message, index) => (
          <div className={`message-row ${message.role}`} key={`${message.role}-${index}`}>
            <div className="message-avatar">{message.role === "bot" ? "A" : "Y"}</div>
            <div className={`bubble ${message.role}`}>
              <span>{message.label}</span>
              <p>{message.text}</p>
              {message.actionCard === "emergency_call" && (
                <div className="chat-action-card">
                  <strong><Phone size={15} /> Direct Clinic Contact</strong>
                  <a href={`tel:${CLINIC_HOTLINE_NUMBER.replace(/\s/g, "")}`} className="urgent-btn-call" style={{ textDecoration: "none" }}>
                    Call Doctor Hotline ({CLINIC_HOTLINE_NUMBER})
                  </a>
                  <a href={doctorWhatsappUrl("EMERGENCY ALERT: Patient needs urgent help from Dr. Ashwani Kansal.")} target="_blank" rel="noreferrer" className="urgent-btn-whatsapp" style={{ textDecoration: "none" }}>
                    WhatsApp {CLINIC_HOTLINE_NUMBER}
                  </a>
                </div>
              )}
              {index === latestVitalsActionIndex && ["vitals_input", "sugar_input", "bp_input"].includes(message.actionCard) && (
                <div className="chat-action-card">
                  <strong><Activity size={15} /> Quick vitals input</strong>
                  {message.actionCard !== "bp_input" && (
                    <div className="chat-action-card-form two-field">
                      <input inputMode="numeric" value={cardDraft.fasting} onChange={(event) => setCardDraft((current) => ({ ...current, fasting: event.target.value }))} placeholder="Fasting" />
                      <input inputMode="numeric" value={cardDraft.postMeal} onChange={(event) => setCardDraft((current) => ({ ...current, postMeal: event.target.value }))} placeholder="Post-meal" />
                      <button type="button" onClick={submitChatSugar}>Save</button>
                    </div>
                  )}
                  {message.actionCard !== "sugar_input" && (
                    <div className="chat-action-card-form two-field">
                      <input inputMode="numeric" value={cardDraft.systolic} onChange={(event) => setCardDraft((current) => ({ ...current, systolic: event.target.value }))} placeholder="Sys" />
                      <input inputMode="numeric" value={cardDraft.diastolic} onChange={(event) => setCardDraft((current) => ({ ...current, diastolic: event.target.value }))} placeholder="Dia" />
                      <button type="button" onClick={submitChatBp}>Save</button>
                    </div>
                  )}
                  <button type="button" onClick={() => setActiveTab("updates")}>Open full updates</button>
                </div>
              )}
              {["slot_picker", "booking_type"].includes(message.actionCard) && (
                <div className="chat-action-card">
                  <strong><CalendarCheck size={15} /> Quick slots</strong>
                  {(nextSlots.length ? nextSlots : ["Next available"]).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => {
                        addUserMessage(`Preferred slot: ${slot}`);
                        addBotMessage("Noted. Please open the Book tab to confirm consultation type, reason, and payment status before sending the request.");
                      }}
                    >
                      {slot}
                    </button>
                  ))}
                  <button type="button" onClick={() => setActiveTab("book")}>Open booking</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-composer">
        <div className="safety-strip"><AlertTriangle size={15} /> Emergency symptoms need urgent medical care.</div>
        <div className="chat-input">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void sendMessage(draft);
            }}
            aria-label="Message clinic assistant"
            placeholder={assistantThinking ? "Assistant is reviewing..." : "Message clinic assistant"}
            disabled={assistantThinking}
          />
          <button onClick={() => void sendMessage(draft)} aria-label="Send message" disabled={assistantThinking}><Send size={18} /></button>
        </div>
      </div>
      <div className="quick-actions">
        {[
          [Activity, "Sugar", "updates"],
          [HeartPulse, "BP", "updates"],
          [Weight, "Weight", "updates"],
          [Upload, "Report", "updates"],
          [CalendarCheck, "Book", "book"],
          [Bot, "Chat", "chat"]
        ].map(([Icon, label, tab]) => (
          <button key={label} onClick={() => setActiveTab(tab)}>
            <span><Icon size={19} /></span>
            {label}
          </button>
        ))}
      </div>
    </div>

      <PatientStoriesCarousel />
    </>
  );
}

function generateClinicAssistantReply(message, { availability, activeClinic, patientProfile, patientMemory }) {
  const text = message.toLowerCase();
  const has = (words) => hasAnyKeyword(text, words);
  const mode = classifyClinicAssistantMode(message);
  const medicalDisclaimer = "For personal medical advice, please consult Dr. Ashwani Kansal.";

  let extractedFact = null;
  if (text.includes("fasting") || text.includes("post-meal") || text.includes("mg/dl")) {
    extractedFact = "Patient asked about sugar readings";
  } else if (text.includes("bp") || text.includes("systolic") || text.includes("diastolic")) {
    extractedFact = "Patient asked about BP readings";
  }

  if (mode === CLINIC_ASSISTANT_MODES.EMERGENCY) {
    return {
      reply: "URGENT: This indicates a potential medical emergency. Please seek emergency medical care immediately or contact local emergency services at 112. Do not wait; go to the nearest hospital emergency department.",
      actionCard: "emergency_call",
      extractedFact: "Emergency keyword detected"
    };
  }

  if (has(MEDICINE_CHANGE_KEYWORDS)) {
    return {
      reply: "I cannot advise medicine or dose changes. Please consult Dr. Ashwani Kansal before starting, stopping, or changing any medicine, insulin, semaglutide, or Mounjaro dose.",
      actionCard: null,
      extractedFact
    };
  }

  if (
    has(["where", "available", "availability", "rn", "right now", "now", "today", "clinic"]) &&
    has(["doctor", "dr.", "ashwani", "kansal", "sir", "clinic"])
  ) {
    if (availability.status !== "On Duty") {
      return {
        reply: `Dr. Ashwani Kansal is marked off duty right now in the app. You can still request an appointment or online consultation from the Book tab. Last update: ${availability.updatedAt}.`,
        actionCard: null,
        extractedFact
      };
    }
    return {
      reply: `Dr. Ashwani Kansal is marked on duty at ${activeClinic.name}, ${activeClinic.short}. Address: ${activeClinic.address}. Timing: ${activeClinic.timing}. Online consultation is ${availability.online ? "available" : "not available"} right now. Note from clinic: ${availability.message}`,
      actionCard: null,
      extractedFact
    };
  }

  if (mode === CLINIC_ASSISTANT_MODES.PROFILE_REVIEW) {
    const hasProfileData = Boolean(
      patientProfile
      && (patientProfile.conditions?.length || Object.values(patientProfile.vitals || {}).some(Boolean))
    );
    if (!hasProfileData) {
      return {
        reply: "I don't have any saved readings for you yet. Add your fasting sugar, post-meal sugar, BP, weight, or reports in the Updates tab and I can review your case here.",
        actionCard: "vitals_input",
        extractedFact
      };
    }
    const memoryNote = patientMemory && patientMemory.keyFacts && patientMemory.keyFacts.length > 0
      ? ` Context from your recent activity: ${patientMemory.keyFacts.join("; ")}.`
      : "";
    return {
      reply: `${buildCaseReview(patientProfile)}${memoryNote}`,
      actionCard: "vitals_input",
      extractedFact
    };
  }

  if (mode === CLINIC_ASSISTANT_MODES.BOOKING) {
    return {
      reply: `I can help you request a clinic visit or online consultation. Today's active clinic is ${activeClinic.name}, ${activeClinic.short}, with timing ${activeClinic.timing}. Pick a quick slot here or open the full Book tab for date, reason, and payment details.`,
      actionCard: "slot_picker",
      extractedFact
    };
  }

  if (mode === CLINIC_ASSISTANT_MODES.VITALS_UPDATE) {
    return {
      reply: "Use the Updates tab to add fasting sugar, post-meal sugar, BP, weight, or report upload. These details become part of your profile for Dr. Ashwani Kansal to review.",
      actionCard: "vitals_input",
      extractedFact
    };
  }

  const topicReply = getGeneralHealthReply(text);
  if (mode === CLINIC_ASSISTANT_MODES.LIFESTYLE_EDUCATION && topicReply) {
    return {
      reply: `${topicReply} ${medicalDisclaimer}`,
      actionCard: null,
      extractedFact
    };
  }

  if (mode === CLINIC_ASSISTANT_MODES.LIFESTYLE_EDUCATION) {
    return {
      reply: `I can explain this in general terms, but I cannot diagnose or prescribe from chat. Please update your readings or reports in the app so the doctor can review them. ${medicalDisclaimer}`,
      actionCard: "vitals_input",
      extractedFact
    };
  }

  return {
    reply: "I can help with live clinic availability, app features, your saved health profile, and general metabolic health topics (diabetes, thyroid, BP, weight, fatty liver, CGM, cholesterol, and lifestyle education). Try asking: where is Dr. Ashwani Kansal right now, review my case, or how do I book an appointment.",
    actionCard: null,
    extractedFact
  };
}

function buildCaseReview(patient) {
  const vitals = patient.vitals;
  const highlights = [
    `${patient.conditions.join(", ")} are listed in your profile`,
    `recent fasting sugar is ${vitals.fasting}, post-meal is ${vitals.postMeal}, and HbA1c is ${vitals.hba1c}`,
    `BP is recorded as ${vitals.bp} and weight as ${vitals.weight}`
  ];
  const concern = patient.risk === "High"
    ? "The app marks this as high priority because sugar readings and HbA1c are above target in the saved profile."
    : "The app suggests routine follow-up based on the saved profile.";
  return `Your saved case shows ${highlights.join("; ")}. ${concern} I cannot diagnose or change medicines here, but you should upload latest reports and book follow-up for doctor review. For personal advice, please consult Dr. Ashwani Kansal.`;
}

function getGeneralHealthReply(text) {
  if (text.includes("insulin resistance")) {
    return "Insulin resistance means the body needs more insulin than usual to control sugar, often linked with weight gain, fatty liver, high triglycerides, and prediabetes or diabetes.";
  }
  if (text.includes("diabetes reversal") || text.includes("reverse diabetes") || text.includes("reversal")) {
    return "Diabetes reversal usually means sugars stay in a healthier range with lifestyle, weight loss, and careful medical supervision, but it does not mean the condition can be ignored. Whether reversal has happened must be assessed only by the doctor based on reports and follow-up.";
  }
  if (text.includes("cgm")) {
    return "CGM shows sugar patterns across the day, including spikes after meals and lows at night, so it can help the clinic adjust lifestyle advice and follow-up decisions.";
  }
  if (text.includes("fatty liver")) {
    return "Fatty liver is commonly linked with weight, insulin resistance, diabetes, cholesterol, and diet patterns. Weight loss, activity, sugar control, and avoiding alcohol usually matter, but reports should be reviewed by the doctor.";
  }
  if (text.includes("mounjaro") || text.includes("semaglutide") || text.includes("injection")) {
    return "Semaglutide and Mounjaro-type injections can affect appetite, weight, and sugar, but nausea, vomiting, acidity, or weakness should be reported. Please consult Dr. Ashwani Kansal before changing dose or continuing if you are facing side effects.";
  }
  if (text.includes("bp") || text.includes("blood pressure")) {
    return "Blood pressure is affected by salt intake, weight, stress, sleep, medicines, and kidney or metabolic health. Keep a home BP log with date and time so the doctor can review the pattern.";
  }
  if (text.includes("cholesterol") || text.includes("ldl") || text.includes("triglyceride")) {
    return "Cholesterol and triglycerides are important because they affect heart and blood vessel risk, especially in diabetes. The doctor usually reviews lipid reports along with sugar, BP, weight, liver, kidney, and medication history.";
  }
  if (text.includes("thyroid") || text.includes("tsh")) {
    return "Thyroid review depends on TSH, symptoms, timing of medicine, weight changes, and other reports. Upload the latest thyroid profile before follow-up for a better review.";
  }
  if (text.includes("diet") || text.includes("exercise") || text.includes("walk") || text.includes("weight")) {
    return "For metabolic health, regular walking, protein with meals, fewer sugary drinks, sleep, and consistent follow-up usually help. The exact diet plan should match your reports, medicines, weight goal, and routine.";
  }
  if (text.includes("sugar") || text.includes("hba1c") || text.includes("diabetes")) {
    return "Fasting sugar, post-meal sugar, and HbA1c tell different parts of the diabetes picture. Repeated high readings should be logged in the app and reviewed with the doctor.";
  }
  return null;
}

function EducationLibrary({ posts }) {
  return (
    <div className="stack">
      {posts.map((post, index) => (
        <article className={`article-card ${post.tone || `tone-${index % 4}`}`} key={post.id || post.title}>
          <BookOpen size={22} />
          <strong>{post.title}</strong>
          <p>{post.body}</p>
          <span>{post.tag || "Doctor-approved"}</span>
        </article>
      ))}
    </div>
  );
}

function DoctorApp({
  doctorTab,
  setDoctorTab,
  currentUser,
  theme,
  setTheme,
  onSignOut,
  availability,
  setAvailability,
  activeClinic,
  selectedPatientId,
  setSelectedPatientId,
  patients,
  updatePatientRecord,
  educationPosts,
  onPublishEducationPost,
  consultationFee
}) {
  const isRisk = (patient, level) => String(patient.risk || "").toLowerCase() === level;
  const stats = useMemo(
    () => [
      ["Patients", String(patients.length), Users, "blue"],
      ["Follow-ups", String(patients.filter((p) => p.followUp && p.followUp !== "Not scheduled").length), CalendarCheck, "green"],
      ["High risk", String(patients.filter((p) => isRisk(p, "high")).length), AlertTriangle, "rose"],
      ["Reviewed", String(patients.filter((p) => p.lastVisit && p.lastVisit !== "Medical intake").length), Bell, "lavender"]
    ],
    [patients]
  );
  const alerts = useMemo(
    () =>
      patients
        .filter((p) => isRisk(p, "high") || isRisk(p, "medium"))
        .map((p) => `${p.risk} risk: ${p.name}${p.latest ? ` (${p.latest})` : ""}`),
    [patients]
  );
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) || patients[0];

  return (
    <section className="screen app-screen doctor-mode">
      <header className="app-header doctor-header">
        <div>
          <span className="kicker">Doctor workspace</span>
          <h2>
            {doctorTab === "today"
              ? "Today at clinic"
              : doctorTab === "availability"
                ? "Edit live availability"
                : doctorTab === "patientDetail"
                  ? (selectedPatient?.name || "Patient")
                  : doctorTab === "education"
                    ? "Education posts"
                    : "Patient management"}
          </h2>
          {doctorTab === "today" && <p className="doctor-header-date">
            {new Intl.DateTimeFormat("en-IN", {
              weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata"
            }).format(new Date())}
          </p>}
        </div>
        <ProfileButton user={currentUser} role="doctor" theme={theme} setTheme={setTheme} onSignOut={onSignOut} />
      </header>

      <div className="scroll-area" key={doctorTab}>
        {doctorTab === "today" && <DoctorToday stats={stats} alerts={alerts} setDoctorTab={setDoctorTab} />}
        {doctorTab === "availability" && (
          <DoctorAvailabilityEditor
            availability={availability}
            setAvailability={setAvailability}
            activeClinic={activeClinic}
          />
        )}
        {doctorTab === "patients" && (
          <DoctorPatients
            patients={patients}
            onOpenPatient={(patientId) => {
              setSelectedPatientId(patientId);
              setDoctorTab("patientDetail");
            }}
          />
        )}
        {doctorTab === "patientDetail" && (
          <DoctorPatientDetail
            key={JSON.stringify([currentUser.id, selectedPatient.id])}
            doctorId={currentUser.id}
            patient={selectedPatient}
            activeClinic={activeClinic}
            onBack={() => setDoctorTab("patients")}
            updatePatient={(patch) => updatePatientRecord(selectedPatient.id, patch)}
          />
        )}
        {doctorTab === "education" && (
          <DoctorEducationEditor posts={educationPosts} onPublishPost={onPublishEducationPost} />
        )}
      </div>

      {doctorTab !== "patientDetail" && <DoctorNav doctorTab={doctorTab} setDoctorTab={setDoctorTab} />}
    </section>
  );
}

function DoctorEducationEditor({ posts, onPublishPost }) {
  const [draft, setDraft] = useState({
    title: "",
    body: "",
    tone: educationThemeOptions[0].id,
    tag: "Doctor-approved"
  });
  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const publishPost = async () => {
    if (!draft.title.trim() || !draft.body.trim()) return;
    await onPublishPost(draft);
    setDraft({
      title: "",
      body: "",
      tone: educationThemeOptions[(posts.length + 1) % educationThemeOptions.length].id,
      tag: "Doctor-approved"
    });
  };

  return (
    <div className="stack">
      <div className="education-editor">
        <div className="editor-title-row">
          <span><Palette size={19} /></span>
          <div>
            <strong>Post template</strong>
            <small>Use one of four clinic colors so patient cards stay consistent.</small>
          </div>
        </div>

        <label>Title<input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} placeholder="Education topic" /></label>
        <label>Patient summary<input value={draft.body} onChange={(event) => updateDraft("body", event.target.value)} placeholder="Short patient-friendly explanation" /></label>
        <label>Badge<input value={draft.tag} onChange={(event) => updateDraft("tag", event.target.value)} placeholder="Doctor-approved" /></label>

        <div className="theme-swatch-row">
          {educationThemeOptions.map((theme) => (
            <button
              key={theme.id}
              className={`theme-swatch ${theme.id} ${draft.tone === theme.id ? "selected" : ""}`}
              onClick={() => updateDraft("tone", theme.id)}
            >
              <span />
              <strong>{theme.label}</strong>
              <small>{theme.hint}</small>
            </button>
          ))}
        </div>

        <article className={`article-card ${draft.tone}`}>
          <BookOpen size={22} />
          <strong>{draft.title || "Education topic"}</strong>
          <p>{draft.body || "Short patient-friendly explanation."}</p>
          <span>{draft.tag || "Doctor-approved"}</span>
        </article>

        <button className="primary-button" onClick={publishPost}>
          <Plus size={18} /> Publish to patient Learn
        </button>
      </div>

      <div className="post-list-preview">
        <strong>Published posts</strong>
        <EducationLibrary posts={posts} />
      </div>
    </div>
  );
}

function DoctorToday({ stats, alerts = [], setDoctorTab }) {
  return (
    <div className="stack">
      <div className="doctor-stats">
        {stats.map(([label, value, Icon, tone]) => (
          <div className={`doctor-stat ${tone}`} key={label}>
            <Icon size={20} />
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <button type="button" className="doctor-duty-cta" onClick={() => setDoctorTab("availability")}>
        <span className="doctor-duty-icon"><MapPin size={21} aria-hidden="true" /></span>
        <span className="doctor-duty-copy">
          <strong>Update clinic availability</strong>
          <small>Changes appear in the patient app.</small>
        </span>
        <ChevronRight size={19} aria-hidden="true" />
      </button>
      {alerts.length > 0 ? (
        alerts.map((alert) => (
          <div className="alert-row-card" key={alert}>
            <AlertTriangle size={18} />
            <span>{alert}</span>
          </div>
        ))
      ) : (
        <div className="empty-state">
          <span>No patient alerts yet</span>
          <small>High and medium risk patients will appear here as records are added.</small>
        </div>
      )}
    </div>
  );
}

// Doctor-side confirmation queue. Patients who opened the hosted Razorpay page appear here;
// confirming writes MANUALLY_VERIFIED, which unlocks WhatsApp on that patient's next check.
function DoctorPendingPayments() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  const loadPending = async () => {
    const { data, error } = await supabase
      .from("consultation_payments")
      .select("id, amount, patient, created_at")
      .eq("payment_status", CONSULT_LINK_PENDING_STATUS)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      setNotice(`Could not load pending payments: ${error.message}`);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPending();
  }, []);

  const confirmPayment = async (row) => {
    setBusyId(row.id);
    setNotice("");
    const { error } = await supabase
      .from("consultation_payments")
      .update({ payment_status: "MANUALLY_VERIFIED", verified_at: new Date().toISOString() })
      .eq("id", row.id);
    setBusyId("");
    if (error) {
      setNotice(`Could not confirm payment: ${error.message}`);
      return;
    }
    setNotice(`Confirmed. WhatsApp unlocks for ${row.patient?.name || "this patient"} on their next app check.`);
    loadPending();
  };

  return (
    <div className="pending-payments">
      <div className="pending-payments-head">
        <ShieldCheck size={18} />
        <strong>Online consult payments to confirm</strong>
      </div>
      {notice && <p className="pending-payments-notice">{notice}</p>}
      {loading && <small>Loading...</small>}
      {!loading && rows.length === 0 && (
        <small>No pending online payments. Patients who open the Razorpay page appear here.</small>
      )}
      {rows.map((row) => (
        <div className="pending-payment-row" key={row.id}>
          <div>
            <strong>{row.patient?.name || "Patient"}</strong>
            <small>
              Rs {Math.round((row.amount || 0) / 100)} - {formatPaidAt(row.created_at)}
              {row.patient?.contact ? ` - ${row.patient.contact}` : ""}
            </small>
          </div>
          <button className="primary-button" disabled={busyId === row.id} onClick={() => confirmPayment(row)}>
            {busyId === row.id ? "Confirming..." : "Confirm paid"}
          </button>
        </div>
      ))}
    </div>
  );
}

function DoctorAvailabilityEditor({
  availability,
  setAvailability,
  activeClinic
}) {
  const updateAvailability = (patch) => {
    return setAvailability({
      ...availability,
      ...patch,
      updatedBy: "Dr. Ashwani",
      updatedAt: "Just now"
    });
  };
  const [noteDraft, setNoteDraft] = useState(availability.message || "");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const savedNote = availability.message || "";
  const noteChanged = noteDraft.trim() !== savedNote;
  // Pick up the saved note when it arrives from the database after the editor has mounted.
  useEffect(() => { setNoteDraft(savedNote); }, [savedNote]);
  const saveNote = async () => {
    setNoteSaving(true);
    await updateAvailability({ message: noteDraft.trim() });
    setNoteSaving(false);
    setNoteSaved(true);
  };

  return (
    <div className="stack">
      <div className="doctor-live-preview">
        <span className="doctor-live-status">
          <span className={`live-dot ${availability.status === "On Duty" ? "" : "off"}`} />
          {availability.status}
        </span>
        {availability.status === "On Duty" && <strong>{activeClinic.name}</strong>}
        <p>{availability.message || (availability.status === "On Duty" ? activeClinic.timing : "Patients can still request an appointment.")}</p>
      </div>

      <div className="clinic-switcher">
        {clinics.map((clinic) => (
          <button
            key={clinic.id}
            className={availability.status === "On Duty" && availability.clinicId === clinic.id ? "selected" : ""}
            onClick={() => updateAvailability({ status: "On Duty", clinicId: clinic.id })}
          >
            <MapPin size={20} />
            <strong>Go on duty at {clinic.name}</strong>
            <span>{clinic.timing}</span>
          </button>
        ))}
        <button
          className={availability.status === "Off Duty" ? "selected off" : "off"}
          onClick={() => updateAvailability({ status: "Off Duty" })}
        >
          <Clock size={20} />
          <strong>Go off duty</strong>
          <span>Patients can still request appointment.</span>
        </button>
      </div>

      <div className="form-card">
        <div className="note-field">
          <label htmlFor="patient-note">Note for patients</label>
          <textarea id="patient-note" rows={3} maxLength={PATIENT_NOTE_LIMIT} value={noteDraft}
            placeholder="For example: Running 20 minutes late today."
            onChange={(event) => { setNoteDraft(event.target.value); setNoteSaved(false); }} />
          <div className="note-field-foot">
            <small>{noteDraft.length}/{PATIENT_NOTE_LIMIT}. Patients see this on the Live card.</small>
            <div className="note-field-actions">
              {(noteDraft || availability.message) && (
                <button type="button" className="secondary-button" onClick={() => { setNoteDraft(""); setNoteSaved(false); }}>Clear</button>
              )}
              <button type="button" className="primary-button" disabled={!noteChanged || noteSaving} onClick={saveNote}>
                {noteSaving ? "Saving..." : noteSaved && !noteChanged ? "Saved" : "Save note"}
              </button>
            </div>
          </div>
        </div>
        <div className="locked-fee-card">
          <span>Online consultation fee</span>
          <strong>Rs {ONLINE_CONSULTATION_FEE}</strong>
          <small>Static fee locked for all online consultations.</small>
        </div>
        <small className="field-help">
          Patients must pay this fee through Razorpay before sending an online consultation request.
        </small>
      </div>

      <DoctorPendingPayments />

      <div className="audit-card">
        <ClipboardList size={18} />
        <span>Last updated by {availability.updatedBy}</span>
        <strong>{availability.updatedAt}</strong>
      </div>
    </div>
  );
}

function DoctorPatients({ patients, onOpenPatient }) {
  const [notice, setNotice] = useState("");

  return (
    <div className="stack">
      <div className="search-card"><Search size={18} /><input placeholder="Search patient or mobile" /></div>
      {notice && (
        <div className="doctor-notice">
          <Check size={17} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}
      {patients.length === 0 && (
        <div className="empty-state">
          <span>No patients yet</span>
          <small>Patient records appear here as people sign up or you import a CSV.</small>
        </div>
      )}
      {patients.map((patient) => (
        <button className="patient-row" key={patient.id} onClick={() => onOpenPatient(patient.id)}>
          <span>
            <strong>{patient.name}</strong>
            <small>
              {[[patient.gender, patient.age ? `${patient.age} y` : ""].filter(Boolean).join(", "), patient.conditions?.[0], patient.mobile].filter(Boolean).join(" · ") || "Details not recorded"}
            </small>
          </span>
          <em className={String(patient.risk || "low").toLowerCase()}>{patient.risk || "Low"}</em>
        </button>
      ))}
      <button className="secondary-button" onClick={() => setNotice("CSV upload flow ready: choose a patient sheet with name, mobile, age, condition, risk, latest reading and follow-up date.")}>
        <Upload size={18} /> Bulk upload CSV
      </button>
    </div>
  );
}

function DoctorPatientDetail({ doctorId, patient, activeClinic, onBack, updatePatient }) {
  const [doctorNotice, setDoctorNotice] = useState("");
  // Bumped when a prescription is published to the care plan so the care plan editor reloads it.
  const [carePlanKey, setCarePlanKey] = useState(0);
  const [visitOpen, setVisitOpen] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);
  const [vitalDraft, setVitalDraft] = useState(patient.vitals);
  const [notesDraft, setNotesDraft] = useState(patient.notes);
  const [followUpDraft, setFollowUpDraft] = useState(patient.followUp);
  const showNotice = (message) => setDoctorNotice(message);
  const updateVitalDraft = (key, value) => setVitalDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    setVitalDraft(patient.vitals);
    setNotesDraft(patient.notes);
    setFollowUpDraft(patient.followUp);
  }, [patient.id, patient.vitals, patient.notes, patient.followUp]);

  const saveVitals = () => {
    updatePatient({
      vitals: vitalDraft,
      latest: vitalDraft.fasting ? `Fasting ${vitalDraft.fasting}` : patient.latest,
      lastVisit: "Just now"
    });
    showNotice(`Vitals updated for ${patient.name}.`);
  };

  const saveNotes = () => {
    updatePatient({ notes: notesDraft, lastVisit: "Just now" });
    showNotice(`Doctor notes updated for ${patient.name}.`);
  };

  const saveFollowUp = () => {
    updatePatient({ followUp: followUpDraft });
    showNotice(`Follow-up updated to ${followUpDraft}.`);
  };

  if (apptOpen && !visitOpen) {
    return (
      <Suspense fallback={<div className="vt-empty" role="status">Opening appointment…</div>}>
        <AppointmentSheet patient={patient} clinic={activeClinic} onBack={() => setApptOpen(false)}
          onWriteRx={() => { setApptOpen(false); setVisitOpen(true); }} />
      </Suspense>
    );
  }

  if (visitOpen) {
    return (
      <Suspense fallback={<div className="vt-empty" role="status">Opening visit…</div>}>
        <Visit doctorId={doctorId} patient={patient} clinic={activeClinic} onBack={() => setVisitOpen(false)} />
      </Suspense>
    );
  }

  return (
    <div className="patient-detail-view">
      <div className="patient-detail-top">
        <button className="circle-button" onClick={onBack} aria-label="Back to patients"><ChevronLeft size={20} /></button>
        <div className="patient-avatar">{getInitials(patient.name)}</div>
        <div>
          <strong>{patient.name}</strong>
          <span>{patient.age}Y / {patient.gender} / {patient.mobile}</span>
        </div>
      </div>

      <div className="vt-start-row">
        <button type="button" className="primary-button vt-start" onClick={() => setVisitOpen(true)}>Start visit</button>
        <button type="button" className="secondary-button vt-start" onClick={() => setApptOpen(true)}>Appointment</button>
      </div>

      <div className="patient-action-row">
        <a className="round-action" href={whatsappUrl(patient, whatsappTemplates[0][1])} target="_blank" rel="noreferrer" aria-label="Open WhatsApp">
          <MessageCircle size={20} />
          <span>WhatsApp</span>
        </a>
        <a className="round-action" href={whatsappUrl(patient, "Dr. Ashwani Kansal clinic: please confirm availability for online consultation on WhatsApp.")} target="_blank" rel="noreferrer" aria-label="Start WhatsApp consultation">
          <Video size={20} /><span>Consult</span>
        </a>
        <button className="round-action" onClick={() => showNotice("Records are open below: vitals, history, labs, diagnosis, prescriptions, notes, follow-up and past visits.")}>
          <FileHeart size={20} /><span>Records</span>
        </button>
        <a className="round-action" href={`https://healthid.ndhm.gov.in/search?healthId=${encodeURIComponent(patient.abha)}`} target="_blank" rel="noreferrer" aria-label="Open ABHA search">
          <LinkIcon size={20} /><span>ABHA</span>
        </a>
      </div>

      {doctorNotice && (
        <div className="doctor-notice">
          <Check size={17} />
          <span>{doctorNotice}</span>
          <button onClick={() => setDoctorNotice("")}>Dismiss</button>
        </div>
      )}

      <div className="patient-summary-card">
        <span>Profile source</span>
        <strong>{patient.source}</strong>
        <p>{patient.conditions.join(", ")}</p>
        <small>ABHA: {patient.abha} - Last visit: {patient.lastVisit}</small>
      </div>

      <DoctorSection icon={Activity} title="Vitals" action="Save" onAction={saveVitals}>
        <div className="detail-grid editable-vitals">
          {Object.entries(vitalDraft).map(([key, value]) => (
            <label className="detail-input" key={key}>
              {prettyKey(key)}
              <input value={value} onChange={(event) => updateVitalDraft(key, event.target.value)} />
            </label>
          ))}
        </div>
      </DoctorSection>

      <DoctorSection icon={NotebookPen} title="Medical History" action="Save" onAction={() => showNotice("Use Add item inside this section, then Save list.")}>
        <EditableList
          items={patient.history}
          placeholder="Add condition, allergy, surgery or lifestyle note"
          onSave={(items) => {
            updatePatient({ history: items });
            showNotice("Medical history updated.");
          }}
        />
      </DoctorSection>

      <DoctorSection icon={FlaskConical} title="Lab Results" action="Save" onAction={() => showNotice("Use Add item inside this section, then Save list.")}>
        <EditableList
          items={patient.labs}
          placeholder="Add HbA1c, lipid, LFT, KFT, thyroid or report note"
          onSave={(items) => {
            updatePatient({ labs: items });
            showNotice("Lab results updated.");
          }}
        />
      </DoctorSection>

      <DoctorSection icon={ClipboardList} title="Symptoms & Diagnosis" action="Save" onAction={() => showNotice("Use Add item inside this section, then Save list.")}>
        <EditableList
          items={patient.symptoms}
          placeholder="Add symptom or diagnosis note"
          pinnedItems={patient.conditions}
          onSave={(items) => {
            updatePatient({ symptoms: items });
            showNotice("Symptoms updated.");
          }}
        />
      </DoctorSection>

      <DoctorPrescriptions key={patient.id} patient={patient} clinics={clinics} activeClinic={activeClinic}
        onCarePlanPublished={() => setCarePlanKey((n) => n + 1)} />

      <DoctorCarePlan key={`${patient.id}-${carePlanKey}`} patientId={patient.id} />

      <DoctorSection icon={Pill} title="Earlier prescription notes" action="Save" onAction={() => showNotice("Use Add item inside this section, then Save list.")}>
        <EditableList
          items={patient.medicines}
          placeholder="Add medicine, diet, walk or monitoring instruction"
          onSave={(items) => {
            updatePatient({ medicines: items });
            showNotice("Earlier prescription notes updated.");
          }}
        />
      </DoctorSection>

      <DoctorSection icon={FileText} title="Doctor Notes" action="Save" onAction={saveNotes}>
        <label className="full-width-field">
          Notes
          <textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} />
        </label>
      </DoctorSection>

      <DoctorSection icon={Clock} title="Earlier follow-up note" action="Save" onAction={saveFollowUp}>
        <label className="full-width-field">
          Next follow-up
          <input value={followUpDraft} onChange={(event) => setFollowUpDraft(event.target.value)} />
        </label>
        <p className="detail-copy">Use Prescription and follow-up above to set the patient’s reminder date.</p>
      </DoctorSection>

      <DoctorSection icon={History} title="Past Visits" action="View" onAction={() => showNotice("Past visit timeline is visible below with prescriptions, diagnosis and lifestyle advice.")}>
        <div className="past-visit-card">
          <strong>{patient.lastVisit}: {patient.conditions.slice(0, 2).join(", ")}</strong>
          <p>Prescription, diagnosis, lifestyle advice and follow-up reminders stored for doctor review.</p>
        </div>
      </DoctorSection>

      <div className="whatsapp-panel">
        <div>
          <strong>WhatsApp integration</strong>
          <small>Manual links now. Business API-ready templates later.</small>
        </div>
        {whatsappTemplates.map(([label, message]) => (
          <a key={label} href={whatsappUrl(patient, message)} target="_blank" rel="noreferrer">
            <Send size={16} />
            {label}
            <ExternalLink size={15} />
          </a>
        ))}
      </div>

    </div>
  );
}

function DoctorSection({ icon: Icon, title, action, onAction, children }) {
  return (
    <section className="doctor-section">
      <div className="doctor-section-head">
        <span><Icon size={19} /></span>
        <strong>{title}</strong>
        <button onClick={onAction}>{action}</button>
      </div>
      {children}
    </section>
  );
}

function EditableList({ items, pinnedItems = [], placeholder, onSave }) {
  const [draftItems, setDraftItems] = useState(items);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    setDraftItems(items);
    setNewItem("");
  }, [items]);

  const addItem = () => {
    const clean = newItem.trim();
    if (!clean) return;
    setDraftItems((current) => [...current, clean]);
    setNewItem("");
  };

  const removeItem = (index) => {
    setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="editable-list">
      {pinnedItems.length > 0 && (
        <div className="pinned-list">
          {pinnedItems.map((item) => <span key={item}>{item}</span>)}
        </div>
      )}
      {draftItems.map((item, index) => (
        <div className="editable-list-row" key={`${item}-${index}`}>
          <input
            value={item}
            onChange={(event) => {
              const value = event.target.value;
              setDraftItems((current) => current.map((currentItem, itemIndex) => itemIndex === index ? value : currentItem));
            }}
          />
          <button onClick={() => removeItem(index)}>Remove</button>
        </div>
      ))}
      <div className="field-with-action">
        <input value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder={placeholder} />
        <button onClick={addItem}>Add</button>
      </div>
      <button className="secondary-button" onClick={() => onSave(draftItems.filter((item) => item.trim()))}>
        Save list
      </button>
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul className="detail-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function getInitials(name) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function prettyKey(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function whatsappUrl(patient, message) {
  const digits = patient.whatsapp.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function doctorWhatsappUrl(message) {
  const digits = DOCTOR_WHATSAPP_NUMBER.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

const patientTabs = [
  ["home", Home, "Home"],
  ["updates", Activity, "Updates"],
  ["book", CalendarCheck, "Book"],
  ["chat", Bot, "Chat"],
  ["library", BookOpen, "Learn"]
];

const doctorTabs = [
  ["today", Home, "Today"],
  ["availability", MapPin, "Live"],
  ["patients", Users, "Patients"],
  ["education", BookOpen, "Learn"]
];

function FloatingTabs({ items, current, onSelect, label, doctor = false }) {
  const index = items.findIndex(([key]) => key === current);
  return (
    <nav className={`bottom-nav${doctor ? " doctor-nav" : ""}`} aria-label={label}
      style={{ "--tabs": items.length, "--selected-tab": Math.max(0, index) }}>
      <span className="floating-tab-selection" data-visible={index >= 0} aria-hidden="true" />
      {items.map(([key, Icon, text]) => (
        <button key={key} type="button" className={current === key ? "active" : ""}
          aria-current={current === key ? "page" : undefined} onClick={() => onSelect(key)}>
          <Icon size={18} aria-hidden="true" />
          <span>{text}</span>
        </button>
      ))}
    </nav>
  );
}

function PatientNav({ activeTab, setActiveTab }) {
  return <FloatingTabs items={patientTabs} current={activeTab} onSelect={setActiveTab} label="Patient navigation" />;
}

function DoctorNav({ doctorTab, setDoctorTab }) {
  return <FloatingTabs items={doctorTabs} current={doctorTab} onSelect={setDoctorTab} label="Doctor navigation" doctor />;
}

function TopAction({ title, onBack }) {
  return (
    <div className="top-action">
      <button onClick={onBack} aria-label="Back"><ChevronLeft size={20} /></button>
      <strong>{title}</strong>
      <span />
    </div>
  );
}

function MetricTile({ label, value, suffix, tone }) {
  return (
    <div className={`metric-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{suffix}</small>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
