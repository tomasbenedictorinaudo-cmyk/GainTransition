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
import { checkFeasibility } from './feasibility';
import { serializeGainStageId } from '../core/serialization';

/**
 * G4-Compensated algorithm:
 *
 * Phase 1 — Apply all non-G4 gain changes, using G4 to absorb the EIRP delta.
 *   For each non-G4 atomic step, simultaneously adjust G4 on each affected channel
 *   by the opposite amount (quantized to G4's granularity).
 *   Order: per-channel gains (G3, G5) first, then shared gains (G1, G2, G6, G7).
 *
 * Phase 2 — Step each G4 from its intermediate value to its final target.
 *   These steps cause EIRP deviation, but all other gains are already settled.
 */
export function runG4Compensated(
  channels: Channel[],
  gainStages: Map<string, GainStage>,
  params: AlgorithmParams
): TransitionResult {
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

  const initialEirp = computeAllChannelEirp(channels, gainValues);
  const initialGainValues = { ...gainValues };

  const steps: TransitionStep[] = [];
  let maxNegDev = 0;
  let maxPosDev = 0;
  let violations = 0;
  let stepCounter = 0;

  // Identify all G4 keys and non-G4 keys
  const g4Keys = new Set<string>();
  const nonG4Keys: string[] = [];

  for (const key of Object.keys(targetValues)) {
    if (key.startsWith('G4:')) {
      g4Keys.add(key);
    } else {
      nonG4Keys.push(key);
    }
  }

  // Sort non-G4 keys: per-channel (G3, G5) first, then shared (G1, G2, G6, G7)
  const perChannelPrefixes = ['G3:', 'G5:'];
  const sharedPrefixes = ['G2:', 'G6:', 'G1:', 'G7:'];

  function stageOrder(key: string): number {
    for (let i = 0; i < perChannelPrefixes.length; i++) {
      if (key.startsWith(perChannelPrefixes[i])) return i;
    }
    for (let i = 0; i < sharedPrefixes.length; i++) {
      if (key.startsWith(sharedPrefixes[i])) return perChannelPrefixes.length + i;
    }
    return 99;
  }

  nonG4Keys.sort((a, b) => stageOrder(a) - stageOrder(b));

  // ========================================
  // PHASE 1: Apply non-G4 gains with G4 compensation
  // ========================================

  for (const key of nonG4Keys) {
    const target = targetValues[key];
    const gran = granularities[key];

    // Step this gain toward target one granularity at a time
    while (Math.abs(gainValues[key] - target) >= gran * 0.01) {
      if (stepCounter >= params.maxIterations) break;

      const remaining = target - gainValues[key];
      const delta = remaining > 0 ? gran : -gran;

      // Find affected channels
      const affectedChannelIds = couplingMap.get(key) || [];

      // Build the composite move: primary step + G4 compensations
      const moveSteps = [{ gainStageKey: key, delta }];

      for (const chId of affectedChannelIds) {
        const g4Key = serializeGainStageId({ type: 'G4', channelId: chId });
        if (!g4Keys.has(g4Key)) continue;

        const g4Gran = granularities[g4Key];
        if (!g4Gran) continue;

        // Desired compensation: oppose the EIRP change caused by the primary step
        // The primary step changes EIRP by +delta, so we want G4 to change by -delta
        // Quantize to G4 granularity: pick the closest multiple
        const desiredComp = -delta;
        const compSteps = Math.round(desiredComp / g4Gran);
        const actualComp = compSteps * g4Gran;

        if (Math.abs(actualComp) >= g4Gran * 0.5) {
          moveSteps.push({ gainStageKey: g4Key, delta: actualComp });
        }
      }

      const move: CandidateMove = {
        steps: moveSteps,
        isCompensatingPair: moveSteps.length > 1,
      };

      // Check feasibility
      const feasible = checkFeasibility(move, gainValues, channels, gainStages);

      if (feasible) {
        // Check EIRP deviation constraint if set
        let eirpOk = true;
        if (params.maxEirpDeviation !== null) {
          const tempGains = { ...gainValues };
          for (const s of move.steps) {
            tempGains[s.gainStageKey] = (tempGains[s.gainStageKey] ?? 0) + s.delta;
          }
          const eirp = computeAllChannelEirp(channels, tempGains);
          for (const ch of channels) {
            if (Math.abs(eirp[ch.id] - initialEirp[ch.id]) > params.maxEirpDeviation + 0.001) {
              eirpOk = false;
              break;
            }
          }
        }

        if (eirpOk) {
          applyMove(move, gainValues);
          const stepData = recordStep(stepCounter, move, gainValues, channels, gainStages, initialEirp);
          steps.push(stepData);
          trackDeviations(stepData);
          stepCounter++;
          continue;
        }
      }

      // If pair not feasible, try just the primary step alone
      const singleMove: CandidateMove = {
        steps: [{ gainStageKey: key, delta }],
        isCompensatingPair: false,
      };

      if (checkFeasibility(singleMove, gainValues, channels, gainStages)) {
        let eirpOk = true;
        if (params.maxEirpDeviation !== null) {
          const tempGains = { ...gainValues };
          tempGains[key] = (tempGains[key] ?? 0) + delta;
          const eirp = computeAllChannelEirp(channels, tempGains);
          for (const ch of channels) {
            if (Math.abs(eirp[ch.id] - initialEirp[ch.id]) > params.maxEirpDeviation + 0.001) {
              eirpOk = false;
              break;
            }
          }
        }

        if (eirpOk) {
          applyMove(singleMove, gainValues);
          const stepData = recordStep(stepCounter, singleMove, gainValues, channels, gainStages, initialEirp);
          steps.push(stepData);
          trackDeviations(stepData);
          stepCounter++;
          continue;
        }
      }

      // Deadlock: try relaxed thresholds
      violations++;
      const relaxedMove = tryRelaxed(singleMove, gainValues, channels, gainStages);
      if (relaxedMove) {
        applyMove(singleMove, gainValues);
        const stepData = recordStep(stepCounter, singleMove, gainValues, channels, gainStages, initialEirp);
        steps.push(stepData);
        trackDeviations(stepData);
        stepCounter++;
      } else {
        break; // truly stuck
      }
    }

    if (stepCounter >= params.maxIterations) break;
  }

  // ========================================
  // PHASE 2: Step each G4 to its final target
  // ========================================

  // Sort G4 keys for deterministic ordering
  const g4KeysSorted = Array.from(g4Keys).sort();

  // Interleave G4 steps: pick the G4 with the largest remaining delta each iteration
  // This distributes the EIRP impact more evenly
  let g4Remaining = true;
  while (g4Remaining && stepCounter < params.maxIterations) {
    g4Remaining = false;

    // Score all G4s by remaining delta, pick the one causing least cost
    let bestG4Move: CandidateMove | null = null;
    let bestG4Cost = Infinity;

    for (const g4Key of g4KeysSorted) {
      const target = targetValues[g4Key];
      const gran = granularities[g4Key];
      const remaining = target - gainValues[g4Key];

      if (Math.abs(remaining) < gran * 0.01) continue;

      g4Remaining = true;
      const delta = remaining > 0 ? gran : -gran;

      const move: CandidateMove = {
        steps: [{ gainStageKey: g4Key, delta }],
        isCompensatingPair: false,
      };

      if (!checkFeasibility(move, gainValues, channels, gainStages)) continue;

      // Check EIRP deviation constraint
      if (params.maxEirpDeviation !== null) {
        const tempGains = { ...gainValues };
        tempGains[g4Key] = (tempGains[g4Key] ?? 0) + delta;
        const eirp = computeAllChannelEirp(channels, tempGains);
        let ok = true;
        for (const ch of channels) {
          if (Math.abs(eirp[ch.id] - initialEirp[ch.id]) > params.maxEirpDeviation + 0.001) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }

      // Compute cost (asymmetric)
      const tempGains = { ...gainValues };
      tempGains[g4Key] = (tempGains[g4Key] ?? 0) + delta;
      const eirp = computeAllChannelEirp(channels, tempGains);
      let cost = 0;
      for (const ch of channels) {
        const dev = eirp[ch.id] - initialEirp[ch.id];
        if (dev < 0) cost += params.negativeWeight * Math.abs(dev);
        else cost += params.positiveWeight * dev;
      }

      if (cost < bestG4Cost) {
        bestG4Cost = cost;
        bestG4Move = move;
      }
    }

    if (!g4Remaining) break;

    if (bestG4Move) {
      applyMove(bestG4Move, gainValues);
      const stepData = recordStep(stepCounter, bestG4Move, gainValues, channels, gainStages, initialEirp);
      steps.push(stepData);
      trackDeviations(stepData);
      stepCounter++;
    } else {
      // All remaining G4 steps are infeasible — try with relaxed thresholds
      let madeProgress = false;
      for (const g4Key of g4KeysSorted) {
        const target = targetValues[g4Key];
        const gran = granularities[g4Key];
        const remaining = target - gainValues[g4Key];
        if (Math.abs(remaining) < gran * 0.01) continue;

        const delta = remaining > 0 ? gran : -gran;
        const move: CandidateMove = {
          steps: [{ gainStageKey: g4Key, delta }],
          isCompensatingPair: false,
        };

        if (tryRelaxed(move, gainValues, channels, gainStages)) {
          violations++;
          applyMove(move, gainValues);
          const stepData = recordStep(stepCounter, move, gainValues, channels, gainStages, initialEirp);
          steps.push(stepData);
          trackDeviations(stepData);
          stepCounter++;
          madeProgress = true;
          break;
        }
      }
      if (!madeProgress) break; // truly stuck
    }
  }

  // Finalize
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

  // --- helpers ---

  function trackDeviations(step: TransitionStep) {
    for (const dev of Object.values(step.channelEirpDeviation)) {
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

function tryRelaxed(
  move: CandidateMove,
  gainValues: Record<string, number>,
  channels: Channel[],
  gainStages: Map<string, GainStage>
): boolean {
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
