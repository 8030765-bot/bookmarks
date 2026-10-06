import { Redis } from "@upstash/redis";
import { BookmarksData, ActivityEntry, Folder, FolderSort, Link, LinkStatus } from "./types";
import { defaultData } from "./defaultData";
import { v4 as uuid } from "uuid";
import { normalizeUrl } from "./url";
import { AuthContext, checkAdmin } from "./roles";
import { notify } from "./userdata";
import { REV_KEYS } from "./revs";
import { fansKey } from "./social";
import { getClub, isMember } from "./clubs";
import { addToTrash, listTrash, setFlags, takeFromTrash } from "./moderation";
import { getImageMeta } from "./images";
import { backupIfNeeded, getBackup } from "./backups";
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
function cleanDate(v: string) {
  const t = Date.parse(v);
  return v && Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}
function cleanColor(v: unknown) {
  return typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined;
}

const FOLDER_SORTS: FolderSort[] = ["manual", "name", "newest", "clicks", "rating"];
/**
 * Folder extras. Descriptions, guides and default sort: admins and the
 * folder's maintainers. Spaces, smart rules, archiving, maintainers and
 * moving folders: admins (anyone adding a folder can put it inside another).
 */
function applyFolderFields(data: BookmarksData, folder: Folder, body: Record<string, unknown>, admin: boolean) {
  if (typeof body.description === "string") folder.description = body.description.trim().slice(0, 300) || undefined;
  if (typeof body.guide === "string") folder.guide = body.guide.trim().slice(0, 5000) || undefined;
  if (typeof body.sort === "string") {
    folder.sort = FOLDER_SORTS.includes(body.sort as FolderSort) && body.sort !== "manual" ? (body.sort as FolderSort) : undefined;
  }
  const creating = !data.folders.includes(folder);
  if (typeof body.parentId === "string" && (admin || creating)) {
    const pid = body.parentId;
    if (!pid) folder.parentId = undefined;
    else {
      const parent = data.folders.find((f) => f.id === pid);
      if (!parent || parent.id === folder.id) throw new Error("Pick a different folder to put it in");
      if (parent.parentId) throw new Error("Sub-folders can only go one level deep");
      if (data.folders.some((f) => f.parentId === folder.id)) throw new Error("This folder has its own sub-folders, so it can't go inside another");
      folder.parentId = pid;
    }
  }
  if (!admin) return;
  if (typeof body.space === "string") folder.space = cleanName(body.space, 30) || undefined;
  if (typeof body.rule === "string") {
    folder.rule = body.rule.trim().slice(0, 200) || undefined;
    if (folder.rule && folder.links.length) throw new Error("Only an empty folder can become a smart folder");
  }
  if (typeof body.archived === "boolean") folder.archived = body.archived || undefined;
  if (body.perm && typeof body.perm === "object") {
    const p = body.perm as Record<string, unknown>;
    const perm: Folder["perm"] = {
      add: p.add === "contributors" || p.add === "admins" ? p.add : undefined,
      edit: p.edit === "admins" ? "admins" : undefined,
      view: p.view === "members" ? "members" : undefined,
    };
    folder.perm = perm.add || perm.edit || perm.view ? perm : undefined;
  }
  if (typeof body.showAt === "string") folder.showAt = cleanDate(body.showAt);
  if (Array.isArray(body.maintainers)) {
    const names = Array.from(new Set(body.maintainers.map((u) => String(u).trim().toLowerCase()).filter((u) => /^[a-z0-9_]{3,20}$/.test(u)))).slice(0, 5);
    folder.maintainers = names.length ? names : undefined;
  }
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
  // checked by checkIcon() before we get here
  if (typeof body.iconImg === "string") link.iconImg = /^[a-f0-9]{32}$/.test(body.iconImg) ? body.iconImg : undefined;
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
  if (typeof body.showAt === "string") link.showAt = cleanDate(body.showAt);
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
/**
 * Saved data stays readable after updates: each format change gets a step
 * here, and older copies (backups, imports, the live list) are upgraded
 * when they're read.
 */
export const SCHEMA = 2;
function migrate(data: BookmarksData): BookmarksData {
  const from = data.schema || 1;
  if (from < 2) {
    // v2: tags are lowercase and unique; folders always have an emoji
    for (const f of data.folders) {
      if (!f.emoji) f.emoji = "📁";
      for (const l of f.links || []) if (Array.isArray(l.tags)) l.tags = Array.from(new Set(l.tags.map((t) => String(t).toLowerCase())));
    }
  }
  data.schema = SCHEMA;
  return data;
}
function normalize(data: BookmarksData | null | undefined): BookmarksData {
  if (!data || !Array.isArray(data.folders)) {
    return structuredClone(defaultData);
  }
  migrate(data);
  if (!data.activity) data.activity = [];
  if (!data.settings) data.settings = { theme: "dark", viewMode: "grid", sortBy: "manual" };
  for (const f of data.folders) {
    if (!Array.isArray(f.links)) f.links = [];
  }
  return data;
}
const ACTIVITY_MAX = 150;
function pushActivity(data: BookmarksData, action: string, detail: string, extra: { folderId?: string; by?: string } = {}) {
  const entry: ActivityEntry = { id: uuid(), action, detail, at: new Date().toISOString(), ...extra };
  data.activity = [entry, ...(data.activity || [])].slice(0, ACTIVITY_MAX);
}

/* ---------- following a folder ---------- */
export const followersKey = (folderId: string) => `followers:${folderId}`;
/**
 * Tell everyone following the folder — and everyone following the person
 * who added it — that something new arrived (never the person who added it).
 */
async function notifyFollowers(folder: Folder, text: string, except: string | undefined, link: string, personText?: string) {
  try {
    const redis = getRedis();
    const skip = except?.toLowerCase();
    const [folderFans, personFans] = await Promise.all([
      redis.smembers(followersKey(folder.id)),
      skip ? redis.smembers(fansKey(skip)) : Promise.resolve([] as string[]),
    ]);
    const told = new Set<string>();
    for (const u of folderFans) {
      if (u === skip || told.has(u)) continue;
      told.add(u);
      await notify(u, { kind: "follow", text, from: except, link });
    }
    for (const u of personFans) {
      if (u === skip || told.has(u) || told.size > 200) continue;
      told.add(u);
      await notify(u, { kind: "follow", text: personText || text, from: except, link });
    }
  } catch {
    // a missed heads-up isn't worth failing the save over
  }
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
  if (data.activity && data.activity.length > ACTIVITY_MAX) {
    data.activity = data.activity.slice(0, ACTIVITY_MAX);
  }
  const normalized = normalize(data);
  normalized.rev = (existing?.rev || 0) + 1;
  normalized.updatedAt = new Date().toISOString();
  if (snapshot && existing && Array.isArray(existing.folders)) {
    await redis.set(PREV_KEY, existing);
  }
  await backupIfNeeded(existing).catch(() => {});
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
/**
 * Two people editing the same thing: the form sends the "last changed"
 * time it started from, and we refuse if someone saved in between
 * (unless they choose to overwrite).
 */
function assertNotChanged(current: string | undefined, body: Record<string, unknown>) {
  if (typeof body.expectUpdatedAt !== "string" || body.force === true) return;
  if ((current || "") !== body.expectUpdatedAt) {
    throw new Error("Someone else changed this while you were editing — reload to see their version, or save again to overwrite it");
  }
}
/** " (suggested by x)" when an admin approved a user suggestion */
function credit(body: Record<string, unknown>) {
  return typeof body.suggestedBy === "string" && body.suggestedBy ? ` (suggested by ${body.suggestedBy})` : "";
}
type LinkRef = { folderId: string; linkId: string };
/** A link this person added in the last 15 minutes (they may delete it again). */
function isOwnFreshLink(link: Link | undefined, me: string | undefined) {
  return !!link && !!me && link.addedBy?.toLowerCase() === me.toLowerCase() && Date.now() - Date.parse(link.createdAt || "") < 15 * 60_000;
}
function linkRefs(body: Record<string, unknown>): LinkRef[] {
  if (!Array.isArray(body.items)) throw new Error("Missing items");
  return (body.items as LinkRef[]).map((r) => ({ folderId: String(r.folderId), linkId: String(r.linkId) }));
}
/** Context the API route attaches to every action (never trusted from the client). */
function authFrom(body: Record<string, unknown>): Partial<AuthContext> {
  return (body.__auth as Partial<AuthContext>) || {};
}
/** A moderator-approved note shown on a link ("this one needs a login", "blocked on school wifi"…). */
export async function setCommunityNote(linkId: string, note: { text: string; by: string } | null, index?: number) {
  const data = await getBookmarks();
  const link = data.folders.flatMap((f) => f.links).find((l) => l.id === linkId);
  if (!link) throw new Error("That link is gone");
  const notes = link.communityNotes || [];
  if (note) notes.unshift({ text: note.text.trim().slice(0, 280), by: note.by, at: new Date().toISOString() });
  else if (typeof index === "number") notes.splice(index, 1);
  link.communityNotes = notes.length ? notes.slice(0, 5) : undefined;
  await saveBookmarks(data, { snapshot: false });
  return link;
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
  // folder maintainers (and a club's members, for its folder) can manage the links in it
  const maintains = (folder: Folder) => !!me && !!folder.maintainers?.includes(me.toLowerCase());
  const requireFolderEditor = async (folder: Folder) => {
    if (folder.perm?.edit === "admins") return requireAdmin(password);
    if (maintains(folder)) return;
    if (folder.clubId && me && isMember(await getClub(folder.clubId), me)) return;
    requireAdmin(password);
  };
  /** Adding a link: the site-wide lock, then the folder's own rule. */
  const requireCanAdd = async (folder: Folder) => {
    const rule = folder.perm?.add;
    if (rule === "admins") return requireAdmin(password);
    if (rule === "contributors" && !authFrom(body).contributor && !maintains(folder)) return requireAdmin(password);
    if (data.settings?.lockAdding) await requireFolderEditor(folder);
  };
  const findFolder = (id: unknown) => {
    const folder = data.folders.find((f) => f.id === String(id || ""));
    if (!folder) throw new Error("Folder not found");
    return folder;
  };
  const log = (action: string, detail: string, folderId?: string) => pushActivity(data, action, detail, { folderId, by: me });
  /** A custom icon must be an uploaded icon, by this person (or any, for admins). */
  const checkIcon = async () => {
    if (typeof body.iconImg !== "string" || !body.iconImg) return;
    const meta = await getImageMeta(body.iconImg);
    if (!meta || meta.kind !== "icon") throw new Error("That icon is gone — upload it again");
    if (meta.owner.toLowerCase() !== (me || "").toLowerCase() && !isAdmin()) throw new Error("Use an icon you uploaded");
  };
  switch (action) {
    case "verifyAdmin": {
      requireAdmin(password);
      // Always return full data so client setState never loses folders
      return data;
    }
    case "addLink": {
      const folderId = String(body.folderId || "");
      const name = cleanName(body.name);
      const url = cleanUrl(body.url);
      if (!folderId || !name || !url) throw new Error("Missing fields");
      const folder = findFolder(folderId);
      await requireCanAdd(folder);
      if (folder.rule) throw new Error("Smart folders fill themselves — add the link to a normal folder");
      await checkIcon();
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
      log("add", `Added link “${name}”${credit(body)}`, folder.id);
      await saveBookmarks(data);
      await notifyFollowers(folder, `New in ${folder.emoji} ${folder.name}: “${name}”`, addedBy, `/#link-${link.id}`,
        `${addedBy} added “${name}” to ${folder.emoji} ${folder.name}`);
      return data;
    }
    case "addLinks": {
      // paste a list of links: one save instead of one per link
      const folder = findFolder(body.folderId);
      await requireCanAdd(folder);
      if (folder.rule) throw new Error("Smart folders fill themselves — add the links to a normal folder");
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
      log("add", `Added ${added} links to “${folder.name}”`, folder.id);
      await saveBookmarks(data);
      await notifyFollowers(folder, `${added} new links in ${folder.emoji} ${folder.name}`, me, `/#folder-${folder.id}`,
        `${me} added ${added} links to ${folder.emoji} ${folder.name}`);
      return data;
    }
    case "editLink": {
      const { folder, link } = findLink(data, String(body.folderId || ""), String(body.linkId || ""));
      await requireFolderEditor(folder);
      assertNotChanged(link.updatedAt, body);
      await checkIcon();
      if (typeof body.name === "string" && body.name.trim()) link.name = cleanName(body.name);
      if (typeof body.url === "string" && body.url.trim()) link.url = cleanUrl(body.url);
      if (Array.isArray(body.tags) || typeof body.tags === "string") link.tags = cleanTags(body.tags);
      if (typeof body.color === "string") link.color = cleanColor(body.color);
      if (typeof body.notes === "string") link.notes = body.notes.trim().slice(0, 500) || undefined;
      applyExtras(data, link, body, isAdmin());
      link.updatedAt = new Date().toISOString();
      log("edit", `Edited link “${link.name}”${credit(body)}`, folder.id);
      await saveBookmarks(data);
      return data;
    }
    case "deleteLink": {
      const folder = findFolder(body.folderId);
      const linkId = String(body.linkId || "");
      const index = folder.links.findIndex((l) => l.id === linkId);
      const before = folder.links[index];
      // you can take back a link you added in the last 15 minutes (Ctrl+Z after adding)
      if (!isOwnFreshLink(before, me)) await requireFolderEditor(folder);
      folder.links = folder.links.filter((l) => l.id !== linkId);
      log("delete", `Deleted link “${before?.name || linkId}”${credit(body)}`, folder.id);
      await saveBookmarks(data);
      if (before) await addToTrash([{ kind: "link", by: me, folderId: folder.id, folderName: folder.name, item: before, index }]).catch(() => {});
      await getRedis().hdel(CLICKS_KEY, linkId).catch(() => {});
      return data;
    }
    case "addFolder": {
      if (data.settings?.lockAdding) requireAdmin(password);
      const name = cleanName(body.name, 60);
      const emoji = cleanName(body.emoji, 8) || "📁";
      if (!name) throw new Error("Name required");
      const folder: Folder = {
        id: uuid(),
        name,
        emoji,
        links: [],
        color: cleanColor(body.color),
        createdAt: new Date().toISOString(),
      };
      applyFolderFields(data, folder, body, isAdmin());
      data.folders.push(folder);
      log("add", `Added ${folder.rule ? "smart " : ""}folder “${name}”`, folder.id);
      await saveBookmarks(data);
      return data;
    }
    case "editFolder": {
      const folder = findFolder(body.folderId || body.id);
      await requireFolderEditor(folder);
      assertNotChanged(folder.updatedAt, body);
      folder.updatedAt = new Date().toISOString();
      const admin = isAdmin();
      if (typeof body.name === "string" && body.name.trim()) folder.name = cleanName(body.name, 60);
      if (typeof body.emoji === "string" && body.emoji.trim()) folder.emoji = cleanName(body.emoji, 8);
      if (typeof body.color === "string") folder.color = cleanColor(body.color);
      if (admin && typeof body.pinned === "boolean") folder.pinned = body.pinned || undefined;
      applyFolderFields(data, folder, body, admin);
      log("edit", `Edited folder “${folder.name}”`, folder.id);
      await saveBookmarks(data);
      return data;
    }
    case "deleteFolder": {
      requireAdmin(password);
      const folderId = String(body.folderId || "");
      const before = data.folders.find((f) => f.id === folderId);
      data.folders = data.folders.filter((f) => f.id !== folderId);
      // its sub-folders move up a level instead of vanishing
      data.folders.forEach((f) => { if (f.parentId === folderId) f.parentId = undefined; });
      log("delete", `Deleted folder “${before?.name || folderId}”`);
      await saveBookmarks(data);
      if (before) await addToTrash([{ kind: "folder", by: me, item: before }]).catch(() => {});
      return data;
    }
    case "mergeFolder": {
      // move every link from one folder into another, then remove the empty one
      requireAdmin(password);
      const from = findFolder(body.folderId);
      const into = findFolder(body.intoId);
      if (from === into) throw new Error("Pick a different folder to merge into");
      const have = new Set(into.links.map((l) => l.url));
      let moved = 0;
      for (const l of from.links) if (!have.has(l.url)) { into.links.push(l); moved++; }
      data.folders = data.folders.filter((f) => f !== from);
      data.folders.forEach((f) => { if (f.parentId === from.id) f.parentId = into.parentId ? undefined : into.id; });
      log("move", `Merged “${from.name}” into “${into.name}” (${moved} links)`, into.id);
      await saveBookmarks(data);
      return data;
    }
    case "duplicateFolder": {
      requireAdmin(password);
      const src = findFolder(body.folderId);
      const copy: Folder = {
        ...structuredClone(src),
        id: uuid(),
        name: `${src.name} (copy)`.slice(0, 60),
        pinned: undefined,
        createdAt: new Date().toISOString(),
        links: src.links.map((l) => ({ ...structuredClone(l), id: uuid(), clicks: 0, likes: [], keyword: undefined, createdAt: new Date().toISOString() })),
      };
      data.folders.splice(data.folders.indexOf(src) + 1, 0, copy);
      log("add", `Copied folder “${src.name}”`, copy.id);
      await saveBookmarks(data);
      return data;
    }
    case "splitFolder": {
      // a long folder: move everything with one tag into its own folder
      requireAdmin(password);
      const src = findFolder(body.folderId);
      const tag = cleanTags([body.tag])[0];
      if (!tag) throw new Error("Pick a tag to split by");
      const moving = src.links.filter((l) => l.tags?.includes(tag));
      if (!moving.length) throw new Error(`Nothing in “${src.name}” is tagged #${tag}`);
      const name = cleanName(body.name, 60) || tag.charAt(0).toUpperCase() + tag.slice(1);
      const created: Folder = { id: uuid(), name, emoji: src.emoji, links: moving, color: src.color, createdAt: new Date().toISOString(), space: src.space };
      src.links = src.links.filter((l) => !l.tags?.includes(tag));
      data.folders.splice(data.folders.indexOf(src) + 1, 0, created);
      log("move", `Split ${moving.length} #${tag} links out of “${src.name}” into “${name}”`, created.id);
      await saveBookmarks(data);
      return data;
    }
    case "renameTag": {
      // rename a tag everywhere (renaming onto an existing tag merges them)
      requireAdmin(password);
      const from = cleanTags([body.from])[0];
      const to = cleanTags([body.to])[0];
      if (!from || !to) throw new Error("Missing tag");
      let changed = 0;
      for (const f of data.folders) for (const l of f.links) {
        if (!l.tags?.includes(from)) continue;
        l.tags = Array.from(new Set(l.tags.map((t) => (t === from ? to : t))));
        changed++;
      }
      const colors = data.settings?.tagColors;
      if (colors?.[from] && !colors[to]) colors[to] = colors[from];
      if (colors) delete colors[from];
      log("edit", `Renamed #${from} to #${to} on ${changed} links`);
      await saveBookmarks(data);
      return data;
    }
    case "deleteTag": {
      requireAdmin(password);
      const tag = cleanTags([body.tag])[0];
      if (!tag) throw new Error("Missing tag");
      let changed = 0;
      for (const f of data.folders) for (const l of f.links) {
        if (!l.tags?.includes(tag)) continue;
        l.tags = l.tags.filter((t) => t !== tag);
        changed++;
      }
      if (data.settings?.tagColors) delete data.settings.tagColors[tag];
      log("delete", `Removed #${tag} from ${changed} links`);
      await saveBookmarks(data);
      return data;
    }
    case "setTagColor": {
      requireAdmin(password);
      const tag = cleanTags([body.tag])[0];
      if (!tag) throw new Error("Missing tag");
      const s = (data.settings ||= {});
      const colors = (s.tagColors ||= {});
      const color = cleanColor(body.color);
      if (color) colors[tag] = color;
      else delete colors[tag];
      await saveBookmarks(data, { snapshot: false });
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
        notify(link.addedBy, { kind: "like", from: me, text: `${me} liked your link “${link.name}”`, link: `/#link-${link.id}` }).catch(() => {});
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
      const ends = typeof body.endsAt === "string" && Number.isFinite(Date.parse(body.endsAt)) ? new Date(body.endsAt).toISOString() : undefined;
      const poll = {
        id: uuid(), question, options, votes: {}, createdAt: new Date().toISOString(),
        multi: body.multi === true || undefined,
        endsAt: ends,
        anonymous: body.anonymous === true || undefined,
        counts: body.anonymous === true ? options.map(() => 0) : undefined,
        featured: body.featured === true || undefined,
      };
      // only one "poll of the week" at a time
      if (poll.featured) (data.polls || []).forEach((p) => { p.featured = undefined; });
      data.polls = [poll, ...(data.polls || [])].slice(0, 20);
      pushActivity(data, "add", `New poll: “${question}”`);
      await saveBookmarks(data);
      return data;
    }
    case "votePoll": {
      if (data.settings?.pollsEnabled === false) throw new Error("Polls are turned off right now");
      const user = me?.toLowerCase() || "";
      if (!user) throw new Error("Log in to vote");
      const poll = (data.polls || []).find((p) => p.id === String(body.pollId || ""));
      if (!poll) throw new Error("Poll not found");
      if (poll.closed || (poll.endsAt && Date.parse(poll.endsAt) < Date.now())) throw new Error("This poll is closed");
      const choice = Number(body.option);
      if (!Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) throw new Error("Invalid option");
      // your current answer(s): kept privately for anonymous polls, in the list otherwise
      const redis = getRedis();
      const anonKey = `pollvotes:${poll.id}`;
      const before = poll.anonymous ? await redis.hget<number[]>(anonKey, user) : poll.votes[user];
      const had: number[] = before === undefined || before === null ? [] : Array.isArray(before) ? before : [before];
      let next: number[];
      if (had.includes(choice)) next = had.filter((x) => x !== choice); // tap again to take your vote back
      else next = poll.multi ? [...had, choice].sort((a, b) => a - b) : [choice];
      if (poll.anonymous) {
        const counts = poll.counts || poll.options.map(() => 0);
        had.forEach((i) => { counts[i] = Math.max(0, (counts[i] || 0) - 1); });
        next.forEach((i) => { counts[i] = (counts[i] || 0) + 1; });
        poll.counts = counts;
        if (next.length) await redis.hset(anonKey, { [user]: next });
        else await redis.hdel(anonKey, user);
      } else if (!next.length) delete poll.votes[user];
      else poll.votes[user] = poll.multi ? next : next[0];
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
        if (body.featured !== undefined) {
          (data.polls || []).forEach((p) => { p.featured = undefined; });
          poll.featured = body.featured === true || undefined;
        } else poll.closed = !poll.closed;
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
      if (String(body.confirm || "").toUpperCase() !== "RESET") throw new Error("Type RESET to confirm");
      const fresh = structuredClone(defaultData);
      pushActivity(fresh, "reset", "Reset to defaults");
      await saveBookmarks(fresh);
      return fresh;
    }
    case "clearAll": {
      requireAdmin(password);
      if (String(body.confirm || "").toUpperCase() !== "DELETE") throw new Error("Type DELETE to confirm");
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
      for (const key of ["lockAdding", "chatEnabled", "chatImages", "chatServers"] as const) {
        if (typeof patch[key] === "boolean") s[key] = patch[key] as boolean;
      }
      if (typeof patch.startFolderId === "string") {
        s.startFolderId = data.folders.some((f) => f.id === patch.startFolderId) ? (patch.startFolderId as string) : undefined;
      }
      // chat rules
      if (patch.chatShortcodes && typeof patch.chatShortcodes === "object") {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(patch.chatShortcodes as Record<string, unknown>).slice(0, 50)) {
          const name = k.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
          if (name && typeof v === "string" && v.trim()) out[name] = v.trim().slice(0, 20);
        }
        s.chatShortcodes = Object.keys(out).length ? out : undefined;
      }
      if (Array.isArray(patch.chatLinkAllow)) {
        const list = patch.chatLinkAllow.map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0])
          .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 50);
        s.chatLinkAllow = list.length ? list : undefined;
      }
      if (typeof patch.chatMaxLen === "number") {
        s.chatMaxLen = Math.min(500, Math.max(50, Math.round(patch.chatMaxLen)));
      }
      // community spotlight
      if (typeof patch.featuredUser === "string") s.featuredUser = patch.featuredUser.trim().replace(/^@/, "").slice(0, 20) || undefined;
      if (typeof patch.featuredFolderId === "string") {
        s.featuredFolderId = data.folders.some((f) => f.id === patch.featuredFolderId) ? (patch.featuredFolderId as string) : undefined;
      }
      if (patch.linkOfDay !== undefined) {
        const id = typeof patch.linkOfDay === "string" ? patch.linkOfDay : "";
        s.linkOfDay = id && data.folders.some((f) => f.links.some((l) => l.id === id))
          ? { linkId: id, day: new Date().toISOString().slice(0, 10) } : undefined;
      }
      if (patch.challenge !== undefined) {
        const c = patch.challenge as Record<string, unknown> | null;
        const title = c && typeof c.title === "string" ? c.title.trim().slice(0, 100) : "";
        s.challenge = title ? {
          title,
          text: typeof c!.text === "string" ? c!.text.trim().slice(0, 300) || undefined : undefined,
          round: typeof c!.round === "string" && c!.round.trim() ? c!.round.trim().slice(0, 40) : new Date().toISOString().slice(0, 10),
          endsAt: typeof c!.endsAt === "string" && Number.isFinite(Date.parse(c!.endsAt)) ? new Date(c!.endsAt).toISOString() : undefined,
        } : undefined;
      }
      // look
      const themeCode = (v: unknown) => (typeof v === "string" && /^TB1\.[A-Za-z0-9_-]{2,600}$/.test(v) ? v : undefined);
      if (patch.defaultTheme !== undefined) s.defaultTheme = themeCode(patch.defaultTheme);
      if (patch.defaultDesign !== undefined) s.defaultDesign = typeof patch.defaultDesign === "string" && /^[a-z0-9]{8}$/.test(patch.defaultDesign) ? patch.defaultDesign : undefined;
      if (patch.themeOfMonth !== undefined) {
        const t = patch.themeOfMonth as Record<string, unknown> | null;
        const code = themeCode(t?.code);
        s.themeOfMonth = code ? { code, name: String(t?.name || "Theme of the month").trim().slice(0, 40) || "Theme of the month" } : undefined;
      }
      if (typeof patch.aprilFools === "boolean") s.aprilFools = patch.aprilFools || undefined;
      if (typeof patch.siteBirthday === "string") s.siteBirthday = /^\d{4}-\d{2}-\d{2}$/.test(patch.siteBirthday) ? patch.siteBirthday : undefined;
      applyAdminSettings(s, patch);
      await setFlags({
        maintenance: s.maintenance, maintenanceMessage: s.maintenanceMessage, signups: s.signups, approveLinks: s.approveLinks,
        newAccountWait: s.newAccountWait, rateScale: s.rateScale, blockedNames: s.blockedNames, wordFilter: s.wordFilter,
        modPerms: s.modPerms, betaFlags: s.betaFlags, pollsEnabled: s.pollsEnabled, suggestionsEnabled: s.suggestionsEnabled,
        communityEnabled: s.communityEnabled,
      });
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
      const { folder, index } = findLink(data, String(body.folderId || ""), String(body.linkId || ""));
      await requireFolderEditor(folder);
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
      const trashed: { kind: "link"; by?: string; folderId: string; folderName: string; item: Link }[] = [];
      for (const f of data.folders) {
        const before = f.links.length;
        f.links.filter((l) => ids.has(l.id)).forEach((l) => trashed.push({ kind: "link", by: me, folderId: f.id, folderName: f.name, item: l }));
        f.links = f.links.filter((l) => !ids.has(l.id));
        removed += before - f.links.length;
      }
      pushActivity(data, "delete", `Deleted ${removed} links`);
      await saveBookmarks(data);
      await addToTrash(trashed).catch(() => {});
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
      if (dst.rule) throw new Error("Smart folders fill themselves — pick a normal folder");
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
      const { folder: src, index } = findLink(data, String(body.folderId || ""), String(body.linkId || ""));
      const dst = findFolder(body.targetFolderId);
      // maintainers can reorder inside their folder; moving between folders needs both
      await requireFolderEditor(src);
      await requireFolderEditor(dst);
      if (dst.rule) throw new Error("Smart folders fill themselves — pick a normal folder");
      const [link] = src.links.splice(index, 1);
      const before = body.beforeLinkId ? dst.links.findIndex((l) => l.id === String(body.beforeLinkId)) : -1;
      if (before < 0) dst.links.push(link);
      else dst.links.splice(before, 0, link);
      if (src !== dst) log("move", `Moved “${link.name}” to “${dst.name}”`, dst.id);
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
    case "importCsv": {
      // rows of name, url, folder, tags — into folders by name (new ones are created)
      requireAdmin(password);
      const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]).slice(0, 2000) : [];
      const have = new Set(data.folders.flatMap((f) => f.links.map((l) => l.url)));
      let added = 0, made = 0;
      for (const r of rows) {
        let url = "";
        try { url = cleanUrl(r.url); } catch { continue; }
        if (!url || have.has(url)) continue;
        const folderName = cleanName(r.folder, 60) || "Imported";
        let folder = data.folders.find((f) => f.name.toLowerCase() === folderName.toLowerCase() && !f.rule);
        if (!folder) {
          folder = { id: uuid(), name: folderName, emoji: "📥", links: [], createdAt: new Date().toISOString() };
          data.folders.push(folder);
          made++;
        }
        folder.links.push({ id: uuid(), name: cleanName(r.name) || url, url, tags: cleanTags(r.tags), clicks: 0, createdAt: new Date().toISOString(), addedBy: me });
        have.add(url);
        added++;
      }
      if (!added) throw new Error("No new links in that file (they may already be on the site)");
      pushActivity(data, "import", `Imported ${added} links from a spreadsheet${made ? ` (${made} new folders)` : ""}`);
      await saveBookmarks(data);
      return data;
    }
    case "mergeDuplicates": {
      // the same address in several places: keep the oldest, fold the rest into it
      requireAdmin(password);
      const key = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
      const seen = new Map<string, { folder: Folder; link: Link }>();
      const trashed: { kind: "link"; by?: string; folderId: string; folderName: string; item: Link }[] = [];
      let merged = 0;
      const ordered = data.folders.flatMap((f) => f.links.map((l) => ({ folder: f, link: l })))
        .sort((a, b) => (a.link.createdAt || "").localeCompare(b.link.createdAt || ""));
      const drop = new Set<string>();
      for (const { folder, link } of ordered) {
        const k = key(link.url);
        const keep = seen.get(k);
        if (!keep) { seen.set(k, { folder, link }); continue; }
        // keep the extra info: tags, likes, and show it in the other folder too
        keep.link.tags = Array.from(new Set([...(keep.link.tags || []), ...(link.tags || [])])).slice(0, 8);
        keep.link.likes = Array.from(new Set([...(keep.link.likes || []), ...(link.likes || [])]));
        if (folder.id !== keep.folder.id) keep.link.alsoIn = Array.from(new Set([...(keep.link.alsoIn || []), folder.id])).slice(0, 5);
        keep.link.notes ||= link.notes;
        drop.add(link.id);
        trashed.push({ kind: "link", by: me, folderId: folder.id, folderName: folder.name, item: link });
        merged++;
      }
      if (!merged) throw new Error("No duplicates found");
      data.folders.forEach((f) => { f.links = f.links.filter((l) => !drop.has(l.id)); });
      pushActivity(data, "edit", `Merged ${merged} duplicate link${merged === 1 ? "" : "s"}`);
      await saveBookmarks(data);
      await addToTrash(trashed).catch(() => {});
      return data;
    }
    case "healthFix": {
      requireAdmin(password);
      const fix = String(body.fix || "");
      const ids = new Set(data.folders.map((f) => f.id));
      const used = new Set(data.folders.flatMap((f) => f.links.flatMap((l) => l.tags || [])));
      let n = 0;
      if (fix === "emptyFolders") {
        const empty = data.folders.filter((f) => !f.links.length && !f.rule && !data.folders.some((c) => c.parentId === f.id));
        n = empty.length;
        data.folders = data.folders.filter((f) => !empty.includes(f));
      } else if (fix === "unusedTags") {
        const colors = { ...(data.settings?.tagColors || {}) };
        for (const t of Object.keys(colors)) if (!used.has(t)) { delete colors[t]; n++; }
        if (data.settings) data.settings.tagColors = Object.keys(colors).length ? colors : undefined;
      } else if (fix === "orphans") {
        for (const f of data.folders) {
          if (f.parentId && !ids.has(f.parentId)) { f.parentId = undefined; n++; }
          for (const l of f.links) {
            if (l.alsoIn?.some((id) => !ids.has(id))) { l.alsoIn = l.alsoIn.filter((id) => ids.has(id)); if (!l.alsoIn.length) l.alsoIn = undefined; n++; }
          }
        }
        const s = data.settings;
        if (s?.startFolderId && !ids.has(s.startFolderId)) { s.startFolderId = undefined; n++; }
        if (s?.featuredFolderId && !ids.has(s.featuredFolderId)) { s.featuredFolderId = undefined; n++; }
      } else throw new Error("Unknown fix");
      if (!n) throw new Error("Nothing to fix");
      pushActivity(data, "edit", `Health check: fixed ${n} item${n === 1 ? "" : "s"}`);
      await saveBookmarks(data);
      return data;
    }
    case "httpsUpgrade": {
      // switch chosen http:// links to https:// (the link checker says which work)
      requireAdmin(password);
      const want = new Set(Array.isArray(body.linkIds) ? body.linkIds.map(String) : []);
      let n = 0;
      for (const f of data.folders) for (const l of f.links) {
        if (l.url.startsWith("http://") && (!want.size || want.has(l.id))) { l.url = l.url.replace(/^http:/, "https:"); l.updatedAt = new Date().toISOString(); n++; }
      }
      if (!n) throw new Error("No http:// links to switch");
      pushActivity(data, "edit", `Switched ${n} link${n === 1 ? "" : "s"} to https`);
      await saveBookmarks(data);
      return data;
    }
    case "setLinkStatuses": {
      // from the link checker: mark links as working or broken in one go
      requireAdmin(password);
      const map = (body.statuses || {}) as Record<string, unknown>;
      let n = 0;
      for (const f of data.folders) for (const l of f.links) {
        const st = map[l.id];
        if (st === "broken" || st === "works") { l.status = st; n++; }
      }
      pushActivity(data, "edit", `Link check: updated ${n} link${n === 1 ? "" : "s"}`);
      await saveBookmarks(data, { snapshot: false });
      return data;
    }
    case "restoreBackup": {
      requireAdmin(password);
      if (String(body.confirm || "").toUpperCase() !== "RESTORE") throw new Error("Type RESTORE to confirm");
      const backup = await getBackup(String(body.day || ""));
      if (!backup) throw new Error("That backup has expired");
      const restored = normalize(backup);
      pushActivity(restored, "restore", `Restored the backup from ${body.day}`);
      await saveBookmarks(restored);
      return restored;
    }
    case "replaceUrls": {
      // find & replace across every link address (admins preview the matches first in the panel)
      requireAdmin(password);
      const find = String(body.find || "");
      const replace = String(body.replace ?? "");
      if (find.length < 3) throw new Error("Type at least 3 characters to find");
      let changed = 0;
      for (const f of data.folders) {
        for (const l of f.links) {
          if (!l.url.includes(find)) continue;
          const next = l.url.split(find).join(replace);
          try { l.url = cleanUrl(next); changed++; l.updatedAt = new Date().toISOString(); } catch { /* skip results that aren't valid links */ }
        }
      }
      if (!changed) throw new Error("No links matched");
      pushActivity(data, "edit", `Replaced “${find}” with “${replace}” in ${changed} links`);
      await saveBookmarks(data);
      return data;
    }
    case "restoreLink": {
      // "Undo" after deleting a link: anyone who could delete it can put it back
      const linkId = String(body.linkId || "");
      const t = (await listTrash()).find((x) => x.kind === "link" && (x.item as Link)?.id === linkId);
      if (!t) throw new Error("That's no longer in the trash");
      const folder = data.folders.find((f) => f.id === t.folderId);
      if (!folder) throw new Error("Its folder is gone — an admin can bring it back from the trash");
      const link = t.item as Link;
      if (!(me && t.by?.toLowerCase() === me.toLowerCase() && link.addedBy?.toLowerCase() === me.toLowerCase())) await requireFolderEditor(folder);
      if (data.folders.some((f) => f.links.some((l) => l.id === link.id))) throw new Error("It's already back");
      await takeFromTrash(t.id);
      folder.links.splice(typeof t.index === "number" && t.index >= 0 ? Math.min(t.index, folder.links.length) : folder.links.length, 0, link);
      log("restore", `Put back “${link.name}”`, folder.id);
      await saveBookmarks(data);
      return data;
    }
    case "restoreTrash": {
      requireAdmin(password);
      const t = await takeFromTrash(String(body.id || ""));
      if (!t) throw new Error("That's no longer in the trash");
      if (t.kind === "folder") {
        const folder = t.item as Folder;
        if (data.folders.some((f) => f.id === folder.id)) folder.id = uuid();
        data.folders.push(folder);
        pushActivity(data, "restore", `Restored folder “${folder.name}”`);
      } else {
        const link = t.item as Link;
        const folder = data.folders.find((f) => f.id === t.folderId) || data.folders[0];
        if (!folder) throw new Error("Make a folder first, then restore");
        if (data.folders.some((f) => f.links.some((l) => l.id === link.id))) link.id = uuid();
        folder.links.push(link);
        pushActivity(data, "restore", `Restored “${link.name}” to ${folder.name}`, { folderId: folder.id });
      }
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

/** Moderation and site-control settings from the admin panel. */
function applyAdminSettings(s: NonNullable<BookmarksData["settings"]>, patch: Record<string, unknown>) {
  const bool = (k: "maintenance" | "approveLinks" | "newAccountWait") => { if (typeof patch[k] === "boolean") s[k] = (patch[k] as boolean) || undefined; };
  bool("maintenance"); bool("approveLinks"); bool("newAccountWait");
  for (const k of ["pollsEnabled", "suggestionsEnabled", "communityEnabled"] as const) {
    if (typeof patch[k] === "boolean") s[k] = patch[k] === false ? false : undefined;
  }
  if (typeof patch.maintenanceMessage === "string") s.maintenanceMessage = patch.maintenanceMessage.trim().slice(0, 200) || undefined;
  if (patch.signups === "open" || patch.signups === "closed" || patch.signups === "invite") s.signups = patch.signups === "open" ? undefined : patch.signups;
  if (typeof patch.rateScale === "number" && Number.isFinite(patch.rateScale)) s.rateScale = Math.max(0.25, Math.min(5, patch.rateScale)) === 1 ? undefined : Math.max(0.25, Math.min(5, patch.rateScale));
  const words = (v: unknown, max: number) => Array.from(new Set((Array.isArray(v) ? v : String(v || "").split(/[\n,]/)).map((x) => String(x).trim().toLowerCase()).filter(Boolean))).slice(0, max).map((x) => x.slice(0, 30));
  if (patch.blockedNames !== undefined) { const l = words(patch.blockedNames, 200); s.blockedNames = l.length ? l : undefined; }
  if (patch.wordFilter !== undefined) { const l = words(patch.wordFilter, 200); s.wordFilter = l.length ? l : undefined; }
  if (patch.betaFlags !== undefined) { const l = words(patch.betaFlags, 20).filter((x) => ["tools", "community", "wiki"].includes(x)); s.betaFlags = l.length ? l : undefined; }
  if (patch.modPerms && typeof patch.modPerms === "object") {
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(patch.modPerms as Record<string, unknown>)) if (/^[a-zA-Z]{2,20}$/.test(k) && v === false) out[k] = false;
    s.modPerms = Object.keys(out).length ? out : undefined;
  }
  if (Array.isArray(patch.rejectReasons)) {
    const l = patch.rejectReasons.map((x) => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 15);
    s.rejectReasons = l.length ? l : undefined;
  }
  if (Array.isArray(patch.approveTemplates)) {
    const l = (patch.approveTemplates as Record<string, unknown>[]).slice(0, 15).map((t) => ({
      name: String(t?.name || "").trim().slice(0, 40), folderId: String(t?.folderId || ""), tags: cleanTags(t?.tags),
    })).filter((t) => t.name && t.folderId);
    s.approveTemplates = l.length ? l : undefined;
  }
  for (const k of ["announceFrom", "announceUntil"] as const) if (typeof patch[k] === "string") s[k] = cleanDate(patch[k] as string);
  if (typeof patch.rules === "string") s.rules = patch.rules.trim().slice(0, 5000) || undefined;
}

/**
 * What one visitor is allowed to see: guests don't get members-only folders,
 * and nobody but admins sees links or folders scheduled for later.
 */
export function viewFor(data: BookmarksData, viewer: { admin: boolean; member: boolean }): BookmarksData {
  if (viewer.admin) return data;
  const now = Date.now();
  const live = (iso?: string) => !iso || Date.parse(iso) <= now;
  const folders = data.folders
    .filter((f) => live(f.showAt) && (viewer.member || f.perm?.view !== "members"))
    .map((f) => (f.links.some((l) => !live(l.showAt)) ? { ...f, links: f.links.filter((l) => live(l.showAt)) } : f));
  if (viewer.member) return { ...data, folders };
  // people who aren't logged in don't see who added, liked or voted for things
  const anon = (n: number) => Array.from({ length: n }, (_, i) => `#${i}`);
  return {
    ...data,
    folders: folders.map((f) => ({
      ...f,
      maintainers: undefined,
      links: f.links.map((l) => ({
        ...l, addedBy: undefined, likes: l.likes ? anon(l.likes.length) : l.likes,
        communityNotes: l.communityNotes?.map((n) => ({ ...n, by: "" })),
      })),
    })),
    activity: (data.activity || []).map((a) => ({ ...a, by: undefined, detail: a.detail.replace(/ \(suggested by [^)]*\)/, "") })),
    polls: (data.polls || []).map((p) => ({ ...p, votes: Object.fromEntries(Object.values(p.votes).map((v, i) => [`#${i}`, v])) })),
  };
}

/** One visit: a single HINCRBY instead of read-modify-write of the whole list. */
export async function trackClick(linkId: string) {
  if (!/^[\w-]{1,100}$/.test(linkId)) return;
  await getRedis().hincrby(CLICKS_KEY, linkId, 1);
}
