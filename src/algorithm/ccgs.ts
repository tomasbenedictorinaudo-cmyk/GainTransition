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
import { generateCandidateMoves } from './candidates';
import { checkFeasibility } from './feasibility';
import { scoreCandidate, compareCandidates } from './scoring';

export const DEFAULT_PARAMS: AlgorithmParams = {
  maxNegativeEirpDeviation: null,
  maxPositiveEirpDeviation: null,
  maxIterations: 5000,
  strategy: 'greedy',
  g4CompensationMode: 'after',
};

/**
 * Run the Constrained Coordinated Gain Stepping algorithm.
 */
export function runCCGS(
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  params: AlgorithmParams = DEFAULT_PARAMS
): TransitionResult {
  if (params.strategy === 'g4-compensated') {
    return runG4Compensated(channels, gainStages, params);
  }
  return runStandard(channels, gainStages, params);
}

// ─────────────────────────────────────────────────────────────────────
// Standard algorithm (greedy / inner-first)
// ─────────────────────────────────────────────────────────────────────

function runStandard(
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  params: AlgorithmParams
): TransitionResult {
  const { gainValues, targetValues, granularities } = initState(gainStages);
  const initialEirp = computeAllChannelEirp(channels, gainValues);
  const initialGainValues = { ...gainValues };

  const steps: TransitionStep[] = [];
  let maxNegDev = 0;
  let maxPosDev = 0;
  let violations = 0;

  for (let iter = 0; iter < params.maxIterations; iter++) {
    if (allAtTarget(gainValues, targetValues, granularities)) break;

    const candidates = generateCandidateMoves(gainValues, targetValues, granularities);
    if (candidates.length === 0) break;

    let feasible = filterFeasible(candidates, gainValues, channels, gainStages, initialEirp, params);

    if (feasible.length === 0) {
      const relaxed = filterRelaxed(candidates, gainValues, channels, gainStages, initialEirp, params);
      if (relaxed.length === 0) break;
      violations++;
      feasible = relaxed;
    }

    const best = pickBest(feasible, gainValues, channels, initialEirp, params);
    applyMove(best, gainValues);
    const step = recordStep(steps.length, best, gainValues, channels, gainStages, initialEirp);
    steps.push(step);
    const devs = trackDeviation(step, maxNegDev, maxPosDev);
    maxNegDev = devs.neg;
    maxPosDev = devs.pos;
  }

  return buildResult(steps, initialEirp, initialGainValues, gainValues, targetValues, granularities, channels, maxNegDev, maxPosDev, violations);
}

// ─────────────────────────────────────────────────────────────────────
// G4-Compensated strategy
// Phase 1: Apply non-G4 gains, each followed (or preceded) by G4 correction
// Phase 2: Step G4 to final targets
// ─────────────────────────────────────────────────────────────────────

function runG4Compensated(
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  params: AlgorithmParams
): TransitionResult {
  const { gainValues, targetValues, granularities } = initState(gainStages);
  const couplingMap = buildCouplingMap(channels);
  const initialEirp = computeAllChannelEirp(channels, gainValues);
  const initialGainValues = { ...gainValues };

  const steps: TransitionStep[] = [];
  let maxNegDev = 0;
  let maxPosDev = 0;
  let violations = 0;

  const excludeG4 = new Set(['G4']);

  // ── Phase 1: non-G4 gains with G4 compensation ──
  for (let iter = 0; iter < params.maxIterations; iter++) {
    // Check if all non-G4 are at target
    const nonG4AtTarget = Object.keys(targetValues).every(key => {
      if (key.startsWith('G4:')) return true;
      return Math.abs(gainValues[key] - targetValues[key]) < granularities[key] * 0.01;
    });
    if (nonG4AtTarget) break;

    const candidates = generateCandidateMoves(gainValues, targetValues, granularities, excludeG4);
    if (candidates.length === 0) break;

    // In G4-compensated mode, scoring and feasibility must account for the
    // upcoming G4 correction. We simulate primary move + G4 correction
    // to evaluate the effective post-correction state.
    let feasible = filterFeasibleWithG4(
      candidates, gainValues, channels, gainStages, initialEirp, params,
      granularities, couplingMap
    );
    if (feasible.length === 0) {
      const relaxed = filterRelaxedWithG4(
        candidates, gainValues, channels, gainStages, initialEirp, params,
        granularities, couplingMap
      );
      if (relaxed.length === 0) break;
      violations++;
      feasible = relaxed;
    }

    const best = pickBestWithG4(
      feasible, gainValues, channels, initialEirp, params,
      granularities, gainStages, couplingMap
    );

    if (params.g4CompensationMode === 'before') {
      // Pre-compensate: compute what the primary step will do to EIRP, apply G4 correction first
      const g4Step = buildG4Correction(best, gainValues, channels, couplingMap, granularities, gainStages);
      if (g4Step) {
        applyMove(g4Step, gainValues);
        const s = recordStep(steps.length, g4Step, gainValues, channels, gainStages, initialEirp);
        steps.push(s);
        const d = trackDeviation(s, maxNegDev, maxPosDev);
        maxNegDev = d.neg; maxPosDev = d.pos;
      }
      // Then apply the primary step
      applyMove(best, gainValues);
      const s2 = recordStep(steps.length, best, gainValues, channels, gainStages, initialEirp);
      steps.push(s2);
      const d2 = trackDeviation(s2, maxNegDev, maxPosDev);
      maxNegDev = d2.neg; maxPosDev = d2.pos;
    } else {
      // After: apply primary step first, then G4 correction
      applyMove(best, gainValues);
      const s1 = recordStep(steps.length, best, gainValues, channels, gainStages, initialEirp);
      steps.push(s1);
      const d1 = trackDeviation(s1, maxNegDev, maxPosDev);
      maxNegDev = d1.neg; maxPosDev = d1.pos;

      const g4Step = buildG4CorrectionFromEirp(gainValues, channels, initialEirp, couplingMap, granularities, gainStages);
      if (g4Step) {
        applyMove(g4Step, gainValues);
        const s2 = recordStep(steps.length, g4Step, gainValues, channels, gainStages, initialEirp);
        steps.push(s2);
        const d2 = trackDeviation(s2, maxNegDev, maxPosDev);
        maxNegDev = d2.neg; maxPosDev = d2.pos;
      }
    }
  }

  // ── Phase 2: step G4 to final targets ──
  for (let iter = 0; iter < params.maxIterations; iter++) {
    if (allAtTarget(gainValues, targetValues, granularities)) break;

    // Only generate G4 candidates
    const g4Only = generateCandidateMoves(gainValues, targetValues, granularities);
    const g4Candidates = g4Only.filter(m => m.stageType === 'G4');
    if (g4Candidates.length === 0) break;

    let feasible = filterFeasible(g4Candidates, gainValues, channels, gainStages, initialEirp, params);
    if (feasible.length === 0) {
      const relaxed = filterRelaxed(g4Candidates, gainValues, channels, gainStages, initialEirp, params);
      if (relaxed.length === 0) break;
      violations++;
      feasible = relaxed;
    }

    const best = pickBest(feasible, gainValues, channels, initialEirp, params);
    applyMove(best, gainValues);
    const step = recordStep(steps.length, best, gainValues, channels, gainStages, initialEirp);
    steps.push(step);
    const devs = trackDeviation(step, maxNegDev, maxPosDev);
    maxNegDev = devs.neg;
    maxPosDev = devs.pos;
  }

  return buildResult(steps, initialEirp, initialGainValues, gainValues, targetValues, granularities, channels, maxNegDev, maxPosDev, violations);
}

/**
 * Build G4 correction to oppose a primary move's EIRP impact.
 * Used in "before" mode: compute what the primary step will do, then pre-compensate.
 */
function buildG4Correction(
  primaryMove: CandidateMove,
  currentGainValues: Record<string, number>,
  channels: Channel[],
  couplingMap: Map<string, string[]>,
  granularities: Record<string, number>,
  gainStages: Map<string, GainStage>
): CandidateMove | null {
  // Simulate applying the primary move
  const tempGains = { ...currentGainValues };
  for (const step of primaryMove.steps) {
    tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
  }

  const beforeEirp = computeAllChannelEirp(channels, currentGainValues);
  const afterEirp = computeAllChannelEirp(channels, tempGains);

  return buildG4StepsFromDeviation(beforeEirp, afterEirp, channels, currentGainValues, granularities, gainStages);
}

/**
 * Build G4 correction based on current EIRP deviation from initial.
 * Used in "after" mode: primary step already applied, correct toward initial EIRP.
 */
function buildG4CorrectionFromEirp(
  currentGainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  couplingMap: Map<string, string[]>,
  granularities: Record<string, number>,
  gainStages: Map<string, GainStage>
): CandidateMove | null {
  const currentEirp = computeAllChannelEirp(channels, currentGainValues);
  return buildG4StepsFromDeviation(initialEirp, currentEirp, channels, currentGainValues, granularities, gainStages);
}

/**
 * Core G4 correction builder: for each channel with EIRP deviation,
 * compute the G4 delta that would oppose the deviation (quantized to G4 granularity).
 */
function buildG4StepsFromDeviation(
  referenceEirp: Record<string, number>,
  actualEirp: Record<string, number>,
  channels: Channel[],
  currentGainValues: Record<string, number>,
  granularities: Record<string, number>,
  gainStages: Map<string, GainStage>
): CandidateMove | null {
  const g4Steps: AtomicStep[] = [];

  for (const ch of channels) {
    const deviation = actualEirp[ch.id] - referenceEirp[ch.id]; // positive = EIRP too high
    if (Math.abs(deviation) < 0.001) continue;

    const g4Key = `G4:ch${ch.id}`;
    const g4Gran = granularities[g4Key];
    if (!g4Gran) continue;

    // Quantize the correction: oppose the deviation by the nearest whole number of steps
    const rawCorrection = -deviation;
    const numSteps = Math.round(rawCorrection / g4Gran);
    if (numSteps === 0) continue;

    const delta = numSteps * g4Gran;
    g4Steps.push({ gainStageKey: g4Key, delta });
  }

  if (g4Steps.length === 0) return null;

  return {
    steps: g4Steps,
    stageType: 'G4',
  };
}

// ─────────────────────────────────────────────────────────────────────
// Shared helpers
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

function allAtTarget(gainValues: Record<string, number>, targetValues: Record<string, number>, granularities: Record<string, number>): boolean {
  return Object.keys(targetValues).every(
    key => Math.abs(gainValues[key] - targetValues[key]) < granularities[key] * 0.01
  );
}

/**
 * Simulate primary move + G4 correction, returning the post-correction gain state.
 */
function simulateWithG4Correction(
  move: CandidateMove,
  gainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  granularities: Record<string, number>,
  gainStages: Map<string, GainStage>,
  mode: 'before' | 'after'
): Record<string, number> {
  const tempGains = { ...gainValues };

  if (mode === 'before') {
    // Simulate what the primary step will do, compute G4 correction, apply both
    const afterPrimary = { ...tempGains };
    for (const step of move.steps) {
      afterPrimary[step.gainStageKey] = (afterPrimary[step.gainStageKey] ?? 0) + step.delta;
    }
    const beforeEirp = computeAllChannelEirp(channels, tempGains);
    const afterEirp = computeAllChannelEirp(channels, afterPrimary);
    const g4Correction = buildG4StepsFromDeviation(beforeEirp, afterEirp, channels, tempGains, granularities, gainStages);
    if (g4Correction) {
      for (const step of g4Correction.steps) {
        tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
      }
    }
    for (const step of move.steps) {
      tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
    }
  } else {
    // Apply primary, then G4 correction
    for (const step of move.steps) {
      tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
    }
    const currentEirp = computeAllChannelEirp(channels, tempGains);
    const g4Correction = buildG4StepsFromDeviation(initialEirp, currentEirp, channels, tempGains, granularities, gainStages);
    if (g4Correction) {
      for (const step of g4Correction.steps) {
        tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
      }
    }
  }

  return tempGains;
}

/**
 * Filter feasible candidates considering G4 correction.
 * Checks power thresholds and EIRP limits on the post-correction state.
 */
function filterFeasibleWithG4(
  candidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  initialEirp: Record<string, number>,
  params: AlgorithmParams,
  granularities: Record<string, number>,
  couplingMap: Map<string, string[]>
): CandidateMove[] {
  const hasNegLimit = params.maxNegativeEirpDeviation !== null;
  const hasPosLimit = params.maxPositiveEirpDeviation !== null;

  return candidates.filter(move => {
    // First check power thresholds on the primary move alone
    if (!checkFeasibility(move, gainValues, channels, gainStages)) return false;

    // Then check post-G4-correction state for EIRP limits
    if (hasNegLimit || hasPosLimit) {
      const postGains = simulateWithG4Correction(
        move, gainValues, channels, initialEirp, granularities, gainStages, params.g4CompensationMode
      );
      const eirp = computeAllChannelEirp(channels, postGains);
      for (const ch of channels) {
        const dev = eirp[ch.id] - initialEirp[ch.id];
        if (hasNegLimit && dev < -(params.maxNegativeEirpDeviation! + 0.001)) return false;
        if (hasPosLimit && dev > params.maxPositiveEirpDeviation! + 0.001) return false;
      }
    }
    return true;
  });
}

function filterRelaxedWithG4(
  candidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  initialEirp: Record<string, number>,
  params: AlgorithmParams,
  granularities: Record<string, number>,
  couplingMap: Map<string, string[]>
): CandidateMove[] {
  const hasNegLimit = params.maxNegativeEirpDeviation !== null;
  const hasPosLimit = params.maxPositiveEirpDeviation !== null;

  return candidates.filter(move => {
    const tempGains = { ...gainValues };
    for (const step of move.steps) {
      tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
    }
    const powerLevels = computeAllPowerLevels(channels, tempGains);
    for (const [key, power] of Object.entries(powerLevels)) {
      const stage = gainStages.get(key);
      if (!stage) continue;
      if (power > stage.upperThreshold + 1.0 || power < stage.lowerThreshold - 1.0) return false;
    }
    if (hasNegLimit || hasPosLimit) {
      const postGains = simulateWithG4Correction(
        move, gainValues, channels, initialEirp, granularities, gainStages, params.g4CompensationMode
      );
      const eirp = computeAllChannelEirp(channels, postGains);
      for (const ch of channels) {
        const dev = eirp[ch.id] - initialEirp[ch.id];
        if (hasNegLimit && dev < -(params.maxNegativeEirpDeviation! + 0.001)) return false;
        if (hasPosLimit && dev > params.maxPositiveEirpDeviation! + 0.001) return false;
      }
    }
    return true;
  });
}

/**
 * Pick the best candidate, scoring based on post-G4-correction EIRP.
 */
function pickBestWithG4(
  feasible: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  params: AlgorithmParams,
  granularities: Record<string, number>,
  gainStages: Map<string, GainStage>,
  couplingMap: Map<string, string[]>
): CandidateMove {
  const scored = feasible.map(move => {
    // Score using the post-G4-correction EIRP state
    const postGains = simulateWithG4Correction(
      move, gainValues, channels, initialEirp, granularities, gainStages, params.g4CompensationMode
    );
    const eirp = computeAllChannelEirp(channels, postGains);
    let cost = 0;
    for (const ch of channels) {
      cost += Math.abs(eirp[ch.id] - initialEirp[ch.id]);
    }
    return { move, score: cost };
  });
  scored.sort((a, b) => {
    const diff = a.score - b.score;
    if (Math.abs(diff) > 0.001) return diff;
    return compareCandidates(a.move, b.move, params);
  });
  return scored[0].move;
}

function filterFeasible(
  candidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  initialEirp: Record<string, number>,
  params: AlgorithmParams
): CandidateMove[] {
  let feasible = candidates.filter(move => checkFeasibility(move, gainValues, channels, gainStages));

  const hasNegLimit = params.maxNegativeEirpDeviation !== null;
  const hasPosLimit = params.maxPositiveEirpDeviation !== null;

  if (hasNegLimit || hasPosLimit) {
    feasible = feasible.filter(move => {
      const tempGains = { ...gainValues };
      for (const step of move.steps) {
        tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
      }
      const eirp = computeAllChannelEirp(channels, tempGains);
      for (const ch of channels) {
        const dev = eirp[ch.id] - initialEirp[ch.id];
        if (hasNegLimit && dev < -(params.maxNegativeEirpDeviation! + 0.001)) return false;
        if (hasPosLimit && dev > params.maxPositiveEirpDeviation! + 0.001) return false;
      }
      return true;
    });
  }

  return feasible;
}

function filterRelaxed(
  candidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  initialEirp: Record<string, number>,
  params: AlgorithmParams
): CandidateMove[] {
  const hasNegLimit = params.maxNegativeEirpDeviation !== null;
  const hasPosLimit = params.maxPositiveEirpDeviation !== null;

  return candidates.filter(move => {
    const tempGains = { ...gainValues };
    for (const step of move.steps) {
      tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
    }
    const powerLevels = computeAllPowerLevels(channels, tempGains);
    for (const [key, power] of Object.entries(powerLevels)) {
      const stage = gainStages.get(key);
      if (!stage) continue;
      if (power > stage.upperThreshold + 1.0 || power < stage.lowerThreshold - 1.0) return false;
    }
    // EIRP deviation limits are never relaxed
    if (hasNegLimit || hasPosLimit) {
      const eirp = computeAllChannelEirp(channels, tempGains);
      for (const ch of channels) {
        const dev = eirp[ch.id] - initialEirp[ch.id];
        if (hasNegLimit && dev < -(params.maxNegativeEirpDeviation! + 0.001)) return false;
        if (hasPosLimit && dev > params.maxPositiveEirpDeviation! + 0.001) return false;
      }
    }
    return true;
  });
}

function pickBest(
  feasible: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  params: AlgorithmParams
): CandidateMove {
  const scored = feasible.map(move => ({
    move,
    score: scoreCandidate(move, gainValues, channels, initialEirp, params),
  }));
  scored.sort((a, b) => {
    const diff = a.score - b.score;
    if (Math.abs(diff) > 0.001) return diff;
    return compareCandidates(a.move, b.move, params);
  });
  return scored[0].move;
}

function applyMove(move: CandidateMove, gainValues: Record<string, number>) {
  for (const step of move.steps) {
    gainValues[step.gainStageKey] = (gainValues[step.gainStageKey] ?? 0) + step.delta;
  }
}

function recordStep(
  index: number,
  move: CandidateMove,
  gainValues: Record<string, number>,
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  initialEirp: Record<string, number>
): TransitionStep {
  const eirp = computeAllChannelEirp(channels, gainValues);
  const deviations: Record<string, number> = {};
  for (const ch of channels) {
    deviations[ch.id] = eirp[ch.id] - initialEirp[ch.id];
  }
  const powerLevels = computeAllPowerLevels(channels, gainValues);
  return {
    stepIndex: index,
    appliedMove: move,
    gainValues: { ...gainValues },
    channelEirp: eirp,
    channelEirpDeviation: deviations,
    powerLevels,
    cost: 0,
  };
}

function trackDeviation(step: TransitionStep, maxNeg: number, maxPos: number) {
  let neg = maxNeg;
  let pos = maxPos;
  for (const dev of Object.values(step.channelEirpDeviation)) {
    if (dev < neg) neg = dev;
    if (dev > pos) pos = dev;
  }
  return { neg, pos };
}

function buildResult(
  steps: TransitionStep[],
  initialEirp: Record<string, number>,
  initialGainValues: Record<string, number>,
  gainValues: Record<string, number>,
  targetValues: Record<string, number>,
  granularities: Record<string, number>,
  channels: Channel[],
  maxNegDev: number,
  maxPosDev: number,
  violations: number
): TransitionResult {
  const finalEirp = computeAllChannelEirp(channels, gainValues);
  const converged = allAtTarget(gainValues, targetValues, granularities);
  return {
    steps,
    initialEirp,
    finalEirp,
    initialGainValues,
    targetGainValues: { ...targetValues },
    maxNegativeDeviation: maxNegDev,
    maxPositiveDeviation: maxPosDev,
    totalSteps: steps.length,
    thresholdViolations: violations,
    converged,
  };
}
