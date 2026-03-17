import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const COOKIE_NAME = "gs_session";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "garong-fallback-secret-change-me";
const APP_PIN    = process.env["APP_PIN"]    ?? "000000";

const PIN_HASH = bcrypt.hashSync(APP_PIN, 10);

// ── Rate limiting (in-memory) ─────────────────────────────────────────────────
interface RateRecord { count: number; lockedUntil: Date | null; }
const loginAttempts = new Map<string, RateRecord>();

export function verifyPin(pin: string): boolean {
  return bcrypt.compareSync(pin, PIN_HASH);
}

export function createSessionToken(): string {
  return jwt.sign({ type: "session" }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifySessionToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export function isRateLimited(ip: string): { limited: boolean; remaining: number } {
  const now = new Date();
  const record = loginAttempts.get(ip);
  if (!record) return { limited: false, remaining: 0 };
  if (record.lockedUntil && now < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000);
    return { limited: true, remaining };
  }
  if (record.lockedUntil && now >= record.lockedUntil) {
    loginAttempts.set(ip, { count: 0, lockedUntil: null });
  }
  return { limited: false, remaining: 0 };
}

export function recordFailedAttempt(ip: string): { locked: boolean; attemptsLeft: number } {
  const record = loginAttempts.get(ip) ?? { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= 3) {
    record.lockedUntil = new Date(Date.now() + 30_000);
    record.count = 0;
    loginAttempts.set(ip, record);
    return { locked: true, attemptsLeft: 0 };
  }
  loginAttempts.set(ip, record);
  return { locked: false, attemptsLeft: 3 - record.count };
}

export function clearAttempts(ip: string) {
  loginAttempts.delete(ip);
}
