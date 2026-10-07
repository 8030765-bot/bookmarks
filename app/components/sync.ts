"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * One poll for the whole page. /api/sync returns a small change counter per
 * kind of data; each part of the page re-downloads only when its counter
 * moves. Polls every 2.5s while you're using the page, every 10s when idle,
 * and not at all while the tab is hidden.
 */
export type Revs = { bookmarks: number; chat: number; ratings: number; suggestions: number; faces: number; user: number };
export type SyncStatus = "ok" | "offline" | "quota";

const ACTIVE_MS = 2500;
const IDLE_MS = 10_000;
const IDLE_AFTER_MS = 60_000;

let revs: Revs = { bookmarks: -1, chat: -1, ratings: -1, suggestions: -1, faces: -1, user: -1 };
let status: SyncStatus = "ok";
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

let fastHolds = 0;
/** Keep polling at full speed (e.g. while chat is open) until the returned function is called. */
export function holdFast() {
  fastHolds++;
  return () => { fastHolds = Math.max(0, fastHolds - 1); };
}

export function useRev(name: keyof Revs) {
  return useSyncExternalStore(subscribe, () => revs[name], () => -1);
}
export function useSyncStatus() {
  return useSyncExternalStore(subscribe, () => status, () => "ok" as SyncStatus);
}
/** Mark the connection state from outside the loop (e.g. a failed save). */
export function reportStatus(next: SyncStatus) {
  if (status !== next) { status = next; emit(); }
}

/** Calls `cb` whenever the named counter changes after the first value arrives. */
export function useOnRevChange(name: keyof Revs, cb: (rev: number) => void) {
  const rev = useRev(name);
  const prev = useRef(rev);
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (prev.current !== -1 && rev !== prev.current) cbRef.current(rev);
    prev.current = rev;
  }, [rev]);
}

/** Runs the poll loop. Mount once, near the top of the page. */
export function useSyncLoop(user: string | null) {
  const userRef = useRef(user);
  userRef.current = user;
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastActive = Date.now();
    let inFlight = false;

    const poll = async () => {
      clearTimeout(timer);
      if (stopped) return;
      if (document.visibilityState === "visible" && !inFlight) {
        inFlight = true;
        try {
          const u = userRef.current;
          const res = await fetch(`/api/sync${u ? `?u=${encodeURIComponent(u)}` : ""}`, { cache: "no-store" });
          const json = await res.json().catch(() => ({}));
          if (res.ok) {
            const next: Revs = {
              bookmarks: Number(json.bookmarks) || 0,
              chat: Number(json.chat) || 0,
              ratings: Number(json.ratings) || 0,
              suggestions: Number(json.suggestions) || 0,
              faces: Number(json.faces) || 0,
              user: Number(json.user) || 0,
            };
            const changed = (Object.keys(next) as (keyof Revs)[]).some((k) => next[k] !== revs[k]);
            if (changed) revs = next;
            const nextStatus: SyncStatus = "ok";
            if (changed || status !== nextStatus) { status = nextStatus; emit(); }
          } else {
            reportStatus(json.quota ? "quota" : res.status >= 500 ? "offline" : status);
          }
        } catch {
          reportStatus("offline");
        } finally {
          inFlight = false;
        }
      }
      if (stopped) return;
      const idle = Date.now() - lastActive > IDLE_AFTER_MS && fastHolds === 0;
      timer = setTimeout(poll, idle ? IDLE_MS : ACTIVE_MS);
    };

    const wake = () => {
      const wasIdle = Date.now() - lastActive > IDLE_AFTER_MS;
      lastActive = Date.now();
      if (wasIdle) poll(); // catch up immediately when someone comes back
    };
    const onVisible = () => { if (document.visibilityState === "visible") { lastActive = Date.now(); poll(); } };
    const onOnline = () => poll();
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, wake));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // a login/logout changes which account counter we watch
  useEffect(() => {
    revs = { ...revs, user: -1 };
    emit();
  }, [user]);
}
