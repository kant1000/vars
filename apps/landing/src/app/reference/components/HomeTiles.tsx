import Image from 'next/image';

export function HomeTiles({ onPartner, onBoard }: { onPartner: () => void; onBoard: () => void }) {
  return (
    <div className="ref-home">
      <div className="ref-home-inner">
        <div className="ref-home-logo">
          <Image src="/logo.svg" alt="VARS" width={130} height={31} />
        </div>
        <p className="ref-home-sub">On-demand beauty. Lagos, Nigeria.</p>
        <div className="ref-tiles">
          <button className="ref-tile" onClick={onPartner}>
            <div className="ref-tile-lbl">Open</div>
            <div className="ref-tile-row">
              <div className="ref-tile-title">Partners</div>
              <div className="ref-tile-arr">&rarr;</div>
            </div>
            <div className="ref-tile-desc">Marketing, legal, and collaborators. No password required.</div>
          </button>
          <button className="ref-tile" onClick={onBoard}>
            <div className="ref-tile-lbl">Restricted</div>
            <div className="ref-tile-row">
              <div className="ref-tile-title">Board</div>
              <div className="ref-tile-arr">&rarr;</div>
            </div>
            <div className="ref-tile-desc">Board members and governance. Password protected.</div>
          </button>
        </div>
      </div>
    </div>
  );
}
