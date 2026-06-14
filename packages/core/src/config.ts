import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Load .env from repo root regardless of cwd of the calling package/app.
const rootEnv = resolve(process.cwd(), '.env');
const upEnv = resolve(process.cwd(), '../../.env');
loadDotenv({ path: existsSync(rootEnv) ? rootEnv : upEnv });

function bool(v: string | undefined, dflt: boolean): boolean {
  if (v === undefined || v === '') return dflt;
  return v === 'true' || v === '1' || v === 'yes';
}

function str(v: string | undefined, dflt = ''): string {
  return v === undefined ? dflt : v;
}

/**
 * Central config. Nothing in the app reads process.env directly except here.
 * In MOCK_MODE most of these may be blank — that is fine; real-mode code paths
 * assert presence at the point of use (see requireReal()).
 */
export const config = {
  MOCK_MODE: bool(process.env.MOCK_MODE, true),
  DEMO_MODE: (str(process.env.DEMO_MODE, 'env-key') as 'env-key' | 'wallet'),

  CHAIN_ID: Number(str(process.env.CHAIN_ID, '84532')),
  RPC_URL: str(process.env.RPC_URL),
  BUNDLER_URL: str(process.env.BUNDLER_URL),
  USDC_ADDRESS: str(process.env.USDC_ADDRESS, '0x036CbD53842c5426634e7929541eC2318f3dCF7e'),

  OWNER_PRIVATE_KEY: str(process.env.OWNER_PRIVATE_KEY),
  AGENT_CFO_PK: str(process.env.AGENT_CFO_PK),
  AGENT_PAYROLL_PK: str(process.env.AGENT_PAYROLL_PK),
  AGENT_PROCUREMENT_PK: str(process.env.AGENT_PROCUREMENT_PK),
  AGENT_CREATIVE_PK: str(process.env.AGENT_CREATIVE_PK),
  // Dedicated x402 buyer EOA, upgraded via EIP-7702 to the stateless delegator
  // (the facilitator requires a 7702 payer, not a Hybrid smart account).
  X402_BUYER_PK: str(process.env.X402_BUYER_PK),
  CONTRIBUTOR_ADDRESSES: str(process.env.CONTRIBUTOR_ADDRESSES)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  VENICE_API_KEY: str(process.env.VENICE_API_KEY),
  VENICE_BASE_URL: str(process.env.VENICE_BASE_URL, 'https://api.venice.ai/api/v1'),
  VENICE_MODEL: str(process.env.VENICE_MODEL, 'venice-uncensored'),
  VENICE_IMAGE_MODEL: str(process.env.VENICE_IMAGE_MODEL, 'venice-sd35'),

  SELLER_PORT: Number(str(process.env.SELLER_PORT, '4021')),
  SELLER_PAY_TO_ADDRESS: str(process.env.SELLER_PAY_TO_ADDRESS),
  // The seller owns its product price (USD). The buyer never assumes this — it
  // always reads the price from the seller's real 402 challenge.
  SELLER_PRICE_USD: num(process.env.SELLER_PRICE_USD, 0.05),
  SELLER_URL: str(process.env.SELLER_URL, 'http://localhost:4021'),
  X402_FACILITATOR_URL: str(process.env.X402_FACILITATOR_URL),
  // Facilitator address(es) the buyer's open delegation is restricted to
  // (RedeemerEnforcer caveat). Comma-separated; first is advertised by the seller.
  X402_FACILITATOR_ADDRESS: str(process.env.X402_FACILITATOR_ADDRESS),
  // x402 transport: 'real' uses the official @x402 client + MetaMask facilitator;
  // 'mock' uses the local stub (works offline / when the facilitator rejects the
  // account). Independent of MOCK_MODE so chain+Venice can be real while x402 is
  // stubbed. Defaults to 'real'.
  X402_MODE: (str(process.env.X402_MODE, 'real') as 'real' | 'mock'),

  // --- M6: 1Shot permissionless relayer (Base MAINNET 8453) ----------------
  // Stretch track, fully isolated: only `pnpm m6` reads these. RELAYER=1shot
  // gates the feature. NEVER mixed with the Sepolia (MOCK/real) demo path.
  RELAYER: str(process.env.RELAYER),
  MAINNET_CHAIN_ID: Number(str(process.env.MAINNET_CHAIN_ID, '8453')),
  MAINNET_RPC_URL: str(process.env.MAINNET_RPC_URL, 'https://mainnet.base.org'),
  MAINNET_OWNER_PK: str(process.env.MAINNET_OWNER_PK),
  MAINNET_USDC: str(process.env.MAINNET_USDC, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
  RELAYER_URL: str(process.env.RELAYER_URL, 'https://relayer.1shotapi.com/relayers'),
  M6_WORK_RECIPIENT: str(process.env.M6_WORK_RECIPIENT, '0xA21c8386613e9B27278e0Be336c04EB8AcF65246'),
} as const;

export const USDC_DECIMALS = 6;

/** True when x402 should use the local stub (global mock, or x402-only stub). */
export function x402IsMock(): boolean {
  return config.MOCK_MODE || config.X402_MODE === 'mock';
}

function num(v: string | undefined, dflt: number): number {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : dflt;
}

/**
 * Demo amounts (USDC human units / USD price). Env-overridable so a real-mode
 * run on scarce faucet USDC can use tiny amounts without touching code. Defaults
 * are the original mock-demo figures.
 */
export const demo = {
  rootCapUsdc: num(process.env.DEMO_ROOT_CAP_USDC, 500),
  capPayroll: num(process.env.DEMO_CAP_PAYROLL, 300),
  capProcurement: num(process.env.DEMO_CAP_PROCUREMENT, 150),
  capCreative: num(process.env.DEMO_CAP_CREATIVE, 50),
} as const;

/** The CFO root cap (USDC, human units). Demo-amount driven. */
export const ROOT_CAP_USDC = demo.rootCapUsdc;

/**
 * Guard for real-mode-only code. Call at the top of any function that
 * broadcasts a transaction or hits a live API. In MOCK_MODE these paths are
 * never reached (callers branch on config.MOCK_MODE first), so this is a
 * defense-in-depth assertion with a clear message pointing at BLOCKED.md.
 */
export function requireReal(vars: Record<string, string>): void {
  const missing = Object.entries(vars)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `Real mode requires env vars: ${missing.join(', ')}. ` +
        `Set MOCK_MODE=true to dry-run, or fill these in .env (see BLOCKED.md).`,
    );
  }
}
