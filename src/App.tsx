import { useState, useEffect } from 'react';
import IconGroup from './components/IconGroup';
import type { LayoutType } from './components/IconGroup';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

interface IconData {
  id: string;
  name: string;
  icon: string;
  color: string;
  path: string;
}

// Get the unique window label to use as the localStorage key
// This ensures each window has its own independent set of icons
function getWindowId(): string {
  const appWindow = getCurrentWebviewWindow();
  return appWindow.label; // e.g. "main", "group_uuid-..."
}

// Get layout from URL hash — this ALWAYS takes priority
function getLayoutFromUrl(): LayoutType | null {
  const hash = window.location.hash.replace('#', '');
  const params = new URLSearchParams(hash);
  const l = params.get('layout');
  if (l === 'circle' || l === 'line' || l === 'vertical') return l;
  return null;
}

const DEMO_ICONS: IconData[] = [
  { id: '1', name: 'Browser', icon: '🌐', color: 'bg-blue-500', path: 'C:\\' },
  { id: '2', name: 'Files', icon: '📁', color: 'bg-yellow-500', path: 'C:\\' },
  { id: '3', name: 'Terminal', icon: '💻', color: 'bg-gray-800', path: 'C:\\' },
];

function App() {
  const windowId = getWindowId();
  const iconsKey = `icongroups_icons_${windowId}`;
  const colorKey = `icongroups_color_${windowId}`;
  const opacityKey = `icongroups_opacity_${windowId}`;

  // Layout: URL hash takes priority, then localStorage, then default 'circle'
  const [layout, setLayout] = useState<LayoutType>(() => {
    const fromUrl = getLayoutFromUrl();
    if (fromUrl) return fromUrl;
    return (localStorage.getItem(`icongroups_layout_${windowId}`) as LayoutType) || 'circle';
  });

  const [icons, setIcons] = useState<IconData[]>(() => {
    const saved = localStorage.getItem(iconsKey);
    if (saved) {
      try { return JSON.parse(saved); } catch (_) {}
    }
    // New window → start empty so user can drag files in
    // Only the main window starts with demo icons
    return windowId === 'main' ? DEMO_ICONS : [];
  });

  const [panelColor, setPanelColor] = useState(() =>
    localStorage.getItem(colorKey) || '#000000'
  );
  const [panelOpacity, setPanelOpacity] = useState(() =>
    Number(localStorage.getItem(opacityKey) ?? 40)
  );
  const [showSettings, setShowSettings] = useState(false);

  // Persist everything whenever it changes
  useEffect(() => {
    localStorage.setItem(iconsKey, JSON.stringify(icons));
  }, [icons, iconsKey]);

  useEffect(() => {
    localStorage.setItem(`icongroups_layout_${windowId}`, layout);
  }, [layout, windowId]);

  useEffect(() => {
    localStorage.setItem(colorKey, panelColor);
  }, [panelColor, colorKey]);

  useEffect(() => {
    localStorage.setItem(opacityKey, String(panelOpacity));
  }, [panelOpacity, opacityKey]);

  // Tauri v2 native drag-and-drop — add dropped files as icons
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      const appWindow = getCurrentWebviewWindow();
      unlisten = await appWindow.onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          const paths: string[] = (event.payload as { type: string; paths: string[] }).paths || [];
          if (paths.length > 0) {
            const newIcons: IconData[] = paths.map((filePath) => ({
              id: Math.random().toString(36).substr(2, 9),
              name: filePath.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '') || 'ملف',
              icon: '📄',
              color: 'bg-gray-600',
              path: filePath,
            }));
            setIcons((prev) => [...prev, ...newIcons]);
          }
        }
      });
    };

    setup();
    return () => { unlisten?.(); };
  }, []);

  const handleRemoveIcon = (id: string) => {
    setIcons((prev) => prev.filter((icon) => icon.id !== id));
  };

  const handleCloseGroup = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.close();
  };

  const bgStyle = {
    backgroundColor: `${panelColor}${Math.round(panelOpacity * 2.55).toString(16).padStart(2, '0')}`,
  };

  return (
    // The ENTIRE screen is the drag region — clicking empty space moves the window
    <div
      className="w-screen h-screen flex items-center justify-center overflow-hidden group bg-transparent"
      data-tauri-drag-region
    >
      {/* Inner wrapper — pointer-events: none so drag region works everywhere */}
      <div className="relative flex items-center justify-center" style={{ pointerEvents: 'none' }}>

        {/* Icon group — restore pointer events ONLY here */}
        <div style={{ pointerEvents: 'auto' }}>
          {icons.length === 0 ? (
            <div
              className="w-[280px] h-[280px] rounded-full border-2 border-dashed border-white/30 flex flex-col items-center justify-center text-white/50 text-sm gap-3"
              style={bgStyle}
            >
              <span className="text-5xl">📥</span>
              <span className="text-center px-6">اسحب الملفات هنا</span>
            </div>
          ) : (
            <IconGroup
              layout={layout}
              icons={icons}
              onRemove={handleRemoveIcon}
              style={bgStyle}
            />
          )}
        </div>

        {/* Controls — appear on hover, restore pointer events */}
        <div
          className="absolute -top-14 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 flex gap-2 z-50 whitespace-nowrap"
          style={{ pointerEvents: 'auto' }}
        >
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="text-[11px] bg-black/50 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg backdrop-blur-md border border-white/10 transition-all"
          >
            ⚙️ الإعدادات
          </button>
          <button
            onClick={handleCloseGroup}
            className="text-[11px] bg-red-500/30 hover:bg-red-500/80 text-white px-3 py-1.5 rounded-lg backdrop-blur-md border border-red-500/20 transition-all"
          >
            ✕ إغلاق
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div
            className="absolute top-14 left-1/2 -translate-x-1/2 bg-black/85 p-4 rounded-2xl border border-white/15 flex flex-col gap-3 z-50 w-52 backdrop-blur-2xl shadow-2xl"
            style={{ pointerEvents: 'auto' }}
          >
            {/* Layout switcher */}
            <div className="flex flex-col gap-1.5">
              <span className="text-white/60 text-[10px] uppercase tracking-wide">التخطيط</span>
              <div className="flex gap-1.5">
                {(['circle', 'line', 'vertical'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLayout(l)}
                    className={`flex-1 text-[10px] py-1.5 rounded-lg font-medium transition-all ${
                      layout === l
                        ? 'bg-white/25 text-white shadow-inner'
                        : 'bg-white/5 text-white/40 hover:bg-white/10'
                    }`}
                  >
                    {l === 'circle' ? '⭕ دائري' : l === 'line' ? '➖ أفقي' : '⬆️ رأسي'}
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div className="flex flex-col gap-1.5">
              <span className="text-white/60 text-[10px] uppercase tracking-wide">اللون</span>
              <input
                type="color"
                value={panelColor}
                onChange={(e) => setPanelColor(e.target.value)}
                className="w-full h-9 rounded-lg cursor-pointer border-0 bg-transparent"
              />
            </div>

            {/* Opacity */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span className="text-white/60 text-[10px] uppercase tracking-wide">الشفافية</span>
                <span className="text-white/80 text-[10px]">{panelOpacity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={panelOpacity}
                onChange={(e) => setPanelOpacity(Number(e.target.value))}
                className="w-full accent-white"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
