import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Delete Your Account',
  description: 'How to delete your VARS account and what happens to your data.',
  alternates: {
    canonical: '/delete-account',
  },
};

export default function DeleteAccountPage() {
  return (
    <main className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">Back to VARS</Link>
        <p className="legal-kicker">Account deletion</p>
        <h1>Delete your VARS account</h1>
        <p className="legal-updated">Last updated: 25 July 2026</p>

        <section>
          <h2>How to delete your account</h2>
          <p>Account deletion is done from inside the VARS app, for both customers and vendors:</p>
          <ol>
            <li>Open the VARS app and sign in</li>
            <li>Go to <strong>Profile</strong> (customers) or <strong>Settings</strong> (vendors)</li>
            <li>Tap <strong>Privacy and data</strong></li>
            <li>Tap <strong>Delete my account</strong></li>
            <li>Type <strong>DELETE</strong> to confirm</li>
          </ol>
        </section>

        <section>
          <h2>Before you can delete your account</h2>
          <ul>
            <li>You cannot have any bookings in progress</li>
            <li>You cannot have any open disputes</li>
            <li>If you are a vendor, all outstanding payouts must have settled</li>
          </ul>
        </section>

        <section>
          <h2>What happens when you delete your account</h2>
          <ul>
            <li>Your personal information (name, phone, photo) is permanently removed</li>
            <li>Your reviews are anonymised to &quot;VARS Customer&quot;</li>
            <li>Your booking history is kept for 6 years as required by Nigerian tax law (CITA), but your personal details are removed from it</li>
            <li>Your login is permanently disabled</li>
          </ul>
          <p>This action is permanent. There is no recovery option once your account is deleted.</p>
        </section>

        <section>
          <h2>Prefer not to delete?</h2>
          <p>
            You can simply stop using the app, your data stays safe until you return. If you
            just want a copy of your data, use <strong>Download my data</strong> in the same
            Privacy and data screen instead.
          </p>
        </section>

        <section>
          <h2>Need help?</h2>
          <p>
            If you cannot access the app to complete these steps, email{' '}
            <a href="mailto:hello@bookwithvars.com">hello@bookwithvars.com</a> from the
            email address on your account and we will process the deletion for you.
          </p>
          <p>
            For more detail on what we collect and how long we keep it, see our{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
