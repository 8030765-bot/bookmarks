import { NextResponse } from "next/server";
import { isAuthError } from "./roles";
import { logError } from "./moderation";

export const QUOTA_MESSAGE =
  "The site's free database limit has been reached — you're seeing a saved copy and changes are paused until it resets.";

/** Upstash says this when the plan's request/bandwidth/storage limit is used up. */
export function isQuotaError(message: string) {
  return /max (daily )?requests? limit|limit exceeded|max (monthly )?bandwidth|max (data|storage) size/i.test(message);
}

/** Map a thrown error to a JSON response with a sensible status code. */
export function errorResponse(e: unknown, fallbackStatus = 400) {
  const message = e instanceof Error ? e.message : "Request failed";
  if (isQuotaError(message)) return NextResponse.json({ error: QUOTA_MESSAGE, quota: true }, { status: 503 });
  const status = isAuthError(message) || message.includes("muted") || message.startsWith("Cross-site")
    ? 403
    : message.startsWith("Log in")
      ? 401
      : message.startsWith("Slow down") || message.startsWith("Too many") || message.startsWith("Wait")
        ? 429
        : message.startsWith("Wrong")
          ? 401
          : message.startsWith("Read-only")
            ? 503
            : fallbackStatus;
  // real server faults go to the admins' "recent errors" list
  if (status >= 500 && status !== 503) logError(message);
  return NextResponse.json({ error: message }, { status });
}
