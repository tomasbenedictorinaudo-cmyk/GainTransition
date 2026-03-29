/**
 * System Noise Temperature Computation
 *
 * Uses the Friis cascade formula for the receive chain:
 *
 *   T_sys = T_ant + T_1 + T_2/G_1 + T_3/(G_1·G_2) + ...
 *
 * where T_n = T_0·(F_n - 1) is the equivalent noise temperature
 * of the n-th stage, F_n is its noise factor (linear), G_n is
 * its gain (linear), and T_0 = 290 K (standard reference).
 *
 * The receive chain for a channel is: G1 → G2 → G3
 * (G4-G7 are transmit-side and don't contribute to receive noise)
 */

import type { Channel, GainStage } from '../types';
import { getChannelGainChain } from './coupling';

const T0 = 290; // standard reference temperature (K)

/** Convert noise figure in dB to equivalent noise temperature in K */
function nfToTemp(noiseFigureDb: number): number {
  const noiseFactor = Math.pow(10, noiseFigureDb / 10);
  return T0 * (noiseFactor - 1);
}

/** Convert gain in dB to linear */
function dbToLinear(db: number): number {
  return Math.pow(10, db / 10);
}

/**
 * Compute the system noise temperature for a single channel.
 *
 * The receive chain stages (G1, G2, G3) contribute noise via Friis formula.
 * G4-G7 are on the transmit side and are excluded.
 */
export function computeChannelSystemTemp(
  channel: Channel,
  gainValues: Record<string, number>,
  gainStages: Map<string, GainStage>
): number {
  const chain = getChannelGainChain(channel);

  // Receive stages are G1, G2, G3 (first 3 in the chain)
  const rxStageKeys = chain.filter(key => {
    const type = key.split(':')[0];
    return type === 'G1' || type === 'G2' || type === 'G3';
  });

  let tSys = channel.antennaNoiseTemp;
  let cumulativeGainLinear = 1;

  for (let i = 0; i < rxStageKeys.length; i++) {
    const key = rxStageKeys[i];
    const stage = gainStages.get(key);
    if (!stage) continue;

    const stageTemp = nfToTemp(stage.noiseFigure);
    const stageGainDb = gainValues[key] ?? stage.currentValue;
    const stageGainLinear = dbToLinear(stageGainDb);

    // Friis: noise contribution of stage i = T_i / (G_1 · G_2 · ... · G_{i-1})
    tSys += stageTemp / cumulativeGainLinear;
    cumulativeGainLinear *= stageGainLinear;
  }

  return tSys;
}

/**
 * Compute system noise temperature for all channels.
 * Returns Record<channelId, temperature in K>.
 */
export function computeAllSystemTemp(
  channels: Channel[],
  gainValues: Record<string, number>,
  gainStages: Map<string, GainStage>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const ch of channels) {
    result[ch.id] = computeChannelSystemTemp(ch, gainValues, gainStages);
  }
  return result;
}
