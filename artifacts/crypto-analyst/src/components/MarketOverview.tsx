import { useGetMarketOverview } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCompactNumber, formatPercent } from "@/lib/utils";
import { Activity, BarChart3, PieChart, Zap } from "lucide-react";
import { motion } from "framer-motion";

export default function MarketOverview() {
  const { data, isLoading } = useGetMarketOverview();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="h-32 animate-pulse bg-white/5" />
        ))}
      </div>
    );
  }

  const isPositive = data.market_cap_change_24h >= 0;

  const stats = [
    {
      title: "Total Market Cap",
      value: `$${formatCompactNumber(data.total_market_cap)}`,
      change: formatPercent(data.market_cap_change_24h),
      isPositive,
      icon: Activity,
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
    },
    {
      title: "24h Volume",
      value: `$${formatCompactNumber(data.total_volume_24h)}`,
      icon: BarChart3,
      color: "text-indigo-400",
      bg: "bg-indigo-400/10",
    },
    {
      title: "Dominance",
      value: `BTC ${data.btc_dominance.toFixed(1)}%`,
      subValue: `ETH ${data.eth_dominance.toFixed(1)}%`,
      icon: PieChart,
      color: "text-amber-400",
      bg: "bg-amber-400/10",
    },
    {
      title: "Fear & Greed Index",
      value: data.fear_greed_index.toString(),
      subValue: data.fear_greed_label,
      icon: Zap,
      color: data.fear_greed_index > 50 ? "text-green-400" : "text-rose-400",
      bg: data.fear_greed_index > 50 ? "bg-green-400/10" : "bg-rose-400/10",
    },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      variants={container} 
      initial="hidden" 
      animate="show" 
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {stats.map((stat, i) => (
        <motion.div key={i} variants={item}>
          <Card className="overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{stat.title}</p>
                  <div className="flex items-baseline gap-2">
                    <h4 className="text-2xl font-bold font-mono tracking-tight text-white">{stat.value}</h4>
                  </div>
                  <div className="mt-1 flex items-center text-sm">
                    {stat.change ? (
                      <span className={`font-semibold ${stat.isPositive ? 'text-positive' : 'text-destructive'}`}>
                        {stat.change}
                      </span>
                    ) : stat.subValue ? (
                      <span className="text-muted-foreground font-medium">{stat.subValue}</span>
                    ) : null}
                  </div>
                </div>
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${stat.bg} ${stat.color} shadow-inner`}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
