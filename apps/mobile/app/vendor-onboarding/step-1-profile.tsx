// ============================================================
// VARS — Vendor Onboarding Step 1: Profile (§6.1)
// Display name, base location, bio (optional, 150 char).
// Phone and email are pre-filled and read-only — sourced from
// the vendor_leads registration and cannot be changed here.
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VarsButton, VarsInput, VarsSurface } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS, BORDER_WIDTH } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { sanitizeContent } from '@/lib/format';
import { LocationPicker, ResolvedLocation } from '@/components/LocationPicker';

export default function Step1Profile() {
  const { user } = useAuth();
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Pre-fill from vendor row — trigger copies data from vendor_leads at registration
  useEffect(() => {
    if (!user) return;
    supabase
      .from('vendors')
      .select('full_name, phone_number, email')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) setDisplayName(data.full_name);
        if (data?.phone_number) setPhone(data.phone_number);
        if (data?.email) setEmail(data.email);
      });
  }, [user]);

  // Held locally until Next, unlike the profile screen's bar which persists
  // immediately: there is no zone confirmation to invalidate during
  // onboarding, and base_location is written with the rest of the form below.
  const handleLocationConfirm = (loc: ResolvedLocation) => {
    setLocationLabel(loc.address || 'Current area');
    setLocationCoords({ lat: loc.lat, lng: loc.lng });
  };

  const handleNext = async () => {
    if (!displayName.trim()) return Alert.alert('Required', 'Please enter your display name.');
    if (!locationCoords) return Alert.alert('Required', 'Please set your base location.');
    if (!user) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('vendors')
        .update({
          full_name: displayName.trim(),
          bio: bio.trim() || null,
          base_location: `POINT(${locationCoords.lng} ${locationCoords.lat})`,
        })
        .eq('id', user.id);

      if (error) throw error;
      router.push('/vendor-onboarding/step-2-services');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Tell us about yourself.</Text>
        <Text style={styles.sub}>This is what clients will see on your profile.</Text>

        <View style={styles.form}>
          {/* Display name — editable */}
          <View>
            <VarsInput
              theme={theme}
              placeholder="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              maxLength={25}
            />
            <Text style={styles.fieldCaption}>
              This is how you'll appear to customers.
            </Text>
          </View>

          {/* Phone — read-only */}
          <View>
            <VarsSurface theme={theme} elevation={1} style={styles.lockedField}>
              <Text style={phone ? styles.lockedText : styles.lockedPlaceholder}>
                {phone || 'Phone number'}
              </Text>
              <Text style={styles.lockBadge}>Locked</Text>
            </VarsSurface>
            <Text style={styles.fieldCaption}>
              Phone used to sign in. Contact us if this needs updating.
            </Text>
          </View>

          {/* Email — read-only */}
          <View>
            <VarsSurface theme={theme} elevation={1} style={styles.lockedField}>
              <Text style={email ? styles.lockedText : styles.lockedPlaceholder}>
                {email || 'Email'}
              </Text>
              <Text style={styles.lockBadge}>Locked</Text>
            </VarsSurface>
            <Text style={styles.fieldCaption}>
              Email from your registration. Contact us if this needs updating.
            </Text>
          </View>

          {/* Base location — same control the vendor gets later on their
              profile, and the same one customers use to set theirs. */}
          <View>
            <LocationPicker
              theme={theme}
              value={locationCoords ? { ...locationCoords, address: locationLabel } : null}
              onConfirm={handleLocationConfirm}
              placeholder="Set where you work from"
              sheetTitle="Where should clients find you?"
              sheetSubtitle="This sets your place in search results and your travel fees."
            />
            <Text style={styles.locationHelper}>
              Your primary operating area.
            </Text>
          </View>

          {/* Bio — optional, 150 char max per spec §4.3 */}
          <View>
            <VarsInput
              theme={theme}
              label="Bio (optional)"
              placeholder="What makes you great?"
              value={bio}
              onChangeText={(t) => setBio(sanitizeContent(t, 150))}
              multiline
              maxLength={150}
              style={styles.bioInput}
            />
            <Text style={styles.charCount}>{bio.length}/150</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <VarsButton
          theme={theme}
          size="lg"
          loading={isLoading}
          onPress={handleNext}
          label="Continue"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
    title: { fontSize: 26, fontWeight: '700', color: theme.color.ink, marginBottom: 6 },
    sub: { fontSize: 15, color: theme.color.inkMuted, marginBottom: 20 },
    form: { gap: 12 },
    footer: {
      borderTopWidth: BORDER_WIDTH.thin, borderTopColor: theme.color.inkFaint,
      backgroundColor: theme.color.bg,
      paddingHorizontal: 24, paddingTop: 12,
    },
    lockedField: {
      height: 54, paddingHorizontal: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    lockedText: { fontSize: 16, color: theme.color.ink, flex: 1 },
    lockedPlaceholder: { fontSize: 16, color: theme.color.inkMuted, flex: 1 },
    lockBadge: {
      fontSize: 11, fontWeight: '600', color: theme.color.inkMuted,
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint, borderRadius: BORDER_RADIUS,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    fieldCaption: { fontSize: 12, color: theme.color.inkMuted, marginTop: 6, lineHeight: 16 },
    bioInput: {
      height: 90, paddingTop: 12, paddingBottom: 12, lineHeight: 20,
      textAlignVertical: 'top', includeFontPadding: false,
    },
    charCount: { fontSize: 12, color: theme.color.inkMuted, textAlign: 'right', marginTop: 4 },
    locationHelper: { fontSize: 13, color: theme.color.inkMuted, marginTop: 6, marginLeft: 4 },
  });
}
