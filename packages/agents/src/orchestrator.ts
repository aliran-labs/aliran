import { store, config, type AgentRole } from '@aliran/core';
import {
  ensureRootDelegation,
  newRunContext,
  cfoPlan,
  cfoExecute,
  payrollRun,
  procurementRun,
  creativeRun,
  type CfoPlan,
} from './agents';
import type { RunContext } from './tools';
import { redeemTransfer } from '@aliran/delegation';
import type { Address } from 'viem';

/**
 * "run this month's operations" — the full §1 demo flow:
 *   plan -> (approve) -> redelegate -> payroll -> procurement -> report.
 * Returns the run record id plus the produced artifacts. Persists everything.
 */
export interface MonthResult {
  runId: string;
  plan: CfoPlan;
  payroll: { paid: number; total: number };
  procurement: { ok: boolean; synthesis?: string; receiptId?: string };
  report: { report: string; imageUrl?: string };
  ctx: RunContext;
}

export async function runMonth(opts: {
  instruction: string;
  marketUrl: string;
  withImage?: boolean;
  /** If false, stops after planning (awaiting owner approval). */
  autoApprove?: boolean;
}): Promise<MonthResult> {
  const run = store.addRun({ instruction: opts.instruction, status: 'planning' });

  // 1. Root delegation owner -> CFO (the single capped grant).
  const root = await ensureRootDelegation();
  const ctx = newRunContext(root);

  // 2. CFO plans.
  const state = treasuryState();
  const plan = await cfoPlan({ instruction: opts.instruction, state });
  store.updateRun(run.id, { plan, status: opts.autoApprove === false ? 'awaiting-approval' : 'executing' });
  store.emit({ agent: 'cfo', action: 'produced redelegation plan', status: 'success', detail: plan.rationale.slice(0, 80) });

  if (opts.autoApprove === false) {
    return { runId: run.id, plan, payroll: { paid: 0, total: 0 }, procurement: { ok: false }, report: { report: '' }, ctx };
  }

  // 3. CFO executes the redelegations.
  await cfoExecute(ctx, plan);

  // 4. Payroll pays verified tasks.
  const payroll = await payrollRun(ctx);

  // 5. Procurement buys + synthesizes market data.
  const procurement = await procurementRun(ctx, { url: opts.marketUrl });

  // 6. Creative writes the report.
  const report = await creativeRun({ withImage: opts.withImage });

  store.updateRun(run.id, { status: 'done' });
  store.emit({ agent: 'cfo', action: 'month complete', status: 'success' });

  return { runId: run.id, plan, payroll, procurement, report, ctx };
}

/** Demo step 7: deliberate over-cap attempt by procurement → on-chain revert. */
export async function attemptOverspend(ctx: RunContext): Promise<{ ok: boolean; error?: string }> {
  const leaf = ctx.bundles.procurement;
  if (!leaf) return { ok: false, error: 'procurement has no delegation (run a month first)' };
  const target = (config.CONTRIBUTOR_ADDRESSES[0] as Address) || ('0x000000000000000000000000000000000000dEaD' as Address);
  const res = await redeemTransfer({
    leaf,
    recipient: target,
    amountUsdc: leaf.capUsdc + 1000, // guaranteed over cap
    byRole: 'procurement',
    memo: 'deliberate overspend demo',
    forceOverspend: true,
  });
  return { ok: res.ok, error: res.error };
}

export function treasuryState() {
  const db = store.read();
  const root = db.delegations.find((d) => d.parentId === null);
  const cap = root?.capUsdc ?? 500;
  const spent = db.transactions
    .filter((t) => t.kind === 'transfer' && (t.status === 'success' || t.status === 'dry-run'))
    .reduce((s, t) => s + (t.amountUsdc ?? 0), 0);
  return {
    capUsdc: cap,
    remainingUsdc: cap - spent,
    taskCount: db.tasks.length,
    openTasks: db.tasks.filter((t) => t.status === 'open' || t.status === 'done').length,
  };
}

export type { AgentRole };
