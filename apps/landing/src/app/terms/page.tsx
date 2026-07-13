import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description:
    'Terms governing the use of VARS, the Lagos on-demand beauty and grooming marketplace, for both customers and vendors.',
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
        <p className="legal-updated">Last updated: 13 July 2026</p>

        <section>
          <h2>What VARS is</h2>
          <p>
            VARS is a marketplace connecting customers in Lagos with independent,
            verified beauty and grooming professionals who come to them. We are not
            the provider of beauty services. Each vendor is an independent professional
            responsible for the quality and delivery of their own work.
          </p>
          <p>
            &ldquo;VARS&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, and &ldquo;our&rdquo;
            refers to the entity operating the VARS platform (CAC-registered, Lagos, Nigeria).
            &ldquo;Vendor&rdquo; means an independent beauty or grooming professional.
            &ldquo;Customer&rdquo; means a person booking a service.
          </p>
        </section>

        <section>
          <h2>Eligibility</h2>
          <p>To use VARS you must be at least 18 years old.</p>
          <p>
            As a customer, you must be located in Lagos, Nigeria (or within the
            platform&apos;s operating area) and have access to a valid payment card.
          </p>
          <p>
            As a vendor, you must complete identity verification through Youverify
            before receiving bookings. A clean check means you go live instantly.
            Passing verification does not guarantee bookings, earnings, or ranking.
          </p>
        </section>

        <section>
          <h2>Verification and safety</h2>
          <p>
            All vendors complete identity verification through Youverify, including
            a government-issued ID and a biometric liveness check. The profile photo
            is extracted from the liveness check and locked to the account. The face
            on a vendor&apos;s profile is the face that passed verification.
          </p>
        </section>

        <section>
          <h2>Pioneer Programme</h2>
          <p>
            The first 50 vendors to register and verify are VARS Pioneers. Pioneers
            receive 100% of the payment on their first three completed bookings.
            After those three bookings, the standard 80/20 split applies. Pioneer
            status is permanent.
          </p>
        </section>

        <section>
          <h2>How bookings work</h2>
          <p>
            Customers browse vendors by location and service. On confirming a booking,
            no payment is taken. The vendor has one hour to accept. If the vendor does
            not respond, the booking expires with no charge.
          </p>
          <p>
            Payment is captured only when the vendor commits to travel by tapping
            &ldquo;On My Way&rdquo;. Bookings follow a fixed sequence: On My Way,
            Arrived, Service Rendered. Steps cannot be skipped.
          </p>
          <p>
            Fifteen minutes before the appointment, both parties receive each other&apos;s
            phone numbers automatically.
          </p>
        </section>

        <section>
          <h2>Card verification</h2>
          <p>
            First-time customers complete a one-time card verification: a non-refundable
            charge of NGN 50 processed by Paystack. This verifies the card is active
            and stores a secure token for future charges. It happens once per account.
          </p>
        </section>

        <section>
          <h2>Payments and pricing</h2>
          <p>
            The price shown at booking is the total the customer pays. It includes the
            vendor&apos;s service price and, where applicable, a transport surcharge.
            There are no hidden charges.
          </p>
          <p>
            A transport surcharge applies when the booking location is more than 5 km
            from the vendor&apos;s zone centre.
          </p>
          <p>
            The split on every booking is 80% to the vendor and 20% to VARS, calculated
            on the total charged. Pioneer bookings (first three per Pioneer vendor) are
            100% to the vendor.
          </p>
          <p>Paystack handles all payment processing. VARS does not store raw card details.</p>
        </section>

        <section>
          <h2>Settlement</h2>
          <p>
            After the vendor marks the service complete, the customer has two hours to
            confirm or raise a dispute. If no action is taken within two hours, payment
            is released to the vendor automatically.
          </p>
        </section>

        <section>
          <h2>Cancellation</h2>
          <p>
            Customers may cancel at any time before the vendor commits to travel, at no
            charge. Once the vendor is on their way and the payment has been taken,
            cancellation is not available. If something goes wrong at that point, use the
            dispute option in the app.
          </p>
          <p>
            If a vendor cancels after committing to travel, the customer receives a full
            refund and the vendor&apos;s account is immediately restricted. If a vendor
            cancels before committing to travel, the cancellation is recorded. Three or
            more vendor cancellations in a rolling 30-day period triggers a platform review.
          </p>
        </section>

        <section>
          <h2>Disputes</h2>
          <p>
            Customers can raise a dispute from the booking detail screen after a service
            is marked complete and before the two-hour auto-release window closes.
            Disputed bookings are frozen until a VARS administrator reviews and resolves
            the matter. VARS aims to resolve disputes within 24 hours. Unresolved
            disputes can be escalated to the Federal Competition and Consumer Protection
            Commission (FCCPC).
          </p>
        </section>

        <section>
          <h2>Rescheduling</h2>
          <p>
            A vendor may propose a reschedule. The customer has one hour to accept or
            decline. If the customer declines or does not respond, the booking is
            cancelled and the customer receives a full refund.
          </p>
        </section>

        <section>
          <h2>Auto-accept</h2>
          <p>
            Vendors may configure an auto-accept zone. Within that zone, bookings are
            confirmed instantly without manual review. Auto-accepted bookings include a
            5-minute grace window for the vendor to cancel without penalty. After that
            window, standard cancellation rules apply.
          </p>
        </section>

        <section>
          <h2>Portfolio photos and consent</h2>
          <p>
            After a completed service, a vendor may request permission to include a photo
            in their portfolio. The customer has 72 hours to approve or decline. No photo
            is added to any public profile without explicit customer approval.
          </p>
        </section>

        <section>
          <h2>Independent vendors</h2>
          <p>
            Vendors on VARS are independent professionals. They are not employees,
            agents, or contractors of VARS. They control their own schedule, pricing,
            and services. VARS is not liable for the quality, safety, or outcome of any
            service delivered by a vendor, except where caused by our own negligence.
            Our total liability to you in connection with any booking shall not exceed
            the amount you paid for that booking.
          </p>
        </section>

        <section>
          <h2>Acceptable use</h2>
          <p>You must not use VARS to:</p>
          <ul>
            <li>Provide false identity information or create accounts on behalf of others</li>
            <li>Contact vendors or customers outside the platform to bypass VARS</li>
            <li>Harass, threaten, or behave abusively toward any user</li>
            <li>Use the platform for any unlawful purpose</li>
            <li>Solicit or accept payment for a booking outside the Paystack-processed flow</li>
            <li>Create multiple accounts to circumvent platform rules or the Pioneer limit</li>
          </ul>
        </section>

        <section>
          <h2>Changes to these terms</h2>
          <p>
            When we make material changes, we will notify you via the app or by email
            at least 14 days before the changes take effect. Continued use of VARS
            after the effective date constitutes acceptance.
          </p>
        </section>

        <section>
          <h2>Governing law</h2>
          <p>
            These terms are governed by the laws of the Federal Republic of Nigeria.
            Any dispute arising from these terms or your use of the platform is subject
            to the exclusive jurisdiction of the courts of Lagos State.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Email: <a href="mailto:hello@bookwithvars.com">hello@bookwithvars.com</a>
          </p>
        </section>
      </div>
    </main>
  );
}
