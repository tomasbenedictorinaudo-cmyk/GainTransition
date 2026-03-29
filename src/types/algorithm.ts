export interface AlgorithmParams {
  maxNegativeEirpDeviation: number | null; // max allowed negative deviation in dB (e.g. 0.5 means EIRP can drop by 0.5); null = unconstrained
  maxPositiveEirpDeviation: number | null; // max allowed positive deviation in dB (e.g. 1.0 means EIRP can rise by 1.0); null = unconstrained
  maxIterations: number;
  strategy: 'greedy' | 'inner-first' | 'g4-compensated';
  g4CompensationMode: 'after' | 'before'; // when to apply G4 correction relative to primary step
}

export interface AtomicStep {
  gainStageKey: string;
  delta: number; // +/- granularity
}

/**
 * A candidate move contains one or more atomic steps that are applied together
 * in a single iteration. All steps must belong to the same gain stage type (Gn).
 * For analog stages (G1, G7): exactly one step (one antenna).
 * For digital stages (G2-G6): one or more steps (all instances of that stage type).
 */
export interface CandidateMove {
  steps: AtomicStep[];
  stageType: string; // 'G1' | 'G2' | ... | 'G7' — the gain stage type being changed
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
  eirpLimitViolations: number; // steps where EIRP limits were exceeded (best-effort)
  converged: boolean;
  requestedNegativeLimit: number | null;
  requestedPositiveLimit: number | null;
}
