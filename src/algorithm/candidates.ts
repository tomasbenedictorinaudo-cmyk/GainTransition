import type { AtomicStep, CandidateMove } from '../types';

/** Gain stage types that are analog (one antenna per iteration) */
const ANALOG_STAGES = new Set(['G1', 'G7']);

/**
 * Extract the stage type (e.g. 'G1', 'G2', ..., 'G7') from a gain stage key.
 */
function getStageType(key: string): string {
  return key.split(':')[0];
}

/** How many whole granularity steps remain for this key */
function remainingSteps(key: string, gainValues: Record<string, number>, targetValues: Record<string, number>, granularities: Record<string, number>): number {
  const remaining = targetValues[key] - gainValues[key];
  return Math.round(Math.abs(remaining) / granularities[key]);
}

/**
 * Generate candidate moves respecting the constraints:
 * - Each move changes only one gain stage TYPE (e.g. all G3 gains, or all G4 gains)
 * - For analog stages (G1, G7): one antenna per move
 * - For digital stages (G2-G6): all instances of that type move together
 * - Each candidate can step by 1..N granularity steps (up to remaining delta)
 * @param excludeTypes - stage types to exclude from candidate generation (e.g. ['G4'])
 */
export function generateCandidateMoves(
  gainValues: Record<string, number>,
  targetValues: Record<string, number>,
  granularities: Record<string, number>,
  excludeTypes?: Set<string>
): CandidateMove[] {
  const moves: CandidateMove[] = [];

  // Group pending changes by stage type, storing full remaining info
  const pendingByType = new Map<string, { key: string; remaining: number; gran: number; direction: 1 | -1 }[]>();

  for (const key of Object.keys(targetValues).sort()) {
    const current = gainValues[key];
    const target = targetValues[key];
    const gran = granularities[key];
    const remaining = target - current;

    if (Math.abs(remaining) < gran * 0.01) continue;

    const stageType = getStageType(key);
    if (excludeTypes?.has(stageType)) continue;

    const direction: 1 | -1 = remaining > 0 ? 1 : -1;
    const maxSteps = Math.round(Math.abs(remaining) / gran);

    if (!pendingByType.has(stageType)) {
      pendingByType.set(stageType, []);
    }
    pendingByType.get(stageType)!.push({ key, remaining: maxSteps, gran, direction });
  }

  for (const [stageType, pending] of pendingByType) {
    if (ANALOG_STAGES.has(stageType)) {
      // Analog: one antenna per move, generate candidates for each step count 1..maxSteps
      for (const { key, remaining: maxSteps, gran, direction } of pending) {
        for (let n = 1; n <= maxSteps; n++) {
          moves.push({
            steps: [{ gainStageKey: key, delta: direction * n * gran }],
            stageType,
          });
        }
      }
    } else {
      // Digital: all instances move together
      // Generate candidates for step multiplier 1..maxMultiplier
      // maxMultiplier = max remaining steps across all instances
      // Each instance is capped at its own remaining steps
      const maxMultiplier = Math.max(...pending.map(p => p.remaining));

      for (let n = 1; n <= maxMultiplier; n++) {
        const steps: AtomicStep[] = [];
        for (const { key, remaining: maxSteps, gran, direction } of pending) {
          const actualN = Math.min(n, maxSteps);
          steps.push({ gainStageKey: key, delta: direction * actualN * gran });
        }
        moves.push({ steps, stageType });
      }
    }
  }

  return moves;
}
