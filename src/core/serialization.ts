import type { GainStageId, GainStageType } from '../types';

export function serializeGainStageId(id: GainStageId): string {
  switch (id.type) {
    case 'G1':
      return `G1:rx${id.rxAntennaId}`;
    case 'G2':
      return `G2:rx${id.rxAntennaId}:sub${id.subchannelIndex}`;
    case 'G3':
      return `G3:ch${id.channelId}`;
    case 'G4':
      return `G4:ch${id.channelId}`;
    case 'G5':
      return `G5:ch${id.channelId}`;
    case 'G6':
      return `G6:tx${id.txAntennaId}:sub${id.subchannelIndex}`;
    case 'G7':
      return `G7:tx${id.txAntennaId}`;
  }
}

export function deserializeGainStageId(key: string): GainStageId {
  const parts = key.split(':');
  const type = parts[0] as GainStageType;

  switch (type) {
    case 'G1':
      return { type, rxAntennaId: parseInt(parts[1].replace('rx', '')) };
    case 'G2':
      return {
        type,
        rxAntennaId: parseInt(parts[1].replace('rx', '')),
        subchannelIndex: parseInt(parts[2].replace('sub', '')),
      };
    case 'G3':
    case 'G4':
    case 'G5':
      return { type, channelId: parts[1].replace('ch', '') };
    case 'G6':
      return {
        type,
        txAntennaId: parseInt(parts[1].replace('tx', '')),
        subchannelIndex: parseInt(parts[2].replace('sub', '')),
      };
    case 'G7':
      return { type, txAntennaId: parseInt(parts[1].replace('tx', '')) };
    default:
      throw new Error(`Unknown gain stage type: ${type}`);
  }
}

export function getGainStageLabel(key: string): string {
  const id = deserializeGainStageId(key);
  switch (id.type) {
    case 'G1':
      return `G1 (LNA Rx${id.rxAntennaId})`;
    case 'G2':
      return `G2 (DEMUX Rx${id.rxAntennaId} Sub${id.subchannelIndex})`;
    case 'G3':
      return `G3 (Ch ${id.channelId})`;
    case 'G4':
      return `G4 (Ch ${id.channelId})`;
    case 'G5':
      return `G5 (Ch ${id.channelId})`;
    case 'G6':
      return `G6 (MUX Tx${id.txAntennaId} Sub${id.subchannelIndex})`;
    case 'G7':
      return `G7 (HPA Tx${id.txAntennaId})`;
  }
}
