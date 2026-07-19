import type { Bubble } from '../data/types';

export function ExpandPanel({ bubble }: { bubble: Bubble }) {
  return (
    <div className="ref-panel">
      <div className="ref-panel-cat">{bubble.category}</div>
      <div className="ref-panel-title">{bubble.title}</div>
      <div className="ref-panel-body">{bubble.body}</div>
    </div>
  );
}
