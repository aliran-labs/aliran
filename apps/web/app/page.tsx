import { config, ROOT_CAP_USDC } from '@aliran/core';

/**
 * M0 landing. The full dashboard (delegation tree, task board, feed, receipts,
 * revoke/overspend) lands in M4. This page proves the app boots and reads
 * shared config.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold text-white">Aliran</h1>
      <p className="mt-2 text-slate-400">
        Autonomous treasury OS — one capped delegation to an AI CFO that redelegates stricter
        budgets to worker agents. Every payment via ERC-7710 redemption.
      </p>

      <div className="panel mt-8 p-5">
        <h2 className="text-sm uppercase tracking-wide text-slate-500">Status</h2>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">Mode</dt>
          <dd className={config.MOCK_MODE ? 'text-warn' : 'text-good'}>
            {config.MOCK_MODE ? 'MOCK (dry-run)' : 'LIVE'}
          </dd>
          <dt className="text-slate-500">Chain</dt>
          <dd>Base Sepolia ({config.CHAIN_ID})</dd>
          <dt className="text-slate-500">Owner signer</dt>
          <dd>{config.DEMO_MODE}</dd>
          <dt className="text-slate-500">Root cap</dt>
          <dd>{ROOT_CAP_USDC} USDC / month</dd>
        </dl>
      </div>

      <p className="mt-6 text-xs text-slate-600">
        M0 scaffold. Dashboard arrives in M4. See NOTES.md / BLOCKED.md.
      </p>
    </main>
  );
}
