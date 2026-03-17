import { Router } from "express";
import Parser from "rss-parser";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const rssParser = new Parser({
  timeout: 9000,
  headers: { "User-Agent": "GarongdzTrade/1.0 NewsAggregator" },
  customFields: { item: [["media:content", "media"]] },
});

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
});

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ProcessedArticle {
  id: string;
  title: string;
  titleId: string;
  link: string;
  pubDate: string;
  source: string;
  sourceCategory: "crypto" | "macro" | "reddit";
  summary: string;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  tags: string[];
  importance: number;
  isBreaking: boolean;
}

interface RawArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sourceCategory: "crypto" | "macro" | "reddit";
  snippet: string;
}

// ── Sources ───────────────────────────────────────────────────────────────────
const CRYPTO_RSS = [
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", name: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", name: "CoinTelegraph" },
  { url: "https://decrypt.co/feed", name: "Decrypt" },
  { url: "https://cryptoslate.com/feed/", name: "CryptoSlate" },
  { url: "https://bitcoinmagazine.com/.rss/full/", name: "Bitcoin Magazine" },
  { url: "https://cryptopanic.com/news/rss/", name: "CryptoPanic" },
  { url: "https://theblock.co/rss.xml", name: "The Block" },
];

const MACRO_RSS = [
  { url: "https://feeds.reuters.com/reuters/businessNews", name: "Reuters Business" },
  { url: "https://feeds.reuters.com/reuters/worldNews", name: "Reuters World" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml", name: "NYTimes Economy" },
];

const REDDIT_SOURCES = [
  { url: "https://www.reddit.com/r/CryptoCurrency/hot.json", name: "r/CryptoCurrency" },
  { url: "https://www.reddit.com/r/Bitcoin/hot.json", name: "r/Bitcoin" },
];

// ── Keyword filters ───────────────────────────────────────────────────────────
const KEEP_WORDS = [
  "bitcoin","btc","ethereum","eth","solana","sol","bnb","xrp","doge","ada","crypto",
  "cryptocurrency","blockchain","defi","stablecoin","cbdc","altcoin","token","nft",
  "fed","federal reserve","interest rate","inflation","cpi","fomc","gdp","recession",
  "sec","regulation","etf","sanctions","war","trade war","tariff",
  "china","russia","iran","dollar","usd","treasury","bond",
  "hack","exploit","liquidation","whale","institutional","coinbase","binance","kraken",
  "market","price","rally","crash","bull","bear","pump","dump","breakout","support",
  "resistance","ath","all-time high","halvening","halving","mining","miner",
];

const DISCARD_PHRASES = [
  "nft art drop","nft collection launch","nft mint","gaming nft","play-to-earn game",
  "esports tournament","celebrity nft","music nft","sports collectible",
];

function passes(text: string): boolean {
  const lower = text.toLowerCase();
  const hasKeep = KEEP_WORDS.some((w) => lower.includes(w));
  const hasDiscard = DISCARD_PHRASES.some((w) => lower.includes(w));
  return hasKeep && !hasDiscard;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3)
  );
}

function deduplicate(articles: RawArticle[]): RawArticle[] {
  const seen: Set<string>[] = [];
  return articles.filter((a) => {
    const tokens = tokenize(a.title);
    const isDup = seen.some((s) => {
      const inter = [...tokens].filter((t) => s.has(t));
      return inter.length / Math.min(tokens.size, s.size) > 0.55;
    });
    if (!isDup) seen.push(tokens);
    return !isDup;
  });
}

// ── Fetchers ──────────────────────────────────────────────────────────────────
async function fetchRSS(
  src: { url: string; name: string },
  category: "crypto" | "macro"
): Promise<RawArticle[]> {
  try {
    const feed = await rssParser.parseURL(src.url);
    return (feed.items || []).slice(0, 12).map((item) => ({
      title: (item.title || "").trim(),
      link: item.link || "",
      pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
      source: src.name,
      sourceCategory: category,
      snippet: (item.contentSnippet || item.content || "").replace(/<[^>]+>/g, "").slice(0, 300),
    }));
  } catch {
    return [];
  }
}

async function fetchReddit(src: { url: string; name: string }): Promise<RawArticle[]> {
  try {
    const res = await fetch(src.url, {
      headers: {
        "User-Agent": "GarongdzTrade/1.0 (news aggregator for educational purposes)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const posts: any[] = json?.data?.children || [];
    return posts
      .filter((p: any) => p.data.score > 50)
      .slice(0, 8)
      .map((p: any) => ({
        title: p.data.title || "",
        link: `https://reddit.com${p.data.permalink}`,
        pubDate: new Date(p.data.created_utc * 1000).toISOString(),
        source: src.name,
        sourceCategory: "reddit" as const,
        snippet: (p.data.selftext || "").slice(0, 200),
      }));
  } catch {
    return [];
  }
}

// ── Claude batch processing ───────────────────────────────────────────────────
async function processWithClaude(articles: RawArticle[]): Promise<ProcessedArticle[]> {
  const batch = articles.slice(0, 25);

  const list = batch
    .map(
      (a, i) =>
        `[${i}] SUMBER: ${a.source}\nJUDUL: ${a.title}\nCUPLIKAN: ${a.snippet.slice(0, 250)}`
    )
    .join("\n\n---\n\n");

  const prompt = `Kamu adalah analis pasar kripto senior. Proses ${batch.length} artikel berita berikut dan kembalikan JSON array.

Untuk SETIAP artikel berikan:
- "titleId": terjemahan judul ke Bahasa Indonesia (singkat, informatif)
- "summary": 2 kalimat Bahasa Indonesia, fokus pada dampak ke harga kripto dan market
- "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL" (dampak terhadap pasar kripto secara umum)
- "tags": array 1-3 tag dari: ["GEOPOLITIK","REGULASI","MAKRO","ON-CHAIN","TEKNIKAL","ALTCOIN","BITCOIN","ETHEREUM","STABLECOIN","DEFI","EXCHANGE"]
- "importance": angka 1-10 (10=crash besar/event bersejarah, 8-9=BREAKING news penting, 6-7=berita notable, 4-5=berita biasa, 1-3=minor)

KRITERIA IMPORTANCE:
- 9-10: Regulasi besar negara besar, Bitcoin ATH/crash >20%, hack besar, perang/sanksi major
- 8: Keputusan Fed rate, ETF approval/rejection, hack >$50M, regulasi kripto major
- 6-7: Data ekonomi penting (CPI/PPI), pergerakan whale besar, fork/upgrade major
- 4-5: Berita adopsi, partnership, update protokol
- 1-3: Berita ringan, opini, analisis rutin

ARTIKEL:
${list}

PENTING: Kembalikan HANYA JSON array yang valid dengan tepat ${batch.length} objek, urutan sama persis.
Format: [{"titleId":"...","summary":"...","sentiment":"BULLISH","tags":["BITCOIN"],"importance":6}, ...]`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content.find((b) => b.type === "text")?.text?.trim() ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return fallback(batch);

    const parsed: any[] = JSON.parse(jsonMatch[0]);

    return batch.map((a, i) => {
      const p = parsed[i] ?? {};
      const imp = Number(p.importance) || 5;
      return {
        id: `${a.source}-${i}-${Date.now()}`,
        title: a.title,
        titleId: p.titleId || a.title,
        link: a.link,
        pubDate: a.pubDate,
        source: a.source,
        sourceCategory: a.sourceCategory,
        summary: p.summary || "",
        sentiment: (["BULLISH", "BEARISH", "NEUTRAL"].includes(p.sentiment)
          ? p.sentiment
          : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL",
        tags: Array.isArray(p.tags) ? p.tags.slice(0, 3) : [],
        importance: Math.min(10, Math.max(1, imp)),
        isBreaking: imp >= 8,
      };
    });
  } catch {
    return fallback(batch);
  }
}

function fallback(articles: RawArticle[]): ProcessedArticle[] {
  return articles.map((a, i) => ({
    id: `fallback-${i}-${Date.now()}`,
    title: a.title,
    titleId: a.title,
    link: a.link,
    pubDate: a.pubDate,
    source: a.source,
    sourceCategory: a.sourceCategory,
    summary: a.snippet || "",
    sentiment: "NEUTRAL",
    tags: [],
    importance: 5,
    isBreaking: false,
  }));
}

// ── Cache ─────────────────────────────────────────────────────────────────────
interface NewsCache {
  articles: ProcessedArticle[];
  fetchedAt: number;
}
let newsCache: NewsCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let fetchInProgress = false;

async function buildNewsCache(): Promise<ProcessedArticle[]> {
  const [cryptoResults, macroResults, redditResults] = await Promise.all([
    Promise.all(CRYPTO_RSS.map((s) => fetchRSS(s, "crypto"))),
    Promise.all(MACRO_RSS.map((s) => fetchRSS(s, "macro"))),
    Promise.all(REDDIT_SOURCES.map(fetchReddit)),
  ]);

  const allRaw: RawArticle[] = [
    ...cryptoResults.flat(),
    ...macroResults.flat(),
    ...redditResults.flat(),
  ];

  // Filter by keywords
  const filtered = allRaw.filter((a) => a.title && passes(`${a.title} ${a.snippet}`));

  // Sort newest first
  filtered.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  // Deduplicate
  const unique = deduplicate(filtered);

  // Process with Claude
  return processWithClaude(unique.slice(0, 25));
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.get("/news", async (req, res) => {
  const forceRefresh = req.query.refresh === "1";

  // Serve fresh cache
  if (!forceRefresh && newsCache && Date.now() - newsCache.fetchedAt < CACHE_TTL) {
    res.json({
      articles: newsCache.articles,
      cached: true,
      fetchedAt: newsCache.fetchedAt,
      nextRefresh: newsCache.fetchedAt + CACHE_TTL,
    });
    return;
  }

  // Serve stale cache while refreshing in background
  if (fetchInProgress && newsCache) {
    res.json({
      articles: newsCache.articles,
      cached: true,
      fetchedAt: newsCache.fetchedAt,
      nextRefresh: newsCache.fetchedAt + CACHE_TTL,
    });
    return;
  }

  if (!fetchInProgress) {
    fetchInProgress = true;
    buildNewsCache()
      .then((articles) => {
        newsCache = { articles, fetchedAt: Date.now() };
      })
      .catch((err) => {
        console.error("[News] fetch error:", err);
      })
      .finally(() => {
        fetchInProgress = false;
      });
  }

  // If no cache at all, wait for the fetch
  if (!newsCache) {
    try {
      const articles = await buildNewsCache();
      newsCache = { articles, fetchedAt: Date.now() };
      fetchInProgress = false;
      res.json({
        articles: newsCache.articles,
        cached: false,
        fetchedAt: newsCache.fetchedAt,
        nextRefresh: newsCache.fetchedAt + CACHE_TTL,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch news" });
    }
    return;
  }

  res.json({
    articles: newsCache.articles,
    cached: true,
    fetchedAt: newsCache.fetchedAt,
    nextRefresh: newsCache.fetchedAt + CACHE_TTL,
  });
});

export default router;
