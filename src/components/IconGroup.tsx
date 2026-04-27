import React from 'react';
import DesktopIcon from './DesktopIcon';

export type LayoutType = 'line' | 'vertical' | 'circle' | 'dock';

interface IconData {
  id: string;
  name: string;
  icon: string;
  color: string;
  path: string;
}

interface IconGroupProps {
  layout: LayoutType;
  icons: IconData[];
  onRemove?: (id: string) => void;
  style?: React.CSSProperties;
}

const IconGroup: React.FC<IconGroupProps> = ({ layout, icons, onRemove, style }) => {
  const getLayoutClasses = () => {
    switch (layout) {
      case 'line':
        return 'flex-row gap-4 p-4 rounded-2xl';
      case 'vertical':
        return 'flex-col gap-4 p-4 rounded-2xl';
      case 'circle':
        return 'relative w-[300px] h-[300px] rounded-full';
      case 'dock':
        return 'flex-row gap-3 px-6 py-3 rounded-2xl items-end';
      default:
        return 'flex-row gap-4 p-4';
    }
  };

  const isDock = layout === 'dock';

  return (
    <div
      className={`flex items-center justify-center group-animation backdrop-blur-md border border-white/10 ${getLayoutClasses()} ${isDock ? 'shadow-[0_20px_40px_rgba(0,0,0,0.5)] border-t-white/30 border-b-black/50' : ''}`}
      style={{
        ...style,
        ...(isDock ? {
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(0,0,0,0.4))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
          transform: 'perspective(500px) rotateX(10deg)',
          transformOrigin: 'bottom'
        } : {})
      }}
    >
      {icons.map((icon, index) => {
        let iconStyle: React.CSSProperties = {};
        if (layout === 'circle') {
          const angle = (index / icons.length) * 360;
          const radius = 100;
          const radian = (angle * Math.PI) / 180;
          iconStyle = {
            position: 'absolute',
            top: `calc(50% - 24px + ${Math.sin(radian) * radius}px)`,
            left: `calc(50% - 24px + ${Math.cos(radian) * radius}px)`,
          };
        }

        return (
          <div
            key={icon.id}
            className={`icon-animation ${isDock ? 'origin-bottom hover:-translate-y-4 hover:scale-125 transition-all duration-300' : ''}`}
            style={iconStyle}
          >
            <DesktopIcon icon={icon} onRemove={onRemove ? () => onRemove(icon.id) : undefined} />
          </div>
        );
      })}
    </div>
  );
};

export default IconGroup;
