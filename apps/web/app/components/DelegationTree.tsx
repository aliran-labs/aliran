'use client';

import { motion } from 'framer-motion';
import type { DashboardState, Delegation } from '../types';
import { AGENTS, AgentAvatar, agentColor, short, usdc } from '../lib/ui';

// Fixed topology in a 1000×600 space; HTML nodes are positioned by % of the
// same space so SVG edges (center→center, drawn behind the cards) line up at
// any size. non-scaling-stroke keeps edges crisp when the box scales.
const POS = {
  owner: { x: 500, y: 66 },
  cfo: { x: 500, y: 250 },
  payroll: { x: 176, y: 470 },
  procurement: { x: 500, y: 470 },
  creative: { x: 824, y: 470 },
} as const;
const W = 1000;
const H = 600;

const EDGES: { from: keyof typeof POS; to: keyof typeof POS; d: string }[] = [
  { from: 'owner', to: 'cfo', d: `M500,66 C500,150 500,170 500,250` },
  { from: 'cfo', to: 'payroll', d: `M500,250 C500,380 176,350 176,470` },
  { from: 'cfo', to: 'procurement', d: `M500,250 L500,470` },
  { from: 'cfo', to: 'creative', d: `M500,250 C500,380 824,350 824,470` },
];

function Ring({ pct, color, size = 34 }: { pct: number; color: string; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, Math.max(0, pct / 100)));
  return (
    <svg width={size} height={size} className="-rotate-90" aria-label={`${Math.round(pct)}% used`}>
      {/* full background track — always a complete, clearly-visible faint ring so
          a 0%-spent node reads as "0% used", never an empty/broken circle */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(139,148,158,0.28)" strokeWidth="3.5" />
      {/* colored progress arc over the track */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={false}
        animate={{ strokeDashoffset: off }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </svg>
  );
}

function NodeCard({
  role,
  deleg,
  isSource,
  onRevoke,
  busy,
}: {
  role: keyof typeof POS;
  deleg?: Delegation;
  isSource?: boolean;
  onRevoke?: (id: string) => void;
  busy: string | null;
}) {
  const color = agentColor(role);
  const present = isSource || Boolean(deleg);
  const revoked = deleg?.status === 'revoked';
  const cap = deleg?.capUsdc ?? 0;
  const spent = deleg?.spentUsdc ?? 0;
  const pct = cap > 0 ? (spent / cap) * 100 : 0;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${(POS[role].x / W) * 100}%`, top: `${(POS[role].y / H) * 100}%` }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: present ? 1 : 0.4, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={`card w-[160px] p-3 ${revoked ? 'opacity-60' : ''} ${
          !present ? 'border-dashed bg-surface/40' : ''
        }`}
        style={present && !revoked ? { boxShadow: `0 0 0 1px ${color}33, 0 8px 24px -14px ${color}66` } : undefined}
      >
        <div className="flex items-center gap-2">
          <AgentAvatar role={role} size={34} />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-display text-sm font-semibold text-text">{AGENTS[role]?.label}</div>
            {isSource ? (
              <div className="text-[10px] text-muted">treasury source</div>
            ) : present ? (
              <div className="mono truncate text-[10px] text-muted">{short(deleg?.toAddress)}</div>
            ) : (
              <div className="text-[10px] text-muted">pending</div>
            )}
          </div>
        </div>

        {present && !isSource && (
          <>
            <div className="mt-2.5 flex items-center gap-2">
              <Ring pct={pct} color={revoked ? '#F87171' : color} />
              <div className="leading-tight">
                <div className="text-[10px] text-muted">
                  cap <span className="mono text-text">{usdc(cap)}</span>
                </div>
                <div className="text-[10px] text-muted">
                  spent <span className="mono text-text">{usdc(spent)}</span>
                </div>
                <div className="text-[10px] text-muted">
                  left <span className="mono text-text">{usdc(cap - spent)}</span>
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              {revoked ? (
                <span className="pill bg-danger/15 text-danger line-through">revoked</span>
              ) : (
                <span className="pill" style={{ background: `${color}1f`, color }}>
                  {role === 'cfo' ? 'root' : 'active'}
                </span>
              )}
              {onRevoke && deleg && !revoked && (
                <button
                  disabled={!!busy}
                  onClick={() => onRevoke(deleg.id)}
                  className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted transition hover:border-danger/60 hover:text-danger disabled:opacity-30"
                >
                  revoke
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

export function DelegationTree({
  state,
  onRevoke,
  busy,
}: {
  state: DashboardState;
  onRevoke: (id: string) => void;
  busy: string | null;
}) {
  const root = state.delegations.find((d) => d.parentId === null);
  const byRole = (r: string) => state.delegations.find((d) => d.parentId && d.toRole === r);
  const has: Record<string, boolean> = {
    'owner→cfo': Boolean(root),
    'cfo→payroll': Boolean(byRole('payroll')),
    'cfo→procurement': Boolean(byRole('procurement')),
    'cfo→creative': Boolean(byRole('creative')),
  };
  const revokedEdge = (to: string) => byRole(to)?.status === 'revoked' || (to === 'cfo' && root?.status === 'revoked');

  return (
    <div className="relative w-full overflow-x-auto">
      <div className="relative mx-auto h-[420px] min-w-[560px]">
        {/* edges */}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {EDGES.map((e) => {
            const key = `${e.from}→${e.to}`;
            const present = has[key];
            const rev = revokedEdge(e.to);
            return (
              <motion.path
                key={key}
                d={e.d}
                fill="none"
                stroke={rev ? '#F87171' : 'url(#edge-grad)'}
                strokeWidth={2}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={present ? { pathLength: 1, opacity: rev ? 0.4 : 0.9 } : { pathLength: 0, opacity: 0.12 }}
                transition={{ duration: 0.7, ease: 'easeInOut' }}
                strokeDasharray={present ? undefined : '4 6'}
              />
            );
          })}
          <defs>
            <linearGradient id="edge-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#22D3EE" />
              <stop offset="1" stopColor="#14B8A6" />
            </linearGradient>
          </defs>
        </svg>

        {/* nodes */}
        <NodeCard role="owner" isSource busy={busy} />
        <NodeCard role="cfo" deleg={root} onRevoke={onRevoke} busy={busy} />
        <NodeCard role="payroll" deleg={byRole('payroll')} onRevoke={onRevoke} busy={busy} />
        <NodeCard role="procurement" deleg={byRole('procurement')} onRevoke={onRevoke} busy={busy} />
        <NodeCard role="creative" deleg={byRole('creative')} onRevoke={onRevoke} busy={busy} />
      </div>
    </div>
  );
}
