"use client";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components/Icon";

export { Icon };

export interface PaletteItem {
  id: string;
  label: string;
  icon: ReactNode;
  hint?: string;
  /** extra words that should find this item but aren't shown (a website's address, say) */
  keywords?: string;
  /** Shift+Enter copies this (a website's address) instead of running the item */
  copy?: string;
  run: () => void;
}

export interface PaletteSection {
  title: string;
  items: PaletteItem[];
  /** only shown while the query is empty */
  emptyQueryOnly?: boolean;
  /** only shown once the user has typed something */
  queryOnly?: boolean;
  /** most rows shown while typing (the best matches win) */
  limit?: number;
}

/**
 * How well `q` matches `text`: 0 = not at all. Whole match > starts with >
 * a word starts with > anywhere > first letters of words > a near miss.
 * Also returns which letters matched, for highlighting.
 */
export function scoreMatch(text: string, q: string): { score: number; hits: number[] } {
  const t = text.toLowerCase();
  if (!q) return { score: 1, hits: [] };
  const span = (from: number) => Array.from({ length: q.length }, (_, i) => from + i);
  if (t === q) return { score: 100, hits: span(0) };
  if (t.startsWith(q)) return { score: 80, hits: span(0) };
  const word = t.search(new RegExp(`(^|[\\s\\-_./:(])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  if (word >= 0) return { score: 60, hits: span(word + 1) }; // (starting at 0 was caught above)
  const at = t.indexOf(q);
  if (at >= 0) return { score: 40, hits: span(at) };
  const letters = Array.from(q).filter((ch) => ch !== " ");
  if (letters.length < 2) return { score: 0, hits: [] };
  // first letters of words ("nf" finds "New folder")
  const starts: number[] = [];
  for (let i = 0; i < t.length; i++) if (/[a-z0-9]/.test(t[i]) && (i === 0 || !/[a-z0-9]/.test(t[i - 1]))) starts.push(i);
  let w = 0;
  const initials: number[] = [];
  for (const ch of letters) {
    while (w < starts.length && t[starts[w]] !== ch) w++;
    if (w >= starts.length) break;
    initials.push(starts[w++]);
  }
  if (initials.length === letters.length) return { score: 35, hits: initials };
  // otherwise letters in order, but only when they sit close together (a typo or a missed letter)
  const hits: number[] = [];
  let from = 0;
  for (const ch of letters) {
    const i = t.indexOf(ch, from);
    if (i < 0) return { score: 0, hits: [] };
    hits.push(i);
    from = i + 1;
  }
  const gaps = hits[hits.length - 1] - hits[0] + 1 - hits.length;
  if (gaps > Math.floor(letters.length / 3)) return { score: 0, hits: [] };
  return { score: 25 - gaps * 3, hits };
}

function Highlight({ text, hits }: { text: string; hits: number[] }) {
  if (!hits.length) return <>{text}</>;
  const set = new Set(hits);
  const out: ReactNode[] = [];
  let run = "";
  let on = false;
  const flush = (i: number) => {
    if (!run) return;
    out.push(on ? <mark key={i}>{run}</mark> : run);
    run = "";
  };
  // hits are string positions (not characters), so walk the string the same way
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    if (hit !== on) { flush(i); on = hit; }
    run += text[i];
  }
  flush(text.length);
  return <>{out}</>;
}

type Ranked = PaletteItem & { hits: number[]; score: number };

export default function CommandPalette({
  onClose,
  chipLabel,
  status,
  shortcuts,
  sections,
  onCopied,
}: {
  onClose: () => void;
  chipLabel: string;
  status: { title: string; sub: string; online: boolean; run: () => void };
  shortcuts: PaletteItem[];
  sections: PaletteSection[];
  onCopied?: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // the mouse only picks a row once it actually moves, so a resting pointer can't fight the arrow keys
  const mouseMoved = useRef(false);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = sections
      .filter((s) => (q ? !s.emptyQueryOnly : !s.queryOnly))
      .map((s) => {
        if (!q) return { ...s, best: 0, items: s.items.map((i) => ({ ...i, hits: [], score: 1 }) as Ranked) };
        const items = s.items
          .map((i): Ranked => {
            const own = scoreMatch(i.label, q);
            const extra = Math.max(i.hint ? scoreMatch(i.hint, q).score : 0, i.keywords ? scoreMatch(i.keywords, q).score : 0);
            // a match on the name beats one on the folder or address
            return own.score >= extra ? { ...i, hits: own.hits, score: own.score } : { ...i, hits: [], score: extra * 0.6 };
          })
          .filter((i) => i.score > 0)
          .sort((a, b) => b.score - a.score);
        return { ...s, best: items[0]?.score || 0, items: s.limit ? items.slice(0, s.limit) : items };
      })
      .filter((s) => s.items.length > 0);
    // while typing, the section with the best match comes first
    return q ? list.sort((a, b) => b.best - a.best) : list;
  }, [sections, q]);

  // the status card is row 0 while there's no query
  const statusRow: PaletteItem | null = q
    ? null
    : { id: "__status", label: status.title, icon: null, run: status.run };
  const flat: PaletteItem[] = [...(statusRow ? [statusRow] : []), ...visible.flatMap((s) => s.items)];

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function move(by: number) {
    mouseMoved.current = false;
    if (!flat.length) return;
    setActive((a) => (a + by + flat.length) % flat.length);
  }
  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => { onCopied?.(text); onClose(); }, () => {});
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === "ArrowDown" || (ctrl && e.key === "n") || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp" || (ctrl && e.key === "p") || (e.key === "Tab" && e.shiftKey)) { e.preventDefault(); move(-1); }
    else if (e.key === "PageDown") { e.preventDefault(); setActive((a) => Math.min(a + 8, flat.length - 1)); }
    else if (e.key === "PageUp") { e.preventDefault(); setActive((a) => Math.max(a - 8, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[active];
      if (!item) return;
      if (e.shiftKey && item.copy) copy(item.copy);
      else item.run();
    }
  }

  const activeItem = flat[active];
  let row = statusRow ? 1 : 0;
  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div
        className="cmd-box"
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        onMouseMove={() => { mouseMoved.current = true; }}
      >
        <div className="cmd-top">
          <span className="cmd-chip">{chipLabel}</span>
          <div className="cmd-input-row">
            <Icon name="search" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search websites, folders and actions…"
              aria-label="Search links or commands"
              role="combobox"
              aria-expanded="true"
              aria-controls="cmd-list"
              aria-activedescendant={activeItem ? `cmd-row-${active}` : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button className="cmd-clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear" title="Clear">
                <Icon name="x" />
              </button>
            )}
            <button className="kbd" onClick={onClose}>Esc</button>
          </div>
        </div>
        <div className="cmd-body" ref={listRef} id="cmd-list" role="listbox">
          {statusRow && (
            <div
              data-row={0}
              id="cmd-row-0"
              role="option"
              aria-selected={active === 0}
              className={`cmd-status ${active === 0 ? "active" : ""}`}
              onMouseMove={() => mouseMoved.current && setActive(0)}
              onClick={status.run}
            >
              <span className={`cmd-status-dot ${status.online ? "on" : ""}`} />
              <div className="cmd-status-text">
                <strong>{status.title}</strong>
                <span>{status.sub}</span>
              </div>
            </div>
          )}
          {!q && (
            <>
              <div className="cmd-section-title">Shortcuts</div>
              <div className="cmd-shortcuts">
                {shortcuts.map((s) => (
                  <button key={s.id} className="cmd-round" title={s.label} aria-label={s.label} onClick={s.run}>
                    {s.icon}
                  </button>
                ))}
              </div>
            </>
          )}
          {visible.map((section) => (
            <div key={section.title} role="group" aria-label={section.title}>
              <div className="cmd-section-title">{section.title}</div>
              {section.items.map((item) => {
                const idx = row++;
                return (
                  <div
                    key={item.id}
                    data-row={idx}
                    id={`cmd-row-${idx}`}
                    role="option"
                    aria-selected={active === idx}
                    className={`cmd-item ${active === idx ? "active" : ""}`}
                    onMouseMove={() => mouseMoved.current && active !== idx && setActive(idx)}
                    onClick={item.run}
                  >
                    <span className="cmd-item-icon">{item.icon}</span>
                    <span className="cmd-item-label"><Highlight text={item.label} hits={item.hits} /></span>
                    {item.hint && <span className="cmd-item-hint">{item.hint}</span>}
                    {active === idx && <span className="kbd">↵</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && (
            <div className="cmd-empty">
              Nothing matches “{query}”.
              <span>Try fewer letters, or search the whole page with <span className="kbd">/</span></span>
            </div>
          )}
        </div>
        <div className="cmd-foot" aria-hidden="true">
          <span><span className="kbd">↑</span><span className="kbd">↓</span> move</span>
          <span><span className="kbd">↵</span> open</span>
          {activeItem?.copy && <span><span className="kbd">Shift ↵</span> copy link</span>}
          <span className="cmd-foot-count">{q ? `${flat.length} result${flat.length === 1 ? "" : "s"}` : ""}</span>
        </div>
      </div>
    </div>
  );
}
