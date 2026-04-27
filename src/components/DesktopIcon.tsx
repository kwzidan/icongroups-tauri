import React, { useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

interface DesktopIconProps {
  icon: {
    id: string;
    name: string;
    icon: string;  // either emoji OR a base64 data URL from get_file_icon
    color: string;
    path: string;
  };
  onRemove?: () => void;
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];

const DesktopIcon: React.FC<DesktopIconProps> = ({ icon, onRemove }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  const ext = icon.path.split('.').pop()?.toLowerCase();

  useEffect(() => {
    // If the icon field is already a base64/data URL set by App.tsx, use it directly
    if (icon.icon.startsWith('data:image')) {
      setImgSrc(icon.icon);
      return;
    }
    // If the file itself is an image, convert the path for the webview
    if (ext && IMAGE_EXTS.includes(ext)) {
      setImgSrc(convertFileSrc(icon.path));
      return;
    }
    // Try to fetch the real Windows icon via Rust + PowerShell
    invoke<string>('get_file_icon', { path: icon.path })
      .then(b64 => setImgSrc(b64))
      .catch(() => setImgSrc(null));
  }, [icon.icon, icon.path, ext]);

  const handleOpen = async () => {
    try { await invoke('open_path', { path: icon.path }); }
    catch (e) { console.error(e); }
  };

  return (
    <div
      className="group relative flex flex-col items-center justify-center p-3 rounded-xl transition-all hover:scale-110"
      onContextMenu={e => {
        if (e.ctrlKey && onRemove) {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }
      }}
    >
      {/* Remove button on hover */}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full items-center justify-center text-xs hidden group-hover:flex z-50 shadow-md transition-all"
          title="حذف (أو Ctrl+كليك يمين)"
        >✕</button>
      )}

      <button onClick={handleOpen} className="active:scale-95 transition-transform" onMouseDown={e => e.stopPropagation()}>
        <div className={`w-12 h-12 flex items-center justify-center overflow-hidden ${imgSrc ? '' : `rounded-xl shadow-md text-2xl ${icon.color}`}`}>
          {imgSrc
            ? <img src={imgSrc} alt={icon.name} className="w-8 h-8 object-contain drop-shadow-md" />
            : icon.icon
          }
        </div>
      </button>

      <span className="absolute top-full mt-2 px-2 py-1 bg-black/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
        {icon.name}
      </span>
    </div>
  );
};

export default DesktopIcon;
