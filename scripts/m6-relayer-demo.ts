/**
 * scripts/m6-relayer-demo.ts — M6 stretch: 1Shot permissionless relayer.
 *
 * On Base MAINNET (8453), from a ZERO-ETH account, via the 1Shot relayer:
 *   • create ONE ERC-7710 delegation (cap 0.5 USDC) to the relayer's target,
 *   • relay 2 redemptions of 0.05 USDC each to the work recipient,
 *   • pay all gas in USDC (fee → feeCollector), and
 *   • upgrade the EOA to a 7702 stateless delegator via the relayer (type-4 tx
 *     bundled into redemption #1 — no ETH, no third-party funding).
 *
 * Safety: gated behind RELAYER=1shot. ALWAYS estimates first (zero-spend) and
 * ABORTS if any single fee quote exceeds the cap. Never touches Sepolia config.
 *
 * Run:  RELAYER=1shot pnpm m6     (or set RELAYER=1shot in .env)
 */
import { config } from '@aliran/core';
import {
  relayerGetCapabilities,
  relayerEstimate,
  relayerSend,
  relayerPoll,
  toRelayerJson,
} from '@aliran/delegation';
import {
  Implementation,
  ScopeType,
  createDelegation,
  getSmartAccountsEnvironment,
  toMetaMaskSmartAccount,
} from '@metamask/smart-accounts-kit';
import {
  createPublicClient,
  http,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'node:crypto';

// --- demo parameters --------------------------------------------------------
const CHAIN_ID = '8453';
const WORK_USDC = '0.05'; // per redemption, to the work recipient
const DELEGATION_CAP_USDC = '0.5'; // single delegation cap, reused for both
const MOCK_FEE_USDC = '0.01'; // initial mock fee (≥ minFee)
const FEE_ABORT_ATOMS = parseUnits('0.6', 6); // abort if any fee quote exceeds this
const N_REDEMPTIONS = Number(process.env.M6_N_REDEMPTIONS ?? '2');
// Optional webhook target: when set, the relayer POSTs signed Ed25519 status
// events here (run scripts/m6-webhook-receiver.ts behind a tunnel). Polling
// stays on as a backstop.
const DEST_URL = process.env.M6_DEST_URL || undefined;
const EXPLORER = 'https://basescan.org/tx/';

function salt32(): Hex {
  return `0x${Buffer.from(randomBytes(32)).toString('hex')}`;
}

async function main() {
  if (config.RELAYER !== '1shot') {
    console.log('M6 is gated behind RELAYER=1shot. Set RELAYER=1shot to run (real Base mainnet USDC).');
    return;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(config.MAINNET_OWNER_PK)) {
    console.log('MAINNET_OWNER_PK missing/invalid.');
    process.exit(1);
  }

  const owner = privateKeyToAccount(config.MAINNET_OWNER_PK as Hex);
  const recipient = config.M6_WORK_RECIPIENT as Address;
  const relayerUrl = config.RELAYER_URL;
  const publicClient = createPublicClient({ chain: base, transport: http(config.MAINNET_RPC_URL) });

  console.log('\nM6 — 1Shot permissionless relayer (Base mainnet 8453)');
  console.log('═'.repeat(70));
  console.log('owner (zero-ETH payer):', owner.address);
  console.log('work recipient:        ', recipient);
  console.log('relayer:               ', relayerUrl);

  // 1. capabilities
  const caps = await relayerGetCapabilities(relayerUrl, CHAIN_ID);
  const usdc = caps.tokens.find((t) => t.symbol === 'USDC');
  if (!usdc) throw new Error('USDC not accepted by relayer on this chain');
  const usdcAddr = getAddress(usdc.address) as Address;
  const decimals = Number(usdc.decimals);
  console.log('targetAddress:', caps.targetAddress, '| feeCollector:', caps.feeCollector);

  const startUsdc = (await publicClient.readContract({
    address: usdcAddr, abi: erc20Abi, functionName: 'balanceOf', args: [owner.address],
  })) as bigint;
  console.log('owner USDC:', formatUnits(startUsdc, decimals), '| ETH:', formatUnits(await publicClient.getBalance({ address: owner.address }), 18));

  // 2. smart account (stateless-7702 at the owner EOA address) + ONE delegation
  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Stateless7702,
    address: owner.address,
    signer: { account: owner },
  });
  const env = getSmartAccountsEnvironment(Number(CHAIN_ID));
  const statelessImpl = getAddress(env.implementations.EIP7702StatelessDeleGatorImpl);

  const delegation = createDelegation({
    to: caps.targetAddress,
    from: smartAccount.address,
    environment: smartAccount.environment,
    salt: salt32(),
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: usdcAddr,
      maxAmount: parseUnits(DELEGATION_CAP_USDC, decimals),
    },
  });
  const signature = await smartAccount.signDelegation({ delegation });
  const signedDelegation = toRelayerJson({ ...delegation, signature });
  console.log(`\nsigned ONE delegation → targetAddress, cap ${DELEGATION_CAP_USDC} USDC (reused for ${N_REDEMPTIONS} redemptions)`);

  const txHashes: string[] = [];
  for (let i = 0; i < N_REDEMPTIONS; i++) {
    console.log(`\n── Redemption ${i + 1}/${N_REDEMPTIONS} ──`);

    // 7702 authorization only while the account is still a plain EOA.
    let authorizationList: unknown[] | undefined;
    const code = await publicClient.getCode({ address: owner.address });
    if (!code || code === '0x') {
      const nonce = await publicClient.getTransactionCount({ address: owner.address, blockTag: 'pending' });
      const auth = await owner.signAuthorization({ chainId: Number(CHAIN_ID), contractAddress: statelessImpl, nonce });
      authorizationList = [
        { address: auth.address, chainId: auth.chainId, nonce: auth.nonce, r: auth.r, s: auth.s, yParity: auth.yParity ?? 0 },
      ];
      console.log('  including EIP-7702 authorization (account not yet upgraded)');
    } else {
      console.log('  account already 7702-upgraded — no authorization needed');
    }

    const buildBundle = (feeAtoms: bigint) => ({
      chainId: CHAIN_ID,
      ...(authorizationList ? { authorizationList } : {}),
      transactions: [
        {
          permissionContext: [signedDelegation],
          executions: [
            { target: usdcAddr, value: '0', data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [caps.feeCollector, feeAtoms] }) },
            { target: usdcAddr, value: '0', data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipient, parseUnits(WORK_USDC, decimals)] }) },
          ],
        },
      ],
    });

    // estimate (zero-spend) with mock fee
    let est = await relayerEstimate(relayerUrl, buildBundle(parseUnits(MOCK_FEE_USDC, decimals)));
    if (!est.success) throw new Error(`estimate failed: ${est.error}`);
    let feeAtoms = BigInt(est.requiredPaymentAmount ?? '0');
    console.log(`  estimate: requiredFee=${formatUnits(feeAtoms, decimals)} USDC, gasUsed=${JSON.stringify(est.gasUsed)}`);

    // ABORT GUARD
    if (feeAtoms > FEE_ABORT_ATOMS) {
      console.log(`  ✗ ABORT: fee ${formatUnits(feeAtoms, decimals)} USDC exceeds ${formatUnits(FEE_ABORT_ATOMS, decimals)} cap. No send.`);
      process.exit(1);
    }

    // Zero-spend validation mode: confirm the bundle validates + show the real
    // fee WITHOUT sending. Use to sanity-check before committing real USDC.
    if (process.env.M6_ESTIMATE_ONLY === '1') {
      console.log(`  [estimate-only] bundle validates; would pay ${formatUnits(feeAtoms, decimals)} USDC fee. Not sending.`);
      console.log(`  [estimate-only] 7702 authorization ${authorizationList ? 'INCLUDED' : 'not needed'} for this redemption.`);
      return;
    }

    // re-estimate with the exact fee to lock a matching price context
    est = await relayerEstimate(relayerUrl, buildBundle(feeAtoms));
    if (!est.success) throw new Error(`re-estimate failed: ${est.error}`);
    feeAtoms = BigInt(est.requiredPaymentAmount ?? feeAtoms.toString());
    if (feeAtoms > FEE_ABORT_ATOMS) { console.log('  ✗ ABORT after re-estimate.'); process.exit(1); }

    // send (locks the quote via estimate context)
    const taskId = await relayerSend(relayerUrl, {
      ...buildBundle(feeAtoms),
      context: est.context,
      memo: `aliran-m6-redemption-${i + 1}`,
      ...(DEST_URL ? { destinationUrl: DEST_URL } : {}),
    });
    console.log('  submitted taskId:', taskId, DEST_URL ? `— webhooks → ${DEST_URL}` : '', '— polling status…');

    const final = await relayerPoll(relayerUrl, taskId, (s) => {
      const label = { 100: 'Pending', 110: 'Submitted', 200: 'Confirmed', 400: 'Rejected', 500: 'Reverted' }[s.status];
      console.log(`    status ${s.status} (${label})${s.hash ? ` hash=${s.hash}` : ''}`);
    });
    if (final.status !== 200) {
      throw new Error(`redemption ${i + 1} did not confirm: ${final.message ?? JSON.stringify(final.data)}`);
    }
    const hash = final.receipt?.transactionHash ?? final.hash ?? '';
    txHashes.push(hash);
    console.log(`  ✓ confirmed: ${EXPLORER}${hash}`);
  }

  const endUsdc = (await publicClient.readContract({
    address: usdcAddr, abi: erc20Abi, functionName: 'balanceOf', args: [owner.address],
  })) as bigint;
  const codeAfter = await publicClient.getCode({ address: owner.address });

  console.log('\n' + '═'.repeat(70));
  console.log('M6 PASSED — gas paid in USDC via the 1Shot relayer, zero ETH used.');
  console.log('7702-upgraded:', Boolean(codeAfter && codeAfter !== '0x'), '(code:', (codeAfter ?? '0x').slice(0, 24) + '…)');
  console.log('USDC spent total:', formatUnits(startUsdc - endUsdc, decimals), `(${WORK_USDC}×${N_REDEMPTIONS} work + fees)`);
  console.log('tx hashes:');
  for (const h of txHashes) console.log('  ' + EXPLORER + h);
  console.log('');
}

main().catch((e) => { console.error('\nM6 crashed:', e); process.exit(1); });
