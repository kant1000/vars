'use client';
import { useEffect, useState } from 'react';

function getPct() {
  const scrolled = window.scrollY;
  const total = document.documentElement.scrollHeight - window.innerHeight;
  return total > 0 ? Math.min((scrolled / total) * 100, 100) : 0;
}

export default function ProgressBar() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const update = () => setPct(getPct());

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });

    const ro = new ResizeObserver(update);
    ro.observe(document.body);

    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, []);

  return <div className="progress-bar" style={{ width: `${pct}%` }} />;
}
