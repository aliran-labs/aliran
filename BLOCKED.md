# BLOCKED — pending credentials → exact unblock command

Everything below runs in **MOCK_MODE today**. This file maps each missing env
var to (a) what it unblocks and (b) the exact command to run once you have it.
Switching to real mode is a ~15-minute checklist, not a refactor.

## The one-time switch to real mode

1. `cp .env.example .env`
2. Fill the vars in the table below.
3. `pnpm setup:demo`  → generates any missing keys, prints addresses to fund.
4. Fund each printed agent address with Base Sepolia ETH; fund OWNER with USDC.
5. Set `MOCK_MODE=false` in `.env`.
6. Re-run the milestone scripts (`pnpm m1`, `pnpm m2`, `pnpm m3`) — they now
   broadcast for real. The dashboard (`pnpm dev`) picks up real mode from `.env`.

## Pending env vars

| Env var | Unblocks | How to get it / command |
|---|---|---|
| `RPC_URL` | All chain reads/writes | Base Sepolia RPC (Alchemy/Infura/public). Paste URL. |
| `BUNDLER_URL` | 7710 redemption userOps (M1+) | Pimlico/other ERC-4337 bundler for Base Sepolia. **Required** — redeem can't broadcast without it. |
| `USDC_ADDRESS` | USDC transfers | Defaulted to `0x036C…F7e`. **Verify** vs supported-networks docs before real run. |
| `OWNER_PRIVATE_KEY` | Owner smart account (env-key demo mode) | `pnpm setup:demo` generates one; or use MetaMask (`DEMO_MODE=wallet`). |
| `AGENT_CFO_PK` … `AGENT_CREATIVE_PK` | The 4 agent smart accounts | `pnpm setup:demo` generates any missing; paste printed keys into `.env`. |
| `CONTRIBUTOR_ADDRESSES` | Payroll payees | Any 2–3 EOAs you control, comma-separated. |
| `VENICE_API_KEY` | Real agent reasoning (M3+) | venice.ai dashboard → API key. Until set, agents use canned responses. |
| `VENICE_MODEL` | Chat model slug | Confirm exact slug from `GET {VENICE_BASE_URL}/models`. Default is a guess. |
| `VENICE_IMAGE_MODEL` | Report cover image (optional) | Confirm image model slug from Venice models endpoint. |
| `SELLER_PAY_TO_ADDRESS` | x402 settlement target (M2) | Any address you control. |
| `X402_FACILITATOR_URL` | x402 verify/settle (M2 real mode) | MetaMask x402 facilitator URL — confirm from buyer guide in M2. |

## Code-side follow-ups gated on the above (tracked so they aren't forgotten)

- **M2:** re-fetch the correct x402 *buyer* guide URL (the guessed one 404'd) to
  lock the `createOpenDelegation` signature + exact payment header field names,
  then replace the mock seller guard with `@x402/express paymentMiddleware`.
  Until then the seller stub emits a matching 402 and the buyer mocks the payload.
- **M3:** confirm Venice tool-call response shape (OpenAI-compatible) against a
  live key; the agent runtime already targets the OpenAI tool-call schema.
- **USDC verify:** confirm `USDC_ADDRESS` + decimals (6) on Base Sepolia.
