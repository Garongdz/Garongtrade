import Layout from "@/components/Layout";
import CryptoTable from "@/components/CryptoTable";

export default function Watchlist() {
  return (
    <Layout>
      <div className="flex flex-col w-full h-[calc(100vh-3.5rem)]">
        {/* Header Section */}
        <div className="border-b border-border bg-card px-4 py-3">
          <h1 className="text-lg font-bold font-sans tracking-tight text-foreground">
            Watchlist
          </h1>
          <p className="text-muted-foreground text-xs">
            Track your favorite pairs
          </p>
        </div>

        {/* Watchlist Table */}
        <div className="flex-1 overflow-hidden bg-background">
          <CryptoTable filterWatchlistOnly />
        </div>
      </div>
    </Layout>
  );
}
