# TESTLOG — Aliran real-mode bring-up on Base Sepolia

No secrets in this file (no private keys, no API keys, no full RPC/bundler URLs).
Tx links: `https://sepolia.basescan.org/tx/<hash>`.

## Phase 0 — credential & config verification

| Check | Result | Detail |
|---|---|---|
| RPC_URL `eth_chainId` | ✅ PASS | chainId = 84532 |
| BUNDLER_URL Base Sepolia | ✅ PASS | `eth_supportedEntryPoints` → 4 entry points |
| USDC symbol/decimals | ✅ PASS | symbol=USDC, decimals=6, at `0x036C…F7e` |
| VENICE `/models` | ✅ PASS | 89 models, 75 tool-capable |
| VENICE tool-call | ✅ PASS | model `zai-org-glm-4.6` returns OpenAI `tool_calls` with `{"value":42}` — matches `packages/agents` expectation |
| X402 facilitator | ✅ RESOLVED | Base Sepolia facilitator: `https://tx-sentinel-base-sepolia.dev-api.cx.metamask.io/platform/v2/x402` (from official seller guide; testnet facilitator exists) |

**Choices written to `.env` (my assigned vars):**
- `VENICE_MODEL=zai-org-glm-4.6` — capable mid-size open model, tool-calling confirmed, cost-effective.
- `VENICE_IMAGE_MODEL=venice-sd35` — optional cover image.
- `X402_FACILITATOR_URL=<base-sepolia facilitator>` (above).
- `X402_FACILITATOR_ADDRESS` — intentionally left unset: the official seller
  middleware (`x402ExactEvmErc7710ServerScheme` + `HTTPFacilitatorClient`)
  enriches the 402 challenge with `extra.facilitatorAddresses` from the live
  facilitator, so the buyer reads it from the challenge (no hardcode needed).

**x402 follow-up (BLOCKED.md):** installed `@metamask/x402 @x402/core @x402/fetch`
(buyer, in `@aliran/delegation`) and `@metamask/x402 @x402/core @x402/express`
(seller). All official exports verified present. Swapping in the official
client/middleware (real mode) — see Phase 0 wiring below.

Phase 0 status: **PASS** (no genuinely-wrong credentials).

## Phase 1 — accounts & funding

`pnpm setup:demo` found `OWNER_PRIVATE_KEY` was malformed (20 bytes — an address,
not a 32-byte key) and all four agent keys empty. Since funding happens *after*
setup (nothing funded yet), it generated fresh valid keys for all five roles and
**wrote them into `.env`** (values never printed). Scaled tasks seeded
(0.5 USDC each).

Smart-account (counterfactual) addresses to fund — from `pnpm phase1`:

| Role | Smart account | Needs |
|---|---|---|
| owner | `0x7bD1Ca8570892ac728EF6d33C75D56b8BfD6881B` | ~5 USDC + ~0.01 ETH |
| cfo | `0x3B67434c05271474bA63E0B6aeA0b734bF46e93F` | ~0.005 ETH (deploy) |
| payroll | `0x2a8526c4E7D8bF78275a51aF990964bE9c073870` | ~0.01 ETH |
| procurement | `0xEDe5BB834730b2e6cb1f9760EF3114F4E452D5E8` | ~0.01 ETH |
| creative | `0x8341563Db043373Dc65092567fA5bEE406120d79` | none (signs only) |

Real-mode hardening done before funding: realistic userOp gas via
`pimlico_getUserOperationGasPrice` (was hardcoded `1n`); `ensureDeployed()` +
`pnpm deploy:accounts` to deploy owner/cfo/payroll/procurement before redemption
(owner must exist to execute payouts; the demo's first owner userOp would
otherwise be the revoke — too late).

Funding confirmed on-chain: owner 40 USDC + 0.01 ETH; cfo 0.005 ETH; payroll
0.01 ETH; procurement 0.01 ETH; creative 0 (correct). MOCK_MODE flipped to false.

## Phase 3 — real-mode milestone scripts (Base Sepolia)

### Account deployment (`pnpm deploy:accounts`)
All four deployed (first userOp each, real gas via `pimlico_getUserOperationGasPrice`):
- owner → [0xa950…490e](https://sepolia.basescan.org/tx/0xa950b6b6d77b8a27881d0bebd13c84b24a2be9c063c4997be9f5094a45a9490e)
- cfo → [0xa628…9bcb](https://sepolia.basescan.org/tx/0xa62848f53a4420c7e37c933875b4df91ab173af2d96ed470564d3b5e4b149bcb)
- payroll → [0xf0e0…18d6](https://sepolia.basescan.org/tx/0xf0e08eef9ce1b2f65a6ec3fe7a13f7d5cab080b299dacb57be5a08b297df18d6)
- procurement → [0x9c87…45b8](https://sepolia.basescan.org/tx/0x9c874db6acd552edb31d93e8f871fab76fbe749d7a4f9df345f4b7658f1e45b8)

### M1 — delegation chain (`pnpm m1`) → **PASSED**
- root owner→cfo (8 USDC) + redelegation cfo→payroll (4 USDC): signed (off-chain).
- widening rejected at construction (800 > 4 parent cap). ✅
- **payroll redeems 0.5 USDC → contributor** (real 7710 redemption):
  [0x8d5e…4542](https://sepolia.basescan.org/tx/0x8d5ec4ec8628009f1526eef39e1949a085700dc61a437882a3a07971cad94542) ✅
- **over-cap 4000 USDC → reverted** at the protocol level (ERC20TransferAmount
  caveat; bundler rejected during simulation — no tx, which is correct). ✅
- **owner revokes root** (disableDelegation):
  [0xa503…eeae](https://sepolia.basescan.org/tx/0xa5030a24860d9a812e41daac67f0f6910b3eb0f0efc2be03f9ad594ab9e7eeae) ✅
- post-revoke redemption blocked. ✅
- USDC spent so far: **0.5**. Fixes before run: scaled M1 amounts to the 8-cap.

### M2 — x402 (`pnpm m2`, `X402_MODE=real`) → **PASSED (REAL facilitator settlement)**
- Real seller (official `@x402/express` middleware + MetaMask facilitator) returns
  a correct **x402 v2** challenge with the live facilitator address
  `0xb4827A2a066CD2Ef88560EFdf063dD05C6c41cC7`.
- Buyer (official `createx402DelegationProvider` + `wrapFetchWithPayment`) signs
  a real facilitator-restricted ERC-7710 open delegation.
- **Real settlement on-chain** (facilitator redeems the delegation):
  [0x3388cb76…dd704](https://sepolia.basescan.org/tx/0x3388cb763da4f89445a39571c7b1616d84e1d41d1c971e52d623d572056dd704) —
  buyer EOA USDC 0.30 → 0.25 (paid $0.05 to the seller).

  **Root cause of the earlier `account_not_delegated` (now FIXED):** the Base
  Sepolia facilitator requires the payer to be an **EIP-7702-upgraded EOA**
  delegating to `EIP7702StatelessDeleGatorImpl` — not a deployed Hybrid smart
  account. Fix: a dedicated x402 buyer EOA, provisioned by `pnpm x402:setup`
  (generate key → fund from owner → self-sponsored type-4 EIP-7702 upgrade):
  - fund owner→buyer: [0x74ed754a…0df6](https://sepolia.basescan.org/tx/0x74ed754a00ed6ec7fe3efdf8f3db9e362cb9aac9125ef30b7b3b5f16810f0df6)
  - 7702 upgrade (type-4): [0x7dcf5e68…7e99](https://sepolia.basescan.org/tx/0x7dcf5e6854a715b657a16d73ef258c0be386055150d0965742f0daa804fc7e99)
    (EOA code = `0xef0100…63c0c19a…`, the 7702 delegation indicator).
  `X402_MODE=real` is now the default; `X402_MODE=mock` kept as an emergency
  fallback (stub seller + buyer).

### M3 — full agent month, **real Venice** (`pnpm m3`) → **PASSED**
- **CFO plan (real Venice `zai-org-glm-4.6`)**: redelegated 3.5 / 2.5 / 2 USDC
  (sum 8, within cap) via tool-calls. Safety clamp falls back to config split if
  a model plan is off-spec.
- **Payroll paid 3/3** verified tasks on-chain (0.5 USDC each):
  [0x654c…3783](https://sepolia.basescan.org/tx/0x654c16f1c2b751116e0cee98186e06768b7f82439c20fef8ef4e3c82814a3783) ·
  [0x9c57…eccd](https://sepolia.basescan.org/tx/0x9c576fc915a8afd5d12a7c5353e4803528c164375fa58814a3e94bd3907feccd) ·
  [0xfb08…a6e9](https://sepolia.basescan.org/tx/0xfb08be26b13389e48b00b633e39a9b92677cf772867d2e23dacd4dd91d73a6e9)
- **Procurement**: bought market brief (x402 stub) + **real Venice synthesis**
  ("# Market Brief Summary for Treasury"). Receipt stored.
- **Creative**: **real Venice report** ("# Monthly Treasury Report - May 2026").
  Cover image skipped (non-fatal; image model optional).
- **Overspend (step 7)**: procurement attempt 1002.5 USDC → **reverted on-chain**
  (`0x05baa052`, ERC20TransferAmount caveat; bundler rejected at simulation). ✅

### Bugs found & fixed during real-mode bring-up
1. **userOp gas** was hardcoded `1n` → real Pimlico rejected. Added
   `pimlico_getUserOperationGasPrice` fee fetch.
2. **Account deployment**: owner/cfo/payroll/procurement must be deployed before
   redemption. Added `ensureDeployed` + `pnpm deploy:accounts`.
3. **Deterministic salt collision**: `createDelegation` defaults `salt=0x00`, so
   M3's owner→cfo root hashed identically to the root M1 had **revoked** → every
   redemption reverted (`0x05baa052`). Fixed with a random `salt` per delegation
   (also makes the demo re-runnable).
4. **Payroll tool-choice**: passing all 5 tools confused the model; restricted to
   `pay_usdc` + deterministic evidence-based eligibility.
5. **Task amounts** were still 120/90/80 (seeded pre-scaling) → exceeded caps;
   re-seeded at 0.5.
6. **Procurement needs its own USDC** for the x402 open delegation (draws on the
   buyer's balance) → seeded 0.3 USDC owner→procurement
   ([0xe0fc…24d1](https://sepolia.basescan.org/tx/0xe0fc738537936c596d58eacfd9eced8182f0bae6924c69503e6e87a1384724d1)).

## Phase 4 — full stack + UI smoke test → **PASS**

`pnpm dev` (web :3000 + seller :4021, real mode, **`X402_MODE=real`**). Drove the
entire §1 flow through the dashboard's API routes:

| Step | Result |
|---|---|
| reset | ✅ tasks re-seeded at 0.5 USDC |
| **grant** (owner→cfo, 8 USDC) | ✅ real root delegation |
| **run-month** | ✅ real Venice plan · **payroll 3/3 on-chain** · **real x402 settlement** [0xc0d0a3da…9185](https://sepolia.basescan.org/tx/0xc0d0a3dad0e426667afec6cf56a0f408b0f856bc0d2e4bf5b5c20790f0ca9185) + synthesis · report |
| **attempt overspend** | ✅ reverts on-chain → clean message **`ERC20TransferAmountEnforcer:allowance-exceeded`** (decoded from the caveat revert) |
| **revoke** (payroll) | ✅ real `disableDelegation` [0x4c98…6130](https://sepolia.basescan.org/tx/0x4c98dac649ee6b811dbbd4f4e0991bc87724737fd944ec097f656fb6cd0c6130) |

Dashboard renders HTTP 200; delegation tree, feed (with BaseScan links), task
board, receipts, report all populate from `/api/state`.

## Final accounting (on-chain ground truth)

Owner smart account: **40 → 35.2 USDC** ⇒ **~4.8 USDC moved** to contributors
across all runs (M1 0.5 + procurement seed 0.3 + several M3 payroll runs + the
UI run-month 1.5). **Under the 10-USDC cap.** All accounts deployed except
creative (counterfactual by design — it only signs/Venice, never submits a tx).

All milestone scripts and the UI flow: **PASS** in real mode on Base Sepolia.

---

# M6 — 1Shot permissionless relayer (Base MAINNET 8453)

Stretch track, fully isolated behind `RELAYER=1shot` + `pnpm m6`. Never touches
the Sepolia demo. Real mainnet, hard budget 1.896 USDC on EOA
`0x83D8517AB59F4D6AC71eF5F3fc54875EA3Fb8189` (held **0 ETH** by design — all gas
paid in USDC via the relayer).

## Phase A — zero-spend feasibility → GO
- Skill `public-relayer` installed; relayer is **permissionless JSON-RPC, no API key** (live calls returned data with no auth).
- `relayer_getCapabilities(8453)`: USDC accepted (`0x8335…2913`), `feeCollector` `0xE936…7604`, `targetAddress` `0x26a5…199a`.
- `relayer_getFeeData(8453,USDC)`: `minFee` $0.01 floor, gas 0.0072 gwei.
- Account on-chain: 1.896076 USDC, 0 ETH, not 7702-upgraded.
- **Zero-spend bundle validation** (`M6_ESTIMATE_ONLY=1`): the live relayer
  **accepted the zero-ETH 7702 bundle**, `requiredFee` = **0.01 USDC**, gasUsed
  330k — confirming fee-in-USDC for the 7702 submission itself.

## Phase B — executed on Base mainnet → **PASSED**
One delegation (cap 0.5 USDC) to the relayer target, **reused for 2 redemptions**.
Each: estimate-first (zero-spend) → abort guard (>0.6 USDC) → send → poll.

| Redemption | 7702 auth | Fee | Work | Tx |
|---|---|---|---|---|
| 1 | **included** (relayer submits type-4 upgrade) | 0.01 USDC | 0.05 → `0xA21c…` | [0xebc4…cb1f](https://basescan.org/tx/0xebc4062475c2084f17dfc9490579fa593891d46e221214a0ff871889d26acb1f) |
| 2 | not needed (already upgraded) | 0.01 USDC | 0.05 → `0xA21c…` | [0xae56…05ed8](https://basescan.org/tx/0xae56739d201d77f3fdb288abe24868dae0fbb311b6726c8ddb44794c14c05ed8) |

**On-chain reconciliation:**
- Owner `0x83D8…8189`: **1.896076 → 1.776076 USDC** (exactly 0.12 spent), still **0 ETH**, now **7702-upgraded** (code `0xef010063c0c19a…` → `EIP7702StatelessDeleGatorImpl`).
- Recipient `0xA21c…5246`: **received 0.10 USDC**.
- Total spent **0.12 USDC** (0.10 work + 0.02 fees) — under the 1.8 budget; no single fee near the 0.6 abort threshold.

**Both 1Shot track requirements demonstrably true on mainnet:**
1. 7710 transactions relayed through the permissionless mainnet relayer, **gas paid in USDC** (account holds 0 ETH).
2. **EIP-7702 authorization** upgraded the EOA to a stateless delegator **via the relayer** (bundled into redemption #1).

**Status tracking — webhook-driven, verified.** Wired `scripts/m6-webhook-receiver.ts`
behind a **cloudflared** quick tunnel and re-ran one redemption with
`destinationUrl` set. The relayer POSTed signed status events; the receiver
fetched the relayer JWKS and **verified the Ed25519 signatures**, and the
verified events drove the status:

```
[webhook ✓] type=4 (Submitted) task=0x7110c648…cc83d memo=aliran-m6-redemption-1
[webhook ✓] type=0 (Confirmed) task=0x7110c648…cc83d memo=aliran-m6-redemption-1
```

(`✓` = Ed25519 signature verified against the relayer JWKS.) Webhook redemption
tx: [0x06db…87db](https://basescan.org/tx/0x06db1ea0e706d6632cc42bff5f8514f0d9d76c5fb579425ca48c0e94792f87db),
+0.06 USDC. Polling (`relayer_getStatus`) remains a backstop in the script.
**Total M6 mainnet spend across both runs: 0.18 USDC** (account `1.896 → 1.716`).
