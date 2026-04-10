"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const INDICATORS = [
  { value: "RSI", label: "RSI" },
  { value: "EMA", label: "EMA" },
  { value: "SMA", label: "SMA" },
  { value: "MACD", label: "MACD" },
  { value: "BB", label: "Bollinger Bands" },
  { value: "VWAP", label: "VWAP" },
  { value: "PRICE", label: "Price" },
]

const OPERATORS = [
  { value: "<", label: "<" },
  { value: ">", label: ">" },
  { value: "<=", label: "<=" },
  { value: ">=", label: ">=" },
  { value: "crosses_above", label: "Crosses Above" },
  { value: "crosses_below", label: "Crosses Below" },
]

const MACD_KEYS = [
  { value: "macd", label: "MACD Line" },
  { value: "signal", label: "Signal Line" },
  { value: "histogram", label: "Histogram" },
]

const BB_KEYS = [
  { value: "upper", label: "Upper Band" },
  { value: "middle", label: "Middle Band" },
  { value: "lower", label: "Lower Band" },
]

interface Condition {
  indicator: string
  period: number
  key?: string
  operator: string
  value: number
}

interface EntryRule {
  conditions: Condition[]
  action: "BUY" | "SELL"
  sl_percent: number
  tp_percent: number
  position_size_percent: number
  leverage: number
}

interface ExitRule {
  conditions: Condition[]
  close_side: "BUY" | "SELL" | "ALL"
}

function newCondition(): Condition {
  return { indicator: "RSI", period: 14, operator: "<", value: 30 }
}

function newEntryRule(): EntryRule {
  return {
    conditions: [newCondition()],
    action: "BUY",
    sl_percent: 2,
    tp_percent: 4,
    position_size_percent: 10,
    leverage: 1,
  }
}

function newExitRule(): ExitRule {
  return {
    conditions: [{ indicator: "RSI", period: 14, operator: ">", value: 50 }],
    close_side: "ALL",
  }
}

function needsKey(indicator: string) {
  return indicator === "MACD" || indicator === "BB"
}

function needsPeriod(indicator: string) {
  return !["VWAP", "PRICE"].includes(indicator)
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
}: {
  condition: Condition
  onChange: (c: Condition) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-28">
        <Select
          value={condition.indicator}
          onValueChange={(v) => v && onChange({ ...condition, indicator: v, key: undefined })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INDICATORS.map((i) => (
              <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsKey(condition.indicator) && (
        <div className="w-28">
          <Select
            value={condition.key ?? (condition.indicator === "MACD" ? "macd" : "middle")}
            onValueChange={(v) => v && onChange({ ...condition, key: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(condition.indicator === "MACD" ? MACD_KEYS : BB_KEYS).map((k) => (
                <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {needsPeriod(condition.indicator) && (
        <div className="w-16">
          <Input
            type="number"
            value={condition.period}
            onChange={(e) => onChange({ ...condition, period: Number(e.target.value) })}
            className="h-8 text-xs"
            placeholder="Period"
          />
        </div>
      )}

      <div className="w-28">
        <Select
          value={condition.operator}
          onValueChange={(v) => v && onChange({ ...condition, operator: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-20">
        <Input
          type="number"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: Number(e.target.value) })}
          className="h-8 text-xs"
          placeholder="Value"
        />
      </div>

      {canRemove && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  )
}

export function StrategyRuleBuilder({
  entryRules,
  exitRules,
  onEntryRulesChange,
  onExitRulesChange,
}: {
  entryRules: EntryRule[]
  exitRules: ExitRule[]
  onEntryRulesChange: (rules: EntryRule[]) => void
  onExitRulesChange: (rules: ExitRule[]) => void
}) {
  const updateEntryRule = (idx: number, rule: EntryRule) => {
    const updated = [...entryRules]
    updated[idx] = rule
    onEntryRulesChange(updated)
  }

  const updateExitRule = (idx: number, rule: ExitRule) => {
    const updated = [...exitRules]
    updated[idx] = rule
    onExitRulesChange(updated)
  }

  return (
    <div className="space-y-4">
      {/* Entry Rules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Entry Rules
          </Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onEntryRulesChange([...entryRules, newEntryRule()])}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Rule
          </Button>
        </div>

        {entryRules.map((rule, rIdx) => (
          <Card key={rIdx} className="border-border/30 bg-muted/20">
            <CardContent className="space-y-3 p-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  Rule {rIdx + 1}
                </Badge>
                <div className="flex items-center gap-2">
                  <Select
                    value={rule.action}
                    onValueChange={(v) => v && updateEntryRule(rIdx, { ...rule, action: v as "BUY" | "SELL" })}
                  >
                    <SelectTrigger className="h-7 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUY">BUY</SelectItem>
                      <SelectItem value="SELL">SELL</SelectItem>
                    </SelectContent>
                  </Select>
                  {entryRules.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onEntryRulesChange(entryRules.filter((_, i) => i !== rIdx))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-loss" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Conditions */}
              <div className="space-y-2">
                {rule.conditions.map((cond, cIdx) => (
                  <ConditionRow
                    key={cIdx}
                    condition={cond}
                    onChange={(c) => {
                      const conds = [...rule.conditions]
                      conds[cIdx] = c
                      updateEntryRule(rIdx, { ...rule, conditions: conds })
                    }}
                    onRemove={() => {
                      updateEntryRule(rIdx, {
                        ...rule,
                        conditions: rule.conditions.filter((_, i) => i !== cIdx),
                      })
                    }}
                    canRemove={rule.conditions.length > 1}
                  />
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-muted-foreground"
                  onClick={() =>
                    updateEntryRule(rIdx, {
                      ...rule,
                      conditions: [...rule.conditions, newCondition()],
                    })
                  }
                >
                  <Plus className="mr-1 h-3 w-3" />
                  AND condition
                </Button>
              </div>

              {/* Trade params */}
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">SL %</Label>
                  <Input
                    type="number"
                    value={rule.sl_percent}
                    onChange={(e) => updateEntryRule(rIdx, { ...rule, sl_percent: Number(e.target.value) })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">TP %</Label>
                  <Input
                    type="number"
                    value={rule.tp_percent}
                    onChange={(e) => updateEntryRule(rIdx, { ...rule, tp_percent: Number(e.target.value) })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Size %</Label>
                  <Input
                    type="number"
                    value={rule.position_size_percent}
                    onChange={(e) => updateEntryRule(rIdx, { ...rule, position_size_percent: Number(e.target.value) })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Leverage</Label>
                  <Input
                    type="number"
                    value={rule.leverage}
                    onChange={(e) => updateEntryRule(rIdx, { ...rule, leverage: Number(e.target.value) })}
                    className="h-7 text-xs"
                    min={1}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Exit Rules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Exit Rules
          </Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onExitRulesChange([...exitRules, newExitRule()])}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Exit Rule
          </Button>
        </div>

        {exitRules.map((rule, rIdx) => (
          <Card key={rIdx} className="border-border/30 bg-muted/20">
            <CardContent className="space-y-3 p-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  Exit {rIdx + 1}
                </Badge>
                <div className="flex items-center gap-2">
                  <Select
                    value={rule.close_side}
                    onValueChange={(v) => v && updateExitRule(rIdx, { ...rule, close_side: v as "BUY" | "SELL" | "ALL" })}
                  >
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Close All</SelectItem>
                      <SelectItem value="BUY">Close Longs</SelectItem>
                      <SelectItem value="SELL">Close Shorts</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onExitRulesChange(exitRules.filter((_, i) => i !== rIdx))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-loss" />
                  </Button>
                </div>
              </div>

              {rule.conditions.map((cond, cIdx) => (
                <ConditionRow
                  key={cIdx}
                  condition={cond}
                  onChange={(c) => {
                    const conds = [...rule.conditions]
                    conds[cIdx] = c
                    updateExitRule(rIdx, { ...rule, conditions: conds })
                  }}
                  onRemove={() => {
                    updateExitRule(rIdx, {
                      ...rule,
                      conditions: rule.conditions.filter((_, i) => i !== cIdx),
                    })
                  }}
                  canRemove={rule.conditions.length > 1}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
