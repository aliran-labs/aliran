import { NextResponse } from 'next/server';
import { store, config } from '@aliran/core';

export const dynamic = 'force-dynamic';

/** Reset the demo: clear delegations/txs/activity/receipts/runs, reseed tasks to 'done'. */
export async function POST() {
  const db = store.read();
  db.delegations = [];
  db.transactions = [];
  db.activity = [];
  db.receipts = [];
  db.runs = [];

  // Reseed a fresh task board if empty, else reset statuses.
  if (db.tasks.length === 0) {
    const contributors = config.CONTRIBUTOR_ADDRESSES.length
      ? config.CONTRIBUTOR_ADDRESSES
      : ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333'];
    const seed = [
      { title: 'Ship delegation tree UI', description: 'Live delegation tree with caps + remaining spend.', amountUsdc: 0.4, evidence: 'PR #42 merged; tree renders 4 nodes.', status: 'done' as const },
      { title: 'Write x402 buyer integration', description: 'Pay seller market-brief via ERC-7710.', amountUsdc: 0.3, evidence: 'Receipt stored: 402 + payment hash + 200.', status: 'done' as const },
      { title: 'Audit caveat enforcement', description: 'Confirm redelegation cannot exceed parent cap.', amountUsdc: 0.25, evidence: 'Overspend reverted; reason captured.', status: 'done' as const },
      { title: 'Design report cover art', description: 'Creative agent generates report cover.', amountUsdc: 0.2, evidence: '', status: 'open' as const },
    ];
    seed.forEach((t, i) =>
      store.addTask({ title: t.title, description: t.description, contributorAddress: contributors[i % contributors.length]!, amountUsdc: t.amountUsdc, status: t.status, evidence: t.evidence }),
    );
  } else {
    for (const t of db.tasks) {
      if (t.status === 'paid' || t.status === 'rejected') t.status = t.evidence ? 'done' : 'open';
    }
    store.write(db);
  }
  return NextResponse.json({ ok: true });
}
