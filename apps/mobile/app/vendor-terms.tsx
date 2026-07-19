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

function Bold({ children }: { children: string }) {
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return <Text style={s.bold}>{children}</Text>;
}

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Terms of Use</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.updated}>Last updated: 24 June 2026</Text>
        <Section title="What VARS is">
          <Body>
            VARS is a Lagos home service beauty platform that connects customers with independent
            stylists, barbers, hairstylists, and makeup artists who come to them. Stylist
            onboarding is live. Customer bookings open August 2026.
          </Body>
        </Section>

        <Section title="Independent stylists">
          <Body>
            Stylists on VARS are independent professionals. They are not employees, agents, or
            contractors of VARS. Stylists choose the services they offer, the zones they cover,
            their availability, and whether to accept a booking.
          </Body>
        </Section>

        <Section title="Pioneer Programme">
          <Body>
            The VARS Pioneers cohort (the first 50 stylists to register and verify) is now full.
            Pioneer benefits are permanently locked in for those 50 stylists: zero commission on
            their first 3 completed bookings. On Pioneer bookings, 100% of the amount charged goes
            to the stylist.
          </Body>
          <Body>
            After those 3 bookings, and for all non-Pioneer stylists, the standard platform split
            applies: 80% to the stylist, 20% to VARS, calculated on the total amount charged to
            the customer.
          </Body>
        </Section>

        <Section title="Verification and safety">
          <Body>
            VARS requires stylists to complete identity verification through Youverify before
            receiving bookings. A clean check means the stylist goes live immediately: no waiting,
            no manual queue. Passing verification does not guarantee bookings, earnings, ranking,
            or permanent access to the platform.
          </Body>
          <Body>
            The face on a stylist's profile is the face that passed verification. That is by design.
          </Body>
        </Section>

        <Section title="How bookings work">
          <Body>
            When a customer confirms a booking, their payment is authorised through Paystack but
            not yet captured. It is captured only when the stylist accepts. If the stylist declines
            or their 1-hour acceptance window expires, the authorisation releases automatically:
            no refund process, no delay, no friction.
          </Body>
          <Body>
            Once accepted, a booking moves through a fixed sequence: On My Way → Arrived → Service
            Rendered. Each step triggers a specific platform action: phone reveal, live location
            sharing, and payment settlement. Steps cannot be skipped.
          </Body>
          <Body>
            Fifteen minutes before the appointment, both the customer's and stylist's phone numbers
            are automatically shared with each other. This is a platform rule, not something either
            party controls individually.
          </Body>
        </Section>

        <Section title="Auto-accept">
          <Body>
            Stylists may configure an auto-accept zone. Within that zone, matching bookings are
            confirmed instantly without manual review. When auto-accept fires, the stylist is
            immediately and fully committed to that booking.
          </Body>
        </Section>

        <Section title="Payments and pricing">
          <Body>
            The price shown at booking is the total the customer pays. It includes the service
            price set by the stylist and, where applicable, a transport surcharge. There are no
            hidden charges.
          </Body>
          <Body>
            A transport surcharge applies when the booking location is more than 5km from the
            stylist's zone centre. The surcharge is ₦3,000 to ₦10,000 depending on distance,
            calculated automatically at the time of booking.
          </Body>
          <Body>Paystack handles all payment processing. VARS does not store raw card details.</Body>
        </Section>

        <Section title="Payments and settlement">
          <Body>
            <Bold>Your payment is not taken when you book.</Bold> It is taken at the moment your
            stylist confirms they are on their way to you, not before.
          </Body>
          <Body>
            Settlement to the stylist's bank account is processed once the service is confirmed
            complete: either when you confirm, or 2 hours pass after the stylist marks "Service
            Rendered" without a dispute being raised.
          </Body>
          <Body>
            You will receive a push notification 30 minutes before the 2-hour auto-release fires.
            Once the 2 hours pass and settlement is processed, it cannot be recalled.
          </Body>
        </Section>

        <Section title="Cancellation policy">
          <Body>Your right to cancel depends on whether your stylist has already set off:</Body>
          <Bullet>
            <Bold>Before the stylist sets off:</Bold> Cancel at any time with no charge.
          </Bullet>
          <Bullet>
            <Bold>After the stylist sets off:</Bold> Cancellation is not available. Use Raise a
            dispute if something goes wrong: disputes are reviewed and a full refund issued if
            warranted.
          </Bullet>
        </Section>

        <Section title="Disputes">
          <Body>
            Customers may raise a dispute after a service is marked complete and before the 2-hour
            auto-release window closes. Disputed bookings are fully frozen until VARS admin reviews
            and resolves the matter.
          </Body>
        </Section>

        <Section title="Rescheduling">
          <Body>
            A stylist may propose a single reschedule per booking. The customer can accept or
            decline within a set window. If the customer declines or the window expires, the
            original booking stands.
          </Body>
        </Section>

        <Section title="Portfolio photos and consent">
          <Body>
            After a completed service, a stylist may request permission to include a photo in
            their VARS portfolio. The customer can approve or decline. No photo is added to any
            public profile without explicit customer approval.
          </Body>
        </Section>

        <Section title="Acceptable use">
          <Body>You must not use VARS to:</Body>
          <Bullet>Submit false information, impersonate another person, or harass other users.</Bullet>
          <Bullet>Circumvent platform payment rules, upload unlawful content, or interfere with the service.</Bullet>
          <Bullet>Solicit or accept payment for a VARS booking outside the Paystack-processed flow.</Bullet>
          <Bullet>Create multiple accounts to circumvent platform rules or the Pioneer programme limit.</Bullet>
          <Bullet>Share or request contact information before the platform reveals it automatically.</Bullet>
        </Section>

        <Section title="Availability">
          <Body>
            Features, pricing, commission rules, and onboarding requirements may change as the
            platform grows. Where a change affects these terms materially, VARS will communicate
            it in advance.
          </Body>
        </Section>

        <Section title="Contact">
          <Body>
            For questions about these terms, email{' '}
            <Text style={s.link} onPress={() => Linking.openURL('mailto:support@bookwithvars.com')}>
              support@bookwithvars.com
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
