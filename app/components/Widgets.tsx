"use client";
import { useEffect, useMemo, useState } from "react";
import { readLocal, writeLocal } from "./ui";

/**
 * Small stand-alone widgets for designs made in the design builder:
 * clocks, a calendar, timers, notes and so on. Nothing here needs the
 * bookmarks — the home page passes in anything that does.
 */

function useTick(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
const pad = (n: number) => String(n).padStart(2, "0");

export function ClockWidget({ size, align, seconds, h24, date }: { size: string; align: string; seconds: boolean; h24: boolean; date: boolean }) {
  const now = useTick(seconds ? 1000 : 10_000);
  const h = now.getHours();
  const hh = h24 ? pad(h) : String(h % 12 || 12);
  return (
    <div className={`wg-clock wg-size-${size}`} style={{ textAlign: align as "left" }}>
      <div className="wg-clock-time" suppressHydrationWarning>
        {hh}:{pad(now.getMinutes())}{seconds && <span className="wg-clock-sec">:{pad(now.getSeconds())}</span>}
        {!h24 && <span className="wg-clock-ampm">{h < 12 ? "AM" : "PM"}</span>}
      </div>
      {date && <div className="wg-clock-date">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>}
    </div>
  );
}

export function AnalogWidget({ seconds, numbers }: { seconds: boolean; numbers: boolean }) {
  const now = useTick(1000);
  const s = now.getSeconds(), m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
  const hand = (deg: number, len: number, w: number, cls: string) => (
    <line x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} strokeWidth={w} strokeLinecap="round" className={cls} />
  );
  return (
    <svg className="wg-analog" viewBox="0 0 100 100" role="img" aria-label={now.toLocaleTimeString()}>
      <circle cx="50" cy="50" r="47" className="wg-analog-face" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        return numbers
          ? <text key={i} x={50 + 37 * Math.sin(a)} y={50 - 37 * Math.cos(a) + 3.5} textAnchor="middle" className="wg-analog-num">{i || 12}</text>
          : <line key={i} x1={50 + 40 * Math.sin(a)} y1={50 - 40 * Math.cos(a)} x2={50 + (i % 3 ? 43 : 44.5) * Math.sin(a)} y2={50 - (i % 3 ? 43 : 44.5) * Math.cos(a)} strokeWidth={i % 3 ? 1.2 : 2.4} className="wg-analog-tick" />;
      })}
      {hand(h * 30, 24, 4, "wg-analog-h")}
      {hand(m * 6, 34, 2.6, "wg-analog-m")}
      {seconds && hand(s * 6, 38, 1, "wg-analog-s")}
      <circle cx="50" cy="50" r="2.6" className="wg-analog-dot" />
    </svg>
  );
}

export function DateWidget({ size, align, format }: { size: string; align: string; format: string }) {
  const now = useTick(60_000);
  const text = format === "short" ? now.toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : format === "day" ? now.toLocaleDateString(undefined, { weekday: "long" })
    : now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return <div className={`wg-date wg-size-${size}`} style={{ textAlign: align as "left" }} suppressHydrationWarning>{text}</div>;
}

interface SiteEvent { id: string; title: string; date: string; description?: string }
let eventsCache: Promise<SiteEvent[]> | null = null;
function useEvents() {
  const [events, setEvents] = useState<SiteEvent[]>([]);
  useEffect(() => {
    eventsCache ||= fetch("/api/events").then((r) => r.json()).then((j) => (Array.isArray(j.events) ? j.events : [])).catch(() => []);
    let alive = true;
    eventsCache.then((e) => { if (alive) setEvents(e); });
    return () => { alive = false; };
  }, []);
  return events;
}

export function CalendarWidget() {
  const now = useTick(60_000);
  const events = useEvents();
  const [offset, setOffset] = useState(0);
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  const marked = new Set(events.map((e) => e.date.slice(0, 10)));
  const key = (d: number) => `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(d)}`;
  return (
    <div className="wg-cal">
      <div className="wg-cal-head">
        <button onClick={() => setOffset((o) => o - 1)} aria-label="Last month">‹</button>
        <strong>{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
        <button onClick={() => setOffset((o) => o + 1)} aria-label="Next month">›</button>
      </div>
      <div className="wg-cal-grid">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="wg-cal-dow">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const today = offset === 0 && d === now.getDate();
          const ev = events.filter((e) => e.date.slice(0, 10) === key(d));
          return <span key={d} className={`wg-cal-day ${today ? "today" : ""} ${marked.has(key(d)) ? "has" : ""}`} title={ev.map((e) => e.title).join(", ") || undefined}>{d}</span>;
        })}
      </div>
    </div>
  );
}

export function EventsWidget({ max }: { max: number }) {
  const events = useEvents();
  const now = Date.now();
  const next = events.filter((e) => Date.parse(e.date) >= now - 86400_000).slice(0, max);
  return (
    <div className="wg-events">
      <div className="wg-title">🎉 Coming up</div>
      {next.length === 0 ? <p className="wg-muted">No events yet.</p> : (
        <ul>
          {next.map((e) => {
            const d = new Date(e.date);
            return (
              <li key={e.id}>
                <span className="wg-ev-date"><b>{d.getDate()}</b>{d.toLocaleDateString(undefined, { month: "short" })}</span>
                <span><strong>{e.title}</strong>{e.description && <em>{e.description}</em>}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function CountdownWidget({ title, date }: { title: string; date: string }) {
  const now = useTick(60_000);
  const target = date ? Date.parse(`${date}T00:00:00`) : NaN;
  if (!Number.isFinite(target)) return <div className="wg-count"><div className="wg-muted">⏳ Pick a date for the countdown</div></div>;
  const ms = target - now.getTime();
  const days = Math.ceil(ms / 86400_000);
  return (
    <div className="wg-count">
      <div className="wg-count-num">{days > 0 ? days : days === 0 ? "🎉" : "✓"}</div>
      <div className="wg-count-label">{days > 1 ? `days until ${title}` : days === 1 ? `day until ${title}` : days === 0 ? `${title} is today!` : `${title} has happened`}</div>
    </div>
  );
}

export function PomodoroWidget({ work, rest }: { work: number; rest: number }) {
  const [phase, setPhase] = useState<"work" | "rest">("work");
  const [left, setLeft] = useState(work * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => { if (!running) setLeft((phase === "work" ? work : rest) * 60); }, [work, rest, phase, running]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((l) => {
      if (l > 1) return l - 1;
      const next = phase === "work" ? "rest" : "work";
      setPhase(next);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(next === "rest" ? "Break time ☕" : "Back to work 💪");
      return (next === "work" ? work : rest) * 60;
    }), 1000);
    return () => clearInterval(id);
  }, [running, phase, work, rest]);
  const total = (phase === "work" ? work : rest) * 60;
  return (
    <div className={`wg-pomo ${phase}`}>
      <div className="wg-title">{phase === "work" ? "🍅 Focus" : "☕ Break"}</div>
      <div className="wg-pomo-ring" style={{ "--p": `${(1 - left / total) * 360}deg` } as React.CSSProperties}>
        <span>{Math.floor(left / 60)}:{pad(left % 60)}</span>
      </div>
      <div className="wg-row">
        <button className="wg-btn" onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Start"}</button>
        <button className="wg-btn ghost" onClick={() => { setRunning(false); setPhase("work"); setLeft(work * 60); }}>Reset</button>
      </div>
    </div>
  );
}

export function StopwatchWidget() {
  const [start, setStart] = useState<number | null>(null);
  const [kept, setKept] = useState(0);
  const now = useTick(start ? 50 : 60_000);
  const ms = kept + (start ? now.getTime() - start : 0);
  return (
    <div className="wg-stop">
      <div className="wg-stop-time">{Math.floor(ms / 60000)}:{pad(Math.floor(ms / 1000) % 60)}<small>.{String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}</small></div>
      <div className="wg-row">
        <button className="wg-btn" onClick={() => { if (start) { setKept(ms); setStart(null); } else setStart(Date.now()); }}>{start ? "Stop" : "Start"}</button>
        <button className="wg-btn ghost" onClick={() => { setStart(null); setKept(0); }}>Reset</button>
      </div>
    </div>
  );
}

export function DayProgressWidget({ from, to, label }: { from: string; to: string; label: string }) {
  const now = useTick(30_000);
  const at = (t: string) => { const [h, m] = t.split(":").map(Number); const d = new Date(now); d.setHours(h || 0, m || 0, 0, 0); return d.getTime(); };
  const a = at(from), b = at(to);
  const p = b > a ? Math.min(1, Math.max(0, (now.getTime() - a) / (b - a))) : 0;
  const left = Math.max(0, Math.round((b - now.getTime()) / 60000));
  return (
    <div className="wg-day">
      <div className="wg-day-top"><strong>{label}</strong><span>{p >= 1 ? "Done! 🎉" : p <= 0 ? `Starts at ${from}` : `${Math.floor(left / 60) ? `${Math.floor(left / 60)}h ` : ""}${left % 60}m left`}</span></div>
      <div className="wg-day-bar"><span style={{ width: `${p * 100}%` }} /></div>
    </div>
  );
}

export function NoteWidget({ id }: { id: string }) {
  const key = `piece-note:${id}`;
  const [text, setText] = useState("");
  useEffect(() => { setText(readLocal(key, "")); }, [key]);
  return (
    <textarea className="wg-note" value={text} placeholder="Type a note… (only on this device)" aria-label="Sticky note"
      onChange={(e) => { setText(e.target.value); writeLocal(key, e.target.value); }} />
  );
}

export function TodoWidget({ id, title }: { id: string; title: string }) {
  const key = `piece-todo:${id}`;
  const [items, setItems] = useState<{ t: string; done: boolean }[]>([]);
  const [draft, setDraft] = useState("");
  useEffect(() => { setItems(readLocal(key, [])); }, [key]);
  const save = (next: { t: string; done: boolean }[]) => { setItems(next); writeLocal(key, next); };
  return (
    <div className="wg-todo">
      <div className="wg-title">✅ {title}</div>
      <ul>
        {items.map((it, i) => (
          <li key={i} className={it.done ? "done" : ""}>
            <label><input type="checkbox" checked={it.done} onChange={() => save(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} /> {it.t}</label>
            <button aria-label="Remove" onClick={() => save(items.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { save([...items, { t: draft.trim().slice(0, 120), done: false }]); setDraft(""); } }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add something…" aria-label="New to-do" />
      </form>
    </div>
  );
}

/** Short lines of our own (no famous quotes), one per day. */
const SAYINGS = [
  "Small steps every day add up to big things.",
  "Done is better than perfect.",
  "You don't have to be great to start, but you have to start to be great.",
  "Ask the question — someone else is wondering too.",
  "Mistakes are proof that you're trying.",
  "Take a break before you need one.",
  "Be the classmate you'd want to have.",
  "Future you will thank you for doing it now.",
  "Curiosity is a superpower.",
  "One page at a time.",
  "Drink some water. Seriously.",
  "It's okay not to know yet.",
  "Kindness is free — spend it.",
  "Progress, not perfection.",
  "Today is a good day to learn something weird.",
];
export function QuoteWidget({ align }: { align: string }) {
  const now = useTick(60 * 60_000);
  const day = Math.floor(now.getTime() / 86400_000);
  return <blockquote className="wg-quote" style={{ textAlign: align as "left" }}>“{SAYINGS[day % SAYINGS.length]}”</blockquote>;
}

/** Shapes and decoration: plain styled boxes. */
export function ShapeWidget({ part, props }: { part: string; props: Record<string, string | number | boolean> }) {
  const style = useMemo<React.CSSProperties>(() => {
    switch (part) {
      case "blob": return { background: `radial-gradient(circle at 35% 35%, ${props.a}, ${props.b} 60%, transparent 72%)`, filter: `blur(${props.blur}px)`, borderRadius: "50%" };
      case "gradient": return { background: `linear-gradient(${props.angle}deg, ${props.a}, ${props.b})` };
      case "pattern": {
        const c = String(props.color), g = Number(props.gap) || 18;
        const bg = props.kind === "grid" ? `linear-gradient(${c} 1px,transparent 1px),linear-gradient(90deg,${c} 1px,transparent 1px)`
          : props.kind === "stripes" ? `repeating-linear-gradient(45deg,${c} 0 ${g / 3}px,transparent ${g / 3}px ${g}px)`
          : props.kind === "checks" ? `conic-gradient(${c} 25%,transparent 0 50%,${c} 0 75%,transparent 0)`
          : `radial-gradient(${c} 1.5px,transparent 2px)`;
        return { backgroundImage: bg, backgroundSize: props.kind === "stripes" ? undefined : `${g}px ${g}px` };
      }
      default: return {};
    }
  }, [part, props]);
  if (part === "line") {
    const v = props.dir === "v";
    return <div className="wg-line-wrap"><div className="wg-line" style={{ [v ? "borderLeft" : "borderTop"]: `${props.thick}px ${props.dashed ? "dashed" : "solid"} currentColor`, [v ? "height" : "width"]: "100%" }} /></div>;
  }
  if (part === "divider") return <div className="wg-divider"><span>{String(props.text || "")}</span></div>;
  if (part === "sticker") return <div className="wg-sticker" style={{ transform: `rotate(${props.tilt}deg)` }}>{String(props.emoji || "⭐")}</div>;
  if (part === "bgimage") {
    return props.src
      ? <div className="wg-bgimg" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,${Number(props.dim) / 100}),rgba(0,0,0,${Number(props.dim) / 100})),url("${props.src}")` }} />
      : <div className="wg-empty">🏞️ Add a picture address</div>;
  }
  return <div className="wg-shape" style={style} />;
}

/** The latest few messages from the class chat; clicking opens the chat app. */
export function ChatPreviewWidget({ max, loggedIn, onOpen }: { max: number; loggedIn: boolean; onOpen: () => void }) {
  const [msgs, setMsgs] = useState<{ id: string; user: string; text: string }[] | null>(null);
  useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    const load = () => fetch("/api/chat?ch=general").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (alive && j && Array.isArray(j.messages)) setMsgs(j.messages.filter((m: { kind?: string }) => m.kind !== "system").slice(-max));
    }).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [loggedIn, max]);
  return (
    <button className="wg-chat" onClick={onOpen} title="Open chat">
      <div className="wg-title">💬 Class chat</div>
      {!loggedIn ? <p className="wg-muted">Log in to see the chat.</p> : !msgs ? <p className="wg-muted">Loading…</p> : msgs.length === 0 ? <p className="wg-muted">No messages yet — say hi!</p> : (
        <ul>
          {msgs.map((m) => <li key={m.id}><strong>{m.user}</strong> {m.text.length > 90 ? `${m.text.slice(0, 90)}…` : m.text}</li>)}
        </ul>
      )}
    </button>
  );
}
