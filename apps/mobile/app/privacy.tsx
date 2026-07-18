import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return <Text style={s.body}>{children}</Text>;
}

function Bold({ children }: { children: string }) {
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return <Text style={s.bold}>{children}</Text>;
}

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.updated}>Last updated: 13 July 2026</Text>

        <Section title="Our approach">
          <Body>
            VARS is a Lagos home service beauty platform connecting customers with independent
            stylists, barbers, hairstylists, and makeup artists. We collect only the information
            we need to run the platform, support bookings, process payments, and keep people
            safer.
          </Body>
          <Body>
            Everything we collect has a specific purpose. Nothing is collected to be sold. Where
            we share your information with third parties, we name them in this policy.
          </Body>
        </Section>

        <Section title="Information we collect">
          <Body>
            We collect your name and email address when you create your account, your phone
            number when you add it to your profile, and your name and email from Google or
            Facebook if you sign in that way.
          </Body>
          <Body>
            When you verify a card through Paystack, we receive a secure payment token — not your
            full card number. When you set a booking location, we collect your GPS location and
            structured access details (building name, floor, flat number, access code). Access
            details are visible only to your matched stylist and VARS admin.
          </Body>
        </Section>

        <Section title="How you sign in">
          <Body>
            VARS supports sign-in via email and password, Google, and Facebook.
          </Body>
        </Section>

        <Section title="Payment partner">
          <Body>
            Payments are processed through <Bold>Paystack</Bold>. VARS does not store raw card
            details. Paystack receives the payment information needed to process transactions and
            protect against fraud.
          </Body>
        </Section>

        <Section title="Analytics and error monitoring">
          <Body>
            We use <Bold>PostHog</Bold> to understand how the app is used and <Bold>Sentry</Bold>{' '}
            to capture crash and error reports. Both providers may receive device information, app
            version, and anonymised usage data. Neither receives payment card details.
          </Body>
        </Section>

        <Section title="Location data">
          <Body>
            VARS uses your location to connect you with stylists nearby, calculate any applicable
            transport surcharge, and support the safety of home service bookings.
          </Body>
          <Body>
            During an active booking — once your stylist taps "On My Way" — their live GPS
            position is shared with you in real time until the service is complete. Their live
            position isn't stored beyond what's needed to display it.
          </Body>
        </Section>

        <Section title="Portfolio photos">
          <Body>
            After a completed service, a stylist may upload a photo and request your consent to
            include it in their VARS portfolio. If you decline, the photo is not published and is
            removed. Approved photos are displayed on the stylist's public VARS profile.
          </Body>
        </Section>

        <Section title="How we use information">
          <Body>
            We use information to create and manage your account, process bookings, hold and
            release payments, calculate pricing including transport surcharges, deliver
            notifications, show profiles and ratings, prevent misuse, answer support requests, and
            improve VARS.
          </Body>
        </Section>

        <Section title="Who we share information with">
          <Body>
            We share information only where needed to operate VARS — the payment, analytics, and
            notification providers named in this policy, plus our hosting providers (Supabase,
            Vercel) and legal or safety authorities where required by law.
          </Body>
        </Section>

        <Section title="Your choices">
          <Body>
            You can ask us to update, correct, or delete your information where the law allows —
            see the Privacy and Data screen in your account for data export and account deletion.
            Some information may need to be kept for security, payment, dispute, legal, or
            fraud-prevention reasons.
          </Body>
        </Section>

        <Section title="Contact">
          <Body>
            For privacy questions, email{' '}
            <Text style={s.link} onPress={() => Linking.openURL('mailto:hello@bookwithvars.com')}>
              hello@bookwithvars.com
            </Text>
            .
          </Body>
        </Section>
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backText: { fontSize: 28, color: theme.color.ink, lineHeight: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.color.ink },
    updated: { fontSize: 12, color: theme.color.inkMuted, marginBottom: 16 },
    scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 },
    section: { marginTop: 24 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.color.ink, marginBottom: 8 },
    body: { fontSize: 14, color: theme.color.inkMuted, lineHeight: 22, marginBottom: 8 },
    bold: { fontWeight: '700', color: theme.color.ink },
    link: { color: theme.color.ink, textDecorationLine: 'underline' },
  });
}
