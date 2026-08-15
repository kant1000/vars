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
//
// TEMP: on-page debug log panel (bottom overlay) — this SDK integration
// was pieced together from partial npm README fragments (no devtools
// access on the test device to see real console errors), so every
// console.*/window.onerror/unhandledrejection is mirrored on-screen until
// the flow is confirmed working end-to-end. Remove once verified.
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
      color: #fff; font-family: -apple-system, Roboto, sans-serif; font-size: 14px;
      text-align: center; padding: 12px 16px; box-sizing: border-box;
    }
    #debug {
      position: fixed; left: 0; right: 0; bottom: 0; max-height: 45vh; overflow-y: auto;
      background: rgba(0,0,0,0.85); color: #0f0; font-family: monospace; font-size: 11px;
      padding: 8px; box-sizing: border-box; white-space: pre-wrap; word-break: break-all;
      border-top: 1px solid #333;
    }
    .debug-err { color: #f66; }
  </style>
</head>
<body>
  <div id="status">Loading identity check…</div>
  <div id="debug"></div>
  <script type="module">
    const debugEl = document.getElementById('debug');
    const log = (text, isErr) => {
      const line = document.createElement('div');
      if (isErr) line.className = 'debug-err';
      line.textContent = (isErr ? '[err] ' : '[log] ') + text;
      debugEl.appendChild(line);
      debugEl.scrollTop = debugEl.scrollHeight;
    };
    const stringify = (a) => {
      try { return typeof a === 'string' ? a : JSON.stringify(a); }
      catch { return String(a); }
    };
    ['log', 'warn', 'error'].forEach((level) => {
      const orig = console[level];
      console[level] = (...args) => {
        log(args.map(stringify).join(' '), level === 'error');
        orig.apply(console, args);
      };
    });
    window.onerror = (msg, src, line, col, err) => {
      log('window.onerror: ' + msg + ' @' + line + ':' + col + (err && err.stack ? '\\n' + err.stack : ''), true);
    };
    window.addEventListener('unhandledrejection', (e) => {
      log('unhandledrejection: ' + stringify(e.reason), true);
    });

    const post = (msg) => {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      log('post: ' + JSON.stringify(msg));
    };
    const setStatus = (text) => {
      const el = document.getElementById('status');
      if (el) el.textContent = text;
    };

    log('sessionId=' + ${JSON.stringify(sessionId)} + ' hasToken=' + !!${JSON.stringify(token)});

    if (!${JSON.stringify(sessionId)} || !${JSON.stringify(token)}) {
      setStatus('Missing verification session. Please go back and try again.');
      post({ type: 'liveness_failed' });
    } else {
      log('importing SDK...');
      import('https://cdn.jsdelivr.net/npm/youverify-passive-liveness-web/+esm')
        .then((mod) => {
          log('SDK module loaded, keys=' + Object.keys(mod).join(','));
          const YouverifyPassiveLiveness = mod.default ?? mod.YouverifyPassiveLiveness ?? mod;
          if (typeof YouverifyPassiveLiveness !== 'function') {
            log('YouverifyPassiveLiveness is not a constructor: ' + typeof YouverifyPassiveLiveness, true);
            setStatus('Could not load identity check (bad SDK export).');
            post({ type: 'liveness_failed' });
            return;
          }
          const yv = new YouverifyPassiveLiveness({
            sessionId: ${JSON.stringify(sessionId)},
            sessionToken: ${JSON.stringify(token)},
            publicMerchantKey: ${JSON.stringify(YOUVERIFY_PUBLIC_MERCHANT_KEY)},
            onSuccess: (result) => {
              log('onSuccess: ' + stringify(result));
              setStatus('Done.');
              post({ type: 'liveness_success', faceImage: result?.faceImage ?? null });
            },
            onFailure: (err) => {
              log('onFailure: ' + stringify(err), true);
              setStatus('Identity check failed.');
              post({ type: 'liveness_failed' });
            },
          });
          log('SDK instance created, calling start()...');
          setStatus('');
          yv.start();
          log('start() called.');
        })
        .catch((err) => {
          log('SDK import failed: ' + stringify(err && err.message ? err.message : err), true);
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
