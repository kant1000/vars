import { supabase } from './supabase';
import {
  DOCUMENT_VERSIONS,
  CUSTOMER_REQUIRED_DOCS,
  VENDOR_REQUIRED_DOCS,
  type DocumentType,
} from '@/constants/terms';

/**
 * Returns true if the user has accepted all required documents at the current version.
 * One DB query per cold start — only called for authenticated users before tab routing.
 */
export async function hasAcceptedCurrentTerms(
  userId: string,
  userType: 'customer' | 'vendor'
): Promise<boolean> {
  const required: DocumentType[] =
    userType === 'vendor' ? VENDOR_REQUIRED_DOCS : CUSTOMER_REQUIRED_DOCS;

  const { data } = await supabase
    .from('terms_acceptances')
    .select('document_type, document_version')
    .eq('user_id', userId);

  if (!data) return false;

  return required.every((docType) =>
    data.some(
      (r) =>
        r.document_type === docType &&
        r.document_version === DOCUMENT_VERSIONS[docType]
    )
  );
}
