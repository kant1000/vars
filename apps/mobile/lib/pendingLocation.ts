// ============================================================
// VARS — Pending guest location
// A guest can confirm a search location on the Discover tab before logging
// in — but profiles.session_location has no row to attach to yet (no
// account exists), so that confirmation only ever lived in the Discover
// screen's component state and evaporated the moment they navigated into
// the login flow. This is the durable bridge: stash it locally, then
// migrate it into profiles.session_location the moment a real account
// exists, before anything reads get_my_session_location() for the first
// time. Same "resume from durable state across the login detour" idea as
// pendingReturnTo.ts, just for a location instead of a route.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const KEY = 'vars_pending_location';

export interface PendingLocation {
  lat: number;
  lng: number;
  address: string;
}

export async function setPendingLocation(loc: PendingLocation): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(loc));
  } catch {
    // Non-fatal — worst case they lose the pre-login location, same as
    // today's behavior.
  }
}

async function getPendingLocation(): Promise<PendingLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingLocation) : null;
  } catch {
    return null;
  }
}

async function clearPendingLocation(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Non-fatal
  }
}

/**
 * Call as soon as a userId is known (post-login/signup), before reading
 * get_my_session_location() for the first time. Returns the migrated
 * location so the caller can use it immediately without a second round
 * trip, or null if there was nothing pending.
 */
export async function migratePendingLocation(userId: string): Promise<PendingLocation | null> {
  const pending = await getPendingLocation();
  if (!pending) return null;
  const { error } = await supabase
    .from('profiles')
    .update({ session_location: `POINT(${pending.lng} ${pending.lat})` })
    .eq('id', userId);
  if (!error) await clearPendingLocation();
  return pending;
}
