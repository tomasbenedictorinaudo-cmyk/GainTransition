import type { TransitionResult, Channel } from '../../types';

interface Props {
  result: TransitionResult;
  channels: Channel[];
  currentStep: number;
}

export function TransitionSummary({ result, channels, currentStep }: Props) {
  const step = result.steps[currentStep];

  return (
    <div className="space-y-3">
      {/* Error banner */}
      {result.error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3 text-sm text-red-200">
          <div className="font-semibold text-red-400 mb-1">Infeasible EIRP Limits</div>
          <div>{result.error}</div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Max Neg. Deviation</div>
          <div className="text-lg font-mono text-red-400">
            {result.maxNegativeDeviation.toFixed(2)} dB
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Max Pos. Deviation</div>
          <div className="text-lg font-mono text-amber-400">
            +{result.maxPositiveDeviation.toFixed(2)} dB
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Steps</div>
          <div className="text-lg font-mono text-blue-400">
            {result.totalSteps}
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Status</div>
          <div className={`text-lg font-mono ${
            result.error ? 'text-red-400' : result.converged ? 'text-emerald-400' : 'text-amber-400'
          }`}>
            {result.error ? 'Error' : result.converged ? 'Converged' : 'Incomplete'}
          </div>
        </div>
      </div>

      {result.thresholdViolations > 0 && (
        <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2 text-xs text-amber-300">
          Power threshold relaxed at {result.thresholdViolations} step{result.thresholdViolations > 1 ? 's' : ''} (±1 dB).
        </div>
      )}

      {step && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
            Channel EIRP at Step {currentStep + 1}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {channels.map(ch => {
              const dev = step.channelEirpDeviation[ch.id] ?? 0;
              return (
                <div key={ch.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{ch.name}</span>
                  <span className={`font-mono ${
                    dev < -0.01 ? 'text-red-400' : dev > 0.01 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {dev > 0 ? '+' : ''}{dev.toFixed(2)} dB
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
