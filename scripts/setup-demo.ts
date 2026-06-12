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
import { config, store, USDC_DECIMALS, demo } from '@aliran/core';
import { ROLES, ROLE_PK, accountForRole, newKey } from '@aliran/delegation';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function line() {
  console.log('─'.repeat(68));
}

/**
 * Write generated keys directly into .env (gitignored). We do NOT print key
 * values — only addresses. Replaces an existing `VAR=...` line or appends.
 */
function writeEnvKeys(kv: Record<string, string>): string {
  const envPath = resolve(process.cwd(), '.env');
  let text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  for (const [k, v] of Object.entries(kv)) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, `${k}=${v}`);
    else text += (text.endsWith('\n') || text === '' ? '' : '\n') + `${k}=${v}\n`;
  }
  writeFileSync(envPath, text);
  return envPath;
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

/** A valid signer key is 0x + 64 hex chars (32 bytes). */
function isValidPk(v: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(v);
}

console.log('\nAccounts (EOA signers behind each smart account):');
for (const role of ROLES) {
  let pk = ROLE_PK[role];
  const malformed = pk !== '' && !isValidPk(pk);
  if (!pk || malformed) {
    pk = newKey();
    generated[envVarForRole[role]!] = pk;
  }
  const acct = privateKeyToAccount(pk as Hex);
  const tag = !ROLE_PK[role]
    ? '(GENERATED — add to .env)'
    : malformed
      ? '(REPLACED — old value was not a 32-byte key; add new to .env)'
      : '(from .env)';
  console.log(`  ${role.padEnd(12)} ${acct.address}  ${tag}`);
}

if (Object.keys(generated).length) {
  const envPath = writeEnvKeys(generated);
  line();
  console.log(
    `Wrote ${Object.keys(generated).length} generated key(s) to ${envPath} ` +
      `(${Object.keys(generated).join(', ')}).`,
  );
  console.log('Key VALUES are not printed (kept out of logs). Addresses are shown above.');
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

  // Scaled mode: if DEMO_PAYROLL_PER_TASK_USDC is set, use it for every task so
  // real payroll payments stay tiny (faucet USDC is scarce).
  const perTask = demo.payrollPerTaskUsdc;
  for (let i = 0; i < seed.length; i++) {
    const t = seed[i]!;
    store.addTask({
      title: t.title,
      description: t.description,
      contributorAddress: contributors[i % contributors.length]!,
      amountUsdc: perTask > 0 ? perTask : t.amountUsdc,
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
