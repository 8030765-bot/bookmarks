import { NextResponse } from "next/server";
import { listUsers } from "@/lib/auth";
import { getAllMessages } from "@/lib/chat";
import { getBookmarks } from "@/lib/store";
import { listSuggestions } from "@/lib/suggestions";
import { Contributor } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Public leaderboard + profile stats, all derived from existing data. */
export async function GET() {
  try {
    const [data, users, messages, suggestions] = await Promise.all([
      getBookmarks(), listUsers(), getAllMessages(), listSuggestions(),
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
    for (const f of data.folders) {
      for (const l of f.links) {
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
      .map(([, c]) => ({ ...c, score: c.added * 5 + c.suggestionsApproved * 4 + c.likesReceived * 2 + c.likesGiven + Math.min(c.messages, 50) }))
      .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
    return NextResponse.json({ leaders });
  } catch (e: unknown) {
    return NextResponse.json({ leaders: [], error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
