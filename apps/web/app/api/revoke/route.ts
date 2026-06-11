import { NextResponse } from 'next/server';
import { revokeDelegation, bundleFromRecordId } from '@aliran/delegation';
import { store } from '@aliran/core';
import { ensureMockKeys } from '../_bootstrap';

export const dynamic = 'force-dynamic';

/** Owner revokes a delegation with one click (demo step 7b). */
export async function POST(req: Request) {
  ensureMockKeys();
  const { delegationId } = await req.json().catch(() => ({ delegationId: undefined }));
  if (!delegationId) return NextResponse.json({ ok: false, error: 'delegationId required' }, { status: 400 });
  const bundle = bundleFromRecordId(delegationId);
  if (!bundle) return NextResponse.json({ ok: false, error: 'delegation not found' }, { status: 404 });
  try {
    const res = await revokeDelegation(bundle);
    // Cascade: mark children of this delegation revoked too (chain breaks).
    const db = store.read();
    const revokeChildren = (parentId: string) => {
      for (const d of db.delegations) {
        if (d.parentId === parentId && d.status !== 'revoked') {
          d.status = 'revoked';
          revokeChildren(d.id);
        }
      }
    };
    revokeChildren(delegationId);
    store.write(db);
    return NextResponse.json({ ok: res.ok, txHash: res.txHash });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
