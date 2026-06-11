/**
 * scripts/setup-demo.ts
 *
 * Idempotent demo bootstrap:
 *   1. Generate any missing agent/owner private keys and print them so you can
 *      paste them into .env (we never write .env for you — keys stay in your hands).
 *   2. Print the addresses that need testnet ETH (gas) and testnet USDC.
 *   3. Seed the in-app task board.
 *   4. In real mode (MOCK_MODE=false) deploy the smart accounts lazily — here we
 *      only print the deploy plan; actual deploy happens on first use in M1.
 *
 * Run: pnpm setup:demo
 */
import { config, store, USDC_DECIMALS } from '@aliran/core';
import { ROLES, ROLE_PK, accountForRole, newKey } from '@aliran/delegation';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

function line() {
  console.log('─'.repeat(68));
}

console.log('\nAliran demo setup');
line();
console.log(`MOCK_MODE = ${config.MOCK_MODE}   DEMO_MODE = ${config.DEMO_MODE}`);
console.log(`Chain     = Base Sepolia (${config.CHAIN_ID})`);
console.log(`USDC      = ${config.USDC_ADDRESS}`);
line();

// 1 + 2: keys and funding checklist -----------------------------------------
const generated: Record<string, Hex> = {};
const envVarForRole: Record<string, string> = {
  owner: 'OWNER_PRIVATE_KEY',
  cfo: 'AGENT_CFO_PK',
  payroll: 'AGENT_PAYROLL_PK',
  procurement: 'AGENT_PROCUREMENT_PK',
  creative: 'AGENT_CREATIVE_PK',
};

console.log('\nAccounts (EOA signers behind each smart account):');
for (const role of ROLES) {
  let pk = ROLE_PK[role];
  if (!pk) {
    pk = newKey();
    generated[envVarForRole[role]!] = pk;
  }
  const acct = privateKeyToAccount(pk as Hex);
  const tag = ROLE_PK[role] ? '(from .env)' : '(GENERATED — add to .env)';
  console.log(`  ${role.padEnd(12)} ${acct.address}  ${tag}`);
}

if (Object.keys(generated).length) {
  line();
  console.log('Add these GENERATED keys to your .env (then re-run setup):\n');
  for (const [k, v] of Object.entries(generated)) console.log(`${k}=${v}`);
}

line();
console.log('\nFunding checklist (do this before real-mode runs):');
console.log('  • Send Base Sepolia ETH (gas) to each agent address above.');
console.log('    Faucet: https://docs.base.org/tools/network-faucets');
console.log('  • Send Base Sepolia USDC to the OWNER address (it funds the treasury).');
console.log(`    USDC token: ${config.USDC_ADDRESS}`);
console.log('  • Set SELLER_PAY_TO_ADDRESS to any address you control (receives x402 fees).');

// 3: seed the task board -----------------------------------------------------
const db = store.read();
if (db.tasks.length === 0) {
  const contributors =
    config.CONTRIBUTOR_ADDRESSES.length > 0
      ? config.CONTRIBUTOR_ADDRESSES
      : [
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222',
          '0x3333333333333333333333333333333333333333',
        ];

  const seed = [
    {
      title: 'Ship delegation tree UI',
      description: 'Implement the live delegation tree view with caps + remaining spend.',
      amountUsdc: 120,
      evidence: 'PR #42 merged; screenshot of tree rendering 4 nodes with caps.',
      status: 'done' as const,
    },
    {
      title: 'Write x402 buyer integration',
      description: 'Buyer pays the seller market-brief endpoint via ERC-7710 delegation.',
      amountUsdc: 90,
      evidence: 'Receipt stored: 402 challenge + payment hash + 200 response logged.',
      status: 'done' as const,
    },
    {
      title: 'Audit caveat enforcement',
      description: 'Confirm a redelegation cannot exceed parent cap; document revert.',
      amountUsdc: 80,
      evidence: 'Overspend attempt reverted on-chain; revert reason captured.',
      status: 'done' as const,
    },
    {
      title: 'Design report cover art',
      description: 'Creative agent generates a monthly treasury report cover.',
      amountUsdc: 40,
      evidence: '',
      status: 'open' as const,
    },
  ];

  for (let i = 0; i < seed.length; i++) {
    const t = seed[i]!;
    store.addTask({
      title: t.title,
      description: t.description,
      contributorAddress: contributors[i % contributors.length]!,
      amountUsdc: t.amountUsdc,
      status: t.status,
      evidence: t.evidence,
    });
  }
  console.log(`\nSeeded ${seed.length} tasks into the task board (${store.path}).`);
} else {
  console.log(`\nTask board already has ${db.tasks.length} tasks — leaving as-is.`);
}

// 4: deploy plan -------------------------------------------------------------
line();
if (config.MOCK_MODE) {
  console.log('\nMOCK_MODE: smart-account deploys are dry-run. No broadcasts.');
  console.log('Smart accounts will be CONSTRUCTED (address derivable) in M1 and logged.');
} else {
  console.log('\nReal mode: smart accounts deploy lazily on first userOp in M1.');
  console.log('Ensure each agent address has gas before running `pnpm m1`.');
}

console.log(`\nDecimals: USDC has ${USDC_DECIMALS} decimals. Owner = ${
  accountForRole('owner')?.address ?? '(no OWNER_PRIVATE_KEY yet — generate above)'
}`);
console.log('\nSetup complete.\n');
