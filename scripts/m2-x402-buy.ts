/**
 * scripts/m2-x402-buy.ts  —  M2 integration script
 *
 * Buys the x402-protected market brief end-to-end and stores a receipt:
 *   1. (ensure seller is up) GET /api/market-brief → 402 challenge.
 *   2. Procurement agent builds an ERC-7710 open delegation payment payload.
 *   3. Retry with PAYMENT-SIGNATURE → 200 + data.
 *   4. Receipt persisted (challenge + payload hash + response).
 *
 * MOCK_MODE: open delegation is really signed; seller settlement is mocked.
 *
 * Run (seller must be running, or this spawns one):  pnpm m2
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { config, store } from '@aliran/core';
import { buyX402, ROLE_PK } from '@aliran/delegation';
import { generatePrivateKey } from 'viem/accounts';

const SELLER_URL = config.SELLER_URL;
const BRIEF_URL = `${SELLER_URL}/api/market-brief`;

// mint ephemeral procurement key for mock runs
if (config.MOCK_MODE && !ROLE_PK.procurement) {
  const pk = generatePrivateKey();
  process.env.AGENT_PROCUREMENT_PK = pk;
  (ROLE_PK as Record<string, string>).procurement = pk;
}

async function isUp(): Promise<boolean> {
  try {
    const r = await fetch(`${SELLER_URL}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function waitUp(ms = 15000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await isUp()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  console.log('\nM2 — x402 buyer integration');
  console.log('─'.repeat(70));
  console.log(`MOCK_MODE=${config.MOCK_MODE}  seller=${SELLER_URL}`);

  let spawned: ChildProcess | undefined;
  if (!(await isUp())) {
    console.log('Seller not running — spawning it…');
    spawned = spawn('pnpm', ['--filter', '@aliran/seller', 'start'], {
      stdio: 'ignore',
      shell: true,
      detached: false,
    });
    if (!(await waitUp())) {
      console.error('Seller did not come up. Start it with `pnpm dev:seller` and re-run.');
      spawned?.kill();
      process.exit(1);
    }
  }
  console.log('Seller is up.');

  console.log('\n[1-3] Procurement agent buys the market brief…');
  const res = await buyX402({ url: BRIEF_URL, buyerRole: 'procurement' });

  console.log('─'.repeat(70));
  if (res.ok) {
    console.log(`  ✓ HTTP ${res.status}, receipt=${res.receiptId?.slice(0, 8)}…`);
    console.log(`  ✓ payment payload hash: ${res.paymentPayloadHash?.slice(0, 18)}…`);
    const brief = res.data as { title?: string; segments?: unknown[] } | undefined;
    console.log(`  ✓ purchased: "${brief?.title}" (${brief?.segments?.length ?? 0} segments)`);
  } else {
    console.log(`  ✗ buy failed (HTTP ${res.status}): ${res.error}`);
    process.exitCode = 1;
  }

  const receipts = store.read().receipts;
  console.log(`\nReceipts stored: ${receipts.length}`);
  console.log('─'.repeat(70));
  console.log(process.exitCode ? '\nM2 FAILED.\n' : '\nM2 PASSED — bought data via ERC-7710 and stored a receipt.\n');

  spawned?.kill();
  // give the kill a tick, then exit explicitly (spawned shell can hold the loop)
  setTimeout(() => process.exit(process.exitCode ?? 0), 300);
}

main().catch((e) => {
  console.error('\nM2 crashed:', e);
  process.exit(1);
});
