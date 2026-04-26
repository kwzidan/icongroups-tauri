import React, { useState, useEffect, useRef } from 'react';
import IconGroup from './components/IconGroup';
import type { LayoutType } from './components/IconGroup';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

interface IconData {
  id: string;
  name: string;
  icon: string;
  color: string;
  path: string;
}

const initialIcons: IconData[] = [
  { id: '1', name: 'Browser', icon: '🌐', color: 'bg-blue-500', path: 'C:\\' },
  { id: '2', name: 'Files', icon: '📁', color: 'bg-yellow-500', path: 'C:\\' },
  { id: '3', name: 'Terminal', icon: '💻', color: 'bg-gray-800', path: 'C:\\' },
];

function App() {
  const [layout, setLayout] = useState<LayoutType>(() => {
    return (localStorage.getItem('icongroups_layout') as LayoutType) || 'circle';
  });

  const [icons, setIcons] = useState<IconData[]>(() => {
    const saved = localStorage.getItem('icongroups_icons');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return initialIcons;
  });

  const [panelColor, setPanelColor] = useState('#000000');
  const [panelOpacity, setPanelOpacity] = useState(40);
  const [showSettings, setShowSettings] = useState(false);

  const rightClickCounts = useRef<Record<string, { count: number; timer: ReturnType<typeof setTimeout> | null }>>({});

  useEffect(() => {
    localStorage.setItem('icongroups_icons', JSON.stringify(icons));
  }, [icons]);

  useEffect(() => {
    localStorage.setItem('icongroups_layout', layout);
  }, [layout]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
    const initialLayout = (urlParams.get('layout') || hashParams.get('layout')) as LayoutType;
    if (initialLayout) {
      setLayout(initialLayout);
    }
  }, []);

  // Tauri Native Drag & Drop listener (V2)
  useEffect(() => {
    let unlisten: () => void;
    
    const setupListener = async () => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const appWindow = getCurrentWebviewWindow();
      
      unlisten = await appWindow.onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          console.log('Dropped files:', event.payload.paths);
          const paths = event.payload.paths || [];
          
          if (paths.length > 0) {
            const newIcons = paths.map((filePath: string) => ({
              id: Math.random().toString(36).substr(2, 9),
              name: filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || "ملف",
              icon: '📄',
              color: 'bg-gray-500',
              path: filePath
            }));
            setIcons(prev => [...prev, ...newIcons]);
          }
        }
      });
    };

    setupListener();
    return () => { if (unlisten) unlisten(); };
  }, []);

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!rightClickCounts.current[id]) {
      rightClickCounts.current[id] = { count: 0, timer: null };
    }
    const clickData = rightClickCounts.current[id];
    clickData.count += 1;
    if (clickData.timer) clearTimeout(clickData.timer);
    if (clickData.count >= 3) {
      setIcons(prev => prev.filter(icon => icon.id !== id));
      delete rightClickCounts.current[id];
    } else {
      clickData.timer = setTimeout(() => {
        clickData.count = 0;
      }, 1000);
    }
  };

  const handleCloseGroup = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.close();
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center overflow-hidden group bg-transparent">
      <div 
        className="w-full h-full flex items-center justify-center p-4 cursor-move relative bg-transparent"
        data-tauri-drag-region
      >
        <div style={{ pointerEvents: 'auto' }} className="relative">
          {icons.length === 0 ? (
             <div 
               className="w-[300px] h-[300px] rounded-full border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/50 text-sm gap-2"
               style={{ backgroundColor: `${panelColor}${Math.round(panelOpacity * 2.55).toString(16).padStart(2, '0')}` }}
             >
               <span className="text-4xl">📥</span>
               <span>اسحب الملفات هنا</span>
             </div>
          ) : (
             <IconGroup 
               layout={layout} 
               icons={icons} 
               onContextMenu={handleContextMenu} 
               style={{ backgroundColor: `${panelColor}${Math.round(panelOpacity * 2.55).toString(16).padStart(2, '0')}` }}
             />
          )}
          
          {/* Controls - visible on hover */}
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-50 whitespace-nowrap">
            <button onClick={() => setShowSettings(!showSettings)} className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded backdrop-blur-md border border-white/10">
              ⚙️ الإعدادات
            </button>
            <button onClick={handleCloseGroup} className="text-[10px] bg-red-500/30 hover:bg-red-500 text-white px-2 py-1 rounded backdrop-blur-md border border-red-500/20">
              ❌ إغلاق
            </button>
          </div>

          {showSettings && (
            <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-black/80 p-3 rounded-xl border border-white/20 flex flex-col gap-3 z-50 min-w-[180px] backdrop-blur-xl shadow-2xl">
              <div className="flex flex-col gap-1">
                <span className="text-white text-[10px] opacity-70">اللون الأساسي:</span>
                <input type="color" value={panelColor} onChange={e => setPanelColor(e.target.value)} className="w-full h-8 rounded-lg cursor-pointer bg-transparent" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] text-white">
                  <span className="opacity-70">الشفافية:</span>
                  <span>{panelOpacity}%</span>
                </div>
                <input type="range" min="0" max="100" value={panelOpacity} onChange={e => setPanelOpacity(Number(e.target.value))} className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer" />
              </div>
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-white text-[10px] opacity-70">التخطيط:</span>
                <div className="flex gap-1">
                  {(['circle', 'line', 'vertical'] as const).map(l => (
                    <button 
                      key={l}
                      onClick={() => setLayout(l)}
                      className={`flex-1 text-[9px] py-1 rounded ${layout === l ? 'bg-white/30 text-white' : 'bg-white/5 text-white/50'}`}
                    >
                      {l === 'circle' ? 'دائري' : l === 'line' ? 'أفقي' : 'رأسي'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-[9px] text-white/40 bg-black/40 px-3 py-1 rounded-full whitespace-nowrap backdrop-blur-md">
              💡 3 نقرات يمين للحذف
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
