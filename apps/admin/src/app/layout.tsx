import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'VARS Admin',
  description: 'VARS internal dashboard',
  icons: { icon: '/admin-favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isAuth = !!cookies().get('sb-access-token')?.value;
  return (
    <html lang="en">
      <body>
        {isAuth ? (
          <div className="layout">
            <Sidebar />
            <main className="main">{children}</main>
          </div>
        ) : (
          <>{children}</>
        )}
      </body>
    </html>
  );
}
