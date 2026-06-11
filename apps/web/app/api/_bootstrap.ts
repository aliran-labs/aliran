import { config } from '@aliran/core';
import { ROLE_PK } from '@aliran/delegation';
import { generatePrivateKey } from 'viem/accounts';

/**
 * Server-only: in MOCK_MODE, ensure every role has a key so the agent flow runs
 * without credentials. Idempotent; keys live only in this server process.
 * In real mode this is a no-op (keys must come from .env deliberately).
 */
let done = false;
export function ensureMockKeys() {
  if (done || !config.MOCK_MODE) return;
  const map: Record<string, string> = {
    owner: 'OWNER_PRIVATE_KEY', cfo: 'AGENT_CFO_PK', payroll: 'AGENT_PAYROLL_PK',
    procurement: 'AGENT_PROCUREMENT_PK', creative: 'AGENT_CREATIVE_PK',
  };
  for (const [role, env] of Object.entries(map)) {
    if (!ROLE_PK[role as keyof typeof ROLE_PK]) {
      const pk = generatePrivateKey();
      process.env[env] = pk;
      (ROLE_PK as Record<string, string>)[role] = pk;
    }
  }
  done = true;
}
