"use client"

import { formatISTAxisShort, getISTDayKey } from "@/lib/time-ist"

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

type RangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y" | "ALL" | "CUSTOM"

const PRESET_RANGES: Exclude<RangeKey, "CUSTOM">[] = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "ALL"]

function toDateInput(ms: number): string {
  return getISTDayKey(ms) // YYYY-MM-DD
}

function rangeStartMs(range: Exclude<RangeKey, "CUSTOM" | "ALL">, latest: number): number {
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
  }
}

export function DrawdownChart({ data }: { data: DrawdownPoint[] }) {
  const [range, setRange] = useState<RangeKey>("ALL")
  const [fromDate, setFromDate] = useState<string>("")
  const [toDate, setToDate] = useState<string>("")

  const hasData = data && data.length > 0
  const earliest = hasData ? data[0].time : 0
  const latest = hasData ? data[data.length - 1].time : 0

  // Compute the [from, to] ms window based on current selection.
  const { fromMs, toMs } = useMemo(() => {
    if (!hasData) return { fromMs: 0, toMs: 0 }
    if (range === "CUSTOM") {
      const fMs = fromDate ? new Date(fromDate).getTime() : earliest
      const tMs = toDate ? new Date(toDate).getTime() + 86_399_999 : latest
      return { fromMs: Math.max(fMs, earliest), toMs: Math.min(tMs, latest) }
    }
    if (range === "ALL") return { fromMs: earliest, toMs: latest }
    return { fromMs: rangeStartMs(range, latest), toMs: latest }
  }, [range, fromDate, toDate, earliest, latest, hasData])

  const { formatted, minDd } = useMemo(() => {
    if (!hasData) return { formatted: [], minDd: 0 }
    const filtered = data.filter((d) => d.time >= fromMs && d.time <= toMs)
    const effective = filtered.length > 0 ? filtered : data.slice(-Math.min(data.length, 30))

    const step = Math.max(1, Math.floor(effective.length / 500))
    const sampled = effective.filter((_, i) => i % step === 0 || i === effective.length - 1)

    const rows = sampled.map((d, i) => ({
      time: formatISTAxisShort(d.time),
      idx: i,
      raw: d.time,
      dd: Number((-d.drawdownPct).toFixed(2)),
    }))
    const mn = rows.length > 0 ? Math.min(...rows.map((r) => r.dd)) : 0
    return { formatted: rows, minDd: mn }
  }, [data, fromMs, toMs, hasData])

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

  const applyCustomRange = (nextFrom: string, nextTo: string) => {
    setFromDate(nextFrom)
    setToDate(nextTo)
    if (nextFrom || nextTo) setRange("CUSTOM")
  }

  const selectPreset = (r: Exclude<RangeKey, "CUSTOM">) => {
    setRange(r)
    if (r === "ALL") {
      setFromDate("")
      setToDate("")
    } else {
      setFromDate(toDateInput(rangeStartMs(r, latest)))
      setToDate(toDateInput(latest))
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2">
        <div className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">Drawdown</CardTitle>
          <div className="flex flex-wrap gap-1">
            {PRESET_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => selectPreset(r)}
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
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">From</span>
          <input
            type="date"
            min={toDateInput(earliest)}
            max={toDateInput(latest)}
            value={fromDate || toDateInput(earliest)}
            onChange={(e) => applyCustomRange(e.target.value, toDate || toDateInput(latest))}
            className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
          />
          <span className="text-muted-foreground">To</span>
          <input
            type="date"
            min={toDateInput(earliest)}
            max={toDateInput(latest)}
            value={toDate || toDateInput(latest)}
            onChange={(e) => applyCustomRange(fromDate || toDateInput(earliest), e.target.value)}
            className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
          />
          {range === "CUSTOM" && (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              Custom range active
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
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
                height={24}
                stroke="#ef4444"
                fill="rgba(239,68,68,0.08)"
                travellerWidth={12}
                tickFormatter={(v) => String(v)}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
