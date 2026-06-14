'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppState } from './lib/appState';
import { useWallet } from './lib/wallet';
import { short, usdc } from './lib/ui';
import { DelegationTree } from './components/DelegationTree';
import { ActivityFeed } from './components/ActivityFeed';
import { Stepper, TaskBoard, Receipts } from './components/Panels';

async function post(path: string, body?: unknown) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return r.json();
}

type Toast = { msg: string; kind: 'success' | 'danger' };

export default function DashboardPage() {
  const { state, refresh } = useAppState();
  const wallet = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("run this month's operations");
  const [budget, setBudget] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [redFlash, setRedFlash] = useState(false);

  const dev = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dev') === '1';

  const flash = (msg: string, kind: Toast['kind'] = 'success') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4500);
  };

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      const res = (await fn()) as { ok?: boolean; error?: string; reverted?: boolean };
      const bad = Boolean(res?.error || res?.reverted);
      if (label === 'overspend' && res?.reverted) {
        setRedFlash(true);
        setTimeout(() => setRedFlash(false), 700);
        flash(`Overspend blocked on-chain — ${res.error ?? 'reverted'}`, 'danger');
      } else if (res?.error) {
        flash(`${label}: ${res.error}`, 'danger');
      } else {
        flash(`${label}: done`, bad ? 'danger' : 'success');
      }
    } catch (e) {
      flash(`${label}: ${(e as Error).message}`, 'danger');
    } finally {
      setBusy(null);
      refresh();
    }
  };

  /** GRANT — the owner types the budget and signs the root delegation in MetaMask. */
  const doGrant = async () => {
    if (!state) return;
    const cap = Number(budget);
    if (!Number.isFinite(cap) || cap <= 0) throw new Error('Enter a budget (USDC) greater than 0.');
    if (!wallet.available) throw new Error('MetaMask not detected — install it to grant.');
    if (!wallet.account) await wallet.connect();
    if (!wallet.isBaseSepolia) await wallet.switchToBaseSepolia();
    const prep = await post('/api/grant/prepare', { capUsdc: cap });
    if (!prep.ok) throw new Error(prep.error || 'prepare failed');
    if (prep.alreadyGranted) return prep;
    if (prep.ownerSigner && wallet.account && wallet.account.toLowerCase() !== prep.ownerSigner.toLowerCase()) {
      throw new Error(`Connect the owner wallet ${short(prep.ownerSigner)} (import OWNER_PRIVATE_KEY into MetaMask)`);
    }
    const signature = await wallet.signTypedData(prep.typedData); // ← MetaMask popup
    return post('/api/grant/complete', { delegation: prep.delegation, signature, cap });
  };

  if (!state) return <div className="p-10 text-muted">Loading…</div>;

  const root = state.delegations.find((d) => d.parentId === null);
  const children = state.delegations.filter((d) => d.parentId);
  const procurement = children.find((d) => d.toRole === 'procurement');

  const stepDone = {
    plan: children.length > 0,
    pay: state.transactions.some((t) => t.kind === 'transfer' && t.byRole === 'payroll' && (t.status === 'success' || t.status === 'dry-run')),
    buy: state.receipts.length > 0,
    report: state.runs.some((r) => r.report),
  };
  const showStepper = busy === 'run-month' || stepDone.plan;

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="label">1 · Owner grants delegation</h2>
          <p className="mt-2 text-sm text-muted">
            Set the monthly budget you authorize the CFO agent to manage, then sign with your
            connected MetaMask wallet — a real signature popup appears.
          </p>
          {root ? (
            <p className="mt-3 text-sm text-text">
              ✓ Granted <b className="mono">{usdc(root.capUsdc)} USDC</b> / month to the CFO.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="control flex items-center gap-1 px-3 py-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-24 bg-transparent text-sm text-text outline-none"
                />
                <span className="text-xs text-muted">USDC</span>
              </div>
              <button
                disabled={!!busy || !budget || Number(budget) <= 0}
                onClick={() => act('grant', doGrant)}
                className="btn btn-primary disabled:opacity-40"
              >
                {busy === 'grant' ? 'Awaiting signature…' : '🦊 Grant via MetaMask'}
              </button>
            </div>
          )}
          {!root && !wallet.account && (
            <p className="mt-2 text-xs text-pending">Connect MetaMask (top-right) — use the owner wallet.</p>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="label">2 · Instruct the CFO</h2>
            {showStepper && <Stepper done={stepDone} active={busy === 'run-month'} />}
          </div>
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="control mt-2 w-full px-3 py-2 text-sm text-text outline-none focus:border-cyan/60"
          />
          <button disabled={!!busy || !root} onClick={() => act('run-month', () => post('/api/run-month', { instruction }))} className="btn btn-primary mt-3 disabled:opacity-40">
            {busy === 'run-month' ? 'Agents working…' : '▶ Run month  ·  plan → pay → buy → report'}
          </button>
          {!root && <p className="mt-2 text-xs text-pending">Grant the delegation first.</p>}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="label mb-1">Delegation tree</h2>
          {!root ? (
            <div className="flex h-[420px] flex-col items-center justify-center text-center">
              <div className="mb-3 h-12 w-12 rounded-full border border-dashed border-border" />
              <p className="text-sm text-muted">No delegations yet</p>
              <p className="text-xs text-muted/70">Grant the root permission to the CFO to begin.</p>
            </div>
          ) : (
            <DelegationTree state={state} onRevoke={(id) => act('revoke', () => post('/api/revoke', { delegationId: id }))} busy={busy} />
          )}

          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              disabled={!!busy || !procurement || procurement.status === 'revoked'}
              onClick={() => act('overspend', () => post('/api/overspend', {}))}
              className="btn btn-danger text-xs"
            >
              ⚠ Attempt overspend (procurement)
            </button>
            {dev && (
              <button disabled={!!busy} onClick={() => act('reset', () => post('/api/reset'))} className="btn btn-ghost text-xs">
                ↺ Reset demo
              </button>
            )}
          </div>
        </section>

        <section className="card flex max-h-[560px] flex-col p-5">
          <h2 className="label mb-3">Activity feed</h2>
          <ActivityFeed activity={state.activity} />
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TaskBoard tasks={state.tasks} />
        <Receipts receipts={state.receipts} />
      </div>

      <AnimatePresence>
        {redFlash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none fixed inset-0 z-40"
            style={{ boxShadow: 'inset 0 0 160px 12px rgba(248,113,113,0.45)' }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className={`fixed bottom-6 right-6 z-50 max-w-md rounded-control border px-4 py-3 text-sm shadow-elev ${
              toast.kind === 'danger' ? 'border-danger/50 bg-danger/10 text-danger' : 'border-border bg-surface text-text'
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
