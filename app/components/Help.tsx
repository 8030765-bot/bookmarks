"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import { APP_VERSION, RELEASES } from "./changelog-data";
import { readLocal, writeLocal } from "./ui";

/* ---------- report a bug / message an admin ---------- */
export function FeedbackModal({ kind, user, onClose, toast }: { kind: "bug" | "contact"; user: string | null; onClose: () => void; toast: (m: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, text, page: location.pathname + location.search, device: `${navigator.userAgent.slice(0, 120)} · ${innerWidth}×${innerHeight}` }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't send it");
      toast(kind === "bug" ? "Thanks — the admins will look into it" : "Sent — you'll get a notification when an admin replies");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send it");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={kind === "bug" ? "Report a bug" : "Message an admin"}>
        <h2>{kind === "bug" ? "🐞 Report a bug" : "✉️ Message an admin"}</h2>
        <p className="modal-text">
          {kind === "bug" ? "What went wrong? What did you expect to happen? We'll include which page you're on and your browser." : "Ask a question or tell the admins something. Only they can see it, and they can reply."}
        </p>
        {kind === "contact" && !user ? <p className="form-error">Log in first, so the admins can reply to you.</p> : (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} autoFocus
            placeholder={kind === "bug" ? "e.g. The Add button does nothing on my phone" : "Hi! Could we have a folder for…"} />
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || text.trim().length < 5 || (kind === "contact" && !user)} onClick={send}>{busy ? "Sending…" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 😀 😐 🙁 at the bottom of each page ---------- */
export function PageFeedback() {
  const [done, setDone] = useState<string | null>(null);
  const [page, setPage] = useState("");
  useEffect(() => {
    const p = location.pathname;
    setPage(p);
    const seen = readLocal<Record<string, string>>("pageFeedback", {});
    if (seen[p] === new Date().toDateString()) setDone("thanks");
  }, []);
  if (!page || page.startsWith("/embed") || new URLSearchParams(typeof location !== "undefined" ? location.search : "").get("popout")) return null;
  const vote = (value: string) => {
    setDone(value);
    const seen = readLocal<Record<string, string>>("pageFeedback", {});
    writeLocal("pageFeedback", { ...seen, [page]: new Date().toDateString() });
    fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "rating", page, value }) }).catch(() => {});
  };
  return (
    <div className="page-feedback" role="group" aria-label="How is this page?">
      {done ? <span>Thanks for telling us! 💜</span> : (
        <>
          <span>How&apos;s this page?</span>
          <button onClick={() => vote("good")} aria-label="Good" title="Good">😀</button>
          <button onClick={() => vote("ok")} aria-label="Okay" title="Okay">😐</button>
          <button onClick={() => vote("bad")} aria-label="Not good" title="Not good">🙁</button>
        </>
      )}
    </div>
  );
}

/* ---------- "what's new" after each update ---------- */
export function useWhatsNewAfterUpdate() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const seen = readLocal<string | null>("seenVersion", null);
    if (seen === null) { writeLocal("seenVersion", APP_VERSION); return; } // first visit: nothing is "new" yet
    if (seen !== APP_VERSION) setShow(true);
  }, []);
  const close = () => { setShow(false); writeLocal("seenVersion", APP_VERSION); };
  return { show, close };
}
export function WhatsNewPopup({ onClose }: { onClose: () => void }) {
  const r = RELEASES[0];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="What's new">
        <h2>✨ New in version {r.version}: {r.title}</h2>
        <ul className="whatsnew-list">{r.items.map((i) => <li key={i}>{i}</li>)}</ul>
        <div className="modal-actions">
          <a className="btn btn-secondary" href="/changelog">Everything that changed</a>
          <button className="btn btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- a quick tour for first-time visitors ---------- */
const STEPS: { sel: string; title: string; text: string }[] = [
  { sel: ".hero h1", title: "Welcome! 👋", text: "This is the class's shared list of websites. Everyone sees the same list — and you can add to it." },
  { sel: ".search-box input, .topbar input", title: "Find anything", text: "Search by name, tag or website. Typos are fine. Press / to jump here from anywhere." },
  { sel: ".actions-left .btn-primary, .bottom-nav .bn-add", title: "Add a website", text: "Found something useful? Add it for everyone. You can also paste a link anywhere on the page." },
  { sel: ".fh-actions", title: "Folders", text: "Each folder has its own menu (⋯): follow it, sort it, filter it, share it or add your own private note." },
  { sel: ".top-actions", title: "More to explore", text: "Chat, tools (O), your account and the ⋯ menu live up here. Press ? to see every keyboard shortcut." },
];
export function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const step = STEPS[i];
  useLayoutEffect(() => {
    const el = Array.from(document.querySelectorAll<HTMLElement>(step.sel)).find((x) => x.offsetParent !== null);
    if (!el) { setBox(null); return; }
    el.scrollIntoView({ block: "center", behavior: "auto" });
    const r = el.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step.sel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onDone(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onDone]);
  const below = !box || box.top < window.innerHeight / 2;
  const cardTop = box ? (below ? box.top + box.height + 12 : Math.max(12, box.top - 12)) : window.innerHeight / 2 - 80;
  return (
    <div className="tour" role="dialog" aria-label="Quick tour">
      {box && <div className="tour-ring" style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }} />}
      <div className="tour-card" style={{ top: cardTop, transform: box && !below ? "translateY(-100%)" : undefined }}>
        <div className="tour-step">{i + 1} of {STEPS.length}</div>
        <strong>{step.title}</strong>
        <p>{step.text}</p>
        <div className="tour-actions">
          <button className="link-btn" onClick={onDone}>Skip</button>
          {i > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn btn-primary btn-sm" onClick={() => (i + 1 < STEPS.length ? setI(i + 1) : onDone())} autoFocus>{i + 1 < STEPS.length ? "Next" : "Done"}</button>
        </div>
      </div>
    </div>
  );
}
/** First visit: offer the tour; afterwards, a one-time keyboard tip on computers. */
export function useFirstVisit() {
  const [tour, setTour] = useState(false);
  const [keyTip, setKeyTip] = useState(false);
  useEffect(() => {
    const visits = readLocal<number>("visits", 0) + 1;
    writeLocal("visits", visits);
    if (!readLocal("toured", false) && visits === 1) setTimeout(() => setTour(true), 1200);
    else if (visits >= 2 && visits <= 4 && !readLocal("keyTipSeen", false) && window.matchMedia("(pointer: fine)").matches) setKeyTip(true);
  }, []);
  return {
    tour, startTour: () => setTour(true),
    endTour: () => { setTour(false); writeLocal("toured", true); },
    keyTip, endKeyTip: () => { setKeyTip(false); writeLocal("keyTipSeen", true); },
  };
}

/* ---------- "you're leaving the site" for websites that aren't on the list ---------- */
export function useLeaveWarning(on: boolean, knownHosts: () => Set<string>) {
  useEffect(() => {
    if (!on) return;
    const h = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented) return;
      let url: URL;
      try { url = new URL(a.href, location.href); } catch { return; }
      if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
      const host = url.hostname.replace(/^www\./, "");
      if (knownHosts().has(host)) return;
      if (!confirm(`You're leaving the site for ${host}, which isn't on the shared list.\n\nOnly continue if you trust it.`)) e.preventDefault();
    };
    document.addEventListener("click", h, true);
    return () => document.removeEventListener("click", h, true);
  }, [on, knownHosts]);
}
