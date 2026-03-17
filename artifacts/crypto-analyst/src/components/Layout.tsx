import { Link, useLocation } from "wouter";
import { Sun, Moon, BellRing, Zap, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import TickerTape from "./TickerTape";
import { useBinanceWS } from "@/contexts/BinanceWSContext";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

function useActiveSignalCount() {
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const { data } = useQuery({
    queryKey: ["signals-count"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/signals`);
      const j = await r.json();
      return (j.signals?.length ?? 0) as number;
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  return data ?? 0;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { connected } = useBinanceWS();
  const { theme, language, toggleTheme, toggleLanguage, t } = useAppSettings();
  const { logout } = useAuth();
  const signalCount = useActiveSignalCount();

  const navItems = [
    { href: "/", labelKey: "markets" },
    { href: "/chart/BTC", labelKey: "chart" },
    { href: "/news", labelKey: "news" },
    { href: "/ai-analyst", labelKey: "aiAnalyst" },
    { href: "/signals", labelKey: "signals" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0B0E11" }}>
      {/* Top Navigation */}
      <header
        className="sticky top-0 z-40 w-full"
        style={{ background: "#181A20", borderBottom: "1px solid #2B3139", height: 56 }}
      >
        <div className="px-4 h-full flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3 mr-6 shrink-0">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-md font-bold text-black text-sm select-none"
              style={{ background: "#F0B90B" }}
            >
              G
            </div>
            <span className="font-bold text-[15px] hidden sm:block" style={{ color: "#EAECEF" }}>
              Garong<span style={{ color: "#F0B90B" }}>'Space</span>
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex items-center flex-1 h-full">
            {navItems.map((item) => {
              const isActive = item.href.startsWith("/chart")
                ? location.startsWith("/chart")
                : location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center h-full px-3.5 text-[13px] font-medium transition-colors whitespace-nowrap gap-1.5",
                    isActive
                      ? "text-[#EAECEF]"
                      : "text-[#848E9C] hover:text-[#EAECEF]"
                  )}
                >
                  {t(item.labelKey)}
                  {item.href === "/signals" && signalCount > 0 && (
                    <span
                      className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold"
                      style={{ background: "rgba(240,185,11,0.15)", color: "#F0B90B" }}
                    >
                      {signalCount}
                    </span>
                  )}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-sm"
                      style={{ background: "#F0B90B" }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* LIVE pill */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-sm text-[11px] font-semibold"
              style={{
                border: "1px solid #0ECB81",
                color: "#0ECB81",
              }}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  connected ? "bg-[#0ECB81] live-pulse" : "bg-[#848E9C]"
                )}
              />
              {connected ? "LIVE" : "..."}
            </div>

            {/* Language toggle */}
            <button
              onClick={toggleLanguage}
              title="Toggle Language"
              className="flex items-center justify-center px-2 py-1 rounded-sm text-[11px] font-bold transition-colors"
              style={{ border: "1px solid #2B3139", color: "#848E9C" }}
            >
              {language === "en" ? "ID" : "EN"}
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title="Toggle Theme"
              className="flex items-center justify-center transition-colors"
              style={{ color: "#848E9C" }}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Bell */}
            <button
              className="relative flex items-center justify-center transition-colors"
              style={{ color: "#848E9C" }}
            >
              <BellRing className="h-4.5 w-4.5" />
              <span
                className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full"
                style={{ background: "#F0B90B" }}
              />
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              title="Keluar"
              className="h-7 w-7 rounded-full flex items-center justify-center transition-colors hover:bg-[#2B3139]"
              style={{ border: "1px solid #2B3139", color: "#848E9C" }}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>

            {/* Analisis Sekarang button */}
            <Link
              href="/ai-analyst"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[12px] font-bold transition-opacity hover:opacity-80"
              style={{ background: "#F0B90B", color: "#000" }}
            >
              <Zap className="h-3 w-3" />
              Analisis Sekarang
            </Link>
          </div>
        </div>
      </header>

      {/* Ticker Tape */}
      <TickerTape />

      {/* Main Content */}
      <main className="flex-1 w-full p-0">{children}</main>
    </div>
  );
}
