import type { TransitionResult, Channel } from '../../types';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  result: TransitionResult;
  channels: Channel[];
  currentStep: number;
}

export function TransitionSummary({ result, channels, currentStep }: Props) {
  const { theme } = useTheme();
  const dk = theme.mode === 'dark';
  const step = result.steps[currentStep];

  const card = dk ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-gray-200 shadow-sm';
  const label = dk ? 'text-slate-500' : 'text-gray-400';
  const muted = dk ? 'text-slate-400' : 'text-gray-500';

  return (
    <div className="space-y-3">
      {result.error && (
        <div className={`${dk ? 'bg-red-900/30 border-red-700/50 text-red-200' : 'bg-red-50 border-red-200 text-red-800'} border rounded-lg px-4 py-3 text-sm`}>
          <div className={`font-semibold mb-1 ${dk ? 'text-red-400' : 'text-red-600'}`}>Infeasible EIRP Limits</div>
          <div>{result.error}</div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`${card} border rounded-lg p-3`}>
          <div className={`text-[10px] ${label} uppercase tracking-wider mb-1`}>Max Neg. Deviation</div>
          <div className="text-lg font-mono text-red-500">{result.maxNegativeDeviation.toFixed(2)} dB</div>
        </div>
        <div className={`${card} border rounded-lg p-3`}>
          <div className={`text-[10px] ${label} uppercase tracking-wider mb-1`}>Max Pos. Deviation</div>
          <div className={`text-lg font-mono ${dk ? 'text-amber-400' : 'text-amber-600'}`}>+{result.maxPositiveDeviation.toFixed(2)} dB</div>
        </div>
        <div className={`${card} border rounded-lg p-3`}>
          <div className={`text-[10px] ${label} uppercase tracking-wider mb-1`}>Total Steps</div>
          <div className="text-lg font-mono text-blue-500">{result.totalSteps}</div>
        </div>
        <div className={`${card} border rounded-lg p-3`}>
          <div className={`text-[10px] ${label} uppercase tracking-wider mb-1`}>Status</div>
          <div className={`text-lg font-mono ${
            result.error ? 'text-red-500' : result.converged ? 'text-emerald-500' : dk ? 'text-amber-400' : 'text-amber-600'
          }`}>
            {result.error ? 'Error' : result.converged ? 'Converged' : 'Incomplete'}
          </div>
        </div>
      </div>

      {result.thresholdViolations > 0 && (
        <div className={`${dk ? 'bg-amber-900/20 border-amber-800/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'} border rounded-lg px-3 py-2 text-xs`}>
          Power threshold relaxed at {result.thresholdViolations} step{result.thresholdViolations > 1 ? 's' : ''} (±1 dB).
        </div>
      )}

      {step && (
        <div className={`${card} border rounded-lg p-3`}>
          <div className={`text-[10px] ${label} uppercase tracking-wider mb-2`}>
            Channel EIRP at Step {currentStep + 1}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {channels.map(ch => {
              const dev = step.channelEirpDeviation[ch.id] ?? 0;
              return (
                <div key={ch.id} className="flex items-center justify-between text-xs">
                  <span className={muted}>{ch.name}</span>
                  <span className={`font-mono ${
                    dev < -0.01 ? 'text-red-500' : dev > 0.01 ? (dk ? 'text-amber-400' : 'text-amber-600') : 'text-emerald-500'
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
