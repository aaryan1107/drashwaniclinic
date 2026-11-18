import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";

export const TYPE_LABEL = { symptom: "Symptom", diagnosis: "Diagnosis", finding: "Finding", lab_test: "Test", lab_panel: "Panel", medicine: "Medicine" };

export function TypeTag({ type }) {
  return <span className={`vt-tag vt-tag-${type.startsWith("hx_") ? "hx" : type}`}>{TYPE_LABEL[type] || (type.startsWith("hx_") ? "Suggested" : type)}</span>;
}

// Shared search for every visit section. Multi-select: toggling edits a pending list; Save commits it,
// Back discards. Free text is always allowed so unknown wording can be saved.
//   index: createTermIndex(...)   usage: Map(termId -> {count,last})   types: term types searched
//   value: committed items [{kind, term_id, free_text, display}]   kind: item kind for new picks
export function TermSearch({ title, index, usage, types, kind, freeType, value, onSave, onBack, showCodeToggle }) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(value);
  const [showCodes, setShowCodes] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(text), 120);
    return () => clearTimeout(t);
  }, [text]);

  const results = useMemo(() => (query.trim() ? index.search(query, { types, usage, limit: 30 }) : []), [index, query, types, usage]);
  const frequent = useMemo(() => index.frequent(types, usage, 8), [index, types, usage]);

  const keyOf = (i) => i.term_id || `free:${(i.free_text || "").toLowerCase()}`;
  const has = (key) => pending.some((i) => keyOf(i) === key);
  const toggle = (item) => setPending((cur) => (cur.some((i) => keyOf(i) === keyOf(item)) ? cur.filter((i) => keyOf(i) !== keyOf(item)) : [...cur, item]));
  const termItem = (t) => ({ kind, term_id: t.id, display: t.display, type: t.type, code: t.code || "" });
  const freeItem = (s) => ({ kind, free_text: s.trim(), display: s.trim(), type: freeType || types[0] });
  const typed = text.trim();
  const exact = results.some((t) => t.display.toLowerCase() === typed.toLowerCase());

  const add = (item) => { toggle(item); setText(""); setQuery(""); inputRef.current?.focus(); };

  return (
    <div className="vt-panel" role="region" aria-label={title}>
      <div className="vt-search">
        <Search size={18} aria-hidden="true" />
        <label className="vt-sr" htmlFor="vt-q">Search {title}</label>
        <input id="vt-q" ref={inputRef} autoFocus value={text} onChange={(e) => setText(e.target.value)}
          placeholder={`Search ${title.toLowerCase()}`} autoComplete="off" enterKeyHint="search" />
        {text && <button type="button" className="vt-icon" aria-label="Clear search text" onClick={() => { setText(""); setQuery(""); inputRef.current?.focus(); }}><X size={18} /></button>}
      </div>

      {showCodeToggle && (
        <label className="vt-switch"><input type="checkbox" checked={showCodes} onChange={(e) => setShowCodes(e.target.checked)} /> Show ICD-10 codes (optional)</label>
      )}

      {pending.length > 0 && (
        <div className="vt-chips" aria-label="Selected">
          {pending.map((i) => (
            <button type="button" key={keyOf(i)} className="vt-chip vt-chip-on" onClick={() => toggle(i)} aria-label={`Remove ${i.display}`}>
              <Check size={14} /> {i.display} <X size={14} />
            </button>
          ))}
        </div>
      )}

      {!typed && (
        <section aria-label="Frequently used by you">
          <h4 className="vt-h">Frequently used by you</h4>
          {frequent.length ? (
            <div className="vt-chips">
              {frequent.map((t) => (
                <button type="button" key={t.id} className={`vt-chip${has(t.id) ? " vt-chip-on" : ""}`} onClick={() => toggle(termItem(t))}>{t.display}</button>
              ))}
            </div>
          ) : <p className="vt-empty">Terms you pick will appear here for one-tap reuse. Start typing to search.</p>}
        </section>
      )}

      {typed && (
        <ul className="vt-results" aria-label="Search results">
          {results.map((t) => (
            <li key={t.id}>
              <button type="button" className={`vt-row${has(t.id) ? " vt-row-on" : ""}`} onClick={() => add(termItem(t))}>
                <span className="vt-row-main">{t.display}{showCodes && t.code ? <em className="vt-code"> {t.code}</em> : null}</span>
                <TypeTag type={t.type} />
                {has(t.id) ? <Check size={18} aria-label="Selected" /> : <Plus size={18} aria-hidden="true" />}
              </button>
            </li>
          ))}
          {!exact && (
            <li>
              <button type="button" className="vt-row vt-row-free" onClick={() => add(freeItem(typed))}>
                <span className="vt-row-main">Add “{typed}” as typed</span><Plus size={18} aria-hidden="true" />
              </button>
            </li>
          )}
          {!results.length && query === text && <li className="vt-empty">No dictionary match. You can add it as typed.</li>}
        </ul>
      )}

      <div className="vt-footer">
        <button type="button" className="secondary-button" onClick={() => { setText(""); setQuery(""); setPending([]); }} disabled={!text && !pending.length}>Clear</button>
        <button type="button" className="secondary-button" onClick={onBack}>Back</button>
        <button type="button" className="primary-button" onClick={() => onSave(pending)}>Save{pending.length ? ` (${pending.length})` : ""}</button>
      </div>
    </div>
  );
}
