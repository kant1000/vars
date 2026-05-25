// ============================================================
// VARS Admin — Marketing Email
// ============================================================
import { requireAdmin }     from '@/lib/auth';
import { redirect }         from 'next/navigation';
import MarketingCompose     from './MarketingCompose';

export default async function MarketingPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/login');

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Marketing Email</h1>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>
          Bulk email to vendor lead segments — separate from the outreach queue
        </span>
      </div>
      <MarketingCompose />
    </>
  );
}
