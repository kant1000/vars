'use client';
import { useEffect, useState } from 'react';

export default function ProgressBar() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      const total = scrollHeight - clientHeight;
      setPct(total > 0 ? (scrollTop / total) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return <div className="progress-bar" style={{ width: `${pct}%` }} />;
}
