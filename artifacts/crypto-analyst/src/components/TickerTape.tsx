import { useBinanceWS } from "@/contexts/BinanceWSContext";
import { usePriceFlash } from "@/hooks/usePriceFlash";

const TICKER_SYMS = [
  "BTC", "ETH", "SOL", "BNB", "XRP",
  "DOGE", "ADA", "AVAX", "DOT", "LINK",
  "MATIC", "LTC", "UNI", "ATOM", "TRX",
];

function formatTickerPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(3);
  return price.toFixed(5);
}

function TickerItem({ sym, price, changePercent }: { sym: string; price: number; changePercent: number }) {
  const flash = usePriceFlash(price);
  const isPositive = changePercent >= 0;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 border-r border-border h-full whitespace-nowrap ${flash}`}>
      <span className="text-muted-foreground text-[11px]">{sym}/USDT</span>
      <span
        className={`font-mono-price text-[11px] font-semibold transition-colors duration-100 ${
          flash === "price-flash-up"
            ? "text-positive"
            : flash === "price-flash-down"
            ? "text-destructive"
            : "text-foreground"
        }`}
      >
        {formatTickerPrice(price)}
      </span>
      <span className={`font-mono-price text-[10px] ${isPositive ? "text-positive" : "text-destructive"}`}>
        {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
      </span>
    </span>
  );
}

export default function TickerTape() {
  const { prices, connected } = useBinanceWS();
  const items = TICKER_SYMS.filter((s) => prices[s]);

  if (!connected || items.length === 0) {
    return (
      <div className="h-[30px] bg-[#0B0E11] border-b border-border flex items-center px-4">
        <span className="text-muted-foreground text-[11px] animate-pulse">
          Connecting to live feed...
        </span>
      </div>
    );
  }

  const doubled = [...items, ...items];

  return (
    <div className="h-[30px] bg-[#0B0E11] border-b border-border overflow-hidden relative">
      <div className="ticker-scroll flex items-center h-full">
        {doubled.map((sym, idx) => {
          const d = prices[sym];
          if (!d) return null;
          return (
            <TickerItem
              key={`${sym}-${idx}`}
              sym={sym}
              price={d.price}
              changePercent={d.changePercent}
            />
          );
        })}
      </div>
    </div>
  );
}
