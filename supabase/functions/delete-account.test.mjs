import assert from "node:assert/strict";

// ---- delete-account Edge Function with mocked Supabase ----
const env = { PROJECT_URL: "https://db.example", SERVICE_ROLE_KEY: "service" };
let handle;
globalThis.Deno = { env: { get: (name) => env[name] }, serve: (handler) => { handle = handler; } };

let calls = [];
let files = {};
let rpcStatus = 200;
let rpcMessage = "";
let authDeleteStatus = 200;
let clinicRole = { profiles: [], doctors: [], staff: [] };
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ path: url.pathname, search: url.search, method, body, headers: options.headers });
  if (url.pathname === "/auth/v1/user") {
    return options.headers.Authorization === "Bearer patient-token" ? Response.json({ id: "user-1", email: "fake@example.test" }) : new Response("no", { status: 401 });
  }
  if (url.pathname === "/rest/v1/clinic_profiles") return Response.json(clinicRole.profiles);
  if (url.pathname === "/rest/v1/clinic_doctors") return Response.json(clinicRole.doctors);
  if (url.pathname === "/rest/v1/clinic_staff") return Response.json(clinicRole.staff);
  if (url.pathname === "/rest/v1/patient_records") return Response.json([{ id: "user-1" }, { id: "rec-2" }]);
  if (url.pathname === "/storage/v1/object/list/prescription-pdfs") {
    const prefix = body.prefix;
    return Response.json((files[prefix] || []).map((name) => ({ name })));
  }
  if (url.pathname === "/storage/v1/object/prescription-pdfs" && method === "DELETE") {
    for (const full of body.prefixes) {
      const [folder, name] = full.split("/");
      files[`${folder}/`] = (files[`${folder}/`] || []).filter((item) => item !== name);
    }
    return Response.json([]);
  }
  if (url.pathname === "/rest/v1/rpc/clinic_delete_patient_account") {
    return rpcStatus === 200 ? Response.json({ record_ids: ["user-1", "rec-2"], deleted: {} }) : Response.json({ message: rpcMessage }, { status: rpcStatus });
  }
  if (url.pathname.startsWith("/auth/v1/admin/users/")) return new Response("{}", { status: authDeleteStatus });
  throw new Error(`unexpected fetch ${method} ${url}`);
};
const { CONFIRM_WORD } = await import("./delete-account/index.ts");

const send = (body, token = "patient-token") => handle(new Request("https://functions.example", {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body)
}));
const reset = () => { calls = []; files = { "user-1/": ["RX-1.pdf", "RX-2.pdf"], "rec-2/": ["RX-9.pdf"] }; rpcStatus = 200; rpcMessage = ""; authDeleteStatus = 200; clinicRole = { profiles: [], doctors: [], staff: [] }; };
const writes = () => calls.filter((c) => c.method !== "GET" && !c.path.startsWith("/storage/v1/object/list"));

// Signed-out callers and missing confirmation change nothing.
reset();
assert.equal((await send({ confirm: CONFIRM_WORD }, "stranger")).status, 401);
assert.equal(writes().length, 0);
reset();
assert.equal((await send({ confirm: "yes" })).status, 400);
assert.equal(writes().length, 0);

// A patient deletes their account: PDFs, then rows in one transaction, then the login.
reset();
let response = await send({ confirm: "delete" });
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { deleted: true });
assert.deepEqual(files, { "user-1/": [], "rec-2/": [] }, "every prescription PDF for their records is removed");
const order = writes().map((c) => c.path);
assert.deepEqual(order, [
  "/storage/v1/object/prescription-pdfs",
  "/storage/v1/object/prescription-pdfs",
  "/rest/v1/rpc/clinic_delete_patient_account",
  "/auth/v1/admin/users/user-1"
]);
const rpc = calls.find((c) => c.path === "/rest/v1/rpc/clinic_delete_patient_account");
assert.deepEqual(rpc.body, { target: "user-1" }, "the user id comes from the verified token, never from the request");
const lookup = calls.find((c) => c.path === "/rest/v1/patient_records");
assert.equal(new URLSearchParams(lookup.search).get("or"), "(owner_id.eq.user-1,id.eq.user-1)");

// Another user's id in the body is ignored.
reset();
await send({ confirm: CONFIRM_WORD, user_id: "someone-else", target: "someone-else" });
assert.deepEqual(calls.find((c) => c.path === "/rest/v1/rpc/clinic_delete_patient_account").body, { target: "user-1" });
assert.ok(!calls.some((c) => c.path.includes("someone-else")));

// Doctors and staff are refused before anything is touched (doctors can own walk-in patients' records).
for (const role of ["profiles", "doctors", "staff"]) {
  reset();
  clinicRole[role] = [{ id: "x" }];
  response = await send({ confirm: CONFIRM_WORD });
  assert.equal(response.status, 403, role);
  assert.equal(writes().length, 0, `${role}: no file, row or login is touched`);
  assert.ok(!calls.some((c) => c.path.startsWith("/storage/")), role);
}
const doctorCheck = calls.find((c) => c.path === "/rest/v1/clinic_staff");
assert.equal(new URLSearchParams(doctorCheck.search).get("email"), "eq.fake@example.test");

// The database function refuses them too, as a second check, and their login is kept.
reset();
rpcStatus = 403; rpcMessage = "Only patient accounts can be deleted here";
response = await send({ confirm: CONFIRM_WORD });
assert.equal(response.status, 403);
assert.match((await response.json()).error, /removed by the clinic/);
assert.ok(!calls.some((c) => c.path.startsWith("/auth/v1/admin/users/")));

// If the row deletion fails, the login is kept so the patient can try again.
reset();
rpcStatus = 500;
response = await send({ confirm: CONFIRM_WORD });
assert.equal(response.status, 500);
assert.ok(!calls.some((c) => c.path.startsWith("/auth/v1/admin/users/")));

// A login that is already gone (a retry after a partial failure) still counts as deleted.
reset();
authDeleteStatus = 404;
assert.equal((await send({ confirm: CONFIRM_WORD })).status, 200);

console.log("delete account tests passed");
