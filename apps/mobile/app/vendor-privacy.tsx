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

function Bullet({ children }: { children: React.ReactNode }) {
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
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
        <Text style={s.updated}>Last updated: 31 July 2026</Text>

        <Section title="Who we are">
          <Body>
            VARS is a Lagos home service beauty platform for stylists, barbers, hairstylists,
            makeup artists, and the customers who book them. We are a CAC-registered entity based
            in Lagos, Nigeria, and we process your personal data under the Nigeria Data Protection
            Act 2023 (NDPA).
          </Body>
          <Body>
            Data controller: VARS, Lagos, Nigeria. Contact: <Bold>hello@bookwithvars.com</Bold>.
          </Body>
          <Body>
            VARS has appointed a Data Protection Officer. Data protection queries can be directed
            to hello@bookwithvars.com.
          </Body>
          <Body>We do not collect data from anyone under 18.</Body>
        </Section>

        <Section title="Information we collect">
          <Bullet>Name, email address, and phone number at registration</Bullet>
          <Bullet>A liveness face image captured during identity verification through Youverify, used to confirm your identity. VARS does not store your government-issued ID document; it is referenced by Youverify during the check only. VARS retains just the liveness image and the verification result</Bullet>
          <Bullet>A profile photo, cropped from your liveness image and locked to your account</Bullet>
          <Bullet>Bank account details when you set up payouts, verified via Paystack</Bullet>
          <Bullet>GPS location while you are online, every 5 minutes for zone drift detection, and while en route to a booking for live tracking. Never stored as a historical trail, overwritten on each update</Bullet>
          <Bullet>Service listings, portfolio photos, earnings, and booking history</Bullet>
          <Bullet>Your rolling cancellation record, used for fraud prevention and platform enforcement</Bullet>
        </Section>

        <Section title="How you sign in">
          <Body>
            VARS supports sign-in via email (OTP). Phone number sign-in is not yet available.
          </Body>
        </Section>

        <Section title="Why we collect it">
          <Body>
            Nigerian data protection law (NDPA 2023) requires a lawful basis for every type of
            processing. Here is how ours maps:
          </Body>
          <Bullet><Bold>Creating and managing your vendor account</Bold> — contract</Bullet>
          <Bullet><Bold>Identity verification (KYC), including biometric liveness data</Bold> — explicit consent plus legal obligation</Bullet>
          <Bullet><Bold>Verifying your bank account for payouts</Bold> — contract</Bullet>
          <Bullet><Bold>Zone-based location monitoring and live tracking while en route to a booking</Bold> — contract</Bullet>
          <Bullet><Bold>Processing bookings and payouts</Bold> — contract</Bullet>
          <Bullet><Bold>Dispute resolution</Bold> — contract and legitimate interest</Bullet>
          <Bullet><Bold>Fraud prevention and platform enforcement</Bold> — legitimate interest</Bullet>
          <Bullet><Bold>Outreach to you before you completed onboarding</Bold> — consent plus legitimate interest</Bullet>
          <Body>
            Where we rely on consent, you can withdraw it at any time (see &ldquo;Your rights&rdquo; below).
          </Body>
        </Section>

        <Section title="Portfolio photos">
          <Body>
            After a completed service, you may upload a photo and request the customer&apos;s
            consent to include it in your VARS portfolio. If the customer declines, the photo is
            not published and is removed. Approved photos are displayed on your public VARS
            profile.
          </Body>
        </Section>

        <Section title="Who we share information with">
          <Bullet><Bold>Supabase</Bold> — database hosting, authentication, file storage, and edge functions (United States and European Union)</Bullet>
          <Bullet><Bold>Paystack</Bold> — bank verification and payouts (Nigeria)</Bullet>
          <Bullet><Bold>Youverify</Bold> — identity verification, including biometric liveness check (Nigeria)</Bullet>
          <Bullet><Bold>Resend</Bold> — transactional email delivery (United States)</Bullet>
          <Bullet><Bold>360dialog</Bold> — WhatsApp message delivery (European Union)</Bullet>
          <Bullet><Bold>Expo</Bold> — push notification delivery via Apple APNs and Google FCM (United States)</Bullet>
          <Bullet><Bold>Apple</Bold> — push notification delivery via APNs (United States)</Bullet>
          <Bullet><Bold>Vercel</Bold> — website and admin panel hosting (United States)</Bullet>
          <Bullet><Bold>Sentry</Bold> — crash reporting and error monitoring (United States / EU)</Bullet>
          <Bullet><Bold>PostHog</Bold> — analytics (European Union)</Bullet>
          <Body>We never sell your data. Each provider processes data under contract and only for the purposes stated.</Body>
        </Section>

        <Section title="International transfers">
          <Body>
            Several of our service providers operate outside Nigeria. When your data is
            transferred internationally, we protect it through data processing agreements with
            each provider and safeguards consistent with NDPC guidance.
          </Body>
        </Section>

        <Section title="How long we keep your data">
          <Bullet>Vendor account data: your name, contact details, and photo are anonymised immediately when you delete your account. Records we are required by law to keep, such as KYC and payout history below, are retained for their stated periods regardless of deletion</Bullet>
          <Bullet>KYC records (liveness image and verification result): 5 years after the end of the vendor relationship, as required by anti-money laundering law</Bullet>
          <Bullet>Booking records and payout history: 6 years, as required by Nigerian tax law (CITA)</Bullet>
          <Bullet>Dispute records: 6 years</Bullet>
          <Bullet>GPS location: ephemeral, overwritten on each update, never stored as a historical trail</Bullet>
        </Section>

        <Section title="Your rights">
          <Body>Under the NDPA 2023, you have the following rights over your personal data:</Body>
          <Bullet><Bold>Access</Bold> — request a copy of the data we hold about you</Bullet>
          <Bullet><Bold>Rectification</Bold> — ask us to correct inaccurate or incomplete data</Bullet>
          <Bullet><Bold>Erasure</Bold> — ask us to delete your data, unless a legal obligation requires retention, for example KYC records for 5 years or financial records for 6 years</Bullet>
          <Bullet><Bold>Restriction</Bold> — ask us to limit processing while a concern is being resolved</Bullet>
          <Bullet><Bold>Portability</Bold> — request your data in a structured, machine-readable format</Bullet>
          <Bullet><Bold>Objection</Bold> — object to processing based on legitimate interest</Bullet>
          <Bullet><Bold>Withdraw consent</Bold> — where processing relies on your consent, withdraw it at any time</Bullet>
          <Body>
            Use the Privacy and data screen in your account to export your data or delete your
            account, or email hello@bookwithvars.com. We will respond within 30 days.
          </Body>
          <Body>
            If you are not satisfied with our response, you can lodge a complaint with the
            Nigeria Data Protection Commission (NDPC) at ndpc.gov.ng.
          </Body>
        </Section>

        <Section title="Security">
          <Body>
            Our security measures include encryption in transit and at rest, row-level security
            policies so you can only access your own data, hashed passwords, HMAC-authenticated
            verification webhooks, and access controls limiting each role to the minimum access
            needed. Your liveness images are stored in a private, access-restricted file store,
            never a public one.
          </Body>
        </Section>

        <Section title="Analytics and error monitoring">
          <Body>
            We use <Bold>PostHog</Bold> to understand how the app is used and <Bold>Sentry</Bold>{' '}
            to capture crash and error reports. Both providers may receive device information, app
            version, and anonymised usage data. Neither receives payment card details or identity
            documents. We do not use advertising trackers and we do not sell your data.
          </Body>
        </Section>

        <Section title="Changes to this policy">
          <Body>
            When we make material changes, we will notify you via the app before the changes take
            effect. Continued use of VARS after a policy update constitutes acceptance.
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
    bulletRow: { flexDirection: 'row', marginBottom: 6, paddingLeft: 4 },
    bulletDot: { fontSize: 14, color: theme.color.inkMuted, marginRight: 8, lineHeight: 22 },
    bulletText: { flex: 1, fontSize: 14, color: theme.color.inkMuted, lineHeight: 22 },
    link: { color: theme.color.ink, textDecorationLine: 'underline' },
  });
}
