// npm test: starts a fake database and the site, then runs every
// tests/*.test.mjs file against a fresh database.
//   TEST_SERVER=start   use `next start` (after `npm run build`, as CI does)
//   BASE_URL=...        use a server you already started (skips starting one)
import { spawn, execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const PORT = process.env.TEST_PORT || "3456";
const FAKE_PORT = process.env.FAKE_UPSTASH_PORT || "8079";
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const FAKE = `http://localhost:${FAKE_PORT}`;
const only = process.argv.slice(2);

const children = [];
function kill(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" }); } catch {}
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  }
}
function cleanup() { children.forEach(kill); }
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url, label) {
  for (let i = 0; i < 360; i++) {
    try { const r = await fetch(url); if (r.status) return; } catch {}
    await sleep(500);
  }
  throw new Error(`${label} never came up at ${url}`);
}

if (!process.env.BASE_URL) {
  const fake = spawn(process.execPath, [path.join(here, "fake-upstash.js")], {
    env: { ...process.env, FAKE_UPSTASH_PORT: FAKE_PORT }, stdio: "inherit", detached: process.platform !== "win32",
  });
  children.push(fake);
  await waitFor(`${FAKE}/__flush`, "fake database");
  const mode = process.env.TEST_SERVER === "start" ? "start" : "dev";
  const next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), mode, "-p", PORT], {
    cwd: root,
    env: {
      ...process.env,
      UPSTASH_REDIS_REST_URL: FAKE,
      UPSTASH_REDIS_REST_TOKEN: "test",
      ADMIN_PASSWORD: "testadmin",
      DESIGN_AI_URL: `${FAKE}/__ai/v1/chat/completions`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "ignore", "inherit"],
    detached: process.platform !== "win32",
  });
  children.push(next);
  console.log(`starting next ${mode} on ${PORT}…`);
  await waitFor(`${BASE}/api/health`, "site");
}

const files = readdirSync(here).filter((f) => f.endsWith(".test.mjs") && (!only.length || only.some((o) => f.includes(o)))).sort();
let failed = 0;
for (const file of files) {
  await fetch(`${FAKE}/__flush`, { method: "POST", body: "{}" }).catch(() => {});
  await fetch(`${FAKE}/__quota/off`, { method: "POST", body: "{}" }).catch(() => {});
  console.log(`\n=== ${file}`);
  const code = await new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(here, file)], { env: { ...process.env, BASE_URL: BASE, FAKE_DB_URL: FAKE }, stdio: "inherit" });
    p.on("exit", resolve);
  });
  if (code !== 0) failed++;
}
console.log(`\n${files.length - failed}/${files.length} test files passed`);
cleanup();
process.exit(failed ? 1 : 0);
