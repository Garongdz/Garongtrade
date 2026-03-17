import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";

export interface TickerData {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  prevPrice?: number;
}

export type LivePriceMap = Record<string, TickerData>;
export type PriceHistory = Record<string, number[]>;

interface BinanceWSContextValue {
  prices: LivePriceMap;
  history: PriceHistory;
  connected: boolean;
}

const BinanceWSContext = createContext<BinanceWSContextValue>({
  prices: {},
  history: {},
  connected: false,
});

const MAX_HISTORY = 60;

function getWsUrl(): string {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${base}/api/ws/prices`;
}

export function BinanceWSProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<LivePriceMap>({});
  const [history, setHistory] = useState<PriceHistory>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const pricesRef = useRef<LivePriceMap>({});

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = getWsUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (!msg.data || !Array.isArray(msg.data)) return;

        const newPrices: LivePriceMap = {};
        const histPatches: Record<string, number> = {};

        for (const t of msg.data) {
          if (!t.s?.endsWith("USDT")) continue;
          const sym = (t.s as string).replace("USDT", "");
          const price = parseFloat(t.c);
          const open = parseFloat(t.o);
          const change = price - open;
          const changePercent = open > 0 ? (change / open) * 100 : 0;
          const prev = pricesRef.current[sym];

          newPrices[sym] = {
            symbol: sym,
            price,
            open,
            high: parseFloat(t.h),
            low: parseFloat(t.l),
            volume: parseFloat(t.q),
            change,
            changePercent,
            prevPrice: prev?.price,
          };
          histPatches[sym] = price;
        }

        pricesRef.current = { ...pricesRef.current, ...newPrices };
        setPrices((prev) => ({ ...prev, ...newPrices }));
        setHistory((prev) => {
          const next = { ...prev };
          for (const [sym, price] of Object.entries(histPatches)) {
            const arr = next[sym] || [];
            next[sym] =
              arr.length >= MAX_HISTORY
                ? [...arr.slice(1), price]
                : [...arr, price];
          }
          return next;
        });
      } catch (_) {}
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <BinanceWSContext.Provider value={{ prices, history, connected }}>
      {children}
    </BinanceWSContext.Provider>
  );
}

export function useBinanceWS() {
  return useContext(BinanceWSContext);
}
