'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandSymbol, short } from '../lib/ui';
import { useWallet } from '../lib/wallet';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '◧' },
  { href: '/report', label: 'Report', icon: '◳' },
  { href: '/audit', label: 'Audit Log', icon: '☰' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar() {
  const pathname = usePathname();
  const w = useWallet();

  return (
    <aside className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-border bg-surface/40">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <BrandSymbol size={28} />
        <div className="leading-none">
          <div className="wordmark text-lg">Aliran</div>
          <div className="mt-0.5 text-[10px] text-muted">Treasury OS</div>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {NAV.map((n) => {
          const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-control px-3 py-2 text-sm transition ${
                active ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2/60 hover:text-text'
              }`}
            >
              <span
                className="w-4 text-center text-xs"
                style={active ? { color: 'var(--cyan)' } : undefined}
              >
                {n.icon}
              </span>
              {n.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-4 py-3 text-xs">
        <div className="label mb-1">Wallet</div>
        {w.account ? (
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${w.isBaseSepolia ? 'bg-success' : 'bg-danger'}`} />
            <span className="mono text-text">{short(w.account)}</span>
            {!w.isBaseSepolia && (
              <button onClick={() => w.switchToBaseSepolia()} className="ml-auto text-[10px] text-danger hover:underline">
                wrong net
              </button>
            )}
          </div>
        ) : w.available ? (
          <button onClick={() => w.connect()} className="text-link hover:underline">
            Connect MetaMask
          </button>
        ) : (
          <span className="text-muted">MetaMask not detected</span>
        )}
      </div>
    </aside>
  );
}
