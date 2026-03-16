import { useGetTrendingCoins } from "@workspace/api-client-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Flame } from "lucide-react";

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
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Hot 24h</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {data.slice(0, 10).map((coin) => {
          const isPositive = coin.price_change_percentage_24h >= 0;
          return (
            <div
              key={coin.id}
              className="flex items-center justify-between p-3 border-b border-border hover:bg-muted cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <img src={coin.image} alt={coin.name} className="w-5 h-5 rounded-full" />
                <span className="font-bold text-sm text-foreground uppercase truncate">
                  {coin.symbol}
                </span>
              </div>
              <div className="flex flex-col items-end text-xs">
                <span className={`font-mono-price ${isPositive ? 'text-positive' : 'text-destructive'}`}>
                  {formatCurrency(coin.current_price_usd)}
                </span>
                <span className={`font-mono-price ${isPositive ? 'text-positive' : 'text-destructive'}`}>
                  {formatPercent(coin.price_change_percentage_24h)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
