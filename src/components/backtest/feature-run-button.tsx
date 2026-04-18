"use client";

/**
 * Admin-only. Opens a dialog to mark the current backtest run as "featured"
 * for a strategy + period (1Y / 2Y / 3Y). When marked, the run shows up on
 * the public strategy detail page. Only one featured run per
 * (strategy, coin, period) — saving again replaces the previous one.
 */

import { useEffect, useState } from "react";
import { Star, StarOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { backtestApi, strategyApi } from "@/lib/api";

type StrategyOption = { id: string; name: string };
type PeriodLabel = "1Y" | "2Y" | "3Y";

export function FeatureRunButton({
  runId,
  coin,
  isFeatured,
  featuredStrategyId,
  periodLabel,
  onChange,
}: {
  runId: string;
  coin: string;
  isFeatured: boolean;
  featuredStrategyId: string | null;
  periodLabel: PeriodLabel | null;
  onChange: () => void;
}) {
  const [admin, setAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [strategies, setStrategies] = useState<StrategyOption[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodLabel>("1Y");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backtestApi.adminCheck().then((res) => {
      if (res.success && res.data) {
        setAdmin((res.data as { isAdmin: boolean }).isAdmin);
      }
    });
  }, []);

  useEffect(() => {
    if (!open || strategies.length > 0) return;
    strategyApi.list().then((res) => {
      if (res.success && res.data) {
        setStrategies(
          (res.data as StrategyOption[]).map((s) => ({ id: s.id, name: s.name })),
        );
      }
    });
  }, [open, strategies.length]);

  useEffect(() => {
    if (!open) return;
    // Prefill with current featuring if present
    if (featuredStrategyId) setSelectedStrategy(featuredStrategyId);
    if (periodLabel) setSelectedPeriod(periodLabel);
  }, [open, featuredStrategyId, periodLabel]);

  if (!admin) return null;

  const handleFeature = async () => {
    if (!selectedStrategy) {
      setError("Pick a strategy");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await backtestApi.featureRun(runId, selectedStrategy, selectedPeriod);
    setSubmitting(false);
    if (!res.success) {
      setError(res.error ?? "Failed to feature run");
      return;
    }
    setOpen(false);
    onChange();
  };

  const handleUnfeature = async () => {
    setSubmitting(true);
    setError(null);
    const res = await backtestApi.unfeatureRun(runId);
    setSubmitting(false);
    if (!res.success) {
      setError(res.error ?? "Failed to unfeature run");
      return;
    }
    onChange();
  };

  if (isFeatured) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 border-warning/40 bg-warning/5 text-warning hover:bg-warning/10"
        onClick={handleUnfeature}
        disabled={submitting}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <StarOff className="h-4 w-4" />
        )}
        Featured ({coin} · {periodLabel}) — Unfeature
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <Star className="h-4 w-4" />
        Feature this run
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Feature backtest run</DialogTitle>
            <DialogDescription>
              This run will be shown publicly on the strategy detail page as {coin}{" "}
              / {selectedPeriod}. It will replace any existing featured run for
              that slot.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Strategy
              </label>
              <Select
                value={selectedStrategy}
                onValueChange={(v) => setSelectedStrategy(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a strategy" />
                </SelectTrigger>
                <SelectContent>
                  {strategies.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Period
              </label>
              <Select
                value={selectedPeriod}
                onValueChange={(v) => {
                  if (v) setSelectedPeriod(v as PeriodLabel);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1Y">1 Year</SelectItem>
                  <SelectItem value="2Y">2 Years</SelectItem>
                  <SelectItem value="3Y">3 Years</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-xs text-loss">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleFeature} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
