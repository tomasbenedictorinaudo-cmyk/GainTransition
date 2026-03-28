import type { AlgorithmParams, CandidateMove, Channel } from '../types';
import { computeAllChannelEirp } from '../core/eirp';

/** Gain stage types considered "inner" (per-channel) for inner-first strategy */
const INNER_STAGES = new Set(['G3', 'G4', 'G5']);

/**
 * Score a candidate move. Lower score = better.
 * Uses asymmetric weighting: negative EIRP deviation from initial is penalized more.
 */
export function scoreCandidate(
  move: CandidateMove,
  currentGainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  params: AlgorithmParams
): number {
  // Apply the move temporarily
  const tempGains = { ...currentGainValues };
  for (const step of move.steps) {
    tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
  }

  // Compute EIRP after move
  const newEirp = computeAllChannelEirp(channels, tempGains);

  // Compute asymmetric cost
  let cost = 0;
  for (const ch of channels) {
    const deviation = newEirp[ch.id] - initialEirp[ch.id];
    if (deviation < 0) {
      cost += params.negativeWeight * Math.abs(deviation);
    } else {
      cost += params.positiveWeight * deviation;
    }
  }

  return cost;
}

/**
 * Compare two candidate moves for tiebreaking.
 * Returns negative if a is preferred over b.
 */
export function compareCandidates(a: CandidateMove, b: CandidateMove, params: AlgorithmParams): number {
  // Prefer per-channel (inner) stages over shared stages (inner-first strategy)
  if (params.strategy === 'inner-first') {
    const aInner = INNER_STAGES.has(a.stageType);
    const bInner = INNER_STAGES.has(b.stageType);
    if (aInner && !bInner) return -1;
    if (!aInner && bInner) return 1;
  }

  // Prefer fewer steps (simpler move)
  return a.steps.length - b.steps.length;
}
