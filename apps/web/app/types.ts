/** Mirror of the API /state response shape for the client. */
export interface DashboardState {
  mode: { mock: boolean; demoMode: string; chainId: number };
  treasury: { capUsdc: number; remainingUsdc: number; taskCount: number; openTasks: number };
  delegations: Delegation[];
  transactions: Tx[];
  tasks: Task[];
  receipts: Receipt[];
  activity: Activity[];
  runs: Run[];
}

export interface Delegation {
  id: string;
  parentId: string | null;
  fromRole: string;
  toRole: string;
  fromAddress: string;
  toAddress: string;
  capUsdc: number;
  spentUsdc: number;
  status: 'active' | 'revoked';
  expiry: number | null;
}
export interface Tx {
  id: string;
  kind: string;
  byRole: string;
  toAddress?: string;
  amountUsdc?: number;
  txHash?: string;
  status: string;
  memo?: string;
  error?: string;
  createdAt: number;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  contributorAddress: string;
  amountUsdc: number;
  status: string;
  evidence?: string;
}
export interface Receipt {
  id: string;
  url: string;
  paymentPayloadHash?: string;
  txHash?: string;
  synthesis?: string;
  response: unknown;
  createdAt: number;
}
export interface Activity {
  id: string;
  agent: string;
  action: string;
  amount?: number;
  txHash?: string;
  status: string;
  detail?: string;
  timestamp: number;
}
export interface Run {
  id: string;
  instruction: string;
  status: string;
  report?: string;
  reportImageUrl?: string;
  createdAt: number;
}
