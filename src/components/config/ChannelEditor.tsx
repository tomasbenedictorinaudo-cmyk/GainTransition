import type { Channel } from '../../types';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  channel: Channel;
  rxAntennaCount: number;
  txAntennaCount: number;
  onChange: (id: string, updates: Partial<Channel>) => void;
  onRemove: (id: string) => void;
}

function NumInput({ label, value, onChange, step = 1, min, max, dk }: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; dk: boolean;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className={`text-[10px] uppercase tracking-wider ${dk ? 'text-slate-400' : 'text-gray-500'}`}>{label}</span>
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className={`w-full border rounded px-2 py-1 text-xs focus:border-blue-500 focus:outline-none ${
          dk ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-gray-300 text-gray-900'
        }`} />
    </label>
  );
}

export function ChannelEditor({ channel, rxAntennaCount, txAntennaCount, onChange, onRemove }: Props) {
  const { theme } = useTheme();
  const dk = theme.mode === 'dark';
  const sel = dk ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-gray-300 text-gray-900';

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${dk ? 'bg-slate-800/50 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input type="text" value={channel.name}
            onChange={e => onChange(channel.id, { name: e.target.value })}
            className={`bg-transparent border-b text-sm font-medium focus:border-blue-500 focus:outline-none w-20 ${
              dk ? 'border-slate-600 text-slate-200' : 'border-gray-300 text-gray-900'
            }`} />
          <span className={`text-[10px] ${dk ? 'text-slate-500' : 'text-gray-400'}`}>ID: {channel.id}</span>
        </div>
        <button onClick={() => onRemove(channel.id)}
          className={`text-xs px-1 ${dk ? 'text-slate-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}>
          Remove
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className={`text-[10px] uppercase tracking-wider ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Rx Ant</span>
          <select value={channel.rxAntennaId}
            onChange={e => onChange(channel.id, { rxAntennaId: parseInt(e.target.value) })}
            className={`${sel} border rounded px-2 py-1 text-xs focus:border-blue-500 focus:outline-none`}>
            {Array.from({ length: rxAntennaCount }, (_, i) => (
              <option key={i} value={i}>Rx {i}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={`text-[10px] uppercase tracking-wider ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Tx Ant</span>
          <select value={channel.txAntennaId}
            onChange={e => onChange(channel.id, { txAntennaId: parseInt(e.target.value) })}
            className={`${sel} border rounded px-2 py-1 text-xs focus:border-blue-500 focus:outline-none`}>
            {Array.from({ length: txAntennaCount }, (_, i) => (
              <option key={i} value={i}>Tx {i}</option>
            ))}
          </select>
        </label>
        <NumInput label="BW (MHz)" value={channel.bandwidthMHz} onChange={v => onChange(channel.id, { bandwidthMHz: v })} step={0.5} min={0.5} dk={dk} />
        <NumInput label="IPFD" value={channel.ipfd} onChange={v => onChange(channel.id, { ipfd: v })} step={0.5} dk={dk} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumInput label="Rx Lo (MHz)" value={channel.rxLowFreqMHz} onChange={v => onChange(channel.id, { rxLowFreqMHz: v })} step={5} dk={dk} />
        <NumInput label="Tx Lo (MHz)" value={channel.txLowFreqMHz} onChange={v => onChange(channel.id, { txLowFreqMHz: v })} step={5} dk={dk} />
        <NumInput label="EIRP Target" value={channel.eirpTarget} onChange={v => onChange(channel.id, { eirpTarget: v })} step={0.5} dk={dk} />
      </div>
    </div>
  );
}
