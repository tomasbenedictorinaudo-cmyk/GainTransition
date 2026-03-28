/**
 * Compute the 5 MHz subchannel indices that a channel occupies.
 * A channel at lowFreq with bandwidth spans one or more 5 MHz slots.
 */
export function getSubchannelIndices(lowFreqMHz: number, bandwidthMHz: number): number[] {
  const startSub = Math.floor(lowFreqMHz / 5);
  const endFreq = lowFreqMHz + bandwidthMHz;
  const endSub = Math.ceil(endFreq / 5) - 1;
  const indices: number[] = [];
  for (let i = startSub; i <= endSub; i++) {
    indices.push(i);
  }
  return indices;
}
