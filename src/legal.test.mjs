// Guards the published legal pages against drifting from what the app really does.
// Reads files only; never touches the network. Collects every failure and reports them together.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GENERAL_FEE_RUPEES, SENIOR_FEE_RUPEES, SENIOR_MIN_AGE, VISIT_FEE_RUPEES
} from "../supabase/functions/_shared/consultationFee.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

const OPERATOR = "Tanu Kansal, trading as Dr Ashwanis Family Clinic Diagnostic Centre";
const CONTACT_NAME = "Aaryan Kansal";
const CONTACT_EMAIL = "aaryankansal06@gmail.com";
const ADDRESS = "1st Floor, Shop Number 1011, Ace City Square Market, Ace City Road, Jalalpur, Greater Noida, Uttar Pradesh 203207, India";
const EFFECTIVE = "Effective 22 November 2026 (version 1.0)";

const PAGES = {
  "privacy.html": [
    "Who we are", "What we collect", "Why we use it", "What we never do", "Who receives it", "Where it is stored",
    "Who can see your records", "How long we keep it", "Your rights", "Children", "Security and breaches",
    "On your device", "Changes to this policy", "Contact and complaints"
  ],
  "terms.html": [
    "About the app", "Not for emergencies", "Medical advice", "Your account", "Payments and the consultation unlock",
    "Pricing and delivery", "Acceptable use", "Availability and changes", "Limits of liability", "Governing law", "Contact"
  ],
  "refunds.html": ["When you get a refund", "When you do not", "How to ask", "How long it takes"],
  "account-deletion.html": ["How to ask", "How we verify you", "What we delete", "What we keep and why", "How long it takes"],
  "about.html": ["About the clinic app", "Who runs it"],
  "contact.html": ["How to reach us", "Privacy requests and complaints"]
};
const IDENTITY_PAGES = ["privacy.html", "terms.html", "refunds.html", "about.html", "contact.html"];
const NAV = Object.keys(PAGES).map((name) => `/${name}`);

// Every recipient the privacy page must name, and how a host in the code maps to a name.
const MUST_NAME = ["Supabase", "Google", "Razorpay", "Cloudflare", "WhatsApp"];
const HOST_NAMES = [
  [/(^|\.)supabase\.co$/, "Supabase"],
  [/(^|\.)razorpay\.(com|me)$/, "Razorpay"],
  [/^wa\.me$/, "WhatsApp"],
  [/(^|\.)pages\.dev$/, "Cloudflare"],
  [/^maps\.app\.goo\.gl$/, "Google Maps"],
  [/(^|\.)ndhm\.gov\.in$/, "ABHA"]
];
const IGNORED_HOSTS = [/^localhost$/, /(^|\.)w3\.org$/, /(^|\.)schema\.org$/, /^127\.0\.0\.1$/];
const DISABLED_FUNCTIONS = ["clinic-ai-assistant"]; // exists in the repo, not deployed, not called
const TRACKER = /analytics|sentry|posthog|mixpanel|amplitude|crashlytics|firebase|gtag|segment|appsflyer|adjust|onesignal|admob|facebook/i;

// A private address that was removed from the app; the words are split so this file does not repeat it.
const REMOVED_ADDRESS_WORDS = [["La", "Resid" + "entia"], ["Tech", "Zone"]].map((words) => words.join(" "));
const PRICES = new Set([GENERAL_FEE_RUPEES, SENIOR_FEE_RUPEES, VISIT_FEE_RUPEES]);

const failures = [];
const check = (name, fn) => {
  try { fn(); } catch (error) { failures.push(`${name}: ${error.message}`); }
};
const need = (condition, message) => { if (!condition) throw new Error(message); };

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
const visible = (html) => decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const headings = (html) => [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => visible(m[1]));
const section = (html, heading) => {
  const parts = html.split(/<h2[^>]*>/i).slice(1);
  const found = parts.find((part) => visible(part.split(/<\/h2>/i)[0]) === heading);
  return found ? visible(found.split(/<\/h2>/i).slice(1).join(" ")) : "";
};
const walk = (dir, accept) => {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  const out = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel, accept));
    else if (accept(rel)) out.push(rel);
  }
  return out;
};

// 1. Files exist
check("files exist", () => {
  const needed = [...Object.keys(PAGES).map((p) => `public/${p}`), "public/legal.css", "docs/legal/DATA_INVENTORY.md",
    "docs/legal/PLAY_FORMS.md", "docs/legal/SOURCES.md", "docs/legal/DELETION_RUNBOOK.md"];
  const missing = needed.filter((rel) => !exists(rel));
  need(!missing.length, `missing ${missing.join(", ")}`);
});

const pages = Object.fromEntries(Object.keys(PAGES).filter((p) => exists(`public/${p}`)).map((p) => [p, read(`public/${p}`)]));

for (const [name, html] of Object.entries(pages)) {
  const text = visible(html);

  // 2. Page structure and CSP-safe markup
  check(`${name} structure`, () => {
    need(/<html lang="en">/i.test(html), 'missing <html lang="en">');
    need(/<title>[^<]+<\/title>/i.test(html), "missing <title>");
    need(/<meta name="viewport"/i.test(html), "missing viewport meta tag");
    need(/<link rel="stylesheet" href="\/legal\.css">/i.test(html), "missing /legal.css link");
    need(!/<script/i.test(html), "contains <script> (blocked by the CSP)");
    need(!/\sstyle=/i.test(html), "contains inline style attribute");
    need(!/<(img|iframe|link|script)[^>]+(src|href)="https?:\/\//i.test(html.replace(/<a [^>]*>/gi, "")), "loads an external resource");
    need(text.includes(EFFECTIVE), `missing "${EFFECTIVE}"`);
  });

  // 3. No placeholders, secrets, home address or phone numbers
  check(`${name} content hygiene`, () => {
    need(!/\b(TODO|TBD|lorem|XXX)\b/i.test(text), "contains placeholder text");
    need(!/\{\{|\}\}|example\.com/i.test(html), "contains a template marker or example.com");
    need(!REMOVED_ADDRESS_WORDS.some((words) => text.includes(words)), "contains an address that was removed from the app");
    // Every price on a page must be one the app really charges (read from the shared fee module).
    for (const match of text.matchAll(/\bRs ([\d,]+)/g)) {
      need(PRICES.has(Number(match[1].replace(/,/g, ""))), `states Rs ${match[1]}, which the app does not charge`);
    }
    need(!/acc_[A-Za-z0-9]{8,}|rzp_(live|test)_|sb_publishable_|service_role/i.test(html), "contains an account id or key");
    need(!/(\+?91[\s-]?)?[6-9]\d{9}\b|\+91[\s-]?\d{5}[\s-]?\d{5}/.test(text), "contains a phone number");
  });

  // 5. Required headings
  check(`${name} headings`, () => {
    const have = headings(html);
    const missing = PAGES[name].filter((h) => !have.includes(h));
    need(!missing.length, `missing <h2> ${missing.map((m) => `"${m}"`).join(", ")}`);
  });

  // 11. Links resolve
  check(`${name} links`, () => {
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"/gi)].map((m) => m[1]);
    for (const href of hrefs) {
      if (/^(mailto:|https:\/\/)/.test(href)) continue;
      const [target, fragment] = href.split("#");
      const file = target ? target.replace(/^\//, "") : name;
      need(exists(`public/${file}`), `broken link ${href}`);
      if (fragment) {
        const targetHtml = target ? read(`public/${file}`) : html;
        need(new RegExp(`id="${fragment}"`).test(targetHtml), `missing anchor #${fragment} in ${file}`);
      }
    }
    for (const nav of NAV) need(hrefs.includes(nav), `footer navigation lacks ${nav}`);
  });
}

// 4. Identity
for (const name of IDENTITY_PAGES.filter((p) => pages[p])) {
  check(`${name} identity`, () => {
    const text = visible(pages[name]);
    need(text.includes(OPERATOR), "missing the operator line");
    need(text.includes(CONTACT_NAME), "missing the contact name");
    need(pages[name].includes(CONTACT_EMAIL), "missing the contact email");
    need(text.includes(ADDRESS), "missing the address");
  });
}

// 6, 7. Privacy commitments and recipients
if (pages["privacy.html"]) {
  const privacy = pages["privacy.html"];
  check("privacy commitments", () => {
    const never = section(privacy, "What we never do");
    for (const phrase of ["We do not sell", "advertising", "analytics", "train", "marketing"]) {
      need(never.includes(phrase), `"What we never do" lacks "${phrase}"`);
    }
  });
  check("privacy recipients named", () => {
    const receives = section(privacy, "Who receives it");
    for (const name of MUST_NAME) need(receives.includes(name), `"Who receives it" lacks ${name}`);
  });
  check("privacy complaint timing", () => {
    need(visible(privacy).includes("48 hours"), 'missing "48 hours"');
    need(visible(privacy).includes("one month"), 'missing "one month"');
  });
  check("privacy covers both kinds of payment", () => {
    need(/clinic visit/i.test(visible(privacy)), "does not mention clinic visit payments");
  });
  check("privacy states stored outside India", () => {
    const stored = section(privacy, "Where it is stored");
    need(/South Korea|Seoul/.test(stored), "does not say the data is stored in South Korea (Seoul)");
    need(/outside India/i.test(stored), 'does not say "outside India"');
  });
}
if (pages["terms.html"]) {
  check("terms pricing and delivery", () => {
    const t = visible(pages["terms.html"]);
    for (const rupees of [GENERAL_FEE_RUPEES, SENIOR_FEE_RUPEES, VISIT_FEE_RUPEES]) need(t.includes(`Rs ${rupees}`), `missing "Rs ${rupees}"`);
    need(t.includes(`aged ${SENIOR_MIN_AGE} and over`), `missing "aged ${SENIOR_MIN_AGE} and over"`);
    need(/no physical goods/i.test(t), 'missing "no physical goods"');
    need(/id="pricing-delivery"/.test(pages["terms.html"]), 'missing id="pricing-delivery"');
  });
}
if (pages["refunds.html"]) {
  check("refunds state both fees", () => {
    const t = visible(pages["refunds.html"]);
    for (const rupees of [GENERAL_FEE_RUPEES, SENIOR_FEE_RUPEES, VISIT_FEE_RUPEES]) need(t.includes(`Rs ${rupees}`), `missing "Rs ${rupees}"`);
    need(/clinic visit/i.test(t), 'does not mention the clinic visit fee');
  });
}
if (pages["contact.html"]) {
  check("contact 48 hours", () => need(visible(pages["contact.html"]).includes("48 hours"), 'missing "48 hours"'));
}

// 7. Every host in the code is a named recipient
check("code hosts are named recipients", () => {
  const files = [
    ...walk("src", (f) => /\.(js|jsx)$/.test(f) && !/\.test\./.test(f)),
    ...walk("supabase/functions", (f) => f.endsWith(".ts") && !/\.test\./.test(f) && !DISABLED_FUNCTIONS.some((d) => f.includes(`/${d}/`)))
  ];
  const privacy = pages["privacy.html"] ? visible(pages["privacy.html"]) : "";
  const unknown = new Set();
  const unnamed = new Set();
  for (const file of files) {
    for (const m of read(file).matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,}|localhost)/gi)) {
      const host = m[1].toLowerCase();
      if (IGNORED_HOSTS.some((re) => re.test(host))) continue;
      const mapped = HOST_NAMES.find(([re]) => re.test(host));
      if (!mapped) unknown.add(`${host} (${file})`);
      else if (!privacy.includes(mapped[1])) unnamed.add(mapped[1]);
    }
  }
  need(!unknown.size, `host not covered by the policy: ${[...unknown].join(", ")}`);
  need(!unnamed.size, `privacy page does not name: ${[...unnamed].join(", ")}`);
});

// 8. No AI call
check("no AI call from the app", () => {
  const hits = walk("src", (f) => /\.(js|jsx)$/.test(f) && !/\.test\./.test(f)).filter((f) => /clinic-ai-assistant|openai/i.test(read(f)));
  need(!hits.length, `AI reference in ${hits.join(", ")}; update the policy before enabling it`);
});

// 9. No trackers
check("no tracking or advertising packages", () => {
  const pkg = JSON.parse(read("package.json"));
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const hits = names.filter((n) => TRACKER.test(n));
  need(!hits.length, `tracker-like dependency: ${hits.join(", ")}; update the policy and Play forms first`);
});

// 10. Every table is in the data inventory
check("every table is in the data inventory", () => {
  if (!exists("docs/legal/DATA_INVENTORY.md")) throw new Error("DATA_INVENTORY.md missing");
  const inventory = read("docs/legal/DATA_INVENTORY.md");
  const tables = new Set();
  for (const file of walk("supabase/migrations", (f) => f.endsWith(".sql"))) {
    for (const m of read(file).matchAll(/create table (?:if not exists )?public\.([a-z_]+)/gi)) tables.add(m[1]);
  }
  const missing = [...tables].filter((t) => !inventory.includes(`\`${t}\``));
  need(!missing.length, `not in DATA_INVENTORY.md: ${missing.join(", ")}`);
});

// 12. In-app wiring
check("app links to the legal pages", () => {
  const app = read("src/main.jsx");
  const missing = ["privacy.html", "terms.html", "refunds.html", "account-deletion.html"].filter((p) => !app.includes(p));
  need(!missing.length, `main.jsx does not reference ${missing.join(", ")}`);
});

// Stylesheet basics
check("stylesheet", () => {
  if (!exists("public/legal.css")) throw new Error("missing");
  const css = read("public/legal.css");
  need(/prefers-color-scheme:\s*dark/.test(css), "no dark mode");
  need(/@media print/.test(css), "no print styles");
  need(!/@import|url\(\s*["']?https?:/.test(css), "loads an external resource");
});

if (failures.length) {
  console.error(`legal tests failed (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("legal tests passed");
