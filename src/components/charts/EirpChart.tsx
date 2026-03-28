import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import type { TransitionResult, Channel } from '../../types';

interface Props {
  result: TransitionResult;
  channels: Channel[];
  currentStep: number;
}

const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#e879f9'];

export function EirpChart({ result, channels, currentStep }: Props) {
  // Build data: one point per step, one series per channel (deviation from initial)
  const data = result.steps.map((step, i) => {
    const point: Record<string, number> = { step: i + 1 };
    for (const ch of channels) {
      point[ch.name] = step.channelEirpDeviation[ch.id] ?? 0;
    }
    return point;
  });

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        EIRP Deviation from Initial (dB)
      </h4>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="step"
            stroke="#64748b"
            tick={{ fontSize: 10 }}
            label={{ value: 'Step', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 10 }}
          />
          <YAxis
            stroke="#64748b"
            tick={{ fontSize: 10 }}
            label={{ value: 'dB', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="5 5" />
          <ReferenceLine x={currentStep + 1} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={2} />
          {channels.map((ch, i) => (
            <Line
              key={ch.id}
              type="stepAfter"
              dataKey={ch.name}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={1.5}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
