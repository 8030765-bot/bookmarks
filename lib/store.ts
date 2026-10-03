import { Redis } from "@upstash/redis";
import { BookmarksData, ActivityEntry, Folder, Link, LinkStatus } from "./types";
import { defaultData } from "./defaultData";
import { v4 as uuid } from "uuid";
import { normalizeUrl } from "./url";
import { AuthContext, checkAdmin } from "./roles";
import { notify } from "./userdata";
import { REV_KEYS } from "./revs";
const KEY = "bookmarks:shared";
const PREV_KEY = "bookmarks:shared:prev";
// visit counts live in their own hash (HINCRBY) so a click never rewrites the whole list
const CLICKS_KEY = "clicks";
function getRedis() {
  return Redis.fromEnv();
}

/* ---------- input limits ---------- */
const MAX_NAME = 100;
const MAX_URL = 2000;
const MAX_TAGS = 8;
function cleanName(v: unknown, max = MAX_NAME) {
  return String(v ?? "").trim().slice(0, max);
}
function cleanUrl(v: unknown) {
  const raw = String(v ?? "");
  if (raw.length > MAX_URL) throw new Error("That link is too long");
  return normalizeUrl(raw);
}
function cleanTags(v: unknown): string[] {
  const list = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",") : [];
  return Array.from(new Set(list.map((t) => t.trim().toLowerCase().replace(/,/g, "").slice(0, 24)).filter(Boolean))).slice(0, MAX_TAGS);
}
function cleanColor(v: unknown) {
  return typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined;
}

const STATUSES: LinkStatus[] = ["works", "login", "slow", "broken"];
const STICKERS = ["hot", "new", "essential"] as const;
const COSTS = ["free", "paid", "account"] as const;
/**
 * The optional extras on a link. Anyone adding a link can set the
 * descriptive ones; pins, stickers, "verified", keywords, expiry and
 * extra folders are admin-only.
 */
function applyExtras(data: BookmarksData, link: Link, body: Record<string, unknown>, admin: boolean) {
  if (typeof body.emoji === "string") link.emoji = cleanName(body.emoji, 8) || undefined;
  if (typeof body.lang === "string") link.lang = /^[a-z]{2}(-[a-z]{2})?$/i.test(body.lang) ? body.lang.toLowerCase() : undefined;
  if (typeof body.cost === "string") link.cost = (COSTS as readonly string[]).includes(body.cost) ? (body.cost as Link["cost"]) : undefined;
  if (typeof body.mobile === "boolean") link.mobile = body.mobile || undefined;
  if (typeof body.tip === "string") link.tip = body.tip.trim().slice(0, 200) || undefined;
  if (typeof body.readMins === "number" && Number.isFinite(body.readMins)) {
    link.readMins = body.readMins > 0 ? Math.min(600, Math.max(1, Math.round(body.readMins))) : undefined;
  }
  if (Array.isArray(body.related)) {
    const related: { name: string; url: string }[] = [];
    for (const r of body.related.slice(0, 5) as Record<string, unknown>[]) {
      try {
        const url = cleanUrl(r?.url);
        if (url) related.push({ name: cleanName(r?.name, 60) || url, url });
      } catch {
        // skip anything that isn't a web link
      }
    }
    link.related = related.length ? related : undefined;
  }
  if (Array.isArray(body.checklist)) {
    const steps = body.checklist.map((s) => cleanName(s, 120)).filter(Boolean).slice(0, 12);
    link.checklist = steps.length ? steps : undefined;
  }
  if (!admin) return;
  if (typeof body.pinned === "boolean") link.pinned = body.pinned || undefined;
  if (typeof body.verified === "boolean") link.verified = body.verified || undefined;
  if (typeof body.status === "string") link.status = STATUSES.includes(body.status as LinkStatus) ? (body.status as LinkStatus) : undefined;
  if (typeof body.sticker === "string") link.sticker = (STICKERS as readonly string[]).includes(body.sticker) ? (body.sticker as Link["sticker"]) : undefined;
  if (typeof body.expiresAt === "string") {
    const t = Date.parse(body.expiresAt);
    link.expiresAt = body.expiresAt && Number.isFinite(t) ? new Date(t).toISOString() : undefined;
  }
  if (typeof body.keyword === "string") {
    const kw = body.keyword.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);
    if (kw && data.folders.some((f) => f.links.some((l) => l.keyword === kw && l.id !== link.id))) {
      throw new Error(`The keyword “${kw}” is already used by another link`);
    }
    link.keyword = kw || undefined;
  }
  if (Array.isArray(body.alsoIn)) {
    const ids = new Set(data.folders.map((f) => f.id));
    const also = Array.from(new Set(body.alsoIn.map(String))).filter((id) => ids.has(id)).slice(0, 5);
    link.alsoIn = also.length ? also : undefined;
  }
}

/** Adds the separately-stored visit counts onto a copy of the data for the client. */
export async function withClicks(data: BookmarksData): Promise<BookmarksData> {
  const raw = (await getRedis().hgetall<Record<string, number>>(CLICKS_KEY)) || {};
  if (!Object.keys(raw).length) return data;
  return {
    ...data,
    folders: data.folders.map((f) => ({
      ...f,
      links: f.links.map((l) => (raw[l.id] ? { ...l, clicks: (l.clicks || 0) + Number(raw[l.id]) } : l)),
    })),
  };
}
function linkCount(data: BookmarksData | null | undefined): number {
  if (!data?.folders) return 0;
  return data.folders.reduce((n, f) => n + (f.links?.length || 0), 0);
}
function looksLikeDefaultSeed(data: BookmarksData): boolean {
  const ids = (data.folders || []).map((f) => f.id).sort().join(",");
  return ids === "helios-gust,hubs,proxies" && linkCount(data) <= 10;
}
function normalize(data: BookmarksData | null | undefined): BookmarksData {
  if (!data || !Array.isArray(data.folders)) {
    return structuredClone(defaultData);
  }
  if (!data.activity) data.activity = [];
  if (!data.settings) data.settings = { theme: "dark", viewMode: "grid", sortBy: "manual" };
  for (const f of data.folders) {
    if (!Array.isArray(f.links)) f.links = [];
  }
  return data;
}
function pushActivity(data: BookmarksData, action: string, detail: string) {
  const entry: ActivityEntry = { id: uuid(), action, detail, at: new Date().toISOString() };
  data.activity = [entry, ...(data.activity || [])].slice(0, 50);
}
export async function getBookmarks(): Promise<BookmarksData> {
  const redis = getRedis();
  const data = await redis.get<BookmarksData>(KEY);
  return normalize(data);
}
/**
 * snapshot=false skips saving an undo point (used for likes/votes so
 * "Undo last change" in the admin panel undoes a real edit).
 */
export async function saveBookmarks(data: BookmarksData, { snapshot = true } = {}): Promise<void> {
  const redis = getRedis();
  const existing = await redis.get<BookmarksData>(KEY);
  if (
    existing &&
    Array.isArray(existing.folders) &&
    linkCount(existing) > linkCount(data) &&
    looksLikeDefaultSeed(data) &&
    !looksLikeDefaultSeed(existing)
  ) {
    throw new Error("Refusing to overwrite saved bookmarks with the default set.");
  }
  if (data.activity && data.activity.length > 50) {
    data.activity = data.activity.slice(0, 50);
  }
  const normalized = normalize(data);
  normalized.rev = (existing?.rev || 0) + 1;
  normalized.updatedAt = new Date().toISOString();
  if (snapshot && existing && Array.isArray(existing.folders)) {
    await redis.set(PREV_KEY, existing);
  }
  await redis.set(KEY, normalized);
  // publish the new revision so every open page knows to refresh
  await redis.set(REV_KEYS.bookmarks, normalized.rev);
}
function findLink(data: BookmarksData, folderId: string, linkId: string) {
  const folder = data.folders.find((f) => f.id === folderId);
  if (!folder) throw new Error("Folder not found");
  const index = folder.links.findIndex((l) => l.id === linkId);
  if (index < 0) throw new Error("Link not found");
  return { folder, index, link: folder.links[index] };
}
function moveItem<T>(list: T[], index: number, dir: number) {
  const target = index + dir;
  if (index < 0 || target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
}
/** " (suggested by x)" when an admin approved a user suggestion */
function credit(body: Record<string, unknown>) {
  return typeof body.suggestedBy === "string" && body.suggestedBy ? ` (suggested by ${body.suggestedBy})` : "";
}
type LinkRef = { folderId: string; linkId: string };
function linkRefs(body: Record<string, unknown>): LinkRef[] {
  if (!Array.isArray(body.items)) throw new Error("Missing items");
  return (body.items as LinkRef[]).map((r) => ({ folderId: String(r.folderId), linkId: String(r.linkId) }));
}
/** Context the API route attaches to every action (never trusted from the client). */
function authFrom(body: Record<string, unknown>): Partial<AuthContext> {
  return (body.__auth as Partial<AuthContext>) || {};
}
export async function handleAction(
  action: string,
  body: Record<string, unknown>
): Promise<BookmarksData> {
  const data = await getBookmarks();
  const password = typeof body.password === "string" ? body.password : undefined;
  // role-aware admin check: admin accounts pass; the shared password only until an owner exists
  const requireAdmin = (pw?: string) => checkAdmin(authFrom(body), pw);
  const isAdmin = () => { try { requireAdmin(password); return true; } catch { return false; } };
  const me = authFrom(body).user || undefined;
  switch (action) {
    case "verifyAdmin": {
      requireAdmin(password);
      // Always return full data so client setState never loses folders
      return data;
    }
    case "addLink": {
      if (data.settings?.lockAdding) requireAdmin(password);
      const folderId = String(body.folderId || "");
      const name = cleanName(body.name);
      const url = cleanUrl(body.url);
      if (!folderId || !name || !url) throw new Error("Missing fields");
      const folder = data.folders.find((f) => f.id === folderId);
      if (!folder) throw new Error("Folder not found");
      const tags = cleanTags(body.tags);
      const user = me;
      const addedBy = typeof body.suggestedBy === "string" && body.suggestedBy ? body.suggestedBy : user;
      const link: Link = {
        addedBy,
        id: uuid(),
        name,
        url,
        tags,
        clicks: 0,
        createdAt: new Date().toISOString(),
        color: cleanColor(body.color),
        notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : undefined,
      };
      applyExtras(data, link, body, isAdmin());
      folder.links.push(link);
      pushActivity(data, "add", `Added link “${name}”${credit(body)}`);
      await saveBookmarks(data);
      return data;
    }
    case "addLinks": {
      // paste a list of links: one save instead of one per link
      if (data.settings?.lockAdding) requireAdmin(password);
      const folder = data.folders.find((f) => f.id === String(body.folderId || ""));
      if (!folder) throw new Error("Folder not found");
      const incoming = Array.isArray(body.links) ? (body.links as Record<string, unknown>[]).slice(0, 50) : [];
      const existing = new Set(data.folders.flatMap((f) => f.links.map((l) => l.url)));
      let added = 0;
      for (const item of incoming) {
        let url = "";
        try { url = cleanUrl(item?.url); } catch { continue; }
        if (!url || existing.has(url)) continue;
        existing.add(url);
        folder.links.push({
          id: uuid(), name: cleanName(item?.name) || url, url, tags: cleanTags(body.tags), clicks: 0,
          createdAt: new Date().toISOString(), addedBy: me,
        });
        added++;
      }
      if (!added) throw new Error("No new links to add (they may already be on the site)");
      pushActivity(data, "add", `Added ${added} links to “${folder.name}”`);
      await saveBookmarks(data);
      return data;
    }
    case "editLink": {
      requireAdmin(password);
      const folderId = String(body.folderId || "");
      const linkId = String(body.linkId || "");
      const folder = data.folders.find((f) => f.id === folderId);
      if (!folder) throw new Error("Folder not found");
      const link = folder.links.find((l) => l.id === linkId);
      if (!link) throw new Error("Link not found");
      if (typeof body.name === "string" && body.name.trim()) link.name = cleanName(body.name);
      if (typeof body.url === "string" && body.url.trim()) link.url = cleanUrl(body.url);
      if (Array.isArray(body.tags) || typeof body.tags === "string") link.tags = cleanTags(body.tags);
      if (typeof body.color === "string") link.color = cleanColor(body.color);
      if (typeof body.notes === "string") link.notes = body.notes.trim().slice(0, 500) || undefined;
      applyExtras(data, link, body, true);
      link.updatedAt = new Date().toISOString();
      pushActivity(data, "edit", `Edited link “${link.name}”${credit(body)}`);
      await saveBookmarks(data);
      return data;
    }
    case "deleteLink": {
      requireAdmin(password);
      const folderId = String(body.folderId || "");
      const linkId = String(body.linkId || "");
      const folder = data.folders.find((f) => f.id === folderId);
      if (!folder) throw new Error("Folder not found");
      const before = folder.links.find((l) => l.id === linkId);
      folder.links = folder.links.filter((l) => l.id !== linkId);
      pushActivity(data, "delete", `Deleted link “${before?.name || linkId}”${credit(body)}`);
      await saveBookmarks(data);
      await getRedis().hdel(CLICKS_KEY, linkId).catch(() => {});
      return data;
    }
    case "addFolder": {
      if (data.settings?.lockAdding) requireAdmin(password);
      const name = cleanName(body.name, 60);
      const emoji = cleanName(body.emoji, 8) || "📁";
      if (!name) throw new Error("Name required");
      data.folders.push({
        id: uuid(),
        name,
        emoji,
        links: [],
        color: cleanColor(body.color),
        createdAt: new Date().toISOString(),
      });
      pushActivity(data, "add", `Added folder “${name}”`);
      await saveBookmarks(data);
      return data;
    }
    case "editFolder": {
      requireAdmin(password);
      const folderId = String(body.folderId || body.id || "");
      const folder = data.folders.find((f) => f.id === folderId);
      if (!folder) throw new Error("Folder not found");
      if (typeof body.name === "string" && body.name.trim()) folder.name = cleanName(body.name, 60);
      if (typeof body.emoji === "string" && body.emoji.trim()) folder.emoji = cleanName(body.emoji, 8);
      if (typeof body.color === "string") folder.color = cleanColor(body.color);
      if (typeof body.pinned === "boolean") folder.pinned = body.pinned;
      pushActivity(data, "edit", `Edited folder “${folder.name}”`);
      await saveBookmarks(data);
      return data;
    }
    case "deleteFolder": {
      requireAdmin(password);
      const folderId = String(body.folderId || "");
      const before = data.folders.find((f) => f.id === folderId);
      data.folders = data.folders.filter((f) => f.id !== folderId);
      pushActivity(data, "delete", `Deleted folder “${before?.name || folderId}”`);
      await saveBookmarks(data);
      return data;
    }
    case "moveLink": {
      requireAdmin(password);
      const folderId = String(body.folderId || "");
      const linkId = String(body.linkId || "");
      const targetFolderId = String(body.targetFolderId || "");
      const src = data.folders.find((f) => f.id === folderId);
      const dst = data.folders.find((f) => f.id === targetFolderId);
      if (!src || !dst) throw new Error("Folder not found");
      const idx = src.links.findIndex((l) => l.id === linkId);
      if (idx < 0) throw new Error("Link not found");
      const [link] = src.links.splice(idx, 1);
      dst.links.push(link);
      pushActivity(data, "move", `Moved “${link.name}” to “${dst.name}”`);
      await saveBookmarks(data);
      return data;
    }
    case "toggleFavorite": {
      const folderId = String(body.folderId || "");
      const linkId = String(body.linkId || "");
      const folder = data.folders.find((f) => f.id === folderId);
      if (!folder) throw new Error("Folder not found");
      const link = folder.links.find((l) => l.id === linkId);
      if (!link) throw new Error("Link not found");
      link.favorite = !link.favorite;
      await saveBookmarks(data, { snapshot: false });
      return data;
    }
    case "trackClick": {
      // handled by trackClick() below without touching the big blob
      return data;
    }
    case "toggleLike": {
      const user = me?.toLowerCase() || "";
      if (!user) throw new Error("Log in to like websites");
      const { link } = findLink(data, String(body.folderId || ""), String(body.linkId || ""));
      const likes = new Set(link.likes || []);
      const adding = !likes.has(user);
      if (adding) likes.add(user);
      else likes.delete(user);
      link.likes = Array.from(likes);
      await saveBookmarks(data, { snapshot: false });
      // tell the person who added it (not yourself)
      if (adding && link.addedBy && link.addedBy.toLowerCase() !== user) {
        notify(link.addedBy, { kind: "like", from: me, text: `${me} liked your link “${link.name}”` }).catch(() => {});
      }
      return data;
    }
    case "createPoll": {
      requireAdmin(password);
      const question = String(body.question || "").trim().slice(0, 200);
      const options = (Array.isArray(body.options) ? body.options : [])
        .map((o) => String(o).trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 6);
      if (!question || options.length < 2) throw new Error("A poll needs a question and at least 2 options");
      data.polls = [{ id: uuid(), question, options, votes: {}, createdAt: new Date().toISOString() }, ...(data.polls || [])].slice(0, 20);
      pushActivity(data, "add", `New poll: “${question}”`);
      await saveBookmarks(data);
      return data;
    }
    case "votePoll": {
      const user = me?.toLowerCase() || "";
      if (!user) throw new Error("Log in to vote");
      const poll = (data.polls || []).find((p) => p.id === String(body.pollId || ""));
      if (!poll) throw new Error("Poll not found");
      if (poll.closed) throw new Error("This poll is closed");
      const choice = Number(body.option);
      if (!Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) throw new Error("Invalid option");
      if (poll.votes[user] === choice) delete poll.votes[user]; // tap again to take your vote back
      else poll.votes[user] = choice;
      await saveBookmarks(data, { snapshot: false });
      return data;
    }
    case "closePoll":
    case "deletePoll": {
      requireAdmin(password);
      const id = String(body.pollId || "");
      if (action === "deletePoll") data.polls = (data.polls || []).filter((p) => p.id !== id);
      else {
        const poll = (data.polls || []).find((p) => p.id === id);
        if (!poll) throw new Error("Poll not found");
        poll.closed = !poll.closed;
      }
      await saveBookmarks(data);
      return data;
    }
    case "addFolders": {
      // merge an imported browser-bookmarks file in as new folders
      requireAdmin(password);
      const incoming = Array.isArray(body.folders) ? (body.folders as Record<string, unknown>[]) : [];
      let added = 0;
      for (const f of incoming.slice(0, 50)) {
        const name = String(f.name || "Imported").trim().slice(0, 60) || "Imported";
        const links: Folder["links"] = [];
        for (const l of (Array.isArray(f.links) ? (f.links as Record<string, unknown>[]) : []).slice(0, 500)) {
          try {
            const url = normalizeUrl(String(l.url || ""));
            if (!url) continue;
            links.push({ id: uuid(), name: String(l.name || url).trim().slice(0, 100) || url, url, tags: [], clicks: 0, createdAt: new Date().toISOString() });
          } catch {
            // skip javascript:, chrome:// and other non-web bookmarks
          }
        }
        if (!links.length) continue;
        data.folders.push({ id: uuid(), name, emoji: "📥", links, createdAt: new Date().toISOString() });
        added += links.length;
      }
      if (!added) throw new Error("No web links found in that file");
      pushActivity(data, "import", `Imported ${added} websites`);
      await saveBookmarks(data);
      return data;
    }
    case "importData": {
      requireAdmin(password);
      const payload = body.payload as BookmarksData;
      if (!payload || !Array.isArray(payload.folders)) throw new Error("Invalid file");
      const imported = normalize(payload);
      pushActivity(imported, "import", `Imported ${imported.folders.length} folders`);
      await saveBookmarks(imported);
      return imported;
    }
    case "setAnnouncement": {
      requireAdmin(password);
      if (!data.settings) data.settings = {};
      data.settings.announcement = typeof body.text === "string" ? body.text.slice(0, 300) : "";
      await saveBookmarks(data);
      return data;
    }
    case "reset": {
      requireAdmin(password);
      const fresh = structuredClone(defaultData);
      pushActivity(fresh, "reset", "Reset to defaults");
      await saveBookmarks(fresh);
      return fresh;
    }
    case "clearAll": {
      requireAdmin(password);
      const empty: BookmarksData = {
        folders: [],
        activity: [],
        settings: data.settings || { theme: "dark", viewMode: "grid", sortBy: "manual" },
      };
      pushActivity(empty, "clear", "Cleared all bookmarks");
      await saveBookmarks(empty);
      return empty;
    }
    case "setSettings": {
      requireAdmin(password);
      const patch = (body.settings || {}) as Record<string, unknown>;
      const s = (data.settings ||= {});
      for (const key of ["announcement", "title", "subtitle"] as const) {
        if (typeof patch[key] === "string") s[key] = (patch[key] as string).slice(0, 300);
      }
      for (const key of ["lockAdding", "chatEnabled"] as const) {
        if (typeof patch[key] === "boolean") s[key] = patch[key] as boolean;
      }
      pushActivity(data, "settings", "Updated site settings");
      await saveBookmarks(data);
      return data;
    }
    case "reorderFolder": {
      requireAdmin(password);
      const index = data.folders.findIndex((f) => f.id === String(body.folderId || ""));
      if (index < 0) throw new Error("Folder not found");
      moveItem(data.folders, index, Number(body.dir) < 0 ? -1 : 1);
      await saveBookmarks(data);
      return data;
    }
    case "reorderLink": {
      requireAdmin(password);
      const { folder, index } = findLink(data, String(body.folderId || ""), String(body.linkId || ""));
      moveItem(folder.links, index, Number(body.dir) < 0 ? -1 : 1);
      await saveBookmarks(data);
      return data;
    }
    case "resetClicks": {
      requireAdmin(password);
      if (body.folderId && body.linkId) {
        const { link } = findLink(data, String(body.folderId), String(body.linkId));
        link.clicks = 0;
        await getRedis().hdel(CLICKS_KEY, link.id);
        pushActivity(data, "edit", "Reset clicks on one link");
      } else {
        data.folders.forEach((f) => f.links.forEach((l) => (l.clicks = 0)));
        await getRedis().del(CLICKS_KEY);
        pushActivity(data, "edit", "Reset all click counts");
      }
      await saveBookmarks(data);
      return data;
    }
    case "bulkDelete": {
      requireAdmin(password);
      const refs = linkRefs(body);
      const ids = new Set(refs.map((r) => r.linkId));
      let removed = 0;
      for (const f of data.folders) {
        const before = f.links.length;
        f.links = f.links.filter((l) => !ids.has(l.id));
        removed += before - f.links.length;
      }
      pushActivity(data, "delete", `Deleted ${removed} links`);
      await saveBookmarks(data);
      return data;
    }
    case "bulkTag": {
      requireAdmin(password);
      const tag = String(body.tag || "").trim().toLowerCase().replace(/,/g, "").slice(0, 24);
      if (!tag) throw new Error("Missing tag");
      const remove = body.remove === true;
      const ids = new Set(linkRefs(body).map((r) => r.linkId));
      let changed = 0;
      for (const f of data.folders) {
        for (const l of f.links) {
          if (!ids.has(l.id)) continue;
          const tags = new Set(l.tags || []);
          if (remove ? tags.delete(tag) : !tags.has(tag) && tags.add(tag)) changed++;
          l.tags = Array.from(tags);
        }
      }
      pushActivity(data, "edit", `${remove ? "Removed" : "Added"} tag #${tag} ${remove ? "from" : "on"} ${changed} links`);
      await saveBookmarks(data);
      return data;
    }
    case "bulkMove": {
      requireAdmin(password);
      const dst = data.folders.find((f) => f.id === String(body.targetFolderId || ""));
      if (!dst) throw new Error("Folder not found");
      const ids = new Set(linkRefs(body).map((r) => r.linkId));
      let moved = 0;
      for (const f of data.folders) {
        if (f === dst) continue;
        const keep = [];
        for (const l of f.links) {
          if (ids.has(l.id)) { dst.links.push(l); moved++; } else keep.push(l);
        }
        f.links = keep;
      }
      pushActivity(data, "move", `Moved ${moved} links to “${dst.name}”`);
      await saveBookmarks(data);
      return data;
    }
    case "moveLinkTo": {
      // drag & drop: put a link into a folder, before another link (or at the end)
      requireAdmin(password);
      const { folder: src, index } = findLink(data, String(body.folderId || ""), String(body.linkId || ""));
      const dst = data.folders.find((f) => f.id === String(body.targetFolderId || ""));
      if (!dst) throw new Error("Folder not found");
      const [link] = src.links.splice(index, 1);
      const before = body.beforeLinkId ? dst.links.findIndex((l) => l.id === String(body.beforeLinkId)) : -1;
      if (before < 0) dst.links.push(link);
      else dst.links.splice(before, 0, link);
      if (src !== dst) pushActivity(data, "move", `Moved “${link.name}” to “${dst.name}”`);
      await saveBookmarks(data);
      return data;
    }
    case "moveFolderTo": {
      requireAdmin(password);
      const from = data.folders.findIndex((f) => f.id === String(body.folderId || ""));
      if (from < 0) throw new Error("Folder not found");
      const [folder] = data.folders.splice(from, 1);
      const before = body.beforeFolderId ? data.folders.findIndex((f) => f.id === String(body.beforeFolderId)) : -1;
      if (before < 0) data.folders.push(folder);
      else data.folders.splice(before, 0, folder);
      await saveBookmarks(data);
      return data;
    }
    case "undo": {
      requireAdmin(password);
      const redis = getRedis();
      const prev = await redis.get<BookmarksData>(PREV_KEY);
      if (!prev || !Array.isArray(prev.folders)) throw new Error("Nothing to undo");
      const restored = normalize(prev);
      restored.rev = (data.rev || 0) + 1;
      restored.updatedAt = new Date().toISOString();
      pushActivity(restored, "undo", "Undid the last change");
      // swap, so pressing undo again redoes
      await redis.set(PREV_KEY, data);
      await redis.set(KEY, restored);
      await redis.set(REV_KEYS.bookmarks, restored.rev);
      return restored;
    }
    default:
      throw new Error("Unknown action");
  }
}

/** One visit: a single HINCRBY instead of read-modify-write of the whole list. */
export async function trackClick(linkId: string) {
  if (!/^[\w-]{1,100}$/.test(linkId)) return;
  await getRedis().hincrby(CLICKS_KEY, linkId, 1);
}
