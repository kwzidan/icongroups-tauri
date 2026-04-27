import { useState, useEffect, useCallback, useRef } from 'react';
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

function getLayoutFromUrl(): LayoutType {
  const p = new URLSearchParams(window.location.search);
  const l = p.get('layout');
  if (l === 'circle' || l === 'line' || l === 'vertical' || l === 'dock') return l as LayoutType;
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const lh = h.get('layout');
  if (lh === 'circle' || lh === 'line' || lh === 'vertical' || lh === 'dock') return lh as LayoutType;
  return 'circle';
}

const DEMO_ICONS: IconData[] = [
  { id: '1', name: 'Browser',  icon: '🌐', color: 'bg-blue-500',   path: 'C:\\' },
  { id: '2', name: 'Files',    icon: '📁', color: 'bg-yellow-500', path: 'C:\\' },
  { id: '3', name: 'Terminal', icon: '💻', color: 'bg-gray-800',   path: 'C:\\' },
];

interface CtxPos { x: number; y: number }

export default function App() {
  const appWindow = getCurrentWebviewWindow();
  const windowId  = appWindow.label;
  const iconsKey  = `ig_icons_${windowId}`;
  const colorKey  = `ig_color_${windowId}`;
  const alphaKey  = `ig_alpha_${windowId}`;
  const layoutKey = `ig_layout_${windowId}`;

  const [layout,       setLayout]       = useState<LayoutType>(() => (localStorage.getItem(layoutKey) as LayoutType) || getLayoutFromUrl());
  const [icons,        setIcons]        = useState<IconData[]>(() => {
    try { const s = localStorage.getItem(iconsKey); if (s) return JSON.parse(s); } catch (_) {}
    return windowId === 'main' ? DEMO_ICONS : [];
  });
  const [panelColor,   setPanelColor]   = useState(() => localStorage.getItem(colorKey)  || '#0f0f1a');
  const [panelOpacity, setPanelOpacity] = useState(() => Number(localStorage.getItem(alphaKey) ?? 55));
  const [ctx,          setCtx]          = useState<CtxPos | null>(null);
  const [showColors,   setShowColors]   = useState(false);
  const [isDragOver,   setIsDragOver]   = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Persist
  useEffect(() => { localStorage.setItem(layoutKey, layout);                },  [layout,       layoutKey]);
  useEffect(() => { localStorage.setItem(iconsKey,  JSON.stringify(icons)); },  [icons,        iconsKey]);
  useEffect(() => { localStorage.setItem(colorKey,  panelColor);            },  [panelColor,   colorKey]);
  useEffect(() => { localStorage.setItem(alphaKey,  String(panelOpacity));  },  [panelOpacity, alphaKey]);

  // Anti-minimize (Win+D protection attempt)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    appWindow.onResized(async () => {
      try {
        if (await appWindow.isMinimized()) {
          await appWindow.unminimize();
        }
      } catch (e) {}
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [appWindow]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctx) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtx(null);
        setShowColors(false);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [ctx]);

  // File drop
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    appWindow.onDragDropEvent(ev => {
      if (ev.payload.type === 'over')              setIsDragOver(true);
      if (ev.payload.type === 'leave')             setIsDragOver(false);
      if (ev.payload.type === 'drop') {
        setIsDragOver(false);
        const paths: string[] = (ev.payload as { type: string; paths: string[] }).paths ?? [];
        if (paths.length)
          setIcons(prev => [...prev, ...paths.map(p => ({
            id: Math.random().toString(36).slice(2, 11),
            name: p.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '') || 'ملف',
            icon: '📄', color: 'bg-gray-600', path: p,
          }))]);
      }
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [appWindow]);

  // Right-click anywhere → context menu
  const onRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const menuW = 196, menuH = 260;
    const winW  = window.innerWidth,  winH = window.innerHeight;
    setCtx({
      x: Math.min(e.clientX, winW - menuW - 8),
      y: Math.min(e.clientY, winH - menuH - 8),
    });
    setShowColors(false);
  }, []);

  const handleDragStart = useCallback(async (e: React.MouseEvent) => {
    if (e.button === 0) { // Only left click
      try {
        await appWindow.startDragging();
      } catch (err) {}
    }
  }, [appWindow]);

  const handleClose  = async () => { await appWindow.close(); };
  const handleRemove = (id: string) => setIcons(prev => prev.filter(i => i.id !== id));

  const alpha    = Math.round(panelOpacity * 2.55).toString(16).padStart(2, '0');
  const bgStyle  = { backgroundColor: `${panelColor}${alpha}` };

  return (
    // Full-screen transparent wrapper that passes clicks through
    <div className="w-screen h-screen overflow-hidden bg-transparent pointer-events-none">
      <div className="w-full h-full flex items-center justify-center">
        {/* The group itself receives events and handles dragging */}
        <div
          className="pointer-events-auto relative"
          onContextMenu={onRightClick}
          onMouseDown={handleDragStart}
          data-tauri-drag-region
        >
          {isDragOver && (
            <div className="absolute inset-[-8px] border-2 border-dashed border-white/50 rounded-3xl pointer-events-none z-20 animate-pulse" />
          )}

          {icons.length === 0 ? (
            <div
              className="w-64 h-64 rounded-full flex flex-col items-center justify-center gap-3 text-white/40 select-none border-2 border-dashed border-white/20"
              style={bgStyle}
            >
              <span className="text-5xl">📥</span>
              <span className="text-xs">اسحب الملفات هنا</span>
              <span className="text-[10px] opacity-60">كليك يمين للخيارات</span>
            </div>
          ) : (
            <IconGroup
              layout={layout}
              icons={icons}
              onRemove={handleRemove}
              style={bgStyle}
            />
          )}
        </div>
      </div>

      {/* ── RIGHT-CLICK CONTEXT MENU ─────────────────────────────────────────── */}
      {ctx && (
        <div
          ref={menuRef}
          className="fixed z-50 w-48 rounded-xl overflow-hidden shadow-2xl border border-white/10"
          style={{
            left: ctx.x,
            top:  ctx.y,
            background: 'rgba(10,10,20,0.92)',
            backdropFilter: 'blur(24px)',
          }}
          onMouseDown={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
        >
          {/* Layout options */}
          <div className="px-2 pt-2 pb-1">
            <p className="text-white/30 text-[9px] px-2 pb-1 uppercase tracking-wider">التخطيط</p>
            {(['circle', 'line', 'vertical', 'dock'] as const).map(l => (
              <button
                key={l}
                onClick={() => { setLayout(l); setCtx(null); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  layout === l
                    ? 'bg-white/15 text-white'
                    : 'text-white/55 hover:bg-white/8 hover:text-white'
                }`}
              >
                <span className="w-4 text-center text-[10px]">{layout === l ? '✓' : ''}</span>
                {l === 'circle' ? '⭕ دائري' : l === 'line' ? '➖ أفقي' : l === 'vertical' ? '⬆️ رأسي' : '🖥️ ماك (Dock)'}
              </button>
            ))}
          </div>

          <div className="h-px bg-white/10 mx-2" />

          {/* Appearance toggle */}
          <div className="px-2 py-1">
            <button
              onClick={() => setShowColors(s => !s)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/55 hover:bg-white/8 hover:text-white transition-all"
            >
              <span>🎨</span> المظهر
              <span className="ml-auto text-[10px] opacity-50">{showColors ? '▲' : '▼'}</span>
            </button>

            {showColors && (
              <div className="px-2 pb-2 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-[10px]">اللون</span>
                  <input
                    type="color"
                    value={panelColor}
                    onChange={e => setPanelColor(e.target.value)}
                    className="flex-1 h-6 rounded cursor-pointer border-0 bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-white/40 text-[10px] whitespace-nowrap">شفافية</span>
                  <input
                    type="range" min="0" max="100"
                    value={panelOpacity}
                    onChange={e => setPanelOpacity(Number(e.target.value))}
                    className="flex-1 h-1 accent-white"
                  />
                  <span className="text-white/50 text-[9px] w-7 text-right">{panelOpacity}%</span>
                </div>
              </div>
            )}
          </div>

          <div className="h-px bg-white/10 mx-2" />

          {/* Close */}
          <div className="px-2 py-2">
            <button
              onClick={handleClose}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all"
            >
              <span>✕</span> إغلاق المجموعة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
