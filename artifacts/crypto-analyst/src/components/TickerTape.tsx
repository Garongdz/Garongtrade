import { useBinanceWS } from "@/contexts/BinanceWSContext";

const TICKER_SYMS = [
  "BTC", "ETH", "SOL", "BNB", "XRP",
  "DOGE", "ADA", "AVAX", "DOT", "LINK",
  "MATIC", "LTC", "UNI", "ATOM", "TRX",
];

function formatTickerPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1000)  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)     return price.toFixed(3);
  return price.toFixed(5);
}

function TickerItem({ sym, price, changePercent }: { sym: string; price: number; changePercent: number }) {
  const isPos = changePercent >= 0;
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap shrink-0"
      style={{ fontSize: 11, paddingLeft: 20, paddingRight: 20 }}
    >
      {/* Divider */}
      <span
        className="h-3 w-px shrink-0"
        style={{ background: "#2B3139", marginRight: 2 }}
      />
      <span style={{ color: "#848E9C", fontWeight: 500 }}>{sym}/USDT</span>
      <span
        className="font-mono-price"
        style={{ color: "#EAECEF", fontWeight: 600 }}
      >
        {formatTickerPrice(price)}
      </span>
      <span
        className="font-mono-price"
        style={{ color: isPos ? "#0ECB81" : "#F6465D", fontWeight: 500 }}
      >
        {isPos ? "+" : ""}{changePercent.toFixed(2)}%
      </span>
    </span>
  );
}

export default function TickerTape() {
  const { prices, connected } = useBinanceWS();
  const items = TICKER_SYMS.filter((s) => prices[s]);

  if (!connected || items.length === 0) {
    return (
      <div
        className="overflow-hidden"
        style={{ height: 30, background: "#0B0E11", borderBottom: "1px solid #1A1D24" }}
      >
        <div className="flex items-center h-full px-4">
          <span style={{ color: "#848E9C", fontSize: 11 }} className="animate-pulse">
            Menghubungkan ke feed live...
          </span>
        </div>
      </div>
    );
  }

  const doubled = [...items, ...items];

  return (
    <div
      className="overflow-hidden relative"
      style={{ height: 30, background: "#0B0E11", borderBottom: "1px solid #1A1D24" }}
    >
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
