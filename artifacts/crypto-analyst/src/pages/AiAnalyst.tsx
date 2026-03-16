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

const TIMEFRAMES = ["15m", "1h", "4h", "1D", "1W"];

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function SignalBadge({ signal }: { signal: string }) {
  const config = {
    LONG: { bg: "bg-[#0ECB81]/10", border: "border-[#0ECB81]", text: "text-[#0ECB81]" },
    SHORT: { bg: "bg-[#F6465D]/10", border: "border-[#F6465D]", text: "text-[#F6465D]" },
    NEUTRAL: { bg: "bg-[#F0B90B]/10", border: "border-[#F0B90B]", text: "text-[#F0B90B]" },
  }[signal] ?? { bg: "bg-muted", border: "border-muted-foreground", text: "text-muted-foreground" };

  return (
    <div className={`inline-flex px-4 py-1.5 border rounded-sm font-bold text-lg tracking-wide ${config.bg} ${config.border} ${config.text}`}>
      {signal}
    </div>
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
      <div className="flex flex-col xl:flex-row h-[calc(100vh-3.5rem)] overflow-hidden bg-background w-full text-sm font-sans">
        
        {/* Left Form Column */}
        <div className="w-full xl:w-[320px] shrink-0 border-r border-border bg-card overflow-y-auto flex flex-col">
          <div className="p-4 border-b border-border">
            <h1 className="text-base font-bold text-foreground">AI ANALYST</h1>
            <p className="text-xs text-muted-foreground mt-1">Configure parameters for Claude AI analysis.</p>
          </div>

          <div className="p-4 space-y-5 flex-1">
            {/* Symbol */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground uppercase">Symbol</label>
              <div className="relative">
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="w-full appearance-none bg-background border border-border rounded-sm px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary cursor-pointer font-bold uppercase"
                >
                  {prices?.map((coin) => (
                    <option key={coin.id} value={coin.id} className="bg-card">
                      {coin.symbol} / USDT
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Timeframe */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground uppercase">Timeframe</label>
              <div className="flex gap-1 bg-background p-1 border border-border rounded-sm">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`flex-1 py-1 text-xs font-medium rounded-sm transition-colors ${
                      timeframe === tf
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Additional Context */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground uppercase">Context (Optional)</label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Market news, sentiment..."
                rows={4}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary resize-none"
              />
            </div>
          </div>

          <div className="p-4 border-t border-border mt-auto">
            <button
              onClick={handleAnalyze}
              disabled={loading || !selectedCoin}
              className="w-full py-2.5 rounded-sm font-bold text-sm bg-primary hover:brightness-110 text-primary-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "ANALYZING..." : "ANALYZE NOW"}
            </button>
          </div>
        </div>

        {/* Right Result Column */}
        <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-6">
          {error && (
            <div className="p-4 border border-destructive bg-destructive/10 text-destructive text-sm rounded-sm mb-4">
              Error: {error}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <span className="text-4xl mb-4 opacity-20">📊</span>
              <p>Configure parameters and click Analyze Now to generate AI trade signal.</p>
            </div>
          )}

          {loading && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
              <p className="font-mono-price text-xs">ANALYZING MARKET DATA...</p>
            </div>
          )}

          {result && !loading && (
            <div className="max-w-4xl mx-auto space-y-6">
              
              {/* Top Status */}
              <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between border-b border-border pb-6">
                <div>
                  <h2 className="text-2xl font-bold uppercase mb-1">{selectedCoin?.symbol}/USDT</h2>
                  <p className="text-muted-foreground text-sm font-mono-price">
                    Confidence: <span className="text-foreground">{result.confidence}%</span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <SignalBadge signal={result.signal} />
                </div>
              </div>

              {/* Summary */}
              <div>
                <p className="text-foreground/90 leading-relaxed text-sm">{result.summary}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Order Book / Key Levels */}
                <div className="bg-card border border-border rounded-sm">
                  <div className="px-4 py-2 border-b border-border bg-muted/30">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase">Key Levels</h3>
                  </div>
                  <div className="p-0 font-mono-price text-sm">
                    {/* Take Profits - Red/Green based on short/long */}
                    <div className="flex justify-between px-4 py-2 hover:bg-muted border-b border-border/50">
                      <span className="text-muted-foreground">Take Profit 2</span>
                      <span className={result.signal === "SHORT" ? "text-destructive" : "text-positive"}>
                        {formatPrice(result.key_levels.take_profit_2)}
                      </span>
                    </div>
                    <div className="flex justify-between px-4 py-2 hover:bg-muted border-b border-border/50">
                      <span className="text-muted-foreground">Take Profit 1</span>
                      <span className={result.signal === "SHORT" ? "text-destructive" : "text-positive"}>
                        {formatPrice(result.key_levels.take_profit_1)}
                      </span>
                    </div>
                    
                    {/* Entry - Yellow */}
                    <div className="flex justify-between px-4 py-2 hover:bg-muted bg-primary/5 border-b border-border/50">
                      <span className="text-primary font-bold">Entry Price</span>
                      <span className="text-primary font-bold">{formatPrice(result.key_levels.entry)}</span>
                    </div>

                    {/* Stop Loss - Red/Green based on short/long */}
                    <div className="flex justify-between px-4 py-2 hover:bg-muted border-b border-border/50">
                      <span className="text-muted-foreground">Stop Loss</span>
                      <span className={result.signal === "SHORT" ? "text-positive" : "text-destructive"}>
                        {formatPrice(result.key_levels.stop_loss)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Technical Indicators */}
                <div className="bg-card border border-border rounded-sm">
                  <div className="px-4 py-2 border-b border-border bg-muted/30">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase">Indicators</h3>
                  </div>
                  <div className="p-4 space-y-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RSI</span>
                      <span className="text-foreground">{result.technical_indicators.rsi_estimate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Momentum</span>
                      <span className="text-foreground">{result.technical_indicators.momentum}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Volume</span>
                      <span className="text-foreground">{result.technical_indicators.volume_analysis}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Trend Strength</span>
                      <span className="text-foreground">{result.technical_indicators.trend_strength}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analysis & Reasoning */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Trend Analysis</h3>
                  <p className="text-foreground/80 text-sm leading-relaxed">{result.trend_analysis}</p>
                </div>
                
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Key Reasons</h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/80">
                    {result.reasoning.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Risk Assessment ({result.risk_assessment.level})</h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/80">
                    {result.risk_assessment.factors.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground italic">{result.disclaimer}</p>
              </div>

            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
