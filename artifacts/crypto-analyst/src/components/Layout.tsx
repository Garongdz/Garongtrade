import { Link, useLocation } from "wouter";
import { LineChart, LayoutDashboard, Star, BellRing, Settings, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/watchlist", label: "Watchlist", icon: Star },
    { href: "/ai-analyst", label: "AI Analyst", icon: BrainCircuit },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/60 backdrop-blur-2xl">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 items-center justify-between">
            
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-lg shadow-cyan-500/20">
                <LineChart className="h-5 w-5 text-white" />
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-white hidden sm:block">
                Garongdz'<span className="text-primary">Trade</span>
              </span>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-1 sm:gap-2">
              {navItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                      isActive
                        ? "bg-white/10 text-white shadow-inner shadow-white/5"
                        : "text-muted-foreground hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "")} />
                    <span className="hidden sm:block">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-3">
              <button className="h-10 w-10 flex items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-white transition-colors relative">
                <BellRing className="h-5 w-5" />
                <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"></span>
              </button>
              <button className="h-10 w-10 flex items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-white transition-colors">
                <Settings className="h-5 w-5" />
              </button>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 border-2 border-white/10 overflow-hidden cursor-pointer shadow-lg shadow-indigo-500/20 ml-2">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=transparent`} alt="Avatar" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        <div className="absolute top-0 left-0 right-0 h-[500px] w-full overflow-hidden pointer-events-none -z-10">
           <img 
              src={`${import.meta.env.BASE_URL}images/hero-glow.png`} 
              alt="Glow background" 
              className="w-full h-full object-cover opacity-30 mix-blend-screen"
            />
        </div>
        {children}
      </main>
    </div>
  );
}
