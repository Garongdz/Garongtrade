import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs";

export const COOKIE_NAME = "gs_session";

// ── FIX 3: Error jelas jika APP_PIN belum diset ───────────────────────────────
const APP_PIN = process.env["APP_PIN"];
if (!APP_PIN) {
  throw new Error("APP_PIN secret belum diset! Tambahkan di Replit Secrets dulu.");
}

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET secret belum diset! Tambahkan di Replit Secrets dulu.");
}

const PIN_HASH = bcrypt.hashSync(APP_PIN, 10);

// ── FIX 4: Persist rate limits ke file ───────────────────────────────────────
const ATTEMPTS_FILE = "/tmp/gs_login_attempts.json";

interface RateRecord { count: number; lockedUntil: Date | null; }
type SerializedRecord = { count: number; lockedUntil: string | null };

function loadAttempts(): Map<string, RateRecord> {
  try {
    const raw = fs.readFileSync(ATTEMPTS_FILE, "utf-8");
    const data: Record<string, SerializedRecord> = JSON.parse(raw);
    const map = new Map<string, RateRecord>();
    for (const [ip, rec] of Object.entries(data)) {
      map.set(ip, {
        count: rec.count,
        lockedUntil: rec.lockedUntil ? new Date(rec.lockedUntil) : null,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveAttempts(attempts: Map<string, RateRecord>) {
  try {
    const obj: Record<string, SerializedRecord> = {};
    for (const [ip, rec] of attempts.entries()) {
      obj[ip] = {
        count: rec.count,
        lockedUntil: rec.lockedUntil ? rec.lockedUntil.toISOString() : null,
      };
    }
    fs.writeFileSync(ATTEMPTS_FILE, JSON.stringify(obj));
  } catch {
    // silently skip — in-memory still works
  }
}

const loginAttempts = loadAttempts();

// ── Auth functions ─────────────────────────────────────────────────────────────
export function verifyPin(pin: string): boolean {
  return bcrypt.compareSync(pin, PIN_HASH);
}

export function createSessionToken(): string {
  return jwt.sign({ type: "session" }, JWT_SECRET!, { expiresIn: "7d" });
}

export function verifySessionToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET!);
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
    saveAttempts(loginAttempts);
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
    saveAttempts(loginAttempts);
    return { locked: true, attemptsLeft: 0 };
  }
  loginAttempts.set(ip, record);
  saveAttempts(loginAttempts);
  return { locked: false, attemptsLeft: 3 - record.count };
}

export function clearAttempts(ip: string) {
  loginAttempts.delete(ip);
  saveAttempts(loginAttempts);
}
