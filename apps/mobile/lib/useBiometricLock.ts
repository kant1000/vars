import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { isBiometricLockSuspended } from './biometricLockSuspend';

const BIOMETRIC_KEY = 'vars_biometric_lock';

// Enforces the biometric-unlock preference set in vendor-settings.tsx: when enabled,
// returning to the app from the background requires Face/Touch ID before content is
// shown again. Never fires on cold launch — only on an actual background -> active
// transition — and is inert while `active` is false (during onboarding/auth).
export function useBiometricLock(active: boolean) {
  const [locked, setLocked] = useState(false);
  const appState = useRef(AppState.currentState);
  const hasBackgrounded = useRef(false);

  const attemptUnlock = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock VARS',
    });
    if (result.success) {
      setLocked(false);
    }
    // Failure or cancel: stay locked. The overlay's retry button calls this again.
  }, []);

  useEffect(() => {
    if (!active) return;

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;

      // 'inactive' is a transient state for system dialogs (permission
      // prompts, share sheets, the app switcher preview) — not a real
      // departure. Only 'background' means the app actually left the
      // foreground. Treating 'inactive' the same way fired a spurious
      // re-lock every time any system dialog appeared (confirmed live:
      // the camera permission prompt during KYC triggered it).
      if (prev === 'active' && next === 'background') {
        hasBackgrounded.current = true;
      }

      if (hasBackgrounded.current && prev !== 'active' && next === 'active') {
        if (isBiometricLockSuspended()) return;
        AsyncStorage.getItem(BIOMETRIC_KEY).then((stored) => {
          if (stored === 'true') {
            setLocked(true);
            attemptUnlock();
          }
        });
      }
    });

    return () => sub.remove();
  }, [active, attemptUnlock]);

  return { locked, retryUnlock: attemptUnlock };
}
