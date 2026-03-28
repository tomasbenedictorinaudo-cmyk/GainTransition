import { useState } from 'react';
import { usePayloadConfig } from './hooks/usePayloadConfig';
import { useAlgorithm } from './hooks/useAlgorithm';
import { PayloadConfigPanel } from './components/config/PayloadConfigPanel';
import { GainOverview } from './components/config/GainOverview';
import { AlgorithmParamsPanel } from './components/config/AlgorithmParamsPanel';
import { RunControls } from './components/simulation/RunControls';
import { StepSlider } from './components/simulation/StepSlider';
import { TransitionSummary } from './components/simulation/TransitionSummary';
import { EirpChart } from './components/charts/EirpChart';
import { GainChart } from './components/charts/GainChart';
import { PowerLevelChart } from './components/charts/PowerLevelChart';

type ConfigTab = 'payload' | 'gains' | 'algorithm';

function App() {
  const {
    config,
    updateChannel,
    addChannel,
    removeChannel,
    updateGainStage,
    updateAntennaCount,
    resetToExample,
  } = usePayloadConfig();

  const {
    params,
    result,
    currentStep,
    isRunning,
    run,
    reset,
    setCurrentStep,
    updateParams,
  } = useAlgorithm();

  const [configTab, setConfigTab] = useState<ConfigTab>('gains');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      {/* Header */}
      <header className="bg-slate-800/80 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">
              Payload Gain Transition Optimizer
            </h1>
            <p className="text-xs text-slate-500">
              Constrained Coordinated Gain Stepping (CCGS)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetToExample}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 border border-slate-600 rounded transition-colors"
            >
              Load Example
            </button>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 border border-slate-600 rounded transition-colors"
            >
              {sidebarOpen ? 'Hide Config' : 'Show Config'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-[420px] min-w-[420px] border-r border-slate-700 bg-slate-800/30 p-4 h-[calc(100vh-56px)] overflow-y-auto">
            {/* Config tabs */}
            <div className="flex gap-1 mb-4">
              {(['payload', 'gains', 'algorithm'] as ConfigTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setConfigTab(tab)}
                  className={`text-xs px-3 py-1.5 rounded-md transition-colors capitalize ${
                    configTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {configTab === 'payload' && (
              <PayloadConfigPanel
                config={config}
                onUpdateChannel={updateChannel}
                onAddChannel={addChannel}
                onRemoveChannel={removeChannel}
                onUpdateAntennaCount={updateAntennaCount}
              />
            )}
            {configTab === 'gains' && (
              <GainOverview
                gainStages={config.gainStages}
                onUpdate={updateGainStage}
              />
            )}
            {configTab === 'algorithm' && (
              <AlgorithmParamsPanel
                params={params}
                onUpdate={updateParams}
              />
            )}
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 p-4 h-[calc(100vh-56px)] overflow-y-auto space-y-4">
          {/* Run controls */}
          <RunControls
            onRun={() => run(config)}
            onReset={reset}
            isRunning={isRunning}
            result={result}
            channels={config.channels}
          />

          {/* Step slider */}
          {result && result.steps.length > 0 && (
            <StepSlider
              result={result}
              currentStep={currentStep}
              onStepChange={setCurrentStep}
            />
          )}

          {/* Summary metrics */}
          {result && result.steps.length > 0 && (
            <TransitionSummary
              result={result}
              channels={config.channels}
              currentStep={currentStep}
            />
          )}

          {/* Charts */}
          {result && result.steps.length > 0 && (
            <div className="space-y-4">
              <EirpChart
                result={result}
                channels={config.channels}
                currentStep={currentStep}
              />
              <GainChart
                result={result}
                currentStep={currentStep}
              />
              <PowerLevelChart
                result={result}
                gainStages={config.gainStages}
                currentStep={currentStep}
              />
            </div>
          )}

          {/* Empty state */}
          {!result && (
            <div className="flex items-center justify-center h-64 text-slate-600">
              <div className="text-center">
                <p className="text-lg mb-2">Configure your payload and click "Run CCGS"</p>
                <p className="text-sm">The algorithm will find the optimal gain transition sequence</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
