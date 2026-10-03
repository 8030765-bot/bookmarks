"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { BookmarksData, Folder, Link, Suggestion } from "@/lib/types";
import ChatPanel from "./ChatPanel";
import type { PaletteItem } from "./CommandPalette";
import type { SuggestStart } from "./SuggestModal";
import { Icon } from "./components/Icon";
import FolderSection, { Drag, FolderMeta } from "./components/FolderSection";
import { FolderInfo, FolderMenu, FolderMenuState, PickModal, TagManager, folderMarkdown } from "./components/FolderExtras";
import { MatchContext, closestWord, exactMatch, forgivingMatch, matchLink, parseQuery, relevance } from "./components/query";
import SearchBox from "./components/SearchBox";
import MyStuff from "./components/MyStuff";
import { PasswordStrength } from "./components/People";
const AccountModal = dynamic(() => import("./components/Account"), { ssr: false });
const ClubsModal = dynamic(() => import("./components/Clubs"), { ssr: false });
import ScrollMap from "./components/ScrollMap";
import type { ChatMessage } from "@/lib/types";
import { CardContext, CardEnv, LinkCardActions } from "./components/cardEnv";
import CardMenu, { CardMenuState } from "./components/CardMenu";
import SelectionBar from "./components/SelectionBar";
import type { LinkModalMode, LinkValues } from "./components/LinkModal";
import { reportStatus, useOnRevChange, useRev, useSyncLoop, useSyncStatus } from "./components/sync";
// big, rarely-needed pieces load on demand so the first visit is faster
const CommandPalette = dynamic(() => import("./CommandPalette"), { ssr: false });
const AdminPanel = dynamic(() => import("./AdminPanel"), { ssr: false, loading: () => <div className="admin-panel admin-loading"><div className="skeleton" /></div> });
const SuggestModal = dynamic(() => import("./SuggestModal"), { ssr: false });
const LinkModal = dynamic(() => import("./components/LinkModal"), { ssr: false });
import { ConfirmModal, FolderModal, FolderValues, PromptModal, ShortcutsModal } from "./components/Modals";
import Favicon from "./components/Favicon";
import {
  NotificationBell, ProfileCard, ProfileModal, usePersonal,
} from "./components/Personal";
import { NotificationPanel, WeeklyDigest, disablePush, enablePush, playPing } from "./components/Notifications";
import { LinkRef, asMarkdown, isExpired, isNewSince, newOpId, normUrl, readLocal, safeHref, suggestionSummary, urlsIn, writeLocal } from "./components/ui";
import {
  CustomizeModal, DEFAULT_LOOK, LeaderboardModal, Look, OnlinePill, Palette, PollCards, SpinWheel, WhatsNew, applyLook, usePresence,
} from "./components/Community";

const ADMIN_PW_KEY = "adminPw";
const CACHE_KEY = "cache:data";
const DEFAULT_TITLE = "Made by Theo 7A";
const DEFAULT_SUBTITLE = "Shared school bookmarks — everyone sees the same list";

type Sort = "manual" | "name" | "newest" | "clicks" | "likes" | "rating" | "mine";
type PromptState = { title: string; initial: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string };
/** Treat a fresh visit as starting after 30 minutes away. */
const SESSION_GAP_MS = 30 * 60_000;
type Modal =
  | { type: "link"; mode: LinkModalMode }
  | { type: "folder"; folder?: Folder; smart?: boolean }
  | { type: "tags" }
  | { type: "account" }
  | { type: "saved" }
  | { type: "deleteFolder"; folder: Folder }
  | { type: "adminLogin" }
  | { type: "login" }
  | { type: "shortcuts" }
  | { type: "leaderboard" }
  | { type: "customize" }
  | { type: "spin" }
  | { type: "whatsnew" }
  | { type: "profileEdit" }
  | { type: "recovery"; code: string; context: "signup" | "reset" }
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

type QuickTab = "recent" | "later" | "starred" | "following" | "top" | "visited" | "new";
const QUICK_TABS: { id: QuickTab; label: string; icon: string }[] = [
  { id: "recent", label: "Recent", icon: "clock" },
  { id: "later", label: "Read later", icon: "note" },
  { id: "starred", label: "Starred", icon: "star" },
  { id: "following", label: "Following", icon: "users" },
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
        <span className="nav-label">Shortcuts</span>
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
  // every pop-up this visit, so a missed one can be read later
  const [toastLog, setToastLog] = useState<{ msg: string; at: number }[]>([]);
  const [digestOpen, setDigestOpen] = useState(false);
  const [pingOn, setPingOn] = useState(true);
  const [pingName, setPingName] = useState("classic");
  const [clubsOpen, setClubsOpen] = useState(false);
  // where chat should open: a channel / message from a link or notification, or text to share
  const [chatTarget, setChatTarget] = useState<{ channel?: string; msg?: string; text?: string } | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<"any" | "all">("any");
  const [tagCloud, setTagCloud] = useState(false);
  const [space, setSpace] = useState("");
  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [folderInfoId, setFolderInfoId] = useState<string | null>(null);
  const [pick, setPick] = useState<{ kind: "merge" | "split"; folder: Folder } | null>(null);
  const [chipDrag, setChipDrag] = useState<string | null>(null);
  const [startDismissed, setStartDismissed] = useState(true);
  const [resultSort, setResultSort] = useState<"best" | "folder" | "newest" | "rating">("best");
  const [chatHits, setChatHits] = useState<ChatMessage[]>([]);
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
  const [role, setRole] = useState<"owner" | "admin" | "mod" | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileView, setProfileView] = useState<string | null>(null);
  const [aggRatings, setAggRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [ownerExists, setOwnerExists] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup" | "reset">("login");
  const [fUsername, setFUsername] = useState("");
  const [fCode, setFCode] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  // 2-step login: the password was right, now waiting for the 6-digit code
  const [ticket, setTicket] = useState<string | null>(null);
  const [fTotp, setFTotp] = useState("");
  const [myStuffOpen, setMyStuffOpen] = useState(false);
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
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastSelected = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [folderViewPrefs, setFolderViewPrefs] = useState<Record<string, "grid" | "list">>({});
  // when you were last here: links added/edited since then get a badge
  const [since, setSince] = useState(0);
  const installPrompt = useRef<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const topbarRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string, action?: Toast["action"], ms?: number) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, action });
    toastTimer.current = setTimeout(() => setToast(null), ms ?? (action ? 6000 : 2800));
    setToastLog((log) => [{ msg, at: Date.now() }, ...log].slice(0, 30));
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
    setFolderViewPrefs(readLocal("folderViews", {}));
    setSpace(readLocal("space", ""));
    setStartDismissed(readLocal("startDismissed", false));
    // a new visit starts after 30 minutes away; remember when the last one ended
    const lastSeen = readLocal<number>("lastSeen", 0);
    let prev = readLocal<number>("prevVisit", 0);
    if (!lastSeen || Date.now() - lastSeen > SESSION_GAP_MS) { prev = lastSeen; writeLocal("prevVisit", prev); }
    setSince(prev);
    const tick = () => writeLocal("lastSeen", Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
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

  // offline support + "update available" (production only — dev reloads constantly)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const onController = () => { if (!reloading) { reloading = true; location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    let hourly: ReturnType<typeof setInterval> | undefined;
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      const offer = (w: ServiceWorker | null) => {
        if (!w || !navigator.serviceWorker.controller) return;
        showToast("A new version of the site is ready", { label: "Update", run: () => w.postMessage("skipWaiting") }, 60_000);
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => { if (w.state === "installed") offer(w); });
      });
      hourly = setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
    return () => { navigator.serviceWorker.removeEventListener("controllerchange", onController); clearInterval(hourly); };
  }, [showToast]);
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
  // Show the last copy saved on this device instantly (and when offline),
  // then swap in the fresh list as soon as it arrives.
  const load = useCallback(async () => {
    const cached = readLocal<BookmarksData | null>(CACHE_KEY, null);
    if (cached && Array.isArray(cached.folders)) {
      setData((d) => d || ensureData(cached));
      setLoading(false);
    }
    try {
      setError(null);
      const res = await fetch("/api/bookmarks", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.quota) reportStatus("quota");
        throw new Error(json.error || "Failed to load");
      }
      setSafeData(json);
    } catch (e: any) {
      if (!cached) setError(e.message || "Could not load bookmarks");
      else if (!navigator.onLine) reportStatus("offline");
    } finally {
      setLoading(false);
    }
  }, [setSafeData]);
  useEffect(() => { load(); }, [load]);

  // keep the on-device copy fresh (debounced — the list can be big)
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => writeLocal(CACHE_KEY, data), 1000);
    return () => clearTimeout(t);
  }, [data]);

  const revRef = useRef(0);
  useEffect(() => { revRef.current = data?.rev ?? 0; }, [data]);
  const applyIfNewer = useCallback((json: any) => {
    if (json && !json.unchanged && Array.isArray(json.folders) && (json.rev ?? 0) > revRef.current) setSafeData(json);
  }, [setSafeData]);

  // one shared poll tells every part of the page when its data changed
  useSyncLoop(user);
  const syncStatus = useSyncStatus();
  useEffect(() => { setOffline(syncStatus === "offline"); }, [syncStatus]);
  const serverRev = useRev("bookmarks");
  useEffect(() => {
    if (serverRev < 0 || serverRev <= revRef.current) return;
    fetch("/api/bookmarks", { cache: "no-store" }).then((r) => r.json()).then(applyIfNewer).catch(() => {});
  }, [serverRev, applyIfNewer]);

  const presence = usePresence(user);
  const personal = usePersonal(user);
  const favoriteSet = useMemo(() => new Set(personal.favorites), [personal.favorites]);

  // ---------- settings that follow you between devices ----------
  const [startView, setStartView] = useState("top");
  useEffect(() => { setStartView(readLocal("startView", "top")); }, []);
  const syncedFor = useRef<string | null>(null);
  const snapshot = () => ({ look, view, sort, collapsed, quickTab, showTags, space, folderViews: folderViewPrefs, startView });
  useEffect(() => {
    if (!user || !personal.loaded || personal.user?.toLowerCase() !== user.toLowerCase() || syncedFor.current === user) return;
    syncedFor.current = user;
    const s = personal.settings;
    if (s.sync === false) return;
    // a brand-new account takes this device's settings; otherwise the account's win
    if (!s.look) { personal.saveSettings(snapshot()); return; }
    const apply = <T,>(key: string, set: (v: T) => void, local = key) => {
      if (s[key] === undefined) return;
      set(s[key] as T);
      writeLocal(local, s[key]);
    };
    setLook({ ...DEFAULT_LOOK, ...(s.look as Partial<Look>) });
    writeLocal("look", { ...DEFAULT_LOOK, ...(s.look as Partial<Look>) });
    apply("view", setView);
    apply("sort", setSort);
    apply("collapsed", setCollapsed);
    apply("quickTab", setQuickTab);
    apply("showTags", setShowTags);
    apply("space", setSpace);
    apply("folderViews", setFolderViewPrefs);
    apply("startView", setStartView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, personal.loaded, personal.user]);
  useEffect(() => {
    if (!user || syncedFor.current !== user || personal.settings.sync === false) return;
    const t = setTimeout(() => personal.saveSettings(snapshot()), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, view, sort, collapsed, quickTab, showTags, space, folderViewPrefs, startView]);
  useEffect(() => { if (!user) syncedFor.current = null; }, [user]);

  // unread count in the tab title and on the installed app's icon
  const unreadCount = personal.notifications.filter((n) => !n.read).length;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = unreadCount ? `(${unreadCount > 99 ? "99+" : unreadCount}) ${base}` : base;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unreadCount) nav.setAppBadge?.(unreadCount).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [unreadCount]);
  useEffect(() => { setPingOn(readLocal("pingSound", true)); setPingName(readLocal("pingName", "classic")); }, []);
  const quietNow = !!personal.dndUntil && Date.parse(personal.dndUntil) > Date.now();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("chat") !== "open") return;
    setChatOpen(true);
    setChatTarget({ channel: params.get("ch") || undefined, msg: params.get("msg") || undefined });
  }, []);

  // ?edit=profile (from your profile page) opens the profile editor
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(location.search);
    if (params.get("edit") !== "profile") return;
    setModal({ type: "profileEdit" });
    params.delete("edit");
    window.history.replaceState(null, "", `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`);
  }, [user]);

  // average ratings: load once, then again whenever anyone rates something
  const loadRatings = useCallback(() => {
    fetch("/api/ratings", { cache: "no-store" }).then((r) => r.json()).then((j) => setAggRatings(j.ratings || {})).catch(() => {});
  }, []);
  useEffect(() => { loadRatings(); }, [loadRatings]);
  useOnRevChange("ratings", loadRatings);

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
    // no link to follow: open wherever you chose in Customize
    const sv = readLocal<string>("startView", "top");
    if (!location.hash && !location.search.includes("q=") && sv !== "top") {
      if (sv === "later") setQuickTab("later");
      else if (sv === "favorites") setQuickTab("starred");
      else if (sv.startsWith("folder:") && data.folders.some((f) => f.id === sv.slice(7))) setTimeout(() => jumpToFolder(sv.slice(7)), 200);
    }
    const m = location.hash.match(/^#folder-(.+)$/);
    if (m && data.folders.some((f) => f.id === m[1])) setTimeout(() => jumpToFolder(m[1]), 150);
    // #link-<id>: open that website's folder, scroll to the card and show its details
    const lm = location.hash.match(/^#link-(.+)$/);
    const target = lm ? data.folders.find((f) => f.links.some((l) => l.id === lm[1])) : undefined;
    if (lm && target) {
      toggleCollapsed(target.id, false);
      setExpandedId(lm[1]);
      setFocusedId(lm[1]);
      setTimeout(() => {
        const el = document.querySelector(`.card[data-link-id="${lm[1]}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.classList.add("flash-card");
        setTimeout(() => el?.classList.remove("flash-card"), 1500);
      }, 250);
    }
  }, [data]);

  // ---------- account + admin session ----------
  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setUser(j.user || null);
      setRole(j.role || null);
      setOwnerExists(!!j.ownerExists);
      if (j.role) { setAdminUnlocked(true); setAdminPassword(""); }
    }).catch(() => {});
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
  const checkSuggestions = useCallback(async () => {
    if (!user) return;
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
  }, [user, showToast]);
  useEffect(() => { suggestionStatus.current = null; checkSuggestions(); }, [checkSuggestions]);
  useOnRevChange("suggestions", checkSuggestions);

  // ---------- server calls ----------
  async function api(action: string, payload: Record<string, any> = {}, { quiet = false } = {}): Promise<BookmarksData | null> {
    if (!quiet) setSubmitting(true);
    // the same id on every retry, so the server applies the change only once
    const body = JSON.stringify({ action, ...payload, opId: newOpId() });
    try {
      for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
          res = await fetch("/api/bookmarks", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        } catch (netErr) {
          // flaky connection: try again a couple of times before giving up
          if (attempt < 2) { await new Promise((r) => setTimeout(r, 700 * (attempt + 1))); continue; }
          reportStatus("offline");
          throw new Error("You're offline — that change wasn't saved");
        }
        if ([502, 503, 504].includes(res.status) && attempt < 2) {
          const peek = await res.clone().json().catch(() => ({}));
          if (!peek.quota) { await new Promise((r) => setTimeout(r, 700 * (attempt + 1))); continue; }
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (json.quota) reportStatus("quota");
          throw new Error(json.error || "Request failed");
        }
        const next = ensureData(json);
        setData(next);
        return next;
      }
    } catch (e: any) {
      showToast(e.message || "Something went wrong");
      return null;
    } finally {
      if (!quiet) setSubmitting(false);
    }
  }
  /** Change one link on screen right away; the server's answer replaces it a moment later. */
  function patchLinkLocally(folderId: string, linkId: string, fn: (l: Link) => Link) {
    setData((d) => d && {
      ...d,
      folders: d.folders.map((f) => (f.id !== folderId ? f : { ...f, links: f.links.map((l) => (l.id === linkId ? fn(l) : l)) })),
    });
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
  const favorites = allRefs.filter((r) => favoriteSet.has(r.link.id));
  const mostVisited = [...allRefs].filter((r) => (r.link.clicks || 0) > 0).sort((a, b) => (b.link.clicks || 0) - (a.link.clicks || 0)).slice(0, 8);
  const topRated = allRefs.filter((r) => (r.link.likes?.length || 0) > 0).sort((a, b) => (b.link.likes?.length || 0) - (a.link.likes?.length || 0)).slice(0, 8);
  const latestActivity = data?.activity?.[0]?.id ?? null;
  const hasNews = !!latestActivity && seenActivity !== "" && seenActivity !== latestActivity;
  const recent = allRefs.filter((r) => isNewSince(r.link, since)).sort((a, b) => (b.link.createdAt || "").localeCompare(a.link.createdAt || "")).slice(0, 8);
  const recentOpened: LinkRef[] = useMemo(() => {
    const byId = new Map(allRefs.map((r) => [r.link.id, r]));
    return history.map((h) => byId.get(h.linkId)).filter((r): r is LinkRef => !!r).slice(0, 10);
  }, [history, allRefs]);
  const readLater = allRefs.filter((r) => personal.links[r.link.id]?.later);
  // newest links from people you follow
  const followingAdds = personal.following.length
    ? allRefs.filter((r) => r.link.addedBy && personal.following.includes(r.link.addedBy.toLowerCase()))
      .sort((a, b) => (b.link.createdAt || "").localeCompare(a.link.createdAt || "")).slice(0, 12)
    : [];
  const hiddenCount = allRefs.filter((r) => personal.links[r.link.id]?.hidden).length;
  const lastOpened = useMemo(() => new Map(history.map((h) => [h.linkId, h.at])), [history]);
  const folderById = useMemo(() => new Map((data?.folders || []).map((f) => [f.id, f])), [data]);
  // a link pasted in chat that's already on the site shows as a bookmark card
  const knownByUrl = useMemo(() => {
    const m = new Map<string, { name: string; url: string; folder: string; emoji: string }>();
    allRefs.forEach(({ folder, link }) => m.set(normUrl(link.url), { name: link.name, url: link.url, folder: folder.name, emoji: folder.emoji }));
    return m;
  }, [allRefs]);
  const knownLink = useCallback((url: string) => knownByUrl.get(normUrl(url)), [knownByUrl]);
  const savedMsgIds = useMemo(() => new Set(personal.savedMessages.map((m) => m.id)), [personal.savedMessages]);
  const totalClicks = allRefs.reduce((n, r) => n + (r.link.clicks || 0), 0);
  const parsed = useMemo(() => parseQuery(search), [search]);
  const q = search.trim().toLowerCase();
  const filtering = parsed.active || tagFilters.length > 0;
  const matchCtx: MatchContext = { prefs: personal.links, favorites: favoriteSet, since, me: user, avgRating: (id) => aggRatings[id]?.avg || 0 };
  const folderPrefs = personal.folders;
  const spaces = useMemo(
    () => Array.from(new Set((data?.folders || []).map((f) => f.space).filter((x): x is string => !!x))).sort(),
    [data]
  );
  // a space that no longer exists falls back to "All"
  const activeSpace = space && spaces.includes(space) ? space : "";
  const smartRules = useMemo(
    () => new Map((data?.folders || []).filter((f) => f.rule).map((f) => [f.id, parseQuery(f.rule!)])),
    [data]
  );
  // folders you look after (maintainers can edit their links)
  const editableFolders = useMemo(
    () => new Set((data?.folders || []).filter((f) => !!user && f.maintainers?.includes(user.toLowerCase())).map((f) => f.id)),
    [data, user]
  );
  const canEditFolder = (f: Folder) => adminUnlocked || editableFolders.has(f.id);

  /** Hidden-for-me and expired links drop out (admins still see expired ones). */
  function shown(l: Link) {
    if (!showHidden && personal.links[l.id]?.hidden) return false;
    if (!adminUnlocked && isExpired(l)) return false;
    return true;
  }
  function matchesWith(l: Link, folder: Folder, wordMatch: (hay: string, w: string) => boolean) {
    if (tagFilters.length) {
      const has = (t: string) => !!l.tags?.includes(t);
      if (tagMode === "all" ? !tagFilters.every(has) : !tagFilters.some(has)) return false;
    }
    return matchLink(parsed, l, folder, matchCtx, wordMatch);
  }
  // exact words (and synonyms) first; only if nothing matches, allow small typos
  const useFuzzy = parsed.words.length > 0 && !allRefs.some((r) => shown(r.link) && !r.folder.rule && matchesWith(r.link, r.folder, exactMatch));
  function matches(l: Link, folder: Folder) {
    return matchesWith(l, folder, useFuzzy ? forgivingMatch : exactMatch);
  }
  /** Your own sort for a folder wins, then the main sort, then the folder's default. */
  function effectiveSort(folder: Folder): string {
    if (filtering && resultSort !== "folder") return resultSort === "best" && !parsed.words.length && !parsed.phrases.length ? "manual" : resultSort;
    return folderPrefs[folder.id]?.sort || (sort !== "manual" ? sort : folder.sort || "manual");
  }
  function sortRefs(list: LinkRef[], how: string): LinkRef[] {
    const by = (fn: (a: Link, b: Link) => number) => [...list].sort((a, b) => fn(a.link, b.link));
    if (how === "name") list = by((a, b) => a.name.localeCompare(b.name));
    if (how === "newest") list = by((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (how === "clicks") list = by((a, b) => (b.clicks || 0) - (a.clicks || 0));
    if (how === "likes") list = by((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
    if (how === "rating") list = by((a, b) => (aggRatings[b.id]?.avg || 0) - (aggRatings[a.id]?.avg || 0));
    if (how === "mine") list = by((a, b) => (personal.ratings[b.id] || 0) - (personal.ratings[a.id] || 0));
    if (how === "best") list = by((a, b) => relevance(parsed, b) - relevance(parsed, a));
    // pinned links always lead their folder
    return [...list].sort((a, b) => Number(!!b.link.pinned) - Number(!!a.link.pinned));
  }
  function visibleLinks(folder: Folder): Link[] {
    if (folder.rule) return [];
    return sortRefs(folder.links.filter((l) => shown(l) && matches(l, folder)).map((link) => ({ folder, link })), effectiveSort(folder)).map((r) => r.link);
  }
  /** Links shown here that live elsewhere: "also show in" links, or everything a smart folder's rule matches. */
  function shortcutsFor(folder: Folder): LinkRef[] {
    const rule = smartRules.get(folder.id);
    if (rule) {
      const hits = allRefs.filter((r) => !r.folder.rule && shown(r.link) && matchLink(rule, r.link, r.folder, matchCtx) && matches(r.link, r.folder));
      return sortRefs(hits, effectiveSort(folder));
    }
    return allRefs.filter((r) => r.folder.id !== folder.id && r.link.alsoIn?.includes(folder.id) && shown(r.link) && matches(r.link, r.folder));
  }

  // which folders show, and in what order
  const canSeeFolder = (f: Folder) => (adminUnlocked || !f.archived) && (showHidden || !folderPrefs[f.id]?.hidden);
  const allFolderIds = new Set((data?.folders || []).map((f) => f.id));
  const childrenOf = new Map<string, Folder[]>();
  (data?.folders || []).forEach((f) => {
    if (f.parentId && allFolderIds.has(f.parentId) && canSeeFolder(f)) childrenOf.set(f.parentId, [...(childrenOf.get(f.parentId) || []), f]);
  });
  const topFolders = (() => {
    const all = data?.folders || [];
    let tops = all.filter((f) => (!f.parentId || !allFolderIds.has(f.parentId)) && canSeeFolder(f));
    if (activeSpace) tops = tops.filter((f) => f.space === activeSpace);
    const order = personal.folderOrder;
    if (order.length) {
      const pos = new Map(order.map((id, i) => [id, i]));
      tops = [...tops].sort((a, b) => (pos.get(a.id) ?? 1e6 + all.indexOf(a)) - (pos.get(b.id) ?? 1e6 + all.indexOf(b)));
    }
    // pinned first, then your favorite folders, then the rest; archived ones last
    const rank = (f: Folder) => (f.archived ? 3 : f.pinned ? 0 : folderPrefs[f.id]?.fav ? 1 : 2);
    tops = [...tops].sort((a, b) => rank(a) - rank(b));
    if (filtering && resultSort === "best" && parsed.words.length) {
      // the folder with the best hit comes first
      const best = (f: Folder) => Math.max(0, ...[f, ...(childrenOf.get(f.id) || [])].flatMap((x) => x.links.filter((l) => shown(l) && matches(l, x)).map((l) => relevance(parsed, l))));
      const scores = new Map(tops.map((f) => [f.id, best(f)]));
      tops.sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0));
    }
    return tops;
  })();
  const sortedFolders = topFolders.flatMap((f) => [f, ...(childrenOf.get(f.id) || [])]);
  const folderVisited = useMemo(() => {
    const m = new Map<string, number>();
    history.forEach((h) => m.set(h.folderId, Math.max(m.get(h.folderId) || 0, h.at)));
    return m;
  }, [history]);
  function metaFor(folder: Folder): FolderMeta {
    let updatedAt = 0, unread = 0, done = 0;
    const meLower = user?.toLowerCase();
    for (const l of folder.links) {
      updatedAt = Math.max(updatedAt, l.createdAt ? Date.parse(l.createdAt) : 0, l.updatedAt ? Date.parse(l.updatedAt) : 0);
      if (since && isNewSince(l, since) && l.addedBy?.toLowerCase() !== meLower) unread++;
      if (personal.links[l.id]?.done) done++;
    }
    return { updatedAt, visitedAt: folderVisited.get(folder.id), unread, done, fav: folderPrefs[folder.id]?.fav, follow: folderPrefs[folder.id]?.follow };
  }
  type FolderView = { folder: Folder; links: Link[]; shortcuts: LinkRef[] };
  const viewOf = (f: Folder): FolderView => ({ folder: f, links: visibleLinks(f), shortcuts: shortcutsFor(f) });
  const folderViews = sortedFolders.map(viewOf);
  const viewById = new Map(folderViews.map((v) => [v.folder.id, v]));
  const hasContent = (v: FolderView | undefined) => !!v && (v.links.length > 0 || v.shortcuts.length > 0);
  /** Should this folder (and, for a parent, its sub-folders) be drawn? */
  function folderVisible(f: Folder): boolean {
    const v = viewById.get(f.id);
    const kids = childrenOf.get(f.id) || [];
    if (filtering) return hasContent(v) || kids.some((k) => hasContent(viewById.get(k.id)));
    if (look.hideEmpty && !f.rule && !hasContent(v) && !kids.some((k) => hasContent(viewById.get(k.id)))) return false;
    return true;
  }
  const matchCount = folderViews.reduce((n, v) => n + v.links.length + (v.folder.rule ? 0 : v.shortcuts.filter((r) => !r.link.alsoIn).length), 0);

  // built-in lists shown as folders (optional, in Customize)
  const specialViews: FolderView[] = !look.specialFolders || filtering ? [] : ([
    { folder: { id: "__recent", name: "Recently added", emoji: "🆕", links: [] }, links: [],
      shortcuts: [...allRefs].filter((r) => shown(r.link) && r.link.createdAt).sort((a, b) => (b.link.createdAt || "").localeCompare(a.link.createdAt || "")).slice(0, 12) },
    { folder: { id: "__popular", name: "Most popular", emoji: "🔥", links: [] }, links: [],
      shortcuts: [...allRefs].filter((r) => shown(r.link) && (r.link.clicks || 0) > 0).sort((a, b) => (b.link.clicks || 0) - (a.link.clicks || 0)).slice(0, 12) },
    { folder: { id: "__top", name: "Top rated", emoji: "⭐", links: [] }, links: [],
      shortcuts: [...allRefs].filter((r) => shown(r.link) && aggRatings[r.link.id]?.count).sort((a, b) => (aggRatings[b.link.id]?.avg || 0) - (aggRatings[a.link.id]?.avg || 0)).slice(0, 12) },
  ] as FolderView[]).filter((v) => v.shortcuts.length > 0);

  /** Every card on screen, top to bottom — for J/K and shift-click ranges. */
  const visibleOrder = useMemo(
    () => folderViews.filter((v) => folderVisible(v.folder) || (v.folder.parentId && folderVisible(folderById.get(v.folder.parentId)!)))
      .flatMap((v) => (!filtering && collapsed[v.folder.id] ? [] : v.links.map((l) => l.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, search, tagFilters, tagMode, sort, collapsed, showHidden, personal.links, personal.folders, personal.folderOrder, adminUnlocked, activeSpace, look.hideEmpty]
  );
  // "Did you mean …?" when nothing matched
  const didYouMean = useMemo(() => {
    if (!filtering || !parsed.words.length) return null;
    const vocab = new Set<string>();
    allRefs.forEach(({ link, folder }) => {
      `${link.name} ${folder.name} ${(link.tags || []).join(" ")}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).forEach((w) => w.length > 2 && vocab.add(w));
    });
    let changed = false;
    const fixed = search.trim().split(/\s+/).map((tok) => {
      const lower = tok.toLowerCase();
      if (!parsed.words.includes(lower) || vocab.has(lower)) return tok;
      const c = closestWord(lower, vocab);
      if (c) { changed = true; return c; }
      return tok;
    }).join(" ");
    return changed ? fixed : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, allRefs, filtering]);

  // the search box also looks through recent chat
  useEffect(() => {
    const words = parsed.words.concat(parsed.phrases);
    if (!words.length || words.join("").length < 3) { setChatHits([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const j = await fetch("/api/chat", { cache: "no-store" }).then((r) => r.json());
        if (!live || !Array.isArray(j.messages)) return;
        setChatHits((j.messages as ChatMessage[]).filter((m) => words.every((w) => m.text.toLowerCase().includes(w))).slice(-5).reverse());
      } catch {}
    }, 450);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // keep ?q= in the address bar so a search can be shared (and survive a reload)
  const urlSynced = useRef(false);
  useEffect(() => {
    if (!urlSynced.current) return;
    const url = new URL(location.href);
    if (search.trim()) url.searchParams.set("q", search.trim()); else url.searchParams.delete("q");
    if (tagFilters.length) url.searchParams.set("tags", tagFilters.join(",")); else url.searchParams.delete("tags");
    window.history.replaceState(null, "", url.toString());
    try { sessionStorage.setItem("lastSearch", search); } catch {}
  }, [search, tagFilters]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let q0 = params.get("q");
    if (q0 === null) { try { q0 = sessionStorage.getItem("lastSearch"); } catch {} }
    if (q0) setSearch(q0);
    const t0 = params.get("tags");
    if (t0) { setTagFilters(t0.split(",").filter(Boolean)); setShowTags(true); }
    urlSynced.current = true;
  }, []);
  function copySearchLink() {
    navigator.clipboard.writeText(location.href).then(() => showToast("Link to this search copied")).catch(() => showToast(location.href));
  }
  function openCard(linkId: string) {
    const target = data?.folders.find((f) => f.links.some((l) => l.id === linkId));
    if (!target) return;
    toggleCollapsed(target.id, false);
    setExpandedId(linkId);
    setFocusedId(linkId);
    setTimeout(() => {
      const el = document.querySelector(`.card[data-link-id="${linkId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("flash-card");
      setTimeout(() => el?.classList.remove("flash-card"), 1500);
    }, 200);
  }
  function surpriseFolder() {
    const pool = topFolders.filter((f) => f.links.length && !f.rule);
    const f = pool[Math.floor(Math.random() * pool.length)];
    if (f) { jumpToFolder(f.id); showToast(`🎲 ${f.emoji} ${f.name}`); }
  }
  function focusFirstResult() {
    const first = visibleOrder[0];
    if (!first) return;
    searchRef.current?.blur();
    setFocusedId(first);
    requestAnimationFrame(() => document.querySelector(`.card[data-link-id="${first}"]`)?.scrollIntoView({ block: "center", behavior: look.motion ? "smooth" : "auto" }));
  }

  const startFolder = data?.settings?.startFolderId ? folderById.get(data.settings.startFolderId) : undefined;
  const showStart = !!startFolder && !startDismissed && since === 0 && history.length < 3;

  const addingLocked = !!data?.settings?.lockAdding && !adminUnlocked;
  const dragEnabled = adminUnlocked && sort === "manual" && !filtering && !personal.folderOrder.length;
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
    // clicks don't block the UI and don't show errors; the count goes up on screen straight away
    patchLinkLocally(folder.id, link.id, (l) => ({ ...l, clicks: (l.clicks || 0) + 1 }));
    fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trackClick", folderId: folder.id, linkId: link.id }),
      keepalive: true,
    }).catch(() => {});
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
  function openAdd(folderId?: string, url?: string, bulk?: string) {
    if (addingLocked) { setSuggest({ kind: "addLink" }); return; }
    if (!data?.folders.length) { setModal({ type: "folder" }); showToast("Create a folder first"); return; }
    setModal({ type: "link", mode: { kind: "add", folderId, url, bulk } });
  }
  function openNewFolder(smart = false) {
    if (addingLocked) { setSuggest({ kind: "other" }); return; }
    setModal({ type: "folder", smart });
  }
  function toggleTag(t: string) {
    setTagFilters((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }
  function applyView(v: { q: string; tags: string[]; tagMode: "any" | "all"; sort?: string }) {
    setSearch(v.q);
    setTagFilters(v.tags);
    setTagMode(v.tagMode);
    if (v.sort) changeSort(v.sort as Sort);
    if (v.tags.length) setShowTags(true);
  }
  function saveCurrentView() {
    setPrompt({
      title: "Save this view",
      initial: search.trim() || tagFilters.map((t) => `#${t}`).join(" "),
      placeholder: "e.g. Maths videos",
      onSave: (name) => {
        if (!name.trim()) return;
        personal.saveView({ name: name.trim(), q: search.trim(), tags: tagFilters, tagMode, sort });
        showToast(`Saved “${name.trim()}” — it's in the Views row`);
      },
    });
  }
  /** Drag folder chips: admins arrange for everyone, others just for themselves. */
  function reorderChips(fromId: string, beforeId: string) {
    setChipDrag(null);
    if (fromId === beforeId) return;
    if (adminUnlocked && !personal.folderOrder.length) { moveFolder(fromId, beforeId); return; }
    const ids = topFolders.map((f) => f.id).filter((id) => id !== fromId);
    ids.splice(Math.max(0, ids.indexOf(beforeId)), 0, fromId);
    personal.setFolderOrder(ids);
    showToast("Folder order saved for you — reset it from the ⋯ menu at the top");
  }
  async function folderApi(action: string, payload: Record<string, unknown>, done: string) {
    if (await api(action, { ...payload, password: adminPassword })) showToast(done);
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
    const { folderId: _target, ...fields } = values;
    const common = { ...fields, password: adminPw() };
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
  async function addMany(folderId: string, links: { name: string; url: string }[], tags: string[]): Promise<boolean> {
    const next = await api("addLinks", { folderId, links, tags, password: adminPw() });
    if (next) showToast(`Added ${next.activity?.[0]?.detail?.match(/\d+/)?.[0] || links.length} websites for everyone`);
    return !!next;
  }
  async function createFolderInline(name: string): Promise<string | null> {
    const next = await api("addFolder", { name, emoji: "📁", password: adminPw() });
    if (!next) return null;
    const created = [...next.folders].reverse().find((f) => f.name === name);
    return created?.id || null;
  }
  async function saveFolder(v: FolderValues): Promise<boolean> {
    if (modal?.type !== "folder") return false;
    const fields = {
      name: v.name, emoji: v.emoji, color: v.color, description: v.description, guide: v.guide, parentId: v.parentId,
      sort: v.sort, ...(adminUnlocked ? { space: v.space, rule: v.rule, maintainers: v.maintainers } : {}),
    };
    if (!modal.folder) {
      const ok = await api("addFolder", { ...fields, password: adminPw() });
      if (ok) showToast(`Created ${v.emoji} ${v.name}`);
      return !!ok;
    }
    const ok = await api("editFolder", { folderId: modal.folder.id, ...fields, pinned: v.pinned, password: adminPassword });
    if (ok) showToast("Folder saved");
    return !!ok;
  }

  const cardActions: LinkCardActions = {
    newTab: look.newTab,
    open: (f, l) => trackAndOpen(f, l),
    star: (_f, l) => { if (!user) { showToast("Log in to save favorites"); openLogin(); return; } personal.toggleFavorite(l.id); },
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
      const me = user.toLowerCase();
      patchLinkLocally(f.id, l.id, (x) => {
        const likes = x.likes || [];
        return { ...x, likes: likes.includes(me) ? likes.filter((u) => u !== me) : [...likes, me] };
      });
      api("toggleLike", { folderId: f.id, linkId: l.id }, { quiet: true }).then((ok) => { if (!ok) load(); });
    },
    filterTag: (t) => { toggleTag(t); setShowTags(true); window.scrollTo({ top: 0, behavior: "smooth" }); },
    rate: (linkId, stars) => { if (!user) { showToast("Log in to rate"); openLogin(); return; } personal.rate(linkId, stars); },
    openProfile: (u) => setProfileView(u),
    pref: (linkId, patch) => personal.setLinkPref(linkId, patch),
    adminEdit: async (f, l, patch) => {
      const ok = await api("editLink", { folderId: f.id, linkId: l.id, ...patch, password: adminPassword });
      if (ok) showToast("Saved");
    },
    menu: (f, l, at) => setCardMenu({ folder: f, link: l, ...at }),
    select: (linkId, shift) => toggleSelect(linkId, shift),
    prompt: (title, initial, onSave, opts) => setPrompt({ title, initial, onSave, ...opts }),
    toast: (msg) => showToast(msg),
    shareToChat: (l) => {
      if (!user) { showToast("Log in to chat"); openLogin(); return; }
      setChatTarget({ text: `${l.name} ${l.url}` });
      setChatOpen(true);
    },
  };

  // ---------- picking several cards ----------
  function toggleSelect(linkId: string, shift: boolean) {
    const anchor = lastSelected.current;
    lastSelected.current = linkId;
    // shift-click: select everything between the last pick and this one
    const a = shift && anchor && anchor !== linkId ? visibleOrder.indexOf(anchor) : -1;
    const b = visibleOrder.indexOf(linkId);
    const range = a >= 0 && b >= 0 ? visibleOrder.slice(Math.min(a, b), Math.max(a, b) + 1) : null;
    setSelected((prev) => {
      const next = new Set(prev);
      if (range) range.forEach((id) => next.add(id));
      else if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }
  const selectedRefs = allRefs.filter((r) => selected.has(r.link.id));
  const clearSelection = () => { setSelected(new Set()); lastSelected.current = null; };
  function copySelected(format: "lines" | "markdown") {
    const text = selectedRefs.map((r) => (format === "markdown" ? `- ${asMarkdown(r.link)}` : r.link.url)).join("\n");
    navigator.clipboard.writeText(text).then(() => showToast(`Copied ${selectedRefs.length} links`)).catch(() => showToast("Couldn't copy"));
  }
  async function bulkAdmin(action: string, extra: Record<string, unknown>, done: string) {
    const items = selectedRefs.map((r) => ({ folderId: r.folder.id, linkId: r.link.id }));
    if (await api(action, { items, ...extra, password: adminPassword })) { showToast(done); clearSelection(); }
  }

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
  function openAllIn(links: Link[]) {
    if (links.length > 5 && !confirm(`Open ${links.length} tabs at once?`)) return;
    links.forEach((l) => { const h = safeHref(l.url); if (h) window.open(h, "_blank", "noopener,noreferrer"); });
    showToast(`Opened ${links.length} tabs — allow pop-ups if some were blocked`);
  }
  function openTopResult() {
    // an exact keyword ("calc") jumps straight to its link
    const kw = search.trim().toLowerCase();
    const keyed = kw ? allRefs.find((r) => r.link.keyword === kw) : undefined;
    if (keyed) { trackAndOpen(keyed.folder, keyed.link, true); setSearch(""); searchRef.current?.blur(); return; }
    const first = folderViews.find((v) => v.links.length);
    if (!first) return;
    trackAndOpen(first.folder, first.links[0], true);
    searchRef.current?.blur();
  }
  function toggleFolderView(id: string) {
    setFolderViewPrefs((prev) => {
      const current = prev[id] || view;
      const next = { ...prev, [id]: current === "grid" ? "list" : "grid" } as Record<string, "grid" | "list">;
      if (next[id] === view) delete next[id]; // back to following the main setting
      writeLocal("folderViews", next);
      return next;
    });
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
  async function claimOwner() {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claimOwner", password: fPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not set up owner");
      setRole("owner");
      setOwnerExists(true);
      setAdminUnlocked(true);
      setAdminPassword("");
      try { sessionStorage.removeItem(ADMIN_PW_KEY); } catch {}
      setFPassword("");
      setModal(null);
      setAdminOpen(true);
      showToast("You're the owner now — the shared password is retired");
    } catch (err: any) {
      showToast(err.message);
    }
  }
  function lockAdmin() {
    // role-holders are always admins; this just closes the panel for them
    if (role) { setAdminOpen(false); return; }
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
        body: JSON.stringify(ticket
          ? { action: "login2fa", ticket, code: fTotp, remember: rememberMe }
          : { action: authMode, username: fUsername, password: fPassword, remember: rememberMe }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (/expired|password again/.test(json.error || "")) { setTicket(null); setFTotp(""); }
        throw new Error(json.error || "Could not log in");
      }
      if (json.needs2fa) {
        setTicket(json.ticket);
        setFTotp("");
        return;
      }
      setTicket(null); setFTotp("");
      setUser(json.user);
      setRole(json.role || null);
      setOwnerExists((o) => o || json.role === "owner");
      if (json.role) { setAdminUnlocked(true); setAdminPassword(""); }
      setFUsername(""); setFPassword("");
      if (authMode === "signup" && json.recoveryCode) {
        setModal({ type: "recovery", code: json.recoveryCode, context: "signup" });
      } else {
        setModal(null);
      }
      showToast(authMode === "signup" ? `Welcome, ${json.user}!` : `Logged in as ${json.user}`);
    } catch (err: any) {
      showToast(err.message || "Could not log in");
    } finally {
      setSubmitting(false);
    }
  }
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", username: fUsername, code: fCode, newPassword: fPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not reset");
      setFCode(""); setFPassword("");
      showToast("Password reset — log in with your new password");
      setAuthMode("login");
      if (json.recoveryCode) setModal({ type: "recovery", code: json.recoveryCode, context: "reset" });
    } catch (err: any) {
      showToast(err.message || "Could not reset");
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
    if (role) { setRole(null); setAdminUnlocked(false); setAdminPassword(""); setAdminOpen(false); }
    showToast("Logged out");
  }
  function openLogin(mode: "login" | "signup" | "reset" = "login") {
    setFPassword(""); setFCode("");
    setAuthMode(mode);
    setModal({ type: "login" });
  }

  // ---------- keyboard ----------
  const keys = useRef<(e: KeyboardEvent) => void>();
  keys.current = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setShowCmd((s) => !s); return; }
    if (e.key === "Escape") {
      if (document.activeElement === searchRef.current && search) { setSearch(""); return; }
      if (cardMenu) { setCardMenu(null); return; }
      if (!modal && !showCmd && !suggest && (selected.size || focusedId || expandedId)) {
        clearSelection(); setFocusedId(null); setExpandedId(null); return;
      }
      setShowCmd(false); setModal(null); setSuggest(null); setUserMenu(false); setPrompt(null);
      return;
    }
    const t = e.target as HTMLElement;
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
      const f = topFolders[Number(e.code.slice(5)) - 1];
      if (f) { e.preventDefault(); jumpToFolder(f.id); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
    if (modal || showCmd || suggest || prompt || cardMenu) return;
    const k = e.key.toLowerCase();
    // J / K walk through the cards; while one is picked, these keys act on it
    if (k === "j" || k === "k" || (focusedId && (e.key === "ArrowDown" || e.key === "ArrowUp"))) {
      e.preventDefault();
      if (!visibleOrder.length) return;
      const i = focusedId ? visibleOrder.indexOf(focusedId) : -1;
      const down = k === "j" || e.key === "ArrowDown";
      const next = visibleOrder[Math.max(0, Math.min(visibleOrder.length - 1, i < 0 ? 0 : i + (down ? 1 : -1)))];
      setFocusedId(next);
      requestAnimationFrame(() => document.querySelector(`.card[data-link-id="${next}"]`)?.scrollIntoView({ block: "nearest", behavior: look.motion ? "smooth" : "auto" }));
      return;
    }
    const focusedRef = focusedId ? allRefs.find((r) => r.link.id === focusedId) : undefined;
    if (focusedRef) {
      const { folder: f, link: l } = focusedRef;
      const cardKeys: Record<string, () => void> = {
        enter: () => trackAndOpen(f, l, true),
        f: () => cardActions.star(f, l),
        b: () => personal.setLinkPref(l.id, { later: !personal.links[l.id]?.later }),
        d: () => personal.setLinkPref(l.id, { done: !personal.links[l.id]?.done }),
        i: () => setExpandedId(expandedId === l.id ? null : l.id),
        " ": () => toggleSelect(l.id, e.shiftKey),
      };
      if (/^[1-5]$/.test(k)) { e.preventDefault(); cardActions.rate(l.id, Number(k)); return; }
      if (cardKeys[k]) { e.preventDefault(); cardKeys[k](); return; }
    }
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

  // paste a link anywhere on the page (not in a text box) to add it
  const onPaste = useRef<(e: ClipboardEvent) => void>();
  onPaste.current = (e: ClipboardEvent) => {
    const t = e.target as HTMLElement;
    if (t?.closest?.("input, textarea, [contenteditable]") || modal || suggest || showCmd || prompt) return;
    const text = e.clipboardData?.getData("text") || "";
    const found = urlsIn(text);
    if (!found.length) return;
    e.preventDefault();
    if (found.length > 1) openAdd(activeFolder || undefined, undefined, found.join("\n"));
    else openAdd(activeFolder || undefined, found[0]);
  };
  useEffect(() => {
    const handler = (e: ClipboardEvent) => onPaste.current?.(e);
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
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
      cmd("surprise", "Surprise me — a random folder", "dice", surpriseFolder),
      cmd("later", "Show my Read later list", "clock", () => setSearch("is:later")),
      cmd("favs", "Show my favorites", "star", () => setSearch("is:fav")),
      cmd("done", "Show what I haven't done yet", "check", () => setSearch("is:todo")),
      cmd("newsince", "What's new since my last visit", "plus", () => setSearch("is:new")),
      cmd("notes", "Websites I wrote notes on", "note", () => setSearch("is:note")),
      cmd("tags", showTags ? "Hide tags" : "Show tags", "tag", () => { const v = !showTags; setShowTags(v); writeLocal("showTags", v); }),
      cmd("descs", look.descriptions ? "Hide descriptions" : "Show descriptions", "info", () => changeLook({ ...look, descriptions: !look.descriptions })),
      cmd("extra", look.specialFolders ? "Hide Recently added / Popular folders" : "Show Recently added / Popular folders", "chart", () => changeLook({ ...look, specialFolders: !look.specialFolders })),
      cmd("empty", look.hideEmpty ? "Show empty folders" : "Hide empty folders", "folder", () => changeLook({ ...look, hideEmpty: !look.hideEmpty })),
      cmd("motion", look.motion ? "Turn animations off" : "Turn animations on", "settings", () => changeLook({ ...look, motion: !look.motion })),
      cmd("newtab", look.newTab ? "Open websites in this tab" : "Open websites in a new tab", "external", () => changeLook({ ...look, newTab: !look.newTab })),
      ...(hiddenCount || showHidden ? [cmd("hidden", showHidden ? "Hide my hidden websites" : "Show my hidden websites", "eye", () => setShowHidden((x) => !x))] : []),
      ...(personal.folderOrder.length ? [cmd("resetorder", "Reset my folder order", "reset", () => personal.setFolderOrder([]))] : []),
      ...spaces.map((sp) => cmd(`space-${sp}`, `Space: ${sp}`, "grid", () => { setSpace(sp); writeLocal("space", sp); })),
      ...(spaces.length ? [cmd("space-all", "Space: All", "grid", () => { setSpace(""); writeLocal("space", ""); })] : []),
      ...personal.views.map((v) => cmd(`view-${v.id}`, `View: ${v.name}`, "search", () => applyView(v))),
      ...(filtering ? [cmd("saveview", "Save this search as a view", "plus", saveCurrentView), cmd("copysearch", "Copy a link to this search", "share", copySearchLink)] : []),
      ...(adminUnlocked ? [cmd("smart", "New smart folder", "bulb", () => openNewFolder(true)), cmd("managetags", "Manage tags", "tag", () => setModal({ type: "tags" })), cmd("undo", "Undo the last change", "undo", undo)] : []),
      cmd("status", "Site status", "chart", () => { location.href = "/status"; }),
      user
        ? cmd("profile", "Edit my profile", "user", () => setModal({ type: "profileEdit" }))
        : cmd("signup", "Create an account", "user", () => openLogin("signup")),
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
  const cardEnv: CardEnv = {
    actions: cardActions,
    me: user,
    admin: adminUnlocked,
    editable: editableFolders,
    tagColors: data?.settings?.tagColors || {},
    favorites: favoriteSet,
    ratings: aggRatings,
    myRatings: personal.ratings,
    prefs: personal.links,
    since,
    descriptions: look.descriptions,
    iconTint: look.iconTint,
    selected,
    focusedId,
    expandedId,
    setExpanded: setExpandedId,
    query: search,
    allRefs,
    folderById,
    lastOpened,
  };

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
          role={role}
          api={async (action, payload) => !!(await api(action, payload))}
          submitting={submitting}
          onClose={() => setAdminOpen(false)}
          onLock={lockAdmin}
          showToast={showToast}
          applyData={setSafeData}
        />
      )}

      {syncStatus === "quota" ? (
        <div className="offline-bar" role="status">
          <span className="offline-dot" /> The site&apos;s free database limit is used up — you&apos;re seeing the last saved copy and changes are paused until it resets.
        </div>
      ) : offline && (
        <div className="offline-bar" role="status">
          <span className="offline-dot" /> You&apos;re offline — showing the copy saved on this device. Changes from others will appear when you reconnect.
        </div>
      )}
      <div className="topbar" ref={topbarRef}>
        <div className="topbar-inner">
          <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Back to top">
            <span className="brand-mark">🔖</span>
            <span className="brand-name">{title}</span>
          </button>
          <SearchBox
            value={search}
            onChange={setSearch}
            inputRef={searchRef}
            placeholder={`Search ${allRefs.length} websites…`}
            refs={allRefs}
            folders={sortedFolders}
            tags={allTags}
            onEnter={openTopResult}
            onFocusResults={focusFirstResult}
            onPickLink={(r) => trackAndOpen(r.folder, r.link, true)}
            onPickFolder={(f) => { setSearch(""); jumpToFolder(f.id); }}
          />
          <div className="top-actions">
            <button className="icon-btn" title="Spin the wheel (S)" onClick={() => setModal({ type: "spin" })}><Icon name="shuffle" /></button>
            <button className="icon-btn" title="Community (L)" onClick={() => setModal({ type: "leaderboard" })}><Icon name="trophy" /></button>
            {user && <NotificationBell notifications={personal.notifications} open={notifOpen} onOpen={() => setNotifOpen(true)} />}
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
                    {user && <button onClick={() => { setMoreMenu(false); setModal({ type: "profileEdit" }); }}><Icon name="user" /> Edit profile</button>}
                    <button onClick={() => { setMoreMenu(false); openWhatsNew(); }}><Icon name="chart" /> What&apos;s new {hasNews && <span className="dot-inline" />}<span className="kbd">W</span></button>
                    <button onClick={() => { setMoreMenu(false); setModal({ type: "customize" }); }}><Icon name="palette" /> Customize look <span className="kbd">P</span></button>
                    <button onClick={() => { setMoreMenu(false); changeTheme(theme === "dark" ? "light" : "dark"); }}>
                      <Icon name={theme === "dark" ? "sun" : "moon"} /> {theme === "dark" ? "Light mode" : "Dark mode"} <span className="kbd">T</span>
                    </button>
                    <button onClick={() => { setMoreMenu(false); toggleAll(); }}><Icon name="list" /> Collapse / expand all <span className="kbd">X</span></button>
                    {(hiddenCount > 0 || showHidden) && (
                      <button onClick={() => { setMoreMenu(false); setShowHidden((s) => !s); }}>
                        <Icon name={showHidden ? "eyeOff" : "eye"} /> {showHidden ? "Hide my hidden websites" : `Show my hidden websites (${hiddenCount})`}
                      </button>
                    )}
                    {personal.folderOrder.length > 0 && (
                      <button onClick={() => { setMoreMenu(false); personal.setFolderOrder([]); showToast("Back to the normal folder order"); }}><Icon name="reset" /> Reset my folder order</button>
                    )}
                    {Object.values(folderPrefs).some((p) => p.hidden) && !showHidden && (
                      <button onClick={() => { setMoreMenu(false); setShowHidden(true); }}><Icon name="eye" /> Show my hidden folders</button>
                    )}
                    {adminUnlocked && <button onClick={() => { setMoreMenu(false); openNewFolder(true); }}><Icon name="bulb" /> New smart folder</button>}
                    {adminUnlocked && <button onClick={() => { setMoreMenu(false); setModal({ type: "tags" }); }}><Icon name="tag" /> Manage tags</button>}
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
                      <a href={`/u/${encodeURIComponent(user)}`} className="menu-link"><Icon name="user" /> My profile</a>
                      <button onClick={() => { setUserMenu(false); setModal({ type: "profileEdit" }); }}><Icon name="edit" /> Edit profile</button>
                      <button onClick={() => { setUserMenu(false); setModal({ type: "account" }); }}><Icon name="lock" /> Account &amp; security</button>
                      <button onClick={() => { setUserMenu(false); setMyStuffOpen(true); requestAnimationFrame(() => document.querySelector(".my-stuff")?.scrollIntoView({ behavior: "smooth" })); }}><Icon name="folder" /> My Stuff (private)</button>
                      <a href="/people" className="menu-link"><Icon name="users" /> People</a>
                      <button onClick={() => { setUserMenu(false); setClubsOpen(true); }}><Icon name="tag" /> Clubs</button>
                      <button onClick={() => { setUserMenu(false); setModal({ type: "saved" }); }}><Icon name="star" /> Saved messages</button>
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
          onVote={(pollId, option) => {
            const me = user?.toLowerCase();
            if (me) setData((d) => d && {
              ...d,
              polls: (d.polls || []).map((p) => {
                if (p.id !== pollId) return p;
                const votes = { ...p.votes };
                if (votes[me] === option) delete votes[me]; else votes[me] = option;
                return { ...p, votes };
              }),
            });
            api("votePoll", { pollId, option }, { quiet: true }).then((ok) => { if (!ok) load(); });
          }}
          onNeedLogin={() => { showToast("Log in to vote"); openLogin(); }}
        />

        <div className="actions-row">
          <div className="actions-left">
            <button className="btn btn-primary" onClick={() => openAdd()}>
              <Icon name="plus" /> {addingLocked ? "Suggest a website" : "Add website"}
            </button>
            {!addingLocked && (
              <button className="btn btn-secondary" onClick={() => openNewFolder()}><Icon name="folder" /> New folder</button>
            )}
          </div>
          <div className="actions-right">
            {allTags.length > 0 && (
              <button
                className={`btn btn-secondary btn-sm tags-toggle ${showTags || tagFilters.length ? "active" : ""}`}
                onClick={() => { const v = !showTags; setShowTags(v); writeLocal("showTags", v); if (!v) setTagFilters([]); }}
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
              <option value="rating">Top rated</option>
              {user && <option value="mine">My ratings</option>}
            </select>
            <div className="seg-toggle" role="group" aria-label="View">
              <button className={view === "grid" ? "on" : ""} onClick={() => changeView("grid")} title="Grid view"><Icon name="grid" /></button>
              <button className={view === "list" ? "on" : ""} onClick={() => changeView("list")} title="List view"><Icon name="list" /></button>
            </div>
          </div>
        </div>

        {spaces.length > 0 && (
          <div className="space-tabs" role="tablist" aria-label="Spaces">
            {["", ...spaces].map((sp) => (
              <button key={sp || "all"} role="tab" aria-selected={activeSpace === sp} className={activeSpace === sp ? "on" : ""}
                onClick={() => { setSpace(sp); writeLocal("space", sp); }}>
                {sp || "All"}
              </button>
            ))}
          </div>
        )}
        {showStart && startFolder && (
          <div className="announcement start-here">
            <span>👋 New here? Start with <button className="link-btn" onClick={() => { jumpToFolder(startFolder.id); setStartDismissed(true); writeLocal("startDismissed", true); }}>{startFolder.emoji} {startFolder.name}</button></span>
            <button className="announcement-x" title="Got it" onClick={() => { setStartDismissed(true); writeLocal("startDismissed", true); }}><Icon name="x" /></button>
          </div>
        )}
        {topFolders.length > 0 && (
          <nav className="folder-nav sticky" aria-label="Jump to folder">
            <span className="nav-label">Jump to</span>
            {topFolders.map((f, i) => {
              const unread = metaFor(f).unread;
              return (
                <button
                  key={f.id}
                  className={`${activeFolder === f.id ? "on" : ""} ${chipDrag && chipDrag !== f.id ? "chip-drop" : ""}`}
                  onClick={() => jumpToFolder(f.id)}
                  style={f.color ? ({ "--folder-accent": f.color } as React.CSSProperties) : undefined}
                  draggable
                  title={`${i < 9 ? `Alt+${i + 1} · ` : ""}drag to rearrange${adminUnlocked && !personal.folderOrder.length ? " for everyone" : " for you"}`}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", f.id); setChipDrag(f.id); }}
                  onDragEnd={() => setChipDrag(null)}
                  onDragOver={(e) => { if (chipDrag) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); if (chipDrag) reorderChips(chipDrag, f.id); }}
                >
                  <span>{f.emoji}</span> {f.name} <em>{f.rule ? "✨" : f.links.length}</em>
                  {unread > 0 && <span className="chip-new" title={`${unread} new since your last visit`}>{unread}</span>}
                </button>
              );
            })}
          </nav>
        )}
        {(personal.views.length > 0 || filtering) && (
          <div className="views-bar">
            <span className="nav-label">Views</span>
            {personal.views.map((v) => (
              <span key={v.id} className="view-chip">
                <button onClick={() => applyView(v)} title={[v.q, ...v.tags.map((t) => `#${t}`)].filter(Boolean).join(" ")}>{v.name}</button>
                <button className="view-x" onClick={() => personal.deleteView(v.id)} aria-label={`Delete view ${v.name}`}>×</button>
              </span>
            ))}
            {filtering && <button className="pick dashed" onClick={saveCurrentView}><Icon name="plus" /> Save this view</button>}
          </div>
        )}
        {allTags.length > 0 && (showTags || tagFilters.length > 0) && (
          <div className={`tag-bar ${tagCloud ? "cloud" : ""}`}>
            {(tagCloud ? allTags : allTags.slice(0, 16)).map(([t, n]) => {
              const color = data?.settings?.tagColors?.[t];
              const max = allTags[0]?.[1] || 1;
              return (
                <button
                  key={t}
                  className={tagFilters.includes(t) ? "on" : ""}
                  onClick={() => toggleTag(t)}
                  style={{ ...(tagCloud ? { fontSize: `${0.72 + 0.55 * (n / max)}rem` } : {}), ...(color ? { color, borderColor: color } : {}) }}
                >
                  #{t} <em>{n}</em>
                </button>
              );
            })}
            {tagFilters.length > 1 && (
              <span className="seg mini">
                <button className={tagMode === "any" ? "on" : ""} onClick={() => setTagMode("any")} title="Show links with any of these tags">Any</button>
                <button className={tagMode === "all" ? "on" : ""} onClick={() => setTagMode("all")} title="Only links with every one of these tags">All</button>
              </span>
            )}
            {allTags.length > 16 || tagCloud ? (
              <button className="link-btn tag-more" onClick={() => setTagCloud(!tagCloud)}>{tagCloud ? "Fewer tags" : `All ${allTags.length} tags`}</button>
            ) : null}
            {adminUnlocked && <button className="link-btn tag-more" onClick={() => setModal({ type: "tags" })}>Manage</button>}
          </div>
        )}

        {filtering ? (
          <>
          <div className="results-bar">
            <span>
              <strong>{matchCount}</strong> {matchCount === 1 ? "website" : "websites"}
              {q && <> matching “{search.trim()}”</>}
              {tagFilters.length > 0 && <> tagged <strong>{tagFilters.map((t) => `#${t}`).join(tagMode === "all" ? " and " : " or ")}</strong></>}
              {useFuzzy && matchCount > 0 && <span className="fuzzy-note"> · no exact matches, showing close ones</span>}
              {q && matchCount > 0 && <span className="enter-hint"> · press <span className="kbd">Enter</span> to open the first, <span className="kbd">↓</span> to move into the results</span>}
            </span>
            <span className="results-tools">
              <select value={resultSort} onChange={(e) => setResultSort(e.target.value as typeof resultSort)} aria-label="Sort results">
                <option value="best">Best match</option>
                <option value="newest">Newest</option>
                <option value="rating">Top rated</option>
                <option value="folder">Folder order</option>
              </select>
              <button className="btn-icon" title="Copy a link to this search" onClick={copySearchLink}><Icon name="share" /></button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(""); setTagFilters([]); }}>Clear</button>
            </span>
          </div>
          {chatHits.length > 0 && (
            <div className="chat-hits">
              <span className="nav-label">In chat</span>
              {chatHits.slice(0, 3).map((m) => (
                <button key={m.id} className="chat-hit" onClick={() => setChatOpen(true)} title="Open chat">
                  <strong>{m.user}:</strong> {m.text.length > 80 ? `${m.text.slice(0, 80)}…` : m.text}
                </button>
              ))}
            </div>
          )}
          </>
        ) : (
          <>
            <QuickTabs
              lists={{ recent: recentOpened, later: readLater, starred: favorites, following: followingAdds, top: topRated, visited: mostVisited, new: recent }}
              tab={quickTab}
              setTab={(t) => { setQuickTab(t); writeLocal("quickTab", t); }}
              onOpen={trackAndOpen}
              newTab={look.newTab}
            />
          </>
        )}

        {!filtering && <ScrollMap deps={`${topFolders.map((f) => f.id).join()}|${Object.keys(collapsed).length}`} onJump={jumpToFolder} />}
        <main className={`folders ${allRefs.length > 150 ? "big-list" : ""}`}>
          {sortedFolders.length === 0 && (
            <div className="empty-state">
              <div className="empty-emoji">📂</div>
              <h3>No folders yet</h3>
              <p>Folders keep websites organised. Make the first one to get started.</p>
              <button className="btn btn-primary" onClick={() => openNewFolder()}><Icon name="plus" /> Create a folder</button>
            </div>
          )}
          {filtering && matchCount === 0 && sortedFolders.length > 0 && (
            <div className="empty-state">
              <div className="empty-emoji">🔍</div>
              <h3>Nothing found</h3>
              {didYouMean && (
                <p>Did you mean <button className="link-btn" onClick={() => setSearch(didYouMean)}><strong>{didYouMean}</strong></button>?</p>
              )}
              <p>No websites match that search. Know a good one?</p>
              <button className="btn btn-secondary" onClick={() => setSuggest({ kind: "addLink" })}><Icon name="bulb" /> Suggest a website</button>
            </div>
          )}
          {user && !filtering && (personal.myStuff.length > 0 || myStuffOpen) && personal.loaded && (
            <MyStuff
              items={personal.myStuff}
              collapsed={!!collapsed["__mystuff"]}
              newTab={look.newTab}
              onToggle={() => toggleCollapsed("__mystuff")}
              act={personal.myStuffAction}
              toast={showToast}
            />
          )}
          <CardContext.Provider value={cardEnv}>
            {specialViews.map((v) => (
              <FolderSection
                key={v.folder.id}
                folder={v.folder}
                links={[]}
                shortcuts={v.shortcuts}
                totalLinks={v.shortcuts.length}
                collapsed={!!collapsed[v.folder.id]}
                view={folderViewPrefs[v.folder.id] || view}
                canAdd={false}
                editor={false}
                virtual
                dragEnabled={false}
                drag={drag}
                setDrag={setDrag}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                meta={{ updatedAt: 0, unread: 0, done: 0 }}
                onToggle={() => toggleCollapsed(v.folder.id)}
                onAddHere={() => {}}
                onOpenAll={() => openAllIn(v.shortcuts.map((r) => r.link))}
                onEditFolder={() => {}}
                onDeleteFolder={() => {}}
                onShareFolder={() => {}}
                onMoveLink={moveLink}
                onMoveFolder={moveFolder}
                onDropUrl={() => {}}
                onMenu={() => {}}
              />
            ))}
            {topFolders.filter(folderVisible).map((top) => {
              const section = (folder: Folder, sub: boolean, children?: React.ReactNode) => {
                const { links, shortcuts } = viewById.get(folder.id) || { links: [], shortcuts: [] };
                return (
                  <FolderSection
                    key={folder.id}
                    folder={folder}
                    links={links}
                    shortcuts={shortcuts}
                    totalLinks={folder.rule ? shortcuts.length : folder.links.filter(shown).length}
                    collapsed={!filtering && !!collapsed[folder.id]}
                    view={folderViewPrefs[folder.id] || view}
                    canAdd={!addingLocked || editableFolders.has(folder.id)}
                    editor={canEditFolder(folder)}
                    sub={sub}
                    meta={metaFor(folder)}
                    dragEnabled={dragEnabled}
                    drag={drag}
                    setDrag={setDrag}
                    dropTarget={dropTarget}
                    setDropTarget={setDropTarget}
                    onToggle={() => toggleCollapsed(folder.id)}
                    onAddHere={() => openAdd(folder.id)}
                    onOpenAll={() => openAllIn([...links, ...shortcuts.map((r) => r.link)])}
                    onEditFolder={() => setModal({ type: "folder", folder })}
                    onDeleteFolder={() => setModal({ type: "deleteFolder", folder })}
                    onShareFolder={() => shareFolder(folder)}
                    onMoveLink={moveLink}
                    onMoveFolder={moveFolder}
                    onDropUrl={(folderId, url) => openAdd(folderId, url)}
                    onMenu={(at) => setFolderMenu({ folder, ...at })}
                    onSplit={adminUnlocked ? () => setPick({ kind: "split", folder }) : undefined}
                  >
                    {children}
                  </FolderSection>
                );
              };
              const kids = (childrenOf.get(top.id) || []).filter((k) => !filtering || hasContent(viewById.get(k.id)));
              return section(top, false, kids.length ? kids.map((k) => section(k, true)) : undefined);
            })}
            {cardMenu && <CardMenu state={cardMenu} onClose={() => setCardMenu(null)} />}
          </CardContext.Provider>
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
          admin={adminUnlocked}
          canFetch={!!user}
          onSubmit={saveLink}
          onBulk={addMany}
          onCreateFolder={createFolderInline}
          onClose={() => setModal(null)}
        />
      )}
      {prompt && (
        <PromptModal
          title={prompt.title}
          initial={prompt.initial}
          multiline={prompt.multiline}
          placeholder={prompt.placeholder}
          onSave={prompt.onSave}
          onClose={() => setPrompt(null)}
        />
      )}
      <SelectionBar
        refs={selectedRefs}
        folders={sortedFolders}
        admin={adminUnlocked}
        onCopy={copySelected}
        onOpenAll={() => openAllIn(selectedRefs.map((r) => r.link))}
        onFavorite={() => {
          if (!user) { showToast("Log in to save favorites"); openLogin(); return; }
          selectedRefs.filter((r) => !favoriteSet.has(r.link.id)).forEach((r) => personal.toggleFavorite(r.link.id));
          showToast(`Favorited ${selectedRefs.length}`);
        }}
        onLater={() => { selectedRefs.forEach((r) => personal.setLinkPref(r.link.id, { later: true })); showToast(`Added ${selectedRefs.length} to Read later`); }}
        onMove={(folderId) => bulkAdmin("bulkMove", { targetFolderId: folderId }, `Moved ${selectedRefs.length} websites`)}
        onTag={(tag) => bulkAdmin("bulkTag", { tag }, `Tagged ${selectedRefs.length} websites #${tag}`)}
        onDelete={() => { if (confirm(`Delete ${selectedRefs.length} websites for everyone?`)) bulkAdmin("bulkDelete", {}, `Deleted ${selectedRefs.length} websites`); }}
        onClear={clearSelection}
      />
      {modal?.type === "folder" && data && (
        <FolderModal
          folder={modal.folder}
          folders={data.folders}
          spaces={spaces}
          admin={adminUnlocked}
          smart={modal.smart}
          submitting={submitting}
          onSubmit={saveFolder}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "tags" && data && (
        <TagManager
          data={data}
          onRename={async (from, to) => !!(await api("renameTag", { from, to, password: adminPassword }))}
          onDelete={async (tag) => !!(await api("deleteTag", { tag, password: adminPassword }))}
          onColor={(tag, color) => { api("setTagColor", { tag, color, password: adminPassword }, { quiet: true }); }}
          onClose={() => setModal(null)}
        />
      )}
      {folderMenu && (() => {
        const fm = folderMenu.folder;
        const pref = folderPrefs[fm.id] || {};
        const isStart = data?.settings?.startFolderId === fm.id;
        return (
          <FolderMenu
            state={folderMenu}
            pref={pref}
            admin={adminUnlocked}
            editor={canEditFolder(fm)}
            isStart={isStart}
            view={folderViewPrefs[fm.id] || view}
            sort={effectiveSort(fm)}
            onClose={() => setFolderMenu(null)}
            actions={{
              setPref: (patch) => {
                if (patch.follow !== undefined && !user) { showToast("Log in to follow folders"); openLogin(); return; }
                personal.setFolderPref(fm.id, patch);
                if (patch.follow) showToast(`You'll hear about new links in ${fm.name}`);
                if (patch.hidden) showToast(`Hid ${fm.name} — bring it back from the ⋯ menu at the top`);
              },
              toggleView: () => toggleFolderView(fm.id),
              random: () => {
                const pool = [...fm.links.filter(shown), ...shortcutsFor(fm).map((r) => r.link)];
                const l = pool[Math.floor(Math.random() * pool.length)];
                if (l) { trackAndOpen(allRefs.find((r) => r.link.id === l.id)?.folder || fm, l, true); showToast(`🎲 Opened ${l.name}`); }
              },
              openAll: () => openAllIn([...fm.links.filter(shown), ...shortcutsFor(fm).map((r) => r.link)]),
              copyLink: () => shareFolder(fm),
              copyMarkdown: () => navigator.clipboard.writeText(folderMarkdown(fm)).then(() => showToast("Copied as a Markdown list")).catch(() => showToast("Couldn't copy")),
              info: () => setFolderInfoId(fm.id),
              edit: () => setModal({ type: "folder", folder: fm }),
              duplicate: () => folderApi("duplicateFolder", { folderId: fm.id }, `Copied ${fm.name}`),
              merge: () => setPick({ kind: "merge", folder: fm }),
              split: () => setPick({ kind: "split", folder: fm }),
              archive: () => folderApi("editFolder", { folderId: fm.id, archived: !fm.archived }, fm.archived ? `${fm.name} is back` : `Archived ${fm.name} — only admins can see it`),
              makeStart: () => folderApi("setSettings", { settings: { startFolderId: isStart ? "" : fm.id } }, isStart ? "No “Start here” folder now" : `New visitors will be pointed to ${fm.name}`),
              remove: () => setModal({ type: "deleteFolder", folder: fm }),
            }}
          />
        );
      })()}
      {folderInfoId && data && folderById.get(folderInfoId) && (
        <FolderInfo
          folder={folderById.get(folderInfoId)!}
          data={data}
          me={user}
          done={folderById.get(folderInfoId)!.links.filter((l) => personal.links[l.id]?.done).length}
          myRating={personal.ratings[`f_${folderInfoId}`]}
          rating={aggRatings[`f_${folderInfoId}`]}
          onRate={(stars) => { if (!user) { showToast("Log in to rate"); openLogin(); return; } personal.rate(`f_${folderInfoId}`, stars); }}
          onProfile={(u) => { setFolderInfoId(null); setProfileView(u); }}
          onClose={() => setFolderInfoId(null)}
        />
      )}
      {pick?.kind === "merge" && data && (
        <PickModal
          title={`Merge ${pick.folder.name} into…`}
          text={`Every website in ${pick.folder.emoji} ${pick.folder.name} moves into the folder you pick, then ${pick.folder.name} is removed. Undo is in the admin panel.`}
          options={data.folders.filter((f) => f.id !== pick.folder.id && !f.rule).map((f) => ({ value: f.id, label: `${f.emoji} ${f.name}` }))}
          confirmLabel="Merge"
          onPick={(into) => folderApi("mergeFolder", { folderId: pick.folder.id, intoId: into }, `Merged ${pick.folder.name}`)}
          onClose={() => setPick(null)}
        />
      )}
      {pick?.kind === "split" && (() => {
        const counts = new Map<string, number>();
        pick.folder.links.forEach((l) => l.tags?.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
        const options = Array.from(counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ value: t, label: `#${t} (${n} websites)` }));
        return options.length ? (
          <PickModal
            title={`Split ${pick.folder.name} by tag`}
            text="Websites with the tag you pick move into a new folder named after the tag."
            options={options}
            confirmLabel="Split"
            onPick={(tag) => folderApi("splitFolder", { folderId: pick.folder.id, tag }, `Made a new #${tag} folder`)}
            onClose={() => setPick(null)}
          />
        ) : (
          <PickModal title="Nothing to split by" text="None of the websites in this folder have tags yet." options={[]} confirmLabel="OK" onPick={() => {}} onClose={() => setPick(null)} />
        );
      })()}
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
      {modal?.type === "customize" && (
        <CustomizeModal
          look={look}
          onChange={changeLook}
          onClose={() => setModal(null)}
          startView={startView}
          onStartView={(v) => { setStartView(v); writeLocal("startView", v); }}
          folders={topFolders}
        />
      )}
      {modal?.type === "whatsnew" && <WhatsNew activity={data?.activity || []} onClose={() => setModal(null)} />}
      {modal?.type === "spin" && (
        <SpinWheel refs={allRefs} folders={sortedFolders} onOpen={(f, l) => trackAndOpen(f, l, true)} onClose={() => setModal(null)} />
      )}
      {modal?.type === "adminLogin" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {ownerExists ? (
              <>
                <h2>Admins only</h2>
                <p className="modal-text">
                  {user
                    ? "This account isn't an admin. Ask the site owner to give you access."
                    : "Log in with your admin account to manage the site."}
                </p>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button>
                  {!user && <button className="btn btn-primary" onClick={() => openLogin()}>Log in</button>}
                </div>
              </>
            ) : (
              <>
                <h2>Set up admin</h2>
                <p className="modal-text">
                  First time here? Enter the admin password to unlock admin now. To stop sharing the password, log in to your account and
                  <strong> become the owner</strong> — after that, only accounts you choose are admins.
                </p>
                <form onSubmit={handleAdminLogin}>
                  <div className="form-group">
                    <label>Admin password</label>
                    <input type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} required autoFocus />
                  </div>
                  <div className="modal-actions">
                    {user ? (
                      <button type="button" className="btn btn-secondary" onClick={claimOwner} disabled={!fPassword || submitting}>Become owner ({user})</button>
                    ) : (
                      <button type="button" className="btn btn-secondary" onClick={() => openLogin()}>Log in first</button>
                    )}
                    <button type="submit" className="btn btn-primary" disabled={submitting}>Unlock</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
      {modal?.type === "login" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{authMode === "reset" ? "Reset password" : authMode === "login" ? "Welcome back" : "Create an account"}</h2>
            {authMode !== "reset" && (
              <div className="auth-tabs">
                <button type="button" className={authMode === "login" ? "on" : ""} onClick={() => setAuthMode("login")}>Log in</button>
                <button type="button" className={authMode === "signup" ? "on" : ""} onClick={() => setAuthMode("signup")}>Sign up</button>
              </div>
            )}
            {authMode === "reset" ? (
              <form onSubmit={handleReset}>
                <p className="modal-text">Enter the recovery code you saved when you signed up. No code? Ask an admin to reset your password.</p>
                <div className="form-group">
                  <label>Username</label>
                  <input value={fUsername} onChange={(e) => setFUsername(e.target.value)} required autoFocus autoComplete="username" maxLength={20} />
                </div>
                <div className="form-group">
                  <label>Recovery code</label>
                  <input value={fCode} onChange={(e) => setFCode(e.target.value)} required placeholder="e.g. a1b2 c3d4 e5f6" autoComplete="one-time-code" />
                </div>
                <div className="form-group">
                  <label>New password</label>
                  <input type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
                  <PasswordStrength password={fPassword} />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setAuthMode("login")}>Back</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "…" : "Reset password"}</button>
                </div>
              </form>
            ) : (
              ticket ? (
                <form onSubmit={handleAuth}>
                  <p className="modal-text">🔐 2-step login is on. Open your authenticator app and type the 6-digit code for Theo&apos;s Bookmarks.</p>
                  <div className="form-group">
                    <label>Code</label>
                    <input value={fTotp} onChange={(e) => setFTotp(e.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="123456" />
                    <div className="hint">Lost your phone? Use “Forgot password?” with your recovery code — that also turns 2-step login off.</div>
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => { setTicket(null); setFTotp(""); }}>Back</button>
                    <button type="submit" className="btn btn-primary" disabled={submitting || fTotp.length !== 6}>{submitting ? "…" : "Log in"}</button>
                  </div>
                </form>
              ) : (
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
                  {authMode === "signup"
                    ? <><PasswordStrength password={fPassword} /><div className="hint">At least 6 characters. Don&apos;t reuse a password from another site.</div></>
                    : <button type="button" className="link-btn forgot" onClick={() => { setFPassword(""); setFCode(""); setAuthMode("reset"); }}>Forgot password?</button>}
                </div>
                <label className="check remember">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  Keep me logged in on this device
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? "…" : authMode === "login" ? "Log in" : "Create account"}
                  </button>
                </div>
              </form>
              )
            )}
          </div>
        </div>
      )}
      {modal?.type === "recovery" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>🔑 Save your recovery code</h2>
            <p className="modal-text">
              {modal.context === "signup"
                ? "This is the only way to get back into your account if you forget your password. Write it down or screenshot it — it won't be shown again."
                : "Here's your new recovery code — save this one and discard the old."}
            </p>
            <div className="recovery-code">
              {modal.code.replace(/(.{4})/g, "$1 ").trim()}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(modal.code).then(() => showToast("Recovery code copied")).catch(() => {})}>Copy</button>
              <button className="btn btn-primary" onClick={() => setModal(null)}>I&apos;ve saved it</button>
            </div>
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
      {notifOpen && (
        <NotificationPanel
          notifications={personal.notifications}
          toasts={toastLog}
          settings={{ prefs: personal.notifyPrefs, dndUntil: personal.dndUntil, sound: pingOn, soundName: pingName, push: personal.push, pushAvailable: !!personal.pushKey }}
          onOpen={(n) => {
            setNotifOpen(false);
            if (["mention", "reply", "dm"].includes(n.kind) || n.link?.includes("chat=open")) {
              const params = new URLSearchParams((n.link || "").split("?")[1] || "");
              setChatTarget({ channel: params.get("ch") || undefined, msg: params.get("msg") || undefined });
              setChatOpen(true);
              return;
            }
            const m = n.link?.match(/#(link|folder)-(.+)$/);
            if (m && m[1] === "folder") jumpToFolder(m[2]);
            else if (m) openCard(m[2]);
            else if (n.from) setProfileView(n.from);
          }}
          onReadOne={(id) => personal.markRead(id || undefined)}
          onRemove={(id) => personal.removeNotification(id)}
          onClearAll={() => personal.removeNotification()}
          onPrefs={personal.setNotifyPrefs}
          onDnd={personal.setDnd}
          onSound={(on, name) => {
            setPingOn(on); writeLocal("pingSound", on);
            if (name) { setPingName(name); writeLocal("pingName", name); } else if (on) playPing(pingName);
          }}
          onPush={async (on) => {
            try {
              if (on) { await enablePush(personal.pushKey!); personal.setPushOn(true); showToast("Notifications turned on for this device"); }
              else { await disablePush(); personal.setPushOn(false); showToast("Notifications turned off for this device"); }
            } catch (e: any) { showToast(e.message || "Couldn't change notifications"); }
          }}
          onDigest={() => { setNotifOpen(false); setDigestOpen(true); }}
          onClose={() => setNotifOpen(false)}
        />
      )}
      {clubsOpen && (
        <ClubsModal
          me={user}
          staff={!!role}
          onOpenChannel={(ch) => { setChatTarget({ channel: ch }); setChatOpen(true); }}
          onOpenFolder={(id) => jumpToFolder(id)}
          onChanged={() => load()}
          toast={showToast}
          onClose={() => setClubsOpen(false)}
        />
      )}
      {modal?.type === "saved" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <h2>⭐ Saved messages</h2>
            {personal.savedMessages.length === 0 && <div className="admin-empty">Nothing saved yet. Use ⋯ → Save for later on any chat message.</div>}
            <div className="notif-list">
              {personal.savedMessages.map((m) => (
                <div key={m.id} className="notif read">
                  <button className="notif-main" onClick={() => { setModal(null); setChatTarget({ channel: m.channel, msg: m.id }); setChatOpen(true); }}>
                    <span className="notif-text"><strong>{m.user}</strong> {m.text}<span className="notif-time">#{m.channel} · {new Date(m.at).toLocaleString()}</span></span>
                  </button>
                  <span className="notif-tools"><button className="btn-icon sm" title="Remove" onClick={() => personal.saveMessage(m, false)}><Icon name="x" /></button></span>
                </div>
              ))}
            </div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button></div>
          </div>
        </div>
      )}
      {digestOpen && data && (
        <WeeklyDigest data={data} ratings={aggRatings} onOpenLink={(f, l) => { const r = allRefs.find((x) => x.link.id === l); if (r) trackAndOpen(r.folder, r.link); }} onClose={() => setDigestOpen(false)} />
      )}
      {modal?.type === "profileEdit" && (
        <ProfileModal
          profile={personal.profile}
          links={allRefs.filter((r) => favoriteSet.has(r.link.id) || r.link.addedBy?.toLowerCase() === user?.toLowerCase()).map((r) => ({ id: r.link.id, name: r.link.name }))}
          onSave={personal.saveProfile}
          onClose={() => setModal(null)}
        />
      )}
      {profileView && (
        <ProfileCard
          username={profileView}
          me={user}
          onFollow={(u, on) => personal.follow(u, on)}
          onKudos={(u) => fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "kudos", username: u }) }).then((r) => r.json())}
          onClose={() => setProfileView(null)}
        />
      )}
      {modal?.type === "account" && user && (
        <AccountModal
          user={user}
          profile={personal.profile}
          blocked={personal.blocked}
          syncOn={personal.settings.sync !== false}
          onProfile={personal.saveProfile}
          onUnblock={(u) => personal.block(u, false)}
          onSyncChange={(on) => personal.saveSettings({ sync: on })}
          onRenamed={(name) => { setUser(name); personal.reload(); }}
          onDeleted={() => { setModal(null); setUser(null); setRole(null); setAdminUnlocked(false); showToast("Your account was deleted"); }}
          onRecoveryCode={(code) => setModal({ type: "recovery", code, context: "reset" })}
          toast={showToast}
          onClose={() => setModal(null)}
        />
      )}
      <ChatPanel
        open={chatOpen}
        setOpen={setChatOpen}
        chatEnabled={data?.settings?.chatEnabled !== false}
        user={user}
        online={presence.users}
        adminPassword={adminUnlocked ? adminPassword : null}
        canModerate={adminUnlocked}
        onNeedLogin={() => openLogin()}
        showToast={showToast}
        blocked={personal.blocked}
        onBlock={(u) => { personal.block(u, true); showToast(`Hid messages from ${u}`); }}
        quiet={quietNow}
        onMention={() => { if (pingOn) playPing(pingName); }}
        isAdmin={role === "owner" || role === "admin"}
        known={knownLink}
        savedIds={savedMsgIds}
        onSave={(m, on) => { personal.saveMessage({ id: m.id, channel: m.channel, user: m.user, text: m.text, at: m.at }, on); showToast(on ? "Saved — find it under Saved in the ⋯ menu" : "Removed from saved"); }}
        onOpenClubs={user ? () => setClubsOpen(true) : undefined}
        target={chatTarget}
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
