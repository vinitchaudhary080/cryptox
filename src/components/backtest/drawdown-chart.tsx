"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@/lib/utils"

type DrawdownPoint = { time: number; drawdownPct: number }

type RangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y" | "ALL"

const RANGE_OPTIONS: RangeKey[] = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "ALL"]

function rangeStartMs(range: RangeKey, latest: number): number {
  const now = new Date(latest)
  const d = new Date(now)
  switch (range) {
    case "1M":
      d.setMonth(d.getMonth() - 1)
      return d.getTime()
    case "3M":
      d.setMonth(d.getMonth() - 3)
      return d.getTime()
    case "6M":
      d.setMonth(d.getMonth() - 6)
      return d.getTime()
    case "YTD":
      return new Date(now.getFullYear(), 0, 1).getTime()
    case "1Y":
      d.setFullYear(d.getFullYear() - 1)
      return d.getTime()
    case "3Y":
      d.setFullYear(d.getFullYear() - 3)
      return d.getTime()
    case "5Y":
      d.setFullYear(d.getFullYear() - 5)
      return d.getTime()
    case "ALL":
    default:
      return 0
  }
}

export function DrawdownChart({ data }: { data: DrawdownPoint[] }) {
  const [range, setRange] = useState<RangeKey>("ALL")

  const hasData = data && data.length > 0

  // Filter raw data based on selected range, then downsample.
  const { formatted, minDd } = useMemo(() => {
    if (!hasData) return { formatted: [], minDd: 0 }

    const latest = data[data.length - 1].time
    const earliest = data[0].time
    const threshold = range === "ALL" ? earliest : rangeStartMs(range, latest)
    const filtered = data.filter((d) => d.time >= threshold)

    // If the range is so narrow that nothing matches, fall back to the last
    // visible slice so the chart still renders something useful.
    const effective = filtered.length > 0 ? filtered : data.slice(-Math.min(data.length, 30))

    const step = Math.max(1, Math.floor(effective.length / 500))
    const sampled = effective.filter((_, i) => i % step === 0 || i === effective.length - 1)

    const rows = sampled.map((d, i) => ({
      time: new Date(d.time).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "2-digit",
      }),
      idx: i,
      dd: Number((-d.drawdownPct).toFixed(2)),
    }))

    const mn = rows.length > 0 ? Math.min(...rows.map((r) => r.dd)) : 0
    return { formatted: rows, minDd: mn }
  }, [data, range, hasData])

  if (!hasData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Drawdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[250px] items-center justify-center text-xs text-muted-foreground">
            Run a new backtest to see drawdown data
          </div>
        </CardContent>
      </Card>
    )
  }

  const ddColor = "#ef4444"

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-semibold">Drawdown</CardTitle>
        <div className="flex flex-wrap gap-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={formatted}
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={ddColor} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={ddColor} stopOpacity={0.08} />
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
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                domain={[minDd * 1.1, 0.5]}
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
                stroke={ddColor}
                fill="url(#ddGrad)"
                strokeWidth={2}
              />
              <Brush
                dataKey="time"
                height={22}
                stroke="#ef4444"
                fill="rgba(239,68,68,0.08)"
                travellerWidth={10}
                tickFormatter={() => ""}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
