"use client";
import { PreviewCard, loadPreview } from "./DataViews";
import { buzz } from "./Mobile";
import { useEffect, useRef, useState } from "react";
import { Folder, Link } from "@/lib/types";
import { Icon } from "./Icon";
import Favicon, { iconColor } from "./Favicon";
import { hostOf, isExpired, isNewSince, isUpdatedSince, safeHref, timeAgo, warmUp } from "./ui";
import { StarRating } from "./Personal";
import { COST_LABEL, STATUS_LABEL, STICKER_LABEL, useCardEnv } from "./cardEnv";
import LinkDetails from "./LinkDetails";
import { UserChip } from "./People";

export type { LinkCardActions } from "./cardEnv";

/** Highlights every search word that appears in the text. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter((w) => w && !w.includes(":") && !w.startsWith("-"))
    .map((w) => w.replace(/^"|"$/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

export default function LinkCard({
  folder,
  link,
  shortcutIn,
  draggable,
  dropBefore,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  folder: Folder;
  link: Link;
  /** set when this card is a shortcut shown in another folder */
  shortcutIn?: Folder;
  draggable: boolean;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const env = useCardEnv();
  const { actions, me, query } = env;
  // admins, and maintainers of this folder, can edit its links
  const admin = env.admin || env.editable.has(folder.id);
  const href = safeHref(link.url);
  const pref = env.prefs[link.id] || {};
  const favorited = env.favorites.has(link.id);
  const likes = link.likes?.length || 0;
  const liked = !!me && !!link.likes?.includes(me.toLowerCase());
  const agg = env.ratings[link.id];
  const isNew = isNewSince(link, env.since) && link.addedBy?.toLowerCase() !== me?.toLowerCase();
  const updated = isUpdatedSince(link, env.since);
  const expired = isExpired(link);
  const selected = env.selected.has(link.id);
  const expanded = env.expandedId === link.id;
  const focused = env.focusedId === link.id;
  const opened = env.lastOpened.get(link.id);
  const displayName = pref.rename || link.name;
  const steps = link.checklist?.length || 0;
  const ticked = pref.checks?.length || 0;

  // optional stripe in the site's own colour (from its icon)
  const [tint, setTint] = useState("");
  useEffect(() => {
    if (!env.iconTint || link.color) { setTint(""); return; }
    let live = true;
    iconColor(hostOf(link.url)).then((c) => live && setTint(c));
    return () => { live = false; };
  }, [env.iconTint, link.color, link.url]);
  const accent = link.color || tint;

  // a little preview (picture + description) after resting the mouse on a card
  const [preview, setPreview] = useState<{ title?: string; description?: string; image?: string } | null | undefined | false>(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const [previewAt, setPreviewAt] = useState<{ left: number; top: number; below: boolean }>({ left: 0, top: 0, below: false });
  const startPreview = (el: HTMLElement) => {
    if (!me || !href || !window.matchMedia("(hover: hover)").matches) return;
    clearTimeout(hoverTimer.current);
    // fixed to the screen, so folder edges can't cut it off; below the card if there's no room above
    const r = el.getBoundingClientRect();
    const below = r.top < 150;
    setPreviewAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - 330)), top: below ? r.bottom + 6 : r.top - 6, below });
    hoverTimer.current = setTimeout(() => { setPreview(undefined); loadPreview(link.url).then((d) => setPreview((p) => (p === false ? p : d))); }, 900);
  };
  const stopPreview = () => { clearTimeout(hoverTimer.current); setPreview(false); };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // phones: swipe right to star, swipe left to open
  const swipe = useRef<{ x: number; y: number; dx: number; active: boolean } | null>(null);
  const [swipeDx, setSwipeDx] = useState(0);
  const onTouchStart = (e: React.TouchEvent) => {
    if (renaming || e.touches.length !== 1) return;
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, active: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    if (!s.active) {
      if (Math.abs(dy) > 12) { swipe.current = null; return; } // scrolling, not swiping
      if (Math.abs(dx) > 14) s.active = true;
    }
    if (s.active) { s.dx = dx; setSwipeDx(Math.max(-120, Math.min(120, dx))); }
  };
  const onTouchEnd = () => {
    const s = swipe.current;
    swipe.current = null;
    setSwipeDx(0);
    if (!s?.active) return;
    if (s.dx > 90) {
      buzz(15);
      actions.star(folder, link);
      actions.toast(favorited ? `Unstarred ${displayName}` : `Starred ${displayName} ⭐`);
    } else if (s.dx < -90 && href) {
      buzz(15);
      actions.open(folder, link);
      window.open(href, actions.newTab ? "_blank" : "_self", "noopener,noreferrer");
    }
  };

  // admins can double-click the name to rename it right on the card
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(link.name);
  const renameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (renaming) renameRef.current?.select(); }, [renaming]);
  function commitRename() {
    setRenaming(false);
    const name = draft.trim();
    if (admin) { if (name && name !== link.name) actions.adminEdit(folder, link, { name }); return; }
    // not an editor: your own name for it (only you see it)
    if (name !== displayName) {
      actions.pref(link.id, { rename: name && name !== link.name ? name : "" });
      actions.toast(name && name !== link.name ? `Renamed just for you — the real name is “${link.name}”` : "Back to its real name");
    }
  }

  const showMeta = !!(link.sticker || link.tags?.length || link.clicks || link.notes || link.addedBy || me || agg?.count || link.status || link.cost ||
    link.lang || link.mobile || link.tip || pref.note || pref.done || steps || link.readMins);
  const title = [
    link.notes || link.url,
    link.addedBy ? `Added by ${link.addedBy}${link.createdAt ? ` · ${new Date(link.createdAt).toLocaleDateString()}` : ""}` : "",
    "Ctrl/middle-click: open in a background tab · Right-click: more options",
  ].filter(Boolean).join("\n");

  return (
    <div
      className={`card ${favorited ? "fav" : ""} ${dropBefore ? "drop-before" : ""} ${selected ? "selected" : ""} ${expanded ? "expanded" : ""} ${focused ? "kb-focus" : ""} ${pref.done ? "done" : ""} ${expired ? "expired" : ""} ${link.pinned ? "pinned" : ""}`}
      style={{
        ...(accent ? { "--card-accent": accent } : {}),
        ...(swipeDx ? { transform: `translateX(${swipeDx}px)` } : {}),
      } as React.CSSProperties}
      data-swipe={swipeDx > 60 ? "star" : swipeDx < -60 ? "open" : undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { swipe.current = null; setSwipeDx(0); }}
      data-link-id={link.id}
      data-folder-id={folder.id}
      draggable={draggable && !renaming}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", link.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={(e) => { e.preventDefault(); actions.menu(folder, link, { x: e.clientX, y: e.clientY }); }}
    >
      {preview !== false && <PreviewCard url={link.url} data={preview} at={previewAt} />}
      <label className="card-check" title="Select (Shift-click to select a range)" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => {}}
          onClick={(e) => actions.select(link.id, e.shiftKey)}
          aria-label={`Select ${displayName}`}
        />
      </label>
      <a
        className="card-main"
        href={href}
        target={actions.newTab ? "_blank" : undefined}
        rel="noopener noreferrer"
        onClick={(e) => { if (renaming) { e.preventDefault(); return; } actions.open(folder, link); }}
        onAuxClick={(e) => { if (e.button === 1) actions.open(folder, link); }}
        onMouseEnter={(e) => { if (href) warmUp(href); startPreview(e.currentTarget); }}
        onMouseLeave={stopPreview}
        onMouseDown={stopPreview}
        onFocus={() => href && warmUp(href)}
        draggable={false}
        title={title}
      >
        <span className="card-icon">
          <Favicon url={link.url} name={displayName} size={22} custom={link.iconImg} />
          {link.emoji && <span className="card-emoji" aria-hidden="true">{link.emoji}</span>}
        </span>
        <span className="card-body">
          <span className="card-name" title={admin ? "Double-click to rename" : "Double-click to rename it just for you"} onDoubleClick={(e) => { e.preventDefault(); setDraft(admin ? link.name : displayName); setRenaming(true); }}>
            {renaming ? (
              <input
                ref={renameRef}
                className="rename-input"
                value={draft}
                maxLength={100}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.preventDefault()}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                  if (e.key === "Escape") { e.preventDefault(); setRenaming(false); }
                }}
              />
            ) : (
              <span className="card-title"><Highlight text={displayName} query={query} /></span>
            )}
            {link.pinned && <span className="badge-pin" title="Pinned to the top"><Icon name="pin" /></span>}
            {link.verified && <span className="badge-verified" title="Checked by an admin"><Icon name="check" /></span>}
            {expired ? <span className="badge-expired">Expired</span> : isNew ? <span className="badge-new">New</span> : updated ? <span className="badge-updated">Updated</span> : null}
          </span>
          <span className="card-host">
            <Highlight text={hostOf(link.url)} query={query} />
            {pref.rename && <span className="muted-inline" title={`Real name: ${link.name}`}> · renamed</span>}
            {shortcutIn && <span className="muted-inline"> · ↪ from {folder.emoji} {folder.name}</span>}
            {opened && <span className="muted-inline"> · opened {timeAgo(new Date(opened).toISOString())}</span>}
          </span>
          {env.descriptions && link.notes && <span className="card-desc">{link.notes}</span>}
        </span>
      </a>
      {showMeta ? (
        <div className="card-meta">
          {link.sticker && <span className={`sticker sticker-${link.sticker}`}>{STICKER_LABEL[link.sticker]}</span>}
          {link.tags?.map((t) => (
            <button
              key={t}
              className="tag"
              style={env.tagColors[t] ? { background: `${env.tagColors[t]}26`, color: env.tagColors[t] } : undefined}
              onClick={() => actions.filterTag(t)}
              title={`Show everything tagged ${t}`}
            >{t}</button>
          ))}
          {link.status && link.status !== "works" && <span className={`label status-${link.status}`}>{STATUS_LABEL[link.status]}</span>}
          {link.cost && link.cost !== "free" && <span className="label">{COST_LABEL[link.cost]}</span>}
          {link.lang && <span className="label" title="Language">{link.lang.toUpperCase()}</span>}
          {link.mobile && <span className="label" title="Works on phones">📱</span>}
          {link.tip && <span className="meta-tip" title={link.tip}>💡 tip</span>}
          {!env.descriptions && link.notes && <span className="meta-note" title={link.notes}>📝 note</span>}
          {pref.note && <span className="meta-note mine" title={`Your private note: ${pref.note}`}>🔒 my note</span>}
          {steps > 0 && <span className="meta-steps" title="Checklist">☑ {ticked}/{steps}</span>}
          {link.readMins ? <span className="meta-clicks">{link.readMins} min read</span> : null}
          {(link.clicks || 0) > 0 && <span className="meta-clicks">{link.clicks} visit{link.clicks === 1 ? "" : "s"}</span>}
          {link.addedBy && <span className="meta-by">by <UserChip username={link.addedBy} className="meta-by" onOpen={actions.openProfile} face /></span>}
          {pref.done && <span className="meta-done" title="You marked this done"><Icon name="check" /> done</span>}
          <StarRating linkId={link.id} mine={env.myRatings[link.id]} avg={agg?.avg} count={agg?.count} canRate={!!me} onRate={actions.rate} />
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
        <button className={`ca ${pref.later ? "on" : ""}`} title={pref.later ? "Remove from Read later" : "Read later"} onClick={() => actions.pref(link.id, { later: !pref.later })}>
          <Icon name="clock" />
        </button>
        <button className={`ca ${expanded ? "on" : ""}`} title="Details" onClick={() => env.setExpanded(expanded ? null : link.id)}><Icon name="info" /></button>
        <button
          className="ca"
          title={admin ? "Copy, edit, delete and more" : "Copy, suggest a change and more"}
          onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); actions.menu(folder, link, { x: r.right, y: r.bottom + 4 }); }}
        >
          <Icon name="more" />
        </button>
      </div>
      {expanded && <LinkDetails folder={folder} link={link} />}
    </div>
  );
}
