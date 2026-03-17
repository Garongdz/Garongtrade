import Layout from "@/components/Layout";
import CryptoTable from "@/components/CryptoTable";
import { useAppSettings } from "@/contexts/AppSettingsContext";

export default function Watchlist() {
  const { t } = useAppSettings();

  return (
    <Layout>
      <div className="flex flex-col w-full h-[calc(100vh-3.5rem-62px)]">
        <div className="border-b border-border bg-card px-4 py-3">
          <h1 className="text-lg font-bold font-sans tracking-tight text-foreground">
            {t("watchlistTitle")}
          </h1>
          <p className="text-muted-foreground text-xs">{t("trackFavorites")}</p>
        </div>
        <div className="flex-1 overflow-hidden bg-background">
          <CryptoTable filterWatchlistOnly />
        </div>
      </div>
    </Layout>
  );
}
