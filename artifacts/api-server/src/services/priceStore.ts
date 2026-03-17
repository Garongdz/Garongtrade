export interface TickerData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  image: string;
  ath: number;
  ath_change_percentage: number;
  circulating_supply: number;
}

let _store: TickerData[] = [];
let _updatedAt = 0;

export function updatePriceStore(tickers: TickerData[]) {
  _store = tickers;
  _updatedAt = Date.now();
}

export function getPriceStore(): { tickers: TickerData[]; updatedAt: number } {
  return { tickers: _store, updatedAt: _updatedAt };
}
