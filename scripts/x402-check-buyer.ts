import { config } from '@aliran/core';
import { x402BuyerEoa, isBuyerUpgraded, stateless7702ImplAddress } from '@aliran/delegation';
import { createPublicClient, http, formatEther, formatUnits, erc20Abi, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';
async function main() {
  const pc = createPublicClient({ chain: baseSepolia, transport: http(config.RPC_URL) });
  const eoa = x402BuyerEoa();
  const [code, eth, usdc] = await Promise.all([
    pc.getCode({ address: eoa.address }),
    pc.getBalance({ address: eoa.address }),
    pc.readContract({ address: config.USDC_ADDRESS as Address, abi: erc20Abi, functionName: 'balanceOf', args: [eoa.address] }) as Promise<bigint>,
  ]);
  console.log('buyer EOA:', eoa.address);
  console.log('ETH:', formatEther(eth), 'USDC:', formatUnits(usdc, 6));
  console.log('code:', code);
  console.log('impl :', stateless7702ImplAddress());
  console.log('upgraded:', await isBuyerUpgraded());
}
main().catch((e) => { console.error(e); process.exit(1); });
