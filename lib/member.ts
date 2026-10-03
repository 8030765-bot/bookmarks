import { getBanned } from "./chat";
import { getAuthContext } from "./roles";

/**
 * Who's posting on the community pages: must be logged in and not muted.
 * `staff` is true for moderators and admins, who can tidy up anyone's posts.
 */
export async function requireMember() {
  const ctx = await getAuthContext();
  if (!ctx.user) throw new Error("Log in to join in");
  if ((await getBanned()).includes(ctx.user.toLowerCase())) throw new Error("You're muted, so you can't post right now");
  return { ...ctx, user: ctx.user, staff: !!ctx.role };
}
