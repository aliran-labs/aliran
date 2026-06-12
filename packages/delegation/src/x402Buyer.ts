import {
  Implementation,
  toMetaMaskSmartAccount,
  getSmartAccountsEnvironment,
} from '@metamask/smart-accounts-kit';
import { createWalletClient, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { config } from '@aliran/core';
import { getPublicClient } from './client';

/**
 * x402 buyer = a dedicated EOA upgraded via EIP-7702 to MetaMask's
 * EIP7702StatelessDeleGator. The Base Sepolia x402 facilitator rejects a plain
 * Hybrid smart account ("delegator EOA must complete an EIP-7702 upgrade…"), so
 * x402 purchases use this 7702 account instead of the procurement Hybrid account.
 */

function buyerKey(): Hex {
  // config is frozen at import; also accept a key minted into process.env this
  // run (so the setup script can generate + use it without a re-exec).
  const pk = config.X402_BUYER_PK || process.env.X402_BUYER_PK || '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error('X402_BUYER_PK not set/invalid. Run `pnpm x402:setup`.');
  }
  return pk as Hex;
}

export function x402BuyerEoa() {
  return privateKeyToAccount(buyerKey());
}

// Internal: not exported, so its (very large) viem WalletClient type does not
// need to be serialized for declaration emit (TS7056).
function x402BuyerWalletClient() {
  return createWalletClient({
    account: x402BuyerEoa(),
    chain: baseSepolia,
    transport: http(config.RPC_URL),
  });
}

/** The MetaMask stateless-7702 smart account at the buyer EOA address. */
export async function x402BuyerAccount() {
  const walletClient = x402BuyerWalletClient();
  return toMetaMaskSmartAccount({
    client: getPublicClient(),
    implementation: Implementation.Stateless7702,
    address: x402BuyerEoa().address,
    signer: { walletClient },
  });
}

/** The stateless-7702 delegator implementation address for this chain. */
export function stateless7702ImplAddress(): Address {
  const env = getSmartAccountsEnvironment(config.CHAIN_ID);
  return env.implementations.EIP7702StatelessDeleGatorImpl as Address;
}

/** True if the buyer EOA already has the stateless delegator code (7702 set). */
export async function isBuyerUpgraded(): Promise<boolean> {
  const code = await getPublicClient().getCode({ address: x402BuyerEoa().address });
  return Boolean(code && code !== '0x');
}

/**
 * Upgrade the buyer EOA to the stateless delegator via a self-sponsored EIP-7702
 * type-4 transaction. The EOA needs a little ETH for gas. Idempotent.
 */
export async function ensure7702Buyer(): Promise<{ address: Address; upgraded: boolean; txHash?: Hex }> {
  const eoa = x402BuyerEoa();
  if (await isBuyerUpgraded()) {
    return { address: eoa.address, upgraded: false };
  }
  const walletClient = x402BuyerWalletClient();
  const contractAddress = stateless7702ImplAddress();
  const authorization = await walletClient.signAuthorization({
    account: eoa,
    contractAddress,
    executor: 'self',
  });
  const txHash = await walletClient.sendTransaction({
    authorizationList: [authorization],
    data: '0x',
    to: eoa.address,
  });
  await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  return { address: eoa.address, upgraded: true, txHash };
}
