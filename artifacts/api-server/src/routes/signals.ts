import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable } from "@workspace/db";
import { eq, desc, ne, and } from "drizzle-orm";
import {
  runScan, isScanRunning, lastScanAt, nextScanAt,
  scanSettings, updateScanSettings, apiUsage, apiStatus, SCAN_COINS, debugScanCoin,
} from "../services/scanner";

const router = Router();

// ── GET /api/market/top50 — CryptoCompare top 100 by market cap ─────────────
const CC_BASE = "https://min-api.cryptocompare.com";
const CC_IMG  = "https://www.cryptocompare.com";

const TOP_COINS = [
  "BTC","ETH","BNB","SOL","XRP","DOGE","ADA","AVAX","TRX","DOT",
  "LINK","MATIC","LTC","SHIB","UNI","ATOM","XLM","BCH","ALGO","ICP",
  "FIL","VET","HBAR","ETC","NEAR","FTM","SAND","MANA","AXS","THETA",
  "GRT","AAVE","MKR","XTZ","SNX","CRV","COMP","YFI","SUSHI","1INCH",
  "ENJ","CHZ","FLOW","ZEC","DASH","XMR","EGLD","ROSE","KSM","CELO",
];

const COIN_NAMES: Record<string, string> = {
  BTC:"Bitcoin", ETH:"Ethereum", BNB:"BNB", SOL:"Solana", XRP:"XRP",
  DOGE:"Dogecoin", ADA:"Cardano", AVAX:"Avalanche", TRX:"TRON", DOT:"Polkadot",
  LINK:"Chainlink", MATIC:"Polygon", LTC:"Litecoin", SHIB:"Shiba Inu", UNI:"Uniswap",
  ATOM:"Cosmos", XLM:"Stellar", BCH:"Bitcoin Cash", ALGO:"Algorand", ICP:"Internet Computer",
  FIL:"Filecoin", VET:"VeChain", HBAR:"Hedera", ETC:"Ethereum Classic", NEAR:"NEAR Protocol",
  FTM:"Fantom", SAND:"The Sandbox", MANA:"Decentraland", AXS:"Axie Infinity", THETA:"Theta Network",
  GRT:"The Graph", AAVE:"Aave", MKR:"Maker", XTZ:"Tezos", SNX:"Synthetix",
  CRV:"Curve DAO", COMP:"Compound", YFI:"yearn.finance", SUSHI:"SushiSwap", "1INCH":"1inch",
  ENJ:"Enjin Coin", CHZ:"Chiliz", FLOW:"Flow", ZEC:"Zcash", DASH:"Dash",
  XMR:"Monero", EGLD:"MultiversX", ROSE:"Oasis Network", KSM:"Kusama", CELO:"Celo",
};

let top50Cache: { data: any[]; ts: number } | null = null;

router.get("/market/top50", async (_req, res) => {
  const now = Date.now();
  if (top50Cache && now - top50Cache.ts < 55_000) {
    res.setHeader("X-Cache", "HIT");
    return res.json(top50Cache.data);
  }

  try {
    const symbols = TOP_COINS.join(",");
    const r = await fetch(
      `${CC_BASE}/data/pricemultifull?fsyms=${symbols}&tsyms=USD`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000) }
    );
    if (!r.ok) throw new Error(`CryptoCompare ${r.status}`);

    const json: any = await r.json();
    const raw = json.RAW ?? {};

    const data = TOP_COINS
      .filter((sym) => raw[sym]?.USD)
      .map((sym, idx) => {
        const usd = raw[sym].USD;
        const price = usd.PRICE ?? 0;
        const open24 = price - (usd.CHANGE24HOUR ?? 0);
        return {
          id: sym.toLowerCase(),
          symbol: sym.toLowerCase(),
          name: COIN_NAMES[sym] ?? sym,
          current_price: price,
          price_change_24h: usd.CHANGE24HOUR ?? 0,
          price_change_percentage_24h: usd.CHANGEPCT24HOUR ?? 0,
          market_cap: usd.MKTCAP ?? 0,
          market_cap_rank: idx + 1,
          total_volume: usd.VOLUME24HOURTO ?? 0,
          high_24h: usd.HIGH24HOUR ?? price,
          low_24h: usd.LOW24HOUR ?? price,
          image: usd.IMAGEURL ? `${CC_IMG}${usd.IMAGEURL}` : "",
          ath: usd.HIGH24HOUR ?? price,
          ath_change_percentage: open24 > 0 ? ((price - open24) / open24) * 100 : 0,
          circulating_supply: usd.SUPPLY ?? 0,
        };
      });

    top50Cache = { data, ts: now };
    res.setHeader("X-Cache", "MISS");
    return res.json(data);
  } catch (e: any) {
    if (top50Cache) return res.json(top50Cache.data);
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
