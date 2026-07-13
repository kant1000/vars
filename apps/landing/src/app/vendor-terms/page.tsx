import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Vendor Terms and Conditions',
  description:
    'Terms governing beauty and grooming professionals operating on the VARS platform in Lagos, including payment splits, cancellation rules, and data obligations.',
  alternates: {
    canonical: '/vendor-terms',
  },
};

export default function VendorTermsPage() {
  return (
    <main className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">Back to VARS</Link>
        <p className="legal-kicker">Vendor Terms and Conditions</p>
        <h1>Operating as a vendor on VARS</h1>
        <p className="legal-updated">Last updated: 13 July 2026</p>

        <section>
          <h2>About these terms</h2>
          <p>
            These terms govern your relationship with VARS as a vendor (beauty or
            grooming professional) operating on the platform. By completing onboarding
            or accepting a booking, you agree to these terms.
          </p>
          <p>
            &ldquo;VARS&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, and &ldquo;our&rdquo;
            refers to the entity operating the VARS platform (CAC-registered, Lagos,
            Nigeria). &ldquo;You&rdquo; and &ldquo;your&rdquo; refers to you, the vendor.
            &ldquo;Customer&rdquo; refers to the person who books your services.
          </p>
          <p>
            These terms should be read alongside the VARS Vendor Service Level Agreement,
            which sets out the operational standards you are expected to meet.
          </p>
        </section>

        <section>
          <h2>Your relationship with VARS</h2>
          <p>
            You are an independent contractor. You are not an employee, worker, agent,
            or partner of VARS. Nothing in these terms creates an employment relationship.
          </p>
          <p>This means:</p>
          <ul>
            <li>You are responsible for your own taxes, tools, products, transport, and professional insurance</li>
            <li>VARS does not provide employment benefits, holiday pay, sick pay, or pension contributions</li>
            <li>You are free to work on other platforms or independently. There is no exclusivity requirement.</li>
            <li>You control your own schedule, pricing, and service offerings within the platform&apos;s rules</li>
          </ul>
          <p>
            VARS provides the technology, payment infrastructure, identity verification,
            and dispute resolution framework.
          </p>
        </section>

        <section>
          <h2>Eligibility and onboarding</h2>
          <p>To operate on VARS, you must:</p>
          <ul>
            <li>Be at least 18 years old</li>
            <li>Be based in Lagos, Nigeria (or within the platform&apos;s operating area)</li>
            <li>
              Complete identity verification (KYC) through Youverify, including a
              government-issued ID and a biometric liveness check. You will be asked
              for explicit consent before biometric processing begins.
            </li>
            <li>Set up at least one active service with a name, category, price, and duration</li>
            <li>Verify a Nigerian bank account via Paystack for receiving payouts</li>
            <li>Grant the app permission to send push notifications (required for booking alerts)</li>
          </ul>
          <p>
            A clean KYC pass activates your account instantly with no admin review.
            A rejection will include the reason. You can reattempt; rejected cases may
            also be reviewed by VARS admin.
          </p>
        </section>

        <section>
          <h2>Your profile</h2>
          <p>
            You define your own services, each with a name (up to 60 characters),
            optional description (up to 200 characters), a category, a price (minimum
            NGN 10,000), and a duration in 30-minute blocks. You may list up to 10
            active services.
          </p>
          <p>
            Your profile photo is extracted from your KYC liveness check and locked to
            your account. You cannot change it. The photo customers see is the verified
            identity of the person who will arrive at their door.
          </p>
          <p>
            Your bio, service names, and descriptions are automatically filtered to
            remove phone numbers, email addresses, social media handles, and long digit
            sequences. Portfolio photos are scanned on your device and rejected if they
            contain visible contact information.
          </p>
        </section>

        <section>
          <h2>Going online</h2>
          <p>
            You control your visibility with an online/offline toggle. Three conditions
            must all be met before you can go online: KYC verified, at least one active
            service listed, and device notifications enabled. If any condition fails while
            you are online, you are automatically taken offline.
          </p>
        </section>

        <section>
          <h2>Bookings</h2>
          <p>
            When a customer books you, you receive a push notification and have one hour
            to accept or decline. A reminder is sent at the 30-minute mark. If you do
            not respond, the booking expires with no charge to the customer.
          </p>
          <p>
            Once you accept, you must follow the status sequence in order: On My Way,
            Arrived, Service Rendered. Steps cannot be skipped. Each step triggers
            customer notifications and the payment process depends on these transitions.
          </p>
          <p>
            The customer&apos;s access details and phone number are revealed to you 15
            minutes before the scheduled appointment. You must not store, screenshot, or
            share these details outside the app. They are provided for the specific
            booking only.
          </p>
        </section>

        <section>
          <h2>Auto-accept</h2>
          <p>
            You may configure an auto-accept zone. Bookings from customers within your
            zone are confirmed instantly. You must confirm your zone daily. You receive
            a 5-minute grace window to cancel any auto-accepted booking without penalty.
            After the grace window, standard cancellation rules apply. If you move more
            than your zone radius plus 3 km from your zone centre, auto-accept pauses
            until you return or re-confirm.
          </p>
        </section>

        <section>
          <h2>Payment</h2>
          <p>
            VARS uses a Paystack subaccount split. When you tap &ldquo;On My Way&rdquo;
            and commit to travel, the customer&apos;s card is charged. The split is:
          </p>
          <ul>
            <li><strong>Your share (80%)</strong> goes directly into your Paystack subaccount</li>
            <li><strong>VARS platform fee (20%)</strong> is retained in the VARS account</li>
          </ul>
          <p>
            If you are a Pioneer (one of the first 50 verified vendors), you receive
            100% of the payment on your first three completed bookings. After those three
            bookings, the standard 80/20 split applies. Your Pioneer badge remains
            permanently.
          </p>
          <p>
            Where a customer is more than 5 km from your zone centre, a transport
            surcharge is added to their total. Your 80% share applies to the full
            amount including the surcharge.
          </p>
          <p>
            Your earnings screen shows three buckets: <strong>Cleared</strong> (funds in
            your Paystack subaccount), <strong>Confirming</strong> (awaiting customer
            confirmation or auto-release), and <strong>Under review</strong> (disputed
            bookings). Transfer from your subaccount to your bank account is processed
            by VARS operations. VARS aims to settle regularly but does not guarantee a
            specific transfer schedule at this time.
          </p>
        </section>

        <section>
          <h2>Settlement holds</h2>
          <p>
            Your entire subaccount balance is held if you have an open dispute on any
            booking, are in restricted status, or a chargeback has been raised against a
            transaction involving you. The hold applies to all your earnings, not just
            the disputed booking, because Paystack manages holds at the subaccount level.
          </p>
        </section>

        <section>
          <h2>Cancellation</h2>
          <p>
            <strong>Before you commit to travel:</strong> You can cancel an accepted
            booking before tapping &ldquo;On My Way&rdquo;. The customer is not charged.
            Your cancellation is recorded in your rolling 30-day count. At 3 or more
            cancellations in 30 days, your account is flagged for review and may be
            temporarily suspended.
          </p>
          <p>
            <strong>After you commit to travel:</strong> If you cancel after tapping
            &ldquo;On My Way&rdquo;, the customer receives a full refund, your account is
            immediately restricted, and the refunded amount is recorded as owed by you.
            All platform functionality is blocked until you repay the owed amount and VARS
            operations lifts the restriction via the admin panel. This policy exists because
            the customer&apos;s card has already been charged based on your commitment.
          </p>
          <p>
            Auto-accepted bookings have a 5-minute grace window during which you can cancel
            without it counting toward your cancellation total.
          </p>
        </section>

        <section>
          <h2>Disputes</h2>
          <p>
            When a customer raises a dispute on your booking, you are notified immediately
            and your settlement is frozen across all bookings until the dispute is resolved.
            A VARS administrator reviews and resolves the dispute, typically within 24 hours.
            If you believe a resolution was unfair, contact hello@bookwithvars.com.
          </p>
        </section>

        <section>
          <h2>Portfolio photos and customer consent</h2>
          <p>
            You may photograph your work for portfolio use only with the customer&apos;s
            explicit consent obtained through the platform&apos;s consent flow. Submit a
            consent request via the app. The customer has 72 hours to approve or decline.
            Approved photos may be published to your portfolio. Do not photograph customers
            without their knowledge or upload photos without going through the consent flow.
          </p>
        </section>

        <section>
          <h2>Data protection obligations</h2>
          <p>You must not:</p>
          <ul>
            <li>Store, copy, or share customer personal data (phone numbers, access details, names, locations) outside the VARS app</li>
            <li>Contact customers outside the platform to arrange off-platform bookings</li>
            <li>Use customer data for marketing, solicitation, or any purpose beyond the specific booking</li>
          </ul>
          <p>
            For details on how VARS handles your personal data (including KYC records,
            earnings, and location data), see our <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </section>

        <section>
          <h2>Intellectual property</h2>
          <p>
            By listing services, uploading portfolio photos, and creating a profile on
            VARS, you grant VARS a non-exclusive, royalty-free, worldwide licence to
            display your profile, services, portfolio photos, and reviews on the platform
            and in marketing materials. This licence continues while your account is active
            and for 6 months after deletion. You retain ownership of your original content.
          </p>
        </section>

        <section>
          <h2>Suspension and removal</h2>
          <p>VARS may suspend or permanently remove your account for:</p>
          <ul>
            <li>KYC failure or revocation</li>
            <li>3 or more cancellations in a rolling 30-day period</li>
            <li>Restriction status due to a post-gate cancellation (automatic, until repayment)</li>
            <li>Sustained low ratings (below 3.5 stars averaged over your most recent 10 reviewed bookings)</li>
            <li>Breach of these terms, the Vendor SLA, or the data protection obligations above</li>
            <li>Fraud, misrepresentation, or illegal activity</li>
          </ul>
          <p>
            Where possible, we will notify you of the reason and any steps to resolve
            the issue. Permanent removal will be communicated in writing.
          </p>
        </section>

        <section>
          <h2>Limitation of liability</h2>
          <p>
            VARS provides the marketplace platform, payment infrastructure, and dispute
            resolution framework. We do not guarantee a minimum number of bookings, a
            minimum level of earnings, or continuous platform availability. Our total
            liability to you in connection with any booking or series of related bookings
            shall not exceed the platform fees retained by VARS on those bookings. Nothing
            in these terms excludes liability for fraud, wilful misconduct, or any other
            liability that cannot be excluded under Nigerian law.
          </p>
        </section>

        <section>
          <h2>Changes to these terms</h2>
          <p>
            When we make material changes, we will notify you via the app or by email at
            least 14 days before the changes take effect. Continued use of VARS after the
            effective date constitutes acceptance.
          </p>
        </section>

        <section>
          <h2>Governing law</h2>
          <p>
            These terms are governed by the laws of the Federal Republic of Nigeria. Any
            dispute arising from these terms or your use of the platform is subject to
            the exclusive jurisdiction of the courts of Lagos State.
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
