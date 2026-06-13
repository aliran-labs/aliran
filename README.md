# Aliran — Autonomous Treasury OS

> One capped delegation to an AI **CFO** agent, which redelegates **stricter** budgets to
> specialist worker agents (payroll, procurement, creative). Every payment executes via
> **ERC-7710 delegation redemption** — no agent holds the owner's keys, no agent can exceed
> its cap (enforced on-chain by caveats), and the owner can revoke any agent instantly.

Built for the **MetaMask Smart Accounts Kit × 1Shot API × Venice AI Dev Cook Off** (HackQuest).

`aliran` (Indonesian: *flow / stream*) — capital flows down a delegation tree, each hop
narrower than the last.

---

## What it does (demo flow)

1. **Owner grants one permission** — max 500 USDC/month to the CFO agent (ERC-20 transfer
   scope delegation).
2. **Owner instructs:** "run this month's operations."
3. **CFO agent (Venice-powered)** plans, then creates 3 **redelegations** with narrower
   caps: payroll (300), procurement (150), creative (50). A live delegation tree shows caps
   and spend.
4. **Payroll agent** reads the in-app task board, Venice judges each completed task's
   evidence, and pays contributors in USDC via 7710 redemption.
5. **Procurement agent** calls our x402-protected data API, receives **HTTP 402**, builds an
   **ERC-7710 delegation payment**, retries, gets the data, and Venice synthesizes it.
6. **Creative agent** generates a monthly treasury report (+ optional cover image) via Venice.
7. **Money shot:** procurement deliberately attempts to overspend → the redemption **fails at
   the protocol level** (ERC20TransferAmount caveat revert). Then the owner **revokes** an
   agent with one click.

---

## Architecture

```
apps/
  web/      Next.js 14 dashboard + API routes that drive the agents
  seller/   Express x402 seller — GET /api/market-brief returns 402 then data
packages/
  core/        config (MOCK_MODE), JSON-file store, shared types
  delegation/  typed wrappers around @metamask/smart-accounts-kit:
               smart accounts, create/sign delegations + redelegations,
               7710 redemption, disable/revoke, x402 buyer
  agents/      Venice runtime (OpenAI-compatible) + 4 agents wired to tools:
               create_redelegation, pay_usdc, fetch_x402, read_task_board, generate_report
scripts/
  setup-demo.ts            generate keys, print funding checklist, seed tasks
  m1-delegation-chain.ts   owner→CFO→payroll→contributor + cap/revoke reverts
  m2-x402-buy.ts           buy x402 data via ERC-7710, store receipt
  m3-run-month.ts          full month: plan→redelegate→payroll→procurement→report
```

**Chain:** Base Sepolia (`84532`) for everything — it's the only testnet where delegation +
redelegation + 7710 redemption **and** x402-over-ERC-7710 all work (see `docs/NOTES.md`).

**Agents never hold keys.** Every tool call routes into `packages/delegation`, which holds the
signing. Caps are enforced **on-chain** by the kit's caveats; the UI mirrors spend locally.

**Design system (`apps/web`):** tokens live in `tailwind.config.ts` + `globals.css` (dark
`#0B0F14` surfaces, cyan→teal brand gradient, per-agent colors), with Space Grotesk (display),
Inter (body) and JetBrains Mono (all addresses/hashes/amounts) via `next/font`. The delegation
tree is a hand-built SVG with animated edge-draws, the activity feed is a streaming timeline,
and all motion (framer-motion) is fast and gated behind `prefers-reduced-motion`. Agent art
loads from `/assets/...` with graceful colored fallbacks, so the build never breaks if a PNG
is missing.

---

## Run it

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env          # defaults to MOCK_MODE=true — no credentials needed
pnpm setup:demo               # generates demo keys, seeds the task board
pnpm dev                      # web on :3000, seller on :4021
```

Open **http://localhost:3000** and walk the 7 steps above. Or run the milestones headless:

```bash
pnpm m1   # delegation chain + cap-revert + post-revoke-revert
pnpm m2   # x402 purchase + receipt
pnpm m3   # full month + deliberate overspend
```

### MOCK_MODE (default)

This repo runs **fully offline** with `MOCK_MODE=true`:
- Venice calls return realistic canned responses.
- Chain calls are **constructed and signed locally** (real `redeemDelegations` calldata is
  built — ~4.8 KB), then **logged instead of broadcast**. No RPC, bundler, or funds needed.

To go live, fill `.env` and set `MOCK_MODE=false`. **`docs/BLOCKED.md`** maps every pending env var
to the exact unblock command — switching to real mode is a ~15-minute checklist, not a refactor.

### Real-mode setup (Base Sepolia)

```bash
pnpm setup:demo          # generate agent keys (written to .env), seed task board
pnpm phase1              # print smart-account addresses to fund (owner: USDC+ETH; agents: ETH)
# …fund the printed addresses…
pnpm deploy:accounts     # deploy owner/cfo/payroll/procurement smart accounts
pnpm x402:setup          # provision the EIP-7702 x402 buyer (the facilitator requires a
                         # 7702 payer): generates X402_BUYER_PK, funds from owner, upgrades
pnpm m1 && pnpm m2 && pnpm m3   # full chain, real x402 settlement, real-Venice agent run
```

This whole flow was run end-to-end on Base Sepolia — every tx hash is in **`docs/TESTLOG.md`**
(payroll payouts, x402 facilitator settlement, EIP-7702 upgrade, cap-exceed revert, revoke).
`X402_MODE=mock` is kept as an emergency fallback if the facilitator is unavailable.

---

## Track qualification

Aliran is designed to satisfy four core prize tracks simultaneously — plus the 1Shot
permissionless-relayer stretch track, executed live on Base mainnet. Each requirement maps to code
and to a step in the demo flow above.

| Track | Requirement | Where it's satisfied |
|---|---|---|
| **Best Agent** | Agents act on the user's behalf via the Smart Accounts Kit | Whole main flow. `packages/agents/src/orchestrator.ts` `runMonth()`; smart accounts in [`packages/delegation/src/smartAccount.ts`](packages/delegation/src/smartAccount.ts). Demo §3–6. |
| **Best A2A coordination** | Must use **redelegation** | CFO→worker redelegation chain IS the product. [`createRedelegation`](packages/delegation/src/delegation.ts) (narrow-only) + [`cfoExecute`](packages/agents/src/agents.ts). Tree visible in UI. Demo §3. |
| **Best x402 + ERC-7710** | Pay x402-protected APIs via ERC-7710 | Seller [`apps/seller/src/server.ts`](apps/seller/src/server.ts) uses the official `@x402/express` middleware + MetaMask facilitator; buyer [`buyX402`](packages/delegation/src/x402.ts) pays via `createx402DelegationProvider` + `wrapFetchWithPayment` from an EIP-7702 account ([`x402Buyer.ts`](packages/delegation/src/x402Buyer.ts)). **Real facilitator settlement on-chain** (tx in `docs/TESTLOG.md`). Receipt panel in UI. Demo §5. |
| **Best use of Venice** | Venice produces meaningful AI output in the main flow | All four agents reason via Venice ([`packages/agents/src/venice.ts`](packages/agents/src/venice.ts)): CFO plan, payroll eligibility judgement, procurement synthesis, creative report **+ image** (two Venice endpoints). Demo §3,4,5,6. |
| **1Shot Permissionless Relayer** (stretch) | Relay 7710 txs through 1Shot's mainnet relayer paying gas in stablecoins **+** EIP-7702 EOA→smart-account upgrade via the relayer | [`scripts/m6-relayer-demo.ts`](scripts/m6-relayer-demo.ts) + [`packages/delegation/src/relayer.ts`](packages/delegation/src/relayer.ts). **Executed on Base mainnet** from a zero-ETH account: relayed ERC-7710 USDC transfers, gas paid in USDC, EIP-7702 upgrade bundled into redemption #1. **Webhook-driven status** via [`scripts/m6-webhook-receiver.ts`](scripts/m6-webhook-receiver.ts) (cloudflared tunnel; Ed25519-verified events). Tx links in `docs/TESTLOG.md`. Isolated behind `RELAYER=1shot` + `pnpm m6`. |

The cap-exceed revert (Demo §7) is the proof that on-chain caveats — not app logic — enforce
the budget: [`redeemTransfer`](packages/delegation/src/delegation.ts) builds the over-cap
`redeemDelegations` calldata and the `ERC20TransferAmount` caveat rejects it.

---

## Notes & honesty

- `docs/NOTES.md` — chain decision, verified kit API facts, and doc discrepancies (e.g. the x402
  buyer guide page 404'd; `createOpenDelegation` was verified directly against the installed
  package; `BUNDLER_URL` was added because 7710 redemption needs an ERC-4337 bundler).
- `docs/BLOCKED.md` — every credential that gates real mode + its unblock command.
- Demo-grade by design: no auth, no multi-tenancy, JSON-file persistence.
