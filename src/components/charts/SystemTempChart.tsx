import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import type { TransitionResult, Channel } from '../../types';
import { ChartWrapper } from './ChartWrapper';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  result: TransitionResult;
  channels: Channel[];
  currentStep: number;
}

const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#e879f9'];

export function SystemTempChart({ result, channels, currentStep }: Props) {
  const { theme } = useTheme();

  const initialPoint: Record<string, number | string> = { step: 0 };
  for (const ch of channels) {
    initialPoint[ch.name] = result.initialSystemTemp[ch.id] ?? 0;
  }

  const data = [
    initialPoint,
    ...result.steps.map((step, i) => {
      const point: Record<string, number | string> = { step: i + 1 };
      for (const ch of channels) {
        point[ch.name] = Math.round((step.systemTemp[ch.id] ?? 0) * 10) / 10;
      }
      return point;
    }),
  ];

  return (
    <ChartWrapper title="System Noise Temperature (K)">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
          <XAxis dataKey="step" stroke={theme.chartAxis} tick={{ fontSize: 10 }}
            label={{ value: 'Step', position: 'insideBottom', offset: -2, fill: theme.chartAxis, fontSize: 10 }} />
          <YAxis stroke={theme.chartAxis} tick={{ fontSize: 10 }}
            label={{ value: 'K', angle: -90, position: 'insideLeft', fill: theme.chartAxis, fontSize: 10 }} />
          <Tooltip
            contentStyle={{ backgroundColor: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: theme.chartTooltipLabel }}
            formatter={(value: number) => [`${value.toFixed(1)} K`, undefined]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine x={currentStep + 1} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={2} />
          {channels.map((ch, i) => (
            <Line key={ch.id} type="stepAfter" dataKey={ch.name}
              stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={1.5} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
