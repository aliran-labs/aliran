import express, { type Request, type Response, type NextFunction } from 'express';
import { config } from '@aliran/core';
import { MARKET_BRIEF } from './marketData';

/**
 * Aliran x402 seller.
 *
 * M0/MOCK_MODE: a hand-rolled 402 challenge + a header check that mirrors the
 * x402 + ERC-7710 shape (scheme=exact, network=eip155:84532,
 * extra.assetTransferMethod='erc7710'). This lets the buyer flow be exercised
 * end-to-end offline. It genuinely returns 402 and refuses to serve data until
 * a PAYMENT-SIGNATURE header is present.
 *
 * M2/real mode: replace `x402Guard` with the official `paymentMiddleware` from
 * @x402/express wired to x402ResourceServer + x402ExactEvmErc7710ServerScheme
 * (see NOTES.md and the seller guide). The route handler below stays identical.
 */

const PRICE_USDC = 0.01;
const NETWORK = `eip155:${config.CHAIN_ID}`;
const PAY_TO = config.SELLER_PAY_TO_ADDRESS || '0xSELLER_PAY_TO_NOT_SET';

function buildChallenge() {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: NETWORK,
        price: `$${PRICE_USDC.toFixed(2)}`,
        asset: config.USDC_ADDRESS,
        payTo: PAY_TO,
        resource: '/api/market-brief',
        mimeType: 'application/json',
        extra: { assetTransferMethod: 'erc7710' },
      },
    ],
    error: 'X-PAYMENT header required',
  };
}

function x402Guard(req: Request, res: Response, next: NextFunction) {
  const sig = req.header('PAYMENT-SIGNATURE') || req.header('X-PAYMENT');
  if (!sig) {
    const challenge = buildChallenge();
    const b64 = Buffer.from(JSON.stringify(challenge)).toString('base64');
    res.setHeader('PAYMENT-REQUIRED', b64);
    res.status(402).json(challenge);
    return;
  }
  // In real mode, the facilitator verifies + settles here. In mock mode we
  // accept any non-empty signature and echo a settlement stub so the buyer can
  // store a receipt.
  res.setHeader(
    'PAYMENT-RESPONSE',
    Buffer.from(
      JSON.stringify({ settled: true, mock: config.MOCK_MODE, network: NETWORK }),
    ).toString('base64'),
  );
  next();
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'aliran-seller', mock: config.MOCK_MODE, network: NETWORK });
});

app.get('/api/market-brief', x402Guard, (_req, res) => {
  res.json(MARKET_BRIEF);
});

const port = config.SELLER_PORT;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[seller] listening on http://localhost:${port}  (mock=${config.MOCK_MODE}, network=${NETWORK})`,
  );
  // eslint-disable-next-line no-console
  console.log(`[seller] protected route: GET /api/market-brief  price=$${PRICE_USDC} erc7710`);
});
