import type {
  AlgorithmParams,
  CandidateMove,
  TransitionStep,
  TransitionResult,
  Channel,
  GainStage,
  AtomicStep,
} from '../types';
import { buildCouplingMap } from '../core/coupling';
import { computeAllChannelEirp } from '../core/eirp';
import { computeAllPowerLevels } from '../core/power';
import { computeAllSystemTemp } from '../core/system-temp';
import { generateCandidateMoves } from './candidates';
import { checkFeasibility } from './feasibility';

export const DEFAULT_PARAMS: AlgorithmParams = {
  maxNegativeEirpDeviation: null,
  maxPositiveEirpDeviation: null,
  maxIterations: 5000,
  strategy: 'greedy',
  g4CompensationMode: 'after',
};

// ─────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────

export function runCCGS(
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  params: AlgorithmParams = DEFAULT_PARAMS
): TransitionResult {
  const { gainValues, targetValues, granularities } = initState(gainStages);
  const initialEirp = computeAllChannelEirp(channels, gainValues);
  const initialSystemTemp = computeAllSystemTemp(channels, gainValues, gainStages);
  const initialGainValues = { ...gainValues };
  const couplingMap = params.strategy === 'g4-compensated' ? buildCouplingMap(channels) : null;

  const ctx: RunContext = {
    channels, gainStages, params, gainValues, targetValues, granularities,
    initialEirp, initialSystemTemp, initialGainValues,
    steps: [], maxNegDev: 0, maxPosDev: 0, violations: 0,
  };

  if (params.strategy === 'g4-compensated') {
    // Phase 1: non-G4 gains with G4 compensation
    const phase1Err = runLoop(ctx, { excludeTypes: new Set(['G4']), g4Compensate: true });
    if (phase1Err) return phase1Err;

    // Phase 2: G4 to final targets
    const phase2Err = runLoop(ctx, { onlyType: 'G4' });
    if (phase2Err) return phase2Err;
  } else {
    const err = runLoop(ctx, {});
    if (err) return err;
  }

  return buildResult(ctx);
}

// ─────────────────────────────────────────────────────────────────────
// Unified iteration loop
// ─────────────────────────────────────────────────────────────────────

interface RunContext {
  channels: Channel[];
  gainStages: Map<string, GainStage>;
  params: AlgorithmParams;
  gainValues: Record<string, number>;
  targetValues: Record<string, number>;
  granularities: Record<string, number>;
  initialEirp: Record<string, number>;
  initialSystemTemp: Record<string, number>;
  initialGainValues: Record<string, number>;
  steps: TransitionStep[];
  maxNegDev: number;
  maxPosDev: number;
  violations: number;
}

interface LoopOptions {
  excludeTypes?: Set<string>;  // e.g. {'G4'} for Phase 1
  onlyType?: string;           // e.g. 'G4' for Phase 2
  g4Compensate?: boolean;      // insert G4 correction after each primary step
}

/** Run the main iteration loop. Returns an error TransitionResult if EIRP limits are infeasible, or null on success/normal termination. */
function runLoop(ctx: RunContext, opts: LoopOptions): TransitionResult | null {
  const { channels, gainStages, params, gainValues, targetValues, granularities, initialEirp } = ctx;
  const hasEirpLimits = params.maxNegativeEirpDeviation !== null || params.maxPositiveEirpDeviation !== null;

  for (let iter = 0; iter < params.maxIterations; iter++) {
    // Check convergence (scoped to relevant stages)
    if (isConverged(gainValues, targetValues, granularities, opts)) break;

    // Generate candidates
    let candidates = generateCandidateMoves(gainValues, targetValues, granularities, opts.excludeTypes);
    if (opts.onlyType) candidates = candidates.filter(m => m.stageType === opts.onlyType);
    if (candidates.length === 0) break;

    // Power threshold filter
    let feasible = candidates.filter(m => checkFeasibility(m, gainValues, channels, gainStages));
    if (feasible.length === 0) {
      feasible = filterRelaxedPower(candidates, gainValues, channels, gainStages);
      if (feasible.length === 0) break;
      ctx.violations++;
    }

    // EIRP deviation filter
    if (hasEirpLimits) {
      const eirpFiltered = opts.g4Compensate
        ? filterEirpWithG4(feasible, gainValues, channels, initialEirp, params, granularities, gainStages)
        : filterEirp(feasible, gainValues, channels, initialEirp, params);

      if (eirpFiltered.length === 0) {
        const msg = opts.g4Compensate
          ? buildEirpErrorMsg(feasible, gainValues, channels, initialEirp, params, true, granularities, gainStages)
          : buildEirpErrorMsg(feasible, gainValues, channels, initialEirp, params, false);
        return buildResult(ctx, msg);
      }
      feasible = eirpFiltered;
    }

    // Pick best (most progress)
    const best = pickBest(feasible);

    // Apply move (with optional G4 compensation)
    if (opts.g4Compensate) {
      if (params.g4CompensationMode === 'before') {
        const g4Step = buildG4PreCorrection(best, gainValues, channels, granularities);
        if (g4Step) applyAndRecord(ctx, g4Step);
        applyAndRecord(ctx, best);
      } else {
        applyAndRecord(ctx, best);
        const g4Step = buildG4PostCorrection(gainValues, channels, initialEirp, granularities);
        if (g4Step) applyAndRecord(ctx, g4Step);
      }
    } else {
      applyAndRecord(ctx, best);
    }
  }

  return null; // success
}

// ─────────────────────────────────────────────────────────────────────
// G4 correction
// ─────────────────────────────────────────────────────────────────────

/** G4 pre-correction (before mode): oppose the EIRP change the primary step would cause */
function buildG4PreCorrection(
  primaryMove: CandidateMove,
  gainValues: Record<string, number>,
  channels: Channel[],
  granularities: Record<string, number>
): CandidateMove | null {
  const tempGains = { ...gainValues };
  for (const step of primaryMove.steps) {
    tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
  }
  return buildG4Steps(
    computeAllChannelEirp(channels, gainValues),
    computeAllChannelEirp(channels, tempGains),
    channels, granularities
  );
}

/** G4 post-correction (after mode): bring EIRP back toward initial */
function buildG4PostCorrection(
  gainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  granularities: Record<string, number>
): CandidateMove | null {
  return buildG4Steps(initialEirp, computeAllChannelEirp(channels, gainValues), channels, granularities);
}

/** Core: convert EIRP deviation into quantized G4 steps */
function buildG4Steps(
  referenceEirp: Record<string, number>,
  actualEirp: Record<string, number>,
  channels: Channel[],
  granularities: Record<string, number>
): CandidateMove | null {
  const g4Steps: AtomicStep[] = [];

  for (const ch of channels) {
    const deviation = actualEirp[ch.id] - referenceEirp[ch.id];
    if (Math.abs(deviation) < 0.001) continue;

    const g4Key = `G4:ch${ch.id}`;
    const g4Gran = granularities[g4Key];
    if (!g4Gran) continue;

    const numSteps = Math.round(-deviation / g4Gran);
    if (numSteps === 0) continue;

    g4Steps.push({ gainStageKey: g4Key, delta: numSteps * g4Gran });
  }

  return g4Steps.length > 0 ? { steps: g4Steps, stageType: 'G4' } : null;
}

// ─────────────────────────────────────────────────────────────────────
// EIRP filtering
// ─────────────────────────────────────────────────────────────────────

function checkEirpLimits(
  eirp: Record<string, number>,
  initialEirp: Record<string, number>,
  channels: Channel[],
  negLimit: number | null,
  posLimit: number | null
): boolean {
  for (const ch of channels) {
    const dev = eirp[ch.id] - initialEirp[ch.id];
    if (negLimit !== null && dev < -(negLimit + 0.001)) return false;
    if (posLimit !== null && dev > posLimit + 0.001) return false;
  }
  return true;
}

/** Standard EIRP filter: check single post-move state */
function filterEirp(
  candidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  params: AlgorithmParams
): CandidateMove[] {
  const { maxNegativeEirpDeviation: neg, maxPositiveEirpDeviation: pos } = params;
  return candidates.filter(move => {
    const temp = applyToTemp(gainValues, move.steps);
    return checkEirpLimits(computeAllChannelEirp(channels, temp), initialEirp, channels, neg, pos);
  });
}

/** G4-aware EIRP filter: check BOTH intermediate states (post-primary AND post-G4-correction) */
function filterEirpWithG4(
  candidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  params: AlgorithmParams,
  granularities: Record<string, number>,
  gainStages: Map<string, GainStage>
): CandidateMove[] {
  const { maxNegativeEirpDeviation: neg, maxPositiveEirpDeviation: pos } = params;

  return candidates.filter(move => {
    if (params.g4CompensationMode === 'before') {
      // Sequence: G4 pre-correction → primary
      const afterPrimary = applyToTemp(gainValues, move.steps);
      const g4 = buildG4Steps(
        computeAllChannelEirp(channels, gainValues),
        computeAllChannelEirp(channels, afterPrimary),
        channels, granularities
      );
      // State 1: after G4 pre-correction only
      const state1 = g4 ? applyToTemp(gainValues, g4.steps) : { ...gainValues };
      if (!checkEirpLimits(computeAllChannelEirp(channels, state1), initialEirp, channels, neg, pos)) return false;
      // State 2: after G4 pre-correction + primary
      const state2 = applyToTemp(state1, move.steps);
      return checkEirpLimits(computeAllChannelEirp(channels, state2), initialEirp, channels, neg, pos);
    } else {
      // Sequence: primary → G4 correction
      // State 1: after primary (before G4)
      const state1 = applyToTemp(gainValues, move.steps);
      const eirp1 = computeAllChannelEirp(channels, state1);
      if (!checkEirpLimits(eirp1, initialEirp, channels, neg, pos)) return false;
      // State 2: after G4 correction
      const g4 = buildG4Steps(initialEirp, eirp1, channels, granularities);
      const state2 = g4 ? applyToTemp(state1, g4.steps) : state1;
      return checkEirpLimits(computeAllChannelEirp(channels, state2), initialEirp, channels, neg, pos);
    }
  });
}

/** Relax power thresholds by 1 dB */
function filterRelaxedPower(
  candidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  gainStages: Map<string, GainStage>
): CandidateMove[] {
  return candidates.filter(move => {
    const temp = applyToTemp(gainValues, move.steps);
    const powerLevels = computeAllPowerLevels(channels, temp);
    for (const [key, power] of Object.entries(powerLevels)) {
      const stage = gainStages.get(key);
      if (!stage) continue;
      if (power > stage.upperThreshold + 1.0 || power < stage.lowerThreshold - 1.0) return false;
    }
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Selection
// ─────────────────────────────────────────────────────────────────────

/** Gain stage types considered "inner" (per-channel) for inner-first tiebreaker */
const INNER_STAGES = new Set(['G3', 'G4', 'G5']);

function pickBest(feasible: CandidateMove[]): CandidateMove {
  return feasible.reduce((best, move) => {
    const progressA = totalProgress(best);
    const progressB = totalProgress(move);
    if (Math.abs(progressA - progressB) > 0.001) return progressB > progressA ? move : best;
    // Tiebreak: prefer inner stages, then fewer steps, then deterministic by key
    const aInner = INNER_STAGES.has(best.stageType);
    const bInner = INNER_STAGES.has(move.stageType);
    if (aInner !== bInner) return bInner ? move : best;
    if (best.steps.length !== move.steps.length) return move.steps.length < best.steps.length ? move : best;
    // Final tiebreaker: stage type then first key for deterministic ordering
    const typeCmp = best.stageType.localeCompare(move.stageType);
    if (typeCmp !== 0) return typeCmp > 0 ? move : best;
    const keyA = best.steps[0]?.gainStageKey ?? '';
    const keyB = move.steps[0]?.gainStageKey ?? '';
    return keyB.localeCompare(keyA) < 0 ? move : best;
  });
}

function totalProgress(move: CandidateMove): number {
  let p = 0;
  for (const s of move.steps) p += Math.abs(s.delta);
  return p;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function initState(gainStages: Map<string, GainStage>) {
  const gainValues: Record<string, number> = {};
  const targetValues: Record<string, number> = {};
  const granularities: Record<string, number> = {};
  for (const [key, stage] of gainStages) {
    gainValues[key] = stage.currentValue;
    targetValues[key] = stage.targetValue;
    granularities[key] = stage.stepGranularity;
  }
  return { gainValues, targetValues, granularities };
}

function isConverged(
  gainValues: Record<string, number>,
  targetValues: Record<string, number>,
  granularities: Record<string, number>,
  opts: LoopOptions
): boolean {
  return Object.keys(targetValues).every(key => {
    const type = key.split(':')[0];
    // Skip stages outside our scope
    if (opts.excludeTypes?.has(type)) return true;
    if (opts.onlyType && type !== opts.onlyType) return true;
    return Math.abs(gainValues[key] - targetValues[key]) < granularities[key] * 0.01;
  });
}

/** Apply steps to a copy of gainValues (non-mutating) */
function applyToTemp(gainValues: Record<string, number>, steps: AtomicStep[]): Record<string, number> {
  const temp = { ...gainValues };
  for (const s of steps) temp[s.gainStageKey] = (temp[s.gainStageKey] ?? 0) + s.delta;
  return temp;
}

/** Apply move in-place and record the step */
function applyAndRecord(ctx: RunContext, move: CandidateMove) {
  for (const s of move.steps) {
    ctx.gainValues[s.gainStageKey] = (ctx.gainValues[s.gainStageKey] ?? 0) + s.delta;
  }
  const { channels, gainStages, gainValues, initialEirp } = ctx;
  const eirp = computeAllChannelEirp(channels, gainValues);
  const deviations: Record<string, number> = {};
  for (const ch of channels) deviations[ch.id] = eirp[ch.id] - initialEirp[ch.id];

  const step: TransitionStep = {
    stepIndex: ctx.steps.length,
    appliedMove: move,
    gainValues: { ...gainValues },
    channelEirp: eirp,
    channelEirpDeviation: deviations,
    powerLevels: computeAllPowerLevels(channels, gainValues),
    systemTemp: computeAllSystemTemp(channels, gainValues, gainStages),
    cost: 0,
  };
  ctx.steps.push(step);

  for (const dev of Object.values(deviations)) {
    if (dev < ctx.maxNegDev) ctx.maxNegDev = dev;
    if (dev > ctx.maxPosDev) ctx.maxPosDev = dev;
  }
}

function buildResult(ctx: RunContext, error?: string): TransitionResult {
  const { steps, initialEirp, initialSystemTemp, initialGainValues, gainValues, targetValues, granularities, channels } = ctx;
  const allDone = Object.keys(targetValues).every(
    key => Math.abs(gainValues[key] - targetValues[key]) < granularities[key] * 0.01
  );
  return {
    steps,
    initialEirp,
    finalEirp: computeAllChannelEirp(channels, gainValues),
    initialGainValues,
    targetGainValues: { ...targetValues },
    initialSystemTemp,
    maxNegativeDeviation: ctx.maxNegDev,
    maxPositiveDeviation: ctx.maxPosDev,
    totalSteps: steps.length,
    thresholdViolations: ctx.violations,
    converged: error ? false : allDone,
    error: error ?? null,
  };
}

function buildEirpErrorMsg(
  powerFeasible: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  params: AlgorithmParams,
  withG4: boolean,
  granularities?: Record<string, number>,
  gainStages?: Map<string, GainStage>
): string {
  let bestWorstDev = Infinity;
  for (const move of powerFeasible) {
    const temp = applyToTemp(gainValues, move.steps);
    // For G4 mode, the bottleneck is the intermediate (post-primary, pre-G4) state
    const eirp = computeAllChannelEirp(channels, temp);
    let worst = 0;
    for (const ch of channels) {
      const dev = Math.abs(eirp[ch.id] - initialEirp[ch.id]);
      if (dev > worst) worst = dev;
    }
    if (worst < bestWorstDev) bestWorstDev = worst;
  }

  const neg = params.maxNegativeEirpDeviation;
  const pos = params.maxPositiveEirpDeviation;
  const limitStr = [neg !== null ? `−${neg.toFixed(2)}` : null, pos !== null ? `+${pos.toFixed(2)}` : null].filter(Boolean).join(' / ');
  const suffix = withG4 ? ' (with G4 compensation)' : '';
  return `EIRP deviation limits (${limitStr} dB) are infeasible${suffix}. Smallest achievable worst-case deviation: ±${bestWorstDev.toFixed(2)} dB. Widen limits or adjust gain granularities.`;
}
