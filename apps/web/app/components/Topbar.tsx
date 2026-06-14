'use client';

import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import { useAppState, treasuryView } from '../lib/appState';
import { usePrefersReducedMotion } from '../lib/ui';
import { WalletButton } from './WalletButton';

function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, { duration: 0.5, ease: 'easeOut', onUpdate: (v) => setDisplay(v) });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduced]);
  const s = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toString();
  return <span className="mono tabular-nums">{s}</span>;
}

export function Topbar({ title }: { title: string }) {
  const { state } = useAppState();
  if (!state) {
    return <header className="flex h-[57px] items-center border-b border-border/70 px-6 text-sm text-muted">Loading…</header>;
  }
  const { cap, remaining } = treasuryView(state);
  const usedPct = Math.min(100, Math.max(0, ((cap - remaining) / Math.max(1, cap)) * 100));
  const live = !state.mode.mock;

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-bg/80 px-6 py-3 backdrop-blur">
      <h1 className="font-display text-lg font-semibold text-text">{title}</h1>

      <div className="flex flex-wrap items-center gap-3">
        <span className="chip">
          <span className="relative flex h-2 w-2">
            {live && <span className="absolute inline-flex h-full w-full animate-livepulse rounded-full bg-success/70" />}
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: live ? 'var(--success)' : 'var(--pending)' }} />
          </span>
          <span className={live ? 'text-success' : 'text-pending'}>{live ? 'LIVE' : 'MOCK'}</span>
        </span>

        <span className="chip">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
          Base Sepolia · <span className="mono text-text">{state.mode.chainId}</span>
        </span>

        <div className="control flex items-center gap-3 px-3 py-1.5">
          <div className="text-right leading-tight">
            <div className="label">Treasury</div>
            <div className="text-sm">
              <span className="font-semibold text-text">
                <CountUp value={remaining} decimals={remaining % 1 === 0 ? 0 : 2} />
              </span>
              <span className="text-muted"> / </span>
              <span className="mono text-muted">{cap}</span>
              <span className="ml-1 text-[10px] text-muted">USDC</span>
            </div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="w-24">
            <div className="mb-1 flex justify-between text-[10px] text-muted">
              <span>used</span>
              <span className="mono">{Math.round(usedPct)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${usedPct}%`, backgroundImage: 'linear-gradient(90deg, var(--cyan), var(--teal))' }}
              />
            </div>
          </div>
        </div>

        <WalletButton />
      </div>
    </header>
  );
}
