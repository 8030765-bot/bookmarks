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

/* ---------- forgiving word matching ---------- */
// words people use for the same thing
const SYNONYMS: string[][] = [
  ["math", "maths", "mathematics"], ["sci", "science"], ["vid", "video", "videos", "youtube"], ["game", "games", "gaming"],
  ["calc", "calculator"], ["eng", "english"], ["hist", "history"], ["geo", "geography"], ["bio", "biology"], ["chem", "chemistry"],
  ["phys", "physics"], ["prog", "programming", "coding", "code"], ["music", "songs", "song"], ["dict", "dictionary"],
  ["pic", "pics", "picture", "pictures", "photo", "photos", "image", "images"], ["doc", "docs", "document", "documents"],
  ["test", "quiz", "quizzes"], ["typing", "type", "keyboard"], ["art", "drawing", "draw", "paint"], ["read", "reading", "book", "books"],
];
const synonymMap = new Map<string, string[]>();
SYNONYMS.forEach((group) => group.forEach((w) => synonymMap.set(w, group)));
export function synonymsOf(word: string): string[] {
  return synonymMap.get(word) || [word];
}

/** Typos between two words (a swapped pair of letters counts as one), stopping early once it's clearly too far. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}
const allowedTypos = (w: string) => (w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0);

/** The word, or a word that means the same ("maths" finds "math"). */
export function exactMatch(hay: string, word: string): boolean {
  if (hay.includes(word)) return true;
  for (const syn of synonymsOf(word)) if (syn !== word && hay.includes(syn)) return true;
  return false;
}

/** Like exactMatch, but also allows a small typo in a whole word ("desmso" finds "desmos"). */
export function forgivingMatch(hay: string, word: string): boolean {
  if (exactMatch(hay, word)) return true;
  const typos = allowedTypos(word);
  if (!typos) return false;
  for (const tok of hay.split(/[^\p{L}\p{N}]+/u)) {
    if (tok.length < 3) continue;
    // compare against the start of longer words too ("calcul" vs "calculator")
    const piece = tok.length > word.length + typos ? tok.slice(0, word.length) : tok;
    if (editDistance(word, piece, typos) <= typos) return true;
  }
  return false;
}

/** How well a link matches the plain words: name hits count most. Higher is better. */
export function relevance(q: ParsedQuery, link: Link): number {
  const name = link.name.toLowerCase();
  const tags = (link.tags || []).join(" ");
  const host = link.url.toLowerCase();
  let score = 0;
  for (const w of [...q.words, ...q.phrases]) {
    if (name === w) score += 12;
    else if (name.startsWith(w)) score += 8;
    else if (name.includes(w)) score += 6;
    if (tags.includes(w)) score += 4;
    if (host.includes(w)) score += 3;
    if ((link.notes || "").toLowerCase().includes(w)) score += 1;
  }
  return score + Math.min(3, (link.clicks || 0) / 20);
}

/** The closest known word to something that matched nothing ("Did you mean …?"). */
export function closestWord(word: string, vocabulary: Iterable<string>): string | null {
  let best: string | null = null;
  let bestD = 3;
  for (const v of vocabulary) {
    if (v === word || v.length < 3) continue;
    const d = editDistance(word, v, 2);
    if (d < bestD) { best = v; bestD = d; }
  }
  return best;
}

export interface MatchContext {
  prefs: Record<string, LinkPref>;
  favorites: Set<string>;
  avgRating: (linkId: string) => number;
  since: number;
  me: string | null;
  /** also look in descriptions, tips and notes (default yes) */
  deep?: boolean;
}

/** Everything about a link that plain words can match. */
export function haystackOf(link: Link, folder: Folder, pref?: LinkPref, deep = true) {
  const words = deep
    ? [link.name, link.url, link.notes || "", link.tip || "", folder.name, link.addedBy || "", link.keyword || "", pref?.note || "", pref?.rename || "", ...(link.tags || [])]
    : [link.name, link.url, folder.name, link.keyword || "", pref?.rename || "", ...(link.tags || [])];
  return words.join(" ").toLowerCase();
}

export function matchLink(q: ParsedQuery, link: Link, folder: Folder, ctx: MatchContext, wordMatch?: (hay: string, word: string) => boolean): boolean {
  if (!q.active) return true;
  const pref = ctx.prefs[link.id];
  const hay = haystackOf(link, folder, pref, ctx.deep !== false);
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
