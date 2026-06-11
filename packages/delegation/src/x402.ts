import { createOpenDelegation, ScopeType } from '@metamask/smart-accounts-kit';
import { parseUnits, keccak256, toHex, type Address, type Hex } from 'viem';
import { config, store, USDC_DECIMALS, type AgentRole } from '@aliran/core';
import { smartAccountForRole } from './smartAccount';

/**
 * x402 buyer (ERC-7710 delegated payment).
 *
 * Flow (per the x402 + ERC-7710 overview/seller guides):
 *   1. GET the protected resource. Expect HTTP 402 with a base64 `PAYMENT-REQUIRED`
 *      header (and a JSON body) describing `accepts[]`.
 *   2. Require accepts[0].extra.assetTransferMethod === 'erc7710'.
 *   3. Create an OPEN delegation (createOpenDelegation) restricted to the
 *      facilitator + the quoted amount, sign it, encode the chain as the payment
 *      payload (base64 JSON), and retry with a `PAYMENT-SIGNATURE` header.
 *   4. On 200, persist a receipt (challenge + payload hash + response).
 *
 * MOCK_MODE: builds + signs a real open delegation and a real payload, but the
 * "settlement" is whatever the mock seller echoes. No broadcast occurs (the
 * facilitator would settle on-chain in real mode). The receipt is stored either way.
 *
 * Real mode: replace the hand-rolled retry with the official x402 buyer client
 * once the exact wire encoding is pinned from the buyer guide (see NOTES.md).
 * The shape below already matches the seller stub's accepted headers.
 */

export interface X402Accept {
  scheme: string;
  network: string;
  price: string;
  asset: string;
  payTo: string;
  resource?: string;
  mimeType?: string;
  extra?: { assetTransferMethod?: string };
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

function priceToUsdcUnits(price: string): bigint {
  // "$0.01" -> 0.01 USDC
  const n = Number(price.replace(/[^0-9.]/g, ''));
  return parseUnits((Number.isFinite(n) ? n : 0).toString(), USDC_DECIMALS);
}

/**
 * Buy an x402-protected resource as `buyerRole` (procurement agent).
 */
export async function buyX402(opts: {
  url: string;
  buyerRole: AgentRole;
  /** facilitator the open delegation is restricted to; falls back to config. */
  facilitator?: string;
}): Promise<X402BuyResult> {
  const facilitator = opts.facilitator || config.X402_FACILITATOR_URL || 'mock-facilitator';

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

  store.emit({
    agent: opts.buyerRole,
    action: `received 402 — ${accept.price} on ${accept.network}`,
    status: 'info',
    detail: `payTo=${accept.payTo.slice(0, 10)}… method=erc7710`,
  });

  // --- 2. build + sign an OPEN delegation restricted to the facilitator -----
  const buyer = await smartAccountForRole(opts.buyerRole);
  const maxAmount = priceToUsdcUnits(accept.price);

  const openDelegation = createOpenDelegation({
    from: buyer.address,
    environment: buyer.environment,
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: accept.asset as Address,
      maxAmount,
    },
  });
  const signature = await buyer.signDelegation({ delegation: openDelegation });
  const signedOpen = { ...openDelegation, signature };

  // Encode the payment payload (delegation chain) as base64 JSON. The real
  // x402 buyer client encodes this per the facilitator's expected schema; the
  // mock seller accepts any non-empty PAYMENT-SIGNATURE.
  const payload = {
    x402Version: challenge!.x402Version,
    scheme: accept.scheme,
    network: accept.network,
    assetTransferMethod: 'erc7710',
    facilitator,
    delegationChain: [signedOpen],
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload, bigintReplacer)).toString('base64');
  const paymentPayloadHash = keccak256(toHex(payloadB64)) as Hex;

  store.emit({
    agent: opts.buyerRole,
    action: 'constructed ERC-7710 payment payload',
    status: 'info',
    detail: `open delegation signed, restricted to facilitator; hash=${paymentPayloadHash.slice(0, 12)}…`,
  });

  // --- 3. retry with payment header ----------------------------------------
  let paid: Response;
  try {
    paid = await fetch(opts.url, {
      headers: {
        'PAYMENT-SIGNATURE': payloadB64,
        'X-PAYMENT': payloadB64, // include both spellings for compatibility
      },
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

  store.addTransaction({
    kind: 'x402-payment',
    byRole: opts.buyerRole,
    toAddress: accept.payTo,
    amountUsdc: Number(accept.price.replace(/[^0-9.]/g, '')),
    status: config.MOCK_MODE ? 'dry-run' : 'success',
    memo: `x402 ${shortUrl(opts.url)} (${accept.price})`,
  });

  store.emit({
    agent: opts.buyerRole,
    action: `x402 purchase complete — ${shortUrl(opts.url)}`,
    amount: Number(accept.price.replace(/[^0-9.]/g, '')),
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
