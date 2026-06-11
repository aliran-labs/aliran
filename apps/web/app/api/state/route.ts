import { NextResponse } from 'next/server';
import { store, config, ROOT_CAP_USDC } from '@aliran/core';
import { treasuryState } from '@aliran/agents';

export const dynamic = 'force-dynamic';

/** Full dashboard state: delegations, txs, tasks, receipts, activity, runs. */
export async function GET() {
  const db = store.read();
  return NextResponse.json({
    mode: { mock: config.MOCK_MODE, demoMode: config.DEMO_MODE, chainId: config.CHAIN_ID, rootCap: ROOT_CAP_USDC },
    treasury: treasuryState(),
    ...db,
  });
}
