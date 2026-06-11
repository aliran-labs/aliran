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
2. **x402 *buyer* guide page 404'd** at every guessed URL
   (`/guides/x402/buyer/`, `/guides/x402/buy-with-delegations/`). Resolved as
   far as needed for M2: `createOpenDelegation({ from, environment, scope })` is
   **verified against the installed kit** — it returns a delegation whose
   `delegate` is the ANY_DELEGATE sentinel `0x..0a11`, signs cleanly (132-byte
   sig). The buyer (`packages/delegation/src/x402.ts`) implements: 402 → require
   `accepts[0].extra.assetTransferMethod==='erc7710'` → sign open delegation
   restricted to the asset+amount → base64 JSON payload in `PAYMENT-SIGNATURE`
   (+`X-PAYMENT` for compatibility) → retry → store receipt.
   **Remaining real-mode gap:** the *exact* facilitator wire-encoding of the
   payload (the official `@x402/*` buyer client format). M2 mock works
   end-to-end; before real settlement, swap the hand-rolled retry for the
   official buyer client. Tracked in BLOCKED.md.
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
