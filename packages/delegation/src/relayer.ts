import { bytesToHex } from 'viem/utils';

/**
 * Minimal 1Shot public-relayer JSON-RPC client (no API key). See the installed
 * `public-relayer` skill (SKILL.md / examples.md) for the full protocol.
 */

export type JsonRpc<T> =
  | { jsonrpc?: '2.0'; id: number | string; result: T }
  | { jsonrpc?: '2.0'; id: number | string; error: { code: number; message: string; data?: unknown } };

export async function relayerRpc<T>(url: string, method: string, params: unknown, id = 1): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const json = (await res.json()) as JsonRpc<T>;
  if ('error' in json) {
    throw new Error(`[${json.error.code}] ${json.error.message} ${JSON.stringify(json.error.data ?? '')}`);
  }
  return (json as { result: T }).result;
}

/** Convert delegation bigints / Uint8Arrays into JSON-safe shapes for the relayer. */
export function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return `0x${value.toString(16)}`;
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (Array.isArray(value)) return value.map(toRelayerJson);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toRelayerJson(v);
    return out;
  }
  return value;
}

export interface ChainCaps {
  feeCollector: `0x${string}`;
  targetAddress: `0x${string}`;
  tokens: { address: `0x${string}`; symbol?: string; decimals: number | string }[];
}

export interface Estimate7710Result {
  success: boolean;
  paymentTokenAddress?: `0x${string}`;
  gasUsed?: Record<string, string>;
  requiredPaymentAmount?: string;
  context?: string;
  error?: string;
}

export interface RelayerStatus {
  status: 100 | 110 | 200 | 400 | 500;
  memo?: string;
  hash?: string;
  receipt?: { transactionHash?: string } & Record<string, unknown>;
  message?: string;
  data?: unknown;
}

export async function relayerGetCapabilities(url: string, chainId: string): Promise<ChainCaps> {
  const caps = await relayerRpc<Record<string, ChainCaps>>(url, 'relayer_getCapabilities', [chainId]);
  const c = caps[chainId];
  if (!c) throw new Error(`Relayer does not support chain ${chainId}`);
  return c;
}

export async function relayerEstimate(url: string, params: unknown): Promise<Estimate7710Result> {
  return relayerRpc<Estimate7710Result>(url, 'relayer_estimate7710Transaction', params, 0);
}

export async function relayerSend(url: string, params: unknown): Promise<string> {
  return relayerRpc<string>(url, 'relayer_send7710Transaction', params);
}

export async function relayerGetStatus(url: string, taskId: string): Promise<RelayerStatus> {
  return relayerRpc<RelayerStatus>(url, 'relayer_getStatus', { id: taskId, logs: false });
}

/** Poll until a terminal status (200 confirmed / 400 rejected / 500 reverted). */
export async function relayerPoll(
  url: string,
  taskId: string,
  onTick?: (s: RelayerStatus) => void,
  intervalMs = 3000,
  timeoutMs = 5 * 60_000,
): Promise<RelayerStatus> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    const s = await relayerGetStatus(url, taskId);
    if (s.status !== last) {
      onTick?.(s);
      last = s.status;
    }
    if (s.status === 200 || s.status === 400 || s.status === 500) return s;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for task ${taskId}`);
}
