import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

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
  order_id: "order_1", razorpay_order_id: "order_1", razorpay_payment_id: "pay_1",
  razorpay_signature: hmac(env.RAZORPAY_KEY_SECRET, "order_1|pay_1"),
};

let user = "owner";
let writes = [];
let writeResult = [];
let status = 200;
let providerOrderStatus = 200;
let providerOrderBody;
let eventLog = [];
let eventLogStatus = 200;
const handledEvents = new Set();
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  if (url.pathname === "/auth/v1/user") return Response.json({ id: user });
  if (url.pathname === "/v1/orders") {
    providerOrderBody = JSON.parse(options.body);
    return Response.json(order, { status: providerOrderStatus });
  }
  if (url.pathname.startsWith("/v1/orders/")) return Response.json(order);
  if (url.pathname.startsWith("/v1/payments")) return Response.json(payment);
  if (url.pathname === "/rest/v1/razorpay_webhook_events") {
    if (eventLogStatus !== 200) return new Response("unavailable", { status: eventLogStatus });
    if (!options.method) {
      const id = url.searchParams.get("event_id").slice(3);
      assert.equal(url.searchParams.get("outcome"), "in.(applied,no_change,ignored)");
      return Response.json(handledEvents.has(id) ? [{ id: 1 }] : []);
    }
    const row = JSON.parse(options.body);
    eventLog.push({ url, row, prefer: options.headers.Prefer });
    if (row.event_id && ["applied", "no_change", "ignored"].includes(row.outcome)) handledEvents.add(row.event_id);
    return new Response(null, { status: 201 });
  }
  assert.equal(url.pathname, "/rest/v1/consultation_payments");
  writes.push({ url, method: options.method, body: JSON.parse(options.body) });
  return Response.json(writeResult, { status });
};

await import("./create-consultation-order/index.ts");
assert.equal((await send({ amount: 99 })).status, 400);
assert.equal((await send({ amount: 100 })).status, 400);
assert.equal((await send({ amount: 70000, currency: "USD" })).status, 400);
assert.equal((await send({ amount: 70000, receipt: "x".repeat(41) })).status, 400);
assert.equal((await send({ amount: 70000 }, { Authorization: "" })).status, 401);
providerOrderStatus = 503;
assert.equal((await send({ amount: 70000 })).status, 500);
providerOrderStatus = 200;
status = 503;
assert.equal((await send({ amount: 70000 })).status, 503);
status = 200;
assert.equal((await send({ amount: 70000, receipt: "clinic-test-1" })).status, 200);
assert.equal(providerOrderBody.receipt, "clinic-test-1");
assert.equal(writes.at(-1).body.patient.user_id, "owner");

await import("./verify-consultation-payment/index.ts");
writes = [];
assert.equal((await send({ ...verification, razorpay_order_id: undefined })).status, 400);
assert.equal((await send({ ...verification, razorpay_order_id: "order_other" })).status, 400);
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


const { WEBHOOK_EVENTS } = await import("./razorpay-webhook/index.ts");
const event = (name, entities = {}) => ({
  event: name, payload: { payment: { entity: { ...payment, id: "pay_1" } }, ...entities },
});
let eventCounter = 0;
const signedSend = (body, eventId = `evt_${++eventCounter}`) => send(body, {
  "x-razorpay-signature": hmac(env.RAZORPAY_WEBHOOK_SECRET, JSON.stringify(body)),
  ...(eventId ? { "x-razorpay-event-id": eventId } : {}),
});
const webhook = (name, eventId) => signedSend(event(name), eventId);
const lastLog = () => eventLog.at(-1).row;

// Signature: unsigned and wrongly signed bodies never touch the database.
writes = [];
assert.equal((await send(event("payment.captured"))).status, 400);
assert.equal((await send(event("payment.captured"), { "x-razorpay-signature": hmac("wrong", "x") })).status, 400);
assert.equal(writes.length + eventLog.length, 0);

// payment.authorized -> CAPTURE_PENDING, only over earlier states.
writeResult = [{ payment_status: "CAPTURE_PENDING" }];
assert.equal((await webhook("payment.authorized")).status, 200);
assert.equal(writes.at(-1).body.payment_status, "CAPTURE_PENDING");
assert.equal(writes.at(-1).url.searchParams.get("payment_status"), "in.(ORDER_CREATED,AUTHORIZED,FAILED)");
assert.equal(lastLog().outcome, "applied");
assert.equal(lastLog().payment_status, "CAPTURE_PENDING");

// payment.captured -> PAID_CONFIRMED; a replay is a no-op PATCH, never a downgrade.
writes = [];
writeResult = [{ payment_status: "PAID_CONFIRMED" }];
assert.equal((await webhook("payment.captured")).status, 200);
writeResult = [];
const replay = await webhook("payment.captured");
assert.equal(replay.status, 200);
assert.equal((await replay.json()).matched, false);
assert.equal(lastLog().outcome, "no_change");
assert.equal(writes[0].method, "PATCH");
assert.equal(writes[0].body.patient, undefined);
assert.equal(writes[0].body.verified_at !== undefined, true);
assert.equal(writes[0].url.searchParams.get("payment_status"), "in.(ORDER_CREATED,AUTHORIZED,CAPTURE_PENDING,FAILED)");
assert.equal(writes[0].url.searchParams.get("select"), "payment_status");

// payment.failed is scoped to ORDER_CREATED or the same payment's authorization.
assert.equal((await webhook("payment.failed")).status, 200);
assert.equal(writes.at(-1).url.searchParams.get("payment_status"), null);
assert.equal(writes.at(-1).url.searchParams.get("or"),
  "(payment_status.eq.ORDER_CREATED,and(payment_status.in.(AUTHORIZED,CAPTURE_PENDING),razorpay_payment_id.eq.pay_1))");

// order.paid takes the amount from the order entity and is held to the Rs 700 / INR fee.
writes = [];
writeResult = [{ payment_status: "PAID_CONFIRMED" }];
assert.equal((await signedSend(event("order.paid", { order: { entity: { ...order, amount_paid: 70000 } } }))).status, 200);
assert.equal(writes.at(-1).body.payment_status, "PAID_CONFIRMED");
assert.equal(writes.at(-1).body.amount, 70000);
assert.equal(writes.at(-1).url.searchParams.get("razorpay_order_id"), "eq.order_1");
writes = [];
assert.equal((await signedSend(event("order.paid", { order: { entity: { ...order, amount_paid: 100 } } }))).status, 400);
assert.equal(writes.length, 0);
assert.equal(lastLog().outcome, "rejected_amount");
payment.currency = "USD";
assert.equal((await webhook("payment.captured")).status, 400);
payment.currency = "INR";
assert.equal(writes.length, 0);

// Idempotency: a retry of an already-handled event ID is skipped without a PATCH.
writes = [];
assert.equal((await webhook("payment.captured", "evt_retry")).status, 200);
assert.equal(writes.length, 1);
assert.deepEqual(eventLog.at(-1).url.searchParams.get("on_conflict"), "event_id");
assert.match(eventLog.at(-1).prefer, /merge-duplicates/);
const retried = await webhook("payment.captured", "evt_retry");
assert.equal((await retried.json()).duplicate, true);
assert.equal(writes.length, 1);
// ...but a delivery that failed to save is processed again on retry.
status = 503;
assert.equal((await webhook("payment.captured", "evt_flaky")).status, 500);
assert.equal(lastLog().outcome, "error");
status = 200;
assert.equal((await webhook("payment.captured", "evt_flaky")).status, 200);
assert.equal(lastLog().outcome, "applied");
// Events without an ID header are still processed and logged, just not deduplicated.
assert.equal((await webhook("payment.captured", null)).status, 200);
assert.equal(lastLog().event_id, null);
assert.equal(eventLog.at(-1).url.searchParams.get("on_conflict"), null);
// The audit log is best effort: if its table is missing the payment row is still updated.
eventLogStatus = 404;
writes = [];
assert.equal((await webhook("payment.captured", "evt_no_table")).status, 200);
assert.equal(writes.length, 1);
eventLogStatus = 200;

// refund.processed: a full refund revokes the consultation for that payment only.
const refundEvent = (amountRefunded, refundStatus) => event("refund.processed", {
  payment: { entity: { ...payment, id: "pay_1", amount_refunded: amountRefunded, refund_status: refundStatus } },
  refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: amountRefunded, currency: "INR" } },
});
writes = [];
writeResult = [{ payment_status: "REFUNDED" }];
assert.equal((await signedSend(refundEvent(70000, "full"))).status, 200);
let refundWrite = writes.at(-1);
assert.equal(refundWrite.body.payment_status, "REFUNDED");
assert.equal(refundWrite.body.amount_refunded, 70000);
assert.equal(refundWrite.body.refunded_at !== undefined, true);
assert.equal(refundWrite.body.amount, undefined);
assert.equal(refundWrite.url.searchParams.get("razorpay_payment_id"), "eq.pay_1");
assert.equal(refundWrite.url.searchParams.get("payment_status"), "in.(AUTHORIZED,CAPTURE_PENDING,PAID_CONFIRMED,FAILED)");
assert.equal(refundWrite.url.searchParams.get("or"), "(amount_refunded.is.null,amount_refunded.lt.70000)");
assert.equal(lastLog().razorpay_refund_id, "rfnd_1");
assert.equal(lastLog().payment_status, "REFUNDED");
// A partial refund records the amount but keeps the consultation unlocked.
writeResult = [{ payment_status: "PAID_CONFIRMED" }];
assert.equal((await signedSend(refundEvent(20000, "partial"))).status, 200);
refundWrite = writes.at(-1);
assert.equal(refundWrite.body.payment_status, undefined);
assert.equal(refundWrite.body.amount_refunded, 20000);
assert.equal(refundWrite.url.searchParams.get("or"), "(amount_refunded.is.null,amount_refunded.lt.20000)");
// A refund of a payment that is not the clinic fee is rejected.
writes = [];
payment.amount = 50000;
assert.equal((await signedSend(refundEvent(50000, "full"))).status, 400);
payment.amount = 70000;
assert.equal(writes.length, 0);
// PAID_CONFIRMED can never be written over REFUNDED.
assert.equal(priorStatesFrom("PAID_CONFIRMED").includes("REFUNDED"), false);
assert.equal(priorStatesFrom("CAPTURE_PENDING").includes("REFUNDED"), false);

// Audit-only events: acknowledged and logged, no payment row change.
for (const name of ["refund.created", "refund.failed", "payment.dispute.created", "payment.dispute.won",
  "payment.dispute.lost", "payment.dispute.closed"]) {
  writes = [];
  const extra = name.startsWith("refund")
    ? { refund: { entity: { id: "rfnd_2", payment_id: "pay_1", amount: 70000, currency: "INR" } } }
    : { dispute: { entity: { id: "disp_1", payment_id: "pay_1", amount: 70000, currency: "INR" } } };
  const response = await signedSend(event(name, extra));
  assert.equal(response.status, 200, name);
  assert.equal((await response.json()).handled, false, name);
  assert.equal(writes.length, 0, name);
  assert.equal(lastLog().event, name);
  assert.equal(lastLog().outcome, "ignored");
}
// Events with no order are ignored but still logged.
assert.equal((await signedSend({ event: "payment.downtime.started", payload: {} })).status, 200);
assert.equal(lastLog().outcome, "ignored");
assert.equal(lastLog().razorpay_order_id, null);

// Every subscribed event gets a 200 for a valid fee payment, so Razorpay never disables the hook.
writeResult = [{ payment_status: "PAID_CONFIRMED" }];
for (const name of WEBHOOK_EVENTS) {
  const extra = name === "order.paid" ? { order: { entity: { ...order, amount_paid: 70000 } } }
    : name === "refund.processed" ? refundEvent(70000, "full").payload : {};
  const response = await signedSend(event(name, extra));
  assert.equal(response.status, 200, name);
}
// The audit log never stores payer notes or contact details.
for (const { row } of eventLog) {
  assert.deepEqual(Object.keys(row).sort(), ["amount", "currency", "event", "event_id", "outcome", "payment_status",
    "razorpay_order_id", "razorpay_payment_id", "razorpay_refund_id"]);
}

function priorStatesFrom(target) {
  return readFileSync(new URL("./razorpay-webhook/index.ts", import.meta.url), "utf8")
    .match(new RegExp(`${target}: "([^"]*)"`))[1].split(",");
}
console.log("Consultation payment ownership, capture, failure, refund, audit-log and webhook tests passed.");
