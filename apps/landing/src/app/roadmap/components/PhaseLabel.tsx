interface Props {
  label: string;
  // Phase labels fade in 100ms before their first card's stagger delay
  firstCardStaggerIndex: number;
}

export function PhaseLabel({ label, firstCardStaggerIndex }: Props) {
  const delay = Math.max(0, firstCardStaggerIndex * 60 - 100);

  return (
    <div
      className="rm-phase-label"
      style={{ animationDelay: `${delay}ms` }}
    >
      {label}
    </div>
  );
}
