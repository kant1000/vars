// Phone number normalization — supports the 3 countries VARS onboarding accepts.
// All three (NG, US/Canada, UK) use a 10-digit local subscriber number, which
// is the invariant the "last 10 digits" rule below relies on.

export type CountryCode = '+234' | '+1' | '+44';

export const PHONE_COUNTRIES: { code: CountryCode; flag: string; label: string }[] = [
  { code: '+234', flag: '🇳🇬', label: 'Nigeria' },
  { code: '+1',   flag: '🇺🇸', label: 'US/Canada' },
  { code: '+44',  flag: '🇬🇧', label: 'UK' },
];

// Local subscriber number shape per country — all 10 digits, but the leading
// digit rule differs.
const LOCAL_PATTERN: Record<CountryCode, RegExp> = {
  '+234': /^[789]\d{9}$/, // NG mobile prefixes: 070/080/081/090/091 etc.
  '+1':   /^[2-9]\d{9}$/, // NANP: area code can't start 0 or 1
  '+44':  /^7\d{9}$/,     // UK mobile local part (leading 0 dropped)
};

/**
 * Normalise a phone number to E.164 for the given country. Uses the last 10
 * digits typed/pasted, so it doesn't matter whether the user included a
 * leading 0, the country's calling code, or just the bare local number.
 * Returns null if there aren't 10 digits or they don't match the country's
 * local-number shape.
 */
export function normalizePhone(raw: string, country: CountryCode = '+234'): string | null {
  const digits = raw.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10 || !LOCAL_PATTERN[country].test(digits)) return null;
  return `${country}${digits}`;
}

export function isValidPhone(raw: string, country: CountryCode = '+234'): boolean {
  return normalizePhone(raw, country) !== null;
}

// NG-only legacy path (landing-page vendor lead capture has no country
// selector — everything there is implicitly Nigerian).
export function normalizeNigerianPhone(raw: string): string | null {
  return normalizePhone(raw, '+234');
}
