import { NextResponse } from "next/server";
import { getAggregateRatings } from "@/lib/userdata";

export const dynamic = "force-dynamic";

// Public average star ratings, polled by the homepage.
export async function GET() {
  try {
    return NextResponse.json({ ratings: await getAggregateRatings() });
  } catch {
    return NextResponse.json({ ratings: {} });
  }
}
