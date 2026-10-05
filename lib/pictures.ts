import { deleteImage, getImageMeta, parseDataUrl, saveImage, setImageStatus } from "./images";
import { getProfile, notify, setPictureFields } from "./userdata";

/**
 * Profile pictures and banners: upload (waits for a moderator unless staff
 * uploaded it), approve, reject, remove. The profile only ever points at
 * pictures that passed these checks.
 */
export type PictureKind = "avatar" | "banner";
const isStaff = (role?: string | null) => role === "owner" || role === "admin" || role === "mod";

export async function uploadPicture(user: string, role: string | null | undefined, kind: PictureKind, data: unknown, still?: unknown) {
  if (kind !== "avatar" && kind !== "banner") throw new Error("Unknown kind of picture");
  const approved = isStaff(role);
  const { type } = parseDataUrl(data, kind);
  let stillId: string | undefined;
  if (type === "image/gif") {
    if (kind !== "avatar") throw new Error("Banners can't move — use a still picture");
    // a still frame for when it isn't being hovered (and for guests)
    stillId = (await saveImage(user, "avatar", still, { approved, queue: false })).id;
  }
  const meta = await saveImage(user, kind, data, { approved, still: stillId });
  const before = await getProfile(user);
  // a newer upload replaces one that was still waiting
  await deleteImage(kind === "avatar" ? before.picPending : before.bannerPending);
  if (approved) {
    await setPictureFields(user, kind === "avatar" ? { picPending: undefined } : { bannerPending: undefined });
    return { profile: await applyApproved(user, meta.id), pending: false };
  }
  return { profile: await setPictureFields(user, kind === "avatar" ? { picPending: meta.id } : { bannerPending: meta.id }), pending: true };
}

/** Point the profile at a picture that's been approved, and drop the one it replaces. */
async function applyApproved(user: string, id: string) {
  const meta = await getImageMeta(id);
  if (!meta) throw new Error("That picture is gone");
  const p = await getProfile(user);
  if (meta.kind === "banner") {
    if (p.bannerPic !== id) await deleteImage(p.bannerPic);
    return setPictureFields(user, { bannerPic: id, bannerPending: p.bannerPending === id ? undefined : p.bannerPending });
  }
  const gif = meta.type === "image/gif";
  if (p.picGif && p.picGif !== id) await deleteImage(p.picGif); // also removes its still
  else if (p.pic && p.pic !== id && p.pic !== meta.still) await deleteImage(p.pic);
  return setPictureFields(user, {
    pic: gif ? meta.still : id,
    picGif: gif ? id : undefined,
    picPending: p.picPending === id ? undefined : p.picPending,
  });
}

/** A moderator's answer to a waiting picture. */
export async function reviewPicture(id: string, ok: boolean, by: string, reason?: string) {
  const meta = await getImageMeta(id);
  if (!meta || meta.status !== "pending") throw new Error("That picture has already been dealt with");
  const what = meta.kind === "banner" ? "profile banner" : meta.kind === "avatar" ? "profile picture" : meta.kind === "icon" ? "website icon" : "picture";
  if (ok) {
    await setImageStatus(id, "ok");
    if (meta.kind === "avatar" || meta.kind === "banner") await applyApproved(meta.owner, id);
    await notify(meta.owner, { kind: "system", from: by, text: `Your new ${what} was approved 🎉` });
  } else {
    await deleteImage(id);
    const p = await getProfile(meta.owner);
    if (p.picPending === id) await setPictureFields(meta.owner, { picPending: undefined });
    if (p.bannerPending === id) await setPictureFields(meta.owner, { bannerPending: undefined });
    await notify(meta.owner, { kind: "system", from: by, text: `Your new ${what} wasn't approved${reason ? `: ${reason}` : ""}. Try a different one.` });
  }
  return meta;
}

/** Take a picture off a profile (your own, or a moderator acting on a report). */
export async function removePicture(user: string, kind: PictureKind) {
  const p = await getProfile(user);
  if (kind === "banner") {
    await deleteImage(p.bannerPic);
    await deleteImage(p.bannerPending);
    return setPictureFields(user, { bannerPic: undefined, bannerPending: undefined });
  }
  await deleteImage(p.picGif);
  await deleteImage(p.pic);
  await deleteImage(p.picPending);
  return setPictureFields(user, { pic: undefined, picGif: undefined, picPending: undefined });
}
