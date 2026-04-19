// ============================================================
// VARS — Fetch with retry + timeout
// 3 attempts, 8 s timeout each, silent exponential backoff.
// ============================================================
const TIMEOUT_MS  = 8_000;
const MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
): Promise<Response> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1_000 * Math.pow(2, attempt - 1)); // 1 s, 2 s

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      // AbortError means timeout — retry silently
    }
  }

  throw lastErr ?? new Error('Network request failed');
}
