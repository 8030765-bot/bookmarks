"use client";
import { useEffect, useRef, useState } from "react";
import { beep, fmtDuration, uid, useSynced, useTick, useToolState } from "./shared";
import { TIMER_DEFAULT, TimerState, minsFor } from "./timerAlarm";

/* ---------- focus timer (Pomodoro) ---------- */
export function Timer() {
  const [s, setS] = useToolState<TimerState>("timer", "state", TIMER_DEFAULT);
  const running = !!s.endAt;
  useTick(running, 250);
  const left = running ? Math.max(0, s.endAt! - Date.now()) : s.left;
  const total = minsFor(s) * 60_000;
  const pct = total ? 100 - Math.round((left / total) * 100) : 0;
  const switchMode = (mode: TimerState["mode"]) => setS({ ...s, mode, endAt: undefined, left: minsFor(s, mode) * 60_000 });
  const setMins = (field: "focusMin" | "breakMin" | "customMin", v: number) => {
    const n = Math.max(1, Math.min(180, Math.round(v) || 1));
    const next = { ...s, [field]: n };
    const affects = (field === "focusMin" && s.mode === "focus") || (field === "breakMin" && s.mode === "break") || (field === "customMin" && s.mode === "custom");
    setS(affects && !running ? { ...next, left: n * 60_000 } : next);
  };
  // show the countdown in the tab title while it runs, then put the page's own title back
  const baseTitle = useRef("");
  useEffect(() => {
    baseTitle.current = document.title;
    return () => { if (baseTitle.current) document.title = baseTitle.current; };
  }, []);
  useEffect(() => {
    if (running) document.title = `${fmtDuration(left)} · ${s.mode === "break" ? "Break" : "Focus"}`;
    else if (baseTitle.current) document.title = baseTitle.current;
  }, [running, left, s.mode]);
  return (
    <div className="tool-timer">
      <div className="seg small">
        {(["focus", "break", "custom"] as const).map((m) => (
          <button key={m} className={s.mode === m ? "on" : ""} onClick={() => switchMode(m)}>{m === "focus" ? "🎯 Focus" : m === "break" ? "☕ Break" : "⏱️ Custom"}</button>
        ))}
      </div>
      <div className="timer-ring" style={{ "--p": `${pct}%` } as React.CSSProperties}>
        <span className="timer-big" aria-live="polite">{fmtDuration(left)}</span>
      </div>
      <div className="tool-row center">
        {running ? (
          <button className="btn btn-secondary" onClick={() => setS({ ...s, endAt: undefined, left })}>Pause</button>
        ) : (
          <button className="btn btn-primary" onClick={() => {
            try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch {}
            setS({ ...s, endAt: Date.now() + (left || total), left: left || total });
          }}>{left < total && left > 0 ? "Resume" : "Start"}</button>
        )}
        <button className="btn btn-secondary" onClick={() => setS({ ...s, endAt: undefined, left: total })}>Reset</button>
      </div>
      <div className="tool-row center small">
        <label>Focus <input type="number" min={1} max={180} value={s.focusMin} onChange={(e) => setMins("focusMin", Number(e.target.value))} /> min</label>
        <label>Break <input type="number" min={1} max={60} value={s.breakMin} onChange={(e) => setMins("breakMin", Number(e.target.value))} /> min</label>
        {s.mode === "custom" && <label>Custom <input type="number" min={1} max={180} value={s.customMin} onChange={(e) => setMins("customMin", Number(e.target.value))} /> min</label>}
      </div>
      <p className="tool-hint">🍅 {s.rounds} focus round{s.rounds === 1 ? "" : "s"} done {s.rounds > 0 && <button className="link-btn" onClick={() => setS({ ...s, rounds: 0 })}>reset</button>} · it keeps going if you close the drawer</p>
    </div>
  );
}

/* ---------- stopwatch ---------- */
interface Watch { startAt?: number; acc: number; laps: number[] }
export function Stopwatch() {
  const [w, setW] = useToolState<Watch>("stopwatch", "state", { acc: 0, laps: [] });
  const running = !!w.startAt;
  useTick(running, 50);
  const elapsed = w.acc + (running ? Date.now() - w.startAt! : 0);
  return (
    <div>
      <div className="timer-big center" aria-live="off">{fmtDuration(elapsed, true)}</div>
      <div className="tool-row center">
        {running ? (
          <button className="btn btn-secondary" onClick={() => setW({ ...w, startAt: undefined, acc: elapsed })}>Stop</button>
        ) : (
          <button className="btn btn-primary" onClick={() => setW({ ...w, startAt: Date.now() })}>{elapsed ? "Resume" : "Start"}</button>
        )}
        {running ? (
          <button className="btn btn-secondary" onClick={() => setW({ ...w, laps: [elapsed, ...w.laps].slice(0, 50) })}>Lap</button>
        ) : (
          <button className="btn btn-secondary" disabled={!elapsed} onClick={() => setW({ acc: 0, laps: [] })}>Reset</button>
        )}
      </div>
      {w.laps.length > 0 && (
        <ol className="tool-list laps" reversed>
          {w.laps.map((t, i) => <li key={i}><span>Lap {w.laps.length - i}</span><span>{fmtDuration(t - (w.laps[i + 1] || 0), true)}</span><span className="muted-inline">{fmtDuration(t, true)}</span></li>)}
        </ol>
      )}
    </div>
  );
}

/* ---------- clock + world clock ---------- */
export function Clock() {
  useTick(true, 1000);
  const now = new Date();
  return (
    <div className="center">
      <div className="timer-big">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
      <div className="clock-date">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      <p className="tool-hint">Week {weekNumber(now)} · day {dayOfYear(now)} of {isLeap(now.getFullYear()) ? 366 : 365}</p>
    </div>
  );
}
function weekNumber(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400_000 + 1) / 7);
}
const dayOfYear = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400_000);
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

const ZONES = [
  ["London", "Europe/London"], ["New York", "America/New_York"], ["Los Angeles", "America/Los_Angeles"], ["Chicago", "America/Chicago"],
  ["Toronto", "America/Toronto"], ["Mexico City", "America/Mexico_City"], ["São Paulo", "America/Sao_Paulo"], ["Paris", "Europe/Paris"],
  ["Berlin", "Europe/Berlin"], ["Madrid", "Europe/Madrid"], ["Istanbul", "Europe/Istanbul"], ["Moscow", "Europe/Moscow"],
  ["Dubai", "Asia/Dubai"], ["Delhi", "Asia/Kolkata"], ["Bangkok", "Asia/Bangkok"], ["Ho Chi Minh City", "Asia/Ho_Chi_Minh"],
  ["Singapore", "Asia/Singapore"], ["Hong Kong", "Asia/Hong_Kong"], ["Shanghai", "Asia/Shanghai"], ["Seoul", "Asia/Seoul"],
  ["Tokyo", "Asia/Tokyo"], ["Sydney", "Australia/Sydney"], ["Auckland", "Pacific/Auckland"], ["Lagos", "Africa/Lagos"],
  ["Cairo", "Africa/Cairo"], ["Nairobi", "Africa/Nairobi"], ["Johannesburg", "Africa/Johannesburg"], ["Honolulu", "Pacific/Honolulu"],
];
export function WorldClock() {
  const [picked, setPicked] = useToolState<string[]>("worldclock", "zones", ["America/New_York", "Europe/London", "Asia/Tokyo"]);
  const [add, setAdd] = useState("");
  useTick(true, 1000);
  const now = new Date();
  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetH = (tz: string) => {
    const there = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const here = new Date(now.toLocaleString("en-US", { timeZone: mine }));
    const h = Math.round((there.getTime() - here.getTime()) / 360_000) / 10;
    return h === 0 ? "same time" : `${h > 0 ? "+" : ""}${h}h`;
  };
  return (
    <div>
      <ul className="tool-list">
        {picked.map((tz) => {
          const name = ZONES.find((z) => z[1] === tz)?.[0] || tz;
          const hour = Number(now.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false }));
          return (
            <li key={tz}>
              <span>{hour >= 6 && hour < 19 ? "☀️" : "🌙"} {name}</span>
              <strong>{now.toLocaleTimeString([], { timeZone: tz, hour: "2-digit", minute: "2-digit" })}</strong>
              <span className="muted-inline">{offsetH(tz)}</span>
              <button className="btn-icon sm" aria-label={`Remove ${name}`} onClick={() => setPicked(picked.filter((x) => x !== tz))}>×</button>
            </li>
          );
        })}
      </ul>
      <div className="tool-row">
        <select value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Add a city">
          <option value="">Add a city…</option>
          {ZONES.filter((z) => !picked.includes(z[1])).map(([n, tz]) => <option key={tz} value={tz}>{n}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" disabled={!add} onClick={() => { setPicked([...picked, add].slice(0, 12)); setAdd(""); }}>Add</button>
      </div>
    </div>
  );
}

/* ---------- your countdowns + the weekend ---------- */
interface Countdown { id: string; title: string; at: string; emoji?: string }
function untilLabel(ms: number) {
  if (ms <= 0) return "now!";
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (d >= 2) return `${d} days`;
  if (d === 1) return `1 day ${h}h`;
  return h ? `${h}h ${m}m` : `${m}m ${Math.floor((ms % 60_000) / 1000)}s`;
}
export function Countdowns() {
  const { value, set, ready, error } = useSynced<Countdown[]>("countdowns", []);
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [emoji, setEmoji] = useState("🎉");
  useTick(true, 1000);
  const list = [...value].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div>
      <form className="tool-form" onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !at) return;
        set([...value, { id: uid(), title: title.trim().slice(0, 60), at: new Date(at).toISOString(), emoji }].slice(0, 30));
        setTitle(""); setAt("");
      }}>
        <div className="tool-row">
          <input className="emoji-in" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} aria-label="Emoji" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer holidays" maxLength={60} />
        </div>
        <div className="tool-row">
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="When" />
          <button className="btn btn-primary btn-sm" disabled={!title.trim() || !at}>Add</button>
        </div>
      </form>
      {!ready && <div className="skeleton skel-line" />}
      {ready && list.length === 0 && <p className="tool-hint">No countdowns yet. Add an exam, a trip or your birthday.</p>}
      <ul className="tool-list countdowns">
        {list.map((c) => {
          const ms = Date.parse(c.at) - Date.now();
          return (
            <li key={c.id} className={ms <= 0 ? "past" : ""}>
              <span>{c.emoji} {c.title}</span>
              <strong>{ms <= 0 ? "🎉 it's here" : untilLabel(ms)}</strong>
              <button className="btn-icon sm" aria-label={`Remove ${c.title}`} onClick={() => set(value.filter((x) => x.id !== c.id))}>×</button>
            </li>
          );
        })}
      </ul>
      {error && <p className="tool-error">{error}</p>}
    </div>
  );
}

export function Weekend() {
  useTick(true, 1000);
  const now = new Date();
  const day = now.getDay(); // 0 Sun … 6 Sat
  const isWeekend = day === 0 || day === 6 || (day === 5 && now.getHours() >= 15);
  const target = new Date(now);
  target.setDate(now.getDate() + ((5 - day + 7) % 7));
  target.setHours(15, 0, 0, 0); // Friday 3pm, roughly the end of school
  const ms = target.getTime() - now.getTime();
  const weekStart = new Date(target.getTime() - 4 * 86400_000 - 7 * 3600_000); // Monday 8am
  const pct = Math.min(100, Math.max(0, Math.round(((now.getTime() - weekStart.getTime()) / (target.getTime() - weekStart.getTime())) * 100)));
  return (
    <div className="center">
      {isWeekend ? (
        <div className="timer-big">🎉 It's the weekend!</div>
      ) : (
        <>
          <div className="timer-big">{untilLabel(ms)}</div>
          <p>until Friday 3pm</p>
          <span className="goal-bar wide"><span style={{ width: `${pct}%` }} /></span>
          <p className="tool-hint">{pct}% of the school week done</p>
        </>
      )}
    </div>
  );
}

/* ---------- breathing / calm-down ---------- */
const PATTERNS = {
  box: { name: "Box (4-4-4-4)", steps: [["Breathe in", 4], ["Hold", 4], ["Breathe out", 4], ["Hold", 4]] },
  calm: { name: "Calm (4-7-8)", steps: [["Breathe in", 4], ["Hold", 7], ["Breathe out", 8]] },
  easy: { name: "Easy (4-6)", steps: [["Breathe in", 4], ["Breathe out", 6]] },
} as const;
export function Breathing() {
  const [pattern, setPattern] = useToolState<keyof typeof PATTERNS>("breathing", "pattern", "box");
  const [startAt, setStartAt] = useState<number | null>(null);
  useTick(!!startAt, 100);
  const p = PATTERNS[pattern] || PATTERNS.box;
  const cycle = p.steps.reduce((n, s) => n + s[1], 0);
  let label = "Ready when you are";
  let scale = 0.6;
  let secsLeft = 0;
  let cycles = 0;
  if (startAt) {
    const t = (Date.now() - startAt) / 1000;
    cycles = Math.floor(t / cycle);
    let inCycle = t % cycle;
    for (let i = 0; i < p.steps.length; i++) {
      const [name, secs] = p.steps[i];
      if (inCycle < secs) {
        label = name;
        secsLeft = Math.ceil(secs - inCycle);
        const f = inCycle / secs;
        // grow while breathing in, shrink while breathing out, stay put while holding
        if (name === "Breathe in") scale = 0.6 + 0.4 * f;
        else if (name === "Breathe out") scale = 1 - 0.4 * f;
        else scale = p.steps[i - 1]?.[0] === "Breathe in" ? 1 : 0.6;
        break;
      }
      inCycle -= secs;
    }
  }
  return (
    <div className="center">
      <select value={pattern} onChange={(e) => setPattern(e.target.value as keyof typeof PATTERNS)} aria-label="Breathing pattern" disabled={!!startAt}>
        {Object.entries(PATTERNS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
      </select>
      <div className="breath-wrap"><div className="breath-ball" style={{ transform: `scale(${scale})` }} /></div>
      <div className="breath-label" aria-live="polite">{label}{secsLeft ? ` · ${secsLeft}` : ""}</div>
      {startAt && <p className="tool-hint">{cycles} breath{cycles === 1 ? "" : "s"}</p>}
      <button className="btn btn-primary" onClick={() => setStartAt(startAt ? null : Date.now())}>{startAt ? "Stop" : "Start"}</button>
    </div>
  );
}

/* ---------- metronome ---------- */
export function Metronome() {
  const [bpm, setBpm] = useToolState("metronome", "bpm", 100);
  const [beats, setBeats] = useToolState("metronome", "beats", 4);
  const [on, setOn] = useState(false);
  const [beat, setBeat] = useState(0);
  const [taps, setTaps] = useState<number[]>([]);
  useEffect(() => {
    if (!on) return;
    let n = 0;
    const tick = () => { beep(n % beats === 0 ? 1320 : 880, 60, 0.2); setBeat(n % beats); n++; };
    tick();
    const id = setInterval(tick, 60_000 / bpm);
    return () => clearInterval(id);
  }, [on, bpm, beats]);
  const tap = () => {
    const now = Date.now();
    const recent = [...taps.filter((t) => now - t < 3000), now].slice(-6);
    setTaps(recent);
    if (recent.length >= 3) {
      const gaps = recent.slice(1).map((t, i) => t - recent[i]);
      setBpm(Math.round(60_000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)));
    }
  };
  return (
    <div className="center">
      <div className="metro-dots">{Array.from({ length: beats }, (_, i) => <span key={i} className={on && beat === i ? "on" : ""} />)}</div>
      <div className="timer-big">{bpm} <small>bpm</small></div>
      <input type="range" min={30} max={240} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} aria-label="Beats per minute" />
      <div className="tool-row center">
        <button className="btn btn-primary" onClick={() => setOn(!on)}>{on ? "Stop" : "Start"}</button>
        <button className="btn btn-secondary" onClick={tap}>Tap tempo</button>
        <select value={beats} onChange={(e) => setBeats(Number(e.target.value))} aria-label="Beats per bar">
          {[2, 3, 4, 5, 6, 7].map((b) => <option key={b} value={b}>{b}/4</option>)}
        </select>
      </div>
    </div>
  );
}

