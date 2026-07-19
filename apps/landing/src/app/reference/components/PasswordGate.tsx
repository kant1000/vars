'use client';
import { useRef, useState } from 'react';
import Image from 'next/image';

export function PasswordGate({
  onBack,
  onSubmit,
}: {
  onBack: () => void;
  onSubmit: (value: string) => boolean;
}) {
  const [value, setValue] = useState('');
  const [shake, setShake] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const attempt = () => {
    const ok = onSubmit(value);
    setValue('');
    if (!ok) {
      setShake(false);
      requestAnimationFrame(() => setShake(true));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShake(false), 600);
    }
  };

  return (
    <div className="ref-gate">
      <button className="ref-gate-back" onClick={onBack} aria-label="Back">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M10 2.5L5 7.5l5 5" />
        </svg>
        Back
      </button>
      <div className="ref-gate-inner">
        <div className="ref-gate-logo">
          <Image src="/logo.svg" alt="VARS" width={110} height={26} />
        </div>
        <div className="ref-gate-lbl">Board: password required</div>
        <input
          type="password"
          className={`ref-gate-in${shake ? ' ref-gate-in-err' : ''}`}
          placeholder="••••"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') attempt();
          }}
        />
        <button className="ref-gate-btn" onClick={attempt}>
          Continue
        </button>
      </div>
    </div>
  );
}
