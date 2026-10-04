import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getCurrentUser, listUsers } from "@/lib/auth";
import { getAllMessages } from "@/lib/chat";
import { allFlair, allThanks, helperStats, listEvents, proposeNote, thank, wyrTally, wyrVote } from "@/lib/community";
import { errorResponse } from "@/lib/http";
import { cleanPostText, requireCommunityOpen, requireMember } from "@/lib/member";
import { rateLimit } from "@/lib/ratelimit";
import { getBookmarks } from "@/lib/store";
import { listSuggestions } from "@/lib/suggestions";
import { Contributor } from "@/lib/types";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);
/** The next round number above n (25, 50, 100, 250, 500, 1000…), for the goal bars. */
function nextGoal(n: number) {
  const steps = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  return steps.find((s) => s > n) || Math.ceil((n + 1) / 10000) * 10000;
}

/** Leaderboard, helpers, flair, thanks, goals, new members, the daily question and upcoming events. */
export async function GET() {
  try {
    const [data, users, messages, suggestions, me] = await Promise.all([
      getBookmarks(), listUsers(), getAllMessages(), listSuggestions(), getCurrentUser(),
    ]);
    const [helpers, flair, thanks, events, wyr] = await Promise.all([
      helperStats(), allFlair(), allThanks(), listEvents(), wyrTally(today(), me),
    ]);
    const map = new Map<string, Contributor>();
    const get = (name: string) => {
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { username: name, added: 0, likesReceived: 0, likesGiven: 0, suggestionsApproved: 0, messages: 0, score: 0 });
      }
      return map.get(key)!;
    };
    users.forEach((u) => { get(u.username).joined = u.createdAt; });
    let linkCount = 0;
    for (const f of data.folders) {
      for (const l of f.links) {
        linkCount++;
        if (l.addedBy) {
          const c = get(l.addedBy);
          c.added++;
          c.likesReceived += l.likes?.length || 0;
        }
        l.likes?.forEach((u) => { if (map.has(u)) map.get(u)!.likesGiven++; });
      }
    }
    suggestions.filter((s) => s.status === "approved").forEach((s) => get(s.user).suggestionsApproved++);
    messages.forEach((m) => get(m.user).messages++);
    // only real accounts on the board
    const registered = new Set(users.map((u) => u.username.toLowerCase()));
    const leaders = Array.from(map.entries())
      .filter(([key]) => registered.has(key))
      .map(([key, c]) => {
        const h = helpers[key];
        const helpScore = h ? h.accepted * 5 + h.helpful * 2 + Math.min(h.answers, 30) : 0;
        return { ...c, score: c.added * 5 + c.suggestionsApproved * 4 + c.likesReceived * 2 + c.likesGiven + Math.min(c.messages, 50) + helpScore };
      })
      .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));

    // thank-you counts per link (and which ones you've thanked), without listing who
    const thankCounts: Record<string, number> = {};
    const myThanks: string[] = [];
    for (const [linkId, list] of Object.entries(thanks)) {
      thankCounts[linkId] = list.length;
      if (me && list.includes(me.toLowerCase())) myThanks.push(linkId);
    }
    // your answers on anonymous polls (only you can see them)
    const myPolls: Record<string, number[]> = {};
    if (me) {
      const anon = (data.polls || []).filter((p) => p.anonymous);
      const redis = Redis.fromEnv();
      const got = await Promise.all(anon.map((p) => redis.hget<number[]>(`pollvotes:${p.id}`, me.toLowerCase())));
      anon.forEach((p, i) => { if (got[i]) myPolls[p.id] = got[i]!; });
    }
    const weekAgo = Date.now() - 7 * 86400_000;
    const newMembers = users
      .filter((u) => u.createdAt && Date.parse(u.createdAt) > weekAgo)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12)
      .map((u) => u.username);
    const helperList = Object.entries(helpers)
      .filter(([k]) => registered.has(k))
      .map(([k, h]) => ({ username: map.get(k)?.username || k, ...h }))
      .sort((a, b) => b.accepted - a.accepted || b.helpful - a.helpful || b.answers - a.answers)
      .slice(0, 10);
    return NextResponse.json({
      leaders,
      helpers: helperList,
      flair,
      thanks: thankCounts,
      myThanks,
      myPolls,
      newMembers,
      events: events.filter((e) => Date.parse(e.endDate || e.date) > Date.now() - 86400_000).slice(0, 20),
      wyr: { day: today(), a: wyr.a, b: wyr.b, mine: wyr.mine },
      goals: {
        links: { now: linkCount, goal: nextGoal(linkCount) },
        members: { now: users.length, goal: nextGoal(users.length) },
        messages: { now: messages.length, goal: nextGoal(messages.length) },
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ leaders: [], error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

/** Small community actions: say thanks for a link, answer the daily question, suggest a note for a link. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const me = await requireMember();
    await requireCommunityOpen(me.staff);
    await cleanPostText(body, ["text"]);
    await rateLimit(`community:${me.user.toLowerCase()}`, 30, 60);
    const findLink = async (id: string) => {
      const link = (await getBookmarks()).folders.flatMap((f) => f.links).find((l) => l.id === id);
      if (!link) throw new Error("That link is gone");
      return link;
    };
    switch (body.action) {
      case "thank": {
        const link = await findLink(String(body.linkId || ""));
        const list = await thank(link.id, me.user, link.addedBy, link.name);
        return NextResponse.json({ count: list.length, thanked: true });
      }
      case "wyr": {
        const t = await wyrVote(today(), me.user, Number(body.choice));
        return NextResponse.json({ wyr: { day: today(), a: t.a, b: t.b, mine: Number(body.choice) } });
      }
      case "note": {
        const link = await findLink(String(body.linkId || ""));
        await proposeNote(me.user, link.id, link.name, String(body.text || ""));
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
