"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { BookmarksData, Folder, Link, Suggestion } from "@/lib/types";
import ChatPanel from "./ChatPanel";
import CommandPalette, { Icon, PaletteItem } from "./CommandPalette";
import AdminPanel from "./AdminPanel";
import SuggestModal, { SuggestStart, suggestionSummary } from "./SuggestModal";
import FolderSection, { Drag } from "./components/FolderSection";
import { LinkCardActions } from "./components/LinkCard";
import LinkModal, { LinkModalMode, LinkValues } from "./components/LinkModal";
import { ConfirmModal, FolderModal, FolderValues, ShortcutsModal } from "./components/Modals";
import Favicon from "./components/Favicon";
import { LinkRef, isNew, readLocal, safeHref, writeLocal } from "./components/ui";
import {
  CustomizeModal, DEFAULT_LOOK, LeaderboardModal, Look, OnlinePill, Palette, PollCards, SpinWheel, WhatsNew, applyLook, usePresence,
} from "./components/Community";

const SYNC_MS = 3000;
const ADMIN_PW_KEY = "adminPw";
const DEFAULT_TITLE = "Made by Theo 7A";
const DEFAULT_SUBTITLE = "Shared school bookmarks — everyone sees the same list";

type Sort = "manual" | "name" | "newest" | "clicks" | "likes";
type Modal =
  | { type: "link"; mode: LinkModalMode }
  | { type: "folder"; folder?: Folder }
  | { type: "deleteFolder"; folder: Folder }
  | { type: "adminLogin" }
  | { type: "login" }
  | { type: "shortcuts" }
  | { type: "leaderboard" }
  | { type: "customize" }
  | { type: "spin" }
  | { type: "whatsnew" }
  | null;
interface Toast {
  msg: string;
  action?: { label: string; run: () => void };
}

function ensureData(raw: unknown): BookmarksData {
  const d = raw as BookmarksData | null;
  if (!d || !Array.isArray(d.folders)) return { folders: [], activity: [], settings: {} };
  return {
    rev: d.rev,
    updatedAt: d.updatedAt,
    folders: d.folders.map((f) => ({ ...f, links: Array.isArray(f.links) ? f.links : [] })),
    activity: Array.isArray(d.activity) ? d.activity : [],
    settings: d.settings || {},
    polls: Array.isArray(d.polls) ? d.polls : [],
  };
}

/** fields of `next` that differ from the look it was based on */
function diffLook(base: Look, next: Look): Partial<Look> {
  return Object.fromEntries(Object.entries(next).filter(([k, v]) => base[k as keyof Look] !== v)) as Partial<Look>;
}

type QuickTab = "recent" | "starred" | "top" | "visited" | "new";
const QUICK_TABS: { id: QuickTab; label: string; icon: string }[] = [
  { id: "recent", label: "Recent", icon: "clock" },
  { id: "starred", label: "Starred", icon: "star" },
  { id: "top", label: "Top rated", icon: "heart" },
  { id: "visited", label: "Most visited", icon: "chart" },
  { id: "new", label: "New", icon: "plus" },
];

/** One compact row of shortcuts with tabs, instead of four stacked rows. */
function QuickTabs({ lists, tab, setTab, onOpen, newTab }: {
  lists: Record<QuickTab, LinkRef[]>; tab: QuickTab; setTab: (t: QuickTab) => void;
  onOpen: (f: Folder, l: Link) => void; newTab: boolean;
}) {
  const available = QUICK_TABS.filter((t) => lists[t.id].length > 0);
  if (!available.length) return null;
  const active = available.some((t) => t.id === tab) ? tab : available[0].id;
  return (
    <section className="quick">
      <div className="quick-tabs" role="tablist">
        {available.map((t) => (
          <button key={t.id} role="tab" aria-selected={active === t.id} className={active === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} /> {t.label}
          </button>
        ))}
      </div>
      <div className="quick-row">
        {lists[active].map(({ folder, link }) => (
          <a
            key={link.id}
            className="quick-chip"
            href={safeHref(link.url)}
            target={newTab ? "_blank" : undefined}
            rel="noopener noreferrer"
            onClick={() => onOpen(folder, link)}
          >
            <Favicon url={link.url} name={link.name} size={16} />
            {link.name}
            {active === "visited" && <span className="quick-num">{link.clicks}</span>}
            {active === "top" && <span className="quick-num">♥ {link.likes?.length}</span>}
          </a>
        ))}
      </div>
    </section>
  );
}

type HistoryItem = { folderId: string; linkId: string; at: number };

export default function HomePage() {
  const [data, setData] = useState<BookmarksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [seenActivity, setSeenActivity] = useState<string | null>("");
  const lookRef = useRef<Look>(DEFAULT_LOOK);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<Sort>("manual");
  const [showCmd, setShowCmd] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [suggest, setSuggest] = useState<SuggestStart | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [fUsername, setFUsername] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [userMenu, setUserMenu] = useState(false);
  const [drag, setDrag] = useState<Drag>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [quickTab, setQuickTab] = useState<QuickTab>("recent");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showTags, setShowTags] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const installPrompt = useRef<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const topbarRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string, action?: Toast["action"]) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 6000 : 2800);
  }, []);
  const setSafeData = useCallback((raw: unknown) => setData(ensureData(raw)), []);

  // ---------- preferences (per browser) ----------
  useEffect(() => {
    // older versions stored just "theme"
    const legacy = readLocal<string | null>("theme", null);
    setLook({ ...DEFAULT_LOOK, ...(legacy === "light" ? { palette: "light" as Palette } : {}), ...readLocal<Partial<Look>>("look", {}) });
    setSeenActivity(readLocal<string | null>("seenActivity", null));
    setView(readLocal("view", "grid"));
    setSort(readLocal("sort", "manual"));
    setCollapsed(readLocal("collapsed", {}));
    setQuickTab(readLocal("quickTab", "recent"));
    setHistory(readLocal("history", []));
    setShowTags(readLocal("showTags", false));
    setDismissed(readLocal<string | null>("dismissedAnnouncement", null));
  }, []);

  // ---------- page chrome: scroll, sticky offsets, install, connection ----------
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    // the folder chips stick right under the top bar, whose height changes on phones
    const el = topbarRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--topbar-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); installPrompt.current = e; setCanInstall(true); };
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  useEffect(() => { applyLook(look); lookRef.current = look; }, [look]);
  const savePref = <T,>(key: string, set: (v: T) => void) => (v: T) => { set(v); writeLocal(key, v); };
  // merge into the latest look so quick successive clicks don't overwrite each other
  const changeLook = (next: Look) => setLook((prev) => {
    const merged = { ...prev, ...diffLook(lookRef.current, next) };
    writeLocal("look", merged);
    return merged;
  });
  const theme = look.palette === "light" ? "light" : "dark";
  const changeTheme = (t: "dark" | "light") => {
    if (t === "light") { writeLocal("lastDark", look.palette); changeLook({ ...look, palette: "light" }); }
    else changeLook({ ...look, palette: readLocal<Palette>("lastDark", "black") === "light" ? "black" : readLocal<Palette>("lastDark", "black") });
  };
  const changeView = savePref("view", setView);
  const changeSort = savePref("sort", setSort);
  function toggleCollapsed(id: string, value?: boolean) {
    setCollapsed((c) => {
      const next = { ...c, [id]: value ?? !c[id] };
      writeLocal("collapsed", next);
      return next;
    });
  }

  // ---------- loading + live sync ----------
  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/bookmarks", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setSafeData(json);
    } catch (e: any) {
      setError(e.message || "Could not load bookmarks");
    } finally {
      setLoading(false);
    }
  }, [setSafeData]);
  useEffect(() => { load(); }, [load]);

  const revRef = useRef(0);
  useEffect(() => { revRef.current = data?.rev ?? 0; }, [data]);
  const applyIfNewer = useCallback((json: any) => {
    if (json && !json.unchanged && Array.isArray(json.folders) && (json.rev ?? 0) > revRef.current) setSafeData(json);
  }, [setSafeData]);
  useEffect(() => {
    let stopped = false;
    const sync = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/bookmarks?rev=${revRef.current}`, { cache: "no-store" });
        if (stopped) return;
        setOffline(!res.ok && res.status >= 500);
        if (res.ok) applyIfNewer(await res.json());
      } catch {
        // offline for a moment — next tick retries
        if (!stopped) setOffline(true);
      }
    };
    const id = setInterval(sync, SYNC_MS);
    document.addEventListener("visibilitychange", sync);
    return () => { stopped = true; clearInterval(id); document.removeEventListener("visibilitychange", sync); };
  }, [applyIfNewer]);

  const presence = usePresence(user);

  // highlight the folder chip for whichever folder is on screen
  const folderIds = (data?.folders || []).map((f) => f.id).join(",");
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      // the folder being read = the last one whose header has passed under the sticky chips
      const line = (document.querySelector(".folder-nav")?.getBoundingClientRect().bottom ?? 120) + 40;
      let current: string | null = null;
      document.querySelectorAll<HTMLElement>(".folder-card").forEach((el) => {
        if (el.getBoundingClientRect().top <= line) current = el.id.replace("folder-", "");
      });
      setActiveFolder(window.scrollY < 50 ? null : current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [folderIds, loading]);
  useEffect(() => {
    // keep the highlighted chip visible inside the (horizontally scrolling) chip bar
    const nav = document.querySelector<HTMLElement>(".folder-nav");
    const chip = nav?.querySelector<HTMLElement>("button.on");
    if (nav && chip) nav.scrollTo({ left: chip.offsetLeft - nav.clientWidth / 2 + chip.offsetWidth / 2, behavior: "smooth" });
  }, [activeFolder]);

  // #folder-<id> deep links (from "copy link to folder")
  const handledHash = useRef(false);
  useEffect(() => {
    if (!data || handledHash.current) return;
    handledHash.current = true;
    const m = location.hash.match(/^#folder-(.+)$/);
    if (m && data.folders.some((f) => f.id === m[1])) setTimeout(() => jumpToFolder(m[1]), 150);
  }, [data]);

  // ---------- account + admin session ----------
  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" }).then((r) => r.json()).then((j) => setUser(j.user || null)).catch(() => {});
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(ADMIN_PW_KEY); } catch {}
    if (saved === null) return;
    fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verifyAdmin", password: saved }),
    })
      .then((r) => {
        if (r.ok) { setAdminUnlocked(true); setAdminPassword(saved!); setAdminOpen(true); }
        else { try { sessionStorage.removeItem(ADMIN_PW_KEY); } catch {} }
      })
      .catch(() => {});
  }, []);

  // Tell people when an admin approves or declines one of their suggestions.
  const suggestionStatus = useRef<Map<string, Suggestion["status"]> | null>(null);
  useEffect(() => {
    suggestionStatus.current = null;
    if (!user) return;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const json = await fetch("/api/suggestions", { cache: "no-store" }).then((r) => r.json());
        if (!Array.isArray(json.suggestions)) return;
        const list = json.suggestions as Suggestion[];
        const before = suggestionStatus.current;
        if (before) {
          for (const x of list) {
            if (before.get(x.id) === "pending" && x.status !== "pending") {
              showToast(x.status === "approved" ? `✅ Approved: ${suggestionSummary(x)}` : `Declined: ${suggestionSummary(x)}`);
            }
          }
        }
        suggestionStatus.current = new Map(list.map((x) => [x.id, x.status]));
      } catch {}
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, [user, showToast]);

  // ---------- server calls ----------
  async function api(action: string, payload: Record<string, any> = {}): Promise<BookmarksData | null> {
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      const next = ensureData(json);
      setData(next);
      return next;
    } catch (e: any) {
      showToast(e.message || "Something went wrong");
      return null;
    } finally {
      setSubmitting(false);
    }
  }
  const adminPw = () => (adminUnlocked ? adminPassword : undefined);
  const undo = () => api("undo", { password: adminPassword }).then((d) => d && showToast("Undone"));

  // ---------- derived ----------
  const allRefs: LinkRef[] = useMemo(
    () => (data?.folders || []).flatMap((folder) => folder.links.map((link) => ({ folder, link }))),
    [data]
  );
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    allRefs.forEach(({ link }) => link.tags?.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return Array.from(counts).sort((a, b) => b[1] - a[1]);
  }, [allRefs]);
  const favorites = allRefs.filter((r) => r.link.favorite);
  const mostVisited = [...allRefs].filter((r) => (r.link.clicks || 0) > 0).sort((a, b) => (b.link.clicks || 0) - (a.link.clicks || 0)).slice(0, 8);
  const topRated = allRefs.filter((r) => (r.link.likes?.length || 0) > 0).sort((a, b) => (b.link.likes?.length || 0) - (a.link.likes?.length || 0)).slice(0, 8);
  const latestActivity = data?.activity?.[0]?.id ?? null;
  const hasNews = !!latestActivity && seenActivity !== "" && seenActivity !== latestActivity;
  const recent = allRefs.filter((r) => isNew(r.link)).sort((a, b) => (b.link.createdAt || "").localeCompare(a.link.createdAt || "")).slice(0, 8);
  const recentOpened: LinkRef[] = useMemo(() => {
    const byId = new Map(allRefs.map((r) => [r.link.id, r]));
    return history.map((h) => byId.get(h.linkId)).filter((r): r is LinkRef => !!r).slice(0, 10);
  }, [history, allRefs]);
  const totalClicks = allRefs.reduce((n, r) => n + (r.link.clicks || 0), 0);
  const sortedFolders = useMemo(
    () => [...(data?.folders || [])].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)),
    [data]
  );
  const q = search.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const filtering = !!q || !!tagFilter;

  function visibleLinks(folder: Folder) {
    let list = folder.links.filter((l) => {
      if (tagFilter && !l.tags?.includes(tagFilter)) return false;
      if (!words.length) return true;
      // every word has to appear somewhere: name, address, notes, tags, folder or who added it
      const haystack = [l.name, l.url, l.notes || "", folder.name, l.addedBy || "", ...(l.tags || [])].join(" ").toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
    if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "newest") list = [...list].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (sort === "clicks") list = [...list].sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
    if (sort === "likes") list = [...list].sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
    return list;
  }
  const folderViews = sortedFolders.map((f) => ({ folder: f, links: visibleLinks(f) }));
  const matchCount = folderViews.reduce((n, v) => n + v.links.length, 0);

  const addingLocked = !!data?.settings?.lockAdding && !adminUnlocked;
  const dragEnabled = adminUnlocked && sort === "manual" && !filtering;
  const showAdmin = adminUnlocked && adminOpen && !!data;

  // ---------- actions ----------
  function remember(folder: Folder, link: Link) {
    setHistory((h) => {
      const next = [{ folderId: folder.id, linkId: link.id, at: Date.now() }, ...h.filter((x) => x.linkId !== link.id)].slice(0, 20);
      writeLocal("history", next);
      return next;
    });
  }
  function trackAndOpen(folder: Folder, link: Link, openWindow = false) {
    remember(folder, link);
    // clicks don't block the UI and don't show errors
    fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trackClick", folderId: folder.id, linkId: link.id }),
    }).then((r) => r.json()).then(applyIfNewer).catch(() => {});
    const href = safeHref(link.url);
    if (openWindow && href) {
      if (look.newTab) window.open(href, "_blank", "noopener,noreferrer");
      else window.location.href = href;
    }
  }
  function randomBookmark() {
    if (!allRefs.length) { showToast("No websites yet"); return; }
    const pick = allRefs[Math.floor(Math.random() * allRefs.length)];
    trackAndOpen(pick.folder, pick.link, true);
    showToast(`🎲 Opened ${pick.link.name}`);
  }
  function openAdd(folderId?: string) {
    if (addingLocked) { setSuggest({ kind: "addLink" }); return; }
    if (!data?.folders.length) { setModal({ type: "folder" }); showToast("Create a folder first"); return; }
    setModal({ type: "link", mode: { kind: "add", folderId } });
  }
  function openNewFolder() {
    if (addingLocked) { setSuggest({ kind: "other" }); return; }
    setModal({ type: "folder" });
  }
  function jumpToFolder(id: string) {
    toggleCollapsed(id, false);
    requestAnimationFrame(() => {
      const el = document.getElementById(`folder-${id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      el?.classList.add("flash");
      setTimeout(() => el?.classList.remove("flash"), 1200);
    });
  }

  async function saveLink(values: LinkValues): Promise<boolean> {
    if (modal?.type !== "link") return false;
    const common = { name: values.name, url: values.url, tags: values.tags, color: values.color, notes: values.notes, password: adminPw() };
    if (modal.mode.kind === "add") {
      const ok = await api("addLink", { ...common, folderId: values.folderId });
      if (ok) showToast(`Added ${values.name} for everyone`);
      return !!ok;
    }
    const { folder, link } = modal.mode;
    let ok = await api("editLink", { ...common, folderId: folder.id, linkId: link.id });
    if (ok && values.folderId !== folder.id) {
      ok = await api("moveLinkTo", { folderId: folder.id, linkId: link.id, targetFolderId: values.folderId, password: adminPassword });
    }
    if (ok) showToast("Saved");
    return !!ok;
  }
  async function createFolderInline(name: string): Promise<string | null> {
    const next = await api("addFolder", { name, emoji: "📁", password: adminPw() });
    if (!next) return null;
    const created = [...next.folders].reverse().find((f) => f.name === name);
    return created?.id || null;
  }
  async function saveFolder(v: FolderValues): Promise<boolean> {
    if (modal?.type !== "folder") return false;
    if (!modal.folder) {
      const ok = await api("addFolder", { name: v.name, emoji: v.emoji, color: v.color, password: adminPw() });
      if (ok) showToast(`Created ${v.emoji} ${v.name}`);
      return !!ok;
    }
    const ok = await api("editFolder", { folderId: modal.folder.id, name: v.name, emoji: v.emoji, color: v.color, pinned: v.pinned, password: adminPassword });
    if (ok) showToast("Folder saved");
    return !!ok;
  }

  const cardActions: LinkCardActions = {
    newTab: look.newTab,
    open: (f, l) => trackAndOpen(f, l),
    star: (f, l) => { api("toggleFavorite", { folderId: f.id, linkId: l.id }); },
    copy: (l) => navigator.clipboard.writeText(l.url).then(() => showToast("Link copied")).catch(() => showToast("Couldn't copy")),
    edit: (f, l) => setModal({ type: "link", mode: { kind: "edit", folder: f, link: l } }),
    remove: async (f, l) => {
      if (await api("deleteLink", { folderId: f.id, linkId: l.id, password: adminPassword })) {
        showToast(`Deleted ${l.name}`, { label: "Undo", run: undo });
      }
    },
    suggest: (f, l) => setSuggest({ kind: "editLink", folderId: f.id, linkId: l.id }),
    like: (f, l) => {
      if (!user) { showToast("Log in to like websites"); openLogin(); return; }
      api("toggleLike", { folderId: f.id, linkId: l.id });
    },
    filterTag: (t) => { setTagFilter(t === tagFilter ? "" : t); window.scrollTo({ top: 0, behavior: "smooth" }); },
  };

  async function moveLink(from: { folderId: string; linkId: string }, toFolderId: string, beforeLinkId: string | null) {
    setDrag(null);
    setDropTarget(null);
    await api("moveLinkTo", { ...from, targetFolderId: toFolderId, beforeLinkId, password: adminPassword });
  }
  async function moveFolder(folderId: string, beforeFolderId: string) {
    setDrag(null);
    setDropTarget(null);
    if (folderId === beforeFolderId) return;
    const moving = data?.folders.find((f) => f.id === folderId);
    const target = data?.folders.find((f) => f.id === beforeFolderId);
    if (moving && target && !!moving.pinned !== !!target.pinned) {
      showToast(`Pinned folders always stay on top — ${target.pinned ? `unpin ${target.name}` : `unpin ${moving.name}`} first`);
      return;
    }
    await api("moveFolderTo", { folderId, beforeFolderId, password: adminPassword });
  }

  function toggleAll() {
    const anyOpen = sortedFolders.some((f) => !collapsed[f.id]);
    const next = Object.fromEntries(sortedFolders.map((f) => [f.id, anyOpen]));
    setCollapsed(next);
    writeLocal("collapsed", next);
  }
  function openAllIn(folder: Folder, links: Link[]) {
    if (links.length > 5 && !confirm(`Open ${links.length} tabs at once?`)) return;
    links.forEach((l) => { const h = safeHref(l.url); if (h) window.open(h, "_blank", "noopener,noreferrer"); });
    showToast(`Opened ${links.length} tabs — allow pop-ups if some were blocked`);
  }
  function openTopResult() {
    const first = folderViews.find((v) => v.links.length);
    if (!first) return;
    trackAndOpen(first.folder, first.links[0], true);
    searchRef.current?.blur();
  }
  async function installApp() {
    setMoreMenu(false);
    const p = installPrompt.current;
    if (!p) return;
    p.prompt();
    const choice = await p.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") showToast("Installed! Find it on your home screen");
    installPrompt.current = null;
    setCanInstall(false);
  }
  function openWhatsNew() {
    setModal({ type: "whatsnew" });
    if (latestActivity) { setSeenActivity(latestActivity); writeLocal("seenActivity", latestActivity); }
  }
  function shareFolder(f: Folder) {
    const url = `${location.origin}${location.pathname}#folder-${f.id}`;
    navigator.clipboard.writeText(url).then(() => showToast(`Link to ${f.name} copied`)).catch(() => showToast(url));
  }

  // ---------- admin + auth ----------
  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    if (await api("verifyAdmin", { password: fPassword })) {
      setAdminUnlocked(true);
      setAdminPassword(fPassword);
      try { sessionStorage.setItem(ADMIN_PW_KEY, fPassword); } catch {}
      setFPassword("");
      setModal(null);
      setAdminOpen(true);
      showToast("Admin unlocked");
    }
  }
  function lockAdmin() {
    setAdminUnlocked(false);
    setAdminPassword("");
    setAdminOpen(false);
    try { sessionStorage.removeItem(ADMIN_PW_KEY); } catch {}
    showToast("Admin locked");
  }
  function toggleAdmin() {
    if (adminUnlocked) setAdminOpen((o) => !o);
    else { setFPassword(""); setModal({ type: "adminLogin" }); }
  }
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: authMode, username: fUsername, password: fPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not log in");
      setUser(json.user);
      setFUsername(""); setFPassword("");
      setModal(null);
      showToast(authMode === "signup" ? `Welcome, ${json.user}!` : `Logged in as ${json.user}`);
    } catch (err: any) {
      showToast(err.message || "Could not log in");
    } finally {
      setSubmitting(false);
    }
  }
  async function handleLogout() {
    setUserMenu(false);
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => {});
    setUser(null);
    showToast("Logged out");
  }
  function openLogin(mode: "login" | "signup" = "login") {
    setFPassword("");
    setAuthMode(mode);
    setModal({ type: "login" });
  }

  // ---------- keyboard ----------
  const keys = useRef<(e: KeyboardEvent) => void>();
  keys.current = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setShowCmd((s) => !s); return; }
    if (e.key === "Escape") {
      if (document.activeElement === searchRef.current && search) { setSearch(""); return; }
      setShowCmd(false); setModal(null); setSuggest(null); setUserMenu(false);
      return;
    }
    const t = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
    if (modal || showCmd || suggest) return;
    const k = e.key.toLowerCase();
    const run: Record<string, () => void> = {
      "/": () => searchRef.current?.focus(),
      n: () => openAdd(),
      f: () => openNewFolder(),
      r: randomBookmark,
      c: () => setChatOpen((o) => !o),
      g: () => changeView(view === "grid" ? "list" : "grid"),
      t: () => changeTheme(theme === "dark" ? "light" : "dark"),
      "?": () => setModal({ type: "shortcuts" }),
      s: () => setModal({ type: "spin" }),
      l: () => setModal({ type: "leaderboard" }),
      p: () => setModal({ type: "customize" }),
      w: openWhatsNew,
      x: toggleAll,
    };
    if (run[k]) { e.preventDefault(); run[k](); }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keys.current?.(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ---------- command palette ----------
  const cmd = (id: string, label: string, icon: string, run: () => void, hint?: string): PaletteItem => ({
    id, label, hint, icon: <Icon name={icon} />, run: () => { setShowCmd(false); run(); },
  });
  function paletteActions(): PaletteItem[] {
    return [
      cmd("add", addingLocked ? "Suggest a website" : "Add website", "plus", () => openAdd(), "N"),
      cmd("folder", "New folder", "folder", openNewFolder, "F"),
      cmd("random", "Random website", "shuffle", randomBookmark, "R"),
      cmd("spin", "Spin the wheel", "shuffle", () => setModal({ type: "spin" }), "S"),
      cmd("community", "Community & leaderboard", "trophy", () => setModal({ type: "leaderboard" }), "L"),
      cmd("customize", "Customize look", "palette", () => setModal({ type: "customize" }), "P"),
      cmd("news", "What's new", "bell", openWhatsNew, "W"),
      cmd("suggest", "Suggest a change", "bulb", () => setSuggest({})),
      cmd("chat", chatOpen ? "Close chat" : "Open chat", "chat", () => setChatOpen((o) => !o), "C"),
      cmd("theme", theme === "dark" ? "Light mode" : "Dark mode", theme === "dark" ? "sun" : "moon", () => changeTheme(theme === "dark" ? "light" : "dark"), "T"),
      cmd("view", view === "grid" ? "List view" : "Grid view", view === "grid" ? "list" : "grid", () => changeView(view === "grid" ? "list" : "grid"), "G"),
      cmd("admin", adminUnlocked ? (adminOpen ? "Close admin panel" : "Open admin panel") : "Admin login", "lock", toggleAdmin),
      cmd("keys", "Keyboard shortcuts", "keyboard", () => setModal({ type: "shortcuts" }), "?"),
      cmd("collapse", "Collapse / expand all folders", "list", toggleAll, "X"),
      user ? cmd("auth", `Log out (${user})`, "logout", handleLogout) : cmd("auth", "Log in or sign up", "user", () => openLogin()),
    ];
  }
  const linkItem = ({ folder, link }: LinkRef): PaletteItem => ({
    id: `${folder.id}:${link.id}`,
    label: link.name,
    hint: folder.name,
    icon: <Favicon url={link.url} name={link.name} size={16} />,
    run: () => { setShowCmd(false); trackAndOpen(folder, link, true); },
  });
  const folderItem = (f: Folder): PaletteItem => ({
    id: `folder:${f.id}`,
    label: `${f.emoji} ${f.name}`,
    hint: `${f.links.length} sites`,
    icon: <Icon name="folder" />,
    run: () => { setShowCmd(false); jumpToFolder(f.id); },
  });

  // ---------- render ----------
  const title = data?.settings?.title || DEFAULT_TITLE;

  if (loading) {
    return (
      <div className="app">
        <div className="skeleton hero-skel" />
        <div className="skeleton bar-skel" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton folder-skel">
            <div className="skel-cards">{[0, 1, 2, 3].map((j) => <div key={j} className="skeleton card-skel" />)}</div>
          </div>
        ))}
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="app">
        <div className="hero"><h1>{DEFAULT_TITLE}</h1></div>
        <div className="error-box">
          <strong>Could not load bookmarks.</strong>
          <p>{error}</p>
          <button className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); load(); }}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`shell ${showAdmin ? "with-admin" : ""}`}>
      {showAdmin && (
        <AdminPanel
          data={data!}
          password={adminPassword}
          api={async (action, payload) => !!(await api(action, payload))}
          submitting={submitting}
          onClose={() => setAdminOpen(false)}
          onLock={lockAdmin}
          showToast={showToast}
          applyData={setSafeData}
        />
      )}

      {offline && (
        <div className="offline-bar" role="status">
          <span className="offline-dot" /> You&apos;re offline — changes from others will appear when you reconnect.
        </div>
      )}
      <div className="topbar" ref={topbarRef}>
        <div className="topbar-inner">
          <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Back to top">
            <span className="brand-mark">🔖</span>
            <span className="brand-name">{title}</span>
          </button>
          <label className="top-search">
            <Icon name="search" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); openTopResult(); } }}
              placeholder={`Search ${allRefs.length} websites…`}
              aria-label="Search websites"
            />
            {search ? (
              <button className="clear" onClick={() => { setSearch(""); searchRef.current?.focus(); }} aria-label="Clear search"><Icon name="x" /></button>
            ) : (
              <span className="kbd">/</span>
            )}
          </label>
          <div className="top-actions">
            <button className="icon-btn" title="Spin the wheel (S)" onClick={() => setModal({ type: "spin" })}><Icon name="shuffle" /></button>
            <button className="icon-btn" title="Community (L)" onClick={() => setModal({ type: "leaderboard" })}><Icon name="trophy" /></button>
            <button className={`icon-btn ${hasNews ? "dot" : ""}`} title="What's new (W)" onClick={openWhatsNew}><Icon name="bell" /></button>
            <div className="user-menu">
              <button className={`icon-btn ${moreMenu ? "on" : ""}`} title="More" aria-expanded={moreMenu} onClick={() => setMoreMenu((o) => !o)}>
                <Icon name="more" />
              </button>
              {moreMenu && (
                <>
                  <div className="menu-backdrop" onClick={() => setMoreMenu(false)} />
                  <div className="menu">
                    <button className="phone-only" onClick={() => { setMoreMenu(false); setModal({ type: "spin" }); }}><Icon name="shuffle" /> Spin the wheel</button>
                    <button className="phone-only" onClick={() => { setMoreMenu(false); setModal({ type: "leaderboard" }); }}><Icon name="trophy" /> Community</button>
                    <button onClick={() => { setMoreMenu(false); setShowCmd(true); }}><Icon name="search" /> Command menu <span className="kbd">Ctrl K</span></button>
                    <button onClick={() => { setMoreMenu(false); setSuggest({}); }}><Icon name="bulb" /> Suggest a change</button>
                    <button onClick={() => { setMoreMenu(false); setModal({ type: "customize" }); }}><Icon name="palette" /> Customize look <span className="kbd">P</span></button>
                    <button onClick={() => { setMoreMenu(false); changeTheme(theme === "dark" ? "light" : "dark"); }}>
                      <Icon name={theme === "dark" ? "sun" : "moon"} /> {theme === "dark" ? "Light mode" : "Dark mode"} <span className="kbd">T</span>
                    </button>
                    <button onClick={() => { setMoreMenu(false); toggleAll(); }}><Icon name="list" /> Collapse / expand all <span className="kbd">X</span></button>
                    <button onClick={() => { setMoreMenu(false); setModal({ type: "shortcuts" }); }}><Icon name="keyboard" /> Keyboard shortcuts <span className="kbd">?</span></button>
                    {canInstall && <button onClick={installApp}><Icon name="download" /> Install app</button>}
                  </div>
                </>
              )}
            </div>
            <button className={`icon-btn ${showAdmin ? "on" : ""} ${adminUnlocked ? "unlocked" : ""}`} title={adminUnlocked ? "Admin panel" : "Admin login"} onClick={toggleAdmin}>
              <Icon name="lock" />
            </button>
            {user ? (
              <div className="user-menu">
                <button className="avatar-btn" onClick={() => setUserMenu((o) => !o)} aria-expanded={userMenu} title={user}>
                  {user.charAt(0).toUpperCase()}
                </button>
                {userMenu && (
                  <>
                    <div className="menu-backdrop" onClick={() => setUserMenu(false)} />
                    <div className="menu">
                      <div className="menu-head">Signed in as<strong>{user}</strong></div>
                      <button onClick={() => { setUserMenu(false); setSuggest({}); }}><Icon name="bulb" /> My suggestions</button>
                      <button onClick={() => { setUserMenu(false); setChatOpen(true); }}><Icon name="chat" /> Open chat</button>
                      <button onClick={handleLogout}><Icon name="logout" /> Log out</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={() => openLogin()}>Log in</button>
            )}
          </div>
        </div>
      </div>

      <div className="app">
        <header className="hero">
          <h1>{title}</h1>
          <p>{data?.settings?.subtitle || DEFAULT_SUBTITLE}</p>
          <div className="hero-stats">
            <OnlinePill count={presence.count} users={presence.users} onClick={() => setModal({ type: "leaderboard" })} />
            <span><strong>{allRefs.length}</strong> websites</span>
            <span><strong>{data?.folders.length || 0}</strong> folders</span>
            <span><strong>{totalClicks}</strong> visits</span>
          </div>
        </header>

        {data?.settings?.announcement && dismissed !== data.settings.announcement && (
          <div className="announcement">
            <Icon name="bulb" /> <span>{data.settings.announcement}</span>
            <button
              className="announcement-x"
              title="Hide until it changes"
              onClick={() => { setDismissed(data.settings!.announcement!); writeLocal("dismissedAnnouncement", data.settings!.announcement); }}
            ><Icon name="x" /></button>
          </div>
        )}

        <PollCards
          polls={data?.polls || []}
          user={user}
          onVote={(pollId, option) => { api("votePoll", { pollId, option }); }}
          onNeedLogin={() => { showToast("Log in to vote"); openLogin(); }}
        />

        <div className="actions-row">
          <div className="actions-left">
            <button className="btn btn-primary" onClick={() => openAdd()}>
              <Icon name="plus" /> {addingLocked ? "Suggest a website" : "Add website"}
            </button>
            {!addingLocked && (
              <button className="btn btn-secondary" onClick={openNewFolder}><Icon name="folder" /> New folder</button>
            )}
          </div>
          <div className="actions-right">
            {allTags.length > 0 && (
              <button
                className={`btn btn-secondary btn-sm tags-toggle ${showTags || tagFilter ? "active" : ""}`}
                onClick={() => { const v = !showTags; setShowTags(v); writeLocal("showTags", v); if (!v) setTagFilter(""); }}
                title="Filter by tag"
              ># Tags</button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={toggleAll} title="Collapse or expand every folder (X)">
              {sortedFolders.some((f) => !collapsed[f.id]) ? "Collapse all" : "Expand all"}
            </button>
            <select value={sort} onChange={(e) => changeSort(e.target.value as Sort)} aria-label="Sort websites">
              <option value="manual">Manual order</option>
              <option value="name">Name A–Z</option>
              <option value="newest">Newest first</option>
              <option value="clicks">Most visited</option>
              <option value="likes">Most liked</option>
            </select>
            <div className="seg-toggle" role="group" aria-label="View">
              <button className={view === "grid" ? "on" : ""} onClick={() => changeView("grid")} title="Grid view"><Icon name="grid" /></button>
              <button className={view === "list" ? "on" : ""} onClick={() => changeView("list")} title="List view"><Icon name="list" /></button>
            </div>
          </div>
        </div>

        {sortedFolders.length > 0 && (
          <nav className="folder-nav sticky" aria-label="Folders">
            {sortedFolders.map((f) => (
              <button
                key={f.id}
                className={activeFolder === f.id ? "on" : ""}
                onClick={() => jumpToFolder(f.id)}
                style={f.color ? ({ "--folder-accent": f.color } as React.CSSProperties) : undefined}
              >
                <span>{f.emoji}</span> {f.name} <em>{f.links.length}</em>
              </button>
            ))}
          </nav>
        )}
        {allTags.length > 0 && (showTags || tagFilter) && (
          <div className="tag-bar">
            {allTags.slice(0, 16).map(([t, n]) => (
              <button key={t} className={tagFilter === t ? "on" : ""} onClick={() => setTagFilter(tagFilter === t ? "" : t)}>
                #{t} <em>{n}/{allRefs.length}</em>
              </button>
            ))}
          </div>
        )}

        {filtering ? (
          <div className="results-bar">
            <span>
              <strong>{matchCount}</strong> {matchCount === 1 ? "website" : "websites"}
              {q && <> matching “{search.trim()}”</>}
              {tagFilter && <> tagged <strong>#{tagFilter}</strong></>}
              {q && matchCount > 0 && <span className="enter-hint"> · press <span className="kbd">Enter</span> to open the first</span>}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(""); setTagFilter(""); }}>Clear</button>
          </div>
        ) : (
          <>
            <QuickTabs
              lists={{ recent: recentOpened, starred: favorites, top: topRated, visited: mostVisited, new: recent }}
              tab={quickTab}
              setTab={(t) => { setQuickTab(t); writeLocal("quickTab", t); }}
              onOpen={trackAndOpen}
              newTab={look.newTab}
            />
          </>
        )}

        <main className="folders">
          {sortedFolders.length === 0 && (
            <div className="empty-state">
              <div className="empty-emoji">📂</div>
              <h3>No folders yet</h3>
              <p>Folders keep websites organised. Make the first one to get started.</p>
              <button className="btn btn-primary" onClick={openNewFolder}><Icon name="plus" /> Create a folder</button>
            </div>
          )}
          {filtering && matchCount === 0 && sortedFolders.length > 0 && (
            <div className="empty-state">
              <div className="empty-emoji">🔍</div>
              <h3>Nothing found</h3>
              <p>No websites match that search. Know a good one?</p>
              <button className="btn btn-secondary" onClick={() => setSuggest({ kind: "addLink" })}><Icon name="bulb" /> Suggest a website</button>
            </div>
          )}
          {folderViews.map(({ folder, links }) => {
            if (filtering && links.length === 0) return null;
            return (
              <FolderSection
                key={folder.id}
                folder={folder}
                links={links}
                totalLinks={folder.links.length}
                collapsed={!filtering && !!collapsed[folder.id]}
                query={search}
                view={view}
                admin={adminUnlocked}
                me={user}
                canAdd={!addingLocked}
                dragEnabled={dragEnabled}
                drag={drag}
                setDrag={setDrag}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                actions={cardActions}
                onToggle={() => toggleCollapsed(folder.id)}
                onAddHere={() => openAdd(folder.id)}
                onOpenAll={() => openAllIn(folder, links)}
                onEditFolder={() => setModal({ type: "folder", folder })}
                onDeleteFolder={() => setModal({ type: "deleteFolder", folder })}
                onShareFolder={() => shareFolder(folder)}
                onMoveLink={moveLink}
                onMoveFolder={moveFolder}
              />
            );
          })}
          {dragEnabled && sortedFolders.length > 0 && (
            <p className="drag-hint"><Icon name="grip" /> Admin tip: drag websites between folders, or drag a folder header to reorder.</p>
          )}
        </main>

        <footer className="footer">
          {title} · Shared with the whole class ·{" "}
          <button className="link-btn" onClick={() => setModal({ type: "shortcuts" })}>Keyboard shortcuts (?)</button>
        </footer>
      </div>

      {modal?.type === "link" && data && (
        <LinkModal
          mode={modal.mode}
          data={data}
          submitting={submitting}
          canCreateFolder={!addingLocked}
          onSubmit={saveLink}
          onCreateFolder={createFolderInline}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "folder" && (
        <FolderModal folder={modal.folder} admin={adminUnlocked} submitting={submitting} onSubmit={saveFolder} onClose={() => setModal(null)} />
      )}
      {modal?.type === "deleteFolder" && (
        <ConfirmModal
          title="Delete folder?"
          body={<>This removes <strong>{modal.folder.emoji} {modal.folder.name}</strong> and its {modal.folder.links.length} websites for everyone.</>}
          confirmLabel="Delete folder"
          submitting={submitting}
          onConfirm={async () => {
            const ok = await api("deleteFolder", { folderId: modal.folder.id, password: adminPassword });
            if (ok) showToast(`Deleted ${modal.folder.name}`, { label: "Undo", run: undo });
            return !!ok;
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "shortcuts" && <ShortcutsModal onClose={() => setModal(null)} />}
      {modal?.type === "leaderboard" && <LeaderboardModal me={user} online={presence.users} onClose={() => setModal(null)} />}
      {modal?.type === "customize" && <CustomizeModal look={look} onChange={changeLook} onClose={() => setModal(null)} />}
      {modal?.type === "whatsnew" && <WhatsNew activity={data?.activity || []} onClose={() => setModal(null)} />}
      {modal?.type === "spin" && (
        <SpinWheel refs={allRefs} folders={sortedFolders} onOpen={(f, l) => trackAndOpen(f, l, true)} onClose={() => setModal(null)} />
      )}
      {modal?.type === "adminLogin" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Admin login</h2>
            <p className="modal-text">Admins can edit, delete, reorder and moderate.</p>
            <form onSubmit={handleAdminLogin}>
              <div className="form-group">
                <label>Admin password</label>
                <input type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} required autoFocus />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Unlock</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modal?.type === "login" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{authMode === "login" ? "Welcome back" : "Create an account"}</h2>
            <div className="auth-tabs">
              <button type="button" className={authMode === "login" ? "on" : ""} onClick={() => setAuthMode("login")}>Log in</button>
              <button type="button" className={authMode === "signup" ? "on" : ""} onClick={() => setAuthMode("signup")}>Sign up</button>
            </div>
            <form onSubmit={handleAuth}>
              <div className="form-group">
                <label>Username</label>
                <input value={fUsername} onChange={(e) => setFUsername(e.target.value)} required autoFocus autoComplete="username" maxLength={20} />
                {authMode === "signup" && <div className="hint">3–20 letters, numbers or _. This is the name others see.</div>}
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={fPassword}
                  onChange={(e) => setFPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                />
                {authMode === "signup" && <div className="hint">At least 6 characters. Don&apos;t reuse a password from another site.</div>}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "…" : authMode === "login" ? "Log in" : "Create account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {suggest && data && (
        <SuggestModal
          data={data}
          user={user}
          start={suggest}
          onClose={() => setSuggest(null)}
          onNeedLogin={() => { setSuggest(null); openLogin(); }}
          showToast={showToast}
        />
      )}
      <ChatPanel
        open={chatOpen}
        setOpen={setChatOpen}
        chatEnabled={data?.settings?.chatEnabled !== false}
        user={user}
        online={presence.users}
        adminPassword={adminUnlocked ? adminPassword : null}
        onNeedLogin={() => openLogin()}
        showToast={showToast}
      />
      {showCmd && (
        <CommandPalette
          onClose={() => setShowCmd(false)}
          chipLabel={title}
          status={{
            title: user ? `Logged in as ${user}` : "Not logged in",
            sub: `${allRefs.length} websites · ${data?.folders.length || 0} folders · ${totalClicks} visits`,
            online: !!user,
            run: () => { setShowCmd(false); if (!user) openLogin(); else setChatOpen(true); },
          }}
          shortcuts={paletteActions().slice(0, 8)}
          sections={[
            { title: "Actions", items: paletteActions() },
            { title: "Most visited", emptyQueryOnly: true, items: mostVisited.slice(0, 5).map(linkItem) },
            { title: "Folders", queryOnly: true, items: sortedFolders.map(folderItem) },
            { title: "Websites", queryOnly: true, items: allRefs.map(linkItem) },
          ]}
        />
      )}
      {scrolled && (
        <button className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: look.motion ? "smooth" : "auto" })} title="Back to top">
          <Icon name="up" />
        </button>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.msg}</span>
          {toast.action && (
            <button onClick={() => { toast.action!.run(); setToast(null); }}>{toast.action.label}</button>
          )}
        </div>
      )}
    </div>
  );
}
