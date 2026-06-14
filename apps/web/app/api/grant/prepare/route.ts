import { NextResponse } from 'next/server';
import { store } from '@aliran/core';
import { ensureMockKeys } from '../../_bootstrap';
import { buildGrant, ownerSignerAddress } from '../walletGrant';

export const dynamic = 'force-dynamic';

/**
 * Wallet-mode step 1: build the owner→CFO root delegation server-side and return
 * it + its EIP-712 typed data for MetaMask to sign. The client round-trips the
 * delegation to /api/grant/complete with the signature.
 */
export async function POST(req: Request) {
  ensureMockKeys();
  const body = await req.json().catch(() => ({}));
  const cap = Number(body.capUsdc);
  if (!Number.isFinite(cap) || cap <= 0) {
    return NextResponse.json({ ok: false, error: 'Enter a budget (USDC) greater than 0 to grant.' }, { status: 400 });
  }

  const existing = store
    .read()
    .delegations.find((d) => d.parentId === null && d.toRole === 'cfo' && d.status === 'active');
  if (existing) return NextResponse.json({ ok: true, alreadyGranted: true, delegationId: existing.id });

  try {
    const { delegation, typedData, ownerAddress, cfoAddress } = await buildGrant(cap);
    return NextResponse.json({
      ok: true,
      delegation, // round-tripped back to /complete
      typedData,
      ownerSigner: ownerSignerAddress(), // EOA MetaMask must sign with
      ownerAccount: ownerAddress, // owner smart-account (delegator)
      cfoAddress,
      cap,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
