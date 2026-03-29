import type { TransitionResult, Channel } from '../../types';

interface Props {
  result: TransitionResult;
  channels: Channel[];
  currentStep: number;
}

export function TransitionSummary({ result, channels, currentStep }: Props) {
  const step = result.steps[currentStep];

  const negLimitExceeded = result.requestedNegativeLimit !== null
    && Math.abs(result.maxNegativeDeviation) > result.requestedNegativeLimit + 0.001;
  const posLimitExceeded = result.requestedPositiveLimit !== null
    && result.maxPositiveDeviation > result.requestedPositiveLimit + 0.001;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Max Neg. Deviation</div>
          <div className={`text-lg font-mono ${negLimitExceeded ? 'text-red-500' : 'text-red-400'}`}>
            {result.maxNegativeDeviation.toFixed(2)} dB
          </div>
          {result.requestedNegativeLimit !== null && (
            <div className={`text-[10px] mt-0.5 ${negLimitExceeded ? 'text-red-500 font-semibold' : 'text-slate-500'}`}>
              Limit: −{result.requestedNegativeLimit.toFixed(2)} dB
              {negLimitExceeded && ' — exceeded'}
            </div>
          )}
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Max Pos. Deviation</div>
          <div className={`text-lg font-mono ${posLimitExceeded ? 'text-amber-500' : 'text-amber-400'}`}>
            +{result.maxPositiveDeviation.toFixed(2)} dB
          </div>
          {result.requestedPositiveLimit !== null && (
            <div className={`text-[10px] mt-0.5 ${posLimitExceeded ? 'text-amber-500 font-semibold' : 'text-slate-500'}`}>
              Limit: +{result.requestedPositiveLimit.toFixed(2)} dB
              {posLimitExceeded && ' — exceeded'}
            </div>
          )}
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
      </div>

      {/* Violation warnings */}
      {(result.eirpLimitViolations > 0 || result.thresholdViolations > 0) && (
        <div className="space-y-1.5">
          {result.eirpLimitViolations > 0 && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2 text-xs text-amber-300">
              <strong>EIRP limits infeasible</strong> at {result.eirpLimitViolations} step{result.eirpLimitViolations > 1 ? 's' : ''}.
              The requested limits could not be satisfied — the algorithm used the best achievable deviation instead.
              Best case: {result.maxNegativeDeviation.toFixed(2)} / +{result.maxPositiveDeviation.toFixed(2)} dB
              {(result.requestedNegativeLimit !== null || result.requestedPositiveLimit !== null) && (
                <> (requested: {result.requestedNegativeLimit !== null ? `−${result.requestedNegativeLimit}` : '∞'} / {result.requestedPositiveLimit !== null ? `+${result.requestedPositiveLimit}` : '∞'} dB)</>
              )}
            </div>
          )}
          {result.thresholdViolations > 0 && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 text-xs text-red-300">
              <strong>Power threshold relaxed</strong> at {result.thresholdViolations} step{result.thresholdViolations > 1 ? 's' : ''} (±1 dB).
            </div>
          )}
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
