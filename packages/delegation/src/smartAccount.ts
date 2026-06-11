import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit';
import type { Account } from 'viem';
import { type AgentRole } from '@aliran/core';
import { getPublicClient } from './client';
import { accountForRole } from './accounts';

/**
 * A MetaMask Hybrid smart account, built from the EOA signer behind a role.
 * Works in MOCK_MODE: construction only needs a public client (no broadcast),
 * so addresses are derivable and delegations can be signed offline.
 */
export type AliranSmartAccount = Awaited<ReturnType<typeof toMetaMaskSmartAccount>>;

const cache = new Map<string, AliranSmartAccount>();

export async function smartAccountFromSigner(account: Account): Promise<AliranSmartAccount> {
  const key = account.address.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const sa = await toMetaMaskSmartAccount({
    client: getPublicClient(),
    implementation: Implementation.Hybrid,
    deployParams: [account.address, [], [], []],
    deploySalt: '0x',
    signer: { account },
  });
  cache.set(key, sa);
  return sa;
}

/** Build the smart account for a role, or throw if the role has no key set. */
export async function smartAccountForRole(role: AgentRole): Promise<AliranSmartAccount> {
  const account = accountForRole(role);
  if (!account) {
    throw new Error(
      `No private key for role "${role}". Run \`pnpm setup:demo\` and fill .env ` +
        `(${role === 'owner' ? 'OWNER_PRIVATE_KEY' : `AGENT_${role.toUpperCase()}_PK`}). See BLOCKED.md.`,
    );
  }
  return smartAccountFromSigner(account);
}
