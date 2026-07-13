import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Cookie and Tracking Policy',
  description:
    'VARS uses only strictly necessary cookies and local storage. No analytics, no advertising cookies, no third-party tracking.',
  alternates: {
    canonical: '/cookie-policy',
  },
};

export default function CookiePolicyPage() {
  return (
    <main className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">Back to VARS</Link>
        <p className="legal-kicker">Cookie and Tracking Policy</p>
        <h1>Cookies and tracking on VARS</h1>
        <p className="legal-updated">Last updated: 13 July 2026</p>

        <section>
          <h2>The short version</h2>
          <p>
            VARS does not use advertising cookies, analytics trackers, or marketing
            pixels. We do not track you across websites. We do not sell or share your
            browsing data with third parties. The only cookies and local storage we use
            are strictly necessary to make the service work.
          </p>
        </section>

        <section>
          <h2>What we use on the website</h2>
          <p>
            On bookwithvars.com, two types of storage are set:
          </p>
          <ul>
            <li>
              <strong>Supabase Auth cookie</strong> — maintains your login session if
              you sign in via the admin panel. Not set for public visitors. Cleared on
              logout or browser close.
            </li>
            <li>
              <strong>Vercel deployment cookie</strong> — a standard hosting cookie set
              by Vercel for load balancing and security. Contains no personal data.
              Cleared on browser close.
            </li>
          </ul>
          <p>
            That is the complete list. No Google Analytics, no Meta Pixel, no Hotjar,
            no advertising tags, no fingerprinting scripts.
          </p>
        </section>

        <section>
          <h2>What we use in the mobile app</h2>
          <p>
            The mobile app does not use browser cookies. It uses the following local
            storage mechanisms:
          </p>
          <ul>
            <li>
              <strong>Supabase Auth token</strong> — maintains your logged-in session.
              Stored securely via the device keychain (iOS) or SecureStore (Android).
            </li>
            <li>
              <strong>AsyncStorage (local cache)</strong> — caches non-sensitive app
              data such as the last viewed screen and UI preferences to improve
              performance and provide basic offline resilience. No personally
              identifiable information is transmitted from this cache. Data stays on
              your device.
            </li>
            <li>
              <strong>Expo Push Token</strong> — a device-specific token registered
              with Apple (APNs) or Google (FCM) to deliver push notifications you have
              opted into. The token identifies your device, not you personally. You can
              revoke it at any time by disabling notifications in your device settings.
            </li>
          </ul>
          <p>
            The app also uses:
          </p>
          <ul>
            <li>
              <strong>Sentry</strong> — crash reporting and error monitoring.
              When the app crashes in production, Sentry captures the stack trace
              and device context (OS version, app version, memory state) and
              sends it to Sentry&apos;s servers. No personal identifiers are
              explicitly included. Enabled in production only (disabled in
              development). Sentry servers: United States and EU.
            </li>
            <li>
              <strong>PostHog</strong> — analytics provider. The PostHog SDK is
              initialised but automatic event capture is disabled. No screens,
              taps, or personal identifiers are automatically sent. PostHog is
              configured to use the EU endpoint (eu.i.posthog.com). No data
              is sent to PostHog unless an explicit tracking call is made in code.
            </li>
          </ul>
          <p>
            Neither Sentry nor PostHog is used for advertising, retargeting,
            or selling data. They are infrastructure tools used to maintain
            app quality and understand usage patterns.
          </p>
        </section>

        <section>
          <h2>What we do not use</h2>
          <p>VARS does not use:</p>
          <ul>
            <li>Advertising or retargeting cookies</li>
            <li>Social media tracking pixels</li>
            <li>Third-party analytics on the website (Google Analytics, Mixpanel, Amplitude, and others)</li>
            <li>Heatmap or session recording tools</li>
            <li>Cross-device tracking or fingerprinting</li>
          </ul>
          <p>
            The mobile app uses Sentry and PostHog as described above. These
            are the only third-party data processors active in the app.
          </p>
        </section>

        <section>
          <h2>Your choices</h2>
          <p>
            On the website, only strictly necessary cookies are set. There is nothing
            optional to accept or reject.
          </p>
          <p>
            In the mobile app, Sentry crash reporting and PostHog analytics are active
            in production. These cannot currently be disabled per-user within the app.
            If you wish to opt out, you can delete the app. We will add per-user opt-out
            controls in a future release.
          </p>
          <p>
            <strong>On the website:</strong> Your browser settings allow you to block
            or delete cookies at any time. Blocking the Supabase Auth cookie will
            prevent you from staying logged in but will not affect your ability to
            browse the public site.
          </p>
          <p>
            <strong>On the mobile app:</strong> You can clear the app&apos;s local
            storage by uninstalling and reinstalling the app. You can disable push
            notifications at any time in your device settings (Settings &gt; Notifications
            &gt; VARS on iOS; Settings &gt; Apps &gt; VARS &gt; Notifications on Android).
            Disabling notifications revokes the Expo Push Token.
          </p>
        </section>

        <section>
          <h2>If this changes</h2>
          <p>
            If VARS introduces any non-essential cookies or tracking in the future,
            we will update this policy before activating any new tracker, obtain your
            explicit consent before setting any non-essential cookie, and provide a
            genuine choice with no pre-ticked boxes and a real option to decline without
            losing access to the service.
          </p>
          <p>We will never activate tracking silently.</p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Email: <a href="mailto:hello@bookwithvars.com">hello@bookwithvars.com</a>
          </p>
          <p>
            If you are not satisfied with our response, you have the right to lodge a
            complaint with the Nigeria Data Protection Commission (NDPC) at{' '}
            <a href="https://ndpc.gov.ng" target="_blank" rel="noopener noreferrer">ndpc.gov.ng</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
