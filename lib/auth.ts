/**
 * Single admin login from .env (ADMIN_USERNAME, ADMIN_PASSWORD).
 *
 * The session is a signed cookie: "<expiry>.<username>.<HMAC-SHA256>". The signing key is derived
 * from the admin credentials, so changing ADMIN_PASSWORD signs everyone out. No database tables.
 * If either variable is missing, nobody can sign in.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "lo_session";
export const SESSION_DAYS = 7;

function admin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  return username && password ? { username, password } : null;
}

const digest = (v: string) => createHash("sha256").update(v).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
const sign = (payload: string, a: { username: string; password: string }) =>
  createHmac("sha256", `lo-metrics-session:${a.username}:${a.password}`).update(payload).digest("base64url");

export function checkLogin(username: string, password: string): boolean {
  const a = admin();
  if (!a) return false;
  const userOk = same(username, a.username);
  const passOk = same(password, a.password);
  return userOk && passOk;
}

/** Call only after checkLogin succeeded. */
export function createSessionToken(): string {
  const a = admin()!;
  const payload = `${Date.now() + SESSION_DAYS * 86_400_000}.${a.username}`;
  return `${payload}.${sign(payload, a)}`;
}

export function sessionUser(token: string | undefined): { username: string } | null {
  const a = admin();
  if (!a || !token) return null;
  const cut = token.lastIndexOf(".");
  if (cut < 0) return null;
  const payload = token.slice(0, cut);
  if (!same(token.slice(cut + 1), sign(payload, a))) return null;
  const dot = payload.indexOf(".");
  const expires = Number(payload.slice(0, dot));
  const username = payload.slice(dot + 1);
  return expires > Date.now() && username === a.username ? { username } : null;
}

// Login throttle: 5 failed attempts lock sign-in for 15 minutes (in memory, per server instance).
let failures = { count: 0, until: 0 };
export const loginLocked = () => failures.count >= 5 && failures.until > Date.now();
export function recordLoginFailure() {
  const fresh = failures.until < Date.now();
  failures = { count: fresh ? 1 : failures.count + 1, until: Date.now() + 15 * 60_000 };
}
export const clearLoginFailures = () => (failures = { count: 0, until: 0 });
