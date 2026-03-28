import type { AlgorithmParams } from '../../types';

interface Props {
  params: AlgorithmParams;
  onUpdate: (updates: Partial<AlgorithmParams>) => void;
}

export function AlgorithmParamsPanel({ params, onUpdate }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Algorithm Parameters</h3>

      {/* EIRP deviation limits */}
      <div className="space-y-2">
        <span className="text-xs text-slate-400 font-medium">Max EIRP Deviation (dB)</span>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-red-400">Negative (drop)</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.maxNegativeEirpDeviation !== null}
                  onChange={e => onUpdate({ maxNegativeEirpDeviation: e.target.checked ? 0.5 : null })}
                  className="rounded border-slate-600 bg-slate-700 text-red-500 focus:ring-red-500 w-3 h-3"
                />
                <span className="text-[9px] text-slate-500">Limit</span>
              </label>
            </div>
            <input
              type="number"
              value={params.maxNegativeEirpDeviation ?? ''}
              placeholder="None"
              step={0.25}
              min={0}
              disabled={params.maxNegativeEirpDeviation === null}
              onChange={e => {
                const val = parseFloat(e.target.value);
                onUpdate({ maxNegativeEirpDeviation: isNaN(val) ? null : Math.max(0, val) });
              }}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-red-500 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-amber-400">Positive (rise)</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.maxPositiveEirpDeviation !== null}
                  onChange={e => onUpdate({ maxPositiveEirpDeviation: e.target.checked ? 1.0 : null })}
                  className="rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500 w-3 h-3"
                />
                <span className="text-[9px] text-slate-500">Limit</span>
              </label>
            </div>
            <input
              type="number"
              value={params.maxPositiveEirpDeviation ?? ''}
              placeholder="None"
              step={0.25}
              min={0}
              disabled={params.maxPositiveEirpDeviation === null}
              onChange={e => {
                const val = parseFloat(e.target.value);
                onUpdate({ maxPositiveEirpDeviation: isNaN(val) ? null : Math.max(0, val) });
              }}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-amber-500 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </label>
        </div>

        {(params.maxNegativeEirpDeviation !== null || params.maxPositiveEirpDeviation !== null) && (
          <span className="text-[10px] text-slate-500 block">
            Hard constraints: rejects any move exceeding
            {params.maxNegativeEirpDeviation !== null ? ` −${params.maxNegativeEirpDeviation}` : ''}
            {params.maxNegativeEirpDeviation !== null && params.maxPositiveEirpDeviation !== null ? ' /' : ''}
            {params.maxPositiveEirpDeviation !== null ? ` +${params.maxPositiveEirpDeviation}` : ''} dB.
          </span>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-400">Strategy</span>
        <select
          value={params.strategy}
          onChange={e => onUpdate({ strategy: e.target.value as AlgorithmParams['strategy'] })}
          className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="greedy">Greedy (minimize cost each step)</option>
          <option value="inner-first">Inner-First (per-channel gains first)</option>
          <option value="g4-compensated">G4-Compensated (use G4 as balancing stage)</option>
        </select>
      </label>

      {params.strategy === 'g4-compensated' && (
        <div className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">G4 Compensation Timing</span>
            <select
              value={params.g4CompensationMode}
              onChange={e => onUpdate({ g4CompensationMode: e.target.value as 'before' | 'after' })}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="after">After (primary step → G4 correction)</option>
              <option value="before">Before (G4 pre-correction → primary step)</option>
            </select>
          </label>
          <div className="p-2 bg-cyan-900/20 border border-cyan-800/30 rounded text-[10px] text-cyan-300/80 space-y-1">
            <p><strong>Phase 1:</strong> Apply non-G4 gains. Each step is followed{params.g4CompensationMode === 'before' ? ' (preceded)' : ''} by a G4 correction on all affected channels.</p>
            <p><strong>Phase 2:</strong> Step G4 to final targets (causes EIRP deviation).</p>
            <p>Multiple G4 gains update simultaneously (digital, per-channel).</p>
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-400">Max iterations</span>
        <input
          type="number"
          value={params.maxIterations}
          step={100}
          min={10}
          onChange={e => onUpdate({ maxIterations: parseInt(e.target.value) || 1000 })}
          className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
        />
      </label>

      <div className="mt-2 p-2 bg-slate-800/50 rounded text-[10px] text-slate-500 space-y-1">
        <p><strong className="text-slate-400">Move rules:</strong></p>
        <p>Each iteration changes one gain stage type (Gn).</p>
        <p>Analog (G1, G7): one antenna per step.</p>
        <p>Digital (G2–G6): all instances move together.</p>
      </div>
    </div>
  );
}
