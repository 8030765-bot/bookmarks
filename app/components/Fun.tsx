"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "./ui";

/* ---------- secret themes you've unlocked ---------- */
const listeners = new Set<() => void>();
let unlockedCache: string[] | null = null;
const readUnlocked = () => (unlockedCache ??= readLocal<string[]>("unlocked", []));
const NONE: string[] = [];
export function useUnlocked() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    readUnlocked,
    () => NONE,
  );
}
/** Unlock a secret theme; tells the page (for a toast) the first time. */
export function unlock(palette: string, message: string) {
  const list = readUnlocked();
  if (list.includes(palette)) return false;
  unlockedCache = [...list, palette];
  writeLocal("unlocked", unlockedCache);
  listeners.forEach((f) => f());
  window.dispatchEvent(new CustomEvent("fun-toast", { detail: message }));
  confetti();
  return true;
}
export function funToast(message: string) {
  window.dispatchEvent(new CustomEvent("fun-toast", { detail: message }));
}

const reduced = () => document.documentElement.getAttribute("data-motion") === "off";

/* ---------- confetti, sparkles, fireworks (one shared canvas) ---------- */
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; kind: "dot" | "rect" | "star" }
let canvas: HTMLCanvasElement | null = null;
let particles: Particle[] = [];
let running = false;
function ensureCanvas() {
  if (canvas) return canvas;
  canvas = document.createElement("canvas");
  canvas.className = "fx-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const size = () => { canvas!.width = window.innerWidth * devicePixelRatio; canvas!.height = window.innerHeight * devicePixelRatio; };
  size();
  window.addEventListener("resize", size);
  return canvas;
}
function loop() {
  if (!canvas) return;
  const ctx = canvas.getContext("2d")!;
  const dpr = devicePixelRatio;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((p) => p.life < p.max);
  for (const p of particles) {
    p.life++;
    p.x += p.vx; p.y += p.vy;
    p.vy += p.kind === "rect" ? 0.12 : 0.05;
    p.vx *= 0.99;
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
    ctx.fillStyle = p.color;
    if (p.kind === "rect") ctx.fillRect(p.x * dpr, p.y * dpr, p.size * dpr, p.size * 0.6 * dpr);
    else { ctx.beginPath(); ctx.arc(p.x * dpr, p.y * dpr, p.size * dpr, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  if (particles.length) requestAnimationFrame(loop);
  else running = false;
}
function burst(list: Particle[]) {
  if (reduced()) return;
  ensureCanvas();
  particles.push(...list);
  if (particles.length > 900) particles = particles.slice(-900);
  if (!running) { running = true; requestAnimationFrame(loop); }
}
const COLORS = ["#ff5c7a", "#ffb84d", "#ffe066", "#3dd68c", "#4dabff", "#7c6cff", "#e879f9"];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export function confetti(x = window.innerWidth / 2, y = window.innerHeight / 3) {
  burst(Array.from({ length: 120 }, () => ({ x, y, vx: rnd(-7, 7), vy: rnd(-9, -2), life: 0, max: rnd(70, 120), color: COLORS[Math.floor(Math.random() * COLORS.length)], size: rnd(4, 8), kind: "rect" as const })));
}
export function sparkle(x: number, y: number) {
  const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#fff";
  burst(Array.from({ length: 10 }, () => ({ x, y, vx: rnd(-2.2, 2.2), vy: rnd(-2.5, 0.5), life: 0, max: rnd(25, 40), color, size: rnd(1.2, 2.6), kind: "dot" as const })));
}
export function firework() {
  const x = rnd(window.innerWidth * 0.15, window.innerWidth * 0.85);
  const y = rnd(window.innerHeight * 0.12, window.innerHeight * 0.45);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  burst(Array.from({ length: 70 }, (_, i) => {
    const a = (i / 70) * Math.PI * 2, sp = rnd(2, 5);
    return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(50, 80), color, size: rnd(1.5, 2.5), kind: "dot" as const };
  }));
}

/** Sparkles where you click (if you've turned them on). */
export function useSparkles(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const h = (e: MouseEvent) => sparkle(e.clientX, e.clientY);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [on]);
}

/** Fireworks once on New Year's (Dec 31 after 11pm, Jan 1). */
export function useNewYearFireworks() {
  useEffect(() => {
    const d = new Date();
    const on = (d.getMonth() === 0 && d.getDate() === 1) || (d.getMonth() === 11 && d.getDate() === 31 && d.getHours() >= 23);
    if (!on || sessionStorage.getItem("fireworks")) return;
    sessionStorage.setItem("fireworks", "1");
    let n = 0;
    const id = setInterval(() => { firework(); if (++n >= 8) clearInterval(id); }, 450);
    return () => clearInterval(id);
  }, []);
}

/* ---------- falling snow (December) ---------- */
export function Snow({ on }: { on: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!on || new Date().getMonth() !== 11 || reduced()) return;
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    const flakes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(1, 3), s: rnd(0.0005, 0.0018), d: rnd(-0.0004, 0.0004) }));
    const size = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    size();
    window.addEventListener("resize", size);
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = "rgba(255,255,255,.8)";
      for (const f of flakes) {
        f.y += f.s; f.x += f.d + Math.sin(f.y * 20) * 0.0003;
        if (f.y > 1) { f.y = -0.02; f.x = Math.random(); }
        ctx.beginPath(); ctx.arc(f.x * c.width, f.y * c.height, f.r, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    const onVis = () => { cancelAnimationFrame(raf); if (document.visibilityState === "visible") raf = requestAnimationFrame(draw); };
    raf = requestAnimationFrame(draw);
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", size); document.removeEventListener("visibilitychange", onVis); };
  }, [on]);
  if (!on) return null;
  return <canvas ref={ref} className="snow-canvas" aria-hidden="true" />;
}

/* ---------- Konami code ---------- */
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
export function useKonami() {
  useEffect(() => {
    let i = 0;
    const h = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      i = k === KONAMI[i] ? i + 1 : k === KONAMI[0] ? 1 : 0;
      if (i === KONAMI.length) {
        i = 0;
        if (!unlock("neon", "🕹️ Cheat code accepted! You unlocked the secret Neon theme — find it in Customize.")) { confetti(); funToast("🕹️ ↑↑↓↓←→←→BA — you already know the secret!"); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}

/** Click the logo 10 times in a row for a surprise. */
export function useLogoClicks() {
  const clicks = useRef<number[]>([]);
  return () => {
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t) => now - t < 4000), now];
    if (clicks.current.length >= 10) {
      clicks.current = [];
      if (!unlock("gold", "🏆 10 clicks! You unlocked the secret Gold theme — find it in Customize.")) { confetti(); funToast("🎉 Still clicking? You're dedicated."); }
      return true;
    }
    return false;
  };
}

/* ---------- the easter-egg hunt ---------- */
export const EGGS = ["footer", "wiki", "tools", "community", "changelog"] as const;
export function EasterEgg({ id }: { id: (typeof EGGS)[number] }) {
  const [found, setFound] = useState(true);
  useEffect(() => { setFound(readLocal<string[]>("eggs", []).includes(id)); }, [id]);
  if (found) return null;
  return (
    <button
      className="easter-egg"
      aria-label="A hidden egg!"
      title="?"
      onClick={(e) => {
        e.stopPropagation();
        const eggs = Array.from(new Set([...readLocal<string[]>("eggs", []), id]));
        writeLocal("eggs", eggs);
        setFound(true);
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        confetti(r.left + r.width / 2, r.top);
        if (eggs.length >= EGGS.length) unlock("galaxy", "🥚 You found all the eggs! The secret Galaxy theme is yours — see Customize.");
        else funToast(`🥚 You found a hidden egg! ${eggs.length} of ${EGGS.length}`);
      }}
    >🥚</button>
  );
}

/* ---------- the site pet: grows as the community adds links ---------- */
const STAGES: { min: number; face: string; name: string }[] = [
  { min: 0, face: "🥚", name: "an egg" },
  { min: 10, face: "🐣", name: "just hatched" },
  { min: 25, face: "🐥", name: "a chick" },
  { min: 60, face: "🐤", name: "growing up" },
  { min: 120, face: "🐦", name: "a little bird" },
  { min: 250, face: "🦜", name: "a parrot" },
  { min: 500, face: "🦅", name: "an eagle" },
  { min: 1000, face: "🐉", name: "a dragon!" },
];
export function SitePet({ links }: { links: number }) {
  const [hearts, setHearts] = useState<number[]>([]);
  const i = STAGES.reduce((n, s, k) => (links >= s.min ? k : n), 0);
  const stage = STAGES[i];
  const next = STAGES[i + 1];
  return (
    <button
      className="site-pet"
      title={`Bookie is ${stage.name}. ${next ? `${next.min - links} more websites until it grows!` : "Fully grown!"}`}
      aria-label={`Site pet Bookie, ${stage.name}. Pet it.`}
      onClick={() => { const id = Date.now(); setHearts((h) => [...h, id].slice(-6)); setTimeout(() => setHearts((h) => h.filter((x) => x !== id)), 1000); }}
    >
      <span className="pet-face">{stage.face}</span>
      <span className="pet-label">Bookie{next && <span className="pet-bar"><span style={{ width: `${Math.round(((links - stage.min) / (next.min - stage.min)) * 100)}%` }} /></span>}</span>
      {hearts.map((h) => <span key={h} className="pet-heart" aria-hidden="true">❤️</span>)}
    </button>
  );
}

/* ---------- "What's this?" mode ---------- */
/**
 * Click anything to find out what it does, instead of doing it. Uses each
 * element's hint, tooltip or label. Esc or the banner button turns it off.
 */
export function HintMode({ on, onOff }: { on: boolean; onOff: () => void }) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!on) { setTip(null); return; }
    document.documentElement.setAttribute("data-hints", "on");
    const describe = (el: HTMLElement | null): string => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (n.closest(".hint-banner")) return "";
        const t = n.getAttribute("data-hint") || n.getAttribute("title") || n.getAttribute("aria-label");
        if (t) return t;
        if (n.matches("button, a, select, input, textarea, [role=button], [role=tab]")) {
          const txt = (n.textContent || (n as HTMLInputElement).placeholder || "").trim();
          if (txt) return `“${txt.slice(0, 60)}”`;
        }
      }
      return "";
    };
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest(".hint-banner")) return;
      e.preventDefault();
      e.stopPropagation();
      const text = describe(el);
      setTip({ text: text || "Nothing to explain here — try a button or icon.", x: e.clientX, y: e.clientY });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onOff(); } };
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.documentElement.removeAttribute("data-hints");
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [on, onOff]);
  if (!on) return null;
  return (
    <>
      <div className="hint-banner" role="status">
        ❓ <strong>What&apos;s this?</strong> Click anything to see what it does. <button className="btn btn-secondary btn-sm" onClick={onOff}>Done</button>
      </div>
      {tip && (
        <div className="hint-tip" role="tooltip" style={{ left: Math.min(tip.x, window.innerWidth - 260), top: tip.y + 14 }}>{tip.text}</div>
      )}
    </>
  );
}

/* ---------- loading messages ---------- */
export const LOADING_LINES = [
  "Herding the bookmarks…", "Polishing the favicons…", "Asking the internet nicely…", "Counting all the links (twice)…",
  "Feeding the site pet…", "Untangling the tabs…", "Warming up the hamsters…", "Sorting folders alphabetically, then un-sorting them…",
  "Finding the good websites…", "Dusting off the search box…", "Loading… like it's 1999…", "Waking up the server…",
];
export function randomLoadingLine() {
  return LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];
}

/** Read text aloud with the device's voice. Returns false if there's no voice. */
export function speak(text: string) {
  try {
    if (!("speechSynthesis" in window)) return false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 1500));
    u.rate = 1;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
