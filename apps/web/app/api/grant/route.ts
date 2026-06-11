import { NextResponse } from 'next/server';
import { ROOT_CAP_USDC } from '@aliran/core';
import { ensureRootDelegation } from '@aliran/agents';
import { ensureMockKeys } from '../_bootstrap';

export const dynamic = 'force-dynamic';

/**
 * Owner grants the single capped root delegation to the CFO (demo step 1).
 * In wallet mode this is where the MetaMask permission/signature screen appears;
 * in env-key mode it signs with OWNER_PRIVATE_KEY.
 */
export async function POST(req: Request) {
  ensureMockKeys();
  const body = await req.json().catch(() => ({}));
  const cap = Number(body.capUsdc) || ROOT_CAP_USDC;
  try {
    const root = await ensureRootDelegation(cap);
    return NextResponse.json({ ok: true, delegationId: root.recordId, cap, to: root.toAddress, from: root.fromAddress });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
