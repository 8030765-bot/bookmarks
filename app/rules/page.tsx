"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "../components/Icon";
import Markdown from "../components/Markdown";
import { DEFAULT_RULES } from "../components/rules-data";

/** The site rules — new members agree to these when they sign up. */
export default function RulesPage() {
  const [rules, setRules] = useState<string | null>(null);
  useEffect(() => {
    document.title = "Site rules · Theo's Bookmarks";
    fetch("/api/bookmarks").then((r) => r.json()).then((j) => setRules(j.settings?.rules || DEFAULT_RULES)).catch(() => setRules(DEFAULT_RULES));
  }, []);
  return (
    <div className="app doc-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/"><Icon name="up" /> Bookmarks</Link>
        <Link className="btn btn-secondary btn-sm" href="/help">Help</Link>
      </div>
      <main id="main" className="doc">
        {rules === null ? <div className="skeleton skel-row" /> : <Markdown text={rules} />}
      </main>
    </div>
  );
}
