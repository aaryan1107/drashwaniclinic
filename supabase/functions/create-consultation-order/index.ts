import { VISIT_PAYMENT_PURPOSE, consultationFeeTier, expectedFeePaise } from "../_shared/consultationFee.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "A JSON order request is required." }, 400);
    }
    const amount = Number(body.amount);
    const currency = String(body.currency || "INR").toUpperCase();
    const keyId = String(Deno.env.get("RAZORPAY_KEY_ID") || "").trim();
    const keySecret = String(Deno.env.get("RAZORPAY_KEY_SECRET") || "").trim();
    const authUser = await getAuthenticatedUser(request);

    if (!authUser) {
      return json({ error: "Please sign in before paying for consultation." }, 401);
    }

    if (!keyId || !keySecret) {
      return json({ error: "Razorpay keys are missing in Supabase secrets." }, 500);
    }

    if (!Number.isSafeInteger(amount) || amount < 100) {
      return json({ error: "Amount must be an integer of at least 100 paise." }, 400);
    }

    // The server decides the price. A clinic visit has one fixed fee; an online consultation is priced
    // by the age on the patient's own record. The amount the app sends must match, or nothing is charged.
    const isVisit = body.clinic?.purpose === VISIT_PAYMENT_PURPOSE;
    const age = await lookupPatientAge(authUser.id);
    if (!age.ok) return json({ error: "Could not check the fee for your account. No payment was requested." }, 503);
    const expected = expectedFeePaise({ purpose: isVisit ? VISIT_PAYMENT_PURPOSE : "online_consultation", age: age.value });
    if (amount !== expected || currency !== "INR") {
      return json({
        error: `The fee for this payment is ₹${expected / 100} in INR. Reopen the screen and try again.`,
        expected_amount: expected
      }, 400);
    }

    const receipt = body.receipt ?? `consult_${crypto.randomUUID().replaceAll("-", "")}`;
    if (typeof receipt !== "string" || !receipt.trim() || receipt.length > 40) {
      return json({ error: "Receipt must be a non-empty string of at most 40 characters." }, 400);
    }

    const patient = {
      ...(body.patient || {}),
      user_id: authUser.id,
      email: authUser.email || body.patient?.email || "",
      contact: authUser.phone || body.patient?.contact || ""
    };

    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount,
        currency,
        receipt,
        notes: {
          purpose: "doctor_consultation",
          clinic: body.clinic?.name || "",
          patient: patient.name || "",
          patient_id: authUser.id,
          fee_tier: isVisit ? `visit_${consultationFeeTier(age.value)}` : consultationFeeTier(age.value)
        }
      })
    });

    if (!orderResponse.ok) {
      return json({ error: "Razorpay could not create the order. Please try again." }, 500);
    }
    const order = await orderResponse.json();

    const saved = await storePaymentDraft({
      razorpay_order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      patient,
      clinic: body.clinic || {}
    });

    if (!saved) return json({ error: "Could not save the consultation order. No payment was requested." }, 503);

    return json({
      razorpay_key_id: keyId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch {
    return json({ error: "Server error while creating consultation order." }, 500);
  }
});

// The patient's age from their own record (owner_id, or the record id for self-registered patients).
// A missing record or age is not an error: it simply pays the general fee. A failed lookup is, so the
// price is never guessed.
async function lookupPatientAge(userId: string): Promise<{ ok: boolean; value: number | null }> {
  const supabaseUrl = Deno.env.get("PROJECT_URL");
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return { ok: false, value: null };

  const id = encodeURIComponent(userId);
  const response = await fetch(
    `${supabaseUrl}/rest/v1/patient_records?select=age&or=(owner_id.eq.${id},id.eq.${id})&order=updated_at.desc&limit=1`,
    { headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` } }
  ).catch(() => null);
  if (!response?.ok) return { ok: false, value: null };

  const rows = await response.json().catch(() => null);
  if (!Array.isArray(rows)) return { ok: false, value: null };
  const age = Number(rows[0]?.age);
  return { ok: true, value: Number.isFinite(age) && age > 0 ? age : null };
}

async function getAuthenticatedUser(request: Request) {
  const supabaseUrl = Deno.env.get("PROJECT_URL");
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") || "";
  if (!supabaseUrl || !serviceKey || !authorization.startsWith("Bearer ")) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      "apikey": serviceKey,
      "Authorization": authorization
    }
  });

  if (!response.ok) return null;
  return response.json();
}

async function storePaymentDraft(row: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("PROJECT_URL");
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return false;

  const response = await fetch(`${supabaseUrl}/rest/v1/consultation_payments`, {
    method: "POST",
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      ...row,
      payment_status: "ORDER_CREATED"
    })
  }).catch(() => null);
  return Boolean(response?.ok);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
