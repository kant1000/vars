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
        <p className="legal-updated">Last updated: 24 April 2026</p>

        <section>
          <h2>Our approach</h2>
          <p>
            VARS is a Lagos home service beauty platform for stylists, barbers,
            hairstylists, makeup artists, and the customers who book them. We
            collect only the information we need to run the platform, support
            bookings, verify stylists, process payments, and keep people safer.
          </p>
        </section>

        <section>
          <h2>Information we collect</h2>
          <p>
            We may collect your name, email address, phone number, WhatsApp
            number, service category, operating area, profile details, portfolio
            information, booking details, customer location, device information,
            and messages or support requests you send to us.
          </p>
          <p>
            For stylists, VARS may also request identity and verification
            information during onboarding. Verification is handled through
            Youverify. VARS does not store raw ID documents.
          </p>
        </section>

        <section>
          <h2>Payments and verification partners</h2>
          <p>
            Payments are processed through Paystack. VARS does not store raw card
            details. Paystack may receive payment information needed to process
            transactions and protect against fraud.
          </p>
          <p>
            Stylist identity checks are handled through Youverify. Youverify may
            receive the information needed to confirm identity and eligibility.
          </p>
        </section>

        <section>
          <h2>Location data</h2>
          <p>
            VARS uses location information to help customers find available
            stylists nearby, support home service bookings, calculate travel
            expectations, and improve safety. Stylists choose their operating
            zones, and customers provide booking locations when requesting a
            service.
          </p>
        </section>

        <section>
          <h2>How we use information</h2>
          <p>
            We use information to create and manage accounts, review Pioneer
            Programme applications, verify stylists, process bookings, support
            payment protection, show profiles and ratings, prevent misuse, answer
            support requests, and improve VARS before and after launch.
          </p>
        </section>

        <section>
          <h2>Who we share information with</h2>
          <p>
            We share information only where needed to operate VARS. This may
            include payment processors, verification providers, hosting and
            analytics providers, support tools, and legal or safety authorities
            where required by law.
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
