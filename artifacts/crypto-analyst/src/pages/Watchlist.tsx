import Layout from "@/components/Layout";
import CryptoTable from "@/components/CryptoTable";

export default function Watchlist() {
  return (
    <Layout>
      <div className="flex flex-col gap-10 pb-16">
        
        {/* Header Section */}
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold font-display tracking-tight text-white mb-3">
            Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">Watchlist</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Track and analyze the assets you care about most.
          </p>
        </div>

        {/* Watchlist Table */}
        <section>
          <CryptoTable filterWatchlistOnly />
        </section>

      </div>
    </Layout>
  );
}
