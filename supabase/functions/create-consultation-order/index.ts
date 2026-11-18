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
    const authUser = await getAuthenticatedUser(request);

    if (!keyId || !keySecret) {
      return json({ error: "Razorpay keys are missing in Supabase secrets." }, 500);
    }

    if (!authUser) {
      return json({ error: "Please sign in before paying for consultation." }, 401);
    }

    if (!Number.isInteger(amount) || amount !== 70000 || currency !== "INR") {
      return json({ error: "Invalid consultation amount. Online consultation fee is fixed at Rs 700." }, 400);
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
        receipt: `consult_${Date.now()}`,
        notes: {
          purpose: "doctor_consultation",
          clinic: body.clinic?.name || "",
          patient: patient.name || "",
          patient_id: authUser.id
        }
      })
    });

    const order = await orderResponse.json();
    if (!orderResponse.ok) {
      return json({ error: "Failed to create Razorpay order.", details: order }, 502);
    }

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
  } catch (error) {
    return json({ error: error?.message || "Server error while creating consultation order." }, 500);
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
