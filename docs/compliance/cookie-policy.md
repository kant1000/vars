# Cookie and Tracking Policy

**Version:** 1.1
**Last updated:** 14 July 2026
**Status:** Draft, pending lawyer review
**Owner:** DPO (once appointed); interim: Seyi Ibitoye, Founder
**Applies to:** bookwithvars.com (landing page and blog) and the VARS mobile app (iOS and Android)

---

## 1. The Short Version

VARS does not use advertising cookies, analytics trackers, or marketing pixels. We do not track you across websites. We do not sell or share your browsing data with third parties. The only cookies and local storage we use are strictly necessary to make the service work.

## 2. What We Use and Why

### 2.1 Website (bookwithvars.com)

| Storage type | Name / purpose | Category | Duration |
|---|---|---|---|
| Supabase Auth cookie | Maintains your login session if you sign in via the admin panel. Not set for public visitors. | Strictly necessary | Session (cleared on logout or browser close) |
| Vercel deployment cookie | Standard hosting cookie set by Vercel for load balancing and security. Contains no personal data. | Strictly necessary | Session |

That is the complete list. No Google Analytics, no Meta Pixel, no Hotjar, no advertising tags, no fingerprinting scripts.

### 2.2 Mobile App (VARS for iOS and Android)

The mobile app does not use browser cookies. It uses the following local storage mechanisms:

| Storage type | Purpose | Category |
|---|---|---|
| Supabase Auth token | Maintains your logged-in session. Stored securely via the device keychain (iOS) or SecureStore (Android). | Strictly necessary |
| AsyncStorage (local cache) | Caches non-sensitive app data (e.g. last viewed screen, cached vendor listings, UI preferences) to improve performance and provide basic offline resilience. No personally identifiable information is transmitted from this cache. Data stays on your device. | Strictly necessary |
| Expo Push Token | A device-specific token registered with Apple (APNs) or Google (FCM) to deliver push notifications you have opted into. The token identifies your device, not you personally. You can revoke it at any time by disabling notifications in your device settings. | Strictly necessary (with your permission) |

The app also includes the following third-party SDKs:

| SDK | Provider | Purpose | Data sent | Config |
|---|---|---|---|---|
| Sentry (`@sentry/react-native`) | Sentry (US/EU) | Crash reporting and error monitoring | Stack traces, device OS/version, memory state. No personal identifiers explicitly sent. | Enabled in production only (`enabled: !__DEV__`). 10% performance trace sample rate. |
| PostHog (`posthog-react-native`) | PostHog (EU — eu.i.posthog.com) | Analytics provider | No events are sent by default. Automatic screen and tap capture is disabled (`autocapture={false}`). | SDK is initialised but no personalised data is captured unless an explicit event call is added to code. |

Neither SDK is used for advertising, profiling, or selling data. Sentry and PostHog are infrastructure tools for app quality and product analytics.

## 3. Third-Party Tools

VARS does not embed any third-party cookies or tracking scripts on its **website**. We do not use:

- Advertising or retargeting cookies
- Social media tracking pixels
- Analytics platforms on the website (Google Analytics, Mixpanel, Amplitude, etc.)
- Heatmap or session recording tools
- Cross-device tracking or fingerprinting

The **mobile app** uses Sentry and PostHog as described in section 2.2.

## 4. Your Choices

On the **website**, only strictly necessary cookies are set. There is nothing optional to accept or reject.

In the **mobile app**, Sentry and PostHog are active in production. They cannot currently be disabled per-user within the app. If you wish to opt out, you can delete the app. We will add per-user opt-out controls in a future release.

You can also control storage on your devices:

**On the website:** Your browser settings allow you to block or delete cookies at any time. Blocking the Supabase Auth cookie will prevent you from staying logged in, but will not affect your ability to browse the public site.

**On the mobile app:** You can clear the app's local storage by uninstalling and reinstalling the app. You can disable push notifications at any time in your device's notification settings (Settings > Notifications > VARS on iOS; Settings > Apps > VARS > Notifications on Android). Disabling notifications revokes the Expo Push Token.

## 5. If This Changes

If VARS introduces any non-essential cookies or tracking in the future (for example, analytics to understand how people use the app, or advertising tools), we will:

1. Update this policy before activating any new tracker
2. Obtain your explicit consent before setting any non-essential cookie or tracker, in compliance with GAID Article 19
3. Provide a genuine choice: no pre-ticked boxes, no "accept all" dark patterns, and a real option to decline without losing access to the service
4. Never activate tracking silently

We will notify you of any changes to this policy via the app or email.

## 6. Contact

If you have questions about this policy:

**Email:** hello@bookwithvars.com
**DPO:** Contact details will be published once the DPO is appointed.

You also have the right to lodge a complaint with the Nigeria Data Protection Commission (NDPC) at [ndpc.gov.ng](https://ndpc.gov.ng).

---

**Version History**

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 13 July 2026 | Seyi Ibitoye | Initial draft |
| 1.1 | 14 July 2026 | Claude (Phase B) | Added Sentry and PostHog disclosures; updated third-party section |
