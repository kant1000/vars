import PioneerSection from '@/components/PioneerSection';

// Revalidate every 60 seconds so the pioneer count stays fresh
export const revalidate = 60;

const PIONEER_MAX = 50;

async function getPioneerSpotsRemaining(): Promise<number> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return PIONEER_MAX;

  try {
    // Count from vendor_leads only — all pioneers register here first.
    // Converted leads stay (converted = TRUE, pioneer = TRUE) so the
    // count never double-counts full vendor accounts.
    const res = await fetch(
      `${supabaseUrl}/rest/v1/vendor_leads?pioneer=eq.true&select=id`,
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
    const leadCount = parseInt(
      res.headers.get('content-range')?.split('/')[1] ?? '0', 10
    );
    return Math.max(0, PIONEER_MAX - leadCount);
  } catch {
    return PIONEER_MAX;
  }
}

export default async function HomePage() {
  const spotsRemaining = await getPioneerSpotsRemaining();

  return (
    <>
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-splash.png" alt="VARS" style={{ height: 32, width: 'auto' }} />
        <a href="#vendors" className="nav-cta">Join as a vendor</a>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="hero">
        <div className="container">
          <div className="hero-inner">
            <div>
              <span className="hero-eyebrow">Now in Lagos</span>
              <h1>
                Beauty at<br />
                your door.
              </h1>
              <p className="hero-sub">
                Book verified barbers, stylists, and makeup artists who come to you —
                wherever you are in Lagos. No travel, no waiting rooms.
              </p>
              <div className="hero-actions">
                <span className="btn-coming-soon">
                  Coming to iOS &amp; Android
                </span>
                <a href="#vendors" className="btn-ghost">
                  I&apos;m a vendor
                </a>
              </div>
            </div>

            <div className="hero-illus">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing.png"
                alt="VARS — beauty at your door"
                className="hero-illus-img"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="how-section section-light">
        <div className="container">
          <span className="section-label">How it works</span>
          <h2 className="section-title">Three taps. Done.</h2>
          <p className="section-sub">
            From search to session, the whole experience is built around your time.
          </p>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <div className="step-title">Find someone near you</div>
              <p className="step-body">
                Browse verified vendors by service, location, and rating.
                Every profile includes real reviews and portfolio photos.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <div className="step-title">Book & pay securely</div>
              <p className="step-body">
                Pick a time, confirm your location, and pay through the app.
                Your money is held in escrow until the service is complete.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <div className="step-title">Relax while they come to you</div>
              <p className="step-body">
                Track your vendor in real time. No rushing, no traffic,
                no waiting rooms. Your home is your salon.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pioneer section (client component) ───────────────── */}
      <PioneerSection initialSpots={spotsRemaining} />

      {/* ── Why VARS (for vendors) ─────────────────────────────── */}
      <section className="why-section section-light" id="why">
        <div className="container">
          <span className="section-label">For vendors</span>
          <h2 className="section-title">Your skills. Your schedule.</h2>
          <p className="section-sub">
            VARS is built to put more money in your pocket and give you
            full control over your business.
          </p>

          <div className="benefits-grid">
            <div className="benefit-card">
              <span className="benefit-icon">&#128183;</span>
              <div className="benefit-title">Same-day payouts</div>
              <p className="benefit-body">
                Your share is transferred automatically once a booking completes.
                No waiting, no paperwork, no middleman.
              </p>
            </div>
            <div className="benefit-card">
              <span className="benefit-icon">&#128100;</span>
              <div className="benefit-title">Your own client base</div>
              <p className="benefit-body">
                Build a verified profile with reviews, ratings, and a photo portfolio
                that grows with every booking.
              </p>
            </div>
            <div className="benefit-card">
              <span className="benefit-icon">&#128197;</span>
              <div className="benefit-title">You set your hours</div>
              <p className="benefit-body">
                Toggle online when you&apos;re available. Manage your schedule entirely
                from the app. No shifts, no boss.
              </p>
            </div>
            <div className="benefit-card">
              <span className="benefit-icon">&#128274;</span>
              <div className="benefit-title">Protected escrow</div>
              <p className="benefit-body">
                Customers pay upfront. Funds are held securely and released to you
                once the service is confirmed complete.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Founder note ──────────────────────────────────────── */}
      <section className="founder-section">
        <div className="container">
          <div className="founder-inner">
            <h2
              className="founder-quote"
              style={{ color: 'rgba(255,255,255,0.9)' }}
            >
              I built VARS because I believe the most talented stylists
              in Lagos deserve a business, not just a hustle. VARS is the platform
              that gives them one.
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

      {/* ── FAQ ───────────────────────────────────────────────── */}
      <section className="faq-section section-subtle">
        <div className="container">
          <span className="section-label">Common questions</span>
          <h2 className="section-title">Got questions?</h2>

          <div className="faq-grid">
            <div className="faq-item">
              <div className="faq-q">Is VARS available outside Lagos?</div>
              <p className="faq-a">
                We&apos;re launching in Lagos first. Abuja and Port Harcourt are next.
                Register now and we&apos;ll let you know when we expand to your city.
              </p>
            </div>
            <div className="faq-item">
              <div className="faq-q">How do I become a vendor?</div>
              <p className="faq-a">
                Register your interest above, then download the VARS app to complete
                your KYC verification and set up your profile.
              </p>
            </div>
            <div className="faq-item">
              <div className="faq-q">What is the Pioneer commission deal?</div>
              <p className="faq-a">
                Pioneers keep 100% of their earnings for their first 3 completed
                bookings. After that, the standard 80/20 split applies — you keep 80%.
              </p>
            </div>
            <div className="faq-item">
              <div className="faq-q">How does escrow payment work?</div>
              <p className="faq-a">
                Customers pay when they book. Funds are held securely until they
                confirm the service is complete (or 2 hours pass automatically).
                Then your share is instantly transferred to your bank account.
              </p>
            </div>
            <div className="faq-item">
              <div className="faq-q">Do I need any equipment?</div>
              <p className="faq-a">
                Just your tools and a smartphone. VARS provides the app, the customers,
                the booking management, and the payment infrastructure.
              </p>
            </div>
            <div className="faq-item">
              <div className="faq-q">When does the app launch?</div>
              <p className="faq-a">
                Very soon. Register now to secure your Pioneer spot and be
                among the first vendors live on the platform when we open to customers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer>
        <p style={{ marginBottom: 8 }}>
          <strong>VARS</strong> &nbsp;·&nbsp; Beauty at your door.
        </p>
        <p>
          <a href="mailto:support@bookwithvars.com">support@bookwithvars.com</a>
          &nbsp;&nbsp;·&nbsp;&nbsp;
          <a href="/privacy">Privacy</a>
          &nbsp;&nbsp;·&nbsp;&nbsp;
          <a href="/terms">Terms</a>
        </p>
        <p style={{ marginTop: 16 }}>
          &copy; {new Date().getFullYear()} VARS. All rights reserved.
        </p>
      </footer>
    </>
  );
}
