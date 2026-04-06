'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/vendors',   icon: '👤', label: 'Vendors'   },
  { href: '/bookings',  icon: '📋', label: 'Bookings'  },
  { href: '/disputes',  icon: '⚠️',  label: 'Disputes'  },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/admin-sidebar.svg" alt="VARS" style={{ height: 28, width: 'auto' }} />
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
    </aside>
  );
}
