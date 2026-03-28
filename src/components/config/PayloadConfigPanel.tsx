import type { PayloadConfig, Channel } from '../../types';
import { ChannelEditor } from './ChannelEditor';

interface Props {
  config: PayloadConfig;
  onUpdateChannel: (id: string, updates: Partial<Channel>) => void;
  onAddChannel: () => void;
  onRemoveChannel: (id: string) => void;
  onUpdateAntennaCount: (type: 'rx' | 'tx', count: number) => void;
}

export function PayloadConfigPanel({
  config,
  onUpdateChannel,
  onAddChannel,
  onRemoveChannel,
  onUpdateAntennaCount,
}: Props) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Payload Configuration</h3>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Rx Antennas</span>
          <input
            type="number"
            min={1}
            max={16}
            value={config.rxAntennaCount}
            onChange={e => onUpdateAntennaCount('rx', parseInt(e.target.value) || 1)}
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Tx Antennas</span>
          <input
            type="number"
            min={1}
            max={16}
            value={config.txAntennaCount}
            onChange={e => onUpdateAntennaCount('tx', parseInt(e.target.value) || 1)}
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-slate-400">Channels ({config.channels.length})</h4>
        <button
          onClick={onAddChannel}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors"
        >
          + Add Channel
        </button>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {config.channels.map(ch => (
          <ChannelEditor
            key={ch.id}
            channel={ch}
            rxAntennaCount={config.rxAntennaCount}
            txAntennaCount={config.txAntennaCount}
            onChange={onUpdateChannel}
            onRemove={onRemoveChannel}
          />
        ))}
      </div>
    </div>
  );
}
