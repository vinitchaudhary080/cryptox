"use client";

/**
 * Public 'View Backtest Report' page for a strategy. Shows pre-run featured
 * backtests for a strategy, grouped by coin × period. Reuses the same report
 * components as the user's own backtest detail page.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TradingLoader } from "@/components/ui/trading-loader";
import { BacktestSummaryCards } from "@/components/backtest/backtest-summary-cards";
import { EquityCurveChart } from "@/components/backtest/equity-curve-chart";
import { CumulativePnlChart } from "@/components/backtest/cumulative-pnl-chart";
import { DrawdownChart } from "@/components/backtest/drawdown-chart";
import { PnlChart } from "@/components/backtest/pnl-chart";
import { MonthlyHeatmap } from "@/components/backtest/monthly-heatmap";
import { TopTradesTable } from "@/components/backtest/top-trades-table";
import { TradeLogTable } from "@/components/backtest/trade-log-table";
import { strategyApi } from "@/lib/api";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};

const COINS = ["BTC", "ETH"] as const;
type Coin = (typeof COINS)[number];
const PERIODS = ["1Y", "2Y", "3Y"] as const;
type Period = (typeof PERIODS)[number];

type TopTrade = {
  entry_time: number;
  exit_time: number;
  side: string;
  entry_price: number;
  exit_price: number;
  pnl: number;
  exit_reason: string;
};

type ExtendedMetrics = {
  largestWinTrades?: TopTrade[];
  largestLossTrades?: TopTrade[];
  drawdownCurve?: { time: number; drawdownPct: number }[];
  cumulativePnlCurve?: { time: number; pnl: number }[];
  mddRecoveryDays?: number;
  avgDaysWinning?: number;
  avgDaysLosing?: number;
  peakEquity?: number;
  lowestEquity?: number;
  maxDrawdownPercent?: number;
};

type FeaturedRun = {
  id: string;
  coin: string;
  periodLabel: Period;
  startDate: string;
  endDate: string;
  strategyName: string;
  strategyConfig: Record<string, unknown>;
  initialCapital: number;
  finalEquity: number;
  totalPnl: number;
  grossPnl?: number;
  totalFees?: number;
  makerFee?: number;
  slippage?: number;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  equityCurve: { time: number; equity: number }[];
  extendedMetrics?: ExtendedMetrics | null;
  status: string;
  duration: number | null;
  createdAt: string;
};

type Trade = {
  id: string;
  entryTime: string;
  entryPrice: number;
  qty: number;
  side: string;
  leverage: number;
  sl: number | null;
  tp: number | null;
  exitTime: string | null;
  exitPrice: number | null;
  pnl: number;
  fee: number;
  exitReason: string | null;
  status: string;
};

type StrategyMeta = {
  id: string;
  name: string;
  description: string;
  category: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
};

const riskColors: Record<string, string> = {
  LOW: "border-profit/30 text-profit bg-profit/5",
  MEDIUM: "border-warning/30 text-warning bg-warning/5",
  HIGH: "border-loss/30 text-loss bg-loss/5",
};

export default function StrategyBacktestReportPage() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params.id as string;

  const [strategy, setStrategy] = useState<StrategyMeta | null>(null);
  const [runs, setRuns] = useState<FeaturedRun[]>([]);
  const [coin, setCoin] = useState<Coin>("BTC");
  const [period, setPeriod] = useState<Period>("1Y");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingTrades, setLoadingTrades] = useState(false);

  // Fetch strategy meta + all featured runs once
  useEffect(() => {
    (async () => {
      const [metaRes, runsRes] = await Promise.all([
        strategyApi.get(strategyId),
        strategyApi.getFeaturedBacktests(strategyId),
      ]);
      if (metaRes.success && metaRes.data) {
        setStrategy(metaRes.data as StrategyMeta);
      }
      if (runsRes.success && runsRes.data) {
        setRuns(runsRes.data as FeaturedRun[]);
      }
      setLoadingMeta(false);
    })();
  }, [strategyId]);

  const selectedRun = useMemo(
    () => runs.find((r) => r.coin === coin && r.periodLabel === period) ?? null,
    [runs, coin, period],
  );

  // Whenever the slot changes, refetch trades for that featured run
  const loadTrades = useCallback(
    async (runId: string) => {
      setLoadingTrades(true);
      const res = await strategyApi.getFeaturedBacktestTrades(strategyId, runId);
      if (res.success && res.data) {
        setTrades((res.data as { trades: Trade[] }).trades);
      } else {
        setTrades([]);
      }
      setLoadingTrades(false);
    },
    [strategyId],
  );

  useEffect(() => {
    if (selectedRun) {
      loadTrades(selectedRun.id);
    } else {
      setTrades([]);
    }
  }, [selectedRun, loadTrades]);

  // Which slots are actually available? Used to grey out missing tabs.
  const availableSlots = useMemo(() => {
    const set = new Set<string>();
    for (const r of runs) set.add(`${r.coin}::${r.periodLabel}`);
    return set;
  }, [runs]);

  // Auto-pick the first available slot if the current one has no data
  useEffect(() => {
    if (runs.length === 0) return;
    if (availableSlots.has(`${coin}::${period}`)) return;
    const first = runs[0];
    setCoin(first.coin as Coin);
    setPeriod(first.periodLabel);
  }, [runs, availableSlots, coin, period]);

  if (loadingMeta) {
    return <TradingLoader message="Loading backtest report..." />;
  }

  if (!strategy) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-muted-foreground">Strategy not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push("/strategies")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Strategies
        </Button>
      </div>
    );
  }

  const ext = selectedRun?.extendedMetrics ?? {};

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="mx-auto max-w-7xl space-y-6 p-4 md:p-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => router.push("/strategies")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">{strategy.name}</h1>
            <Badge variant="outline" className={riskColors[strategy.riskLevel]}>
              {strategy.riskLevel.toLowerCase()} risk
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {strategy.category}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {strategy.description}
          </p>
        </div>
      </motion.div>

      {/* Disclaimer */}
      <motion.div variants={fadeUp}>
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="space-y-0.5 text-xs">
              <p className="font-semibold text-warning">Past performance disclaimer</p>
              <p className="text-muted-foreground">
                These reports are historical backtests on real market data. Past
                performance does not guarantee future returns. Live results will
                differ due to fees, slippage, and market conditions. Deploy at
                your own risk.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Coin + Period tabs */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
          {COINS.map((c) => {
            const hasAny = PERIODS.some((p) => availableSlots.has(`${c}::${p}`));
            return (
              <button
                key={c}
                onClick={() => setCoin(c)}
                disabled={!hasAny}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  coin === c
                    ? "bg-primary text-primary-foreground"
                    : hasAny
                      ? "text-muted-foreground hover:text-foreground"
                      : "cursor-not-allowed text-muted-foreground/40"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
          {PERIODS.map((p) => {
            const has = availableSlots.has(`${coin}::${p}`);
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                disabled={!has}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : has
                      ? "text-muted-foreground hover:text-foreground"
                      : "cursor-not-allowed text-muted-foreground/40"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {selectedRun && (
          <div className="text-xs text-muted-foreground">
            {new Date(selectedRun.startDate).toLocaleDateString()} →{" "}
            {new Date(selectedRun.endDate).toLocaleDateString()} · Capital $
            {selectedRun.initialCapital.toLocaleString()}
          </div>
        )}
      </motion.div>

      {/* Report body */}
      {!selectedRun ? (
        <motion.div variants={fadeUp}>
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Info className="mb-3 h-10 w-10 text-muted-foreground/20" />
              <p className="text-sm font-medium text-muted-foreground">
                No backtest available for {coin} · {period} yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Try a different coin or period above.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          <motion.div variants={fadeUp}>
            <BacktestSummaryCards run={selectedRun} extendedMetrics={ext} />
          </motion.div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <motion.div variants={fadeUp}>
              <EquityCurveChart
                data={selectedRun.equityCurve}
                initialCapital={selectedRun.initialCapital}
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <CumulativePnlChart data={ext.cumulativePnlCurve ?? []} />
            </motion.div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <motion.div variants={fadeUp}>
              <PnlChart trades={trades.slice(0, 50)} />
            </motion.div>
            <motion.div variants={fadeUp}>
              <DrawdownChart data={ext.drawdownCurve ?? []} />
            </motion.div>
          </div>

          <motion.div variants={fadeUp}>
            <TopTradesTable
              wins={ext.largestWinTrades ?? []}
              losses={ext.largestLossTrades ?? []}
            />
          </motion.div>

          <motion.div variants={fadeUp}>
            <MonthlyHeatmap
              trades={trades}
              startDate={selectedRun.startDate}
              endDate={selectedRun.endDate}
            />
          </motion.div>

          <motion.div variants={fadeUp}>
            <TradeLogTable
              trades={trades}
              total={trades.length}
              page={1}
              limit={trades.length || 1}
              onPageChange={() => {}}
              allTrades={trades}
            />
          </motion.div>

          {loadingTrades && (
            <p className="text-center text-xs text-muted-foreground">
              Loading trades...
            </p>
          )}
        </>
      )}
    </motion.div>
  );
}
