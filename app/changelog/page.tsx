"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "../components/Icon";
import { EasterEgg } from "../components/Fun";

import { RELEASES } from "../components/changelog-data";

export default function ChangelogPage() {
  useEffect(() => { document.title = "Changelog · Theo's Bookmarks"; }, []);
  return (
    <div className="app changelog-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/"><Icon name="up" /> Bookmarks</Link>
        <Link className="btn btn-secondary btn-sm" href="/community"><Icon name="users" /> Community</Link>
      </div>
      <header className="hero">
        <h1>Changelog</h1>
        <p>What’s changed on the site. Have an idea? <Link href="/community?tab=roadmap">Post it on the roadmap</Link>.</p>
      </header>
      <div className="timeline">
        {RELEASES.map((r) => (
          <section key={`${r.date}-${r.title}`} className="release">
            <div className="release-head">
              <strong>{r.title}</strong>
              <span className="muted-inline">{new Date(`${r.date}-01T12:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            </div>
            <ul>{r.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </section>
        ))}
      </div>
      <p className="center"><EasterEgg id="changelog" /></p>
    </div>
  );
}
