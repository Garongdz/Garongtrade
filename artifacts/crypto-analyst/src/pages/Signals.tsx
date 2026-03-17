import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { cn } from "@/lib/utils";
import Layout from "@/components/Layout";
import {
  Zap, Clock, TrendingUp, TrendingDown, Shield, AlertTriangle,
  ChevronDown, ChevronUp, Settings, History, BarChart3, Activity,
  RefreshCw, CheckCircle2, XCircle, Target,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Signal {
  id: number;
  coin: string;
  symbol: string;
  direction: string;
  risk_level: string;
  confidence: number;
  normalized_score: number;
  technical_score: number;
  derivatives_score: number;
  onchain_score: number;
  macro_score: number;
  current_price: number;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  status: string;
  layer_details: Record<string, any>;
  api_warnings: string[];
  ai_verdict: string | null;
  ai_reason: string | null;
  ai_key_risk: string | null;
  created_at: string;
  expires_at: string;
}

interface Stats {
  winrate: number;
  wins: number;
  losses: number;
  totalClosed: number;
  activeCount: number;
  todayCount: number;
}

interface ScanStatus {
  isScanRunning: boolean;
  lastScanAt: string | null;
  nextScanAt: string | null;
  settings: ScanSettings;
  availableCoins: string[];
}

interface ScanSettings {
  intervalHours: 2 | 4 | 6;
  minConfidence: number;
  activeCoins: string[];
  activeHoursStart: number;
  activeHoursEnd: number;
  aiEnabled: boolean;
}

interface ApiMonitor {
  usage: Record<string, { used: number; limit: number; unit: string }>;
  status: Record<string, string>;
  hasCoinglassKey: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}${path}`, opts).then(r => r.json());
}

function fmt(n: number, digits = 2) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  if (n < 0.01) return n.toFixed(6);
  return n.toFixed(digits);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}

function timeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "segera";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}j ${m % 60}m`;
}

// ── Score Bar Component ───────────────────────────────────────────────────────
function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = Math.abs(score) / max * 100;
  const isPos = score >= 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-card rounded-full overflow-hidden relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-px h-full bg-border" />
        </div>
        <div
          className={cn("h-full rounded-full transition-all", isPos ? "bg-positive ml-[50%]" : "bg-negative mr-[50%] ml-0")}
          style={{ width: `${pct / 2}%`, marginLeft: isPos ? "50%" : undefined, marginRight: isPos ? undefined : "50%" }}
        />
      </div>
      <span className={cn("w-8 text-right font-mono-price font-semibold", isPos ? "text-positive" : score < 0 ? "text-negative" : "text-muted-foreground")}>
        {score > 0 ? "+" : ""}{score.toFixed(1)}
      </span>
    </div>
  );
}

// ── Signal Card ───────────────────────────────────────────────────────────────
function SignalCard({ signal, t }: { signal: Signal; t: (k: string) => string }) {
  const [expanded, setExpanded] = useState(signal.risk_level !== "RISKY");
  const isLong = signal.direction === "LONG";
  const riskColor = signal.risk_level === "SAFE" ? "text-positive border-positive/30 bg-positive/5"
    : signal.risk_level === "MODERAT" ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/5"
    : "text-orange-400 border-orange-400/30 bg-orange-400/5";
  const dirBg = isLong ? "bg-positive/10 text-positive border-positive/20" : "bg-negative/10 text-negative border-negative/20";
  const expires = new Date(signal.expires_at).getTime() - Date.now();
  const expiresH = Math.floor(expires / 3600000);
  const expiresM = Math.floor((expires % 3600000) / 60000);
  const expiresStr = expires > 0 ? `${expiresH}j ${expiresM}m` : "Expired";

  return (
    <div className={cn("border rounded-sm overflow-hidden transition-all", riskColor)}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <span className={cn("px-2 py-0.5 text-xs font-bold rounded-sm border", dirBg)}>
            {isLong ? <><TrendingUp className="inline h-3 w-3 mr-1" />{t("long")}</> : <><TrendingDown className="inline h-3 w-3 mr-1" />{t("short")}</>}
          </span>
          <span className="font-bold text-foreground text-base font-mono-price">{signal.coin}</span>
          <span className="text-xs text-muted-foreground font-mono-price">@ {fmt(signal.current_price)}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className={cn("text-xs font-bold uppercase", riskColor.split(" ")[0])}>
              {signal.risk_level === "SAFE" ? t("safe") : signal.risk_level === "MODERAT" ? t("moderat") : t("risky")}
            </div>
            <div className="text-[10px] text-muted-foreground">{timeAgo(signal.created_at)}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold font-mono-price text-foreground">{signal.normalized_score.toFixed(1)}<span className="text-muted-foreground text-xs">/10</span></div>
            <div className="text-[10px] text-muted-foreground">{signal.confidence.toFixed(0)}% conf.</div>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-3">
          {/* Scores */}
          <div className="space-y-1.5">
            <ScoreBar label={t("technical")} score={signal.technical_score} max={2} />
            <ScoreBar label={t("derivatives")} score={signal.derivatives_score} max={5} />
            <ScoreBar label={t("onchain")} score={signal.onchain_score} max={4} />
            <ScoreBar label={t("macro")} score={signal.macro_score} max={4} />
          </div>

          {/* Entry/SL/TP grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="col-span-2 sm:col-span-1 bg-card/60 rounded-sm px-3 py-2 border border-border">
              <div className="text-muted-foreground mb-0.5">{t("entryZone")}</div>
              <div className="font-mono-price font-semibold text-foreground">{fmt(signal.entry_low)}</div>
              <div className="font-mono-price text-muted-foreground">– {fmt(signal.entry_high)}</div>
            </div>
            <div className="bg-negative/10 rounded-sm px-3 py-2 border border-negative/20">
              <div className="text-negative/70 mb-0.5">{t("sl")}</div>
              <div className="font-mono-price font-semibold text-negative">{fmt(signal.stop_loss)}</div>
            </div>
            <div className="bg-positive/5 rounded-sm px-3 py-2 border border-positive/20">
              <div className="text-positive/70 mb-0.5">{t("tp1")}</div>
              <div className="font-mono-price font-semibold text-positive">{fmt(signal.tp1)}</div>
            </div>
            <div className="bg-positive/5 rounded-sm px-3 py-2 border border-positive/20">
              <div className="text-positive/70 mb-0.5">{t("tp2")}</div>
              <div className="font-mono-price font-semibold text-positive">{fmt(signal.tp2)}</div>
            </div>
            <div className="bg-positive/5 rounded-sm px-3 py-2 border border-positive/20">
              <div className="text-positive/70 mb-0.5">{t("tp3")}</div>
              <div className="font-mono-price font-semibold text-positive">{fmt(signal.tp3)}</div>
            </div>
          </div>

          {/* AI verdict */}
          {signal.ai_verdict && (
            <div className={cn("rounded-sm px-3 py-2 border text-xs", signal.ai_verdict === "VALID" ? "border-positive/30 bg-positive/5" : signal.ai_verdict === "INVALID" ? "border-negative/30 bg-negative/5" : "border-yellow-400/30 bg-yellow-400/5")}>
              <div className="flex items-center gap-1.5 mb-1">
                {signal.ai_verdict === "VALID" ? <CheckCircle2 className="h-3.5 w-3.5 text-positive" /> : signal.ai_verdict === "INVALID" ? <XCircle className="h-3.5 w-3.5 text-negative" /> : <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />}
                <span className="font-semibold text-foreground">{t("aiVerdict")}: {signal.ai_verdict}</span>
              </div>
              {signal.ai_reason && <p className="text-muted-foreground mb-1">{signal.ai_reason}</p>}
              {signal.ai_key_risk && <p className="text-orange-400/80"><span className="font-semibold">Risiko: </span>{signal.ai_key_risk}</p>}
            </div>
          )}

          {/* Warnings */}
          {signal.api_warnings && signal.api_warnings.length > 0 && (
            <div className="space-y-1">
              {signal.api_warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-yellow-400/80">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
            <span>Dibuat: {new Date(signal.created_at).toLocaleTimeString("id-ID")}</span>
            <span className={cn("font-semibold", expires > 0 ? "text-foreground" : "text-negative")}>Exp: {expiresStr}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settings Panel ─────────────────────────────────────────────────────────────
function SettingsPanel({ status, t, onSave }: { status: ScanStatus | null; t: (k: string) => string; onSave: (s: Partial<ScanSettings>) => void }) {
  const [local, setLocal] = useState<Partial<ScanSettings>>({});
  const current = status?.settings;

  if (!current) return <div className="text-muted-foreground text-sm p-4">Loading...</div>;

  const merged = { ...current, ...local };

  return (
    <div className="space-y-4 p-4">
      {/* Interval */}
      <div>
        <label className="text-xs text-muted-foreground block mb-2">{t("scanInterval")}</label>
        <div className="flex gap-2">
          {([2, 4, 6] as const).map(h => (
            <button key={h} onClick={() => setLocal(p => ({ ...p, intervalHours: h }))}
              className={cn("px-3 py-1.5 text-xs font-semibold rounded-sm border transition-colors", merged.intervalHours === h ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-foreground")}>
              {h}{t("hours")}
            </button>
          ))}
        </div>
      </div>

      {/* Min Confidence */}
      <div>
        <label className="text-xs text-muted-foreground block mb-2">{t("minConfidence")}: <span className="text-foreground font-semibold">{merged.minConfidence}%</span></label>
        <input type="range" min="30" max="90" step="5" value={merged.minConfidence} onChange={e => setLocal(p => ({ ...p, minConfidence: +e.target.value }))}
          className="w-full accent-primary" />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>30% (sensitif)</span><span>90% (konservatif)</span>
        </div>
      </div>

      {/* Active hours */}
      <div>
        <label className="text-xs text-muted-foreground block mb-2">{t("activeHours")}: <span className="text-foreground font-semibold">{merged.activeHoursStart}:00 – {merged.activeHoursEnd}:00</span></label>
        <div className="flex items-center gap-3">
          <input type="number" min="0" max="23" value={merged.activeHoursStart} onChange={e => setLocal(p => ({ ...p, activeHoursStart: +e.target.value }))}
            className="w-16 bg-input border border-border rounded-sm px-2 py-1 text-xs text-center font-mono-price text-foreground" />
          <span className="text-muted-foreground">–</span>
          <input type="number" min="0" max="24" value={merged.activeHoursEnd} onChange={e => setLocal(p => ({ ...p, activeHoursEnd: +e.target.value }))}
            className="w-16 bg-input border border-border rounded-sm px-2 py-1 text-xs text-center font-mono-price text-foreground" />
        </div>
      </div>

      {/* AI toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-foreground">{t("enableAI")}</div>
          <div className="text-[10px] text-muted-foreground">Claude AI (maks 2x/hari, skor ≥ 8.0)</div>
        </div>
        <button onClick={() => setLocal(p => ({ ...p, aiEnabled: !merged.aiEnabled }))}
          className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors", merged.aiEnabled ? "bg-primary" : "bg-muted")}>
          <span className={cn("pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out", merged.aiEnabled ? "translate-x-4" : "translate-x-0")} />
        </button>
      </div>

      <button onClick={() => { onSave(local); setLocal({}); }}
        className="w-full py-2 text-xs font-bold bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors">
        {t("saveSettings")}
      </button>
    </div>
  );
}

// ── History Table ──────────────────────────────────────────────────────────────
function HistoryTable({ signals, t }: { signals: Signal[]; t: (k: string) => string }) {
  if (!signals.length) return <div className="text-center text-muted-foreground text-sm py-8">{t("noHistory")}</div>;

  const statusLabel: Record<string, string> = {
    EXPIRED: t("expired"), TP1_HIT: t("tp1Hit"), TP2_HIT: t("tp2Hit"), TP3_HIT: t("tp3Hit"), SL_HIT: t("slHit"),
  };
  const statusColor: Record<string, string> = {
    TP1_HIT: "text-positive", TP2_HIT: "text-positive", TP3_HIT: "text-positive",
    SL_HIT: "text-negative", EXPIRED: "text-muted-foreground",
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left py-2 px-3 font-medium">Coin</th>
            <th className="text-left py-2 px-3 font-medium">Dir</th>
            <th className="text-right py-2 px-3 font-medium">Skor</th>
            <th className="text-right py-2 px-3 font-medium">Entry</th>
            <th className="text-right py-2 px-3 font-medium">Close</th>
            <th className="text-left py-2 px-3 font-medium">{t("status")}</th>
            <th className="text-right py-2 px-3 font-medium hidden sm:table-cell">{t("closedAt")}</th>
          </tr>
        </thead>
        <tbody>
          {signals.map(s => (
            <tr key={s.id} className="border-b border-border/40 hover:bg-card/50 transition-colors">
              <td className="py-2 px-3 font-mono-price font-semibold text-foreground">{s.coin}</td>
              <td className="py-2 px-3">
                <span className={cn("font-bold text-[10px]", s.direction === "LONG" ? "text-positive" : "text-negative")}>{s.direction}</span>
              </td>
              <td className="py-2 px-3 text-right font-mono-price text-muted-foreground">{s.normalized_score.toFixed(1)}</td>
              <td className="py-2 px-3 text-right font-mono-price text-muted-foreground">{fmt(s.current_price)}</td>
              <td className="py-2 px-3 text-right font-mono-price text-muted-foreground">{s.close_price ? fmt(s.close_price) : "—"}</td>
              <td className="py-2 px-3"><span className={cn("font-semibold", statusColor[s.status] || "text-muted-foreground")}>{statusLabel[s.status] || s.status}</span></td>
              <td className="py-2 px-3 text-right text-muted-foreground hidden sm:table-cell">{s.closed_at ? timeAgo(s.closed_at) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── API Monitor ────────────────────────────────────────────────────────────────
function ApiMonitorPanel({ monitor, t }: { monitor: ApiMonitor | null; t: (k: string) => string }) {
  const [debugCoin, setDebugCoin] = useState("BTC");
  const { data: debugData, isLoading: debugLoading, refetch: refetchDebug } = useQuery({
    queryKey: ["signals-debug", debugCoin],
    queryFn: () => apiFetch(`/api/signals/debug/${debugCoin}`),
    enabled: false,
    retry: 0,
  });

  if (!monitor) return null;
  const statusColor: Record<string, string> = { online: "text-positive", down: "text-negative", unknown: "text-muted-foreground" };
  const statusDot: Record<string, string> = { online: "bg-positive", down: "bg-negative", unknown: "bg-muted-foreground" };
  const dd = debugData as any;

  return (
    <div className="p-4 space-y-5">
      {/* API statuses */}
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2">Status API Eksternal</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(monitor.status).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot[val as string] || "bg-muted-foreground")} />
              <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span className={cn("ml-auto font-semibold truncate", statusColor[val as string] || "text-muted-foreground")}>{String(val).replace(" (CC)", "★")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Usage */}
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2">Penggunaan API</h4>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(monitor.usage).map(([key, u]) => {
            const pct = u.limit > 0 ? (u.used / u.limit) * 100 : 0;
            return (
              <div key={key} className="bg-card/60 rounded-sm px-3 py-2 border border-border">
                <div className="text-[10px] text-muted-foreground mb-1 capitalize">{key}</div>
                <div className="text-sm font-mono-price font-bold text-foreground">{u.used}<span className="text-muted-foreground text-xs">/{u.limit}</span></div>
                <div className="h-1 bg-muted rounded-full mt-1.5 overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", pct > 80 ? "bg-negative" : pct > 60 ? "bg-yellow-400" : "bg-positive")} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">per {u.unit}</div>
              </div>
            );
          })}
        </div>
      </div>

      {!monitor.hasCoinglassKey && (
        <div className="text-xs text-yellow-400/80 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>COINGLASS_API_KEY belum diset. Derivatives data (lapisan dengan bobot terbesar) tidak tersedia.</span>
        </div>
      )}

      {/* Live Score Debug */}
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2">Skor Pasar Saat Ini (Debug)</h4>
        <p className="text-[10px] text-muted-foreground mb-3">Lihat skor tiap lapisan untuk koin tertentu tanpa menyimpan sinyal</p>
        <div className="flex gap-2 flex-wrap mb-3">
          {["BTC","ETH","SOL","BNB","XRP","AVAX","ARB","OP","LINK","DOGE"].map(c => (
            <button key={c} onClick={() => setDebugCoin(c)}
              className={cn("px-2 py-1 text-[10px] font-mono-price font-bold rounded-sm border transition-colors", debugCoin === c ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-foreground")}>
              {c}
            </button>
          ))}
          <button onClick={() => refetchDebug()}
            disabled={debugLoading}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold bg-card border border-border rounded-sm hover:border-foreground transition-colors text-foreground">
            <RefreshCw className={cn("h-3 w-3", debugLoading && "animate-spin")} />
            Hitung
          </button>
        </div>
        {dd && !dd.error && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Harga:</span>
              <span className="font-mono-price font-bold text-foreground">${fmt(dd.price)}</span>
            </div>
            <div className="space-y-1.5">
              {[
                { key: "technical", label: "Teknikal", score: dd.layers.technical.score, max: dd.layers.technical.maxPossible },
                { key: "derivatives", label: "Derivatif", score: dd.layers.derivatives.score, max: dd.layers.derivatives.maxPossible },
                { key: "onchain", label: "On-Chain", score: dd.layers.onchain.score, max: dd.layers.onchain.maxPossible },
                { key: "macro", label: "Makro", score: dd.layers.macro.score, max: dd.layers.macro.maxPossible },
              ].map(l => (
                <div key={l.key} className="flex items-center gap-2">
                  <span className="w-20 text-muted-foreground shrink-0">{l.label}</span>
                  <div className="flex-1 h-1.5 bg-card rounded-full overflow-hidden relative border border-border/30">
                    <div className="absolute inset-0 flex items-center justify-center"><div className="w-px h-full bg-border/50" /></div>
                    {l.max > 0 && (
                      <div className={cn("h-full rounded-full", l.score >= 0 ? "bg-positive ml-[50%]" : "bg-negative")}
                        style={{ width: `${Math.abs(l.score) / l.max * 50}%`, marginLeft: l.score >= 0 ? "50%" : undefined, marginRight: l.score >= 0 ? undefined : "50%" }} />
                    )}
                  </div>
                  <span className={cn("w-12 text-right font-mono-price font-semibold", l.score > 0 ? "text-positive" : l.score < 0 ? "text-negative" : "text-muted-foreground")}>
                    {l.score > 0 ? "+" : ""}{l.score.toFixed(1)} / {l.max > 0 ? l.max : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <span className="text-muted-foreground">Skor Final:</span>
              <span className={cn("font-mono-price font-bold text-base", dd.normalizedScore >= 5 ? "text-positive" : dd.normalizedScore <= -5 ? "text-negative" : "text-foreground")}>
                {dd.normalizedScore > 0 ? "+" : ""}{dd.normalizedScore.toFixed(1)} / 10
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Akan trigger?</span>
              <span className={cn("font-semibold text-xs", dd.wouldTrigger ? "text-positive" : "text-muted-foreground")}>
                {dd.wouldTrigger ? `✓ YA — ${dd.direction}` : `✗ Belum (min ±5.0)`}
              </span>
            </div>
            {/* Layer details (RSI etc) */}
            {dd.layers.technical.details.rsi && (
              <div className="grid grid-cols-3 gap-2 text-[10px] pt-1">
                <div className="bg-card/60 rounded-sm px-2 py-1.5 border border-border/40">
                  <div className="text-muted-foreground">RSI(14)</div>
                  <div className={cn("font-mono-price font-bold", dd.layers.technical.details.rsi > 70 ? "text-negative" : dd.layers.technical.details.rsi < 30 ? "text-positive" : "text-foreground")}>{dd.layers.technical.details.rsi}</div>
                </div>
                <div className="bg-card/60 rounded-sm px-2 py-1.5 border border-border/40">
                  <div className="text-muted-foreground">Fear & Greed</div>
                  <div className={cn("font-mono-price font-bold", dd.layers.macro.details.fearGreed < 30 ? "text-positive" : dd.layers.macro.details.fearGreed > 70 ? "text-negative" : "text-foreground")}>{dd.layers.macro.details.fearGreed}</div>
                </div>
                <div className="bg-card/60 rounded-sm px-2 py-1.5 border border-border/40">
                  <div className="text-muted-foreground">BTC Dom</div>
                  <div className="font-mono-price font-bold text-foreground">{dd.layers.macro.details.btcDom}%</div>
                </div>
              </div>
            )}
            {/* Warnings */}
            {(dd.layers.derivatives.warnings?.length > 0 || dd.layers.onchain.warnings?.length > 0) && (
              <div className="space-y-1">
                {[...dd.layers.derivatives.warnings, ...dd.layers.onchain.warnings, ...dd.layers.macro.warnings].map((w: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px] text-yellow-400/70">
                    <AlertTriangle className="h-2.5 w-2.5 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {dd?.error && <div className="text-xs text-negative">{dd.error}</div>}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Signals() {
  const { t } = useAppSettings();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"active" | "history" | "settings" | "monitor">("active");

  const { data: activeData, isLoading: loadingActive } = useQuery({
    queryKey: ["signals-active"],
    queryFn: () => apiFetch("/api/signals"),
    refetchInterval: 30_000,
  });

  const { data: historyData } = useQuery({
    queryKey: ["signals-history"],
    queryFn: () => apiFetch("/api/signals/history"),
    refetchInterval: 60_000,
  });

  const { data: statusData, isLoading: loadingStatus } = useQuery({
    queryKey: ["signals-status"],
    queryFn: () => apiFetch("/api/signals/status"),
    refetchInterval: 10_000,
  });

  const { data: monitorData } = useQuery({
    queryKey: ["signals-monitor"],
    queryFn: () => apiFetch("/api/signals/api-monitor"),
    refetchInterval: 30_000,
    enabled: activeTab === "monitor",
  });

  // Countdown to next scan
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    const tick = () => {
      if (statusData?.nextScanAt) setCountdown(timeUntil(statusData.nextScanAt));
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [statusData?.nextScanAt]);

  const scanMutation = useMutation({
    mutationFn: () => apiFetch("/api/signals/scan", { method: "POST" }),
    onSuccess: () => { setTimeout(() => { qc.invalidateQueries({ queryKey: ["signals-active"] }); qc.invalidateQueries({ queryKey: ["signals-status"] }); }, 3000); },
  });

  const settingsMutation = useMutation({
    mutationFn: (s: Partial<ScanSettings>) => apiFetch("/api/signals/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signals-status"] }),
  });

  const signals: Signal[] = activeData?.signals ?? [];
  const history: Signal[] = historyData?.history ?? [];
  const stats: Stats = historyData?.stats ?? { winrate: 0, wins: 0, losses: 0, totalClosed: 0, activeCount: 0, todayCount: 0 };
  const status: ScanStatus | null = statusData ?? null;
  const isScanRunning = status?.isScanRunning ?? false;

  // Sort: SAFE first, MODERAT second, RISKY last
  const sortedSignals = [...signals].sort((a, b) => {
    const order = { SAFE: 0, MODERAT: 1, RISKY: 2 };
    return (order[a.risk_level as keyof typeof order] ?? 9) - (order[b.risk_level as keyof typeof order] ?? 9);
  });

  const tabs = [
    { id: "active", label: t("activeSignals"), icon: Zap },
    { id: "history", label: t("history"), icon: History },
    { id: "settings", label: t("settings"), icon: Settings },
    { id: "monitor", label: t("apiMonitor"), icon: Activity },
  ] as const;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              {t("signalsTitle")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t("signalSubtitle")}</p>
          </div>
          <button
            onClick={() => scanMutation.mutate()}
            disabled={isScanRunning || scanMutation.isPending}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-sm transition-all",
              isScanRunning || scanMutation.isPending
                ? "bg-primary/20 text-primary border border-primary/30 cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", (isScanRunning || scanMutation.isPending) && "animate-spin")} />
            {isScanRunning || scanMutation.isPending ? t("scanning") : t("scanNow")}
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-sm px-4 py-3">
            <div className="text-xs text-muted-foreground">{t("winrate")}</div>
            <div className="text-xl font-bold font-mono-price text-foreground mt-0.5">
              {stats.winrate.toFixed(1)}<span className="text-sm text-muted-foreground">%</span>
            </div>
            <div className="text-[10px] text-muted-foreground">{stats.wins}W / {stats.losses}L</div>
          </div>
          <div className="bg-card border border-border rounded-sm px-4 py-3">
            <div className="text-xs text-muted-foreground">{t("activeSignals")}</div>
            <div className="text-xl font-bold font-mono-price text-foreground mt-0.5">{stats.activeCount}</div>
            <div className="text-[10px] text-muted-foreground">{t("todaySignals")}: {stats.todayCount}</div>
          </div>
          <div className="bg-card border border-border rounded-sm px-4 py-3">
            <div className="text-xs text-muted-foreground">{t("nextScan")}</div>
            <div className="text-xl font-bold font-mono-price text-foreground mt-0.5">{countdown || "—"}</div>
            <div className="text-[10px] text-muted-foreground">{status?.settings?.intervalHours}h interval</div>
          </div>
          <div className="bg-card border border-border rounded-sm px-4 py-3">
            <div className="text-xs text-muted-foreground">Total Closed</div>
            <div className="text-xl font-bold font-mono-price text-foreground mt-0.5">{stats.totalClosed}</div>
            <div className="text-[10px] text-muted-foreground">{status?.lastScanAt ? `Terakhir: ${timeAgo(status.lastScanAt)}` : "Belum scan"}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex gap-0">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors relative",
                  activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:block">{tab.label}</span>
                {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
              </button>
            ))}
          </div>
        </div>

        {/* Active Signals */}
        {activeTab === "active" && (
          <div>
            {loadingActive ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin" />
                Loading...
              </div>
            ) : sortedSignals.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <Target className="h-10 w-10 mx-auto text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">{t("noActiveSignals")}</p>
                {status?.lastScanAt && (
                  <p className="text-xs text-muted-foreground">Scan terakhir: {timeAgo(status.lastScanAt)}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {sortedSignals.map(s => <SignalCard key={s.id} signal={s} t={t} />)}
              </div>
            )}
          </div>
        )}

        {/* History */}
        {activeTab === "history" && (
          <div className="bg-card border border-border rounded-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">{t("history")}</h3>
              <p className="text-xs text-muted-foreground">Sinyal tertutup: TP hit, SL hit, atau expired</p>
            </div>
            <HistoryTable signals={history} t={t} />
          </div>
        )}

        {/* Settings */}
        {activeTab === "settings" && (
          <div className="bg-card border border-border rounded-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">{t("settings")}</h3>
              <p className="text-xs text-muted-foreground">Konfigurasi scanner otomatis</p>
            </div>
            <SettingsPanel status={status} t={t} onSave={(s) => settingsMutation.mutate(s)} />
          </div>
        )}

        {/* API Monitor */}
        {activeTab === "monitor" && (
          <div className="bg-card border border-border rounded-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">{t("apiMonitor")}</h3>
              <p className="text-xs text-muted-foreground">Status dan penggunaan API eksternal</p>
            </div>
            <ApiMonitorPanel monitor={monitorData ?? null} t={t} />
          </div>
        )}
      </div>
    </Layout>
  );
}
