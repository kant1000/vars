// ============================================================
// VARS — Network state hook (no netinfo dependency)
// Pings Google's generate_204 endpoint; no content = online.
// Polls every 30 s when connected, every 8 s when offline.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';

const PING_URL        = 'https://www.gstatic.com/generate_204';
const ONLINE_POLL_MS  = 30_000;
const OFFLINE_POLL_MS =  8_000;
const PING_TIMEOUT_MS =  4_000;

async function pingOnline(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    await fetch(PING_URL, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return true;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

export function useNetworkState() {
  const [isOnline, setIsOnline] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    const online = await pingOnline();
    setIsOnline(online);
  }, []);

  useEffect(() => {
    check();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(check, isOnline ? ONLINE_POLL_MS : OFFLINE_POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOnline, check]);

  return { isOnline };
}
