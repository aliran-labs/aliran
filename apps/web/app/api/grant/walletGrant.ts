import { createDelegation, ScopeType, getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit';
import { parseUnits, keccak256, toHex, verifyTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { config, USDC_DECIMALS } from '@aliran/core';
import { smartAccountForRole } from '@aliran/delegation';

/**
 * Wallet-mode grant: the owner is a MetaMask smart account whose signer is the
 * connected browser wallet. We build the SAME owner→CFO delegation as the
 * env-key path, hand its EIP-712 typed data to MetaMask to sign (the popup the
 * judges see), then store the wallet-signed delegation as the root — identical
 * to env-key because the same owner key signs the same delegation.
 *
 * Stateless (Next bundles each route separately, so module-level state isn't
 * shared): `prepare` returns the delegation, the client round-trips it to
 * `complete`, which re-derives the typed data and VERIFIES the signature
 * recovers to the owner signer before storing.
 *
 * Verified: this reconstructed typed data yields the exact signature the kit's
 * `signDelegation` produces.
 */

function randomSalt(): Hex {
  return keccak256(toHex(`${Date.now()}:${Math.random()}:${Math.random()}`));
}

function delegationManager(): string {
  return getSmartAccountsEnvironment(config.CHAIN_ID).DelegationManager as string;
}

/** EIP-712 typed data for a delegation (matches the kit's signDelegation). */
export function delegationTypedData(delegation: any) {
  return {
    domain: {
      name: 'DelegationManager',
      version: '1',
      chainId: config.CHAIN_ID,
      verifyingContract: delegationManager(),
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Caveat: [
        { name: 'enforcer', type: 'address' },
        { name: 'terms', type: 'bytes' },
      ],
      Delegation: [
        { name: 'delegate', type: 'address' },
        { name: 'delegator', type: 'address' },
        { name: 'authority', type: 'bytes32' },
        { name: 'caveats', type: 'Caveat[]' },
        { name: 'salt', type: 'uint256' },
      ],
    },
    primaryType: 'Delegation' as const,
    message: {
      delegate: delegation.delegate,
      delegator: delegation.delegator,
      authority: delegation.authority,
      caveats: (delegation.caveats ?? []).map((c: any) => ({ enforcer: c.enforcer, terms: c.terms })),
      salt: BigInt(delegation.salt).toString(), // uint256 as decimal string for JSON
    },
  };
}

/** The EOA address that must sign the owner delegation (the owner's signer). */
export function ownerSignerAddress(): string | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(config.OWNER_PRIVATE_KEY)) return null;
  return privateKeyToAccount(config.OWNER_PRIVATE_KEY as Hex).address;
}

/** Build the unsigned owner→CFO root delegation + its typed data. */
export async function buildGrant(capUsdc: number) {
  const owner = await smartAccountForRole('owner');
  const cfo = await smartAccountForRole('cfo');
  const delegation = createDelegation({
    to: cfo.address,
    from: owner.address,
    environment: owner.environment,
    salt: randomSalt(),
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: config.USDC_ADDRESS as Hex,
      maxAmount: parseUnits(String(capUsdc), USDC_DECIMALS),
    },
  }) as unknown as Record<string, unknown>;
  return { delegation, typedData: delegationTypedData(delegation), ownerAddress: owner.address, cfoAddress: cfo.address };
}

/** Verify a wallet signature over the given delegation recovers to ownerSigner. */
export async function verifyGrantSignature(delegation: any, signature: Hex): Promise<boolean> {
  const signer = ownerSignerAddress();
  if (!signer) return false;
  const td = delegationTypedData(delegation);
  try {
    return await verifyTypedData({
      address: signer as Hex,
      domain: td.domain as any,
      types: { Caveat: td.types.Caveat, Delegation: td.types.Delegation } as any,
      primaryType: 'Delegation',
      message: { ...td.message, salt: BigInt(td.message.salt) } as any,
      signature,
    });
  } catch {
    return false;
  }
}
