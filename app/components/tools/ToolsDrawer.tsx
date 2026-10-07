"use client";
import dynamic from "next/dynamic";
import { ComponentType, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { ToolsProvider, useToolState } from "./shared";
import { TOOL_LIST, type ToolInfo } from "./list";

/** Each tool loads only when you open it, so the drawer costs nothing until then. */
const load = <K extends string>(mod: () => Promise<Record<K, ComponentType<{ user?: string | null }>>>, name: K) =>
  dynamic(() => mod().then((m) => m[name]), { ssr: false, loading: () => <div className="skeleton skel-line" /> });
const time = () => import("./time");
const write = () => import("./write");
const maths = () => import("./maths");
const study = () => import("./study");
const art = () => import("./art");

export interface ToolDef extends ToolInfo { C: ComponentType<{ user?: string | null }> }
const MODS = { time, write, maths, study, art } as unknown as Record<ToolInfo["mod"], () => Promise<Record<string, ComponentType<{ user?: string | null }>>>>;
export const TOOLS: ToolDef[] = TOOL_LIST.map((t) => ({ ...t, C: load(MODS[t.mod], t.part) }));
export const toolById = (id: string | null | undefined) => TOOLS.find((t) => t.id === id);

export function popOut(id: string) {
  const w = window.open(`/tools?tool=${id}&popout=1`, `tool-${id}`, "popup,width=420,height=640");
  if (w) w.focus();
  return !!w;
}

/** One tool on its own, with a header. Used in the drawer and the pop-out window. */
export function ToolView({ tool, user, onBack, popout }: { tool: ToolDef; user: string | null; onBack?: () => void; popout?: boolean }) {
  const C = tool.C;
  return (
    <div className="tool-view">
      <div className="tool-head">
        {onBack && <button className="btn-icon" onClick={onBack} aria-label="All tools" title="All tools"><Icon name="up" /></button>}
        <strong>{tool.emoji} {tool.name}</strong>
        {!popout && <button className="btn-icon" title="Pop out into its own window" aria-label="Pop out" onClick={() => popOut(tool.id)}><Icon name="popout" /></button>}
      </div>
      <div className="tool-body"><C user={user} /></div>
    </div>
  );
}

/** The grid of tools, with search and a "choose which tools show" mode. */
function ToolGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [hidden, setHidden] = useToolState<string[]>("drawer", "hidden", []);
  const [editing, setEditing] = useState(false);
  const term = q.trim().toLowerCase();
  const list = TOOLS.filter((t) => (editing || !hidden.includes(t.id)) && (!term || `${t.name} ${t.words}`.toLowerCase().includes(term)));
  const groups = Array.from(new Set(list.map((t) => t.group)));
  return (
    <div>
      <div className="tool-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tool…" aria-label="Find a tool" autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && list[0] && !editing) onOpen(list[0].id); }} />
        <button className={`pick ${editing ? "on" : ""}`} onClick={() => setEditing(!editing)}>{editing ? "Done" : "Choose"}</button>
      </div>
      {editing && <p className="tool-hint">Untick the tools you don&apos;t use to hide them.</p>}
      {groups.map((g) => (
        <section key={g} className="tool-group">
          <h4>{g}</h4>
          <div className="tool-grid">
            {list.filter((t) => t.group === g).map((t) => editing ? (
              <label key={t.id} className={`tool-tile ${hidden.includes(t.id) ? "off" : ""}`}>
                <input type="checkbox" checked={!hidden.includes(t.id)} onChange={() => setHidden(hidden.includes(t.id) ? hidden.filter((x) => x !== t.id) : [...hidden, t.id])} />
                <span className="tt-emoji">{t.emoji}</span><span>{t.name}</span>
              </label>
            ) : (
              <button key={t.id} className="tool-tile" onClick={() => onOpen(t.id)}>
                <span className="tt-emoji">{t.emoji}</span><span>{t.name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {list.length === 0 && <p className="tool-hint">No tool matches that.</p>}
    </div>
  );
}

/** The tools drawer: slides in from the side; remembers the last tool you had open. */
export default function ToolsDrawer({ open, user, onClose, openTool }: { open: boolean; user: string | null; onClose: () => void; openTool?: string | null }) {
  const [current, setCurrent] = useToolState<string | null>("drawer", "current", null);
  useEffect(() => { if (openTool) setCurrent(openTool); }, [openTool, setCurrent]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  const tool = toolById(current);
  const provider = useMemo(() => user, [user]);
  if (!open) return null;
  return (
    <div className="drawer-backdrop tools-backdrop" onClick={onClose}>
      <aside className="drawer tools-drawer" onClick={(e) => e.stopPropagation()} aria-label="Tools" role="dialog">
        <div className="drawer-head">
          <strong><Icon name="tools" /> Tools</strong>
          <a className="btn-icon" href="/tools" title="Open all tools on their own page" aria-label="Tools page"><Icon name="external" /></a>
          <button className="btn-icon" onClick={onClose} title="Close (Esc)" aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="drawer-body">
          <ToolsProvider user={provider}>
            {tool ? <ToolView tool={tool} user={user} onBack={() => setCurrent(null)} /> : <ToolGrid onOpen={setCurrent} />}
          </ToolsProvider>
        </div>
      </aside>
    </div>
  );
}
