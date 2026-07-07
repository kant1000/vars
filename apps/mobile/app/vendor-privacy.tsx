import React from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <Text style={s.body}>{children}</Text>;
}

function Bold({ children }: { children: string }) {
  return <Text style={s.bold}>{children}</Text>;
}

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Text style={s.backText}>← Settings</Text>
        </TouchableOpacity>
        <Text style={s.title}>Privacy Policy</Text>
        <Text style={s.updated}>Last updated: 19 June 2026</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>

        <Section title="Our approach">
          <Body>
            VARS is a Lagos home service beauty platform for stylists, barbers, hairstylists,
            makeup artists, and the customers who book them. We collect only the information we
            need to run the platform, support bookings, verify stylists, process payments, and
            keep people safer.
          </Body>
          <Body>
            Everything we collect has a specific purpose. Nothing is collected to be sold. Where
            we share your information with third parties, we name them in this policy.
          </Body>
        </Section>

        <Section title="Information we collect">
          <Body>
            We may collect your name, email address, phone number, service category, operating
            area, profile details, portfolio information, booking details, device information,
            and messages or support requests you send to us.
          </Body>
          <Body>
            For bookings, we collect the service location including the full address and structured
            access details — building name, floor, flat number, and access code. These are stored
            on the booking record and shared with the assigned stylist so they can reach you.
            Access details are visible only to the matched stylist and VARS admin.
          </Body>
          <Body>
            For stylists, VARS requires identity and liveness verification during onboarding,
            handled through Youverify. VARS does not store raw government ID documents. The
            liveness photo captured during verification becomes the stylist's locked profile
            picture.
          </Body>
        </Section>

        <Section title="How you sign in">
          <Body>
            VARS supports sign-in via email and phone number (OTP). Your phone number is used
            to verify your identity during sign-in and to deliver booking notifications.
          </Body>
        </Section>

        <Section title="Payment and verification partners">
          <Body>
            Payments are processed through <Bold>Paystack</Bold>. VARS does not store raw card
            details. Paystack receives the payment information needed to process transactions and
            protect against fraud.
          </Body>
          <Body>
            Stylist identity checks are handled through <Bold>Youverify</Bold>. Youverify receives
            the information needed to confirm identity and eligibility.
          </Body>
          <Body>
            Push notifications are delivered via <Bold>Expo</Bold>. We store one push token per
            device to send booking updates and alerts.
          </Body>
          <Body>
            WhatsApp and SMS messages are sent through <Bold>Termii</Bold>. Termii receives your
            phone number to deliver those messages.
          </Body>
          <Body>
            Transactional emails are sent through <Bold>Resend</Bold>. Resend receives your email
            address to deliver those messages.
          </Body>
        </Section>

        <Section title="Analytics and error monitoring">
          <Body>
            We use <Bold>PostHog</Bold> to understand how the app is used and <Bold>Sentry</Bold>{' '}
            to capture crash and error reports. Both providers may receive device information, app
            version, and anonymised usage data. Neither receives payment card details or identity
            documents.
          </Body>
        </Section>

        <Section title="Location data">
          <Body>
            VARS uses location to connect customers with stylists nearby, calculate any applicable
            transport surcharge, and support the safety of home service bookings.
          </Body>
          <Body>
            During an active booking — once the stylist taps "On My Way" — their live GPS position
            is shared with the customer in real time until the service is complete. The stylist's
            live position is not stored beyond what is needed to display it.
          </Body>
        </Section>

        <Section title="Portfolio photos">
          <Body>
            After a completed service, a stylist may upload a photo and request the customer's
            consent to include it in their VARS portfolio. If the customer declines, the photo is
            not published and is removed. Approved photos are displayed on the stylist's public
            VARS profile.
          </Body>
        </Section>

        <Section title="How we use information">
          <Body>
            We use information to create and manage accounts, verify stylists, process bookings,
            hold and release payments, calculate pricing including transport surcharges, deliver
            notifications, show profiles and ratings, prevent misuse, answer support requests,
            and improve VARS.
          </Body>
        </Section>

        <Section title="Who we share information with">
          <Body>
            We share information only where needed to operate VARS. This includes the payment,
            verification, notification, and analytics providers named in this policy, as well as
            our hosting providers (Supabase, Vercel) and legal or safety authorities where
            required by law.
          </Body>
        </Section>

        <Section title="Your choices">
          <Body>
            You can ask us to update, correct, or delete your information where the law allows.
            Some information may need to be kept for security, payment, dispute, legal, or
            fraud-prevention reasons.
          </Body>
        </Section>

        <Section title="Contact">
          <Body>
            For privacy questions, email{' '}
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { marginBottom: 4 },
  backText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  updated: { fontSize: 12, color: Colors.textMuted },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 60 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  body: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: 8 },
  bold: { fontWeight: '700', color: Colors.text },
  link: { color: Colors.ink, textDecorationLine: 'underline' },
});
