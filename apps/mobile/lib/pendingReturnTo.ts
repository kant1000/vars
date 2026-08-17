// ============================================================
// VARS — Pending post-auth return path
// A guest can select services and tap "Book" before logging in; this is
// the single durable place that remembers where to send them once auth
// completes. AsyncStorage (not a route param) because the return path has
// to survive multiple independent redirect points (login, phone
// collection, terms acceptance, OAuth deep-link) that don't currently
// pass params to each other — same "resume from durable state" idea as
// vendorOnboarding.ts's resumeOnboardingAt, just for a booking instead of
// vendor onboarding.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'vars_pending_return_to';

export async function setPendingReturnTo(path: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, path);
  } catch {
    // Non-fatal — worst case the user lands on the tab root after auth
    // instead of back at their booking, same as today's behavior.
  }
}

export async function getPendingReturnTo(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function clearPendingReturnTo(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Non-fatal
  }
}
