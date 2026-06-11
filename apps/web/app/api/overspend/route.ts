import { NextResponse } from 'next/server';
import { store, config } from '@aliran/core';
import { redeemTransfer, bundleFromRecordId } from '@aliran/delegation';
import { ensureMockKeys } from '../_bootstrap';
import type { Address } from 'viem';

export const dynamic = 'force-dynamic';

/**
 * Demo step 7: the procurement agent deliberately attempts to spend beyond its
 * cap. The redemption fails at the protocol level (ERC20TransferAmount caveat).
 * Body: { delegationId? } — defaults to the procurement redelegation.
 */
export async function POST(req: Request) {
  ensureMockKeys();
  const body = await req.json().catch(() => ({}));
  const db = store.read();
  const target =
    body.delegationId ||
    db.delegations.find((d) => d.toRole === 'procurement' && d.parentId)?.id;
  if (!target) return NextResponse.json({ ok: false, error: 'no procurement delegation (run a month first)' }, { status: 400 });

  const bundle = bundleFromRecordId(target);
  if (!bundle) return NextResponse.json({ ok: false, error: 'delegation not found' }, { status: 404 });

  const recipient =
    (config.CONTRIBUTOR_ADDRESSES[0] as Address) ||
    ('0x000000000000000000000000000000000000dEaD' as Address);

  const res = await redeemTransfer({
    leaf: bundle,
    recipient,
    amountUsdc: bundle.capUsdc + 1000,
    byRole: 'procurement',
    memo: 'deliberate overspend demo',
    forceOverspend: true,
  });
  // Expected to fail; report the revert reason for the UI.
  return NextResponse.json({ ok: res.ok, reverted: !res.ok, error: res.error });
}
