import { useState } from "react";
import { useGetCryptoHistory } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface CoinChartProps {
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange: number;
}

export default function CoinChart({ symbol, name, currentPrice, priceChange }: CoinChartProps) {
  const [days, setDays] = useState<number>(7);
  const { data, isLoading } = useGetCryptoHistory(symbol, { days });

  const isPositive = priceChange >= 0;
  const strokeColor = "#F0B90B"; // Binance Yellow

  return (
    <div className="flex flex-col h-full bg-background rounded-sm overflow-hidden font-sans">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-baseline gap-4">
          <h2 className="text-xl font-bold text-foreground uppercase flex items-center gap-2">
            {symbol}/USDT
            <span className="text-xs text-muted-foreground font-normal normal-case underline decoration-dashed cursor-help">{name}</span>
          </h2>
          <span className={`text-xl font-mono-price font-bold ${isPositive ? 'text-positive' : 'text-destructive'}`}>
            {formatCurrency(currentPrice)}
          </span>
          <span className={`text-sm font-mono-price font-bold ${isPositive ? 'text-positive' : 'text-destructive'}`}>
            {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
          </span>
        </div>

        {/* Flat Time Selector */}
        <div className="flex gap-1 mt-2 sm:mt-0">
          {[
            { label: '7D', value: 7 },
            { label: '30D', value: 30 },
            { label: '90D', value: 90 },
          ].map(item => (
            <button
              key={item.value}
              onClick={() => setDays(item.value)}
              className={`px-3 py-1 text-xs font-medium border-b-2 transition-colors ${
                days === item.value 
                ? 'text-primary border-primary' 
                : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 w-full bg-background p-2">
        {isLoading || !data ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#2B3139" opacity={0.5} />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(time) => format(new Date(time), days > 7 ? 'MMM d' : 'EEE p')}
                stroke="#848E9C"
                fontSize={10}
                tickMargin={8}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
                fontFamily="Roboto Mono, monospace"
              />
              <YAxis 
                domain={['auto', 'auto']}
                tickFormatter={(val) => formatCurrency(val, 0)}
                stroke="#848E9C"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                orientation="right"
                fontFamily="Roboto Mono, monospace"
              />
              <Tooltip 
                cursor={{ stroke: '#848E9C', strokeWidth: 1, strokeDasharray: '4 4' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-card border border-border p-3 text-xs shadow-xl rounded-sm">
                        <p className="text-muted-foreground mb-1 font-mono-price">
                          {format(new Date(data.timestamp), 'MMM d, yyyy HH:mm')}
                        </p>
                        <div className="space-y-1 font-mono-price">
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Price</span>
                            <span className="text-primary">{formatCurrency(data.close)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">High</span>
                            <span className="text-foreground">{formatCurrency(data.high)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Low</span>
                            <span className="text-foreground">{formatCurrency(data.low)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="close" 
                stroke={strokeColor} 
                strokeWidth={2}
                fill="none" 
                animationDuration={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
