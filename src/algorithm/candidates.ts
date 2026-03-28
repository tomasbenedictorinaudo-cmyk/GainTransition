import type { AtomicStep, CandidateMove } from '../types';

/** Gain stage types that are analog (one antenna per iteration) */
const ANALOG_STAGES = new Set(['G1', 'G7']);

/**
 * Extract the stage type (e.g. 'G1', 'G2', ..., 'G7') from a gain stage key.
 * Keys follow the pattern "G1:rx0", "G3:ch1", etc.
 */
function getStageType(key: string): string {
  return key.split(':')[0];
}

/**
 * Extract the antenna identifier from an analog gain stage key.
 * G1:rx0 → 'rx0', G7:tx1 → 'tx1'
 */
function getAntennaId(key: string): string {
  return key.split(':')[1];
}

/**
 * Generate candidate moves respecting the new constraints:
 * - Each move changes only one gain stage TYPE (e.g. all G3 gains, or all G4 gains)
 * - For analog stages (G1, G7): one antenna per move (single step)
 * - For digital stages (G2-G6): all instances of that type that have remaining delta
 */
export function generateCandidateMoves(
  gainValues: Record<string, number>,
  targetValues: Record<string, number>,
  granularities: Record<string, number>
): CandidateMove[] {
  const moves: CandidateMove[] = [];

  // Group pending changes by stage type
  const pendingByType = new Map<string, { key: string; delta: number }[]>();

  for (const key of Object.keys(targetValues)) {
    const current = gainValues[key];
    const target = targetValues[key];
    const gran = granularities[key];
    const remaining = target - current;

    if (Math.abs(remaining) < gran * 0.01) continue; // already at target

    const delta = remaining > 0 ? gran : -gran;
    const stageType = getStageType(key);

    if (!pendingByType.has(stageType)) {
      pendingByType.set(stageType, []);
    }
    pendingByType.get(stageType)!.push({ key, delta });
  }

  // Generate moves per stage type
  for (const [stageType, pending] of pendingByType) {
    if (ANALOG_STAGES.has(stageType)) {
      // Analog: one antenna per move — each pending key is its own candidate
      for (const { key, delta } of pending) {
        moves.push({
          steps: [{ gainStageKey: key, delta }],
          stageType,
        });
      }
    } else {
      // Digital: all instances of this stage type move together in one candidate
      const steps: AtomicStep[] = pending.map(({ key, delta }) => ({
        gainStageKey: key,
        delta,
      }));

      if (steps.length > 0) {
        moves.push({
          steps,
          stageType,
        });
      }
    }
  }

  return moves;
}
