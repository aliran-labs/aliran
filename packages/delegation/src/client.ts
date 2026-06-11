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
