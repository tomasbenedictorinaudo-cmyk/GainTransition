export interface AlgorithmParams {
  negativeWeight: number; // weight for negative EIRP deviation (default 3.0)
  positiveWeight: number; // weight for positive EIRP deviation (default 1.0)
  preferCompensatingPairs: boolean;
  maxIterations: number;
  strategy: 'greedy' | 'inner-first';
}

export interface AtomicStep {
  gainStageKey: string;
  delta: number; // +/- granularity
}

export interface CandidateMove {
  steps: AtomicStep[];
  isCompensatingPair: boolean;
}

export interface TransitionStep {
  stepIndex: number;
  appliedMove: CandidateMove;
  gainValues: Record<string, number>; // snapshot of all gain values after this step
  channelEirp: Record<string, number>; // EIRP per channel after this step
  channelEirpDeviation: Record<string, number>; // deviation from initial
  powerLevels: Record<string, number>; // power at each gain stage output
  cost: number;
}

export interface TransitionResult {
  steps: TransitionStep[];
  initialEirp: Record<string, number>;
  finalEirp: Record<string, number>;
  initialGainValues: Record<string, number>;
  targetGainValues: Record<string, number>;
  maxNegativeDeviation: number;
  maxPositiveDeviation: number;
  totalSteps: number;
  thresholdViolations: number;
  converged: boolean;
}
