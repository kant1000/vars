import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VarsAppearance, VarsTheme, varsThemeFor } from '@/constants/visualSystem';

export type VarsAppearanceOverride = 'system' | VarsAppearance;

const STORAGE_KEY = 'vars_appearance_override';

interface ThemeContextValue {
  /** Resolved appearance actually in use — 'system' is never exposed here. */
  appearance: VarsAppearance;
  /** What the user picked — drives the settings UI. */
  override: VarsAppearanceOverride;
  setOverride: (value: VarsAppearanceOverride) => void;
  theme: VarsTheme;
  /** True once the persisted override has been read from AsyncStorage. */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  appearance: 'light',
  override: 'system',
  setOverride: () => {},
  theme: varsThemeFor('light'),
  ready: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [override, setOverrideState] = useState<VarsAppearanceOverride>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setOverrideState(stored);
      }
      setReady(true);
    });
  }, []);

  const setOverride = useCallback((value: VarsAppearanceOverride) => {
    setOverrideState(value);
    AsyncStorage.setItem(STORAGE_KEY, value).catch(() => {});
  }, []);

  const appearance: VarsAppearance = override === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : override;

  return (
    <ThemeContext.Provider value={{ appearance, override, setOverride, theme: varsThemeFor(appearance), ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useVarsTheme() {
  return useContext(ThemeContext);
}
