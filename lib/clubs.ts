import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { Club } from "./types";
import { removeChannel, saveChannel } from "./chat";
import { getBookmarks, saveBookmarks } from "./store";
import { notify } from "./userdata";

/**
 * Clubs: a group of members with their own shared folder (which members
 * can edit) and their own chat channel (members + moderators can read it).
 */
const CLUBS_KEY = "clubs"; // hash: id -> Club
const MAX_OWNED = 3;
const MAX_MEMBERS = 100;

function getRedis() {
  return Redis.fromEnv();
}

export const clubChannelId = (club: Pick<Club, "id">) => `club-${club.id}`;

export async function listClubs(): Promise<Club[]> {
  const raw = (await getRedis().hgetall<Record<string, Club>>(CLUBS_KEY)) || {};
  return Object.values(raw).sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
}
export async function getClub(id: string): Promise<Club | null> {
  if (!/^[a-z0-9]{1,20}$/.test(id)) return null;
  return getRedis().hget<Club>(CLUBS_KEY, id);
}
async function saveClub(c: Club) {
  await getRedis().hset(CLUBS_KEY, { [c.id]: c });
}
export function isMember(club: Club | null, user: string | null | undefined) {
  return !!club && !!user && club.members.includes(user.toLowerCase());
}

export async function createClub(owner: string, input: { name?: unknown; emoji?: unknown; description?: unknown; open?: unknown }) {
  const name = String(input.name || "").trim().slice(0, 30);
  if (name.length < 2) throw new Error("Give the club a name");
  const all = await listClubs();
  if (all.filter((c) => c.owner === owner.toLowerCase()).length >= MAX_OWNED) throw new Error(`You can run up to ${MAX_OWNED} clubs`);
  if (all.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error("There's already a club with that name");
  const club: Club = {
    id: uuid().replace(/-/g, "").slice(0, 10),
    name,
    emoji: String(input.emoji || "🏷️").trim().slice(0, 8) || "🏷️",
    description: String(input.description || "").trim().slice(0, 200) || undefined,
    owner: owner.toLowerCase(),
    members: [owner.toLowerCase()],
    open: input.open !== false,
    createdAt: new Date().toISOString(),
  };
  // the club's folder (members can edit it) and channel
  const data = await getBookmarks();
  const folderId = uuid();
  data.folders.push({ id: folderId, name: `${name}`, emoji: club.emoji, links: [], clubId: club.id, space: "Clubs", description: club.description, createdAt: club.createdAt });
  await saveBookmarks(data);
  club.folderId = folderId;
  await saveClub(club);
  await saveChannel({ id: clubChannelId(club), name: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || club.id, emoji: club.emoji, topic: club.description, clubId: club.id, createdAt: club.createdAt });
  return club;
}

export async function joinClub(user: string, id: string) {
  const club = await getClub(id);
  if (!club) throw new Error("Club not found");
  if (!club.open) throw new Error("This club is invite-only — ask its owner to add you");
  if (club.members.length >= MAX_MEMBERS) throw new Error("This club is full");
  if (!isMember(club, user)) club.members.push(user.toLowerCase());
  await saveClub(club);
  return club;
}

export async function leaveClub(user: string, id: string) {
  const club = await getClub(id);
  if (!club) throw new Error("Club not found");
  if (club.owner === user.toLowerCase()) throw new Error("You run this club — hand it over or delete it instead");
  club.members = club.members.filter((m) => m !== user.toLowerCase());
  await saveClub(club);
  return club;
}

/** The owner (or staff) adds or removes someone. */
export async function setMember(actor: string, staff: boolean, id: string, username: string, on: boolean) {
  const club = await getClub(id);
  if (!club) throw new Error("Club not found");
  if (!staff && club.owner !== actor.toLowerCase()) throw new Error("Only the club's owner can do that");
  const u = username.toLowerCase();
  if (on) {
    if (club.members.length >= MAX_MEMBERS) throw new Error("This club is full");
    if (!club.members.includes(u)) {
      club.members.push(u);
      notify(u, { kind: "system", from: actor, text: `${actor} added you to the club ${club.emoji} ${club.name}`, link: `/?chat=open&ch=${clubChannelId(club)}` }).catch(() => {});
    }
  } else {
    if (u === club.owner) throw new Error("The owner can't be removed");
    club.members = club.members.filter((m) => m !== u);
  }
  await saveClub(club);
  return club;
}

export async function editClub(actor: string, staff: boolean, id: string, patch: { name?: unknown; emoji?: unknown; description?: unknown; open?: unknown; owner?: unknown }) {
  const club = await getClub(id);
  if (!club) throw new Error("Club not found");
  if (!staff && club.owner !== actor.toLowerCase()) throw new Error("Only the club's owner can do that");
  if (typeof patch.name === "string" && patch.name.trim().length >= 2) club.name = patch.name.trim().slice(0, 30);
  if (typeof patch.emoji === "string" && patch.emoji.trim()) club.emoji = patch.emoji.trim().slice(0, 8);
  if (typeof patch.description === "string") club.description = patch.description.trim().slice(0, 200) || undefined;
  if (typeof patch.open === "boolean") club.open = patch.open;
  if (typeof patch.owner === "string" && club.members.includes(patch.owner.toLowerCase())) club.owner = patch.owner.toLowerCase();
  await saveClub(club);
  return club;
}

/** Deleting a club removes its channel; its folder is kept but archived. */
export async function deleteClub(actor: string, staff: boolean, id: string) {
  const club = await getClub(id);
  if (!club) throw new Error("Club not found");
  if (!staff && club.owner !== actor.toLowerCase()) throw new Error("Only the club's owner can do that");
  await removeChannel(clubChannelId(club));
  const data = await getBookmarks();
  const folder = data.folders.find((f) => f.id === club.folderId);
  if (folder) {
    folder.clubId = undefined;
    folder.archived = true;
    await saveBookmarks(data);
  }
  await getRedis().hdel(CLUBS_KEY, id);
}
