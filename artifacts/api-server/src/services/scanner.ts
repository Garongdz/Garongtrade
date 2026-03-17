import { db } from "@workspace/db";
import { signalsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
});

// ── Constants ────────────────────────────────────────────────────────────────
export const SCAN_COINS = ["BTC","ETH","SOL","BNB","XRP","AVAX","ARB","OP","LINK","DOGE"] as const;
export type ScanCoin = typeof SCAN_COINS[number];

const COIN_SYMBOLS: Record<ScanCoin, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT",
  BNB: "BNBUSDT", XRP: "XRPUSDT", AVAX: "AVAXUSDT",
  ARB: "ARBUSDT", OP: "OPUSDT", LINK: "LINKUSDT", DOGE: "DOGEUSDT",
};
const COINGLASS_COINS = new Set(["BTC","ETH","SOL","BNB","XRP"]);
const BINANCE_SPOT = "https://api.binance.com/api/v3";
const BINANCE_FUT = "https://fapi.binance.com";

// ── Settings ─────────────────────────────────────────────────────────────────
export interface ScanSettings {
  intervalHours: 2 | 4 | 6;
  minConfidence: number;
  activeCoins: string[];
  activeHoursStart: number;
  activeHoursEnd: number;
  aiEnabled: boolean;
}
export let scanSettings: ScanSettings = {
  intervalHours: 2,
  minConfidence: 50,
  activeCoins: [...SCAN_COINS],
  activeHoursStart: 6,
  activeHoursEnd: 24,
  aiEnabled: true,
};
export function updateScanSettings(s: Partial<ScanSettings>) {
  scanSettings = { ...scanSettings, ...s };
  reschedule();
}

// ── API Usage / Status ────────────────────────────────────────────────────────
export const apiUsage = {
  coinglassMonthly: 0,
  blockchairDaily: 0,
  claudeCallsToday: 0,
  claudeCallsPerCoin: new Map<string, number>(),
};
export const apiStatus: Record<string, "online"|"down"|"unknown"> = {
  binanceSpot: "unknown", binanceFutures: "unknown",
  coinglass: "unknown", blockchair: "unknown",
  defillama: "unknown", mempool: "unknown",
  coingecko: "unknown", fearGreed: "unknown",
};

// Reset daily counters at midnight
setInterval(() => {
  const h = new Date().getHours();
  if (h === 0) {
    apiUsage.blockchairDaily = 0;
    apiUsage.claudeCallsToday = 0;
    apiUsage.claudeCallsPerCoin.clear();
  }
}, 60_000);

// ── Scan state ────────────────────────────────────────────────────────────────
export let lastScanAt: Date | null = null;
export let nextScanAt: Date | null = null;
export let isScanRunning = false;
let scanTimer: ReturnType<typeof setInterval> | null = null;

// Expose price getter (set from index.ts where ws price cache lives)
type PriceGetter = (symbol: string) => number | null;
let _priceGetter: PriceGetter = () => null;
export function setPriceGetter(fn: PriceGetter) { _priceGetter = fn; }

// ── Shared data caches ────────────────────────────────────────────────────────
interface OnChainData { txVolumeChange: number; mempoolCount: number; stablecoinChange24h: number; tvlChange24h: number; }
interface MacroData { fearGreed: number; btcDom: number; btcDomPrev: number; }
interface LayerResult { score: number; maxPossible: number; details: Record<string, number|string>; warnings: string[]; }

let onchainCache: { data: OnChainData; at: number } | null = null;
let macroCache: { data: MacroData; at: number } | null = null;
const OC_TTL = 30 * 60_000;
const MAC_TTL = 15 * 60_000;

// News sentiment — filled by news route
export let newsSentiment = { bullish: 0, bearish: 0 };
export function setNewsSentiment(b: number, r: number) { newsSentiment = { bullish: b, bearish: r }; }

// ── Helpers ───────────────────────────────────────────────────────────────────
async function safeFetch(url: string, opts?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(9000), headers: { "User-Agent": "GarongSpace/1.0", ...(opts?.headers ?? {}) } });
  } catch { return null; }
}

interface Candles { opens: number[]; highs: number[]; lows: number[]; closes: number[]; }

async function fetchCandlesCC(coin: string, interval: string, limit: number): Promise<Candles | null> {
  // CryptoCompare historical candles as primary source
  // interval mapping: "4h" -> histohour aggregate 4, "1h" -> histohour, "1d" -> histoday
  let endpoint = "histohour", aggregate = 1;
  if (interval === "4h") { endpoint = "histohour"; aggregate = 4; }
  else if (interval === "1h") { endpoint = "histohour"; aggregate = 1; }
  else if (interval === "1d") { endpoint = "histoday"; aggregate = 1; }
  // coin from symbol: BTCUSDT -> BTC
  const fsym = coin.replace("USDT", "");
  const res = await safeFetch(`https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${fsym}&tsym=USD&limit=${limit}&aggregate=${aggregate}`);
  if (!res?.ok) return null;
  const j = await res.json() as any;
  const data = j?.Data?.Data ?? [];
  if (!data.length) return null;
  return { opens: data.map((c: any) => c.open), highs: data.map((c: any) => c.high), lows: data.map((c: any) => c.low), closes: data.map((c: any) => c.close) };
}

async function fetchCandles(symbol: string, interval: string, limit: number): Promise<Candles | null> {
  // Try Binance first, fall back to CryptoCompare
  const res = await safeFetch(`${BINANCE_SPOT}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (res?.ok) {
    apiStatus.binanceSpot = "online";
    const d = await res.json() as any[][];
    return { opens: d.map(c=>+c[1]), highs: d.map(c=>+c[2]), lows: d.map(c=>+c[3]), closes: d.map(c=>+c[4]) };
  }
  apiStatus.binanceSpot = "down";
  // CryptoCompare fallback
  const cc = await fetchCandlesCC(symbol, interval, limit);
  if (cc) apiStatus.binanceSpot = "online (CC)";
  return cc;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i-1]; if (d > 0) g += d; else l += Math.abs(d);
  }
  const ag = g / period, al = l / period;
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

// ── LAYER 1: TECHNICAL ────────────────────────────────────────────────────────
async function layerTechnical(symbol: string, price: number): Promise<LayerResult> {
  const w: string[] = [], d: Record<string, number|string> = {};
  const c = await fetchCandles(symbol, "4h", 22);
  if (!c) { w.push("⚠ Candle data tidak tersedia, Technical dilewati"); return { score: 0, maxPossible: 0, details: d, warnings: w }; }

  const rsi = calcRSI(c.closes);
  d.rsi = Math.round(rsi * 10) / 10;
  const sRsi = rsi < 30 ? 1 : rsi > 70 ? -1 : 0;

  const res = Math.max(...c.highs.slice(-20)), sup = Math.min(...c.lows.slice(-20));
  const pos = res > sup ? (price - sup) / (res - sup) : 0.5;
  const sSr = pos < 0.25 ? 1 : pos > 0.75 ? -1 : 0;

  d.resistance = res; d.support = sup; d.pricePos = Math.round(pos * 100) / 100;
  d.swingLow = Math.min(...c.lows.slice(-5));
  d.swingHigh = Math.max(...c.highs.slice(-5));
  d.scoreRsi = sRsi; d.scoreSr = sSr;

  return { score: Math.max(-2, Math.min(2, sRsi + sSr)), maxPossible: 2, details: d, warnings: w };
}

// ── LAYER 2: DERIVATIVES ──────────────────────────────────────────────────────
async function layerDerivatives(coin: string, symbol: string, price: number, priceChange4h: number): Promise<LayerResult> {
  const w: string[] = [], d: Record<string, number|string> = {};

  // Funding rate
  let funding: number | null = null;
  // Try CoinGlass if key set and coin supported
  if (COINGLASS_COINS.has(coin) && process.env.COINGLASS_API_KEY) {
    const cg = await safeFetch(`https://open-api.coinglass.com/api/pro/v1/futures/fundingRate/list?symbol=${coin}`, {
      headers: { "coinglassSecret": process.env.COINGLASS_API_KEY }
    });
    if (cg?.ok) {
      const j = await cg.json() as any;
      const bn = j?.data?.find?.((x: any) => x.exchangeName === "Binance");
      funding = bn ? parseFloat(bn.currentFundingRate || "0") * 100 : null;
      apiUsage.coinglassMonthly++;
      apiStatus.coinglass = "online";
    } else { apiStatus.coinglass = "down"; }
  }
  // Fallback: Binance futures
  if (funding === null) {
    const r = await safeFetch(`${BINANCE_FUT}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`);
    if (r?.ok) {
      const j = await r.json() as any[];
      funding = j?.[0] ? parseFloat(j[0].fundingRate) * 100 : 0;
      apiStatus.binanceFutures = "online";
    } else {
      apiStatus.binanceFutures = "down";
      w.push("⚠ Binance Futures tidak tersedia, Derivatives dilewati");
      return { score: 0, maxPossible: 0, details: { fundingRate: 0, oiChange: 0, lsRatio: 0, takerRatio: 0 }, warnings: w };
    }
  }

  // OI change
  let scoreOi = 0;
  const oiRes = await safeFetch(`${BINANCE_FUT}/futures/data/openInterestHist?symbol=${symbol}&period=4h&limit=2`);
  if (oiRes?.ok) {
    const oi = await oiRes.json() as any[];
    if (oi.length >= 2) {
      const cur = +oi[1].sumOpenInterestValue, prev = +oi[0].sumOpenInterestValue;
      const oiChg = prev > 0 ? (cur - prev) / prev * 100 : 0;
      d.oiChange = Math.round(oiChg * 100) / 100;
      if (oiChg > 5 && priceChange4h > 0) scoreOi = 1;
      else if (oiChg > 5 && priceChange4h < 0) scoreOi = -1;
      else if (oiChg < -5) scoreOi = -1;
    }
  }

  // Long/Short ratio
  let scoreLs = 0;
  const lsRes = await safeFetch(`${BINANCE_FUT}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`);
  if (lsRes?.ok) {
    const ls = await lsRes.json() as any[];
    const ratio = ls?.[0] ? parseFloat(ls[0].longShortRatio) : null;
    if (ratio !== null) {
      d.lsRatio = Math.round(ratio * 100) / 100;
      if (ratio < 0.85) scoreLs = 1;
      else if (ratio > 1.5) scoreLs = -1;
    }
  }

  // Taker buy/sell
  let scoreFlow = 0;
  const tkRes = await safeFetch(`${BINANCE_FUT}/futures/data/takerlongshortRatio?symbol=${symbol}&period=1h&limit=1`);
  if (tkRes?.ok) {
    const tk = await tkRes.json() as any[];
    const bsr = tk?.[0] ? parseFloat(tk[0].buySellRatio) : null;
    if (bsr !== null) {
      const buyFrac = bsr / (1 + bsr);
      d.takerBuyFrac = Math.round(buyFrac * 1000) / 1000;
      if (buyFrac > 0.55) scoreFlow = 1;
      else if (buyFrac < 0.45) scoreFlow = -1;
    }
  }

  const sFund = funding < -0.03 ? 2 : funding < -0.01 ? 1 : funding <= 0.01 ? 0 : funding <= 0.03 ? -1 : -2;
  d.fundingRate = Math.round(funding * 10000) / 10000;
  d.scoreFunding = sFund; d.scoreOi = scoreOi; d.scoreLs = scoreLs; d.scoreFlow = scoreFlow;

  return { score: Math.max(-5, Math.min(5, sFund + scoreOi + scoreLs + scoreFlow)), maxPossible: 5, details: d, warnings: w };
}

// ── LAYER 3: ON-CHAIN ─────────────────────────────────────────────────────────
async function fetchOnChain(): Promise<OnChainData | null> {
  if (onchainCache && Date.now() - onchainCache.at < OC_TTL) return onchainCache.data;
  let txVolumeChange = 0, mempoolCount = 5000, stablecoinChange24h = 0, tvlChange24h = 0;

  // Blockchair
  const bc = await safeFetch("https://api.blockchair.com/bitcoin/stats");
  if (bc?.ok) {
    const j = await bc.json() as any;
    const vol24 = j?.data?.volume_24h ?? 0;
    const vol7d = j?.data?.volume_7d ?? vol24 * 7;
    txVolumeChange = vol7d > 0 ? (vol24 - vol7d / 7) / (vol7d / 7) * 100 : 0;
    apiUsage.blockchairDaily++;
    apiStatus.blockchair = "online";
  } else { apiStatus.blockchair = "down"; }

  // Mempool
  const mp = await safeFetch("https://mempool.space/api/mempool");
  if (mp?.ok) {
    const j = await mp.json() as any;
    mempoolCount = j?.count ?? 5000;
    apiStatus.mempool = "online";
  } else { apiStatus.mempool = "down"; }

  // DeFiLlama stablecoins
  const sc = await safeFetch("https://stablecoins.llama.fi/stablecoins?includePrices=true");
  if (sc?.ok) {
    const j = await sc.json() as any;
    const coins: any[] = (j?.peggedAssets ?? []).filter((c: any) => c.symbol === "USDT" || c.symbol === "USDC");
    let total = 0, prev = 0;
    coins.forEach((c: any) => {
      const cur = c.circulating?.peggedUSD ?? 0;
      const chg7 = c.change_7d ?? 0;
      total += cur;
      prev += cur / (1 + chg7 / 100);
    });
    stablecoinChange24h = prev > 0 ? (total - prev) / prev / 7 * 100 : 0;
    apiStatus.defillama = "online";
  } else { apiStatus.defillama = "down"; }

  // DeFiLlama TVL
  const tv = await safeFetch("https://api.llama.fi/v2/globalCharts");
  if (tv?.ok) {
    const j = await tv.json() as Array<{ date: number; totalLiquidityUSD: number }>;
    if (j.length >= 2) {
      const l = j[j.length - 1].totalLiquidityUSD, p = j[j.length - 2].totalLiquidityUSD;
      tvlChange24h = p > 0 ? (l - p) / p * 100 : 0;
    }
  }

  const data = { txVolumeChange, mempoolCount, stablecoinChange24h, tvlChange24h };
  onchainCache = { data, at: Date.now() };
  return data;
}

async function layerOnChain(): Promise<LayerResult> {
  const w: string[] = [], d: Record<string, number|string> = {};
  const data = await fetchOnChain();
  if (!data) { w.push("⚠ On-chain data tidak tersedia"); return { score: 0, maxPossible: 0, details: d, warnings: w }; }
  if (apiStatus.blockchair === "down") w.push("⚠ Blockchair sedang tidak tersedia, data layer ini dilewati");

  const sNet = (data.mempoolCount < 5000 && data.txVolumeChange < -5) ? 2 : data.txVolumeChange < -5 ? 1 : data.txVolumeChange > 20 ? -1 : (data.mempoolCount > 50000 && data.txVolumeChange > 10) ? -2 : 0;
  const sSt = data.stablecoinChange24h > 1 ? 1 : data.stablecoinChange24h < -1 ? -1 : 0;
  const sTvl = data.tvlChange24h > 3 ? 1 : data.tvlChange24h < -3 ? -1 : 0;
  const sMp = data.mempoolCount > 50000 ? 0.5 : data.mempoolCount < 5000 ? -0.5 : 0;

  d.mempoolCount = data.mempoolCount;
  d.txVolumeChange = Math.round(data.txVolumeChange * 10) / 10;
  d.stablecoinChange24h = Math.round(data.stablecoinChange24h * 100) / 100;
  d.tvlChange24h = Math.round(data.tvlChange24h * 100) / 100;
  d.scoreNet = sNet; d.scoreSt = sSt; d.scoreTvl = sTvl; d.scoreMp = sMp;

  const raw = sNet + sSt + sTvl + sMp;
  return { score: Math.max(-4, Math.min(4, Math.round(raw * 2) / 2)), maxPossible: 4, details: d, warnings: w };
}

// ── LAYER 4: MACRO ────────────────────────────────────────────────────────────
async function fetchMacro(): Promise<MacroData | null> {
  if (macroCache && Date.now() - macroCache.at < MAC_TTL) return macroCache.data;
  let fearGreed = 50, btcDom = 55, btcDomPrev = macroCache?.data.btcDom ?? 55;

  const fg = await safeFetch("https://api.alternative.me/fng/?limit=1");
  if (fg?.ok) {
    const j = await fg.json() as any;
    fearGreed = parseInt(j?.data?.[0]?.value ?? "50");
    apiStatus.fearGreed = "online";
  } else { apiStatus.fearGreed = "down"; }

  const cg = await safeFetch("https://api.coingecko.com/api/v3/global");
  if (cg?.ok) {
    const j = await cg.json() as any;
    btcDom = j?.data?.market_cap_percentage?.btc ?? 55;
    apiStatus.coingecko = "online";
  } else { apiStatus.coingecko = "down"; }

  const data = { fearGreed, btcDom, btcDomPrev };
  macroCache = { data, at: Date.now() };
  return data;
}

async function layerMacro(coin: string): Promise<LayerResult> {
  const w: string[] = [], d: Record<string, number|string> = {};
  const data = await fetchMacro();
  if (!data) { w.push("⚠ Macro data tidak tersedia"); return { score: 0, maxPossible: 0, details: d, warnings: w }; }

  const sFg = data.fearGreed < 20 ? 2 : data.fearGreed < 35 ? 1 : data.fearGreed > 80 ? -2 : data.fearGreed > 65 ? -1 : 0;
  const domChg = data.btcDom - data.btcDomPrev;
  const sDom = coin === "BTC" ? (domChg > 0.5 ? 1 : domChg < -0.5 ? -1 : 0) : (domChg > 0.5 ? -1 : domChg < -0.5 ? 1 : 0);
  const sNews = newsSentiment.bullish > newsSentiment.bearish + 5 ? 1 : newsSentiment.bearish > newsSentiment.bullish + 5 ? -1 : 0;

  d.fearGreed = data.fearGreed; d.btcDom = Math.round(data.btcDom * 100) / 100;
  d.domChange = Math.round(domChg * 100) / 100; d.newsBullish = newsSentiment.bullish; d.newsBearish = newsSentiment.bearish;
  d.scoreFg = sFg; d.scoreDom = sDom; d.scoreNews = sNews;

  return { score: Math.max(-4, Math.min(4, sFg + sDom + sNews)), maxPossible: 4, details: d, warnings: w };
}

// ── ENTRY LEVELS ──────────────────────────────────────────────────────────────
function calcLevels(dir: "LONG"|"SHORT", price: number, swingLow: number, swingHigh: number) {
  const eL = price * 0.995, eH = price * 1.005;
  if (dir === "LONG") {
    const sl = swingLow * 0.997, dist = price - sl;
    return { entryLow: eL, entryHigh: eH, stopLoss: sl, tp1: price + dist*1.5, tp2: price + dist*3, tp3: price + dist*5 };
  } else {
    const sl = swingHigh * 1.003, dist = sl - price;
    return { entryLow: eL, entryHigh: eH, stopLoss: sl, tp1: price - dist*1.5, tp2: price - dist*3, tp3: price - dist*5 };
  }
}

// ── CLAUDE REASONING ──────────────────────────────────────────────────────────
async function getAIReasoning(coin: string, dir: string, ns: number, layers: any, lvl: ReturnType<typeof calcLevels>) {
  if (!scanSettings.aiEnabled || ns < 8.0) return null;
  if ((apiUsage.claudeCallsPerCoin.get(coin) ?? 0) >= 1) return null;
  if (apiUsage.claudeCallsToday >= 2) return null;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001", max_tokens: 256,
      messages: [{ role: "user", content: `Crypto analyst. ${coin} ${dir}.\nScore:${ns}/10\nFunding:${layers.derivatives?.fundingRate??0}% OI:${layers.derivatives?.oiChange??0}% LS:${layers.derivatives?.lsRatio??0}\nFG:${layers.macro?.fearGreed??50} TVL:${layers.onchain?.tvlChange24h??0}%\nEntry:${lvl.entryHigh.toFixed(2)} SL:${lvl.stopLoss.toFixed(2)} TP1:${lvl.tp1.toFixed(2)}\nJSON only: {"verdict":"VALID/INVALID/CAUTION","reason":"2 kalimat Bahasa Indonesia","key_risk":"1 kalimat"}` }],
    });
    const txt = msg.content.find(b => b.type === "text")?.text ?? "{}";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]);
    apiUsage.claudeCallsToday++;
    apiUsage.claudeCallsPerCoin.set(coin, (apiUsage.claudeCallsPerCoin.get(coin) ?? 0) + 1);
    return { verdict: p.verdict || "CAUTION", reason: p.reason || "", keyRisk: p.key_risk || "" };
  } catch { return null; }
}

// ── SCAN SINGLE COIN ──────────────────────────────────────────────────────────
export async function scanCoin(coin: ScanCoin): Promise<void> {
  const symbol = COIN_SYMBOLS[coin];
  // Duplicate prevention
  const existing = await db.query.signalsTable.findFirst({ where: and(eq(signalsTable.coin, coin), eq(signalsTable.status, "ACTIVE")) });
  if (existing) return;

  // Get price
  let price = _priceGetter(symbol);
  if (!price) {
    const r = await safeFetch(`${BINANCE_SPOT}/ticker/price?symbol=${symbol}`);
    if (r?.ok) { const j = await r.json() as any; price = parseFloat(j.price); }
  }
  if (!price) return;

  // 4h price change for OI scoring
  const c4h = await fetchCandles(symbol, "4h", 3);
  const pChg4h = c4h && c4h.closes.length >= 2 ? (c4h.closes.at(-1)! - c4h.closes.at(-2)!) / c4h.closes.at(-2)! * 100 : 0;

  // Run all 4 layers in parallel
  const [tech, deriv, oc, macro] = await Promise.all([
    layerTechnical(symbol, price),
    layerDerivatives(coin, symbol, price, pChg4h),
    layerOnChain(),
    layerMacro(coin),
  ]);

  const rawScore = tech.score + deriv.score + oc.score + macro.score;
  // Normalize by the actual achievable max (based on layers with data available)
  const totalMax = tech.maxPossible + deriv.maxPossible + oc.maxPossible + macro.maxPossible;
  const divisor = totalMax > 0 ? totalMax : 15;
  const ns = Math.round(rawScore / divisor * 100) / 10;
  const conf = Math.min(100, Math.abs(ns) * 10);

  // Signal trigger
  let dir: "LONG"|"SHORT"|null = null;
  let risk: "SAFE"|"MODERAT"|"RISKY"|null = null;
  if (ns >= 6.0) { dir = "LONG"; risk = conf >= 80 ? "SAFE" : "MODERAT"; }
  else if (ns <= -6.0) { dir = "SHORT"; risk = conf >= 80 ? "SAFE" : "MODERAT"; }
  else if (ns >= 5.0) { dir = "LONG"; risk = "RISKY"; }
  else if (ns <= -5.0) { dir = "SHORT"; risk = "RISKY"; }
  if (!dir || conf < scanSettings.minConfidence) return;

  const swingLow = (tech.details.swingLow as number) || price * 0.98;
  const swingHigh = (tech.details.swingHigh as number) || price * 1.02;
  const lvls = calcLevels(dir, price, swingLow, swingHigh);
  const layerDetails = { technical: tech.details, derivatives: deriv.details, onchain: oc.details, macro: macro.details };
  const aiResult = await getAIReasoning(coin, dir, ns, layerDetails, lvls);
  const warnings = [...tech.warnings, ...deriv.warnings, ...oc.warnings, ...macro.warnings];

  await db.insert(signalsTable).values({
    coin, symbol, direction: dir, risk_level: risk,
    confidence: conf, normalized_score: ns, raw_score: rawScore,
    technical_score: tech.score, derivatives_score: deriv.score,
    onchain_score: oc.score, macro_score: macro.score,
    current_price: price,
    entry_low: lvls.entryLow, entry_high: lvls.entryHigh,
    stop_loss: lvls.stopLoss, tp1: lvls.tp1, tp2: lvls.tp2, tp3: lvls.tp3,
    status: "ACTIVE",
    layer_details: layerDetails as any,
    api_warnings: warnings as any,
    ai_verdict: aiResult?.verdict ?? null,
    ai_reason: aiResult?.reason ?? null,
    ai_key_risk: aiResult?.keyRisk ?? null,
    expires_at: new Date(Date.now() + 4 * 3600_000),
  });

  console.log(`[Scanner] NEW ${dir} ${coin} | Score:${ns} | Conf:${conf}% | Risk:${risk}`);
}

// ── FULL SCAN ─────────────────────────────────────────────────────────────────
export async function runScan(): Promise<{ scanned: number; signals: number }> {
  if (isScanRunning) return { scanned: 0, signals: 0 };
  isScanRunning = true;
  lastScanAt = new Date();
  let scanned = 0;

  // Check active hours (WIB = UTC+7)
  const nowWIB = new Date(Date.now() + 7 * 3600_000);
  const wibH = nowWIB.getUTCHours();
  if (wibH < scanSettings.activeHoursStart || wibH >= scanSettings.activeHoursEnd) {
    console.log(`[Scanner] Outside active hours (${wibH} WIB), skip`);
    isScanRunning = false;
    return { scanned: 0, signals: 0 };
  }

  const before = await db.query.signalsTable.findMany({ where: eq(signalsTable.status, "ACTIVE") }).then(r => r.length);

  for (const coin of scanSettings.activeCoins as ScanCoin[]) {
    try { await scanCoin(coin); scanned++; } catch (e) { console.error(`[Scanner] ${coin} error:`, e); }
    await new Promise(r => setTimeout(r, 400));
  }

  const after = await db.query.signalsTable.findMany({ where: eq(signalsTable.status, "ACTIVE") }).then(r => r.length);
  isScanRunning = false;
  return { scanned, signals: after - before };
}

// ── STATUS TRACKER (every 1 min) ──────────────────────────────────────────────
export async function trackStatuses(): Promise<void> {
  try {
    const active = await db.query.signalsTable.findMany({ where: eq(signalsTable.status, "ACTIVE") });
    for (const s of active) {
      const price = _priceGetter(s.symbol);
      if (!price) continue;
      const now = new Date();
      let newStatus: string | null = null;

      if (now > s.expires_at) { newStatus = "EXPIRED"; }
      else if (Math.abs(price - (s.entry_low + s.entry_high) / 2) / ((s.entry_low + s.entry_high) / 2) > 0.03) { newStatus = "EXPIRED"; }
      else if (s.direction === "LONG") {
        if (price >= s.tp3) newStatus = "TP3_HIT";
        else if (price >= s.tp2) newStatus = "TP2_HIT";
        else if (price >= s.tp1) newStatus = "TP1_HIT";
        else if (price <= s.stop_loss) newStatus = "SL_HIT";
      } else {
        if (price <= s.tp3) newStatus = "TP3_HIT";
        else if (price <= s.tp2) newStatus = "TP2_HIT";
        else if (price <= s.tp1) newStatus = "TP1_HIT";
        else if (price >= s.stop_loss) newStatus = "SL_HIT";
      }
      if (newStatus) {
        await db.update(signalsTable).set({ status: newStatus, closed_at: now, close_price: price }).where(eq(signalsTable.id, s.id));
        console.log(`[Scanner] ${s.coin} ${s.direction} → ${newStatus} @ ${price}`);
      }
    }
  } catch (e) { console.error("[Scanner] trackStatuses error:", e); }
}

// ── DEBUG: scan without saving ────────────────────────────────────────────────
export async function debugScanCoin(coinInput: string): Promise<Record<string, any>> {
  const coin = coinInput.toUpperCase() as ScanCoin;
  const symbol = COIN_SYMBOLS[coin] ?? `${coin}USDT`;
  let price = _priceGetter(symbol);
  if (!price) {
    const r = await safeFetch(`${BINANCE_SPOT}/ticker/price?symbol=${symbol}`);
    if (r?.ok) { const j = await r.json() as any; price = parseFloat(j.price); }
  }
  if (!price) return { error: "Price not available" };
  const c4h = await fetchCandles(symbol, "4h", 3);
  const pChg4h = c4h && c4h.closes.length >= 2 ? (c4h.closes.at(-1)! - c4h.closes.at(-2)!) / c4h.closes.at(-2)! * 100 : 0;
  const [tech, deriv, oc, macro] = await Promise.all([
    layerTechnical(symbol, price),
    layerDerivatives(coin, symbol, price, pChg4h),
    layerOnChain(),
    layerMacro(coin),
  ]);
  const rawScore = tech.score + deriv.score + oc.score + macro.score;
  const totalMax = tech.maxPossible + deriv.maxPossible + oc.maxPossible + macro.maxPossible;
  const divisor = totalMax > 0 ? totalMax : 15;
  const ns = Math.round(rawScore / divisor * 100) / 10;
  return {
    coin, symbol, price, rawScore, normalizedScore: ns, divisor, totalMax,
    thresholds: { risky: 5.0, moderate: 6.0 },
    layers: {
      technical: { score: tech.score, maxPossible: tech.maxPossible, details: tech.details, warnings: tech.warnings },
      derivatives: { score: deriv.score, maxPossible: deriv.maxPossible, details: deriv.details, warnings: deriv.warnings },
      onchain: { score: oc.score, maxPossible: oc.maxPossible, details: oc.details, warnings: oc.warnings },
      macro: { score: macro.score, maxPossible: macro.maxPossible, details: macro.details, warnings: macro.warnings },
    },
    wouldTrigger: Math.abs(ns) >= 5.0,
    direction: ns >= 5.0 ? "LONG" : ns <= -5.0 ? "SHORT" : null,
  };
}

// ── SCHEDULER ─────────────────────────────────────────────────────────────────
function reschedule() {
  if (scanTimer) clearInterval(scanTimer);
  const ms = scanSettings.intervalHours * 3600_000;
  nextScanAt = new Date(Date.now() + ms);
  scanTimer = setInterval(() => { nextScanAt = new Date(Date.now() + ms); runScan(); }, ms);
}

export function startScanner(pg: PriceGetter) {
  setPriceGetter(pg);
  // Initial scan in 20s (after server ready)
  setTimeout(() => runScan(), 20_000);
  reschedule();
  setInterval(trackStatuses, 60_000);
  console.log(`[Scanner] Started. Interval: ${scanSettings.intervalHours}h. Initial scan in 20s.`);
}
