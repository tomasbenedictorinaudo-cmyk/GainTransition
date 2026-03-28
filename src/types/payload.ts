export type GainStageType = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7';

export interface GainStageId {
  type: GainStageType;
  rxAntennaId?: number;
  txAntennaId?: number;
  subchannelIndex?: number;
  channelId?: string;
}

export interface GainStage {
  id: GainStageId;
  key: string; // serialized id
  currentValue: number; // dB
  targetValue: number; // dB
  stepGranularity: number; // dB
  upperThreshold: number; // dBm (power level)
  lowerThreshold: number; // dBm (power level)
}

export interface Channel {
  id: string;
  name: string;
  rxAntennaId: number;
  txAntennaId: number;
  bandwidthMHz: number;
  rxLowFreqMHz: number;
  txLowFreqMHz: number;
  ipfd: number; // dBm/m²
  eirpTarget: number; // dBm
}

export interface PayloadConfig {
  rxAntennaCount: number;
  txAntennaCount: number;
  channels: Channel[];
  gainStages: Map<string, GainStage>;
}
