import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import type { TransitionResult } from '../../types';
import { getGainStageLabel } from '../../core/serialization';
import { ChartWrapper } from './ChartWrapper';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  result: TransitionResult;
  currentStep: number;
  selectedStages?: string[];
}

const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#e879f9'];

export function GainChart({ result, currentStep, selectedStages }: Props) {
  const { theme } = useTheme();
  const allKeys = Object.keys(result.initialGainValues);
  const stagesToShow = selectedStages || allKeys.filter(k => {
    return Math.abs(result.targetGainValues[k] - result.initialGainValues[k]) > 0.001;
  });

  if (stagesToShow.length === 0) {
    const isDark = theme.mode === 'dark';
    return (
      <div className={`${isDark ? 'bg-slate-800/60 border-slate-700 text-slate-500' : 'bg-white border-gray-200 text-gray-400'} border rounded-lg p-4 text-center text-sm`}>
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
    <ChartWrapper title="Gain Values Over Transition (dB)">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
          <XAxis dataKey="step" stroke={theme.chartAxis} tick={{ fontSize: 10 }} />
          <YAxis stroke={theme.chartAxis} tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ backgroundColor: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: theme.chartTooltipLabel }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine x={currentStep + 1} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={2} />
          {stagesToShow.map((key, i) => (
            <Line key={key} type="stepAfter" dataKey={getGainStageLabel(key)}
              stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={1.5} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
