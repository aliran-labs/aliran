import express, { type Request, type Response, type NextFunction } from 'express';
import { config, demo, x402IsMock } from '@aliran/core';
import { MARKET_BRIEF } from './marketData';

/**
 * Aliran x402 seller.
 *
 * REAL mode (MOCK_MODE=false): the official MetaMask x402 stack —
 *   paymentMiddleware (@x402/express) + x402ResourceServer +
 *   x402ExactEvmErc7710ServerScheme (@metamask/x402) + HTTPFacilitatorClient
 *   (@x402/core/server) pointed at the Base Sepolia facilitator. The scheme
 *   enriches the 402 challenge with amount/asset/extra.facilitatorAddresses and
 *   the facilitator verifies + settles the delegated payment on-chain.
 *
 * MOCK mode: a hand-rolled 402 that mirrors the same shape (incl. amount +
 * extra.facilitatorAddresses) so the buyer flow runs fully offline.
 *
 * Either way: GET /api/market-brief returns 402 until paid, then the data.
 */

const PRICE_USD = demo.x402PriceUsd;
const PRICE_STR = `$${PRICE_USD.toFixed(2)}`;
const USDC_DECIMALS = 6;
const AMOUNT_ATOMIC = String(Math.round(PRICE_USD * 10 ** USDC_DECIMALS));
const NETWORK = `eip155:${config.CHAIN_ID}` as `${string}:${string}`;
const MOCK_PAY_TO = '0x000000000000000000000000000000000000dead';
const MOCK_FACILITATOR = '0x00000000000000000000000000000000fac11171';
const PAY_TO = config.SELLER_PAY_TO_ADDRESS || MOCK_PAY_TO;
const FACILITATOR = config.X402_FACILITATOR_ADDRESS || MOCK_FACILITATOR;

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'aliran-seller', mock: config.MOCK_MODE, network: NETWORK, price: PRICE_STR });
});

async function installRoutes() {
  if (!x402IsMock()) {
    // --- REAL: official @x402 middleware + MetaMask facilitator ---------------
    const { paymentMiddleware, x402ResourceServer } = await import('@x402/express');
    const { x402ExactEvmErc7710ServerScheme } = await import('@metamask/x402');
    const { HTTPFacilitatorClient } = await import('@x402/core/server');

    if (!config.X402_FACILITATOR_URL) {
      throw new Error('X402_FACILITATOR_URL required in real mode (see BLOCKED.md).');
    }
    const facilitatorClient = new HTTPFacilitatorClient({ url: config.X402_FACILITATOR_URL });

    app.use(
      paymentMiddleware(
        {
          'GET /api/market-brief': {
            accepts: [
              {
                scheme: 'exact',
                price: PRICE_STR,
                network: NETWORK,
                payTo: PAY_TO,
                extra: { assetTransferMethod: 'erc7710' },
              },
            ],
            description: 'Aliran curated market brief',
            mimeType: 'application/json',
          },
        },
        new x402ResourceServer(facilitatorClient).register(NETWORK, new x402ExactEvmErc7710ServerScheme()),
      ),
    );
    app.get('/api/market-brief', (_req: Request, res: Response) => res.json(MARKET_BRIEF));
    // eslint-disable-next-line no-console
    console.log(`[seller] REAL x402 via facilitator; price=${PRICE_STR}`);
    return;
  }

  // --- MOCK: hand-rolled 402 mirroring the official challenge shape -----------
  function buildChallenge() {
    return {
      x402Version: 1,
      accepts: [
        {
          scheme: 'exact',
          network: NETWORK,
          amount: AMOUNT_ATOMIC,
          price: PRICE_STR,
          asset: config.USDC_ADDRESS,
          payTo: PAY_TO,
          resource: '/api/market-brief',
          mimeType: 'application/json',
          maxTimeoutSeconds: 300,
          extra: { assetTransferMethod: 'erc7710', facilitatorAddresses: [FACILITATOR] },
        },
      ],
      error: 'X-PAYMENT header required',
    };
  }
  function x402Guard(req: Request, res: Response, next: NextFunction) {
    const sig = req.header('PAYMENT-SIGNATURE') || req.header('X-PAYMENT');
    if (!sig) {
      const challenge = buildChallenge();
      res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(challenge)).toString('base64'));
      res.status(402).json(challenge);
      return;
    }
    res.setHeader(
      'PAYMENT-RESPONSE',
      Buffer.from(JSON.stringify({ settled: true, mock: true, network: NETWORK })).toString('base64'),
    );
    next();
  }
  app.get('/api/market-brief', x402Guard, (_req, res) => res.json(MARKET_BRIEF));
  // eslint-disable-next-line no-console
  console.log(`[seller] MOCK x402 stub; price=${PRICE_STR}`);
}

// Render (and most PaaS) inject the port via $PORT; fall back to SELLER_PORT locally.
const LISTEN_PORT = Number(process.env.PORT) || config.SELLER_PORT;

installRoutes()
  .then(() => {
    app.listen(LISTEN_PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`[seller] listening on :${LISTEN_PORT}  (mock=${config.MOCK_MODE}, ${NETWORK})`);
    });
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[seller] failed to start:', e);
    process.exit(1);
  });
