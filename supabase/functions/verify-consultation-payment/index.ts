import { isAllowedFeePaise } from "../_shared/consultationFee.js";

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
    const checkoutOrderId = body?.razorpay_order_id;
    const orderId = body?.order_id ?? checkoutOrderId;
    const paymentId = body?.razorpay_payment_id;
    const signature = body?.razorpay_signature;
    if ([checkoutOrderId, orderId, paymentId, signature].some((field) => typeof field !== "string" || !field.trim())) {
      return json({ error: "Missing Razorpay verification data." }, 400);
    }
    if (checkoutOrderId !== orderId) {
      return json({ error: "Checkout order does not match the consultation order." }, 400);
    }

    const keyId = String(Deno.env.get("RAZORPAY_KEY_ID") || "").trim();
    const keySecret = String(Deno.env.get("RAZORPAY_KEY_SECRET") || "").trim();
    const authUser = await getAuthenticatedUser(request);

    if (!authUser) {
      return json({ error: "Please sign in before verifying consultation payment." }, 401);
    }

    if (!keyId || !keySecret) {
      return json({ error: "Razorpay keys are missing in Supabase secrets." }, 500);
    }

    const expectedSignature = await hmacSha256(`${orderId}|${paymentId}`, keySecret);
    if (!timingSafeEqual(expectedSignature, signature)) {
      return json({ error: "Invalid Razorpay signature." }, 400);
    }

    const headers = { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` };
    const orderResponse = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, { headers });
    if (!orderResponse.ok) return json({ error: "Unable to fetch consultation order." }, 502);
    const order = await orderResponse.json();
    if (order.notes?.purpose !== "doctor_consultation" || order.notes?.patient_id !== authUser.id) {
      return json({ error: "This order does not belong to your clinic account." }, 403);
    }

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers });
    if (!paymentResponse.ok) return json({ error: "Unable to fetch Razorpay payment." }, 502);
    const payment = await paymentResponse.json();
    // The order was created by our server at the correct price, so the payment must equal it, and it must
    // be one of the amounts the clinic actually charges.
    if (payment.order_id !== orderId || payment.amount !== order.amount || !isAllowedFeePaise(payment.amount)
        || payment.currency !== "INR") {
      return json({ error: "Payment does not match the consultation order." }, 400);
    }
    if (payment.status === "authorized") {
      return json({ payment_status: "authorized", error: "Payment authorized. Waiting for Razorpay to confirm capture." }, 409);
    }
    if (payment.status !== "captured") return json({ error: "Payment has not been captured." }, 409);

    const saved = await storeVerifiedPayment(orderId, authUser.id, {
      razorpay_payment_id: paymentId,
      payment_method: payment.method || "",
      payment_status: "PAID_CONFIRMED",
      verified_at: new Date().toISOString()
    });

    if (!saved) {
      // Money was captured, but the unlock could not be stored. Tell the patient to send the receipt.
      return json({
        error: "Payment was received, but the clinic record could not be saved. Please share the Razorpay receipt with the clinic.",
        razorpay_payment_id: paymentId
      }, 500);
    }

    return json({
      ok: true,
      payment_status: payment.status,
      razorpay_payment_id: paymentId
    });
  } catch (error) {
    return json({ error: error?.message || "Server error while verifying consultation payment." }, 500);
  }
});

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

async function hmacSha256(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function storeVerifiedPayment(orderId: string, userId: string, patch: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("PROJECT_URL");
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return false;
  const query = new URLSearchParams({
    razorpay_order_id: `eq.${orderId}`,
    "patient->>user_id": `eq.${userId}`,
    payment_status: "in.(ORDER_CREATED,AUTHORIZED,CAPTURE_PENDING,FAILED,PAID_CONFIRMED)"
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/consultation_payments?${query}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(patch)
  });
  return response.ok && (await response.json()).length === 1;
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
