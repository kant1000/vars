// ============================================================
// VARS — AI handoff platform config for Customer Care
// Colors are each platform's recognisable single accent color, not
// a traced logo (avoids embedding six trademarked, frequently-revised
// brand assets). buildUrl uses each platform's best-known prefill
// query param; not all of these are documented/guaranteed to persist,
// which is why the caller always falls back to a clipboard copy too.
// ============================================================

export interface AIPlatform {
  id: string;
  name: string;
  monogram: string;
  color: string;
  buildUrl: (message: string) => string;
}

export const AI_PLATFORMS: AIPlatform[] = [
  {
    id: 'claude',
    name: 'Claude',
    monogram: 'C',
    color: '#D97757',
    buildUrl: (message) => `https://claude.ai/new?q=${encodeURIComponent(message)}`,
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    monogram: 'G',
    color: '#10A37F',
    buildUrl: (message) => `https://chatgpt.com/?q=${encodeURIComponent(message)}`,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    monogram: 'G',
    color: '#4285F4',
    buildUrl: (message) => `https://gemini.google.com/app?q=${encodeURIComponent(message)}`,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    monogram: 'P',
    color: '#20808D',
    buildUrl: (message) => `https://www.perplexity.ai/search?q=${encodeURIComponent(message)}`,
  },
  {
    id: 'copilot',
    name: 'Copilot',
    monogram: 'C',
    color: '#0FA0EA',
    buildUrl: (message) => `https://copilot.microsoft.com/?q=${encodeURIComponent(message)}`,
  },
  {
    id: 'grok',
    name: 'Grok',
    monogram: 'X',
    color: '#000000',
    buildUrl: (message) => `https://grok.com/?q=${encodeURIComponent(message)}`,
  },
];
