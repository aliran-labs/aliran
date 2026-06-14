import { store, config, type AgentRole } from '@aliran/core';
import { bundleFromRecordId, type SignedDelegationBundle } from '@aliran/delegation';
import { veniceChat, veniceImage, mockToolCall, type ChatResult } from './venice';
import {
  newRunContext,
  tool_create_redelegation,
  tool_pay_usdc,
  tool_fetch_x402,
  tool_read_task_board,
  TOOL_SCHEMAS,
  type RunContext,
} from './tools';

/**
 * The four agents. Each is Venice-powered: in MOCK_MODE a deterministic
 * responder mimics the model's tool-calls / text; in real mode the same prompts
 * go to Venice. Agents emit activity events through the tools/store.
 */

// --- CFO --------------------------------------------------------------------
export interface CfoPlan {
  redelegations: { agent: AgentRole; maxUsdc: number; expiry: number | null }[];
  rationale: string;
}

const SYS_CFO = `You are the CFO agent of an autonomous treasury. You are granted a single
capped delegation; the exact monthly cap (USDC) is provided in the user message. Produce a
plan that redelegates narrower budgets to three worker agents: payroll, procurement, creative.
The sum of redelegated caps MUST NOT exceed your cap. Respond by calling create_redelegation
for each worker, then summarize your rationale.`;

/** CFO plans (does not execute): returns a structured plan from treasury state. */
export async function cfoPlan(opts: {
  instruction: string;
  state: { capUsdc: number; remainingUsdc: number; taskCount: number; openTasks: number };
}): Promise<CfoPlan> {
  const res = await veniceChat({
    messages: [
      { role: 'system', content: SYS_CFO },
      {
        role: 'user',
        content: `Instruction: "${opts.instruction}"\nTreasury: cap=${opts.state.capUsdc} remaining=${opts.state.remainingUsdc} tasks=${opts.state.taskCount} open=${opts.state.openTasks}\nProduce the redelegation plan.`,
      },
    ],
    tools: TOOL_SCHEMAS,
    mock: () => mockCfoPlan(opts.state.capUsdc),
  });

  // Parse the plan from tool calls (works for mock and real OpenAI tool-calls).
  let redelegations: CfoPlan['redelegations'] = [];
  for (const tc of res.toolCalls) {
    if (tc.function.name === 'create_redelegation') {
      const a = safeParse(tc.function.arguments);
      if (a?.agent) redelegations.push({ agent: a.agent, maxUsdc: Number(a.maxUsdc), expiry: a.expiry ?? null });
    }
  }

  // Safety clamp (protects real money against an off-spec model plan): the three
  // workers must be present, each cap positive, and the sum within the root cap.
  // If the model's plan is missing/invalid/over-cap, fall back to the budget-
  // derived split. This keeps real on-chain redelegations deterministic and safe.
  const cap = opts.state.capUsdc;
  const sum = redelegations.reduce((s, r) => s + (r.maxUsdc || 0), 0);
  const hasAllRoles = (['payroll', 'procurement', 'creative'] as AgentRole[]).every((role) =>
    redelegations.some((r) => r.agent === role && r.maxUsdc > 0),
  );
  if (redelegations.length === 0 || !hasAllRoles || sum > cap) {
    redelegations = deriveSplit(cap);
  }
  return { redelegations, rationale: res.content ?? mockCfoRationale(cap) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Derive the redelegation split from the granted budget + concrete obligations.
 * No fixed numbers: payroll = the sum of verified ("done") task amounts, capped
 * at 80% of the budget so a discretionary buffer always remains; the remainder
 * funds procurement (70%) and creative (30%). Everything scales with the actual
 * grant and the live task board.
 */
function deriveSplit(cap: number): CfoPlan['redelegations'] {
  const obligations = store
    .read()
    .tasks.filter((t) => t.status === 'done')
    .reduce((s, t) => s + (t.amountUsdc || 0), 0);
  const payroll = round2(Math.min(obligations, cap * 0.8));
  const remainder = Math.max(0, cap - payroll);
  const procurement = round2(remainder * 0.7);
  const creative = round2(Math.max(0, remainder - procurement));
  return [
    { agent: 'payroll', maxUsdc: payroll, expiry: null },
    { agent: 'procurement', maxUsdc: procurement, expiry: null },
    { agent: 'creative', maxUsdc: creative, expiry: null },
  ];
}

function mockCfoPlan(cap: number): ChatResult {
  // Mimic a model emitting three create_redelegation tool calls (derived split).
  const calls = deriveSplit(cap).map((r) => ({ agent: r.agent, maxUsdc: r.maxUsdc }));
  return {
    content: mockCfoRationale(cap),
    toolCalls: calls.map((c, i) => ({
      id: `mock_redel_${i}`,
      type: 'function' as const,
      function: { name: 'create_redelegation', arguments: JSON.stringify(c) },
    })),
    mocked: true,
  };
}

function mockCfoRationale(cap: number): string {
  const s = deriveSplit(cap);
  const total = round2(s.reduce((a, r) => a + r.maxUsdc, 0));
  return (
    `Allocating the ${cap} USDC monthly authority across three specialist agents: ` +
    `payroll receives ${s[0]!.maxUsdc} to clear verified contributor work; ` +
    `procurement gets ${s[1]!.maxUsdc} for paid data and tooling; creative gets ${s[2]!.maxUsdc} ` +
    `for the monthly report. Total ${total} — within the ${cap} cap. ` +
    `Each redelegation only narrows authority and is independently revocable.`
  );
}

/** CFO executes the approved plan by creating the redelegations on-chain. */
export async function cfoExecute(ctx: RunContext, plan: CfoPlan): Promise<RunContext> {
  for (const r of plan.redelegations) {
    await tool_create_redelegation(ctx, { agent: r.agent, maxUsdc: r.maxUsdc, expiry: r.expiry ?? undefined });
  }
  return ctx;
}

// --- Payroll ----------------------------------------------------------------
const SYS_PAYROLL = `You are the payroll agent. For each task marked "done", judge from the
description and claimed evidence whether it is eligible for payment. Pay eligible tasks via
pay_usdc to the contributor address for the task amount. Reject suspicious or unevidenced work.`;

const PAY_USDC_TOOL = TOOL_SCHEMAS.find((s) => s.function.name === 'pay_usdc')!;

export async function payrollRun(ctx: RunContext): Promise<{ paid: number; total: number }> {
  const tasks = tool_read_task_board().filter((t) => t.status === 'done');
  let paid = 0;
  for (const t of tasks) {
    const res = await veniceChat({
      messages: [
        { role: 'system', content: SYS_PAYROLL },
        {
          role: 'user',
          content: `Task: ${t.title}\nDesc: ${t.description}\nAmount: ${t.amountUsdc} USDC\nEvidence: ${t.evidence || '(none)'}\nIf the evidence supports completion, call pay_usdc. Otherwise reply that it is not eligible.`,
        },
      ],
      // Give payroll ONLY the pay_usdc tool so the model's choice is unambiguous.
      tools: [PAY_USDC_TOOL],
      mock: () =>
        t.evidence && t.evidence.trim().length > 0
          ? mockToolCall('pay_usdc', { to: t.contributorAddress, amount: t.amountUsdc, memo: t.title })
          : { content: 'Rejected: no evidence provided.', toolCalls: [], mocked: true },
    });

    // Eligibility = the task carries completion evidence (the spec's rule). The
    // model is consulted (and pays via tool call when it chooses to), but the
    // decision is deterministic on evidence so the demo doesn't flake on a
    // model that reasons in prose. Unevidenced work is rejected.
    const payCall = res.toolCalls.find((c) => c.function.name === 'pay_usdc');
    const eligibleByEvidence = Boolean(t.evidence && t.evidence.trim().length > 0);

    if (payCall || eligibleByEvidence) {
      const a = payCall ? safeParse(payCall.function.arguments) : null;
      // Real-money guard: never pay more than the task is worth; always pay the
      // task's own contributor (ignore any model-supplied recipient).
      const amount = Math.min(Number(a?.amount) || t.amountUsdc, t.amountUsdc);
      const r = await tool_pay_usdc(ctx, 'payroll', { to: t.contributorAddress, amount, memo: t.title });
      if (r.ok) {
        paid++;
        store.updateTask(t.id, { status: 'paid' });
      }
    } else {
      store.updateTask(t.id, { status: 'rejected' });
    }
  }
  return { paid, total: tasks.length };
}

// --- Procurement ------------------------------------------------------------
const SYS_PROC = `You are the procurement agent. You buy paid market data via x402 and synthesize
it for the treasury. Keep purchases within your delegated cap.`;

export async function procurementRun(
  ctx: RunContext,
  opts: { url: string },
): Promise<{ ok: boolean; synthesis?: string; receiptId?: string }> {
  const buy = await tool_fetch_x402('procurement', { url: opts.url });
  if (!buy.ok) return { ok: false };

  const synth = await veniceChat({
    messages: [
      { role: 'system', content: SYS_PROC },
      { role: 'user', content: `Summarize this market brief for the treasury in 3 bullets:\n${JSON.stringify(buy.data).slice(0, 2000)}` },
    ],
    mock: () => ({ content: mockProcurementSynthesis(), toolCalls: [], mocked: true }),
  });

  // attach synthesis to the receipt
  if (buy.receiptId) {
    const db = store.read();
    const rec = db.receipts.find((r) => r.id === buy.receiptId);
    if (rec) {
      rec.synthesis = synth.content ?? undefined;
      store.write(db);
    }
  }
  store.emit({ agent: 'procurement', action: 'synthesized market brief', status: 'success', detail: (synth.content ?? '').slice(0, 80) });
  return { ok: true, synthesis: synth.content ?? undefined, receiptId: buy.receiptId };
}

function mockProcurementSynthesis(): string {
  return (
    '• Stablecoin yields hold ~4–5% APY; keep a 60% USDC operating buffer.\n' +
    '• Cloud GPU spot pricing down 12% QoQ — favorable for creative workloads.\n' +
    '• Cap discretionary procurement at 30% of monthly inflows; front-load payroll.'
  );
}

// --- Creative ---------------------------------------------------------------
const SYS_CREATIVE = `You are the creative agent. Produce a concise monthly treasury report in
markdown summarizing delegations, spend, payroll, procurement, and outlook.`;

export async function creativeRun(opts: { withImage?: boolean }): Promise<{ report: string; imageUrl?: string }> {
  const db = store.read();
  const rootCap = db.delegations.find((d) => d.parentId === null)?.capUsdc ?? 0;
  const spend = db.transactions
    .filter((t) => t.kind === 'transfer' && (t.status === 'success' || t.status === 'dry-run'))
    .reduce((s, t) => s + (t.amountUsdc ?? 0), 0);

  const res = await veniceChat({
    messages: [
      { role: 'system', content: SYS_CREATIVE },
      {
        role: 'user',
        content: `Delegations: ${db.delegations.length}. Total disbursed: ${spend} USDC. Receipts: ${db.receipts.length}. Write the monthly report.`,
      },
    ],
    mock: () => ({ content: mockReport(db.delegations.length, spend, db.receipts.length, rootCap), toolCalls: [], mocked: true }),
  });

  let imageUrl: string | undefined;
  if (opts.withImage) {
    // Optional cover image — never let an image hiccup fail the whole run.
    try {
      const img = await veniceImage({
        prompt: 'Minimal fintech treasury report cover, abstract flowing streams (aliran), deep navy and cyan',
        mock: () => 'mock://image/aliran-treasury-cover.png',
      });
      imageUrl = img.url;
    } catch (e) {
      store.emit({ agent: 'creative', action: 'cover image skipped', status: 'info', detail: (e as Error).message.slice(0, 80) });
    }
  }

  store.emit({ agent: 'creative', action: 'generated monthly treasury report', status: 'success', detail: imageUrl ? 'with cover image' : 'text report' });
  return { report: res.content ?? '', imageUrl };
}

function mockReport(delegations: number, spend: number, receipts: number, rootCap: number): string {
  return `# Aliran — Monthly Treasury Report

**Period:** Current cycle  ·  **Mode:** ${config.MOCK_MODE ? 'mock/dry-run' : 'live'}

## Delegation structure
The owner granted a single **${rootCap} USDC/month** delegation to the CFO agent, which
redelegated narrower budgets to **${delegations - 1 > 0 ? delegations - 1 : 3}** specialist agents
(payroll, procurement, creative). All redelegations narrow authority and are independently revocable.

## Spend
- **Total disbursed:** ${spend} USDC across verified payroll and procurement.
- **Receipts on file:** ${receipts} (incl. x402 data purchases).
- No agent exceeded its on-chain cap; over-cap attempts reverted at the protocol level.

## Outlook
Yields on short-dated stablecoin vaults remain ~4–5% APY. Recommendation: hold a 60% operating
buffer, cap discretionary procurement at 30% of inflows, and front-load payroll to de-risk churn.

_Generated by the Aliran creative agent (Venice)._`;
}

// --- shared root-delegation bootstrap ---------------------------------------
/**
 * Returns the existing active owner→CFO root delegation. The root is created
 * only by the owner's connected MetaMask wallet (grant prepare/complete) — there
 * is no env-key auto-create path. Throws if no grant exists yet so run-month
 * fails loudly until the owner has signed a budget.
 */
export async function ensureRootDelegation(): Promise<SignedDelegationBundle> {
  const existing = store
    .read()
    .delegations.find((d) => d.parentId === null && d.fromRole === 'owner' && d.toRole === 'cfo' && d.status === 'active');
  if (existing) {
    const bundle = bundleFromRecordId(existing.id);
    if (bundle) return bundle;
  }
  throw new Error('No root delegation. Connect MetaMask and grant a budget to the CFO first.');
}

export { newRunContext };

function safeParse(s: string): Record<string, any> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
