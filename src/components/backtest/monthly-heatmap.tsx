"use client"

import { getISTDayKey } from "@/lib/time-ist"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface Trade {
  entryTime: string
  exitTime: string | null
  pnl: number
  status: string
}

interface MonthData {
  key: string          // "2024-01"
  label: string        // "Jan 24"
  totalPnl: number
  days: DayData[]
}

interface DayData {
  date: string         // "2024-01-15"
  dayOfWeek: number    // 0=Sun, 1=Mon...
  weekIndex: number    // which week column
  wins: number
  losses: number
  trades: number
  pnl: number
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const CELL_SIZE = 12
const CELL_GAP = 2

function buildMonthlyData(trades: Trade[], startDate: string, endDate: string): MonthData[] {
  // Group trades by exit date
  const dayMap = new Map<string, { wins: number; losses: number; pnl: number }>()

  for (const t of trades) {
    if (t.status !== "CLOSED" || !t.exitTime) continue
    const day = getISTDayKey(t.exitTime)
    const existing = dayMap.get(day) || { wins: 0, losses: 0, pnl: 0 }
    if (t.pnl > 0) existing.wins++
    else existing.losses++
    existing.pnl += t.pnl
    dayMap.set(day, existing)
  }

  // Build month grid
  const start = new Date(startDate)
  const end = new Date(endDate)
  start.setDate(1) // start from 1st of month

  const months: MonthData[] = []

  const cursor = new Date(start)
  while (cursor <= end) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const key = `${year}-${String(month + 1).padStart(2, "0")}`
    const label = `${MONTHS_SHORT[month]} ${String(year).slice(2)}`

    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days: DayData[] = []
    let monthPnl = 0

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d)
      if (dateObj > end) break

      const dateStr = getISTDayKey(dateObj)
      const dayOfWeek = dateObj.getDay() // 0=Sun
      const firstDayOfWeek = new Date(year, month, 1).getDay()
      const weekIndex = Math.floor((d - 1 + firstDayOfWeek) / 7)

      const dayData = dayMap.get(dateStr)
      const pnl = dayData?.pnl ?? 0
      monthPnl += pnl

      days.push({
        date: dateStr,
        dayOfWeek,
        weekIndex,
        wins: dayData?.wins ?? 0,
        losses: dayData?.losses ?? 0,
        trades: (dayData?.wins ?? 0) + (dayData?.losses ?? 0),
        pnl,
      })
    }

    months.push({ key, label, totalPnl: monthPnl, days })

    cursor.setMonth(cursor.getMonth() + 1)
    cursor.setDate(1)
  }

  return months
}

function DayCell({ day }: { day: DayData }) {
  const hasData = day.trades > 0
  const allWins = hasData && day.losses === 0
  const allLosses = hasData && day.wins === 0
  const mixed = hasData && day.wins > 0 && day.losses > 0

  return (
    <div
      className={cn(
        "rounded-[3px] transition-colors",
        !hasData && "bg-muted/40",
        allWins && "bg-profit/70",
        allLosses && "bg-loss/60",
        mixed && "bg-primary/50",
      )}
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        gridColumn: day.weekIndex + 1,
        gridRow: day.dayOfWeek + 1,
      }}
      title={hasData
        ? `${day.date}\n${day.trades} trades (${day.wins}W/${day.losses}L)\nPnL: $${day.pnl.toFixed(2)}`
        : `${day.date}\nNo trades`
      }
    />
  )
}

function MonthGrid({ month }: { month: MonthData }) {
  const maxWeek = month.days.length > 0
    ? Math.max(...month.days.map((d) => d.weekIndex)) + 1
    : 5

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Grid */}
      <div
        className="grid gap-[2px]"
        style={{
          gridTemplateColumns: `repeat(${maxWeek}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(7, ${CELL_SIZE}px)`,
        }}
      >
        {month.days.map((day) => (
          <DayCell key={day.date} day={day} />
        ))}
      </div>

      {/* Label */}
      <p className={cn(
        "text-[11px] font-medium",
        month.totalPnl > 0 ? "text-profit" : month.totalPnl < 0 ? "text-loss" : "text-muted-foreground"
      )}>
        {month.label}
      </p>

      {/* PnL */}
      <p className={cn(
        "text-[11px] font-semibold tabular-nums",
        month.totalPnl > 0 ? "text-profit" : month.totalPnl < 0 ? "text-loss" : "text-muted-foreground"
      )}>
        {month.totalPnl !== 0
          ? `${month.totalPnl > 0 ? "+" : ""}${month.totalPnl.toFixed(2)}`
          : "0.00"
        }
      </p>
    </div>
  )
}

export function MonthlyHeatmap({
  trades,
  startDate,
  endDate,
}: {
  trades: Trade[]
  startDate: string
  endDate: string
}) {
  const months = useMemo(() => buildMonthlyData(trades, startDate, endDate), [trades, startDate, endDate])

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Monthly Performance</CardTitle>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-[2px] bg-profit/70" />
              <span>Win</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-[2px] bg-loss/60" />
              <span>Loss</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-[2px] bg-primary/50" />
              <span>Mixed</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-[2px] bg-muted/40" />
              <span>No trade</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-5 overflow-x-auto py-2">
          {months.map((month) => (
            <MonthGrid key={month.key} month={month} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
