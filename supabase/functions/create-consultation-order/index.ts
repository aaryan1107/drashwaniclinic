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
    const amount = Number(body.amount);
    const currency = String(body.currency || "INR").toUpperCase();
    const keyId = String(Deno.env.get("RAZORPAY_KEY_ID") || "").trim();
    const keySecret = String(Deno.env.get("RAZORPAY_KEY_SECRET") || "").trim();

    if (!keyId || !keySecret) {
      return json({ error: "Razorpay keys are missing in Supabase secrets." }, 500);
    }

    if (!Number.isInteger(amount) || amount < 100) {
      return json({ error: "Invalid consultation amount." }, 400);
    }

    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount,
        currency,
        receipt: `consult_${Date.now()}`,
        notes: {
          purpose: "doctor_consultation",
          clinic: body.clinic?.name || "",
          patient: body.patient?.name || ""
        }
      })
    });

    const order = await orderResponse.json();
    if (!orderResponse.ok) {
      return json({ error: "Failed to create Razorpay order.", details: order }, 502);
    }

    await storePaymentDraft({
      razorpay_order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      patient: body.patient || {},
      clinic: body.clinic || {}
    });

    return json({
      razorpay_key_id: keyId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch (error) {
    return json({ error: error?.message || "Server error while creating consultation order." }, 500);
  }
});

async function storePaymentDraft(row: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return;

  await fetch(`${supabaseUrl}/rest/v1/consultation_payments`, {
    method: "POST",
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      ...row,
      payment_status: "ORDER_CREATED"
    })
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
