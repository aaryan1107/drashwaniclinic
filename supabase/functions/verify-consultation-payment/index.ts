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

    const body = await request.json();
    const orderId = String(body.order_id || body.razorpay_order_id || "");
    const paymentId = String(body.razorpay_payment_id || "");
    const signature = String(body.razorpay_signature || "");
    const keyId = String(Deno.env.get("RAZORPAY_KEY_ID") || "").trim();
    const keySecret = String(Deno.env.get("RAZORPAY_KEY_SECRET") || "").trim();

    if (!orderId || !paymentId || !signature) {
      return json({ error: "Missing Razorpay verification data." }, 400);
    }

    if (!keyId || !keySecret) {
      return json({ error: "Razorpay keys are missing in Supabase secrets." }, 500);
    }

    const expectedSignature = await hmacSha256(`${orderId}|${paymentId}`, keySecret);
    if (!timingSafeEqual(expectedSignature, signature)) {
      return json({ error: "Invalid Razorpay signature." }, 400);
    }

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: {
        "Authorization": `Basic ${btoa(`${keyId}:${keySecret}`)}`
      }
    });
    const payment = await paymentResponse.json();

    if (!paymentResponse.ok) {
      return json({ error: "Unable to fetch Razorpay payment.", details: payment }, 502);
    }

    if (payment.order_id !== orderId) {
      return json({ error: "Payment order mismatch." }, 400);
    }

    if (!["captured", "authorized"].includes(payment.status)) {
      return json({ error: `Payment is not completed. Current status: ${payment.status}` }, 400);
    }

    await storeVerifiedPayment({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      amount: payment.amount,
      currency: payment.currency,
      payment_method: payment.method || "",
      payment_status: payment.status === "captured" ? "PAID_CONFIRMED" : "AUTHORIZED",
      patient: body.patient || {},
      clinic: body.clinic || {},
      verified_at: new Date().toISOString()
    });

    return json({
      ok: true,
      payment_status: payment.status,
      razorpay_payment_id: paymentId
    });
  } catch (error) {
    return json({ error: error?.message || "Server error while verifying consultation payment." }, 500);
  }
});

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

async function storeVerifiedPayment(row: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return;

  await fetch(`${supabaseUrl}/rest/v1/consultation_payments?razorpay_order_id=eq.${encodeURIComponent(String(row.razorpay_order_id))}`, {
    method: "PATCH",
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify(row)
  }).catch(() => undefined);
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
