import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";
export type Language = "en" | "id";

interface AppSettingsContextValue {
  theme: Theme;
  language: Language;
  toggleTheme: () => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    news: "News",
    markets: "Markets",
    watchlist: "Watchlist",
    aiAnalyst: "AI Analyst",
    signals: "Signals",
    symbol: "Symbol",
    timeframe: "Timeframe",
    context: "Context (Optional)",
    contextPlaceholder: "Market news, sentiment, news...",
    analyzeNow: "ANALYZE NOW",
    analyzing: "ANALYZING...",
    configureParams: "Configure parameters for Claude AI analysis.",
    configurePrompt: "Configure parameters and click Analyze Now to generate AI trade signal.",
    analyzingData: "ANALYZING MARKET DATA...",
    keyLevels: "Key Levels",
    indicators: "Indicators",
    trendAnalysis: "Trend Analysis",
    keyReasons: "Key Reasons",
    riskAssessment: "Risk Assessment",
    confidence: "Confidence",
    takeProfit2: "Take Profit 2",
    takeProfit1: "Take Profit 1",
    entryPrice: "Entry Price",
    stopLoss: "Stop Loss",
    rsi: "RSI",
    momentum: "Momentum",
    volume: "Volume",
    trendStrength: "Trend Strength",
    aiAnalystTitle: "AI ANALYST",
    trackFavorites: "Track your favorite pairs",
    watchlistTitle: "Watchlist",
    searchPlaceholder: "Search coin or symbol...",
    errorPrefix: "Error:",
    // Signals page
    signalsTitle: "LIVE TRADING SIGNALS",
    signalSubtitle: "4-Layer Scoring System: Technical · Derivatives · On-Chain · Macro",
    scanNow: "SCAN NOW",
    scanning: "SCANNING...",
    winrate: "Win Rate",
    activeSignals: "Active",
    todaySignals: "Today",
    nextScan: "Next Scan",
    settings: "Settings",
    history: "History",
    noActiveSignals: "No active signals. The scanner will run automatically.",
    long: "LONG",
    short: "SHORT",
    safe: "SAFE",
    moderat: "MODERATE",
    risky: "RISKY",
    entryZone: "Entry Zone",
    tp1: "TP1",
    tp2: "TP2",
    tp3: "TP3",
    sl: "SL",
    technical: "Technical",
    derivatives: "Derivatives",
    onchain: "On-Chain",
    macro: "Macro",
    score: "Score",
    aiVerdict: "AI Verdict",
    scanInterval: "Scan Interval",
    minConfidence: "Min Confidence",
    activeHours: "Active Hours (WIB)",
    enableAI: "Enable AI Analysis",
    saveSettings: "SAVE SETTINGS",
    status: "Status",
    closedAt: "Closed At",
    result: "Result",
    noHistory: "No signal history yet.",
    expired: "EXPIRED",
    tp1Hit: "TP1 HIT",
    tp2Hit: "TP2 HIT",
    tp3Hit: "TP3 HIT",
    slHit: "SL HIT",
    apiMonitor: "API Monitor",
    hours: "hours",
    apiWarnings: "Warnings",
    scoreLabel: "Score",
    confLabel: "Conf",
  },
  id: {
    news: "Berita",
    markets: "Pasar",
    watchlist: "Watchlist",
    aiAnalyst: "Analis AI",
    signals: "Sinyal",
    symbol: "Simbol",
    timeframe: "Timeframe",
    context: "Konteks (Opsional)",
    contextPlaceholder: "Berita pasar, sentimen, katalis...",
    analyzeNow: "ANALISA SEKARANG",
    analyzing: "MENGANALISA...",
    configureParams: "Konfigurasi parameter untuk analisis Claude AI.",
    configurePrompt: "Konfigurasi parameter dan klik Analisa Sekarang untuk sinyal trading AI.",
    analyzingData: "MENGANALISA DATA PASAR...",
    keyLevels: "Level Kunci",
    indicators: "Indikator",
    trendAnalysis: "Analisis Tren",
    keyReasons: "Alasan Utama",
    riskAssessment: "Penilaian Risiko",
    confidence: "Keyakinan",
    takeProfit2: "Take Profit 2",
    takeProfit1: "Take Profit 1",
    entryPrice: "Harga Entry",
    stopLoss: "Stop Loss",
    rsi: "RSI",
    momentum: "Momentum",
    volume: "Volume",
    trendStrength: "Kekuatan Tren",
    aiAnalystTitle: "ANALIS AI",
    trackFavorites: "Pantau pasangan favorit Anda",
    watchlistTitle: "Watchlist",
    searchPlaceholder: "Cari koin atau simbol...",
    errorPrefix: "Error:",
    // Signals page
    signalsTitle: "SINYAL TRADING LIVE",
    signalSubtitle: "Sistem Skoring 4 Lapisan: Teknikal · Derivatif · On-Chain · Makro",
    scanNow: "SCAN SEKARANG",
    scanning: "SCAN BERJALAN...",
    winrate: "Win Rate",
    activeSignals: "Aktif",
    todaySignals: "Hari Ini",
    nextScan: "Scan Berikutnya",
    settings: "Pengaturan",
    history: "Riwayat",
    noActiveSignals: "Belum ada sinyal aktif. Scanner akan berjalan otomatis.",
    long: "LONG",
    short: "SHORT",
    safe: "AMAN",
    moderat: "MODERAT",
    risky: "BERISIKO",
    entryZone: "Zona Entry",
    tp1: "TP1",
    tp2: "TP2",
    tp3: "TP3",
    sl: "SL",
    technical: "Teknikal",
    derivatives: "Derivatif",
    onchain: "On-Chain",
    macro: "Makro",
    score: "Skor",
    aiVerdict: "Verdict AI",
    scanInterval: "Interval Scan",
    minConfidence: "Min Keyakinan",
    activeHours: "Jam Aktif (WIB)",
    enableAI: "Aktifkan Analisis AI",
    saveSettings: "SIMPAN PENGATURAN",
    status: "Status",
    closedAt: "Ditutup",
    result: "Hasil",
    noHistory: "Belum ada riwayat sinyal.",
    expired: "EXPIRED",
    tp1Hit: "TP1 KENA",
    tp2Hit: "TP2 KENA",
    tp3Hit: "TP3 KENA",
    slHit: "SL KENA",
    apiMonitor: "Monitor API",
    hours: "jam",
    apiWarnings: "Peringatan",
    scoreLabel: "Skor",
    confLabel: "Keyak.",
  },
};

const AppSettingsContext = createContext<AppSettingsContextValue>({
  theme: "dark",
  language: "id",
  toggleTheme: () => {},
  toggleLanguage: () => {},
  t: (key) => key,
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("garongdz_theme") as Theme) || "dark";
    } catch {
      return "dark";
    }
  });

  const [language, setLanguage] = useState<Language>(() => {
    try {
      return (localStorage.getItem("garongdz_lang") as Language) || "id";
    } catch {
      return "id";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    try {
      localStorage.setItem("garongdz_theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("garongdz_lang", language);
    } catch {}
  }, [language]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  const toggleLanguage = () =>
    setLanguage((prev) => (prev === "en" ? "id" : "en"));

  const t = (key: string): string =>
    translations[language][key] ?? translations["en"][key] ?? key;

  return (
    <AppSettingsContext.Provider
      value={{ theme, language, toggleTheme, toggleLanguage, t }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
