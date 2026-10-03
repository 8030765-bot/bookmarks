"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Health {
  ok: boolean;
  db: "ok" | "down" | "quota";
  dbMs: number;
  rev?: number;
  version: string;
  region: string;
  time: string;
  error?: string;
}

const DB_TEXT: Record<Health["db"], string> = {
  ok: "Working",
  down: "Can't be reached",
  quota: "Free usage limit reached — changes are paused until it resets",
};

/** Is the site up? Checks the server and the database every 15 seconds. */
export default function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [siteUp, setSiteUp] = useState<boolean | null>(null);
  const [checked, setChecked] = useState<Date | null>(null);
  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setHealth(await res.json());
      setSiteUp(true);
    } catch {
      setHealth(null);
      setSiteUp(false);
    }
    setChecked(new Date());
  }, []);
  useEffect(() => {
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, [check]);

  const rows: [string, boolean | null, string][] = [
    ["Website", siteUp, siteUp === null ? "Checking…" : siteUp ? "Up" : "Can't be reached (or you're offline)"],
    ["Database", health ? health.db === "ok" : siteUp === false ? false : null, health ? `${DB_TEXT[health.db]}${health.db === "ok" ? ` · ${health.dbMs} ms` : ""}` : "Checking…"],
  ];
  return (
    <div className="app">
      <header className="hero">
        <h1>Site status</h1>
        <p>{siteUp && health?.ok ? "Everything is working." : siteUp === null ? "Checking…" : "Something isn't working right now."}</p>
      </header>
      <div className="status-list">
        {rows.map(([label, good, text]) => (
          <div key={label} className="status-row">
            <span className={`status-dot ${good === null ? "" : good ? "good" : "bad"}`} />
            <strong>{label}</strong>
            <span>{text}</span>
          </div>
        ))}
      </div>
      <p className="status-meta">
        {health && <>Version {health.version} · server {health.region} · </>}
        {checked ? `last checked ${checked.toLocaleTimeString()}` : ""} ·{" "}
        <button className="link-btn" onClick={check}>check now</button>
      </p>
      <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
        <Link className="btn btn-secondary" href="/">Back to the bookmarks</Link>
      </div>
    </div>
  );
}
