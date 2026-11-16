// Razorpay webhook: confirms consultation payments server-side, even if the patient
// closes the browser before the in-app verify call finishes.
//
// Setup (see docs/deployment/backend-setup-checklist.md):
//   supabase secrets set RAZORPAY_WEBHOOK_SECRET=... --project-ref <ref>
//   supabase functions deploy razorpay-webhook --no-verify-jwt --project-ref <ref>
//   Razorpay Dashboard > Webhooks > URL: https://<ref>.supabase.co/functions/v1/razorpay-webhook
//     Events: order.paid, payment.captured, payment.authorized, payment.failed

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-razorpay-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const CONSULT_AMOUNT_PAISE = 70000;
const PROTECTED_STATUSES = ["PAID_CONFIRMED", "AUTHORIZED", "MANUALLY_VERIFIED"];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const webhookSecret = String(Deno.env.get("RAZORPAY_WEBHOOK_SECRET") || "").trim();
    const projectUrl = Deno.env.get("PROJECT_URL");
    const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");
    if (!webhookSecret || !projectUrl || !serviceKey) {
      return json({ error: "Webhook is not configured." }, 500);
    }

    // Verify the raw body before parsing anything.
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature") || "";
    if (!signature) return json({ error: "Missing Razorpay webhook signature." }, 400);

    const expected = await hmacSha256Hex(rawBody, webhookSecret);
    if (!timingSafeEqual(expected, signature)) {
      return json({ error: "Invalid webhook signature." }, 400);
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json({ error: "Webhook body must be valid JSON." }, 400);
    }

    const payment = event.payload?.payment?.entity || null;
    const order = event.payload?.order?.entity || null;
    const orderId: string = payment?.order_id || order?.id || "";
    if (!orderId) return json({ handled: false, message: "No Razorpay order ID in event." });

    const patch = buildPatch(event.event, payment, order);
    if (!patch) return json({ handled: false, event: event.event, message: "Event not used." });

    const existing = await fetchRow(projectUrl, serviceKey, orderId);
    if (existing && PROTECTED_STATUSES.includes(existing.payment_status) && patch.payment_status === "FAILED") {
      return json({ handled: true, message: "Ignored: payment already confirmed." });
    }

    // Amount guard: a captured payment must match the locked consultation fee.
    if (patch.payment_status === "PAID_CONFIRMED" || patch.payment_status === "AUTHORIZED") {
      if (patch.amount !== CONSULT_AMOUNT_PAISE || patch.currency !== "INR") {
        return json({ error: "Payment amount or currency does not match the consultation fee." }, 400);
      }
    }

    // Upsert so a paid event still lands if the order draft row was never written.
    const notes = (order?.notes || payment?.notes || {}) as Record<string, string>;
    const row = {
      razorpay_order_id: orderId,
      ...patch,
      patient: {
        ...(existing?.patient || {}),
        user_id: existing?.patient?.user_id || notes.patient_id || "",
        name: existing?.patient?.name || notes.patient || "Patient"
      },
      clinic: existing?.clinic || { name: notes.clinic || "" }
    };

    const saved = await upsertRow(projectUrl, serviceKey, row);
    if (!saved) return json({ error: "Could not save webhook update." }, 500);

    return json({ handled: true, event: event.event, razorpay_order_id: orderId });
  } catch (_error) {
    return json({ error: "Webhook server error." }, 500);
  }
});

function buildPatch(eventType: string, payment: any, order: any) {
  const base: Record<string, unknown> = {
    razorpay_payment_id: payment?.id || undefined,
    amount: typeof payment?.amount === "number" ? payment.amount : undefined,
    currency: payment?.currency ? String(payment.currency).toUpperCase() : undefined,
    payment_method: payment?.method || undefined
  };

  if (eventType === "order.paid") {
    base.amount = typeof order?.amount_paid === "number" ? order.amount_paid : base.amount;
    base.currency = order?.currency ? String(order.currency).toUpperCase() : base.currency;
    return { ...clean(base), payment_status: "PAID_CONFIRMED", verified_at: new Date().toISOString() };
  }
  if (eventType === "payment.captured") {
    return { ...clean(base), payment_status: "PAID_CONFIRMED", verified_at: new Date().toISOString() };
  }
  if (eventType === "payment.authorized") {
    return { ...clean(base), payment_status: "AUTHORIZED" };
  }
  if (eventType === "payment.failed") {
    return { ...clean(base), payment_status: "FAILED" };
  }
  return null;
}

function clean(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== ""));
}

async function fetchRow(projectUrl: string, serviceKey: string, orderId: string) {
  const response = await fetch(
    `${projectUrl}/rest/v1/consultation_payments?select=*&razorpay_order_id=eq.${encodeURIComponent(orderId)}&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!response.ok) throw new Error("Lookup failed");
  const rows = await response.json();
  return rows[0] || null;
}

async function upsertRow(projectUrl: string, serviceKey: string, row: Record<string, unknown>) {
  const response = await fetch(`${projectUrl}/rest/v1/consultation_payments?on_conflict=razorpay_order_id`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(row)
  }).catch(() => null);
  return Boolean(response?.ok);
}

async function hmacSha256Hex(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
