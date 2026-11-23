// Clinic chatbot backed by Groq's OpenAI-compatible chat completions API.
// The model only sees the signed-in patient's own records: every lookup runs with the patient's
// token, so row-level security applies exactly as it does in the app. Each request is stateless:
// the app sends the recent history, and Groq does not train on API inputs or outputs.
import {
  EMERGENCY_REPLY,
  MAX_MESSAGE_CHARS,
  MAX_TOOL_ROUNDS,
  MEDICAL_REPLY,
  CHAT_TOOLS,
  BOOKING_REASONS,
  CLINICS,
  bookingDays,
  buildSystemInstruction,
  clinicById,
  historyToMessages,
  istDateValue,
  messageIsEmergency,
  messageNeedsDoctor,
  slotsFor,
  validateBookingDraft,
  validateReadingsDraft
} from "../_shared/clinicAssistantRules.js";
import { VISIT_FEE_RUPEES, feeSummary } from "../_shared/consultationFee.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Best tool use first. Each model has its own free-tier quota, so the others take over when it is busy.
const DEFAULT_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type Json = Record<string, unknown>;
type Card = Json & { type: string };

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function env(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const projectUrl = env("PROJECT_URL") || env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY") || env("PROJECT_ANON_KEY");
  const groqKey = env("GROQ_API_KEY");
  // Groq keeps request logs for up to 30 days unless Zero Data Retention is on in its Data Controls.
  // Patient messages must not sit in those logs, so the owner has to confirm ZDR before this runs.
  const zeroRetention = env("GROQ_ZERO_RETENTION") === "confirmed";
  if (!projectUrl || !anonKey) return json({ error: "The assistant is not configured.", code: "not_configured" }, 503);

  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const user = token ? await getUser(projectUrl, anonKey, token) : null;
  if (!user?.id) return json({ error: "Please sign in to use the assistant." }, 401);

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return json({ error: "A message is required." }, 400);
  if (message.length > MAX_MESSAGE_CHARS) return json({ error: `Keep messages under ${MAX_MESSAGE_CHARS} characters.` }, 400);

  // Fixed answers that never depend on the model.
  if (messageIsEmergency(message)) return json({ reply: EMERGENCY_REPLY, cards: [], source: "rules" });
  if (messageNeedsDoctor(message)) return json({ reply: MEDICAL_REPLY, cards: [{ type: "open", screen: "book" }], source: "rules" });

  if (!groqKey || !zeroRetention) return json({ error: "The assistant is not configured.", code: "not_configured" }, 503);

  const db = (path: string) => fetch(`${projectUrl}/rest/v1/${path}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, Accept: "application/json" }
  });

  const availability = await loadAvailability(db);
  const clinic = clinicById(availability.clinic_id);
  const onDuty = availability.status === "On Duty";
  const cards: Card[] = [];
  const state = { urgent: false };
  const tools = makeTools({ db, userId: user.id, clinic, onDuty, cards, state });

  const models = (env("GROQ_MODEL") ? [env("GROQ_MODEL")] : []).concat(DEFAULT_MODELS)
    .filter((model, index, list) => list.indexOf(model) === index);
  const systemInstruction = buildSystemInstruction({ today: istDateValue(), clinic, onDuty });
  const messages: Json[] = historyToMessages(body?.history, message, systemInstruction);
  let retriedEmpty = false;

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const reply = await callGroq({ key: groqKey, models, messages, allowTools: round < MAX_TOOL_ROUNDS && !retriedEmpty });
      const calls = Array.isArray(reply.tool_calls) ? reply.tool_calls as Json[] : [];
      if (!calls.length) {
        const text = scrubReply(typeof reply.content === "string" ? reply.content : "");
        // The model occasionally ends a turn with no text. Ask once more, without tools, before giving up.
        if (!text && !cards.length && !retriedEmpty && round < MAX_TOOL_ROUNDS) {
          retriedEmpty = true;
          continue;
        }
        if (!text && !cards.length) return json({ error: "The assistant could not answer.", code: "empty" }, 502);
        // Urgent readings always lead with the emergency advice, whatever the model wrote.
        const answer = state.urgent ? [EMERGENCY_REPLY, text].filter(Boolean).join("\n\n") : (text || "Here you go.");
        return json({ reply: answer, cards: dedupeCards(cards), source: "ai" });
      }
      // Stateless turn: send back the assistant's tool calls, then one result per call.
      messages.push({ role: "assistant", content: typeof reply.content === "string" ? reply.content : "", tool_calls: calls });
      for (const call of calls) {
        const fn = (call.function || {}) as Json;
        const name = String(fn.name || "");
        const handler = tools[name];
        const args = parseArguments(fn.arguments);
        const result = !handler ? { error: "Unknown tool." }
          : !args ? { error: "The tool arguments were not valid JSON." }
          : await handler(args).catch(() => ({ error: "The record could not be loaded." }));
        messages.push({ role: "tool", tool_call_id: String(call.id || ""), content: JSON.stringify(result) });
      }
    }
    return json({ error: "The assistant could not finish.", code: "too_many_steps" }, 502);
  } catch (error) {
    console.error("clinic-assistant failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "The assistant is busy. Please try again.", code: "provider_error" }, 503);
  }
});

async function getUser(projectUrl: string, anonKey: string, token: string) {
  const response = await fetch(`${projectUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
  return response.ok ? await response.json() : null;
}

async function loadAvailability(db: (path: string) => Promise<Response>) {
  try {
    const response = await db("clinic_availability?select=status,clinic_id,online,message&id=eq.live&limit=1");
    const rows = response.ok ? await response.json() : [];
    return (rows[0] || { status: "Off Duty", clinic_id: "clinic-2", online: false, message: "" }) as Json;
  } catch {
    return { status: "Off Duty", clinic_id: "clinic-2", online: false, message: "" } as Json;
  }
}

async function callGroq({ key, models, messages, allowTools }: { key: string; models: string[]; messages: Json[]; allowTools: boolean }) {
  let lastError = "";
  for (const model of models) {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        tools: CHAT_TOOLS,
        tool_choice: allowTools ? "auto" : "none",
        temperature: 0.3,
        max_completion_tokens: 2048,
        ...(model.startsWith("openai/") ? { reasoning_effort: "low" } : {})
      })
    });
    if (response.ok) {
      const data = await response.json() as Json;
      const choice = Array.isArray(data.choices) ? data.choices[0] as Json : null;
      if (choice?.message) return choice.message as Json;
      lastError = `${model} no choice`;
      continue;
    }
    const detail = await response.json().catch(() => null) as Json | null;
    const code = String((detail?.error as Json | undefined)?.code || "");
    lastError = `${model} ${response.status}${code ? ` ${code}` : ""}`;
    // Busy, rate-limited, or a malformed tool call from this model: try the next model.
    if (![429, 500, 502, 503, 504].includes(response.status) && code !== "tool_use_failed") break;
  }
  throw new Error(`Groq request failed (${lastError})`);
}

function parseArguments(raw: unknown): Json | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Json;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Json : null;
  } catch {
    return null;
  }
}

// The clinic's phone number is deliberately kept out of the app.
// The chat shows plain text, so markdown emphasis and headings are removed too.
function scrubReply(text: string) {
  return text
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, "[number removed]")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*\*\s+/gm, "- ")
    .trim()
    .slice(0, 2000);
}

// Keeps the newest card of each kind, at most three.
function dedupeCards(cards: Card[]) {
  const seen = new Set<string>();
  const kept = [...cards].reverse().filter((card) => {
    const key = card.type === "open" ? `open:${card.screen}` : card.type;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return kept.slice(0, 3).reverse();
}

function makeTools({ db, userId, clinic, onDuty, cards, state }: { db: (path: string) => Promise<Response>; userId: string; clinic: { id: string; name: string; area: string; timing: string }; onDuty: boolean; cards: Card[]; state: { urgent: boolean } }) {
  const uid = encodeURIComponent(userId);
  const rows = async (path: string) => {
    const response = await db(path);
    if (!response.ok) throw new Error(`lookup failed ${response.status}`);
    return await response.json() as Json[];
  };

  return {
    async get_my_prescriptions(args: Json) {
      const limit = Math.min(Math.max(Number.parseInt(String(args.limit ?? 1), 10) || 1, 1), 3);
      const data = await rows(`prescriptions?select=id,created_at,medicines,instructions,follow_up_date,doctor_name,patient_records!inner(owner_id)&patient_records.owner_id=eq.${uid}&status=eq.issued&order=created_at.desc,id.desc&limit=${limit}`);
      if (!data.length) return { found: false, note: "No issued prescription on this account." };
      const latest = data[0];
      cards.push({ type: "prescription", rx: { id: latest.id, created_at: latest.created_at, medicines: latest.medicines, instructions: latest.instructions, follow_up_date: latest.follow_up_date } });
      return { found: true, prescriptions: data.map(({ patient_records: _owner, ...rx }) => rx) };
    },
    async get_my_care_plan() {
      const data = await rows(`patient_care_plans?select=medicines,follow_up_date,follow_up_notes,patient_records!inner(owner_id)&patient_records.owner_id=eq.${uid}&limit=1`);
      if (!data.length) return { found: false, note: "No care plan has been published yet." };
      cards.push({ type: "open", screen: "care" });
      const { patient_records: _owner, ...plan } = data[0];
      return { found: true, care_plan: plan };
    },
    async get_my_appointments() {
      const data = await rows(`appointment_requests?select=appointment_date,appointment_time,clinic_name,reason,mode,status,payment_status&patient_id=eq.${uid}&order=appointment_date.desc&limit=5`);
      return data.length ? { appointments: data } : { appointments: [], note: "No bookings on this account." };
    },
    async get_my_payment_status() {
      const data = await rows(`consultation_payments?select=payment_status,amount,razorpay_payment_id,clinic,created_at&patient->>user_id=eq.${uid}&order=created_at.desc,id.desc&limit=1`);
      if (!data.length) return { found: false, note: "No payment recorded on this account." };
      const { clinic: details, amount, ...payment } = data[0] as Json & { clinic?: Json; amount?: number };
      return { found: true, ...payment, amount_rupees: typeof amount === "number" ? amount / 100 : null, purpose: details?.purpose === "clinic_visit" ? "clinic visit" : "online consultation" };
    },
    async get_clinic_info() {
      return {
        clinics: CLINICS,
        doctor_on_duty: onDuty,
        visits_booked_at: clinic.name,
        clinic_visit_fee_rupees: VISIT_FEE_RUPEES,
        online_consultation_fee: feeSummary(),
        bookable_dates: bookingDays(),
        visit_reasons: BOOKING_REASONS
      };
    },
    async get_available_slots(args: Json) {
      const date = String(args.date || "");
      return { clinic: clinic.name, date, slots: slotsFor(clinic, date), bookable_dates: bookingDays() };
    },
    async prepare_visit_booking(args: Json) {
      const result = validateBookingDraft(args, clinic);
      if (!result.ok) return { prepared: false, error: result.error };
      cards.push(result.draft as Card);
      return { prepared: true, note: "The booking card is ready. The patient must open it, check it and pay to book. Nothing is booked yet.", ...result.draft };
    },
    async prepare_readings_update(args: Json) {
      const result = validateReadingsDraft(args);
      if (!result.ok) return { prepared: false, error: result.error };
      cards.push(result.draft as Card);
      if (result.critical) state.urgent = true;
      return { prepared: true, critical: result.critical, note: result.critical
        ? "These values are in the urgent range. Tell the patient to call 112 or go to the nearest emergency department now, then submit the readings."
        : "The readings card is ready. The patient must open it and submit it. Nothing is saved yet." };
    },
    async open_app_screen(args: Json) {
      const screen = String(args.screen || "");
      if (!["book", "updates", "care", "library", "home"].includes(screen)) return { error: "Unknown screen." };
      cards.push({ type: "open", screen });
      return { shown: true };
    }
  } as Record<string, (args: Json) => Promise<Json>>;
}
