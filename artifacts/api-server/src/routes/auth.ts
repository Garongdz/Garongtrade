import { Router, type Request, type Response } from "express";
import {
  verifyPin, createSessionToken, verifySessionToken,
  isRateLimited, recordFailedAttempt, clearAttempts,
  COOKIE_NAME,
} from "../auth";

const router = Router();
const SEVEN_DAYS = 7 * 24 * 60 * 60;

router.post("/login", async (req: Request, res: Response) => {
  const pin: string = req.body?.pin ?? "";
  const ip = req.ip ?? "unknown";

  const rate = isRateLimited(ip);
  if (rate.limited) {
    res.status(429).json({ success: false, locked: true, remaining: rate.remaining });
    return;
  }

  if (verifyPin(pin)) {
    clearAttempts(ip);
    const token = createSessionToken();
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      maxAge: SEVEN_DAYS * 1000,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
    });
    res.json({ success: true });
  } else {
    const result = recordFailedAttempt(ip);
    res.status(401).json({
      success: false,
      locked: result.locked,
      attemptsLeft: result.attemptsLeft,
    });
  }
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

router.get("/check", (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token && verifySessionToken(token)) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

export default router;
