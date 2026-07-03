import React, { useMemo, useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  Bot,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
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
  Moon,
  NotebookPen,
  Palette,
  Pill,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Stethoscope,
  Sun,
  Upload,
  UserRound,
  UserPlus,
  Users,
  Video,
  Weight
} from "lucide-react";
import {
  supabase
} from "./supabase";
import {
  APPROVED_DOCTOR_EMAILS,
  isApprovedDoctorEmail,
  isPhoneIdentifier,
  normalizeClinicIdentifier
} from "./auth";
import "./styles.css";

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || "";
const RAZORPAY_API_BASE = import.meta.env.VITE_RAZORPAY_API_BASE || "/api";
const RAZORPAY_PAYMENT_LINK = (import.meta.env.VITE_RAZORPAY_PAYMENT_LINK || "https://razorpay.me/@drashwanisfamilyclinicdiagnos").trim();
const ONLINE_CONSULTATION_FEE = "700";
const DOCTOR_WHATSAPP_NUMBER = "+91 7303399370";
const isRazorpayConfigured = Boolean(RAZORPAY_KEY_ID.trim());
const hasRazorpayPaymentLink = Boolean(RAZORPAY_PAYMENT_LINK);
const razorpayScriptUrl = "https://checkout.razorpay.com/v1/checkout.js";

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
    timing: "6:00 PM - 9:00 PM",
    phone: "+91 7303399370",
    mapsUrl: "https://maps.app.goo.gl/Z7gD6ivXDRBB75Ad8"
  },
  {
    id: "clinic-3",
    name: "Dr. Ashwani Residence Clinic",
    short: "La Residentia",
    address: "Tower 7, 1003, La Residentia, Tech Zone IV, Noida Extension, 201306",
    timing: "9:30 PM - 10:30 PM",
    phone: "+91 7303399370",
    mapsUrl: "https://maps.app.goo.gl/2VzGHmYQQ1JmpK4x7"
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

const availabilityRowToState = (row) => ({
  status: row.status || "On Duty",
  clinicId: row.clinic_id || "clinic-2",
  online: row.online ?? true,
  message: row.message || "Running 20 minutes late. Please check before visiting.",
  updatedBy: row.updated_by || "Dr. Ashwani",
  updatedAt: row.updated_at
    ? new Date(row.updated_at).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "numeric",
        minute: "2-digit"
      })
    : "Clinic default"
});

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
    return "Phone OTP is not enabled in Supabase yet. Enable Auth > Providers > Phone and connect an SMS provider, then Send code will work.";
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

const getAppointmentDateTime = (appointment, activeClinic) => {
  const start = parseClinicTime(appointment.time, appointment.date)
    || parseClinicTime(activeClinic.timing.split(/\s*-\s*/)[0] || "", appointment.date)
    || new Date(`${appointment.date}T10:00:00`);
  const end = new Date(start.getTime() + 30 * 60000);
  return { start, end };
};

const toGoogleCalendarDate = (date) => {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
};

const findNextBookableDate = (clinic) => {
  const days = getAppointmentDays();
  return days.find((day) => getSlotsFromClinicTiming(clinic, day.dateValue).length > 0)?.dateValue
    || days[0]?.dateValue
    || getTodayDateValue();
};

const googleCalendarUrl = (appointment, activeClinic) => {
  const { start, end } = getAppointmentDateTime(appointment, activeClinic);
  const isOnline = appointment.mode === "Online consultation";
  const whatsappContact = `WhatsApp Dr. Ashwani: ${DOCTOR_WHATSAPP_NUMBER}`;
  const title = `Dr. Ashwani Kansal - ${appointment.reason}`;
  const details = [
    `Consultation mode: ${appointment.mode}`,
    `Status: ${appointment.status}`,
    isOnline ? whatsappContact : `Clinic: ${activeClinic.name}`,
    "Please keep latest reports, sugar/BP readings and current medicines ready."
  ].join("\n");
  const location = isOnline ? whatsappContact : `${activeClinic.name}, ${activeClinic.address}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toGoogleCalendarDate(start)}/${toGoogleCalendarDate(end)}`,
    ctz: "Asia/Kolkata",
    details,
    location
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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
    throw new Error("Could not create Razorpay order.");
  }
  return response.json();
};

const verifyConsultationPayment = async ({ order, response, patient, clinic }) => {
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
      razorpay_signature: response.razorpay_signature,
      patient,
      clinic
    })
  });

  if (!verifyResponse.ok) {
    throw new Error("Payment completed, but verification failed.");
  }
  return verifyResponse.json();
};

function App() {
  const [screen, setScreen] = useState("intro");
  const [authMode, setAuthMode] = useState("signin");
  const [authRole, setAuthRole] = useState("patient");
  const [googleProfile, setGoogleProfile] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const allowedDoctorEmails = APPROVED_DOCTOR_EMAILS;
  const [theme, setTheme] = useState("light");
  const [activeTab, setActiveTab] = useState("home");
  const [doctorTab, setDoctorTab] = useState("today");
  const [patientRecords, setPatientRecords] = useState(patients);
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id ?? null);
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
  const [consultPayment, setConsultPayment] = useState({
    status: "not_started",
    message: hasRazorpayPaymentLink
      ? `Online consultation fee is Rs ${ONLINE_CONSULTATION_FEE}. Pay securely first; WhatsApp consultation unlocks only after payment is verified.`
      : "Consultation payment will appear once the doctor sets a fee.",
    paymentId: "",
    paidAt: "",
    paymentUrl: RAZORPAY_PAYMENT_LINK
  });
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

  const updatePatientRecord = (patientId, patch) => {
    let nextPatient = null;
    setPatientRecords((records) => {
      let found = false;
      const nextRecords = records.map((patient) => {
        if (patient.id !== patientId) return patient;
        found = true;
        const cleanPatch = Object.fromEntries(
          Object.entries(patch).filter(([, value]) => value !== undefined)
        );
        nextPatient = {
          ...patient,
          ...cleanPatch,
          vitals: patch.vitals ? { ...patient.vitals, ...patch.vitals } : patient.vitals
        };
        return nextPatient;
      });

      if (!found) {
        nextPatient = {
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
        return [nextPatient, ...nextRecords];
      }

      return nextRecords;
    });
    if (nextPatient && isDoctorUser(currentUser)) {
      persistPatientRecord(nextPatient);
    }
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

    await persistPatientRecord({
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
    const amountRupees = normalizeRupees(consultationFee.amount);
    const openPaymentLink = (message) => {
      window.open(RAZORPAY_PAYMENT_LINK, "_blank", "noopener,noreferrer");
      setConsultPayment({
        status: "payment_link",
        message,
        paymentId: "",
        paidAt: "",
        paymentUrl: RAZORPAY_PAYMENT_LINK
      });
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
        openPaymentLink(`Opening the clinic Razorpay payment page. Pay Rs ${ONLINE_CONSULTATION_FEE} unless the clinic has shared a different fee. WhatsApp consultation unlocks only after payment is verified.`);
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
        openPaymentLink(`Opening the clinic Razorpay payment page for the Rs ${amountRupees} consultation fee. WhatsApp consultation unlocks only after payment is verified.`);
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
        theme: { color: "#3478f6" },
        handler: async (response) => {
          setConsultPayment((current) => ({
            ...current,
            status: "verifying",
            message: "Verifying payment..."
          }));
          try {
            await verifyConsultationPayment({ order, response, patient, clinic: activeClinic });
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
    if (window.location.hostname === "127.0.0.1") {
      window.location.replace(window.location.href.replace("127.0.0.1", "localhost"));
    }
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

  const upsertClinicProfile = async (user, requestedRole = authRole, extra = {}) => {
    if (!user?.id) return null;
    const metadata = user.user_metadata || {};
    const email = user.email || extra.email || null;
    const appRole = user.app_metadata?.role;
    const role = appRole === "doctor" || requestedRole === "doctor" ? "doctor" : "patient";

    if (role === "doctor" && email && !isApprovedDoctorEmail(email)) {
      await supabase.auth.signOut();
      setAuthMessage("This account is not approved for doctor access.");
      return null;
    }

    const profile = {
      id: user.id,
      role,
      full_name: extra.fullName || metadata.full_name || metadata.name || user.email || user.phone || "Clinic User",
      email,
      phone: user.phone || extra.phone || null,
      avatar_url: metadata.avatar_url || metadata.picture || null,
      provider: user.app_metadata?.provider || extra.provider || "email",
      medical_profile: extra.medicalProfile || {}
    };

    const { error } = await supabase
      .from("clinic_profiles")
      .upsert(profile, { onConflict: "id" });

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        setAuthMessage("Signed in. Supabase app tables are not applied yet, so profile sync is local for now.");
        return profile;
      }
      setAuthMessage(error.message);
      return null;
    }

    await logAuthAction(user, role, "sign_in");
    return profile;
  };

  const applySupabaseUser = async (user, requestedRole = authRole, extra = {}) => {
    const dbProfile = await upsertClinicProfile(user, requestedRole, extra);
    if (!dbProfile) return;

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

    setCurrentUser({
      id: dbProfile.id,
      role: "patient",
      name: dbProfile.full_name || "Clinic User",
      email: dbProfile.email,
      phone: dbProfile.phone,
      avatar: dbProfile.avatar_url,
      provider: dbProfile.provider
    });
    setScreen(extra.skipMedicalProfile ? "patient" : "patientMedicalInfo");
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!mounted || !user) return;
      const requestedRole = window.localStorage.getItem("clinicAuthRole") || "patient";
      applySupabaseUser(user, requestedRole, { skipMedicalProfile: true });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || !session?.user || event === "SIGNED_OUT") return;
      if (window.localStorage.getItem("clinicAuthDirectFlow") === "1") {
        window.localStorage.removeItem("clinicAuthDirectFlow");
        return;
      }
      const requestedRole = window.localStorage.getItem("clinicAuthRole") || "patient";
      const needsMedicalProfile = window.localStorage.getItem("clinicAuthNeedsMedicalProfile") === "1";
      window.localStorage.removeItem("clinicAuthRole");
      window.localStorage.removeItem("clinicAuthNeedsMedicalProfile");
      applySupabaseUser(session.user, requestedRole, { skipMedicalProfile: !needsMedicalProfile });
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      window.localStorage.setItem("clinicAuthRole", authRole);
      window.localStorage.setItem("clinicAuthNeedsMedicalProfile", authRole === "patient" ? "1" : "0");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: "select_account" }
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error("Google Sign-In error:", error);
      window.localStorage.removeItem("clinicAuthRole");
      window.localStorage.removeItem("clinicAuthNeedsMedicalProfile");
      alert(`Google Sign-In failed: ${error.code || error.message}`);
    }
  };

  const handleEmailAuth = async ({ mode, role, email, phone, password, fullName, identifierType = "email" }) => {
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
      window.localStorage.setItem("clinicAuthDirectFlow", "1");
      const authCall = mode === "signup"
        ? supabase.auth.signUp({
            email: normalizeClinicIdentifier(email),
            password,
            options: {
              data: {
                full_name: fullName,
                phone,
                role
              }
            }
          })
        : supabase.auth.signInWithPassword(
            usePhone ? { phone: normalizedPhone, password } : { email: normalizedEmail, password }
          );

      const { data, error } = await authCall;
      if (error) throw error;
      if (!data.user) {
        setAuthMessage("Check your email to confirm the account, then sign in.");
        return;
      }

      await applySupabaseUser(data.user, role, {
        fullName,
        phone: normalizedPhone || phone,
        provider: "email",
        skipMedicalProfile: mode !== "signup"
      });
      window.localStorage.removeItem("clinicAuthDirectFlow");
    } catch (error) {
      window.localStorage.removeItem("clinicAuthDirectFlow");
      setAuthMessage(friendlyAuthError(error));
    }
  };

  const handleSendPhoneOtp = async ({ role, phone }) => {
    setAuthMessage("");
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      setAuthMessage("Please enter phone number in +91 format.");
      return;
    }
    window.localStorage.setItem("clinicAuthRole", role);
    const { error } = await supabase.auth.signInWithOtp({ phone: normalizedPhone });
    setAuthMessage(error ? friendlyAuthError(error) : "Code sent to phone.");
  };

  const handleVerifyPhoneOtp = async ({ role, phone, token }) => {
    setAuthMessage("");
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone || !token) {
    setAuthMessage("Please enter phone number and OTP.");
    return;
    } 

    if (role === "doctor") {
    setAuthMessage("Doctor OTP login is disabled. Please use approved Google/email login.");
    return;
    }

    window.localStorage.setItem("clinicAuthDirectFlow", "1");
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token,
      type: "sms"
    });

    if (error) {
      window.localStorage.removeItem("clinicAuthDirectFlow");
      setAuthMessage(friendlyAuthError(error));
      return;
    }

  await applySupabaseUser(data.user, role, {
    phone: normalizedPhone,
    provider: "phone",
    skipMedicalProfile: false
  });
  window.localStorage.removeItem("clinicAuthDirectFlow");
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

  const submitAppointmentRequest = async (nextAppointment) => {
    setAppointment(nextAppointment);

    if (!currentUser?.id) {
      return "Please sign in before sending an appointment request.";
    }

    const isOnline = nextAppointment.mode === "Online consultation";
    const { error } = await supabase.from("appointment_requests").insert({
      patient_id: currentUser.id,
      patient_name: currentUser.name || "Clinic Patient",
      patient_phone: currentUser.phone || null,
      clinic_id: activeClinic.id,
      clinic_name: activeClinic.name,
      mode: nextAppointment.mode,
      appointment_date: nextAppointment.date,
      appointment_time: nextAppointment.time,
      reason: nextAppointment.reason,
      payment_status: isOnline ? (consultPayment.status === "paid" ? "PAID_CONFIRMED" : "PAYMENT_PENDING") : "NOT_REQUIRED",
      payment_reference: consultPayment.paymentId || null,
      status: nextAppointment.status
    });

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        return "Request saved locally. Apply Supabase migrations to sync appointment requests.";
      }
      return `Request saved locally, but cloud sync failed: ${error.message}`;
    }

    return "Appointment request sent to the clinic backend.";
  };

  const openAuthFromIntro = (role = "patient") => {
    setAuthRole(role);
    setAuthMode("signin");
    setScreen("auth");
  };

  useEffect(() => {
    setAppointment((current) => {
      const syncedDate = getSlotsFromClinicTiming(activeClinic, current.date).length > 0
        ? current.date
        : findNextBookableDate(activeClinic);
      const syncedSlots = getSlotsFromClinicTiming(activeClinic, syncedDate);
      const syncedMode = !availability.online && current.mode === "Online consultation"
        ? "Clinic visit"
        : current.mode;
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

      await persistPatientRecord({
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
    await supabase.auth.signOut();
    window.localStorage.removeItem("clinicAuthRole");
    setCurrentUser(null);
    setGoogleProfile(null);
    setAuthRole("patient");
    setAuthMode("signin");
    setScreen("auth");
  };

  return (
    <main className={`app-stage ${theme === "dark" ? "dark-theme" : ""}`}>
      <div className="phone-shell">
        <StatusBar />

        {screen === "intro" && (
          <IntroScreen
            onPatient={() => openAuthFromIntro("patient")}
            onDoctor={() => openAuthFromIntro("doctor")}
          />
        )}
        {screen === "auth" && (
          <AuthScreen
            authMode={authMode}
            setAuthMode={setAuthMode}
            authRole={authRole}
            setAuthRole={setAuthRole}
            authMessage={authMessage}
            onEmailAuth={handleEmailAuth}
            onSendPhoneOtp={handleSendPhoneOtp}
            onVerifyPhoneOtp={handleVerifyPhoneOtp}
            onGoogleSignIn={handleGoogleSignIn}
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
            setTheme={setTheme}
            onSignOut={signOut}
            availability={availability}
            activeClinic={activeClinic}
            appointment={appointment}
            setAppointment={setAppointment}
            onSubmitAppointment={submitAppointmentRequest}
            educationPosts={educationPosts}
            patientReadings={patientReadings}
            setPatientReadings={setPatientReadings}
            onSubmitReadings={syncPatientReadingsToDoctor}
            patientRecords={patientRecords}
            consultationFee={consultationFee}
            consultPayment={consultPayment}
            onPayConsult={startConsultationPayment}
          />
        )}
        {screen === "doctor" && (
          <DoctorApp
            doctorTab={doctorTab}
            setDoctorTab={setDoctorTab}
            currentUser={currentUser}
            theme={theme}
            setTheme={setTheme}
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
            consultPayment={consultPayment}
            setConsultPayment={setConsultPayment}
          />
        )}
      </div>
    </main>
  );
}

function StatusBar() {
  return (
    <div className="status-bar">
      <strong>9:41</strong>
      <span />
      <strong>5G</strong>
    </div>
  );
}

function IntroScreen({ onPatient, onDoctor }) {
  return (
    <section className="screen intro-screen">
      <div className="intro-hero">
        <img src="/doctor-ashwani-cutout.png" alt="Dr. Ashwani Kansal" />
        <div className="intro-photo-wash" />
        <div className="intro-badge">
          <HeartPulse size={22} />
        </div>
        <div className="intro-hero-card">
          <strong>Dr. Ashwani's Family Clinic</strong>
        </div>
      </div>

      <div className="intro-copy">
        <span className="kicker">Consultant Diabetologist and Physician</span>
        <h1>Dr. Ashwani Kansal</h1>
        <p>MBBS, DFID, M.MED, PGCAT. Diabetes, obesity, thyroid, hypertension, OCD and anxiety care with app-based follow-up.</p>
      </div>

      <div className="intro-actions">
        <button className="primary-button" onClick={onPatient}>
          Continue as Patient
        </button>
        <button className="secondary-button" onClick={onDoctor}>
          Doctor sign in
        </button>
      </div>

      <div className="intro-trust-row">
        <span>Diabetes</span>
        <span>Thyroid</span>
        <span>Hypertension</span>
      </div>
    </section>
  );
}

function AuthScreen({
  authMode,
  setAuthMode,
  authRole,
  setAuthRole,
  authMessage,
  onEmailAuth,
  onSendPhoneOtp,
  onVerifyPhoneOtp,
  onGoogleSignIn
}) {
  return (
    <section className="screen auth-screen">
      <div className="auth-brand">
        <div className="app-mark"><HeartPulse size={30} /></div>
        <span className="kicker">Dr. Ashwani Kansal Family Clinic</span>
        <h1>Welcome to Family Care!</h1>
        <p>Connect with Dr. Ashwani Kansal for appointments, follow-ups, reports, and live clinic availability.</p>
      </div>

      <div className="auth-card">
        <div className="segmented auth-role">
          <button className={authRole === "patient" ? "active" : ""} onClick={() => setAuthRole("patient")}>
            Patient
          </button>
          <button className={authRole === "doctor" ? "active" : ""} onClick={() => setAuthRole("doctor")}>
            Doctor
          </button>
        </div>

        {authRole === "patient" ? (
          <PatientAuthForm
            authMode={authMode}
            setAuthMode={setAuthMode}
            authMessage={authMessage}
            onEmailAuth={onEmailAuth}
            onSendPhoneOtp={onSendPhoneOtp}
            onVerifyPhoneOtp={onVerifyPhoneOtp}
            onGoogleSignIn={onGoogleSignIn}
          />
        ) : (
          <DoctorAuthForm
            authMessage={authMessage}
            onEmailAuth={onEmailAuth}
            onSendPhoneOtp={onSendPhoneOtp}
            onVerifyPhoneOtp={onVerifyPhoneOtp}
            onGoogleSignIn={onGoogleSignIn}
          />
        )}
      </div>

      <div className="medical-note">
        <ShieldCheck size={18} />
        <p>Patient medical information is stored for clinic follow-up and doctor review after consent.</p>
      </div>
    </section>
  );
}

function PatientAuthForm({
  authMode,
  setAuthMode,
  authMessage,
  onEmailAuth,
  onSendPhoneOtp,
  onVerifyPhoneOtp,
  onGoogleSignIn
}) {
  const isSignup = authMode === "signup";
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    password: "",
    otp: ""
  });
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const updateForm = (key, value) => setForm((data) => ({ ...data, [key]: value }));
  const submitEmail = () => onEmailAuth({
    mode: isSignup ? "signup" : "signin",
    role: "patient",
    ...form
  });
  const submitSignin = () => {
    const loginValue = normalizeClinicIdentifier(form.email);
    const isPhoneLogin = isPhoneIdentifier(loginValue);

    onEmailAuth({
      mode: "signin",
      role: "patient",
      identifierType: isPhoneLogin ? "phone" : "email",
      email: isPhoneLogin ? "" : loginValue,
      phone: isPhoneLogin ? loginValue : "",
      password: form.password
    });
  };
  const openRecovery = () => {
    setRecoveryOpen(true);
  };

  return (
    <div className="auth-form">
      <div className="segmented auth-mode">
        <button className={!isSignup ? "active" : ""} onClick={() => setAuthMode("signin")}>Sign In</button>
        <button className={isSignup ? "active" : ""} onClick={() => setAuthMode("signup")}>Sign Up</button>
      </div>

      <button className="google-button" onClick={onGoogleSignIn}>
        <GoogleLogo />
        Continue with Google
      </button>

      <div className="divider"><span />or<span /></div>

      {isSignup ? (
        <>
          <label>Full name<input value={form.fullName} onChange={(event) => updateForm("fullName", event.target.value)} placeholder="Patient full name" /></label>
          <label>Mobile number<input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="+91 98765 43210" /></label>
          <label>Email<input value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="patient@email.com" /></label>
          <label>Password<input value={form.password} onChange={(event) => updateForm("password", event.target.value)} placeholder="Create password" type="password" /></label>
          <button className="primary-button" onClick={submitEmail}>
            <UserPlus size={18} /> Create account
          </button>
        </>
      ) : (
        <>
          <label>
            Email / Phone
            <input
              value = {form.email}
              onChange={(event) => updateForm("email", event.target.value)}
              placeholder="patient@email.com / +91 98765 43210"
              />
          </label>
          <label>
            Password
            <input value={form.password} onChange={(event) => updateForm("password", event.target.value)} placeholder="Enter password" type="password" />
          </label>
          {recoveryOpen && (
            <div className="recovery-panel">
              <small>Forgot password? Use the phone number above to receive a one-time code.</small>
              <button type="button" className="secondary-button" onClick={() => onSendPhoneOtp({ role: "patient", phone: form.email })}>
                Send Code
              </button>
              <div className="field-with-action">
                <input value={form.otp} onChange={(event) => updateForm("otp", event.target.value)} placeholder="Enter OTP" />
                <button type="button" onClick={() => onVerifyPhoneOtp({ role: "patient", phone: form.email, token: form.otp })}>
                  Verify
                </button>
              </div>
            </div>
          )}
          <button className="primary-button" onClick={submitSignin}>
            <Check size={18} /> Sign in
          </button>
          <button className="text-button" onClick={openRecovery}>
            Forgot password? Send code
          </button>
          <button className="text-button" onClick={() => setAuthMode("signup")}>
            New patient? Create account
          </button>
        </>
      )}
      {authMessage && <div className="auth-message">{authMessage}</div>}
    </div>
  );
}

function DoctorAuthForm({
  authMessage,
  onEmailAuth,
  onSendPhoneOtp,
  onVerifyPhoneOtp,
  onGoogleSignIn
}) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    otp: ""
  });
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const updateForm = (key, value) => setForm((data) => ({ ...data, [key]: value }));
  const submitDoctorSignin = () => {
    const loginValue = normalizeClinicIdentifier(form.email);
    const isPhoneLogin = isPhoneIdentifier(loginValue);

    onEmailAuth({
      mode: "signin",
      role: "doctor",
      identifierType: isPhoneLogin ? "phone" : "email",
      email: isPhoneLogin ? "" : loginValue,
      phone: isPhoneLogin ? loginValue : "",
      password: form.password
    });
  };
  const openRecovery = () => {
    setRecoveryOpen(true);
  };

  return (
    <div className="auth-form doctor-auth-form">
      <button className="google-button" onClick={onGoogleSignIn}>
        <GoogleLogo />
        Continue with Google
      </button>
      <div className="divider"><span />or<span /></div>
      <label>
        Email / Phone
        <input
          value={form.email}
          onChange={(event) => updateForm("email", event.target.value)}
          placeholder="doctor@clinic.com / +91 doctor number"
        />
      </label>
      <label>Password<input value={form.password} onChange={(event) => updateForm("password", event.target.value)} placeholder="Enter password" type="password" /></label>
      {recoveryOpen && (
        <div className="recovery-panel">
          <small>Forgot password? Use the phone number above to receive a one-time code.</small>
          <button type="button" className="secondary-button" onClick={() => onSendPhoneOtp({ role: "doctor", phone: form.email })}>
            Send Code
          </button>
          <div className="field-with-action">
            <input value={form.otp} onChange={(event) => updateForm("otp", event.target.value)} placeholder="Enter OTP" />
            <button type="button" onClick={() => onVerifyPhoneOtp({ role: "doctor", phone: form.email, token: form.otp })}>
              Verify
            </button>
          </div>
        </div>
      )}
      <button className="primary-button" onClick={submitDoctorSignin}>
        <Check size={18} /> Sign in
      </button>
      <button className="text-button" onClick={openRecovery}>Forgot password? Send code</button>
      {authMessage && <div className="auth-message">{authMessage}</div>}
    </div>
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

function ProfileButton({ user, role, theme, setTheme, onSignOut }) {
  const [open, setOpen] = useState(false);
  const fallbackName = role === "doctor" ? "Dr. Ashwani Kansal" : "Patient";
  const displayName = user?.name || fallbackName;
  const initial = role === "doctor" ? "D" : getInitials(displayName).slice(0, 1);

  return (
    <div className="profile-wrap">
      <button className={`avatar-button ${role === "doctor" ? "doctor-avatar" : ""}`} onClick={() => setOpen(!open)} aria-label="Open profile menu">
        {user?.avatar ? <img src={user.avatar} alt={displayName} /> : initial}
      </button>
      {open && (
        <div className="profile-menu">
          <div className="profile-menu-head">
            <span className="profile-mini-avatar">
              {user?.avatar ? <img src={user.avatar} alt="" /> : <UserRound size={18} />}
            </span>
            <div>
              <strong>{displayName}</strong>
              <small>{user?.email || user?.provider || "Clinic account"}</small>
            </div>
          </div>
          <button onClick={() => {
            setTheme(theme === "dark" ? "light" : "dark");
            setOpen(false);
          }}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button onClick={() => {
            setOpen(false);
            onSignOut();
          }}>
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      )}
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
  onSubmitAppointment,
  educationPosts,
  patientReadings,
  setPatientReadings,
  onSubmitReadings,
  patientRecords,
  consultationFee,
  consultPayment,
  onPayConsult
}) {
  return (
    <section className="screen app-screen">
      <div className="app-header">
        <div>
          <span className="kicker">Patient App</span>
          <h2>{activeTab === "home" ? "How are you feeling today?" : patientTabTitles[activeTab]}</h2>
        </div>
        <ProfileButton user={currentUser} role="patient" theme={theme} setTheme={setTheme} onSignOut={onSignOut} />
      </div>

      <div className="scroll-area">
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
          <BookAppointment
            appointment={appointment}
            setAppointment={setAppointment}
            onSubmitAppointment={onSubmitAppointment}
            activeClinic={activeClinic}
            availability={availability}
            consultationFee={consultationFee}
            consultPayment={consultPayment}
            onPayConsult={onPayConsult}
          />
        )}
        {activeTab === "chat" && (
          <PatientChat
            availability={availability}
            activeClinic={activeClinic}
            patientProfile={patientRecords[0]}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === "library" && <EducationLibrary posts={educationPosts} />}
      </div>

      <PatientNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </section>
  );
}

const patientTabTitles = {
  updates: "Update readings",
  book: "Book appointment",
  chat: "Safe chatbot",
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
  return (
    <>
      <LiveAvailabilityViewer
        availability={availability}
        activeClinic={activeClinic}
        consultationFee={consultationFee}
        consultPayment={consultPayment}
        onPayConsult={onPayConsult}
      />

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
    </>
  );
}

function LiveAvailabilityViewer({ availability, activeClinic, consultationFee, consultPayment, onPayConsult }) {
  const isOnDuty = availability.status === "On Duty";
  const canStartConsultPayment = isOnDuty && availability.online;
  const feeAmount = normalizeRupees(consultationFee.amount);
  const isPaid = consultPayment.status === "paid";
  const usesPaymentLink = consultPayment.status === "payment_link";
  const doctorWhatsAppHref = doctorWhatsappUrl(`Payment verified for online consultation. Patient is ready to consult Dr. Ashwani Kansal. Payment reference: ${consultPayment.paymentId || "verified in app"}.`);
  const consultButtonLabel = !canStartConsultPayment
    ? "Book instead"
    : isPaid
      ? "Open WhatsApp"
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
      <p>{isOnDuty ? availability.message : "You can still request appointment or online consultation."}</p>
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
          <p>Doctor is off duty, so you can request the next slot first. Payment should only appear once live consultation is active.</p>
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
        ) : (
          <button disabled>Not live now</button>
        )}
        {isPaid ? (
          <a className="consult-unlocked-button" href={doctorWhatsAppHref} target="_blank" rel="noreferrer">
            {consultButtonLabel}
          </a>
        ) : (
          <button onClick={canStartConsultPayment ? onPayConsult : undefined} disabled={!canStartConsultPayment}>
            {consultButtonLabel}
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

function BookAppointment({
  appointment,
  setAppointment,
  onSubmitAppointment,
  activeClinic,
  availability,
  consultationFee,
  consultPayment,
  onPayConsult
}) {
  const [requestStatus, setRequestStatus] = useState("");
  const appointmentDays = useMemo(() => getAppointmentDays(), []);
  const clinicSlots = useMemo(
    () => getSlotsFromClinicTiming(activeClinic, appointment.date),
    [activeClinic, appointment.date]
  );
  const slots = clinicSlots;
  const selectedSlotExists = slots.includes(appointment.time);
  const feeAmount = normalizeRupees(consultationFee.amount);
  const paymentLinkStarted = consultPayment.status === "payment_link";
  const needsOnlinePayment = appointment.mode === "Online consultation"
    && feeAmount > 0
    && consultPayment.status !== "paid";
  const onlineFeePending = appointment.mode === "Online consultation" && feeAmount === 0 && !hasRazorpayPaymentLink;
  const calendarHref = googleCalendarUrl(
    {
      ...appointment,
      time: selectedSlotExists ? appointment.time : slots[0] || appointment.time
    },
    activeClinic
  );

  return (
    <div className="stack">
      <div className="booking-context-card">
        <span><CalendarCheck size={19} /></span>
        <div>
          <strong>{activeClinic.name}</strong>
          <small>
            {availability.status === "On Duty"
              ? `${activeClinic.timing} - live clinic selected by doctor`
              : `${activeClinic.timing} - doctor is off duty, showing next available clinic slots`}
          </small>
        </div>
      </div>

      <div className="segmented">
        {["Clinic visit", "Online consultation"].map((mode) => (
          <button
            key={mode}
            className={appointment.mode === mode ? "active" : ""}
            disabled={mode === "Online consultation" && !availability.online}
            onClick={() => {
              setAppointment({ ...appointment, mode, time: clinicSlots[0] || appointment.time });
            }}
          >
            {mode}
          </button>
        ))}
      </div>
      <div className="date-row">
        {appointmentDays.map((day) => (
          <button
            key={day.dateValue}
            className={appointment.date === day.dateValue ? "active" : ""}
            onClick={() => setAppointment({ ...appointment, date: day.dateValue })}
          >
            <span>{day.weekday}</span>
            <strong>{day.day}</strong>
          </button>
        ))}
      </div>
      <div className="slot-wrap">
        {slots.length > 0 ? slots.map((time) => (
          <button
            key={time}
            className={appointment.time === time ? "active" : ""}
            onClick={() => setAppointment({ ...appointment, time })}
          >
            {time}
          </button>
        )) : (
          <span className="empty-slots">No more slots for this date. Pick another day.</span>
        )}
      </div>
      <div className="form-card">
        <label>Reason<select value={appointment.reason} onChange={(event) => setAppointment({ ...appointment, reason: event.target.value })}>
          <option>Diabetes follow-up</option>
          <option>Weight management</option>
          <option>Thyroid</option>
          <option>BP</option>
          <option>Fatty liver</option>
          <option>Report review</option>
          <option>Prescription renewal</option>
          <option>Side effects</option>
          <option>WhatsApp consultation</option>
        </select></label>
      </div>
      {appointment.mode === "Online consultation" && (
        <div className={`consult-payment-gate ${consultPayment.status}`}>
          <span><ShieldCheck size={18} /></span>
          <div>
            <strong>{feeAmount ? `Online consultation fee: Rs ${feeAmount}` : "Online fee to be decided"}</strong>
            <p>
              {consultPayment.status === "paid"
                ? "Payment is verified. You can send this consultation request."
                : paymentLinkStarted
                  ? `Razorpay payment page was opened. WhatsApp stays locked until payment is verified, matching the Noida Talent Hunt payment-confirmation flow.`
                : onlineFeePending
                  ? "Doctor/admin has not set the online consultation fee yet."
                  : hasRazorpayPaymentLink
                    ? "Open the clinic Razorpay payment page before sending an online consultation request."
                    : "Please complete Razorpay payment before sending an online consultation request."}
            </p>
            {consultPayment.paidAt && <small>Paid at {consultPayment.paidAt}</small>}
            {consultPayment.paymentUrl && consultPayment.status !== "paid" && (
              <a href={consultPayment.paymentUrl} target="_blank" rel="noreferrer">
                Razorpay payment page
              </a>
            )}
          </div>
          {consultPayment.status !== "paid" && (feeAmount > 0 || hasRazorpayPaymentLink) && (
            <button onClick={onPayConsult}>{feeAmount ? `Pay Rs ${feeAmount}` : "Open Razorpay"}</button>
          )}
        </div>
      )}
      <button
        className="primary-button"
        disabled={needsOnlinePayment || onlineFeePending}
        onClick={async () => {
          const nextAppointment = { ...appointment, status: "Sent to doctor/admin" };
          setRequestStatus("Sending request...");
          const result = await onSubmitAppointment(nextAppointment);
          setRequestStatus(result);
        }}
      >
        Send request
      </button>
      {requestStatus && <p className="fine-print">{requestStatus}</p>}
      <a className="secondary-button calendar-link" href={calendarHref} target="_blank" rel="noreferrer">
        <CalendarCheck size={18} /> Add consultation to Google Calendar
      </a>
      <p className="fine-print">
        Google Calendar opens with the selected date, slot, clinic or WhatsApp coordination details.
      </p>
      <p className="fine-print">Appointment is not confirmed until doctor/admin approves it.</p>
    </div>
  );
}

function PatientChat({ availability, activeClinic, patientProfile, setActiveTab }) {
  const threadRef = useRef(null);
  const [messages, setMessages] = useState([
    {
      role: "bot",
      label: "Clinic assistant",
      text: "I can review your saved profile, explain general metabolic health topics, help with app features, and answer live clinic availability."
    }
  ]);
  const [draft, setDraft] = useState("");

  const [chatState, setChatState] = useState("idle");
  const [formData, setFormData] = useState({});

  const [appointmentRequests, setAppointmentRequests] = useState([]);
  const [healthUpdates, setHealthUpdates] = useState([]);
  const [riskAlerts, setRiskAlerts] = useState([]);

  const addBotMessage = (text) => {
  setMessages((items) => [...items, { role: "bot", label: "Clinic assistant", text }]);
  };

  const addUserMessage = (text) => {
  setMessages((items) => [...items, { role: "user", label: "You", text }]);
  };

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [messages]);

  const sendMessage = (text) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    addUserMessage(cleanText);
    setDraft("");

    if (chatState !== "idle") {
      handleStateFlow(cleanText);
      return;
    }

    const lowerText = cleanText.toLowerCase();

    if (lowerText.includes("update sugar") || lowerText.includes("sugar update")) {
      setChatState("sugar_fasting");
      setFormData({});
      addBotMessage("Please enter your fasting sugar value.");
      return;
    }

    if (lowerText.includes("update bp") || lowerText.includes("bp update") || lowerText.includes("blood pressure")) {
      setChatState("bp_systolic");
      setFormData({});
      addBotMessage("Please enter your systolic BP value. Example: 120");
      return;
    }

    if (lowerText.includes("book appointment") || lowerText.includes("appointment")) {
      setChatState("appointment_type");
      setFormData({});
      addBotMessage("Would you like a clinic visit or online consultation?");
      return;
    }

    const reply = generateClinicAssistantReply(cleanText, { availability, activeClinic, patientProfile });
    addBotMessage(reply);
  };

  const handleStateFlow = (text) => {
  const lowerText = text.toLowerCase();

  if (hasEmergencyText(lowerText)) {
    const alert = {
      type: "Emergency",
      message: text,
      createdAt: new Date().toLocaleString()
    };

    setRiskAlerts((items) => [...items, alert]);
    setChatState("idle");
    setFormData({});

    addBotMessage("This may be an emergency. Please seek emergency medical care immediately or contact local emergency services.");
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

    if (hasHighRiskText(lowerText)) {
      setRiskAlerts((items) => [
        ...items,
        {
          type: "Sugar Risk Alert",
          message: `Sugar update symptoms: ${text}`,
          createdAt: new Date().toLocaleString()
        }
      ]);
    }

    setChatState("idle");
    setFormData({});

    addBotMessage("Your sugar update has been recorded for doctor review. Please do not change medicines without doctor advice.");
    return;
  }

  if (chatState === "bp_systolic") {
    setFormData((data) => ({ ...data, systolic: text }));
    setChatState("bp_diastolic");
    addBotMessage("Please enter your diastolic BP value. Example: 80");
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

    if (hasHighRiskText(lowerText)) {
      setRiskAlerts((items) => [
        ...items,
        {
          type: "BP Risk Alert",
          message: `BP symptoms: ${text}`,
          createdAt: new Date().toLocaleString()
        }
      ]);
    }

    setChatState("idle");
    setFormData({});

    addBotMessage("Your BP update has been recorded for doctor review. If symptoms are severe, please seek urgent medical care.");
    return;
  }

  if (chatState === "appointment_type") {
    setFormData((data) => ({ ...data, consultationType: text }));
    setChatState("appointment_reason");
    addBotMessage("Please enter the reason for appointment. Example: diabetes follow-up, thyroid, BP, report review, weight management.");
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

    addBotMessage("Your appointment request has been sent. The clinic will confirm it.");
    return;
  }

  setChatState("idle");
  setFormData({});
  addBotMessage("Sorry, I could not complete this flow. Please try again.");
};

const hasEmergencyText = (text) => {
  return EMERGENCY_KEYWORDS.some((word) => text.includes(word));
};

const hasHighRiskText = (text) => {
  return HIGH_RISK_KEYWORDS.some((word) => text.includes(word));
};
  const quickPrompts = [
    "Book appointment",
    "Update sugar",
    "Update BP",
    "Where is doctor?",
    "Review my case",
    "Ask about diabetes"
  ];

  return (
    <div className="chat-panel smart-chat">
      <div className="chat-context-card">
        <span><Bot size={19} /></span>
        <div>
          <strong>Clinic assistant</strong>
          <small>Uses your app profile and live doctor availability.</small>
        </div>
        <button type="button" onClick={() => setActiveTab("book")}>
          <CalendarCheck size={16} /> Book
        </button>
      </div>

      <div className="chat-quick-prompts">
        {quickPrompts.map((prompt) => (
          <button key={prompt} onClick={() => sendMessage(prompt)}>{prompt}</button>
        ))}
      </div>

      <div className="chat-thread" ref={threadRef} aria-live="polite">
        {messages.map((message, index) => (
          <div className={`message-row ${message.role}`} key={`${message.role}-${index}`}>
            <div className="message-avatar">{message.role === "bot" ? "A" : "Y"}</div>
            <div className={`bubble ${message.role}`}>
              <span>{message.label}</span>
              <p>{message.text}</p>
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
            if (event.key === "Enter") sendMessage(draft);
          }}
            placeholder="Message clinic assistant"
          />
          <button onClick={() => sendMessage(draft)} aria-label="Send message"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
}

function generateClinicAssistantReply(message, { availability, activeClinic, patientProfile }) {
  const text = message.toLowerCase();
  const has = (words) => words.some((word) => text.includes(word));
  const medicalDisclaimer = "For personal advice, please consult Dr. Ashwani Kansal.";

  if (has(EMERGENCY_KEYWORDS)) {
    return "This may be a medical emergency. Please seek emergency medical care immediately or contact local emergency services at 112. Do not wait; go to the nearest hospital emergency department now.";
  }

  if (has(MEDICINE_CHANGE_KEYWORDS)) {
    return "I cannot advise medicine or dose changes. Please consult Dr. Ashwani Kansal before starting, stopping, or changing any medicine, insulin, semaglutide, or Mounjaro dose.";
  }

  if (
    has(["where", "available", "availability", "rn", "right now", "now", "today", "clinic"]) &&
    has(["doctor", "dr.", "ashwani", "kansal", "sir", "clinic"])
  ) {
    if (availability.status !== "On Duty") {
      return `Dr. Ashwani Kansal is marked off duty right now in the app. You can still request an appointment or online consultation from the Book tab. Last update: ${availability.updatedAt}.`;
    }
    return `Dr. Ashwani Kansal is marked on duty at ${activeClinic.name}, ${activeClinic.short}. Address: ${activeClinic.address}. Timing: ${activeClinic.timing}. Online consultation is ${availability.online ? "available" : "not available"} right now. Note from clinic: ${availability.message}`;
  }

  if (has(["my case", "my profile", "review", "what is wrong", "whats wrong", "what's wrong", "profile case"])) {
    if (!patientProfile) {
      return "I don't have any saved readings for you yet. Add your fasting sugar, post-meal sugar, BP, weight, or reports in the Updates tab and I can review your case here.";
    }
    return buildCaseReview(patientProfile);
  }

  if (has(["book", "appointment", "consult", "follow up", "follow-up"])) {
    return "Use the Book tab to request a clinic visit or online consultation, choose a slot, and add the reason like diabetes follow-up, report review, thyroid, BP, side effects, or prescription renewal. The request stays pending until doctor or admin approves it.";
  }

  if (has(["upload", "report", "reading", "sugar update", "bp update", "weight update"])) {
    return "Use Updates to add fasting sugar, post-meal sugar, BP, weight, or a report upload. These details become part of your profile for Dr. Ashwani Kansal to review.";
  }

  if (has(["whatsapp", "message", "rx", "prescription"])) {
    return "The doctor app can open WhatsApp templates for follow-up, report upload, sugar updates, availability, and prescription sharing. Patient-side WhatsApp messaging should be used for clinic coordination, not emergency care.";
  }

  const topicReply = getGeneralHealthReply(text);
  if (topicReply) {
    const highRiskNote = has(HIGH_RISK_KEYWORDS)
      ? " This should be reviewed by Dr. Ashwani Kansal soon because your message includes a high-risk symptom or reading."
      : "";
    return `${topicReply}${highRiskNote} ${medicalDisclaimer}`;
  }

  if (has(HIGH_RISK_KEYWORDS)) {
    return `This should be reviewed by Dr. Ashwani Kansal soon because it may be high risk. Please book a consultation or contact the clinic, and seek urgent care if symptoms worsen. ${medicalDisclaimer}`;
  }

  if (has(MEDICAL_TOPICS)) {
    return `I can explain this in general terms, but I cannot diagnose or prescribe from chat. Please update your readings or reports in the app so the doctor can review them. ${medicalDisclaimer}`;
  }

  return "I can help with live clinic availability, app features, your saved health profile, and general diabetes, thyroid, BP, weight, fatty liver, CGM, cholesterol, and lifestyle education. Try asking: where is Dr. Ashwani Kansal right now, review my case, or how do I book an appointment.";
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
  consultationFee,
  consultPayment,
  setConsultPayment
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
      <div className="app-header">
        <div>
          <span className="kicker">Doctor App</span>
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
        </div>
        <ProfileButton user={currentUser} role="doctor" theme={theme} setTheme={setTheme} onSignOut={onSignOut} />
      </div>

      <div className="scroll-area">
        {doctorTab === "today" && <DoctorToday stats={stats} alerts={alerts} setDoctorTab={setDoctorTab} />}
        {doctorTab === "availability" && (
          <DoctorAvailabilityEditor
            availability={availability}
            setAvailability={setAvailability}
            activeClinic={activeClinic}
            consultPayment={consultPayment}
            setConsultPayment={setConsultPayment}
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
            patient={selectedPatient}
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
      <button className="doctor-duty-cta" onClick={() => setDoctorTab("availability")}>
        <span><MapPin size={24} /></span>
        <strong>Update live clinic availability</strong>
        <small>This is visible on patient app instantly.</small>
        <ChevronRight size={22} />
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

function DoctorAvailabilityEditor({
  availability,
  setAvailability,
  activeClinic,
  consultPayment,
  setConsultPayment
}) {
  const updateAvailability = (patch) => {
    setAvailability({
      ...availability,
      ...patch,
      updatedBy: "Dr. Ashwani",
      updatedAt: "Just now"
    });
  };
  const verifyConsultPaymentManually = () => {
    setConsultPayment({
      status: "paid",
      message: "Payment manually verified by doctor/admin. WhatsApp consultation is unlocked.",
      paymentId: "manual-razorpay-receipt",
      paidAt: new Date().toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "numeric",
        minute: "2-digit"
      }),
      paymentUrl: ""
    });
  };

  return (
    <div className="stack">
      <div className="doctor-live-preview">
        <span className="live-dot" />
        <strong>{availability.status === "On Duty" ? activeClinic.name : "Off Duty"}</strong>
        <p>{availability.message || activeClinic.timing}</p>
        <small>Patient page reads this same status.</small>
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

      <label className="switch-card">
        <span><Video size={18} /> Online consultation available</span>
        <input
          type="checkbox"
          checked={availability.online}
          onChange={(event) => updateAvailability({ online: event.target.checked })}
        />
      </label>

      <div className="form-card">
        <label>Custom patient message<input value={availability.message} onChange={(event) => updateAvailability({ message: event.target.value })} /></label>
        <div className="locked-fee-card">
          <span>Online consultation fee</span>
          <strong>Rs {ONLINE_CONSULTATION_FEE}</strong>
          <small>Static fee locked for all online consultations.</small>
        </div>
        <small className="field-help">
          Patients must pay this fee through Razorpay before sending an online consultation request.
        </small>
      </div>

      <div className={`consult-payment-gate ${consultPayment.status}`}>
        <span><ShieldCheck size={18} /></span>
        <div>
          <strong>Online consult payment gate</strong>
          <p>{consultPayment.message}</p>
          {consultPayment.paymentId && <small>Reference: {consultPayment.paymentId}</small>}
        </div>
        {consultPayment.status !== "paid" ? (
          <button onClick={verifyConsultPaymentManually}>Mark payment verified</button>
        ) : (
          <button disabled>WhatsApp unlocked</button>
        )}
      </div>

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
              {(patient.gender || "?")[0]} - {patient.age}y - {patient.mobile} - {patient.conditions?.[0] || "—"}
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

function DoctorPatientDetail({ patient, onBack, updatePatient }) {
  const [doctorNotice, setDoctorNotice] = useState("");
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

      <DoctorSection icon={Pill} title="Prescribe" action="Save" onAction={() => showNotice("Use Add item inside this section, then Save list.")}>
        <EditableList
          items={patient.medicines}
          placeholder="Add medicine, diet, walk or monitoring instruction"
          onSave={(items) => {
            updatePatient({ medicines: items });
            showNotice("Prescription list updated.");
          }}
        />
      </DoctorSection>

      <DoctorSection icon={FileText} title="Doctor Notes" action="Save" onAction={saveNotes}>
        <label className="full-width-field">
          Notes
          <textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} />
        </label>
      </DoctorSection>

      <DoctorSection icon={Clock} title="Follow Up" action="Save" onAction={saveFollowUp}>
        <label className="full-width-field">
          Next follow-up
          <input value={followUpDraft} onChange={(event) => setFollowUpDraft(event.target.value)} />
        </label>
        <p className="detail-copy">Next follow-up due on {followUpDraft}. Send reminder if patient has not responded.</p>
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

      <div className="rx-bar">
        <a className="secondary-button" href={whatsappUrl(patient, `Clinic update from Dr. Ashwani Kansal: please review your app updates and complete your follow-up due on ${patient.followUp}.`)} target="_blank" rel="noreferrer">
          <Plus size={18} /> Push Updates
        </a>
        <a className="primary-button rx-link" href={whatsappUrl(patient, `Prescription from Dr. Ashwani Kansal: ${patient.medicines.join("; ")}`)} target="_blank" rel="noreferrer">
          <Send size={18} /> Send Rx
        </a>
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

function PatientNav({ activeTab, setActiveTab }) {
  return (
    <nav className="bottom-nav" aria-label="Patient navigation">
      {[
        ["home", Home, "Home"],
        ["updates", Activity, "Updates"],
        ["book", CalendarCheck, "Book"],
        ["chat", Bot, "Chat"],
        ["library", BookOpen, "Learn"]
      ].map(([key, Icon, label]) => (
        <button key={key} className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>
          <Icon size={18} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function DoctorNav({ doctorTab, setDoctorTab }) {
  return (
    <nav className="bottom-nav doctor-nav" aria-label="Doctor navigation">
      {[
        ["today", Home, "Today"],
        ["availability", MapPin, "Live"],
        ["patients", Users, "Patients"],
        ["education", BookOpen, "Learn"]
      ].map(([key, Icon, label]) => (
        <button key={key} className={doctorTab === key ? "active" : ""} onClick={() => setDoctorTab(key)}>
          <Icon size={18} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
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
