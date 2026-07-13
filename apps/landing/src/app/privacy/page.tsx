import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How VARS collects, uses, and protects personal data for customers, vendors, and prospective vendors on the VARS platform.',
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">Back to VARS</Link>
        <p className="legal-kicker">Privacy Policy</p>
        <h1>How VARS handles your data</h1>
        <p className="legal-updated">Last updated: 13 July 2026</p>

        <section>
          <h2>Who we are</h2>
          <p>
            VARS is an on-demand beauty and grooming marketplace connecting customers
            in Lagos with verified barbers, hair stylists, makeup artists, and nail
            technicians. We are a CAC-registered entity based in Lagos, Nigeria.
          </p>
          <p>
            Data controller: VARS, Lagos, Nigeria.
            Contact: <a href="mailto:hello@bookwithvars.com">hello@bookwithvars.com</a>.
          </p>
          <p>
            This policy applies to the VARS mobile app (iOS and Android), the website
            at bookwithvars.com, and all related services.
          </p>
          <p>
            A Data Protection Officer (DPO) will be appointed. Until then, direct all
            data protection queries to hello@bookwithvars.com.
          </p>
        </section>

        <section>
          <h2>What we collect</h2>

          <h3>Customers</h3>
          <ul>
            <li>Name and email address when you create your account</li>
            <li>Phone number when you add it to your profile</li>
            <li>Name and email from Google or Facebook if you sign in that way</li>
            <li>A secure payment token when you verify a card through Paystack (not your full card number)</li>
            <li>Your GPS location when you set a booking location</li>
            <li>Access details (building name, floor, flat number, gate code) when you confirm a booking</li>
            <li>Booking history, reviews, and dispute details through your use of the platform</li>
          </ul>

          <h3>Vendors</h3>
          <ul>
            <li>Name, email address, and phone number at registration</li>
            <li>Government-issued ID and a liveness face image during identity verification through Youverify</li>
            <li>Profile photo, extracted from your KYC liveness check and locked to your account</li>
            <li>Bank account details when you set up payouts (verified via Paystack)</li>
            <li>GPS location while you are online (every 5 minutes for zone drift detection) and while en route to a booking (every 60 seconds for live tracking)</li>
            <li>Service listings, portfolio photos, earnings, and booking history</li>
          </ul>

          <h3>Prospective vendors</h3>
          <ul>
            <li>Name, email address, phone number, and service type when you register interest on our website</li>
          </ul>

          <p>
            We do not collect data from anyone under 18. We do not use advertising
            identifiers or third-party tracking for marketing purposes. The mobile
            app uses Sentry for crash reporting and PostHog as an analytics
            provider; both are configured to minimise data collection (crash
            reports only; screen capture is disabled). For full details, see our{' '}
            <Link href="/cookie-policy">Cookie and Tracking Policy</Link>.
          </p>
        </section>

        <section>
          <h2>Why we collect it</h2>
          <p>
            Nigerian data protection law (NDPA 2023) requires a lawful basis for
            every type of processing. Here is how ours maps:
          </p>
          <ul>
            <li><strong>Creating and managing your account</strong> — contract</li>
            <li><strong>Processing bookings, payments, and refunds</strong> — contract</li>
            <li><strong>Vendor identity verification (KYC), including biometric data</strong> — explicit consent plus legal obligation</li>
            <li><strong>Verifying vendor bank accounts for payouts</strong> — contract</li>
            <li><strong>Location-based vendor discovery</strong> — legitimate interest (core platform function)</li>
            <li><strong>Live vendor tracking while en route to a booking</strong> — contract</li>
            <li><strong>Booking confirmations, reminders, and status updates</strong> — contract</li>
            <li><strong>Dispute resolution</strong> — contract and legitimate interest</li>
            <li><strong>Lead outreach to prospective vendors</strong> — consent plus legitimate interest</li>
            <li><strong>Fraud prevention and platform enforcement</strong> — legitimate interest</li>
          </ul>
          <p>
            Where we rely on consent, you can withdraw it at any time (see &ldquo;Your rights&rdquo; below).
          </p>
        </section>

        <section>
          <h2>Who we share your data with</h2>
          <p>We share your data only with parties necessary to deliver the service. We never sell your data.</p>

          <h3>Between customers and vendors</h3>
          <p>
            When a booking is confirmed, the customer sees the vendor&apos;s name,
            photo, bio, services, and ratings. The vendor sees the customer&apos;s
            first name and service requested. Fifteen minutes before the appointment,
            both parties receive each other&apos;s phone number and the vendor receives
            the customer&apos;s access details. While the vendor is en route, the
            customer sees the vendor&apos;s live location on a map.
          </p>

          <h3>Service providers</h3>
          <ul>
            <li>
              <strong>Supabase</strong> — database hosting, authentication, file storage,
              and edge functions (United States and European Union)
            </li>
            <li>
              <strong>Paystack</strong> — payment processing, card verification, vendor
              bank verification, and settlement (Nigeria)
            </li>
            <li>
              <strong>Youverify</strong> — vendor identity verification including
              biometric liveness check (Nigeria)
            </li>
            <li>
              <strong>Resend</strong> — email delivery (United States)
            </li>
            <li>
              <strong>360dialog</strong> — WhatsApp message delivery (European Union)
            </li>
            <li>
              <strong>Expo</strong> — push notification delivery via Apple APNs and
              Google FCM (United States)
            </li>
            <li>
              <strong>Google</strong> — sign-in (United States)
            </li>
            <li>
              <strong>Facebook / Meta</strong> — sign-in (United States)
            </li>
            <li>
              <strong>Apple</strong> — sign-in and push notification delivery (United States)
            </li>
            <li>
              <strong>Vercel</strong> — website and admin panel hosting (United States)
            </li>
            <li>
              <strong>Sentry</strong> — crash reporting and error monitoring in the
              mobile app (United States / EU). Enabled in production only. Collects
              stack traces and device context; no personal identifiers are explicitly
              sent.
            </li>
            <li>
              <strong>PostHog</strong> — analytics provider in the mobile app
              (European Union, eu.i.posthog.com). Automatic event capture is disabled.
              No screen recordings or personally identifiable events are collected.
            </li>
          </ul>
          <p>
            Each provider processes data under contract and only for the purposes stated.
            We disclose data to legal or regulatory authorities when required by Nigerian
            law or court order.
          </p>
        </section>

        <section>
          <h2>International transfers</h2>
          <p>
            Several of our service providers operate outside Nigeria. When your data
            is transferred internationally, we protect it through data processing
            agreements with each provider, transfer impact assessments where required,
            and standard contractual safeguards consistent with NDPC guidance.
          </p>
        </section>

        <section>
          <h2>How long we keep your data</h2>
          <ul>
            <li>Customer and vendor account data: life of account plus 6 months after deletion</li>
            <li>KYC records (ID documents and face images): 5 years after the end of the vendor relationship, as required by anti-money laundering law</li>
            <li>Booking records and payment history: 6 years, as required by Nigerian tax law (CITA)</li>
            <li>Payout and settlement records: 6 years</li>
            <li>Dispute records: 6 years</li>
            <li>Booking access details (building, floor, flat, gate code): deleted 30 days after booking completion or cancellation</li>
            <li>Vendor GPS location: ephemeral; overwritten on each update, never stored as a historical trail</li>
            <li>Reviews: life of the platform; anonymised to &quot;VARS Customer&quot; if you delete your account</li>
            <li>Unconverted vendor leads: 24 months from last contact, then deleted</li>
          </ul>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>Under the NDPA 2023, you have the following rights over your personal data:</p>
          <ul>
            <li><strong>Access</strong> — request a copy of the data we hold about you</li>
            <li><strong>Rectification</strong> — ask us to correct inaccurate or incomplete data</li>
            <li>
              <strong>Erasure</strong> — ask us to delete your data; we will comply
              unless a legal obligation requires retention (for example, KYC records
              for 5 years, financial records for 6 years)
            </li>
            <li><strong>Restriction</strong> — ask us to limit processing while a concern is being resolved</li>
            <li><strong>Portability</strong> — request your data in a structured, machine-readable format</li>
            <li><strong>Objection</strong> — object to processing based on legitimate interest</li>
            <li>
              <strong>Withdraw consent</strong> — where processing relies on your consent,
              you can withdraw it at any time; withdrawal does not affect processing that
              already took place
            </li>
          </ul>
          <p>
            To exercise any of these rights, email{' '}
            <a href="mailto:hello@bookwithvars.com">hello@bookwithvars.com</a> with
            enough detail to verify your identity. We will respond within 30 days.
          </p>
          <p>
            To unsubscribe from marketing emails, use the unsubscribe link in any
            email we send.
          </p>
          <p>
            If you are not satisfied with our response, you have the right to lodge
            a complaint with the Nigeria Data Protection Commission (NDPC) at{' '}
            <a href="https://ndpc.gov.ng" target="_blank" rel="noopener noreferrer">ndpc.gov.ng</a>.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            Our security measures include encryption in transit (TLS) and at rest,
            row-level security policies ensuring users can only access their own data,
            hashed passwords, HMAC-authenticated webhooks for payment and KYC
            callbacks, and access controls limiting each role to the minimum access
            needed. Service keys are server-side only and never exposed in client-side
            code.
          </p>
          <p>
            If you believe your account has been compromised, contact us immediately
            at <a href="mailto:hello@bookwithvars.com">hello@bookwithvars.com</a>.
          </p>
        </section>

        <section>
          <h2>Cookies and tracking</h2>
          <p>
            The VARS website uses only strictly necessary cookies. We do not use
            advertising cookies or cross-site tracking on the website.
          </p>
          <p>
            The VARS mobile app uses Sentry (crash reporting) and PostHog
            (analytics) as described in the service providers section above.
            Neither tool is used for advertising or selling data. For full
            details, see our <Link href="/cookie-policy">Cookie and Tracking Policy</Link>.
          </p>
        </section>

        <section>
          <h2>Changes to this policy</h2>
          <p>
            When we make material changes, we will notify you via the app or by email
            before the changes take effect. The &quot;Last updated&quot; date at the
            top reflects the most recent version. Continued use of VARS after a policy
            update constitutes acceptance.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Email: <a href="mailto:hello@bookwithvars.com">hello@bookwithvars.com</a>
          </p>
          <p>
            DPO contact details will be published here once appointed.
          </p>
        </section>
      </div>
    </main>
  );
}
