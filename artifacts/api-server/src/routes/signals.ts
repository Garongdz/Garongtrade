import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable } from "@workspace/db";
import { eq, desc, ne, and } from "drizzle-orm";
import {
  runScan, isScanRunning, lastScanAt, nextScanAt,
  scanSettings, updateScanSettings, apiUsage, apiStatus, SCAN_COINS, debugScanCoin,
} from "../services/scanner";

const router = Router();

// ── GET /api/market/top50 — CoinGecko top 50 by market cap ──────────────────
let top50Cache: { data: any[]; ts: number } | null = null;

router.get("/market/top50", async (_req, res) => {
  const now = Date.now();
  if (top50Cache && now - top50Cache.ts < 55_000) {
    res.setHeader("X-Cache", "HIT");
    return res.json(top50Cache.data);
  }

  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets" +
      "?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000) }
    );
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const data = await r.json();
    top50Cache = { data, ts: now };
    res.setHeader("X-Cache", "MISS");
    return res.json(data);
  } catch (e: any) {
    if (top50Cache) return res.json(top50Cache.data); // serve stale on error
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/market/funding-rates — multi-exchange weighted average ───────────
router.get("/market/funding-rates", async (_req, res) => {
  const COINS = ["BTC", "ETH", "SOL"] as const;
  const TIMEOUT = 5000;

  async function fetchBybit(coin: string): Promise<number | null> {
    try {
      const r = await fetch(
        `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${coin}USDT&limit=1`,
        { signal: AbortSignal.timeout(TIMEOUT) }
      );
      const j: any = await r.json();
      const raw = parseFloat(j?.result?.list?.[0]?.fundingRate ?? "");
      return isNaN(raw) ? null : raw * 100;
    } catch { return null; }
  }

  async function fetchOKX(coin: string): Promise<number | null> {
    try {
      const r = await fetch(
        `https://www.okx.com/api/v5/public/funding-rate?instId=${coin}-USDT-SWAP`,
        { signal: AbortSignal.timeout(TIMEOUT) }
      );
      const j: any = await r.json();
      const raw = parseFloat(j?.data?.[0]?.fundingRate ?? "");
      return isNaN(raw) ? null : raw * 100;
    } catch { return null; }
  }

  async function fetchGate(coin: string): Promise<number | null> {
    try {
      const r = await fetch(
        `https://api.gateio.ws/api/v4/futures/usdt/contracts/${coin}_USDT`,
        { signal: AbortSignal.timeout(TIMEOUT) }
      );
      const j: any = await r.json();
      const raw = parseFloat(j?.funding_rate ?? "");
      return isNaN(raw) ? null : raw * 100;
    } catch { return null; }
  }

  const coinResults = await Promise.all(
    COINS.map(async (coin) => {
      const [bybit, okx, gate] = await Promise.all([
        fetchBybit(coin), fetchOKX(coin), fetchGate(coin),
      ]);

      const pairs: Array<[number | null, number]> = [
        [bybit, 0.50], [okx, 0.30], [gate, 0.20],
      ];
      const available = pairs.filter(([v]) => v !== null);
      let avg: number | null = null;
      if (available.length > 0) {
        const totalW = available.reduce((s, [, w]) => s + w, 0);
        avg = available.reduce((s, [v, w]) => s + (v as number) * (w / totalW), 0);
      }

      return [coin, {
        avg,
        bybit,
        okx,
        gate,
        status: { bybit: bybit !== null, okx: okx !== null, gate: gate !== null },
      }] as const;
    })
  );

  const data: Record<string, any> = Object.fromEntries(coinResults);
  data.exchangeStatus = {
    bybit: coinResults.some(([, d]) => d.status.bybit),
    okx:   coinResults.some(([, d]) => d.status.okx),
    gate:  coinResults.some(([, d]) => d.status.gate),
  };

  res.json(data);
});

// ── GET /api/signals — active signals ────────────────────────────────────────
router.get("/signals", async (_req, res) => {
  try {
    const signals = await db.query.signalsTable.findMany({
      where: eq(signalsTable.status, "ACTIVE"),
      orderBy: [desc(signalsTable.confidence)],
    });
    res.json({ signals });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/signals/history — closed signals + stats ─────────────────────────
router.get("/signals/history", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || "50"), 200);
    const history = await db.query.signalsTable.findMany({
      where: ne(signalsTable.status, "ACTIVE"),
      orderBy: [desc(signalsTable.created_at)],
      limit,
    });

    // Stats (exclude EXPIRED from winrate)
    const closed = history.filter(s => s.status === "SL_HIT" || s.status?.startsWith("TP"));
    const wins = closed.filter(s => s.status?.startsWith("TP")).length;
    const losses = closed.filter(s => s.status === "SL_HIT").length;
    const winrate = wins + losses > 0 ? Math.round(wins / (wins + losses) * 1000) / 10 : 0;

    // Today signals
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todaySignals = await db.query.signalsTable.findMany({
      where: and(
        ne(signalsTable.status, "ACTIVE"),
      ),
    }).then(r => r.filter(s => s.created_at >= todayStart).length);

    const activeCount = await db.query.signalsTable.findMany({ where: eq(signalsTable.status, "ACTIVE") }).then(r => r.length);

    res.json({
      history,
      stats: {
        winrate,
        wins,
        losses,
        totalClosed: closed.length,
        activeCount,
        todayCount: todaySignals,
      },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/signals/scan — manual scan ──────────────────────────────────────
router.post("/signals/scan", async (_req, res) => {
  if (isScanRunning) { res.json({ message: "Scan sedang berjalan..." }); return; }
  runScan().catch(e => console.error("[Signals] scan error:", e));
  res.json({ message: "Scan dimulai", lastScanAt, nextScanAt });
});

// ── GET /api/signals/status — scanner state ───────────────────────────────────
router.get("/signals/status", (_req, res) => {
  res.json({
    isScanRunning,
    lastScanAt,
    nextScanAt,
    settings: scanSettings,
    availableCoins: SCAN_COINS,
  });
});

// ── GET /api/signals/settings ─────────────────────────────────────────────────
router.get("/signals/settings", (_req, res) => {
  res.json(scanSettings);
});

// ── PUT /api/signals/settings ─────────────────────────────────────────────────
router.put("/signals/settings", (req, res) => {
  const body = req.body;
  const allowed: Record<string, boolean> = { intervalHours: true, minConfidence: true, activeCoins: true, activeHoursStart: true, activeHoursEnd: true, aiEnabled: true };
  const update: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowed[k]) update[k] = v;
  }
  updateScanSettings(update as any);
  res.json(scanSettings);
});

// ── GET /api/signals/debug/:coin — debug single coin scan ────────────────────
router.get("/signals/debug/:coin", async (req, res) => {
  try {
    const result = await debugScanCoin(req.params.coin);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/signals/api-monitor ──────────────────────────────────────────────
router.get("/signals/api-monitor", (_req, res) => {
  res.json({
    usage: {
      blockchairDaily: { used: apiUsage.blockchairDaily, limit: 1440, unit: "hari" },
      claudeToday: { used: apiUsage.claudeCallsToday, limit: 2, unit: "hari" },
    },
    status: apiStatus,
  });
});

export default router;
