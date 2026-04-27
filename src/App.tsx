import { useState, useEffect, useCallback } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import IconGroup from './components/IconGroup';
import type { LayoutType } from './components/IconGroup';

interface IconData {
  id: string;
  name: string;
  icon: string;
  color: string;
  path: string;
}

// Read layout from URL query string: index.html?layout=line
function getLayoutFromUrl(): LayoutType {
  // Query string (new windows): ?layout=line
  const searchParams = new URLSearchParams(window.location.search);
  const fromSearch = searchParams.get('layout');
  if (fromSearch === 'circle' || fromSearch === 'line' || fromSearch === 'vertical') {
    return fromSearch;
  }
  // Hash fallback (old links): #layout=line
  const hashStr = window.location.hash.replace(/^#/, '');
  const hashParams = new URLSearchParams(hashStr);
  const fromHash = hashParams.get('layout');
  if (fromHash === 'circle' || fromHash === 'line' || fromHash === 'vertical') {
    return fromHash;
  }
  return 'circle';
}

const DEMO_ICONS: IconData[] = [
  { id: '1', name: 'Browser', icon: '🌐', color: 'bg-blue-500', path: 'C:\\' },
  { id: '2', name: 'Files', icon: '📁', color: 'bg-yellow-500', path: 'C:\\' },
  { id: '3', name: 'Terminal', icon: '💻', color: 'bg-gray-800', path: 'C:\\' },
];

function App() {
  const appWindow = getCurrentWebviewWindow();
  const windowId = appWindow.label;

  // Storage keys are unique per window label
  const iconsKey   = `ig_icons_${windowId}`;
  const colorKey   = `ig_color_${windowId}`;
  const opacityKey = `ig_opacity_${windowId}`;
  const layoutKey  = `ig_layout_${windowId}`;

  // Layout: URL always wins (new window from tray), fallback to saved, fallback to circle
  const urlLayout = getLayoutFromUrl();
  const [layout, setLayout] = useState<LayoutType>(urlLayout);

  const [icons, setIcons] = useState<IconData[]>(() => {
    const saved = localStorage.getItem(iconsKey);
    if (saved) { try { return JSON.parse(saved); } catch (_) {} }
    // Main window gets demo icons; new group windows start empty
    return windowId === 'main' ? DEMO_ICONS : [];
  });

  const [panelColor, setPanelColor]     = useState(() => localStorage.getItem(colorKey)   || '#0f0f1a');
  const [panelOpacity, setPanelOpacity] = useState(() => Number(localStorage.getItem(opacityKey) ?? 55));
  const [showSettings, setShowSettings] = useState(false);
  const [isDragOver, setIsDragOver]     = useState(false);

  // Persist all state
  useEffect(() => { localStorage.setItem(iconsKey,   JSON.stringify(icons)); }, [icons,        iconsKey]);
  useEffect(() => { localStorage.setItem(layoutKey,  layout);                }, [layout,       layoutKey]);
  useEffect(() => { localStorage.setItem(colorKey,   panelColor);            }, [panelColor,   colorKey]);
  useEffect(() => { localStorage.setItem(opacityKey, String(panelOpacity));  }, [panelOpacity, opacityKey]);

  // Tauri v2 native drag-and-drop for adding files
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      unlisten = await appWindow.onDragDropEvent((event) => {
        const type = event.payload.type;
        if (type === 'over')               { setIsDragOver(true);  return; }
        if (type === 'leave' || type === 'cancel') { setIsDragOver(false); return; }
        if (type === 'drop') {
          setIsDragOver(false);
          const paths: string[] = (event.payload as { type: string; paths: string[] }).paths ?? [];
          if (paths.length > 0) {
            setIcons(prev => [
              ...prev,
              ...paths.map(p => ({
                id:    Math.random().toString(36).slice(2, 11),
                name:  p.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '') || 'ملف',
                icon:  '📄',
                color: 'bg-gray-600',
                path:  p,
              })),
            ]);
          }
        }
      });
    };
    setup();
    return () => { unlisten?.(); };
  }, []);

  // ---- Handlers ----
  // startDragging() is the only reliable way to drag in Tauri on Windows
  const handleDragStart = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await appWindow.startDragging();
  }, [appWindow]);

  const handleClose   = async () => { await appWindow.close(); };
  const handleRemove  = (id: string) => setIcons(prev => prev.filter(i => i.id !== id));

  // Build background color with opacity
  const alpha    = Math.round(panelOpacity * 2.55).toString(16).padStart(2, '0');
  const bgStyle  = { backgroundColor: `${panelColor}${alpha}` };

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-transparent">

      {/* ── TOP DRAG BAR ──────────────────────────────────────────────────────── */}
      {/* onMouseDown → startDragging(). Clicking buttons stops propagation.     */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0 select-none cursor-grab active:cursor-grabbing rounded-t-2xl"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)' }}
        onMouseDown={handleDragStart}
      >
        <span className="text-white/40 text-[11px] tracking-wide">⠿ IconGroups</span>

        {/* Buttons stop mouse-down from bubbling to drag handler */}
        <div className="flex items-center gap-2" onMouseDown={e => e.stopPropagation()}>
          <button
            onClick={() => setShowSettings(s => !s)}
            title="الإعدادات"
            className={`text-sm w-7 h-7 flex items-center justify-center rounded-full transition-all ${showSettings ? 'bg-white/25 text-white' : 'text-white/50 hover:text-white hover:bg-white/15'}`}
          >⚙️</button>
          <button
            onClick={handleClose}
            title="إغلاق"
            className="text-sm w-7 h-7 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-red-500/70 transition-all"
          >✕</button>
        </div>
      </div>

      {/* ── SETTINGS PANEL ────────────────────────────────────────────────────── */}
      {showSettings && (
        <div
          className="flex-shrink-0 px-3 pt-2 pb-3 flex flex-col gap-2.5 border-b border-white/10"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(16px)' }}
        >
          {/* Layout row */}
          <div className="flex gap-1.5">
            {(['circle', 'line', 'vertical'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                className={`flex-1 text-[10px] py-1.5 rounded-lg font-medium transition-all ${
                  layout === l
                    ? 'bg-white/25 text-white shadow-inner'
                    : 'bg-white/5 text-white/40 hover:bg-white/12 hover:text-white/70'
                }`}
              >
                {l === 'circle' ? '⭕ دائري' : l === 'line' ? '➖ أفقي' : '⬆️ رأسي'}
              </button>
            ))}
          </div>

          {/* Color + Opacity row */}
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={panelColor}
              onChange={e => setPanelColor(e.target.value)}
              className="w-8 h-7 rounded-md cursor-pointer border border-white/10 bg-transparent flex-shrink-0"
              title="لون الخلفية"
            />
            <div className="flex-1 flex items-center gap-1.5">
              <span className="text-white/30 text-[9px]">شفافية</span>
              <input
                type="range" min="0" max="100"
                value={panelOpacity}
                onChange={e => setPanelOpacity(Number(e.target.value))}
                className="flex-1 h-1 accent-white"
              />
              <span className="text-white/50 text-[9px] w-7 text-right">{panelOpacity}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── ICON AREA ─────────────────────────────────────────────────────────── */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative rounded-b-2xl"
        style={bgStyle}
      >
        {/* Drag-over highlight */}
        {isDragOver && (
          <div className="absolute inset-0 border-2 border-dashed border-white/50 rounded-b-2xl pointer-events-none z-20" />
        )}

        {icons.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-white/35 select-none">
            <span className="text-5xl">📥</span>
            <span className="text-xs">اسحب الملفات هنا</span>
          </div>
        ) : (
          <IconGroup
            layout={layout}
            icons={icons}
            onRemove={handleRemove}
            style={{}}
          />
        )}
      </div>

    </div>
  );
}

export default App;
