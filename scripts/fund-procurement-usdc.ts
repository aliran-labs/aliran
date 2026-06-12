/**
 * Seed the procurement smart account with a little USDC so its x402 open
 * delegation (which draws on the buyer's own balance) can settle. Owner smart
 * account sends a direct ERC20 transfer via userOp. Real mode only.
 *   pnpm tsx scripts/fund-procurement-usdc.ts [amountUsdc]
 */
import { config } from '@aliran/core';
import { smartAccountForRole, getBundlerClient, getUserOpFees } from '@aliran/delegation';
import { encodeFunctionData, erc20Abi, parseUnits, createPublicClient, http, formatUnits, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';

async function main() {
  if (config.MOCK_MODE) return console.log('MOCK_MODE — skip.');
  const amount = Number(process.argv[2] ?? '0.2');
  const owner = await smartAccountForRole('owner');
  const procurement = await smartAccountForRole('procurement');
  const pc = createPublicClient({ chain: baseSepolia, transport: http(config.RPC_URL) });

  const before = (await pc.readContract({
    address: config.USDC_ADDRESS as Address, abi: erc20Abi, functionName: 'balanceOf', args: [procurement.address as Address],
  })) as bigint;
  console.log(`procurement USDC before: ${formatUnits(before, 6)}`);

  const data = encodeFunctionData({
    abi: erc20Abi, functionName: 'transfer', args: [procurement.address as Address, parseUnits(String(amount), 6)],
  });
  const bundler = getBundlerClient();
  const fees = await getUserOpFees();
  const hash = await bundler.sendUserOperation({
    account: owner, calls: [{ to: config.USDC_ADDRESS as Address, data }], ...fees,
  });
  const receipt = await bundler.waitForUserOperationReceipt({ hash });
  console.log(`transfer ${amount} USDC owner→procurement: ${receipt.success ? 'OK' : 'FAILED'}`);
  console.log(`tx: https://sepolia.basescan.org/tx/${receipt.receipt.transactionHash}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
