import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
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
  return 'circle';
}

const DEMO_ICONS: IconData[] = [
  { id: '1', name: 'Explorer', icon: '📁', color: 'bg-yellow-500', path: 'C:\\Windows\\explorer.exe' },
  { id: '2', name: 'Terminal', icon: '💻', color: 'bg-gray-800',   path: 'C:\\Windows\\System32\\cmd.exe' },
  { id: '3', name: 'Settings', icon: '⚙️', color: 'bg-blue-600',  path: 'C:\\Windows\\System32\\control.exe' },
];

interface CtxPos { x: number; y: number }

export default function App() {
  const appWindow = getCurrentWebviewWindow();
  const windowId  = appWindow.label;
  const iconsKey  = `ig_icons_${windowId}`;
  const colorKey  = `ig_color_${windowId}`;
  const alphaKey  = `ig_alpha_${windowId}`;
  const layoutKey = `ig_layout_${windowId}`;
  const spaceKey  = `ig_space_${windowId}`;

  const [layout,       setLayout]       = useState<LayoutType>(() => {
    const saved = localStorage.getItem(layoutKey) as LayoutType;
    if (saved && ['circle','line','vertical','dock'].includes(saved)) return saved;
    return getLayoutFromUrl();
  });
  const [icons,        setIcons]        = useState<IconData[]>(() => {
    try { const s = localStorage.getItem(iconsKey); if (s) return JSON.parse(s); } catch (_) {}
    return windowId === 'main' ? DEMO_ICONS : [];
  });
  const [panelColor,   setPanelColor]   = useState(() => localStorage.getItem(colorKey)  || '#0f0f1a');
  const [panelOpacity, setPanelOpacity] = useState(() => Number(localStorage.getItem(alphaKey) ?? 55));
  const [spacing,      setSpacing]      = useState(() => Number(localStorage.getItem(spaceKey) ?? 16));
  const [ctx,          setCtx]          = useState<CtxPos | null>(null);
  const [showColors,   setShowColors]   = useState(false);
  const [isDragOver,   setIsDragOver]   = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Persist state
  useEffect(() => { localStorage.setItem(layoutKey, layout);                }, [layout,       layoutKey]);
  useEffect(() => { localStorage.setItem(iconsKey,  JSON.stringify(icons)); }, [icons,        iconsKey]);
  useEffect(() => { localStorage.setItem(colorKey,  panelColor);            }, [panelColor,   colorKey]);
  useEffect(() => { localStorage.setItem(alphaKey,  String(panelOpacity));  }, [panelOpacity, alphaKey]);
  useEffect(() => { localStorage.setItem(spaceKey,  String(spacing));       }, [spacing,      spaceKey]);

  // Anti-minimize: immediately restore when the OS minimizes (Win+D)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    appWindow.listen('tauri://window-resized', async () => {
      try {
        if (await appWindow.isMinimized()) await appWindow.unminimize();
      } catch (_) {}
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [appWindow]);

  // Also listen to native minimize event
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    appWindow.onResized(async () => {
      try {
        if (await appWindow.isMinimized()) await appWindow.unminimize();
      } catch (_) {}
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
    let unlistenFn: (() => void) | undefined;
    
    appWindow.onDragDropEvent(ev => {
      if (ev.payload.type === 'over')  setIsDragOver(true);
      if (ev.payload.type === 'leave') setIsDragOver(false);
      if (ev.payload.type === 'drop') {
        setIsDragOver(false);
        const paths: string[] = (ev.payload as { type: string; paths: string[] }).paths ?? [];
        if (paths.length) {
          setIcons(prev => {
            // Prevent exact duplicates in the same drop
            const newIcons = paths.filter(p => !prev.some(i => i.path === p)).map(p => ({
              id:    Math.random().toString(36).slice(2, 11),
              name:  p.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '') || 'ملف',
              icon:  '📄',
              color: 'bg-gray-600',
              path:  p,
            }));
            return [...prev, ...newIcons];
          });
        }
      }
    }).then(fn => { unlistenFn = fn; });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [appWindow]);

  // Right-click on the group → context menu
  const onGroupRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const menuW = 196, menuH = 300;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Flip left if too close to right edge, flip up if too close to bottom edge
    const x = e.clientX + menuW + 8 > vw ? e.clientX - menuW - 4 : e.clientX + 4;
    const y = e.clientY + menuH + 8 > vh ? e.clientY - menuH - 4 : e.clientY + 4;
    setCtx({
      x: Math.max(4, x),
      y: Math.max(4, y),
    });
    setShowColors(false);
  }, []);

  // Left click drag — only on empty areas
  const handleDragStart = useCallback(async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    try { await appWindow.startDragging(); } catch (_) {}
  }, [appWindow]);

  const handleClose  = async () => { await appWindow.close(); };
  const handleRemove = (id: string) => setIcons(prev => prev.filter(i => i.id !== id));

  // Re-extract icon for a dropped file
  const refreshIcon = useCallback(async (id: string, path: string) => {
    try {
      const b64 = await invoke<string>('get_file_icon', { path });
      setIcons(prev => prev.map(i => i.id === id ? { ...i, icon: b64 } : i));
    } catch (_) {}
  }, []);

  // Fetch real icons after drop
  useEffect(() => {
    icons.forEach(ico => {
      if (ico.icon === '📄') refreshIcon(ico.id, ico.path);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [icons.length]);

  const alpha   = Math.round(panelOpacity * 2.55).toString(16).padStart(2, '0');
  const bgStyle = { backgroundColor: `${panelColor}${alpha}` };

  return (
    // Root: fully transparent, click-through, fills the whole window
    <div className="w-screen h-screen overflow-hidden bg-transparent">

      {/* ─── GROUP (centered, interactive) ──────────────────────────────── */}
      <div className="w-full h-full flex items-center justify-center pointer-events-none">
        <div
          className="pointer-events-auto relative select-none"
          onContextMenu={onGroupRightClick}
          onMouseDown={handleDragStart}
          data-tauri-drag-region
        >
          {isDragOver && (
            <div className="absolute inset-[-8px] border-2 border-dashed border-white/50 rounded-3xl pointer-events-none z-20 animate-pulse" />
          )}

          {icons.length === 0 ? (
            <div
              className="w-64 h-64 rounded-full flex flex-col items-center justify-center gap-3 text-white/40 border-2 border-dashed border-white/20"
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
              spacing={spacing}
              onRemove={handleRemove}
              style={bgStyle}
            />
          )}
        </div>
      </div>

      {/* ─── CONTEXT MENU (always pointer-events-auto, above everything) ── */}
      {ctx && (
        <div
          ref={menuRef}
          className="fixed z-[9999] w-48 rounded-xl overflow-hidden shadow-2xl border border-white/10 pointer-events-auto"
          style={{
            left:           ctx.x,
            top:            ctx.y,
            background:     'rgba(10,10,20,0.95)',
            backdropFilter: 'blur(28px)',
          }}
          onMouseDown={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
        >
          {/* Layout */}
          <div className="px-2 pt-2 pb-1">
            <p className="text-white/30 text-[9px] px-2 pb-1 uppercase tracking-wider">التخطيط</p>
            {(['circle', 'line', 'vertical', 'dock'] as const).map(l => (
              <button
                key={l}
                onClick={() => { setLayout(l); setCtx(null); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  layout === l ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="w-4 text-center text-[10px]">{layout === l ? '✓' : ''}</span>
                {l === 'circle' ? '⭕ دائري' : l === 'line' ? '➖ أفقي' : l === 'vertical' ? '⬆️ رأسي' : '🍎 ماك (Dock)'}
              </button>
            ))}
          </div>

          <div className="h-px bg-white/10 mx-2" />

          {/* Appearance */}
          <div className="px-2 py-1">
            <button
              onClick={() => setShowColors(s => !s)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/55 hover:bg-white/10 hover:text-white transition-all"
            >
              <span>🎨</span> المظهر
              <span className="ml-auto text-[10px] opacity-50">{showColors ? '▲' : '▼'}</span>
            </button>
            {showColors && (
              <div className="px-2 pb-2 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-[10px]">اللون</span>
                  <input type="color" value={panelColor} onChange={e => setPanelColor(e.target.value)}
                    className="flex-1 h-6 rounded cursor-pointer border-0 bg-transparent" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-white/40 text-[10px] whitespace-nowrap">شفافية</span>
                  <input type="range" min="0" max="100" value={panelOpacity}
                    onChange={e => setPanelOpacity(Number(e.target.value))}
                    className="flex-1 h-1 accent-white" />
                  <span className="text-white/50 text-[9px] w-7 text-right">{panelOpacity}%</span>
                </div>
              </div>
            )}
            
            {/* Spacing Slider */}
            <div className="px-2 mt-2">
              <div className="flex items-center gap-1.5">
                <span className="text-white/40 text-[10px] whitespace-nowrap">تباعد</span>
                <input type="range" min="4" max="48" value={spacing}
                  onChange={e => setSpacing(Number(e.target.value))}
                  className="flex-1 h-1 accent-white" />
                <span className="text-white/50 text-[9px] w-5 text-right">{spacing}</span>
              </div>
            </div>
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
