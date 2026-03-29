import { useState, useCallback, useRef, useEffect } from 'react';
import type { AlgorithmParams, TransitionResult, PayloadConfig } from '../types';
import { runCCGS, DEFAULT_PARAMS } from '../algorithm/ccgs';

export function useAlgorithm() {
  const [params, setParams] = useState<AlgorithmParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<TransitionResult | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // Track the last config used so we can auto-rerun on param changes
  const lastConfigRef = useRef<PayloadConfig | null>(null);

  const run = useCallback((config: PayloadConfig) => {
    lastConfigRef.current = config;
    setIsRunning(true);
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

  // Auto-rerun when params change and we have a previous result
  useEffect(() => {
    if (result && lastConfigRef.current) {
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
      }, 150); // small debounce for rapid slider/input changes
      return () => clearTimeout(timer);
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    setResult(null);
    setCurrentStep(0);
    lastConfigRef.current = null;
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
