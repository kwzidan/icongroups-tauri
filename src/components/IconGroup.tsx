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
  spacing?: number;
  onRemove?: (id: string) => void;
  style?: React.CSSProperties;
}

const IconGroup: React.FC<IconGroupProps> = ({ layout, icons, spacing = 16, onRemove, style }) => {
  const isDock   = layout === 'dock';
  const isCircle = layout === 'circle';

  // Circle: dynamic radius so icons never overlap regardless of count or spacing
  const circleRadius = isCircle
    ? Math.max(60, spacing * 2.5 + icons.length * 8)
    : 0;
  // Container must fit the full circle (radius + icon half-size + a little padding)
  const circleSize = isCircle ? (circleRadius + 52) * 2 : 0;

  if (isCircle) {
    return (
      <div
        className="relative rounded-full backdrop-blur-md border border-white/10 group-animation"
        style={{
          width:  circleSize,
          height: circleSize,
          ...style,
        }}
      >
        {icons.map((icon, index) => {
          const angle  = (index / icons.length) * 2 * Math.PI - Math.PI / 2; // start from top
          const cx     = circleSize / 2 + Math.cos(angle) * circleRadius;
          const cy     = circleSize / 2 + Math.sin(angle) * circleRadius;
          return (
            <div
              key={icon.id}
              className="absolute icon-animation"
              style={{
                left:      cx - 32,  // 32 = half of icon+label block (~64px wide)
                top:       cy - 32,
                transform: 'translate(0,0)',
              }}
            >
              <DesktopIcon icon={icon} onRemove={onRemove ? () => onRemove(icon.id) : undefined} />
            </div>
          );
        })}
      </div>
    );
  }

  if (isDock) {
    return (
      <div
        className="flex flex-row items-end px-5 py-3 rounded-2xl backdrop-blur-md border border-white/10 group-animation shadow-[0_20px_40px_rgba(0,0,0,0.55)]"
        style={{
          gap: `${Math.max(4, spacing * 0.6)}px`,
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.13), rgba(0,0,0,0.45))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 20px 40px rgba(0,0,0,0.55)',
          ...style,
        }}
      >
        {icons.map(icon => (
          <div
            key={icon.id}
            className="icon-animation origin-bottom hover:-translate-y-3 hover:scale-125 transition-all duration-200 ease-out"
          >
            <DesktopIcon icon={icon} onRemove={onRemove ? () => onRemove(icon.id) : undefined} />
          </div>
        ))}
      </div>
    );
  }

  // line / vertical
  const isVertical = layout === 'vertical';
  return (
    <div
      className={`flex ${isVertical ? 'flex-col' : 'flex-row'} items-center justify-center p-4 rounded-2xl backdrop-blur-md border border-white/10 group-animation`}
      style={{ gap: `${spacing}px`, ...style }}
    >
      {icons.map(icon => (
        <div key={icon.id} className="icon-animation">
          <DesktopIcon icon={icon} onRemove={onRemove ? () => onRemove(icon.id) : undefined} />
        </div>
      ))}
    </div>
  );
};

export default IconGroup;
