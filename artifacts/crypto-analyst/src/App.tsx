import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Watchlist from "@/pages/Watchlist";
import News from "@/pages/News";
import AiAnalyst from "@/pages/AiAnalyst";
import Signals from "@/pages/Signals";
import { BinanceWSProvider } from "@/contexts/BinanceWSContext";
import { AppSettingsProvider } from "@/contexts/AppSettingsContext";

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
      <Route path="/watchlist" component={Watchlist} />
      <Route path="/news" component={News} />
      <Route path="/ai-analyst" component={AiAnalyst} />
      <Route path="/signals" component={Signals} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppSettingsProvider>
          <BinanceWSProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </BinanceWSProvider>
        </AppSettingsProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
