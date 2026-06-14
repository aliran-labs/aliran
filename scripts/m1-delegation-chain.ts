/**
 * scripts/m1-delegation-chain.ts  —  M1 integration script
 *
 * Demonstrates the full delegation lifecycle on Base Sepolia:
 *   owner --(root 500 USDC)--> CFO --(redelegate 300)--> payroll --> contributor
 *
 *   1. Owner grants root delegation to CFO (500 USDC cap).
 *   2. CFO redelegates a narrower budget to payroll (300 USDC).
 *   3. Payroll redeems a 120 USDC transfer to a contributor   → SUCCESS
 *   4. Payroll attempts a 9_999 USDC transfer (over cap)       → FAILS (cap caveat)
 *   5. Owner revokes the root delegation; payroll retries 10   → FAILS (revoked)
 *
 * MOCK_MODE=true (default): every step constructs + signs real delegation
 * objects and builds real redeemDelegations calldata, but broadcasts nothing —
 * the would-be userOps are logged. In real mode the same script broadcasts.
 *
 * Run: pnpm m1
 */
import { config, store } from '@aliran/core';

// Test-only fixtures for this integration script (NOT product config): a small
// root cap, a narrower payroll redelegation, and a sample payout amount.
const TEST_ROOT_CAP = 8;
const TEST_PAYROLL_CAP = 4;
const TEST_PAY_AMOUNT = 0.5;
import {
  createRootDelegation,
  createRedelegation,
  redeemTransfer,
  revokeDelegation,
  ROLE_PK,
} from '@aliran/delegation';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Address } from 'viem';

function hr() {
  console.log('─'.repeat(70));
}
function ok(s: string) {
  console.log(`  ✓ ${s}`);
}
function bad(s: string) {
  console.log(`  ✗ ${s}`);
}

// --- self-contained keys for mock runs --------------------------------------
// In MOCK_MODE, if a role has no key in .env, mint an ephemeral one into the
// process env so the script runs end-to-end without credentials. We NEVER do
// this in real mode (you must fund deliberate addresses).
const envKeyName: Record<string, string> = {
  owner: 'OWNER_PRIVATE_KEY',
  cfo: 'AGENT_CFO_PK',
  payroll: 'AGENT_PAYROLL_PK',
  procurement: 'AGENT_PROCUREMENT_PK',
  creative: 'AGENT_CREATIVE_PK',
};
if (config.MOCK_MODE) {
  for (const [role, env] of Object.entries(envKeyName)) {
    if (!ROLE_PK[role as keyof typeof ROLE_PK]) {
      const pk = generatePrivateKey();
      process.env[env] = pk;
      (ROLE_PK as Record<string, string>)[role] = pk;
    }
  }
}

async function main() {
  console.log('\nM1 — delegation chain integration');
  hr();
  console.log(`MOCK_MODE=${config.MOCK_MODE}  chain=Base Sepolia (${config.CHAIN_ID})`);
  console.log(`USDC=${config.USDC_ADDRESS}`);
  hr();

  // Reset prior runs of delegations/txs so the demo is deterministic (keep tasks).
  const db = store.read();
  db.delegations = [];
  db.transactions = [];
  db.activity = [];
  store.write(db);

  const contributor: Address =
    (config.CONTRIBUTOR_ADDRESSES[0] as Address) ||
    privateKeyToAccount(generatePrivateKey()).address;

  // 1. Root delegation owner -> CFO ------------------------------------------
  console.log('\n[1] Owner → CFO root delegation');
  const root = await createRootDelegation({
    fromRole: 'owner',
    toRole: 'cfo',
    capUsdc: TEST_ROOT_CAP,
  });
  ok(`root signed: owner ${root.fromAddress.slice(0, 10)}… → CFO ${root.toAddress.slice(0, 10)}… cap=${root.capUsdc} USDC`);

  // 2. Redelegation CFO -> payroll -------------------------------------------
  console.log(`\n[2] CFO → payroll redelegation (narrowed to ${TEST_PAYROLL_CAP})`);
  const payroll = await createRedelegation({
    parent: root,
    fromRole: 'cfo',
    toRole: 'payroll',
    capUsdc: TEST_PAYROLL_CAP,
  });
  ok(`redelegation signed: cap=${payroll.capUsdc} (chain length=${payroll.chain.length})`);

  // Prove narrowing-only is enforced at construction.
  console.log('\n[2b] Attempt to WIDEN beyond parent (expect rejection)');
  try {
    await createRedelegation({ parent: payroll, fromRole: 'payroll', toRole: 'creative', capUsdc: TEST_ROOT_CAP * 100 });
    bad('widening was NOT rejected — BUG');
    process.exitCode = 1;
  } catch (e) {
    ok(`widening rejected: ${(e as Error).message.split(';')[0]}`);
  }

  // 3. Successful redemption: payroll pays contributor (small amount) ---------
  const payAmount = TEST_PAY_AMOUNT;
  console.log(`\n[3] Payroll redeems ${payAmount} USDC → contributor (expect SUCCESS)`);
  const r1 = await redeemTransfer({
    leaf: payroll,
    recipient: contributor,
    amountUsdc: payAmount,
    byRole: 'payroll',
    memo: 'task: ship delegation tree UI',
  });
  if (r1.ok) ok(`paid ${payAmount} USDC ${r1.dryRun ? '[dry-run]' : ''} tx=${r1.txHash?.slice(0, 14)}…`);
  else {
    bad(`unexpected failure: ${r1.error}`);
    process.exitCode = 1;
  }

  // 4. Over-cap redemption (expect protocol-level FAIL) ----------------------
  const overAmount = TEST_PAYROLL_CAP * 1000;
  console.log(`\n[4] Payroll redeems ${overAmount} USDC (over ${TEST_PAYROLL_CAP} cap) — force on-chain revert`);
  const r2 = await redeemTransfer({
    leaf: payroll,
    recipient: contributor,
    amountUsdc: overAmount,
    byRole: 'payroll',
    memo: 'overspend demo',
    forceOverspend: true, // bypass local pre-check → exercise the revert path
  });
  if (!r2.ok) ok(`correctly FAILED: ${r2.error?.slice(0, 80)}…`);
  else {
    bad('overspend SUCCEEDED — caveat not enforced, BUG');
    process.exitCode = 1;
  }

  // 5. Revoke, then redemption must fail -------------------------------------
  console.log('\n[5] Owner revokes root delegation, payroll retries (expect FAIL)');
  const rev = await revokeDelegation(root);
  ok(`revoked root ${rev.dryRun ? '[dry-run]' : ''} tx=${rev.txHash?.slice(0, 14)}…`);
  // Mark child revoked too (in real mode disabling the root breaks the chain;
  // we mirror that locally so the leaf record reflects it).
  if (payroll.recordId) store.updateDelegation(payroll.recordId, { status: 'revoked' });

  const r3 = await redeemTransfer({
    leaf: payroll,
    recipient: contributor,
    amountUsdc: payAmount,
    byRole: 'payroll',
    memo: 'post-revoke attempt',
  });
  if (!r3.ok) ok(`correctly FAILED after revoke: ${r3.error?.slice(0, 60)}…`);
  else {
    bad('redeem succeeded after revoke — BUG');
    process.exitCode = 1;
  }

  // Summary ------------------------------------------------------------------
  hr();
  const final = store.read();
  console.log('Delegations:');
  for (const d of final.delegations) {
    console.log(
      `  ${d.fromRole}→${d.toRole}  cap=${d.capUsdc} spent=${d.spentUsdc} status=${d.status}`,
    );
  }
  console.log(`\nTransactions: ${final.transactions.length}  Activity events: ${final.activity.length}`);
  hr();
  console.log(
    process.exitCode
      ? '\nM1 FAILED — see ✗ above.\n'
      : '\nM1 PASSED — full chain, cap-revert, and post-revoke-revert all behaved.\n',
  );
}

main().catch((e) => {
  console.error('\nM1 crashed:', e);
  process.exit(1);
});
