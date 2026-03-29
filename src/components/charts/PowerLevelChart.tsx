import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import type { TransitionResult, GainStage } from '../../types';
import { getGainStageLabel } from '../../core/serialization';
import { ChartWrapper } from './ChartWrapper';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  result: TransitionResult;
  gainStages: Map<string, GainStage>;
  currentStep: number;
  selectedStage?: string;
}

const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c'];

export function PowerLevelChart({ result, gainStages, currentStep, selectedStage }: Props) {
  const { theme } = useTheme();
  const stagesToShow = selectedStage
    ? [selectedStage]
    : Array.from(gainStages.keys()).filter(k => k.startsWith('G1:') || k.startsWith('G7:'));

  if (stagesToShow.length === 0) return null;

  const data = result.steps.map((step, i) => {
    const point: Record<string, number> = { step: i + 1 };
    for (const key of stagesToShow) {
      point[getGainStageLabel(key)] = step.powerLevels[key] ?? -999;
    }
    return point;
  });

  const thresholdLines: { value: number; label: string; color: string }[] = [];
  for (const key of stagesToShow) {
    const stage = gainStages.get(key);
    if (stage) {
      thresholdLines.push({ value: stage.upperThreshold, label: `${getGainStageLabel(key)} Hi`, color: '#ef4444' });
      thresholdLines.push({ value: stage.lowerThreshold, label: `${getGainStageLabel(key)} Lo`, color: '#f97316' });
    }
  }
  const uniqueThresholds = thresholdLines.filter((t, i, arr) =>
    arr.findIndex(x => Math.abs(x.value - t.value) < 0.01) === i
  );

  return (
    <ChartWrapper title="Power Levels at Gain Stages (dBm)">
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
          {uniqueThresholds.map((t, i) => (
            <ReferenceLine key={i} y={t.value} stroke={t.color} strokeDasharray="8 4" strokeWidth={1}
              label={{ value: `${t.value} dBm`, fill: t.color, fontSize: 9, position: 'right' }} />
          ))}
          {stagesToShow.map((key, i) => (
            <Line key={key} type="stepAfter" dataKey={getGainStageLabel(key)}
              stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={1.5} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
