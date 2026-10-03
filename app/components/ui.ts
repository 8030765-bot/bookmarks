import { Folder, Link, Suggestion } from "@/lib/types";

/** One-line description of a suggestion, for lists and toasts. */
export function suggestionSummary(s: Suggestion) {
  if (s.kind === "addLink") return `Add “${s.name}”`;
  if (s.kind === "removeLink") return `Remove “${s.linkName}”`;
  if (s.kind === "editLink") return `Change “${s.linkName}”${s.name && s.name !== s.linkName ? ` → “${s.name}”` : ""}`;
  return s.note && s.note.length > 60 ? `${s.note.slice(0, 60)}…` : s.note || "Idea";
}

/** Open a connection to a site's server while the pointer is on its card, so the click loads faster. */
const warmed = new Set<string>();
export function warmUp(url: string) {
  try {
    const origin = new URL(url).origin;
    if (warmed.has(origin) || warmed.size > 60) return;
    warmed.add(origin);
    const el = document.createElement("link");
    el.rel = "preconnect";
    el.href = origin;
    document.head.appendChild(el);
  } catch {
    // not a valid URL — nothing to warm up
  }
}

/** A fresh id so a retried request is only applied once. */
export function newOpId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export const FOLDER_EMOJIS = [
  "📁", "🏠", "🎮", "🎰", "🔒", "📚", "🧮", "🔬", "🎨", "🎵", "🎬", "📺",
  "⚽", "🏀", "🌍", "🧪", "💻", "🛠️", "⭐", "🔥", "☀️", "🌙", "🚀", "💡",
];
export const COLORS = ["#7c6cff", "#3dd68c", "#ffb84d", "#ff5c7a", "#4dabff", "#e879f9", "#2dd4bf", "#a3a3a3"];
export const NEW_DAYS = 3;

export type LinkRef = { folder: Folder; link: Link };

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

export function faviconUrl(url: string, size = 64) {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=${size}`;
  } catch {
    return "";
  }
}

/** Only real web links are clickable; anything else renders as plain text. */
export function safeHref(url: string) {
  return /^https?:\/\//i.test(url) ? url : undefined;
}

/** "coolmathgames.com" -> "Coolmathgames" — a decent default name from a URL. */
export function nameFromUrl(raw: string) {
  const url = /^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    const main = parts.length > 2 && parts[0].length > 3 ? parts[0] : parts[parts.length - 2] || parts[0];
    return main.charAt(0).toUpperCase() + main.slice(1);
  } catch {
    return "";
  }
}

export function normUrl(url: string) {
  return url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
}

export function timeAgo(iso?: string) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function isNew(link: Link) {
  return !!link.createdAt && Date.now() - new Date(link.createdAt).getTime() < NEW_DAYS * 86400_000;
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / storage blocked — preferences just won't persist
  }
}
