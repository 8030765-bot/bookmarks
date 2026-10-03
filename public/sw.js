/* Service worker: lets the site open without a connection and keeps
   website icons cached. Live data (the API) always goes to the network —
   the page keeps its own saved copy of the bookmarks for offline use. */
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;
const ICONS = "icons-v1";
const MAX_ICONS = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add("/")).catch(() => {}));
  // the page decides when to switch to a new version ("Update" button)
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, STATIC, ICONS]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname === "/api/icon") {
      event.respondWith(iconCache(req));
      return;
    }
    if (url.pathname.startsWith("/api/")) return; // always live
    if (url.pathname.startsWith("/_next/static/")) {
      event.respondWith(cacheFirst(req, STATIC)); // file names change with every build
      return;
    }
    if (req.mode === "navigate") {
      event.respondWith(networkFirst(req, SHELL));
      return;
    }
    return;
  }
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    // only the home page is kept for offline use
    if (res.ok && new URL(req.url).pathname === "/") cache.put("/", res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || (await cache.match("/")) || new Response(
      "<!doctype html><meta name=viewport content='width=device-width'><title>Offline</title><body style='font-family:system-ui;background:#000;color:#eee;display:grid;place-items:center;height:100vh;margin:0'><div style='text-align:center'><h1>You're offline</h1><p>Connect to the internet and try again.</p></div>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

// Icons: serve the cached copy instantly, refresh it in the background.
async function iconCache(req) {
  const cache = await caches.open(ICONS);
  const hit = await cache.match(req.url);
  const refresh = fetch(req)
    .then(async (res) => {
      if (res.ok) {
        await cache.put(req.url, res.clone());
        trim(cache);
      }
      return res;
    })
    .catch(() => null);
  if (hit) return hit;
  return (await refresh) || new Response(null, { status: 504 });
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ICONS; i++) await cache.delete(keys[i]);
}
