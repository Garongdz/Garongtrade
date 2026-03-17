import { useState, useEffect, useCallback, useRef } from "react";
import Layout from "@/components/Layout";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { RefreshCw, ExternalLink, Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface NewsArticle {
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

type FilterTab = "ALL" | "BULLISH" | "BEARISH" | "BREAKING";

const TAG_COLORS: Record<string, string> = {
  GEOPOLITIK: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  REGULASI: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  MAKRO: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "ON-CHAIN": "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  TEKNIKAL: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  ALTCOIN: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  BITCOIN: "bg-[#F0B90B]/15 text-[#F0B90B] border-[#F0B90B]/30",
  ETHEREUM: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  STABLECOIN: "bg-green-500/15 text-green-400 border-green-500/30",
  DEFI: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  EXCHANGE: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const SOURCE_CATEGORY_COLORS: Record<string, string> = {
  crypto: "text-[#F0B90B] bg-[#F0B90B]/10 border-[#F0B90B]/20",
  macro: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  reddit: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

function ImportanceBar({ score }: { score: number }) {
  const bars = 5;
  const filled = Math.round((score / 10) * bars);
  return (
    <div className="flex gap-[2px] items-center">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-3 rounded-[1px] transition-colors ${
            i < filled
              ? score >= 8
                ? "bg-destructive"
                : score >= 6
                ? "bg-[#F0B90B]"
                : "bg-positive"
              : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

function SentimentIcon({ s }: { s: string }) {
  if (s === "BULLISH")
    return <TrendingUp className="h-3 w-3" />;
  if (s === "BEARISH")
    return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}

function ArticleCard({ article, lang }: { article: NewsArticle; lang: string }) {
  const sentimentConfig = {
    BULLISH: { bg: "border-l-positive", badge: "bg-positive/10 text-positive border-positive/30", label: "BULLISH" },
    BEARISH: { bg: "border-l-destructive", badge: "bg-destructive/10 text-destructive border-destructive/30", label: "BEARISH" },
    NEUTRAL: { bg: "border-l-muted-foreground/30", badge: "bg-muted text-muted-foreground border-border", label: "NEUTRAL" },
  }[article.sentiment];

  const title = lang === "id" ? article.titleId : article.title;

  return (
    <div
      className={`bg-card border border-border border-l-2 ${sentimentConfig.bg} rounded-sm p-4 hover:bg-card/80 transition-colors group`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {article.isBreaking && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-destructive text-white rounded-[2px] animate-pulse">
              <Zap className="h-2.5 w-2.5" /> BREAKING
            </span>
          )}
          <span
            className={`px-1.5 py-0.5 text-[10px] font-semibold border rounded-[2px] ${
              SOURCE_CATEGORY_COLORS[article.sourceCategory]
            }`}
          >
            {article.source}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono-price">
            {timeAgo(article.pubDate)}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ImportanceBar score={article.importance} />
          <span
            className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold border rounded-[2px] ${sentimentConfig.badge}`}
          >
            <SentimentIcon s={article.sentiment} />
            {sentimentConfig.label}
          </span>
        </div>
      </div>

      {/* Title */}
      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block font-semibold text-sm text-foreground hover:text-primary transition-colors leading-snug mb-2 group-hover:underline"
      >
        {title}
        <ExternalLink className="inline h-3 w-3 ml-1 opacity-40 group-hover:opacity-100" />
      </a>

      {/* Summary */}
      {article.summary && (
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          {article.summary}
        </p>
      )}

      {/* Tags */}
      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {article.tags.map((tag) => (
            <span
              key={tag}
              className={`px-1.5 py-0.5 text-[9px] font-bold border rounded-[2px] ${
                TAG_COLORS[tag] ?? "bg-muted text-muted-foreground border-border"
              }`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function News() {
  const { language, t } = useAppSettings();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [nextRefresh, setNextRefresh] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("ALL");
  const [countdown, setCountdown] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNews = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const url = `${import.meta.env.BASE_URL}api/news${force ? "?refresh=1" : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch news");
      setArticles(data.articles || []);
      setFetchedAt(data.fetchedAt);
      setNextRefresh(data.nextRefresh);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    fetchNews();
    intervalRef.current = setInterval(() => fetchNews(), 5 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNews]);

  // Countdown timer
  useEffect(() => {
    const tick = setInterval(() => {
      if (!nextRefresh) return;
      const remaining = Math.max(0, nextRefresh - Date.now());
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${m}:${String(s).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(tick);
  }, [nextRefresh]);

  const filtered = articles.filter((a) => {
    if (activeFilter === "BULLISH") return a.sentiment === "BULLISH";
    if (activeFilter === "BEARISH") return a.sentiment === "BEARISH";
    if (activeFilter === "BREAKING") return a.isBreaking;
    return true;
  });

  const counts = {
    ALL: articles.length,
    BULLISH: articles.filter((a) => a.sentiment === "BULLISH").length,
    BEARISH: articles.filter((a) => a.sentiment === "BEARISH").length,
    BREAKING: articles.filter((a) => a.isBreaking).length,
  };

  const FILTER_TABS: { id: FilterTab; labelEn: string; labelId: string; color: string }[] = [
    { id: "ALL", labelEn: "All", labelId: "Semua", color: "text-foreground" },
    { id: "BULLISH", labelEn: "Bullish", labelId: "Bullish", color: "text-positive" },
    { id: "BEARISH", labelEn: "Bearish", labelId: "Bearish", color: "text-destructive" },
    { id: "BREAKING", labelEn: "Breaking", labelId: "Breaking", color: "text-orange-400" },
  ];

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-3.5rem-62px)] w-full overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors ${
                  activeFilter === tab.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className={activeFilter === tab.id ? tab.color : ""}>
                  {language === "id" ? tab.labelId : tab.labelEn}
                </span>
                <span
                  className={`px-1 py-0.5 text-[9px] rounded-[2px] font-mono-price ${
                    activeFilter === tab.id
                      ? "bg-background text-foreground"
                      : "bg-muted-foreground/20 text-muted-foreground"
                  }`}
                >
                  {counts[tab.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {countdown && !loading && (
              <span className="text-[10px] font-mono-price text-muted-foreground hidden sm:block">
                {language === "id" ? "Refresh" : "Refresh"}: {countdown}
              </span>
            )}
            {fetchedAt && (
              <span className="text-[10px] text-muted-foreground hidden sm:block">
                {language === "id" ? "Diperbarui" : "Updated"}: {timeAgo(new Date(fetchedAt).toISOString())}
              </span>
            )}
            <button
              onClick={() => fetchNews(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:block">
                {refreshing
                  ? language === "id" ? "Memperbarui..." : "Refreshing..."
                  : language === "id" ? "Perbarui" : "Refresh"}
              </span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {(loading || refreshing) && articles.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <div className="relative">
                <div className="h-10 w-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  {language === "id" ? "Mengambil berita terbaru..." : "Fetching latest news..."}
                </p>
                <p className="text-xs opacity-60">
                  {language === "id"
                    ? "Claude AI sedang menganalisis & menerjemahkan artikel"
                    : "Claude AI is analyzing & translating articles"}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="m-4 p-4 border border-destructive bg-destructive/10 text-destructive text-sm rounded-sm">
              {error}
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <span className="text-3xl opacity-20">📰</span>
              <p className="text-sm">
                {language === "id" ? "Tidak ada berita ditemukan" : "No news found"}
              </p>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-min">
              {/* Breaking news first */}
              {filtered
                .slice()
                .sort((a, b) => {
                  if (a.isBreaking && !b.isBreaking) return -1;
                  if (!a.isBreaking && b.isBreaking) return 1;
                  return b.importance - a.importance;
                })
                .map((article) => (
                  <ArticleCard key={article.id} article={article} lang={language} />
                ))}
            </div>
          )}
        </div>

        {/* Footer status */}
        {articles.length > 0 && (
          <div className="border-t border-border bg-card px-4 py-1.5 shrink-0 flex items-center gap-4">
            <span className="text-[10px] font-mono-price text-muted-foreground">
              {articles.length} {language === "id" ? "artikel diproses Claude AI" : "articles processed by Claude AI"}
            </span>
            <div className="flex items-center gap-3 ml-auto">
              <span className="flex items-center gap-1 text-[10px] text-positive">
                <div className="h-1.5 w-1.5 rounded-full bg-positive" />
                {counts.BULLISH} Bullish
              </span>
              <span className="flex items-center gap-1 text-[10px] text-destructive">
                <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
                {counts.BEARISH} Bearish
              </span>
              {counts.BREAKING > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-orange-400">
                  <Zap className="h-2.5 w-2.5" />
                  {counts.BREAKING} Breaking
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
