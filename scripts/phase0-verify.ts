/**
 * scripts/phase0-verify.ts — real-mode credential & config verification.
 * Prints PASS/FAIL only. NEVER prints secrets (keys or full RPC/bundler URLs).
 */
import { config } from '@aliran/core';
import { createPublicClient, http, erc20Abi, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';

const EXPECTED_CHAIN = 84532;
type Row = { check: string; pass: boolean; detail: string };
const rows: Row[] = [];
const add = (check: string, pass: boolean, detail: string) => rows.push({ check, pass, detail });

async function rpcCall(url: string, method: string, params: unknown[] = []) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function main() {
  console.log('\nPHASE 0 — credential & config verification');
  console.log('═'.repeat(70));

  // --- RPC ---
  try {
    const cid = (await rpcCall(config.RPC_URL, 'eth_chainId')) as string;
    const n = parseInt(cid, 16);
    add('RPC_URL eth_chainId', n === EXPECTED_CHAIN, `chainId=${n} (want ${EXPECTED_CHAIN})`);
  } catch (e) {
    add('RPC_URL eth_chainId', false, `ERROR: ${(e as Error).message}`);
  }

  // --- Bundler ---
  try {
    let detail = '';
    let pass = false;
    try {
      const eps = (await rpcCall(config.BUNDLER_URL, 'eth_supportedEntryPoints')) as string[];
      detail = `entryPoints=${eps.length}`;
      pass = Array.isArray(eps) && eps.length > 0;
    } catch {
      const cid = (await rpcCall(config.BUNDLER_URL, 'eth_chainId')) as string;
      const n = parseInt(cid, 16);
      detail = `chainId=${n}`;
      pass = n === EXPECTED_CHAIN;
    }
    add('BUNDLER_URL Base Sepolia', pass, detail);
  } catch (e) {
    add('BUNDLER_URL Base Sepolia', false, `ERROR: ${(e as Error).message}`);
  }

  // --- USDC ---
  try {
    const pc = createPublicClient({ chain: baseSepolia, transport: http(config.RPC_URL) });
    const [sym, dec] = await Promise.all([
      pc.readContract({ address: config.USDC_ADDRESS as Address, abi: erc20Abi, functionName: 'symbol' }),
      pc.readContract({ address: config.USDC_ADDRESS as Address, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    add('USDC symbol/decimals', /usdc/i.test(String(sym)) && Number(dec) === 6, `symbol=${sym} decimals=${dec}`);
  } catch (e) {
    add('USDC symbol/decimals', false, `ERROR: ${(e as Error).message}`);
  }

  // --- Venice models + tool-call shape ---
  try {
    const res = await fetch(`${config.VENICE_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${config.VENICE_API_KEY}` },
    });
    if (!res.ok) throw new Error(`/models HTTP ${res.status}`);
    const body = (await res.json()) as { data?: any[] };
    const models = body.data ?? [];
    // surface text models that advertise function/tool calling
    const toolModels = models.filter((m) => {
      const t = m.type ?? m.object ?? '';
      const cap = m.capabilities ?? m.model_spec?.capabilities ?? {};
      const supportsTools =
        cap.supportsFunctionCalling ?? cap.function_calling ?? cap.supportsTools ?? cap.tool_calling;
      return (/text|llm|chat/i.test(String(t)) || !t) && supportsTools;
    });
    add('VENICE /models', models.length > 0, `${models.length} models, ${toolModels.length} tool-capable`);
    // print a few tool-capable ids to choose from
    const ids = toolModels.map((m) => m.id ?? m.model ?? m.name).filter(Boolean).slice(0, 12);
    console.log('  tool-capable model ids:', ids.join(', ') || '(none flagged; will inspect raw)');
    if (ids.length === 0) {
      // fall back: print all ids so we can choose
      console.log('  all model ids:', models.map((m) => m.id ?? m.model ?? m.name).filter(Boolean).slice(0, 20).join(', '));
    }
  } catch (e) {
    add('VENICE /models', false, `ERROR: ${(e as Error).message}`);
  }

  // --- Venice live tool-call (only if a model is set) ---
  if (config.VENICE_MODEL) {
    try {
      const res = await fetch(`${config.VENICE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.VENICE_API_KEY}` },
        body: JSON.stringify({
          model: config.VENICE_MODEL,
          messages: [{ role: 'user', content: 'Call ping with value 42.' }],
          tools: [
            {
              type: 'function',
              function: {
                name: 'ping',
                description: 'ping with a number',
                parameters: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] },
              },
            },
          ],
          tool_choice: 'auto',
        }),
      });
      if (!res.ok) throw new Error(`chat HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
      const j = (await res.json()) as any;
      const msg = j.choices?.[0]?.message;
      const tc = msg?.tool_calls?.[0];
      const ok = !!tc && tc.function?.name === 'ping';
      add(`VENICE tool-call [${config.VENICE_MODEL}]`, ok, ok ? `tool_calls OK, args=${tc.function.arguments}` : `no tool_calls (content=${(msg?.content ?? '').slice(0, 60)})`);
    } catch (e) {
      add(`VENICE tool-call [${config.VENICE_MODEL}]`, false, `ERROR: ${(e as Error).message}`);
    }
  } else {
    add('VENICE tool-call', false, 'VENICE_MODEL not set yet — pick from list above, set in .env, re-run');
  }

  // --- x402 facilitator config presence ---
  add('X402_FACILITATOR_URL set', !!config.X402_FACILITATOR_URL, config.X402_FACILITATOR_URL ? 'present' : 'unset (resolve from docs)');
  add('X402_FACILITATOR_ADDRESS set', !!config.X402_FACILITATOR_ADDRESS, config.X402_FACILITATOR_ADDRESS ? 'present' : 'unset (resolve from docs)');

  // --- report ---
  console.log('\nPASS/FAIL table:');
  console.log('─'.repeat(70));
  for (const r of rows) console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.check.padEnd(34)} ${r.detail}`);
  console.log('─'.repeat(70));
  const fails = rows.filter((r) => !r.pass);
  console.log(fails.length ? `\n${fails.length} FAIL(s). See above.\n` : '\nAll Phase 0 checks PASSED.\n');
}

main().catch((e) => {
  console.error('phase0 crashed:', e);
  process.exit(1);
});
