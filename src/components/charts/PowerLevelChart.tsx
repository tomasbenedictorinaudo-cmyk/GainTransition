import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import type { TransitionResult, GainStage } from '../../types';
import { getGainStageLabel } from '../../core/serialization';

interface Props {
  result: TransitionResult;
  gainStages: Map<string, GainStage>;
  currentStep: number;
  selectedStage?: string; // single stage to focus on
}

const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c'];

export function PowerLevelChart({ result, gainStages, currentStep, selectedStage }: Props) {
  // Show either a single selected stage or all shared stages
  const stagesToShow = selectedStage
    ? [selectedStage]
    : Array.from(gainStages.keys()).filter(k =>
        k.startsWith('G1:') || k.startsWith('G7:')
      );

  if (stagesToShow.length === 0) return null;

  const data = result.steps.map((step, i) => {
    const point: Record<string, number> = { step: i + 1 };
    for (const key of stagesToShow) {
      point[getGainStageLabel(key)] = step.powerLevels[key] ?? -999;
    }
    return point;
  });

  // Collect threshold lines
  const thresholdLines: { value: number; label: string; color: string }[] = [];
  for (const key of stagesToShow) {
    const stage = gainStages.get(key);
    if (stage) {
      thresholdLines.push({
        value: stage.upperThreshold,
        label: `${getGainStageLabel(key)} Hi`,
        color: '#ef4444',
      });
      thresholdLines.push({
        value: stage.lowerThreshold,
        label: `${getGainStageLabel(key)} Lo`,
        color: '#f97316',
      });
    }
  }

  // Deduplicate threshold values
  const uniqueThresholds = thresholdLines.filter((t, i, arr) =>
    arr.findIndex(x => Math.abs(x.value - t.value) < 0.01) === i
  );

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Power Levels at Gain Stages (dBm)
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
          {uniqueThresholds.map((t, i) => (
            <ReferenceLine
              key={i}
              y={t.value}
              stroke={t.color}
              strokeDasharray="8 4"
              strokeWidth={1}
              label={{ value: `${t.value} dBm`, fill: t.color, fontSize: 9, position: 'right' }}
            />
          ))}
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
