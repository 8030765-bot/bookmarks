import { NextRequest, NextResponse } from "next/server";
import { listUsers } from "@/lib/auth";
import { BOARD_KINDS, BoardKind, acceptReply, createPost, deletePost, listPosts, replyPost, votePost } from "@/lib/community";
import { errorResponse } from "@/lib/http";
import { cleanPostText, requireCommunityOpen, requireMember } from "@/lib/member";
import { bumpStat } from "@/lib/moderation";
import { rateLimit } from "@/lib/ratelimit";
import { getBookmarks } from "@/lib/store";

export const dynamic = "force-dynamic";

function kindOf(v: unknown): BoardKind {
  const k = String(v || "") as BoardKind;
  if (!BOARD_KINDS.includes(k)) throw new Error("Unknown board");
  return k;
}

/** One community board: requests, Q&A, tips, guestbook, shoutouts, challenge, link of the month. */
export async function GET(req: NextRequest) {
  try {
    const kind = kindOf(req.nextUrl.searchParams.get("kind"));
    return NextResponse.json({ posts: await listPosts(kind) });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const kind = kindOf(body.kind);
    const me = await requireMember();
    await requireCommunityOpen(me.staff);
    await cleanPostText(body);
    const id = String(body.id || "");
    const action = String(body.action || "create");
    await rateLimit(`board:${me.user.toLowerCase()}`, action === "vote" ? 60 : 12, 60);
    switch (action) {
      case "create": {
        if (kind === "challenge") {
          // entries always go into the challenge that's running now
          const challenge = (await getBookmarks()).settings?.challenge;
          if (!challenge || (challenge.endsAt && Date.parse(challenge.endsAt) < Date.now())) throw new Error("There's no challenge running right now");
          body.round = challenge.round;
        }
        await createPost(kind, me.user, body, (await listUsers()).map((u) => u.username));
        await bumpStat("posts");
        break;
      }
      case "vote":
        await votePost(kind, id, me.user, body.replyId ? String(body.replyId) : undefined);
        break;
      case "reply":
        await replyPost(kind, id, me.user, body);
        break;
      case "accept":
        await acceptReply(kind, id, me.user, String(body.replyId || ""), me.staff);
        break;
      case "delete":
        await deletePost(kind, id, me.user, me.staff, body.replyId ? String(body.replyId) : undefined);
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ posts: await listPosts(kind) });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
