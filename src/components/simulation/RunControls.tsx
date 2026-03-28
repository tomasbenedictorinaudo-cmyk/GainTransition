import type { TransitionResult } from '../../types';

interface Props {
  onRun: () => void;
  onReset: () => void;
  isRunning: boolean;
  result: TransitionResult | null;
}

export function RunControls({ onRun, onReset, isRunning, result }: Props) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onRun}
        disabled={isRunning}
        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {isRunning ? 'Running...' : 'Run CCGS'}
      </button>
      {result && (
        <button
          onClick={onReset}
          className="bg-slate-600 hover:bg-slate-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Reset
        </button>
      )}
      {result && (
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>
            {result.converged ? (
              <span className="text-emerald-400">Converged</span>
            ) : (
              <span className="text-red-400">Did not converge</span>
            )}
          </span>
          <span>{result.totalSteps} steps</span>
          {result.thresholdViolations > 0 && (
            <span className="text-amber-400">{result.thresholdViolations} threshold relaxations</span>
          )}
        </div>
      )}
    </div>
  );
}
