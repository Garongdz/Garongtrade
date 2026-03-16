import { useState } from "react";
import Layout from "@/components/Layout";
import { useGetCryptoPrices } from "@workspace/api-client-react";

interface KeyLevels {
  support: number[];
  resistance: number[];
  entry: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
}

interface TechnicalIndicators {
  rsi_estimate: string;
  momentum: string;
  volume_analysis: string;
  trend_strength: string;
}

interface RiskAssessment {
  level: "Low" | "Medium" | "High";
  factors: string[];
}

interface AnalysisResult {
  signal: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  summary: string;
  trend_analysis: string;
  key_levels: KeyLevels;
  technical_indicators: TechnicalIndicators;
  risk_assessment: RiskAssessment;
  reasoning: string[];
  disclaimer: string;
}

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

function SignalBadge({ signal, confidence }: { signal: string; confidence: number }) {
  const config = {
    LONG: { bg: "bg-emerald-500/20", border: "border-emerald-500/40", text: "text-emerald-400", icon: "▲", glow: "shadow-emerald-500/20" },
    SHORT: { bg: "bg-red-500/20", border: "border-red-500/40", text: "text-red-400", icon: "▼", glow: "shadow-red-500/20" },
    NEUTRAL: { bg: "bg-yellow-500/20", border: "border-yellow-500/40", text: "text-yellow-400", icon: "●", glow: "shadow-yellow-500/20" },
  }[signal] ?? { bg: "bg-gray-500/20", border: "border-gray-500/40", text: "text-gray-400", icon: "●", glow: "" };

  return (
    <div className={`flex flex-col items-center gap-3 px-10 py-6 rounded-2xl border ${config.bg} ${config.border} shadow-xl ${config.glow}`}>
      <span className={`text-6xl font-black tracking-wider ${config.text}`}>
        {config.icon} {signal}
      </span>
      <div className="flex items-center gap-2">
        <div className="h-2 w-40 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${signal === "LONG" ? "bg-emerald-400" : signal === "SHORT" ? "bg-red-400" : "bg-yellow-400"}`}
            style={{ width: `${confidence}%` }}
          />
        </div>
        <span className={`text-sm font-bold ${config.text}`}>{confidence}% confidence</span>
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const config = {
    Low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    High: "bg-red-500/15 text-red-400 border-red-500/30",
  }[level] ?? "bg-gray-500/15 text-gray-400 border-gray-500/30";

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${config}`}>
      {level} Risk
    </span>
  );
}

export default function AiAnalyst() {
  const [selectedSymbol, setSelectedSymbol] = useState("bitcoin");
  const [timeframe, setTimeframe] = useState("4h");
  const [additionalContext, setAdditionalContext] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: prices } = useGetCryptoPrices();

  const selectedCoin = prices?.find((p) => p.id === selectedSymbol);

  async function handleAnalyze() {
    if (!selectedCoin) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedCoin.symbol,
          name: selectedCoin.name,
          timeframe,
          currentPrice: selectedCoin.current_price,
          change24h: selectedCoin.price_change_percentage_24h,
          volume24h: selectedCoin.total_volume,
          marketCap: selectedCoin.market_cap,
          high24h: selectedCoin.high_24h,
          low24h: selectedCoin.low_24h,
          additionalContext: additionalContext || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white">
            AI <span className="text-primary">Analyst</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            Analisis futures crypto berbasis Claude AI — sinyal LONG / SHORT / NEUTRAL dengan analisis teknikal lengkap.
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Coin Select */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pilih Coin</label>
              <div className="relative">
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 cursor-pointer"
                >
                  {prices?.map((coin) => (
                    <option key={coin.id} value={coin.id} className="bg-gray-900">
                      {coin.name} ({coin.symbol.toUpperCase()}) — {formatPrice(coin.current_price)}
                    </option>
                  ))}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">▾</span>
              </div>
            </div>

            {/* Timeframe */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Timeframe</label>
              <div className="flex flex-wrap gap-2">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                      timeframe === tf
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Selected coin preview */}
          {selectedCoin && (
            <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
              <img src={selectedCoin.image} alt={selectedCoin.name} className="h-9 w-9 rounded-full" />
              <div>
                <p className="text-white font-bold">{selectedCoin.name}</p>
                <p className="text-xs text-muted-foreground">{selectedCoin.symbol.toUpperCase()}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-white font-bold">{formatPrice(selectedCoin.current_price)}</p>
                <p className={`text-xs font-semibold ${selectedCoin.price_change_percentage_24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {selectedCoin.price_change_percentage_24h >= 0 ? "+" : ""}{selectedCoin.price_change_percentage_24h.toFixed(2)}% 24h
                </p>
              </div>
            </div>
          )}

          {/* Additional Context */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Konteks Tambahan <span className="normal-case font-normal text-xs">(opsional)</span>
            </label>
            <textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Contoh: BTC baru tembus ATH kemarin, ada halving dalam 2 bulan, sentiment pasar bullish..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 resize-none"
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading || !selectedCoin}
            className="w-full py-4 rounded-xl font-black text-base tracking-wide bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <span className="inline-block h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Menganalisis dengan Claude AI...
              </>
            ) : (
              <>✦ Analisis Sekarang</>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-red-400 text-sm font-medium">
            ⚠ {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Signal */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 flex flex-col items-center gap-4">
              <SignalBadge signal={result.signal} confidence={result.confidence} />
              <p className="text-center text-muted-foreground max-w-2xl">{result.summary}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Key Levels */}
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <span className="text-primary">⊙</span> Key Levels
                </h3>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Entry</span>
                    <span className="font-bold text-cyan-400">{formatPrice(result.key_levels.entry)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Stop Loss</span>
                    <span className="font-bold text-red-400">{formatPrice(result.key_levels.stop_loss)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Take Profit 1</span>
                    <span className="font-bold text-emerald-400">{formatPrice(result.key_levels.take_profit_1)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Take Profit 2</span>
                    <span className="font-bold text-emerald-400">{formatPrice(result.key_levels.take_profit_2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Support</span>
                    <span className="text-white font-medium">{result.key_levels.support.map(formatPrice).join(" / ")}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Resistance</span>
                    <span className="text-white font-medium">{result.key_levels.resistance.map(formatPrice).join(" / ")}</span>
                  </div>
                </div>
              </div>

              {/* Technical Indicators */}
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <span className="text-primary">◈</span> Indikator Teknikal
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex flex-col gap-1 py-2 border-b border-white/5">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">RSI</span>
                    <span className="text-white font-medium">{result.technical_indicators.rsi_estimate}</span>
                  </div>
                  <div className="flex flex-col gap-1 py-2 border-b border-white/5">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Momentum</span>
                    <span className="text-white font-medium">{result.technical_indicators.momentum}</span>
                  </div>
                  <div className="flex flex-col gap-1 py-2 border-b border-white/5">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Volume</span>
                    <span className="text-white font-medium">{result.technical_indicators.volume_analysis}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Kekuatan Tren</span>
                    <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xs font-bold">
                      {result.technical_indicators.trend_strength}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Trend Analysis */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-3">
              <h3 className="font-bold text-white flex items-center gap-2">
                <span className="text-primary">◉</span> Analisis Tren
              </h3>
              <p className="text-muted-foreground leading-relaxed text-sm">{result.trend_analysis}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Reasoning */}
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <span className="text-primary">◆</span> Alasan Utama
                </h3>
                <ul className="space-y-2.5">
                  {result.reasoning.map((reason, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">{i + 1}</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Risk Assessment */}
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <span className="text-primary">◇</span> Penilaian Risiko
                  <RiskBadge level={result.risk_assessment.level} />
                </h3>
                <ul className="space-y-2.5">
                  {result.risk_assessment.factors.map((factor, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400/60" />
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="rounded-xl border border-white/5 bg-white/3 px-5 py-3 text-xs text-muted-foreground/60 text-center">
              ⚠ {result.disclaimer}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
