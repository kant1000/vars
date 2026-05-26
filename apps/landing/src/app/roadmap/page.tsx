import type { Metadata } from 'next';
import { phases } from './data/milestones';
import { TimelineCard } from './components/TimelineCard';
import { PhaseLabel } from './components/PhaseLabel';
import { PhaseBanner } from './components/PhaseBanner';
import { StatBar } from './components/StatBar';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Roadmap — VARS',
  description:
    "How VARS is building Lagos's first on-demand beauty and grooming marketplace. Supply first. Market opens July 2026.",
  alternates: { canonical: '/roadmap' },
};

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

export default async function RoadmapPage() {
  const vendorCount = await getVendorCount();

  // Compute global stagger index for each milestone across all phases
  let globalIdx = 0;
  const countLabel = vendorCount > 0 ? vendorCount.toLocaleString() : '—';
  const phasesWithIndex = phases.map((phase) => ({
    ...phase,
    milestones: phase.milestones.map((m) => ({
      ...m,
      staggerIndex: globalIdx++,
      description: m.description.replace('{vendorCount}', countLabel),
    })),
  }));

  return (
    <div className="roadmap-page">
      <nav>
        <a href="/" aria-label="Back to VARS home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.svg" alt="VARS" style={{ height: 28, width: 'auto' }} />
        </a>
        <a href="/#stylists" className="nav-cta">Join as a stylist</a>
      </nav>

      {/* Section 1 — Narrative Header */}
      <section className="rm-hero">
        <div className="container">
          <h1>Building VARS.</h1>
          <p className="rm-hero-sub">
            Supply first. Trust infrastructure locked. Market opens July 2026.
          </p>
        </div>
      </section>

      {/* Section 2 — Phase Banner */}
      <PhaseBanner vendorCount={vendorCount} />

      <main className="rm-main">
        <div className="container">

          {/* Stat Bar — desktop only */}
          <StatBar vendorCount={vendorCount} />

          {/* Section 3 — Milestone Timeline */}
          <div className="rm-timeline">
            {phasesWithIndex.map((phase) => (
              <div key={phase.id} className="rm-phase">
                <PhaseLabel
                  label={phase.label}
                  firstCardStaggerIndex={phase.milestones[0]?.staggerIndex ?? 0}
                />
                {phase.milestones.map((milestone) => (
                  <TimelineCard
                    key={milestone.id}
                    milestone={milestone}
                    staggerIndex={milestone.staggerIndex}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Section 4 — Footer Signal */}
          <p className="rm-footer-signal">
            Last updated: May 2026 &middot; This roadmap is a living document.
          </p>

        </div>
      </main>

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
        </p>
        <p style={{ marginTop: 16 }}>
          &copy; {new Date().getFullYear()} VARS. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
