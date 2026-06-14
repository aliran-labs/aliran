'use client';

import { useAppState, treasuryView } from '../lib/appState';
import { useWallet } from '../lib/wallet';
import { AGENTS, AgentAvatar, agentColor, short, usdc } from '../lib/ui';
import type { Delegation } from '../types';

function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="text-xs text-muted">{k}</span>
      <span className={`text-sm text-text ${mono ? 'mono' : ''}`}>{v}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { state } = useAppState();
  const wallet = useWallet();
  if (!state) return <div className="p-10 text-muted">Loading…</div>;

  const { root, cap, remaining, spent } = treasuryView(state);
  const workers = (['payroll', 'procurement', 'creative'] as const)
    .map((role) => state.delegations.find((d) => d.parentId && d.toRole === role))
    .filter((d): d is Delegation => Boolean(d));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Read-only view of the live treasury configuration.</p>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Mode / network */}
        <section className="card p-5">
          <h2 className="label mb-3">Mode &amp; network</h2>
          <Row k="Broadcast mode" v={state.mode.mock ? 'MOCK (dry-run)' : 'LIVE (real on-chain)'} />
          <Row k="Owner signer" v={state.mode.demoMode === 'wallet' ? 'MetaMask wallet' : 'env-key (OWNER_PRIVATE_KEY)'} />
          <Row k="Network" v="Base Sepolia" />
          <Row k="Chain ID" v={state.mode.chainId} mono />
          <Row k="Treasury cap" v={root ? `${usdc(cap)} USDC / month` : 'not granted'} mono />
          <Row
            k="Connected wallet"
            v={wallet.account ? <span className={wallet.isBaseSepolia ? 'text-success' : 'text-danger'}>{short(wallet.account)}</span> : '—'}
            mono
          />
        </section>

        {/* Granted permission */}
        <section className="card p-5">
          <h2 className="label mb-3">Granted permission (root delegation)</h2>
          {root ? (
            <>
              <Row k="Status" v={<span className={root.status === 'revoked' ? 'text-danger' : 'text-success'}>{root.status}</span>} />
              <Row k="Scope" v="ERC-20 transfer · USDC" />
              <Row k="Owner → CFO" v={`${short(root.fromAddress)} → ${short(root.toAddress)}`} mono />
              <Row k="Cap" v={`${usdc(cap)} USDC`} mono />
              <Row k="Spent" v={`${usdc(spent)} USDC`} mono />
              <Row k="Remaining" v={`${usdc(remaining)} USDC`} mono />
            </>
          ) : (
            <p className="text-sm text-muted">No permission granted yet — grant it on the Dashboard.</p>
          )}
        </section>
      </div>

      {/* Per-agent caps */}
      <section className="card p-5">
        <h2 className="label mb-3">Agents &amp; caps</h2>
        {workers.length === 0 ? (
          <p className="text-sm text-muted">No redelegations yet — run a month to fund the worker agents.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 text-right font-medium">Cap</th>
                  <th className="px-3 py-2 text-right font-medium">Spent</th>
                  <th className="px-3 py-2 text-right font-medium">Left</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((d) => (
                  <tr key={d.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <AgentAvatar role={d.toRole} size={22} />
                        <span className="text-xs font-medium" style={{ color: agentColor(d.toRole) }}>
                          {AGENTS[d.toRole]?.label ?? d.toRole}
                        </span>
                      </div>
                    </td>
                    <td className="mono px-3 py-2.5 text-xs text-muted">{short(d.toAddress)}</td>
                    <td className="mono px-3 py-2.5 text-right text-text/90">{usdc(d.capUsdc)}</td>
                    <td className="mono px-3 py-2.5 text-right text-text/90">{usdc(d.spentUsdc)}</td>
                    <td className="mono px-3 py-2.5 text-right text-text/90">{usdc(d.capUsdc - d.spentUsdc)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`pill ${d.status === 'revoked' ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'}`}>
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
