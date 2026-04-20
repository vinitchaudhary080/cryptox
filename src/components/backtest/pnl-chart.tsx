"use client"

import { formatISTAxisShort } from "@/lib/time-ist"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Trade {
  pnl: number
  entryTime: string
  side: string
}

export function PnlChart({ trades }: { trades: Trade[] }) {
  const chartData = trades.map((t, i) => ({
    index: i + 1,
    pnl: Number(t.pnl.toFixed(2)),
    side: t.side,
    date: formatISTAxisShort(t.entryTime),
  }))

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Per-Trade PnL</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="index"
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                tickLine={false}
                axisLine={false}
                label={{ value: "Trade #", position: "insideBottom", offset: -5, fontSize: 11, fill: "#a1a1aa" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#a1a1aa" }}
                tickFormatter={(v) => `$${v}`}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, "PnL"]}
                labelFormatter={(label) => {
                  const trade = chartData[Number(label) - 1]
                  return trade ? `Trade #${label} (${trade.date})` : `Trade #${label}`
                }}
              />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.pnl >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
