'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DashboardState, Delegation, Activity, Task, Receipt, Run } from './types';

const ROLE_COLOR: Record<string, string> = {
  owner: 'text-white',
  cfo: 'text-accent',
  payroll: 'text-good',
  procurement: 'text-warn',
  creative: 'text-pink-400',
};

function short(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
}
function explorer(hash?: string) {
  return hash ? `https://sepolia.basescan.org/tx/${hash}` : '#';
}

async function post(path: string, body?: unknown) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return r.json();
}

export default function Dashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("run this month's operations");
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/state', { cache: 'no-store' });
    setState(await r.json());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [refresh]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4000);
  };

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      const res = (await fn()) as { ok?: boolean; error?: string; reverted?: boolean };
      if (res?.error) flash(`${label}: ${res.error}`);
      else flash(`${label}: done`);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  if (!state) return <div className="p-10 text-slate-500">Loading Aliran…</div>;

  const root = state.delegations.find((d) => d.parentId === null);
  const children = state.delegations.filter((d) => d.parentId);
  const procurement = children.find((d) => d.toRole === 'procurement');

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Header state={state} />

      {/* Step 1: grant + Step 2: instruction */}
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <h2 className="text-xs uppercase tracking-wide text-slate-500">1 · Owner grants delegation</h2>
          <p className="mt-2 text-sm text-slate-400">
            One capped permission to the CFO agent: <b className="text-white">{state.mode.rootCap} USDC / month</b>.
            {state.mode.demoMode === 'wallet' ? ' MetaMask signature required.' : ' Signed by owner key (env-key demo mode).'}
          </p>
          <button
            disabled={!!busy || !!root}
            onClick={() => act('grant', () => post('/api/grant', { capUsdc: state.mode.rootCap }))}
            className="mt-3 rounded-lg bg-accent/90 px-4 py-2 text-sm font-medium text-ink hover:bg-accent disabled:opacity-40"
          >
            {root ? '✓ Delegation granted' : busy === 'grant' ? 'Granting…' : `Grant ${state.mode.rootCap} USDC → CFO`}
          </button>
        </div>

        <div className="panel p-5">
          <h2 className="text-xs uppercase tracking-wide text-slate-500">2 · Instruct the CFO</h2>
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="mt-2 w-full rounded-lg border border-edge bg-ink px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
          />
          <button
            disabled={!!busy || !root}
            onClick={() => act('run-month', () => post('/api/run-month', { instruction }))}
            className="mt-3 rounded-lg bg-good/90 px-4 py-2 text-sm font-medium text-ink hover:bg-good disabled:opacity-40"
          >
            {busy === 'run-month' ? 'Agents working…' : '▶ Run month (plan → pay → buy → report)'}
          </button>
          {!root && <p className="mt-2 text-xs text-warn">Grant the delegation first.</p>}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Delegation tree */}
        <section className="panel p-5 lg:col-span-2">
          <h2 className="mb-3 text-xs uppercase tracking-wide text-slate-500">Delegation tree</h2>
          {!root ? (
            <p className="text-sm text-slate-600">No delegations yet.</p>
          ) : (
            <DelegationTree
              root={root}
              nodes={children}
              onRevoke={(id) => act('revoke', () => post('/api/revoke', { delegationId: id }))}
              busy={busy}
            />
          )}

          {/* Demo step 7 buttons */}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-edge pt-4">
            <button
              disabled={!!busy || !procurement || procurement.status === 'revoked'}
              onClick={() => act('overspend', () => post('/api/overspend', {}))}
              className="rounded-lg border border-bad/60 px-3 py-1.5 text-xs font-medium text-bad hover:bg-bad/10 disabled:opacity-40"
            >
              ⚠ Attempt overspend (procurement)
            </button>
            <button
              disabled={!!busy}
              onClick={() => act('reset', () => post('/api/reset'))}
              className="rounded-lg border border-edge px-3 py-1.5 text-xs text-slate-400 hover:bg-edge/40"
            >
              ↺ Reset demo
            </button>
          </div>
        </section>

        {/* Activity feed */}
        <section className="panel flex max-h-[520px] flex-col p-5">
          <h2 className="mb-3 text-xs uppercase tracking-wide text-slate-500">Activity feed</h2>
          <Feed activity={[...state.activity].reverse()} />
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TaskBoard tasks={state.tasks} />
        <Receipts receipts={state.receipts} />
      </div>

      <ReportPanel runs={state.runs} />

      {toast && (
        <div className="fixed bottom-6 right-6 max-w-md rounded-lg border border-edge bg-panel px-4 py-3 text-sm text-slate-200 shadow-xl">
          {toast}
        </div>
      )}
    </main>
  );
}

function Header({ state }: { state: DashboardState }) {
  const t = state.treasury;
  const pct = Math.min(100, Math.round(((t.capUsdc - t.remainingUsdc) / Math.max(1, t.capUsdc)) * 100));
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Aliran</h1>
        <p className="text-sm text-slate-500">Autonomous treasury OS · CFO + worker agents via ERC-7710</p>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span className={`rounded-full px-3 py-1 ${state.mode.mock ? 'bg-warn/15 text-warn' : 'bg-good/15 text-good'}`}>
          {state.mode.mock ? 'MOCK (dry-run)' : 'LIVE'}
        </span>
        <span className="text-slate-500">Base Sepolia · {state.mode.chainId}</span>
        <div className="text-right">
          <div className="text-slate-400">
            Treasury <b className="text-white">{t.remainingUsdc}</b> / {t.capUsdc} USDC
          </div>
          <div className="mt-1 h-1.5 w-40 overflow-hidden rounded bg-edge">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </header>
  );
}

function DelegationTree({
  root,
  nodes,
  onRevoke,
  busy,
}: {
  root: Delegation;
  nodes: Delegation[];
  onRevoke: (id: string) => void;
  busy: string | null;
}) {
  return (
    <div className="space-y-3">
      <Node d={root} onRevoke={onRevoke} busy={busy} isRoot />
      <div className="ml-6 space-y-2 border-l border-edge pl-5">
        {nodes.length === 0 && <p className="text-sm text-slate-600">CFO has not redelegated yet — run the month.</p>}
        {nodes.map((c) => (
          <Node key={c.id} d={c} onRevoke={onRevoke} busy={busy} />
        ))}
      </div>
    </div>
  );
}

function Node({ d, onRevoke, busy, isRoot }: { d: Delegation; onRevoke: (id: string) => void; busy: string | null; isRoot?: boolean }) {
  const remaining = d.capUsdc - d.spentUsdc;
  const pct = Math.min(100, Math.round((d.spentUsdc / Math.max(1, d.capUsdc)) * 100));
  return (
    <div className={`rounded-lg border p-3 ${d.status === 'revoked' ? 'border-bad/40 bg-bad/5 opacity-70' : 'border-edge bg-ink/40'}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className={ROLE_COLOR[d.fromRole] ?? ''}>{d.fromRole}</span>
          <span className="text-slate-600"> → </span>
          <span className={ROLE_COLOR[d.toRole] ?? ''}>{d.toRole}</span>
          {isRoot && <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">ROOT</span>}
          {d.status === 'revoked' && <span className="ml-2 rounded bg-bad/15 px-1.5 py-0.5 text-[10px] text-bad">REVOKED</span>}
        </div>
        <button
          disabled={!!busy || d.status === 'revoked'}
          onClick={() => onRevoke(d.id)}
          className="rounded border border-edge px-2 py-0.5 text-[11px] text-slate-400 hover:border-bad/60 hover:text-bad disabled:opacity-30"
        >
          revoke
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
        <span>cap <b className="text-slate-300">{d.capUsdc}</b></span>
        <span>spent <b className="text-slate-300">{d.spentUsdc}</b></span>
        <span>left <b className="text-slate-300">{remaining}</b></span>
        <span className="font-mono text-[10px] text-slate-600">{short(d.toAddress)}</span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-edge">
        <div className={`h-full ${d.status === 'revoked' ? 'bg-bad' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Feed({ activity }: { activity: Activity[] }) {
  const dot: Record<string, string> = { success: 'bg-good', failed: 'bg-bad', started: 'bg-accent', info: 'bg-slate-500' };
  return (
    <ul className="space-y-2 overflow-y-auto pr-1 text-sm">
      {activity.length === 0 && <li className="text-slate-600">No activity yet.</li>}
      {activity.map((e) => (
        <li key={e.id} className="flex gap-2">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot[e.status] ?? 'bg-slate-500'}`} />
          <div className="min-w-0">
            <div>
              <span className={`${ROLE_COLOR[e.agent] ?? 'text-slate-300'} font-medium`}>{e.agent}</span>{' '}
              <span className="text-slate-300">{e.action}</span>
              {e.amount != null && <span className="text-slate-500"> · {e.amount} USDC</span>}
              {e.txHash && (
                <a href={explorer(e.txHash)} target="_blank" rel="noreferrer" className="ml-1 text-accent hover:underline">
                  tx↗
                </a>
              )}
            </div>
            {e.detail && <div className="truncate text-xs text-slate-600">{e.detail}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function TaskBoard({ tasks }: { tasks: Task[] }) {
  const badge: Record<string, string> = {
    done: 'bg-accent/15 text-accent',
    paid: 'bg-good/15 text-good',
    rejected: 'bg-bad/15 text-bad',
    open: 'bg-slate-700/40 text-slate-400',
  };
  return (
    <section className="panel p-5">
      <h2 className="mb-3 text-xs uppercase tracking-wide text-slate-500">Task board</h2>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="rounded-lg border border-edge bg-ink/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-200">{t.title}</span>
              <span className={`rounded px-2 py-0.5 text-[10px] uppercase ${badge[t.status] ?? ''}`}>{t.status}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{t.amountUsdc} USDC → {short(t.contributorAddress)}</span>
            </div>
            {t.evidence && <p className="mt-1 text-xs text-slate-600">evidence: {t.evidence}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportPanel({ runs }: { runs: Run[] }) {
  const latest = [...runs].reverse().find((r) => r.report);
  if (!latest?.report) return null;
  return (
    <section className="panel mt-6 p-5">
      <h2 className="mb-3 text-xs uppercase tracking-wide text-slate-500">
        Monthly treasury report <span className="text-pink-400">· creative agent (Venice)</span>
      </h2>
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{latest.report}</pre>
        {latest.reportImageUrl && (
          <div className="rounded-lg border border-edge bg-ink/40 p-3 text-center">
            <div className="flex h-40 items-center justify-center rounded bg-gradient-to-br from-accent/20 to-pink-500/20 text-xs text-slate-400">
              cover image
            </div>
            <div className="mt-2 break-all font-mono text-[10px] text-slate-600">{latest.reportImageUrl}</div>
          </div>
        )}
      </div>
    </section>
  );
}

function Receipts({ receipts }: { receipts: Receipt[] }) {
  return (
    <section className="panel p-5">
      <h2 className="mb-3 text-xs uppercase tracking-wide text-slate-500">x402 receipts</h2>
      {receipts.length === 0 ? (
        <p className="text-sm text-slate-600">No purchases yet.</p>
      ) : (
        <ul className="space-y-3">
          {receipts.map((r) => (
            <li key={r.id} className="rounded-lg border border-edge bg-ink/40 p-3 text-sm">
              <div className="text-slate-300">{r.url}</div>
              <div className="mt-1 font-mono text-[10px] text-slate-600">payload {short(r.paymentPayloadHash)}</div>
              {r.synthesis && <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-400">{r.synthesis}</pre>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
