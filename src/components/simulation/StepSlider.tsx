import type { TransitionResult } from '../../types';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  result: TransitionResult;
  currentStep: number;
  onStepChange: (step: number) => void;
}

export function StepSlider({ result, currentStep, onStepChange }: Props) {
  const { theme } = useTheme();
  const dk = theme.mode === 'dark';

  if (result.steps.length === 0) return null;

  const step = result.steps[currentStep];
  const moveDesc = step
    ? step.appliedMove.steps
        .map(s => `${s.gainStageKey}: ${s.delta > 0 ? '+' : ''}${s.delta.toFixed(2)} dB`)
        .join(', ')
    : '';

  const btn = dk
    ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
    : 'bg-gray-200 hover:bg-gray-300 text-gray-700';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onStepChange(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className={`text-xs ${btn} disabled:opacity-30 px-2 py-1 rounded transition-colors`}
        >Prev</button>
        <input
          type="range"
          min={0}
          max={result.steps.length - 1}
          value={currentStep}
          onChange={e => onStepChange(parseInt(e.target.value))}
          className={`flex-1 h-1.5 ${dk ? 'bg-slate-700' : 'bg-gray-200'} rounded-full appearance-none cursor-pointer accent-blue-500`}
        />
        <button
          onClick={() => onStepChange(Math.min(result.steps.length - 1, currentStep + 1))}
          disabled={currentStep === result.steps.length - 1}
          className={`text-xs ${btn} disabled:opacity-30 px-2 py-1 rounded transition-colors`}
        >Next</button>
        <span className={`text-xs tabular-nums min-w-[80px] text-right ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
          Step {currentStep + 1} / {result.steps.length}
        </span>
      </div>
      {step && (
        <div className={`text-[11px] font-mono truncate ${dk ? 'text-slate-500' : 'text-gray-400'}`}>
          [{step.appliedMove.stageType}] {moveDesc}
        </div>
      )}
    </div>
  );
}
