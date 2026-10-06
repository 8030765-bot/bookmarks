"use client";
import { ReactNode, useEffect } from "react";
import { Folder, Link } from "@/lib/types";
import Favicon from "./Favicon";
import { Icon } from "./Icon";
import type { LinkRef } from "./ui";
import { hostOf, safeHref, useMinuteTick } from "./ui";

/*
 * The extra designs (Customize → Design). Each is its own layout; the page
 * wires them to the same features (folders, cards, search, chat…).
 *   🪐 Orbit    — a home screen: clock, folder "apps", a dock, folder windows
 *   🗂️ Board    — every folder as a column (mostly CSS on the normal page)
 *   📰 Journal  — a newspaper front page and a section per folder
 *   💻 Terminal — a folder tree and websites listed like files
 *   🍃 Zen      — a clock, one search box and plain lists
 */

const fc = (color?: string) => ({ "--fc": color || "var(--accent)" } as React.CSSProperties);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function useClock() {
  useMinuteTick();
  const now = new Date();
  return {
    time: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    date: now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
  };
}

/* ============================== 🪐 Orbit ============================== */

export function OrbitHome({ greeting, subtitle, stats, folders, unread, onOpenFolder, onNewFolder, extras }: {
  greeting: string;
  subtitle: string;
  stats: ReactNode;
  folders: Folder[];
  unread: (f: Folder) => number;
  onOpenFolder: (f: Folder) => void;
  onNewFolder?: () => void;
  extras?: ReactNode;
}) {
  const { time, date } = useClock();
  return (
    <div className="ob-home">
      <header className="ob-clock">
        <time suppressHydrationWarning>{time}</time>
        <span className="ob-date" suppressHydrationWarning>{date}</span>
        <p className="ob-greet">{greeting}</p>
      </header>
      <div className="ob-apps">
        {folders.map((f, i) => {
          const n = unread(f);
          return (
            <button key={f.id} className="ob-app" style={{ ...fc(f.color), animationDelay: `${Math.min(i, 16) * 25}ms` }} onClick={() => onOpenFolder(f)}
              title={f.description || f.name}>
              <span className="ob-app-icon">
                <span aria-hidden="true">{f.emoji}</span>
                {n > 0 && <span className="ob-badge" title={`${n} new`}>{n > 9 ? "9+" : n}</span>}
              </span>
              <span className="ob-app-name">{f.name}</span>
            </button>
          );
        })}
        {onNewFolder && (
          <button className="ob-app ob-app-add" onClick={onNewFolder} title="New folder">
            <span className="ob-app-icon"><Icon name="plus" /></span>
            <span className="ob-app-name">New folder</span>
          </button>
        )}
      </div>
      {extras && <div className="ob-widgets">{extras}</div>}
      <footer className="ob-about">
        <p>{subtitle}</p>
        <div className="ob-stats">{stats}</div>
      </footer>
    </div>
  );
}

/** A folder (or Starred, search results…) opens as a window over the home screen. */
export function OrbitWindow({ emoji, name, sub, color, actions, onClose, searching, children }: {
  emoji: string; name: string; sub?: string; color?: string; actions?: ReactNode; onClose: () => void; searching?: boolean; children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".modal-overlay, .cmd-overlay, .drawer, .menu, .card-menu, .search-suggest")) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <section className="ob-window" style={fc(color)} aria-label={name}>
      <header className="ob-titlebar">
        <span className="ob-lights">
          <button className="ob-light red" onClick={onClose} title="Close (Esc)" aria-label="Close and go Home"><Icon name="x" /></button>
          <span className="ob-light yellow" aria-hidden="true" />
          <span className="ob-light green" aria-hidden="true" />
        </span>
        <span className="ob-wtitle">
          <span className="ob-wemoji" aria-hidden="true">{emoji}</span>
          <strong>{name}</strong>
          {sub && <em>{sub}</em>}
        </span>
        <span className="ob-wactions">{actions}</span>
      </header>
      <div className={`ob-wbody nv-content nv-folder-view ${searching ? "searching" : ""}`}>{children}</div>
    </section>
  );
}

export function OrbitDock({ children }: { children: ReactNode }) {
  return <nav className="ob-dock" aria-label="Dock">{children}</nav>;
}
export function DockButton({ label, on, onClick, badge, children }: {
  label: string; on?: boolean; onClick: () => void; badge?: number; children: ReactNode;
}) {
  return (
    <button className={`ob-dock-btn ${on ? "on" : ""}`} onClick={onClick} title={label} aria-label={label} aria-current={on ? "page" : undefined}>
      {children}
      {badge ? <span className="ob-badge dk-badge">{badge > 9 ? "9+" : badge}</span> : null}
    </button>
  );
}
export function DockSite({ refItem, newTab, onOpen }: { refItem: LinkRef; newTab: boolean; onOpen: (f: Folder, l: Link) => void }) {
  const { folder, link } = refItem;
  return (
    <a className="ob-dock-btn site" href={safeHref(link.url)} target={newTab ? "_blank" : undefined} rel="noopener noreferrer"
      title={link.name} aria-label={link.name} onClick={() => onOpen(folder, link)}>
      <Favicon url={link.url} name={link.name} size={26} custom={link.iconImg} />
    </a>
  );
}

/* ============================== 🖥️ Desk ============================== */

/** Desk's top: a clock and greeting, and every folder as an app icon that jumps to its column. */
export function DeskHome({ greeting, stats, folders, unread, onJump, onNewFolder }: {
  greeting: string;
  stats: ReactNode;
  folders: Folder[];
  unread: (f: Folder) => number;
  onJump: (f: Folder) => void;
  onNewFolder?: () => void;
}) {
  const { time, date } = useClock();
  return (
    <div className="dk-home">
      <header className="dk-head">
        <div className="dk-clock">
          <time suppressHydrationWarning>{time}</time>
          <span suppressHydrationWarning><strong>{greeting}</strong> · {date}</span>
        </div>
        <div className="dk-stats">{stats}</div>
      </header>
      <div className="dk-apps" role="list" aria-label="Jump to a folder">
        {folders.map((f) => {
          const n = unread(f);
          return (
            <button key={f.id} role="listitem" className="dk-app" style={fc(f.color)} onClick={() => onJump(f)} title={`Jump to ${f.name}`}>
              <span className="dk-app-icon">
                <span aria-hidden="true">{f.emoji}</span>
                {n > 0 && <span className="dk-badge" title={`${n} new`}>{n > 9 ? "9+" : n}</span>}
              </span>
              <span className="dk-app-name">{f.name}</span>
            </button>
          );
        })}
        {onNewFolder && (
          <button className="dk-app dk-app-add" onClick={onNewFolder} title="New folder">
            <span className="dk-app-icon"><Icon name="plus" /></span>
            <span className="dk-app-name">New folder</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================== 📰 Journal ============================== */

export function JournalMast({ title, subtitle, edition, nav }: { title: string; subtitle: string; edition: ReactNode; nav: ReactNode }) {
  const { date } = useClock();
  return (
    <>
    <header className="jr-mast">
      <div className="jr-dateline">
        <span suppressHydrationWarning>{date}</span>
        <span className="jr-edition">{edition}</span>
      </div>
      <h1 className="jr-title">{title}</h1>
      <p className="jr-motto">{subtitle}</p>
    </header>
    <nav className="jr-nav" aria-label="Sections">{nav}</nav>
    </>
  );
}

const byClicks = (a: LinkRef, b: LinkRef) => (b.link.clicks || 0) - (a.link.clicks || 0);

export function JournalFront({ refs, folders, kids, onOpenFolder, onOpenLink, newTab, notices, recent }: {
  refs: LinkRef[];
  folders: Folder[];
  kids: Map<string, Folder[]>;
  onOpenFolder: (f: Folder) => void;
  onOpenLink: (f: Folder, l: Link) => void;
  newTab: boolean;
  notices?: ReactNode;
  recent: LinkRef[];
}) {
  const top = [...refs].sort(byClicks);
  const lead = top[0];
  const seconds = top.slice(1, 3);
  const most = top.slice(3, 9);
  const justIn = refs.filter((r) => r.link.createdAt).sort((a, b) => (b.link.createdAt || "").localeCompare(a.link.createdAt || "")).slice(0, 6);
  const a = (r: LinkRef, cls: string, children: ReactNode) => (
    <a key={r.link.id} className={cls} href={safeHref(r.link.url)} target={newTab ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => onOpenLink(r.folder, r.link)}>
      {children}
    </a>
  );
  const kicker = (r: LinkRef) => <span className="jr-kicker">{r.folder.emoji} {r.folder.name}</span>;
  if (!lead) return <div className="jr-front"><p className="jr-empty">Nothing in print yet — add the first website.</p></div>;
  return (
    <div className="jr-front">
      <div className="jr-top">
        {a(lead, "jr-lead", (
          <>
            {kicker(lead)}
            <span className="jr-lead-icon"><Favicon url={lead.link.url} name={lead.link.name} size={44} custom={lead.link.iconImg} /></span>
            <h2>{lead.link.name}</h2>
            <p className="jr-dek">{lead.link.notes || lead.link.tip || `The most-visited website on the site, from ${lead.folder.name}.`}</p>
            <span className="jr-byline">{hostOf(lead.link.url)}{lead.link.clicks ? ` · ${plural(lead.link.clicks, "visit")}` : ""}{lead.link.addedBy ? ` · added by ${lead.link.addedBy}` : ""}</span>
          </>
        ))}
        <div className="jr-seconds">
          {seconds.map((r) => a(r, "jr-second", (
            <>
              {kicker(r)}
              <h3>{r.link.name}</h3>
              {(r.link.notes || r.link.tip) && <p>{r.link.notes || r.link.tip}</p>}
              <span className="jr-byline">{hostOf(r.link.url)}</span>
            </>
          )))}
        </div>
        <aside className="jr-rail">
          {most.length > 0 && (
            <section>
              <h4 className="jr-rail-head">Most read</h4>
              <ol className="jr-most">
                {most.map((r) => <li key={r.link.id}>{a(r, "", <><strong>{r.link.name}</strong><span>{r.folder.name}</span></>)}</li>)}
              </ol>
            </section>
          )}
          {justIn.length > 0 && (
            <section>
              <h4 className="jr-rail-head">Just in</h4>
              <ul className="jr-list">
                {justIn.map((r) => <li key={r.link.id}>{a(r, "", <><strong>{r.link.name}</strong><span>{r.folder.emoji} {r.folder.name}</span></>)}</li>)}
              </ul>
            </section>
          )}
        </aside>
      </div>
      {notices && <div className="jr-notices"><h4 className="jr-rail-head">Notices</h4>{notices}</div>}
      {recent.length > 0 && (
        <section className="jr-strip">
          <h4 className="jr-rail-head">You were reading</h4>
          <div className="jr-strip-row">
            {recent.slice(0, 6).map((r) => a(r, "jr-chip", <><Favicon url={r.link.url} name={r.link.name} size={16} custom={r.link.iconImg} /> {r.link.name}</>))}
          </div>
        </section>
      )}
      <h3 className="jr-rule-head"><span>In this issue</span></h3>
      <div className="jr-sections">
        {folders.map((f) => {
          const subs = kids.get(f.id) || [];
          const own = [...f.links].sort((x, y) => (y.clicks || 0) - (x.clicks || 0)).slice(0, 4);
          const count = f.links.length + subs.reduce((n, k) => n + k.links.length, 0);
          return (
            <section key={f.id} className="jr-section" style={fc(f.color)}>
              <button className="jr-section-head" onClick={() => onOpenFolder(f)}>
                <span>{f.emoji}</span> {f.name}
              </button>
              {f.description && <p className="jr-section-dek">{f.description}</p>}
              <ul>
                {own.map((l) => (
                  <li key={l.id}>
                    <a href={safeHref(l.url)} target={newTab ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => onOpenLink(f, l)}>
                      {l.name}
                    </a>
                  </li>
                ))}
                {own.length === 0 && <li className="jr-muted">{f.rule ? "A smart folder — open it to see what's inside." : "Nothing here yet."}</li>}
              </ul>
              <button className="jr-more" onClick={() => onOpenFolder(f)}>{count > own.length ? `All ${count} in ${f.name} →` : `Open ${f.name} →`}</button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function JournalSectionHead({ emoji, name, description, color, count, children }: {
  emoji: string; name: string; description?: string; color?: string; count: number; children?: ReactNode;
}) {
  return (
    <header className="jr-sec-head" style={fc(color)}>
      <span className="jr-sec-label">Section</span>
      <h2><span aria-hidden="true">{emoji}</span> {name}</h2>
      <p>{description ? <><em>{description}</em> · </> : null}{plural(count, "website")}</p>
      {children && <div className="jr-sec-actions">{children}</div>}
    </header>
  );
}

/* ============================== 💻 Terminal ============================== */

export const termSlug = (name: string) => name.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "folder";

export function TermTree({ host, user, section, go, folders, kids, counts, unread, actions }: {
  host: string;
  user: string | null;
  section: string;
  go: (s: string) => void;
  folders: Folder[];
  kids: Map<string, Folder[]>;
  counts: { starred: number; later: number; recent: number; mystuff: number };
  unread: (f: Folder) => number;
  actions: ReactNode;
}) {
  const row = (s: string, prefix: string, label: ReactNode, right?: ReactNode, cls = "") => (
    <button key={s} className={`tm-node ${cls} ${section === s ? "on" : ""}`} onClick={() => go(s === "__folders" ? "home" : s)} aria-current={section === s ? "page" : undefined}>
      <span className="tm-branch" aria-hidden="true">{prefix}</span>
      <span className="tm-label">{label}</span>
      {right !== undefined && <span className="tm-right">{right}</span>}
    </button>
  );
  const specials: [string, string, number | null][] = [
    ["starred", "starred/", counts.starred],
    ["later", "read-later/", counts.later],
    ["recent", "history/", counts.recent],
    ...(user ? [["mystuff", "my-stuff/", counts.mystuff] as [string, string, number]] : []),
  ];
  return (
    <aside className="tm-tree" aria-label="Folders">
      <div className="tm-host">{user || "guest"}@{host}</div>
      {row("home", "", <><span className="tm-dir">~/</span></>, undefined, "root")}
      {specials.map(([s, label, n]) => row(s, "├── ", <span className="tm-dir">{label}</span>, n || ""))}
      {row("__folders", "└── ", <span className="tm-dir">folders/</span>, folders.length, "folders-root")}
      {folders.map((f, i) => {
        const last = i === folders.length - 1;
        const subs = kids.get(f.id) || [];
        const n = unread(f);
        return (
          <div key={f.id}>
            {row(`folder:${f.id}`, `    ${last ? "└── " : "├── "}`, <><span className="tm-emo">{f.emoji}</span><span className="tm-dir">{termSlug(f.name)}/</span></>,
              n > 0 ? <span className="tm-new">+{n}</span> : f.rule ? "*" : f.links.length)}
            {subs.map((k, j) => row(`folder:${k.id}`, `    ${last ? "    " : "│   "}${j === subs.length - 1 ? "└── " : "├── "}`,
              <><span className="tm-emo">{k.emoji}</span><span className="tm-dir">{termSlug(k.name)}/</span></>, k.links.length))}
          </div>
        );
      })}
      <div className="tm-cmds">{actions}</div>
    </aside>
  );
}

export function TermPrompt({ host, user, path, cmd, children }: { host: string; user: string | null; path: string; cmd?: string; children?: ReactNode }) {
  return (
    <div className="tm-cmdline">
      <span className="tm-ps1"><span className="tm-user">{user || "guest"}@{host}</span>:<span className="tm-path">{path}</span>$</span>
      {cmd && <span className="tm-cmd"> {cmd}</span>}
      {children}
    </div>
  );
}

export function TermHome({ host, user, title, version, stats, folders, unread, onOpenFolder, recent, onOpenLink, newTab, extras }: {
  host: string;
  user: string | null;
  title: string;
  version: string;
  stats: string;
  folders: Folder[];
  unread: (f: Folder) => number;
  onOpenFolder: (f: Folder) => void;
  recent: LinkRef[];
  onOpenLink: (f: Folder, l: Link) => void;
  newTab: boolean;
  extras?: ReactNode;
}) {
  const { date, time } = useClock();
  return (
    <div className="tm-home">
      <div className="tm-motd">
        <div className="tm-art" aria-hidden="true">{title}</div>
        <p><strong>{title}</strong> v{version} — shared with the whole class. Type to search, or <span className="tm-kbd">cd</span> into a folder.</p>
        <p className="tm-dim" suppressHydrationWarning>Last login: {date}, {time} on tty1</p>
        <p className="tm-dim">{stats}</p>
      </div>
      <TermPrompt host={host} user={user} path="~" cmd="ls -l folders/" />
      <div className="tm-ls" role="list">
        <div className="tm-total">total {folders.length}</div>
        {folders.map((f) => {
          const n = unread(f);
          return (
            <button key={f.id} role="listitem" className="tm-row" onClick={() => onOpenFolder(f)} style={fc(f.color)}>
              <span className="tm-perm">drwxr-xr-x</span>
              <span className="tm-num">{String(f.rule ? "*" : f.links.length).padStart(3, " ")}</span>
              <span className="tm-owner">class</span>
              <span className="tm-name"><span className="tm-emo">{f.emoji}</span>{termSlug(f.name)}/</span>
              {n > 0 && <span className="tm-new">+{n} new</span>}
              {f.description && <span className="tm-comment"># {f.description}</span>}
            </button>
          );
        })}
      </div>
      {recent.length > 0 && (
        <>
          <TermPrompt host={host} user={user} path="~" cmd="history | tail" />
          <div className="tm-ls">
            {recent.slice(0, 6).map(({ folder, link }, i) => (
              <a key={link.id} className="tm-row" href={safeHref(link.url)} target={newTab ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => onOpenLink(folder, link)}>
                <span className="tm-num">{String(i + 1).padStart(4, " ")}</span>
                <span className="tm-cmd">open</span>
                <span className="tm-name">{link.name}</span>
                <span className="tm-comment">{hostOf(link.url)}</span>
              </a>
            ))}
          </div>
        </>
      )}
      {extras && (
        <>
          <TermPrompt host={host} user={user} path="~" cmd="cat today.txt" />
          <div className="tm-extras">{extras}</div>
        </>
      )}
      <TermPrompt host={host} user={user} path="~"><span className="tm-cursor" aria-hidden="true" /></TermPrompt>
    </div>
  );
}

/* ============================== 🍃 Zen ============================== */

export function ZenHero({ greeting }: { greeting: string }) {
  const { time, date } = useClock();
  return (
    <header className="zn-hero">
      <time suppressHydrationWarning>{time}</time>
      <p suppressHydrationWarning>{greeting} · {date}</p>
    </header>
  );
}
