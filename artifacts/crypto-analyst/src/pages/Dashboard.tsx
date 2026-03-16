import Layout from "@/components/Layout";
import MarketOverview from "@/components/MarketOverview";
import TrendingGrid from "@/components/TrendingGrid";
import CryptoTable from "@/components/CryptoTable";

export default function Dashboard() {
  return (
    <Layout>
      <div className="flex flex-col w-full">
        {/* Global Market Stats Bar */}
        <div className="border-b border-border bg-card">
          <MarketOverview />
        </div>

        <div className="flex flex-col xl:flex-row w-full h-[calc(100vh-3.5rem-41px)]">
          {/* Main Data Table */}
          <section className="flex-1 flex flex-col min-w-0 border-r border-border h-full overflow-hidden bg-background">
            <div className="h-full flex flex-col">
              <CryptoTable />
            </div>
          </section>
          
          {/* Right Sidebar - Trending */}
          <section className="w-full xl:w-[320px] shrink-0 border-t xl:border-t-0 border-border bg-card h-full overflow-y-auto">
            <TrendingGrid />
          </section>
        </div>
      </div>
    </Layout>
  );
}
