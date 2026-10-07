"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "../components/Icon";
import { SHORTCUTS } from "../components/Modals";
import { FeedbackModal } from "../components/Help";
import { APP_VERSION } from "../components/changelog-data";

const FAQ: { q: string; a: string }[] = [
  { q: "How do I add a website?", a: "Press “Add website” (or + on a phone), paste the address and pick a folder. You can also paste a link anywhere on the page, drag one in from another tab, or use the “Add from any website” button from the ⋯ menu." },
  { q: "Why did my link go to “suggestions”?", a: "Sometimes the admins check new links first (for brand-new accounts, or when they've switched that on). You'll get a notification when it's approved." },
  { q: "How do I keep my own links private?", a: "Use My Stuff (in your account menu) for links only you can see, and private notes on any card. Favorites, read later and notes are only visible to you." },
  { q: "Can I use it on my phone?", a: "Yes — install it from the ⋯ menu (“Install the app”). Swipe a card right to star it, left to open it, and pull down to refresh." },
  { q: "A website doesn't work", a: "Open the card's details and press 🚩 Report a problem. The admins will check it." },
  { q: "How do I change how it looks?", a: "Press P or open Customize in the ⋯ menu: themes, fonts, text size, layout, effects, accessibility and Español." },
  { q: "Someone is being unkind", a: "Report the message (⋯ on the message → 🚩 Report) or block them. Moderators can mute or time people out." },
  { q: "I forgot my password", a: "Use “Forgot password?” on the log-in box with the recovery code you saved when you signed up. If you lost it, ask an admin to reset it." },
];

/** Help: common questions, keyboard shortcuts, and ways to reach the admins. */
export default function HelpPage() {
  const [user, setUser] = useState<string | null>(null);
  const [form, setForm] = useState<"bug" | "contact" | null>(null);
  const [toast, setToast] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    document.title = "Help · Theo's Bookmarks";
    fetch("/api/auth").then((r) => r.json()).then((j) => setUser(j.user || null)).catch(() => {});
    if (location.hash === "#contact") setForm("contact");
  }, []);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 4000); };
  const faq = FAQ.filter((f) => !q.trim() || `${f.q} ${f.a}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="app doc-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/"><Icon name="up" /> Bookmarks</Link>
      </div>
      <main id="main" className="doc">
        <h1>Help</h1>
        <div className="help-actions">
          <Link className="help-card" href="/?tour=1"><span>🧭</span><strong>Take the tour</strong><em>A one-minute look around</em></Link>
          <button className="help-card" onClick={() => setForm("bug")}><span>🐞</span><strong>Report a bug</strong><em>Something isn&apos;t working</em></button>
          <button className="help-card" id="contact" onClick={() => setForm("contact")}><span>✉️</span><strong>Message an admin</strong><em>Questions and ideas</em></button>
          <Link className="help-card" href="/rules"><span>📜</span><strong>Site rules</strong><em>How we keep it friendly</em></Link>
          <Link className="help-card" href="/privacy"><span>🔒</span><strong>Privacy</strong><em>What the site keeps</em></Link>
          <Link className="help-card" href="/changelog"><span>✨</span><strong>What&apos;s changed</strong><em>Version {APP_VERSION}</em></Link>
        </div>

        <h2>Questions</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the questions…" aria-label="Search the questions" />
        {faq.map((f) => (
          <details key={f.q} className="faq">
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
        {faq.length === 0 && <p className="muted-inline">No question matches — <button className="link-btn" onClick={() => setForm("contact")}>ask an admin</button>.</p>}

        <h2>Keyboard shortcuts</h2>
        <table className="shortcut-table">
          <tbody>{SHORTCUTS.map(([k, what]) => <tr key={k}><td><span className="kbd">{k}</span></td><td>{what}</td></tr>)}</tbody>
        </table>
      </main>
      {form && <FeedbackModal kind={form} user={user} onClose={() => setForm(null)} toast={say} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
