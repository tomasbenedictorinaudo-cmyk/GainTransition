import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface Theme {
  mode: 'dark' | 'light';
  // Background colors
  bg: string;
  bgPanel: string;
  bgCard: string;
  bgInput: string;
  // Text colors
  text: string;
  textMuted: string;
  textDim: string;
  // Border
  border: string;
  borderAccent: string;
  // Chart-specific
  chartGrid: string;
  chartAxis: string;
  chartTooltipBg: string;
  chartTooltipBorder: string;
  chartTooltipLabel: string;
  // Accents
  accentBlue: string;
  accentRed: string;
  accentAmber: string;
  accentGreen: string;
  accentCyan: string;
}

const DARK: Theme = {
  mode: 'dark',
  bg: 'bg-slate-900',
  bgPanel: 'bg-slate-800/30',
  bgCard: 'bg-slate-800/60',
  bgInput: 'bg-slate-700',
  text: 'text-slate-200',
  textMuted: 'text-slate-400',
  textDim: 'text-slate-500',
  border: 'border-slate-700',
  borderAccent: 'border-cyan-700/40',
  chartGrid: '#334155',
  chartAxis: '#64748b',
  chartTooltipBg: '#1e293b',
  chartTooltipBorder: '#334155',
  chartTooltipLabel: '#94a3b8',
  accentBlue: 'text-blue-400',
  accentRed: 'text-red-400',
  accentAmber: 'text-amber-400',
  accentGreen: 'text-emerald-400',
  accentCyan: 'text-cyan-300',
};

const LIGHT: Theme = {
  mode: 'light',
  bg: 'bg-gray-50',
  bgPanel: 'bg-white',
  bgCard: 'bg-white',
  bgInput: 'bg-gray-100',
  text: 'text-gray-900',
  textMuted: 'text-gray-600',
  textDim: 'text-gray-400',
  border: 'border-gray-200',
  borderAccent: 'border-cyan-300',
  chartGrid: '#e2e8f0',
  chartAxis: '#64748b',
  chartTooltipBg: '#ffffff',
  chartTooltipBorder: '#e2e8f0',
  chartTooltipLabel: '#475569',
  accentBlue: 'text-blue-600',
  accentRed: 'text-red-600',
  accentAmber: 'text-amber-600',
  accentGreen: 'text-emerald-600',
  accentCyan: 'text-cyan-700',
};

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DARK,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'dark' | 'light'>('dark');
  const toggle = useCallback(() => setMode(m => m === 'dark' ? 'light' : 'dark'), []);
  const theme = mode === 'dark' ? DARK : LIGHT;

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
