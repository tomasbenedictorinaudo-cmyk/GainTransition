import type { AlgorithmParams, CandidateMove, Channel } from '../types';
import { computeAllChannelEirp } from '../core/eirp';
import { isSharedGain } from '../core/coupling';

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
  // Prefer compensating pairs
  if (params.preferCompensatingPairs) {
    if (a.isCompensatingPair && !b.isCompensatingPair) return -1;
    if (!a.isCompensatingPair && b.isCompensatingPair) return 1;
  }

  // Prefer per-channel gains over shared gains (inner-first)
  if (params.strategy === 'inner-first') {
    const aShared = a.steps.some(s => isSharedGain(s.gainStageKey));
    const bShared = b.steps.some(s => isSharedGain(s.gainStageKey));
    if (!aShared && bShared) return -1;
    if (aShared && !bShared) return 1;
  }

  // Prefer fewer steps (simpler move)
  return a.steps.length - b.steps.length;
}
