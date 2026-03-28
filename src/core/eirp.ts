import type { Channel } from '../types';
import { getChannelGainChain } from './coupling';

/**
 * Compute the input power for a channel from IPFD.
 * Simplified model: P_in = IPFD + 10*log10(bandwidth_Hz) + antenna_effective_area_dB
 * For simplicity, we use IPFD directly as a reference and the gains do the rest.
 * The EIRP = IPFD_ref + sum(gains) conceptually.
 *
 * In practice, the input power at G1 depends on IPFD, antenna aperture, and bandwidth.
 * We model: P_input = IPFD + 10*log10(BW_Hz) + Ae
 * where Ae (effective aperture) is assumed constant per antenna.
 * For the optimizer, absolute values matter less than deltas — so we use a simplified model.
 */
export function computeInputPower(channel: Channel): number {
  // P_input in dBm: IPFD (dBm/m²) + 10*log10(BW in Hz) + effective aperture (assume 0 dBm² for simplicity)
  const bwHz = channel.bandwidthMHz * 1e6;
  return channel.ipfd + 10 * Math.log10(bwHz);
}

/**
 * Compute the EIRP of a channel given current gain values.
 */
export function computeChannelEirp(
  channel: Channel,
  gainValues: Record<string, number> | Map<string, number>
): number {
  const chain = getChannelGainChain(channel);
  const inputPower = computeInputPower(channel);

  let eirp = inputPower;
  for (const key of chain) {
    const val = gainValues instanceof Map ? gainValues.get(key) : gainValues[key];
    if (val !== undefined) {
      eirp += val;
    }
  }
  return eirp;
}

/**
 * Compute EIRP for all channels.
 */
export function computeAllChannelEirp(
  channels: Channel[],
  gainValues: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const ch of channels) {
    result[ch.id] = computeChannelEirp(ch, gainValues);
  }
  return result;
}
