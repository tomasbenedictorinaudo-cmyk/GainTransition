import type { Channel, GainStage } from '../types';
import { getChannelGainChain } from './coupling';
import { computeInputPower } from './eirp';

/**
 * Convert dBm to milliwatts.
 */
export function dbmToLinear(dbm: number): number {
  return Math.pow(10, dbm / 10);
}

/**
 * Convert milliwatts to dBm.
 */
export function linearToDbm(mw: number): number {
  if (mw <= 0) return -Infinity;
  return 10 * Math.log10(mw);
}

/**
 * Compute the output power at each gain stage for a single channel.
 * Returns a map of gain stage key -> output power in dBm.
 */
export function computeChannelPowerLevels(
  channel: Channel,
  gainValues: Record<string, number>
): Record<string, number> {
  const chain = getChannelGainChain(channel);
  const levels: Record<string, number> = {};
  let power = computeInputPower(channel);

  for (const key of chain) {
    power += gainValues[key] ?? 0;
    levels[key] = power;
  }
  return levels;
}

/**
 * Compute the aggregate power at each shared gain stage.
 * For shared stages, the total power is the sum (in linear) of all channels flowing through.
 * For per-channel stages, it's just the single channel's power.
 */
export function computeAllPowerLevels(
  channels: Channel[],
  gainValues: Record<string, number>
): Record<string, number> {
  // First compute per-channel power at each stage
  const perChannelLevels: Record<string, Record<string, number>> = {};
  for (const ch of channels) {
    perChannelLevels[ch.id] = computeChannelPowerLevels(ch, gainValues);
  }

  // Aggregate for shared stages
  const aggregated: Record<string, number> = {};
  const sharedAccumulators: Record<string, number> = {}; // linear power sum

  for (const ch of channels) {
    const chain = getChannelGainChain(ch);
    for (const key of chain) {
      const power = perChannelLevels[ch.id][key];
      if (key.startsWith('G1:') || key.startsWith('G2:') || key.startsWith('G6:') || key.startsWith('G7:')) {
        // Shared: accumulate in linear
        sharedAccumulators[key] = (sharedAccumulators[key] || 0) + dbmToLinear(power);
      } else {
        // Per-channel: just store directly
        aggregated[key] = power;
      }
    }
  }

  // Convert shared accumulators back to dBm
  for (const [key, linearPower] of Object.entries(sharedAccumulators)) {
    aggregated[key] = linearToDbm(linearPower);
  }

  return aggregated;
}

/**
 * Check if all power levels are within thresholds.
 * Returns an array of violations (empty if all OK).
 */
export function checkThresholds(
  powerLevels: Record<string, number>,
  gainStages: Map<string, GainStage>
): { key: string; power: number; threshold: 'upper' | 'lower'; limit: number }[] {
  const violations: { key: string; power: number; threshold: 'upper' | 'lower'; limit: number }[] = [];

  for (const [key, power] of Object.entries(powerLevels)) {
    const stage = gainStages.get(key);
    if (!stage) continue;

    if (power > stage.upperThreshold) {
      violations.push({ key, power, threshold: 'upper', limit: stage.upperThreshold });
    }
    if (power < stage.lowerThreshold) {
      violations.push({ key, power, threshold: 'lower', limit: stage.lowerThreshold });
    }
  }

  return violations;
}
