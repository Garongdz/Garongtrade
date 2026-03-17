import { Link, useLocation } from "wouter";
import {
  LineChart,
  LayoutDashboard,
  Star,
  BellRing,
  BrainCircuit,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import TickerTape from "./TickerTape";
import { useBinanceWS } from "@/contexts/BinanceWSContext";
import { useAppSettings } from "@/contexts/AppSettingsContext";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { connected } = useBinanceWS();
  const { theme, language, toggleTheme, toggleLanguage, t } = useAppSettings();

  const navItems = [
    { href: "/", labelKey: "markets", icon: LayoutDashboard },
    { href: "/watchlist", labelKey: "watchlist", icon: Star },
    { href: "/ai-analyst", labelKey: "aiAnalyst", icon: BrainCircuit },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
        <div className="px-4">
          <div className="flex h-14 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3 mr-6">
              <div className="flex items-center justify-center">
                <LineChart className="h-6 w-6 text-primary" />
              </div>
              <span className="font-sans text-xl font-bold tracking-tight text-primary hidden sm:block">
                BINANCE<span className="text-foreground"> FUTURES</span>
              </span>
            </div>

            {/* Navigation */}
            <nav className="flex items-center flex-1">
              {navItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center h-14 px-4 text-sm font-medium transition-colors relative",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="hidden sm:block">{t(item.labelKey)}</span>
                    <item.icon className="h-4 w-4 sm:hidden" />
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* LIVE indicator */}
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    connected ? "bg-positive live-pulse" : "bg-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-mono-price font-semibold tracking-widest",
                    connected ? "text-positive" : "text-muted-foreground"
                  )}
                >
                  {connected ? "LIVE" : "..."}
                </span>
              </div>

              {/* Language toggle */}
              <button
                onClick={toggleLanguage}
                title="Toggle Language"
                className="flex items-center justify-center px-2 py-1 rounded-sm border border-border text-[11px] font-bold font-mono-price text-muted-foreground hover:text-primary hover:border-primary transition-colors"
              >
                {language === "en" ? "ID" : "EN"}
              </button>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                title="Toggle Theme"
                className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
              >
                {theme === "dark" ? (
                  <Sun className="h-4.5 w-4.5" />
                ) : (
                  <Moon className="h-4.5 w-4.5" />
                )}
              </button>

              <button className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors relative">
                <BellRing className="h-5 w-5" />
                <span className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-primary"></span>
              </button>

              <div className="h-7 w-7 rounded-full bg-card border border-border overflow-hidden cursor-pointer flex items-center justify-center ml-1 text-xs font-bold text-muted-foreground">
                U
              </div>
            </div>
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
