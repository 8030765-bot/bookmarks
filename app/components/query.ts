import { Folder, Link } from "@/lib/types";
import type { LinkPref } from "./Personal";
import { hostOf, isNewSince } from "./ui";

/**
 * Search syntax shared by the search box and smart folders:
 *   math games            every word must appear
 *   "exact phrase"        the phrase as written
 *   -word                 leave out anything with this word
 *   tag:science  in:maths  by:theo  site:youtube.com
 *   is:new is:pinned is:verified is:fav is:later is:done is:liked is:broken
 *   rating:4+  color:red  emoji:🧮  added:7d  added:>2026-09-01
 */
export interface ParsedQuery {
  words: string[];
  phrases: string[];
  not: string[];
  tags: string[];
  folders: string[];
  by: string[];
  sites: string[];
  is: string[];
  minRating?: number;
  colors: string[];
  emoji?: string;
  after?: number;
  before?: number;
  /** anything at all to filter by */
  active: boolean;
}

export const COLOR_NAMES: Record<string, string> = {
  purple: "#7c6cff", green: "#3dd68c", orange: "#ffb84d", red: "#ff5c7a", blue: "#4dabff", pink: "#e879f9", teal: "#2dd4bf", grey: "#a3a3a3", gray: "#a3a3a3",
};

function tokens(raw: string): string[] {
  const out: string[] = [];
  const re = /(-?[a-z]+:)?"([^"]*)"|(\S+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out.push(m[2] !== undefined ? `${m[1] || ""}"${m[2]}"` : m[3]);
  return out;
}

function parseDate(v: string): number | undefined {
  const rel = /^(\d+)([dwmy])$/.exec(v);
  if (rel) {
    const n = Number(rel[1]);
    const days = rel[2] === "d" ? n : rel[2] === "w" ? n * 7 : rel[2] === "m" ? n * 30 : n * 365;
    return Date.now() - days * 86400_000;
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
}

export function parseQuery(raw: string): ParsedQuery {
  const q: ParsedQuery = { words: [], phrases: [], not: [], tags: [], folders: [], by: [], sites: [], is: [], colors: [], active: false };
  for (const tok of tokens(raw.trim())) {
    const lower = tok.toLowerCase();
    const op = /^([a-z]+):(.+)$/.exec(lower);
    if (op) {
      const [, key, rawVal] = op;
      const val = rawVal.replace(/^"|"$/g, "");
      if (!val) continue;
      if (key === "tag" || key === "tags") q.tags.push(val.replace(/^#/, ""));
      else if (key === "in" || key === "folder") q.folders.push(val);
      else if (key === "by" || key === "from") q.by.push(val.replace(/^@/, ""));
      else if (key === "site" || key === "domain") q.sites.push(val.replace(/^www\./, ""));
      else if (key === "is" || key === "has") q.is.push(val);
      else if (key === "rating" || key === "stars") { const n = parseFloat(val.replace(/^>=?/, "")); if (Number.isFinite(n)) q.minRating = n; }
      else if (key === "color" || key === "colour") q.colors.push(COLOR_NAMES[val] || val);
      else if (key === "emoji") q.emoji = val;
      else if (key === "added" || key === "date") {
        if (val.startsWith("<")) q.before = parseDate(val.slice(1));
        else q.after = parseDate(val.replace(/^>/, ""));
      } else q.words.push(lower); // unknown "x:y" — treat as a normal word
      continue;
    }
    if (lower.startsWith("-") && lower.length > 1) q.not.push(lower.slice(1).replace(/^"|"$/g, ""));
    else if (lower.startsWith('"')) { const p = lower.replace(/^"|"$/g, ""); if (p) q.phrases.push(p); }
    else q.words.push(lower);
  }
  q.active = !!(q.words.length || q.phrases.length || q.not.length || q.tags.length || q.folders.length || q.by.length || q.sites.length ||
    q.is.length || q.minRating || q.colors.length || q.emoji || q.after || q.before);
  return q;
}

export interface MatchContext {
  prefs: Record<string, LinkPref>;
  favorites: Set<string>;
  avgRating: (linkId: string) => number;
  since: number;
  me: string | null;
}

/** Everything about a link that plain words can match. */
export function haystackOf(link: Link, folder: Folder, pref?: LinkPref) {
  return [link.name, link.url, link.notes || "", link.tip || "", folder.name, link.addedBy || "", link.keyword || "", pref?.note || "", pref?.rename || "", ...(link.tags || [])]
    .join(" ").toLowerCase();
}

export function matchLink(q: ParsedQuery, link: Link, folder: Folder, ctx: MatchContext, wordMatch?: (hay: string, word: string) => boolean): boolean {
  if (!q.active) return true;
  const pref = ctx.prefs[link.id];
  const hay = haystackOf(link, folder, pref);
  const has = wordMatch || ((h: string, w: string) => h.includes(w));
  if (!q.words.every((w) => has(hay, w))) return false;
  if (!q.phrases.every((p) => hay.includes(p))) return false;
  if (q.not.some((w) => hay.includes(w))) return false;
  if (q.tags.length && !q.tags.every((t) => link.tags?.includes(t))) return false;
  if (q.folders.length && !q.folders.some((f) => folder.name.toLowerCase().includes(f) || folder.id === f)) return false;
  if (q.by.length && !q.by.includes((link.addedBy || "").toLowerCase())) return false;
  if (q.sites.length) {
    const host = hostOf(link.url).toLowerCase();
    if (!q.sites.some((s) => host === s || host.endsWith(`.${s}`))) return false;
  }
  for (const flag of q.is) {
    const ok =
      flag === "new" ? isNewSince(link, ctx.since) :
      flag === "pinned" ? !!link.pinned :
      flag === "verified" ? !!link.verified :
      flag === "fav" || flag === "favorite" || flag === "starred" ? ctx.favorites.has(link.id) :
      flag === "later" ? !!pref?.later :
      flag === "done" ? !!pref?.done :
      flag === "notdone" || flag === "todo" ? !pref?.done :
      flag === "liked" ? !!ctx.me && !!link.likes?.includes(ctx.me.toLowerCase()) :
      flag === "note" || flag === "notes" ? !!pref?.note :
      flag === "broken" ? link.status === "broken" :
      flag === "mobile" ? !!link.mobile :
      flag === "free" ? link.cost === "free" || !link.cost :
      true;
    if (!ok) return false;
  }
  if (q.minRating && ctx.avgRating(link.id) < q.minRating) return false;
  if (q.colors.length && !q.colors.some((c) => (link.color || "").toLowerCase() === c.toLowerCase())) return false;
  if (q.emoji && link.emoji !== q.emoji) return false;
  const added = link.createdAt ? new Date(link.createdAt).getTime() : 0;
  if (q.after && added < q.after) return false;
  if (q.before && (!added || added > q.before)) return false;
  return true;
}
