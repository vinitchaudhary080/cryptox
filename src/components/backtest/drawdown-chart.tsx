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

type DrawdownPoint = { time: number; drawdownPct: number }

export function DrawdownChart({ data }: { data: DrawdownPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Drawdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
            Run a new backtest to see drawdown data
          </div>
        </CardContent>
      </Card>
    )
  }

  // Downsample for rendering (drawdown curve can be huge for 1m backtests)
  const step = Math.max(1, Math.floor(data.length / 500))
  const sampled = data.filter((_, i) => i % step === 0 || i === data.length - 1)

  const formatted = sampled.map((d, i) => ({
    time: new Date(d.time).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    idx: i,
    dd: Number((-d.drawdownPct).toFixed(2)),
  }))

  const minDd = Math.min(...formatted.map((d) => d.dd))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Drawdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--loss))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--loss))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                interval={Math.max(1, Math.floor(formatted.length / 6))}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                domain={[minDd * 1.1, 0]}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`${value.toFixed(2)}%`, "Drawdown"]}
              />
              <Area
                type="monotone"
                dataKey="dd"
                stroke="hsl(var(--loss))"
                fill="url(#ddGrad)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
