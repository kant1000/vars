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
        <Text style={s.updated}>Last updated: 13 July 2026</Text>

        <Section title="What VARS is">
          <Body>
            VARS is a marketplace connecting customers in Lagos with independent, verified
            beauty and grooming professionals who come to them. VARS is not the provider of
            beauty services: each stylist is an independent professional responsible for the
            quality and delivery of their own work.
          </Body>
        </Section>

        <Section title="Eligibility">
          <Body>
            You must be at least 18 years old to use VARS. You must be located within Lagos, or
            the platform's operating area, and have access to a valid payment card.
          </Body>
        </Section>

        <Section title="Verification and safety">
          <Body>
            Every stylist completes identity verification through Youverify, including a
            government-issued ID and a biometric liveness check, before receiving bookings. The
            face on a stylist's profile is the face that passed verification. That's by design.
          </Body>
        </Section>

        <Section title="How bookings work">
          <Body>
            When you confirm a booking, no payment is taken yet. Your stylist has one hour to
            accept. If they don't respond, the booking expires with no charge.
          </Body>
          <Body>
            Payment is captured only when your stylist commits to travel by tapping "On My Way."
            From there, bookings follow a fixed sequence: On My Way, Arrived, Service Rendered,
            and steps can't be skipped.
          </Body>
          <Body>
            Fifteen minutes before the appointment, your phone numbers are automatically shared
            with each other.
          </Body>
        </Section>

        <Section title="Card verification">
          <Body>
            First-time customers complete a one-time card verification: a non-refundable charge
            of ₦50 processed by Paystack. This confirms your card is active and stores a secure
            token for future charges. It happens once per account.
          </Body>
        </Section>

        <Section title="Payments and pricing">
          <Body>
            The price shown at booking is the total you pay. It includes the stylist's service
            price and, where applicable, a transport surcharge. There are no hidden charges. A
            transport surcharge applies when your booking location is more than 5km from the
            stylist's zone centre.
          </Body>
          <Body>Paystack handles all payment processing. VARS does not store raw card details.</Body>
        </Section>

        <Section title="Settlement">
          <Body>
            After your stylist marks the service complete, you have two hours to confirm or raise
            a dispute. If no action is taken within two hours, payment is released to the stylist
            automatically.
          </Body>
        </Section>

        <Section title="Cancellation">
          <Body>
            You can cancel at any time before your stylist commits to travel, at no charge. Once
            they're on their way and payment has been taken, cancellation isn't available. Use
            the dispute option in the app if something goes wrong at that point.
          </Body>
          <Body>
            If a stylist cancels after committing to travel, you receive a full refund
            automatically and their account is immediately restricted.
          </Body>
        </Section>

        <Section title="Disputes">
          <Body>
            You can raise a dispute from the booking detail screen after a service is marked
            complete and before the two-hour auto-release window closes. Disputed bookings are
            frozen until a VARS administrator reviews and resolves the matter. We aim to resolve
            disputes within 24 hours.
          </Body>
        </Section>

        <Section title="Rescheduling">
          <Body>
            A stylist may propose a reschedule. You have one hour to accept or decline. If you
            decline or don't respond, the booking is cancelled and you receive a full refund.
          </Body>
        </Section>

        <Section title="Auto-accept">
          <Body>
            Some stylists configure an auto-accept zone: bookings in that zone are confirmed
            instantly without manual review, with a 5-minute grace window for the stylist to
            cancel without penalty.
          </Body>
        </Section>

        <Section title="Portfolio photos and consent">
          <Body>
            After a completed service, a stylist may request your permission to include a photo
            in their VARS portfolio. You have 72 hours to approve or decline. No photo is added
            to any public profile without your explicit approval.
          </Body>
        </Section>

        <Section title="Independent stylists">
          <Body>
            Stylists on VARS are independent professionals, not employees, agents, or
            contractors of VARS. They control their own schedule, pricing, and services. VARS is
            not liable for the quality, safety, or outcome of any service delivered by a stylist,
            except where caused by our own negligence. Our total liability to you in connection
            with any booking will not exceed the amount you paid for that booking.
          </Body>
        </Section>

        <Section title="Acceptable use">
          <Body>You must not use VARS to:</Body>
          <Bullet>Provide false identity information or create accounts on behalf of others.</Bullet>
          <Bullet>Contact stylists outside the platform to bypass VARS.</Bullet>
          <Bullet>Harass, threaten, or behave abusively toward any user.</Bullet>
          <Bullet>Solicit or accept payment for a booking outside the Paystack-processed flow.</Bullet>
          <Bullet>Create multiple accounts to circumvent platform rules.</Bullet>
        </Section>

        <Section title="Changes to these terms">
          <Body>
            When we make material changes, we'll notify you via the app or by email at least 14
            days before they take effect. Continued use of VARS after that date means you accept
            the update.
          </Body>
        </Section>

        <Section title="Contact">
          <Body>
            For questions about these terms, email{' '}
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
    bulletRow: { flexDirection: 'row', marginBottom: 6, paddingLeft: 4 },
    bulletDot: { fontSize: 14, color: theme.color.inkMuted, marginRight: 8, lineHeight: 22 },
    bulletText: { flex: 1, fontSize: 14, color: theme.color.inkMuted, lineHeight: 22 },
    link: { color: theme.color.ink, textDecorationLine: 'underline' },
  });
}
