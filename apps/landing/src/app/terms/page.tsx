import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description:
    'Plain-English terms for using VARS, the Lagos home service beauty platform for independent stylists and customers.',
  alternates: {
    canonical: '/terms',
  },
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">Back to VARS</Link>
        <p className="legal-kicker">Terms of Use</p>
        <h1>Using VARS</h1>
        <p className="legal-updated">Last updated: 24 April 2026</p>

        <section>
          <h2>What VARS is</h2>
          <p>
            VARS is a pre-launch home service beauty platform for Lagos. It is
            being built to help customers book independent stylists, barbers,
            hairstylists, and makeup artists who come to them.
          </p>
          <p>
            During the current phase, VARS is focused on stylist onboarding
            through the Pioneer Programme. Customer bookings will open later.
          </p>
        </section>

        <section>
          <h2>Independent stylists</h2>
          <p>
            Stylists on VARS are independent professionals. They are not
            employees, agents, or contractors of VARS. Stylists choose the
            services they offer, the zones they cover, their availability, and
            whether to accept a booking.
          </p>
        </section>

        <section>
          <h2>Pioneer Programme</h2>
          <p>
            Pioneer spots are limited and may be reviewed before approval. VARS
            may decline, pause, or remove an application where information is
            incomplete, inaccurate, unsafe, or inconsistent with the platform.
          </p>
          <p>
            Pioneers keep 100% of their first 3 completed bookings after launch.
            After that, the standard platform split applies unless VARS states
            otherwise in writing.
          </p>
        </section>

        <section>
          <h2>Verification and safety</h2>
          <p>
            VARS may require stylists to complete identity checks, profile
            review, and other onboarding steps before receiving bookings. Passing
            verification does not guarantee bookings, earnings, ranking, or
            permanent access to the platform.
          </p>
        </section>

        <section>
          <h2>Payments</h2>
          <p>
            VARS is built with payment protection. Customers pay through the
            platform, and payment is released after the service is complete,
            subject to booking rules, dispute handling, and payment provider
            requirements.
          </p>
          <p>
            Paystack handles payment processing. VARS does not store raw card
            details.
          </p>
        </section>

        <section>
          <h2>Fair use</h2>
          <p>
            You must not use VARS to submit false information, impersonate
            another person, harass users, avoid platform payment rules, upload
            unlawful content, interfere with the service, or misuse customer or
            stylist information.
          </p>
        </section>

        <section>
          <h2>Availability</h2>
          <p>
            VARS is still preparing for launch. Features, launch dates, supported
            areas, service categories, pricing, commission rules, and onboarding
            requirements may change as the platform is tested and improved.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For questions about these terms, email{' '}
            <a href="mailto:support@bookwithvars.com">support@bookwithvars.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
