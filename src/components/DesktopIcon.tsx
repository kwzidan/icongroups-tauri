import React from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

interface DesktopIconProps {
  icon: {
    id: string;
    name: string;
    /** Either an emoji, a base64 data:image URL, or a plain path to an image file */
    icon: string;
    color: string;
    path: string;
  };
  onRemove?: () => void;
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];

const DesktopIcon: React.FC<DesktopIconProps> = ({ icon, onRemove }) => {
  const [imgSrc, setImgSrc] = React.useState<string | null>(null);
  const fetching = React.useRef(false);

  const ext = icon.path.split('.').pop()?.toLowerCase();

  React.useEffect(() => {
    // Always re-fetch from the Rust backend so we get the best quality icon.
    // We do NOT rely on the base64 stored in localStorage (icon.icon) because
    // it may have been saved from an older, lower-quality extraction.
    if (!fetching.current) {
      fetching.current = true;
      invoke<string>('get_file_icon', { path: icon.path })
        .then(b64 => setImgSrc(b64))
        .catch(() => {
          // Fallback: use whatever is stored if fetch fails
          if (icon.icon.startsWith('data:image')) setImgSrc(icon.icon);
        })
        .finally(() => { fetching.current = false; });
    }
  }, [icon.path]);

  const handleOpen = async () => {
    try { await invoke('open_path', { path: icon.path }); }
    catch (e) { console.error(e); }
  };

  const isEmoji = !imgSrc && !icon.icon.startsWith('data:');

  return (
    <div
      className="group relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-200 hover:scale-110 hover:brightness-110"
      onContextMenu={e => {
        if (e.ctrlKey && onRemove) {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }
      }}
    >
      {/* Remove button — visible on hover */}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-400 text-white rounded-full items-center justify-center text-[10px] hidden group-hover:flex z-50 shadow-lg transition-colors"
          title="حذف (أو Ctrl+كليك يمين)"
        >✕</button>
      )}

      {/* Icon button */}
      <button
        onClick={handleOpen}
        onMouseDown={e => e.stopPropagation()}
        className="active:scale-90 transition-transform focus:outline-none"
      >
        <div
          className={`w-12 h-12 flex items-center justify-center overflow-hidden rounded-xl ${
            isEmoji ? `text-2xl ${icon.color}` : ''
          }`}
        >
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={icon.name}
              className="w-12 h-12 object-contain"
            />
          ) : (
            <span className="text-2xl leading-none select-none">{icon.icon}</span>
          )}
        </div>
      </button>

      {/* Name label — always visible, truncated */}
      <span
        className="text-white text-[10px] font-medium leading-tight max-w-[56px] text-center truncate drop-shadow"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        title={icon.name}
      >
        {icon.name}
      </span>
    </div>
  );
};

export default DesktopIcon;
