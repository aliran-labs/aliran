# BLOCKED — ✅ ALL CLOSED (2026-06-12)

> **Status: nothing is blocked.** Every credential below was filled and the full
> flow ran for real on Base Sepolia (M1/M2/M3 + UI) and Base mainnet (M6) — see
> `docs/TESTLOG.md` for tx hashes. This file is kept as the historical unblock
> reference (e.g. for a fresh clone that starts in `MOCK_MODE`).

The repo still ships **MOCK_MODE-first** for a fresh clone (no credentials
needed to explore). The table maps each env var to what it unblocks; all were
provided and verified this session. Switching a fresh clone to real mode is the
~15-minute checklist below.

## The one-time switch to real mode

1. `cp .env.example .env`
2. Fill the vars in the table below.
3. `pnpm setup:demo`  → generates any missing keys, prints addresses to fund.
4. Fund each printed agent address with Base Sepolia ETH; fund OWNER with USDC.
5. Set `MOCK_MODE=false` in `.env`.
6. Re-run the milestone scripts (`pnpm m1`, `pnpm m2`, `pnpm m3`) — they now
   broadcast for real. The dashboard (`pnpm dev`) picks up real mode from `.env`.

## Env vars (all ✅ provided & verified this session)

| Env var | Unblocks | How to get it / command |
|---|---|---|
| `RPC_URL` | All chain reads/writes | Base Sepolia RPC (Alchemy/Infura/public). Paste URL. |
| `BUNDLER_URL` | 7710 redemption userOps (M1+) | Pimlico/other ERC-4337 bundler for Base Sepolia. **Required** — redeem can't broadcast without it. |
| `USDC_ADDRESS` | USDC transfers | Defaulted to `0x036C…F7e`. **Verify** vs supported-networks docs before real run. |
| `OWNER_PRIVATE_KEY` | Owner smart-account signer | `pnpm setup:demo` generates one. The owner **always signs the grant via MetaMask** — import this key into MetaMask so the connected account matches. |
| `AGENT_CFO_PK` … `AGENT_CREATIVE_PK` | The 4 agent smart accounts | `pnpm setup:demo` generates any missing; paste printed keys into `.env`. |
| `CONTRIBUTOR_ADDRESSES` | Payroll payees | Any 2–3 EOAs you control, comma-separated. |
| `VENICE_API_KEY` | Real agent reasoning (M3+) | venice.ai dashboard → API key. Until set, agents use canned responses. |
| `VENICE_MODEL` | Chat model slug | Confirm exact slug from `GET {VENICE_BASE_URL}/models`. Default is a guess. |
| `VENICE_IMAGE_MODEL` | Report cover image (optional) | Confirm image model slug from Venice models endpoint. |
| `SELLER_PAY_TO_ADDRESS` | x402 settlement target (M2) | Any address you control. |
| `X402_FACILITATOR_URL` | x402 verify/settle (M2 real mode) | MetaMask x402 facilitator URL — confirm from buyer guide in M2. |

## Code-side follow-ups gated on the above (tracked so they aren't forgotten)

- **M2 x402 real settlement — DONE (2026-06-12).** Buyer uses the official
  `createx402DelegationProvider` + `wrapFetchWithPayment`; seller uses the
  official `@x402/express` `paymentMiddleware` + `x402ResourceServer` +
  `x402ExactEvmErc7710ServerScheme` + `HTTPFacilitatorClient` against the Base
  Sepolia facilitator. The facilitator requires an **EIP-7702-upgraded payer**
  (not a Hybrid account) — provisioned via `pnpm x402:setup` (`X402_BUYER_PK`,
  funded from owner, self-sponsored type-4 upgrade). Verified real settlement
  on-chain (`pnpm m2` + UI run-month). `X402_MODE=real` is the default;
  `X402_MODE=mock` is the emergency fallback. See TESTLOG.md / NOTES.md #2.
- **M3 — DONE.** Venice tool-call shape confirmed against the live key
  (`zai-org-glm-4.6`); CFO plan + payroll judgement + procurement synthesis +
  creative report all produced by real Venice. See `docs/TESTLOG.md` M3.
- **USDC verify — DONE.** `USDC_ADDRESS` `0x036C…F7e` confirmed `symbol=USDC`,
  `decimals=6` on Base Sepolia (Phase 0).
- **M6 1Shot relayer — DONE (mainnet).** Executed on Base mainnet 8453 from a
  zero-ETH account: 7710 relayed + EIP-7702 upgrade via the relayer, gas in
  USDC, Ed25519 webhook-driven status. Isolated behind `RELAYER=1shot` +
  `pnpm m6`. See `docs/TESTLOG.md` M6.

**Nothing remains open.**
