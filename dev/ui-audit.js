// Dev-only layout audit: import('/dev/ui-audit.js').then((m) => m.default()) in the browser console. Reports horizontal overflow, small tap targets, clipped or tiny text, misaligned checkboxes and uneven rows.
export default function audit() { return (() => {
  const vw = window.innerWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; };
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}${el.textContent ? ` "${el.textContent.trim().replace(/\s+/g, " ").slice(0, 28)}"` : ""}`;
  const out = { overflowX: [], small: [], clipped: [], tiny: [], align: [], rowMismatch: [] };
  if (document.documentElement.scrollWidth > vw + 1) out.overflowX.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
  const all = [...document.querySelectorAll("body *")].filter(vis);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && !el.closest("[aria-hidden=true]") && getComputedStyle(el).position !== "fixed") out.overflowX.push(`${label(el)} right=${Math.round(r.right)}`);
  }
  const interactive = all.filter((el) => el.matches("button, a[href], select, textarea, input:not([type=hidden]), [role=radio], [role=checkbox], [role=button], [role=tab]"));
  for (const el of interactive) {
    let target = el;
    if (el.matches("input[type=checkbox], input[type=radio]")) target = el.closest("label") || el;
    const r = target.getBoundingClientRect();
    if (r.height < 43.5 || (r.width < 43.5 && !el.matches("input[type=checkbox],input[type=radio]"))) out.small.push(`${label(target)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const el of all) {
    const cs = getComputedStyle(el);
    if ((cs.overflow !== "visible" || cs.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && el.children.length === 0 && el.textContent.trim()) out.clipped.push(`${label(el)} ${el.scrollWidth}>${el.clientWidth}`);
    const fs = parseFloat(cs.fontSize);
    if (fs < 11.5 && el.children.length === 0 && el.textContent.trim()) out.tiny.push(`${label(el)} ${fs}px`);
  }
  for (const input of all.filter((el) => el.matches("input[type=checkbox], input[type=radio]"))) {
    const lab = input.closest("label"); if (!lab) continue;
    const ir = input.getBoundingClientRect(); const lr = lab.getBoundingClientRect();
    const txt = [...lab.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()) || lab.querySelector("span");
    if (!txt) continue;
    const range = document.createRange(); range.selectNodeContents(txt.nodeType === 3 ? txt : txt);
    const tr = range.getBoundingClientRect();
    const d = Math.abs((ir.top + ir.height / 2) - (tr.top + tr.height / 2));
    if (d > 4 && input.offsetWidth > 2) out.align.push(`${label(lab)} off by ${Math.round(d)}px`);
  }
  for (const row of document.querySelectorAll(".two-col, .vt-grid2, .bk-days, .doctor-stats")) {
    if (!vis(row)) continue;
    const kids = [...row.children].filter(vis).map((k) => Math.round(k.getBoundingClientRect().height));
    const tops = [...row.children].filter(vis).map((k) => Math.round(k.getBoundingClientRect().top));
    if (kids.length > 1 && new Set(tops).size === 1 && Math.max(...kids) - Math.min(...kids) > 6) out.rowMismatch.push(`${label(row)} heights ${kids.join("/")}`);
  }
  const dedupe = (a) => [...new Set(a)].slice(0, 14);
  for (const k of Object.keys(out)) out[k] = dedupe(out[k]);
  return JSON.stringify(out, null, 1);
})(); }
