import { NextRequest, NextResponse } from "next/server";
import { adminSetPassword, deleteUser, listUsers, rebuildUserIndex } from "@/lib/auth";
import { clearChat, getAllMessages, getBanned, setBanned } from "@/lib/chat";
import { getBookmarks, setCommunityNote, withClicks } from "@/lib/store";
import { approveSuggestion, deleteSuggestion, listSuggestions, rejectSuggestion, setStage } from "@/lib/suggestions";
import { allFlair, pendingNotes, setFlair, takeNote } from "@/lib/community";
import { notify } from "@/lib/userdata";
import {
  Role, audit, checkAdmin, checkMod, checkOwner, checkPassword, getAuthContext, listAudit, listRoles, setRole,
} from "@/lib/roles";
import { errorResponse } from "@/lib/http";
import { purgeAccount } from "@/lib/account";
import { logoutEverywhere } from "@/lib/auth";
import { Redis } from "@upstash/redis";
import {
  MOD_PERMS, addModNote, adminLinkNotes, allModNoteCounts, clearErrors, clearTimeoutFor, createInvite, deleteAdminBoard, deleteInvite,
  deleteModNote, emptyTrash, getStats, getTimeouts, listAdminBoard, listErrors, listFrozen, listGroup, listInvites, listReports, listTrash,
  lastSeenRaw, logMod, modCan, modHistory, modNotes, nameHistory, resolveReport, saveAdminBoard, setAdminLinkNote, setFrozen, setGroup,
  setTimeoutFor, warnUser,
} from "@/lib/moderation";
import { getRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** How many things are waiting for staff (for the badge on the Admin button). */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!(ctx.role === "owner" || ctx.role === "admin" || ctx.role === "mod")) return NextResponse.json({ count: 0 });
    const [suggestions, notes, reports] = await Promise.all([listSuggestions(), pendingNotes(), listReports()]);
    const pending = suggestions.filter((s) => s.status === "pending").length;
    return NextResponse.json({ count: pending + notes.length + reports.length, suggestions: pending, notes: notes.length, reports: reports.length });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}

/** A rough idea of how much of the free database the site is using. */
async function dbUsage(messageCount: number) {
  const redis = Redis.fromEnv();
  const [keys, blob] = await Promise.all([redis.dbsize().catch(() => 0), redis.get("bookmarks:shared").catch(() => null)]);
  const blobBytes = blob ? JSON.stringify(blob).length : 0;
  // ~300 bytes a chat message, ~2 KB per other key on average
  const approxBytes = blobBytes * 2 + messageCount * 300 + keys * 2000;
  return { keys, blobBytes, approxBytes, limitBytes: 256 * 1024 * 1024 };
}

// Accounts, roles, chat moderation, suggestions and the audit log.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "");
    const password = typeof body.password === "string" ? body.password : undefined;
    const ctx = await getAuthContext();
    const username = String(body.username || "");
    const log = (detail?: string) => audit(ctx, action, detail).catch(() => {});
    const me = ctx.user || "admin";
    /** Moderators can be limited per action (Admin → Access → What mods can do). */
    const checkModPerm = async (perm: string) => {
      checkMod(ctx, password);
      if (ctx.role === "mod" && !(await modCan(ctx.role, perm))) throw new Error("Admins only — moderators can't do that here");
    };
    /** Big, hard-to-undo actions must be confirmed by typing a word. */
    const confirmTyped = (word: string) => {
      if (String(body.confirm || "").trim().toUpperCase() !== word) throw new Error(`Type ${word} to confirm`);
    };

    // one-time setup: a logged-in account proves it knows ADMIN_PASSWORD and becomes the owner
    if (action === "claimOwner") {
      if (!ctx.user) throw new Error("Log in to your account first");
      if (ctx.ownerExists) throw new Error("This site already has an owner");
      // if OWNER_USERNAME is set, only that account may claim ownership (no race)
      const reserved = (process.env.OWNER_USERNAME || "").trim().toLowerCase();
      if (reserved && ctx.user.toLowerCase() !== reserved) {
        throw new Error(`Only the account "${process.env.OWNER_USERNAME}" can become the owner`);
      }
      checkPassword(password);
      await setRole(ctx.user, "owner");
      await audit({ ...ctx, role: "owner" }, "claimOwner", `${ctx.user} became the owner`);
      return NextResponse.json({ role: "owner" });
    }

    switch (action) {
      case "overview": {
        checkMod(ctx, password);
        const isAdmin = ctx.role === "owner" || ctx.role === "admin" || !ctx.ownerExists;
        const [users, messages, banned, suggestions, roles, auditLog, flair, notes] = await Promise.all([
          listUsers(), getAllMessages(), getBanned(), listSuggestions(), listRoles(), isAdmin ? listAudit() : Promise.resolve([]),
          allFlair(), pendingNotes(),
        ]);
        const [lastSeen, timeouts, frozen, contributors, beta, names, noteCounts, reports, board, stats] = await Promise.all([
          lastSeenRaw(), getTimeouts(), listFrozen(), listGroup("contributors"), listGroup("beta"), nameHistory(), allModNoteCounts(),
          listReports(), listAdminBoard(), getStats(14),
        ]);
        const adminOnly = isAdmin
          ? await Promise.all([listInvites(), listTrash(), listErrors(), adminLinkNotes(), dbUsage(messages.length)]).then(([invites, trash, errors, linkNotes, db]) => ({ invites, trash, errors, linkNotes, db }))
          : {};
        return NextResponse.json({
          users, banned, messageCount: messages.length, suggestions, roles, audit: auditLog, me: ctx, flair, notes,
          lastSeen, timeouts, frozen, contributors, beta, names, noteCounts, reports, board, stats, modPermList: MOD_PERMS,
          ...adminOnly,
        });
      }
      case "ban":
      case "unban":
        await checkModPerm("ban");
        if (!username) throw new Error("Missing username");
        await setBanned(username, action === "ban");
        await logMod(username, { action: action === "ban" ? "mute" : "unmute", by: me, reason: typeof body.reason === "string" ? body.reason : undefined });
        await log(`${username}${body.reason ? ` — ${String(body.reason).slice(0, 100)}` : ""}`);
        return NextResponse.json({ banned: await getBanned() });
      case "rebuildUsers": {
        checkAdmin(ctx, password);
        const found = await rebuildUserIndex();
        await log(`rebuilt user list (${found})`);
        return NextResponse.json({ users: await listUsers(), found });
      }
      case "resetPassword": {
        checkAdmin(ctx, password);
        if (!username) throw new Error("Missing username");
        const res = await adminSetPassword(username);
        await log(`reset password for ${username}`);
        return NextResponse.json(res);
      }
      case "deleteUser":
        checkAdmin(ctx, password);
        if (!username) throw new Error("Missing username");
        if ((await listRoles())[username.toLowerCase()] === "owner") throw new Error("The owner account can't be deleted");
        // full clean-up when the panel asks for it; the old quick delete still works
        if (body.purge) await purgeAccount(username);
        else await deleteUser(username);
        await setBanned(username, false);
        await setRole(username, null);
        await log(username);
        return NextResponse.json({ users: await listUsers() });
      case "setRole": {
        checkOwner(ctx);
        if (!username) throw new Error("Missing username");
        if (username.toLowerCase() === ctx.user?.toLowerCase()) throw new Error("You can't change your own role");
        const role = body.role === "admin" || body.role === "mod" ? (body.role as Role) : null;
        if (!(await listUsers()).some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new Error("No such account");
        await setRole(username, role);
        await log(`${username} → ${role || "member"}`);
        return NextResponse.json({ roles: await listRoles() });
      }
      case "transferOwner": {
        checkOwner(ctx);
        if (!username || username.toLowerCase() === ctx.user?.toLowerCase()) throw new Error("Pick another account");
        if (!(await listUsers()).some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new Error("No such account");
        await setRole(username, "owner");
        await setRole(ctx.user!, "admin");
        await log(`ownership → ${username}`);
        return NextResponse.json({ roles: await listRoles() });
      }
      case "clearChat":
        checkAdmin(ctx, password);
        confirmTyped("CLEAR");
        await clearChat();
        await log();
        return NextResponse.json({ messages: [] });
      case "approveSuggestion":
        checkAdmin(ctx, password);
        await approveSuggestion(String(body.id || ""), { password, __auth: ctx }, body.overrides || {});
        await log(String(body.id || ""));
        return NextResponse.json({ suggestions: await listSuggestions(), data: await withClicks(await getBookmarks()) });
      case "rejectSuggestion":
        await checkModPerm("suggestions");
        await rejectSuggestion(String(body.id || ""), body.reason);
        await log(String(body.id || ""));
        return NextResponse.json({ suggestions: await listSuggestions() });
      case "deleteSuggestion":
        checkMod(ctx, password);
        await deleteSuggestion(String(body.id || ""));
        return NextResponse.json({ suggestions: await listSuggestions() });
      case "setStage":
        await checkModPerm("suggestions");
        await setStage(String(body.id || ""), body.stage);
        await log(`${body.id} → ${body.stage || "none"}`);
        return NextResponse.json({ suggestions: await listSuggestions() });
      case "setFlair": {
        checkAdmin(ctx, password);
        if (!username) throw new Error("Missing username");
        if (!(await listUsers()).some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new Error("No such account");
        await setFlair(username, String(body.flair || ""));
        await log(`${username}: ${body.flair || "(none)"}`);
        return NextResponse.json({ flair: await allFlair() });
      }
      case "approveNote":
      case "rejectNote": {
        checkMod(ctx, password);
        const note = await takeNote(String(body.id || ""));
        if (note && action === "approveNote") {
          await setCommunityNote(note.linkId, { text: typeof body.text === "string" && body.text.trim() ? body.text : note.text, by: note.by });
          notify(note.by, { kind: "suggestion", text: `Your note on “${note.linkName}” is now showing`, link: `/#link-${note.linkId}` }).catch(() => {});
        }
        await log(note ? `${note.linkName}: ${note.text.slice(0, 80)}` : String(body.id || ""));
        return NextResponse.json({ notes: await pendingNotes(), data: await withClicks(await getBookmarks()) });
      }
      case "removeNote":
        checkMod(ctx, password);
        await setCommunityNote(String(body.linkId || ""), null, Number(body.index));
        await log(String(body.linkId || ""));
        return NextResponse.json({ data: await withClicks(await getBookmarks()) });
      /* ---------- moderation ---------- */
      case "userDetail": {
        checkMod(ctx, password);
        if (!username) throw new Error("Missing username");
        const [history, modNoteList, names, roleOf, contributor, beta] = await Promise.all([
          modHistory(username), modNotes(username), nameHistory(), getRole(username), listGroup("contributors"), listGroup("beta"),
        ]);
        return NextResponse.json({
          history, notes: modNoteList, previousNames: names[username.toLowerCase()] || [], role: roleOf,
          contributor: contributor.includes(username.toLowerCase()), beta: beta.includes(username.toLowerCase()),
        });
      }
      case "timeout": {
        await checkModPerm("ban");
        if (!username) throw new Error("Missing username");
        const until = await setTimeoutFor(username, Number(body.hours) || 1, me, typeof body.reason === "string" ? body.reason : undefined);
        await log(`${username} until ${until}${body.reason ? ` — ${String(body.reason).slice(0, 100)}` : ""}`);
        return NextResponse.json({ timeouts: await getTimeouts() });
      }
      case "endTimeout":
        await checkModPerm("ban");
        await clearTimeoutFor(username, me);
        await log(username);
        return NextResponse.json({ timeouts: await getTimeouts() });
      case "warn":
        await checkModPerm("warn");
        await warnUser(username, me, String(body.reason || ""));
        await log(`${username} — ${String(body.reason || "").slice(0, 100)}`);
        return NextResponse.json({ ok: true });
      case "modNote":
        await checkModPerm("notes");
        return NextResponse.json({ notes: body.remove ? await deleteModNote(username, String(body.id || "")) : await addModNote(username, me, String(body.text || "")) });
      case "freeze":
      case "unfreeze":
        await checkModPerm("ban");
        await setFrozen(username, action === "freeze", me);
        await log(username);
        return NextResponse.json({ frozen: await listFrozen() });
      case "forceLogout":
        await checkModPerm("logout");
        if ((await listRoles())[username.toLowerCase()] === "owner" && ctx.role !== "owner") throw new Error("Only the owner can do that");
        await logoutEverywhere(username);
        await logMod(username, { action: "logged out everywhere", by: me });
        await log(username);
        return NextResponse.json({ ok: true });
      case "setGroup": {
        checkAdmin(ctx, password);
        const group = body.group === "beta" ? "beta" : body.group === "contributors" ? "contributors" : null;
        if (!group || !username) throw new Error("Missing group or username");
        await setGroup(group, username, body.on !== false);
        await log(`${username} ${body.on !== false ? "→" : "out of"} ${group}`);
        return NextResponse.json({ contributors: await listGroup("contributors"), beta: await listGroup("beta") });
      }
      case "bulkUsers": {
        const names = (Array.isArray(body.usernames) ? body.usernames : []).map(String).slice(0, 100);
        const op = String(body.op || "");
        if (!names.length) throw new Error("Pick some people first");
        const roles = await listRoles();
        const safe = names.filter((n: string) => !roles[n.toLowerCase()]); // never staff
        if (op === "delete") { checkAdmin(ctx, password); confirmTyped("DELETE"); }
        else if (op === "logout") await checkModPerm("logout");
        else await checkModPerm("ban");
        for (const n of safe) {
          if (op === "mute") await setBanned(n, true);
          else if (op === "unmute") { await setBanned(n, false); await clearTimeoutFor(n, me); }
          else if (op === "timeout") await setTimeoutFor(n, Number(body.hours) || 24, me, typeof body.reason === "string" ? body.reason : undefined);
          else if (op === "freeze") await setFrozen(n, true, me);
          else if (op === "unfreeze") await setFrozen(n, false, me);
          else if (op === "logout") await logoutEverywhere(n);
          else if (op === "delete") await purgeAccount(n);
          else throw new Error("Unknown action");
        }
        await log(`${op}: ${safe.join(", ")}`);
        return NextResponse.json({ done: safe.length, skipped: names.length - safe.length, users: await listUsers(), banned: await getBanned(), timeouts: await getTimeouts(), frozen: await listFrozen() });
      }
      case "inactive": {
        checkAdmin(ctx, password);
        const days = Math.max(7, Math.min(730, Number(body.days) || 90));
        const [users, seen, roles, data] = await Promise.all([listUsers(), lastSeenRaw(), listRoles(), getBookmarks()]);
        const adders = new Set(data.folders.flatMap((f) => f.links.map((l) => l.addedBy?.toLowerCase())).filter(Boolean));
        const cutoff = Date.now() - days * 86400_000;
        const list = users.filter((u) => {
          const k = u.username.toLowerCase();
          return !roles[k] && !adders.has(k) && (seen[k] || Date.parse(u.createdAt) || 0) < cutoff;
        }).map((u) => ({ username: u.username, createdAt: u.createdAt, lastSeen: seen[u.username.toLowerCase()] || null }));
        return NextResponse.json({ inactive: list });
      }
      /* ---------- reports ---------- */
      case "resolveReport": {
        await checkModPerm("reports");
        const r = await resolveReport(String(body.id || ""));
        await log(r ? `${r.kind} “${r.targetName}” — ${body.outcome || "dismissed"}` : String(body.id || ""));
        return NextResponse.json({ reports: await listReports() });
      }
      /* ---------- invites ---------- */
      case "createInvite":
        checkAdmin(ctx, password);
        await createInvite(me, Number(body.uses) || 1, Number(body.days) || 7);
        await log();
        return NextResponse.json({ invites: await listInvites() });
      case "deleteInvite":
        checkAdmin(ctx, password);
        await deleteInvite(String(body.code || ""));
        return NextResponse.json({ invites: await listInvites() });
      /* ---------- the staff board: pinned notes, to-dos, shared notes ---------- */
      case "boardSave":
        checkMod(ctx, password);
        return NextResponse.json({ board: await saveAdminBoard(me, body) });
      case "boardDelete":
        checkMod(ctx, password);
        return NextResponse.json({ board: await deleteAdminBoard(String(body.id || "")) });
      /* ---------- data & diagnostics ---------- */
      case "linkNote":
        checkAdmin(ctx, password);
        await setAdminLinkNote(String(body.linkId || ""), String(body.text || ""));
        return NextResponse.json({ linkNotes: await adminLinkNotes() });
      case "emptyTrash":
        checkAdmin(ctx, password);
        confirmTyped("EMPTY");
        await emptyTrash();
        await log();
        return NextResponse.json({ trash: [] });
      case "clearErrors":
        checkAdmin(ctx, password);
        await clearErrors();
        return NextResponse.json({ errors: [] });
      case "exportChat": {
        checkAdmin(ctx, password);
        await log();
        return NextResponse.json({ messages: await getAllMessages() });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
