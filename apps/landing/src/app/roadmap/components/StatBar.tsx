interface Props {
  vendorCount: number;
}

export function StatBar({ vendorCount }: Props) {
  // Fallback to — rather than 0 to stay honest (spec requirement)
  const countDisplay = vendorCount > 0 ? vendorCount.toLocaleString() : '—';

  return (
    <div className="rm-stat-bar" aria-hidden="true">
      <div className="rm-stat">
        <div className="rm-stat-number">{countDisplay}</div>
        <div className="rm-stat-label">Vendors in pipeline</div>
      </div>
      <div className="rm-stat">
        <div className="rm-stat-number">1,000</div>
        <div className="rm-stat-label">Bookings. Year 1 target.</div>
      </div>
    </div>
  );
}
