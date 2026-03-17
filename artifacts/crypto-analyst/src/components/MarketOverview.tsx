import { useGetMarketOverview } from "@workspace/api-client-react";
import { formatCompactNumber, formatPercent } from "@/lib/utils";
import { useBinanceWS } from "@/contexts/BinanceWSContext";
import { usePriceFlash } from "@/hooks/usePriceFlash";

function LiveBTCPrice() {
  const { prices } = useBinanceWS();
  const btc = prices["BTC"];
  const flash = usePriceFlash(btc?.price);

  if (!btc) return null;

  const isPositive = btc.changePercent >= 0;

  return (
    <div className="flex items-center mr-6">
      <span className="text-muted-foreground mr-2">BTC:</span>
      <span className={`font-mono-price text-foreground mr-1.5 transition-colors ${flash === "price-flash-up" ? "text-positive" : flash === "price-flash-down" ? "text-destructive" : ""}`}>
        ${btc.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span className={`font-mono-price text-xs ${isPositive ? "text-positive" : "text-destructive"}`}>
        {isPositive ? "+" : ""}{btc.changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

export default function MarketOverview() {
  const { data, isLoading } = useGetMarketOverview();

  if (isLoading || !data) {
    return (
      <div className="h-[41px] flex items-center px-4 space-x-6 animate-pulse bg-card text-xs">
        <div className="w-24 h-4 bg-muted rounded"></div>
        <div className="w-32 h-4 bg-muted rounded"></div>
        <div className="w-32 h-4 bg-muted rounded"></div>
      </div>
    );
  }

  const isPositive = data.market_cap_change_24h >= 0;

  return (
    <div className="flex h-[41px] items-center px-4 overflow-x-auto whitespace-nowrap scrollbar-hide text-xs font-sans">
      <LiveBTCPrice />

      <div className="flex items-center mr-6">
        <span className="text-muted-foreground mr-2">Market Cap:</span>
        <span className="font-mono-price text-foreground mr-2">
          ${formatCompactNumber(data.total_market_cap)}
        </span>
        <span className={`font-mono-price ${isPositive ? "text-positive" : "text-destructive"}`}>
          {formatPercent(data.market_cap_change_24h)}
        </span>
      </div>

      <div className="flex items-center mr-6">
        <span className="text-muted-foreground mr-2">24h Vol:</span>
        <span className="font-mono-price text-foreground">
          ${formatCompactNumber(data.total_volume_24h)}
        </span>
      </div>

      <div className="flex items-center mr-6">
        <span className="text-muted-foreground mr-2">Dominance:</span>
        <span className="font-mono-price text-foreground">
          BTC {data.btc_dominance.toFixed(1)}% | ETH {data.eth_dominance.toFixed(1)}%
        </span>
      </div>

      <div className="flex items-center">
        <span className="text-muted-foreground mr-2">Fear/Greed:</span>
        <span className={`font-mono-price ${data.fear_greed_index > 50 ? "text-positive" : "text-destructive"}`}>
          {data.fear_greed_index} ({data.fear_greed_label})
        </span>
      </div>
    </div>
  );
}
