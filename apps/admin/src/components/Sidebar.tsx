'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/login/actions';
import VarsLogo from './VarsLogo';

const NAV = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/vendors',   icon: '👤', label: 'Vendors'   },
  { href: '/bookings',  icon: '📋', label: 'Bookings'  },
  { href: '/disputes',  icon: '⚠️',  label: 'Disputes'  },
  { href: '/leads/outreach', icon: '📣', label: 'Outreach'  },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <VarsLogo height={28} />
      </div>
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`sidebar-link${path.startsWith(n.href) ? ' active' : ''}`}
        >
          <span className="icon">{n.icon}</span>
          {n.label}
        </Link>
      ))}
      <form action={logoutAction} style={{ marginTop: 'auto' }}>
        <button
          type="submit"
          className="sidebar-link"
          style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span className="icon">↩</span>
          Sign out
        </button>
      </form>
    </aside>
  );
}
