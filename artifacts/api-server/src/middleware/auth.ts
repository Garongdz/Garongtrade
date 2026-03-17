import { type Request, type Response, type NextFunction } from "express";
import { verifySessionToken, COOKIE_NAME } from "../auth";

// ── FIX 2: Expanded exempt paths ─────────────────────────────────────────────
const EXEMPT = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/check",
  "/api/health",
  "/api/ws/",        // WebSocket price stream
];

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const path = req.path;
  if (EXEMPT.some((p) => path.startsWith(p))) return next();

  const token = req.cookies?.[COOKIE_NAME];
  if (token && verifySessionToken(token)) return next();

  res.status(401).json({ error: "Unauthorized" });
}
