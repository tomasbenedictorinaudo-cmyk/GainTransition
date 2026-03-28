import type { CandidateMove, GainStage, Channel } from '../types';
import { computeAllPowerLevels } from '../core/power';

/**
 * Check if applying a candidate move would keep all power levels within thresholds.
 */
export function checkFeasibility(
  move: CandidateMove,
  currentGainValues: Record<string, number>,
  channels: Channel[],
  gainStages: Map<string, GainStage>
): boolean {
  // Apply the move temporarily
  const tempGains = { ...currentGainValues };
  for (const step of move.steps) {
    tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
  }

  // Compute power levels
  const powerLevels = computeAllPowerLevels(channels, tempGains);

  // Check all thresholds
  for (const [key, power] of Object.entries(powerLevels)) {
    const stage = gainStages.get(key);
    if (!stage) continue;

    if (power > stage.upperThreshold + 0.001 || power < stage.lowerThreshold - 0.001) {
      return false;
    }
  }

  return true;
}
