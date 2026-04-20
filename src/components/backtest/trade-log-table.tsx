"use client"

import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight, Download } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatISTDateTime, formatISTCsv } from "@/lib/time-ist"

interface Trade {
  id: string
  entryTime: string
  entryPrice: number
  qty: number
  side: string
  leverage: number
  sl: number | null
  tp: number | null
  exitTime: string | null
  exitPrice: number | null
  pnl: number
  fee: number
  exitReason: string | null
  status: string
}

/** All times displayed + exported in IST (Asia/Kolkata). */
function formatDate(dateStr: string): string {
  return formatISTDateTime(dateStr)
}

function downloadCSV(trades: Trade[], filename: string) {
  const headers = ["#", "Entry Time (IST)", "Entry Price", "Qty", "Side", "Leverage", "SL", "TP", "Exit Time (IST)", "Exit Price", "PnL", "Fee", "Exit Reason"]
  const rows = trades.map((t, i) => [
    i + 1,
    formatISTCsv(t.entryTime),
    t.entryPrice.toFixed(2),
    t.qty.toFixed(6),
    t.side,
    t.leverage,
    t.sl?.toFixed(2) ?? "",
    t.tp?.toFixed(2) ?? "",
    t.exitTime ? formatISTCsv(t.exitTime) : "",
    t.exitPrice?.toFixed(2) ?? "",
    t.pnl.toFixed(2),
    t.fee.toFixed(4),
    t.exitReason ?? "",
  ])

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function TradeLogTable({
  trades,
  total,
  page,
  limit,
  onPageChange,
  allTrades,
}: {
  trades: Trade[]
  total: number
  page: number
  limit: number
  onPageChange: (page: number) => void
  allTrades?: Trade[]
}) {
  const totalPages = Math.ceil(total / limit)

  // Extract unique years from trades
  const years = useMemo(() => {
    const source = allTrades ?? trades
    const yrs = new Set<string>()
    source.forEach((t) => {
      const yr = new Date(t.entryTime).getFullYear().toString()
      yrs.add(yr)
    })
    return ["All", ...Array.from(yrs).sort((a, b) => b.localeCompare(a))]
  }, [allTrades, trades])

  const [yearFilter, setYearFilter] = useState("All")

  // Filter trades by year (client-side filter on current page trades)
  const filteredTrades = yearFilter === "All"
    ? trades
    : trades.filter((t) => new Date(t.entryTime).getFullYear().toString() === yearFilter)

  // For CSV download, filter allTrades by year
  const csvTrades = useMemo(() => {
    const source = allTrades ?? trades
    if (yearFilter === "All") return source
    return source.filter((t) => new Date(t.entryTime).getFullYear().toString() === yearFilter)
  }, [allTrades, trades, yearFilter])

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Trade Log</CardTitle>
            <Badge variant="outline" className="text-xs">
              {total} trades
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Year Filter */}
            <div className="flex rounded-lg bg-muted/50 p-0.5">
              {years.map((yr) => (
                <button
                  key={yr}
                  onClick={() => setYearFilter(yr)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    yearFilter === yr
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>

            {/* CSV Download */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => downloadCSV(csvTrades, `backtest-trades${yearFilter !== "All" ? `-${yearFilter}` : ""}.csv`)}
            >
              <Download className="h-3 w-3" />
              CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">#</th>
                <th className="px-4 py-2.5 text-left font-medium">Entry Time</th>
                <th className="px-4 py-2.5 text-right font-medium">Entry Price</th>
                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th className="px-4 py-2.5 text-center font-medium">Side</th>
                <th className="px-4 py-2.5 text-right font-medium">Lev</th>
                <th className="px-4 py-2.5 text-right font-medium">SL</th>
                <th className="px-4 py-2.5 text-right font-medium">TP</th>
                <th className="px-4 py-2.5 text-left font-medium">Exit Time</th>
                <th className="px-4 py-2.5 text-right font-medium">Exit Price</th>
                <th className="px-4 py-2.5 text-right font-medium">PnL</th>
                <th className="px-4 py-2.5 text-right font-medium">Fee</th>
                <th className="px-4 py-2.5 text-center font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((trade, idx) => (
                <tr
                  key={trade.id}
                  className="border-b border-border/20 transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {(page - 1) * limit + idx + 1}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {formatDate(trade.entryTime)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    ${trade.entryPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {trade.qty.toFixed(4)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        trade.side === "BUY"
                          ? "border-profit/30 bg-profit/10 text-profit"
                          : "border-loss/30 bg-loss/10 text-loss"
                      }`}
                    >
                      {trade.side}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {trade.leverage}x
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                    {trade.sl ? `$${trade.sl.toFixed(2)}` : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                    {trade.tp ? `$${trade.tp.toFixed(2)}` : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {trade.exitTime ? formatDate(trade.exitTime) : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : "-"}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono text-xs font-medium ${
                      trade.pnl >= 0 ? "text-profit" : "text-loss"
                    }`}
                  >
                    {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                    ${trade.fee.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge variant="outline" className="text-[10px]">
                      {trade.exitReason ?? "-"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
