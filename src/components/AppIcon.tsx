import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

export type AppIconName =
  | 'flash'
  | 'search'
  | 'settings-outline'
  | 'arrow-back'
  | 'chevron-forward'
  | 'chevron-down'
  | 'checkmark'
  | 'close'
  | 'today-outline'
  | 'git-pull-request-outline'
  | 'add-circle-outline'
  | 'layers-outline'
  | 'apps-outline'
  | 'star'
  | 'star-outline'
  | 'checkbox'
  | 'square-outline'
  | 'cloud-upload-outline'
  | 'cloud-offline-outline'
  | 'chatbubbles-outline'
  | 'ribbon-outline'
  | 'grid-outline'
  | 'information-circle-outline'
  | 'sunny-outline'
  | 'moon-outline'
  | 'server-outline'
  | 'swap-horizontal-outline'
  | 'link-outline'
  | 'refresh-outline'
  | 'logo-github'
  | 'sparkles'
  | 'open-outline'
  | 'time-outline';

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** Crisp vector icon rendered via react-native-svg so icons never depend on system or .ttf font loading. */
export function AppIcon({ name, size = 20, color = '#FFFFFF', style }: AppIconProps) {
  const sw = 1.9;
  const strokeProps = {
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {renderGlyph(name, color, strokeProps)}
      </Svg>
    </View>
  );
}

function renderGlyph(
  name: AppIconName,
  color: string,
  sp: {
    stroke: string;
    strokeWidth: number;
    strokeLinecap: 'round';
    strokeLinejoin: 'round';
    fill: string;
  }
): React.ReactNode {
  switch (name) {
    case 'flash':
      return <Polygon points="13 2 4 14 11 14 10 22 20 10 13 10 13 2" fill={color} />;
    case 'search':
      return (
        <>
          <Circle cx="11" cy="11" r="7" {...sp} />
          <Line x1="20" y1="20" x2="16.2" y2="16.2" {...sp} />
        </>
      );
    case 'settings-outline':
      return (
        <>
          <Circle cx="12" cy="12" r="3" {...sp} />
          <Path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.78 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            {...sp}
          />
        </>
      );
    case 'arrow-back':
      return (
        <>
          <Line x1="19" y1="12" x2="5" y2="12" {...sp} />
          <Polyline points="12 19 5 12 12 5" {...sp} />
        </>
      );
    case 'chevron-forward':
      return <Polyline points="9 6 15 12 9 18" {...sp} />;
    case 'chevron-down':
      return <Polyline points="6 9 12 15 18 9" {...sp} />;
    case 'checkmark':
      return <Polyline points="5 12 10 17 19 7" {...sp} />;
    case 'close':
      return (
        <>
          <Line x1="18" y1="6" x2="6" y2="18" {...sp} />
          <Line x1="6" y1="6" x2="18" y2="18" {...sp} />
        </>
      );
    case 'today-outline':
      return (
        <>
          <Rect x="3" y="4" width="18" height="17" rx="2.5" {...sp} />
          <Line x1="3" y1="9.5" x2="21" y2="9.5" {...sp} />
          <Line x1="8" y1="2.5" x2="8" y2="5.5" {...sp} />
          <Line x1="16" y1="2.5" x2="16" y2="5.5" {...sp} />
          <Circle cx="12" cy="15" r="1.5" fill={color} />
        </>
      );
    case 'git-pull-request-outline':
      return (
        <>
          <Circle cx="6" cy="6" r="2.5" {...sp} />
          <Circle cx="6" cy="18" r="2.5" {...sp} />
          <Circle cx="18" cy="18" r="2.5" {...sp} />
          <Line x1="6" y1="8.5" x2="6" y2="15.5" {...sp} />
          <Path d="M18 15.5V9a3 3 0 0 0-3-3h-2" {...sp} />
          <Polyline points="14.5 4 12.5 6 14.5 8" {...sp} />
        </>
      );
    case 'add-circle-outline':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...sp} />
          <Line x1="12" y1="8" x2="12" y2="16" {...sp} />
          <Line x1="8" y1="12" x2="16" y2="12" {...sp} />
        </>
      );
    case 'layers-outline':
      return (
        <>
          <Polygon points="12 3 3 8 12 13 21 8 12 3" {...sp} />
          <Polyline points="3 12.5 12 17.5 21 12.5" {...sp} />
          <Polyline points="3 17 12 22 21 17" {...sp} />
        </>
      );
    case 'apps-outline':
      return (
        <>
          <Rect x="4" y="4" width="6.5" height="6.5" rx="1.5" {...sp} />
          <Rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" {...sp} />
          <Rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" {...sp} />
          <Rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" {...sp} />
        </>
      );
    case 'star':
      return (
        <Polygon
          points="12 2.5 14.9 8.4 21.4 9.3 16.7 13.9 17.8 20.4 12 17.3 6.2 20.4 7.3 13.9 2.6 9.3 9.1 8.4 12 2.5"
          fill={color}
          stroke={color}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      );
    case 'star-outline':
      return (
        <Polygon
          points="12 2.5 14.9 8.4 21.4 9.3 16.7 13.9 17.8 20.4 12 17.3 6.2 20.4 7.3 13.9 2.6 9.3 9.1 8.4 12 2.5"
          {...sp}
        />
      );
    case 'checkbox':
      return (
        <>
          <Rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill={color} />
          <Polyline points="7.5 12.2 10.7 15.4 16.8 8.8" stroke="#08090C" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      );
    case 'square-outline':
      return <Rect x="3.5" y="3.5" width="17" height="17" rx="3.5" {...sp} />;
    case 'cloud-upload-outline':
      return (
        <>
          <Path d="M17.5 19a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.3 9.4 4.5 4.5 0 0 0 7 18.4" {...sp} />
          <Line x1="12" y1="20" x2="12" y2="12" {...sp} />
          <Polyline points="9 15 12 12 15 15" {...sp} />
        </>
      );
    case 'cloud-offline-outline':
      return (
        <>
          <Path d="M22 15.5a4 4 0 0 0-3.8-4A5.9 5.9 0 0 0 11 6.3" {...sp} />
          <Path d="M6.4 9.6A4.5 4.5 0 0 0 6.5 18h10" {...sp} />
          <Line x1="3" y1="3" x2="21" y2="21" {...sp} />
        </>
      );
    case 'chatbubbles-outline':
      return (
        <>
          <Path d="M4 16.5V7a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v5.5a3 3 0 0 1-3 3H8l-4 3v-2z" {...sp} />
          <Path d="M8 19.5h8.5L20 22v-6.5" {...sp} />
        </>
      );
    case 'ribbon-outline':
      return (
        <>
          <Circle cx="12" cy="9" r="6" {...sp} />
          <Polyline points="8.5 14 7.5 21.5 12 19 16.5 21.5 15.5 14" {...sp} />
        </>
      );
    case 'grid-outline':
      return (
        <>
          <Rect x="3.5" y="3.5" width="17" height="17" rx="2" {...sp} />
          <Line x1="3.5" y1="9.5" x2="20.5" y2="9.5" {...sp} />
          <Line x1="3.5" y1="15" x2="20.5" y2="15" {...sp} />
          <Line x1="9.5" y1="9.5" x2="9.5" y2="20.5" {...sp} />
        </>
      );
    case 'information-circle-outline':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...sp} />
          <Line x1="12" y1="11" x2="12" y2="16.5" {...sp} />
          <Circle cx="12" cy="8" r="1" fill={color} />
        </>
      );
    case 'sunny-outline':
      return (
        <>
          <Circle cx="12" cy="12" r="4.5" {...sp} />
          <Line x1="12" y1="2.5" x2="12" y2="4.5" {...sp} />
          <Line x1="12" y1="19.5" x2="12" y2="21.5" {...sp} />
          <Line x1="2.5" y1="12" x2="4.5" y2="12" {...sp} />
          <Line x1="19.5" y1="12" x2="21.5" y2="12" {...sp} />
          <Line x1="5.3" y1="5.3" x2="6.7" y2="6.7" {...sp} />
          <Line x1="17.3" y1="17.3" x2="18.7" y2="18.7" {...sp} />
          <Line x1="5.3" y1="18.7" x2="6.7" y2="17.3" {...sp} />
          <Line x1="17.3" y1="6.7" x2="18.7" y2="5.3" {...sp} />
        </>
      );
    case 'moon-outline':
      return <Path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" {...sp} />;
    case 'server-outline':
      return (
        <>
          <Rect x="3.5" y="4" width="17" height="6.5" rx="1.8" {...sp} />
          <Rect x="3.5" y="13.5" width="17" height="6.5" rx="1.8" {...sp} />
          <Circle cx="7.5" cy="7.25" r="0.9" fill={color} />
          <Circle cx="7.5" cy="16.75" r="0.9" fill={color} />
        </>
      );
    case 'swap-horizontal-outline':
      return (
        <>
          <Polyline points="16 5 20 9 16 13" {...sp} />
          <Line x1="4" y1="9" x2="20" y2="9" {...sp} />
          <Polyline points="8 11 4 15 8 19" {...sp} />
          <Line x1="20" y1="15" x2="4" y2="15" {...sp} />
        </>
      );
    case 'link-outline':
      return (
        <>
          <Path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" {...sp} />
          <Path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" {...sp} />
        </>
      );
    case 'refresh-outline':
      return (
        <>
          <Path d="M20 11a8 8 0 0 0-14.5-4.5L4 8.5" {...sp} />
          <Polyline points="4 4 4 8.5 8.5 8.5" {...sp} />
          <Path d="M4 13a8 8 0 0 0 14.5 4.5L20 15.5" {...sp} />
          <Polyline points="20 20 20 15.5 15.5 15.5" {...sp} />
        </>
      );
    case 'logo-github':
      return (
        <Path
          d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 3 .8.1-.7.4-1.1.7-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.2-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.4.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7 1 .7 2v2.9c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2z"
          fill={color}
        />
      );
    case 'sparkles':
      return (
        <>
          <Path d="M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7L12 3z" fill={color} />
          <Path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8L19 15z" fill={color} />
        </>
      );
    case 'open-outline':
      return (
        <>
          <Path d="M18 13.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5.5" {...sp} />
          <Polyline points="15 3 21 3 21 9" {...sp} />
          <Line x1="10" y1="14" x2="21" y2="3" {...sp} />
        </>
      );
    case 'time-outline':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...sp} />
          <Polyline points="12 7.5 12 12 15.5 14" {...sp} />
        </>
      );
  }
}
