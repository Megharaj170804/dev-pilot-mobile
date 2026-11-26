export type ThemeMode = 'dark' | 'light';

export interface ThemePalette {
  mode: ThemeMode;
  bg: string;
  bgElevated: string;
  surface: string;
  surface2: string;
  surface3: string;
  panel: string;
  panel2: string;
  panel3: string;
  border: string;
  borderStrong: string;
  borderSubtle: string;
  text: string;
  text2: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  primaryDark: string;
  primaryInk: string;
  primaryMuted: string;
  teal: string;
  success: string;
  successSurface: string;
  warning: string;
  warningSurface: string;
  danger: string;
  dangerSurface: string;
  epic: string;
  epicSoft: string;
  feature: string;
  featureSoft: string;
  task: string;
  taskSoft: string;
  bug: string;
  bugSoft: string;
}

export const DARK_PALETTE: ThemePalette = {
  mode: 'dark',
  bg: '#08090C',
  bgElevated: '#0E1015',
  surface: '#14161C',
  surface2: '#1A1D25',
  surface3: '#242834',
  panel: '#12141A',
  panel2: '#181B22',
  panel3: '#222631',
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  text: '#F5F5F7',
  text2: '#D1D1D6',
  textMuted: '#98989F',
  textSubtle: '#6E6E73',
  primary: '#0A84FF',
  primaryDark: '#0071E3',
  primaryInk: '#409CFF',
  primaryMuted: 'rgba(10, 132, 255, 0.14)',
  teal: '#5AC8FA',
  success: '#30D158',
  successSurface: 'rgba(48, 209, 88, 0.14)',
  warning: '#FF9F0A',
  warningSurface: 'rgba(255, 159, 10, 0.14)',
  danger: '#FF453A',
  dangerSurface: 'rgba(255, 69, 58, 0.14)',
  epic: '#BF5AF2',
  epicSoft: 'rgba(191, 90, 242, 0.15)',
  feature: '#0A84FF',
  featureSoft: 'rgba(10, 132, 255, 0.15)',
  task: '#30D158',
  taskSoft: 'rgba(48, 209, 88, 0.15)',
  bug: '#FF453A',
  bugSoft: 'rgba(255, 69, 58, 0.15)',
};

export const LIGHT_PALETTE: ThemePalette = {
  mode: 'light',
  bg: '#F5F5F7',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surface2: '#F2F2F7',
  surface3: '#E5E5EA',
  panel: '#FFFFFF',
  panel2: '#F7F7FA',
  panel3: '#ECECF1',
  border: 'rgba(0, 0, 0, 0.09)',
  borderStrong: 'rgba(0, 0, 0, 0.16)',
  borderSubtle: 'rgba(0, 0, 0, 0.06)',
  text: '#1D1D1F',
  text2: '#3A3A3C',
  textMuted: '#6E6E73',
  textSubtle: '#8E8E93',
  primary: '#0071E3',
  primaryDark: '#005BB5',
  primaryInk: '#0071E3',
  primaryMuted: 'rgba(0, 113, 227, 0.11)',
  teal: '#007AFF',
  success: '#1D9A41',
  successSurface: 'rgba(29, 154, 65, 0.12)',
  warning: '#B86E00',
  warningSurface: 'rgba(255, 159, 10, 0.14)',
  danger: '#D70015',
  dangerSurface: 'rgba(215, 0, 21, 0.10)',
  epic: '#9B30D9',
  epicSoft: 'rgba(155, 48, 217, 0.12)',
  feature: '#0071E3',
  featureSoft: 'rgba(0, 113, 227, 0.12)',
  task: '#1D9A41',
  taskSoft: 'rgba(29, 154, 65, 0.12)',
  bug: '#D70015',
  bugSoft: 'rgba(215, 0, 21, 0.12)',
};

export const RADII = {
  xl: 18,
  lg: 14,
  md: 12,
  sm: 9,
  xs: 6,
  pill: 999,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;
