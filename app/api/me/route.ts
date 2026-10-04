import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE, accountInfo, changePassword, checkOwnPassword, confirmTotp, disableTotp, getCurrentUser, listSessions,
  loginHistory, logoutEverywhere, regenerateRecoveryCode, revokeSession, startTotp,
} from "@/lib/auth";
import { deleteAccount, exportAccount, renameAccount } from "@/lib/account";
import { normalizeUrl } from "@/lib/url";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { follow, getFollowing, giveKudos, setHideOnline } from "@/lib/social";
import { addPushSub, hasPush, pushConfigured, pushPublicKey, removePushSub } from "@/lib/push";
import {
  clearNotifications, setDnd, setNotifyPrefs,
  addMyStuff, getUserData, importMyStuff, markNotificationsRead, moveMyStuff, recordAggregateRating, removeMyStuff, renameMyStuffFolder,
  deleteView, importPersonal, saveMessage, saveSettings, saveView, setBlocked, setFolderOrder, setFolderPref, setLinkPref, setProfile, setRating, toggleFavorite,
} from "@/lib/userdata";
import { Redis } from "@upstash/redis";
import { followersKey } from "@/lib/store";
import { listUsers } from "@/lib/auth";
import { cookies } from "next/headers";
import { getRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });
  const params = req.nextUrl.searchParams;
  if (params.get("export")) {
    // "Download my data"
    const body = JSON.stringify(await exportAccount(user), null, 2);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="theos-bookmarks-${user}-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (params.get("account")) {
    // the Account & security screen
    const [info, sessions, logins] = await Promise.all([accountInfo(user), listSessions(user), loginHistory(user)]);
    return NextResponse.json({ ...info, sessions, logins });
  }
  const [data, following, push, role] = await Promise.all([getUserData(user), getFollowing(user), hasPush(user), getRole(user)]);
  return NextResponse.json({ user, role, ...data, following, push, pushKey: pushConfigured() ? pushPublicKey() : null });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Log in first" }, { status: 401 });
    await rateLimit(`me:${user.toLowerCase()}`, 120, 60);
    const body = await req.json();
    switch (String(body.action || "")) {
      case "profile": {
        const profile = await setProfile(user, body.profile || {});
        if (typeof body.profile?.hideOnline === "boolean") await setHideOnline(user, !!profile.hideOnline);
        return NextResponse.json({ profile });
      }
      case "settings":
        return NextResponse.json({ settings: await saveSettings(user, (body.settings || {}) as Record<string, unknown>) });
      case "favorite":
        return NextResponse.json({ favorites: await toggleFavorite(user, String(body.linkId || "")) });
      case "rate": {
        const linkId = String(body.linkId || "");
        const stars = Number(body.stars);
        const before = (await getUserData(user)).ratings[linkId];
        const ratings = await setRating(user, linkId, stars);
        await recordAggregateRating(linkId, before, ratings[linkId]);
        return NextResponse.json({ ratings });
      }

      /* ---------- My Stuff (private links) ---------- */
      case "addMyStuff": {
        const name = String(body.name || "").trim();
        const url = normalizeUrl(String(body.url || ""));
        if (!name || !url) throw new Error("Add a name and a link");
        return NextResponse.json({ myStuff: await addMyStuff(user, name, url, typeof body.folder === "string" ? body.folder : undefined) });
      }
      case "removeMyStuff":
        return NextResponse.json({ myStuff: await removeMyStuff(user, String(body.id || "")) });
      case "moveMyStuff":
        return NextResponse.json({ myStuff: await moveMyStuff(user, String(body.id || ""), String(body.folder || "")) });
      case "renameMyStuffFolder":
        return NextResponse.json({ myStuff: await renameMyStuffFolder(user, String(body.from || ""), String(body.to || "")) });
      case "importPersonal": {
        // a "Download my data" file from this site
        await rateLimit(`import:${user.toLowerCase()}`, 5, 60);
        const counts = await importPersonal(user, (body.file || {}) as Record<string, unknown>);
        return NextResponse.json({ imported: counts, ...(await getUserData(user)) });
      }
      case "importMyStuff": {
        // a browser bookmarks file, already read into {name, url, folder} by the page
        const items: { name: string; url: string; folder?: string }[] = [];
        for (const it of (Array.isArray(body.items) ? body.items : []).slice(0, 500) as Record<string, unknown>[]) {
          try {
            const url = normalizeUrl(String(it.url || ""));
            if (url) items.push({ name: String(it.name || url).trim() || url, url, folder: typeof it.folder === "string" ? it.folder : undefined });
          } catch {
            // skip javascript:, chrome:// and other non-web bookmarks
          }
        }
        return NextResponse.json(await importMyStuff(user, items));
      }

      /* ---------- folders, links, views ---------- */
      case "folderPref": {
        const folderId = String(body.folderId || "");
        const patch = (body.patch || {}) as Record<string, unknown>;
        const folders = await setFolderPref(user, folderId, patch);
        // followers are also kept in a set per folder, so adding a link can notify them cheaply
        if (typeof patch.follow === "boolean") {
          const redis = Redis.fromEnv();
          if (patch.follow) await redis.sadd(followersKey(folderId), user.toLowerCase());
          else await redis.srem(followersKey(folderId), user.toLowerCase());
        }
        return NextResponse.json({ folders });
      }
      case "folderOrder":
        return NextResponse.json({ folderOrder: await setFolderOrder(user, body.order) });
      case "saveView":
        return NextResponse.json({ views: await saveView(user, (body.view || {}) as Record<string, unknown>) });
      case "deleteView":
        return NextResponse.json({ views: await deleteView(user, String(body.id || "")) });
      case "linkPref":
        return NextResponse.json({ links: await setLinkPref(user, String(body.linkId || ""), (body.patch || {}) as Record<string, unknown>) });
      case "readNotifications":
        return NextResponse.json({ ok: true, notifications: await markNotificationsRead(user, typeof body.id === "string" ? body.id : undefined) });
      case "clearNotifications":
        return NextResponse.json({ notifications: await clearNotifications(user, typeof body.id === "string" ? body.id : undefined) });
      case "notifyPrefs":
        return NextResponse.json({ notifyPrefs: await setNotifyPrefs(user, (body.prefs || {}) as Record<string, unknown>) });
      case "dnd":
        return NextResponse.json({ dndUntil: await setDnd(user, typeof body.until === "string" ? body.until : null) });
      case "pushSubscribe":
        if (!pushConfigured()) throw new Error("Push notifications aren't set up on this site yet");
        await addPushSub(user, body.subscription);
        return NextResponse.json({ push: true });
      case "pushUnsubscribe":
        await removePushSub(user, String(body.endpoint || ""));
        return NextResponse.json({ push: await hasPush(user) });

      /* ---------- people ---------- */
      case "follow": {
        const target = String(body.username || "");
        if (!(await listUsers()).some((u) => u.username.toLowerCase() === target.toLowerCase())) throw new Error("No such account");
        await follow(user, target, body.on !== false);
        return NextResponse.json({ following: await getFollowing(user) });
      }
      case "kudos": {
        const target = String(body.username || "");
        if (!(await listUsers()).some((u) => u.username.toLowerCase() === target.toLowerCase())) throw new Error("No such account");
        return NextResponse.json(await giveKudos(user, target));
      }
      case "saveMessage":
        return NextResponse.json({ savedMessages: await saveMessage(user, (body.message || {}) as Record<string, unknown>, body.on !== false) });
      case "block":
        return NextResponse.json({ blocked: await setBlocked(user, String(body.username || ""), body.on !== false) });

      /* ---------- security ---------- */
      case "changePassword": {
        const signedOut = await changePassword(user, String(body.oldPassword || ""), String(body.newPassword || ""));
        return NextResponse.json({ ok: true, signedOut });
      }
      case "newRecoveryCode":
        await checkOwnPassword(user, String(body.password || ""));
        return NextResponse.json({ recoveryCode: await regenerateRecoveryCode(user) });
      case "revokeSession":
        await revokeSession(user, String(body.id || ""));
        return NextResponse.json({ sessions: await listSessions(user) });
      case "logoutEverywhere": {
        const ended = await logoutEverywhere(user, body.keepThis !== false);
        if (body.keepThis === false) cookies().delete(SESSION_COOKIE);
        return NextResponse.json({ ended, sessions: body.keepThis === false ? [] : await listSessions(user) });
      }
      case "startTotp":
        await checkOwnPassword(user, String(body.password || ""));
        return NextResponse.json(await startTotp(user));
      case "confirmTotp":
        await confirmTotp(user, String(body.code || ""));
        return NextResponse.json({ twoStep: true });
      case "disableTotp":
        await disableTotp(user, String(body.password || ""));
        return NextResponse.json({ twoStep: false });
      case "rename": {
        const name = await renameAccount(user, String(body.newName || "").trim(), String(body.password || ""));
        return NextResponse.json({ user: name });
      }
      case "deleteAccount":
        await deleteAccount(user, String(body.password || ""));
        cookies().delete(SESSION_COOKIE);
        return NextResponse.json({ deleted: true });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
