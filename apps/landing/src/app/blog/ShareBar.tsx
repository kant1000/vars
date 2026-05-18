'use client';
import { useState } from 'react';

const SITE = 'https://www.bookwithvars.com';

export default function ShareBar({ title, slug }: { title: string; slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${SITE}/blog/${slug}`;
  const enc = encodeURIComponent(url);
  const txt = encodeURIComponent(title);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="share-bar">
      <span className="share-label">Share</span>
      <a
        href={`https://wa.me/?text=${txt}%20${enc}`}
        target="_blank"
        rel="noopener noreferrer"
        className="share-btn share-wa"
      >
        WhatsApp
      </a>
      <a
        href={`https://twitter.com/intent/tweet?text=${txt}&url=${enc}`}
        target="_blank"
        rel="noopener noreferrer"
        className="share-btn share-tw"
      >
        X / Twitter
      </a>
      <button onClick={copy} className="share-btn share-copy">
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}
