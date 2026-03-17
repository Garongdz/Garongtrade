import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetCryptoPrices,
  useGetMarketOverview,
  useGetTrendingCoins,
  useGetWatchlist,
  useAddToWatchlist,
  useRemoveFromWatchlist,
  getGetWatchlistQueryKey,
  type CryptoPrice,
} from "@workspace/api-client-react";
import { useBinanceWS } from "@/contexts/BinanceWSContext";
import { usePriceFlash } from "@/hooks/usePriceFlash";
import { formatCurrency, formatCompactNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Star, ArrowUpDown, Search, TrendingUp, Activity, Gauge } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import CoinChart from "@/components/CoinChart";
import { Input } from "@/components/ui/input";
import Layout from "@/components/Layout";

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

function useFundingRates() {
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return useQuery({
    queryKey: ["funding-rates"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/market/funding-rates`);
      return r.json() as Promise<Record<string, number | null>>;
    },
    refetchInterval: 60_000,
    staleTime: 50_000,
  });
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function StatCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-3.5 flex flex-col gap-2"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function SignalBadge({ direction, confidence }: { direction: string | null; confidence?: number }) {
  if (!direction) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-bold"
      style={{ background: "rgba(132,142,156,0.12)", color: C.muted }}>
      WAIT
    </span>
  );
  const isLong = direction === "LONG";
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
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

function TrendingCard() {
  const { data } = useGetTrendingCoins();
  const { prices } = useBinanceWS();
  const top3 = data?.slice(0, 3) ?? [];

  return (
    <StatCard title="Trending 24j" icon={<TrendingUp className="h-3 w-3" />}>
      {top3.length === 0 ? (
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-7 rounded animate-pulse" style={{ background: C.surfaceH }} />)}
        </div>
      ) : (
        <div className="space-y-2">
          {top3.map((coin) => {
            const sym = coin.symbol.toUpperCase();
            const meta = COIN_META[sym];
            const live = prices[sym];
            const livePrice = live?.price ?? coin.current_price_usd;
            const liveChange = live?.changePercent ?? coin.price_change_percentage_24h;
            const isPos = liveChange >= 0;
            return (
              <div key={coin.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{
                      background: meta ? `${meta.color}20` : `${C.muted}20`,
                      color: meta?.color ?? C.muted,
                    }}
                  >
                    {sym[0]}
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

function SignalsCard() {
  const { data: signals } = useSignals();
  const top3 = signals?.slice(0, 3) ?? [];

  return (
    <StatCard title="Sinyal Aktif" icon={<Activity className="h-3 w-3" />}>
      {signals === undefined ? (
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-7 rounded animate-pulse" style={{ background: C.surfaceH }} />)}
        </div>
      ) : top3.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-3 gap-1">
          <span className="text-[11px]" style={{ color: C.muted }}>Belum ada sinyal aktif</span>
          <span className="text-[10px]" style={{ color: `${C.muted}80` }}>Scanner berjalan otomatis</span>
        </div>
      ) : (
        <div className="space-y-2">
          {top3.map((sig) => {
            const meta = COIN_META[sig.coin];
            return (
              <div key={sig.coin} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{
                      background: meta ? `${meta.color}20` : `${C.muted}20`,
                      color: meta?.color ?? C.muted,
                    }}
                  >
                    {sig.coin[0]}
                  </div>
                  <span className="text-[12px] font-bold" style={{ color: C.text }}>{sig.coin}</span>
                </div>
                <SignalBadge direction={sig.direction} confidence={sig.confidence} />
              </div>
            );
          })}
        </div>
      )}
    </StatCard>
  );
}

function FundingRateCard() {
  const { data: rates } = useFundingRates();
  const coins = ["BTC", "ETH", "SOL"] as const;

  return (
    <StatCard title="Funding Rate" icon={<Gauge className="h-3 w-3" />}>
      {rates === undefined ? (
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-7 rounded animate-pulse" style={{ background: C.surfaceH }} />)}
        </div>
      ) : (
        <div className="space-y-2">
          {coins.map((coin) => {
            const rate = rates[coin];
            const isNull = rate === null || rate === undefined;
            const isNeg = !isNull && rate < 0;
            const isPos = !isNull && rate > 0;
            return (
              <div key={coin} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{
                      background: `${COIN_META[coin]?.color ?? C.muted}20`,
                      color: COIN_META[coin]?.color ?? C.muted,
                    }}
                  >
                    {coin[0]}
                  </div>
                  <span className="text-[12px] font-bold" style={{ color: C.text }}>{coin}</span>
                </div>
                <div className="text-right">
                  <div
                    className="text-[12px] font-semibold font-mono"
                    style={{ color: isNull ? C.muted : isNeg ? C.green : isPos ? C.red : C.text }}
                  >
                    {isNull ? "—" : `${isPos ? "+" : ""}${rate!.toFixed(4)}%`}
                  </div>
                  {!isNull && (
                    <div className="text-[9px]" style={{ color: C.muted }}>
                      {isNeg ? "Squeeze potential" : isPos ? "Overheated" : "Netral"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StatCard>
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

// ── Main Table Row ─────────────────────────────────────────────────────────────
function CoinRow({
  coin,
  isWatchlisted,
  signal,
  onToggleWatchlist,
  onSelect,
}: {
  coin: CryptoPrice;
  isWatchlisted: boolean;
  signal?: { direction: "LONG" | "SHORT" | null; confidence: number } | null;
  onToggleWatchlist: (e: React.MouseEvent, coin: CryptoPrice) => void;
  onSelect: (coin: CryptoPrice) => void;
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
      className={cn("cursor-pointer transition-colors", flashClass)}
      style={{ borderBottom: `1px solid ${C.borderS}` }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceH)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      {/* Star */}
      <td className="pl-4 pr-2 py-3 w-8">
        <button
          onClick={(e) => onToggleWatchlist(e, coin)}
          className="transition-colors focus:outline-none"
          style={{ color: isWatchlisted ? C.yellow : C.muted }}
        >
          <Star className={cn("h-3.5 w-3.5", isWatchlisted && "fill-current")} />
        </button>
      </td>

      {/* Nama */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 overflow-hidden"
            style={{
              background: meta ? `${meta.color}20` : `${C.muted}20`,
            }}
          >
            {coin.image ? (
              <img src={coin.image} alt={sym} className="w-full h-full object-cover" />
            ) : (
              <span style={{ color: meta?.color ?? C.muted }}>{sym[0]}</span>
            )}
          </div>
          <div>
            <div className="text-[13px] font-bold" style={{ color: C.text }}>{sym}</div>
            <div className="mt-0.5">
              <span className="text-[11px] hidden sm:inline" style={{ color: C.muted }}>
                {meta?.fullName ?? coin.name}
              </span>
              {meta && (
                <span
                  className="text-[10px] px-1 py-px rounded ml-1 inline-block"
                  style={{ background: `${C.muted}18`, color: C.muted }}
                >
                  {meta.category}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Harga */}
      <td className="px-3 py-3 text-right">
        <span className="text-[13px] font-semibold font-mono" style={{ color: C.text }}>
          {formatCurrency(livePrice)}
        </span>
      </td>

      {/* 24j */}
      <td className="px-3 py-3 text-right">
        <span
          className="text-[13px] font-bold font-mono"
          style={{ color: isPos ? C.green : C.red }}
        >
          {isPos ? "+" : ""}{liveChange.toFixed(2)}%
        </span>
      </td>

      {/* Volume */}
      <td className="px-3 py-3 text-right hidden md:table-cell">
        <span className="text-[12px] font-mono" style={{ color: C.muted }}>
          ${formatCompactNumber(coin.total_volume)}
        </span>
      </td>

      {/* Kap Pasar */}
      <td className="px-3 py-3 text-right hidden lg:table-cell">
        <span className="text-[12px] font-mono" style={{ color: C.muted }}>
          ${formatCompactNumber(coin.market_cap)}
        </span>
      </td>

      {/* Sinyal AI */}
      <td className="px-4 py-3 text-right">
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
}: {
  activeFilter: string;
  activeCategory: string;
  signalMap: Map<string, { direction: "LONG"|"SHORT"|null; confidence: number }>;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof CryptoPrice>("market_cap_rank");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [selectedCoin, setSelectedCoin] = useState<CryptoPrice | null>(null);

  const { data: prices, isLoading } = useGetCryptoPrices();
  const { data: watchlist } = useGetWatchlist();
  const queryClient = useQueryClient();
  const { mutate: add } = useAddToWatchlist();
  const { mutate: remove } = useRemoveFromWatchlist();

  const watchlistSymbols = useMemo(
    () => new Set(watchlist?.map((w) => w.symbol) ?? []),
    [watchlist]
  );

  const toggleWatchlist = (e: React.MouseEvent, coin: CryptoPrice) => {
    e.stopPropagation();
    const inWl = watchlistSymbols.has(coin.symbol);
    if (inWl) {
      remove({ symbol: coin.symbol }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() }) });
    } else {
      add({ data: { symbol: coin.symbol, name: coin.name } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() }) });
    }
  };

  const handleSort = (key: keyof CryptoPrice) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    if (!prices) return [];
    let list = [...prices];

    // Filter tab
    if (activeFilter === "Favorit") {
      list = list.filter(c => watchlistSymbols.has(c.symbol));
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
      const av = a[sortKey], bv = b[sortKey];
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [prices, activeFilter, activeCategory, search, sortKey, sortDir, watchlistSymbols, signalMap]);

  const SortTh = ({ label, sortK, className = "" }: { label: string; sortK: keyof CryptoPrice; className?: string }) => (
    <th
      className={cn("px-3 py-2.5 text-right cursor-pointer select-none transition-colors hover:text-[#EAECEF]", className)}
      style={{ color: C.muted }}
      onClick={() => handleSort(sortK)}
    >
      <div className={cn("flex items-center gap-1", className.includes("text-right") ? "justify-end" : "")}>
        <span className="text-[11px] font-semibold">{label}</span>
        <ArrowUpDown className="h-2.5 w-2.5 shrink-0" />
      </div>
    </th>
  );

  if (isLoading || !prices) {
    return (
      <div className="space-y-px p-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 rounded animate-pulse" style={{ background: C.surface }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Table header info + search */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div className="text-[14px] font-bold" style={{ color: C.text }}>Token Teratas — Kapitalisasi Pasar</div>
          <div className="text-[12px] mt-0.5" style={{ color: C.muted }}>Harga real-time, volume, perubahan 24j, dan sinyal AI terkini.</div>
        </div>
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: C.muted }} />
          <Input
            placeholder="Cari koin..."
            className="pl-8 h-8 rounded-sm text-xs w-40 sm:w-52 focus-visible:ring-1"
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              color: C.text,
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
              <th
                className="px-3 py-2.5 cursor-pointer select-none text-[11px] font-semibold transition-colors hover:text-[#EAECEF]"
                style={{ color: C.muted }}
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-1">Nama <ArrowUpDown className="h-2.5 w-2.5" /></div>
              </th>
              <SortTh label="Harga" sortK="current_price" />
              <SortTh label="24j" sortK="price_change_percentage_24h" />
              <SortTh label="Volume" sortK="total_volume" className="hidden md:table-cell" />
              <SortTh label="Kap Pasar" sortK="market_cap" className="hidden lg:table-cell" />
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold" style={{ color: C.muted }}>
                Sinyal AI
              </th>
            </tr>
          </thead>
          <tbody style={{ background: C.bg }}>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[13px]" style={{ color: C.muted }}>
                  Tidak ada koin yang ditemukan.
                </td>
              </tr>
            ) : (
              sorted.map((coin) => (
                <CoinRow
                  key={coin.id}
                  coin={coin}
                  isWatchlisted={watchlistSymbols.has(coin.symbol)}
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
              <TrendingCard />
              <SignalsCard />
              <FundingRateCard />
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
            <MarketTable activeFilter={filterTab} activeCategory={category} signalMap={signalMap} />
          </>
        )}
      </div>
    </Layout>
  );
}
