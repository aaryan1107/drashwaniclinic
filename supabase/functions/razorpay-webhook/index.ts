// Razorpay webhook: confirms consultation payments server-side, even if the patient
// closes the browser before the in-app verify call finishes.
//
// Setup (see docs/deployment/backend-setup-checklist.md):
//   supabase secrets set RAZORPAY_WEBHOOK_SECRET=... --project-ref <ref>
//   supabase functions deploy razorpay-webhook --no-verify-jwt --project-ref <ref>
//   Razorpay Dashboard > Webhooks > URL: https://<ref>.supabase.co/functions/v1/razorpay-webhook
//     Events: see WEBHOOK_EVENTS below.
//
// Every signed delivery is written to razorpay_webhook_events (audit log). Razorpay retries
// reuse the x-razorpay-event-id header, so a delivery that was already handled is skipped.
// The audit log is best effort: if it is unavailable the payment row is still updated.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-razorpay-signature, x-razorpay-event-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const CONSULT_AMOUNT_PAISE = 70000;

// Events to tick in the Razorpay Dashboard. State-changing events patch consultation_payments;
// the rest are only recorded in the audit log for the doctor to review.
export const WEBHOOK_EVENTS = [
  "payment.authorized",
  "payment.captured",
  "payment.failed",
  "order.paid",
  "refund.created",
  "refund.processed",
  "refund.failed",
  "payment.dispute.created",
  "payment.dispute.won",
  "payment.dispute.lost",
  "payment.dispute.closed"
];

// A status may only be written over these earlier states, so late or replayed events never
// downgrade a row. REFUNDED is terminal: nothing moves a refunded payment back to paid.
const priorStates: Record<string, string> = {
  PAID_CONFIRMED: "ORDER_CREATED,AUTHORIZED,CAPTURE_PENDING,FAILED",
  CAPTURE_PENDING: "ORDER_CREATED,AUTHORIZED,FAILED",
  FAILED: "ORDER_CREATED",
  REFUNDED: "AUTHORIZED,CAPTURE_PENDING,PAID_CONFIRMED,FAILED"
};
// Deliveries with these outcomes are final; a retry of the same event ID is skipped.
const FINAL_OUTCOMES = "applied,no_change,ignored";
const RAZORPAY_ID = /^[A-Za-z0-9_]{1,64}$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]+$/;

type Db = { projectUrl: string; serviceKey: string };
type Update = {
  kind: "status" | "failure" | "refund";
  patch: Record<string, unknown>;
  amount: unknown;
  currency: unknown;
  checkAmount: boolean;
  paymentId: string;
  amountRefunded?: number;
};

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
    const db: Db = { projectUrl, serviceKey };

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

    const eventType = String(event?.event || "");
    const headerEventId = request.headers.get("x-razorpay-event-id") || "";
    const eventId = RAZORPAY_ID.test(headerEventId) ? headerEventId : null;
    if (eventId && await alreadyHandled(db, eventId)) {
      return json({ handled: true, duplicate: true, event: eventType });
    }

    const payment = event.payload?.payment?.entity || null;
    const order = event.payload?.order?.entity || null;
    const refund = event.payload?.refund?.entity || null;
    const orderId: string = payment?.order_id || order?.id || "";
    const paymentId = String(payment?.id || refund?.payment_id || "");
    const audit = {
      event_id: eventId,
      event: eventType || "unknown",
      razorpay_order_id: orderId || null,
      razorpay_payment_id: paymentId || null,
      razorpay_refund_id: refund?.id || null,
      amount: typeof payment?.amount === "number" ? payment.amount : null,
      currency: payment?.currency ? String(payment.currency).toUpperCase() : null
    };

    const update = orderId ? buildUpdate(eventType, payment, order) : null;
    if (!update) {
      await logEvent(db, { ...audit, outcome: "ignored" });
      return json({
        handled: false,
        event: eventType,
        message: orderId ? "Event recorded; no payment status change." : "No Razorpay order ID in event."
      });
    }

    if (update.checkAmount && (update.amount !== CONSULT_AMOUNT_PAISE || update.currency !== "INR")) {
      await logEvent(db, { ...audit, outcome: "rejected_amount" });
      return json({ error: "Payment amount or currency does not match the consultation fee." }, 400);
    }

    const rows = await updateOrder(db, orderId, update);
    if (!rows) {
      await logEvent(db, { ...audit, outcome: "error" });
      return json({ error: "Could not save webhook update." }, 500);
    }

    const applied = rows.length > 0;
    await logEvent(db, {
      ...audit,
      outcome: applied ? "applied" : "no_change",
      payment_status: applied ? rows[0]?.payment_status ?? null : null
    });
    return json({ handled: true, matched: applied, event: eventType, razorpay_order_id: orderId });
  } catch (_error) {
    return json({ error: "Webhook server error." }, 500);
  }
});

function buildUpdate(eventType: string, payment: any, order: any): Update | null {
  const base: Record<string, unknown> = clean({
    razorpay_payment_id: payment?.id || undefined,
    amount: typeof payment?.amount === "number" ? payment.amount : undefined,
    currency: payment?.currency ? String(payment.currency).toUpperCase() : undefined,
    payment_method: payment?.method || undefined
  });
  const paymentId = String(payment?.id || "");
  const status = (patch: Record<string, unknown>, kind: Update["kind"] = "status"): Update => ({
    kind, patch, amount: patch.amount, currency: patch.currency, checkAmount: kind !== "failure", paymentId
  });

  if (eventType === "order.paid") {
    const patch = { ...base, payment_status: "PAID_CONFIRMED", verified_at: new Date().toISOString() };
    if (typeof order?.amount_paid === "number") patch.amount = order.amount_paid;
    if (order?.currency) patch.currency = String(order.currency).toUpperCase();
    return status(patch);
  }
  if (eventType === "payment.captured") {
    return status({ ...base, payment_status: "PAID_CONFIRMED", verified_at: new Date().toISOString() });
  }
  if (eventType === "payment.authorized") {
    return status({ ...base, payment_status: "CAPTURE_PENDING" });
  }
  if (eventType === "payment.failed") {
    return status({ ...base, payment_status: "FAILED" }, "failure");
  }
  if (eventType === "refund.processed") {
    // Razorpay sends the payment with its cumulative amount_refunded. Only a full refund
    // revokes the consultation; a partial refund is recorded without changing the status.
    const amountRefunded = payment?.amount_refunded;
    if (!PAYMENT_ID.test(paymentId) || typeof amountRefunded !== "number" || amountRefunded <= 0) return null;
    const full = payment?.refund_status === "full" || amountRefunded >= Number(payment?.amount);
    const patch: Record<string, unknown> = { amount_refunded: amountRefunded, refunded_at: new Date().toISOString() };
    if (full) patch.payment_status = "REFUNDED";
    return {
      kind: "refund", patch, paymentId, amountRefunded, checkAmount: true,
      amount: base.amount, currency: base.currency
    };
  }
  return null;
}

function clean(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== ""));
}

function targetQuery(orderId: string, update: Update) {
  const query = new URLSearchParams({ razorpay_order_id: `eq.${orderId}` });
  const paymentId = update.paymentId;
  if (update.kind === "refund") {
    // Only the refunded payment's own row (an extra payment on the same order can be
    // auto-refunded while the real one stays paid), and amount_refunded only ever grows.
    query.set("razorpay_payment_id", `eq.${paymentId}`);
    query.set("payment_status", `in.(${priorStates.REFUNDED})`);
    query.set("or", `(amount_refunded.is.null,amount_refunded.lt.${update.amountRefunded})`);
  } else if (update.kind === "failure" && PAYMENT_ID.test(paymentId)) {
    // A failure may also end the same payment's authorization, but never another attempt on this order.
    query.set("or", `(payment_status.eq.ORDER_CREATED,and(payment_status.in.(AUTHORIZED,CAPTURE_PENDING),razorpay_payment_id.eq.${paymentId}))`);
  } else {
    query.set("payment_status", `in.(${priorStates[String(update.patch.payment_status)]})`);
  }
  query.set("select", "payment_status");
  return query;
}

async function updateOrder(db: Db, orderId: string, update: Update): Promise<any[] | null> {
  const response = await fetch(`${db.projectUrl}/rest/v1/consultation_payments?${targetQuery(orderId, update)}`, {
    method: "PATCH",
    headers: { ...dbHeaders(db), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(update.patch)
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function alreadyHandled(db: Db, eventId: string) {
  try {
    const query = new URLSearchParams({
      event_id: `eq.${eventId}`, outcome: `in.(${FINAL_OUTCOMES})`, select: "id", limit: "1"
    });
    const response = await fetch(`${db.projectUrl}/rest/v1/razorpay_webhook_events?${query}`, { headers: dbHeaders(db) });
    if (!response.ok) return false;
    const rows = await response.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function logEvent(db: Db, row: Record<string, unknown>) {
  try {
    // A retry of a failed delivery overwrites its earlier outcome.
    const conflict = row.event_id ? "?on_conflict=event_id" : "";
    await fetch(`${db.projectUrl}/rest/v1/razorpay_webhook_events${conflict}`, {
      method: "POST",
      headers: { ...dbHeaders(db), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ payment_status: null, ...row })
    });
  } catch {
    // Best effort: the payment row is the source of truth.
  }
}

function dbHeaders(db: Db) {
  return { apikey: db.serviceKey, Authorization: `Bearer ${db.serviceKey}` };
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
