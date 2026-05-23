import PioneerSection from '@/components/PioneerSection';

export const revalidate = 60;

const siteUrl = 'https://www.bookwithvars.com';

async function getVendorCount(): Promise<number> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return 0;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/vendor_leads?select=id`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: 'count=exact',
          Range: '0-0',
        },
        next: { revalidate: 60 },
      }
    );
    return parseInt(
      res.headers.get('content-range')?.split('/')[1] ?? '0',
      10
    );
  } catch {
    return 0;
  }
}

const structuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'VARS',
    url: siteUrl,
    logo: `${siteUrl}/logo.svg`,
    email: 'support@bookwithvars.com',
    sameAs: ['https://www.instagram.com/bookwithvars'],
    description:
      'VARS is a Lagos home service beauty platform for stylists, barbers, and makeup artists.',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'VARS',
    url: siteUrl,
    inLanguage: 'en-GB',
    description:
      'Join VARS as a Lagos stylist and get discovered for home service barbing, hair styling, and makeup jobs.',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is VARS available outside Lagos?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'VARS is launching in Lagos first. Abuja and Port Harcourt are planned for later.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do I become a VARS stylist?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Register your interest on bookwithvars.com. VARS will reach out with onboarding steps to complete verification and set up your profile.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does payment protection work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Customers pay through the app. Payment is released after the service is complete, helping protect both the customer and the stylist.',
        },
      },
    ],
  },
];

export default async function HomePage() {
  const vendorCount = await getVendorCount();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <nav>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-white.svg" alt="VARS" style={{ height: 28, width: 'auto' }} />
        <a href="/roadmap" className="nav-link">Roadmap</a>
        <a href="#stylists" className="nav-cta">Join as a stylist</a>
      </nav>

      <section className="hero">
        <div className="container">
          <div className="hero-inner">
            <div>
              <span className="hero-eyebrow">Now onboarding in Lagos</span>
              <h1>
                Your craft deserves<br />
                better income.
              </h1>
              <p className="hero-sub">
                VARS connects barbers, hairstylists, makeup artists, and more directly
                to clients nearby. Work for yourself. Get paid securely. Build your reputation.
              </p>
              <div className="hero-actions">
                <a href="#stylists" className="btn-primary">
                  I'm a stylist
                </a>
                <a href="/roadmap" className="btn-coming-soon">
                  View Roadmap &rarr;
                </a>
              </div>
            </div>

            <div className="hero-illus">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing.png"
                alt="VARS app preview for Lagos home service beauty bookings"
                className="hero-illus-img"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="why-section section-light" id="why">
        <div className="container">
          <span className="section-label">For Lagos stylists</span>
          <h2 className="section-title">Your skills. Your schedule.</h2>
          <p className="section-sub">
            VARS is built for independent beauty professionals who want more
            bookings without depending on walk-ins, cash handling, or scattered
            WhatsApp referrals.
          </p>

          <div className="benefits-grid">
            <div className="benefit-card">
              <span className="benefit-icon" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="6" width="20" height="14" rx="2" stroke="#111111" strokeWidth="1.75"/>
                  <circle cx="12" cy="13" r="3" stroke="#111111" strokeWidth="1.75"/>
                  <path d="M6 10h.01M18 16h.01" stroke="#111111" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </span>
              <div className="benefit-title">Payment protection</div>
              <p className="benefit-body">
                Customers pay securely through the app. Your money is released
                after the service is complete, with no awkward cash chase.
              </p>
            </div>
            <div className="benefit-card">
              <span className="benefit-icon" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="8" r="4" stroke="#111111" strokeWidth="1.75"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#111111" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </span>
              <div className="benefit-title">A profile that builds trust</div>
              <p className="benefit-body">
                Show your work, earn real ratings from completed jobs, and
                stand out as a verified stylist in Lagos.
              </p>
            </div>
            <div className="benefit-card">
              <span className="benefit-icon" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="9" stroke="#111111" strokeWidth="1.75"/>
                  <path d="M12 7v5l3 3" stroke="#111111" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <div className="benefit-title">You set your hours</div>
              <p className="benefit-body">
                Choose when you are available and define the areas you cover,
                from Lekki and Victoria Island to Ikeja and Surulere.
              </p>
            </div>
            <div className="benefit-card">
              <span className="benefit-icon" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L4 6v6c0 5 3.6 9.7 8 11 4.4-1.3 8-6 8-11V6L12 2z" stroke="#111111" strokeWidth="1.75" strokeLinejoin="round"/>
                  <path d="M9 12l2 2 4-4" stroke="#111111" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <div className="benefit-title">Verified from day one</div>
              <p className="benefit-body">
                VARS is built around KYC checks, completed-job ratings, and
                safer bookings so serious stylists can earn customer confidence.
              </p>
            </div>
          </div>

          <p style={{ marginTop: 40, fontSize: 14 }}>
            <a href="/blog/talent-without-trust" style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>
              The talent is there. The trust is not &rarr;
            </a>
          </p>
        </div>
      </section>

      <PioneerSection initialVendorCount={vendorCount} />

      <section className="how-section section-light">
        <div className="container">
          <span className="section-label">How VARS works</span>
          <h2 className="section-title">From fresh profile to paid booking.</h2>
          <p className="section-sub">
            The platform is designed around the way Lagos beauty work really
            happens: mobile, trust-based, time-sensitive, and reputation-led.
          </p>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <div className="step-title">Create your stylist profile</div>
              <p className="step-body">
                Sign up as a barber, hair stylist, or makeup artist. Add your
                portfolio and set the areas in Lagos you cover.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <div className="step-title">Set your zone and services</div>
              <p className="step-body">
                Choose where you operate, add your portfolio, and show customers
                what kind of home service beauty work you do best.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <div className="step-title">Earn from completed jobs</div>
              <p className="step-body">
                Customers book and pay securely. You show up, deliver the work,
                and build ratings that bring the next booking closer.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="founder-section">
        <div className="container">
          <div className="founder-inner">
            <h2
              className="founder-quote"
              style={{ color: 'rgba(255,255,255,0.9)' }}
            >
              I built VARS because talented Lagos stylists deserve a business,
              not just a hustle. Your craft should be easier to find, easier to
              trust, and easier to pay for.
            </h2>
            <div className="founder-attr">
              <div className="founder-avatar">S</div>
              <div className="founder-name">
                <strong>Seyi Ibitoye</strong>
                <span>Founder, VARS</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="faq-section section-subtle">
        <div className="container">
          <span className="section-label">Common questions</span>
          <h2 className="section-title">Got questions?</h2>

          <div className="faq-grid">
            <div className="faq-item">
              <div className="faq-q">Is VARS available outside Lagos?</div>
              <p className="faq-a">
                We are launching in Lagos first. Abuja and Port Harcourt are
                planned for later.
              </p>
            </div>
            <div className="faq-item">
              <div className="faq-q">How do I become a VARS stylist?</div>
              <p className="faq-a">
                Register above. We will reach out with onboarding steps to
                complete your verification and set up your profile.
              </p>
            </div>
            <div className="faq-item">
              <div className="faq-q">How does payment protection work?</div>
              <p className="faq-a">
                Customers pay when they book. Payment is released after the
                service is complete, so stylists do not have to depend on cash
                collection after the job.
              </p>
            </div>
            <div className="faq-item">
              <div className="faq-q">Which services are launching first?</div>
              <p className="faq-a">
                VARS is starting with home service barbing, hair styling, and
                makeup artistry, including bridal makeup.
              </p>
            </div>
            <div className="faq-item">
              <div className="faq-q">When does the app launch?</div>
              <p className="faq-a">
                VARS is actively onboarding stylists in Lagos. The customer
                app is in final preparation — register now to be live when
                bookings open.
              </p>
            </div>
            <div className="faq-item">
              <div className="faq-q">What is the Pioneer Programme?</div>
              <p className="faq-a">
                The first 50 VARS stylists received a permanent Pioneer badge
                and kept 100% commission on their first 3 completed bookings.
                The Pioneer cohort is now complete.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <p style={{ marginBottom: 8 }}>
          <strong>VARS</strong> &nbsp;|&nbsp; Your craft, your income.
        </p>
        <p>
          <a href="mailto:support@bookwithvars.com">support@bookwithvars.com</a>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="https://www.instagram.com/bookwithvars">Instagram</a>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="/privacy">Privacy</a>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="/terms">Terms</a>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="/blog">Blog</a>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="/roadmap">Roadmap</a>
        </p>
        <p style={{ marginTop: 16 }}>
          &copy; {new Date().getFullYear()} VARS. All rights reserved.
        </p>
      </footer>
    </>
  );
}
