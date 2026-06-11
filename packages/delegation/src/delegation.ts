import {
  createDelegation,
  createExecution,
  ScopeType,
  ExecutionMode,
} from '@metamask/smart-accounts-kit';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';
import {
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  keccak256,
  toHex,
  type Hex,
  type Address,
} from 'viem';
import { config, store, USDC_DECIMALS, type AgentRole, requireReal } from '@aliran/core';
import { smartAccountForRole, type AliranSmartAccount } from './smartAccount';
import { getBundlerClient } from './client';

const USDC = config.USDC_ADDRESS as Address;

/** A signed delegation plus the bookkeeping we attach to it. */
export interface SignedDelegationBundle {
  /** The signed delegation object as the kit produces it (opaque to callers). */
  signed: unknown;
  /** Convenience: the full chain delegate->root, ordered for redeemDelegations. */
  chain: unknown[];
  fromRole: AgentRole;
  toRole: AgentRole;
  fromAddress: string;
  toAddress: string;
  capUsdc: number;
  /** DB record id (set when persisted by the higher-level helpers). */
  recordId?: string;
}

function usdc(amount: number): bigint {
  return parseUnits(amount.toString(), USDC_DECIMALS);
}

/** Deterministic synthetic hash for mock-mode would-be transactions. */
function mockHash(label: string): Hex {
  return keccak256(toHex(`${label}:${Date.now()}:${Math.random()}`));
}

/**
 * Create + sign a ROOT delegation: owner -> CFO, ERC20 transfer-amount scope.
 * Persists a DelegationRecord and emits an activity event.
 */
export async function createRootDelegation(opts: {
  fromRole: AgentRole; // owner
  toRole: AgentRole; // cfo
  capUsdc: number;
  expiry?: number | null;
}): Promise<SignedDelegationBundle> {
  const from = await smartAccountForRole(opts.fromRole);
  const to = await smartAccountForRole(opts.toRole);

  const delegation = createDelegation({
    to: to.address,
    from: from.address,
    environment: from.environment,
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: USDC,
      maxAmount: usdc(opts.capUsdc),
    },
  });

  const signature = await from.signDelegation({ delegation });
  const signed = { ...delegation, signature } as Record<string, unknown>;

  const rec = store.addDelegation({
    parentId: null,
    fromRole: opts.fromRole,
    toRole: opts.toRole,
    fromAddress: from.address,
    toAddress: to.address,
    capUsdc: opts.capUsdc,
    spentUsdc: 0,
    status: 'active',
    expiry: opts.expiry ?? null,
    signedDelegation: signed,
  });

  store.emit({
    agent: opts.fromRole,
    action: `granted root delegation to ${opts.toRole}`,
    amount: opts.capUsdc,
    delegationId: rec.id,
    status: 'success',
    detail: `${opts.capUsdc} USDC/mo cap (ERC20TransferAmount) ${config.MOCK_MODE ? '[mock]' : ''}`,
  });

  return {
    signed,
    chain: [signed],
    fromRole: opts.fromRole,
    toRole: opts.toRole,
    fromAddress: from.address,
    toAddress: to.address,
    capUsdc: opts.capUsdc,
    recordId: rec.id,
  };
}

/**
 * Create + sign a REDELEGATION narrowing a parent: e.g. CFO -> payroll.
 * The kit enforces that maxAmount can only narrow; we additionally guard in the
 * UI/bookkeeping layer.
 */
export async function createRedelegation(opts: {
  parent: SignedDelegationBundle;
  fromRole: AgentRole; // cfo
  toRole: AgentRole; // worker
  capUsdc: number;
  expiry?: number | null;
}): Promise<SignedDelegationBundle> {
  if (opts.capUsdc > opts.parent.capUsdc) {
    throw new Error(
      `Redelegation cap (${opts.capUsdc}) cannot exceed parent cap (${opts.parent.capUsdc}); ` +
        `redelegations may only narrow authority.`,
    );
  }

  const from = await smartAccountForRole(opts.fromRole);
  const to = await smartAccountForRole(opts.toRole);

  const redelegation = createDelegation({
    to: to.address,
    from: from.address,
    environment: from.environment,
    parentDelegation: opts.parent.signed as never,
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: USDC,
      maxAmount: usdc(opts.capUsdc),
    },
  });

  const signature = await from.signDelegation({ delegation: redelegation });
  const signed = { ...redelegation, signature } as Record<string, unknown>;

  const rec = store.addDelegation({
    parentId: opts.parent.recordId ?? null,
    fromRole: opts.fromRole,
    toRole: opts.toRole,
    fromAddress: from.address,
    toAddress: to.address,
    capUsdc: opts.capUsdc,
    spentUsdc: 0,
    status: 'active',
    expiry: opts.expiry ?? null,
    signedDelegation: signed,
  });

  store.emit({
    agent: opts.fromRole,
    action: `redelegated to ${opts.toRole}`,
    amount: opts.capUsdc,
    delegationId: rec.id,
    status: 'success',
    detail: `${opts.capUsdc} USDC narrowed from ${opts.parent.capUsdc} ${config.MOCK_MODE ? '[mock]' : ''}`,
  });

  return {
    signed,
    // Redemption order is delegate -> ... -> root.
    chain: [signed, ...opts.parent.chain],
    fromRole: opts.fromRole,
    toRole: opts.toRole,
    fromAddress: from.address,
    toAddress: to.address,
    capUsdc: opts.capUsdc,
    recordId: rec.id,
  };
}

export interface RedeemResult {
  ok: boolean;
  txHash?: string;
  userOpHash?: string;
  error?: string;
  dryRun: boolean;
}

/**
 * Redeem a delegation chain to transfer USDC to `recipient`.
 * The leaf delegate (last redelegatee) is the one executing.
 *
 * MOCK_MODE: builds the redeemDelegations calldata for real (proving the chain
 * is well-formed), checks the local cap, logs the would-be userOp, and returns
 * a synthetic hash WITHOUT broadcasting.
 *
 * Real mode: sends the userOperation through the bundler and waits for receipt.
 */
export async function redeemTransfer(opts: {
  leaf: SignedDelegationBundle;
  recipient: Address;
  amountUsdc: number;
  byRole: AgentRole;
  memo?: string;
  /** When true, skip the local cap pre-check to demonstrate an on-chain revert. */
  forceOverspend?: boolean;
}): Promise<RedeemResult> {
  const leafAccount = await smartAccountForRole(opts.leaf.toRole);

  // Build the ERC20 transfer execution.
  const callData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [opts.recipient, usdc(opts.amountUsdc)],
  });
  const executions = [createExecution({ target: USDC, callData })];

  // Encode the full chain redemption.
  const redeemCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [opts.leaf.chain as never],
    modes: [ExecutionMode.SingleDefault],
    executions: [executions],
  });

  // Local cap bookkeeping (the chain is the real enforcer; this drives the UI
  // and lets us short-circuit a guaranteed-revert unless forceOverspend).
  const rec = opts.leaf.recordId
    ? store.read().delegations.find((d) => d.id === opts.leaf.recordId)
    : undefined;
  const remaining = rec ? rec.capUsdc - rec.spentUsdc : opts.leaf.capUsdc;
  const wouldExceedCap = opts.amountUsdc > remaining;
  const isRevoked = rec?.status === 'revoked';

  store.emit({
    agent: opts.byRole,
    action: `redeem transfer → ${opts.recipient.slice(0, 8)}…`,
    amount: opts.amountUsdc,
    delegationId: opts.leaf.recordId,
    status: 'started',
    detail: opts.memo,
  });

  // --- failure paths that the chain would also enforce ----------------------
  if (isRevoked) {
    return fail(opts, redeemCalldata, 'Delegation has been revoked (disableDelegation); redemption reverts.');
  }
  if (wouldExceedCap && !opts.forceOverspend) {
    return fail(
      opts,
      redeemCalldata,
      `Amount ${opts.amountUsdc} exceeds remaining cap ${remaining}; ` +
        `on-chain caveat (ERC20TransferAmount) would revert.`,
    );
  }

  // --- MOCK dry-run ---------------------------------------------------------
  if (config.MOCK_MODE) {
    // If forcing overspend in mock mode, simulate the protocol revert.
    if (wouldExceedCap && opts.forceOverspend) {
      return fail(
        opts,
        redeemCalldata,
        `[mock on-chain revert] ERC20TransferAmount caveat: transfer of ${opts.amountUsdc} ` +
          `exceeds allowance ${remaining}. (real mode would revert in DelegationManager)`,
      );
    }
    const txHash = mockHash('redeem');
    store.addTransaction({
      kind: 'transfer',
      byRole: opts.byRole,
      toAddress: opts.recipient,
      amountUsdc: opts.amountUsdc,
      delegationId: opts.leaf.recordId,
      txHash,
      status: 'dry-run',
      memo: opts.memo,
    });
    if (rec) store.updateDelegation(rec.id, { spentUsdc: rec.spentUsdc + opts.amountUsdc });
    store.emit({
      agent: opts.byRole,
      action: `paid ${opts.amountUsdc} USDC → ${opts.recipient.slice(0, 8)}…`,
      amount: opts.amountUsdc,
      txHash,
      delegationId: opts.leaf.recordId,
      status: 'success',
      detail: `[mock dry-run] would broadcast redeemDelegations userOp (calldata ${redeemCalldata.length} bytes)`,
    });
    // eslint-disable-next-line no-console
    console.log(`[mock] redeem userOp NOT broadcast. calldata bytes=${redeemCalldata.length} tx=${txHash}`);
    return { ok: true, txHash, dryRun: true };
  }

  // --- REAL broadcast -------------------------------------------------------
  requireReal({ RPC_URL: config.RPC_URL, BUNDLER_URL: config.BUNDLER_URL, USDC_ADDRESS: config.USDC_ADDRESS });
  try {
    const bundler = getBundlerClient();
    const userOpHash = await bundler.sendUserOperation({
      account: leafAccount,
      calls: [{ to: leafAccount.address, data: redeemCalldata }],
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
    });
    const receipt = await bundler.waitForUserOperationReceipt({ hash: userOpHash });
    const txHash = receipt.receipt.transactionHash;
    store.addTransaction({
      kind: 'transfer',
      byRole: opts.byRole,
      toAddress: opts.recipient,
      amountUsdc: opts.amountUsdc,
      delegationId: opts.leaf.recordId,
      txHash,
      userOpHash,
      status: receipt.success ? 'success' : 'reverted',
      memo: opts.memo,
    });
    if (receipt.success && rec) {
      store.updateDelegation(rec.id, { spentUsdc: rec.spentUsdc + opts.amountUsdc });
    }
    store.emit({
      agent: opts.byRole,
      action: `paid ${opts.amountUsdc} USDC → ${opts.recipient.slice(0, 8)}…`,
      amount: opts.amountUsdc,
      txHash,
      delegationId: opts.leaf.recordId,
      status: receipt.success ? 'success' : 'failed',
    });
    return { ok: receipt.success, txHash, userOpHash, dryRun: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(opts, redeemCalldata, msg);
  }
}

function fail(
  opts: { byRole: AgentRole; recipient: Address; amountUsdc: number; leaf: SignedDelegationBundle; memo?: string },
  redeemCalldata: string,
  error: string,
): RedeemResult {
  store.addTransaction({
    kind: 'transfer',
    byRole: opts.byRole,
    toAddress: opts.recipient,
    amountUsdc: opts.amountUsdc,
    delegationId: opts.leaf.recordId,
    status: 'reverted',
    memo: opts.memo,
    error,
  });
  store.emit({
    agent: opts.byRole,
    action: `payment FAILED → ${opts.recipient.slice(0, 8)}…`,
    amount: opts.amountUsdc,
    delegationId: opts.leaf.recordId,
    status: 'failed',
    detail: error,
  });
  return { ok: false, error, dryRun: config.MOCK_MODE };
}

/**
 * Revoke (disable) a delegation. The delegator sends a disableDelegation userOp.
 * MOCK_MODE marks the record revoked + logs the would-be userOp.
 */
export async function revokeDelegation(bundle: SignedDelegationBundle): Promise<RedeemResult> {
  const delegator = await smartAccountForRole(bundle.fromRole);
  const disableCalldata = DelegationManager.encode.disableDelegation({
    delegation: bundle.signed as never,
  });

  store.emit({
    agent: bundle.fromRole,
    action: `revoking delegation to ${bundle.toRole}`,
    delegationId: bundle.recordId,
    status: 'started',
  });

  if (config.MOCK_MODE) {
    const txHash = mockHash('revoke');
    if (bundle.recordId) store.updateDelegation(bundle.recordId, { status: 'revoked' });
    store.addTransaction({
      kind: 'revoke',
      byRole: bundle.fromRole,
      delegationId: bundle.recordId,
      txHash,
      status: 'dry-run',
    });
    store.emit({
      agent: bundle.fromRole,
      action: `revoked delegation to ${bundle.toRole}`,
      delegationId: bundle.recordId,
      txHash,
      status: 'success',
      detail: '[mock dry-run] would broadcast disableDelegation userOp',
    });
    return { ok: true, txHash, dryRun: true };
  }

  requireReal({ RPC_URL: config.RPC_URL, BUNDLER_URL: config.BUNDLER_URL });
  const bundler = getBundlerClient();
  const userOpHash = await bundler.sendUserOperation({
    account: delegator,
    calls: [{ to: delegator.environment.DelegationManager as Address, data: disableCalldata }],
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
  });
  const receipt = await bundler.waitForUserOperationReceipt({ hash: userOpHash });
  const txHash = receipt.receipt.transactionHash;
  if (bundle.recordId) store.updateDelegation(bundle.recordId, { status: 'revoked' });
  store.addTransaction({
    kind: 'revoke',
    byRole: bundle.fromRole,
    delegationId: bundle.recordId,
    txHash,
    userOpHash,
    status: receipt.success ? 'success' : 'reverted',
  });
  store.emit({
    agent: bundle.fromRole,
    action: `revoked delegation to ${bundle.toRole}`,
    delegationId: bundle.recordId,
    txHash,
    status: receipt.success ? 'success' : 'failed',
  });
  return { ok: receipt.success, txHash, userOpHash, dryRun: false };
}

/**
 * Rebuild a SignedDelegationBundle from a persisted delegation id, walking the
 * parent chain. Lets stateless API requests (revoke, overspend) operate on
 * delegations created in an earlier request/run.
 */
export function bundleFromRecordId(id: string): SignedDelegationBundle | null {
  const db = store.read();
  const byId = new Map(db.delegations.map((d) => [d.id, d]));
  const rec = byId.get(id);
  if (!rec) return null;

  // Build the signed chain leaf -> root.
  const chain: unknown[] = [];
  let cur = rec;
  while (cur) {
    chain.push(cur.signedDelegation);
    cur = cur.parentId ? byId.get(cur.parentId)! : undefined!;
    if (!cur) break;
  }

  return {
    signed: rec.signedDelegation,
    chain,
    fromRole: rec.fromRole,
    toRole: rec.toRole,
    fromAddress: rec.fromAddress,
    toAddress: rec.toAddress,
    capUsdc: rec.capUsdc,
    recordId: rec.id,
  };
}

export { usdc as toUsdcUnits };
export type { AliranSmartAccount };
