"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Favicon from "../../components/Favicon";
import { safeHref } from "../../components/ui";

interface PublicFolder { id: string; name: string; emoji: string; description?: string; links: { id: string; name: string; url: string; description?: string }[] }

/**
 * One folder as a small widget other sites can put in an <iframe>.
 * Shows only what a visitor who isn't logged in could see.
 */
export default function EmbedFolder() {
  const { id } = useParams<{ id: string }>();
  const [folder, setFolder] = useState<PublicFolder | null | undefined>(undefined);
  const [site, setSite] = useState("");
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    document.documentElement.setAttribute("data-theme", p.get("theme") === "light" ? "light" : "dark");
    fetch(`/api/public?folder=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { setFolder(j?.folders?.[0] || null); setSite(j?.title || ""); })
      .catch(() => setFolder(null));
  }, [id]);
  if (folder === undefined) return <div className="embed"><div className="skeleton skel-row" /></div>;
  if (!folder) return <div className="embed"><p className="muted-inline">This folder isn&apos;t available.</p></div>;
  return (
    <div className="embed">
      <div className="embed-head"><span>{folder.emoji}</span> <strong>{folder.name}</strong> <span className="muted-inline">{folder.links.length}</span></div>
      {folder.description && <p className="embed-desc">{folder.description}</p>}
      <ul className="embed-list">
        {folder.links.map((l) => (
          <li key={l.id}>
            <a href={safeHref(l.url)} target="_blank" rel="noopener noreferrer" title={l.description || l.url}>
              <Favicon url={l.url} name={l.name} size={18} /> <span>{l.name}</span>
            </a>
          </li>
        ))}
      </ul>
      <a className="embed-foot" href="/" target="_blank" rel="noopener">From {site || "Theo's Bookmarks"} ↗</a>
    </div>
  );
}
