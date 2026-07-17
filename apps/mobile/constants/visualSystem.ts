import { Platform, ViewStyle } from 'react-native';

export type VarsAppearance = 'light' | 'dark';
export type VarsElevation = 0 | 1 | 2 | 3 | 4;

export const VARS_RADIUS = 5;

export const varsLight = {
  appearance: 'light' as const,
  color: {
    bg: '#FFFFFF',
    surface0: '#FFFFFF',
    surface1: '#FAFAFA',
    surface2: '#F5F5F5',
    surface3: '#EEEEEE',
    surface4: '#E7E7E7',
    ink: '#111111',
    inkMuted: '#6B7280',
    inkFaint: '#D0D0D0',
    inverseInk: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.50)',
    focus: '#111111',
    accentBlue: '#0A7AFF',
    accentAmber: '#F59E0B',
    accentGreen: '#22C55E',
    accentRed: '#DC2626',
  },
};

export const varsDark = {
  appearance: 'dark' as const,
  color: {
    bg: '#050505',
    surface0: '#0B0B0B',
    surface1: '#141414',
    surface2: '#1D1D1D',
    surface3: '#272727',
    surface4: '#323232',
    ink: '#F7F7F7',
    inkMuted: '#B7B7B7',
    inkFaint: '#555555',
    inverseInk: '#111111',
    overlay: 'rgba(0,0,0,0.72)',
    focus: '#FFFFFF',
    accentBlue: '#68AFFF',
    accentAmber: '#FBBF24',
    accentGreen: '#4ADE80',
    accentRed: '#F87171',
  },
};

export type VarsTheme = typeof varsLight | typeof varsDark;

const darkSurfaces: Record<VarsElevation, string> = {
  0: varsDark.color.surface0,
  1: varsDark.color.surface1,
  2: varsDark.color.surface2,
  3: varsDark.color.surface3,
  4: varsDark.color.surface4,
};

const lightSurfaces: Record<VarsElevation, string> = {
  0: varsLight.color.surface0,
  1: varsLight.color.surface1,
  2: varsLight.color.surface2,
  3: varsLight.color.surface3,
  4: varsLight.color.surface4,
};

const shadowByElevation: Record<VarsElevation, ViewStyle> = {
  0: {},
  1: {
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  2: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  3: {
    shadowColor: '#000000',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  4: {
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

export function varsThemeFor(appearance: VarsAppearance): VarsTheme {
  return appearance === 'dark' ? varsDark : varsLight;
}

export function varsSurface(theme: VarsTheme, elevation: VarsElevation): string {
  return theme.appearance === 'dark' ? darkSurfaces[elevation] : lightSurfaces[elevation];
}

export function varsElevationStyle(theme: VarsTheme, elevation: VarsElevation): ViewStyle {
  const base: ViewStyle = {
    backgroundColor: varsSurface(theme, elevation),
    borderColor: theme.color.inkFaint,
    borderWidth: elevation === 0 ? 1 : 1.5,
  };

  if (theme.appearance === 'dark') {
    return base;
  }

  return Platform.select({
    ios: { ...base, ...shadowByElevation[elevation] },
    android: { ...base, elevation: shadowByElevation[elevation].elevation ?? 0 },
    default: { ...base, ...shadowByElevation[elevation] },
  });
}
