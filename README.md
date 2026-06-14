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

1. **Owner grants one permission** — the owner **types the monthly budget** (USDC) they
   authorize and signs it in MetaMask. There is no preset amount; the cap comes entirely
   from that input (ERC-20 transfer scope delegation).
2. **Owner instructs:** "run this month's operations."
3. **CFO agent (Venice-powered)** plans, then creates 3 **redelegations** with narrower
   caps **derived from the granted budget and the live task board** (payroll = the sum of
   verified-task amounts, capped to leave a buffer; the remainder splits 70/30 to
   procurement/creative). No fixed numbers anywhere. A live delegation tree shows caps and spend.
4. **Payroll agent** reads the in-app task board, Venice judges each completed task's
   evidence, and pays contributors in USDC via 7710 redemption.
5. **Procurement agent** calls our x402-protected data API, receives **HTTP 402**, reads the
   **price from the seller's 402 challenge** (never assumed), builds an **ERC-7710 delegation
   payment**, retries, gets the data, and Venice synthesizes it.
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

Open **http://localhost:3000** and walk the 7 steps above.

> **Connect MetaMask to grant.** The owner always signs the grant with their wallet — there is
> no server-side "env-key" signer. This is required **even in MOCK_MODE** because the grant
> signature is off-chain (EIP-712); only the on-chain broadcast is mocked. `pnpm setup:demo`
> writes an `OWNER_PRIVATE_KEY` into `.env`; import that same key into MetaMask (Base Sepolia)
> so the connected account matches the owner the server expects, then enter a budget and sign.

Or run the milestones headless:

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

## For contributors (start here)

New to this repo? This section is the fast path to being productive.

### Prerequisites
- **Node 20+** and **pnpm** (`npm i -g pnpm`).
- A Chromium browser with **MetaMask** for the UI grant step (see the note above).
- Nothing else for MOCK_MODE. For real mode, see [`docs/BLOCKED.md`](docs/BLOCKED.md).

### Dev loop
```bash
pnpm install
cp .env.example .env     # MOCK_MODE=true by default
pnpm setup:demo          # writes keys into .env, seeds the task board
pnpm dev                 # web :3000  +  seller :4021 (concurrently)
pnpm -r typecheck        # run before every commit — the whole monorepo must pass
```
If `tsc` ever complains about a missing `.next/types/.../route.ts`, delete the stale Next
cache: `rm -rf apps/web/.next` (it references routes that have since been removed/renamed).

### How a "run month" actually flows (the mental model)
The UI never touches chain logic directly — it calls API routes, which call the agent
runtime, which calls the delegation layer. Trace it once and the codebase opens up:

```
apps/web/app/page.tsx            user clicks "Run month"
  → POST /api/run-month          apps/web/app/api/run-month/route.ts
    → runMonth()                 packages/agents/src/orchestrator.ts   (the conductor)
      → ensureRootDelegation()   reads the wallet-granted root (throws if not granted yet)
      → cfoPlan()                packages/agents/src/agents.ts  — Venice plans; deriveSplit() is the safe fallback
      → cfoExecute()             creates the 3 redelegations on-chain (narrower caps)
      → payrollRun()             pays each "done" task its own amount via 7710 redemption
      → procurementRun()         buys the x402 brief (price from the 402 challenge) + synthesizes
      → creativeRun()            writes the monthly report (+ optional Venice image)
```
Every chain action goes through **`packages/delegation`** (signing, `redeemDelegations`
calldata, caveats). Agents hold **no keys**. State (delegations, txs, tasks, receipts,
activity, runs) is one JSON file via **`packages/core/src/store.ts`** — the UI polls
`/api/state` to render it.

### Where to make common changes
| You want to… | Edit |
|---|---|
| Change the seed task board (titles/amounts/evidence) | [`apps/web/app/api/_seed.ts`](apps/web/app/api/_seed.ts) (and `reset/route.ts`) |
| Change how the CFO splits the budget | `deriveSplit()` in [`packages/agents/src/agents.ts`](packages/agents/src/agents.ts) |
| Change agent prompts / behavior | the `SYS_*` strings + run functions in `packages/agents/src/agents.ts` |
| Add/replace a tool an agent can call | [`packages/agents/src/tools.ts`](packages/agents/src/tools.ts) |
| Change the seller's product/price | [`apps/seller/src/server.ts`](apps/seller/src/server.ts) + `SELLER_PRICE_USD` |
| Add a dashboard panel/route | `apps/web/app/components/` + a route under `apps/web/app/` |
| Add config / an env var | [`packages/core/src/config.ts`](packages/core/src/config.ts) (one typed place) + document it in `.env.example` |

### Design principle: no presets, ever
This app behaves like a real product. **All amounts come from user input or live on-chain
state** — never from env presets or hardcoded constants:
- The **grant budget** is typed by the owner (empty = invalid form).
- **Redelegation caps** are *derived* from that budget + the actual task board.
- **Task amounts** live on each task.
- The **x402 price** is read from the seller's real 402 challenge.
- **Treasury cap/spent/remaining** are read from the on-chain root delegation (0 before any grant).

`packages/core/src/config.ts` holds only genuine configuration (chain id, addresses, URLs,
keys, the seller's own price). If you find yourself adding a default *amount* for the treasury
flow, that's a smell — push it to user input or on-chain state instead.

### Gotchas
- **Grant requires MetaMask** holding `OWNER_PRIVATE_KEY`, even in MOCK_MODE (off-chain signature).
- **`run-month` throws "No root delegation"** until you've granted — that's intentional, not a bug.
- **Serverless (Vercel)** has a read-only FS, so the store falls back to in-memory and the task
  board re-seeds on cold start (`/api/state` calls `seedTasksIfEmpty`). Don't rely on file
  persistence in deploys.
- **MOCK_MODE vs X402_MODE** are independent: chain+Venice can be real while x402 uses the
  local stub (`X402_MODE=mock`), and vice versa.

---

## Notes & honesty

- `docs/NOTES.md` — chain decision, verified kit API facts, and doc discrepancies (e.g. the x402
  buyer guide page 404'd; `createOpenDelegation` was verified directly against the installed
  package; `BUNDLER_URL` was added because 7710 redemption needs an ERC-4337 bundler).
- `docs/BLOCKED.md` — every credential that gates real mode + its unblock command.
- Demo-grade by design: no auth, no multi-tenancy, JSON-file persistence.
