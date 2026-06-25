// ============================================================
// VARS — Gate checkout screen
// Shown when a first-time customer must complete payment after
// their vendor has tapped "On My Way" (gate fired).
//
// Entry points:
//   1. Push notification tap (data.screen = this route)
//   2. Bookings screen "Complete payment" banner
//
// Flow:
//   1. Fetch fresh access_code from paystack-gate-checkout
//   2. Present Paystack checkout in a WebView
//   3. On checkout exit: poll booking status for on_way
//   4. On expiry or error: show appropriate state
//
// This screen handles a live Paystack checkout — the checkout UI manages
// any bank verification the card issuer requires (3DS, OTP, etc.).
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { CloseIcon } from '@/components/icons';
import { supabase } from '@/lib/supabase';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import { fmtPrice } from '@/lib/format';
import { BOOKING_STATUS } from '@vars/shared';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

type Phase = 'loading' | 'checkout' | 'confirming' | 'cancelled' | 'expired' | 'error';

function useCountdownSecs(expiresAt: Date | null) {
  const [secs, setSecs] = useState(() =>
    expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000)) : 0
  );
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => {
      setSecs(Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return { display: `${m}:${String(s).padStart(2, '0')}`, expired: secs <= 0 };
}

export default function GateCheckoutScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('loading');
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [amountKobo, setAmountKobo] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollingRef = useRef(false);

  const { display: countdown, expired: countdownExpired } = useCountdownSecs(expiresAt);

  // Auto-expire when countdown hits zero — show expired state rather than a checkout
  // that's about to reject anyway.
  useEffect(() => {
    if (countdownExpired && (phase === 'checkout' || phase === 'cancelled')) {
      setPhase('expired');
    }
  }, [countdownExpired, phase]);

  const fetchCheckout = useCallback(async () => {
    setPhase('loading');
    setErrorMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/paystack-gate-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ booking_id: bookingId }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Already charged — booking moved to on_way; go straight to bookings
        if (res.status === 409 && data.error?.includes('already charged')) {
          router.replace('/(tabs)/bookings');
          return;
        }
        // Retry window expired
        if (res.status === 410) {
          setPhase('expired');
          return;
        }
        setErrorMsg(data.error ?? 'Could not load payment details');
        setPhase('error');
        return;
      }

      setAccessCode(data.access_code);
      setExpiresAt(new Date(data.retry_expires_at));
      setAmountKobo(data.amount_kobo);
      setPhase('checkout');
    } catch {
      setErrorMsg('Could not reach server — check your connection and try again.');
      setPhase('error');
    }
  }, [bookingId]);

  useEffect(() => { fetchCheckout(); }, [fetchCheckout]);

  // After WebView exits: poll for the booking to reach on_way (webhook fires shortly)
  const pollForOnWay = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    const MAX = 15;
    for (let i = 0; i < MAX; i++) {
      const { data } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', bookingId)
        .single();
      if (data?.status === BOOKING_STATUS.ON_WAY) {
        router.replace('/(tabs)/bookings');
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    // Webhook hasn't landed within 15s — navigate. Pass the booking ID so the
    // bookings screen shows "Confirming payment" rather than "Complete payment"
    // for this specific booking while it waits for the realtime update.
    pollingRef.current = false;
    router.replace({
      pathname: '/(tabs)/bookings',
      params: { confirming_booking_id: bookingId },
    });
  }, [bookingId]);

  const handleWebViewNav = (url: string): boolean => {
    if (url.startsWith('https://checkout.paystack.com/')) return true;
    // User cancelled or declined from within the checkout
    if (url.includes('cancel') || url.includes('declined') || url.includes('close')) {
      setPhase('cancelled');
      return false;
    }
    // Paystack's callback after successful payment — trigger polling
    if (url === 'vars://gate-payment-complete') {
      setPhase('confirming');
      pollForOnWay();
      return false;
    }
    // Any other URL (3DS bank page, issuer OTP page, etc.) — allow navigation through
    return true;
  };

  // ── Confirming ──────────────────────────────────────────────
  if (phase === 'confirming') {
    return (
      <View style={[s.container, s.centered, { paddingTop: insets.top }]}>
        <ScissorsLoader size="large" color="dark" />
        <Text style={s.confirmingTitle}>Confirming payment</Text>
        <Text style={s.confirmingBody}>
          Verifying with your bank — this only takes a moment.
        </Text>
      </View>
    );
  }

  // ── Expired ─────────────────────────────────────────────────
  if (phase === 'expired') {
    return (
      <View style={[s.container, s.centered, { paddingTop: insets.top, paddingHorizontal: 32 }]}>
        <Text style={s.expiredTitle}>Payment window closed</Text>
        <Text style={s.expiredBody}>
          The payment window for this booking has expired and the booking has been cancelled.{'\n\n'}
          You can book again whenever you're ready.
        </Text>
        <TouchableOpacity
          style={s.expiredBtn}
          onPress={() => router.replace('/(tabs)/bookings')}
        >
          <Text style={s.expiredBtnText}>Back to bookings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Error ───────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <View style={[s.container, s.centered, { paddingTop: insets.top, paddingHorizontal: 32 }]}>
        <Text style={s.errorTitle}>Something went wrong</Text>
        <Text style={s.errorBody}>{errorMsg}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={fetchCheckout}>
          <Text style={s.retryBtnText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.retryBtn, { backgroundColor: Colors.surface, marginTop: 8 }]}
          onPress={() => router.replace('/(tabs)/bookings')}
        >
          <Text style={[s.retryBtnText, { color: Colors.text }]}>Back to bookings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Loading ─────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <View style={[s.container, s.centered, { paddingTop: insets.top }]}>
        <ScissorsLoader size="large" color="dark" />
        <Text style={s.loadingText}>Loading your checkout…</Text>
      </View>
    );
  }

  // ── Cancelled (user backed out of WebView) ───────────────────
  if (phase === 'cancelled') {
    return (
      <View style={[s.container, s.centered, { paddingTop: insets.top, paddingHorizontal: 32 }]}>
        <Text style={s.cancelledTitle}>Payment cancelled</Text>
        <Text style={s.cancelledBody}>
          No charge was made.{expiresAt ? ` You have ${countdown} to complete payment before the booking is cancelled.` : ''}
        </Text>
        {!countdownExpired && (
          <TouchableOpacity style={s.retryBtn} onPress={fetchCheckout}>
            <Text style={s.retryBtnText}>
              Try again — {amountKobo > 0 ? fmtPrice(amountKobo) : ''}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.retryBtn, { backgroundColor: Colors.surface, marginTop: 8 }]}
          onPress={() => router.replace('/(tabs)/bookings')}
        >
          <Text style={[s.retryBtnText, { color: Colors.text }]}>Back to bookings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Checkout (WebView) ───────────────────────────────────────
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.headerClose}
          onPress={() => setPhase('cancelled')}
        >
          <CloseIcon size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Complete payment</Text>
          {expiresAt && (
            <Text style={[s.headerTimer, countdownExpired && { color: Colors.error }]}>
              {countdownExpired ? 'Window closed' : `${countdown} remaining`}
            </Text>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {accessCode ? (
        <WebView
          source={{ uri: `https://checkout.paystack.com/${accessCode}` }}
          onShouldStartLoadWithRequest={(req) => handleWebViewNav(req.url)}
          onError={() => {
            setErrorMsg('Could not load payment page — check your connection and try again.');
            setPhase('error');
          }}
          onHttpError={(syntheticEvent) => {
            const { statusCode } = syntheticEvent.nativeEvent;
            setErrorMsg(`Payment page returned an error (${statusCode}). Please try again.`);
            setPhase('error');
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={[s.container, s.centered]}>
              <ScissorsLoader size="large" color="dark" />
            </View>
          )}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  headerTimer: { fontSize: 12, fontWeight: '600', color: Colors.warning, marginTop: 1 },

  loadingText: { fontSize: 14, color: Colors.textSecondary, marginTop: 8 },

  confirmingTitle: {
    fontSize: 20, fontWeight: '800', color: Colors.text,
    marginTop: 20, textAlign: 'center',
  },
  confirmingBody: {
    fontSize: 14, color: Colors.textSecondary, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: 32,
  },

  expiredTitle: {
    fontSize: 22, fontWeight: '800', color: Colors.text,
    textAlign: 'center', marginBottom: 8,
  },
  expiredBody: {
    fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22,
  },
  expiredBtn: {
    marginTop: 24, backgroundColor: Colors.primary,
    borderRadius: BORDER_RADIUS, height: 52,
    alignItems: 'center', justifyContent: 'center', width: '100%',
  },
  expiredBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  cancelledTitle: {
    fontSize: 20, fontWeight: '800', color: Colors.text,
    textAlign: 'center', marginBottom: 8,
  },
  cancelledBody: {
    fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22,
  },

  retryBtn: {
    marginTop: 16, backgroundColor: Colors.primary,
    borderRadius: BORDER_RADIUS, height: 52,
    alignItems: 'center', justifyContent: 'center', width: '100%',
  },
  retryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  errorTitle: {
    fontSize: 20, fontWeight: '800', color: Colors.error,
    textAlign: 'center', marginBottom: 8,
  },
  errorBody: {
    fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22,
  },
});
