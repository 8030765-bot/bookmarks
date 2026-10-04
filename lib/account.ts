import { Redis } from "@upstash/redis";
import { accountInfo, checkOwnPassword, deleteUser, listSessions, loginHistory, renameUserRecord } from "./auth";
import { getRole, setRole } from "./roles";
import { deleteSocial, fansKey, followingKey, renameSocial } from "./social";
import { followersKey, getBookmarks, saveBookmarks } from "./store";
import { deleteUserData, getUserData, renameUserData } from "./userdata";
import { deletePushSubs } from "./push";
import { deleteToolData, getToolData, removeTyping, renameToolData } from "./tools";
import { checkNameAllowed, recordRename } from "./moderation";

/**
 * Account-wide changes that touch several stores at once: changing your
 * username, deleting your account, and downloading everything about you.
 */
const BANNED_KEY = "chat:banned";

export async function renameAccount(oldName: string, newName: string, password: string) {
  await checkNameAllowed(newName);
  const moved = await renameUserRecord(oldName, newName, password);
  await recordRename(oldName, moved.username).catch(() => {});
  const a = oldName.toLowerCase();
  const b = moved.username.toLowerCase();
  const redis = Redis.fromEnv();
  if (a !== b) {
    await renameUserData(oldName, moved.username);
    await renameSocial(oldName, moved.username);
    await renameToolData(oldName, moved.username);
    await removeTyping(oldName);
    const role = await getRole(oldName);
    if (role) { await setRole(moved.username, role); await setRole(oldName, null); }
    const ud = await getUserData(moved.username);
    for (const [folderId, pref] of Object.entries(ud.folders)) {
      if (!pref.follow) continue;
      await redis.srem(followersKey(folderId), a);
      await redis.sadd(followersKey(folderId), b);
    }
    if (await redis.sismember(BANNED_KEY, a)) { await redis.srem(BANNED_KEY, a); await redis.sadd(BANNED_KEY, b); }
  }
  // credit, likes, maintainers and poll votes follow the new name
  const data = await getBookmarks();
  let touched = false;
  for (const f of data.folders) {
    if (f.maintainers?.includes(a)) { f.maintainers = f.maintainers.map((m) => (m === a ? b : m)); touched = true; }
    for (const l of f.links) {
      if (l.addedBy?.toLowerCase() === a) { l.addedBy = moved.username; touched = true; }
      if (l.likes?.includes(a)) { l.likes = l.likes.map((x) => (x === a ? b : x)); touched = true; }
    }
  }
  for (const p of data.polls || []) {
    if (a in p.votes && a !== b) { p.votes[b] = p.votes[a]; delete p.votes[a]; touched = true; }
    // anonymous answers are kept apart from the list
    if (p.anonymous && a !== b) {
      const v = await redis.hget(`pollvotes:${p.id}`, a);
      if (v !== null && v !== undefined) { await redis.hset(`pollvotes:${p.id}`, { [b]: v }); await redis.hdel(`pollvotes:${p.id}`, a); }
    }
  }
  if (touched) await saveBookmarks(data, { snapshot: false });
  return moved.username;
}

export async function deleteAccount(username: string, password: string) {
  await checkOwnPassword(username, password);
  await purgeAccount(username);
}

/** Remove an account and everything kept about it (used by "delete my account" and by admins). */
export async function purgeAccount(username: string) {
  if ((await getRole(username)) === "owner") throw new Error("Hand ownership to someone else before deleting the owner account");
  const redis = Redis.fromEnv();
  const ud = await getUserData(username);
  for (const [folderId, pref] of Object.entries(ud.folders)) if (pref.follow) await redis.srem(followersKey(folderId), username.toLowerCase());
  await deleteSocial(username);
  await setRole(username, null);
  await redis.srem(BANNED_KEY, username.toLowerCase());
  await deleteUserData(username);
  await deleteToolData(username);
  await removeTyping(username);
  await deletePushSubs(username);
  await deleteUser(username);
}

/** Everything the site stores about you, as one JSON file. */
export async function exportAccount(username: string) {
  const redis = Redis.fromEnv();
  const [info, data, sessions, logins, following, fans, tools] = await Promise.all([
    accountInfo(username), getUserData(username), listSessions(username), loginHistory(username),
    redis.smembers(followingKey(username)), redis.smembers(fansKey(username)), getToolData(username),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: info,
    profile: data.profile,
    favorites: data.favorites,
    ratings: data.ratings,
    myStuff: data.myStuff,
    linkNotes: data.links,
    folderSettings: data.folders,
    folderOrder: data.folderOrder,
    savedViews: data.views,
    settings: data.settings,
    blocked: data.blocked,
    notifications: data.notifications,
    tools,
    following,
    followers: fans,
    activeLogins: sessions,
    loginHistory: logins,
  };
}
