import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
import { startScanner, setNewsSentiment } from "./services/scanner";
import { newsCache } from "./routes/news";

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
const TOP_COINS = [
  "BTC","ETH","BNB","SOL","XRP","DOGE","ADA","AVAX","TRX","DOT",
  "LINK","MATIC","LTC","SHIB","UNI","ATOM","XLM","BCH","NEAR","FTM",
  "SAND","AAVE","MKR","ZEC","DASH","XMR","ENJ","CHZ","FLOW","ROSE",
  "ARB","OP",
];

let latestPayload: string | null = null;
let pollTimer: ReturnType<typeof setInterval>;

async function fetchAndBroadcast() {
  try {
    const symbols = TOP_COINS.join(",");
    const res = await fetch(
      `${CC_BASE}/data/pricemultifull?fsyms=${symbols}&tsyms=USD`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return;

    const json = await res.json() as { RAW?: Record<string, any> };
    const raw = json.RAW ?? {};

    const tickers = Object.entries(raw)
      .map(([symbol, markets]: [string, any]) => {
        const usd = markets.USD ?? {};
        const price = usd.PRICE ?? 0;
        const open24 = price - (usd.CHANGE24HOUR ?? 0);
        // Update price cache for scanner
        if (price > 0) priceCache.set(`${symbol}USDT`, price);
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

    const payload = JSON.stringify({ stream: "!miniTicker@arr", data: tickers });
    latestPayload = payload;
    broadcast(payload);
  } catch (_) {
    // silently skip failed polls
  }
}

// Poll every 2 seconds
pollTimer = setInterval(fetchAndBroadcast, 2000);
fetchAndBroadcast();

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
