import Image from 'next/image';

export function AudienceHeader({ audience, onBack }: { audience: 'Partners' | 'Board'; onBack: () => void }) {
  return (
    <header className="ref-hdr">
      <button className="ref-back" onClick={onBack} aria-label="Back">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M10 2.5L5 7.5l5 5" />
        </svg>
        Back
      </button>
      <div className="ref-hdr-logo">
        <Image src="/logo.svg" alt="VARS" width={84} height={20} />
        <span className="ref-hdr-badge">{audience}</span>
      </div>
    </header>
  );
}
