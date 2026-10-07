"use client";
import { useMemo } from "react";
import { BookmarksData, Folder } from "@/lib/types";
import Favicon from "./Favicon";
import { hostOf, safeHref } from "./ui";

/* ---------- downloads ---------- */
function saveFile(name: string, content: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
/** Every folder as a Chrome / Edge / Firefox bookmarks file. */
export function downloadBookmarksHtml(data: BookmarksData) {
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n`;
  html += `  <DT><H3>${esc(data.settings?.title || "Theo's Bookmarks")}</H3>\n  <DL><p>\n`;
  for (const f of data.folders.filter((x) => !x.archived)) {
    html += `    <DT><H3>${esc(`${f.emoji} ${f.name}`)}</H3>\n    <DL><p>\n`;
    for (const l of f.links) html += `      <DT><A HREF="${esc(l.url)}"${l.createdAt ? ` ADD_DATE="${Math.floor(Date.parse(l.createdAt) / 1000)}"` : ""}>${esc(l.name)}</A>\n`;
    html += `    </DL><p>\n`;
  }
  saveFile(`bookmarks-${new Date().toISOString().slice(0, 10)}.html`, `${html}  </DL><p>\n</DL><p>\n`, "text/html");
}
/** One folder as a spreadsheet. */
export function downloadFolderCsv(folder: Folder) {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = ["name,url,tags,description,added", ...folder.links.map((l) => [l.name, l.url, (l.tags || []).join(" "), l.notes || "", l.createdAt || ""].map(cell).join(","))];
  saveFile(`${folder.name.replace(/[^\w-]+/g, "-").toLowerCase() || "folder"}.csv`, rows.join("\n"), "text/csv");
}
export const embedCode = (folder: Folder, origin = location.origin) =>
  `<iframe src="${origin}/embed/${folder.id}" title="${esc(folder.name)}" width="360" height="480" style="border:0;border-radius:12px" loading="lazy"></iframe>`;

/* ---------- "add this page" from any site + feeds ---------- */
export function AddAnywhereModal({ onClose, toast }: { onClose: () => void; toast: (m: string) => void }) {
  const origin = typeof location !== "undefined" ? location.origin : "";
  // a bookmark that opens this site's "Add website" box with the page you're on
  const code = `javascript:(()=>{window.open('${origin}/?add='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank')})()`;
  const copy = (t: string, what: string) => navigator.clipboard?.writeText(t).then(() => toast(`${what} copied`)).catch(() => {});
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add from anywhere">
        <h2>➕ Add from anywhere</h2>
        <p className="modal-text">Drag this button to your browser&apos;s bookmarks bar. On any website, click it to add that page here.</p>
        <div className="bm-wrap">
          {/* the href is set after render: React doesn't allow javascript: links in JSX */}
          <a className="btn btn-primary bookmarklet" ref={(el) => el?.setAttribute("href", code)} onClick={(e) => { e.preventDefault(); toast("Drag it to your bookmarks bar instead of clicking"); }}>➕ Add to Bookmarks</a>
          <button className="btn btn-secondary btn-sm" onClick={() => copy(code, "Code")}>Copy the code</button>
        </div>
        <p className="hint">Can&apos;t drag? Make a new bookmark and paste the code as its address.</p>
        <h3 className="admin-h">Feeds for other apps</h3>
        <div className="feed-list">
          <div><span>📰 New websites (RSS)</span><button className="link-btn" onClick={() => copy(`${origin}/api/feed`, "RSS address")}>copy</button></div>
          <div><span>🧾 New websites (JSON Feed)</span><button className="link-btn" onClick={() => copy(`${origin}/api/feed?format=json`, "JSON Feed address")}>copy</button></div>
          <div><span>📦 Everything, read-only (JSON)</span><button className="link-btn" onClick={() => copy(`${origin}/api/public`, "Data address")}>copy</button></div>
          <div><span>📅 Events (calendar)</span><button className="link-btn" onClick={() => copy(`${origin}/api/events?ics=1`, "Calendar address")}>copy</button></div>
        </div>
        <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

/* ---------- what changed in the last week ---------- */
export function WeekChanges({ data, onClose, onOpen }: { data: BookmarksData; onClose: () => void; onOpen: (linkId: string) => void }) {
  const week = Date.now() - 7 * 86400_000;
  const { added, edited, removed, folders, days } = useMemo(() => {
    const refs = data.folders.flatMap((f) => f.links.map((l) => ({ f, l })));
    const added = refs.filter(({ l }) => l.createdAt && Date.parse(l.createdAt) > week).sort((a, b) => b.l.createdAt!.localeCompare(a.l.createdAt!));
    const edited = refs.filter(({ l }) => l.updatedAt && Date.parse(l.updatedAt) > week && !(l.createdAt && Date.parse(l.createdAt) > week));
    const removed = (data.activity || []).filter((a) => a.action === "delete" && Date.parse(a.at) > week);
    const folders = data.folders.filter((f) => f.createdAt && Date.parse(f.createdAt) > week);
    const days = new Map<string, number>();
    added.forEach(({ l }) => { const d = new Date(l.createdAt!).toLocaleDateString(undefined, { weekday: "short" }); days.set(d, (days.get(d) || 0) + 1); });
    return { added, edited, removed, folders, days };
  }, [data, week]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="This week">
        <h2>🗓️ The last 7 days</h2>
        <div className="week-stats">
          <div><strong>{added.length}</strong><span>added</span></div>
          <div><strong>{edited.length}</strong><span>changed</span></div>
          <div><strong>{removed.length}</strong><span>removed</span></div>
          <div><strong>{folders.length}</strong><span>new folders</span></div>
        </div>
        {days.size > 0 && <p className="hint">Busiest: {Array.from(days.entries()).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} (${n})`).join(" · ")}</p>}
        {added.length > 0 && <h3 className="admin-h">New</h3>}
        {added.slice(0, 30).map(({ f, l }) => (
          <button key={l.id} className="week-row" onClick={() => { onClose(); onOpen(l.id); }}>
            <Favicon url={l.url} name={l.name} size={18} /> <span className="wr-name">{l.name}</span>
            <span className="muted-inline">{f.emoji} {f.name}{l.addedBy ? ` · ${l.addedBy}` : ""}</span>
          </button>
        ))}
        {edited.length > 0 && <h3 className="admin-h">Changed</h3>}
        {edited.slice(0, 20).map(({ f, l }) => (
          <button key={l.id} className="week-row" onClick={() => { onClose(); onOpen(l.id); }}>
            <Favicon url={l.url} name={l.name} size={18} /> <span className="wr-name">{l.name}</span><span className="muted-inline">{f.emoji} {f.name}</span>
          </button>
        ))}
        {removed.length > 0 && <h3 className="admin-h">Removed</h3>}
        {removed.slice(0, 20).map((a) => <div key={a.id} className="row-sub">− {a.detail.replace(/^Deleted (link )?/, "")}</div>)}
        {!added.length && !edited.length && !removed.length && <div className="admin-empty">A quiet week — nothing changed.</div>}
        <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

/* ---------- hover preview (logged-in only; uses the cached page lookup) ---------- */
const previewCache = new Map<string, Promise<{ title?: string; description?: string; image?: string } | null>>();
export function loadPreview(url: string) {
  if (!previewCache.has(url)) {
    previewCache.set(url, fetch(`/api/meta?url=${encodeURIComponent(url)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return previewCache.get(url)!;
}
export function PreviewCard({ url, data, at }: { url: string; data: { title?: string; description?: string; image?: string } | null | undefined; at: { left: number; top: number; below: boolean } }) {
  const style = { left: at.left, top: at.top, transform: at.below ? undefined : "translateY(-100%)" };
  if (data === undefined) return <span className="hover-preview" style={style}><span className="skeleton skel-line" /></span>;
  if (!data || (!data.description && !data.image)) return null;
  return (
    <span className="hover-preview" role="tooltip" style={style}>
      {data.image && safeHref(data.image) && <img src={data.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      <span className="hp-body">
        <strong>{data.title || hostOf(url)}</strong>
        {data.description && <span>{data.description.slice(0, 160)}</span>}
        <em>{hostOf(url)}</em>
      </span>
    </span>
  );
}
