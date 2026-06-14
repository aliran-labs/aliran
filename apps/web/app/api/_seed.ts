import { store, config } from '@aliran/core';

/**
 * Seed the demo task board if it's empty. On Vercel the in-memory store starts
 * empty (no `aliran.db.json` in the read-only bundle), so we seed on first
 * /api/state load. Idempotent — returns early once tasks exist.
 */
export function seedTasksIfEmpty() {
  if (store.read().tasks.length > 0) return;
  const contributors = config.CONTRIBUTOR_ADDRESSES.length
    ? config.CONTRIBUTOR_ADDRESSES
    : [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333',
      ];
  // Each task carries its own amount (USDC). These are the seed board's real
  // task values — not a flat per-task preset. Sized small so a user-chosen
  // grant of a few USDC can actually clear them.
  const seed = [
    { title: 'Ship delegation tree UI', description: 'Live delegation tree with caps + remaining spend.', amountUsdc: 0.4, evidence: 'PR #42 merged; tree renders 4 nodes.', status: 'done' as const },
    { title: 'Write x402 buyer integration', description: 'Pay seller market-brief via ERC-7710.', amountUsdc: 0.3, evidence: 'Receipt stored: 402 + payment hash + 200.', status: 'done' as const },
    { title: 'Audit caveat enforcement', description: 'Confirm redelegation cannot exceed parent cap.', amountUsdc: 0.25, evidence: 'Overspend reverted; reason captured.', status: 'done' as const },
    { title: 'Design report cover art', description: 'Creative agent generates report cover.', amountUsdc: 0.2, evidence: '', status: 'open' as const },
  ];
  seed.forEach((t, i) =>
    store.addTask({
      title: t.title,
      description: t.description,
      contributorAddress: contributors[i % contributors.length]!,
      amountUsdc: t.amountUsdc,
      status: t.status,
      evidence: t.evidence,
    }),
  );
}
