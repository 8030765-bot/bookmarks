"use client";
import { useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import type { PrivateLink } from "./Personal";
import { parseBookmarksHtml } from "./Community";
import { hostOf, nameFromUrl, safeHref } from "./ui";

/**
 * "My Stuff": private links only you can see, in your own little folders.
 * You can also pull in your browser's bookmarks file.
 */
export default function MyStuff({
  items,
  collapsed,
  newTab,
  onToggle,
  act,
  toast,
}: {
  items: PrivateLink[];
  collapsed: boolean;
  newTab: boolean;
  onToggle: () => void;
  act: (body: Record<string, unknown>) => Promise<any>;
  toast: (msg: string) => void;
}) {
  const folders = useMemo(() => Array.from(new Set(items.map((i) => i.folder || ""))).filter(Boolean).sort(), [items]);
  const [current, setCurrent] = useState<string>("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = current === "" ? items : items.filter((i) => (i.folder || "") === current);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    const j = await act({ action: "addMyStuff", name: name.trim() || nameFromUrl(url) || url, url, folder: folder || current });
    setBusy(false);
    if (j.error) { toast(j.error); return; }
    setUrl(""); setName("");
    toast("Saved privately — only you can see it");
  }
  async function importFile(file: File) {
    const folders = parseBookmarksHtml(await file.text());
    const list = folders.flatMap((f) => f.links.map((l) => ({ ...l, folder: f.name === "Imported" ? "" : f.name })));
    if (!list.length) { toast("No web links found in that file"); return; }
    const j = await act({ action: "importMyStuff", items: list });
    toast(j.error || `Imported ${j.added} links into My Stuff`);
  }

  return (
    <section className="folder-card my-stuff" style={{ "--folder-accent": "var(--accent)" } as React.CSSProperties}>
      <header className="fh">
        <button className="fh-toggle" onClick={onToggle} aria-expanded={!collapsed}>
          <span className={`chev ${collapsed ? "" : "open"}`}><Icon name="down" /></span>
          <span className="fh-emoji">🔒</span>
          <span className="fh-name">My Stuff</span>
          <span className="fh-count">{items.length}</span>
          <span className="fh-when">only you can see these</span>
        </button>
        <div className="fh-actions">
          <button className="btn-icon" title="Import your browser's bookmarks file (.html)" onClick={() => fileRef.current?.click()}><Icon name="upload" /></button>
          <input ref={fileRef} type="file" accept=".html,.htm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
        </div>
      </header>
      {!collapsed && (
        <div className="ms-body">
          {folders.length > 0 && (
            <div className="ms-folders">
              <button className={`pick ${current === "" ? "on" : ""}`} onClick={() => setCurrent("")}>All</button>
              {folders.map((f) => (
                <button key={f} className={`pick ${current === f ? "on" : ""}`} onClick={() => setCurrent(f)}
                  onDoubleClick={async () => { const to = prompt(`Rename the folder “${f}” to:`, f); if (to !== null && to.trim() !== f) { await act({ action: "renameMyStuffFolder", from: f, to }); setCurrent(to.trim()); } }}
                  title="Double-click to rename">
                  📁 {f} <em>{items.filter((i) => i.folder === f).length}</em>
                </button>
              ))}
            </div>
          )}
          <form className="ms-add" onSubmit={add}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link to keep privately" inputMode="url" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" maxLength={100} />
            <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={current || "Folder (optional)"} maxLength={40} list="ms-folder-list" />
            <datalist id="ms-folder-list">{folders.map((f) => <option key={f} value={f} />)}</datalist>
            <button className="btn btn-primary btn-sm" disabled={busy || !url.trim()}><Icon name="plus" /> Save</button>
          </form>
          {shown.length === 0 ? (
            <div className="folder-empty">Nothing here yet. Paste a link above, or import your browser&apos;s bookmarks file.</div>
          ) : (
            <div className="cards">
              {shown.map((l) => (
                <div key={l.id} className="card">
                  <a className="card-main" href={safeHref(l.url)} target={newTab ? "_blank" : undefined} rel="noopener noreferrer">
                    <span className="card-icon"><Favicon url={l.url} name={l.name} size={22} /></span>
                    <span className="card-body">
                      <span className="card-name"><span className="card-title">{l.name}</span></span>
                      <span className="card-host">{hostOf(l.url)}{l.folder && current === "" ? ` · 📁 ${l.folder}` : ""}</span>
                    </span>
                  </a>
                  <div className="card-actions">
                    <button className="ca" title="Move to a folder" onClick={async () => { const to = prompt("Move to which folder? (leave empty for none)", l.folder || ""); if (to !== null) await act({ action: "moveMyStuff", id: l.id, folder: to }); }}><Icon name="folder" /></button>
                    <button className="ca" title="Copy link" onClick={() => navigator.clipboard.writeText(l.url).then(() => toast("Link copied")).catch(() => {})}><Icon name="copy" /></button>
                    <button className="ca danger" title="Remove" onClick={() => act({ action: "removeMyStuff", id: l.id })}><Icon name="trash" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
