import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTermIndex } from "./termSearch.js";

const rows = JSON.parse(readFileSync(new URL("./data/terms.seed.json", import.meta.url), "utf8"));
const idx = createTermIndex(rows);
assert.ok(idx.size > 1000);

const first = (q, o) => idx.search(q, o)[0]?.display;
assert.equal(first("fever", { types: ["symptom"] }), "Fever");
assert.equal(first("bukhar"), "Fever");                      // doctors' wording via synonym
assert.equal(first("htn", { types: ["diagnosis"] }), "Essential hypertension");
assert.equal(first("hba1c"), "HbA1c");
assert.equal(first("cbc", { types: ["lab_panel", "lab_test"] }), "Complete blood count (CBC)");
assert.equal(first("diabetes", { types: ["diagnosis"] }).includes("diabetes"), true);
assert.ok(idx.search("diabetis", { types: ["diagnosis"] }).length > 0);   // fuzzy: typo still finds something
assert.equal(idx.search("zzzqqq").length, 0);
assert.equal(idx.search("").length, 0);

// Ranking: usage count outranks match quality.
const usage = new Map([[idx.search("fever with chills")[0].id, { count: 5, last: 1 }]]);
assert.equal(first("fever", { types: ["symptom"], usage }), "Fever with chills");
assert.deepEqual(idx.frequent(["symptom"], usage).map((t) => t.display), ["Fever with chills"]);
assert.deepEqual(idx.frequent(["finding"], usage), []);       // filtered by type

// Speed: well under 200 ms for a search over the whole dictionary.
const t0 = performance.now();
for (let i = 0; i < 50; i++) idx.search("abdom");
assert.ok((performance.now() - t0) / 50 < 20, "search should take a few ms");
console.log("termSearch tests passed");
