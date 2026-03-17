import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetMarketOverview,
  useGetWatchlist,
  useAddToWatchlist,
  useRemoveFromWatchlist,
  getGetWatchlistQueryKey,
} from "@workspace/api-client-react";
import { useBinanceWS } from "@/contexts/BinanceWSContext";
import { usePriceFlash } from "@/hooks/usePriceFlash";
import { formatCurrency, formatCompactNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Star, ArrowUpDown, Search, TrendingUp, TrendingDown, Gauge, RefreshCw } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import CoinChart from "@/components/CoinChart";
import { Input } from "@/components/ui/input";
import Layout from "@/components/Layout";

// ── CoinGecko Types ────────────────────────────────────────────────────────────
interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  high_24h: number;
  low_24h: number;
}

// ── WIB timestamp helper ───────────────────────────────────────────────────────
function toWIBTimeStr(date: Date): string {
  // WIB = UTC+7
  const wib = new Date(date.getTime() + 7 * 3600 * 1000);
  return wib.toISOString().slice(11, 19) + " WIB";
}

// ── Design Tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:       "#0B0E11",
  surface:  "#1E2329",
  surfaceH: "#1A1D24",
  border:   "#2B3139",
  borderS:  "#1A1D24",
  text:     "#EAECEF",
  muted:    "#848E9C",
  yellow:   "#F0B90B",
  green:    "#0ECB81",
  red:      "#F6465D",
};

// ── Coin Metadata ──────────────────────────────────────────────────────────────
const COIN_META: Record<string, { color: string; category: string; fullName: string }> = {
  BTC:  { color: "#F7931A", category: "Layer 1",    fullName: "Bitcoin"   },
  ETH:  { color: "#627EEA", category: "Layer 1",    fullName: "Ethereum"  },
  SOL:  { color: "#9945FF", category: "Layer 1",    fullName: "Solana"    },
  BNB:  { color: "#F0B90B", category: "Layer 1",    fullName: "BNB"       },
  XRP:  { color: "#00A8FF", category: "Pembayaran", fullName: "XRP"       },
  AVAX: { color: "#0ECB81", category: "Layer 1",    fullName: "Avalanche" },
  DOGE: { color: "#F6465D", category: "MEME",       fullName: "Dogecoin"  },
  ARB:  { color: "#28A0F0", category: "Layer 2",    fullName: "Arbitrum"  },
  OP:   { color: "#FF0420", category: "Layer 2",    fullName: "Optimism"  },
  LINK: { color: "#2A5ADA", category: "DeFi",       fullName: "Chainlink" },
};

const CATEGORY_COINS: Record<string, string[]> = {
  "Semua":    [],
  "Layer 1":  ["BTC","ETH","SOL","BNB","AVAX"],
  "Layer 2":  ["ARB","OP"],
  "DeFi":     ["LINK"],
  "MEME":     ["DOGE"],
  "AI Token": [],
  "RWA":      [],
  "Gaming":   [],
  "Solana":   ["SOL"],
};

const FILTER_TABS = ["Favorit","Semua Kripto","Spot","Futures","Sinyal AI"];
const CATEGORY_PILLS = Object.keys(CATEGORY_COINS);
const PAGE_TABS = ["Ringkasan","Data Market","Sinyal Live","Berita"];

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useSignals() {
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return useQuery({
    queryKey: ["signals-active"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/signals`);
      const j = await r.json();
      return (j.signals ?? []) as Array<{
        coin: string;
        direction: "LONG" | "SHORT" | null;
        confidence: number;
        entry_low: number;
        entry_high: number;
      }>;
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

interface FundingCoin {
  avg: number | null;
  bybit: number | null;
  okx: number | null;
  gate: number | null;
  status: { bybit: boolean; okx: boolean; gate: boolean };
}
interface FundingRatesResponse {
  BTC?: FundingCoin;
  ETH?: FundingCoin;
  SOL?: FundingCoin;
  exchangeStatus?: { bybit: boolean; okx: boolean; gate: boolean };
}

function useFundingRates() {
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return useQuery({
    queryKey: ["funding-rates"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/market/funding-rates`);
      return r.json() as Promise<FundingRatesResponse>;
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}

function useTop50Coins() {
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  // Track previous ranks for rank-change indicator
  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [rankChanges, setRankChanges] = useState<Map<string, number>>(new Map());
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const query = useQuery({
    queryKey: ["top50-coins"],
    queryFn: async (): Promise<CoinData[]> => {
      const r = await fetch(`${BASE}/api/market/top50`);
      if (!r.ok) throw new Error("Failed to fetch top 50");
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  useEffect(() => {
    if (!query.data) return;
    const data = query.data;
    const changes = new Map<string, number>();
    const flashed = new Set<string>();

    for (const coin of data) {
      const prev = prevRanksRef.current.get(coin.id);
      if (prev !== undefined && prev !== coin.market_cap_rank) {
        changes.set(coin.id, prev - coin.market_cap_rank); // positive = moved up
        flashed.add(coin.id);
      }
    }
    // Update prev ranks
    prevRanksRef.current = new Map(data.map(c => [c.id, c.market_cap_rank]));
    setRankChanges(changes);
    setLastUpdated(new Date());

    if (flashed.size > 0) {
      setFlashedIds(flashed);
      setTimeout(() => setFlashedIds(new Set()), 1400);
    }
  }, [query.data]);

  return { ...query, rankChanges, flashedIds, lastUpdated };
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function StatCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg flex flex-col gap-3"
      style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "16px 18px" }}
    >
      <div
        className="flex items-center gap-1.5 uppercase"
        style={{ color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em" }}
      >
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function SignalBadge({ direction, confidence }: { direction: string | null; confidence?: number }) {
  if (!direction) return (
    <span className="inline-flex items-center gap-[3px] px-1.5 py-1 rounded-sm" style={{ color: C.muted }}>
      <span className="scanning-dot text-[14px] leading-none font-bold">·</span>
      <span className="scanning-dot text-[14px] leading-none font-bold">·</span>
      <span className="scanning-dot text-[14px] leading-none font-bold">·</span>
    </span>
  );
  const isLong = direction === "LONG";
  return (
    <div className="flex items-center gap-1.5 justify-end flex-wrap">
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-bold"
        style={{
          background: isLong ? "rgba(14,203,129,0.1)" : "rgba(246,70,93,0.1)",
          color: isLong ? C.green : C.red,
        }}
      >
        {direction}
      </span>
      {confidence != null && (
        <span className="text-[11px] font-semibold" style={{ color: C.muted }}>
          {Math.round(confidence * 10)}%
        </span>
      )}
    </div>
  );
}

// ── Top 4 Cards ───────────────────────────────────────────────────────────────

function TrendingCard({ coins }: { coins: CoinData[] | undefined }) {
  const { prices } = useBinanceWS();
  // Top 3 gainers (highest 24h % change)
  const top3 = useMemo(() => {
    if (!coins) return [];
    return [...coins]
      .sort((a, b) => (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0))
      .slice(0, 3);
  }, [coins]);

  return (
    <StatCard title="Top Gainers 24j" icon={<TrendingUp className="h-3 w-3" />}>
      {top3.length === 0 ? (
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-7 rounded animate-pulse" style={{ background: C.surfaceH }} />)}
        </div>
      ) : (
        <div className="space-y-2.5">
          {top3.map((coin) => {
            const sym = coin.symbol.toUpperCase();
            const meta = COIN_META[sym];
            const live = prices[sym];
            const livePrice = live?.price ?? coin.current_price;
            const liveChange = live?.changePercent ?? coin.price_change_percentage_24h;
            const isPos = liveChange >= 0;
            return (
              <div key={coin.id} className="flex items-center justify-between" style={{ minHeight: 32 }}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold"
                    style={{
                      background: meta ? `${meta.color}20` : `${C.muted}20`,
                      color: meta?.color ?? C.muted,
                    }}
                  >
                    {coin.image ? (
                      <img src={coin.image} alt={sym} className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : sym.slice(0, 2)}
                  </div>
                  <span className="text-[12px] font-bold" style={{ color: C.text }}>{sym}</span>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-semibold font-mono" style={{ color: C.text }}>
                    {formatCurrency(livePrice)}
                  </div>
                  <div className="text-[11px] font-semibold font-mono" style={{ color: isPos ? C.green : C.red }}>
                    {isPos ? "+" : ""}{liveChange.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StatCard>
  );
}

function TopLosersCard({ coins }: { coins: CoinData[] | undefined }) {
  const { prices } = useBinanceWS();
  const top3 = useMemo(() => {
    if (!coins) return [];
    return [...coins]
      .sort((a, b) => (a.price_change_percentage_24h ?? 0) - (b.price_change_percentage_24h ?? 0))
      .slice(0, 3);
  }, [coins]);

  return (
    <StatCard title="Top Losers 24j" icon={<TrendingDown className="h-3 w-3" />}>
      {top3.length === 0 ? (
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-7 rounded animate-pulse" style={{ background: C.surfaceH }} />)}
        </div>
      ) : (
        <div className="space-y-2.5">
          {top3.map((coin) => {
            const sym = coin.symbol.toUpperCase();
            const meta = COIN_META[sym];
            const live = prices[sym];
            const livePrice = live?.price ?? coin.current_price;
            const liveChange = live?.changePercent ?? coin.price_change_percentage_24h;
            return (
              <div key={coin.id} className="flex items-center justify-between" style={{ minHeight: 32 }}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold"
                    style={{
                      background: meta ? `${meta.color}20` : `${C.muted}20`,
                      color: meta?.color ?? C.muted,
                    }}
                  >
                    {coin.image ? (
                      <img src={coin.image} alt={sym} className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : sym.slice(0, 2)}
                  </div>
                  <span className="text-[12px] font-bold" style={{ color: C.text }}>{sym}</span>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-semibold font-mono" style={{ color: C.text }}>
                    {formatCurrency(livePrice)}
                  </div>
                  <div className="text-[11px] font-semibold font-mono" style={{ color: C.red }}>
                    {liveChange.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StatCard>
  );
}

function getFundingLabel(avg: number | null): { text: string; color: string } {
  if (avg === null) return { text: "—", color: C.muted };
  if (avg > 0.02)  return { text: "Overheated",   color: "#F6465D" };
  if (avg > 0.01)  return { text: "Bullish",       color: "#F0B90B" };
  if (avg < -0.02) return { text: "Squeeze Fuel",  color: "#0ECB81" };
  if (avg < -0.01) return { text: "Bearish",       color: "#90A3BF" };
  return { text: "Normal", color: "#848E9C" };
}

function FundingRateCard({ coins: allCoins }: { coins: CoinData[] | undefined }) {
  const { data: rates, dataUpdatedAt } = useFundingRates();
  const fundingCoins = ["BTC", "ETH", "SOL"] as const;

  const imageMap = useMemo(() => {
    const m: Record<string, string> = {};
    if (!allCoins) return m;
    for (const c of allCoins) {
      const sym = c.symbol.toUpperCase();
      if (c.image) m[sym] = c.image;
    }
    return m;
  }, [allCoins]);

  // Countdown timer (30s)
  const [countdown, setCountdown] = useState(30);
  useEffect(() => {
    setCountdown(30);
  }, [dataUpdatedAt]);
  useEffect(() => {
    const id = setInterval(() => setCountdown(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  // Flash on rate change
  const prevAvgRef = useRef<Record<string, number | null>>({});
  const [flashMap, setFlashMap] = useState<Record<string, "up" | "down">>({});
  useEffect(() => {
    if (!rates) return;
    const newFlash: Record<string, "up" | "down"> = {};
    for (const coin of fundingCoins) {
      const cur = rates[coin]?.avg ?? null;
      const prev = prevAvgRef.current[coin] ?? null;
      if (prev !== null && cur !== null) {
        if (cur > prev) newFlash[coin] = "up";
        else if (cur < prev) newFlash[coin] = "down";
      }
      prevAvgRef.current[coin] = cur;
    }
    if (Object.keys(newFlash).length > 0) {
      setFlashMap(newFlash);
      setTimeout(() => setFlashMap({}), 700);
    }
  }, [rates]);

  // Hover tooltip state
  const [tooltip, setTooltip] = useState<string | null>(null);

  const exStatus = rates?.exchangeStatus;

  return (
    <div
      className="rounded-lg flex flex-col gap-3"
      style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "16px 18px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div
          className="flex items-center gap-1.5 uppercase"
          style={{ color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em" }}
        >
          <Gauge className="h-3 w-3" />
          Funding Rate
          {/* Exchange status dots */}
          <div className="flex items-center gap-1 ml-1">
            {([["BY", exStatus?.bybit], ["OKX", exStatus?.okx], ["GT", exStatus?.gate]] as [string, boolean | undefined][]).map(
              ([label, online]) => (
                <span key={label} className="flex items-center gap-0.5" title={`${label}: ${online ? "Online" : "Down"}`}>
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: online === undefined ? C.border : online ? "#0ECB81" : "#F6465D" }}
                  />
                </span>
              )
            )}
          </div>
        </div>
        {/* Countdown */}
        <span style={{ color: `${C.muted}80`, fontSize: 10 }}>
          {countdown}d
        </span>
      </div>

      {/* Content */}
      {rates === undefined ? (
        <div className="space-y-2.5">
          {[0,1,2].map(i => <div key={i} className="h-8 rounded animate-pulse" style={{ background: C.surfaceH }} />)}
        </div>
      ) : (
        <div className="space-y-2.5">
          {fundingCoins.map((coin) => {
            const coinData = rates[coin];
            const avg = coinData?.avg ?? null;
            const { text: labelText, color: labelColor } = getFundingLabel(avg);
            const isPos = avg !== null && avg > 0;
            const imgSrc = imageMap[coin];
            const flashDir = flashMap[coin];
            const rateColor = labelColor;

            const tooltipLines = coinData ? [
              `BY: ${coinData.bybit !== null ? `${coinData.bybit > 0 ? "+" : ""}${coinData.bybit.toFixed(4)}%` : "N/A"}`,
              `OKX: ${coinData.okx  !== null ? `${coinData.okx  > 0 ? "+" : ""}${coinData.okx.toFixed(4)}%`  : "N/A"}`,
              `GT: ${coinData.gate  !== null ? `${coinData.gate  > 0 ? "+" : ""}${coinData.gate.toFixed(4)}%`  : "N/A"}`,
              `Rata-rata: ${avg !== null ? `${avg > 0 ? "+" : ""}${avg.toFixed(4)}%` : "N/A"}`,
            ].join(" · ") : "";

            return (
              <div
                key={coin}
                className="flex items-center justify-between relative cursor-default"
                style={{ minHeight: 32 }}
                onMouseEnter={() => setTooltip(coin)}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Tooltip */}
                {tooltip === coin && (
                  <div
                    className="absolute right-0 z-50 rounded px-2 py-1.5 whitespace-nowrap pointer-events-none"
                    style={{
                      bottom: "calc(100% + 4px)",
                      background: "#13161B",
                      border: `1px solid ${C.border}`,
                      fontSize: 10,
                      color: C.muted,
                      lineHeight: 1.6,
                    }}
                  >
                    {tooltipLines.split(" · ").map((line, i) => (
                      <div key={i} style={{ color: i === 3 ? C.text : C.muted }}>{line}</div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold"
                    style={{
                      background: `${COIN_META[coin]?.color ?? C.muted}20`,
                      color: COIN_META[coin]?.color ?? C.muted,
                    }}
                  >
                    {imgSrc ? (
                      <img src={imgSrc} alt={coin} width={24} height={24} className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : coin[0]}
                  </div>
                  <span className="text-[12px] font-bold" style={{ color: C.text }}>{coin}</span>
                </div>

                <div
                  className={cn(
                    "text-right",
                    flashDir === "up"   && "price-flash-up",
                    flashDir === "down" && "price-flash-down"
                  )}
                >
                  <div className="text-[12px] font-semibold font-mono" style={{ color: rateColor }}>
                    {avg === null ? "—" : `${isPos ? "+" : ""}${avg.toFixed(4)}%`}
                  </div>
                  <div className="text-[9px] font-medium" style={{ color: labelColor }}>
                    {labelText}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FearGreedCard() {
  const { data } = useGetMarketOverview();

  const idx = data?.fear_greed_index ?? null;
  const label = data?.fear_greed_label ?? "";
  const prev = (data as any)?.fear_greed_prev ?? null;

  const idLabel = useMemo(() => {
    if (idx === null) return "";
    if (idx <= 20) return "Takut Ekstrem";
    if (idx <= 40) return "Takut";
    if (idx <= 60) return "Netral";
    if (idx <= 80) return "Serakah";
    return "Serakah Ekstrem";
  }, [idx]);

  if (!data || idx === null) {
    return (
      <StatCard title="Fear & Greed" icon={<Gauge className="h-3 w-3" />}>
        <div className="h-20 animate-pulse rounded" style={{ background: C.surfaceH }} />
      </StatCard>
    );
  }

  const prevDiff = prev !== null ? idx - prev : null;

  return (
    <StatCard title="Fear & Greed" icon={<Gauge className="h-3 w-3" />}>
      <div className="flex items-end gap-3">
        <span className="text-[28px] font-bold leading-none" style={{ color: C.yellow }}>
          {idx}
        </span>
        <div className="pb-0.5">
          <div className="text-[13px] font-semibold" style={{ color: C.text }}>{idLabel}</div>
          {prevDiff !== null && (
            <div className="text-[11px]" style={{ color: prevDiff > 0 ? C.green : prevDiff < 0 ? C.red : C.muted }}>
              {prevDiff > 0 ? "+" : ""}{prevDiff} vs kemarin
            </div>
          )}
        </div>
      </div>

      {/* Gradient bar */}
      <div className="relative mt-1">
        <div
          className="h-2 rounded-full w-full"
          style={{ background: "linear-gradient(to right, #F6465D, #F0B90B 50%, #0ECB81)" }}
        />
        {/* Needle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white shadow"
          style={{ left: `calc(${idx}% - 5px)`, background: "white" }}
        />
        {/* Labels */}
        <div className="flex justify-between mt-1">
          {["Takut","Netral","Serakah"].map((l) => (
            <span key={l} className="text-[9px]" style={{ color: `${C.muted}80` }}>{l}</span>
          ))}
        </div>
      </div>
    </StatCard>
  );
}

// ── Rank Change Indicator ──────────────────────────────────────────────────────
function RankChange({ delta }: { delta: number | undefined }) {
  if (!delta) return null;
  if (delta > 0) return <span style={{ color: C.green, fontSize: 8 }}>▲</span>;
  return <span style={{ color: C.red, fontSize: 8 }}>▼</span>;
}

// ── Main Table Row ─────────────────────────────────────────────────────────────
function CoinRow({
  coin,
  rank,
  rankDelta,
  rankFlash,
  isWatchlisted,
  signal,
  onToggleWatchlist,
  onSelect,
}: {
  coin: CoinData;
  rank: number;
  rankDelta: number | undefined;
  rankFlash: boolean;
  isWatchlisted: boolean;
  signal?: { direction: "LONG" | "SHORT" | null; confidence: number } | null;
  onToggleWatchlist: (e: React.MouseEvent, coin: CoinData) => void;
  onSelect: (coin: CoinData) => void;
}) {
  const { prices } = useBinanceWS();
  const sym = coin.symbol.toUpperCase();
  const live = prices[sym];
  const meta = COIN_META[sym];

  const livePrice = live?.price ?? coin.current_price;
  const liveChange = live?.changePercent ?? coin.price_change_percentage_24h;
  const flashClass = usePriceFlash(livePrice);
  const isPos = liveChange >= 0;

  return (
    <tr
      onClick={() => onSelect(coin)}
      className={cn("cursor-pointer transition-colors", flashClass, rankFlash && "rank-flash")}
      style={{ borderBottom: `1px solid ${C.borderS}` }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceH)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      {/* Star */}
      <td className="pl-4 pr-2" style={{ paddingTop: 13, paddingBottom: 13, width: 32 }}>
        <button
          onClick={(e) => onToggleWatchlist(e, coin)}
          className="transition-colors focus:outline-none"
          style={{ color: isWatchlisted ? C.yellow : C.muted }}
        >
          <Star className={cn("h-3.5 w-3.5", isWatchlisted && "fill-current")} />
        </button>
      </td>

      {/* Rank */}
      <td className="px-2 hidden sm:table-cell text-right" style={{ paddingTop: 13, paddingBottom: 13, width: 44 }}>
        <div className="flex items-center justify-end gap-0.5">
          <span className="text-[11px] tabular-nums" style={{ color: `${C.muted}80` }}>{rank}</span>
          <span className="text-[8px] leading-none"><RankChange delta={rankDelta} /></span>
        </div>
      </td>

      {/* Nama */}
      <td className="px-4" style={{ paddingTop: 13, paddingBottom: 13 }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 overflow-hidden"
            style={{ background: meta ? `${meta.color}20` : `${C.muted}20` }}
          >
            {coin.image ? (
              <img
                src={coin.image}
                alt={sym}
                width={28}
                height={28}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = "none";
                  el.parentElement!.textContent = sym.slice(0, 3);
                }}
              />
            ) : (
              <span style={{ color: meta?.color ?? C.muted }}>{sym.slice(0, 3)}</span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold" style={{ color: C.text }}>{sym}</span>
              {meta && (
                <span
                  className="text-[10px] px-1.5 py-px rounded hidden sm:inline-block"
                  style={{ background: C.border, color: C.muted, fontWeight: 500 }}
                >
                  {meta.category}
                </span>
              )}
            </div>
            <div className="text-[11px] mt-0.5 hidden sm:block" style={{ color: C.muted }}>
              {meta?.fullName ?? coin.name}
            </div>
          </div>
        </div>
      </td>

      {/* Harga */}
      <td className="px-3 text-right" style={{ paddingTop: 13, paddingBottom: 13 }}>
        <span className="text-[13px] font-semibold font-mono" style={{ color: C.text }}>
          {formatCurrency(livePrice)}
        </span>
      </td>

      {/* 24j */}
      <td className="px-3 text-right" style={{ paddingTop: 13, paddingBottom: 13 }}>
        <span
          className="text-[13px] font-bold font-mono"
          style={{ color: isPos ? C.green : C.red }}
        >
          {isPos ? "+" : ""}{liveChange.toFixed(2)}%
        </span>
      </td>

      {/* Volume */}
      <td className="px-3 text-right hidden md:table-cell" style={{ paddingTop: 13, paddingBottom: 13 }}>
        <span className="text-[12px] font-mono" style={{ color: C.muted }}>
          ${formatCompactNumber(coin.total_volume)}
        </span>
      </td>

      {/* Kap Pasar */}
      <td className="px-3 text-right hidden lg:table-cell" style={{ paddingTop: 13, paddingBottom: 13 }}>
        <span className="text-[12px] font-mono" style={{ color: C.muted }}>
          ${formatCompactNumber(coin.market_cap)}
        </span>
      </td>

      {/* Sinyal AI */}
      <td className="px-4 text-right" style={{ paddingTop: 13, paddingBottom: 13 }}>
        <SignalBadge direction={signal?.direction ?? null} confidence={signal?.confidence} />
      </td>
    </tr>
  );
}

// ── Main Market Table ─────────────────────────────────────────────────────────
function MarketTable({
  activeFilter,
  activeCategory,
  signalMap,
  coins,
  rankChanges,
  flashedIds,
  lastUpdated,
  isLoading,
}: {
  activeFilter: string;
  activeCategory: string;
  signalMap: Map<string, { direction: "LONG"|"SHORT"|null; confidence: number }>;
  coins: CoinData[] | undefined;
  rankChanges: Map<string, number>;
  flashedIds: Set<string>;
  lastUpdated: Date | null;
  isLoading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof CoinData>("market_cap_rank");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [selectedCoin, setSelectedCoin] = useState<CoinData | null>(null);

  const { data: watchlist } = useGetWatchlist();
  const queryClient = useQueryClient();
  const { mutate: add } = useAddToWatchlist();
  const { mutate: remove } = useRemoveFromWatchlist();

  const watchlistSymbols = useMemo(
    () => new Set((watchlist ?? []).map((w: any) => w.symbol)),
    [watchlist]
  );

  const toggleWatchlist = useCallback((e: React.MouseEvent, coin: CoinData) => {
    e.stopPropagation();
    const sym = coin.symbol.toUpperCase();
    const inWl = watchlistSymbols.has(sym);
    if (inWl) {
      remove({ symbol: sym }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() }) });
    } else {
      add({ data: { symbol: sym, name: coin.name } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() }) });
    }
  }, [watchlistSymbols, add, remove, queryClient]);

  const handleSort = (key: keyof CoinData) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    if (!coins) return [];
    let list = [...coins];

    // Filter tab
    if (activeFilter === "Favorit") {
      list = list.filter(c => watchlistSymbols.has(c.symbol.toUpperCase()));
    } else if (activeFilter === "Sinyal AI") {
      list = list.filter(c => signalMap.has(c.symbol.toUpperCase()));
    }

    // Category pill
    const catCoins = CATEGORY_COINS[activeCategory];
    if (catCoins && catCoins.length > 0) {
      list = list.filter(c => catCoins.includes(c.symbol.toUpperCase()));
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
    }

    // Sort
    list.sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [coins, activeFilter, activeCategory, search, sortKey, sortDir, watchlistSymbols, signalMap]);

  const SortTh = ({ label, sortK, className = "" }: { label: string; sortK: keyof CoinData; className?: string }) => {
    const isActive = sortKey === sortK;
    return (
      <th
        className={cn("px-3 py-2.5 text-right cursor-pointer select-none transition-colors hover:text-[#EAECEF]", className)}
        style={{ color: isActive ? C.text : C.muted }}
        onClick={() => handleSort(sortK)}
      >
        <div className="flex items-center gap-1 justify-end">
          <span className="text-[11px] font-semibold">{label}</span>
          <span className="text-[10px] leading-none" style={{ color: isActive ? C.yellow : `${C.muted}50` }}>
            {isActive ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </div>
      </th>
    );
  };

  if (isLoading || !coins) {
    return (
      <div className="space-y-px p-4">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-14 rounded animate-pulse" style={{ background: C.surface }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Table header info + search */}
      <div className="flex items-start justify-between px-4 py-3 gap-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div className="text-[14px] font-bold" style={{ color: C.text }}>Top 50 Token — Kapitalisasi Pasar</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="text-[12px]" style={{ color: C.muted }}>Diperbarui otomatis setiap 60 detik</div>
            {lastUpdated && (
              <div className="flex items-center gap-1 text-[11px]" style={{ color: `${C.muted}90` }}>
                <RefreshCw className="h-2.5 w-2.5" />
                {toWIBTimeStr(lastUpdated)}
              </div>
            )}
          </div>
        </div>
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: C.muted }} />
          <Input
            placeholder="Cari koin..."
            className="pl-8 h-8 rounded-sm text-xs focus-visible:ring-1"
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              color: C.text,
              width: 200,
            }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10" style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
            <tr>
              <th className="pl-4 pr-2 py-2.5 w-8" />
              {/* Rank */}
              <th
                className="px-2 py-2.5 text-right cursor-pointer select-none text-[11px] font-semibold hidden sm:table-cell transition-colors hover:text-[#EAECEF]"
                style={{ color: C.muted, width: 52 }}
                onClick={() => handleSort("market_cap_rank")}
              >
                #
              </th>
              <th
                className="px-4 py-2.5 cursor-pointer select-none text-[11px] font-semibold transition-colors hover:text-[#EAECEF]"
                style={{ color: sortKey === "name" ? C.text : C.muted }}
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-1">
                  Nama
                  <span className="text-[10px]" style={{ color: sortKey === "name" ? C.yellow : `${C.muted}50` }}>
                    {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                </div>
              </th>
              <SortTh label="Harga" sortK="current_price" />
              <SortTh label="24j" sortK="price_change_percentage_24h" />
              <SortTh label="Volume 24j" sortK="total_volume" className="hidden md:table-cell" />
              <SortTh label="Kap Pasar" sortK="market_cap" className="hidden lg:table-cell" />
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold" style={{ color: C.muted }}>
                Sinyal AI
              </th>
            </tr>
          </thead>
          <tbody style={{ background: C.bg }}>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[13px]" style={{ color: C.muted }}>
                  Tidak ada koin yang ditemukan.
                </td>
              </tr>
            ) : (
              sorted.map((coin, idx) => (
                <CoinRow
                  key={coin.id}
                  coin={coin}
                  rank={sortKey === "market_cap_rank" ? coin.market_cap_rank : idx + 1}
                  rankDelta={rankChanges.get(coin.id)}
                  rankFlash={flashedIds.has(coin.id)}
                  isWatchlisted={watchlistSymbols.has(coin.symbol.toUpperCase())}
                  signal={signalMap.get(coin.symbol.toUpperCase()) ?? null}
                  onToggleWatchlist={toggleWatchlist}
                  onSelect={setSelectedCoin}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selectedCoin} onOpenChange={(o) => !o && setSelectedCoin(null)}>
        <DialogContent className="max-w-5xl h-[85vh] sm:h-[80vh] flex flex-col p-0 border gap-0" style={{ background: C.bg, borderColor: C.border }}>
          {selectedCoin && (
            <CoinChart
              symbol={selectedCoin.symbol}
              name={selectedCoin.name}
              currentPrice={selectedCoin.current_price}
              priceChange={selectedCoin.price_change_percentage_24h}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [, navigate] = useLocation();
  const [pageTab, setPageTab] = useState(0);
  const [filterTab, setFilterTab] = useState("Semua Kripto");
  const [category, setCategory] = useState("Semua");

  const { data: signals } = useSignals();
  const { data: coins, isLoading: coinsLoading, rankChanges, flashedIds, lastUpdated } = useTop50Coins();

  const signalMap = useMemo(() => {
    const m = new Map<string, { direction: "LONG"|"SHORT"|null; confidence: number }>();
    for (const s of signals ?? []) {
      m.set(s.coin.toUpperCase(), { direction: s.direction, confidence: s.confidence });
    }
    return m;
  }, [signals]);

  const handlePageTab = (i: number, label: string) => {
    if (label === "Sinyal Live") { navigate("/signals"); return; }
    if (label === "Berita") { navigate("/news"); return; }
    setPageTab(i);
  };

  return (
    <Layout>
      <div className="flex flex-col w-full min-h-0" style={{ background: C.bg }}>

        {/* Page Tabs */}
        <div
          className="flex items-end px-4 gap-1 shrink-0 overflow-x-auto"
          style={{ background: "#181A20", borderBottom: `1px solid ${C.border}` }}
        >
          {PAGE_TABS.map((tab, i) => {
            const isActive = pageTab === i && tab !== "Sinyal Live" && tab !== "Berita";
            return (
              <button
                key={tab}
                onClick={() => handlePageTab(i, tab)}
                className="flex items-center gap-1.5 px-3 py-3 text-[13px] font-medium transition-colors whitespace-nowrap relative shrink-0"
                style={{ color: isActive ? C.text : C.muted }}
              >
                {tab}
                {tab === "Sinyal Live" && (signalMap.size > 0) && (
                  <span
                    className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold"
                    style={{ background: "rgba(240,185,11,0.15)", color: C.yellow }}
                  >
                    {signalMap.size}
                  </span>
                )}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-sm"
                    style={{ background: C.yellow }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        {pageTab === 0 && (
          <>
            {/* Top 4 Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 p-3">
              <TrendingCard coins={coins} />
              <TopLosersCard coins={coins} />
              <FundingRateCard coins={coins} />
              <FearGreedCard />
            </div>

            {/* Filter Tabs */}
            <div
              className="flex items-end px-4 gap-0.5 overflow-x-auto shrink-0"
              style={{ borderBottom: `1px solid ${C.border}` }}
            >
              {FILTER_TABS.map((tab) => {
                const isActive = filterTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setFilterTab(tab)}
                    className="px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors relative shrink-0"
                    style={{ color: isActive ? C.text : C.muted }}
                  >
                    {tab}
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-sm"
                        style={{ background: C.yellow }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto shrink-0">
              {CATEGORY_PILLS.map((pill) => {
                const isActive = category === pill;
                return (
                  <button
                    key={pill}
                    onClick={() => setCategory(pill)}
                    className="px-3 py-1 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors shrink-0"
                    style={{
                      background: isActive ? C.border : "transparent",
                      color: isActive ? C.text : C.muted,
                    }}
                  >
                    {pill}
                  </button>
                );
              })}
            </div>

            {/* Market Table */}
            <MarketTable
              activeFilter={filterTab}
              activeCategory={category}
              signalMap={signalMap}
              coins={coins}
              rankChanges={rankChanges}
              flashedIds={flashedIds}
              lastUpdated={lastUpdated}
              isLoading={coinsLoading}
            />
          </>
        )}

        {/* Data Market tab — table only, full width */}
        {pageTab === 1 && (
          <>
            {/* Filter + category same as ringkasan */}
            <div
              className="flex items-end px-4 gap-0.5 overflow-x-auto shrink-0"
              style={{ borderBottom: `1px solid ${C.border}` }}
            >
              {FILTER_TABS.map((tab) => {
                const isActive = filterTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setFilterTab(tab)}
                    className="px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors relative shrink-0"
                    style={{ color: isActive ? C.text : C.muted }}
                  >
                    {tab}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-sm" style={{ background: C.yellow }} />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto shrink-0">
              {CATEGORY_PILLS.map((pill) => {
                const isActive = category === pill;
                return (
                  <button
                    key={pill}
                    onClick={() => setCategory(pill)}
                    className="px-3 py-1 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors shrink-0"
                    style={{ background: isActive ? C.border : "transparent", color: isActive ? C.text : C.muted }}
                  >
                    {pill}
                  </button>
                );
              })}
            </div>
            <MarketTable
              activeFilter={filterTab}
              activeCategory={category}
              signalMap={signalMap}
              coins={coins}
              rankChanges={rankChanges}
              flashedIds={flashedIds}
              lastUpdated={lastUpdated}
              isLoading={coinsLoading}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
