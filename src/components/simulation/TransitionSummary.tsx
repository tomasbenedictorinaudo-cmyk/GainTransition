import type { TransitionResult, Channel } from '../../types';

interface Props {
  result: TransitionResult;
  channels: Channel[];
  currentStep: number;
}

export function TransitionSummary({ result, channels, currentStep }: Props) {
  const step = result.steps[currentStep];

  return (
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
        <div className={`text-lg font-mono ${result.converged ? 'text-emerald-400' : 'text-red-400'}`}>
          {result.converged ? 'Converged' : 'Incomplete'}
        </div>
      </div>

      {step && (
        <div className="col-span-2 lg:col-span-4 bg-slate-800/60 border border-slate-700 rounded-lg p-3">
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
