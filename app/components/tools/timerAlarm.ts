"use client";
import { useEffect } from "react";
import { readLocal } from "../ui";
import { beep, writeToolState } from "./shared";

export interface TimerState {
  mode: "focus" | "break" | "custom";
  /** running: when it ends (ms since epoch) */
  endAt?: number;
  /** paused/stopped: how long is left (ms) */
  left: number;
  focusMin: number;
  breakMin: number;
  customMin: number;
  rounds: number;
  /** the endAt we've already rung for */
  rang?: number;
}
export const TIMER_DEFAULT: TimerState = { mode: "focus", left: 25 * 60_000, focusMin: 25, breakMin: 5, customMin: 10, rounds: 0 };
export const minsFor = (s: TimerState, mode = s.mode) => (mode === "focus" ? s.focusMin : mode === "break" ? s.breakMin : s.customMin);

/**
 * Rings when the timer ends, even if the drawer is closed. Mounted once on
 * the page (and in a pop-out window), it moves Focus → Break and back.
 */
export function useTimerAlarm(onDone: (msg: string) => void) {
  useEffect(() => {
    const id = setInterval(() => {
      const s = readLocal<TimerState | null>("tool:timer:state", null);
      if (!s?.endAt || s.endAt > Date.now() || s.rang === s.endAt) return;
      const nextMode = s.mode === "focus" ? "break" : s.mode === "break" ? "focus" : "custom";
      const next: TimerState = { ...s, rang: s.endAt, endAt: undefined, mode: nextMode, left: minsFor(s, nextMode) * 60_000, rounds: s.mode === "focus" ? s.rounds + 1 : s.rounds };
      writeToolState("timer", "state", next);
      const msg = s.mode === "focus" ? "Focus time's up — take a break! ☕" : s.mode === "break" ? "Break's over — back to it! 💪" : "⏰ Timer done";
      [0, 300, 600].forEach((d) => setTimeout(() => beep(880, 180), d));
      onDone(msg);
      try {
        if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") new Notification(msg);
      } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, [onDone]);
}

