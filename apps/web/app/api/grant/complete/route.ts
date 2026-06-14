import { NextResponse } from 'next/server';
import { store } from '@aliran/core';
import type { Hex } from 'viem';
import { verifyGrantSignature } from '../walletGrant';

export const dynamic = 'force-dynamic';

/**
 * Wallet-mode step 2: receive the MetaMask signature + the delegation from
 * /prepare. Verify the signature recovers to the owner signer, then store it as
 * the root — the same DelegationRecord the env-key path produces, so the agents
 * redelegate/redeem against it unchanged.
 */
export async function POST(req: Request) {
  const { delegation, signature, cap } = await req.json().catch(() => ({}) as any);
  if (!delegation || !signature) {
    return NextResponse.json({ ok: false, error: 'delegation and signature required' }, { status: 400 });
  }

  const valid = await verifyGrantSignature(delegation, signature as Hex);
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'signature does not match the owner signer' }, { status: 400 });
  }

  const signedDelegation = { ...delegation, signature };
  const rec = store.addDelegation({
    parentId: null,
    fromRole: 'owner',
    toRole: 'cfo',
    fromAddress: delegation.delegator,
    toAddress: delegation.delegate,
    capUsdc: Number(cap) || 0,
    spentUsdc: 0,
    status: 'active',
    expiry: null,
    signedDelegation,
  });
  store.emit({
    agent: 'owner',
    action: 'granted root delegation to cfo',
    amount: Number(cap) || 0,
    delegationId: rec.id,
    status: 'success',
    detail: `${cap} USDC/mo cap · signed via MetaMask wallet`,
  });
  return NextResponse.json({ ok: true, delegationId: rec.id, cap });
}
