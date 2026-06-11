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
  SELLER_URL: str(process.env.SELLER_URL, 'http://localhost:4021'),
  X402_FACILITATOR_URL: str(process.env.X402_FACILITATOR_URL),
  // Facilitator address(es) the buyer's open delegation is restricted to
  // (RedeemerEnforcer caveat). Comma-separated; first is advertised by the seller.
  X402_FACILITATOR_ADDRESS: str(process.env.X402_FACILITATOR_ADDRESS),

  RELAYER: str(process.env.RELAYER),
} as const;

export const USDC_DECIMALS = 6;

/** Treasury cap constants (USDC, human units). The CFO root cap. */
export const ROOT_CAP_USDC = 500;

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
