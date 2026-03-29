import type { PayloadConfig, Channel } from '../../types';
import { ChannelEditor } from './ChannelEditor';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  config: PayloadConfig;
  onUpdateChannel: (id: string, updates: Partial<Channel>) => void;
  onAddChannel: () => void;
  onRemoveChannel: (id: string) => void;
  onUpdateAntennaCount: (type: 'rx' | 'tx', count: number) => void;
}

export function PayloadConfigPanel({
  config, onUpdateChannel, onAddChannel, onRemoveChannel, onUpdateAntennaCount,
}: Props) {
  const { theme } = useTheme();
  const dk = theme.mode === 'dark';
  const inp = dk ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-gray-300 text-gray-900';

  return (
    <div className="space-y-4">
      <h3 className={`text-sm font-semibold uppercase tracking-wider ${dk ? 'text-slate-300' : 'text-gray-700'}`}>Payload Configuration</h3>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={`text-xs ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Rx Antennas</span>
          <input type="number" min={1} max={16} value={config.rxAntennaCount}
            onChange={e => onUpdateAntennaCount('rx', parseInt(e.target.value) || 1)}
            className={`${inp} border rounded px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={`text-xs ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Tx Antennas</span>
          <input type="number" min={1} max={16} value={config.txAntennaCount}
            onChange={e => onUpdateAntennaCount('tx', parseInt(e.target.value) || 1)}
            className={`${inp} border rounded px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none`} />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <h4 className={`text-xs font-medium ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Channels ({config.channels.length})</h4>
        <button onClick={onAddChannel}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors">
          + Add Channel
        </button>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {config.channels.map(ch => (
          <ChannelEditor key={ch.id} channel={ch}
            rxAntennaCount={config.rxAntennaCount} txAntennaCount={config.txAntennaCount}
            onChange={onUpdateChannel} onRemove={onRemoveChannel} />
        ))}
      </div>
    </div>
  );
}
