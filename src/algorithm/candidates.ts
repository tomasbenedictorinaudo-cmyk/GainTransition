import type { AtomicStep, CandidateMove } from '../types';
import type { CouplingMap } from '../core/coupling';
import { isSharedGain } from '../core/coupling';

/**
 * Generate all single atomic steps: one per gain stage that still has remaining delta.
 */
export function generateSingleSteps(
  gainValues: Record<string, number>,
  targetValues: Record<string, number>,
  granularities: Record<string, number>
): CandidateMove[] {
  const moves: CandidateMove[] = [];

  for (const key of Object.keys(targetValues)) {
    const current = gainValues[key];
    const target = targetValues[key];
    const gran = granularities[key];
    const remaining = target - current;

    if (Math.abs(remaining) < gran * 0.01) continue; // already at target

    const delta = remaining > 0 ? gran : -gran;
    moves.push({
      steps: [{ gainStageKey: key, delta }],
      isCompensatingPair: false,
    });
  }

  return moves;
}

/**
 * Generate compensating pairs: a shared gain step bundled with per-channel offsets.
 * For each shared gain change, pair it with opposing per-channel gain changes
 * for all affected channels, so the net EIRP impact is minimized.
 */
export function generateCompensatingPairs(
  gainValues: Record<string, number>,
  targetValues: Record<string, number>,
  granularities: Record<string, number>,
  couplingMap: CouplingMap,
  channelGainChains: Record<string, string[]>
): CandidateMove[] {
  const moves: CandidateMove[] = [];

  // For each shared gain that has remaining delta
  for (const key of Object.keys(targetValues)) {
    if (!isSharedGain(key)) continue;

    const current = gainValues[key];
    const target = targetValues[key];
    const gran = granularities[key];
    const remaining = target - current;

    if (Math.abs(remaining) < gran * 0.01) continue;

    const sharedDelta = remaining > 0 ? gran : -gran;
    const affectedChannels = couplingMap.get(key) || [];

    // Find per-channel gains that can compensate
    // Try G3, G4, G5 for each affected channel
    const compensatingTypes = ['G3', 'G4', 'G5'];

    for (const compType of compensatingTypes) {
      const compensatingSteps: AtomicStep[] = [{ gainStageKey: key, delta: sharedDelta }];
      let allCanCompensate = true;

      for (const channelId of affectedChannels) {
        const compKey = `${compType}:ch${channelId}`;
        if (!(compKey in gainValues)) {
          allCanCompensate = false;
          break;
        }

        const compCurrent = gainValues[compKey];
        const compTarget = targetValues[compKey];
        const compGran = granularities[compKey];
        const compDesiredDelta = -sharedDelta; // oppose the shared gain change

        // Check if this compensation is possible (has granularity steps available)
        // The compensation doesn't need to be toward the target — it just needs to be feasible
        // But we prefer compensations that also move toward target
        const compRemaining = compTarget - compCurrent;

        // If the compensation direction aligns with remaining, great
        // If not, we still allow it but it's less ideal
        if (Math.abs(compDesiredDelta) < compGran * 0.01) continue;

        // Quantize to granularity
        const actualDelta = compDesiredDelta > 0
          ? Math.min(compGran, Math.abs(compDesiredDelta))
          : -Math.min(compGran, Math.abs(compDesiredDelta));

        // Only add if we're not already at a point where this would overshoot badly
        // Allow the step if there's remaining in that direction, or if it's small
        if (Math.abs(compRemaining) >= compGran * 0.01 || Math.abs(actualDelta) <= compGran) {
          compensatingSteps.push({ gainStageKey: compKey, delta: actualDelta });
        }
      }

      if (allCanCompensate && compensatingSteps.length > 1) {
        moves.push({
          steps: compensatingSteps,
          isCompensatingPair: true,
        });
      }
    }
  }

  return moves;
}
