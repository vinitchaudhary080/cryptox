"use client";

/**
 * Admin-only. Opens a dialog to mark the current backtest run as "featured"
 * for a strategy + period (1Y / 2Y / 3Y). When marked, the run shows up on
 * the public strategy detail page. Only one featured run per
 * (strategy, coin, period) — saving again replaces the previous one.
 *
 * Also exposes a 'Push to Live' button for featured runs, which uploads the
 * run + trades to the production DB via the live-sync service. UI shows the
 * current sync state (Local only / Pushing / Synced / Error).
 */

import { useEffect, useState } from "react";
import {
  Star,
  StarOff,
  Loader2,
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
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
type LiveSyncStatus = "synced" | "pushing" | "error" | null;

export function FeatureRunButton({
  runId,
  coin,
  isFeatured,
  featuredStrategyId,
  periodLabel,
  liveSyncStatus,
  liveSyncAt,
  onChange,
}: {
  runId: string;
  coin: string;
  isFeatured: boolean;
  featuredStrategyId: string | null;
  periodLabel: PeriodLabel | null;
  liveSyncStatus: LiveSyncStatus;
  liveSyncAt: string | null;
  onChange: () => void;
}) {
  const [admin, setAdmin] = useState(false);
  const [liveSyncEnabled, setLiveSyncEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [strategies, setStrategies] = useState<StrategyOption[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodLabel>("1Y");
  const [submitting, setSubmitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backtestApi.adminCheck().then((res) => {
      if (res.success && res.data) {
        setAdmin((res.data as { isAdmin: boolean }).isAdmin);
      }
    });
  }, []);

  useEffect(() => {
    if (!admin) return;
    backtestApi.liveSyncConfig().then((res) => {
      if (res.success && res.data) {
        setLiveSyncEnabled((res.data as { enabled: boolean }).enabled);
      }
    });
  }, [admin]);

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

  const handlePushToLive = async () => {
    setPushing(true);
    setPushError(null);
    const res = await backtestApi.pushRunToLive(runId);
    setPushing(false);
    if (!res.success) {
      setPushError(res.error ?? "Push failed");
      onChange(); // refresh status (will be "error")
      return;
    }
    onChange();
  };

  // ─── Unfeatured state: just the "Feature" button ───
  if (!isFeatured) {
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
                This run will be shown on the strategy detail page as {coin} /{" "}
                {selectedPeriod}. It replaces any existing featured run for that
                slot.
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
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={handleFeature} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ─── Featured state: show Featured badge + Push to Live + Unfeature ───
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Featured / Unfeature */}
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

      {/* Live sync button — only if live sync is configured locally */}
      {liveSyncEnabled && (
        <Button
          variant="outline"
          size="sm"
          className={`gap-2 ${
            liveSyncStatus === "synced"
              ? "border-profit/40 bg-profit/5 text-profit hover:bg-profit/10"
              : liveSyncStatus === "error"
                ? "border-loss/40 bg-loss/5 text-loss hover:bg-loss/10"
                : ""
          }`}
          onClick={handlePushToLive}
          disabled={pushing || liveSyncStatus === "pushing"}
          title={
            liveSyncStatus === "synced" && liveSyncAt
              ? `Last synced ${new Date(liveSyncAt).toLocaleString()}`
              : undefined
          }
        >
          {pushing || liveSyncStatus === "pushing" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Pushing…
            </>
          ) : liveSyncStatus === "synced" ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Live synced — Re-push
            </>
          ) : liveSyncStatus === "error" ? (
            <>
              <AlertTriangle className="h-4 w-4" />
              Retry push
            </>
          ) : (
            <>
              <CloudUpload className="h-4 w-4" />
              Push to Live
            </>
          )}
        </Button>
      )}

      {pushError && (
        <p className="basis-full text-xs text-loss">Push error: {pushError}</p>
      )}
    </div>
  );
}
