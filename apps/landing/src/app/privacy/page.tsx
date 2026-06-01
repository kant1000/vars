import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How VARS handles personal information for Lagos stylists and customers, including phone numbers, location data, payments, and stylist verification.',
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
        <h1>How VARS handles your information</h1>
        <p className="legal-updated">Last updated: 1 June 2026</p>

        <section>
          <h2>Our approach</h2>
          <p>
            VARS is a Lagos home service beauty platform for stylists, barbers,
            hairstylists, makeup artists, and the customers who book them. We
            collect only the information we need to run the platform, support
            bookings, verify stylists, process payments, and keep people safer.
          </p>
          <p>
            Everything we collect has a specific purpose. Nothing is collected
            to be sold. Where we share your information with third parties, we
            name them in this policy.
          </p>
        </section>

        <section>
          <h2>Information we collect</h2>
          <p>
            We may collect your name, email address, phone number, service
            category, operating area, profile details, portfolio information,
            booking details, device information, and messages or support requests
            you send to us.
          </p>
          <p>
            For bookings, we collect the service location including the full
            address and structured access details — building name, floor, flat
            number, and access code. These are stored on the booking record and
            shared with the assigned stylist so they can reach you. Access
            details are visible only to the matched stylist and VARS admin.
          </p>
          <p>
            For stylists, VARS requires identity and liveness verification during
            onboarding, handled through Youverify. VARS does not store raw
            government ID documents. The liveness photo captured during
            verification becomes the stylist&apos;s locked profile picture — the
            face on a VARS profile is the face that passed the check.
          </p>
        </section>

        <section>
          <h2>How you sign in</h2>
          <p>
            VARS supports three sign-in methods: Google, Facebook, and email.
            When you sign in with Google or Facebook, those providers
            authenticate your identity and share your name and email address
            with VARS. Your phone number is collected separately as a plain text
            field after login.
          </p>
        </section>

        <section>
          <h2>Payment and verification partners</h2>
          <p>
            Payments are processed through <strong>Paystack</strong>. VARS does
            not store raw card details. Paystack receives the payment information
            needed to process transactions and protect against fraud.
          </p>
          <p>
            Stylist identity checks are handled through <strong>Youverify</strong>.
            Youverify receives the information needed to confirm identity and
            eligibility.
          </p>
          <p>
            Push notifications are delivered via <strong>Expo</strong>. We store
            one push token per device to send booking updates and alerts. Expo
            receives that token to route notifications to your device.
          </p>
          <p>
            WhatsApp and SMS messages are sent through <strong>Termii</strong>.
            Termii receives your phone number to deliver those messages.
          </p>
          <p>
            Transactional emails — booking confirmations, settlement receipts,
            and similar — are sent through <strong>Resend</strong>. Resend
            receives your email address to deliver those messages.
          </p>
        </section>

        <section>
          <h2>Analytics and error monitoring</h2>
          <p>
            We use <strong>PostHog</strong> to understand how the app is used —
            which screens are visited, where sessions drop off, and how features
            perform. We use <strong>Sentry</strong> to capture crash and error
            reports so we can identify and fix problems quickly. Both providers
            may receive device information, app version, and anonymised usage
            data. Neither receives payment card details or identity documents.
          </p>
        </section>

        <section>
          <h2>Location data</h2>
          <p>
            VARS uses location to connect customers with stylists nearby,
            calculate any applicable transport surcharge, and support the safety
            of home service bookings.
          </p>
          <p>
            Stylists choose and confirm their operating zone. During an active
            booking — once the stylist taps &ldquo;On My Way&rdquo; — their live
            GPS position is shared with the customer in real time until the
            service is complete. This is how customers know their stylist is
            on the way and when to expect them. The stylist&apos;s live position
            is not stored beyond what is needed to display it.
          </p>
          <p>
            Customers set their booking location before confirming a service.
            The exact coordinates and address are stored on the booking record
            and used to calculate any transport surcharge and to guide the stylist
            to the right place.
          </p>
        </section>

        <section>
          <h2>Portfolio photos</h2>
          <p>
            After a completed service, a stylist may upload a photo and request
            the customer&apos;s consent to include it in their VARS portfolio.
            The photo is held privately until consent is granted. If the customer
            declines or does not respond, the photo is not published. Approved
            photos are displayed on the stylist&apos;s public VARS profile.
          </p>
        </section>

        <section>
          <h2>How we use information</h2>
          <p>
            We use information to create and manage accounts, verify stylists,
            process bookings, hold and release payments, calculate pricing
            including transport surcharges, deliver notifications, show profiles
            and ratings, prevent misuse, answer support requests, and improve
            VARS.
          </p>
        </section>

        <section>
          <h2>Who we share information with</h2>
          <p>
            We share information only where needed to operate VARS. This includes
            the payment, verification, notification, and analytics providers
            named in this policy, as well as our hosting providers (Supabase,
            Vercel) and legal or safety authorities where required by law.
          </p>
        </section>

        <section>
          <h2>Your choices</h2>
          <p>
            You can ask us to update, correct, or delete your information where
            the law allows. Some information may need to be kept for security,
            payment, dispute, legal, or fraud-prevention reasons.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For privacy questions, email{' '}
            <a href="mailto:support@bookwithvars.com">support@bookwithvars.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
