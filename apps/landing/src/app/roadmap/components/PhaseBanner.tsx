interface Props {
  vendorCount: number;
}

export function PhaseBanner({ vendorCount }: Props) {
  const countDisplay = vendorCount > 0 ? vendorCount.toLocaleString() : '—';

  return (
    <div className="rm-phase-banner">
      <div className="container">
        <div className="rm-phase-banner-meta">
          <span className="rm-phase-banner-now">Now</span>
          <span className="rm-phase-banner-dot" aria-hidden="true">·</span>
          <span className="rm-phase-banner-date">May 2026</span>
        </div>
        <p className="rm-phase-banner-text">
          Building supply.{' '}
          <strong className="rm-phase-banner-count">{countDisplay}</strong>
          {' '}vendors in pipeline. App store launch: July.
        </p>
      </div>
    </div>
  );
}
