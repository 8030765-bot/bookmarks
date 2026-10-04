"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/** A short buzz on phones that support it (if you haven't turned it off). */
export function buzz(ms: number | number[] = 12) {
  try {
    if (document.documentElement.getAttribute("data-haptics") === "off") return;
    navigator.vibrate?.(ms);
  } catch {
    // no vibration here
  }
}

/* ---------- bottom navigation (phones) ---------- */
export function BottomNav({ onHome, onSearch, onAdd, onChat, onMore, chatOpen, unread }: {
  onHome: () => void; onSearch: () => void; onAdd: () => void; onChat: () => void; onMore: () => void; chatOpen: boolean; unread: number;
}) {
  const tap = (fn: () => void) => () => { buzz(8); fn(); };
  return (
    <nav className="bottom-nav" aria-label="Main">
      <button onClick={tap(onHome)} aria-label="Home"><Icon name="home" /><span>Home</span></button>
      <button onClick={tap(onSearch)} aria-label="Search"><Icon name="search" /><span>Search</span></button>
      <button className="bn-add" onClick={tap(onAdd)} aria-label="Add a website"><Icon name="plus" /></button>
      <button className={chatOpen ? "on" : ""} onClick={tap(onChat)} aria-label="Chat"><Icon name="chat" /><span>Chat</span></button>
      <button onClick={tap(onMore)} aria-label="More">
        <Icon name="more" /><span>More</span>
        {unread > 0 && <em className="bn-dot" aria-label={`${unread} unread`}>{unread > 9 ? "9+" : unread}</em>}
      </button>
    </nav>
  );
}

/* ---------- pull to refresh ---------- */
export function usePullToRefresh(onRefresh: () => Promise<unknown> | void) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const latest = useRef(0);
  const fn = useRef(onRefresh);
  fn.current = onRefresh;
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const down = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      // only from the very top of the page, and not inside something that scrolls itself
      if (window.scrollY > 0 || t.closest(".modal, .drawer, .chat-panel, .admin-panel, .today-row, .quick-row, .folder-nav, input, textarea")) { start.current = null; return; }
      start.current = e.touches[0].clientY;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      latest.current = dy > 0 ? Math.min(110, dy * 0.5) : 0;
      setPull(latest.current);
    };
    const up = () => {
      if (start.current === null) return;
      start.current = null;
      const p = latest.current;
      latest.current = 0;
      setPull(0);
      if (p >= 60) {
        buzz(15);
        setBusy(true);
        Promise.resolve(fn.current()).finally(() => setTimeout(() => setBusy(false), 400));
      }
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => { window.removeEventListener("touchstart", down); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", up); };
  }, []);
  return { pull, busy };
}
export function PullIndicator({ pull, busy }: { pull: number; busy: boolean }) {
  if (!pull && !busy) return null;
  return (
    <div className="ptr" style={{ height: busy ? 44 : pull }} aria-live="polite">
      <span className={`ptr-spin ${busy || pull >= 60 ? "ready" : ""}`} style={{ transform: busy ? undefined : `rotate(${pull * 3}deg)` }}>↻</span>
      <span className="ptr-text">{busy ? "Refreshing…" : pull >= 60 ? "Let go to refresh" : "Pull to refresh"}</span>
    </div>
  );
}

/* ---------- install instructions for each kind of device ---------- */
type Device = "iphone" | "android" | "desktop";
function guessDevice(): Device {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}
export function InstallModal({ canInstall, onInstall, onClose }: { canInstall: boolean; onInstall: () => void; onClose: () => void }) {
  const [device, setDevice] = useState<Device>("desktop");
  useEffect(() => { setDevice(guessDevice()); }, []);
  const installed = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
  const STEPS: Record<Device, { label: string; steps: string[] }> = {
    iphone: { label: "iPhone / iPad", steps: ["Open this site in Safari.", "Tap the Share button (the square with an arrow).", "Scroll down and tap “Add to Home Screen”.", "Tap “Add”. It now opens like an app."] },
    android: { label: "Android", steps: ["Open this site in Chrome.", "Tap the ⋮ menu at the top right.", "Tap “Install app” (or “Add to Home screen”).", "Tap “Install”. You can share links into it from other apps."] },
    desktop: { label: "Computer", steps: ["Open this site in Chrome or Edge.", "Click the install icon at the right of the address bar (a screen with a down arrow), or open the ⋮ / … menu.", "Choose “Install Theo's Bookmarks”.", "It opens in its own window and can be pinned to your taskbar or dock."] },
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Install the app">
        <h2>📲 Install the app</h2>
        {installed ? <p className="modal-text">You&apos;re already using the installed app. 🎉</p> : (
          <>
            <p className="modal-text">Put the site on your home screen or desktop. It opens full-screen, works offline with your saved copy, and you can share links straight into it.</p>
            {canInstall && <button className="btn btn-primary" onClick={onInstall}><Icon name="download" /> Install now</button>}
            <div className="seg te-tabs" role="tablist">
              {(Object.keys(STEPS) as Device[]).map((d) => <button key={d} role="tab" aria-selected={device === d} className={device === d ? "on" : ""} onClick={() => setDevice(d)}>{STEPS[d].label}</button>)}
            </div>
            <ol className="install-steps">{STEPS[device].steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </>
        )}
        <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
