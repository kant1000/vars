import { Callout } from '../components/content/Callout';
import { DataTable } from '../components/content/DataTable';
import type { Bubble } from './types';

// Partner-audience bubbles: open, no password required.
export const PARTNER_BUBBLES: Bubble[] = [
  // Business
  {
    id: 'p01',
    category: 'Business',
    title: 'What VARS is',
    keywords: 'marketplace beauty grooming',
    body: (
      <>
        <p>
          On-demand beauty and grooming marketplace in Lagos, Nigeria. Customers book verified
          barbers, hair stylists, and makeup artists who travel to them: a time slot, a payment,
          a vendor at the door.
        </p>
        <p>
          VARS owns the full service stack: identity verification, Paystack escrow, scheduling,
          live tracking, and dispute resolution. Vendors show up and work.
        </p>
        <Callout>
          The name means <strong>Fresh</strong> in Afrikaans. Domain: bookwithvars.com
        </Callout>
      </>
    ),
  },
  {
    id: 'p02',
    category: 'Business',
    title: 'The marketplace',
    keywords: 'two-sided supply demand vendor customer',
    body: (
      <>
        <p>
          <strong>Customers</strong> browse vendors by service category, pick a slot, pay upfront,
          and track their vendor live. Payment is secured at booking but held in escrow until the
          service is confirmed complete.
        </p>
        <p>
          <strong>Vendors</strong> manage their own schedule, receive bookings, and get paid
          automatically after confirmation. They are identity-verified before going live. No
          manual payment handling on either side.
        </p>
        <p>
          VARS holds funds in Paystack escrow for the duration of every booking. Neither side
          handles money directly.
        </p>
      </>
    ),
  },
  {
    id: 'p03',
    category: 'Business',
    title: 'Where we are',
    keywords: 'timeline milestone launch status progress roadmap',
    body: (
      <>
        <p>Phase 2. Open the Market. 410 vendors in the pipeline. App Store launch end of July.</p>
        <DataTable
          rows={[
            ['410 Vendors in Pipeline', 'Now: onboarding active'],
            ['App Store Launch', 'End of July 2026: live'],
            ['Vendor Onboarding Month', 'August 2026: converting pipeline to verified stylists'],
            ['Both Sides Open', 'End of September 2026: customer marketing activates'],
            ['Platform Health Review', 'Q4 2026'],
            ['1,000 Completed Bookings', 'End 2026: Year 1 milestone. Sessions, not installs.'],
          ]}
        />
      </>
    ),
  },
  // Brand
  {
    id: 'p04',
    category: 'Brand',
    title: 'Brand voice',
    keywords: 'tone voice copy messaging communication',
    body: (
      <>
        <p>English in-product. Pidgin on social media only. Same personality, different register.</p>
        <p>
          Core rule: <strong>lead with forward momentum, never with failure or judgment.</strong>{' '}
          Frame every state by what happens next, never by what is missing.
        </p>
        <DataTable
          rows={[
            [<strong key="h1">Instead of</strong>, <strong key="h2">Write this</strong>],
            ['“Unverified”', '“Uploaded”'],
            ['“Awaiting approval”', '“Sent to client”'],
            ['“Something went wrong”', '“Let’s try that again”'],
            ['“Vendor didn’t respond”', '“This booking expired”'],
          ]}
        />
        <p>Professional, calm, trustworthy. Never corporate, never desperate, never generic.</p>
      </>
    ),
  },
  {
    id: 'p05',
    category: 'Brand',
    title: 'Visual identity',
    keywords: 'design visual color typography branding system',
    body: (
      <>
        <p>Monochrome shell. White backgrounds, black borders, black text. No coloured fills.</p>
        <DataTable
          rows={[
            ['#111111', 'Ink: text, borders, CTAs'],
            ['#FFFFFF', 'White: all backgrounds'],
            ['#F5F5F5', 'Grey: subtle fills, alternate rows'],
            ['#0A7AFF', 'Accent: links and small tags only. Never as a fill or background.'],
          ]}
        />
        <p>
          Typography: Inter (Regular, Medium, Bold). All surfaces use sharp corners: no
          border-radius anywhere in the product.
        </p>
        <p>
          Illustration style: human ink sketch, loose gestural linework in the style of 19th
          century engraving. Black on white or white on black. No fills, no gradients.
        </p>
      </>
    ),
  },
  {
    id: 'p06',
    category: 'Brand',
    title: 'Locked terminology',
    keywords: 'terminology naming badges labels verified pioneers',
    body: (
      <>
        <p>These names are fixed across all communications and the product:</p>
        <DataTable
          rows={[
            ['New on VARS', 'Vendors with no reviews yet: replaces empty stars'],
            ['Verified by VARS', 'Badge awarded after KYC pass'],
            ['VARS Pioneers', 'The founding cohort of 50 vendors'],
            ['VARS’ Choice', 'Badge manually awarded by the VARS team'],
            ['Top Rated', 'Badge for sustained high ratings'],
            ['You’re live on VARS', 'Vendor approval notification'],
            ['You’re in the VARS queue', 'Verification pending notification'],
            ['Let’s find you another one', 'Shown when vendor declines or times out'],
          ]}
        />
      </>
    ),
  },
  // Legal & Compliance
  {
    id: 'p07',
    category: 'Legal & Compliance',
    title: 'Business registration',
    keywords: 'registration CAC business legal compliance',
    body: (
      <>
        <p>Registered under Nigerian CAC (complete). Paystack live-mode verification passed July 2026</p>
        <p>Domain: bookwithvars.com, registered and DNS pointed at Vercel.</p>
      </>
    ),
  },
  {
    id: 'p08',
    category: 'Legal & Compliance',
    title: 'How payments work',
    keywords: 'pay payment charge money split settlement escrow',
    body: (
      <>
        <p>
          No charge at booking creation. The customer&apos;s card is charged when their vendor
          commits to travel: not before.
        </p>
        <p>
          Standard split: <strong>80% to the vendor, 20% to VARS</strong>: applied at the moment
          of charge, locked in at that point.
        </p>
        <p>
          VARS Pioneers receive 100% on their first 3 completed bookings. After that, standard
          80/20 applies permanently.
        </p>
        <p>
          Settlement is manual: VARS ops triggers bank transfer from the Paystack dashboard once
          each service is confirmed complete. The vendor&apos;s share sits in their Paystack
          subaccount from the moment of charge: VARS never touches it.
        </p>
        <p>
          First-time customers complete a one-time, non-refundable ₦50 card verification before
          their first booking. This stores a reusable authorisation for all future charges.
        </p>
      </>
    ),
  },
  {
    id: 'p09',
    category: 'Legal & Compliance',
    title: 'Vendor verification (KYC)',
    keywords: 'kyc verify identity vendor verification youverify',
    body: (
      <>
        <p>
          All vendors complete identity verification via Youverify before going live. A hosted
          SDK session: no manual upload, no paper.
        </p>
        <Callout>
          <strong>Clean pass:</strong> vendor activates instantly. No admin step required.
        </Callout>
        <Callout>
          <strong>Flagged or rejected:</strong> case enters the admin review queue. Admin can
          override-approve or send back for re-submission.
        </Callout>
        <p>Customers are not KYC&apos;d. Trust infrastructure is concentrated entirely on the vendor side.</p>
      </>
    ),
  },
  // Platform
  {
    id: 'p10',
    category: 'Platform',
    title: 'Customer booking flow',
    keywords: 'booking reserve slot schedule book appointment',
    body: (
      <>
        <ul>
          <li>Browse verified vendors nearby, filtered by service category</li>
          <li>Select services, pick a date and time slot</li>
          <li>Confirm booking (no payment charge yet) at this point</li>
          <li>Vendor has 1 hour to accept (30-min reminder at the halfway mark)</li>
          <li>Charge fires when vendor taps &ldquo;On My Way&rdquo;</li>
          <li>Track vendor live on map</li>
          <li>Phone number revealed 15 minutes before appointment</li>
          <li>Confirm service done to release payment to vendor</li>
        </ul>
        <p>If the customer takes no action after service is marked complete, payment auto-releases 2 hours later.</p>
      </>
    ),
  },
  {
    id: 'p11',
    category: 'Platform',
    title: 'Vendor onboarding',
    keywords: 'onboarding signup register profile vendor setup',
    body: (
      <>
        <p>Multi-step flow: profile &rarr; services &rarr; portfolio &rarr; KYC &rarr; instant activation.</p>
        <p>
          Services are free-name under a two-level taxonomy: Hair / Barber / Face / Nails at L1,
          with 16 subcategories at L2. Vendors write their own service names and set their own
          prices (minimum ₦10,000; max 10 active services).
        </p>
        <p>Portfolio photos are screened on-device to prevent contact information appearing in images.</p>
        <p>A clean KYC pass activates the vendor immediately: they appear in customer search within minutes.</p>
      </>
    ),
  },
  {
    id: 'p12',
    category: 'Platform',
    title: 'Cancellation policy',
    keywords: 'cancel refund free locked policy terms',
    body: (
      <>
        <Callout>
          <strong>Before the vendor sets off:</strong> Free cancellation for both sides. No charge was ever made.
        </Callout>
        <Callout>
          <strong>After the vendor sets off:</strong> Booking is locked for the customer. Dispute is the only
          recourse. If the <em>vendor</em> cancels at this point, the customer receives a full refund and the
          vendor account is restricted until VARS ops confirms out-of-band repayment.
        </Callout>
        <p>
          1-hour acceptance window: if the vendor does not respond, the booking expires automatically. No
          charge, no penalty to either party.
        </p>
      </>
    ),
  },
  {
    id: 'p13',
    category: 'Platform',
    title: 'Dispute process',
    keywords: 'dispute issue problem complaint resolve raise',
    body: (
      <>
        <p>Customer raises a dispute from the booking detail screen and selects a structured category:</p>
        <ul>
          <li>Vendor didn&apos;t show up</li>
          <li>Arrived very late</li>
          <li>Service not completed</li>
          <li>Poor quality</li>
          <li>Wrong service</li>
          <li>Other (requires written detail)</li>
        </ul>
        <p>Booking freezes immediately: payment does not move until admin resolves. SLA: 24 hours (warning fires at 18h).</p>
        <p>Admin resolves by releasing payment to the vendor or refunding the customer. Both parties receive outcome-specific notifications.</p>
      </>
    ),
  },
  // Go-to-market
  {
    id: 'p14',
    category: 'Go-to-market',
    title: 'VARS Pioneers',
    keywords: 'pioneer founding cohort badge commission earnings',
    body: (
      <>
        <p>The founding cohort of 50 vendors: the first to register and verify on the platform. Cohort complete as of May 2026.</p>
        <p>Pioneer benefits are active and permanent:</p>
        <ul>
          <li>0% commission on the first 3 completed bookings: vendor keeps 100%</li>
          <li>Permanent VARS Pioneer badge on their profile: never expires</li>
        </ul>
        <p>New vendor registrations now go through the general registration flow. Pioneer terms remain in force for all 50 cohort members.</p>
      </>
    ),
  },
  {
    id: 'p15',
    category: 'Go-to-market',
    title: 'Wide Awake blog',
    keywords: 'blog content marketing writing articles wide awake',
    body: (
      <>
        <p>Content marketing arm at bookwithvars.com/blog. Launched ahead of the end of September 2026 customer marketing activation.</p>
        <p>Covers money, mindset, culture, and the Nigerian beauty market. Authored by Seyi Ibitoye. Static: no CMS, publisher-controlled.</p>
        <p>Live articles: <em>The Culture of Shame</em>, <em>Lagos Has the Talent</em>, <em>The Number in Your Head</em>. Five further pieces queued.</p>
      </>
    ),
  },
  // Contact
  {
    id: 'p16',
    category: 'Contact',
    title: 'Working with VARS',
    keywords: 'contact email support hello partnership work together',
    body: (
      <>
        <p>VARS works with marketing agencies, legal counsel, and service partners who operate independently. This document is designed for exactly that.</p>
        <p>Anything requiring board involvement:</p>
        <Callout>hello@bookwithvars.com / Seyi Ibitoye, Chairman</Callout>
        <p>Standard response: 24&ndash;48 hours. WhatsApp available for urgent matters: see the footer.</p>
      </>
    ),
  },
];
