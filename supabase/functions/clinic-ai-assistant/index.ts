import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const emergencyTerms = [
  "chest pain",
  "breathless",
  "breathlessness",
  "fainting",
  "unconscious",
  "confusion",
  "seizure",
  "stroke",
  "severe weakness",
  "sugar 400",
  "bp 180"
];

const medicineChangeTerms = [
  "change dose",
  "increase dose",
  "decrease dose",
  "stop medicine",
  "start medicine",
  "insulin dose",
  "mounjaro dose",
  "semaglutide dose"
];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function includesAny(message: string, terms: string[]) {
  const lower = message.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function trimText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, 4000) : fallback;
}

function compactProfile(profile: Record<string, unknown> | null) {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    gender: profile.gender,
    conditions: profile.conditions,
    vitals: profile.vitals,
    prescriptions: profile.prescriptions,
    notes: trimText(profile.notes, "")
  };
}

async function getAuthenticatedUser(authHeader: string | null) {
  const projectUrl = Deno.env.get("PROJECT_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (!projectUrl || !serviceRoleKey || !token) return null;

  const response = await fetch(`${projectUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: serviceRoleKey
    }
  });

  if (!response.ok) return null;
  return await response.json();
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

  if (!openAiKey) {
    return jsonResponse({ error: "AI assistant is not configured" }, 503);
  }

  const user = await getAuthenticatedUser(request.headers.get("Authorization"));
  if (!user) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const message = trimText(payload.message);
  if (!message) {
    return jsonResponse({ error: "Message is required" }, 400);
  }

  if (includesAny(message, emergencyTerms)) {
    return jsonResponse({
      reply: "This may be urgent. Please call Dr. Ashwani Kansal's clinic hotline or local emergency services now. Do not wait for chat guidance for chest pain, fainting, severe breathlessness, confusion, stroke symptoms, very high BP, or very high/low sugar symptoms.",
      actionCard: "emergency_call",
      extractedFact: "Emergency concern raised"
    });
  }

  if (includesAny(message, medicineChangeTerms)) {
    return jsonResponse({
      reply: "I cannot advise medicine or dose changes. Please consult Dr. Ashwani Kansal before starting, stopping, or changing any medicine, insulin, semaglutide, or Mounjaro dose.",
      actionCard: null,
      extractedFact: "Asked about medicine dose change"
    });
  }

  const patientProfile = compactProfile((payload.patientProfile as Record<string, unknown>) || null);
  const patientMemory = payload.patientMemory || { keyFacts: [] };
  const availability = payload.availability || {};
  const activeClinic = payload.activeClinic || {};

  const systemPrompt = [
    "You are the semantic AI layer for Dr. Ashwani Kansal Family Clinic's patient app.",
    "You help with app navigation, saved profile review, general metabolic health education, appointment guidance, and live clinic availability.",
    "You must not diagnose, prescribe, change medication, or replace the doctor.",
    "If a patient asks about emergency symptoms, tell them to seek urgent medical care and set actionCard to emergency_call.",
    "If a patient asks where Dr. Ashwani is right now, answer only from the provided availability and activeClinic values.",
    "Keep replies short, warm, and specific to the saved context.",
    "Return strict JSON only with keys: reply, actionCard, extractedFact.",
    "actionCard must be one of: null, vitals_input, sugar_input, bp_input, slot_picker, emergency_call."
  ].join("\n");

  const userContext = {
    message,
    patientProfile,
    patientMemory,
    availability,
    activeClinic
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: openAiModel,
      temperature: 0.2,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userContext) }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI assistant request failed:", errorText);
    return jsonResponse({ error: "AI assistant request failed" }, 502);
  }

  const result = await response.json();
  const outputText = typeof result.output_text === "string"
    ? result.output_text
    : result.output?.flatMap((item: Record<string, unknown>) => Array.isArray(item.content) ? item.content : [])
      ?.map((content: Record<string, unknown>) => content.text)
      ?.filter(Boolean)
      ?.join("\n");

  try {
    const parsed = JSON.parse(outputText || "{}");
    return jsonResponse({
      reply: trimText(parsed.reply, "I can help review your saved profile, explain general health topics, or guide you to Book and Updates."),
      actionCard: parsed.actionCard || null,
      extractedFact: parsed.extractedFact || null
    });
  } catch {
    return jsonResponse({
      reply: trimText(outputText, "I can help review your saved profile, explain general health topics, or guide you to Book and Updates."),
      actionCard: null,
      extractedFact: null
    });
  }
});
