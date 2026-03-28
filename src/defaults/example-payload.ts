import type { Channel, PayloadConfig } from '../types';
import { createGainStages } from '../core/gain-stage-factory';
import { serializeGainStageId } from '../core/serialization';

/**
 * 6-channel payload: 3 Rx antennas, 2 Tx antennas.
 *
 * Every gain stage has a non-zero delta (current != target), but the deltas
 * are designed so that the net EIRP change per channel is exactly zero:
 *
 *   ΔG1 + ΔG2 + ΔG3 + ΔG4 + ΔG5 + ΔG6 + ΔG7 = 0  for every channel.
 *
 * This makes the transition interesting for the algorithm: it must find the
 * right sequencing to keep EIRP stable throughout, even though every single
 * gain stage is changing.
 *
 * Channel routing:
 *   CH-1: Rx0 → Tx0    CH-2: Rx0 → Tx1
 *   CH-3: Rx1 → Tx0    CH-4: Rx1 → Tx1
 *   CH-5: Rx2 → Tx0    CH-6: Rx2 → Tx1
 *
 * Shared gain deltas:
 *   ΔG1(Rx0) = +2.0    ΔG1(Rx1) = -1.0    ΔG1(Rx2) = +1.5
 *   ΔG7(Tx0) = -1.0    ΔG7(Tx1) = +1.5
 *
 * Per-channel gains (G3, G4, G5) and subchannel gains (G2, G6) are set
 * so that each channel's 7-stage delta sum is exactly zero.
 */
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
    bandwidthMHz: 4,
    rxLowFreqMHz: 10965,
    txLowFreqMHz: 11715,
    ipfd: -119,
    eirpTarget: 46,
  },
  {
    id: '5',
    name: 'CH-5',
    rxAntennaId: 2,
    txAntennaId: 0,
    bandwidthMHz: 4,
    rxLowFreqMHz: 10970,
    txLowFreqMHz: 11720,
    ipfd: -121,
    eirpTarget: 44,
  },
  {
    id: '6',
    name: 'CH-6',
    rxAntennaId: 2,
    txAntennaId: 1,
    bandwidthMHz: 4,
    rxLowFreqMHz: 10975,
    txLowFreqMHz: 11725,
    ipfd: -117,
    eirpTarget: 48,
  },
];

export function createExamplePayload(): PayloadConfig {
  const gainStages = createGainStages(exampleChannels);

  // All modifications are designed so that for every channel:
  //   ΔG1 + ΔG2 + ΔG3 + ΔG4 + ΔG5 + ΔG6 + ΔG7 = 0
  //
  // Shared gains:
  //   ΔG1(Rx0)=+2.0  ΔG1(Rx1)=-1.0  ΔG1(Rx2)=+1.5
  //   ΔG7(Tx0)=-1.0  ΔG7(Tx1)=+1.5
  //
  // Per-channel and subchannel gains computed to balance each chain.

  const s = serializeGainStageId;

  const modifications: Record<string, { current: number; target: number }> = {
    // --- G1: LNA per Rx antenna (shared) ---
    [s({ type: 'G1', rxAntennaId: 0 })]: { current: 30,  target: 32    },  // +2.0
    [s({ type: 'G1', rxAntennaId: 1 })]: { current: 30,  target: 29    },  // -1.0
    [s({ type: 'G1', rxAntennaId: 2 })]: { current: 30,  target: 31.5  },  // +1.5

    // --- G7: HPA per Tx antenna (shared) ---
    [s({ type: 'G7', txAntennaId: 0 })]: { current: 40,  target: 39    },  // -1.0
    [s({ type: 'G7', txAntennaId: 1 })]: { current: 40,  target: 41.5  },  // +1.5

    // --- CH-1 (Rx0→Tx0): needs ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = -(+2)+-(−1) = -1.0 ---
    [s({ type: 'G2', rxAntennaId: 0, subchannelIndex: 2190 })]: { current: 10, target: 10.5  },  // +0.50
    [s({ type: 'G3', channelId: '1' })]:                         { current: 5,  target: 4.5   },  // -0.50
    [s({ type: 'G4', channelId: '1' })]:                         { current: 5,  target: 4.75  },  // -0.25
    [s({ type: 'G5', channelId: '1' })]:                         { current: 10, target: 9.75  },  // -0.25
    [s({ type: 'G6', txAntennaId: 0, subchannelIndex: 2340 })]:  { current: 10, target: 9.5   },  // -0.50

    // --- CH-2 (Rx0→Tx1): needs ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = -(+2)-(+1.5) = -3.5 ---
    [s({ type: 'G2', rxAntennaId: 0, subchannelIndex: 2191 })]: { current: 10, target: 9.25  },  // -0.75
    [s({ type: 'G3', channelId: '2' })]:                         { current: 5,  target: 4.25  },  // -0.75
    [s({ type: 'G4', channelId: '2' })]:                         { current: 5,  target: 4.25  },  // -0.75
    [s({ type: 'G5', channelId: '2' })]:                         { current: 10, target: 9.5   },  // -0.50
    [s({ type: 'G6', txAntennaId: 1, subchannelIndex: 2342 })]:  { current: 10, target: 9.25  },  // -0.75

    // --- CH-3 (Rx1→Tx0): needs ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = -(-1)-(−1) = +2.0 ---
    [s({ type: 'G2', rxAntennaId: 1, subchannelIndex: 2192 })]: { current: 10, target: 10.5  },  // +0.50
    [s({ type: 'G3', channelId: '3' })]:                         { current: 5,  target: 5.5   },  // +0.50
    [s({ type: 'G4', channelId: '3' })]:                         { current: 5,  target: 5.25  },  // +0.25
    [s({ type: 'G5', channelId: '3' })]:                         { current: 10, target: 10.25 },  // +0.25
    [s({ type: 'G6', txAntennaId: 0, subchannelIndex: 2341 })]:  { current: 10, target: 10.5  },  // +0.50

    // --- CH-4 (Rx1→Tx1): needs ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = -(-1)-(+1.5) = -0.5 ---
    [s({ type: 'G2', rxAntennaId: 1, subchannelIndex: 2193 })]: { current: 10, target: 10.25 },  // +0.25
    [s({ type: 'G3', channelId: '4' })]:                         { current: 5,  target: 4.75  },  // -0.25
    [s({ type: 'G4', channelId: '4' })]:                         { current: 5,  target: 5.25  },  // +0.25
    [s({ type: 'G5', channelId: '4' })]:                         { current: 10, target: 9.5   },  // -0.50
    [s({ type: 'G6', txAntennaId: 1, subchannelIndex: 2343 })]:  { current: 10, target: 9.75  },  // -0.25

    // --- CH-5 (Rx2→Tx0): needs ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = -(+1.5)-(−1) = -0.5 ---
    [s({ type: 'G2', rxAntennaId: 2, subchannelIndex: 2194 })]: { current: 10, target: 10.25 },  // +0.25
    [s({ type: 'G3', channelId: '5' })]:                         { current: 5,  target: 4.75  },  // -0.25
    [s({ type: 'G4', channelId: '5' })]:                         { current: 5,  target: 5.25  },  // +0.25
    [s({ type: 'G5', channelId: '5' })]:                         { current: 10, target: 9.5   },  // -0.50
    [s({ type: 'G6', txAntennaId: 0, subchannelIndex: 2344 })]:  { current: 10, target: 9.75  },  // -0.25

    // --- CH-6 (Rx2→Tx1): needs ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = -(+1.5)-(+1.5) = -3.0 ---
    [s({ type: 'G2', rxAntennaId: 2, subchannelIndex: 2195 })]: { current: 10, target: 9.5   },  // -0.50
    [s({ type: 'G3', channelId: '6' })]:                         { current: 5,  target: 4.25  },  // -0.75
    [s({ type: 'G4', channelId: '6' })]:                         { current: 5,  target: 4.5   },  // -0.50
    [s({ type: 'G5', channelId: '6' })]:                         { current: 10, target: 9.25  },  // -0.75
    [s({ type: 'G6', txAntennaId: 1, subchannelIndex: 2345 })]:  { current: 10, target: 9.5   },  // -0.50
  };

  for (const [key, mod] of Object.entries(modifications)) {
    const stage = gainStages.get(key);
    if (stage) {
      stage.currentValue = mod.current;
      stage.targetValue = mod.target;
    }
  }

  return {
    rxAntennaCount: 3,
    txAntennaCount: 2,
    channels: exampleChannels,
    gainStages,
  };
}
