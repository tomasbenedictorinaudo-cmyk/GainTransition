import type { Channel } from '../../types';

interface Props {
  channel: Channel;
  rxAntennaCount: number;
  txAntennaCount: number;
  onChange: (id: string, updates: Partial<Channel>) => void;
  onRemove: (id: string) => void;
}

function NumInput({ label, value, onChange, step = 1, min, max }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
      />
    </label>
  );
}

export function ChannelEditor({ channel, rxAntennaCount, txAntennaCount, onChange, onRemove }: Props) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={channel.name}
            onChange={e => onChange(channel.id, { name: e.target.value })}
            className="bg-transparent border-b border-slate-600 text-sm font-medium text-slate-200 focus:border-blue-500 focus:outline-none w-20"
          />
          <span className="text-[10px] text-slate-500">ID: {channel.id}</span>
        </div>
        <button
          onClick={() => onRemove(channel.id)}
          className="text-slate-500 hover:text-red-400 text-xs px-1"
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Rx Ant</span>
          <select
            value={channel.rxAntennaId}
            onChange={e => onChange(channel.id, { rxAntennaId: parseInt(e.target.value) })}
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            {Array.from({ length: rxAntennaCount }, (_, i) => (
              <option key={i} value={i}>Rx {i}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Tx Ant</span>
          <select
            value={channel.txAntennaId}
            onChange={e => onChange(channel.id, { txAntennaId: parseInt(e.target.value) })}
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            {Array.from({ length: txAntennaCount }, (_, i) => (
              <option key={i} value={i}>Tx {i}</option>
            ))}
          </select>
        </label>
        <NumInput label="BW (MHz)" value={channel.bandwidthMHz} onChange={v => onChange(channel.id, { bandwidthMHz: v })} step={0.5} min={0.5} />
        <NumInput label="IPFD" value={channel.ipfd} onChange={v => onChange(channel.id, { ipfd: v })} step={0.5} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumInput label="Rx Lo (MHz)" value={channel.rxLowFreqMHz} onChange={v => onChange(channel.id, { rxLowFreqMHz: v })} step={5} />
        <NumInput label="Tx Lo (MHz)" value={channel.txLowFreqMHz} onChange={v => onChange(channel.id, { txLowFreqMHz: v })} step={5} />
        <NumInput label="EIRP Target" value={channel.eirpTarget} onChange={v => onChange(channel.id, { eirpTarget: v })} step={0.5} />
      </div>
    </div>
  );
}
