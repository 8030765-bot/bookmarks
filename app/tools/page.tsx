"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "../components/Icon";
import { TOOLS, ToolView, popOut, toolById } from "../components/tools/ToolsDrawer";
import { ToolsProvider } from "../components/tools/shared";
import { useTimerAlarm } from "../components/tools/timerAlarm";

export default function ToolsPage() {
  return <Suspense fallback={<div className="app"><div className="skeleton skel-row" /></div>}><ToolsInner /></Suspense>;
}

/** All the tools on one page — or, with ?tool=…&popout=1, one tool in a small window of its own. */
function ToolsInner() {
  const params = useSearchParams();
  const popout = params.get("popout") === "1";
  const [user, setUser] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(params.get("tool"));
  const [toast, setToast] = useState("");
  const onDone = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(""), 5000); }, []);
  useTimerAlarm(onDone);
  useEffect(() => {
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((j) => setUser(j.user || null)).catch(() => {});
  }, []);
  const tool = toolById(current);
  useEffect(() => { document.title = tool ? `${tool.emoji} ${tool.name}` : "Tools · Theo's Bookmarks"; }, [tool]);

  if (popout && tool) {
    return (
      <div className="tool-popout">
        <ToolsProvider user={user}><ToolView tool={tool} user={user} popout /></ToolsProvider>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    );
  }
  return (
    <div className="app tools-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/"><Icon name="up" /> Bookmarks</Link>
      </div>
      <header className="hero">
        <h1>Tools</h1>
        <p>Timers, notes, flashcards, a calculator and more. Your notes, to-dos, habits and flashcards are private.</p>
      </header>
      <ToolsProvider user={user}>
        {tool ? (
          <div className="tools-page-tool">
            <ToolView tool={tool} user={user} onBack={() => { setCurrent(null); window.history.replaceState(null, "", "/tools"); }} />
          </div>
        ) : (
          <div className="tools-page-grid">
            {TOOLS.map((t) => (
              <div key={t.id} className="tool-card">
                <button className="tool-tile" onClick={() => { setCurrent(t.id); window.history.replaceState(null, "", `/tools?tool=${t.id}`); }}>
                  <span className="tt-emoji">{t.emoji}</span><span>{t.name}</span>
                </button>
                <button className="btn-icon sm" title="Pop out" aria-label={`Pop out ${t.name}`} onClick={() => popOut(t.id)}><Icon name="popout" /></button>
              </div>
            ))}
          </div>
        )}
      </ToolsProvider>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
