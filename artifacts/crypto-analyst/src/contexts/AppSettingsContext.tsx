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
  },
  id: {
    news: "Berita",
    markets: "Pasar",
    watchlist: "Watchlist",
    aiAnalyst: "Analis AI",
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
