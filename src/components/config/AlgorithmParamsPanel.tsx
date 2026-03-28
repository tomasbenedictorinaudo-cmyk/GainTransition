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
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={params.preferCompensatingPairs}
            onChange={e => onUpdate({ preferCompensatingPairs: e.target.checked })}
            className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-400">Compensating pairs</span>
        </label>
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
      </div>
    </div>
  );
}
