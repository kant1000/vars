// Document version strings for clickwrap acceptance tracking.
// Bump a version string to require reacceptance on next cold start.
// Keys must mirror the document_type enum in supabase/functions/_shared/constants.ts.

export const DOCUMENT_VERSIONS = {
  customer_terms:        '2026-07-13',
  privacy_policy:        '2026-07-13',
  vendor_terms:          '2026-07-13',
  vendor_privacy_policy: '2026-07-13',
} as const;

export type DocumentType = keyof typeof DOCUMENT_VERSIONS;

export const CUSTOMER_REQUIRED_DOCS: DocumentType[] = [
  'customer_terms',
  'privacy_policy',
];

export const VENDOR_REQUIRED_DOCS: DocumentType[] = [
  'vendor_terms',
  'vendor_privacy_policy',
];
