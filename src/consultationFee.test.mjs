import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALLOWED_FEE_PAISE, GENERAL_FEE_RUPEES, SENIOR_FEE_RUPEES, SENIOR_MIN_AGE, VISIT_PAYMENT_PURPOSE, visitFeeRupees,
  consultationFeeRupees, consultationFeeTier, expectedFeePaise, feeSummary, isAllowedFeePaise, isSenior
} from "../supabase/functions/_shared/consultationFee.js";
import * as booking from "./booking.js";

// The agreed prices.
assert.equal(GENERAL_FEE_RUPEES, 800);
assert.equal(SENIOR_FEE_RUPEES, 600);
assert.equal(SENIOR_MIN_AGE, 60);
// A clinic visit booked in the app follows the same age rule.
for (const [age, rupees] of [[40, 800], [59, 800], [60, 600], [82, 600], [undefined, 800]]) assert.equal(visitFeeRupees(age), rupees, `visit age ${age}`);

// Online consultation: 60 and over pays Rs 600, everyone else Rs 800.
for (const [age, rupees] of [[0, 800], [1, 800], [18, 800], [40, 800], [59, 800], [60, 600], [61, 600], [75, 600], [100, 600]]) {
  assert.equal(consultationFeeRupees(age), rupees, `age ${age}`);
}
// Ages typed as text count the same way; an unknown or unreadable age pays the general fee.
assert.equal(consultationFeeRupees("60"), 600);
assert.equal(consultationFeeRupees(" 72 "), 600);
assert.equal(consultationFeeRupees("59"), 800);
for (const unknown of [undefined, null, "", "abc", NaN, -5, "unknown"]) assert.equal(consultationFeeRupees(unknown), 800, String(unknown));
assert.equal(isSenior(60), true);
assert.equal(isSenior(59), false);
assert.equal(consultationFeeTier(60), "senior");
assert.equal(consultationFeeTier(59), "general");

// What the server will accept, in paise.
assert.equal(expectedFeePaise({ age: 40 }), 80000);
assert.equal(expectedFeePaise({ age: 60 }), 60000);
assert.equal(expectedFeePaise({ purpose: "online_consultation", age: 70 }), 60000);
assert.equal(expectedFeePaise({}), 80000);
assert.equal(expectedFeePaise(), 80000);
assert.equal(expectedFeePaise({ purpose: VISIT_PAYMENT_PURPOSE, age: 70 }), 60000);
assert.equal(expectedFeePaise({ purpose: VISIT_PAYMENT_PURPOSE, age: 20 }), 80000);
assert.equal(expectedFeePaise({ purpose: VISIT_PAYMENT_PURPOSE }), 80000);

// Old Rs 700 visit orders still settle and refund; no new order is priced at it.
assert.deepEqual([...ALLOWED_FEE_PAISE].sort((a, b) => a - b), [60000, 70000, 80000]);
for (const age of [undefined, 20, 59, 60, 90]) for (const purpose of [undefined, VISIT_PAYMENT_PURPOSE]) assert.notEqual(expectedFeePaise({ purpose, age }), 70000);
for (const amount of [60000, 70000, 80000]) assert.equal(isAllowedFeePaise(amount), true);
for (const amount of [0, 100, 50000, 65000, 90000, "80000", null, undefined]) assert.equal(isAllowedFeePaise(amount), false, String(amount));

assert.equal(feeSummary(), "Rs 800, or Rs 600 for patients aged 60 and over");

// The booking module re-exports the same visit constants, so there is one source of truth.
assert.equal(booking.visitFeeRupees, visitFeeRupees);
assert.equal(booking.VISIT_PAYMENT_PURPOSE, VISIT_PAYMENT_PURPOSE);

// No price may be hard-coded anywhere else: the app and the functions must use the shared module.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
for (const file of ["../supabase/functions/create-consultation-order/index.ts", "../supabase/functions/verify-consultation-payment/index.ts",
  "../supabase/functions/razorpay-webhook/index.ts"]) {
  assert.doesNotMatch(read(file), /\b(60000|70000|80000)\b/, `${file} hard-codes a fee`);
  assert.match(read(file), /_shared\/consultationFee\.js/, `${file} must use the shared fee module`);
}
const app = read("./main.jsx");
assert.doesNotMatch(app, /ONLINE_CONSULTATION_FEE/, "main.jsx still uses the old fixed fee constant");
assert.doesNotMatch(app, /Rs 700|Rs 800|Rs 600|"700"|"800"|"600"/, "main.jsx hard-codes a fee");
assert.doesNotMatch(read("./booking.js"), /VISIT_FEE_RUPEES = \d/, "booking.js redefines the visit fee");
for (const file of ["./BookVisit.jsx", "./PatientTutorial.jsx"]) {
  assert.doesNotMatch(read(file), /(₹|Rs )\s*\d{3}/, `${file} hard-codes a fee`);
}

console.log("consultation fee tests passed");
