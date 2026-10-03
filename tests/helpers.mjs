// Shared bits for the API tests: a cookie jar per pretend person, a
// pass/fail logger, and a summary that sets the exit code.
export const BASE = process.env.BASE_URL || "http://localhost:3456";
export const FAKE_DB = process.env.FAKE_DB_URL || "http://localhost:8079";
export const ADMIN_PW = "testadmin";

const jar = {};
const ips = {};
let failures = 0;
let passes = 0;

/** Each pretend person gets their own cookies and their own IP address. */
export async function call(who, path, body, method = body ? "POST" : "GET", extraHeaders = {}) {
  ips[who] ||= `10.0.${Object.keys(ips).length >> 8}.${Object.keys(ips).length & 255}`;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ips[who],
      ...(jar[who] ? { cookie: jar[who] } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) jar[who] = set.split(";")[0];
  return { status: res.status, headers: res.headers, json: await res.json().catch(() => ({})) };
}

export const bm = (who, b) => call(who, "/api/bookmarks", b);
export const adm = (who, b) => call(who, "/api/admin", b);
export const me = (who, b) => call(who, "/api/me", b);

export async function signup(...names) {
  for (const u of names) await call(u, "/api/auth", { action: "signup", username: u, password: "secret1" });
}

export function ok(label, cond, extra = "") {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitForServer() {
  for (let i = 0; i < 240; i++) {
    try {
      const r = await fetch(BASE + "/api/health");
      if (r.status < 500 || r.status === 503) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("server never came up");
}

export async function setQuota(on) {
  await fetch(`${FAKE_DB}/__quota/${on ? "on" : "off"}`, { method: "POST", body: "{}" });
}

export function done() {
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
