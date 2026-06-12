import { config } from '@aliran/core';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, erc20Abi, formatUnits, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';

async function main() {
  const k = config.MAINNET_OWNER_PK;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) {
    console.log('MAINNET_OWNER_PK invalid/missing');
    return;
  }
  const acct = privateKeyToAccount(k as Hex);
  console.log('owner EOA (derived):', acct.address);
  console.log('matches funded 0x83D8…8189:', acct.address.toLowerCase() === '0x83d8517ab59f4d6ac71ef5f3fc54875ea3fb8189');
  console.log('RELAYER flag:', config.RELAYER, '| RPC:', config.MAINNET_RPC_URL);
  console.log('work recipient:', config.M6_WORK_RECIPIENT);

  const pc = createPublicClient({ chain: base, transport: http(config.MAINNET_RPC_URL) });
  const [eth, usdc, code] = await Promise.all([
    pc.getBalance({ address: acct.address }),
    pc.readContract({ address: config.MAINNET_USDC as Address, abi: erc20Abi, functionName: 'balanceOf', args: [acct.address] }) as Promise<bigint>,
    pc.getCode({ address: acct.address }),
  ]);
  console.log(`balances: ETH=${formatUnits(eth, 18)} USDC=${formatUnits(usdc, 6)}`);
  console.log('7702 upgraded:', Boolean(code && code !== '0x'));
}
main().catch((e) => { console.error(e); process.exit(1); });
