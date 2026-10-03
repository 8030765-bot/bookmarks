"use client";
import { Folder, Link } from "@/lib/types";
import { Icon } from "../CommandPalette";
import { faviconUrl, hostOf, isNew, safeHref } from "./ui";

export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export interface LinkCardActions {
  open: (folder: Folder, link: Link) => void;
  star: (folder: Folder, link: Link) => void;
  copy: (link: Link) => void;
  edit: (folder: Folder, link: Link) => void;
  remove: (folder: Folder, link: Link) => void;
  suggest: (folder: Folder, link: Link) => void;
  filterTag: (tag: string) => void;
}

export default function LinkCard({
  folder,
  link,
  query,
  admin,
  actions,
  draggable,
  dropBefore,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  folder: Folder;
  link: Link;
  query: string;
  admin: boolean;
  actions: LinkCardActions;
  draggable: boolean;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const href = safeHref(link.url);
  return (
    <div
      className={`card ${link.favorite ? "fav" : ""} ${dropBefore ? "drop-before" : ""}`}
      style={link.color ? ({ "--card-accent": link.color } as React.CSSProperties) : undefined}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", link.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <a
        className="card-main"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => actions.open(folder, link)}
        onAuxClick={(e) => { if (e.button === 1) actions.open(folder, link); }}
        draggable={false}
        title={link.notes || link.url}
      >
        <span className="card-icon">
          <img
            src={faviconUrl(link.url)}
            alt=""
            width={22}
            height={22}
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
          />
          <span className="card-letter">{link.name.charAt(0).toUpperCase()}</span>
        </span>
        <span className="card-body">
          <span className="card-name">
            <Highlight text={link.name} query={query} />
            {isNew(link) && <span className="badge-new">New</span>}
          </span>
          <span className="card-host"><Highlight text={hostOf(link.url)} query={query} /></span>
        </span>
      </a>
      {(link.tags?.length || link.clicks || link.notes) ? (
        <div className="card-meta">
          {link.tags?.map((t) => (
            <button key={t} className="tag" onClick={() => actions.filterTag(t)} title={`Show everything tagged ${t}`}>
              {t}
            </button>
          ))}
          {link.notes && <span className="meta-note" title={link.notes}>📝 note</span>}
          {(link.clicks || 0) > 0 && <span className="meta-clicks">{link.clicks} visit{link.clicks === 1 ? "" : "s"}</span>}
        </div>
      ) : null}
      <div className="card-actions">
        <button className={`ca ${link.favorite ? "on" : ""}`} title={link.favorite ? "Unstar" : "Star"} onClick={() => actions.star(folder, link)}>
          <Icon name="star" />
        </button>
        <button className="ca" title="Copy link" onClick={() => actions.copy(link)}><Icon name="copy" /></button>
        {admin ? (
          <>
            <button className="ca" title="Edit" onClick={() => actions.edit(folder, link)}><Icon name="edit" /></button>
            <button className="ca danger" title="Delete" onClick={() => actions.remove(folder, link)}><Icon name="trash" /></button>
          </>
        ) : (
          <button className="ca" title="Suggest a change" onClick={() => actions.suggest(folder, link)}><Icon name="bulb" /></button>
        )}
      </div>
    </div>
  );
}
