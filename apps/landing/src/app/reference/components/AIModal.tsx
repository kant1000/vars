'use client';
import { useEffect, useRef, useState } from 'react';
import { AI_PLATFORMS, AI_MESSAGES, type Audience } from '../data/aiPlatforms';

export function AIModal({
  open,
  onClose,
  audience,
}: {
  open: boolean;
  onClose: () => void;
  audience: Audience;
}) {
  const [doneId, setDoneId] = useState<string | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setDoneId(null);
      copyMessage();
    }
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, audience]);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(AI_MESSAGES[audience]);
    } catch {
      // Clipboard API can fail (permissions, insecure context) - nothing further to
      // do here, the tiles still open the AI site, the user just pastes manually.
    }
  };

  const handleTile = (id: string, url: string) => {
    setDoneId(id);
    copyMessage();
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = setTimeout(() => window.open(url, '_blank'), 200);
  };

  if (!open) return null;

  return (
    <div className="ref-modal-bg" onClick={onClose}>
      <div className="ref-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ref-modal-top">
          <div className="ref-modal-title">Ask your AI</div>
          <button className="ref-modal-x" onClick={onClose} aria-label="Close">
            &#x2715;
          </button>
        </div>
        <p className="ref-modal-hint">The context prompt is already in your clipboard. Open any AI below and paste.</p>
        <div className="ref-ai-grid">
          {AI_PLATFORMS.map((p) => (
            <div
              key={p.id}
              className={`ref-ai-tile${doneId === p.id ? ' ref-ai-tile-done' : ''}`}
              onClick={() => handleTile(p.id, p.url)}
            >
              <div className="ref-ai-name">{p.name}</div>
              <div className="ref-ai-sub">{doneId === p.id ? 'Copied ✓' : p.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
