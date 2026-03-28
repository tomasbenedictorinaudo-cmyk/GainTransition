import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import type { TransitionResult } from '../../types';
import { getGainStageLabel } from '../../core/serialization';

interface Props {
  result: TransitionResult;
  currentStep: number;
  selectedStages?: string[]; // gain stage keys to display
}

const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#e879f9'];

export function GainChart({ result, currentStep, selectedStages }: Props) {
  // Determine which stages to show
  const allKeys = Object.keys(result.initialGainValues);
  const stagesToShow = selectedStages || allKeys.filter(k => {
    const initial = result.initialGainValues[k];
    const target = result.targetGainValues[k];
    return Math.abs(target - initial) > 0.001;
  });

  if (stagesToShow.length === 0) {
    return (
      <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 text-center text-slate-500 text-sm">
        No gain changes to display
      </div>
    );
  }

  const data = result.steps.map((step, i) => {
    const point: Record<string, number> = { step: i + 1 };
    for (const key of stagesToShow) {
      point[getGainStageLabel(key)] = step.gainValues[key] ?? 0;
    }
    return point;
  });

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Gain Values Over Transition (dB)
      </h4>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="step" stroke="#64748b" tick={{ fontSize: 10 }} />
          <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine x={currentStep + 1} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={2} />
          {stagesToShow.map((key, i) => (
            <Line
              key={key}
              type="stepAfter"
              dataKey={getGainStageLabel(key)}
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
