import type { Channel, PayloadConfig } from '../types';
import { createGainStages } from '../core/gain-stage-factory';
import { serializeGainStageId } from '../core/serialization';

/**
 * 6-channel payload: 3 Rx antennas, 2 Tx antennas.
 *
 * Large gain deltas to make EIRP deviation limits clearly impactful:
 *   ΔG1(Rx0) = +6.0   ΔG1(Rx1) = -4.0   ΔG1(Rx2) = +5.0
 *   ΔG7(Tx0) = -3.0   ΔG7(Tx1) = +4.0
 *
 * Per-channel gains (G3, G4, G5) and subchannel gains (G2, G6) balance
 * each channel's chain to zero net EIRP change:
 *   ΔG1 + ΔG2 + ΔG3 + ΔG4 + ΔG5 + ΔG6 + ΔG7 = 0  for every channel.
 *
 * Channel routing:
 *   CH-1: Rx0 → Tx0    CH-2: Rx0 → Tx1
 *   CH-3: Rx1 → Tx0    CH-4: Rx1 → Tx1
 *   CH-5: Rx2 → Tx0    CH-6: Rx2 → Tx1
 *
 * Without EIRP limits: algorithm takes huge steps (e.g. G1 +6 dB at once).
 * With limits (e.g. ±1 dB): algorithm must break into many smaller steps.
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

  const s = serializeGainStageId;

  // ΔG1(Rx0)=+6  ΔG1(Rx1)=-4  ΔG1(Rx2)=+5
  // ΔG7(Tx0)=-3  ΔG7(Tx1)=+4
  //
  // Per-channel balancing:
  // CH-1 (Rx0→Tx0): need ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = -(6)+-(−3) = -3.0
  // CH-2 (Rx0→Tx1): need = -(6)-(4) = -10.0
  // CH-3 (Rx1→Tx0): need = -(-4)-(-3) = +7.0
  // CH-4 (Rx1→Tx1): need = -(-4)-(4) = 0.0
  // CH-5 (Rx2→Tx0): need = -(5)-(-3) = -2.0
  // CH-6 (Rx2→Tx1): need = -(5)-(4) = -9.0

  const modifications: Record<string, { current: number; target: number }> = {
    // G1: LNA per Rx antenna
    [s({ type: 'G1', rxAntennaId: 0 })]: { current: 30,  target: 36   },  // +6.0
    [s({ type: 'G1', rxAntennaId: 1 })]: { current: 30,  target: 26   },  // -4.0
    [s({ type: 'G1', rxAntennaId: 2 })]: { current: 30,  target: 35   },  // +5.0

    // G7: HPA per Tx antenna
    [s({ type: 'G7', txAntennaId: 0 })]: { current: 40,  target: 37   },  // -3.0
    [s({ type: 'G7', txAntennaId: 1 })]: { current: 40,  target: 44   },  // +4.0

    // CH-1 (Rx0→Tx0): ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = -3.0
    [s({ type: 'G2', rxAntennaId: 0, subchannelIndex: 2190 })]: { current: 10, target: 9.5   },  // -0.50
    [s({ type: 'G3', channelId: '1' })]:                         { current: 5,  target: 4     },  // -1.00
    [s({ type: 'G4', channelId: '1' })]:                         { current: 5,  target: 4.5   },  // -0.50
    [s({ type: 'G5', channelId: '1' })]:                         { current: 10, target: 9.5   },  // -0.50
    [s({ type: 'G6', txAntennaId: 0, subchannelIndex: 2340 })]:  { current: 10, target: 9.5   },  // -0.50

    // CH-2 (Rx0→Tx1): ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = -10.0
    [s({ type: 'G2', rxAntennaId: 0, subchannelIndex: 2191 })]: { current: 10, target: 8     },  // -2.00
    [s({ type: 'G3', channelId: '2' })]:                         { current: 5,  target: 2     },  // -3.00
    [s({ type: 'G4', channelId: '2' })]:                         { current: 5,  target: 3     },  // -2.00
    [s({ type: 'G5', channelId: '2' })]:                         { current: 10, target: 8.5   },  // -1.50
    [s({ type: 'G6', txAntennaId: 1, subchannelIndex: 2342 })]:  { current: 10, target: 8.5   },  // -1.50

    // CH-3 (Rx1→Tx0): ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = +7.0
    [s({ type: 'G2', rxAntennaId: 1, subchannelIndex: 2192 })]: { current: 10, target: 11    },  // +1.00
    [s({ type: 'G3', channelId: '3' })]:                         { current: 5,  target: 7     },  // +2.00
    [s({ type: 'G4', channelId: '3' })]:                         { current: 5,  target: 6.5   },  // +1.50
    [s({ type: 'G5', channelId: '3' })]:                         { current: 10, target: 11.5  },  // +1.50
    [s({ type: 'G6', txAntennaId: 0, subchannelIndex: 2341 })]:  { current: 10, target: 11    },  // +1.00

    // CH-4 (Rx1→Tx1): ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = 0.0
    [s({ type: 'G2', rxAntennaId: 1, subchannelIndex: 2193 })]: { current: 10, target: 10.5  },  // +0.50
    [s({ type: 'G3', channelId: '4' })]:                         { current: 5,  target: 4.5   },  // -0.50
    [s({ type: 'G4', channelId: '4' })]:                         { current: 5,  target: 5.5   },  // +0.50
    [s({ type: 'G5', channelId: '4' })]:                         { current: 10, target: 9.5   },  // -0.50
    [s({ type: 'G6', txAntennaId: 1, subchannelIndex: 2343 })]:  { current: 10, target: 10    },  // 0.00 — one stage unchanged to test edge case

    // CH-5 (Rx2→Tx0): ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = -2.0
    [s({ type: 'G2', rxAntennaId: 2, subchannelIndex: 2194 })]: { current: 10, target: 9.5   },  // -0.50
    [s({ type: 'G3', channelId: '5' })]:                         { current: 5,  target: 4.5   },  // -0.50
    [s({ type: 'G4', channelId: '5' })]:                         { current: 5,  target: 5.25  },  // +0.25
    [s({ type: 'G5', channelId: '5' })]:                         { current: 10, target: 9.25  },  // -0.75
    [s({ type: 'G6', txAntennaId: 0, subchannelIndex: 2344 })]:  { current: 10, target: 9.5   },  // -0.50

    // CH-6 (Rx2→Tx1): ΔG2+ΔG3+ΔG4+ΔG5+ΔG6 = -9.0
    [s({ type: 'G2', rxAntennaId: 2, subchannelIndex: 2195 })]: { current: 10, target: 8.5   },  // -1.50
    [s({ type: 'G3', channelId: '6' })]:                         { current: 5,  target: 2.5   },  // -2.50
    [s({ type: 'G4', channelId: '6' })]:                         { current: 5,  target: 3     },  // -2.00
    [s({ type: 'G5', channelId: '6' })]:                         { current: 10, target: 8     },  // -2.00
    [s({ type: 'G6', txAntennaId: 1, subchannelIndex: 2345 })]:  { current: 10, target: 9     },  // -1.00
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
