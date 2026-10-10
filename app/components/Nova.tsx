"use client";
import { ReactNode } from "react";
import { Folder, Link } from "@/lib/types";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import { Avatar, MiniProfile } from "./People";
import type { LinkRef } from "./ui";
import { safeHref } from "./ui";

/**
 * ✨ Nova: a different way to use the site. A sidebar with every folder,
 * a Home dashboard of folder tiles, and one folder at a time on its own
 * page, with its websites as big app tiles. (Classic is the original long
 * page of folders.)
 */
export type NovaSection = "home" | "starred" | "later" | "recent" | "mystuff" | `folder:${string}`;

export function NovaSidebar({
  title, mark, section, go, folders, kids, counts, unread, user, profile, addLabel, canNewFolder, open, onClose,
  onAdd, onNewFolder, onTools, onChat, onCustomize, onTheme, theme, onProfile, onLogin,
}: {
  title: string;
  mark: string;
  section: NovaSection;
  go: (s: NovaSection) => void;
  folders: Folder[];
  /** sub-folders by parent id */
  kids: Map<string, Folder[]>;
  counts: { starred: number; later: number; recent: number; mystuff: number };
  unread: (f: Folder) => number;
  user: string | null;
  profile: MiniProfile;
  addLabel: string;
  canNewFolder: boolean;
  /** phones: the sidebar slides in */
  open: boolean;
  onClose: () => void;
  onAdd: () => void;
  onNewFolder: () => void;
  onTools?: () => void;
  onChat: () => void;
  onCustomize: () => void;
  onTheme: () => void;
  theme: string;
  onProfile: () => void;
  onLogin: () => void;
}) {
  const item = (s: NovaSection, icon: string, label: string, count?: number) => (
    <button className={`nv-item ${section === s ? "on" : ""}`} onClick={() => go(s)} aria-current={section === s ? "page" : undefined}>
      <span className="nv-ico"><Icon name={icon} /></span>
      <span className="nv-label">{label}</span>
      {count ? <span className="nv-count">{count}</span> : null}
    </button>
  );
  const folderBtn = (f: Folder, sub = false) => {
    const s = `folder:${f.id}` as NovaSection;
    const n = unread(f);
    return (
      <button key={f.id} className={`nv-folder ${sub ? "sub" : ""} ${section === s ? "on" : ""}`} onClick={() => go(s)}
        style={{ "--fc": f.color || "var(--accent)" } as React.CSSProperties} aria-current={section === s ? "page" : undefined}>
        <span className="nv-emoji">{f.emoji}</span>
        <span className="nv-label">{f.name}</span>
        {n > 0 ? <span className="nv-new" title={`${n} new since your last visit`}>{n}</span> : <span className="nv-count">{f.rule ? "✨" : f.links.length}</span>}
      </button>
    );
  };
  return (
    <>
      {open && <div className="nv-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`nv-side ${open ? "open" : ""}`} aria-label="Navigation">
        <button className="nv-brand" onClick={() => go("home")} title="Home">
          <span className="nv-mark">{mark}</span>
          <span className="nv-title">{title}</span>
        </button>
        <button className="nv-add" onClick={onAdd}><Icon name="plus" /> {addLabel}</button>
        <nav className="nv-nav">
          {item("home", "grid", "Home")}
          {item("starred", "star", "Starred", counts.starred)}
          {item("later", "clock", "Read later", counts.later)}
          {item("recent", "chart", "Recently opened", counts.recent)}
          {user && item("mystuff", "lock", "My Stuff", counts.mystuff)}
        </nav>
        <div className="nv-head">
          <span>Folders</span>
          {canNewFolder && <button className="nv-mini" onClick={onNewFolder} title="New folder" aria-label="New folder"><Icon name="plus" /></button>}
        </div>
        <div className="nv-folders">
          {folders.map((f) => (
            <div key={f.id}>
              {folderBtn(f)}
              {(kids.get(f.id) || []).map((k) => folderBtn(k, true))}
            </div>
          ))}
          {folders.length === 0 && <p className="nv-empty">No folders yet.</p>}
        </div>
        <div className="nv-foot">
          <div className="nv-tools">
            {onTools && <button onClick={onTools} title="Tools (O)" aria-label="Tools"><Icon name="tools" /></button>}
            <button onClick={onChat} title="Chat (C)" aria-label="Chat"><Icon name="chat" /></button>
            <button onClick={onCustomize} title="Customize (P)" aria-label="Customize"><Icon name="palette" /></button>
            <button onClick={onTheme} title={theme === "dark" ? "Light mode (T)" : "Dark mode (T)"} aria-label="Light or dark"><Icon name={theme === "dark" ? "sun" : "moon"} /></button>
          </div>
          {user ? (
            <button className="nv-user" onClick={onProfile} title="Your profile">
              <Avatar name={user} profile={profile} size={34} />
              <span><strong>{profile.displayName || user}</strong><em>@{user}</em></span>
            </button>
          ) : (
            <button className="btn btn-primary nv-login" onClick={onLogin}>Log in</button>
          )}
        </div>
      </aside>
    </>
  );
}

/** Home: a big hello, today's things, "jump back in", and every folder as a tile. */
export function NovaHome({ greeting, subtitle, stats, extras, recent, folders, kids, onOpenFolder, onOpenLink, newTab, unread }: {
  greeting: string;
  subtitle: string;
  stats: ReactNode;
  /** Today strip, polls, announcements… */
  extras: ReactNode;
  recent: LinkRef[];
  folders: Folder[];
  kids: Map<string, Folder[]>;
  onOpenFolder: (f: Folder) => void;
  onOpenLink: (f: Folder, l: Link) => void;
  newTab: boolean;
  unread: (f: Folder) => number;
}) {
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="nv-home">
      <header className="nv-hello">
        <span className="nv-date">{date}</span>
        <h1>{greeting.replace(/\s*👋$/, "")}{/👋$/.test(greeting) && <span className="nv-wave" aria-hidden="true"> 👋</span>}</h1>
        <p>{subtitle}</p>
        <div className="nv-stats">{stats}</div>
      </header>
      {extras}
      {recent.length > 0 && (
        <section className="nv-block">
          <h2 className="nv-h2">Jump back in</h2>
          <div className="nv-recent">
            {recent.slice(0, 8).map(({ folder, link }) => (
              <a key={link.id} className="nv-recent-tile" href={safeHref(link.url)} target={newTab ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => onOpenLink(folder, link)}>
                <span className="nv-recent-icon"><Favicon url={link.url} name={link.name} size={28} custom={link.iconImg} /></span>
                <span className="nv-recent-name">{link.name}</span>
                <span className="nv-recent-folder">{folder.emoji} {folder.name}</span>
              </a>
            ))}
          </div>
        </section>
      )}
      <section className="nv-block">
        <h2 className="nv-h2">Your folders</h2>
        <div className="nv-bento">
          {folders.map((f, i) => {
            const subs = kids.get(f.id) || [];
            const count = f.links.length + subs.reduce((n, k) => n + k.links.length, 0);
            const n = unread(f);
            return (
              <button key={f.id} className={`nv-tile ${i === 0 && folders.length > 3 ? "wide" : ""}`} onClick={() => onOpenFolder(f)}
                style={{ "--fc": f.color || "var(--accent)" } as React.CSSProperties}>
                <span className="nv-tile-top">
                  <span className="nv-tile-emoji">{f.emoji}</span>
                  {n > 0 && <span className="nv-new">{n} new</span>}
                </span>
                <span className="nv-tile-name">{f.name}</span>
                <span className="nv-tile-sub">{f.rule ? "Smart folder" : `${count} website${count === 1 ? "" : "s"}`}{subs.length ? ` · ${subs.length} inside` : ""}</span>
                {f.description && <span className="nv-tile-desc">{f.description}</span>}
                <span className="nv-tile-icons" aria-hidden="true">
                  {f.links.slice(0, 5).map((l) => <span key={l.id} className="nv-tile-fav"><Favicon url={l.url} name={l.name} size={18} custom={l.iconImg} /></span>)}
                  {f.links.length > 5 && <span className="nv-tile-more">+{f.links.length - 5}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** The top of one folder's page: a colourful banner with its actions. */
export function NovaBanner({ emoji, name, description, color, count, children }: {
  emoji: string; name: string; description?: string; color?: string; count: number; children?: ReactNode;
}) {
  return (
    <header className="nv-banner" style={{ "--fc": color || "var(--accent)" } as React.CSSProperties}>
      <span className="nv-banner-emoji">{emoji}</span>
      <div className="nv-banner-text">
        <h1>{name}</h1>
        <p>{description || `${count} website${count === 1 ? "" : "s"}`}{description ? ` · ${count} website${count === 1 ? "" : "s"}` : ""}</p>
      </div>
      <div className="nv-banner-actions">{children}</div>
    </header>
  );
}
