import { useGetTrendingCoins } from "@workspace/api-client-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Flame } from "lucide-react";
import { useBinanceWS } from "@/contexts/BinanceWSContext";
import { usePriceFlash } from "@/hooks/usePriceFlash";
import { Sparkline } from "./Sparkline";

function TrendingRow({
  id,
  symbol,
  image,
  name,
  staticPrice,
  staticChange,
}: {
  id: string;
  symbol: string;
  image: string;
  name: string;
  staticPrice: number;
  staticChange: number;
}) {
  const { prices, history } = useBinanceWS();
  const binanceSym = symbol.toUpperCase();
  const live = prices[binanceSym];

  const livePrice = live?.price ?? staticPrice;
  const liveChange = live?.changePercent ?? staticChange;
  const sparkData = history[binanceSym] ?? [];

  const flashClass = usePriceFlash(livePrice);
  const isPositive = liveChange >= 0;

  return (
    <div
      key={id}
      className={`flex items-center justify-between p-3 border-b border-border hover:bg-muted cursor-pointer transition-colors ${flashClass}`}
    >
      <div className="flex items-center gap-2 overflow-hidden min-w-0">
        <img src={image} alt={name} className="w-5 h-5 rounded-full shrink-0" />
        <div className="min-w-0">
          <div className="font-bold text-sm text-foreground uppercase truncate">
            {symbol}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Sparkline data={sparkData} width={48} height={22} />
        <div className="flex flex-col items-end text-xs">
          <span className={`font-mono-price transition-colors ${isPositive ? "text-positive" : "text-destructive"}`}>
            {formatCurrency(livePrice)}
          </span>
          <span className={`font-mono-price ${isPositive ? "text-positive" : "text-destructive"}`}>
            {formatPercent(liveChange)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function TrendingGrid() {
  const { data, isLoading } = useGetTrendingCoins();

  if (isLoading || !data) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="w-full h-12 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card font-sans">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-card">
        <Flame className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Hot 24h
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {data.slice(0, 12).map((coin) => (
          <TrendingRow
            key={coin.id}
            id={coin.id}
            symbol={coin.symbol}
            image={coin.image}
            name={coin.name}
            staticPrice={coin.current_price_usd}
            staticChange={coin.price_change_percentage_24h}
          />
        ))}
      </div>
    </div>
  );
}
