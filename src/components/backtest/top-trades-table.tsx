"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown } from "lucide-react"

type TopTrade = {
  entry_time: number
  exit_time: number
  side: string
  entry_price: number
  exit_price: number
  pnl: number
  exit_reason: string
}

export function TopTradesTable({
  wins,
  losses,
}: {
  wins: TopTrade[]
  losses: TopTrade[]
}) {
  if ((!wins || wins.length === 0) && (!losses || losses.length === 0)) return null

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-profit" />
            Largest Winning Trades
          </CardTitle>
        </CardHeader>
        <CardContent>
          {wins.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No winning trades</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-5 gap-2 pb-1 text-[10px] font-medium uppercase text-muted-foreground">
                <span>Side</span>
                <span>Entry</span>
                <span>Exit</span>
                <span>PnL</span>
                <span>Reason</span>
              </div>
              {wins.map((t, i) => (
                <div
                  key={i}
                  className="grid grid-cols-5 gap-2 rounded-md px-1 py-1.5 text-xs transition-colors hover:bg-muted/30"
                >
                  <span className={cn("font-medium", t.side === "BUY" ? "text-profit" : "text-loss")}>
                    {t.side}
                  </span>
                  <span>${t.entry_price.toFixed(2)}</span>
                  <span>${t.exit_price.toFixed(2)}</span>
                  <span className="font-semibold text-profit">+${t.pnl.toFixed(2)}</span>
                  <span className="text-muted-foreground">{t.exit_reason}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <TrendingDown className="h-4 w-4 text-loss" />
            Largest Losing Trades
          </CardTitle>
        </CardHeader>
        <CardContent>
          {losses.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No losing trades</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-5 gap-2 pb-1 text-[10px] font-medium uppercase text-muted-foreground">
                <span>Side</span>
                <span>Entry</span>
                <span>Exit</span>
                <span>PnL</span>
                <span>Reason</span>
              </div>
              {losses.map((t, i) => (
                <div
                  key={i}
                  className="grid grid-cols-5 gap-2 rounded-md px-1 py-1.5 text-xs transition-colors hover:bg-muted/30"
                >
                  <span className={cn("font-medium", t.side === "BUY" ? "text-profit" : "text-loss")}>
                    {t.side}
                  </span>
                  <span>${t.entry_price.toFixed(2)}</span>
                  <span>${t.exit_price.toFixed(2)}</span>
                  <span className="font-semibold text-loss">${t.pnl.toFixed(2)}</span>
                  <span className="text-muted-foreground">{t.exit_reason}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
