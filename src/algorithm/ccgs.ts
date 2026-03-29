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
import { scoreCandidate, compareCandidates } from './scoring';

export const DEFAULT_PARAMS: AlgorithmParams = {
  maxNegativeEirpDeviation: null,
  maxPositiveEirpDeviation: null,
  maxIterations: 5000,
  strategy: 'greedy',
  g4CompensationMode: 'after',
};

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
  const initialSystemTemp = computeAllSystemTemp(channels, gainValues, gainStages);
  const initialGainValues = { ...gainValues };
  const hasEirpLimits = params.maxNegativeEirpDeviation !== null || params.maxPositiveEirpDeviation !== null;

  const steps: TransitionStep[] = [];
  let maxNegDev = 0;
  let maxPosDev = 0;
  let violations = 0;

  for (let iter = 0; iter < params.maxIterations; iter++) {
    if (allAtTarget(gainValues, targetValues, granularities)) break;

    const candidates = generateCandidateMoves(gainValues, targetValues, granularities);
    if (candidates.length === 0) break;

    // Step 1: filter by power thresholds
    let feasible = candidates.filter(move => checkFeasibility(move, gainValues, channels, gainStages));

    if (feasible.length === 0) {
      // Relax power thresholds by 1 dB
      feasible = filterRelaxedPower(candidates, gainValues, channels, gainStages);
      if (feasible.length === 0) break; // power-stuck
      violations++;
    }

    // Step 2: if EIRP limits are set, filter by EIRP
    if (hasEirpLimits) {
      const eirpFiltered = filterByEirpLimits(feasible, gainValues, channels, initialEirp, params);
      if (eirpFiltered.length === 0) {
        // EIRP limits infeasible — return error
        return buildError(
          steps, initialEirp, initialSystemTemp, initialGainValues, gainValues, targetValues,
          granularities, channels, maxNegDev, maxPosDev, violations,
          buildEirpErrorMessage(feasible, gainValues, channels, initialEirp, params)
        );
      }
      feasible = eirpFiltered;
    }

    // Step 3: pick the move with most progress
    const best = pickBest(feasible, gainValues, channels, initialEirp, params);
    applyMove(best, gainValues);
    const step = recordStep(steps.length, best, gainValues, channels, gainStages, initialEirp);
    steps.push(step);
    const devs = trackDeviation(step, maxNegDev, maxPosDev);
    maxNegDev = devs.neg;
    maxPosDev = devs.pos;
  }

  return buildResult(steps, initialEirp, initialSystemTemp, initialGainValues, gainValues, targetValues, granularities, channels, maxNegDev, maxPosDev, violations);
}

// ─────────────────────────────────────────────────────────────────────
// G4-Compensated strategy
// ─────────────────────────────────────────────────────────────────────

function runG4Compensated(
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  params: AlgorithmParams
): TransitionResult {
  const { gainValues, targetValues, granularities } = initState(gainStages);
  const couplingMap = buildCouplingMap(channels);
  const initialEirp = computeAllChannelEirp(channels, gainValues);
  const initialSystemTemp = computeAllSystemTemp(channels, gainValues, gainStages);
  const initialGainValues = { ...gainValues };
  const hasEirpLimits = params.maxNegativeEirpDeviation !== null || params.maxPositiveEirpDeviation !== null;

  const steps: TransitionStep[] = [];
  let maxNegDev = 0;
  let maxPosDev = 0;
  let violations = 0;

  const excludeG4 = new Set(['G4']);

  // ── Phase 1: non-G4 gains with G4 compensation ──
  for (let iter = 0; iter < params.maxIterations; iter++) {
    const nonG4AtTarget = Object.keys(targetValues).every(key => {
      if (key.startsWith('G4:')) return true;
      return Math.abs(gainValues[key] - targetValues[key]) < granularities[key] * 0.01;
    });
    if (nonG4AtTarget) break;

    const candidates = generateCandidateMoves(gainValues, targetValues, granularities, excludeG4);
    if (candidates.length === 0) break;

    // Power threshold check
    let feasible = candidates.filter(move => checkFeasibility(move, gainValues, channels, gainStages));
    if (feasible.length === 0) {
      feasible = filterRelaxedPower(candidates, gainValues, channels, gainStages);
      if (feasible.length === 0) break;
      violations++;
    }

    // EIRP check (on post-G4-correction state)
    if (hasEirpLimits) {
      const eirpFiltered = filterByEirpLimitsWithG4(
        feasible, gainValues, channels, initialEirp, params, granularities, gainStages
      );
      if (eirpFiltered.length === 0) {
        return buildError(
          steps, initialEirp, initialSystemTemp, initialGainValues, gainValues, targetValues,
          granularities, channels, maxNegDev, maxPosDev, violations,
          buildEirpErrorMessageWithG4(feasible, gainValues, channels, initialEirp, params, granularities, gainStages)
        );
      }
      feasible = eirpFiltered;
    }

    // Pick best by progress
    const best = pickBest(feasible, gainValues, channels, initialEirp, params);

    if (params.g4CompensationMode === 'before') {
      const g4Step = buildG4Correction(best, gainValues, channels, couplingMap, granularities, gainStages);
      if (g4Step) {
        applyMove(g4Step, gainValues);
        const s = recordStep(steps.length, g4Step, gainValues, channels, gainStages, initialEirp);
        steps.push(s);
        const d = trackDeviation(s, maxNegDev, maxPosDev);
        maxNegDev = d.neg; maxPosDev = d.pos;
      }
      applyMove(best, gainValues);
      const s2 = recordStep(steps.length, best, gainValues, channels, gainStages, initialEirp);
      steps.push(s2);
      const d2 = trackDeviation(s2, maxNegDev, maxPosDev);
      maxNegDev = d2.neg; maxPosDev = d2.pos;
    } else {
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

    const g4Only = generateCandidateMoves(gainValues, targetValues, granularities);
    const g4Candidates = g4Only.filter(m => m.stageType === 'G4');
    if (g4Candidates.length === 0) break;

    let feasible = g4Candidates.filter(move => checkFeasibility(move, gainValues, channels, gainStages));
    if (feasible.length === 0) {
      feasible = filterRelaxedPower(g4Candidates, gainValues, channels, gainStages);
      if (feasible.length === 0) break;
      violations++;
    }

    if (hasEirpLimits) {
      const eirpFiltered = filterByEirpLimits(feasible, gainValues, channels, initialEirp, params);
      if (eirpFiltered.length === 0) {
        return buildError(
          steps, initialEirp, initialSystemTemp, initialGainValues, gainValues, targetValues,
          granularities, channels, maxNegDev, maxPosDev, violations,
          buildEirpErrorMessage(feasible, gainValues, channels, initialEirp, params)
        );
      }
      feasible = eirpFiltered;
    }

    const best = pickBest(feasible, gainValues, channels, initialEirp, params);
    applyMove(best, gainValues);
    const step = recordStep(steps.length, best, gainValues, channels, gainStages, initialEirp);
    steps.push(step);
    const devs = trackDeviation(step, maxNegDev, maxPosDev);
    maxNegDev = devs.neg;
    maxPosDev = devs.pos;
  }

  return buildResult(steps, initialEirp, initialSystemTemp, initialGainValues, gainValues, targetValues, granularities, channels, maxNegDev, maxPosDev, violations);
}

// ─────────────────────────────────────────────────────────────────────
// G4 correction helpers
// ─────────────────────────────────────────────────────────────────────

function buildG4Correction(
  primaryMove: CandidateMove,
  currentGainValues: Record<string, number>,
  channels: Channel[],
  couplingMap: Map<string, string[]>,
  granularities: Record<string, number>,
  gainStages: Map<string, GainStage>
): CandidateMove | null {
  const tempGains = { ...currentGainValues };
  for (const step of primaryMove.steps) {
    tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
  }
  const beforeEirp = computeAllChannelEirp(channels, currentGainValues);
  const afterEirp = computeAllChannelEirp(channels, tempGains);
  return buildG4StepsFromDeviation(beforeEirp, afterEirp, channels, currentGainValues, granularities, gainStages);
}

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
    const deviation = actualEirp[ch.id] - referenceEirp[ch.id];
    if (Math.abs(deviation) < 0.001) continue;

    const g4Key = `G4:ch${ch.id}`;
    const g4Gran = granularities[g4Key];
    if (!g4Gran) continue;

    const rawCorrection = -deviation;
    const numSteps = Math.round(rawCorrection / g4Gran);
    if (numSteps === 0) continue;

    g4Steps.push({ gainStageKey: g4Key, delta: numSteps * g4Gran });
  }

  if (g4Steps.length === 0) return null;
  return { steps: g4Steps, stageType: 'G4' };
}

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

// ─────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────

/** Relax power thresholds by 1 dB (no EIRP check) */
function filterRelaxedPower(
  candidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  gainStages: Map<string, GainStage>
): CandidateMove[] {
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
    return true;
  });
}

/** Filter by EIRP deviation limits (standard mode) */
function filterByEirpLimits(
  candidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  params: AlgorithmParams
): CandidateMove[] {
  const negLimit = params.maxNegativeEirpDeviation;
  const posLimit = params.maxPositiveEirpDeviation;

  return candidates.filter(move => {
    const tempGains = { ...gainValues };
    for (const step of move.steps) {
      tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
    }
    const eirp = computeAllChannelEirp(channels, tempGains);
    for (const ch of channels) {
      const dev = eirp[ch.id] - initialEirp[ch.id];
      if (negLimit !== null && dev < -(negLimit + 0.001)) return false;
      if (posLimit !== null && dev > posLimit + 0.001) return false;
    }
    return true;
  });
}

/**
 * Filter by EIRP deviation limits checking ALL intermediate states
 * in the G4-compensated sequence. Both the post-primary state (before G4)
 * and the post-G4-correction state must satisfy the limits, because both
 * are recorded as separate transition steps.
 */
function filterByEirpLimitsWithG4(
  candidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  params: AlgorithmParams,
  granularities: Record<string, number>,
  gainStages: Map<string, GainStage>
): CandidateMove[] {
  const negLimit = params.maxNegativeEirpDeviation;
  const posLimit = params.maxPositiveEirpDeviation;

  return candidates.filter(move => {
    // Check each intermediate state in the two-step sequence

    if (params.g4CompensationMode === 'before') {
      // Sequence: G4 pre-correction → primary step
      // State 1: after G4 pre-correction (before primary)
      const preGains = { ...gainValues };
      const afterPrimary = { ...gainValues };
      for (const step of move.steps) {
        afterPrimary[step.gainStageKey] = (afterPrimary[step.gainStageKey] ?? 0) + step.delta;
      }
      const beforeEirp = computeAllChannelEirp(channels, gainValues);
      const afterEirp = computeAllChannelEirp(channels, afterPrimary);
      const g4Correction = buildG4StepsFromDeviation(beforeEirp, afterEirp, channels, gainValues, granularities, gainStages);
      if (g4Correction) {
        for (const step of g4Correction.steps) {
          preGains[step.gainStageKey] = (preGains[step.gainStageKey] ?? 0) + step.delta;
        }
      }
      // Check state after G4 pre-correction
      const eirp1 = computeAllChannelEirp(channels, preGains);
      if (!checkEirpWithinLimits(eirp1, initialEirp, channels, negLimit, posLimit)) return false;

      // State 2: after primary step
      for (const step of move.steps) {
        preGains[step.gainStageKey] = (preGains[step.gainStageKey] ?? 0) + step.delta;
      }
      const eirp2 = computeAllChannelEirp(channels, preGains);
      if (!checkEirpWithinLimits(eirp2, initialEirp, channels, negLimit, posLimit)) return false;

    } else {
      // Sequence: primary step → G4 correction
      // State 1: after primary step (before G4)
      const tempGains = { ...gainValues };
      for (const step of move.steps) {
        tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
      }
      const eirp1 = computeAllChannelEirp(channels, tempGains);
      if (!checkEirpWithinLimits(eirp1, initialEirp, channels, negLimit, posLimit)) return false;

      // State 2: after G4 correction
      const currentEirp = computeAllChannelEirp(channels, tempGains);
      const g4Correction = buildG4StepsFromDeviation(initialEirp, currentEirp, channels, tempGains, granularities, gainStages);
      if (g4Correction) {
        for (const step of g4Correction.steps) {
          tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
        }
      }
      const eirp2 = computeAllChannelEirp(channels, tempGains);
      if (!checkEirpWithinLimits(eirp2, initialEirp, channels, negLimit, posLimit)) return false;
    }

    return true;
  });
}

function checkEirpWithinLimits(
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

// ─────────────────────────────────────────────────────────────────────
// Selection
// ─────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────
// Error message builders
// ─────────────────────────────────────────────────────────────────────

function buildEirpErrorMessage(
  powerFeasibleCandidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  params: AlgorithmParams
): string {
  // Find the best achievable deviation among power-feasible candidates
  let bestWorstDev = Infinity;
  for (const move of powerFeasibleCandidates) {
    const tempGains = { ...gainValues };
    for (const step of move.steps) {
      tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
    }
    const eirp = computeAllChannelEirp(channels, tempGains);
    let worstDev = 0;
    for (const ch of channels) {
      const dev = Math.abs(eirp[ch.id] - initialEirp[ch.id]);
      if (dev > worstDev) worstDev = dev;
    }
    if (worstDev < bestWorstDev) bestWorstDev = worstDev;
  }

  const negLimit = params.maxNegativeEirpDeviation;
  const posLimit = params.maxPositiveEirpDeviation;
  const limitStr = [
    negLimit !== null ? `−${negLimit.toFixed(2)}` : null,
    posLimit !== null ? `+${posLimit.toFixed(2)}` : null,
  ].filter(Boolean).join(' / ');

  return `EIRP deviation limits (${limitStr} dB) are infeasible. The smallest achievable worst-case deviation is ±${bestWorstDev.toFixed(2)} dB. Widen the limits or adjust gain granularities.`;
}

function buildEirpErrorMessageWithG4(
  powerFeasibleCandidates: CandidateMove[],
  gainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  params: AlgorithmParams,
  granularities: Record<string, number>,
  gainStages: Map<string, GainStage>
): string {
  let bestWorstDev = Infinity;
  for (const move of powerFeasibleCandidates) {
    // Check the intermediate state (primary step without G4) — this is the bottleneck
    const tempGains = { ...gainValues };
    for (const step of move.steps) {
      tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
    }
    const intermediateEirp = computeAllChannelEirp(channels, tempGains);
    let worstDev = 0;
    for (const ch of channels) {
      const dev = Math.abs(intermediateEirp[ch.id] - initialEirp[ch.id]);
      if (dev > worstDev) worstDev = dev;
    }
    if (worstDev < bestWorstDev) bestWorstDev = worstDev;
  }

  const negLimit = params.maxNegativeEirpDeviation;
  const posLimit = params.maxPositiveEirpDeviation;
  const limitStr = [
    negLimit !== null ? `−${negLimit.toFixed(2)}` : null,
    posLimit !== null ? `+${posLimit.toFixed(2)}` : null,
  ].filter(Boolean).join(' / ');

  return `EIRP deviation limits (${limitStr} dB) are infeasible (with G4 compensation). The smallest achievable worst-case deviation is ±${bestWorstDev.toFixed(2)} dB. Widen the limits or adjust gain granularities.`;
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
  const systemTemp = computeAllSystemTemp(channels, gainValues, gainStages);
  return {
    stepIndex: index,
    appliedMove: move,
    gainValues: { ...gainValues },
    channelEirp: eirp,
    channelEirpDeviation: deviations,
    powerLevels,
    systemTemp,
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
  initialSystemTemp: Record<string, number>,
  initialGainValues: Record<string, number>,
  gainValues: Record<string, number>,
  targetValues: Record<string, number>,
  granularities: Record<string, number>,
  channels: Channel[],
  maxNegDev: number,
  maxPosDev: number,
  violations: number
): TransitionResult {
  return {
    steps,
    initialEirp,
    finalEirp: computeAllChannelEirp(channels, gainValues),
    initialGainValues,
    targetGainValues: { ...targetValues },
    initialSystemTemp,
    maxNegativeDeviation: maxNegDev,
    maxPositiveDeviation: maxPosDev,
    totalSteps: steps.length,
    thresholdViolations: violations,
    converged: allAtTarget(gainValues, targetValues, granularities),
    error: null,
  };
}

function buildError(
  steps: TransitionStep[],
  initialEirp: Record<string, number>,
  initialSystemTemp: Record<string, number>,
  initialGainValues: Record<string, number>,
  gainValues: Record<string, number>,
  targetValues: Record<string, number>,
  granularities: Record<string, number>,
  channels: Channel[],
  maxNegDev: number,
  maxPosDev: number,
  violations: number,
  errorMessage: string
): TransitionResult {
  return {
    steps,
    initialEirp,
    finalEirp: computeAllChannelEirp(channels, gainValues),
    initialGainValues,
    targetGainValues: { ...targetValues },
    initialSystemTemp,
    maxNegativeDeviation: maxNegDev,
    maxPositiveDeviation: maxPosDev,
    totalSteps: steps.length,
    thresholdViolations: violations,
    converged: false,
    error: errorMessage,
  };
}
