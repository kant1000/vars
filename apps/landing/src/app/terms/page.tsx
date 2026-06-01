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
        <p className="legal-updated">Last updated: 1 June 2026</p>

        <section>
          <h2>What VARS is</h2>
          <p>
            VARS is a Lagos home service beauty platform that connects customers
            with independent stylists, barbers, hairstylists, and makeup artists
            who come to them. Stylist onboarding is live. Customer bookings open
            August 2026.
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
            The VARS Pioneers cohort — the first 50 stylists to register and
            verify — is now full. Pioneer benefits are permanently locked in for
            those 50 stylists: zero commission on their first 3 completed
            bookings. On Pioneer bookings, 100% of the amount charged goes to the
            stylist.
          </p>
          <p>
            After those 3 bookings, and for all non-Pioneer stylists, the standard
            platform split applies: 80% to the stylist, 20% to VARS, calculated
            on the total amount charged to the customer.
          </p>
        </section>

        <section>
          <h2>Verification and safety</h2>
          <p>
            VARS requires stylists to complete identity verification through
            Youverify before receiving bookings. A clean check means the stylist
            goes live immediately — no waiting, no manual queue. Passing
            verification does not guarantee bookings, earnings, ranking, or
            permanent access to the platform.
          </p>
          <p>
            The face on a stylist&apos;s profile is the face that passed
            verification. That is by design.
          </p>
        </section>

        <section>
          <h2>How bookings work</h2>
          <p>
            When a customer confirms a booking, their payment is authorised
            through Paystack but not yet captured. It is captured only when the
            stylist accepts. If the stylist declines or their 1-hour acceptance
            window expires, the authorisation releases automatically — no refund
            process, no delay, no friction.
          </p>
          <p>
            Once accepted, a booking moves through a fixed sequence: On My
            Way → Arrived → Service Rendered. Each step triggers a specific
            platform action — phone reveal, live location sharing, escrow
            release. Steps cannot be skipped.
          </p>
          <p>
            Fifteen minutes before the appointment, both the customer&apos;s
            and stylist&apos;s phone numbers are automatically shared with each
            other. This is a platform rule, not something either party controls
            individually.
          </p>
        </section>

        <section>
          <h2>Auto-accept</h2>
          <p>
            Stylists may configure an auto-accept zone. Within that zone,
            matching bookings are confirmed instantly without manual review.
            Customers see a clear indicator when their booking is likely to
            be auto-accepted. When auto-accept fires, the stylist is immediately
            and fully committed to that booking.
          </p>
        </section>

        <section>
          <h2>Payments and pricing</h2>
          <p>
            The price shown at booking is the total the customer pays. It
            includes the service price set by the stylist and, where applicable,
            a transport surcharge. The full amount is displayed before payment
            is confirmed — there are no hidden charges.
          </p>
          <p>
            A transport surcharge applies when the booking location is more than
            5km from the stylist&apos;s zone centre. The surcharge is ₦3,000 to
            ₦10,000 depending on distance, calculated automatically at the time
            of booking.
          </p>
          <p>
            Paystack handles all payment processing. VARS does not store raw card
            details.
          </p>
        </section>

        <section>
          <h2>Escrow and payment release</h2>
          <p>
            Payment is held in escrow after the stylist accepts the booking. It
            releases to the stylist when:
          </p>
          <ul>
            <li>the customer confirms the service is complete, or</li>
            <li>
              2 hours pass after the stylist marks &ldquo;Service Rendered&rdquo;
              without a dispute being raised.
            </li>
          </ul>
          <p>
            Customers receive a push notification 30 minutes before the
            2-hour auto-release fires. That window is the time to raise a
            dispute. Once the 2 hours pass and payment releases, it cannot be
            recalled.
          </p>
        </section>

        <section>
          <h2>Cancellation policy</h2>
          <p>Cancellation fees are calculated from the time the booking was made:</p>
          <ul>
            <li>
              <strong>0–15 minutes after booking:</strong> 15% fee. VARS retains
              10%, the stylist retains 5%. The remaining 85% is refunded.
            </li>
            <li>
              <strong>15 minutes–1 hour after booking:</strong> 50% fee. VARS
              retains 30%, the stylist retains 20%. The remaining 50% is refunded.
            </li>
            <li>
              <strong>Within 1 hour of the service start time:</strong>{' '}
              Non-refundable. VARS retains 30%, the stylist retains 70%.
            </li>
          </ul>
          <p>
            If a stylist cancels a confirmed booking, the customer receives a full
            refund with no fee applied. The stylist&apos;s cancellation record is
            tracked. Stylists who cancel 3 times within any 30-day rolling window
            are flagged for review.
          </p>
        </section>

        <section>
          <h2>Disputes</h2>
          <p>
            Customers may raise a dispute after a service is marked complete and
            before the 2-hour auto-release window closes. Disputed bookings are
            fully frozen — no funds move until VARS admin reviews and resolves the
            matter. There is no time pressure once a dispute is open.
          </p>
        </section>

        <section>
          <h2>Rescheduling</h2>
          <p>
            A stylist may propose a single reschedule per booking. The customer
            can accept or decline within a set window. If the customer declines
            or the window expires, the original booking stands.
          </p>
        </section>

        <section>
          <h2>Portfolio photos and consent</h2>
          <p>
            After a completed service, a stylist may request permission to include
            a photo from the session in their VARS portfolio. The customer receives
            a notification and can approve or decline. No photo is added to any
            public profile without explicit customer approval. Requests expire if
            not responded to.
          </p>
        </section>

        <section>
          <h2>Fair use</h2>
          <p>
            You must not use VARS to submit false information, impersonate
            another person, harass other users, circumvent platform payment rules,
            upload unlawful content, interfere with the service, or misuse
            customer or stylist information.
          </p>
        </section>

        <section>
          <h2>Availability</h2>
          <p>
            Features, supported areas, service categories, pricing, commission
            rules, and onboarding requirements may change as the platform grows.
            Where a change affects these terms materially, VARS will communicate
            it in advance.
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
