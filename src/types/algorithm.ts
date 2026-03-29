export interface AlgorithmParams {
  maxNegativeEirpDeviation: number | null; // max allowed negative deviation in dB; null = unconstrained
  maxPositiveEirpDeviation: number | null; // max allowed positive deviation in dB; null = unconstrained
  maxIterations: number;
  strategy: 'greedy' | 'inner-first' | 'g4-compensated';
  g4CompensationMode: 'after' | 'before';
}

export interface AtomicStep {
  gainStageKey: string;
  delta: number;
}

export interface CandidateMove {
  steps: AtomicStep[];
  stageType: string;
}

export interface TransitionStep {
  stepIndex: number;
  appliedMove: CandidateMove;
  gainValues: Record<string, number>;
  channelEirp: Record<string, number>;
  channelEirpDeviation: Record<string, number>;
  powerLevels: Record<string, number>;
  systemTemp: Record<string, number>; // system noise temperature per channel (K)
  cost: number;
}

export interface TransitionResult {
  steps: TransitionStep[];
  initialEirp: Record<string, number>;
  finalEirp: Record<string, number>;
  initialGainValues: Record<string, number>;
  targetGainValues: Record<string, number>;
  initialSystemTemp: Record<string, number>; // initial system temp per channel (K)
  maxNegativeDeviation: number;
  maxPositiveDeviation: number;
  totalSteps: number;
  thresholdViolations: number;
  converged: boolean;
  error: string | null;
}
