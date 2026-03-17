import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  createChart, CrosshairMode, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries,
  type IChartApi, type ISeriesApi, type CandlestickData, type HistogramData, type LineData,
} from "lightweight-charts";
import { Star, Maximize2, Minimize2, Zap, ChevronDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import Layout from "@/components/Layout";

// ── Design Tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      "#0B0E11", surface: "#181A20", surface2: "#1E2329",
  border:  "#2B3139", text:    "#EAECEF", muted:    "#848E9C",
  yellow:  "#F0B90B", green:   "#0ECB81", red:      "#F6465D",
  purple:  "#9945FF", blue:    "#627EEA",
};

// ── Timeframes ────────────────────────────────────────────────────────────────
const TIMEFRAMES = [
  { label: "1m",  interval: "1m"  },
  { label: "5m",  interval: "5m"  },
  { label: "15m", interval: "15m" },
  { label: "1j",  interval: "1h"  },
  { label: "4j",  interval: "4h"  },
  { label: "1H",  interval: "1d"  },
  { label: "1M",  interval: "1M"  },
];

// ── Coin List ─────────────────────────────────────────────────────────────────
const COIN_LIST = [
  "BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","DOT","LINK",
  "MATIC","LTC","UNI","ATOM","TRX","ARB","OP","APT","SUI","INJ",
  "FET","NEAR","ICP","FIL","PEPE","WIF","BONK","SEI","TIA","PYTH",
];

const COIN_COLORS: Record<string, string> = {
  BTC:"#F7931A",ETH:"#627EEA",SOL:"#9945FF",BNB:"#F0B90B",XRP:"#00A8FF",
  DOGE:"#C2A633",ADA:"#0033AD",AVAX:"#E84142",DOT:"#E6007A",LINK:"#2A5ADA",
};

// ── Math Helpers ──────────────────────────────────────────────────────────────
function calcSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    return closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
  });
}

function calcEMA(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const ema: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { ema.push(null); continue; }
    if (i === period - 1) {
      prev = closes.slice(0, period).reduce((a, b) => a + b) / period;
      ema.push(prev); continue;
    }
    prev = closes[i] * k + (prev as number) * (1 - k);
    ema.push(prev);
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  result.push(...Array(period).fill(null));
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const d = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    }
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

function calcBB(closes: number[], period = 20, mult = 2): { upper: (number|null)[]; mid: (number|null)[]; lower: (number|null)[] } {
  const upper: (number|null)[] = [], mid: (number|null)[] = [], lower: (number|null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(null); mid.push(null); lower.push(null); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const m = slice.reduce((a, b) => a + b) / period;
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - m) ** 2, 0) / period);
    mid.push(m); upper.push(m + mult * std); lower.push(m - mult * std);
  }
  return { upper, mid, lower };
}

function formatPrice(p: number): string {
  if (p >= 10000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1000)  return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1)     return p.toFixed(3);
  return p.toFixed(6);
}

// ── Candle type ───────────────────────────────────────────────────────────────
interface Candle extends CandlestickData { volume: number; }

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ChartPage() {
  const [, params] = useRoute("/chart/:symbol");
  const [, nav] = useLocation();
  const symbolFromRoute = (params as any)?.symbol?.toUpperCase() ?? "BTC";

  const [symbol, setSymbol] = useState(symbolFromRoute);
  const [tfIdx, setTfIdx] = useState(3); // default "1j" (1h)
  const [indicators, setIndicators] = useState({ MA: false, EMA: false, VOL: true, RSI: false, MACD: false, BB: false });
  const [fullscreen, setFullscreen] = useState(false);
  const [coinOpen, setCoinOpen] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveChange, setLiveChange] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const tf = TIMEFRAMES[tfIdx];
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  // Chart refs
  const mainContainerRef  = useRef<HTMLDivElement>(null);
  const rsiContainerRef   = useRef<HTMLDivElement>(null);
  const mainChartRef      = useRef<IChartApi | null>(null);
  const rsiChartRef       = useRef<IChartApi | null>(null);
  const candleSeriesRef   = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef      = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maSeriesRef       = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSeriesRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperRef        = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMidRef          = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef        = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const wsRef             = useRef<WebSocket | null>(null);
  const syncingRef        = useRef(false);

  // ── Fetch Klines ────────────────────────────────────────────────────────────
  const fetchCandles = useCallback(async (sym: string, interval: string) => {
    setIsLoading(true);
    try {
      const r = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${sym}USDT&interval=${interval}&limit=300`
      );
      const raw: any[][] = await r.json();
      const data: Candle[] = raw.map((k) => ({
        time: (k[0] / 1000) as any,
        open: parseFloat(k[1]), high: parseFloat(k[2]),
        low:  parseFloat(k[3]), close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
      setCandles(data);
      setLivePrice(data[data.length - 1]?.close ?? null);
    } catch (e) {
      console.error("Klines fetch error", e);
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchCandles(symbol, tf.interval); }, [symbol, tf.interval, fetchCandles]);

  // ── Chart Initialization ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mainContainerRef.current) return;

    const chart = createChart(mainContainerRef.current, {
      layout: { background: { color: C.bg }, textColor: C.muted },
      grid: { vertLines: { color: C.surface2 }, horzLines: { color: C.surface2 } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false },
      width: mainContainerRef.current.clientWidth,
      height: mainContainerRef.current.clientHeight,
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: C.green, downColor: C.red,
      borderUpColor: C.green, borderDownColor: C.red,
      wickUpColor: C.green, wickDownColor: C.red,
    });

    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    const ma = chart.addSeries(LineSeries, { color: C.yellow, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, visible: false });
    const ema = chart.addSeries(LineSeries, { color: C.blue, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, visible: false });
    const bbU = chart.addSeries(LineSeries, { color: `${C.yellow}80`, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, visible: false });
    const bbM = chart.addSeries(LineSeries, { color: `${C.yellow}60`, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });
    const bbL = chart.addSeries(LineSeries, { color: `${C.yellow}80`, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, visible: false });

    mainChartRef.current    = chart;
    candleSeriesRef.current = candle;
    volSeriesRef.current    = vol;
    maSeriesRef.current     = ma;
    emaSeriesRef.current    = ema;
    bbUpperRef.current      = bbU;
    bbMidRef.current        = bbM;
    bbLowerRef.current      = bbL;

    const ro = new ResizeObserver(() => {
      if (mainContainerRef.current) {
        chart.resize(mainContainerRef.current.clientWidth, mainContainerRef.current.clientHeight);
      }
    });
    if (mainContainerRef.current) ro.observe(mainContainerRef.current);

    return () => { ro.disconnect(); chart.remove(); mainChartRef.current = null; };
  }, []);

  // ── RSI Chart Initialization ─────────────────────────────────────────────────
  useEffect(() => {
    if (!rsiContainerRef.current) return;

    const chart = createChart(rsiContainerRef.current, {
      layout: { background: { color: C.bg }, textColor: C.muted },
      grid: { vertLines: { color: "transparent" }, horzLines: { color: `${C.border}50` } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false, visible: false },
      width: rsiContainerRef.current.clientWidth,
      height: rsiContainerRef.current.clientHeight,
      handleScroll: false, handleScale: false,
    });

    const rsi = chart.addSeries(LineSeries, { color: C.purple, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });

    rsiChartRef.current  = chart;
    rsiSeriesRef.current = rsi;

    // Sync timescale with main chart
    mainChartRef.current?.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncingRef.current || !range) return;
      syncingRef.current = true;
      chart.timeScale().setVisibleLogicalRange(range);
      syncingRef.current = false;
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncingRef.current || !range) return;
      syncingRef.current = true;
      mainChartRef.current?.timeScale().setVisibleLogicalRange(range);
      syncingRef.current = false;
    });

    const ro = new ResizeObserver(() => {
      if (rsiContainerRef.current) {
        chart.resize(rsiContainerRef.current.clientWidth, rsiContainerRef.current.clientHeight);
      }
    });
    if (rsiContainerRef.current) ro.observe(rsiContainerRef.current);

    return () => { ro.disconnect(); chart.remove(); rsiChartRef.current = null; };
  }, []);

  // ── Populate Charts when candles change ────────────────────────────────────
  useEffect(() => {
    if (!candles.length) return;

    const closes = candles.map((c) => c.close);

    // Candlestick
    candleSeriesRef.current?.setData(candles.map(({ volume: _v, ...c }) => c));

    // Volume
    volSeriesRef.current?.setData(
      candles.map((c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? `${C.green}90` : `${C.red}90` } as HistogramData))
    );

    // MA
    const sma = calcSMA(closes, 20);
    maSeriesRef.current?.setData(
      candles.map((c, i) => ({ time: c.time, value: sma[i] ?? NaN } as LineData)).filter((d) => !isNaN(d.value as number))
    );

    // EMA
    const ema50 = calcEMA(closes, 50);
    emaSeriesRef.current?.setData(
      candles.map((c, i) => ({ time: c.time, value: ema50[i] ?? NaN } as LineData)).filter((d) => !isNaN(d.value as number))
    );

    // BB
    const bb = calcBB(closes);
    const bbToSeries = (vals: (number|null)[]) =>
      candles.map((c, i) => ({ time: c.time, value: vals[i] ?? NaN } as LineData)).filter((d) => !isNaN(d.value as number));
    bbUpperRef.current?.setData(bbToSeries(bb.upper));
    bbMidRef.current?.setData(bbToSeries(bb.mid));
    bbLowerRef.current?.setData(bbToSeries(bb.lower));

    // RSI
    const rsi = calcRSI(closes);
    rsiSeriesRef.current?.setData(
      candles.map((c, i) => ({ time: c.time, value: rsi[i] ?? NaN } as LineData)).filter((d) => !isNaN(d.value as number))
    );

    mainChartRef.current?.timeScale().fitContent();
  }, [candles]);

  // ── Indicator visibility ────────────────────────────────────────────────────
  useEffect(() => { maSeriesRef.current?.applyOptions({ visible: indicators.MA }); }, [indicators.MA]);
  useEffect(() => { emaSeriesRef.current?.applyOptions({ visible: indicators.EMA }); }, [indicators.EMA]);
  useEffect(() => {
    bbUpperRef.current?.applyOptions({ visible: indicators.BB });
    bbMidRef.current?.applyOptions({ visible: indicators.BB });
    bbLowerRef.current?.applyOptions({ visible: indicators.BB });
  }, [indicators.BB]);
  useEffect(() => { volSeriesRef.current?.applyOptions({ visible: indicators.VOL }); }, [indicators.VOL]);

  // ── WebSocket: live kline updates ──────────────────────────────────────────
  useEffect(() => {
    wsRef.current?.close();
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}usdt@kline_${tf.interval}`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const k = msg?.k;
      if (!k) return;
      const bar: Candle = {
        time: (k.t / 1000) as any,
        open: parseFloat(k.o), high: parseFloat(k.h),
        low: parseFloat(k.l), close: parseFloat(k.c),
        volume: parseFloat(k.v),
      };
      candleSeriesRef.current?.update({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
      volSeriesRef.current?.update({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? `${C.green}90` : `${C.red}90` } as HistogramData);
      setLivePrice(bar.close);
      setCandles((prev) => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        if (last.time === bar.time) return [...prev.slice(0, -1), bar];
        return [...prev, bar];
      });
    };
    wsRef.current = ws;
    return () => { ws.close(); };
  }, [symbol, tf.interval]);

  // ── 24h ticker for price change ────────────────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}usdt@ticker`);
    ws.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      setLiveChange(parseFloat(d.P));
      setLivePrice(parseFloat(d.c));
    };
    return () => { ws.close(); };
  }, [symbol]);

  // ── ESC for fullscreen ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Derived indicator values for sidebar ──────────────────────────────────
  const sidebarIndicators = useMemo(() => {
    if (!candles.length) return null;
    const closes = candles.map((c) => c.close);
    const rsi = calcRSI(closes);
    const ma20 = calcSMA(closes, 20);
    const ema50 = calcEMA(closes, 50);
    const last10 = candles.slice(-10);
    return {
      rsi:  rsi[rsi.length - 1] ?? null,
      ma20: ma20[ma20.length - 1] ?? null,
      ema50: ema50[ema50.length - 1] ?? null,
      support:    Math.min(...last10.map((c) => c.low)),
      resistance: Math.max(...last10.map((c) => c.high)),
    };
  }, [candles]);

  // ── AI Signal for current coin ─────────────────────────────────────────────
  const { data: signalsData } = useQuery({
    queryKey: ["signals-chart", symbol],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/signals`);
      const j = await r.json();
      return j.signals ?? [];
    },
    refetchInterval: 60_000,
    staleTime: 50_000,
  });
  const coinSignal = useMemo(
    () => signalsData?.find((s: any) => s.coin === symbol) ?? null,
    [signalsData, symbol]
  );

  // ── Funding rate for sidebar ───────────────────────────────────────────────
  const { data: fundingData } = useQuery({
    queryKey: ["funding-rates"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/market/funding-rates`);
      return r.json();
    },
    refetchInterval: 30_000, staleTime: 25_000,
  });
  const funding = (fundingData as any)?.[symbol]?.avg ?? null;

  // ── Toggle indicator ───────────────────────────────────────────────────────
  const toggleIndicator = (key: keyof typeof indicators) =>
    setIndicators((p) => ({ ...p, [key]: !p[key] }));

  // ── RSI color ─────────────────────────────────────────────────────────────
  const rsiColor = (v: number | null) => {
    if (v === null) return C.muted;
    if (v >= 70) return C.red;
    if (v <= 30) return C.green;
    return C.yellow;
  };

  const priceColor = liveChange === null ? C.text : liveChange >= 0 ? C.green : C.red;

  // ── Render ─────────────────────────────────────────────────────────────────
  const chartContent = (
    <div className={cn("flex flex-col h-full", fullscreen && "bg-[#0B0E11]")} style={{ minHeight: 0 }}>
      {/* Chart Navbar */}
      <div
        className="flex items-center justify-between px-4 shrink-0 gap-3"
        style={{ height: 48, background: C.surface, borderBottom: `1px solid ${C.border}` }}
      >
        {/* Left: Coin selector + price */}
        <div className="flex items-center gap-4">
          {/* Coin selector */}
          <div className="relative">
            <button
              className="flex items-center gap-2 px-2 py-1 rounded transition-colors hover:bg-[#2B3139]"
              onClick={() => setCoinOpen((p) => !p)}
            >
              <span className="text-[14px] font-bold" style={{ color: C.text }}>{symbol}/USDT</span>
              <ChevronDown className="h-3.5 w-3.5" style={{ color: C.muted }} />
            </button>
            {coinOpen && (
              <div
                className="absolute top-full left-0 mt-1 z-50 rounded overflow-y-auto"
                style={{ background: "#13161B", border: `1px solid ${C.border}`, width: 160, maxHeight: 240 }}
              >
                {COIN_LIST.map((c) => (
                  <button
                    key={c}
                    className="w-full text-left px-3 py-1.5 text-[12px] transition-colors hover:bg-[#1E2329]"
                    style={{ color: c === symbol ? C.yellow : C.text }}
                    onClick={() => { setSymbol(c); setCoinOpen(false); }}
                  >
                    {c}/USDT
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Price */}
          {livePrice && (
            <div className="flex items-center gap-2">
              <span className="text-[20px] font-bold font-mono" style={{ color: C.text }}>
                {formatPrice(livePrice)}
              </span>
              {liveChange !== null && (
                <span className="text-[13px] font-semibold" style={{ color: priceColor }}>
                  {liveChange >= 0 ? "+" : ""}{liveChange.toFixed(2)}%
                </span>
              )}
            </div>
          )}

          {/* LIVE pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-semibold"
            style={{ border: `1px solid ${C.green}`, color: C.green }}>
            <span className="h-1.5 w-1.5 rounded-full live-pulse" style={{ background: C.green }} />
            LIVE
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] font-medium transition-colors hover:bg-[#2B3139]"
            style={{ border: `1px solid ${C.border}`, color: C.muted }}
          >
            <Star className="h-3 w-3" /> Favorit
          </button>
          <button
            className="flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] font-medium transition-colors hover:opacity-80"
            style={{ background: `${C.yellow}15`, color: C.yellow, border: `1px solid ${C.yellow}30` }}
            onClick={() => nav(`/ai-analyst?coin=${symbol}`)}
          >
            <Zap className="h-3 w-3" /> Analis AI
          </button>
          <button
            className="flex items-center justify-center transition-colors hover:bg-[#2B3139] rounded p-1"
            style={{ color: C.muted }}
            onClick={() => setFullscreen((p) => !p)}
            title={fullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <StatsBar symbol={symbol} candles={candles} funding={funding} />

      {/* TF + Indicator row */}
      <div
        className="flex items-center justify-between px-4 shrink-0 gap-4"
        style={{ height: 40, background: C.bg, borderBottom: `1px solid ${C.border}` }}
      >
        {/* Timeframes */}
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map((t, i) => (
            <button
              key={t.label}
              className="px-2.5 py-1 rounded text-[12px] font-medium transition-colors"
              style={{
                background: i === tfIdx ? C.border : "transparent",
                color: i === tfIdx ? C.text : C.muted,
              }}
              onClick={() => setTfIdx(i)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-1">
          {(Object.keys(indicators) as (keyof typeof indicators)[]).map((key) => (
            <button
              key={key}
              className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              style={{
                border: `1px solid ${indicators[key] ? C.yellow : C.border}`,
                color: indicators[key] ? C.yellow : C.muted,
                background: indicators[key] ? `${C.yellow}10` : "transparent",
              }}
              onClick={() => toggleIndicator(key)}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Main Chart */}
        <div ref={mainContainerRef} className="flex-1 min-h-0 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: `${C.bg}cc` }}>
              <RefreshCw className="h-5 w-5 animate-spin" style={{ color: C.muted }} />
            </div>
          )}
        </div>

        {/* RSI Panel */}
        <div
          ref={rsiContainerRef}
          className={cn("shrink-0 border-t transition-all", indicators.RSI ? "h-[90px]" : "h-0 overflow-hidden")}
          style={{ borderColor: C.border }}
        >
          {indicators.RSI && sidebarIndicators && (
            <div className="absolute ml-2 mt-1 z-10 pointer-events-none">
              <span className="text-[10px]" style={{ color: C.purple }}>
                RSI (14) · <span style={{ color: rsiColor(sidebarIndicators.rsi) }}>
                  {sidebarIndicators.rsi?.toFixed(1) ?? "—"}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: C.bg }}>
        {chartContent}
        {/* Floating pill */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] pointer-events-none"
          style={{ background: `${C.surface}ee`, border: `1px solid ${C.border}` }}
        >
          <span style={{ color: C.text, fontWeight: 600 }}>{symbol}/USDT</span>
          {livePrice && <span style={{ color: priceColor }}>{formatPrice(livePrice)}</span>}
          <span style={{ color: C.muted }}>· ESC keluar</span>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="flex h-[calc(100vh-56px-30px)]">
        {/* Left: Chart */}
        <div className="flex-1 flex flex-col min-w-0">
          {chartContent}
        </div>

        {/* Right: Sidebar */}
        <div
          className="shrink-0 flex flex-col overflow-y-auto"
          style={{ width: 260, background: C.surface, borderLeft: `1px solid ${C.border}` }}
        >
          <Sidebar
            symbol={symbol}
            signal={coinSignal}
            funding={funding}
            indicators={sidebarIndicators}
            BASE={BASE}
            onReanalyze={() => nav(`/ai-analyst?coin=${symbol}`)}
          />
        </div>
      </div>
    </Layout>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function StatsBar({ symbol, candles, funding }: { symbol: string; candles: Candle[]; funding: number | null }) {
  const last = candles[candles.length - 1];
  const stats = useMemo(() => {
    if (!last) return null;
    const high = Math.max(...candles.slice(-1440).map((c) => c.high));
    const low  = Math.min(...candles.slice(-1440).map((c) => c.low));
    const vol  = candles.slice(-288).reduce((s, c) => s + c.volume, 0);
    return { high, low, vol, open: candles[0]?.open ?? last.open };
  }, [candles, last]);

  const change24h = stats && last ? ((last.close - stats.open) / stats.open * 100) : null;

  const items = [
    { label: "Perubahan 24j", value: change24h !== null ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%` : "—", color: change24h !== null ? (change24h >= 0 ? "#0ECB81" : "#F6465D") : "#848E9C" },
    { label: "Tertinggi 24j", value: stats ? formatPrice(stats.high) : "—" },
    { label: "Terendah 24j",  value: stats ? formatPrice(stats.low)  : "—" },
    { label: "Volume 24j",    value: stats ? `${(stats.vol / 1e6).toFixed(1)}M` : "—" },
    { label: "Funding Rate",  value: funding !== null ? `${funding > 0 ? "+" : ""}${funding.toFixed(4)}%` : "—", color: funding !== null ? (funding > 0 ? "#F6465D" : "#0ECB81") : "#848E9C" },
    { label: "Kap Pasar",     value: "—" },
  ];

  return (
    <div
      className="flex items-center gap-4 px-4 overflow-x-auto shrink-0 scrollbar-hide"
      style={{ height: 36, background: C.surface, borderBottom: `1px solid ${C.border}` }}
    >
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px]" style={{ color: C.muted }}>{item.label}</span>
          <span className="text-[11px] font-semibold font-mono" style={{ color: item.color ?? C.text }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({
  symbol, signal, funding, indicators, BASE, onReanalyze,
}: {
  symbol: string; signal: any; funding: number | null;
  indicators: { rsi: number|null; ma20: number|null; ema50: number|null; support: number; resistance: number } | null;
  BASE: string; onReanalyze: () => void;
}) {
  const rsiColor = (v: number | null) => {
    if (v === null) return C.muted;
    if (v >= 70) return C.red;
    if (v <= 30) return C.green;
    return C.yellow;
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Section 1: Sinyal AI */}
      <div className="p-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="text-[11px] font-semibold uppercase mb-3" style={{ color: C.muted, letterSpacing: "0.08em" }}>
          Sinyal AI
        </div>
        {signal ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span
                className="px-2.5 py-1 rounded text-[12px] font-bold"
                style={{
                  background: signal.direction === "LONG" ? `${C.green}20` : `${C.red}20`,
                  color: signal.direction === "LONG" ? C.green : C.red,
                }}
              >
                {signal.direction}
              </span>
              <span className="text-[11px]" style={{ color: C.muted }}>
                Keyakinan: <span style={{ color: C.text }}>{Math.round((signal.confidence ?? 0) * 100)}%</span>
              </span>
            </div>

            {/* Confidence bar */}
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.border }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.round((signal.confidence ?? 0) * 100)}%`,
                  background: signal.direction === "LONG" ? C.green : C.red,
                }}
              />
            </div>

            <div className="space-y-1.5 text-[11px]">
              {[
                ["Entry", signal.entry_low && signal.entry_high ? `${formatPrice(signal.entry_low)} – ${formatPrice(signal.entry_high)}` : null],
                ["Stop Loss", signal.stop_loss ? formatPrice(signal.stop_loss) : null],
                ["TP1", signal.tp1 ? formatPrice(signal.tp1) : null],
                ["TP2", signal.tp2 ? formatPrice(signal.tp2) : null],
                ["Leverage maks", signal.max_leverage ? `${signal.max_leverage}x` : null],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <span style={{ color: C.muted }}>{k}</span>
                  <span style={{ color: C.text, fontFamily: "monospace" }}>{v}</span>
                </div>
              ))}
            </div>

            <button
              className="w-full flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-semibold transition-opacity hover:opacity-80"
              style={{ background: `${C.yellow}15`, color: C.yellow, border: `1px solid ${C.yellow}30` }}
              onClick={onReanalyze}
            >
              <Zap className="h-3 w-3" /> Analisis Ulang ↗
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-[11px] text-center py-2" style={{ color: C.muted }}>
              Belum ada sinyal aktif untuk {symbol}
            </p>
            <button
              className="w-full flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-semibold transition-opacity hover:opacity-80"
              style={{ background: `${C.yellow}15`, color: C.yellow, border: `1px solid ${C.yellow}30` }}
              onClick={onReanalyze}
            >
              <Zap className="h-3 w-3" /> Analisis Sekarang ↗
            </button>
          </div>
        )}
      </div>

      {/* Section 2: Data Derivatif */}
      <div className="p-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="text-[11px] font-semibold uppercase mb-3" style={{ color: C.muted, letterSpacing: "0.08em" }}>
          Data Derivatif
        </div>
        <div className="space-y-2 text-[11px]">
          {[
            {
              label: "Funding Rate",
              value: funding !== null ? `${funding > 0 ? "+" : ""}${funding.toFixed(4)}%` : "—",
              color: funding !== null ? (funding > 0.02 ? C.red : funding < -0.02 ? C.green : C.muted) : C.muted,
            },
            { label: "Open Interest", value: "—", color: C.muted },
            { label: "Rasio L/S",     value: "—", color: C.muted },
            { label: "Taker Buy %",   value: "—", color: C.muted },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between items-center">
              <span style={{ color: C.muted }}>{label}</span>
              <span style={{ color, fontFamily: "monospace", fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3: Indikator */}
      <div className="p-3">
        <div className="text-[11px] font-semibold uppercase mb-3" style={{ color: C.muted, letterSpacing: "0.08em" }}>
          Indikator
        </div>
        <div className="space-y-2 text-[11px]">
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>RSI (14)</span>
            <span style={{ color: rsiColor(indicators?.rsi ?? null), fontFamily: "monospace", fontWeight: 700 }}>
              {indicators?.rsi?.toFixed(1) ?? "—"}
              {indicators?.rsi !== undefined && indicators.rsi !== null && (
                <span className="ml-1" style={{ color: C.muted, fontWeight: 400, fontFamily: "sans-serif" }}>
                  {indicators.rsi >= 70 ? "Jenuh Beli" : indicators.rsi <= 30 ? "Jenuh Jual" : "Normal"}
                </span>
              )}
            </span>
          </div>
          {[
            { label: "MA 20", value: indicators?.ma20, color: C.yellow },
            { label: "EMA 50", value: indicators?.ema50, color: C.blue },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between">
              <span style={{ color: C.muted }}>{label}</span>
              <span style={{ color, fontFamily: "monospace", fontWeight: 600 }}>
                {value !== null && value !== undefined ? formatPrice(value) : "—"}
              </span>
            </div>
          ))}
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>Support</span>
            <span style={{ color: C.green, fontFamily: "monospace", fontWeight: 600 }}>
              {indicators?.support ? formatPrice(indicators.support) : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>Resistance</span>
            <span style={{ color: C.red, fontFamily: "monospace", fontWeight: 600 }}>
              {indicators?.resistance ? formatPrice(indicators.resistance) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
