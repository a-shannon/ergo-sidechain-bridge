/**
 * Demo Readiness -- combined Ergo + Sidechain preflight + next-action guide.
 *
 * Performs both Ergo-side and sidechain-side readiness checks in one run,
 * then prints the recommended next actions for the live batch demo.
 *
 * This script does NOT load .env, sign, submit, or modify any state.
 *
 * Usage:
 *   npm run demo:readiness
 *
 * Exit code:
 *   0 = all PASS/WARN
 *   1 = at least one FAIL
 */

import type { AggregateSettlementApprovalContext } from '../aggregate-settlement-approvals.js';

type PreflightCheck = {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
};

const PUBLIC_BOUNDARY_FLAG = '--public-boundary';
const HELP_FLAGS = new Set(['--help', '-h']);

interface DemoReadinessDeps {
  ethers: {
    JsonRpcProvider: new (url: string) => {
      getBlockNumber(): Promise<number>;
      getCode(address: string): Promise<string>;
    };
  };
  nget(path: string): Promise<any>;
  NODE: string;
  computeDeployedStateHash(): string;
  ERGO_CONFIG: { nodeUrl?: string };
  loadDeployedState(): any;
  PROTOCOL_PARAMS: any;
  SUBSTRATE_CONFIG: { network: string; evmRpcUrl?: string; wsUrl?: string };
  asBoxArray(value: unknown): any[];
  findPureErgBoxes(boxes: any[]): any[];
  formatNanoErg(value: bigint): string;
  classifyLiquidityStatus(
    boxes: any[],
    minimumNanoErg: bigint,
  ): { status: PreflightCheck['status']; totalNanoErg: bigint; largestNanoErg: bigint; boxCount: number };
  classifySigningReadiness(maxContextVars: number, batchClaims: number): PreflightCheck;
  resolveSigningReadinessBatchClaims(value: string | undefined): number;
  hasFailure(checks: PreflightCheck[]): boolean;
  EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS: number;
  classifyBroadcastReadiness(): PreflightCheck;
  classifyLiveSettlementStartupReadiness(params: any, maxContextVars: number): PreflightCheck;
  classifyLegacyOwnerMintDeploymentMetadata(solidity: unknown): PreflightCheck;
  classifyLegacyOwnerMintRuntimeCode(input: Readonly<{
    label: string;
    address: string;
    code: string | null | undefined;
  }>): PreflightCheck;
  assertErgoNodeEndpointAlignment(
    context: string,
    input: { ergoNode?: string; ergoNodeUrl?: string },
  ): { ergoNodeOrigin: string };
}

function printPublicBoundaryReport(): void {
  console.log('# Bridge Demo Readiness Public Boundary Report');
  console.log('');
  console.log('| Field | Value |');
  console.log('|---|---|');
  console.log('| Command | npm run demo:readiness -- --public-boundary |');
  console.log('| Result | BOUNDARY_ONLY |');
  console.log('| Exit code | 0 |');
  console.log('| Runtime database opened | no |');
  console.log('| Deployment state opened | no |');
  console.log('| Dotenv loaded | no |');
  console.log('| Ergo node or sidechain RPC request performed | no |');
  console.log('| Public claim authorization granted | no |');
  console.log('| Release gate PASS claimed | no |');
  console.log('| Transaction broadcast, submit, deploy, signing, reconcile, or state mutation performed | no |');
  console.log('');
  console.log('This report is not completed demo readiness evidence.');
}

function isHelpRequested(argv: string[]): boolean {
  return argv.some(arg => HELP_FLAGS.has(arg));
}

function printUsage(): void {
  console.log('Usage: npm run demo:readiness [-- --public-boundary]');
  console.log('');
  console.log('Runs the combined Ergo and sidechain readiness preflight.');
  console.log('');
  console.log('Options:');
  console.log('  --public-boundary   Print a no-runtime-access public boundary report');
  console.log('  --help, -h          Print this help without opening runtime state');
}

function formatEvidenceUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    const formatted = parsed.toString();
    return formatted.endsWith('/') ? formatted.slice(0, -1) : formatted;
  } catch {
    return '[invalid URL]';
  }
}

async function runDemoReadiness({
  ethers,
  nget,
  NODE,
  computeDeployedStateHash,
  ERGO_CONFIG,
  loadDeployedState,
  PROTOCOL_PARAMS,
  SUBSTRATE_CONFIG,
  asBoxArray,
  findPureErgBoxes,
  formatNanoErg,
  classifyLiquidityStatus,
  classifySigningReadiness,
  resolveSigningReadinessBatchClaims,
  hasFailure,
  EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS,
  classifyBroadcastReadiness,
  classifyLiveSettlementStartupReadiness,
  classifyLegacyOwnerMintDeploymentMetadata,
  classifyLegacyOwnerMintRuntimeCode,
  assertErgoNodeEndpointAlignment,
}: DemoReadinessDeps): Promise<void> {
  const EVM_RPC_URL = process.env.SUBSTRATE_EVM_URL ?? 'http://localhost:9945';
  const UNLOCK_LIQUIDITY = BigInt(process.env.AGGREGATE_UNLOCK_LIQUIDITY_NANOERG ?? '100000000');
  const checks: PreflightCheck[] = [];
  const statusPrefix = { PASS: '[PASS]', WARN: '[WARN]', FAIL: '[FAIL]' };
  const signingBatchN = resolveSigningReadinessBatchClaims(process.env.AGGREGATE_BATCH_MAX_CLAIMS);

  console.log('===========================================================');
  console.log('  Bridge Demo Readiness Check');
  console.log('===========================================================\n');

  // SECTION 0: Signing Readiness
  console.log('-- Signing Readiness ------------------------------------');
  {
    const c = classifySigningReadiness(EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS, signingBatchN);
    checks.push(c);
    console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
  }
  {
    const c = classifyBroadcastReadiness();
    checks.push(c);
    console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
  }

  // SECTION 1: Ergo L1
  console.log('\n-- Ergo L1 ----------------------------------------------');

  // 1a. Node
  let ergoOnline = false;
  try {
    const info = await nget('/info');
    if (info?.fullHeight) {
      ergoOnline = true;
      const c: PreflightCheck = { name: 'Ergo node', status: 'PASS', message: `height=${info.fullHeight}` };
      checks.push(c);
      console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
    } else if (info === null) {
      const c: PreflightCheck = { name: 'Ergo node', status: 'FAIL', message: `unreachable at ${NODE} or /info request failed` };
      checks.push(c);
      console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
    } else {
      const c: PreflightCheck = { name: 'Ergo node', status: 'FAIL', message: 'unexpected /info response' };
      checks.push(c);
      console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
    }
  } catch (err: any) {
    const c: PreflightCheck = { name: 'Ergo node', status: 'FAIL', message: `unreachable at ${NODE}` };
    checks.push(c);
    console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
  }

  // 1b. Deployed state
  let deployed: any;
  let deployedStateHash: string;
  try {
    deployed = loadDeployedState();
    deployedStateHash = computeDeployedStateHash();
  } catch {
    const c: PreflightCheck = { name: 'deployed_state.json', status: 'FAIL', message: 'cannot load' };
    checks.push(c);
    console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
    printSummary(checks, true);
    process.exit(1);
  }

  const hasBatchDup = !!deployed.doubleUnlockPreventionAggregateBatch?.nftId;
  const hasBatchUnlock = !!deployed.mainChainAggregateUnlockBatch?.address;
  const aggregateApprovalContext: AggregateSettlementApprovalContext = {
    environment: deployed.network,
    ergoNodeNetwork: deployed.network,
    ergoNodeUrl: ERGO_CONFIG.nodeUrl,
    sidechainNetwork: SUBSTRATE_CONFIG.network,
    sidechainRpcUrl: SUBSTRATE_CONFIG.evmRpcUrl,
    sidechainWsUrl: SUBSTRATE_CONFIG.wsUrl,
    deployedStateHash,
  };
  {
    const ok = hasBatchDup && hasBatchUnlock;
    const c: PreflightCheck = {
      name: 'Batch contracts (deployed_state)',
      status: ok ? 'PASS' : 'FAIL',
      message: ok
        ? 'historical batchDUP + batchUnlock present for read-only inspection'
        : 'historical batch entries absent; legacy V1 deployment remains quarantined',
    };
    checks.push(c);
    console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
  }

  // 1c. Batch DUP UTXO
  if (ergoOnline && hasBatchDup) {
    const batchDup = deployed.doubleUnlockPreventionAggregateBatch;
    try {
      const box = await nget(`/utxo/byId/${batchDup.boxId}`);
      const hasNft = box?.assets?.some((a: any) => a.tokenId === batchDup.nftId && Number(a.amount) === 1);
      const c: PreflightCheck = {
        name: 'Batch DUP UTXO',
        status: hasNft ? 'PASS' : 'FAIL',
        message: hasNft ? `unspent, NFT confirmed` : `box spent or NFT missing`,
      };
      checks.push(c);
      console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
    } catch {
      const c: PreflightCheck = { name: 'Batch DUP UTXO', status: 'FAIL', message: 'not found (spent?)' };
      checks.push(c);
      console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
    }
  }

  // 1d. Liquidity
  if (ergoOnline && hasBatchUnlock) {
    try {
      const resp = await nget(`/blockchain/box/unspent/byAddress/${deployed.mainChainAggregateUnlockBatch.address}?offset=0&limit=100`);
      const pureErg = findPureErgBoxes(asBoxArray(resp));
      const liq = classifyLiquidityStatus(pureErg, UNLOCK_LIQUIDITY);
      const c: PreflightCheck = {
        name: 'Batch unlock liquidity',
        status: liq.status,
        message: `${formatNanoErg(liq.totalNanoErg)} across ${liq.boxCount} box(es)`,
      };
      checks.push(c);
      console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
    } catch {
      const c: PreflightCheck = { name: 'Batch unlock liquidity', status: 'WARN', message: 'query failed' };
      checks.push(c);
      console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
    }
  }

  // SECTION 2: Sidechain EVM
  console.log('\n-- Sidechain EVM ----------------------------------------');

  let evmOnline = false;
  try {
    const provider = new ethers.JsonRpcProvider(EVM_RPC_URL);
    const bn = await provider.getBlockNumber();
    evmOnline = true;
    const c: PreflightCheck = { name: 'Frontier EVM RPC', status: 'PASS', message: `block=${bn}` };
    checks.push(c);
    console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);

    const metadataCheck = classifyLegacyOwnerMintDeploymentMetadata(
      deployed.solidity,
    );
    checks.push(metadataCheck);
    console.log(
      `  ${statusPrefix[metadataCheck.status]} ${metadataCheck.name}: ${metadataCheck.message}`,
    );

    if (deployed.solidity?.sergAddress && deployed.solidity?.bridgeAddress) {
      for (const [label, addr] of [
        ['SERG', deployed.solidity.sergAddress],
        ['ErgoBridge', deployed.solidity.bridgeAddress],
      ] as const) {
        const code = await provider.getCode(addr);
        const c = classifyLegacyOwnerMintRuntimeCode({
          label: `${label} contract`,
          address: addr,
          code,
        });
        checks.push(c);
        console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
      }
    }
  } catch (err: any) {
    const c: PreflightCheck = { name: 'Frontier EVM RPC', status: 'FAIL', message: `unreachable at ${EVM_RPC_URL}` };
    checks.push(c);
    console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
  }

  // SECTION 3: Environment
  console.log('\n-- Environment ------------------------------------------');

  {
    try {
      const alignment = assertErgoNodeEndpointAlignment('Demo readiness', {
        ergoNode: NODE,
        ergoNodeUrl: ERGO_CONFIG.nodeUrl,
      });
      const c: PreflightCheck = {
        name: 'Ergo node endpoint alignment',
        status: 'PASS',
        message: `ERGO_NODE and ERGO_NODE_URL both resolve to ${alignment.ergoNodeOrigin}`,
      };
      checks.push(c);
      console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
    } catch (err: any) {
      const c: PreflightCheck = {
        name: 'Ergo node endpoint alignment',
        status: 'FAIL',
        message: err?.message ?? String(err),
      };
      checks.push(c);
      console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
    }
  }

  {
    const val = process.env.AGGREGATE_BATCH_ENABLED;
    const ok = val === 'true' || val === '1';
    const c: PreflightCheck = {
      name: 'AGGREGATE_BATCH_ENABLED',
      status: ok ? 'PASS' : 'WARN',
      message: ok ? 'enabled' : 'not set -- set in shell before running daemon',
    };
    checks.push(c);
    console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
  }
  {
    const val = process.env.AGGREGATE_SETTLEMENT_ENABLED;
    const ok = val === 'true' || val === '1';
    const c: PreflightCheck = {
      name: 'AGGREGATE_SETTLEMENT_ENABLED',
      status: ok ? 'PASS' : 'WARN',
      message: ok ? 'enabled' : 'not set -- set in shell before running daemon',
    };
    checks.push(c);
    console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
  }
  {
    const c = classifyLiveSettlementStartupReadiness({
      ...PROTOCOL_PARAMS,
      aggregateSettlementApprovalContext: aggregateApprovalContext,
    }, EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS);
    checks.push(c);
    console.log(`  ${statusPrefix[c.status]} ${c.name}: ${c.message}`);
  }

  console.log('\n-- Approval Evidence Context ----------------------------');
  console.log(`  environment:       ${aggregateApprovalContext.environment}`);
  console.log(`  ergoNodeNetwork:   ${aggregateApprovalContext.ergoNodeNetwork}`);
  console.log(`  ergoNodeUrl:       ${formatEvidenceUrl(aggregateApprovalContext.ergoNodeUrl ?? '')}`);
  console.log(`  helperNodeUrl:     ${formatEvidenceUrl(NODE)}`);
  console.log(`  sidechainNetwork:  ${aggregateApprovalContext.sidechainNetwork}`);
  console.log(`  sidechainRpcUrl:   ${formatEvidenceUrl(aggregateApprovalContext.sidechainRpcUrl ?? '')}`);
  console.log(`  sidechainWsUrl:    ${formatEvidenceUrl(aggregateApprovalContext.sidechainWsUrl ?? '')}`);
  console.log(`  deployedStateHash: ${aggregateApprovalContext.deployedStateHash}`);

  // Summary + Next Actions
  const signingCheck = checks.find(c => c.name === 'Live settlement signing');
  const signingBlocked = signingCheck?.status === 'FAIL';
  printSummary(checks, signingBlocked);
  process.exit(hasFailure(checks) ? 1 : 0);
}

function printSummary(checks: PreflightCheck[], signingBlocked: boolean): void {
  const fails = checks.filter(c => c.status === 'FAIL');
  const warns = checks.filter(c => c.status === 'WARN');

  console.log('\n===========================================================');
  if (fails.length > 0) {
    console.log(`  [FAIL] READINESS: ${fails.length} FAIL, ${warns.length} WARN`);
    console.log('===========================================================');
    console.log('\n  Fix these before running the live demo:');
    for (const f of fails) {
      console.log(`    [FAIL] ${f.name}: ${f.message}`);
    }
  } else {
    console.log(`  [PASS] READINESS: ALL PASS (${warns.length} WARN)`);
    console.log('===========================================================');
  }

  if (signingBlocked) {
    console.log('\n  Live settlement signing is blocked.');
    console.log('  Available actions while signing is blocked:');
    console.log('  --------------------------------------------------------');
    console.log('  1. Run offline showcase:      npm run showcase');
    console.log('  2. Run sharded lane demo:     npm run showcase:lanes');
    console.log('  3. Run bounded full check:    npm run check:bounded');
    console.log('  4. Run shard-router tests:    npm run test:bounded -- src/shard-router.test.ts');
    console.log('  5. Wait for upstream fix:     sigma-rust/JVM ContextExtension canonical serialization');
    console.log('');
    console.log('  Do NOT run the live settlement daemon until the signing blocker is resolved.');
  } else {
    console.log('\n  Next safe legacy V1 diagnostic actions:');
    console.log('  --------------------------------------------------------');
    console.log('  1. Inspect retained pre-quarantine evidence only; do not generate new V1 approvals');
    console.log('  2. Keep BRIDGE_BROADCAST_ENABLED=false and AGGREGATE_SETTLEMENT_ENABLED=false');
    console.log('  3. Legacy V1 signing, node-check, authorization, and transport are physically absent');
    console.log('  4. Keep single and batch preparation unsigned and diagnostic only:');
    console.log('       npm run settle:aggregate -- prepare <sidechainTxHash>');
    console.log('       npm run settle:aggregate -- prepare-batch <burn-a> <burn-b> [...]');
    console.log('       These diagnostics cannot sign, reach /transactions/check, authorize settlement, or close Gate 5');
    console.log('  5. Continue the separately versioned external-fee profile and legacy-route retirement');
    console.log('  6. Historical confirmation/recovery only: reconcile an exact transaction submitted before quarantine');
    console.log('  7. Monitor: npm run status');
    console.log('');
  }
}

async function main(): Promise<void> {
  if (isHelpRequested(process.argv)) {
    printUsage();
    return;
  }

  if (process.argv.includes(PUBLIC_BOUNDARY_FLAG)) {
    printPublicBoundaryReport();
    return;
  }

  const { ethers } = await import('ethers');
  const { nget, NODE } = await import('../ergo-helpers.js');
  const {
    computeDeployedStateHash,
    ERGO_CONFIG,
    loadDeployedState,
    PROTOCOL_PARAMS,
    SUBSTRATE_CONFIG,
  } = await import('../config.js');
  const {
    asBoxArray,
    findPureErgBoxes,
    formatNanoErg,
    classifyLiquidityStatus,
    classifySigningReadiness,
    resolveSigningReadinessBatchClaims,
    hasFailure,
  } = await import('../batch-demo-preflight.js');
  const { EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS } = await import('../context-extension-guard.js');
  const { classifyBroadcastReadiness } = await import('../broadcast-policy.js');
  const { classifyLiveSettlementStartupReadiness } = await import('../live-settlement-readiness.js');
  const {
    classifyLegacyOwnerMintDeploymentMetadata,
    classifyLegacyOwnerMintRuntimeCode,
  } = await import('../legacy-owner-mint-readiness.js');
  const { assertErgoNodeEndpointAlignment } = await import('../ergo-node-endpoint-alignment.js');

  await runDemoReadiness({
    ethers,
    nget,
    NODE,
    computeDeployedStateHash,
    ERGO_CONFIG,
    loadDeployedState,
    PROTOCOL_PARAMS,
    SUBSTRATE_CONFIG,
    asBoxArray,
    findPureErgBoxes,
    formatNanoErg,
    classifyLiquidityStatus,
    classifySigningReadiness,
    resolveSigningReadinessBatchClaims,
    hasFailure,
    EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS,
    classifyBroadcastReadiness,
    classifyLiveSettlementStartupReadiness,
    classifyLegacyOwnerMintDeploymentMetadata,
    classifyLegacyOwnerMintRuntimeCode,
    assertErgoNodeEndpointAlignment,
  });
}

main().catch((err) => {
  console.error('Readiness check crashed:', err);
  process.exit(1);
});
