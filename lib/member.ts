import { getAuthContext } from "./roles";
import { assertWritable, filterWords, getFlags, restriction } from "./moderation";

/**
 * Who's posting on the community pages: must be logged in, not muted or
 * timed out, and the site mustn't be read-only. `staff` is true for
 * moderators and admins, who can tidy up anyone's posts.
 */
export async function requireMember() {
  const ctx = await getAuthContext();
  if (!ctx.user) throw new Error("Log in to join in");
  await assertWritable(ctx.role);
  const why = await restriction(ctx.user);
  if (why) throw new Error(why);
  const staff = ctx.role === "owner" || ctx.role === "admin" || ctx.role === "mod";
  return { ...ctx, user: ctx.user, staff };
}

/** The community pages can be switched off by admins (staff can still tidy up). */
export async function requireCommunityOpen(staff: boolean) {
  if (!staff && (await getFlags()).communityEnabled === false) throw new Error("The community pages are switched off right now");
}

/** Run the admins' word filter over the text fields people post. */
export async function cleanPostText(body: Record<string, unknown>, fields = ["title", "text", "name"]) {
  for (const f of fields) if (typeof body[f] === "string") body[f] = await filterWords(body[f] as string);
}
