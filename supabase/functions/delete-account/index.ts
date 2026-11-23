// Deletes the signed-in patient's account and app data at once, from the app's Delete account button.
// Steps, each safe to repeat if a later one fails:
//   1. verify the caller from their own token, and that they typed the confirmation word;
//   2. remove their prescription PDFs from storage (<patient record id>/... in prescription-pdfs);
//   3. delete their rows in one transaction (public.clinic_delete_patient_account), which keeps only
//      the payment details the tax register needs, without contact details;
//   4. delete the sign-in account.
// Doctors and front-desk staff are refused; their access is removed by the clinic instead.
export const CONFIRM_WORD = "DELETE";
const BUCKET = "prescription-pdfs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type Json = Record<string, unknown>;

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
  const serviceKey = env("SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceKey) return json({ error: "Account deletion is not configured." }, 503);

  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const user = token ? await getUser(projectUrl, serviceKey, token) : null;
  if (!user?.id) return json({ error: "Please sign in again to delete your account." }, 401);

  const body = await request.json().catch(() => null);
  if (String(body?.confirm || "").trim().toUpperCase() !== CONFIRM_WORD) {
    return json({ error: `Type ${CONFIRM_WORD} to confirm.` }, 400);
  }

  const admin = (path: string, init: RequestInit = {}) => fetch(`${projectUrl}${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const userId = String(user.id);

  try {
    // Refuse clinic accounts before touching anything. Doctors can own walk-in patients' records,
    // so this must run before any PDF is removed. The database function checks again.
    if (await isClinicAccount(admin, userId, String(user.email || ""))) {
      return json({ error: "Doctor and staff accounts are removed by the clinic. Please contact the clinic." }, 403);
    }

    // Record ids first, so their PDFs can be found before the rows go.
    const recordsResponse = await admin(`/rest/v1/patient_records?select=id&or=(owner_id.eq.${encodeURIComponent(userId)},id.eq.${encodeURIComponent(userId)})`);
    if (!recordsResponse.ok) throw new Error(`records ${recordsResponse.status}`);
    const recordIds = ((await recordsResponse.json()) as Json[]).map((row) => String(row.id));
    const removedFiles = await removePdfs(admin, recordIds);

    const rpc = await admin("/rest/v1/rpc/clinic_delete_patient_account", { method: "POST", body: JSON.stringify({ target: userId }) });
    if (!rpc.ok) {
      const detail = await rpc.json().catch(() => null) as Json | null;
      if (String(detail?.message || "").includes("Only patient accounts")) {
        return json({ error: "Doctor and staff accounts are removed by the clinic. Please contact the clinic." }, 403);
      }
      throw new Error(`delete rows ${rpc.status}`);
    }

    const auth = await admin(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    if (!auth.ok && auth.status !== 404) throw new Error(`delete login ${auth.status}`);

    // No personal data in logs: only that a deletion finished and how many files went.
    console.log("account deleted", JSON.stringify({ files: removedFiles }));
    return json({ deleted: true });
  } catch (error) {
    console.error("delete-account failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "We couldn't finish deleting your account. Please try again." }, 500);
  }
});

async function getUser(projectUrl: string, key: string, token: string) {
  const response = await fetch(`${projectUrl}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  return response.ok ? await response.json() as Json : null;
}

async function isClinicAccount(admin: (path: string, init?: RequestInit) => Promise<Response>, userId: string, email: string) {
  const checks = [`/rest/v1/clinic_profiles?select=id&id=eq.${encodeURIComponent(userId)}&role=neq.patient`];
  if (email) {
    const lower = encodeURIComponent(email.toLowerCase());
    checks.push(`/rest/v1/clinic_doctors?select=email&email=eq.${lower}`, `/rest/v1/clinic_staff?select=email&email=eq.${lower}`);
  }
  for (const path of checks) {
    const response = await admin(path);
    if (!response.ok) throw new Error(`role check ${response.status}`);
    if (((await response.json()) as Json[]).length) return true;
  }
  return false;
}

async function removePdfs(admin: (path: string, init?: RequestInit) => Promise<Response>, recordIds: string[]) {
  let removed = 0;
  for (const recordId of recordIds) {
    for (;;) {
      const list = await admin(`/storage/v1/object/list/${BUCKET}`, { method: "POST", body: JSON.stringify({ prefix: `${recordId}/`, limit: 100, offset: 0 }) });
      if (!list.ok) throw new Error(`list files ${list.status}`);
      const names = ((await list.json()) as Json[]).map((item) => `${recordId}/${item.name}`);
      if (!names.length) break;
      const remove = await admin(`/storage/v1/object/${BUCKET}`, { method: "DELETE", body: JSON.stringify({ prefixes: names }) });
      if (!remove.ok) throw new Error(`remove files ${remove.status}`);
      removed += names.length;
      if (names.length < 100) break;
    }
  }
  return removed;
}
