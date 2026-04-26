import React from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DesktopIconProps {
  icon: {
    id: string;
    name: string;
    icon: string;
    color: string;
    path: string;
  };
}

const DesktopIcon: React.FC<DesktopIconProps> = ({ icon }) => {
  const handleOpen = async () => {
    try {
      await invoke('open_path', { path: icon.path });
    } catch (error) {
      console.error('Failed to open path:', error);
    }
  };

  return (
    <button
      onClick={handleOpen}
      className="group relative flex flex-col items-center justify-center p-3 rounded-xl transition-all hover:bg-white/10 hover:scale-110 active:scale-95"
    >
      <div className={`w-12 h-12 flex items-center justify-center rounded-2xl shadow-lg text-2xl transition-transform ${icon.color}`}>
        {icon.icon}
      </div>
      <span className="absolute top-full mt-2 px-2 py-1 bg-black/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
        {icon.name}
      </span>
    </button>
  );
};

export default DesktopIcon;
