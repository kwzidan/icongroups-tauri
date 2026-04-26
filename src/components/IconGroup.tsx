import React from 'react';
import DesktopIcon from './DesktopIcon';

export type LayoutType = 'line' | 'vertical' | 'circle';

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
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
  style?: React.CSSProperties;
}

const IconGroup: React.FC<IconGroupProps> = ({ layout, icons, onContextMenu, style }) => {
  const getLayoutClasses = () => {
    switch (layout) {
      case 'line':
        return 'flex-row gap-4 p-4 rounded-2xl';
      case 'vertical':
        return 'flex-col gap-4 p-4 rounded-2xl';
      case 'circle':
        return 'relative w-[300px] h-[300px] rounded-full';
      default:
        return 'flex-row gap-4 p-4';
    }
  };

  return (
    <div
      className={`glass-panel flex items-center justify-center group-animation ${getLayoutClasses()}`}
      style={style}
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
            className="icon-animation"
            style={iconStyle}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, icon.id)}
          >
            <DesktopIcon icon={icon} />
          </div>
        );
      })}
    </div>
  );
};

export default IconGroup;
