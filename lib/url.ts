// Query parameters that only exist to track who clicked what.
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|ref_src|mkt_tok|oly_anon_id|oly_enc_id|vero_id|twclid|ttclid)$/i;
// "si" is a share-tracking id on these sites (elsewhere it might mean something real)
const SI_HOSTS = /(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/i;

/** Only allow http(s) links; add https:// when the scheme is missing; drop tracking junk. */
export function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("That doesn't look like a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https links are allowed");
  }
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (TRACKING.test(key) || (key === "si" && SI_HOSTS.test(parsed.hostname))) parsed.searchParams.delete(key);
  }
  return parsed.toString();
}
