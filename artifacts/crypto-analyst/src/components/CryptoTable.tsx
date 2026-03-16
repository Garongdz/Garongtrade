import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetCryptoPrices, 
  useGetWatchlist, 
  useAddToWatchlist, 
  useRemoveFromWatchlist,
  getGetWatchlistQueryKey,
  type CryptoPrice 
} from "@workspace/api-client-react";
import { formatCurrency, formatCompactNumber, formatPercent } from "@/lib/utils";
import { Star, Search, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import CoinChart from "./CoinChart";
import { motion, AnimatePresence } from "framer-motion";

interface CryptoTableProps {
  filterWatchlistOnly?: boolean;
}

export default function CryptoTable({ filterWatchlistOnly = false }: CryptoTableProps) {
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof CryptoPrice; direction: 'asc' | 'desc' }>({
    key: 'market_cap_rank',
    direction: 'asc'
  });
  const [selectedCoin, setSelectedCoin] = useState<CryptoPrice | null>(null);

  const { data: prices, isLoading } = useGetCryptoPrices();
  const { data: watchlist } = useGetWatchlist();
  
  const queryClient = useQueryClient();
  const { mutate: add } = useAddToWatchlist();
  const { mutate: remove } = useRemoveFromWatchlist();

  if (isLoading || !prices) {
    return (
      <div className="w-full h-96 bg-white/5 rounded-2xl animate-pulse" />
    );
  }

  const watchlistSymbols = new Set(watchlist?.map(w => w.symbol) || []);

  const handleSort = (key: keyof CryptoPrice) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const toggleWatchlist = (e: React.MouseEvent, coin: CryptoPrice) => {
    e.stopPropagation();
    const isWatchlisted = watchlistSymbols.has(coin.symbol);
    
    if (isWatchlisted) {
      remove(
        { symbol: coin.symbol },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() }) }
      );
    } else {
      add(
        { data: { symbol: coin.symbol, name: coin.name } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() }) }
      );
    }
  };

  let filtered = prices.filter(coin => 
    coin.name.toLowerCase().includes(search.toLowerCase()) || 
    coin.symbol.toLowerCase().includes(search.toLowerCase())
  );

  if (filterWatchlistOnly) {
    filtered = filtered.filter(coin => watchlistSymbols.has(coin.symbol));
  }

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-xl font-bold font-display text-white">
          {filterWatchlistOnly ? "Your Watchlist" : "Cryptocurrency Prices"}
        </h3>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search coin or symbol..." 
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground focus-visible:ring-primary h-11 rounded-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-muted-foreground font-semibold">
              <tr>
                <th className="p-4 w-12 text-center">#</th>
                <th className="p-4 w-12"></th>
                <th className="p-4 min-w-[200px] cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">Asset <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-4 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('current_price')}>
                  <div className="flex items-center justify-end gap-1">Price <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-4 text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('price_change_percentage_24h')}>
                  <div className="flex items-center justify-end gap-1">24h Change <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-4 text-right hidden md:table-cell cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('market_cap')}>
                  <div className="flex items-center justify-end gap-1">Market Cap <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-4 text-right hidden lg:table-cell cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('total_volume')}>
                  <div className="flex items-center justify-end gap-1">Volume (24h) <ArrowUpDown className="h-3 w-3" /></div>
                </th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No cryptocurrencies found.
                    </td>
                  </tr>
                ) : (
                  sorted.map((coin, index) => {
                    const isPositive = coin.price_change_percentage_24h >= 0;
                    const isWatchlisted = watchlistSymbols.has(coin.symbol);

                    return (
                      <motion.tr 
                        key={coin.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: Math.min(index * 0.05, 0.5) }}
                        onClick={() => setSelectedCoin(coin)}
                        className="border-t border-white/5 hover:bg-white/5 cursor-pointer group transition-colors"
                      >
                        <td className="p-4 text-center text-muted-foreground font-mono">{coin.market_cap_rank}</td>
                        <td className="p-4 text-center">
                          <button 
                            onClick={(e) => toggleWatchlist(e, coin)}
                            className="p-1.5 rounded-full hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <Star className={`h-5 w-5 transition-colors ${isWatchlisted ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground group-hover:text-white/50'}`} />
                          </button>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <img src={coin.image} alt={coin.name} className="w-8 h-8 rounded-full bg-white/10 p-0.5" />
                            <div>
                              <p className="font-bold text-white">{coin.name}</p>
                              <p className="text-xs text-muted-foreground uppercase font-semibold">{coin.symbol}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-right font-mono font-semibold text-white">
                          {formatCurrency(coin.current_price)}
                        </td>
                        <td className={`p-4 text-right font-bold ${isPositive ? 'text-positive' : 'text-destructive'}`}>
                          <div className={`inline-flex px-2 py-1 rounded-lg ${isPositive ? 'bg-positive/10' : 'bg-destructive/10'}`}>
                            {formatPercent(coin.price_change_percentage_24h)}
                          </div>
                        </td>
                        <td className="p-4 text-right hidden md:table-cell font-mono text-white/80">
                          ${formatCompactNumber(coin.market_cap)}
                        </td>
                        <td className="p-4 text-right hidden lg:table-cell font-mono text-white/80">
                          ${formatCompactNumber(coin.total_volume)}
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selectedCoin} onOpenChange={(open) => !open && setSelectedCoin(null)}>
        <DialogContent className="max-w-5xl h-[85vh] sm:h-[80vh] flex flex-col p-6 sm:p-10">
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
