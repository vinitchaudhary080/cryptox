import type {
  Candle,
  BacktestConfig,
  BacktestResult,
  BacktestStrategy,
  EquityPoint,
  IndicatorValues,
  Signal,
  UIStrategyConfig,
} from "../types.js";
import { loadCandles } from "../data/csv-manager.js";
import { computeIndicators } from "../indicators/index.js";
import { PositionManager, MIN_MARGIN_USD } from "./position-manager.js";
import { computeMetrics } from "./metrics.js";
import { getStrategyByName } from "../strategies/strategy-runner.js";
import { resetMeriStrategyCache, precomputeMeriStrategy } from "../strategies/builtin/meri-strategy.js";
import { resetMeriV2StrategyCache, precomputeMeriV2Strategy } from "../strategies/builtin/meri-strategy-v2.js";
import { resetSupertrendStrategyCache, precomputeSupertrendStrategy } from "../strategies/builtin/supertrend-strategy.js";
import { resetCPRCache, precomputeCPRLevels } from "../strategies/builtin/cpr-pivot-strategy.js";
import { resetGannStrategyCache, precomputeGannStrategy } from "../strategies/builtin/gann-matrix-momentum.js";
import { resetGannV2StrategyCache, precomputeGannV2Strategy } from "../strategies/builtin/gann-matrix-momentum-v2.js";
import { resetSRBreakoutCache, precomputeSRBreakout } from "../strategies/builtin/sr-breakout.js";
import { resetSRBreakoutV2Cache, precomputeSRBreakoutV2 } from "../strategies/builtin/sr-breakout-v2.js";
import { resetMacdSwingCache, precomputeMacdSwing } from "../strategies/builtin/macd-swing.js";
import { resetWeeklyMomentumCache, precomputeWeeklyMomentum } from "../strategies/builtin/weekly-momentum.js";
import {
  resetTrendlineBreakoutAdaptiveCache,
  precomputeTrendlineBreakoutAdaptive,
} from "../strategies/builtin/trendline-breakout-adaptive.js";
import {
  resetCprHaVolMomentumV1Cache,
  precomputeCprHaVolMomentumV1,
} from "../strategies/builtin/cpr-ha-volatility-momentum-v1.js";
import {
  resetCprVolPowerTrendV2Cache,
  precomputeCprVolPowerTrendV2,
} from "../strategies/builtin/cpr-volatility-power-trend-v2.js";
import {
  resetEthHybridRenkoAvwapCache,
  precomputeEthHybridRenkoAvwap,
} from "../strategies/builtin/eth-hybrid-renko-avwap.js";
import {
  resetEthHybridRenkoAvwapV2Cache,
  precomputeEthHybridRenkoAvwapV2,
} from "../strategies/builtin/eth-hybrid-renko-avwap-v2.js";
import {
  resetM15TrendPivotCache,
  precomputeM15TrendPivot,
} from "../strategies/builtin/m15-trend-pivot.js";
import {
  resetIchimokuRenkoTrendCache,
  precomputeIchimokuRenkoTrend,
} from "../strategies/builtin/ichimoku-renko-trend.js";
import {
  resetIchimokuRenkoTrendV2Cache,
  precomputeIchimokuRenkoTrendV2,
} from "../strategies/builtin/ichimoku-renko-trend-v2.js";
import {
  resetPdhPdlReversionBreakoutCache,
  precomputePdhPdlReversionBreakout,
} from "../strategies/builtin/pdh-pdl-reversion-breakout.js";
import {
  resetAsianSweepReversalCache,
  precomputeAsianSweepReversal,
} from "../strategies/builtin/asian-sweep-reversal.js";
import {
  resetAvwapSigmaReversionCache,
  precomputeAvwapSigmaReversion,
} from "../strategies/builtin/avwap-sigma-reversion.js";
import {
  resetFundingSqueezeReversalCache,
  precomputeFundingSqueezeReversal,
} from "../strategies/builtin/funding-squeeze-reversal.js";
import {
  resetTtmSqueezeRegimeCache,
  precomputeTtmSqueezeRegime,
} from "../strategies/builtin/ttm-squeeze-regime.js";
import {
  resetSupertrend5mFastCache,
  precomputeSupertrend5mFast,
} from "../strategies/builtin/supertrend-5m-fast.js";
import {
  resetSupertrend1hSwingCache,
  precomputeSupertrend1hSwing,
} from "../strategies/builtin/supertrend-1h-swing.js";
// Research-generated specialist candidates — Phase 2 imports
import { resetDonchianBreakoutRegime1hCache, precomputeDonchianBreakoutRegime1h } from "../strategies/builtin/01-donchian-breakout-regime-1h.js";
import { resetEmaStackMomentum15mCache, precomputeEmaStackMomentum15m } from "../strategies/builtin/01-ema-stack-momentum-15m.js";
import { resetHtfMomentumPullback1hCache, precomputeHtfMomentumPullback1h } from "../strategies/builtin/01-htf-momentum-pullback-1h.js";
import { resetBollingerFadeRegimeCache, precomputeBollingerFadeRegime } from "../strategies/builtin/02-bollinger-fade-regime-gated.js";
import { resetConnorsRsi2HtfTrendCache, precomputeConnorsRsi2HtfTrend } from "../strategies/builtin/02-connors-rsi2-htf-trend.js";
import { resetRsiDivergencePullbackCache, precomputeRsiDivergencePullback } from "../strategies/builtin/02-rsi-divergence-pullback.js";
import { resetAbcdHarmonicRsiConfluenceCache, precomputeAbcdHarmonicRsiConfluence } from "../strategies/builtin/03-abcd-harmonic-rsi-confluence.js";
import { resetInsideBarBreakoutHtfTrendCache, precomputeInsideBarBreakoutHtfTrend } from "../strategies/builtin/03-inside-bar-breakout-htf-trend.js";
import { resetPdhPdlLiquiditySweepMssCache, precomputePdhPdlLiquiditySweepMss } from "../strategies/builtin/03-pdh-pdl-liquidity-sweep-mss.js";
import { resetEngulfingHtfSrReversalCache, precomputeEngulfingHtfSrReversal } from "../strategies/builtin/04-engulfing-htf-sr-reversal.js";
import { resetPinbarRsiExtremeReversalCache, precomputePinbarRsiExtremeReversal } from "../strategies/builtin/04-pinbar-rsi-extreme-reversal.js";
import { resetCvdDivergenceReversalCache, precomputeCvdDivergenceReversal } from "../strategies/builtin/05-cvd-divergence-reversal.js";
import { resetVolumeProfilePocReversionCache, precomputeVolumeProfilePocReversion } from "../strategies/builtin/05-volume-profile-poc-reversion.js";
import { resetWyckoffAccumulationBreakoutCache, precomputeWyckoffAccumulationBreakout } from "../strategies/builtin/05-wyckoff-accumulation-breakout.js";
import { resetVariancePremiumSpikeFadeCache, precomputeVariancePremiumSpikeFade } from "../strategies/builtin/06-variance-premium-spike-fade-1h.js";
import { resetVolOfVolBreakoutCache, precomputeVolOfVolBreakout } from "../strategies/builtin/06-vol-of-vol-breakout-15m.js";
import { resetVolRichBandFadeCache, precomputeVolRichBandFade } from "../strategies/builtin/06-vol-rich-band-fade-1h.js";
import { resetHurstRegimeSwitch1hCache, precomputeHurstRegimeSwitch1h } from "../strategies/builtin/07-hurst-regime-switch-1h.js";
import { resetKamaAdaptiveTrend15mCache, precomputeKamaAdaptiveTrend15m } from "../strategies/builtin/07-kama-adaptive-trend-15m.js";
import { resetZScoreMeanReversion1hCache, precomputeZScoreMeanReversion1h } from "../strategies/builtin/07-zscore-mean-reversion-1h.js";
import { resetDrawdownThrottleCircuitBreakerCache, precomputeDrawdownThrottleCircuitBreaker } from "../strategies/builtin/08-drawdown-throttle-circuit-breaker.js";
import { resetVolatilityAdaptiveSupertrendRMultipleCache, precomputeVolatilityAdaptiveSupertrendRMultiple } from "../strategies/builtin/08-volatility-adaptive-supertrend-r-multiple.js";
import { resetFundingCarryTrendCache, precomputeFundingCarryTrend } from "../strategies/builtin/12-funding-carry-trend.js";
import { resetOiDivergenceReversalCache, precomputeOiDivergenceReversal } from "../strategies/builtin/12-oi-divergence-reversal.js";
import { resetPdhPdlSweepReversalCache, precomputePdhPdlSweepReversal } from "../strategies/builtin/12-pdh-pdl-sweep-reversal.js";
// v2: research pipeline iteration 2 imports
import { resetCompressionBreakoutDonchian1hCache, precomputeCompressionBreakoutDonchian1h } from "../strategies/builtin/01-v2-compression-breakout-donchian-1h.js";
import { resetTrendZScorePullback1hCache, precomputeTrendZScorePullback1h } from "../strategies/builtin/01-v2-trend-zscore-pullback-1h.js";
import { resetConnorsRsi2AdaptiveRunnerCache, precomputeConnorsRsi2AdaptiveRunner } from "../strategies/builtin/02-v2-connors-rsi2-adaptive-runner.js";
import { resetStochRsiZscoreMrCache, precomputeStochRsiZscoreMr } from "../strategies/builtin/02-v2-stochrsi-zscore-mr.js";
import { resetPinbarMultidayExtremeVolumeCache, precomputePinbarMultidayExtremeVolume } from "../strategies/builtin/03-v2-pinbar-multiday-extreme-volume.js";
import { resetRangeExpansionBBWidthBreakoutCache, precomputeRangeExpansionBBWidthBreakout } from "../strategies/builtin/03-v2-range-expansion-bbwidth-breakout.js";
import { resetEngulfing1hNySessionHtfMaCache, precomputeEngulfing1hNySessionHtfMa } from "../strategies/builtin/04-v2-engulfing-1h-ny-session-htf-ma.js";
import { resetHammer1hBbTrendPullbackCache, precomputeHammer1hBbTrendPullback } from "../strategies/builtin/04-v2-hammer-1h-bb-trend-pullback.js";
import { resetCvdDivergenceCoinTuned1hCache, precomputeCvdDivergenceCoinTuned1h } from "../strategies/builtin/05-v2-cvd-divergence-coin-tuned-1h.js";
import { resetVwapBandAbsorption1hCache, precomputeVwapBandAbsorption1h } from "../strategies/builtin/05-v2-vwap-band-absorption-1h.js";
import { resetAtrPercentileExpansionBreakout1hCache, precomputeAtrPercentileExpansionBreakout1h } from "../strategies/builtin/06-v2-atr-percentile-expansion-breakout-1h.js";
import { resetVariancePremiumFadeLoosened1hCache, precomputeVariancePremiumFadeLoosened1h } from "../strategies/builtin/06-v2-variance-premium-fade-loosened-1h.js";
import { resetHmaZScoreMeanReversion1hCache, precomputeHmaZScoreMeanReversion1h } from "../strategies/builtin/07-v2-hma-zscore-mean-reversion-1h.js";
import { resetRsiZScoreMeanReversion1hCache, precomputeRsiZScoreMeanReversion1h } from "../strategies/builtin/07-v2-rsi-zscore-mean-reversion-1h.js";
import { resetZScoreMrFundingFilter1hCache, precomputeZScoreMrFundingFilter1h } from "../strategies/builtin/07-v2-zscore-mr-funding-filter-1h.js";
import { resetAsymmetricKellySizedTrendCache, precomputeAsymmetricKellySizedTrend } from "../strategies/builtin/08-v2-asymmetric-kelly-sized-trend.js";
import { resetPyramidAddTrendCache, precomputePyramidAddTrend } from "../strategies/builtin/08-v2-pyramid-add-trend.js";
import { resetNegativeFundingCarryLongCache, precomputeNegativeFundingCarryLong } from "../strategies/builtin/12-v2-negative-funding-carry-long.js";
import { resetOiPeakExhaustionShortCache, precomputeOiPeakExhaustionShort } from "../strategies/builtin/12-v2-oi-peak-exhaustion-short.js";
import { resetAdaptiveVolThrottleZscore1hCache, precomputeAdaptiveVolThrottleZscore1h } from "../strategies/builtin/99-meta-adaptive-vol-throttle-zscore-1h.js";
import { resetVolTermStructureDispersionMr1hCache, precomputeVolTermStructureDispersionMr1h } from "../strategies/builtin/99-meta-vol-term-structure-dispersion-mr-1h.js";
import { resetZScoreEnsembleConsensus1hCache, precomputeZScoreEnsembleConsensus1h } from "../strategies/builtin/99-meta-zscore-ensemble-consensus-1h.js";
// v3: research pipeline iteration 3 (21 strategies)
import { resetV3DonchianBreakoutRegimeStrictCache, precomputeV3DonchianBreakoutRegimeStrict } from "../strategies/builtin/01-v3-donchian-breakout-regime-strict.js";
import { resetV3EmaStackMomentumRegimeCache, precomputeV3EmaStackMomentumRegime } from "../strategies/builtin/01-v3-ema-stack-momentum-regime.js";
import { resetV3HtfPullbackConfluenceCache, precomputeV3HtfPullbackConfluence } from "../strategies/builtin/01-v3-htf-pullback-confluence.js";
import { resetConnorsRsi2AggressiveTpCache, precomputeConnorsRsi2AggressiveTp } from "../strategies/builtin/02-v3-connors-rsi2-aggressive-tp.js";
import { resetConnorsRsi2CoinTunedCache, precomputeConnorsRsi2CoinTuned } from "../strategies/builtin/02-v3-connors-rsi2-coin-tuned.js";
import { resetConnorsRsi2MultiTfConfluenceCache, precomputeConnorsRsi2MultiTfConfluence } from "../strategies/builtin/02-v3-connors-rsi2-multi-tf-confluence.js";
import { resetConnorsRsi2StrongTrendCache, precomputeConnorsRsi2StrongTrend } from "../strategies/builtin/02-v3-connors-rsi2-strong-trend.js";
import { resetVwapAbsorptionCoinTunedCache, precomputeVwapAbsorptionCoinTuned } from "../strategies/builtin/05-v3-vwap-absorption-coin-tuned.js";
import { resetVwapAbsorptionLongOnlyUptrendCache, precomputeVwapAbsorptionLongOnlyUptrend } from "../strategies/builtin/05-v3-vwap-absorption-long-only-uptrend.js";
import { resetVwapAbsorptionTrendAwareCache, precomputeVwapAbsorptionTrendAware } from "../strategies/builtin/05-v3-vwap-absorption-trend-aware.js";
import { resetVwapAbsorptionVolumeConfirmCache, precomputeVwapAbsorptionVolumeConfirm } from "../strategies/builtin/05-v3-vwap-absorption-volume-confirm.js";
import { resetV3AtrExpansionRegimeGatedCache, precomputeV3AtrExpansionRegimeGated } from "../strategies/builtin/06-v3-atr-expansion-regime-gated.js";
import { resetZScoreMrBtcTuned1hCache, precomputeZScoreMrBtcTuned1h } from "../strategies/builtin/07-v3-zscore-mr-btc-tuned-1h.js";
import { resetZScoreMrFundingExtremeCache, precomputeZScoreMrFundingExtreme } from "../strategies/builtin/07-v3-zscore-mr-funding-extreme.js";
import { resetZScoreMrFundingLooseCache, precomputeZScoreMrFundingLoose } from "../strategies/builtin/07-v3-zscore-mr-funding-loose.js";
import { resetZScoreMrFundingMulticoinCache, precomputeZScoreMrFundingMulticoin } from "../strategies/builtin/07-v3-zscore-mr-funding-multicoin.js";
import { resetZScoreMrFundingProxyCache, precomputeZScoreMrFundingProxy } from "../strategies/builtin/07-v3-zscore-mr-funding-proxy.js";
import { resetZScoreMrLoose1hCache, precomputeZScoreMrLoose1h } from "../strategies/builtin/07-v3-zscore-mr-loose-1h.js";
import { resetZScoreMrSlopeGated1hCache, precomputeZScoreMrSlopeGated1h } from "../strategies/builtin/07-v3-zscore-mr-slope-gated-1h.js";
import { resetZScoreMrSlowAnchor1hCache, precomputeZScoreMrSlowAnchor1h } from "../strategies/builtin/07-v3-zscore-mr-slow-anchor-1h.js";
import { resetZScoreMrTight1hCache, precomputeZScoreMrTight1h } from "../strategies/builtin/07-v3-zscore-mr-tight-1h.js";
// v4-iter1 strategies removed 2026-05-20 (lookahead-bias bug — see memory.md #16).
// v4-iter2 + v4-iter3 attempts removed 2026-05-20 (all losers in honest backtest)
// v5 + v6 all removed 2026-05-20 — see memory.md anti-patterns #17-21.
// v7 ensemble removed — window-overfit. See memory.md #22.
// v8 — P&F catapult breakout (Du Plessis Ch. 7 mechanic)
import { resetPnfCatapult1hCache, precomputePnfCatapult1h } from "../strategies/builtin/v8-pnf-catapult-breakout-1h.js";
// LOW-TF conversions of 1H winners (5 strategies × 2 TFs = 10 variants)
import { resetZScoreMrSlopeGated15mCache, precomputeZScoreMrSlopeGated15m } from "../strategies/builtin/07-v3-zscore-mr-slope-gated-15m.js";
import { resetZScoreMrSlopeGated5mCache, precomputeZScoreMrSlopeGated5m } from "../strategies/builtin/07-v3-zscore-mr-slope-gated-5m.js";
import { resetZScoreMeanReversion15mCache, precomputeZScoreMeanReversion15m } from "../strategies/builtin/07-zscore-mean-reversion-15m.js";
import { resetZScoreMeanReversion5mCache, precomputeZScoreMeanReversion5m } from "../strategies/builtin/07-zscore-mean-reversion-5m.js";
import { resetSupertrendSwing15mCache, precomputeSupertrendSwing15m } from "../strategies/builtin/supertrend-swing-15m.js";
import { resetSupertrendSwing5mCache, precomputeSupertrendSwing5m } from "../strategies/builtin/supertrend-swing-5m.js";
import { resetChopTrendTransition15mCache, precomputeChopTrendTransition15m } from "../strategies/builtin/v7-chop-trend-transition-15m.js";
import { resetChopTrendTransition5mCache, precomputeChopTrendTransition5m } from "../strategies/builtin/v7-chop-trend-transition-5m.js";
import { resetV3HtfPullbackConfluence15mCache, precomputeV3HtfPullbackConfluence15m } from "../strategies/builtin/01-v3-htf-pullback-confluence-15m.js";
import { resetV3HtfPullbackConfluence5mCache, precomputeV3HtfPullbackConfluence5m } from "../strategies/builtin/01-v3-htf-pullback-confluence-5m.js";
// v7 — 18 new candidates from 9-specialist swarm (all 30-200 trades/yr/coin by design)
import { resetMacdHistcrossTrend15mCache, precomputeMacdHistcrossTrend15m } from "../strategies/builtin/v7-macd-histcross-trend-15m.js";
import { resetTripleScreenElder15mCache, precomputeTripleScreenElder15m } from "../strategies/builtin/v7-triple-screen-elder-15m.js";
import { resetStochCrossTrend15mCache, resetStochCrossTrend15mState, precomputeStochCrossTrend15m } from "../strategies/builtin/v7-stoch-cross-trend-15m.js";
import { resetWilliamsRRecovery15mCache, precomputeWilliamsRRecovery15m } from "../strategies/builtin/v7-williams-r-recovery-15m.js";
import { resetDoubleBottomPivot1hCache, resetDoubleBottomPivot1hState, precomputeDoubleBottomPivot1h } from "../strategies/builtin/v7-double-bottom-pivot-1h.js";
import { resetFailedRangeFade15mCache, resetFailedRangeFade15mState, precomputeFailedRangeFade15m } from "../strategies/builtin/v7-failed-range-fade-15m.js";
import { resetThreeSoldiersContinuation15mCache, resetThreeSoldiersContinuation15mState, precomputeThreeSoldiersContinuation15m } from "../strategies/builtin/v7-three-soldiers-continuation-15m.js";
import { resetHammerHtfSupport1hCache, precomputeHammerHtfSupport1h } from "../strategies/builtin/v7-hammer-htf-support-1h.js";
import { resetObvDivergence1hCache, resetObvDivergence1hRuntimeState, precomputeObvDivergence1h } from "../strategies/builtin/v7-obv-divergence-1h.js";
import { resetDeltaMomentumTrend15mCache, resetDeltaMomentumTrend15mRuntimeState, precomputeDeltaMomentumTrend15m } from "../strategies/builtin/v7-delta-momentum-trend-15m.js";
import { resetDonchianWidthExpansion15mCache, precomputeDonchianWidthExpansion15m } from "../strategies/builtin/v7-donchian-width-expansion-15m.js";
import { resetChopTrendTransition1hCache, precomputeChopTrendTransition1h } from "../strategies/builtin/v7-chop-trend-transition-1h.js";
import { resetLrSlopeCross15mCache, precomputeLrSlopeCross15m } from "../strategies/builtin/v7-lr-slope-cross-15m.js";
import { resetTsiCrossoverTrend1hCache, precomputeTsiCrossoverTrend1h } from "../strategies/builtin/v7-tsi-crossover-trend-1h.js";
import { resetChandelierFlip1hCache, precomputeChandelierFlip1h } from "../strategies/builtin/v7-chandelier-flip-1h.js";
import { resetVolThrottleSupertrend15mCache, precomputeVolThrottleSupertrend15m } from "../strategies/builtin/v7-vol-throttle-supertrend-15m.js";
import { resetFundingFlipTrend15mCache, resetFundingFlipTrend15mState, resetFundingFlipTrend15mRing, precomputeFundingFlipTrend15m } from "../strategies/builtin/v7-funding-flip-trend-15m.js";
import { resetOiSurgeTrap1hCache, precomputeOiSurgeTrap1h } from "../strategies/builtin/v7-oi-surge-trap-1h.js";
import { evaluateUIRules } from "../strategies/strategy-runner.js";

const EQUITY_SAMPLE_INTERVAL = 60; // sample equity every 60 candles (1 hour)

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  // Reset multi-timeframe caches
  resetMeriStrategyCache();
  resetMeriV2StrategyCache();
  resetSupertrendStrategyCache();
  resetCPRCache();
  resetGannStrategyCache();
  resetGannV2StrategyCache();
  resetSRBreakoutCache();
  resetSRBreakoutV2Cache();
  resetMacdSwingCache();
  resetWeeklyMomentumCache();
  resetTrendlineBreakoutAdaptiveCache();
  resetCprHaVolMomentumV1Cache();
  resetCprVolPowerTrendV2Cache();
  resetEthHybridRenkoAvwapCache();
  resetEthHybridRenkoAvwapV2Cache();
  resetIchimokuRenkoTrendCache();
  resetIchimokuRenkoTrendV2Cache();
  resetM15TrendPivotCache();
  resetPdhPdlReversionBreakoutCache();
  resetAsianSweepReversalCache();
  resetAvwapSigmaReversionCache();
  resetFundingSqueezeReversalCache();
  resetTtmSqueezeRegimeCache();
  resetSupertrend5mFastCache();
  resetSupertrend1hSwingCache();
  // Research-generated specialist candidates — 25 reset hooks
  resetDonchianBreakoutRegime1hCache();
  resetEmaStackMomentum15mCache();
  resetHtfMomentumPullback1hCache();
  resetBollingerFadeRegimeCache();
  resetConnorsRsi2HtfTrendCache();
  resetRsiDivergencePullbackCache();
  resetAbcdHarmonicRsiConfluenceCache();
  resetInsideBarBreakoutHtfTrendCache();
  resetPdhPdlLiquiditySweepMssCache();
  resetEngulfingHtfSrReversalCache();
  resetPinbarRsiExtremeReversalCache();
  resetCvdDivergenceReversalCache();
  resetVolumeProfilePocReversionCache();
  resetWyckoffAccumulationBreakoutCache();
  resetVariancePremiumSpikeFadeCache();
  resetVolOfVolBreakoutCache();
  resetVolRichBandFadeCache();
  resetHurstRegimeSwitch1hCache();
  resetKamaAdaptiveTrend15mCache();
  resetZScoreMeanReversion1hCache();
  resetDrawdownThrottleCircuitBreakerCache();
  resetVolatilityAdaptiveSupertrendRMultipleCache();
  resetFundingCarryTrendCache();
  resetOiDivergenceReversalCache();
  resetPdhPdlSweepReversalCache();
  // v7 — 18 candidates from 9-specialist swarm
  resetMacdHistcrossTrend15mCache();
  resetTripleScreenElder15mCache();
  resetStochCrossTrend15mCache();
  resetStochCrossTrend15mState();
  resetWilliamsRRecovery15mCache();
  resetDoubleBottomPivot1hCache();
  resetDoubleBottomPivot1hState();
  resetFailedRangeFade15mCache();
  resetFailedRangeFade15mState();
  resetThreeSoldiersContinuation15mCache();
  resetThreeSoldiersContinuation15mState();
  resetHammerHtfSupport1hCache();
  resetObvDivergence1hCache();
  resetObvDivergence1hRuntimeState();
  resetDeltaMomentumTrend15mCache();
  resetDeltaMomentumTrend15mRuntimeState();
  resetDonchianWidthExpansion15mCache();
  resetChopTrendTransition1hCache();
  resetLrSlopeCross15mCache();
  resetTsiCrossoverTrend1hCache();
  resetChandelierFlip1hCache();
  resetVolThrottleSupertrend15mCache();
  resetFundingFlipTrend15mCache();
  resetFundingFlipTrend15mState();
  resetFundingFlipTrend15mRing();
  resetOiSurgeTrap1hCache();

  const startMs = Date.now();

  const startTime = new Date(config.startDate).getTime();
  // Inclusive end-of-day for date-only strings (YYYY-MM-DD). Without this
  // a single-day backtest (start === end) loads only the one candle at
  // 00:00 UTC, so every strategy reports 0 trades. Strings that already
  // carry a time component are passed through unchanged.
  const endTime = /^\d{4}-\d{2}-\d{2}$/.test(config.endDate)
    ? new Date(`${config.endDate}T23:59:59.999Z`).getTime()
    : new Date(config.endDate).getTime();

  // Load candles for the date range
  const candles = await loadCandles(config.coin, startTime, endTime);

  if (candles.length === 0) {
    throw new Error(`No candle data found for ${config.coin} between ${config.startDate} and ${config.endDate}`);
  }

  const makerFee = config.makerFee ?? 0.0005;
  const slippage = config.slippage ?? 0.0001;

  // Initialize position manager
  const pm = new PositionManager({ makerFee, slippage });

  // Determine strategy and required indicators
  let strategy: BacktestStrategy | null = null;
  let uiConfig: UIStrategyConfig | null = null;

  if (config.strategyType === "code") {
    strategy = getStrategyByName(config.strategyName);
    if (!strategy) throw new Error(`Unknown strategy: ${config.strategyName}`);
  } else {
    uiConfig = config.strategyConfig as unknown as UIStrategyConfig;
  }

  // Compute indicators
  const indicatorConfigs = strategy
    ? strategy.requiredIndicators
    : extractIndicatorConfigsFromUI(uiConfig!);

  const indicators = computeIndicators(candles, indicatorConfigs);

  // Pre-compute multi-timeframe data for multi-TF strategies
  if (config.strategyName === "meri-strategy") {
    precomputeMeriStrategy(candles);
  } else if (config.strategyName === "meri-strategy-v2") {
    precomputeMeriV2Strategy(candles);
  } else if (config.strategyName === "supertrend-strategy") {
    precomputeSupertrendStrategy(candles);
  } else if (config.strategyName === "cpr-pivot-strategy") {
    precomputeCPRLevels(candles);
  } else if (config.strategyName === "gann-matrix-momentum") {
    precomputeGannStrategy(candles);
  } else if (config.strategyName === "gann-matrix-momentum-v2") {
    precomputeGannV2Strategy(candles);
  } else if (config.strategyName === "sr-breakout") {
    precomputeSRBreakout(candles);
  } else if (config.strategyName === "support-resistance-breakout-v2") {
    precomputeSRBreakoutV2(candles);
  } else if (config.strategyName === "macd-crossover-swing") {
    precomputeMacdSwing(candles);
  } else if (config.strategyName === "weekly-momentum") {
    precomputeWeeklyMomentum(candles);
  } else if (config.strategyName === "trendline-breakout-adaptive") {
    const cfg = (config.strategyConfig ?? {}) as Record<string, unknown>;
    const tf = Number(cfg.timeframeMinutes ?? 15);
    const lb = Number(cfg.lookback ?? 14);
    const mult = Number(cfg.slopeMultiplier ?? 1);
    precomputeTrendlineBreakoutAdaptive(candles, tf, lb, mult);
  } else if (config.strategyName === "cpr-ha-volatility-momentum") {
    precomputeCprHaVolMomentumV1(candles);
  } else if (config.strategyName === "cpr-volatility-power-trend-v2") {
    precomputeCprVolPowerTrendV2(candles);
  } else if (config.strategyName === "eth-hybrid-renko-avwap") {
    precomputeEthHybridRenkoAvwap(candles);
  } else if (config.strategyName === "eth-hybrid-renko-avwap-v2") {
    precomputeEthHybridRenkoAvwapV2(candles);
  } else if (config.strategyName === "ichimoku-renko-trend-follower") {
    precomputeIchimokuRenkoTrend(candles);
  } else if (config.strategyName === "ichimoku-renko-trend-follower-v2") {
    precomputeIchimokuRenkoTrendV2(candles);
  } else if (config.strategyName === "m15-trend-following-pivot") {
    const cfg = (config.strategyConfig ?? {}) as Record<string, unknown>;
    const fast = Number(cfg.fastPeriod ?? 20);
    const slow = Number(cfg.slowPeriod ?? 50);
    precomputeM15TrendPivot(candles, fast, slow);
  } else if (config.strategyName === "pdh-pdl-reversion-breakout") {
    const cfg = (config.strategyConfig ?? {}) as Record<string, number | string>;
    precomputePdhPdlReversionBreakout(candles, cfg);
  } else if (config.strategyName === "asian-sweep-reversal") {
    precomputeAsianSweepReversal(candles);
  } else if (config.strategyName === "avwap-sigma-reversion") {
    precomputeAvwapSigmaReversion(candles);
  } else if (config.strategyName === "funding-squeeze-reversal") {
    precomputeFundingSqueezeReversal(candles);
  } else if (config.strategyName === "ttm-squeeze-regime") {
    precomputeTtmSqueezeRegime(candles);
  } else if (config.strategyName === "supertrend-5m-fast") {
    precomputeSupertrend5mFast(candles);
  } else if (config.strategyName === "supertrend-1h-swing") {
    precomputeSupertrend1hSwing(candles);
  } else if (config.strategyName === "01-donchian-breakout-regime-1h") {
    precomputeDonchianBreakoutRegime1h(candles);
  } else if (config.strategyName === "01-ema-stack-momentum-15m") {
    precomputeEmaStackMomentum15m(candles);
  } else if (config.strategyName === "01-htf-momentum-pullback-1h") {
    precomputeHtfMomentumPullback1h(candles);
  } else if (config.strategyName === "02-bollinger-fade-regime-gated") {
    precomputeBollingerFadeRegime(candles);
  } else if (config.strategyName === "02-connors-rsi2-htf-trend") {
    precomputeConnorsRsi2HtfTrend(candles);
  } else if (config.strategyName === "02-rsi-divergence-pullback") {
    precomputeRsiDivergencePullback(candles);
  } else if (config.strategyName === "03-abcd-harmonic-rsi-confluence") {
    precomputeAbcdHarmonicRsiConfluence(candles);
  } else if (config.strategyName === "03-inside-bar-breakout-htf-trend") {
    precomputeInsideBarBreakoutHtfTrend(candles);
  } else if (config.strategyName === "03-pdh-pdl-liquidity-sweep-mss") {
    precomputePdhPdlLiquiditySweepMss(candles);
  } else if (config.strategyName === "04-engulfing-htf-sr-reversal") {
    precomputeEngulfingHtfSrReversal(candles);
  } else if (config.strategyName === "04-pinbar-rsi-extreme-reversal") {
    precomputePinbarRsiExtremeReversal(candles);
  } else if (config.strategyName === "05-cvd-divergence-reversal") {
    precomputeCvdDivergenceReversal(candles);
  } else if (config.strategyName === "05-volume-profile-poc-reversion") {
    precomputeVolumeProfilePocReversion(candles);
  } else if (config.strategyName === "05-wyckoff-accumulation-breakout") {
    precomputeWyckoffAccumulationBreakout(candles);
  } else if (config.strategyName === "06-variance-premium-spike-fade-1h") {
    precomputeVariancePremiumSpikeFade(candles);
  } else if (config.strategyName === "06-vol-of-vol-breakout-15m") {
    precomputeVolOfVolBreakout(candles);
  } else if (config.strategyName === "06-vol-rich-band-fade-1h") {
    precomputeVolRichBandFade(candles);
  } else if (config.strategyName === "07-hurst-regime-switch-1h") {
    precomputeHurstRegimeSwitch1h(candles);
  } else if (config.strategyName === "07-kama-adaptive-trend-15m") {
    precomputeKamaAdaptiveTrend15m(candles);
  } else if (config.strategyName === "07-zscore-mean-reversion-1h") {
    precomputeZScoreMeanReversion1h(candles);
  } else if (config.strategyName === "08-drawdown-throttle-circuit-breaker") {
    precomputeDrawdownThrottleCircuitBreaker(candles);
  } else if (config.strategyName === "08-volatility-adaptive-supertrend-r-multiple") {
    precomputeVolatilityAdaptiveSupertrendRMultiple(candles);
  } else if (config.strategyName === "12-funding-carry-trend") {
    precomputeFundingCarryTrend(candles);
  } else if (config.strategyName === "12-oi-divergence-reversal") {
    precomputeOiDivergenceReversal(candles);
  } else if (config.strategyName === "12-pdh-pdl-sweep-reversal") {
    precomputePdhPdlSweepReversal(candles);
  } else if (config.strategyName === "01-v2-compression-breakout-donchian-1h") {
    precomputeCompressionBreakoutDonchian1h(candles);
  } else if (config.strategyName === "01-v2-trend-zscore-pullback-1h") {
    precomputeTrendZScorePullback1h(candles);
  } else if (config.strategyName === "02-v2-connors-rsi2-adaptive-runner") {
    precomputeConnorsRsi2AdaptiveRunner(candles);
  } else if (config.strategyName === "02-v2-stochrsi-zscore-mr") {
    precomputeStochRsiZscoreMr(candles);
  } else if (config.strategyName === "03-v2-pinbar-multiday-extreme-volume") {
    precomputePinbarMultidayExtremeVolume(candles);
  } else if (config.strategyName === "03-v2-range-expansion-bbwidth-breakout") {
    precomputeRangeExpansionBBWidthBreakout(candles);
  } else if (config.strategyName === "04-v2-engulfing-1h-ny-session-htf-ma") {
    precomputeEngulfing1hNySessionHtfMa(candles);
  } else if (config.strategyName === "04-v2-hammer-1h-bb-trend-pullback") {
    precomputeHammer1hBbTrendPullback(candles);
  } else if (config.strategyName === "05-v2-cvd-divergence-coin-tuned-1h") {
    precomputeCvdDivergenceCoinTuned1h(candles);
  } else if (config.strategyName === "05-v2-vwap-band-absorption-1h") {
    precomputeVwapBandAbsorption1h(candles);
  } else if (config.strategyName === "06-v2-atr-percentile-expansion-breakout-1h") {
    precomputeAtrPercentileExpansionBreakout1h(candles);
  } else if (config.strategyName === "06-v2-variance-premium-fade-loosened-1h") {
    precomputeVariancePremiumFadeLoosened1h(candles);
  } else if (config.strategyName === "07-v2-hma-zscore-mean-reversion-1h") {
    precomputeHmaZScoreMeanReversion1h(candles);
  } else if (config.strategyName === "07-v2-rsi-zscore-mean-reversion-1h") {
    precomputeRsiZScoreMeanReversion1h(candles);
  } else if (config.strategyName === "07-v2-zscore-mr-funding-filter-1h") {
    precomputeZScoreMrFundingFilter1h(candles);
  } else if (config.strategyName === "08-v2-asymmetric-kelly-sized-trend") {
    precomputeAsymmetricKellySizedTrend(candles);
  } else if (config.strategyName === "08-v2-pyramid-add-trend") {
    precomputePyramidAddTrend(candles);
  } else if (config.strategyName === "12-v2-negative-funding-carry-long") {
    precomputeNegativeFundingCarryLong(candles);
  } else if (config.strategyName === "12-v2-oi-peak-exhaustion-short") {
    precomputeOiPeakExhaustionShort(candles);
  } else if (config.strategyName === "99-meta-adaptive-vol-throttle-zscore-1h") {
    precomputeAdaptiveVolThrottleZscore1h(candles);
  } else if (config.strategyName === "99-meta-vol-term-structure-dispersion-mr-1h") {
    precomputeVolTermStructureDispersionMr1h(candles);
  } else if (config.strategyName === "99-meta-zscore-ensemble-consensus-1h") {
    precomputeZScoreEnsembleConsensus1h(candles);
  } else if (config.strategyName === "01-v3-donchian-breakout-regime-strict") {
    precomputeV3DonchianBreakoutRegimeStrict(candles);
  } else if (config.strategyName === "01-v3-ema-stack-momentum-regime") {
    precomputeV3EmaStackMomentumRegime(candles);
  } else if (config.strategyName === "01-v3-htf-pullback-confluence") {
    precomputeV3HtfPullbackConfluence(candles);
  } else if (config.strategyName === "02-v3-connors-rsi2-aggressive-tp") {
    precomputeConnorsRsi2AggressiveTp(candles);
  } else if (config.strategyName === "02-v3-connors-rsi2-coin-tuned") {
    precomputeConnorsRsi2CoinTuned(candles);
  } else if (config.strategyName === "02-v3-connors-rsi2-multi-tf-confluence") {
    precomputeConnorsRsi2MultiTfConfluence(candles);
  } else if (config.strategyName === "02-v3-connors-rsi2-strong-trend") {
    precomputeConnorsRsi2StrongTrend(candles);
  } else if (config.strategyName === "05-v3-vwap-absorption-coin-tuned") {
    precomputeVwapAbsorptionCoinTuned(candles);
  } else if (config.strategyName === "05-v3-vwap-absorption-long-only-uptrend") {
    precomputeVwapAbsorptionLongOnlyUptrend(candles);
  } else if (config.strategyName === "05-v3-vwap-absorption-trend-aware") {
    precomputeVwapAbsorptionTrendAware(candles);
  } else if (config.strategyName === "05-v3-vwap-absorption-volume-confirm") {
    precomputeVwapAbsorptionVolumeConfirm(candles);
  } else if (config.strategyName === "06-v3-atr-expansion-regime-gated") {
    precomputeV3AtrExpansionRegimeGated(candles);
  } else if (config.strategyName === "07-v3-zscore-mr-btc-tuned-1h") {
    precomputeZScoreMrBtcTuned1h(candles);
  } else if (config.strategyName === "07-v3-zscore-mr-funding-extreme") {
    precomputeZScoreMrFundingExtreme(candles);
  } else if (config.strategyName === "07-v3-zscore-mr-funding-loose") {
    precomputeZScoreMrFundingLoose(candles);
  } else if (config.strategyName === "07-v3-zscore-mr-funding-multicoin") {
    precomputeZScoreMrFundingMulticoin(candles);
  } else if (config.strategyName === "07-v3-zscore-mr-funding-proxy") {
    precomputeZScoreMrFundingProxy(candles);
  } else if (config.strategyName === "07-v3-zscore-mr-loose-1h") {
    precomputeZScoreMrLoose1h(candles);
  } else if (config.strategyName === "07-v3-zscore-mr-slope-gated-1h") {
    precomputeZScoreMrSlopeGated1h(candles);
  } else if (config.strategyName === "07-v3-zscore-mr-slow-anchor-1h") {
    precomputeZScoreMrSlowAnchor1h(candles);
  } else if (config.strategyName === "07-v3-zscore-mr-tight-1h") {
    precomputeZScoreMrTight1h(candles);
  } else if (config.strategyName === "v8-pnf-catapult-breakout-1h") {
    precomputePnfCatapult1h(candles);
  } else if (config.strategyName === "07-v3-zscore-mr-slope-gated-15m") {
    precomputeZScoreMrSlopeGated15m(candles);
  } else if (config.strategyName === "07-v3-zscore-mr-slope-gated-5m") {
    precomputeZScoreMrSlopeGated5m(candles);
  } else if (config.strategyName === "07-zscore-mean-reversion-15m") {
    precomputeZScoreMeanReversion15m(candles);
  } else if (config.strategyName === "07-zscore-mean-reversion-5m") {
    precomputeZScoreMeanReversion5m(candles);
  } else if (config.strategyName === "supertrend-swing-15m") {
    precomputeSupertrendSwing15m(candles);
  } else if (config.strategyName === "supertrend-swing-5m") {
    precomputeSupertrendSwing5m(candles);
  } else if (config.strategyName === "v7-chop-trend-transition-15m") {
    precomputeChopTrendTransition15m(candles);
  } else if (config.strategyName === "v7-chop-trend-transition-5m") {
    precomputeChopTrendTransition5m(candles);
  } else if (config.strategyName === "01-v3-htf-pullback-confluence-15m") {
    precomputeV3HtfPullbackConfluence15m(candles);
  } else if (config.strategyName === "01-v3-htf-pullback-confluence-5m") {
    precomputeV3HtfPullbackConfluence5m(candles);
  } else if (config.strategyName === "v7-macd-histcross-trend-15m") {
    precomputeMacdHistcrossTrend15m(candles);
  } else if (config.strategyName === "v7-triple-screen-elder-15m") {
    precomputeTripleScreenElder15m(candles);
  } else if (config.strategyName === "v7-stoch-cross-trend-15m") {
    precomputeStochCrossTrend15m(candles);
  } else if (config.strategyName === "v7-williams-r-recovery-15m") {
    precomputeWilliamsRRecovery15m(candles);
  } else if (config.strategyName === "v7-double-bottom-pivot-1h") {
    precomputeDoubleBottomPivot1h(candles);
  } else if (config.strategyName === "v7-failed-range-fade-15m") {
    precomputeFailedRangeFade15m(candles);
  } else if (config.strategyName === "v7-three-soldiers-continuation-15m") {
    precomputeThreeSoldiersContinuation15m(candles);
  } else if (config.strategyName === "v7-hammer-htf-support-1h") {
    precomputeHammerHtfSupport1h(candles);
  } else if (config.strategyName === "v7-obv-divergence-1h") {
    precomputeObvDivergence1h(candles);
  } else if (config.strategyName === "v7-delta-momentum-trend-15m") {
    precomputeDeltaMomentumTrend15m(candles);
  } else if (config.strategyName === "v7-donchian-width-expansion-15m") {
    precomputeDonchianWidthExpansion15m(candles);
  } else if (config.strategyName === "v7-chop-trend-transition-1h") {
    precomputeChopTrendTransition1h(candles);
  } else if (config.strategyName === "v7-lr-slope-cross-15m") {
    precomputeLrSlopeCross15m(candles);
  } else if (config.strategyName === "v7-tsi-crossover-trend-1h") {
    precomputeTsiCrossoverTrend1h(candles);
  } else if (config.strategyName === "v7-chandelier-flip-1h") {
    precomputeChandelierFlip1h(candles);
  } else if (config.strategyName === "v7-vol-throttle-supertrend-15m") {
    precomputeVolThrottleSupertrend15m(candles);
  } else if (config.strategyName === "v7-funding-flip-trend-15m") {
    precomputeFundingFlipTrend15m(candles);
  } else if (config.strategyName === "v7-oi-surge-trap-1h") {
    precomputeOiSurgeTrap1h(candles);
  }

  // Run simulation
  let equity = config.initialCapital;
  const equityCurve: EquityPoint[] = [{ time: candles[0].timestamp, equity }];

  for (let i = 0; i < candles.length; i++) {
    // Yield to the event loop every 5000 candles so the HTTP server stays
    // responsive during long backtests (1.7M candles = 340 yields, ~0ms overhead).
    if (i % 5000 === 0 && i > 0) await new Promise((r) => setImmediate(r));

    const candle = candles[i];

    // 1. Check SL/TP on existing positions
    pm.checkStopLossAndTakeProfit(candle);

    // 2. Get signals from strategy
    let signals: Signal[] = [];

    if (strategy) {
      const ctx = {
        candle,
        index: i,
        indicators,
        positions: pm.getPositions(),
        equity,
        config: {
          ...strategy.defaultConfig,
          ...(config.strategyConfig as Record<string, number | string>),
        },
      };
      // Inject allCandles for multi-timeframe strategies (e.g., Meri Strategy)
      (ctx as unknown as { _allCandles: typeof candles })._allCandles = candles;
      signals = strategy.onCandle(ctx);
    } else if (uiConfig) {
      signals = evaluateUIRules(uiConfig, candle, i, indicators, pm.getPositions());
    }

    // 3. Execute signals
    for (const signal of signals) {
      executeSignal(signal, candle, pm, equity, config);
    }

    // 4. Update equity — O(1) via cached running total, not O(trades) reduce
    equity = config.initialCapital + pm.getRealizedPnl() + pm.getUnrealizedPnl(candle.close);

    // 5. Sample equity curve
    if (i % EQUITY_SAMPLE_INTERVAL === 0 || i === candles.length - 1) {
      equityCurve.push({ time: candle.timestamp, equity });
    }
  }

  // Close any remaining open positions at last candle
  if (candles.length > 0) {
    pm.closeAllPositions(candles[candles.length - 1]);
  }

  // Final equity after closing all
  const finalEquity = config.initialCapital + pm.getRealizedPnl();

  // Add final equity point
  if (candles.length > 0) {
    equityCurve.push({ time: candles[candles.length - 1].timestamp, equity: finalEquity });
  }

  const trades = pm.getClosedTrades();
  const metrics = computeMetrics(trades, equityCurve, config.initialCapital);
  const duration = Date.now() - startMs;

  return {
    config,
    trades,
    equityCurve,
    metrics,
    finalEquity,
    duration,
  };
}

function executeSignal(
  signal: Signal,
  candle: Candle,
  pm: PositionManager,
  equity: number,
  config: BacktestConfig,
): void {
  // If the strategy provides an explicit execution price (e.g. the just-closed
  // HTF bar close), the engine uses it instead of the current 1m candle close.
  // We fake a Candle with that price so PositionManager.openPosition /
  // closePositions* still receive the timestamp from the current bar but the
  // entry/exit price from the HTF close the strategy actually acted on.
  const execCandle =
    signal.entryPrice != null && Number.isFinite(signal.entryPrice)
      ? { ...candle, close: signal.entryPrice }
      : candle;

  switch (signal.action) {
    case "BUY":
    case "SELL": {
      const leverage = signal.leverage ?? 1;

      // ── TradingView-style sizing override (exchange-parity qty) ─────
      // Stored qty represents the ACTUAL leveraged position in contracts —
      // same value a real broker shows you. That means for fixed_cash and
      // percent_equity, the user's dollar amount is MARGIN, and we scale
      // up by leverage to get the notional exposure before dividing by price.
      //
      //   contracts       → qty = sizingValue                   (raw units — user picks exact contracts)
      //   fixed_cash      → qty = (sizingValue × lev) / price   ($X margin × Nx = $X·N notional)
      //   percent_equity  → qty = (equity × pct/100 × lev) / price
      //
      // With qty = leveraged notional-qty, PnL formula drops its leverage
      // multiplier (that multiplier was the previous convention where qty
      // stored pre-leverage base). Fees now correctly compute on notional
      // (price × qty × rate = notional × rate) instead of just margin.
      let qty: number;
      const sizingValue = Number(config.sizingValue ?? 0);
      switch (config.sizingMode) {
        case "contracts":
          qty = sizingValue;
          break;
        case "fixed_cash":
          qty = (sizingValue * leverage) / execCandle.close;
          break;
        case "percent_equity":
          qty = (equity * (sizingValue / 100) * leverage) / execCandle.close;
          break;
        default: {
          // Backward-compat: strategies output BASE qty (margin / price).
          // Scale up by leverage so the stored qty matches the exchange view.
          const baseQty = signal.qty ?? (equity * 0.1) / execCandle.close;
          qty = baseQty * leverage;
        }
      }

      const sl = signal.sl ?? null;
      // Multi-TP ladder takes precedence over the legacy single `tp`.
      // When both are set, `tps` wins; the legacy `tp` is kept on the
      // position purely as the chart-displayed first-target label.
      const tps = signal.tps && signal.tps.length > 0 ? signal.tps : [];
      const tp = tps.length > 0 ? tps[0].price : (signal.tp ?? null);

      // Optional $50 min-margin floor. Margin = notional / leverage = (qty × price) / leverage.
      // 1-cent tolerance protects against float-precision false positives on
      // exactly-$50-configured trades.
      const notional = qty * execCandle.close;
      const margin = notional / leverage;
      const enforce = config.enforceMinMargin === true; // default false
      if (enforce && margin < MIN_MARGIN_USD - 0.01) {
        pm.recordMarginCall(execCandle, signal.action, qty, execCandle.close, leverage, equity);
        break;
      }
      pm.openPosition(execCandle, signal.action, qty, leverage, sl, tp, tps);
      break;
    }
    case "CLOSE_LONG": {
      // Pass the strategy's reason through so the trade log shows
      // "5m ST flipped RED (ADX X.X)" / "ADX fading X.X < 20" / etc
      // instead of the opaque "SIGNAL" bucket.
      pm.closePositionsBySide("BUY", execCandle, signal.reason ?? "SIGNAL");
      break;
    }
    case "CLOSE_SHORT": {
      pm.closePositionsBySide("SELL", execCandle, signal.reason ?? "SIGNAL");
      break;
    }
    case "CLOSE_ALL": {
      pm.closeAllPositions(execCandle, signal.reason ?? "SIGNAL");
      break;
    }
  }
}

/** Extract indicator configs needed from UI strategy rules */
function extractIndicatorConfigsFromUI(uiConfig: UIStrategyConfig) {
  const seen = new Set<string>();
  const configs: { name: string; period?: number; params?: Record<string, number> }[] = [];

  const allConditions = [
    ...uiConfig.entry_rules.flatMap((r) => r.conditions),
    ...uiConfig.exit_rules.flatMap((r) => r.conditions),
  ];

  for (const cond of allConditions) {
    const key = `${cond.indicator}-${cond.period ?? "default"}`;
    if (seen.has(key)) continue;
    seen.add(key);

    configs.push({
      name: cond.indicator,
      period: cond.period,
    });
  }

  return configs;
}
