// Offline term search. Pure functions: no React, no network. Runs against the bundled seed index
// (src/data/terms.seed.json, built by scripts/build-seed.mjs) plus any doctor-added terms.

export const TERM_TYPES = ["symptom", "diagnosis", "finding", "lab_test", "lab_panel", "medicine"];

export const normalize = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+ ]+/g, " ").replace(/\s+/g, " ").trim();

const trigrams = (s) => {
  const p = `  ${s} `;
  const out = new Set();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
};

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

// Rows are the compact seed form [id, type, code_system, code, display, synonyms[]].
export function rowToTerm(row) {
  const [id, type, code_system, code, display, synonyms] = row;
  return { id, type, code_system, code, display, synonyms: synonyms || [] };
}

function prepare(term) {
  const display = normalize(term.display);
  const syns = term.synonyms.map(normalize).filter(Boolean);
  return { term, display, syns, code: normalize(term.code), tri: trigrams(display) };
}

// How well one prepared term matches a normalised query. 0 = no match.
export function matchQuality(p, q, tokens) {
  if (!q) return 0;
  if (p.display === q) return 100;
  if (p.syns.includes(q) || (p.code && p.code === q)) return 95;
  if (p.display.startsWith(q)) return 90;
  if (p.syns.some((s) => s.startsWith(q))) return 78;
  const words = p.display.split(" ");
  if (words.some((w) => w.startsWith(q))) return 82;
  if (p.syns.some((s) => s.split(" ").some((w) => w.startsWith(q)))) return 58;
  if (p.code && p.code.startsWith(q)) return 55;
  if (tokens.length > 1) {
    const hay = [p.display, ...p.syns].join(" ");
    if (tokens.every((t) => hay.includes(t))) return 50;
  }
  if (q.length >= 3 && p.display.includes(q)) return 40;
  if (q.length >= 3 && p.syns.some((s) => s.includes(q))) return 32;
  if (q.length >= 4) {
    const sim = Math.max(similarity(trigrams(q), p.tri), ...p.syns.map((s) => similarity(trigrams(q), trigrams(s))));
    if (sim >= 0.34) return Math.round(10 + sim * 25);
  }
  return 0;
}

export function createTermIndex(rows, extra = []) {
  const prepared = [...rows.map(rowToTerm), ...extra].map(prepare);
  const byId = new Map(prepared.map((p) => [p.term.id, p.term]));

  // usage: Map id -> { count, last }. Ranking: (1) doctor's usage count, (2) match quality, (3) alphabetical.
  function search(query, { types, limit = 25, usage = new Map() } = {}) {
    const q = normalize(query);
    if (!q) return [];
    const tokens = q.split(" ");
    const typeSet = types ? new Set(types) : null;
    const hits = [];
    for (const p of prepared) {
      if (typeSet && !typeSet.has(p.term.type)) continue;
      const quality = matchQuality(p, q, tokens);
      if (quality > 0) hits.push({ term: p.term, quality, count: usage.get(p.term.id)?.count || 0 });
    }
    hits.sort((a, b) => b.count - a.count || b.quality - a.quality || a.term.display.localeCompare(b.term.display));
    return hits.slice(0, limit).map((h) => h.term);
  }

  function frequent(types, usage = new Map(), n = 8) {
    const typeSet = types ? new Set(types) : null;
    return [...usage.entries()]
      .filter(([id, u]) => u.count > 0 && byId.has(id) && (!typeSet || typeSet.has(byId.get(id).type)))
      .sort((a, b) => b[1].count - a[1].count || (b[1].last || 0) - (a[1].last || 0))
      .slice(0, n)
      .map(([id]) => byId.get(id));
  }

  return { search, frequent, byId, size: prepared.length };
}
