"use client";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

const ICON_PATHS: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  shuffle: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  user: "M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  chart: "M3 3v18h18M8 17V11M13 17V7M18 17v-4",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  settings: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  database: "M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  x: "M18 6 6 18M6 6l12 12",
  up: "M18 15l-6-6-6 6",
  down: "M6 9l6 6 6-6",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  reset: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  pin: "M12 17v5M9 3h6l-1 6 4 4H6l4-4z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-1",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z",
};

export function Icon({ name }: { name: keyof typeof ICON_PATHS | string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name] || ICON_PATHS.plus} />
    </svg>
  );
}

export interface PaletteItem {
  id: string;
  label: string;
  icon: ReactNode;
  hint?: string;
  run: () => void;
}

export interface PaletteSection {
  title: string;
  items: PaletteItem[];
  /** only shown while the query is empty */
  emptyQueryOnly?: boolean;
  /** only shown once the user has typed something */
  queryOnly?: boolean;
}

export default function CommandPalette({
  onClose,
  chipLabel,
  status,
  shortcuts,
  sections,
}: {
  onClose: () => void;
  chipLabel: string;
  status: { title: string; sub: string; online: boolean; run: () => void };
  shortcuts: PaletteItem[];
  sections: PaletteSection[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      sections
        .filter((s) => (q ? !s.emptyQueryOnly : !s.queryOnly))
        .map((s) => ({
          ...s,
          items: q
            ? s.items.filter((i) => i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q))
            : s.items,
        }))
        .filter((s) => s.items.length > 0),
    [sections, q]
  );

  // the status card is row 0 while there's no query
  const statusRow: PaletteItem | null = q
    ? null
    : { id: "__status", label: status.title, icon: null, run: status.run };
  const flat = [...(statusRow ? [statusRow] : []), ...visible.flatMap((s) => s.items)];

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); flat[active]?.run(); }
  }

  let row = statusRow ? 1 : 0;
  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-box" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="cmd-top">
          <span className="cmd-chip">{chipLabel}</span>
          <div className="cmd-input-row">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What do you need?"
              aria-label="Search links or commands"
            />
            <button className="kbd" onClick={onClose}>Esc</button>
          </div>
        </div>
        <div className="cmd-body" ref={listRef}>
          {statusRow && (
            <div
              data-row={0}
              className={`cmd-status ${active === 0 ? "active" : ""}`}
              onMouseEnter={() => setActive(0)}
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
            <div key={section.title}>
              <div className="cmd-section-title">{section.title}</div>
              {section.items.map((item) => {
                const idx = row++;
                return (
                  <div
                    key={item.id}
                    data-row={idx}
                    className={`cmd-item ${active === idx ? "active" : ""}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={item.run}
                  >
                    <span className="cmd-item-icon">{item.icon}</span>
                    <span className="cmd-item-label">{item.label}</span>
                    {item.hint && <span className="cmd-item-hint">{item.hint}</span>}
                    {active === idx && <span className="kbd">↵</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && <div className="cmd-empty">No results for “{query}”</div>}
        </div>
      </div>
    </div>
  );
}
