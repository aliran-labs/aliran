'use client';

import { useWallet } from '../lib/wallet';
import { short } from '../lib/ui';

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const w = useWallet();

  if (!w.available) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="btn btn-ghost text-xs"
        title="MetaMask not detected"
      >
        Install MetaMask
      </a>
    );
  }

  if (!w.account) {
    return (
      <button onClick={() => w.connect()} disabled={w.connecting} className="btn btn-primary text-xs">
        {w.connecting ? 'Connecting…' : '🦊 Connect MetaMask'}
      </button>
    );
  }

  // connected
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : ''}`}>
      {!w.isBaseSepolia ? (
        <button onClick={() => w.switchToBaseSepolia()} className="btn btn-danger text-xs" title="Wrong network">
          ⚠ Switch to Base Sepolia
        </button>
      ) : (
        <span className="chip">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span className="mono text-text">{short(w.account)}</span>
        </span>
      )}
    </div>
  );
}
