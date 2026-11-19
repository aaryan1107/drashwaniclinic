import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const env = {
  PROJECT_URL: "https://db.example",
  SERVICE_ROLE_KEY: "test-service",
  RAZORPAY_KEY_ID: "test-key",
  RAZORPAY_KEY_SECRET: "test-secret",
  RAZORPAY_WEBHOOK_SECRET: "test-webhook",
};
let handle;
globalThis.Deno = { env: { get: (name) => env[name] }, serve: (handler) => { handle = handler; } };

const payment = { order_id: "order_1", amount: 70000, currency: "INR", method: "upi", status: "captured" };
const order = { id: "order_1", amount: 70000, currency: "INR", notes: { purpose: "doctor_consultation", patient_id: "owner" } };
const hmac = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");
const send = (body, extra = {}) => handle(new Request("https://functions.example", {
  method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json", ...extra },
  body: JSON.stringify(body),
}));
const verification = {
  order_id: "order_1", razorpay_payment_id: "pay_1",
  razorpay_signature: hmac(env.RAZORPAY_KEY_SECRET, "order_1|pay_1"),
};

let user = "owner";
let writes = [];
let writeResult = [];
let status = 200;
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  if (url.pathname === "/auth/v1/user") return Response.json({ id: user });
  if (url.pathname.startsWith("/v1/orders")) return Response.json(order);
  if (url.pathname.startsWith("/v1/payments")) return Response.json(payment);
  assert.equal(url.pathname, "/rest/v1/consultation_payments");
  writes.push({ url, method: options.method, body: JSON.parse(options.body) });
  return Response.json(writeResult, { status });
};

await import("./create-consultation-order/index.ts");
assert.equal((await send({ amount: 70000, currency: "USD" })).status, 400);
status = 503;
assert.equal((await send({ amount: 70000 })).status, 503);
status = 200;
assert.equal((await send({ amount: 70000 })).status, 200);
assert.equal(writes.at(-1).body.patient.user_id, "owner");

await import("./verify-consultation-payment/index.ts");
writes = [];
user = "other";
assert.equal((await send(verification)).status, 403);
user = "owner";
assert.equal((await send({ ...verification, razorpay_signature: "invalid" })).status, 400);
payment.status = "authorized";
assert.equal((await send(verification)).status, 409);
assert.equal(writes.length, 0);
payment.status = "captured";
payment.currency = "USD";
assert.equal((await send(verification)).status, 400);
payment.currency = "INR";
assert.equal((await send(verification)).status, 500);
writeResult = [{ payment_status: "PAID_CONFIRMED" }];
assert.equal((await send({ ...verification, patient: { user_id: "other" } })).status, 200);
assert.equal(writes.at(-1).url.searchParams.get("patient->>user_id"), "eq.owner");
assert.equal(writes.at(-1).body.patient, undefined);

await import("./razorpay-webhook/index.ts");
const event = (name) => ({ event: name, payload: { payment: { entity: { ...payment, id: "pay_1" } } } });
const webhook = (name) => {
  const body = event(name);
  return send(body, { "x-razorpay-signature": hmac(env.RAZORPAY_WEBHOOK_SECRET, JSON.stringify(body)) });
};
writes = [];
assert.equal((await send(event("payment.captured"))).status, 400);
assert.equal((await webhook("payment.authorized")).status, 200);
assert.equal(writes.at(-1).body.payment_status, "CAPTURE_PENDING");
writes = [];
assert.equal((await webhook("payment.captured")).status, 200);
assert.equal((await webhook("payment.captured")).status, 200);
assert.equal(writes[0].method, "PATCH");
assert.equal(writes[0].body.patient, undefined);
assert.equal(writes[0].url.searchParams.get("payment_status"), "in.(ORDER_CREATED,AUTHORIZED,CAPTURE_PENDING,FAILED)");
assert.equal((await webhook("payment.failed")).status, 200);
assert.equal(writes.at(-1).url.searchParams.get("payment_status"), null);
assert.equal(writes.at(-1).url.searchParams.get("or"),
  "(payment_status.eq.ORDER_CREATED,and(payment_status.in.(AUTHORIZED,CAPTURE_PENDING),razorpay_payment_id.eq.pay_1))");
console.log("Consultation payment ownership, capture, failure and webhook tests passed.");
