'use client';

import { useAppState } from '../lib/appState';
import { AGENTS, AgentAvatar, agentColor, explorer, relTime, short, usdc } from '../lib/ui';

const STATUS: Record<string, string> = {
  success: 'bg-success/15 text-success',
  failed: 'bg-danger/15 text-danger',
  started: 'bg-pending/15 text-pending',
  info: 'bg-surface-2 text-muted',
};
const STATUS_LABEL: Record<string, string> = { success: 'success', failed: 'reverted', started: 'pending', info: 'info' };

export default function AuditPage() {
  const { state } = useAppState();
  if (!state) return <div className="p-10 text-muted">Loading…</div>;

  const rows = [...state.activity].reverse(); // newest first
  const onchain = rows.filter((r) => r.txHash).length;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-text">On-chain audit log</h2>
          <p className="text-xs text-muted">
            Every agent action, in order. Each transaction links to BaseScan — this is the on-chain proof.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="chip">{rows.length} events</span>
          <span className="chip">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" /> {onchain} on-chain tx
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center text-sm text-muted">No activity yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-2.5 font-medium">Time</th>
                <th className="px-3 py-2.5 font-medium">Agent</th>
                <th className="px-3 py-2.5 font-medium">Action</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-border/50 last:border-0 hover:bg-surface-2/40">
                  <td className="whitespace-nowrap px-5 py-2.5 text-xs text-muted">{relTime(e.timestamp)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <AgentAvatar role={e.agent} size={22} />
                      <span className="text-xs font-medium" style={{ color: agentColor(e.agent) }}>
                        {AGENTS[e.agent]?.label ?? e.agent}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-text/90">
                    {e.action}
                    {e.detail && <div className="max-w-[320px] truncate text-[11px] text-muted/70">{e.detail}</div>}
                  </td>
                  <td className="mono px-3 py-2.5 text-right text-text/90">{e.amount != null ? `${usdc(e.amount)}` : '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`pill ${STATUS[e.status] ?? STATUS.info}`}>{STATUS_LABEL[e.status] ?? e.status}</span>
                  </td>
                  <td className="px-5 py-2.5">
                    {e.txHash ? (
                      <a
                        href={explorer(e.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mono inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-link transition hover:border-link/50 hover:bg-link/10"
                      >
                        {short(e.txHash)} ↗
                      </a>
                    ) : (
                      <span className="text-xs text-muted/50">off-chain</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
