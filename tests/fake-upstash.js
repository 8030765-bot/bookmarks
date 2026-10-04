// In-memory stand-in for the Upstash Redis REST API, so tests never touch
// the real database. Supports just the commands the site uses.
const http = require("http");

const PORT = Number(process.env.FAKE_UPSTASH_PORT || 8079);
const kv = new Map(); // key -> { v, exp }
const now = () => Date.now();

function live(k) {
  const e = kv.get(k);
  if (!e) return undefined;
  if (e.exp && e.exp < now()) { kv.delete(k); return undefined; }
  return e;
}
const str = (x) => String(x);

function run(cmd) {
  const [op, ...a] = cmd;
  switch (String(op).toLowerCase()) {
    case "ping": return "PONG";
    case "flushall": case "flushdb": kv.clear(); return "OK";
    case "scan": {
      let match = "*";
      for (let i = 1; i < a.length - 1; i++) if (str(a[i]).toUpperCase() === "MATCH") match = str(a[i + 1]);
      const re = new RegExp("^" + match.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      return ["0", [...kv.keys()].filter((k) => live(k) && re.test(k))];
    }
    case "get": { const e = live(a[0]); return e && typeof e.v === "string" ? e.v : null; }
    case "rename": {
      const e = live(a[0]);
      if (!e) throw new Error("ERR no such key");
      kv.delete(a[0]);
      kv.set(a[1], e);
      return "OK";
    }
    case "set": {
      const [k, v, ...opts] = a;
      const o = opts.map((x) => str(x).toLowerCase());
      if (o.includes("nx") && live(k)) return null;
      if (o.includes("xx") && !live(k)) return null;
      if (o.includes("keepttl")) { const old = live(k); kv.set(k, { v: str(v), exp: old?.exp || 0 }); return "OK"; }
      let exp = 0;
      const ex = o.indexOf("ex");
      if (ex >= 0) exp = now() + Number(opts[ex + 1]) * 1000;
      const px = o.indexOf("px");
      if (px >= 0) exp = now() + Number(opts[px + 1]);
      kv.set(k, { v: str(v), exp });
      return "OK";
    }
    case "mget": return a.map((k) => { const e = live(k); return e && typeof e.v === "string" ? e.v : null; });
    case "mset": { for (let i = 0; i < a.length; i += 2) kv.set(a[i], { v: str(a[i + 1]), exp: 0 }); return "OK"; }
    case "del": { let n = 0; for (const k of a) if (kv.delete(k)) n++; return n; }
    case "exists": return a.filter((k) => live(k)).length;
    case "dbsize": return [...kv.keys()].filter((k) => live(k)).length;
    case "incr": case "incrby": {
      const e = live(a[0]);
      const n = Number(e?.v || 0) + (String(op).toLowerCase() === "incrby" ? Number(a[1]) : 1);
      kv.set(a[0], { v: str(n), exp: e?.exp || 0 });
      return n;
    }
    case "expire": { const e = live(a[0]); if (!e) return 0; e.exp = now() + Number(a[1]) * 1000; return 1; }
    case "ttl": { const e = live(a[0]); if (!e) return -2; return e.exp ? Math.ceil((e.exp - now()) / 1000) : -1; }
    case "lpush": { const e = live(a[0]) || { v: [], exp: 0 }; for (const x of a.slice(1)) e.v.unshift(str(x)); kv.set(a[0], e); return e.v.length; }
    case "rpush": { const e = live(a[0]) || { v: [], exp: 0 }; for (const x of a.slice(1)) e.v.push(str(x)); kv.set(a[0], e); return e.v.length; }
    case "llen": return (live(a[0])?.v || []).length;
    case "lset": {
      const e = live(a[0]);
      if (!e) throw new Error("ERR no such key");
      let i = Number(a[1]);
      if (i < 0) i = e.v.length + i;
      if (i < 0 || i >= e.v.length) throw new Error("ERR index out of range");
      e.v[i] = str(a[2]);
      return "OK";
    }
    case "lrange": { const l = live(a[0])?.v || []; const s = Number(a[1]); let t = Number(a[2]); if (t < 0) t = l.length + t; return l.slice(s, t + 1); }
    case "ltrim": { const e = live(a[0]); if (e) { let t = Number(a[2]); if (t < 0) t = e.v.length + t; e.v = e.v.slice(Number(a[1]), t + 1); } return "OK"; }
    case "lrem": { const e = live(a[0]); if (!e) return 0; const before = e.v.length; e.v = e.v.filter((x) => x !== str(a[2])); return before - e.v.length; }
    case "sadd": { const e = live(a[0]) || { v: new Set(), exp: 0 }; let n = 0; for (const x of a.slice(1)) if (!e.v.has(str(x))) { e.v.add(str(x)); n++; } kv.set(a[0], e); return n; }
    case "smembers": return [...(live(a[0])?.v || [])];
    case "sismember": return live(a[0])?.v?.has(str(a[1])) ? 1 : 0;
    case "scard": return live(a[0])?.v?.size || 0;
    case "srem": { const e = live(a[0]); let n = 0; if (e) for (const x of a.slice(1)) if (e.v.delete(str(x))) n++; return n; }
    case "hset": { const e = live(a[0]) || { v: new Map(), exp: 0 }; let n = 0; for (let i = 1; i < a.length; i += 2) { if (!e.v.has(str(a[i]))) n++; e.v.set(str(a[i]), str(a[i + 1])); } kv.set(a[0], e); return n; }
    case "hget": return live(a[0])?.v?.get(str(a[1])) ?? null;
    case "hmget": { const m = live(a[0])?.v; return a.slice(1).map((f) => m?.get(str(f)) ?? null); }
    case "hgetall": { const m = live(a[0])?.v; return m ? [...m].flat() : []; }
    case "hdel": { const e = live(a[0]); let n = 0; if (e) for (const x of a.slice(1)) if (e.v.delete(str(x))) n++; return n; }
    case "hlen": return live(a[0])?.v?.size || 0;
    case "hincrby": {
      const e = live(a[0]) || { v: new Map(), exp: 0 };
      const n = Number(e.v.get(str(a[1])) || 0) + Number(a[2]);
      e.v.set(str(a[1]), str(n));
      kv.set(a[0], e);
      return n;
    }
    case "zadd": { const e = live(a[0]) || { v: new Map(), exp: 0 }; let n = 0; for (let i = 1; i < a.length; i += 2) { if (!e.v.has(str(a[i + 1]))) n++; e.v.set(str(a[i + 1]), Number(a[i])); } kv.set(a[0], e); return n; }
    case "zremrangebyscore": { const e = live(a[0]); let n = 0; if (e) for (const [m, sc] of [...e.v]) if (sc >= Number(a[1]) && sc <= Number(a[2])) { e.v.delete(m); n++; } return n; }
    case "zrange": { const m = live(a[0])?.v; if (!m) return []; const list = [...m].sort((x, y) => x[1] - y[1]).map(([k]) => k); let t = Number(a[2]); if (t < 0) t = list.length + t; return list.slice(Number(a[1]), t + 1); }
    case "zcard": return live(a[0])?.v?.size || 0;
    case "zrem": { const e = live(a[0]); let n = 0; if (e) for (const x of a.slice(1)) if (e.v.delete(str(x))) n++; return n; }
    default: throw new Error("unsupported " + op);
  }
}

function enc(v, b64) {
  if (!b64) return v;
  if (typeof v === "string") return Buffer.from(v).toString("base64");
  if (Array.isArray(v)) return v.map((x) => enc(x, b64));
  return v;
}

http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const b64 = (req.headers["upstash-encoding"] || "") === "base64";
    res.setHeader("content-type", "application/json");
    try {
      // test controls: wipe everything, or pretend the free plan ran out
      if (req.url.startsWith("/__flush")) { kv.clear(); res.end('{"result":"OK"}'); return; }
      if (req.url.startsWith("/__quota/")) { quota = req.url.endsWith("/on"); res.end('{"result":"OK"}'); return; }
      if (quota) { res.statusCode = 400; res.end(JSON.stringify({ error: "ERR max requests limit exceeded. Limit: 500000, Usage: 500000" })); return; }
      const parsed = JSON.parse(body);
      if (req.url.startsWith("/pipeline") || req.url.startsWith("/multi-exec")) {
        res.end(JSON.stringify(parsed.map((cmd) => { try { return { result: enc(run(cmd), b64) }; } catch (e) { return { error: e.message }; } })));
      } else {
        res.end(JSON.stringify({ result: enc(run(parsed), b64) }));
      }
    } catch (e) {
      console.error("[fake-upstash]", e.message, body.slice(0, 200));
      res.statusCode = 400;
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}).listen(PORT, () => console.log(`fake upstash on ${PORT}`));

let quota = false;
