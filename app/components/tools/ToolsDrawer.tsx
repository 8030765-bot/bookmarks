"use client";
import dynamic from "next/dynamic";
import { ComponentType, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { ToolsProvider, useToolState } from "./shared";

/** Each tool loads only when you open it, so the drawer costs nothing until then. */
const load = <K extends string>(mod: () => Promise<Record<K, ComponentType<{ user?: string | null }>>>, name: K) =>
  dynamic(() => mod().then((m) => m[name]), { ssr: false, loading: () => <div className="skeleton skel-line" /> });
const time = () => import("./time");
const write = () => import("./write");
const maths = () => import("./maths");
const study = () => import("./study");
const art = () => import("./art");

export interface ToolDef { id: string; name: string; emoji: string; group: string; words: string; C: ComponentType<{ user?: string | null }> }
export const TOOLS: ToolDef[] = [
  { id: "timer", name: "Focus timer", emoji: "🍅", group: "Time", words: "pomodoro timer focus break study", C: load(time, "Timer") },
  { id: "stopwatch", name: "Stopwatch", emoji: "⏱️", group: "Time", words: "stopwatch lap time", C: load(time, "Stopwatch") },
  { id: "clock", name: "Clock", emoji: "🕐", group: "Time", words: "clock date time week", C: load(time, "Clock") },
  { id: "worldclock", name: "World clock", emoji: "🌍", group: "Time", words: "world clock time zone city", C: load(time, "WorldClock") },
  { id: "countdowns", name: "Countdowns", emoji: "📅", group: "Time", words: "countdown exam holiday birthday days until", C: load(time, "Countdowns") },
  { id: "weekend", name: "Weekend countdown", emoji: "🎉", group: "Time", words: "weekend friday", C: load(time, "Weekend") },
  { id: "breathing", name: "Breathing", emoji: "🫧", group: "Time", words: "breathe calm relax stress", C: load(time, "Breathing") },
  { id: "metronome", name: "Metronome", emoji: "🎵", group: "Time", words: "metronome music bpm tempo beat", C: load(time, "Metronome") },
  { id: "notes", name: "Notes", emoji: "📝", group: "Write", words: "notes scratchpad private write", C: load(write, "Notes") },
  { id: "todos", name: "To-do list", emoji: "✅", group: "Write", words: "todo tasks list homework", C: load(write, "Todos") },
  { id: "wordcount", name: "Word counter", emoji: "🔤", group: "Write", words: "word character count essay", C: load(write, "WordCounter") },
  { id: "case", name: "Text case", emoji: "🔠", group: "Write", words: "uppercase lowercase title case convert", C: load(write, "CaseConverter") },
  { id: "dictionary", name: "Dictionary", emoji: "📖", group: "Write", words: "dictionary define meaning word", C: load(write, "Dictionary") },
  { id: "codes", name: "Binary & Morse", emoji: "📟", group: "Write", words: "binary morse hex code secret caesar", C: load(write, "CodeConverter") },
  { id: "password", name: "Password maker", emoji: "🔐", group: "Write", words: "password generator secure", C: load(write, "PasswordMaker") },
  { id: "emoji", name: "Emoji search", emoji: "😀", group: "Write", words: "emoji copy search", C: load(write, "EmojiSearch") },
  { id: "daily", name: "Word, quote & fact", emoji: "💡", group: "Write", words: "word of the day quote fact", C: load(write, "Daily") },
  { id: "calculator", name: "Calculator", emoji: "🧮", group: "Maths", words: "calculator scientific maths sum sin cos", C: load(maths, "Calculator") },
  { id: "percent", name: "Percentages", emoji: "💯", group: "Maths", words: "percent percentage score change", C: load(maths, "Percentage") },
  { id: "units", name: "Unit converter", emoji: "📏", group: "Maths", words: "unit convert length weight temperature cm inch", C: load(maths, "UnitConverter") },
  { id: "random", name: "Dice & picker", emoji: "🎲", group: "Maths", words: "dice coin flip random pick number", C: load(maths, "RandomTools") },
  { id: "teams", name: "Team maker", emoji: "👥", group: "Maths", words: "team groups random split", C: load(maths, "TeamMaker") },
  { id: "flashcards", name: "Flashcards", emoji: "🗂️", group: "Study", words: "flashcards revise study cards vocab", C: load(study, "Flashcards") },
  { id: "habits", name: "Habit tracker", emoji: "🔥", group: "Study", words: "habit streak daily tracker", C: load(study, "Habits") },
  { id: "typing", name: "Typing test", emoji: "⌨️", group: "Study", words: "typing speed wpm test leaderboard", C: load(study, "TypingTest") },
  { id: "color", name: "Colour picker", emoji: "🎨", group: "Art", words: "color colour picker hex rgb", C: load(art, "ColorPicker") },
  { id: "palette", name: "Palette maker", emoji: "🌈", group: "Art", words: "palette colours scheme", C: load(art, "PaletteMaker") },
  { id: "sketch", name: "Sketchpad", emoji: "✏️", group: "Art", words: "draw sketch paint doodle", C: load(art, "Sketchpad") },
  { id: "pixel", name: "Pixel art", emoji: "👾", group: "Art", words: "pixel art grid draw", C: load(art, "PixelArt") },
];
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
      {editing && <p className="tool-hint">Untick the tools you don't use to hide them.</p>}
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
