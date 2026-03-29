import type { Channel, GainStage, GainStageId } from '../types';
import { serializeGainStageId } from './serialization';
import { getSubchannelIndices } from '../utils/subchannel';

export interface GainStageDefaults {
  currentValue: number;
  targetValue: number;
  stepGranularity: number;
  upperThreshold: number;
  lowerThreshold: number;
}

const DEFAULTS: Record<string, GainStageDefaults> = {
  G1: { currentValue: 30, targetValue: 30, stepGranularity: 0.5, upperThreshold: -10, lowerThreshold: -40 },
  G2: { currentValue: 10, targetValue: 10, stepGranularity: 0.25, upperThreshold: 0, lowerThreshold: -35 },
  G3: { currentValue: 5, targetValue: 5, stepGranularity: 0.25, upperThreshold: 10, lowerThreshold: -30 },
  G4: { currentValue: 5, targetValue: 5, stepGranularity: 0.25, upperThreshold: 10, lowerThreshold: -25 },
  G5: { currentValue: 10, targetValue: 10, stepGranularity: 0.25, upperThreshold: 20, lowerThreshold: -15 },
  G6: { currentValue: 10, targetValue: 10, stepGranularity: 0.25, upperThreshold: 30, lowerThreshold: -5 },
  G7: { currentValue: 40, targetValue: 40, stepGranularity: 0.5, upperThreshold: 75, lowerThreshold: 30 },
};

function makeStage(id: GainStageId, overrides?: Partial<GainStageDefaults>): GainStage {
  const d = DEFAULTS[id.type];
  return {
    id,
    key: serializeGainStageId(id),
    currentValue: overrides?.currentValue ?? d.currentValue,
    targetValue: overrides?.targetValue ?? d.targetValue,
    stepGranularity: overrides?.stepGranularity ?? d.stepGranularity,
    upperThreshold: overrides?.upperThreshold ?? d.upperThreshold,
    lowerThreshold: overrides?.lowerThreshold ?? d.lowerThreshold,
  };
}

/**
 * Derive all gain stage instances from the channel list.
 * Shared stages (G1, G2, G6, G7) are deduplicated.
 */
export function createGainStages(
  channels: Channel[],
  existing?: Map<string, GainStage>
): Map<string, GainStage> {
  const stages = new Map<string, GainStage>();

  const addIfNew = (id: GainStageId) => {
    const key = serializeGainStageId(id);
    if (!stages.has(key)) {
      // Preserve existing values if available
      if (existing?.has(key)) {
        stages.set(key, existing.get(key)!);
      } else {
        stages.set(key, makeStage(id));
      }
    }
  };

  for (const ch of channels) {
    // Rx chain
    addIfNew({ type: 'G1', rxAntennaId: ch.rxAntennaId });

    const rxSubs = getSubchannelIndices(ch.rxLowFreqMHz, ch.bandwidthMHz);
    for (const sub of rxSubs) {
      addIfNew({ type: 'G2', rxAntennaId: ch.rxAntennaId, subchannelIndex: sub });
    }

    addIfNew({ type: 'G3', channelId: ch.id });
    addIfNew({ type: 'G4', channelId: ch.id });
    addIfNew({ type: 'G5', channelId: ch.id });

    // Tx chain
    const txSubs = getSubchannelIndices(ch.txLowFreqMHz, ch.bandwidthMHz);
    for (const sub of txSubs) {
      addIfNew({ type: 'G6', txAntennaId: ch.txAntennaId, subchannelIndex: sub });
    }

    addIfNew({ type: 'G7', txAntennaId: ch.txAntennaId });
  }

  return stages;
}

export function getDefaultGainStageValues() {
  return DEFAULTS;
}
