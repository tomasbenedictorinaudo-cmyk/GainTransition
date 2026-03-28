import type { AlgorithmParams, CandidateMove, Channel } from '../types';
import { computeAllChannelEirp } from '../core/eirp';

/** Gain stage types considered "inner" (per-channel) for inner-first strategy */
const INNER_STAGES = new Set(['G3', 'G4', 'G5']);

/**
 * Score a candidate move. Lower score = better.
 * Minimizes total absolute EIRP deviation from initial across all channels.
 */
export function scoreCandidate(
  move: CandidateMove,
  currentGainValues: Record<string, number>,
  channels: Channel[],
  initialEirp: Record<string, number>,
  _params: AlgorithmParams
): number {
  const tempGains = { ...currentGainValues };
  for (const step of move.steps) {
    tempGains[step.gainStageKey] = (tempGains[step.gainStageKey] ?? 0) + step.delta;
  }

  const newEirp = computeAllChannelEirp(channels, tempGains);

  let cost = 0;
  for (const ch of channels) {
    cost += Math.abs(newEirp[ch.id] - initialEirp[ch.id]);
  }

  return cost;
}

/**
 * Compare two candidate moves for tiebreaking.
 * Returns negative if a is preferred over b.
 */
export function compareCandidates(a: CandidateMove, b: CandidateMove, params: AlgorithmParams): number {
  if (params.strategy === 'inner-first') {
    const aInner = INNER_STAGES.has(a.stageType);
    const bInner = INNER_STAGES.has(b.stageType);
    if (aInner && !bInner) return -1;
    if (!aInner && bInner) return 1;
  }

  return a.steps.length - b.steps.length;
}
