/**
 * scripts/m3-run-month.ts  —  M3 integration script
 *
 * "run this month's operations" from a single command:
 *   plan -> redelegate -> payroll -> procurement(x402) -> report,
 * then the deliberate over-cap attempt (demo step 7). Writes all events to the DB.
 *
 * Run (seller must be up, or it spawns one):  pnpm m3
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { config, store } from '@aliran/core';
import { runMonth, attemptOverspend } from '@aliran/agents';
import { ROLE_PK, createRootDelegation } from '@aliran/delegation';
import { generatePrivateKey } from 'viem/accounts';

const SELLER_URL = config.SELLER_URL;
const BRIEF_URL = `${SELLER_URL}/api/market-brief`;

// Test-only grant budget for this headless script. In the product the owner
// types this and signs in MetaMask; here the script signs the root with the
// owner key directly so the month can run without a browser wallet.
const TEST_GRANT_BUDGET = 8;

// mint ephemeral keys for all roles in mock mode
if (config.MOCK_MODE) {
  for (const [role, env] of Object.entries({
    owner: 'OWNER_PRIVATE_KEY', cfo: 'AGENT_CFO_PK', payroll: 'AGENT_PAYROLL_PK',
    procurement: 'AGENT_PROCUREMENT_PK', creative: 'AGENT_CREATIVE_PK',
  })) {
    if (!ROLE_PK[role as keyof typeof ROLE_PK]) {
      const pk = generatePrivateKey();
      process.env[env] = pk;
      (ROLE_PK as Record<string, string>)[role] = pk;
    }
  }
}

async function isUp() {
  try { return (await fetch(`${SELLER_URL}/health`)).ok; } catch { return false; }
}

async function main() {
  console.log('\nM3 — run this month\'s operations');
  console.log('═'.repeat(70));
  console.log(`MOCK_MODE=${config.MOCK_MODE}`);

  // reset prior delegations/txs/activity for a clean deterministic run; reseed tasks
  const db = store.read();
  db.delegations = []; db.transactions = []; db.activity = []; db.receipts = []; db.runs = [];
  for (const t of db.tasks) if (t.status === 'paid' || t.status === 'rejected') t.status = 'done';
  store.write(db);

  let spawned: ChildProcess | undefined;
  if (!(await isUp())) {
    spawned = spawn('pnpm', ['--filter', '@aliran/seller', 'start'], { stdio: 'ignore', shell: true });
    const t0 = Date.now();
    while (Date.now() - t0 < 15000 && !(await isUp())) await new Promise((r) => setTimeout(r, 400));
  }

  // [0] Owner grants the root delegation (the product does this via the wallet UI).
  const root = await createRootDelegation({ fromRole: 'owner', toRole: 'cfo', capUsdc: TEST_GRANT_BUDGET });
  console.log(`\n── Owner grant ──\n   root cap=${root.capUsdc} USDC  owner ${root.fromAddress.slice(0, 10)}… → CFO ${root.toAddress.slice(0, 10)}…`);

  const result = await runMonth({
    instruction: "run this month's operations",
    marketUrl: BRIEF_URL,
    withImage: true,
    autoApprove: true,
  });

  console.log('\n── CFO plan ──');
  for (const r of result.plan.redelegations) console.log(`   redelegate → ${r.agent}: ${r.maxUsdc} USDC`);
  console.log(`   rationale: ${result.plan.rationale.slice(0, 90)}…`);

  console.log('\n── Payroll ──');
  console.log(`   paid ${result.payroll.paid}/${result.payroll.total} done-tasks`);

  console.log('\n── Procurement (x402) ──');
  console.log(`   bought: ${result.procurement.ok ? 'yes' : 'no'}  receipt=${result.procurement.receiptId?.slice(0, 8) ?? '-'}`);
  if (result.procurement.synthesis) console.log(`   synthesis: ${result.procurement.synthesis.trim().split('\n')[0].slice(0, 90)}`);

  console.log('\n── Creative report ──');
  console.log(`   ${(result.report.report.trim().split('\n')[0] || '(report)').slice(0, 70)}  (image=${result.report.imageUrl ?? 'none'})`);

  console.log('\n── Demo step 7: deliberate overspend ──');
  const over = await attemptOverspend(result.ctx);
  console.log(`   overspend ${over.ok ? 'SUCCEEDED (BUG!)' : 'correctly FAILED'}: ${over.error?.slice(0, 70) ?? ''}`);
  if (over.ok) process.exitCode = 1;

  const final = store.read();
  console.log('\n' + '═'.repeat(70));
  console.log(`Delegations: ${final.delegations.length}  Txs: ${final.transactions.length}  Receipts: ${final.receipts.length}  Activity: ${final.activity.length}`);
  console.log(process.exitCode ? '\nM3 FAILED.\n' : '\nM3 PASSED — full month flow executed and recorded.\n');

  spawned?.kill();
  setTimeout(() => process.exit(process.exitCode ?? 0), 300);
}

main().catch((e) => { console.error('\nM3 crashed:', e); process.exit(1); });
