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

export function EirpChart({ result, channels, currentStep }: Props) {
  const { theme } = useTheme();

  const data = result.steps.map((step, i) => {
    const point: Record<string, number> = { step: i + 1 };
    for (const ch of channels) {
      point[ch.name] = step.channelEirpDeviation[ch.id] ?? 0;
    }
    return point;
  });

  return (
    <ChartWrapper title="EIRP Deviation from Initial (dB)">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
          <XAxis dataKey="step" stroke={theme.chartAxis} tick={{ fontSize: 10 }}
            label={{ value: 'Step', position: 'insideBottom', offset: -2, fill: theme.chartAxis, fontSize: 10 }} />
          <YAxis stroke={theme.chartAxis} tick={{ fontSize: 10 }}
            label={{ value: 'dB', angle: -90, position: 'insideLeft', fill: theme.chartAxis, fontSize: 10 }} />
          <Tooltip
            contentStyle={{ backgroundColor: theme.chartTooltipBg, border: `1px solid ${theme.chartTooltipBorder}`, borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: theme.chartTooltipLabel }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={0} stroke={theme.chartGrid} strokeDasharray="5 5" />
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
