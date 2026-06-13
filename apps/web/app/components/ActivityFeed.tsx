'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Activity } from '../types';
import { AGENTS, AgentAvatar, agentColor, explorer, relTime, usdc } from '../lib/ui';

const STATUS: Record<string, { label: string; cls: string }> = {
  success: { label: 'success', cls: 'bg-success/15 text-success' },
  failed: { label: 'reverted', cls: 'bg-danger/15 text-danger' },
  started: { label: 'pending', cls: 'bg-pending/15 text-pending' },
  info: { label: 'info', cls: 'bg-surface-2 text-muted' },
};

export function ActivityFeed({ activity }: { activity: Activity[] }) {
  const items = [...activity].reverse(); // newest first

  return (
    <div className="scroll-thin flex-1 overflow-y-auto pr-1">
      {items.length === 0 ? (
        <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center">
          <div className="mb-2 h-8 w-8 rounded-full border border-dashed border-border" />
          <p className="text-sm text-muted">No activity yet</p>
          <p className="text-xs text-muted/70">Grant a delegation and run the month.</p>
        </div>
      ) : (
        <ol className="relative space-y-1">
          {/* timeline spine */}
          <span className="pointer-events-none absolute left-[17px] top-1 bottom-1 w-px bg-border" />
          <AnimatePresence initial={false}>
            {items.map((e) => {
              const st = STATUS[e.status] ?? STATUS.info;
              const color = agentColor(e.agent);
              return (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="relative flex gap-3 rounded-control px-1.5 py-2 hover:bg-surface-2/50"
                >
                  <div className="z-10">
                    <AgentAvatar role={e.agent} size={28} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-sm">
                        <span className="font-medium" style={{ color }}>
                          {AGENTS[e.agent]?.label ?? e.agent}
                        </span>{' '}
                        <span className="text-text/90">{e.action}</span>
                        {e.amount != null && (
                          <span className="mono ml-1 text-muted">· {usdc(e.amount)} USDC</span>
                        )}
                      </div>
                      <span className={`pill shrink-0 ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                      <span>{relTime(e.timestamp)}</span>
                      {e.txHash && (
                        <a
                          href={explorer(e.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="mono inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-link transition hover:border-link/50 hover:bg-link/10"
                        >
                          {e.txHash.slice(0, 8)}… ↗
                        </a>
                      )}
                    </div>
                    {e.detail && <p className="mt-0.5 truncate text-[11px] text-muted/80">{e.detail}</p>}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}
