// ============================================================
// VARS — VendorOnlineContext
// Single source of truth for vendor online / busy status.
// Wraps (vendor-tabs)/_layout so all tabs share the same state.
//
// Responsibilities:
//   • Load is_online + is_busy from DB on mount and app-foreground
//   • Derive blockReason (kyc, no_services, no_notifications)
//   • Auto-offline + re-evaluate prerequisites every 2 min while online
//   • Location heartbeat every 5 min while online
//   • Expose toggleOnline() consumed by both Jobs and Profile tabs
// ============================================================
import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type VendorStatus = 'online' | 'busy' | 'offline';
type BlockReason = 'kyc' | 'no_services' | 'no_notifications' | null;

interface VendorOnlineContextValue {
  vendorStatus: VendorStatus;
  isOnline: boolean;
  isBusy: boolean;
  togglingOnline: boolean;
  blockReason: BlockReason;
  toggleError: string | null;
  toggleOnline: () => Promise<void>;
  refreshOnlineStatus: () => Promise<void>;
}

const VendorOnlineContext = createContext<VendorOnlineContextValue | null>(null);

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const LOCATION_INTERVAL_MS = 5 * 60_000;

export function VendorOnlineProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();

  const [isOnline, setIsOnline] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [blockReason, setBlockReason] = useState<BlockReason>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const vendorStatus: VendorStatus = isBusy ? 'busy' : isOnline ? 'online' : 'offline';

  const refreshOnlineStatus = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [vendorRes, svcRes, notifPerms] = await Promise.all([
      supabase
        .from('vendors')
        .select('is_online, is_busy, kyc_status')
        .eq('id', user.id)
        .single(),
      supabase
        .from('vendor_services')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', user.id)
        .eq('is_active', true),
      Notifications.getPermissionsAsync(),
    ]);

    if (!vendorRes.data) return;

    setIsOnline(vendorRes.data.is_online);
    setIsBusy(vendorRes.data.is_busy);

    let reason: BlockReason = null;
    if (vendorRes.data.kyc_status !== 'verified') reason = 'kyc';
    else if ((svcRes.count ?? 0) === 0) reason = 'no_services';
    else if (notifPerms.status !== 'granted') reason = 'no_notifications';
    setBlockReason(reason);

    // Auto-offline if a prerequisite just failed while vendor was online
    if (reason && vendorRes.data.is_online) {
      setIsOnline(false);
      await supabase.from('vendors').update({ is_online: false }).eq('id', user.id);
    }
  }, []);

  // Load on mount
  useEffect(() => { refreshOnlineStatus(); }, [refreshOnlineStatus]);

  // Re-check when app returns to foreground (catches permission changes in Settings)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshOnlineStatus();
    });
    return () => sub.remove();
  }, [refreshOnlineStatus]);

  // Poll every 2 min while online — auto-offline if prerequisites fail
  useEffect(() => {
    if (!isOnline) return;
    const id = setInterval(refreshOnlineStatus, 2 * 60_000);
    return () => clearInterval(id);
  }, [isOnline, refreshOnlineStatus]);

  // Location heartbeat every 5 min while online
  useEffect(() => {
    if (!isOnline || !session) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const sendLocation = async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await fetch(`${SUPABASE_URL}/functions/v1/vendor-update-location`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          }),
        });
      } catch {
        // Non-critical — skip silently
      }
    };

    sendLocation();
    intervalId = setInterval(sendLocation, LOCATION_INTERVAL_MS);
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [isOnline, session]);

  const toggleOnline = useCallback(async () => {
    if (!isOnline && blockReason) return;
    setTogglingOnline(true);
    setToggleError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const next = !isOnline;
      setIsOnline(next);
      const { error } = await supabase
        .from('vendors')
        .update({ is_online: next })
        .eq('id', user.id);
      if (error) {
        setIsOnline(!next);
        setToggleError("Couldn't save — tap to retry");
      }
    }
    setTogglingOnline(false);
  }, [isOnline, blockReason]);

  return (
    <VendorOnlineContext.Provider
      value={{ vendorStatus, isOnline, isBusy, togglingOnline, blockReason, toggleError, toggleOnline, refreshOnlineStatus }}
    >
      {children}
    </VendorOnlineContext.Provider>
  );
}

export function useVendorOnline(): VendorOnlineContextValue {
  const ctx = useContext(VendorOnlineContext);
  if (!ctx) throw new Error('useVendorOnline must be used inside VendorOnlineProvider');
  return ctx;
}
