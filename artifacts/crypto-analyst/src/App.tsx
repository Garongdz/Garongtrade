import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import ChartPage from "@/pages/Chart";
import News from "@/pages/News";
import AiAnalyst from "@/pages/AiAnalyst";
import Signals from "@/pages/Signals";
import LoginPage from "@/pages/LoginPage";
import { BinanceWSProvider } from "@/contexts/BinanceWSContext";
import { AppSettingsProvider } from "@/contexts/AppSettingsContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/chart" component={ChartPage} />
      <Route path="/chart/:symbol" component={ChartPage} />
      <Route path="/news" component={News} />
      <Route path="/ai-analyst" component={AiAnalyst} />
      <Route path="/signals" component={Signals} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  const { authenticated, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{ background: "#0B0E11", minHeight: "100vh" }}
        className="flex items-center justify-center"
      >
        <div
          className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#F0B90B", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!authenticated) return <LoginPage />;

  return (
    <AppSettingsProvider>
      <BinanceWSProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
      </BinanceWSProvider>
    </AppSettingsProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
