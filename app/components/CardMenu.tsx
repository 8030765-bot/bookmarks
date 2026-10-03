"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Folder, Link } from "@/lib/types";
import { Icon } from "./Icon";
import { useCardEnv } from "./cardEnv";
import { asMarkdown, citeAPA, citeMLA, safeHref } from "./ui";

export interface CardMenuState { folder: Folder; link: Link; x: number; y: number }

/** Right-click (or ⋯) menu for a link card. */
export default function CardMenu({ state, onClose }: { state: CardMenuState; onClose: () => void }) {
  const env = useCardEnv();
  const { actions } = env;
  const { folder, link } = state;
  const admin = env.admin || env.editable.has(folder.id);
  const pref = env.prefs[link.id] || {};
  const favorited = env.favorites.has(link.id);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: state.x, top: state.y });

  // keep the menu on screen
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(state.x - (state.x + r.width > innerWidth - 8 ? r.width : 0), innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(state.y, innerHeight - r.height - 8)),
    });
    el.querySelector<HTMLButtonElement>("button")?.focus();
  }, [state.x, state.y]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") || []);
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onClose, { passive: true });
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("scroll", onClose); };
  }, [onClose]);

  const run = (fn: () => void) => () => { onClose(); fn(); };
  const copy = (text: string, label: string) => run(() => {
    navigator.clipboard.writeText(text).then(() => actions.toast(`${label} copied`)).catch(() => actions.toast("Couldn't copy"));
  });
  const href = safeHref(link.url);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <>
      <div className="menu-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={ref} className="menu card-menu" role="menu" style={{ position: "fixed", left: pos.left, top: pos.top }}>
        <div className="menu-head">{link.name}<strong className="menu-sub">{folder.emoji} {folder.name}</strong></div>
        <button onClick={run(() => { actions.open(folder, link); if (href) window.open(href, actions.newTab ? "_blank" : "_self", "noopener,noreferrer"); })}><Icon name="external" /> Open</button>
        <button onClick={copy(link.url, "Link")}><Icon name="copy" /> Copy link</button>
        {admin && <button onClick={run(() => actions.edit(folder, link))}><Icon name="edit" /> Edit</button>}
        <button onClick={run(() => env.setExpanded(link.id))}><Icon name="info" /> Details</button>
        <div className="menu-sep" />
        <button onClick={run(() => actions.star(folder, link))}><Icon name="star" /> {favorited ? "Remove favorite" : "Favorite"}</button>
        <button onClick={run(() => actions.pref(link.id, { later: !pref.later }))}><Icon name="clock" /> {pref.later ? "Remove from Read later" : "Read later"}</button>
        <button onClick={run(() => actions.pref(link.id, { done: !pref.done }))}><Icon name="check" /> {pref.done ? "Mark not done" : "Mark done"}</button>
        <button onClick={run(() => actions.prompt("Private note", pref.note || "", (v) => actions.pref(link.id, { note: v.trim() }), { multiline: true, placeholder: "Only you will see this" }))}>
          <Icon name="note" /> {pref.note ? "Edit my note" : "Add a private note"}
        </button>
        <button onClick={run(() => actions.prompt("Rename for yourself", pref.rename || link.name, (v) => actions.pref(link.id, { rename: v.trim() === link.name ? "" : v.trim() }), { placeholder: link.name }))}>
          <Icon name="edit" /> Rename for me
        </button>
        <button onClick={run(() => { actions.pref(link.id, { hidden: !pref.hidden }); actions.toast(pref.hidden ? "Showing it again" : `Hid ${link.name} for you`); })}>
          <Icon name={pref.hidden ? "eye" : "eyeOff"} /> {pref.hidden ? "Unhide" : "Hide for me"}
        </button>
        <div className="menu-sep" />
        <button onClick={copy(`${location.origin}${location.pathname}#link-${link.id}`, "Link to this card")}><Icon name="share" /> Copy link to this card</button>
        <button onClick={copy(asMarkdown(link), "Markdown link")}><Icon name="link" /> Copy as Markdown</button>
        <button onClick={copy(citeMLA(link), "MLA citation")}><Icon name="quote" /> Copy MLA citation</button>
        <button onClick={copy(citeAPA(link), "APA citation")}><Icon name="quote" /> Copy APA citation</button>
        {actions.shareToChat && <button onClick={run(() => actions.shareToChat!(link))}><Icon name="chat" /> Share to chat</button>}
        {canShare && (
          <button onClick={run(() => { navigator.share({ title: link.name, url: link.url }).catch(() => {}); })}><Icon name="share" /> Share…</button>
        )}
        <div className="menu-sep" />
        {admin ? (
          <>
            {env.admin && <button onClick={run(() => actions.adminEdit(folder, link, { pinned: !link.pinned }))}><Icon name="pin" /> {link.pinned ? "Unpin" : "Pin to top of folder"}</button>}
            <button className="danger" onClick={run(() => actions.remove(folder, link))}><Icon name="trash" /> Delete</button>
          </>
        ) : (
          <button onClick={run(() => actions.suggest(folder, link))}><Icon name="bulb" /> Suggest a change</button>
        )}
      </div>
    </>
  );
}
