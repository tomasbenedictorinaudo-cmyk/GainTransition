import { useState, useCallback } from 'react';
import type { AlgorithmParams, TransitionResult, PayloadConfig } from '../types';
import { runCCGS, DEFAULT_PARAMS } from '../algorithm/ccgs';
import { runG4Compensated } from '../algorithm/g4-compensated';

export function useAlgorithm() {
  const [params, setParams] = useState<AlgorithmParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<TransitionResult | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const run = useCallback((config: PayloadConfig) => {
    setIsRunning(true);
    // Use setTimeout to let the UI update before computation
    setTimeout(() => {
      try {
        const res = params.strategy === 'g4-compensated'
          ? runG4Compensated(config.channels, config.gainStages, params)
          : runCCGS(config.channels, config.gainStages, params);
        setResult(res);
        setCurrentStep(res.steps.length > 0 ? res.steps.length - 1 : 0);
      } finally {
        setIsRunning(false);
      }
    }, 10);
  }, [params]);

  const reset = useCallback(() => {
    setResult(null);
    setCurrentStep(0);
  }, []);

  const updateParams = useCallback((updates: Partial<AlgorithmParams>) => {
    setParams(prev => ({ ...prev, ...updates }));
  }, []);

  return {
    params,
    result,
    currentStep,
    isRunning,
    run,
    reset,
    setCurrentStep,
    updateParams,
  };
}
