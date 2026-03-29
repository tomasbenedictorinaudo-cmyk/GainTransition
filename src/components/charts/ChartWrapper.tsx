import { useRef, useCallback, useState, type ReactNode } from 'react';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  title: string;
  children: ReactNode;
}

/**
 * Wraps a Recharts chart with:
 * - Theme-aware card styling
 * - Right-click "Copy chart as image" context menu
 */
export function ChartWrapper({ title, children }: Props) {
  const { theme } = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowMenu(true);
    setCopied(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!chartRef.current) return;

    try {
      // Find the SVG inside the Recharts container
      const svg = chartRef.current.querySelector('svg');
      if (!svg) return;

      const svgClone = svg.cloneNode(true) as SVGElement;
      const bbox = svg.getBoundingClientRect();

      // Set explicit dimensions and white/dark background for clean export
      svgClone.setAttribute('width', String(bbox.width));
      svgClone.setAttribute('height', String(bbox.height));
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      // Add background rect
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', '100%');
      bgRect.setAttribute('height', '100%');
      bgRect.setAttribute('fill', theme.mode === 'dark' ? '#1e293b' : '#ffffff');
      svgClone.insertBefore(bgRect, svgClone.firstChild);

      // Add title text
      const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      titleEl.setAttribute('x', '12');
      titleEl.setAttribute('y', '16');
      titleEl.setAttribute('font-size', '12');
      titleEl.setAttribute('font-family', 'system-ui, sans-serif');
      titleEl.setAttribute('font-weight', '600');
      titleEl.setAttribute('fill', theme.mode === 'dark' ? '#94a3b8' : '#475569');
      titleEl.textContent = title;
      svgClone.insertBefore(titleEl, svgClone.children[1]);

      const svgData = new XMLSerializer().serializeToString(svgClone);
      const canvas = document.createElement('canvas');
      const scale = 2; // retina
      canvas.width = bbox.width * scale;
      canvas.height = bbox.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);

      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });

      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/png')
      );

      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setCopied(true);
        setTimeout(() => { setShowMenu(false); setCopied(false); }, 1200);
      }
    } catch (err) {
      console.error('Failed to copy chart:', err);
    }
  }, [theme.mode, title]);

  const isDark = theme.mode === 'dark';

  return (
    <div
      ref={chartRef}
      onContextMenu={handleContextMenu}
      onClick={() => showMenu && setShowMenu(false)}
      className={`${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-gray-200 shadow-sm'} border rounded-lg p-4 relative`}
    >
      <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
        {title}
      </h4>
      {children}

      {/* Context menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div
            className={`fixed z-50 rounded-lg shadow-lg border py-1 min-w-[180px] ${
              isDark
                ? 'bg-slate-800 border-slate-600'
                : 'bg-white border-gray-200'
            }`}
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              onClick={handleCopy}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
                isDark
                  ? 'hover:bg-slate-700 text-slate-200'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              {copied ? (
                <>
                  <span className="text-emerald-400">✓</span> Copied to clipboard
                </>
              ) : (
                <>
                  <span>📋</span> Copy chart as image
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
