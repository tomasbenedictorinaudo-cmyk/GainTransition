import { useState } from 'react';
import { usePayloadConfig } from './hooks/usePayloadConfig';
import { useAlgorithm } from './hooks/useAlgorithm';
import { useTheme } from './hooks/useTheme';
import { PayloadConfigPanel } from './components/config/PayloadConfigPanel';
import { GainOverview } from './components/config/GainOverview';
import { AlgorithmParamsPanel } from './components/config/AlgorithmParamsPanel';
import { RunControls } from './components/simulation/RunControls';
import { StepSlider } from './components/simulation/StepSlider';
import { TransitionSummary } from './components/simulation/TransitionSummary';
import { EirpChart } from './components/charts/EirpChart';
import { GainChart } from './components/charts/GainChart';
import { PowerLevelChart } from './components/charts/PowerLevelChart';
import { SystemTempChart } from './components/charts/SystemTempChart';
import { ChannelDetailPanel } from './components/charts/ChannelDetailPanel';

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

  const { theme, toggle: toggleTheme } = useTheme();
  const dk = theme.mode === 'dark';

  const [configTab, setConfigTab] = useState<ConfigTab>('gains');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  return (
    <div className={`min-h-screen transition-colors duration-200 ${dk ? 'bg-slate-900 text-slate-200' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <header className={`${dk ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-gray-200 shadow-sm'} border-b px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-lg font-semibold ${dk ? 'text-slate-100' : 'text-gray-900'}`}>
              Payload Gain Transition Optimizer
            </h1>
            <p className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-400'}`}>
              Constrained Coordinated Gain Stepping (CCGS)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className={`text-xs px-2 py-1 border rounded transition-colors ${
                dk ? 'text-slate-400 hover:text-slate-200 border-slate-600' : 'text-gray-500 hover:text-gray-700 border-gray-300'
              }`}
              title={`Switch to ${dk ? 'light' : 'dark'} mode`}
            >
              {dk ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button
              onClick={resetToExample}
              className={`text-xs px-2 py-1 border rounded transition-colors ${
                dk ? 'text-slate-400 hover:text-slate-200 border-slate-600' : 'text-gray-500 hover:text-gray-700 border-gray-300'
              }`}
            >
              Load Example
            </button>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`text-xs px-2 py-1 border rounded transition-colors ${
                dk ? 'text-slate-400 hover:text-slate-200 border-slate-600' : 'text-gray-500 hover:text-gray-700 border-gray-300'
              }`}
            >
              {sidebarOpen ? 'Hide Config' : 'Show Config'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className={`w-[420px] min-w-[420px] border-r p-4 h-[calc(100vh-56px)] overflow-y-auto ${
            dk ? 'border-slate-700 bg-slate-800/30' : 'border-gray-200 bg-white'
          }`}>
            {/* Config tabs */}
            <div className="flex gap-1 mb-4">
              {(['payload', 'gains', 'algorithm'] as ConfigTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setConfigTab(tab)}
                  className={`text-xs px-3 py-1.5 rounded-md transition-colors capitalize ${
                    configTab === tab
                      ? 'bg-blue-600 text-white'
                      : dk
                        ? 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
                        : 'bg-gray-100 text-gray-500 hover:text-gray-700'
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
          <RunControls
            onRun={() => run(config)}
            onReset={reset}
            isRunning={isRunning}
            result={result}
            channels={config.channels}
          />

          {result && result.steps.length > 0 && (
            <StepSlider
              result={result}
              currentStep={currentStep}
              onStepChange={setCurrentStep}
            />
          )}

          {result && result.steps.length > 0 && (
            <TransitionSummary
              result={result}
              channels={config.channels}
              currentStep={currentStep}
            />
          )}

          {result && result.steps.length > 0 && (
            <div className="flex items-center gap-2">
              <span className={`text-xs ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Inspect channel:</span>
              <select
                value={selectedChannelId ?? ''}
                onChange={e => setSelectedChannelId(e.target.value || null)}
                className={`border rounded px-2 py-1 text-xs focus:outline-none ${
                  dk
                    ? 'bg-slate-700 border-slate-600 text-slate-200 focus:border-cyan-500'
                    : 'bg-white border-gray-300 text-gray-700 focus:border-cyan-500'
                }`}
              >
                <option value="">All channels (overview)</option>
                {config.channels.map(ch => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            </div>
          )}

          {result && result.steps.length > 0 && selectedChannelId && (() => {
            const ch = config.channels.find(c => c.id === selectedChannelId);
            return ch ? (
              <ChannelDetailPanel
                result={result}
                channel={ch}
                gainStages={config.gainStages}
                currentStep={currentStep}
                onClose={() => setSelectedChannelId(null)}
              />
            ) : null;
          })()}

          {result && result.steps.length > 0 && (
            <div className="space-y-4">
              <EirpChart result={result} channels={config.channels} currentStep={currentStep} />
              <GainChart result={result} currentStep={currentStep} />
              <PowerLevelChart result={result} gainStages={config.gainStages} currentStep={currentStep} />
              <SystemTempChart result={result} channels={config.channels} currentStep={currentStep} />
            </div>
          )}

          {!result && (
            <div className={`flex items-center justify-center h-64 ${dk ? 'text-slate-600' : 'text-gray-400'}`}>
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
