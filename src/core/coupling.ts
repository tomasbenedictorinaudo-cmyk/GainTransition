import type { Channel } from '../types';
import { serializeGainStageId } from './serialization';
import { getSubchannelIndices } from '../utils/subchannel';

export type CouplingMap = Map<string, string[]>; // gainStageKey -> channelId[]

/**
 * Build the coupling map: for each gain stage, which channels does it affect?
 */
export function buildCouplingMap(channels: Channel[]): CouplingMap {
  const map = new Map<string, string[]>();

  const addMapping = (key: string, channelId: string) => {
    const existing = map.get(key) || [];
    if (!existing.includes(channelId)) {
      existing.push(channelId);
      map.set(key, existing);
    }
  };

  for (const ch of channels) {
    const g1Key = serializeGainStageId({ type: 'G1', rxAntennaId: ch.rxAntennaId });
    addMapping(g1Key, ch.id);

    const rxSubs = getSubchannelIndices(ch.rxLowFreqMHz, ch.bandwidthMHz);
    for (const sub of rxSubs) {
      const g2Key = serializeGainStageId({ type: 'G2', rxAntennaId: ch.rxAntennaId, subchannelIndex: sub });
      addMapping(g2Key, ch.id);
    }

    addMapping(serializeGainStageId({ type: 'G3', channelId: ch.id }), ch.id);
    addMapping(serializeGainStageId({ type: 'G4', channelId: ch.id }), ch.id);
    addMapping(serializeGainStageId({ type: 'G5', channelId: ch.id }), ch.id);

    const txSubs = getSubchannelIndices(ch.txLowFreqMHz, ch.bandwidthMHz);
    for (const sub of txSubs) {
      const g6Key = serializeGainStageId({ type: 'G6', txAntennaId: ch.txAntennaId, subchannelIndex: sub });
      addMapping(g6Key, ch.id);
    }

    const g7Key = serializeGainStageId({ type: 'G7', txAntennaId: ch.txAntennaId });
    addMapping(g7Key, ch.id);
  }

  return map;
}

/**
 * For a given channel, return the ordered list of gain stage keys in its chain.
 */
export function getChannelGainChain(channel: Channel): string[] {
  const chain: string[] = [];

  chain.push(serializeGainStageId({ type: 'G1', rxAntennaId: channel.rxAntennaId }));

  // For EIRP we use the primary subchannel (first one)
  const rxSubs = getSubchannelIndices(channel.rxLowFreqMHz, channel.bandwidthMHz);
  chain.push(serializeGainStageId({ type: 'G2', rxAntennaId: channel.rxAntennaId, subchannelIndex: rxSubs[0] }));

  chain.push(serializeGainStageId({ type: 'G3', channelId: channel.id }));
  chain.push(serializeGainStageId({ type: 'G4', channelId: channel.id }));
  chain.push(serializeGainStageId({ type: 'G5', channelId: channel.id }));

  const txSubs = getSubchannelIndices(channel.txLowFreqMHz, channel.bandwidthMHz);
  chain.push(serializeGainStageId({ type: 'G6', txAntennaId: channel.txAntennaId, subchannelIndex: txSubs[0] }));

  chain.push(serializeGainStageId({ type: 'G7', txAntennaId: channel.txAntennaId }));

  return chain;
}

/**
 * Check if a gain stage key is a shared gain (affects multiple channels).
 */
export function isSharedGain(key: string): boolean {
  return key.startsWith('G1:') || key.startsWith('G2:') || key.startsWith('G6:') || key.startsWith('G7:');
}

/**
 * Check if a gain stage key is a per-channel gain.
 */
export function isPerChannelGain(key: string): boolean {
  return key.startsWith('G3:') || key.startsWith('G4:') || key.startsWith('G5:');
}
