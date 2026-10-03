"use client";
import { useMemo, useState } from "react";
import { useCopy, useToolState } from "./shared";

/* ---------- a safe little expression parser (no eval) ---------- */
type Angle = "deg" | "rad";
const FUNCS: Record<string, (x: number, a: Angle) => number> = {
  sin: (x, a) => Math.sin(a === "deg" ? (x * Math.PI) / 180 : x),
  cos: (x, a) => Math.cos(a === "deg" ? (x * Math.PI) / 180 : x),
  tan: (x, a) => Math.tan(a === "deg" ? (x * Math.PI) / 180 : x),
  asin: (x, a) => (a === "deg" ? (Math.asin(x) * 180) / Math.PI : Math.asin(x)),
  acos: (x, a) => (a === "deg" ? (Math.acos(x) * 180) / Math.PI : Math.acos(x)),
  atan: (x, a) => (a === "deg" ? (Math.atan(x) * 180) / Math.PI : Math.atan(x)),
  sqrt: (x) => Math.sqrt(x),
  cbrt: (x) => Math.cbrt(x),
  log: (x) => Math.log10(x),
  ln: (x) => Math.log(x),
  abs: (x) => Math.abs(x),
  round: (x) => Math.round(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
};
function factorial(n: number) {
  if (n < 0 || !Number.isInteger(n)) throw new Error("! needs a whole number");
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
/** Evaluate a maths expression: + − × ÷ ^ % ! ( ), sin cos tan sqrt log ln…, pi, e, ans. */
export function calc(src: string, angle: Angle = "deg", ans = 0): number {
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/\s+/g, "").toLowerCase();
  let i = 0;
  const peek = () => s[i];
  const eat = (c: string) => { if (s[i] === c) { i++; return true; } return false; };
  function number(): number {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
    if (!m) throw new Error("Check the sum");
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function primary(): number {
    if (eat("(")) { const v = expr(); if (!eat(")")) throw new Error("Missing )"); return v; }
    const word = /^[a-z]+/.exec(s.slice(i))?.[0];
    if (word) {
      i += word.length;
      if (word === "pi") return Math.PI;
      if (word === "e") return Math.E;
      if (word === "ans") return ans;
      const fn = FUNCS[word];
      if (!fn) throw new Error(`Unknown: ${word}`);
      // sin(30)^2 squares the answer; sin30 and sin-30 work too
      return fn(peek() === "(" ? primary() : unary(), angle);
    }
    return number();
  }
  function postfix(): number {
    let v = primary();
    for (;;) {
      if (eat("!")) v = factorial(v);
      else if (peek() === "%" && !/[\d(a-z.]/.test(s[i + 1] || "")) { i++; v = v / 100; }
      else break;
    }
    return v;
  }
  function power(): number {
    const base = postfix();
    if (eat("^")) return Math.pow(base, unary()); // right-associative, and 2^-1 works
    return base;
  }
  function unary(): number {
    // -2^2 is -(2^2), like on paper
    if (eat("-")) return -unary();
    if (eat("+")) return unary();
    return power();
  }
  function term(): number {
    let v = unary();
    for (;;) {
      if (eat("*")) v *= unary();
      else if (eat("/")) { const d = unary(); v /= d; }
      else if (peek() === "%") { i++; v %= unary(); }
      else if (peek() && /[(a-z]/.test(peek())) v *= power(); // 2pi, 3(4+1)
      else break;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    for (;;) {
      if (eat("+")) v += term();
      else if (eat("-")) v -= term();
      else break;
    }
    return v;
  }
  if (!s) return 0;
  const v = expr();
  if (i < s.length) throw new Error("Check the sum");
  return v;
}
export const fmtNum = (n: number) => {
  if (!Number.isFinite(n)) return Number.isNaN(n) ? "Not a number" : n > 0 ? "∞" : "-∞";
  const r = Math.round(n * 1e10) / 1e10;
  return Math.abs(r) >= 1e15 || (Math.abs(r) < 1e-6 && r !== 0) ? r.toExponential(6) : String(r);
};

export function Calculator() {
  const [expr, setExpr] = useToolState("calculator", "expr", "");
  const [sci, setSci] = useToolState("calculator", "sci", false);
  const [angle, setAngle] = useToolState<Angle>("calculator", "angle", "deg");
  const [history, setHistory] = useToolState<{ e: string; r: string }[]>("calculator", "history", []);
  const ans = history[0] ? Number(history[0].r) || 0 : 0;
  const preview = useMemo(() => { try { return expr ? fmtNum(calc(expr, angle, ans)) : ""; } catch { return ""; } }, [expr, angle, ans]);
  const press = (k: string) => {
    if (k === "C") return setExpr("");
    if (k === "⌫") return setExpr(expr.slice(0, -1));
    if (k === "=") {
      try {
        const r = fmtNum(calc(expr, angle, ans));
        setHistory([{ e: expr, r }, ...history].slice(0, 20));
        setExpr(r);
      } catch (e) {
        setExpr(expr);
        alertShake(e instanceof Error ? e.message : "Error");
      }
      return;
    }
    setExpr(expr + k);
  };
  const [err, setErr] = useState("");
  function alertShake(m: string) { setErr(m); setTimeout(() => setErr(""), 1500); }
  const basic = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "⌫", "="];
  const science = ["sin(", "cos(", "tan(", "^", "asin(", "acos(", "atan(", "√(", "log(", "ln(", "π", "e", "!", "%", "ans", "abs("];
  return (
    <div className="calc">
      <input
        className="calc-screen mono"
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); press("="); } }}
        placeholder="0"
        aria-label="Sum"
        inputMode="decimal"
      />
      <div className="calc-preview mono" aria-live="polite">{err ? <span className="tool-error">{err}</span> : preview && preview !== expr ? `= ${preview}` : " "}</div>
      <div className="tool-row small">
        <label className="check-row"><input type="checkbox" checked={sci} onChange={(e) => setSci(e.target.checked)} /> Scientific</label>
        {sci && <button className="pick" onClick={() => setAngle(angle === "deg" ? "rad" : "deg")}>{angle === "deg" ? "Degrees" : "Radians"}</button>}
      </div>
      {sci && <div className="calc-keys sci">{science.map((k) => <button key={k} onClick={() => press(k)}>{k.replace("(", "")}</button>)}</div>}
      <div className="calc-keys">
        {basic.map((k) => <button key={k} className={k === "=" ? "eq" : /[÷×+\-]/.test(k) ? "op" : ""} onClick={() => press(k)}>{k}</button>)}
      </div>
      {history.length > 0 && (
        <ul className="tool-list calc-history">
          {history.slice(0, 6).map((h, i) => <li key={i}><button className="link-btn" onClick={() => setExpr(h.e)}>{h.e}</button><strong>= {h.r}</strong></li>)}
        </ul>
      )}
    </div>
  );
}

/* ---------- percentages ---------- */
export function Percentage() {
  const [v, setV] = useToolState("percent", "v", { a: "20", b: "150", c: "45", d: "60", e: "80", f: "100" });
  const n = (s: string) => parseFloat(s);
  const out = (x: number) => (Number.isFinite(x) ? fmtNum(Math.round(x * 100) / 100) : "—");
  const field = (k: keyof typeof v) => <input className="num-in" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-label={k} />;
  const change = ((n(v.f) - n(v.e)) / n(v.e)) * 100;
  return (
    <div className="percent">
      <p>What is {field("a")} % of {field("b")}? <strong>{out((n(v.a) / 100) * n(v.b))}</strong></p>
      <p>{field("c")} is what % of {field("d")}? <strong>{out((n(v.c) / n(v.d)) * 100)}%</strong></p>
      <p>From {field("e")} to {field("f")} is a change of <strong>{Number.isFinite(change) ? `${change > 0 ? "+" : ""}${out(change)}%` : "—"}</strong></p>
      <p className="tool-hint">Test score: {v.c}/{v.d} = {out((n(v.c) / n(v.d)) * 100)}%</p>
    </div>
  );
}

/* ---------- unit converter ---------- */
const UNITS: Record<string, { name: string; units: Record<string, number> } | { name: string; temp: true }> = {
  length: { name: "Length", units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, inch: 0.0254, foot: 0.3048, yard: 0.9144, mile: 1609.344 } },
  mass: { name: "Weight", units: { g: 0.001, kg: 1, tonne: 1000, ounce: 0.028349523125, pound: 0.45359237, stone: 6.35029318 } },
  volume: { name: "Volume", units: { ml: 0.001, l: 1, "cup (US)": 0.2365882365, "pint (UK)": 0.56826125, "gallon (UK)": 4.54609, "gallon (US)": 3.785411784, "fl oz (US)": 0.0295735295625 } },
  speed: { name: "Speed", units: { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, knot: 0.514444 } },
  time: { name: "Time", units: { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, year: 31557600 } },
  data: { name: "Data", units: { byte: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824 } },
  area: { name: "Area", units: { "cm²": 1e-4, "m²": 1, hectare: 1e4, "km²": 1e6, "ft²": 0.09290304, acre: 4046.8564224 } },
  temp: { name: "Temperature", temp: true },
};
const toC = (v: number, u: string) => (u === "°F" ? ((v - 32) * 5) / 9 : u === "K" ? v - 273.15 : v);
const fromC = (v: number, u: string) => (u === "°F" ? (v * 9) / 5 + 32 : u === "K" ? v + 273.15 : v);
export function UnitConverter() {
  const [s, setS] = useToolState("units", "state", { kind: "length", from: "cm", to: "inch", value: "100" });
  const def = UNITS[s.kind] || UNITS.length;
  const names = "temp" in def ? ["°C", "°F", "K"] : Object.keys(def.units);
  const from = names.includes(s.from) ? s.from : names[0];
  const to = names.includes(s.to) ? s.to : names[1];
  const v = parseFloat(s.value);
  let result = NaN;
  if (Number.isFinite(v)) result = "temp" in def ? fromC(toC(v, from), to) : (v * def.units[from]) / def.units[to];
  return (
    <div>
      <select value={s.kind} onChange={(e) => {
        const d = UNITS[e.target.value];
        const n = "temp" in d ? ["°C", "°F", "K"] : Object.keys(d.units);
        setS({ ...s, kind: e.target.value, from: n[0], to: n[1] });
      }} aria-label="What to convert">
        {Object.entries(UNITS).map(([k, d]) => <option key={k} value={k}>{d.name}</option>)}
      </select>
      <div className="tool-row">
        <input className="num-in wide" inputMode="decimal" value={s.value} onChange={(e) => setS({ ...s, value: e.target.value })} aria-label="Amount" />
        <select value={from} onChange={(e) => setS({ ...s, from: e.target.value })} aria-label="From">{names.map((u) => <option key={u}>{u}</option>)}</select>
      </div>
      <div className="tool-row">
        <button className="btn-icon" title="Swap" aria-label="Swap units" onClick={() => setS({ ...s, from: to, to: from })}>⇅</button>
      </div>
      <div className="tool-row">
        <output className="unit-out">{Number.isFinite(result) ? fmtNum(Math.round(result * 1e6) / 1e6) : "—"}</output>
        <select value={to} onChange={(e) => setS({ ...s, to: e.target.value })} aria-label="To">{names.map((u) => <option key={u}>{u}</option>)}</select>
      </div>
    </div>
  );
}

/* ---------- dice, coin and random picker ---------- */
const rand = (n: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const DIE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
export function RandomTools() {
  const [tab, setTab] = useToolState<"dice" | "coin" | "pick" | "number">("random", "tab", "dice");
  const [dice, setDice] = useToolState("random", "dice", 2);
  const [rolled, setRolled] = useState<number[]>([]);
  const [coin, setCoin] = useState<string>("");
  const [flips, setFlips] = useState({ h: 0, t: 0 });
  const [list, setList] = useToolState("random", "list", "");
  const [picked, setPicked] = useState("");
  const [range, setRange] = useToolState("random", "range", { min: 1, max: 100 });
  const [num, setNum] = useState<number | null>(null);
  const [spin, setSpin] = useState(false);
  const animate = (fn: () => void) => { setSpin(true); setTimeout(() => { fn(); setSpin(false); }, 350); };
  const items = list.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  return (
    <div className="center">
      <div className="seg small">
        {(["dice", "coin", "pick", "number"] as const).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "dice" ? "🎲 Dice" : t === "coin" ? "🪙 Coin" : t === "pick" ? "🎯 Pick" : "🔢 Number"}</button>)}
      </div>
      {tab === "dice" && (
        <>
          <div className={`dice-out ${spin ? "spin" : ""}`}>{(rolled.length ? rolled : Array(dice).fill(0)).map((d, i) => <span key={i}>{DIE[d]}</span>)}</div>
          {rolled.length > 1 && <p>Total: <strong>{rolled.reduce((a, b) => a + b + 1, 0)}</strong></p>}
          <div className="tool-row center">
            <select value={dice} onChange={(e) => { setDice(Number(e.target.value)); setRolled([]); }} aria-label="How many dice">{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {n === 1 ? "die" : "dice"}</option>)}</select>
            <button className="btn btn-primary" onClick={() => animate(() => setRolled(Array.from({ length: dice }, () => rand(6))))}>Roll</button>
          </div>
        </>
      )}
      {tab === "coin" && (
        <>
          <div className={`coin-out ${spin ? "spin" : ""}`}>{coin || "🪙"}</div>
          <button className="btn btn-primary" onClick={() => animate(() => { const h = rand(2) === 0; setCoin(h ? "Heads" : "Tails"); setFlips((f) => ({ h: f.h + (h ? 1 : 0), t: f.t + (h ? 0 : 1) })); })}>Flip</button>
          {flips.h + flips.t > 0 && <p className="tool-hint">Heads {flips.h} · Tails {flips.t}</p>}
        </>
      )}
      {tab === "pick" && (
        <>
          <textarea value={list} onChange={(e) => setList(e.target.value)} rows={5} placeholder={"One per line (or comma separated)\nAna\nBen\nCal"} />
          <div className={`pick-out ${spin ? "spin" : ""}`}>{picked || "…"}</div>
          <button className="btn btn-primary" disabled={items.length < 2} onClick={() => animate(() => setPicked(items[rand(items.length)]))}>Pick one</button>
        </>
      )}
      {tab === "number" && (
        <>
          <div className="tool-row center">
            <input className="num-in" type="number" value={range.min} onChange={(e) => setRange({ ...range, min: Number(e.target.value) })} aria-label="From" />
            to
            <input className="num-in" type="number" value={range.max} onChange={(e) => setRange({ ...range, max: Number(e.target.value) })} aria-label="To" />
          </div>
          <div className={`pick-out big ${spin ? "spin" : ""}`}>{num ?? "?"}</div>
          <button className="btn btn-primary" disabled={!(range.max >= range.min)} onClick={() => animate(() => setNum(Math.floor(range.min) + rand(Math.floor(range.max) - Math.floor(range.min) + 1)))}>Go</button>
        </>
      )}
    </div>
  );
}

/* ---------- random teams ---------- */
export function TeamMaker() {
  const [names, setNames] = useToolState("teams", "names", "");
  const [count, setCount] = useToolState("teams", "count", 2);
  const [teams, setTeams] = useState<string[][]>([]);
  const { copied, copy } = useCopy();
  const people = names.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  const make = () => {
    const shuffled = [...people];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = rand(i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const out: string[][] = Array.from({ length: count }, () => []);
    shuffled.forEach((p, i) => out[i % count].push(p));
    setTeams(out);
  };
  const text = teams.map((t, i) => `Team ${i + 1}: ${t.join(", ")}`).join("\n");
  return (
    <div>
      <textarea value={names} onChange={(e) => setNames(e.target.value)} rows={6} placeholder={"Names, one per line\nAna\nBen\nCal\nDev"} />
      <div className="tool-row">
        <label>Teams <input className="num-in" type="number" min={2} max={12} value={count} onChange={(e) => setCount(Math.max(2, Math.min(12, Number(e.target.value) || 2)))} /></label>
        <span className="muted-inline">{people.length} people</span>
        <button className="btn btn-primary btn-sm" disabled={people.length < count} onClick={make}>Make teams</button>
      </div>
      {teams.length > 0 && (
        <>
          <div className="teams">
            {teams.map((t, i) => <div key={i} className="team"><strong>Team {i + 1}</strong>{t.map((p) => <span key={p}>{p}</span>)}</div>)}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => copy(text)}>{copied === text ? "Copied!" : "Copy teams"}</button>
        </>
      )}
    </div>
  );
}
