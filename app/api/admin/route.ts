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

export const dynamic = "force-dynamic";

// Accounts, roles, chat moderation, suggestions and the audit log.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "");
    const password = typeof body.password === "string" ? body.password : undefined;
    const ctx = await getAuthContext();
    const username = String(body.username || "");
    const log = (detail?: string) => audit(ctx, action, detail).catch(() => {});

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
        return NextResponse.json({ users, banned, messageCount: messages.length, suggestions, roles, audit: auditLog, me: ctx, flair, notes });
      }
      case "ban":
      case "unban":
        checkMod(ctx, password);
        if (!username) throw new Error("Missing username");
        await setBanned(username, action === "ban");
        await log(username);
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
        await deleteUser(username);
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
        await clearChat();
        await log();
        return NextResponse.json({ messages: [] });
      case "approveSuggestion":
        checkAdmin(ctx, password);
        await approveSuggestion(String(body.id || ""), { password, __auth: ctx }, body.overrides || {});
        await log(String(body.id || ""));
        return NextResponse.json({ suggestions: await listSuggestions(), data: await withClicks(await getBookmarks()) });
      case "rejectSuggestion":
        checkMod(ctx, password);
        await rejectSuggestion(String(body.id || ""), body.reason);
        await log(String(body.id || ""));
        return NextResponse.json({ suggestions: await listSuggestions() });
      case "deleteSuggestion":
        checkMod(ctx, password);
        await deleteSuggestion(String(body.id || ""));
        return NextResponse.json({ suggestions: await listSuggestions() });
      case "setStage":
        checkMod(ctx, password);
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
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
