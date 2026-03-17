import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
import { startScanner, setNewsSentiment } from "./services/scanner";
import { newsCache } from "./routes/news";
import { updatePriceStore } from "./services/priceStore";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const server = http.createServer(app);

// ── WebSocket Price Stream ────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: "/api/ws/prices" });
const clients = new Set<WebSocket>();

// Latest price cache for scanner
const priceCache = new Map<string, number>();

wss.on("connection", (client) => {
  clients.add(client);
  if (latestPayload) client.send(latestPayload);
  client.on("close", () => clients.delete(client));
  client.on("error", () => clients.delete(client));
});

function broadcast(payload: string) {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

// ── CryptoCompare polling ─────────────────────────────────────────────────────
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

let latestPayload: string | null = null;
let pollTimer: ReturnType<typeof setInterval>;

// ── CoinPaprika fallback ──────────────────────────────────────────────────────
const CP_BASE = "https://api.coinpaprika.com/v1";
const TOP_SYMBOLS_SET = new Set(TOP_COINS);

async function fetchFromCoinPaprika(): Promise<boolean> {
  try {
    const r = await fetch(`${CP_BASE}/tickers?limit=200`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return false;

    const list: any[] = await r.json();
    const coins: import("./services/priceStore").TickerData[] = [];

    for (const coin of list) {
      const sym = coin.symbol?.toUpperCase();
      if (!TOP_SYMBOLS_SET.has(sym)) continue;

      const usd = coin.quotes?.USD ?? {};
      const price = usd.price ?? 0;
      if (price <= 0) continue;

      const change24 = usd.percent_change_24h ?? 0;
      const open24   = price / (1 + change24 / 100);
      priceCache.set(`${sym}USDT`, price);

      coins.push({
        id: coin.id ?? sym.toLowerCase(),
        symbol: sym.toLowerCase(),
        name: coin.name ?? sym,
        current_price: price,
        price_change_24h: price - open24,
        price_change_percentage_24h: change24,
        market_cap: usd.market_cap ?? 0,
        market_cap_rank: coin.rank ?? 999,
        total_volume: usd.volume_24h ?? 0,
        high_24h: price,
        low_24h: price,
        image: "",
        ath: usd.ath_price ?? price,
        ath_change_percentage: usd.percent_from_price_ath ?? 0,
        circulating_supply: coin.circulating_supply ?? 0,
      });
    }

    if (coins.length === 0) return false;

    coins.sort((a, b) => a.market_cap_rank - b.market_cap_rank);
    updatePriceStore(coins);

    const wsPayload = JSON.stringify({
      stream: "!miniTicker@arr",
      data: coins.map((c) => {
        const open24 = c.current_price / (1 + c.price_change_percentage_24h / 100);
        return {
          e: "24hrMiniTicker",
          s: `${c.symbol.toUpperCase()}USDT`,
          c: String(c.current_price),
          o: String(open24 > 0 ? open24 : c.current_price * 0.99),
          h: String(c.high_24h),
          l: String(c.low_24h),
          v: "0",
          q: "0",
        };
      }),
    });
    latestPayload = wsPayload;
    broadcast(wsPayload);
    return true;
  } catch {
    return false;
  }
}

async function fetchAndBroadcast() {
  try {
    const symbols = TOP_COINS.join(",");
    const res = await fetch(
      `${CC_BASE}/data/pricemultifull?fsyms=${symbols}&tsyms=USD`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) {
      await fetchFromCoinPaprika();
      return;
    }

    const json = await res.json() as { RAW?: Record<string, any>; Response?: string; Message?: string };

    if (json.Response === "Error") {
      console.warn("[Poller] CryptoCompare rate-limited, falling back to CoinPaprika…");
      await fetchFromCoinPaprika();
      return;
    }

    const raw = json.RAW ?? {};
    const fullCoins: import("./services/priceStore").TickerData[] = [];

    const tickers = Object.entries(raw)
      .map(([symbol, markets]: [string, any]) => {
        const usd = markets.USD ?? {};
        const price = usd.PRICE ?? 0;
        const open24 = price - (usd.CHANGE24HOUR ?? 0);
        if (price > 0) priceCache.set(`${symbol}USDT`, price);

        fullCoins.push({
          id: symbol.toLowerCase(),
          symbol: symbol.toLowerCase(),
          name: COIN_NAMES[symbol] ?? symbol,
          current_price: price,
          price_change_24h: usd.CHANGE24HOUR ?? 0,
          price_change_percentage_24h: usd.CHANGEPCT24HOUR ?? 0,
          market_cap: usd.MKTCAP ?? 0,
          market_cap_rank: TOP_COINS.indexOf(symbol) + 1,
          total_volume: usd.VOLUME24HOURTO ?? 0,
          high_24h: usd.HIGH24HOUR ?? price,
          low_24h: usd.LOW24HOUR ?? price,
          image: usd.IMAGEURL ? `${CC_IMG}${usd.IMAGEURL}` : "",
          ath: usd.HIGH24HOUR ?? price,
          ath_change_percentage: open24 > 0 ? ((price - open24) / open24) * 100 : 0,
          circulating_supply: usd.SUPPLY ?? 0,
        });

        return {
          e: "24hrMiniTicker",
          s: `${symbol}USDT`,
          c: String(price),
          o: String(open24 > 0 ? open24 : price * 0.99),
          h: String(usd.HIGH24HOUR ?? price),
          l: String(usd.LOW24HOUR ?? price),
          v: String(usd.VOLUME24HOUR ?? 0),
          q: String(usd.VOLUMEDAYTO ?? 0),
        };
      })
      .filter((t) => parseFloat(t.c) > 0);

    if (fullCoins.length > 0) {
      updatePriceStore(fullCoins.sort((a, b) => a.market_cap_rank - b.market_cap_rank));
    }

    const payload = JSON.stringify({ stream: "!miniTicker@arr", data: tickers });
    latestPayload = payload;
    broadcast(payload);
  } catch (err: any) {
    console.error("[Poller] Error, falling back to CoinPaprika:", err?.message ?? err);
    await fetchFromCoinPaprika();
  }
}

// Poll every 15 seconds (5760 calls/day, within CryptoCompare free tier 7500/day)
const POLL_INTERVAL_MS = 15_000;
pollTimer = setInterval(fetchAndBroadcast, POLL_INTERVAL_MS);
fetchAndBroadcast();
console.log(`[WS] Polling every ${POLL_INTERVAL_MS / 1000}s (~${Math.round(86400000 / POLL_INTERVAL_MS)} calls/day)`);

// ── Sync news sentiment to scanner every 5 min ────────────────────────────────
setInterval(() => {
  if (newsCache?.articles) {
    const b = newsCache.articles.filter(a => a.sentiment === "BULLISH").length;
    const r = newsCache.articles.filter(a => a.sentiment === "BEARISH").length;
    setNewsSentiment(b, r);
  }
}, 5 * 60_000);

// ── Start Scanner ─────────────────────────────────────────────────────────────
startScanner((symbol) => priceCache.get(symbol) ?? null);

// ── HTTP server start ─────────────────────────────────────────────────────────
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`[WS] Price stream ready at /api/ws/prices (polling CryptoCompare every 2s)`);
});

process.on("SIGTERM", () => {
  clearInterval(pollTimer);
  server.close();
});
