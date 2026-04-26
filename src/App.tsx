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

  // Tauri Native Drag & Drop listener
  useEffect(() => {
    let unlisten: any;
    
    const setupListener = async () => {
      unlisten = await listen<any>('tauri://drag-drop', (event) => {
        console.log('Dropped files:', event.payload);
        // event.payload is an object with { paths: string[], position: { x, y } } in Tauri 2
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
    <div className="w-screen h-screen flex items-center justify-center overflow-hidden group">
      <div 
        className="w-full h-full flex items-center justify-center p-4 cursor-move relative"
        data-tauri-drag-region
      >
        <div style={{ pointerEvents: 'auto' }}>
          {icons.length === 0 ? (
             <div 
               className="w-[300px] h-[300px] rounded-full border-2 border-dashed border-white/20 flex items-center justify-center text-white/50 text-sm"
               style={{ backgroundColor: `${panelColor}${Math.round(panelOpacity * 2.55).toString(16).padStart(2, '0')}` }}
             >
               اسحب الملفات هنا
             </div>
          ) : (
             <IconGroup 
               layout={layout} 
               icons={icons} 
               onContextMenu={handleContextMenu} 
               style={{ backgroundColor: `${panelColor}${Math.round(panelOpacity * 2.55).toString(16).padStart(2, '0')}` }}
             />
          )}
          
          <div className="absolute top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-50">
            <button onClick={() => setShowSettings(!showSettings)} className="text-xs bg-white/10 hover:bg-white/30 text-white px-2 py-1 rounded">
              ⚙️ الإعدادات
            </button>
            <button onClick={handleCloseGroup} className="text-xs bg-red-500/50 hover:bg-red-500 text-white px-2 py-1 rounded">
              ❌ إغلاق المجموعة
            </button>
          </div>

          {showSettings && (
            <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-black/80 p-3 rounded-lg border border-white/20 flex flex-col gap-2 z-50 min-w-[150px]">
              <label className="text-white text-xs flex flex-col gap-1">
                اللون:
                <input type="color" value={panelColor} onChange={e => setPanelColor(e.target.value)} className="w-full h-6 rounded cursor-pointer" />
              </label>
              <label className="text-white text-xs flex flex-col gap-1">
                الشفافية: {panelOpacity}%
                <input type="range" min="0" max="100" value={panelOpacity} onChange={e => setPanelOpacity(Number(e.target.value))} className="w-full cursor-pointer" />
              </label>
            </div>
          )}
          
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-[10px] text-white/50 bg-black/20 px-2 py-1 rounded-full whitespace-nowrap">
              3 كليك يمين للحذف
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
