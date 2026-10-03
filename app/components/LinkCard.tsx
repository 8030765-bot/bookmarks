"use client";
import { Folder, Link } from "@/lib/types";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import { hostOf, isNew, safeHref, warmUp } from "./ui";
import { StarRating } from "./Personal";

/** Highlights every search word that appears in the text. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

export interface LinkCardActions {
  /** open links in a new tab (user preference) */
  newTab: boolean;
  open: (folder: Folder, link: Link) => void;
  star: (folder: Folder, link: Link) => void;
  copy: (link: Link) => void;
  edit: (folder: Folder, link: Link) => void;
  remove: (folder: Folder, link: Link) => void;
  suggest: (folder: Folder, link: Link) => void;
  like: (folder: Folder, link: Link) => void;
  filterTag: (tag: string) => void;
  rate: (linkId: string, stars: number) => void;
  openProfile: (username: string) => void;
}

export default function LinkCard({
  folder,
  link,
  query,
  admin,
  me,
  favorited,
  myRating,
  avg,
  ratingCount,
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
  /** logged-in username, for "you liked this" */
  me: string | null;
  favorited: boolean;
  myRating?: number;
  avg?: number;
  ratingCount?: number;
  actions: LinkCardActions;
  draggable: boolean;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const href = safeHref(link.url);
  const likes = link.likes?.length || 0;
  const liked = !!me && !!link.likes?.includes(me.toLowerCase());
  return (
    <div
      className={`card ${favorited ? "fav" : ""} ${dropBefore ? "drop-before" : ""}`}
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
        target={actions.newTab ? "_blank" : undefined}
        rel="noopener noreferrer"
        onClick={() => actions.open(folder, link)}
        onAuxClick={(e) => { if (e.button === 1) actions.open(folder, link); }}
        onMouseEnter={() => href && warmUp(href)}
        onFocus={() => href && warmUp(href)}
        draggable={false}
        title={link.notes || link.url}
      >
        <span className="card-icon">
          <Favicon url={link.url} name={link.name} size={22} />
        </span>
        <span className="card-body">
          <span className="card-name">
            <Highlight text={link.name} query={query} />
            {isNew(link) && <span className="badge-new">New</span>}
          </span>
          <span className="card-host"><Highlight text={hostOf(link.url)} query={query} /></span>
        </span>
      </a>
      {(link.tags?.length || link.clicks || link.notes || link.addedBy || me || ratingCount) ? (
        <div className="card-meta">
          {link.tags?.map((t) => (
            <button key={t} className="tag" onClick={() => actions.filterTag(t)} title={`Show everything tagged ${t}`}>
              {t}
            </button>
          ))}
          {link.notes && <span className="meta-note" title={link.notes}>📝 note</span>}
          {(link.clicks || 0) > 0 && <span className="meta-clicks">{link.clicks} visit{link.clicks === 1 ? "" : "s"}</span>}
          {link.addedBy && <button className="meta-by" onClick={(e) => { e.preventDefault(); e.stopPropagation(); actions.openProfile(link.addedBy!); }}>by {link.addedBy}</button>}
          <StarRating linkId={link.id} mine={myRating} avg={avg} count={ratingCount} canRate={!!me} onRate={actions.rate} />
        </div>
      ) : null}
      <button
        className={`like-btn ${liked ? "on" : ""} ${likes ? "has" : ""}`}
        onClick={() => actions.like(folder, link)}
        title={liked ? "Unlike" : "Like"}
        aria-pressed={liked}
      >
        <Icon name="heart" />
        {likes > 0 && <span>{likes}</span>}
      </button>
      <div className="card-actions">
        <button className={`ca ${favorited ? "on" : ""}`} title={favorited ? "Remove from your favorites" : "Save to your favorites"} onClick={() => actions.star(folder, link)}>
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
