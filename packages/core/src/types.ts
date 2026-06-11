/** Shared domain types — the "schema" for the JSON store. */

export type AgentRole = 'owner' | 'cfo' | 'payroll' | 'procurement' | 'creative';

export type DelegationStatus = 'active' | 'revoked';

/**
 * A delegation or redelegation in the tree.
 * - parentId null => root delegation (owner -> CFO).
 * - capUsdc is the on-chain ERC20TransferAmount cap (human USDC units).
 * - spentUsdc is locally tracked for the UI; the chain is the source of truth.
 * - signedDelegation is the full signed delegation object (opaque JSON) used at
 *   redeem time; in mock mode it is a constructed-but-not-broadcast object.
 */
export interface DelegationRecord {
  id: string;
  parentId: string | null;
  fromRole: AgentRole;
  toRole: AgentRole;
  fromAddress: string;
  toAddress: string;
  capUsdc: number;
  spentUsdc: number;
  status: DelegationStatus;
  expiry: number | null; // unix seconds
  signedDelegation: unknown;
  createdAt: number;
}

export type TxStatus = 'pending' | 'success' | 'reverted' | 'dry-run';

export interface TransactionRecord {
  id: string;
  kind: 'transfer' | 'redelegation' | 'revoke' | 'x402-payment' | 'deploy';
  byRole: AgentRole;
  toAddress?: string;
  amountUsdc?: number;
  delegationId?: string;
  txHash?: string;
  userOpHash?: string;
  status: TxStatus;
  memo?: string;
  error?: string;
  createdAt: number;
}

export type TaskStatus = 'open' | 'done' | 'paid' | 'rejected';

export interface TaskRecord {
  id: string;
  title: string;
  description: string;
  contributorAddress: string;
  amountUsdc: number;
  status: TaskStatus;
  evidence?: string; // claimed proof-of-completion (string field judged by Venice)
  createdAt: number;
}

export interface ReceiptRecord {
  id: string;
  url: string;
  challenge: unknown; // the 402 PAYMENT-REQUIRED challenge
  paymentPayloadHash?: string;
  txHash?: string;
  response: unknown; // the purchased data
  synthesis?: string; // Venice synthesis shown in UI
  createdAt: number;
}

export type ActivityStatus = 'started' | 'success' | 'failed' | 'info';

export interface ActivityEvent {
  id: string;
  agent: AgentRole;
  action: string;
  amount?: number;
  txHash?: string;
  delegationId?: string;
  status: ActivityStatus;
  detail?: string;
  timestamp: number;
}

export interface AgentRunRecord {
  id: string;
  instruction: string;
  plan?: unknown;
  status: 'planning' | 'awaiting-approval' | 'executing' | 'done' | 'failed';
  createdAt: number;
}

export interface DbShape {
  delegations: DelegationRecord[];
  transactions: TransactionRecord[];
  tasks: TaskRecord[];
  receipts: ReceiptRecord[];
  activity: ActivityEvent[];
  runs: AgentRunRecord[];
}
