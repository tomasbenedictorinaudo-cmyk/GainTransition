import type { Channel, PayloadConfig } from '../types';
import { createGainStages } from '../core/gain-stage-factory';
import { serializeGainStageId } from '../core/serialization';

const exampleChannels: Channel[] = [
  {
    id: '1',
    name: 'CH-1',
    rxAntennaId: 0,
    txAntennaId: 0,
    bandwidthMHz: 4,
    rxLowFreqMHz: 10950,
    txLowFreqMHz: 11700,
    ipfd: -120,
    eirpTarget: 45,
  },
  {
    id: '2',
    name: 'CH-2',
    rxAntennaId: 0,
    txAntennaId: 1,
    bandwidthMHz: 4,
    rxLowFreqMHz: 10955,
    txLowFreqMHz: 11710,
    ipfd: -118,
    eirpTarget: 47,
  },
  {
    id: '3',
    name: 'CH-3',
    rxAntennaId: 1,
    txAntennaId: 0,
    bandwidthMHz: 3,
    rxLowFreqMHz: 10960,
    txLowFreqMHz: 11705,
    ipfd: -122,
    eirpTarget: 44,
  },
  {
    id: '4',
    name: 'CH-4',
    rxAntennaId: 1,
    txAntennaId: 1,
    bandwidthMHz: 5,
    rxLowFreqMHz: 10965,
    txLowFreqMHz: 11715,
    ipfd: -119,
    eirpTarget: 46,
  },
];

export function createExamplePayload(): PayloadConfig {
  const gainStages = createGainStages(exampleChannels);

  // Set up some non-trivial current -> target transitions
  const modifications: Record<string, { current: number; target: number }> = {
    [serializeGainStageId({ type: 'G1', rxAntennaId: 0 })]: { current: 30, target: 32 },
    [serializeGainStageId({ type: 'G1', rxAntennaId: 1 })]: { current: 30, target: 28 },
    [serializeGainStageId({ type: 'G3', channelId: '1' })]: { current: 5, target: 3 },
    [serializeGainStageId({ type: 'G3', channelId: '2' })]: { current: 5, target: 3 },
    [serializeGainStageId({ type: 'G4', channelId: '3' })]: { current: 5, target: 7 },
    [serializeGainStageId({ type: 'G5', channelId: '4' })]: { current: 10, target: 12 },
    [serializeGainStageId({ type: 'G7', txAntennaId: 0 })]: { current: 40, target: 38 },
    [serializeGainStageId({ type: 'G7', txAntennaId: 1 })]: { current: 40, target: 42 },
  };

  for (const [key, mod] of Object.entries(modifications)) {
    const stage = gainStages.get(key);
    if (stage) {
      stage.currentValue = mod.current;
      stage.targetValue = mod.target;
    }
  }

  return {
    rxAntennaCount: 2,
    txAntennaCount: 2,
    channels: exampleChannels,
    gainStages,
  };
}
