// VARS brand colours
export const Colors = {
  primary: '#0A7AFF',       // VARS blue
  primaryDark: '#0060CC',
  primaryLight: '#E8F2FF',

  background: '#FFFFFF',
  surface: '#F5F5F5',
  border: '#E8E8E8',

  text: '#111111',
  textSecondary: '#6B7280',
  textMuted: '#A3A3A3',
  textOnPrimary: '#FFFFFF',

  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',

  // Booking status colours
  statusPending: '#F59E0B',
  statusAccepted: '#22C55E',
  statusOnWay: '#0A7AFF',
  statusArrived: '#8B5CF6',
  statusCompleted: '#22C55E',
  statusCancelled: '#EF4444',
  statusExpired: '#A3A3A3',
  statusDisputed: '#EF4444',

  // Badge colours
  badgeVarsChoice: '#0A7AFF',
  badgeTopRated: '#22C55E',
  badgeVerified: '#22C55E',
  badgeNew: '#6B7280',

  // Star rating
  star: '#F59E0B',
  starEmpty: '#E8E8E8',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.2)',

  // Pioneer & auto-accept gold theme
  pioneerGold: '#D4A017',
  pioneerGoldDark: '#A07010',
  pioneerGoldDeep: '#7A6000',
  pioneerGoldSurface: '#FFF8E6',
  badgePioneer: '#B8860B',

  // Offline banner & amber warning surfaces
  offlineBg: '#92400E',
  offlineText: '#FEF3C7',
  amberBorder: '#D97706',

  // Inactive onboarding dot
  dotInactive: '#D0D0D0',

  // ── Monochrome design system ──────────────────────────────────
  // Core shell — use these for all containers, borders, text
  ink:      '#111111',   // primary text, borders, filled CTAs, active icons
  inkMuted: '#6B7280',   // secondary text, inactive nav labels
  inkFaint: '#D0D0D0',   // available/unselected slot borders, disabled dividers
  white:    '#FFFFFF',   // text on filled black elements

  // Accent glyphs — tiny icons/dots ONLY, never fills or borders
  accentBlue:  '#0A7AFF',  // booked dot
  accentAmber: '#F59E0B',  // auto-accept ⚡ icon
  accentGreen: '#22C55E',  // online dot, active zone dot
  accentRed:   '#EF4444',  // blocked ✕ icon
} as const;

export type ColorKey = keyof typeof Colors;

// ── Design system token ────────────────────────────────────────
// All borderRadius values in the app must use this. No other values allowed.
export const BORDER_RADIUS = 5;
