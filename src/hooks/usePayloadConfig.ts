import { useState, useCallback } from 'react';
import type { PayloadConfig, Channel, GainStage } from '../types';
import { createGainStages } from '../core/gain-stage-factory';
import { createExamplePayload } from '../defaults/example-payload';

export function usePayloadConfig() {
  const [config, setConfig] = useState<PayloadConfig>(() => createExamplePayload());

  const updateChannel = useCallback((channelId: string, updates: Partial<Channel>) => {
    setConfig(prev => {
      const channels = prev.channels.map(ch =>
        ch.id === channelId ? { ...ch, ...updates } : ch
      );
      const gainStages = createGainStages(channels, prev.gainStages);
      return { ...prev, channels, gainStages };
    });
  }, []);

  const addChannel = useCallback(() => {
    setConfig(prev => {
      const newId = String(Math.max(0, ...prev.channels.map(c => parseInt(c.id))) + 1);
      const newChannel: Channel = {
        id: newId,
        name: `CH-${newId}`,
        rxAntennaId: 0,
        txAntennaId: 0,
        bandwidthMHz: 4,
        rxLowFreqMHz: 10950,
        txLowFreqMHz: 11700,
        ipfd: -120,
        eirpTarget: 45,
        antennaNoiseTemp: 200,
      };
      const channels = [...prev.channels, newChannel];
      const gainStages = createGainStages(channels, prev.gainStages);
      return { ...prev, channels, gainStages };
    });
  }, []);

  const removeChannel = useCallback((channelId: string) => {
    setConfig(prev => {
      const channels = prev.channels.filter(ch => ch.id !== channelId);
      const gainStages = createGainStages(channels, prev.gainStages);
      return { ...prev, channels, gainStages };
    });
  }, []);

  const updateGainStage = useCallback((key: string, updates: Partial<GainStage>) => {
    setConfig(prev => {
      const gainStages = new Map(prev.gainStages);
      const existing = gainStages.get(key);
      if (existing) {
        gainStages.set(key, { ...existing, ...updates });
      }
      return { ...prev, gainStages };
    });
  }, []);

  const updateAntennaCount = useCallback((type: 'rx' | 'tx', count: number) => {
    setConfig(prev => {
      const update = type === 'rx'
        ? { rxAntennaCount: count }
        : { txAntennaCount: count };
      return { ...prev, ...update };
    });
  }, []);

  const loadConfig = useCallback((newConfig: PayloadConfig) => {
    setConfig(newConfig);
  }, []);

  const resetToExample = useCallback(() => {
    setConfig(createExamplePayload());
  }, []);

  return {
    config,
    updateChannel,
    addChannel,
    removeChannel,
    updateGainStage,
    updateAntennaCount,
    loadConfig,
    resetToExample,
  };
}
