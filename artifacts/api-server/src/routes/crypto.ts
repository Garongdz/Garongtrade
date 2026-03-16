import { Router, type IRouter } from "express";
import { db, watchlistTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetCryptoPricesResponse,
  GetMarketOverviewResponse,
  GetCryptoHistoryResponse,
  GetTrendingCoinsResponse,
  GetWatchlistResponse,
  AddToWatchlistBody,
  RemoveFromWatchlistResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const CC_BASE = "https://min-api.cryptocompare.com";
const CC_IMG = "https://www.cryptocompare.com";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  return null;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

async function ccFetch(path: string) {
  const cached = getCached(path);
  if (cached) return cached;

  const res = await fetch(`${CC_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`CryptoCompare request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  setCached(path, data);
  return data;
}

const TOP_COINS = [
  "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "AVAX", "TRX", "DOT",
  "LINK", "MATIC", "LTC", "SHIB", "UNI", "ATOM", "XLM", "BCH", "ALGO", "ICP",
  "FIL", "VET", "HBAR", "ETC", "NEAR", "FTM", "SAND", "MANA", "AXS", "THETA",
  "GRT", "AAVE", "MKR", "XTZ", "SNX", "CRV", "COMP", "YFI", "SUSHI", "1INCH",
  "ENJ", "CHZ", "FLOW", "ZEC", "DASH", "XMR", "EGLD", "ROSE", "KSM", "CELO"
];

router.get("/crypto/prices", async (_req, res) => {
  try {
    const symbols = TOP_COINS.slice(0, 30).join(",");
    const data = await ccFetch(`/data/pricemultifull?fsyms=${symbols}&tsyms=USD`) as any;
    const raw = data.RAW ?? {};
    const display = data.DISPLAY ?? {};

    const prices = GetCryptoPricesResponse.parse(
      Object.entries(raw).map(([symbol, markets]: [string, any]) => {
        const usd = markets.USD ?? {};
        const disp = display[symbol]?.USD ?? {};
        return {
          id: symbol.toLowerCase(),
          symbol: symbol.toLowerCase(),
          name: disp.FROMSYMBOL || symbol,
          current_price: usd.PRICE ?? 0,
          price_change_24h: usd.CHANGE24HOUR ?? 0,
          price_change_percentage_24h: usd.CHANGEPCT24HOUR ?? 0,
          market_cap: usd.MKTCAP ?? 0,
          market_cap_rank: TOP_COINS.indexOf(symbol) + 1,
          total_volume: usd.VOLUME24HOURTO ?? 0,
          high_24h: usd.HIGH24HOUR ?? 0,
          low_24h: usd.LOW24HOUR ?? 0,
          image: usd.IMAGEURL ? `${CC_IMG}${usd.IMAGEURL}` : "",
          ath: usd.HIGH24HOUR ?? 0,
          ath_change_percentage: 0,
          circulating_supply: usd.SUPPLY ?? 0,
        };
      }).sort((a, b) => a.market_cap_rank - b.market_cap_rank)
    );
    res.json(prices);
  } catch (err) {
    console.error("Error fetching crypto prices:", err);
    res.status(500).json({ error: "Failed to fetch crypto prices" });
  }
});

router.get("/crypto/market-overview", async (_req, res) => {
  try {
    const btcData = await ccFetch("/data/pricemultifull?fsyms=BTC,ETH&tsyms=USD") as any;
    const btcRaw = btcData.RAW?.BTC?.USD ?? {};
    const ethRaw = btcData.RAW?.ETH?.USD ?? {};
    const totalMktCap = btcRaw.TOTALTOPTIERVOLUME24HTO ?? 0;
    const btcMktCap = btcRaw.MKTCAP ?? 0;
    const ethMktCap = ethRaw.MKTCAP ?? 0;
    const totalVol = (btcRaw.VOLUME24HOURTO ?? 0) + (ethRaw.VOLUME24HOURTO ?? 0);

    const estimatedTotalMktCap = btcMktCap / 0.55;

    const overview = GetMarketOverviewResponse.parse({
      total_market_cap: estimatedTotalMktCap,
      total_volume_24h: totalVol,
      btc_dominance: estimatedTotalMktCap > 0 ? (btcMktCap / estimatedTotalMktCap) * 100 : 0,
      eth_dominance: estimatedTotalMktCap > 0 ? (ethMktCap / estimatedTotalMktCap) * 100 : 0,
      market_cap_change_24h: btcRaw.CHANGEPCT24HOUR ?? 0,
      active_cryptocurrencies: 10000,
      fear_greed_index: 65,
      fear_greed_label: "Greed",
    });
    res.json(overview);
  } catch (err) {
    console.error("Error fetching market overview:", err);
    res.status(500).json({ error: "Failed to fetch market overview" });
  }
});

router.get("/crypto/:symbol/history", async (req, res) => {
  const { symbol } = req.params;
  const days = Number(req.query.days) || 7;

  const fsym = symbol.toUpperCase();
  let endpoint: string;
  if (days <= 1) {
    endpoint = `/data/v2/histohour?fsym=${fsym}&tsym=USD&limit=24`;
  } else if (days <= 30) {
    endpoint = `/data/v2/histoday?fsym=${fsym}&tsym=USD&limit=${days}`;
  } else {
    endpoint = `/data/v2/histoday?fsym=${fsym}&tsym=USD&limit=${days}`;
  }

  try {
    const data = await ccFetch(endpoint) as any;
    const points = data.Data?.Data ?? [];
    const history = GetCryptoHistoryResponse.parse(
      points.map((point: any) => ({
        timestamp: new Date(point.time * 1000).toISOString(),
        open: point.open ?? 0,
        high: point.high ?? 0,
        low: point.low ?? 0,
        close: point.close ?? 0,
        volume: point.volumefrom ?? 0,
      }))
    );
    res.json(history);
  } catch (err) {
    console.error("Error fetching price history:", err);
    res.status(500).json({ error: "Failed to fetch price history" });
  }
});

router.get("/crypto/trending", async (_req, res) => {
  try {
    const trendingSymbols = ["SOL", "HYPE", "PENGU", "ZEC", "PEPE", "WIF", "BONK", "JUP"];
    const symbols = trendingSymbols.join(",");
    const data = await ccFetch(`/data/pricemultifull?fsyms=${symbols}&tsyms=USD`) as any;
    const raw = data.RAW ?? {};

    const trending = GetTrendingCoinsResponse.parse(
      trendingSymbols
        .filter((sym) => raw[sym]?.USD)
        .map((sym, idx) => {
          const usd = raw[sym]?.USD ?? {};
          return {
            id: sym.toLowerCase(),
            symbol: sym.toLowerCase(),
            name: sym,
            market_cap_rank: idx + 1,
            price_btc: 0,
            score: trendingSymbols.length - idx,
            image: usd.IMAGEURL ? `${CC_IMG}${usd.IMAGEURL}` : "",
            price_change_percentage_24h: usd.CHANGEPCT24HOUR ?? 0,
            current_price_usd: usd.PRICE ?? 0,
          };
        })
    );
    res.json(trending);
  } catch (err) {
    console.error("Error fetching trending coins:", err);
    res.status(500).json({ error: "Failed to fetch trending coins" });
  }
});

router.get("/watchlist", async (_req, res) => {
  try {
    const items = await db.select().from(watchlistTable);
    const result = GetWatchlistResponse.parse(
      items.map((item) => ({
        ...item,
        added_at: item.added_at.toISOString(),
      }))
    );
    res.json(result);
  } catch (err) {
    console.error("Error fetching watchlist:", err);
    res.status(500).json({ error: "Failed to fetch watchlist" });
  }
});

router.post("/watchlist", async (req, res) => {
  try {
    const body = AddToWatchlistBody.parse(req.body);
    const [item] = await db
      .insert(watchlistTable)
      .values({ symbol: body.symbol.toUpperCase(), name: body.name })
      .onConflictDoNothing()
      .returning();
    if (!item) {
      res.status(409).json({ error: "Already in watchlist" });
      return;
    }
    res.status(201).json({ ...item, added_at: item.added_at.toISOString() });
  } catch (err) {
    console.error("Error adding to watchlist:", err);
    res.status(500).json({ error: "Failed to add to watchlist" });
  }
});

router.delete("/watchlist/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    await db
      .delete(watchlistTable)
      .where(eq(watchlistTable.symbol, symbol.toUpperCase()));
    const result = RemoveFromWatchlistResponse.parse({ message: "Removed from watchlist" });
    res.json(result);
  } catch (err) {
    console.error("Error removing from watchlist:", err);
    res.status(500).json({ error: "Failed to remove from watchlist" });
  }
});

export default router;
