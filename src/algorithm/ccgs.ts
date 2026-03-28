import type {
  AlgorithmParams,
  CandidateMove,
  TransitionStep,
  TransitionResult,
  Channel,
  GainStage,
} from '../types';
import { computeAllChannelEirp } from '../core/eirp';
import { computeAllPowerLevels } from '../core/power';
import { generateCandidateMoves } from './candidates';
import { checkFeasibility } from './feasibility';
import { scoreCandidate, compareCandidates } from './scoring';

export const DEFAULT_PARAMS: AlgorithmParams = {
  negativeWeight: 3.0,
  positiveWeight: 1.0,
  maxIterations: 5000,
  strategy: 'greedy',
  maxEirpDeviation: null,
};

/**
 * Run the Constrained Coordinated Gain Stepping algorithm.
 *
 * Each iteration changes gains from exactly one stage type (Gn).
 * Analog stages (G1, G7): one antenna per iteration.
 * Digital stages (G2-G6): all instances of that type move together.
 */
export function runCCGS(
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  params: AlgorithmParams = DEFAULT_PARAMS
): TransitionResult {
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

    // Generate candidates (grouped by stage type)
    const candidates = generateCandidateMoves(gainValues, targetValues, granularities);

    if (candidates.length === 0) break;

    // Filter feasible (power thresholds)
    let feasible = candidates.filter(move =>
      checkFeasibility(move, gainValues, channels, gainStages)
    );

    // Filter by max EIRP deviation constraint
    if (params.maxEirpDeviation !== null) {
      const maxDev = params.maxEirpDeviation;
      feasible = feasible.filter(move => {
        const tempGains = { ...gainValues };
        for (const step of move.steps) {
          tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
        }
        const eirp = computeAllChannelEirp(channels, tempGains);
        for (const ch of channels) {
          const dev = Math.abs(eirp[ch.id] - initialEirp[ch.id]);
          if (dev > maxDev + 0.001) return false;
        }
        return true;
      });
    }

    if (feasible.length === 0) {
      // Deadlock resolution: try with relaxed thresholds (+/- 1dB)
      violations++;
      const relaxedFeasible = candidates.filter(move => {
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
        // Still enforce EIRP constraint if set
        if (params.maxEirpDeviation !== null) {
          const eirp = computeAllChannelEirp(channels, tempGains);
          for (const ch of channels) {
            const dev = Math.abs(eirp[ch.id] - initialEirp[ch.id]);
            if (dev > params.maxEirpDeviation + 0.001) return false;
          }
        }
        return true;
      });

      if (relaxedFeasible.length === 0) break; // truly stuck

      const best = relaxedFeasible.sort((a, b) => {
        const scoreA = scoreCandidate(a, gainValues, channels, initialEirp, params);
        const scoreB = scoreCandidate(b, gainValues, channels, initialEirp, params);
        return scoreA - scoreB;
      })[0];

      applyMove(best, gainValues);
      const stepData = recordStep(iter, best, gainValues, channels, gainStages, initialEirp);
      steps.push(stepData);
      updateDeviation(stepData);
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
    updateDeviation(stepData);
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

  function updateDeviation(step: TransitionStep) {
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
    cost: 0,
  };
}
