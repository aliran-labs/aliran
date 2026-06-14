'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/report': 'Monthly Report',
  '/audit': 'Audit Log',
  '/settings': 'Settings',
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? (pathname.startsWith('/report') ? 'Monthly Report' : pathname.startsWith('/audit') ? 'Audit Log' : pathname.startsWith('/settings') ? 'Settings' : 'Dashboard');
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-6">{children}</main>
      </div>
    </div>
  );
}
