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
  badgeTopRated: '#F59E0B',
  badgeVerified: '#22C55E',
  badgeNew: '#6B7280',

  // Star rating
  star: '#F59E0B',
  starEmpty: '#E8E8E8',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.2)',
} as const;

export type ColorKey = keyof typeof Colors;
