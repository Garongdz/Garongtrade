import { useGetMarketOverview } from "@workspace/api-client-react";
import { formatCompactNumber, formatPercent } from "@/lib/utils";

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

  const stats = [
    {
      title: "Market Cap",
      value: `$${formatCompactNumber(data.total_market_cap)}`,
      change: formatPercent(data.market_cap_change_24h),
      isPositive,
    },
    {
      title: "24h Vol",
      value: `$${formatCompactNumber(data.total_volume_24h)}`,
    },
    {
      title: "Dominance",
      value: `BTC ${data.btc_dominance.toFixed(1)}% | ETH ${data.eth_dominance.toFixed(1)}%`,
    },
    {
      title: "Fear/Greed",
      value: `${data.fear_greed_index} (${data.fear_greed_label})`,
      color: data.fear_greed_index > 50 ? "text-positive" : "text-destructive",
    },
  ];

  return (
    <div className="flex h-[41px] items-center px-4 overflow-x-auto whitespace-nowrap scrollbar-hide text-xs font-sans">
      {stats.map((stat, i) => (
        <div key={i} className="flex items-center mr-6">
          <span className="text-muted-foreground mr-2">{stat.title}:</span>
          <span className="font-mono-price text-foreground mr-2">{stat.value}</span>
          {stat.change && (
            <span className={`font-mono-price ${stat.isPositive ? 'text-positive' : 'text-destructive'}`}>
              {stat.change}
            </span>
          )}
          {stat.color && !stat.change && (
            <span className={stat.color}>{stat.value.split(' ')[0]}</span>
          )}
        </div>
      ))}
    </div>
  );
}
