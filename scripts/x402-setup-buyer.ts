/**
 * scripts/x402-setup-buyer.ts — provision the EIP-7702 x402 buyer.
 *   1. Generate X402_BUYER_PK if missing (written to .env; value not printed).
 *   2. Fund the buyer EOA from the owner smart account (a little ETH for the
 *      type-4 tx + USDC for the x402 payment).
 *   3. Upgrade the EOA via EIP-7702 to the stateless delegator (self-sponsored).
 * Idempotent. Real mode only.  Run: pnpm x402:setup
 */
import { config } from '@aliran/core';
import {
  smartAccountForRole,
  getBundlerClient,
  getUserOpFees,
  x402BuyerEoa,
  ensure7702Buyer,
  isBuyerUpgraded,
} from '@aliran/delegation';
import { generatePrivateKey } from 'viem/accounts';
import {
  createPublicClient,
  http,
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  encodeFunctionData,
  erc20Abi,
  type Address,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ETH_FOR_BUYER = parseEther('0.003'); // self-sponsored type-4 gas
const USDC_FOR_BUYER = parseUnits('0.3', 6); // x402 payments

function writeEnv(k: string, v: string) {
  const p = resolve(process.cwd(), '.env');
  let t = existsSync(p) ? readFileSync(p, 'utf8') : '';
  const re = new RegExp(`^${k}=.*$`, 'm');
  t = re.test(t) ? t.replace(re, `${k}=${v}`) : t + (t.endsWith('\n') || t === '' ? '' : '\n') + `${k}=${v}\n`;
  writeFileSync(p, t);
}

async function main() {
  if (config.MOCK_MODE) return console.log('MOCK_MODE — skip (x402 stub needs no buyer).');

  // 1. key
  if (!/^0x[0-9a-fA-F]{64}$/.test(config.X402_BUYER_PK)) {
    const pk = generatePrivateKey();
    process.env.X402_BUYER_PK = pk;
    writeEnv('X402_BUYER_PK', pk);
    console.log('Generated X402_BUYER_PK → .env (value not printed).');
  }

  const eoa = x402BuyerEoa();
  const pc = createPublicClient({ chain: baseSepolia, transport: http(config.RPC_URL) });
  console.log('x402 buyer EOA:', eoa.address);

  // 2. fund from owner if needed
  const [eth, usdc] = await Promise.all([
    pc.getBalance({ address: eoa.address }),
    pc.readContract({ address: config.USDC_ADDRESS as Address, abi: erc20Abi, functionName: 'balanceOf', args: [eoa.address] }) as Promise<bigint>,
  ]);
  console.log(`  current: ETH=${formatEther(eth)} USDC=${formatUnits(usdc, 6)}`);

  const owner = await smartAccountForRole('owner');
  const bundler = getBundlerClient();
  const calls: { to: Address; value?: bigint; data?: `0x${string}` }[] = [];
  if (eth < ETH_FOR_BUYER) calls.push({ to: eoa.address, value: ETH_FOR_BUYER - eth, data: '0x' });
  if (usdc < USDC_FOR_BUYER) {
    calls.push({
      to: config.USDC_ADDRESS as Address,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [eoa.address, USDC_FOR_BUYER - usdc] }),
    });
  }
  if (calls.length) {
    console.log(`  funding from owner (${calls.length} call(s))…`);
    const fees = await getUserOpFees();
    const h = await bundler.sendUserOperation({ account: owner, calls, ...fees });
    const r = await bundler.waitForUserOperationReceipt({ hash: h });
    console.log(`  funded: https://sepolia.basescan.org/tx/${r.receipt.transactionHash}`);
  } else {
    console.log('  already funded.');
  }

  // 3. upgrade
  if (await isBuyerUpgraded()) {
    console.log('  EOA already EIP-7702 upgraded. Done.');
    return;
  }
  console.log('  submitting EIP-7702 upgrade (type-4, self-sponsored)…');
  const r = await ensure7702Buyer();
  console.log(`  upgraded: ${r.upgraded}  tx=https://sepolia.basescan.org/tx/${r.txHash}`);
  console.log(await isBuyerUpgraded() ? '\nx402 buyer ready (7702 delegator code set).\n' : '\nUpgrade not detected — check tx.\n');
}

main().catch((e) => { console.error('x402-setup-buyer crashed:', e); process.exit(1); });
