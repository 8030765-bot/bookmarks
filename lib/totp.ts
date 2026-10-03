import { createHmac, randomBytes } from "crypto";

/**
 * Time-based one-time codes (RFC 6238) — the 6-digit codes authenticator
 * apps like Google Authenticator show, changing every 30 seconds.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const num = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(num % 1_000_000).padStart(6, "0");
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/**
 * Checks a code against the previous, current and next 30-second window
 * (phones drift a little). Returns the matching step, or -1. Steps at or
 * before `lastUsed` are refused so a code can't be used twice.
 */
export function verifyTotp(secret: string, code: string, lastUsed = 0, now = Date.now()): number {
  const clean = String(code).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return -1;
  const step = currentStep(now);
  for (const s of [step - 1, step, step + 1]) {
    if (s <= lastUsed) continue;
    if (totpAt(secret, s) === clean) return s;
  }
  return -1;
}

export function otpauthUri(secret: string, account: string, issuer = "Theo's Bookmarks") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
