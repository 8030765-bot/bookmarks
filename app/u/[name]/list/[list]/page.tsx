"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Favicon from "../../../../components/Favicon";
import { Icon } from "../../../../components/Icon";
import { Avatar } from "../../../../components/People";
import { hostOf, safeHref } from "../../../../components/ui";

interface SharedList { user: string; list: string; links: { id: string; name: string; url: string }[]; mine: boolean }

/** Someone's shared My Stuff folder (for people who are logged in). */
export default function ListPage() {
  const params = useParams<{ name: string; list: string }>();
  const name = decodeURIComponent(params?.name || "");
  const list = decodeURIComponent(params?.list || "");
  const [data, setData] = useState<SharedList | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    setError("");
    fetch(`/api/lists?user=${encodeURIComponent(name)}&list=${encodeURIComponent(list)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Couldn't load that list"); return j; })
      .then(setData)
      .catch((e) => setError(e.message || "Couldn't load that list"));
  }, [name, list]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { document.title = `${list} · ${name} · Theo's Bookmarks`; }, [list, name]);

  async function report() {
    const reason = prompt(`What's wrong with this list?`);
    if (!reason?.trim()) return;
    const res = await fetch("/api/reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "user", targetId: name, targetName: `${name}'s list “${list}”`, reason, extra: `list:${list}` }),
    });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Thanks — a moderator will take a look" : j.error || "Couldn't send that");
  }

  return (
    <div className="app list-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/"><Icon name="up" /> Bookmarks</Link>
        <Link className="btn btn-secondary btn-sm" href={`/u/${encodeURIComponent(name)}`}><Icon name="user" /> {name}</Link>
      </div>
      {!data && !error && <div className="skeleton skel-row" style={{ height: 120 }} />}
      {error && (
        <div className="empty-state">
          <div className="empty-emoji">🔒</div>
          <h3>{error}</h3>
          {/log in/i.test(error) ? <p><Link className="btn btn-primary" href="/?login=1">Log in</Link></p> : <button className="btn btn-secondary" onClick={load}>Try again</button>}
        </div>
      )}
      {data && (
        <>
          <header className="list-head">
            <Avatar name={data.user} size={40} />
            <div>
              <h1>🌐 {data.list}</h1>
              <p className="muted-inline">{data.links.length} website{data.links.length === 1 ? "" : "s"} shared by <Link href={`/u/${encodeURIComponent(data.user)}`}>{data.user}</Link> · not checked by the site&apos;s moderators</p>
            </div>
            <div className="pp-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(location.href).then(() => setMsg("Link copied ✓")).catch(() => {})}><Icon name="copy" /> Copy link</button>
              {!data.mine && <button className="btn btn-secondary btn-sm" onClick={report}>🚩 Report</button>}
            </div>
          </header>
          {msg && <p className="hint">{msg}</p>}
          <div className="cards">
            {data.links.map((l) => (
              <a key={l.id} className="card" href={safeHref(l.url)} target="_blank" rel="noopener noreferrer">
                <span className="card-main">
                  <span className="card-icon"><Favicon url={l.url} name={l.name} size={22} /></span>
                  <span className="card-body">
                    <span className="card-name"><span className="card-title">{l.name}</span></span>
                    <span className="card-host">{hostOf(l.url)}</span>
                  </span>
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
