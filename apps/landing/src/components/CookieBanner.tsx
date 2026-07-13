'use client';
// Cookie notice for bookwithvars.com.
// The site uses only strictly necessary cookies (Supabase Auth session + Vercel hosting).
// This banner is informational — there is nothing to accept or reject.
// If VARS ever introduces non-essential cookies, this must be replaced with a full
// consent mechanism before any new trackers are activated.
import { useState, useEffect } from 'react';

const COOKIE_NAME  = 'vars_cookie_consent';
const MAX_AGE_SECS = 60 * 60 * 24 * 365; // 1 year

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(name + '='))
    ?.split('=')[1];
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getCookie(COOKIE_NAME)) setVisible(true);
  }, []);

  const dismiss = () => {
    setCookie(COOKIE_NAME, 'acknowledged', MAX_AGE_SECS);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: '#111111',
        color: '#ffffff',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        fontSize: 13,
        lineHeight: '1.5',
      }}
    >
      <span>
        This site uses only essential cookies to function.{' '}
        <a
          href="/cookie-policy"
          style={{ color: '#ffffff', textDecoration: 'underline' }}
        >
          Cookie policy
        </a>
      </span>
      <button
        onClick={dismiss}
        style={{
          background: '#ffffff',
          color: '#111111',
          border: 'none',
          borderRadius: 4,
          padding: '7px 18px',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Got it
      </button>
    </div>
  );
}
