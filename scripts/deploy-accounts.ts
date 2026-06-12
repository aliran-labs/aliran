/**
 * scripts/deploy-accounts.ts — deploy the smart accounts that must exist before
 * the delegation chain runs (owner executes payouts; cfo's chain signature is
 * validated; payroll/procurement submit userOps). Idempotent: skips deployed
 * accounts. Run after funding (Phase 3), before m1/m2/m3.  pnpm deploy:accounts
 */
import { config } from '@aliran/core';
import { ensureDeployed, smartAccountForRole, type AliranSmartAccount } from '@aliran/delegation';
import { createPublicClient, http, formatUnits, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';

const ROLES_TO_DEPLOY = ['owner', 'cfo', 'payroll', 'procurement'] as const;

async function main() {
  if (config.MOCK_MODE) {
    console.log('MOCK_MODE=true — deployment is a no-op in mock mode. Set MOCK_MODE=false first.');
    return;
  }
  const pc = createPublicClient({ chain: baseSepolia, transport: http(config.RPC_URL) });
  console.log('\nDeploying smart accounts on Base Sepolia');
  console.log('═'.repeat(64));

  // Pre-flight: warn on any unfunded (0 ETH) account.
  for (const role of ROLES_TO_DEPLOY) {
    let sa: AliranSmartAccount;
    try {
      sa = await smartAccountForRole(role);
    } catch (e) {
      console.log(`  ${role}: NO KEY — ${(e as Error).message.split('.')[0]}`);
      process.exitCode = 1;
      return;
    }
    const eth = await pc.getBalance({ address: sa.address as Address });
    if (eth === 0n) {
      console.log(`  ⚠ ${role} (${sa.address}) has 0 ETH — fund it before deploying. Aborting.`);
      process.exitCode = 1;
      return;
    }
    console.log(`  ${role.padEnd(12)} ${sa.address}  ETH=${formatUnits(eth, 18)}`);
  }

  console.log('─'.repeat(64));
  for (const role of ROLES_TO_DEPLOY) {
    try {
      const r = await ensureDeployed(role);
      if (r.alreadyDeployed) console.log(`  ${role.padEnd(12)} already deployed`);
      else console.log(`  ${role.padEnd(12)} DEPLOYED  tx=https://sepolia.basescan.org/tx/${r.txHash}`);
    } catch (e) {
      console.log(`  ${role.padEnd(12)} FAILED: ${(e as Error).message.split('\n')[0]}`);
      process.exitCode = 1;
    }
  }
  console.log('═'.repeat(64));
  console.log(process.exitCode ? '\nDeployment had failures.\n' : '\nAll required accounts deployed.\n');
}

main().catch((e) => { console.error('deploy crashed:', e); process.exit(1); });
