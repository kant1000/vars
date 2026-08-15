// ============================================================
// VARS — Vendor KYC liveness widget
// Serves a static HTML page embedding Youverify's Passive Liveness Web SDK,
// opened inside the mobile app's WebView during vendor onboarding step 4.
//
// This lives on the landing app (not a Supabase Edge Function) because
// Supabase's Edge Functions platform forces GET responses to
// Content-Type: text/plain with a locked-down CSP sandbox — a deliberate
// anti-XSS guardrail that blocks serving browser-navigable HTML from an
// edge function entirely (confirmed live, 2026-08-15: curl -I showed
// text/html, but an actual GET always came back text/plain regardless of
// what the function set). Next.js route handlers have no such restriction.
//
// sessionId + token (Youverify's authToken, used as the SDK's sessionToken)
// are generated server-side by supabase/functions/vendor-kyc-init (using
// the Youverify secret API key) and passed through as query params, along
// with whether they were generated against sandbox or live. The SDK defaults
// to sandboxEnvironment: true, so live api.youverify.co credentials must pass
// sandboxEnvironment: false or the SDK rejects the session before camera
// activation. firstName/lastName are included because user.firstName is a
// required constructor field. The SDK itself only needs the PUBLIC merchant
// key (constructor field name: publicKey), which is safe to embed directly
// (it identifies the merchant, not a secret). tasks: [{id:'passive'}] is
// also required — the SDK throws "Tasks cannot be empty" without it
// (confirmed live, 2026-08-15 — passive liveness is the only documented
// task type as of writing).
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

const YOUVERIFY_PUBLIC_MERCHANT_KEY =
  process.env.YOUVERIFY_PUBLIC_MERCHANT_KEY ?? '69d20542692e328ab9726969';

function html(
  sessionId: string,
  token: string,
  sandboxEnvironment: boolean,
  firstName: string,
  lastName: string,
): string {
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
    const logLines = [];
    const log = (text, isErr) => {
      logLines.push((isErr ? '[err] ' : '[log] ') + text);
      const line = document.createElement('div');
      if (isErr) line.className = 'debug-err';
      line.textContent = (isErr ? '[err] ' : '[log] ') + text;
      debugEl.appendChild(line);
      debugEl.scrollTop = debugEl.scrollHeight;
    };
    const stringify = (a) => {
      // Error objects JSON.stringify to '{}' — message/stack aren't enumerable.
      if (a instanceof Error) return a.name + ': ' + a.message + (a.stack ? '\\n' + a.stack : '');
      if (a && typeof a === 'object') {
        try {
          const plain = JSON.stringify(a);
          if (plain && plain !== '{}') return plain;
        } catch {}
        // Empty-looking object (e.g. DOMException, a custom error-like shape)
        // — pull out anything that looks like a message across common shapes.
        const parts = [];
        if (a.name) parts.push('name=' + a.name);
        if (a.message) parts.push('message=' + a.message);
        if (a.code !== undefined) parts.push('code=' + a.code);
        if (a.toString && a.toString() !== '[object Object]') parts.push('toString=' + a.toString());
        return parts.length ? parts.join(' ') : Object.prototype.toString.call(a);
      }
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
      // Without this, a rejected promise (e.g. the SDK's own start() throwing
      // asynchronously) left the app hanging on the WebView forever — nothing
      // ever told it the flow had failed. Confirmed live, 2026-08-15.
      post({ type: 'liveness_failed' });
    });

    const post = (msg) => {
      const withDebug = msg.type === 'liveness_failed' ? { ...msg, debug: msg.debug ?? logLines.join('\\n') } : msg;
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(withDebug));
      log('post: ' + JSON.stringify(msg));
    };
    const setStatus = (text) => {
      const el = document.getElementById('status');
      if (el) el.textContent = text;
    };

    log('sessionId=' + ${JSON.stringify(sessionId)} + ' hasToken=' + !!${JSON.stringify(token)} + ' sandbox=' + ${JSON.stringify(sandboxEnvironment)});

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
            sandboxEnvironment: ${JSON.stringify(sandboxEnvironment)},
            publicKey: ${JSON.stringify(YOUVERIFY_PUBLIC_MERCHANT_KEY)},
            tasks: [{ id: 'passive' }],
            user: { firstName: ${JSON.stringify(firstName)}, lastName: ${JSON.stringify(lastName)} },
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
  const sandboxEnvironment = searchParams.get('sandbox') === 'true';
  const firstName = searchParams.get('firstName') ?? '';
  const lastName = searchParams.get('lastName') ?? '';

  return new NextResponse(html(sessionId, token, sandboxEnvironment, firstName, lastName), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
