import { createPublicClient, http, type PublicClient } from 'viem';
import { baseSepolia } from 'viem/chains';
import { createBundlerClient, type BundlerClient } from 'viem/account-abstraction';
import { config } from '@aliran/core';

/**
 * Chain plumbing. In MOCK_MODE we still build a public client against the
 * default public RPC if none is set (reads like address derivation work without
 * an API key), but we never construct/use the bundler unless real broadcast is
 * requested — see requireReal() at the call sites in delegation.ts.
 */

export const chain = baseSepolia;

let _public: PublicClient | undefined;
export function getPublicClient(): PublicClient {
  if (_public) return _public;
  // baseSepolia has a sane default public RPC; RPC_URL overrides it.
  const transport = config.RPC_URL ? http(config.RPC_URL) : http();
  _public = createPublicClient({ chain, transport }) as PublicClient;
  return _public;
}

let _bundler: BundlerClient | undefined;
export function getBundlerClient(): BundlerClient {
  if (_bundler) return _bundler;
  if (!config.BUNDLER_URL) {
    throw new Error(
      'BUNDLER_URL is required to broadcast userOperations (7710 redemption). ' +
        'Set it in .env or run in MOCK_MODE. See BLOCKED.md.',
    );
  }
  _bundler = createBundlerClient({
    client: getPublicClient(),
    transport: http(config.BUNDLER_URL),
  });
  return _bundler;
}

/**
 * Realistic userOp gas fees. Pimlico exposes `pimlico_getUserOperationGasPrice`;
 * fall back to the public client's fee estimate. (The mock path uses 1n/1n and
 * never calls this.)
 */
export async function getUserOpFees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  // Try Pimlico's gas-price endpoint first.
  try {
    const res = await fetch(config.BUNDLER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'pimlico_getUserOperationGasPrice', params: [] }),
    });
    const j = (await res.json()) as { result?: { fast?: { maxFeePerGas: string; maxPriorityFeePerGas: string } } };
    const fast = j.result?.fast;
    if (fast?.maxFeePerGas && fast?.maxPriorityFeePerGas) {
      return { maxFeePerGas: BigInt(fast.maxFeePerGas), maxPriorityFeePerGas: BigInt(fast.maxPriorityFeePerGas) };
    }
  } catch {
    /* fall through */
  }
  // Fallback: public client fee estimate with a small priority tip.
  const pc = getPublicClient();
  const fees = await pc.estimateFeesPerGas();
  return {
    maxFeePerGas: fees.maxFeePerGas ?? 1_000_000_000n,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 1_000_000n,
  };
}
