import { createx402DelegationProvider } from '@metamask/smart-accounts-kit/experimental';
import { keccak256, toHex, type Hex } from 'viem';
import { config, store, USDC_DECIMALS, type AgentRole } from '@aliran/core';
import { smartAccountForRole } from './smartAccount';

/**
 * x402 buyer (ERC-7710 delegated payment) — aligned with the official MetaMask
 * buyer guide (`guides/x402/buyer/delegations`).
 *
 * The guide's canonical client is `wrapFetchWithPayment(fetch, x402HTTPClient)`
 * driven by an `x402Erc7710Client` whose delegation is produced by
 * `createx402DelegationProvider({ account })`. We use that **same provider**
 * primitive (it ships in `@metamask/smart-accounts-kit/experimental`) to build
 * the payment, and keep an explicit fetch/retry as the transport so the whole
 * thing runs offline against our mock seller.
 *
 * The provider, given the 402 `requirements`, internally:
 *   • creates an OPEN delegation (any redeemer), then
 *   • RESTRICTS it to the facilitator via a RedeemerEnforcer caveat built from
 *     `requirements.extra.facilitatorAddresses`, plus an AllowedCalldata caveat
 *     pinned to `requirements.payTo` and a Timestamp (expiry) caveat, then
 *   • signs it (EIP-712) and returns `{ delegationManager, permissionContext,
 *     delegator }` where `permissionContext = encodeDelegations(chain)` — the
 *     canonical encoded delegation chain that is the payment payload.
 *
 * MOCK_MODE: the delegation is really built, restricted, and signed (offline);
 * only the facilitator's on-chain settlement is mocked by our seller echo.
 *
 * Real-mode swap (BLOCKED.md): replace the fetch/retry below with
 * `wrapFetchWithPayment` from `@x402/fetch` + `x402HTTPClient`/`x402Client`
 * (`@x402/core/client`) registering an `x402Erc7710Client` (`@metamask/x402`).
 * Those three packages are not yet installed; the provider + payload here are
 * already the official ones, so settlement is the only remaining wiring.
 */

export interface X402Accept {
  scheme: string;
  network: string;
  /** atomic-unit amount the kit reads (BigInt(amount)); `price` is display only. */
  amount?: string;
  price?: string;
  asset: string;
  payTo: string;
  resource?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  extra?: { assetTransferMethod?: string; facilitatorAddresses?: string[] };
}

export interface X402Challenge {
  x402Version: number;
  accepts: X402Accept[];
  error?: string;
}

export interface X402BuyResult {
  ok: boolean;
  status: number;
  data?: unknown;
  receiptId?: string;
  error?: string;
  paymentPayloadHash?: string;
}

/** Human USDC amount for the UI, from the atomic `amount` or the `$price` string. */
function displayUsdc(accept: X402Accept): number {
  if (accept.amount) return Number(accept.amount) / 10 ** USDC_DECIMALS;
  if (accept.price) return Number(accept.price.replace(/[^0-9.]/g, '')) || 0;
  return 0;
}

/**
 * Buy an x402-protected resource as `buyerRole` (procurement agent).
 */
export async function buyX402(opts: {
  url: string;
  buyerRole: AgentRole;
}): Promise<X402BuyResult> {
  store.emit({
    agent: opts.buyerRole,
    action: `x402 GET ${shortUrl(opts.url)}`,
    status: 'started',
  });

  // --- 1. initial request: expect 402 --------------------------------------
  let first: Response;
  try {
    first = await fetch(opts.url);
  } catch (e) {
    const error = `x402 request failed: ${(e as Error).message}`;
    store.emit({ agent: opts.buyerRole, action: 'x402 request failed', status: 'failed', detail: error });
    return { ok: false, status: 0, error };
  }

  if (first.status !== 402) {
    // Some servers may serve directly; treat 200 as already-paid/no-charge.
    if (first.ok) {
      const data = await first.json().catch(() => null);
      return { ok: true, status: first.status, data };
    }
    const error = `expected 402, got ${first.status}`;
    store.emit({ agent: opts.buyerRole, action: 'x402 unexpected status', status: 'failed', detail: error });
    return { ok: false, status: first.status, error };
  }

  const challenge = (await first.json().catch(() => null)) as X402Challenge | null;
  const accept = challenge?.accepts?.[0];
  if (!accept) {
    const error = '402 challenge missing accepts[0]';
    return { ok: false, status: 402, error };
  }
  if (accept.extra?.assetTransferMethod !== 'erc7710') {
    const error = `unsupported assetTransferMethod: ${accept.extra?.assetTransferMethod ?? 'none'} (need erc7710)`;
    store.emit({ agent: opts.buyerRole, action: 'x402 unsupported method', status: 'failed', detail: error });
    return { ok: false, status: 402, error };
  }

  const facilitatorAddresses = accept.extra?.facilitatorAddresses ?? [];
  if (facilitatorAddresses.length === 0) {
    const error = '402 challenge missing extra.facilitatorAddresses (cannot restrict the delegation)';
    store.emit({ agent: opts.buyerRole, action: 'x402 missing facilitators', status: 'failed', detail: error });
    return { ok: false, status: 402, error };
  }

  store.emit({
    agent: opts.buyerRole,
    action: `received 402 — ${accept.price ?? accept.amount} on ${accept.network}`,
    status: 'info',
    detail: `payTo=${accept.payTo.slice(0, 10)}… facilitator=${facilitatorAddresses[0]!.slice(0, 10)}… method=erc7710`,
  });

  // --- 2. official provider: open delegation RESTRICTED to the facilitator ---
  // createx402DelegationProvider builds an open delegation, then constrains it
  // with a RedeemerEnforcer caveat from requirements.extra.facilitatorAddresses,
  // an AllowedCalldata caveat for payTo, and a Timestamp (expiry) caveat; it
  // signs and returns the encoded delegation chain (permissionContext).
  const buyer = await smartAccountForRole(opts.buyerRole);
  const provider = createx402DelegationProvider({ account: buyer as never });

  // Map the parsed 402 into the kit's `requirements` shape (atomic `amount`,
  // `asset`, `network`, `payTo`, `extra.facilitatorAddresses`).
  const requirements = {
    scheme: accept.scheme,
    network: accept.network,
    amount: accept.amount ?? String(Math.round(displayUsdc(accept) * 10 ** USDC_DECIMALS)),
    asset: accept.asset,
    payTo: accept.payTo,
    resource: accept.resource,
    maxTimeoutSeconds: accept.maxTimeoutSeconds ?? 300,
    extra: { assetTransferMethod: 'erc7710', facilitatorAddresses },
  };

  let permissionContext: string;
  let delegationManager: string;
  try {
    const built = (await provider(requirements as never)) as {
      delegationManager: string;
      permissionContext: string;
      delegator: string;
    };
    permissionContext = built.permissionContext;
    delegationManager = built.delegationManager;
  } catch (e) {
    const error = `failed to build x402 delegation: ${(e as Error).message}`;
    store.emit({ agent: opts.buyerRole, action: 'x402 delegation build failed', status: 'failed', detail: error });
    return { ok: false, status: 402, error };
  }

  // The payment payload is the x402 envelope carrying the encoded delegation
  // chain (permissionContext). This is what wrapFetchWithPayment would send.
  const payload = {
    x402Version: challenge!.x402Version,
    scheme: accept.scheme,
    network: accept.network,
    payload: { assetTransferMethod: 'erc7710', delegationManager, permissionContext },
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload, bigintReplacer)).toString('base64');
  const paymentPayloadHash = keccak256(toHex(payloadB64)) as Hex;

  store.emit({
    agent: opts.buyerRole,
    action: 'constructed ERC-7710 payment payload',
    status: 'info',
    detail: `delegation restricted to facilitator (RedeemerEnforcer); permissionContext ${permissionContext.length}B; hash=${paymentPayloadHash.slice(0, 12)}…`,
  });

  // --- 3. retry with payment header ----------------------------------------
  let paid: Response;
  try {
    // x402 standard carries the payment in a single `X-PAYMENT` header. The
    // encoded delegation chain is large (~KBs), so sending it once keeps the
    // total header size under the server's limit.
    paid = await fetch(opts.url, {
      headers: { 'X-PAYMENT': payloadB64 },
    });
  } catch (e) {
    const error = `x402 retry failed: ${(e as Error).message}`;
    return { ok: false, status: 0, error, paymentPayloadHash };
  }

  if (!paid.ok) {
    const error = `payment rejected: HTTP ${paid.status}`;
    store.emit({ agent: opts.buyerRole, action: 'x402 payment rejected', status: 'failed', detail: error });
    return { ok: false, status: paid.status, error, paymentPayloadHash };
  }

  const data = await paid.json().catch(() => null);
  const settlement = decodeHeader(paid.headers.get('PAYMENT-RESPONSE'));

  // --- 4. persist receipt ---------------------------------------------------
  const receipt = store.addReceipt({
    url: opts.url,
    challenge,
    paymentPayloadHash,
    response: data,
  });

  const amountUsdc = displayUsdc(accept);
  store.addTransaction({
    kind: 'x402-payment',
    byRole: opts.buyerRole,
    toAddress: accept.payTo,
    amountUsdc,
    status: config.MOCK_MODE ? 'dry-run' : 'success',
    memo: `x402 ${shortUrl(opts.url)} (${accept.price ?? amountUsdc + ' USDC'})`,
  });

  store.emit({
    agent: opts.buyerRole,
    action: `x402 purchase complete — ${shortUrl(opts.url)}`,
    amount: amountUsdc,
    status: 'success',
    detail: `200 OK; settlement=${JSON.stringify(settlement)} ${config.MOCK_MODE ? '[mock]' : ''}`,
  });

  return { ok: true, status: 200, data, receiptId: receipt.id, paymentPayloadHash };
}

function decodeHeader(h: string | null): unknown {
  if (!h) return null;
  try {
    return JSON.parse(Buffer.from(h, 'base64').toString('utf8'));
  } catch {
    return h;
  }
}

function bigintReplacer(_k: string, v: unknown) {
  return typeof v === 'bigint' ? v.toString() : v;
}

function shortUrl(u: string): string {
  try {
    const p = new URL(u);
    return p.pathname;
  } catch {
    return u;
  }
}
