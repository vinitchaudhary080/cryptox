"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type CumulativePnlPoint = { time: number; pnl: number }

export function CumulativePnlChart({ data }: { data: CumulativePnlPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Cumulative PnL</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-xs text-muted-foreground">
            Run a new backtest to see cumulative PnL data
          </div>
        </CardContent>
      </Card>
    )
  }

  // Downsample if too many points (trades can be 1000+)
  const step = Math.max(1, Math.floor(data.length / 300))
  const sampled = data.filter((_, i) => i % step === 0 || i === data.length - 1)

  const formatted = sampled.map((d, i) => ({
    time: new Date(d.time).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    idx: i,
    pnl: Number(d.pnl.toFixed(2)),
  }))

  const maxPnl = Math.max(...formatted.map((d) => d.pnl))
  const minPnl = Math.min(...formatted.map((d) => d.pnl))
  const isPositive = formatted[formatted.length - 1]?.pnl >= 0

  // Brighter shades that stay visible on both light + dark backgrounds
  const color = isPositive ? "#22c55e" : "#ef4444"

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Cumulative PnL</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cumPnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                interval={Math.max(1, Math.floor(formatted.length / 6))}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                tickFormatter={(v: number) => `$${v.toLocaleString()}`}
                domain={[Math.min(minPnl * 1.1, 0), maxPnl * 1.1]}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, "Cumulative PnL"]}
              />
              <Area
                type="monotone"
                dataKey="pnl"
                stroke={color}
                fill="url(#cumPnlGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
