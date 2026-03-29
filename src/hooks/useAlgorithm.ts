import { useState, useCallback, useRef } from 'react';
import type { AlgorithmParams, TransitionResult, PayloadConfig } from '../types';
import { runCCGS, DEFAULT_PARAMS } from '../algorithm/ccgs';

export function useAlgorithm() {
  const [params, setParams] = useState<AlgorithmParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<TransitionResult | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const lastConfigRef = useRef<PayloadConfig | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeRun = useCallback((config: PayloadConfig, algorithmParams: AlgorithmParams) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsRunning(true);
    debounceRef.current = setTimeout(() => {
      try {
        const res = runCCGS(config.channels, config.gainStages, algorithmParams);
        setResult(res);
        setCurrentStep(res.steps.length > 0 ? res.steps.length - 1 : 0);
      } finally {
        setIsRunning(false);
      }
    }, 10);
  }, []);

  const run = useCallback((config: PayloadConfig) => {
    lastConfigRef.current = config;
    executeRun(config, params);
  }, [params, executeRun]);

  const reset = useCallback(() => {
    setResult(null);
    setCurrentStep(0);
    lastConfigRef.current = null;
  }, []);

  const updateParams = useCallback((updates: Partial<AlgorithmParams>) => {
    setParams(prev => {
      const next = { ...prev, ...updates };
      // Auto-rerun if we have a previous config
      if (lastConfigRef.current) {
        executeRun(lastConfigRef.current, next);
      }
      return next;
    });
  }, [executeRun]);

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
