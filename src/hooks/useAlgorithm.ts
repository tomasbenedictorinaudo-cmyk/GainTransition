import { useState, useCallback, useRef, useEffect } from 'react';
import type { AlgorithmParams, TransitionResult, PayloadConfig } from '../types';
import { runCCGS, DEFAULT_PARAMS } from '../algorithm/ccgs';

export function useAlgorithm() {
  const [params, setParams] = useState<AlgorithmParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<TransitionResult | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const lastConfigRef = useRef<PayloadConfig | null>(null);
  const hasRunRef = useRef(false);

  const run = useCallback((config: PayloadConfig) => {
    lastConfigRef.current = config;
    hasRunRef.current = true;
    setIsRunning(true);
    // Defer to let UI show "running" state
    setTimeout(() => {
      try {
        const res = runCCGS(config.channels, config.gainStages, params);
        setResult(res);
        setCurrentStep(res.steps.length > 0 ? res.steps.length - 1 : 0);
      } finally {
        setIsRunning(false);
      }
    }, 10);
  }, [params]);

  // Auto-rerun when params change, but only if we've run before
  // Use refs to avoid stale closures — hasRunRef and lastConfigRef are always current
  useEffect(() => {
    if (!hasRunRef.current || !lastConfigRef.current) return;

    const config = lastConfigRef.current;
    setIsRunning(true);
    const timer = setTimeout(() => {
      try {
        const res = runCCGS(config.channels, config.gainStages, params);
        setResult(res);
        setCurrentStep(res.steps.length > 0 ? res.steps.length - 1 : 0);
      } finally {
        setIsRunning(false);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [params]);

  const reset = useCallback(() => {
    setResult(null);
    setCurrentStep(0);
    lastConfigRef.current = null;
    hasRunRef.current = false;
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
