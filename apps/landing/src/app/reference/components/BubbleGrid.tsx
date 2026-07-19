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
    items.push(
      <button
        key={b.id}
        className={`ref-bub${selectedId === b.id ? ' ref-bub-sel' : ''}`}
        onClick={() => onSelect(b.id)}
      >
        {b.title}
      </button>
    );
  });

  return <div className="ref-bub-wrap">{items}</div>;
}
