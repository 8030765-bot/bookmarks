/** Only allow http(s) links; add https:// when the scheme is missing. */
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
  return parsed.toString();
}
