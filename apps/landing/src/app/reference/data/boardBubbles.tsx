import { Callout } from '../components/content/Callout';
import { DataTable } from '../components/content/DataTable';
import { Tag } from '../components/content/Tag';
import type { Bubble } from './types';

// Board-only bubbles: shown alongside PARTNER_BUBBLES once the password gate is passed.
export const BOARD_BUBBLES: Bubble[] = [
  // Business mechanics
  {
    id: 'b01',
    category: 'Business mechanics',
    title: 'Payment architecture (full)',
    keywords: 'payment gate charge escrow paystack transfer split subaccount',
    body: (
      <>
        <p>
          <strong>Card verification (first-time customers):</strong> One-time, non-refundable ₦50
          Paystack checkout before the first booking. Stores a reusable <code>authorization_code</code>{' '}
          on the customer profile. All subsequent charges are silent.
        </p>
        <p>
          <strong>Gate model:</strong> Charge fires when vendor taps &ldquo;On My Way&rdquo;. An atomic
          DB lock prevents double-fire if manual and proximity triggers race. Pioneer split: 100% to
          vendor for first 3 bookings; 80/20 after.
        </p>
        <p>
          <strong>Manual settlement:</strong> Paystack has no public API for subaccount bank transfer.
          VARS ops triggers payouts from the Paystack dashboard. The vendor&apos;s 80% is in their
          subaccount from the moment of charge: VARS does not hold or touch it.
        </p>
        <p>
          <strong>Vendor restriction:</strong> Post-gate vendor cancellation triggers a full refund and
          blocks the vendor&apos;s account. All app functionality is locked until VARS ops confirms
          out-of-band repayment and lifts the restriction manually.
        </p>
        <p>
          <strong>Dispute freeze:</strong> Any open or under-review dispute freezes that vendor&apos;s
          settlement queue for the billing cycle.
        </p>
      </>
    ),
  },
  {
    id: 'b02',
    category: 'Business mechanics',
    title: 'Auto-accept zone system',
    keywords: 'auto-accept zone geography location radius drift grace period',
    body: (
      <>
        <p>Vendors define a geographic zone (centre point + radius). Bookings within the zone auto-confirm: no vendor action needed.</p>
        <p>Four conditions must all be true at booking time:</p>
        <ul>
          <li>Auto-accept enabled in vendor settings</li>
          <li>Zone confirmed for the booking day (via daily prompt on app open)</li>
          <li>Slot is free: no blocks or existing bookings</li>
          <li>Customer is within the zone radius (Haversine check, server-side only)</li>
        </ul>
        <p>
          <strong>Drift detection:</strong> GPS checked every 5 minutes while vendor is online. If
          vendor moves more than zone radius + 3km from zone centre, auto-accept pauses until they
          return or re-confirm.
        </p>
        <p>
          <strong>Grace period:</strong> 5 minutes post auto-accept to cancel penalty-free. Amber
          countdown shown on the vendor&apos;s jobs screen.
        </p>
      </>
    ),
  },
  {
    id: 'b03',
    category: 'Business mechanics',
    title: 'Transport surcharges',
    keywords: 'transport surcharge distance travel time buffer slots',
    body: (
      <>
        <p>Bookings beyond 5km from the vendor&apos;s zone centre trigger a surcharge added to the total. Calculated server-side: never sent by the client.</p>
        <DataTable
          rows={[
            ['0–3km over base', '₦3,000 + 1 pre-buffer slot (30 min)'],
            ['3–6km over base', '₦5,000 + 1 pre-buffer slot (30 min)'],
            ['6–10km over base', '₦7,500 + 2 pre-buffer slots (60 min)'],
            ['10km+ over base', '₦10,000 + 2 pre-buffer slots (60 min)'],
          ]}
        />
        <p>Pre-buffer slots block time before the booking to account for travel. Two 30-minute post-booking buffer slots are always created regardless of distance.</p>
      </>
    ),
  },
  // Technology
  {
    id: 'b04',
    category: 'Technology',
    title: 'Tech stack',
    keywords: 'tech stack technology expo react native supabase',
    body: (
      <>
        <DataTable
          rows={[
            ['Mobile', 'Expo SDK 52, React Native 0.76, Expo Router 4'],
            ['Backend', 'Supabase: Postgres, Auth, Realtime, Edge Functions (Deno)'],
            ['Payments', 'Paystack (subaccount split model)'],
            ['KYC', 'Youverify SDK: vendor-only'],
            ['Admin + Landing', 'Next.js 14 (App Router), Vercel'],
            ['Maps', 'react-native-maps'],
            ['Push notifications', 'Expo Push (FCM + APNs)'],
            ['Monorepo', 'Yarn 1 Workspaces'],
          ]}
        />
        <p>
          Shared types live in <code>packages/shared</code> (raw TypeScript, no build step). Deno edge
          functions cannot resolve workspace packages: they import from{' '}
          <code>supabase/functions/_shared/</code>, kept in sync manually.
        </p>
      </>
    ),
  },
  {
    id: 'b05',
    category: 'Technology',
    title: 'Deployment',
    keywords: 'deploy deployment vercel eas cloud hosting infrastructure',
    body: (
      <DataTable
        rows={[
          ['Mobile', 'EAS: App Store + Play Store'],
          ['Backend', 'Supabase: managed Postgres, Auth, Storage, Edge Functions, Realtime'],
          ['Admin + Landing', 'Vercel: continuous deployment from GitHub main'],
          ['Repository', 'github.com/kant1000/vars: private'],
          ['Domain', 'bookwithvars.com: DNS via Vercel'],
          ['Admin URL', 'vars-admin.vercel.app'],
        ]}
      />
    ),
  },
  {
    id: 'b06',
    category: 'Technology',
    title: 'Integration status',
    keywords: 'integration status live ready pending youverify resend',
    body: (
      <>
        <DataTable
          rows={[
            ['Paystack', <><Tag>Live</Tag> Live keys active July 2026. CAC complete. Remaining: register production webhook URL in Paystack dashboard.</>],
            ['Youverify', <><Tag>Live</Tag> Production credentials set 19 June 2026. Webhook active.</>],
            ['Auth OTP email', <><Tag>Live</Tag> Supabase SMTP via Resend, port 465, noreply@bookwithvars.com</>],
            ['Email outreach', <><Tag>Ready</Tag> Set DELIVERY_LIVE=true in Supabase secrets to activate.</>],
            ['WhatsApp outreach', <><Tag>Pending</Tag> Blocked on Meta HSM template approval (3 message types). 360dialog API key active and tested.</>],
          ]}
        />
        <p>No code changes needed to go live on Paystack or WhatsApp: both are config-only.</p>
      </>
    ),
  },
  // Operations
  {
    id: 'b07',
    category: 'Operations',
    title: 'Build state',
    keywords: 'build state implementation features complete pending',
    body: (
      <>
        <p>All core flows are complete and tested.</p>
        <p>
          <strong>Built and live:</strong> booking flow end-to-end, vendor acceptance and job flow,
          Paystack escrow and gate model, live GPS tracking, push notifications, vendor KYC (Youverify),
          photo consent workflow, reschedule flow, auto-accept zone system, transport surcharges, admin
          dashboard (vendors, disputes, outreach, marketing).
        </p>
        <p><strong>Active pending items (no code required):</strong></p>
        <ul>
          <li>Register production webhook URL in Paystack live dashboard</li>
          <li>Set DELIVERY_LIVE=true to activate email outreach</li>
          <li>Submit WhatsApp message templates to Meta via 360dialog for HSM approval</li>
        </ul>
      </>
    ),
  },
  {
    id: 'b08',
    category: 'Operations',
    title: 'Cron architecture',
    keywords: 'cron job schedule automation periodic task',
    body: (
      <>
        <p>
          8 scheduled jobs registered in the Supabase dashboard. All edge function cron calls are
          authenticated via <code>x-vars-cron-secret</code> header.
        </p>
        <DataTable
          rows={[
            ['Every 5 min', 'Booking expiry, auto-release, phone reveal, send reminders'],
            ['Every 10 min', 'Deliver outreach (flushes approved messages to providers)'],
            ['Hourly', 'Photo consent expiry, reschedule expiry, vendor lead nurture tick'],
            ['Every 2 hours', 'Cron health check (monitors all other jobs, logs failures)'],
          ]}
        />
      </>
    ),
  },
  {
    id: 'b09',
    category: 'Operations',
    title: 'Admin dashboard',
    keywords: 'admin dashboard panel operations management',
    body: (
      <>
        <p>
          Next.js 14 at vars-admin.vercel.app. Auth via Supabase + <code>admin_users</code> table. All
          mutations use the server-side service-role client.
        </p>
        <p><strong>Vendors:</strong> Defaults to rejected KYC queue. Override-approve or reset. Vendors with 3+ cancellations in 30 days are auto-flagged.</p>
        <p><strong>Disputes:</strong> SLA timer: warns at 18h, critical at 24h. Colour-coded category labels. Resolve by releasing to vendor or refunding customer.</p>
        <p><strong>Outreach queue:</strong> Review and bulk-approve vendor lead messages before they send. Per-message channel selector and edit before approval.</p>
        <p><strong>Marketing:</strong> Bulk HTML email campaigns to lead segments. Filter by service type, pioneer status, lead state. Live recipient count. Two-step send confirmation.</p>
      </>
    ),
  },
  // GTM depth
  {
    id: 'b10',
    category: 'GTM depth',
    title: 'Milestone timeline',
    keywords: 'milestone roadmap timeline delivery launch progress',
    body: (
      <>
        <p>
          Source of truth: <code>apps/landing/src/app/roadmap/data/milestones.ts</code>: live at
          bookwithvars.com/roadmap.
        </p>
        <DataTable
          rows={[
            ['410 Vendors in Pipeline', 'Now: onboarding active'],
            ['App Store Launch', 'End of July 2026: live'],
            ['Vendor Onboarding Month', 'August 2026: converting pipeline to verified stylists before customers arrive'],
            ['Both Sides Open', 'End of September 2026: customer marketing activates'],
            ['Platform Health Review', 'Q4 2026: audit booking quality, stylist performance, platform health'],
            ['Year-End', 'Nov–Dec 2026: Lagos at its best'],
            ['1,000 Completed Bookings', 'End 2026: Year 1 milestone. Not installs. Completed sessions.'],
            ['VARS Points', '2027: earn from every booking. Customers and vendors both.'],
          ]}
        />
      </>
    ),
  },
  {
    id: 'b11',
    category: 'GTM depth',
    title: 'Vendor acquisition',
    keywords: 'acquisition outreach gtm go-to-market vendor supply recruitment agents direct',
    body: (
      <>
        <p>Supply first: always. A user who opens VARS and finds no nearby vendors deletes the app. Supply density <em>is</em> the product.</p>
        <p>
          <strong>Primary seeding:</strong> The board hired three independent recruitment agents to go
          direct to barber shops, salons, and studios across Lagos. On-the-ground, face-to-face
          conversations with vendors. Zero cost to agents except commission on successful signups.
        </p>
        <p><strong>Channels:</strong> Direct shop recruitment (primary), Instagram and TikTok (paid + organic), WhatsApp groups, partnerships with salon and studio owners.</p>
        <p><strong>Pioneer Programme:</strong> Anchored the founding supply cohort. 50 spots, complete May 2026.</p>
        <p>
          <strong>Current:</strong> General stylist registration via bookwithvars.com. Leads captured
          in <code>vendor_leads</code> table, followed up via the outreach system and cron-driven state
          machine.
        </p>
      </>
    ),
  },
  {
    id: 'b12',
    category: 'GTM depth',
    title: 'Partnership pipeline',
    keywords: 'partner partnership agency collaboration integration',
    body: (
      <>
        <DataTable
          rows={[
            ['Marketing agency', 'Nigerian agency (fintech/B2B SaaS background). Brief sent. Decision pending.'],
            ['Youverify', 'Live. Production KYC credentials active 19 June 2026. Contact: Ayotomide.'],
          ]}
        />
        <p>All new partnership enquiries: hello@bookwithvars.com</p>
      </>
    ),
  },
  // Governance
  {
    id: 'b13',
    category: 'Governance',
    title: 'V1 scope',
    keywords: 'scope v1 v2 features out-of-scope limitations',
    body: (
      <>
        <p><strong>In V1:</strong> Booking flow, vendor acceptance, Paystack escrow, live tracking, push notifications, KYC, photo consent, reschedule flow, auto-accept zone system, transport surcharges, admin dashboard.</p>
        <p><strong>Explicitly out of V1:</strong> E-commerce, in-app wallet, subscriptions, loyalty, AR/virtual try-on, saved customer addresses, full offline mode.</p>
        <p><strong>Already in V2 (shipped):</strong> Multi-service bookings per session. Free-name service taxonomy (Hair / Barber / Face / Nails at L1, 16 subcategories at L2).</p>
      </>
    ),
  },
  {
    id: 'b14',
    category: 'Governance',
    title: 'Locked product decisions',
    keywords: 'decision locked frozen reversal constraints rules',
    body: (
      <>
        <p>These decisions are standing. Flag any conflict explicitly before acting:</p>
        <ul>
          <li><strong>Gate-at-departure model</strong>: charge fires at &ldquo;On My Way&rdquo;, not at booking. Paystack confirmed authorisation-not-capture is not supported for NGN.</li>
          <li><strong>₦50 card verification</strong>: non-refundable, one-time, enables silent future charges. Not reverting.</li>
          <li><strong>80/20 split; 100% for Pioneer first 3</strong>: applied at gate time, cannot be adjusted at settlement time.</li>
          <li><strong>Manual Paystack settlement</strong>: no public API for subaccount transfers. VARS ops triggers from dashboard.</li>
          <li><strong>Binary cancellation</strong>: free pre-gate, locked post-gate. No tiered fees.</li>
          <li><strong>1-hour acceptance window</strong>: not 2h (too slow for customers), not 15 min (too short for vendors).</li>
          <li><strong>2-hour auto-release</strong>: from service_rendered_at. Set by DB trigger, authoritative.</li>
          <li><strong>Vendors KYC&apos;d; customers are not</strong>: trust infrastructure concentrated on the supply side.</li>
          <li><strong>English in-product, Pidgin on social</strong>: same personality, different register.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'b15',
    category: 'Governance',
    title: 'Governance',
    keywords: 'governance board founder chairman seyi phevoria',
    body: (
      <>
        <p><strong>Board</strong></p>
        <DataTable
          rows={[
            ['Chairman', 'Seyi Ibitoye'],
            ['Phevoria Consult Limited', '7.5%: Phelim & Victoria: party to all current board resolutions'],
          ]}
        />
        <p style={{ marginTop: 14 }}><strong>Company</strong></p>
        <DataTable
          rows={[
            ['Registration', 'Nigerian CAC: complete'],
            ['Hosting', 'Vercel (landing + admin), Supabase (backend), EAS (mobile)'],
            ['Repository', 'github.com/kant1000/vars: private'],
            ['Domain', 'bookwithvars.com'],
            ['Admin panel', 'vars-admin.vercel.app'],
            ['Contact', 'hello@bookwithvars.com'],
          ]}
        />
      </>
    ),
  },
];
