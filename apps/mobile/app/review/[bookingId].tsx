// ============================================================
// VARS — Leave a Review (Phase 12)
// Route: /review/[bookingId]
// One review per completed booking (UNIQUE constraint on booking_id).
// Star rating mandatory, comment optional (per spec §4.6).
// DB trigger updates vendor.avg_rating + total_reviews on insert.
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView,
  Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import { StarFilledIcon, StarEmptyIcon } from '@/components/icons';

interface BookingInfo {
  vendor_id: string;
  vendor_name: string;
  service_name: string;
}

export default function ReviewScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating]   = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('bookings')
        .select('vendor_id, service_name, vendors(full_name)')
        .eq('id', bookingId)
        .single();
      if (data) {
        setBooking({
          vendor_id: (data as any).vendor_id,
          vendor_name: (data as any).vendors?.full_name ?? 'Your stylist',
          service_name: (data as any).service_name,
        });
      }
      setLoading(false);
    })();
  }, [bookingId]);

  const submit = async () => {
    if (!user || !booking || rating === 0) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ booking_id: bookingId, rating, comment: comment.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          Alert.alert('Already reviewed', "You've already left a review for this booking.");
          router.back();
        } else {
          Alert.alert('Error', data.error ?? 'Something went wrong. Please try again.');
        }
        return;
      }
      Alert.alert(
        'Thanks for your review! ⭐',
        'Your feedback helps the VARS community find the best stylists.',
        [{ text: 'Done', onPress: () => router.replace('/(tabs)/profile') }],
      );
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View style={s.centered}><ScissorsLoader size="large" color="dark" /></View>;
  }
  if (!booking) {
    return (
      <View style={s.centered}>
        <Text style={s.errorText}>Booking not found.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.link}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Leave a review</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {/* Context */}
          <View style={s.contextCard}>
            <Text style={s.contextService}>{booking.service_name}</Text>
            <Text style={s.contextVendor}>with {booking.vendor_name}</Text>
          </View>

          {/* Star rating */}
          <Text style={s.sectionLabel}>How would you rate your experience? <Text style={s.required}>*</Text></Text>
          <View style={s.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.7}>
                {n <= rating
                  ? <StarFilledIcon size={44} color={Colors.star} />
                  : <StarEmptyIcon size={44} color={Colors.starEmpty} />
                }
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && (
            <Text style={s.ratingLabel}>
              {['', 'Poor', 'Below average', 'Good', 'Great', 'Excellent!'][rating]}
            </Text>
          )}

          {/* Comment */}
          <Text style={s.sectionLabel}>
            Tell us more <Text style={s.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={s.commentInput}
            placeholder={`What did you love about ${booking.vendor_name.split(' ')[0]}'s work?`}
            placeholderTextColor={Colors.textMuted}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={4}
            maxLength={500}
          />
          <Text style={s.charCount}>{comment.length}/500</Text>

          <View style={s.note}>
            <Text style={s.noteText}>
              Your review is public and helps other customers choose the right stylist.
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, (rating === 0 || submitting) && s.btnDisabled]}
            onPress={submit}
            disabled={rating === 0 || submitting}
            activeOpacity={0.88}
          >
            {submitting
              ? <ScissorsLoader size="small" color="light" />
              : <Text style={s.submitBtnText}>Submit review</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  errorText: { fontSize: 16, color: Colors.text, marginBottom: 12 },
  link: { fontSize: 15, color: Colors.primary, fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: Colors.ink, lineHeight: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },

  body: { padding: 20, gap: 16, paddingBottom: 60 },

  contextCard: {
    backgroundColor: Colors.surface, borderRadius: 5,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  contextService: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  contextVendor: { fontSize: 14, color: Colors.textSecondary },

  sectionLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  required: { color: Colors.error },
  optional: { fontWeight: '400', color: Colors.textMuted },

  stars: { flexDirection: 'row', gap: 12, justifyContent: 'center', paddingVertical: 8 },
  ratingLabel: { textAlign: 'center', fontSize: 15, fontWeight: '700', color: Colors.star },

  commentInput: {
    backgroundColor: Colors.surface, borderRadius: 5,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.text, minHeight: 100,
  },
  charCount: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginTop: -10 },

  note: { backgroundColor: Colors.primaryLight, borderRadius: 5, padding: 12 },
  noteText: { fontSize: 13, color: Colors.primary, lineHeight: 18 },

  submitBtn: {
    height: 56, backgroundColor: Colors.ink,
    borderRadius: 5, alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  submitBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
