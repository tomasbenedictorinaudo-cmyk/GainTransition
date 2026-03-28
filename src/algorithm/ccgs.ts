import type {
  AlgorithmParams,
  CandidateMove,
  TransitionStep,
  TransitionResult,
  Channel,
  GainStage,
} from '../types';
import { buildCouplingMap, getChannelGainChain } from '../core/coupling';
import { computeAllChannelEirp } from '../core/eirp';
import { computeAllPowerLevels } from '../core/power';
import { generateSingleSteps, generateCompensatingPairs } from './candidates';
import { checkFeasibility } from './feasibility';
import { scoreCandidate, compareCandidates } from './scoring';

export const DEFAULT_PARAMS: AlgorithmParams = {
  negativeWeight: 3.0,
  positiveWeight: 1.0,
  preferCompensatingPairs: true,
  maxIterations: 5000,
  strategy: 'greedy',
};

/**
 * Run the Constrained Coordinated Gain Stepping algorithm.
 */
export function runCCGS(
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  params: AlgorithmParams = DEFAULT_PARAMS
): TransitionResult {
  // Build derived structures
  const couplingMap = buildCouplingMap(channels);
  const channelGainChains: Record<string, string[]> = {};
  for (const ch of channels) {
    channelGainChains[ch.id] = getChannelGainChain(ch);
  }

  // Initialize gain values and targets
  const gainValues: Record<string, number> = {};
  const targetValues: Record<string, number> = {};
  const granularities: Record<string, number> = {};

  for (const [key, stage] of gainStages) {
    gainValues[key] = stage.currentValue;
    targetValues[key] = stage.targetValue;
    granularities[key] = stage.stepGranularity;
  }

  // Compute initial EIRP
  const initialEirp = computeAllChannelEirp(channels, gainValues);
  const initialGainValues = { ...gainValues };

  const steps: TransitionStep[] = [];
  let maxNegDev = 0;
  let maxPosDev = 0;
  let violations = 0;

  // Main loop
  for (let iter = 0; iter < params.maxIterations; iter++) {
    // Check if we've reached all targets
    const allAtTarget = Object.keys(targetValues).every(
      key => Math.abs(gainValues[key] - targetValues[key]) < granularities[key] * 0.01
    );

    if (allAtTarget) break;

    // Generate candidates
    const singleSteps = generateSingleSteps(gainValues, targetValues, granularities);
    const compensatingPairs = params.preferCompensatingPairs
      ? generateCompensatingPairs(gainValues, targetValues, granularities, couplingMap, channelGainChains)
      : [];

    const allCandidates = [...compensatingPairs, ...singleSteps];

    if (allCandidates.length === 0) break;

    // Filter feasible
    const feasible = allCandidates.filter(move =>
      checkFeasibility(move, gainValues, channels, gainStages)
    );

    if (feasible.length === 0) {
      // No feasible move — try just single steps with relaxed threshold (allow 1dB over)
      // This is the deadlock resolution
      violations++;
      const relaxedFeasible = singleSteps.filter(move => {
        const tempGains = { ...gainValues };
        for (const step of move.steps) {
          tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
        }
        const powerLevels = computeAllPowerLevels(channels, tempGains);
        for (const [key, power] of Object.entries(powerLevels)) {
          const stage = gainStages.get(key);
          if (!stage) continue;
          if (power > stage.upperThreshold + 1.0 || power < stage.lowerThreshold - 1.0) {
            return false;
          }
        }
        return true;
      });

      if (relaxedFeasible.length === 0) break; // truly stuck

      // Pick the one that makes most progress toward target
      const best = relaxedFeasible.sort((a, b) => {
        const scoreA = scoreCandidate(a, gainValues, channels, initialEirp, params);
        const scoreB = scoreCandidate(b, gainValues, channels, initialEirp, params);
        return scoreA - scoreB;
      })[0];

      applyMove(best, gainValues);
      const stepData = recordStep(iter, best, gainValues, channels, gainStages, initialEirp);
      steps.push(stepData);
      updateDeviation(stepData, initialEirp);
      continue;
    }

    // Score and sort feasible candidates
    const scored = feasible.map(move => ({
      move,
      score: scoreCandidate(move, gainValues, channels, initialEirp, params),
    }));

    scored.sort((a, b) => {
      const scoreDiff = a.score - b.score;
      if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
      return compareCandidates(a.move, b.move, params);
    });

    const best = scored[0].move;

    // Apply the best move
    applyMove(best, gainValues);
    const stepData = recordStep(iter, best, gainValues, channels, gainStages, initialEirp);
    steps.push(stepData);

    // Track max deviations
    for (const [, dev] of Object.entries(stepData.channelEirpDeviation)) {
      if (dev < maxNegDev) maxNegDev = dev;
      if (dev > maxPosDev) maxPosDev = dev;
    }
  }

  const finalEirp = computeAllChannelEirp(channels, gainValues);
  const converged = Object.keys(targetValues).every(
    key => Math.abs(gainValues[key] - targetValues[key]) < granularities[key] * 0.01
  );

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

  function updateDeviation(step: TransitionStep, initEirp: Record<string, number>) {
    for (const [, dev] of Object.entries(step.channelEirpDeviation)) {
      if (dev < maxNegDev) maxNegDev = dev;
      if (dev > maxPosDev) maxPosDev = dev;
    }
  }
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
    cost: 0, // already applied
  };
}
