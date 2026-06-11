import {
  createRedelegation,
  redeemTransfer,
  buyX402,
  type SignedDelegationBundle,
} from '@aliran/delegation';
import { store, config, type AgentRole } from '@aliran/core';
import type { Address } from 'viem';
import type { VeniceTool } from './venice';

/**
 * Tools exposed to agents. Agents NEVER touch keys — every tool calls into
 * packages/delegation, which holds the signing. A RunContext carries the live
 * delegation bundles between steps (the CFO produces redelegation bundles that
 * workers later redeem against).
 */
export interface RunContext {
  root?: SignedDelegationBundle; // owner -> CFO
  bundles: Partial<Record<AgentRole, SignedDelegationBundle>>; // CFO -> worker
}

export function newRunContext(root?: SignedDelegationBundle): RunContext {
  return { root, bundles: {} };
}

// --- tool: create_redelegation ----------------------------------------------
export async function tool_create_redelegation(
  ctx: RunContext,
  args: { agent: AgentRole; maxUsdc: number; expiry?: number },
): Promise<{ ok: boolean; delegationId?: string; error?: string }> {
  if (!ctx.root) return { ok: false, error: 'no root delegation in context' };
  try {
    const bundle = await createRedelegation({
      parent: ctx.root,
      fromRole: 'cfo',
      toRole: args.agent,
      capUsdc: args.maxUsdc,
      expiry: args.expiry ?? null,
    });
    ctx.bundles[args.agent] = bundle;
    return { ok: true, delegationId: bundle.recordId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// --- tool: pay_usdc ---------------------------------------------------------
export async function tool_pay_usdc(
  ctx: RunContext,
  byRole: AgentRole,
  args: { to: string; amount: number; memo?: string; forceOverspend?: boolean },
): Promise<{ ok: boolean; txHash?: string; error?: string }> {
  const leaf = ctx.bundles[byRole];
  if (!leaf) return { ok: false, error: `no delegation bundle for ${byRole}` };
  const res = await redeemTransfer({
    leaf,
    recipient: args.to as Address,
    amountUsdc: args.amount,
    byRole,
    memo: args.memo,
    forceOverspend: args.forceOverspend,
  });
  return { ok: res.ok, txHash: res.txHash, error: res.error };
}

// --- tool: fetch_x402 -------------------------------------------------------
export async function tool_fetch_x402(
  byRole: AgentRole,
  args: { url: string },
): Promise<{ ok: boolean; data?: unknown; receiptId?: string; error?: string }> {
  const res = await buyX402({ url: args.url, buyerRole: byRole });
  return { ok: res.ok, data: res.data, receiptId: res.receiptId, error: res.error };
}

// --- tool: read_task_board --------------------------------------------------
export function tool_read_task_board(): {
  id: string;
  title: string;
  description: string;
  contributorAddress: string;
  amountUsdc: number;
  status: string;
  evidence?: string;
}[] {
  return store.read().tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    contributorAddress: t.contributorAddress,
    amountUsdc: t.amountUsdc,
    status: t.status,
    evidence: t.evidence,
  }));
}

// --- tool: generate_report (handled in the creative agent via Venice) -------
// (declared here for the schema; implementation lives in agents/creative.ts)

/** OpenAI-style tool schemas, advertised to Venice in real mode. */
export const TOOL_SCHEMAS: VeniceTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_redelegation',
      description: 'CFO creates a narrower redelegation to a worker agent with a USDC cap.',
      parameters: {
        type: 'object',
        properties: {
          agent: { type: 'string', enum: ['payroll', 'procurement', 'creative'] },
          maxUsdc: { type: 'number' },
          expiry: { type: 'number', description: 'unix seconds, optional' },
        },
        required: ['agent', 'maxUsdc'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pay_usdc',
      description: 'Pay USDC to an address by redeeming the caller agent delegation.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          amount: { type: 'number' },
          memo: { type: 'string' },
        },
        required: ['to', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_x402',
      description: 'Fetch an x402-protected URL, paying via ERC-7710 delegation.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_task_board',
      description: 'Read the in-app task board (tasks, status, claimed evidence).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_report',
      description: 'Generate the monthly treasury report markdown (and optional cover).',
      parameters: {
        type: 'object',
        properties: { withImage: { type: 'boolean' } },
      },
    },
  },
];

export { config };
