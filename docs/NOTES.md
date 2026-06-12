# NOTES — decisions, doc facts, and discrepancies

Maintained as I read docs and build. When this prompt and the docs conflict,
**the docs win** and the discrepancy is logged here.

## M0 — Chain & x402 feasibility decision (2026-06-11)

**Chosen chain: Base Sepolia (chainId 84532, `eip155:84532`). One chain for everything.**

Rationale: the MetaMask Smart Accounts Kit supports both Base Sepolia and
Ethereum Sepolia for delegation + redelegation + 7710 redemption. The deciding
factor is x402-over-ERC-7710 (Milestone 2, prize track #3): the official x402
**seller** guide's working example targets `network: 'eip155:84532'` (Base
Sepolia) with MetaMask's HTTP facilitator. Plain Sepolia is only shown for
non-x402 delegation. Base Sepolia is therefore the superset that satisfies all
hard requirements, so there is no reason to split chains and no need for the
§4 mainnet-USDC fallback — delegated x402 works on this testnet.

USDC on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (env
`USDC_ADDRESS`; **verify against the token/supported-networks docs before the
first real-mode run** — flagged in BLOCKED.md).

## Verified API facts from the docs (relied upon by the code)

- Package `@metamask/smart-accounts-kit` + `viem`. Contract encoders at
  `@metamask/smart-accounts-kit/contracts` (`DelegationManager.encode.*`).
- Smart account:
  `toMetaMaskSmartAccount({ client, implementation: Implementation.Hybrid,
  deployParams: [ownerEOA, [], [], []], deploySalt: '0x', signer: { account } })`.
- Delegation:
  `createDelegation({ scope: { type: ScopeType.Erc20TransferAmount, tokenAddress,
  maxAmount }, to, from, environment })` then `account.signDelegation({ delegation })`.
- Redelegation: same call with `parentDelegation: signedParentDelegation`.
  Authority can only NARROW (e.g. maxAmount 10 → 5), never expand.
- Redemption:
  `DelegationManager.encode.redeemDelegations({ delegations: [[child, parent]],
  modes: [ExecutionMode.SingleDefault], executions: [[createExecution({ target, callData })]] })`
  then send via `bundlerClient.sendUserOperation(...)` (ERC-4337).
  → **Redemption requires an ERC-4337 bundler.** The §5 env list omitted this;
    I added `BUNDLER_URL` (e.g. Pimlico Base Sepolia). Logged here per "docs win".
- Disable/revoke:
  `DelegationManager.encode.disableDelegation({ delegation })` sent as a userOp
  from the **delegator's** smart account to `environment.DelegationManager`.
- x402 seller: `@x402/express` `paymentMiddleware` + `x402ResourceServer` +
  `x402ExactEvmErc7710ServerScheme` (`@metamask/x402`) + `HTTPFacilitatorClient`
  (`@x402/core/server`). 402 challenge fields: `scheme:'exact'`, `network`,
  `price`, `payTo`, `extra.assetTransferMethod:'erc7710'`.
- Venice: base `https://api.venice.ai/api/v1`, OpenAI-compatible, bearer auth,
  supports tool/function calling; image at `/image/generations`.

## Discrepancies / open items

1. **`BUNDLER_URL` missing from §5 env list** — added (see above). Redemption
   cannot work without a bundler; this is not optional.
2. **x402 *buyer* guide** — RESOLVED. The real page is
   `https://docs.metamask.io/smart-accounts-kit/guides/x402/buyer/delegations/`
   (my earlier guessed URLs 404'd). The official client is:

   ```ts
   import { createx402DelegationProvider } from '@metamask/smart-accounts-kit/experimental'
   import { x402Erc7710Client } from '@metamask/x402'
   import { x402Client, x402HTTPClient } from '@x402/core/client'
   import { wrapFetchWithPayment } from '@x402/fetch'

   const erc7710Client = new x402Erc7710Client({
     delegationProvider: createx402DelegationProvider({ account: buyerSmartAccount }),
   })
   const core = new x402Client().register('eip155:*', erc7710Client)
   const fetchWithPayment = wrapFetchWithPayment(fetch, new x402HTTPClient(core))
   await fetchWithPayment(url, { method: 'GET' }) // does the whole 402 dance
   ```

   **Reconciliation done.** `createx402DelegationProvider` ships in the installed
   kit's `/experimental` subpath and runs **fully offline** (only signs). Our
   buyer (`packages/delegation/src/x402.ts`) now uses it instead of a hand-rolled
   `createOpenDelegation`. Verified against the kit source
   (`dist/experimental/index.mjs`): the provider reads `requirements`:
   - `amount` (atomic units — `BigInt(requirements.amount)`, NOT `maxAmountRequired`),
     `asset`, `network`, `payTo`, and
   - **`extra.facilitatorAddresses`** (the docs prose says "facilitators"; the
     actual installed field is `facilitatorAddresses`).

   It builds an open delegation then constrains it via
   `resolvex402DelegationCaveats`: the **RedeemerEnforcer** caveat restricts
   redemption to `facilitatorAddresses` (← the requested "restrict to the
   facilitator"), an **AllowedCalldata** caveat pins `payTo`, and a
   **Timestamp** caveat adds expiry. It returns
   `{ delegationManager, permissionContext, delegator }` where
   `permissionContext = encodeDelegations([signedDelegation, ...existing])` — the
   canonical encoded chain, which IS the payment payload.

   Our seller now advertises `accepts[0].amount` + `extra.facilitatorAddresses`
   to match. **Remaining real-mode gap (BLOCKED.md):** only the *transport* —
   `wrapFetchWithPayment` + `@metamask/x402` + `@x402/core` + `@x402/fetch` (not
   yet installed). The delegation construction + payload are already the official
   ones; settlement wiring is the last swap.
3. **Venice exact model names** — docs list example chat models but the catalog
   is large. `VENICE_MODEL` / `VENICE_IMAGE_MODEL` are env-driven with
   placeholder defaults; confirm exact slugs from the Venice models endpoint
   before real mode (BLOCKED.md).

## MOCK_MODE contract

- `MOCK_MODE=true` (default): Venice calls return realistic canned responses;
  chain calls are CONSTRUCTED + signed locally where possible, then LOGGED as a
  would-be transaction with a synthetic hash — never broadcast. Each milestone's
  DoD is met when the flow runs end-to-end in mock mode AND the real-mode script
  exists and is one `.env` fill away from running.
- No fake credentials are ever hardcoded as if real. Missing real-mode env vars
  raise a clear error pointing at BLOCKED.md (`requireReal()` in core/config).
