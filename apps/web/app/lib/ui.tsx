'use client';

import { useEffect, useState } from 'react';

// --- agent identity ---------------------------------------------------------
export type Role = 'owner' | 'cfo' | 'payroll' | 'procurement' | 'creative';

export const AGENTS: Record<string, { color: string; label: string; img: string }> = {
  owner: { color: '#22D3EE', label: 'Owner', img: '/assets/brand/aliran-symbol.png' },
  cfo: { color: '#8B5CF6', label: 'CFO', img: '/assets/agents/cfo.png' },
  payroll: { color: '#2DD4BF', label: 'Payroll', img: '/assets/agents/payroll.png' },
  procurement: { color: '#F59E0B', label: 'Procurement', img: '/assets/agents/procurement.png' },
  creative: { color: '#EC4899', label: 'Creative', img: '/assets/agents/creative.png' },
};

export function agentColor(role?: string): string {
  return AGENTS[role ?? '']?.color ?? '#8B949E';
}

// --- formatting -------------------------------------------------------------
export function short(a?: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
}

export function explorer(hash?: string): string {
  return hash ? `https://sepolia.basescan.org/tx/${hash}` : '#';
}

/** Compact USDC amount, always mono-friendly. */
export function usdc(n?: number): string {
  if (n == null) return '';
  return Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/\.?0+$/, '');
}

export function relTime(ts?: number): string {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// --- reduced motion ---------------------------------------------------------
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

// --- brand symbol (inline SVG flow-mark; works without any asset) -----------
export function BrandSymbol({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="aliran-g" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#22D3EE" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#0E151C" stroke="#232B36" />
      <path d="M6 11c5 0 5 4 10 4s5-4 10-4" stroke="url(#aliran-g)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M6 17c5 0 5 4 10 4s5-4 10-4" stroke="url(#aliran-g)" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
      <path d="M6 23c5 0 5 3 10 3s5-3 10-3" stroke="url(#aliran-g)" strokeWidth="2.4" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

/**
 * Circular agent avatar with the agent-color ring. Tries the asset PNG; if it's
 * missing (404/error) it gracefully falls back to a colored monogram so the
 * build/render never breaks. Drop real PNGs at /assets/agents/<role>.png later.
 */
export function AgentAvatar({ role, size = 36, ring = true }: { role: string; size?: number; ring?: boolean }) {
  const [broken, setBroken] = useState(false);
  const a = AGENTS[role] ?? { color: '#8B949E', label: role, img: '' };
  const inner = size - (ring ? 4 : 0);
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        boxShadow: ring ? `0 0 0 2px ${a.color}` : undefined,
        background: '#0E151C',
      }}
    >
      {!broken && a.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={a.img}
          alt={a.label}
          width={inner}
          height={inner}
          onError={() => setBroken(true)}
          className="rounded-full object-cover"
          style={{ width: inner, height: inner }}
        />
      ) : role === 'owner' ? (
        <BrandSymbol size={Math.round(inner * 0.8)} />
      ) : (
        <span
          className="flex items-center justify-center rounded-full font-display text-xs font-semibold"
          style={{ width: inner, height: inner, background: `${a.color}22`, color: a.color }}
        >
          {a.label.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

/** Generic image with a colored placeholder fallback (never breaks the layout). */
export function AssetImg({
  src,
  alt,
  className,
  fallbackClass = 'bg-gradient-to-br from-cyan/20 to-creative/20',
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackClass?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className={`flex items-center justify-center text-[11px] text-muted ${fallbackClass} ${className ?? ''}`}>
        {alt}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setBroken(true)} className={className} />;
}
