// ============================================================
// VARS — Vendor KYC liveness widget
// Serves a static HTML page embedding Youverify's Passive Liveness Web SDK,
// opened inside the mobile app's WebView during vendor onboarding step 4.
//
// This lives on the landing app (not a Supabase Edge Function) because
// Supabase's Edge Functions platform forces GET responses to
// Content-Type: text/plain with a locked-down CSP sandbox — a deliberate
// anti-XSS guardrail that blocks serving browser-navigable HTML from an
// edge function entirely (confirmed live, 2026-08-16: curl -I showed
// text/html, but an actual GET always came back text/plain regardless of
// what the function set). Next.js route handlers have no such restriction.
//
// sessionId + token (Youverify's authToken, used as the SDK's sessionToken)
// are generated server-side by supabase/functions/vendor-kyc-init (using
// the Youverify secret API key) and passed through as query params. The
// SDK itself only needs the PUBLIC merchant key, which is safe to embed
// directly (it identifies the merchant, not a secret).
//
// Results are bridged back to the RN WebView via
// window.ReactNativeWebView.postMessage — apps/mobile's step-4-kyc.tsx
// listens for { type: 'liveness_success', faceImage } or
// { type: 'liveness_failed' }.
// ============================================================
import { NextResponse } from 'next/server';

const YOUVERIFY_PUBLIC_MERCHANT_KEY = '69d20542692e328ab9726969';

function html(sessionId: string, token: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Identity check</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #000; }
    #status {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      color: #fff; font-family: -apple-system, Roboto, sans-serif; font-size: 15px;
      text-align: center; padding: 24px; box-sizing: border-box;
    }
  </style>
</head>
<body>
  <div id="status">Loading identity check…</div>
  <script type="module">
    const post = (msg) => {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    };
    const setStatus = (text) => {
      const el = document.getElementById('status');
      if (el) el.textContent = text;
    };

    if (!${JSON.stringify(sessionId)} || !${JSON.stringify(token)}) {
      setStatus('Missing verification session. Please go back and try again.');
      post({ type: 'liveness_failed' });
    } else {
      import('https://cdn.jsdelivr.net/npm/youverify-passive-liveness-web/+esm')
        .then(({ default: YouverifyPassiveLiveness }) => {
          const yv = new YouverifyPassiveLiveness({
            sessionId: ${JSON.stringify(sessionId)},
            sessionToken: ${JSON.stringify(token)},
            publicMerchantKey: ${JSON.stringify(YOUVERIFY_PUBLIC_MERCHANT_KEY)},
            onSuccess: (result) => {
              setStatus('Done.');
              post({ type: 'liveness_success', faceImage: result?.faceImage ?? null });
            },
            onFailure: () => {
              setStatus('Identity check failed.');
              post({ type: 'liveness_failed' });
            },
          });
          setStatus('');
          yv.start();
        })
        .catch((err) => {
          setStatus('Could not load identity check. Please try again.');
          post({ type: 'liveness_failed' });
        });
    }
  </script>
</body>
</html>`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') ?? '';
  const token = searchParams.get('token') ?? '';

  return new NextResponse(html(sessionId, token), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
