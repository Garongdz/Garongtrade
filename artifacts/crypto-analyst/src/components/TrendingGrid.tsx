import { useGetTrendingCoins } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { TrendingUp, Flame } from "lucide-react";
import { motion } from "framer-motion";

export default function TrendingGrid() {
  const { data, isLoading } = useGetTrendingCoins();

  if (isLoading || !data) {
    return (
      <div className="flex gap-4 overflow-hidden py-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="min-w-[280px] h-32 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-orange-500" />
        <h3 className="text-xl font-bold font-display text-white">Trending 24h</h3>
      </div>
      
      <div className="flex gap-4 overflow-x-auto pb-6 pt-2 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        {data.slice(0, 6).map((coin, index) => {
          const isPositive = coin.price_change_percentage_24h >= 0;
          return (
            <motion.div
              key={coin.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
              className="snap-start shrink-0"
            >
              <Card className="w-[280px] cursor-pointer hover:-translate-y-1 hover:shadow-cyan-500/10 hover:border-cyan-500/30 transition-all duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TrendingUp className="h-24 w-24 text-white -mt-8 -mr-8" />
                </div>
                <CardContent className="p-5 relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <img src={coin.image} alt={coin.name} className="w-10 h-10 rounded-full bg-white/10 p-1" />
                    <div>
                      <h4 className="font-bold text-white truncate max-w-[150px]">{coin.name}</h4>
                      <p className="text-xs text-muted-foreground font-semibold uppercase">{coin.symbol}</p>
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Price</p>
                      <p className="font-mono font-bold text-lg text-white">
                        {formatCurrency(coin.current_price_usd)}
                      </p>
                    </div>
                    <div className={`flex items-center gap-1 font-bold ${isPositive ? 'text-positive' : 'text-destructive'}`}>
                      {formatPercent(coin.price_change_percentage_24h)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
