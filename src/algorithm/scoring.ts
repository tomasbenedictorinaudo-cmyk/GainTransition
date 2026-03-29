import type { AlgorithmParams, CandidateMove, Channel } from '../types';

/** Gain stage types considered "inner" (per-channel) for inner-first strategy */
const INNER_STAGES = new Set(['G3', 'G4', 'G5']);

/**
 * Score a candidate move. Lower score = better.
 *
 * Primary criterion: maximize progress toward target gains.
 * Progress is measured as the total absolute delta applied across all steps,
 * expressed as negative cost (more progress = lower score).
 *
 * The EIRP deviation limits act as hard feasibility filters upstream —
 * any candidate reaching scoring has already been verified to stay within
 * the allowed EIRP envelope. So scoring purely by progress lets the
 * algorithm exploit the full allowed deviation headroom to finish faster.
 */
export function scoreCandidate(
  move: CandidateMove,
  currentGainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  _params: AlgorithmParams
): number {
  // Progress = total absolute gain delta applied (more = better = lower cost)
  let progress = 0;
  for (const step of move.steps) {
    progress += Math.abs(step.delta);
  }

  // Return negative progress so that larger moves score lower (better)
  return -progress;
}

/**
 * Compare two candidate moves for tiebreaking (same score).
 * Returns negative if a is preferred over b.
 */
export function compareCandidates(a: CandidateMove, b: CandidateMove, params: AlgorithmParams): number {
  if (params.strategy === 'inner-first') {
    const aInner = INNER_STAGES.has(a.stageType);
    const bInner = INNER_STAGES.has(b.stageType);
    if (aInner && !bInner) return -1;
    if (!aInner && bInner) return 1;
  }

  // Prefer fewer steps (simpler move) when progress is equal
  return a.steps.length - b.steps.length;
}
