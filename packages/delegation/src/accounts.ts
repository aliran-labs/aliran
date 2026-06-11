import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import type { Hex } from 'viem';
import { config, type AgentRole } from '@aliran/core';

/**
 * Maps each agent role to its configured private key. The owner key is the
 * env-key fallback signer (used when DEMO_MODE=env-key). In MOCK_MODE these may
 * be empty; callers that only need an *address* can generate a deterministic
 * placeholder, while real broadcast paths assert presence.
 */
export const ROLE_PK: Record<Exclude<AgentRole, 'owner'> | 'owner', string> = {
  owner: config.OWNER_PRIVATE_KEY,
  cfo: config.AGENT_CFO_PK,
  payroll: config.AGENT_PAYROLL_PK,
  procurement: config.AGENT_PROCUREMENT_PK,
  creative: config.AGENT_CREATIVE_PK,
};

export function hasKey(role: AgentRole): boolean {
  return Boolean(ROLE_PK[role]);
}

/** Returns a viem account for the role, or null if no key configured. */
export function accountForRole(role: AgentRole) {
  const pk = ROLE_PK[role];
  if (!pk) return null;
  return privateKeyToAccount(pk as Hex);
}

/** Generate a fresh key (used by setup-demo to fill missing slots). */
export function newKey(): Hex {
  return generatePrivateKey();
}

export const ROLES: AgentRole[] = ['owner', 'cfo', 'payroll', 'procurement', 'creative'];
