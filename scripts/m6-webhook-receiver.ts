/**
 * scripts/m6-webhook-receiver.ts — 1Shot relayer webhook receiver with Ed25519
 * verification (node-native crypto, no extra deps). Ready artifact: the live m6
 * run uses reliable `relayer_getStatus` polling because exposing localhost to
 * the relayer needs a public tunnel; pass `destinationUrl: <public-url>` to
 * `relayer_send7710Transaction` (and run this behind a tunnel) for sub-second,
 * webhook-driven status the rubric rewards.
 *
 *   pnpm tsx scripts/m6-webhook-receiver.ts   # listens on :4040 /relayer-webhook
 */
import { createServer } from 'node:http';
import { createPublicKey, verify as edVerify } from 'node:crypto';

const JWKS_URL = 'https://relayer.1shotapi.com/.well-known/jwks.json';
const PORT = Number(process.env.M6_WEBHOOK_PORT ?? '4040');

let jwks: { fetchedAt: number; keys: Map<string, string> } | null = null;
const JWKS_TTL = 10 * 60_000;

async function getKeys(force = false): Promise<Map<string, string>> {
  if (!force && jwks && Date.now() - jwks.fetchedAt < JWKS_TTL) return jwks.keys;
  const res = await fetch(JWKS_URL);
  const { keys } = (await res.json()) as { keys: { kty: string; crv: string; kid: string; x: string }[] };
  const map = new Map<string, string>();
  for (const k of keys) if (k.kty === 'OKP' && k.crv === 'Ed25519') map.set(k.kid, k.x);
  jwks = { fetchedAt: Date.now(), keys: map };
  return map;
}

/** Stable, sorted-key JSON (the relayer signs the canonical form). */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

async function verifyWebhook(body: Record<string, unknown>): Promise<boolean> {
  const sigB64 = body.signature as string | undefined;
  const keyId = body.keyId as string | undefined;
  if (!sigB64 || !keyId) return false;
  let keys = await getKeys();
  let x = keys.get(keyId);
  if (!x) { keys = await getKeys(true); x = keys.get(keyId); }
  if (!x) return false;
  const pub = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
  const { signature: _omit, ...rest } = body;
  const msg = Buffer.from(canonical(rest), 'utf8');
  const sig = Buffer.from(sigB64, 'base64');
  try {
    return edVerify(null, msg, pub, sig);
  } catch {
    return false;
  }
}

const LABEL: Record<number, string> = { 4: 'Submitted', 0: 'Confirmed', 1: 'Reverted' };

createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.includes('relayer-webhook')) {
    res.writeHead(404).end('not found');
    return;
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { res.writeHead(400).end('bad json'); return; }
    const ok = await verifyWebhook(body);
    if (!ok) { res.writeHead(401).end('invalid signature'); return; }
    const data = (body.data ?? {}) as { id?: string; status?: number; memo?: string };
    // eslint-disable-next-line no-console
    console.log(`[webhook ✓] type=${body.type} (${LABEL[body.type as number] ?? '?'}) task=${data.id} memo=${data.memo ?? '-'}`);
    res.writeHead(200).end('ok');
  });
}).listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[m6-webhook] listening on :${PORT} /relayer-webhook (Ed25519-verified). Expose via a tunnel + pass destinationUrl on send.`);
});
