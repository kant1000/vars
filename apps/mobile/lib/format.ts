export { fmtPrice, fmtDuration, fmtTime, fmtDate, fmtLongDate, fmtDateTime } from '@vars/shared';

// Strips phone-number patterns from customer-visible free-text fields
// (bio, service name, service description). Rules: no @, no 5+ consecutive
// digits (years like 2025 are 4 digits and pass), no 7+ digit cluster with
// spaces/dashes between groups, max 8 total digits as a final backstop.
export function sanitizeContent(text: string, maxLen: number): string {
  let t = text
    .replace(/@/g, '')
    .replace(/(\d[\s.\-]{0,2}){7,}/g, '')
    .replace(/\d{5,}/g, '');
  let count = 0;
  t = t.split('').filter(c => {
    if (/\d/.test(c)) { count++; return count <= 8; }
    return true;
  }).join('');
  return t.slice(0, maxLen);
}
