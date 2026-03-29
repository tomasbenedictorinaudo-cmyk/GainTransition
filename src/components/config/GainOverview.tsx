import type { GainStage } from '../../types';
import { getGainStageLabel } from '../../core/serialization';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  gainStages: Map<string, GainStage>;
  onUpdate: (key: string, updates: Partial<GainStage>) => void;
}

function GainRow({ stageKey, stage, onUpdate, dk }: {
  stageKey: string;
  stage: GainStage;
  onUpdate: (key: string, updates: Partial<GainStage>) => void;
  dk: boolean;
}) {
  const hasDelta = Math.abs(stage.targetValue - stage.currentValue) > 0.001;
  const rowBg = hasDelta ? (dk ? 'bg-amber-900/10' : 'bg-amber-50') : '';
  const inp = dk
    ? 'bg-slate-700 border-slate-600 text-slate-200'
    : 'bg-white border-gray-300 text-gray-900';

  return (
    <tr className={`border-b ${dk ? 'border-slate-700/50' : 'border-gray-200'} ${rowBg}`}>
      <td className={`py-1.5 px-2 text-xs font-mono whitespace-nowrap ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
        {getGainStageLabel(stageKey)}
      </td>
      <td className="py-1.5 px-1">
        <input type="number" value={stage.currentValue} step={stage.stepGranularity}
          onChange={e => onUpdate(stageKey, { currentValue: parseFloat(e.target.value) || 0 })}
          className={`w-16 ${inp} border rounded px-1.5 py-0.5 text-xs text-center focus:border-blue-500 focus:outline-none`} />
      </td>
      <td className="py-1.5 px-1">
        <input type="number" value={stage.targetValue} step={stage.stepGranularity}
          onChange={e => onUpdate(stageKey, { targetValue: parseFloat(e.target.value) || 0 })}
          className={`w-16 border rounded px-1.5 py-0.5 text-xs text-center focus:border-blue-500 focus:outline-none ${
            hasDelta
              ? (dk ? 'bg-slate-700 border-amber-500/50 text-amber-300' : 'bg-white border-amber-400 text-amber-700')
              : inp
          }`} />
      </td>
      <td className="py-1.5 px-1">
        <input type="number" value={stage.stepGranularity} step={0.05} min={0.01}
          onChange={e => onUpdate(stageKey, { stepGranularity: parseFloat(e.target.value) || 0.1 })}
          className={`w-14 ${inp} border rounded px-1.5 py-0.5 text-xs text-center focus:border-blue-500 focus:outline-none`} />
      </td>
      <td className="py-1.5 px-1">
        <input type="number" value={stage.lowerThreshold} step={1}
          onChange={e => onUpdate(stageKey, { lowerThreshold: parseFloat(e.target.value) || 0 })}
          className={`w-14 ${inp} border rounded px-1.5 py-0.5 text-xs text-center focus:border-blue-500 focus:outline-none`} />
      </td>
      <td className="py-1.5 px-1">
        <input type="number" value={stage.upperThreshold} step={1}
          onChange={e => onUpdate(stageKey, { upperThreshold: parseFloat(e.target.value) || 0 })}
          className={`w-14 ${inp} border rounded px-1.5 py-0.5 text-xs text-center focus:border-blue-500 focus:outline-none`} />
      </td>
      <td className="py-1.5 px-2 text-xs text-center font-mono">
        {hasDelta ? (
          <span className={dk ? 'text-amber-400' : 'text-amber-600'}>
            {(stage.targetValue - stage.currentValue) > 0 ? '+' : ''}
            {(stage.targetValue - stage.currentValue).toFixed(2)}
          </span>
        ) : (
          <span className={dk ? 'text-slate-600' : 'text-gray-300'}>0</span>
        )}
      </td>
    </tr>
  );
}

export function GainOverview({ gainStages, onUpdate }: Props) {
  const { theme } = useTheme();
  const dk = theme.mode === 'dark';

  const groups: Record<string, [string, GainStage][]> = {
    'Receive Chain': [],
    'Transmit Chain': [],
  };

  for (const [key, stage] of gainStages) {
    if (['G1', 'G2', 'G3'].includes(stage.id.type)) {
      groups['Receive Chain'].push([key, stage]);
    } else {
      groups['Transmit Chain'].push([key, stage]);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className={`text-sm font-semibold uppercase tracking-wider ${dk ? 'text-slate-300' : 'text-gray-700'}`}>Gain Stages</h3>

      {Object.entries(groups).map(([groupName, stages]) => (
        <div key={groupName}>
          <h4 className={`text-xs mb-1 font-medium ${dk ? 'text-slate-500' : 'text-gray-400'}`}>{groupName}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className={`uppercase tracking-wider ${dk ? 'text-slate-500' : 'text-gray-400'}`}>
                  <th className="text-left py-1 px-2 font-medium">Stage</th>
                  <th className="py-1 px-1 font-medium">Current</th>
                  <th className="py-1 px-1 font-medium">Target</th>
                  <th className="py-1 px-1 font-medium">Step</th>
                  <th className="py-1 px-1 font-medium">Lo Thr</th>
                  <th className="py-1 px-1 font-medium">Hi Thr</th>
                  <th className="py-1 px-2 font-medium">Delta</th>
                </tr>
              </thead>
              <tbody>
                {stages.map(([key, stage]) => (
                  <GainRow key={key} stageKey={key} stage={stage} onUpdate={onUpdate} dk={dk} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
