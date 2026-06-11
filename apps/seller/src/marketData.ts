/** Curated mock market data the procurement agent "buys". Deterministic. */
export const MARKET_BRIEF = {
  generatedAt: '2026-06-11T00:00:00Z',
  title: 'Aliran Market Brief — Stablecoin Treasury Edition',
  segments: [
    {
      name: 'Stablecoin yields (testnet-curated)',
      points: [
        'Short-dated T-bill-backed stablecoin vaults averaging 4.8% APY.',
        'On-chain USDC lending utilization at 71%, supply APY ~3.9%.',
        'Basis trade funding rates neutral-to-positive on majors.',
      ],
    },
    {
      name: 'Operational cost signals',
      points: [
        'Cloud GPU spot pricing down 12% QoQ — favorable for creative workloads.',
        'Contractor day-rates flat; payroll budget assumptions hold.',
        'Gas on Base Sepolia negligible; mainnet relayer fees ~$0.02/op.',
      ],
    },
    {
      name: 'Recommended allocation',
      points: [
        'Hold 60% operating buffer in USDC.',
        'Cap discretionary procurement at 30% of monthly inflows.',
        'Front-load payroll early in the cycle to de-risk contributor churn.',
      ],
    },
  ],
} as const;
