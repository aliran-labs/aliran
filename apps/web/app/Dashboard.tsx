'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DashboardState } from './types';
import { Topbar } from './components/Topbar';
import { DelegationTree } from './components/DelegationTree';
import { ActivityFeed } from './components/ActivityFeed';
import { Stepper, TaskBoard, Receipts, ReportPanel } from './components/Panels';

async function post(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return r.json();
}

type Toast = { msg: string; kind: 'success' | 'danger' };

export default function Dashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("run this month's operations");
  const [toast, setToast] = useState<Toast | null>(null);
  const [redFlash, setRedFlash] = useState(false);
  const [dev, setDev] = useState(false); // ?dev=1 reveals demo-only controls

  const refresh = useCallback(async () => {
    const r = await fetch('/api/state', { cache: 'no-store' });
    setState(await r.json());
  }, []);

  useEffect(() => {
    setDev(new URLSearchParams(window.location.search).get('dev') === '1');
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [refresh]);

  const flash = (msg: string, kind: Toast['kind'] = 'success') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
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
    } finally {
      setBusy(null);
      refresh();
    }
  };

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        <span className="animate-livepulse">Loading Aliran…</span>
      </div>
    );
  }

  const root = state.delegations.find((d) => d.parentId === null);
  const children = state.delegations.filter((d) => d.parentId);
  const procurement = children.find((d) => d.toRole === 'procurement');

  // Real treasury balances (same source as the topbar): opening = budget cap,
  // closing = remaining. Used to fill the report's balance placeholders.
  const cap = root ? state.treasury.capUsdc : state.mode.rootCap;
  const remaining = root ? state.treasury.remainingUsdc : state.mode.rootCap;

  const stepDone = {
    plan: children.length > 0,
    pay: state.transactions.some(
      (t) => t.kind === 'transfer' && t.byRole === 'payroll' && (t.status === 'success' || t.status === 'dry-run'),
    ),
    buy: state.receipts.length > 0,
    report: state.runs.some((r) => r.report),
  };
  const showStepper = busy === 'run-month' || stepDone.plan;

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16">
      <Topbar state={state} />

      {/* Steps 1 + 2 */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="label">1 · Owner grants delegation</h2>
          <p className="mt-2 text-sm text-muted">
            One capped permission to the CFO agent:{' '}
            <b className="mono text-text">{state.mode.rootCap} USDC</b> / month.{' '}
            {state.mode.demoMode === 'wallet'
              ? 'MetaMask signature required.'
              : 'Signed by owner key (env-key demo mode).'}
          </p>
          <button
            disabled={!!busy || !!root}
            onClick={() => act('grant', () => post('/api/grant', { capUsdc: state.mode.rootCap }))}
            className="btn btn-primary mt-3"
          >
            {root ? '✓ Delegation granted' : busy === 'grant' ? 'Granting…' : `Grant ${state.mode.rootCap} USDC → CFO`}
          </button>
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
          <button
            disabled={!!busy || !root}
            onClick={() => act('run-month', () => post('/api/run-month', { instruction }))}
            className="btn btn-primary mt-3 disabled:opacity-40"
          >
            {busy === 'run-month' ? 'Agents working…' : '▶ Run month  ·  plan → pay → buy → report'}
          </button>
          {!root && <p className="mt-2 text-xs text-pending">Grant the delegation first.</p>}
        </div>
      </section>

      {/* Tree + Feed */}
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
            <DelegationTree
              state={state}
              onRevoke={(id) => act('revoke', () => post('/api/revoke', { delegationId: id }))}
              busy={busy}
            />
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

      {/* Task board + Receipts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TaskBoard tasks={state.tasks} />
        <Receipts receipts={state.receipts} />
      </div>

      <ReportPanel runs={state.runs} openingUsdc={cap} closingUsdc={remaining} />

      {/* overspend red flash */}
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

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className={`fixed bottom-6 right-6 z-50 max-w-md rounded-control border px-4 py-3 text-sm shadow-elev ${
              toast.kind === 'danger'
                ? 'border-danger/50 bg-danger/10 text-danger'
                : 'border-border bg-surface text-text'
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
