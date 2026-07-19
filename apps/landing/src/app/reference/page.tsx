import type { Metadata } from 'next';
import { ReferenceApp } from './ReferenceApp';

// Not linked from any page and deliberately excluded from sitemap.ts - reachable
// only by direct URL. noindex/nofollow since part of the content (Board audience)
// is governance/cap-table detail not meant for public discovery, even though the
// password gate itself is client-side friction, not real access control.
export const metadata: Metadata = {
  title: 'VARS Reference',
  robots: { index: false, follow: false },
};

export default function ReferencePage() {
  return <ReferenceApp />;
}
