import React, { useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

interface DesktopIconProps {
  icon: {
    id: string;
    name: string;
    icon: string;
    color: string;
    path: string;
  };
  onRemove?: () => void;
}

const DesktopIcon: React.FC<DesktopIconProps> = ({ icon, onRemove }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    const ext = icon.path.split('.').pop()?.toLowerCase();
    if (ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) {
      setImgSrc(convertFileSrc(icon.path));
    }
  }, [icon.path]);

  const handleOpen = async () => {
    try {
      await invoke('open_path', { path: icon.path });
    } catch (error) {
      console.error('Failed to open path:', error);
    }
  };

  return (
    <div className="group relative flex flex-col items-center justify-center p-3 rounded-xl transition-all hover:scale-110">
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-md"
          title="حذف الأيقونة"
        >
          ✕
        </button>
      )}
      <button
        onClick={handleOpen}
        className="active:scale-95 transition-transform"
      >
        <div className={`w-14 h-14 flex items-center justify-center rounded-2xl shadow-lg text-3xl transition-transform overflow-hidden ${imgSrc ? 'bg-transparent' : icon.color}`}>
          {imgSrc ? (
            <img src={imgSrc} alt={icon.name} className="w-full h-full object-cover" />
          ) : (
            icon.icon
          )}
        </div>
      </button>
      <span className="absolute top-full mt-2 px-2 py-1 bg-black/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
        {icon.name}
      </span>
    </div>
  );
};

export default DesktopIcon;
