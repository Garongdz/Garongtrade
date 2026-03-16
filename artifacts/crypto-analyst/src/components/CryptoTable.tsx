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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import CoinChart from "./CoinChart";

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
      <div className="w-full h-96 bg-card animate-pulse" />
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
    <div className="flex flex-col h-full bg-background font-sans">
      {/* Search Bar */}
      <div className="flex items-center px-4 py-2 border-b border-border bg-background">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input 
            placeholder="Search coin or symbol..." 
            className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground h-8 rounded-sm text-xs focus-visible:ring-primary focus-visible:ring-1 focus-visible:border-primary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-card text-muted-foreground font-medium uppercase sticky top-0 z-10 border-b border-border">
            <tr>
              <th className="px-4 py-2 w-8"></th>
              <th className="px-4 py-2 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('name')}>
                <div className="flex items-center gap-1">Pair <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-4 py-2 text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('current_price')}>
                <div className="flex items-center justify-end gap-1">Price <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-4 py-2 text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('price_change_percentage_24h')}>
                <div className="flex items-center justify-end gap-1">24h Change <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-4 py-2 text-right hidden md:table-cell cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('market_cap')}>
                <div className="flex items-center justify-end gap-1">Market Cap <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-4 py-2 text-right hidden lg:table-cell cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('total_volume')}>
                <div className="flex items-center justify-end gap-1">Volume <ArrowUpDown className="h-3 w-3" /></div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-background">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No cryptocurrencies found.
                </td>
              </tr>
            ) : (
              sorted.map((coin) => {
                const isPositive = coin.price_change_percentage_24h >= 0;
                const isWatchlisted = watchlistSymbols.has(coin.symbol);

                return (
                  <tr 
                    key={coin.id}
                    onClick={() => setSelectedCoin(coin)}
                    className="border-b border-border hover:bg-muted cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2 text-center">
                      <button 
                        onClick={(e) => toggleWatchlist(e, coin)}
                        className="hover:text-primary transition-colors focus:outline-none"
                      >
                        <Star className={`h-4 w-4 ${isWatchlisted ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <img src={coin.image} alt={coin.name} className="w-5 h-5 rounded-full bg-white/10" />
                        <span className="font-bold text-foreground text-sm uppercase">{coin.symbol}</span>
                        <span className="text-muted-foreground hidden sm:inline">{coin.name}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-right font-mono-price text-sm ${isPositive ? 'text-positive' : 'text-destructive'}`}>
                      {formatCurrency(coin.current_price)}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono-price text-sm ${isPositive ? 'text-positive' : 'text-destructive'}`}>
                      {isPositive ? '+' : ''}{coin.price_change_percentage_24h.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2 text-right hidden md:table-cell font-mono-price text-foreground">
                      {formatCompactNumber(coin.market_cap)}
                    </td>
                    <td className="px-4 py-2 text-right hidden lg:table-cell font-mono-price text-foreground">
                      {formatCompactNumber(coin.total_volume)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selectedCoin} onOpenChange={(open) => !open && setSelectedCoin(null)}>
        <DialogContent className="max-w-5xl h-[85vh] sm:h-[80vh] flex flex-col p-0 border border-border bg-background rounded-sm gap-0 gap-y-0">
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
