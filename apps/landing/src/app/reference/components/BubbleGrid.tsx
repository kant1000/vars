import { ExpandPanel } from './ExpandPanel';
import type { Bubble } from '../data/types';

interface Props {
  bubbles: Bubble[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function BubbleGrid({ bubbles, selectedId, onSelect }: Props) {
  const items: React.ReactNode[] = [];
  let currentCat: string | null = null;

  bubbles.forEach((b) => {
    if (b.category !== currentCat) {
      currentCat = b.category;
      items.push(
        <div key={`sec-${b.category}`} className="ref-bub-sec">
          {b.category}
        </div>
      );
    }
    const selected = selectedId === b.id;
    items.push(
      <button
        key={b.id}
        className={`ref-bub${selected ? ' ref-bub-sel' : ''}`}
        onClick={() => onSelect(b.id)}
      >
        {b.title}
      </button>
    );
    // Full-width flex item: breaks to its own line right after whichever
    // row the selected bubble lands in, at any viewport width, with no
    // need to track rows ourselves.
    if (selected) {
      items.push(<ExpandPanel key={`panel-${b.id}`} bubble={b} />);
    }
  });

  return <div className="ref-bub-wrap">{items}</div>;
}
