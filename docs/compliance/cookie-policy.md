# Cookie and Tracking Policy

**Version:** 1.0
**Last updated:** 13 July 2026
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

The app does not include any third-party analytics SDKs, crash reporting tools, advertising identifiers, or behavioural tracking libraries.

## 3. Third-Party Cookies

VARS does not embed any third-party cookies or tracking scripts on its website or in its mobile app. We do not use:

- Advertising or retargeting cookies
- Social media tracking pixels
- Analytics platforms (Google Analytics, Mixpanel, Amplitude, etc.)
- Crash reporting SDKs (Sentry, Crashlytics, etc.)
- Heatmap or session recording tools
- Cross-device tracking or fingerprinting

## 4. Your Choices

Because we only use strictly necessary cookies and storage, there is nothing optional to accept or reject. We do not show a cookie consent banner because there are no non-essential cookies to consent to.

You can still control storage on your devices:

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
