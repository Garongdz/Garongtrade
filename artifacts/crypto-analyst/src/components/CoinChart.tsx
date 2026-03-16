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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const strokeColor = isPositive ? "hsl(var(--positive))" : "hsl(var(--destructive))";
  const fillId = `color${symbol}`;

  return (
    <div className="w-full flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold font-display text-white mb-2">{name} <span className="text-muted-foreground text-xl uppercase">({symbol})</span></h2>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-mono font-bold text-white tracking-tight">{formatCurrency(currentPrice)}</span>
            <span className={`text-lg font-bold ${isPositive ? 'text-positive' : 'text-destructive'}`}>
              {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          </div>
        </div>

        <Tabs defaultValue="7" onValueChange={(v) => setDays(Number(v))} className="w-[300px]">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="7">7D</TabsTrigger>
            <TabsTrigger value="30">30D</TabsTrigger>
            <TabsTrigger value="90">90D</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 min-h-[400px] w-full mt-4 bg-white/5 rounded-2xl border border-white/5 p-4 pt-8">
        {isLoading || !data ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(time) => format(new Date(time), days > 7 ? 'MMM d' : 'EEE p')}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickMargin={12}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
              />
              <YAxis 
                domain={['auto', 'auto']}
                tickFormatter={(val) => formatCurrency(val, 0)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                orientation="right"
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-card/90 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl">
                        <p className="text-muted-foreground text-xs font-semibold mb-2">
                          {format(new Date(data.timestamp), 'MMM d, yyyy HH:mm')}
                        </p>
                        <p className="text-white font-mono font-bold text-lg">
                          {formatCurrency(data.close)}
                        </p>
                        <div className="flex gap-4 mt-2 pt-2 border-t border-white/10 text-xs">
                          <div>
                            <span className="text-muted-foreground">High </span>
                            <span className="text-white font-mono">{formatCurrency(data.high)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Low </span>
                            <span className="text-white font-mono">{formatCurrency(data.low)}</span>
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
                strokeWidth={3}
                fillOpacity={1} 
                fill={`url(#${fillId})`} 
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
