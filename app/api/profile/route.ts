import { NextRequest, NextResponse } from "next/server";
import { listUsers } from "@/lib/auth";
import { getRole } from "@/lib/roles";
import { getBookmarks } from "@/lib/store";
import { getProfile } from "@/lib/userdata";

export const dynamic = "force-dynamic";

// Public profile card: bio/avatar plus a couple of derived stats.
export async function GET(req: NextRequest) {
  const username = (req.nextUrl.searchParams.get("user") || "").trim();
  if (!username) return NextResponse.json({ error: "Missing user" }, { status: 400 });
  const users = await listUsers();
  const match = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!match) return NextResponse.json({ username: null });
  const [profile, role, data] = await Promise.all([getProfile(match.username), getRole(match.username), getBookmarks()]);
  let added = 0;
  let likesReceived = 0;
  for (const f of data.folders) {
    for (const l of f.links) {
      if (l.addedBy?.toLowerCase() === match.username.toLowerCase()) { added++; likesReceived += l.likes?.length || 0; }
    }
  }
  return NextResponse.json({ username: match.username, profile, role, joined: match.createdAt, added, likesReceived });
}
