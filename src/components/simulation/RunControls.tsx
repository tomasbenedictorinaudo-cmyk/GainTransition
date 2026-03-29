import type { TransitionResult, Channel } from '../../types';
import { getGainStageLabel } from '../../core/serialization';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  onRun: () => void;
  onReset: () => void;
  isRunning: boolean;
  result: TransitionResult | null;
  channels?: Channel[];
}

function exportCSV(result: TransitionResult, channels: Channel[]) {
  const gainKeys = Object.keys(result.initialGainValues).sort();
  const channelIds = channels.map(c => c.id);

  const headers = [
    'Step', 'Move Type', 'Changed Stages',
    ...gainKeys.map(k => `Gain: ${getGainStageLabel(k)}`),
    ...channels.map(c => `EIRP: ${c.name}`),
    ...channels.map(c => `EIRP Dev: ${c.name}`),
    ...channels.map(c => `Tsys (K): ${c.name}`),
  ];

  const rows: string[][] = [];
  rows.push([
    '0', 'Initial', '',
    ...gainKeys.map(k => result.initialGainValues[k].toFixed(4)),
    ...channelIds.map(id => result.initialEirp[id].toFixed(4)),
    ...channelIds.map(() => '0.0000'),
    ...channelIds.map(id => (result.initialSystemTemp[id] ?? 0).toFixed(2)),
  ]);

  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i];
    const move = step.appliedMove;
    const changed = move.steps
      .map(s => `${getGainStageLabel(s.gainStageKey)} ${s.delta > 0 ? '+' : ''}${s.delta.toFixed(2)}`)
      .join('; ');
    rows.push([
      String(i + 1), move.stageType, changed,
      ...gainKeys.map(k => step.gainValues[k].toFixed(4)),
      ...channelIds.map(id => step.channelEirp[id].toFixed(4)),
      ...channelIds.map(id => step.channelEirpDeviation[id].toFixed(4)),
      ...channelIds.map(id => (step.systemTemp[id] ?? 0).toFixed(2)),
    ]);
  }

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ccgs-transition-${result.totalSteps}steps.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RunControls({ onRun, onReset, isRunning, result, channels }: Props) {
  const { theme } = useTheme();
  const dk = theme.mode === 'dark';

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onRun}
        disabled={isRunning}
        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {isRunning ? 'Running...' : 'Run CCGS'}
      </button>
      {result && (
        <button onClick={onReset}
          className={`${dk ? 'bg-slate-600 hover:bg-slate-500' : 'bg-gray-300 hover:bg-gray-400'} text-sm px-4 py-2 rounded-lg transition-colors ${dk ? 'text-white' : 'text-gray-700'}`}>
          Reset
        </button>
      )}
      {result && channels && (
        <button onClick={() => exportCSV(result, channels)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          Export CSV
        </button>
      )}
      {result && (
        <div className={`flex items-center gap-4 text-xs ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
          <span>
            {result.converged ? (
              <span className="text-emerald-500">Converged</span>
            ) : (
              <span className="text-red-500">Did not converge</span>
            )}
          </span>
          <span>{result.totalSteps} steps</span>
          {result.thresholdViolations > 0 && (
            <span className={dk ? 'text-amber-400' : 'text-amber-600'}>{result.thresholdViolations} threshold relaxations</span>
          )}
        </div>
      )}
    </div>
  );
}
