/**
 * scripts/phase1-addresses.ts — compute & print smart-account addresses to fund.
 * Prints ONLY addresses (never keys). Also prints current ETH/USDC balances.
 */
import { config, demo, ROOT_CAP_USDC } from '@aliran/core';
import { smartAccountForRole, ROLES } from '@aliran/delegation';
import { createPublicClient, http, erc20Abi, formatUnits, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';

async function main() {
  const pc = createPublicClient({ chain: baseSepolia, transport: http(config.RPC_URL) });
  console.log('\nPHASE 1 — accounts & funding (Base Sepolia)');
  console.log('═'.repeat(72));

  const info: { role: string; address: Address; eth: string; usdc: string }[] = [];
  for (const role of ROLES) {
    let address: Address;
    try {
      const sa = await smartAccountForRole(role);
      address = sa.address as Address;
    } catch (e) {
      console.log(`  ${role}: NO KEY (${(e as Error).message.split('.')[0]})`);
      continue;
    }
    const [eth, usdc, code] = await Promise.all([
      pc.getBalance({ address }),
      pc.readContract({ address: config.USDC_ADDRESS as Address, abi: erc20Abi, functionName: 'balanceOf', args: [address] }).catch(() => 0n),
      pc.getCode({ address }).catch(() => undefined),
    ]);
    info.push({
      role,
      address,
      eth: formatUnits(eth, 18),
      usdc: formatUnits(usdc as bigint, 6),
    });
    const deployed = code && code !== '0x' ? 'deployed' : 'counterfactual';
    console.log(`  ${role.padEnd(12)} ${address}  [${deployed}]  ETH=${formatUnits(eth, 18)}  USDC=${formatUnits(usdc as bigint, 6)}`);
  }

  console.log('═'.repeat(72));
  const owner = info.find((i) => i.role === 'owner');
  const payroll = info.find((i) => i.role === 'payroll');
  const procurement = info.find((i) => i.role === 'procurement');

  const cfo = info.find((i) => i.role === 'cfo');
  console.log('\nFUNDING CHECKLIST (scaled demo: rootCap=' + ROOT_CAP_USDC + ' USDC):');
  console.log('─'.repeat(72));
  console.log('1) USDC → OWNER SMART ACCOUNT (the treasury that pays out):');
  console.log(`     ${owner?.address ?? '(owner key missing)'}`);
  console.log(`     Send ~5 USDC (covers payroll ${demo.payrollPerTaskUsdc}×3 + x402 ${demo.x402PriceUsd} + headroom).`);
  console.log('\n2) Base Sepolia ETH (gas) → these four smart accounts:');
  console.log(`     owner       ${owner?.address ?? '-'}   deploy + submit revoke      ~0.01 ETH`);
  console.log(`     cfo         ${cfo?.address ?? '-'}   deploy (chain-sig validation) ~0.005 ETH`);
  console.log(`     payroll     ${payroll?.address ?? '-'}   deploy + payout redemptions ~0.01 ETH`);
  console.log(`     procurement ${procurement?.address ?? '-'}   deploy + overspend attempt  ~0.01 ETH`);
  console.log('     (creative signs only — no gas needed. x402 settlement gas is paid by the facilitator.)');
  console.log('\n   Total: ~5 USDC (owner) + ~0.035 ETH split across the 4 above.');
  console.log('   Base Sepolia ETH faucet: https://docs.base.org/tools/network-faucets');
  console.log('   USDC → the OWNER smart-account address (token ' + config.USDC_ADDRESS + ').');
  console.log('─'.repeat(72));
  console.log('\nWhen funded, re-run this script to confirm balances, then proceed to Phase 3.\n');
}

main().catch((e) => {
  console.error('phase1 crashed:', e);
  process.exit(1);
});
