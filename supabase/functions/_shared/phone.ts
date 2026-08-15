// Mirror of packages/shared/src/phone.ts — keep in sync manually
// Only the NG-only path is needed backend-side (landing-page lead capture
// has no country selector — everything there is implicitly Nigerian).

const NG_LOCAL_PATTERN = /^[789]\d{9}$/; // NG mobile prefixes: 070/080/081/090/091 etc.

/**
 * Normalise a Nigerian phone number to E.164 (+234XXXXXXXXXX). Uses the last
 * 10 digits typed/pasted, so it doesn't matter whether the input included a
 * leading 0, "234", or "+234". Returns null if it doesn't resolve to a valid
 * NG mobile number.
 */
export function normalizeNigerianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10 || !NG_LOCAL_PATTERN.test(digits)) return null;
  return `+234${digits}`;
}
