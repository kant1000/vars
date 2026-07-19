// AI handoff platform config for the Reference page's "Ask your AI" sheet.
// No per-platform color: the reference content's own brand-voice bubble (p05)
// states accent color is "never as a fill or background" and this shell is
// explicitly monochrome, so tiles are text-only, matching the source design.
// Kept separate from the mobile app's equivalent (constants/aiPlatforms.ts)
// since the two run in different runtimes (web vs. React Native) and aren't
// worth cross-package sharing for a single page on each side.

export interface AIPlatform {
  id: string;
  name: string;
  sub: string;
  url: string;
}

export const AI_PLATFORMS: AIPlatform[] = [
  { id: 'claude', name: 'Claude', sub: 'claude.ai', url: 'https://claude.ai/new' },
  { id: 'chatgpt', name: 'ChatGPT', sub: 'chatgpt.com', url: 'https://chatgpt.com/' },
  { id: 'gemini', name: 'Gemini', sub: 'gemini.google.com', url: 'https://gemini.google.com/' },
  { id: 'perplexity', name: 'Perplexity', sub: 'perplexity.ai', url: 'https://perplexity.ai/' },
  { id: 'copilot', name: 'Copilot', sub: 'copilot.microsoft.com', url: 'https://copilot.microsoft.com/' },
  { id: 'grok', name: 'Grok', sub: 'grok.com', url: 'https://grok.com/' },
];

export type Audience = 'partner' | 'board';

export const AI_MESSAGES: Record<Audience, string> = {
  partner:
    'You are a support assistant for VARS, an on-demand beauty and grooming marketplace in Lagos, Nigeria. ' +
    'VARS connects customers with verified barbers, hair stylists, and makeup artists who come to them. ' +
    'I am a Partner (a marketing professional, agency, lawyer, or potential collaborator working with VARS). ' +
    'When I send this message, greet me as a Partner and ask what you can help me with. ' +
    'Rules you must follow in every reply: be SUPER succinct; match the VARS tone (professional, calm, forward-momentum, no passive blame, no deficit labels); ' +
    'if you need more context search the internet but be honest about what you found versus what you know; ' +
    'if you genuinely cannot resolve my issue direct me to hello@bookwithvars.com.',
  board:
    'You are a support assistant for VARS, an on-demand beauty and grooming marketplace in Lagos, Nigeria. ' +
    'I am a Board member reviewing platform documentation. When I send this message, greet me accordingly and ask what you can help me with. ' +
    'Rules: be SUPER succinct; if you need more context search the internet but be honest about what you found versus what you know; ' +
    'if you cannot resolve my question direct me to hello@bookwithvars.com.',
};
