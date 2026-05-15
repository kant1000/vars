// ============================================================
// VARS Admin — Login
// ============================================================
'use client';
import { useState } from 'react';
import { loginAction } from './actions';

export default function LoginPage() {
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await loginAction(new FormData(e.currentTarget));
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success, loginAction redirects — no further action needed
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '40px 36px', width: '100%', maxWidth: 380,
      }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <img src="/admin-sidebar.svg" alt="VARS" style={{ height: 32, width: 'auto', marginBottom: 16 }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Admin sign in</h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
              Email
            </label>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
              Password
            </label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
            />
          </div>

          {error && (
            <div style={{ background: '#fff1f1', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#b91c1c' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ marginTop: 4, padding: '11px 0', fontSize: 14 }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
