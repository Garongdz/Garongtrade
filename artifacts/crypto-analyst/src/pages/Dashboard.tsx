import Layout from "@/components/Layout";
import MarketOverview from "@/components/MarketOverview";
import TrendingGrid from "@/components/TrendingGrid";
import CryptoTable from "@/components/CryptoTable";

export default function Dashboard() {
  return (
    <Layout>
      <div className="flex flex-col gap-10 pb-16">
        
        {/* Header Section */}
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold font-display tracking-tight text-white mb-3">
            Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-500">Overview</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Live metrics, trending assets, and comprehensive price data for the global cryptocurrency market.
          </p>
        </div>

        {/* Global Market Stats */}
        <section>
          <MarketOverview />
        </section>

        {/* Trending Coins Marquee/Grid */}
        <section>
          <TrendingGrid />
        </section>

        {/* Main Data Table */}
        <section>
          <CryptoTable />
        </section>

      </div>
    </Layout>
  );
}
