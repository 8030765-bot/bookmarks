"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { readLocal, writeLocal } from "../ui";

/**
 * Two kinds of tool memory:
 * - useToolState: "where you left off" on this device (calculator screen,
 *   chosen units, timer…), kept in localStorage.
 * - useSynced: your own stuff (notes, to-dos, habits, flashcards,
 *   countdowns) — saved to your account when you're logged in, so it's on
 *   every device; kept on this device for guests.
 */
export function useToolState<T>(tool: string, key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const storeKey = `tool:${tool}:${key}`;
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    setValue(readLocal<T>(storeKey, initial));
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  // stay in step with the same tool in a pop-out window (or the timer alarm)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === storeKey) setValue(readLocal<T>(storeKey, initial)); };
    const onLocal = (e: Event) => { if ((e as CustomEvent).detail === storeKey) setValue(readLocal<T>(storeKey, initial)); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("tool-state", onLocal);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("tool-state", onLocal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
      writeLocal(storeKey, next);
      return next;
    });
  }, [storeKey]);
  return [value, set];
}
/** Change a tool's saved state from outside the tool (tells any open copy of it). */
export function writeToolState(tool: string, key: string, value: unknown) {
  writeLocal(`tool:${tool}:${key}`, value);
  window.dispatchEvent(new CustomEvent("tool-state", { detail: `tool:${tool}:${key}` }));
}

interface ToolsData {
  user: string | null;
  data: Record<string, unknown> | null;
  save: (tool: string, value: unknown) => void;
  error: string;
}
const ToolsContext = createContext<ToolsData>({ user: null, data: null, save: () => {}, error: "" });

/** Loads your saved tool data once and saves changes a moment after you stop typing. */
export function ToolsProvider({ user, children }: { user: string | null; children: React.ReactNode }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    if (!user) { setData({}); return; }
    setData(null);
    fetch("/api/tools?data=1", { cache: "no-store" }).then((r) => r.json()).then((j) => setData(j.data || {})).catch(() => setData({}));
  }, [user]);
  const save = useCallback((tool: string, value: unknown) => {
    setData((d) => ({ ...(d || {}), [tool]: value }));
    if (!user) { writeLocal(`tooldata:${tool}`, value); return; }
    clearTimeout(timers.current[tool]);
    timers.current[tool] = setTimeout(async () => {
      try {
        const res = await fetch("/api/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, value }) });
        const j = await res.json().catch(() => ({}));
        setError(res.ok ? "" : j.error || "Couldn't save");
      } catch {
        setError("Offline — your changes will be saved when you're back online");
        writeLocal(`tooldata:${tool}`, value);
      }
    }, 800);
  }, [user]);
  return <ToolsContext.Provider value={{ user, data, save, error }}>{children}</ToolsContext.Provider>;
}

export function useSynced<T>(tool: string, initial: T): { value: T; set: (v: T) => void; ready: boolean; error: string; signedIn: boolean } {
  const ctx = useContext(ToolsContext);
  const ready = ctx.data !== null;
  let value = initial;
  if (ready) {
    const fromServer = ctx.user ? (ctx.data![tool] as T | undefined) : undefined;
    value = fromServer ?? (ctx.data![tool] as T | undefined) ?? readLocal<T>(`tooldata:${tool}`, initial);
  }
  return { value, set: (v: T) => ctx.save(tool, v), ready, error: ctx.error, signedIn: !!ctx.user };
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Copy text and say so briefly. */
export function useCopy() {
  const [copied, setCopied] = useState("");
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(text); setTimeout(() => setCopied(""), 1200); }).catch(() => {});
  };
  return { copied, copy };
}

/** Plays a short tone (for timers and the metronome). */
let audio: AudioContext | null = null;
export function beep(freq = 880, ms = 160, volume = 0.15) {
  try {
    audio ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
    osc.stop(audio.currentTime + ms / 1000 + 0.02);
  } catch {
    // no sound available
  }
}

export function fmtDuration(ms: number, showTenths = false) {
  const neg = ms < 0;
  ms = Math.abs(ms);
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const t = Math.floor((ms % 1000) / 100);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${neg ? "-" : ""}${h ? `${h}:${pad(m)}` : m}:${pad(s)}${showTenths ? `.${t}` : ""}`;
}

/** Re-render every `ms` while `on`. */
export function useTick(on: boolean, ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [on, ms]);
}
