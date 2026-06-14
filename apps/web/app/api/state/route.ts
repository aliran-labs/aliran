import { NextResponse } from 'next/server';
import { store, config } from '@aliran/core';
import { treasuryState } from '@aliran/agents';
import { seedTasksIfEmpty } from '../_seed';

export const dynamic = 'force-dynamic';

/** Full dashboard state: delegations, txs, tasks, receipts, activity, runs. */
export async function GET() {
  seedTasksIfEmpty(); // auto-seed the task board on serverless cold start
  const db = store.read();
  return NextResponse.json({
    mode: { mock: config.MOCK_MODE, demoMode: config.DEMO_MODE, chainId: config.CHAIN_ID },
    treasury: treasuryState(),
    ...db,
  });
}
