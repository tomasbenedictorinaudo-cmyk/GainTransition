import type { AlgorithmParams } from '../../types';

interface Props {
  params: AlgorithmParams;
  onUpdate: (updates: Partial<AlgorithmParams>) => void;
}

export function AlgorithmParamsPanel({ params, onUpdate }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Algorithm Parameters</h3>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Neg. Weight (w-)</span>
          <input
            type="number"
            value={params.negativeWeight}
            step={0.5}
            min={0.1}
            onChange={e => onUpdate({ negativeWeight: parseFloat(e.target.value) || 1 })}
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Pos. Weight (w+)</span>
          <input
            type="number"
            value={params.positiveWeight}
            step={0.5}
            min={0.1}
            onChange={e => onUpdate({ positiveWeight: parseFloat(e.target.value) || 1 })}
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          />
        </label>
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

      <div className="space-y-3">
        <label className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Max EIRP Deviation (dB)</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={params.maxEirpDeviation !== null}
                onChange={e => onUpdate({ maxEirpDeviation: e.target.checked ? 1.0 : null })}
                className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-500">Enable</span>
            </label>
          </div>
          <input
            type="number"
            value={params.maxEirpDeviation ?? ''}
            placeholder="Unconstrained"
            step={0.25}
            min={0}
            disabled={params.maxEirpDeviation === null}
            onChange={e => {
              const val = parseFloat(e.target.value);
              onUpdate({ maxEirpDeviation: isNaN(val) ? null : Math.max(0, val) });
            }}
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          />
          {params.maxEirpDeviation !== null && (
            <span className="text-[10px] text-amber-400/70">
              Hard constraint: rejects any move exceeding &plusmn;{params.maxEirpDeviation} dB. May prevent convergence if too tight.
            </span>
          )}
        </label>
      </div>

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
