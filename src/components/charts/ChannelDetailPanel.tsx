import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import type { TransitionResult, Channel, GainStage } from '../../types';
import { getChannelGainChain } from '../../core/coupling';
import { getGainStageLabel } from '../../core/serialization';

interface Props {
  result: TransitionResult;
  channel: Channel;
  gainStages: Map<string, GainStage>;
  currentStep: number;
  onClose: () => void;
}

const GAIN_COLORS: Record<string, string> = {
  G1: '#60a5fa', G2: '#38bdf8', G3: '#34d399', G4: '#fbbf24',
  G5: '#fb923c', G6: '#a78bfa', G7: '#f472b6',
};

function colorFor(key: string): string {
  const type = key.split(':')[0];
  return GAIN_COLORS[type] || '#94a3b8';
}

export function ChannelDetailPanel({ result, channel, gainStages, currentStep, onClose }: Props) {
  const chainKeys = useMemo(() => getChannelGainChain(channel), [channel]);

  // EIRP data for this channel
  const eirpData = useMemo(() => {
    return [
      { step: 0, eirp: result.initialEirp[channel.id], deviation: 0 },
      ...result.steps.map((s, i) => ({
        step: i + 1,
        eirp: s.channelEirp[channel.id] ?? 0,
        deviation: s.channelEirpDeviation[channel.id] ?? 0,
      })),
    ];
  }, [result, channel.id]);

  // Gain evolution data for this channel's chain
  const gainData = useMemo(() => {
    return [
      {
        step: 0,
        ...Object.fromEntries(chainKeys.map(k => [getGainStageLabel(k), result.initialGainValues[k]])),
      },
      ...result.steps.map((s, i) => ({
        step: i + 1,
        ...Object.fromEntries(chainKeys.map(k => [getGainStageLabel(k), s.gainValues[k] ?? 0])),
      })),
    ];
  }, [result, chainKeys]);

  // System temperature data for this channel
  const tempData = useMemo(() => {
    return [
      { step: 0, temp: result.initialSystemTemp[channel.id] ?? 0 },
      ...result.steps.map((s, i) => ({
        step: i + 1,
        temp: Math.round((s.systemTemp[channel.id] ?? 0) * 10) / 10,
      })),
    ];
  }, [result, channel.id]);

  // Steps that affect this channel (any step in the move touches a gain in this channel's chain)
  const affectedSteps = useMemo(() => {
    const chainSet = new Set(chainKeys);
    return result.steps
      .map((s, i) => ({ ...s, originalIndex: i }))
      .filter(s => s.appliedMove.steps.some(atom => chainSet.has(atom.gainStageKey)));
  }, [result, chainKeys]);

  // Current step snapshot
  const snapshot = currentStep >= 0 && currentStep < result.steps.length
    ? result.steps[currentStep]
    : null;

  return (
    <div className="bg-slate-800/80 border border-cyan-700/40 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-cyan-300">
            Channel: {channel.name}
          </h3>
          <p className="text-[10px] text-slate-500">
            Rx{channel.rxAntennaId} → Tx{channel.txAntennaId} | {channel.bandwidthMHz} MHz |
            Rx: {channel.rxLowFreqMHz} MHz | Tx: {channel.txLowFreqMHz} MHz
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 border border-slate-600 rounded transition-colors"
        >
          Close
        </button>
      </div>

      {/* Current step snapshot */}
      {snapshot && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900/50 rounded p-2">
            <span className="text-[10px] text-slate-500 block">EIRP at Step {currentStep + 1}</span>
            <span className="text-sm font-mono text-slate-200">
              {snapshot.channelEirp[channel.id]?.toFixed(2)} dBm
            </span>
          </div>
          <div className="bg-slate-900/50 rounded p-2">
            <span className="text-[10px] text-slate-500 block">EIRP Deviation</span>
            <span className={`text-sm font-mono ${
              (snapshot.channelEirpDeviation[channel.id] ?? 0) < -0.01
                ? 'text-red-400'
                : (snapshot.channelEirpDeviation[channel.id] ?? 0) > 0.01
                  ? 'text-amber-400'
                  : 'text-emerald-400'
            }`}>
              {(snapshot.channelEirpDeviation[channel.id] ?? 0) > 0 ? '+' : ''}
              {snapshot.channelEirpDeviation[channel.id]?.toFixed(3)} dB
            </span>
          </div>
          <div className="bg-slate-900/50 rounded p-2">
            <span className="text-[10px] text-slate-500 block">System Temp</span>
            <span className="text-sm font-mono text-orange-300">
              {(snapshot.systemTemp[channel.id] ?? 0).toFixed(1)} K
            </span>
            <span className="text-[9px] text-slate-600 block">
              init: {(result.initialSystemTemp[channel.id] ?? 0).toFixed(1)} K
            </span>
          </div>
        </div>
      )}

      {/* Gain chain state at current step */}
      <div>
        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          Gain Chain at Step {snapshot ? currentStep + 1 : 0}
        </h4>
        <div className="grid grid-cols-7 gap-1">
          {chainKeys.map(key => {
            const label = getGainStageLabel(key);
            const current = snapshot ? snapshot.gainValues[key] : result.initialGainValues[key];
            const initial = result.initialGainValues[key];
            const target = result.targetGainValues[key];
            const delta = current - initial;
            return (
              <div key={key} className="bg-slate-900/50 rounded p-1.5 text-center">
                <div className="text-[9px] text-slate-500 truncate" title={label}>{label}</div>
                <div className="text-xs font-mono text-slate-200">{current?.toFixed(2)}</div>
                {Math.abs(delta) > 0.001 && (
                  <div className={`text-[9px] font-mono ${delta > 0 ? 'text-amber-400' : 'text-cyan-400'}`}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                  </div>
                )}
                <div className="text-[8px] text-slate-600">→ {target?.toFixed(2)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* EIRP evolution chart */}
      <div>
        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          EIRP Deviation (dB)
        </h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={eirpData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="step" stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value: number) => [`${value.toFixed(3)} dB`, 'Deviation']}
            />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="5 5" />
            <ReferenceLine x={currentStep + 1} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={2} />
            <Line type="stepAfter" dataKey="deviation" stroke="#22d3ee" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Gain chain evolution chart */}
      <div>
        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          Gain Values (dB)
        </h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={gainData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="step" stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Legend wrapperStyle={{ fontSize: 9 }} />
            <ReferenceLine x={currentStep + 1} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={2} />
            {chainKeys.map(key => (
              <Line
                key={key}
                type="stepAfter"
                dataKey={getGainStageLabel(key)}
                stroke={colorFor(key)}
                dot={false}
                strokeWidth={1.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* System temperature evolution */}
      <div>
        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          System Noise Temperature (K)
        </h4>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={tempData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="step" stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value: number) => [`${value.toFixed(1)} K`, 'Tsys']}
            />
            <ReferenceLine x={currentStep + 1} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={2} />
            <Line type="stepAfter" dataKey="temp" stroke="#fb923c" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Step log: only moves affecting this channel */}
      <div>
        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          Steps Affecting This Channel ({affectedSteps.length} of {result.steps.length})
        </h4>
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {affectedSteps.map(s => {
            const isCurrent = s.originalIndex === currentStep;
            return (
              <div
                key={s.originalIndex}
                className={`text-[10px] font-mono px-2 py-1 rounded flex items-center gap-2 ${
                  isCurrent ? 'bg-blue-900/40 border border-blue-700/50' : 'bg-slate-900/30'
                }`}
              >
                <span className="text-slate-500 w-12 shrink-0">#{s.originalIndex + 1}</span>
                <span className="text-slate-400 w-8 shrink-0">[{s.appliedMove.stageType}]</span>
                <span className="text-slate-300 truncate">
                  {s.appliedMove.steps
                    .filter(atom => new Set(chainKeys).has(atom.gainStageKey))
                    .map(atom => `${getGainStageLabel(atom.gainStageKey)} ${atom.delta > 0 ? '+' : ''}${atom.delta.toFixed(2)}`)
                    .join(', ')}
                </span>
                <span className={`ml-auto shrink-0 ${
                  (s.channelEirpDeviation[channel.id] ?? 0) < -0.01 ? 'text-red-400' :
                  (s.channelEirpDeviation[channel.id] ?? 0) > 0.01 ? 'text-amber-400' :
                  'text-emerald-400'
                }`}>
                  {(s.channelEirpDeviation[channel.id] ?? 0) > 0 ? '+' : ''}
                  {s.channelEirpDeviation[channel.id]?.toFixed(3)} dB
                </span>
              </div>
            );
          })}
          {affectedSteps.length === 0 && (
            <div className="text-[10px] text-slate-600 italic py-2">No steps affect this channel</div>
          )}
        </div>
      </div>
    </div>
  );
}
