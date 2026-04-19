// ============================================================
// VARS — AsyncStorage TTL cache
// Keys are namespaced under "vars_cache_" to avoid collisions.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Entry<T> {
  data: T;
  expiresAt: number;
}

function key(k: string) {
  return `vars_cache_${k}`;
}

export async function cacheSet<T>(cacheKey: string, data: T, ttlMs: number): Promise<void> {
  const entry: Entry<T> = { data, expiresAt: Date.now() + ttlMs };
  await AsyncStorage.setItem(key(cacheKey), JSON.stringify(entry));
}

/** Returns cached data if still fresh, null if stale or missing. */
export async function cacheGet<T>(cacheKey: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key(cacheKey));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    return Date.now() < entry.expiresAt ? entry.data : null;
  } catch {
    return null;
  }
}

export async function cacheInvalidate(cacheKey: string): Promise<void> {
  await AsyncStorage.removeItem(key(cacheKey));
}
