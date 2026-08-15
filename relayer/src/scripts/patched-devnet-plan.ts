/**
 * Patched Devnet Plan - prints the bounded diagnostic runbook.
 *
 * No .env loading. No mutations. No signing.
 * Just prints the operator's step-by-step diagnostic plan with exact commands.
 *
 * "Bridge root" means the ergo-sidechain-bridge directory.
 *
 * Two-phase bootstrap:
 *   Phase 1: Start patched devnet with dummy 0401 and prepare an existing burn observation.
 *   Phase 2: Explicitly resume the named isolated devnet with the real root.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath, validateEvidenceOutputPath } from '../evidence-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';

const SEP = '='.repeat(70);
const THIN = '-'.repeat(70);

interface CliArgs {
  executionRequest?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

interface PatchedDevnetPlanReport {
  status: 'PATCHED_DEVNET_PLAN_READY';
  exitCode: 0;
  command: string;
  patchedNodeUrl: string;
  stepCount: number;
  stepTitles: string[];
  evidenceTargetsToProduce: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

const usage = [
  'Usage: npm run demo:patched-devnet:plan -- [--execution-request <gate3-request.md>] [--out <plan.md>] [--json-out <plan.json>]',
  'Prints the ordered patched-devnet diagnostic runbook and can write guarded plan artifacts.',
  'This command does not read .env files, mnemonics, node config secrets, runtime databases, deployment state, wallet material, or execute node/RPC probes.',
  'Boundary: plan output is not Gate 3 closure, signing or broadcast authorization, release-gate PASS, or a production-ready/testnet production-candidate claim.',
];

function step(n: number, title: string, commands: string[], notes?: string[]): void {
  console.log(`\n${SEP}`);
  console.log(`  Step ${n} - ${title}`);
  console.log(SEP);
  for (const cmd of commands) {
    console.log(cmd === '' ? '  >' : `  > ${cmd}`);
  }
  if (notes) {
    console.log('');
    for (const note of notes) {
      console.log(`  WARN: ${note}`);
    }
  }
}

function main(): void {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error: any) {
    console.error(error?.message ?? String(error));
    console.error(usage.join('\n'));
    process.exit(1);
  }

  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }

  const executionRequestTarget = args.executionRequest
    ?? '../evidence/rehearsal/gate3-local-devnet-execution-request.md';
  const executionRequestErrors = validateEvidenceOutputPath(executionRequestTarget, {
    optionName: '--execution-request',
  });
  if (executionRequestErrors.length > 0) {
    for (const error of executionRequestErrors) console.error(error);
    process.exit(1);
  }

  const PATCHED_NODE_URL = process.env.PATCHED_ERGO_NODE_URL ?? 'http://127.0.0.1:9051';
  const originalLog = console.log.bind(console);
  const emittedLines: string[] = [];
  console.log = (...values: unknown[]) => {
    emittedLines.push(values.map(formatLogValue).join(' '));
    originalLog(...values);
  };

  console.log(SEP);
  console.log('  Patched Devnet V1 Diagnostic - Command Plan');
  console.log(SEP);
  console.log('');
  console.log('This plan prints exact commands for bounded patched-devnet diagnostics.');
  console.log('Legacy V1 signing, node checking, submission, and broadcast are retired.');
  console.log('Do NOT execute these commands blindly. Review each step.');
  console.log(`Target patched node: ${PATCHED_NODE_URL}`);
  console.log('');
  console.log('"Bridge root" = the ergo-sidechain-bridge directory.');

  // -- env var warning --
  console.log('');
  console.log(THIN);
  console.log('  ENV VAR WARNING');
  console.log('');
  console.log('  Two separate env vars control Ergo node URL:');
  console.log('    ERGO_NODE     - used by ergo-helpers.ts (deploy, e2e scripts)');
  console.log('    ERGO_NODE_URL - used by config.ts -> ErgoClient (daemon, preflight)');
  console.log('');
  console.log('  Set BOTH to the patched devnet URL for the bounded diagnostic flow.');
  console.log(THIN);

  // -- two-phase bootstrap notice --
  console.log('');
  console.log(THIN);
  console.log('  TWO-PHASE BOOTSTRAP');
  console.log('');
  console.log('  The patched devnet injects a fixed 0x0401 value into every mined block.');
  console.log('  But the real bridge event root depends on the sidechain burn TX,');
  console.log('  which requires an online Ergo node with deployed contracts.');
  console.log('');
  console.log('  Phase 1: Start with dummy 0401 and select an existing burn observation.');
  console.log('  Phase 2: Restart with real 0401 and prepare an unsigned diagnostic.');
  console.log('');
  console.log('  The launcher creates a fresh isolated session by default.');
  console.log('  Phase 2 requires the same named DataDir plus ResumeExistingDataDir.');
  console.log(THIN);

  // ==================== PHASE 1 ====================

  console.log(`\n${SEP}`);
  console.log('  PHASE 1 -- Bootstrap (dummy 0401)');
  console.log(SEP);

  step(1, 'Start Frontier sidechain (ephemeral)', [
    '# From bridge root:',
    '.\\start-substrate.bat',
  ], [
    'Uses --dev --tmp. State does not persist between runs.',
    'Wait for block production to begin before continuing.',
  ]);

  step(2, 'Set env vars for patched devnet', [
    `$env:ERGO_NODE = "${PATCHED_NODE_URL}"`,
    `$env:ERGO_NODE_URL = "${PATCHED_NODE_URL}"`,
    '$env:ERGO_API_KEY = "<operator-local-devnet-api-key-not-for-evidence>"',
    '$env:PATCHED_STACK_MODE = "true"',
    '$env:AGGREGATE_ANCHOR_MIN_CONFIRMATIONS = "1"',
    '$env:AGGREGATE_ANCHOR_LOOKBACK_BLOCKS = "100"',
    '$env:AGGREGATE_BATCH_ENABLED = "true"',
  ], [
    'ERGO_NODE is for deploy scripts (ergo-helpers.ts).',
    'ERGO_NODE_URL is for daemon/preflight (config.ts -> ErgoClient).',
    'Both MUST be set to the same loopback origin -- guard validates both.',
    'Keep ERGO_API_KEY scoped to the private operator shell and do not serialize its value into evidence.',
    'PATCHED_STACK_MODE=true raises the ContextExtension guard to 128.',
    'No environment flag can restore removed legacy V1 signing or transport.',
    '  Guard requires both URLs to be loopback and same origin.',
    '  Will THROW at startup if either URL is remote, missing, or mismatched.',
    '  Only valid on a local devnet node built from sigmastate-interpreter #1122.',
    'Lowered confirmations for fast devnet iteration.',
  ]);

  step(3, 'Start patched Ergo devnet with DUMMY extension', [
    '# From bridge root (separate terminal):',
    '.\\scripts\\run-patched-ergo-devnet.ps1 -ExtensionFields "0401:' + '0'.repeat(64) +
      '" -MiningTarget "<compressed-mining-pubkey-hex>" ' +
      '-DataDir "node1-phase011b-<session-id>"',
  ], [
    `Starts patched node on ${PATCHED_NODE_URL} (default devnet port).`,
    'Uses a dummy 0401 value (64 zero hex) -- this is intentional.',
    'Record the exact named DataDir for the explicit Phase 2 resume.',
    'The real bridge event root will be injected after trigger in Phase 2.',
    'Wait for the node to start mining (SBT + JVM warmup 1-2 min).',
  ]);

  step(3.5, 'Validate frozen TX byte conformance (GATE)', [
    '# All commands assume cwd = bridge root (ergo-sidechain-bridge).',
    '',
    '# 1. sigma-rust extractor (output: _frozen_sigma_rust_bytes.hex):',
    'Push-Location relayer/.devnet-diagnostics/tx-bytes-extractor',
    'cargo run -- ../_frozen_unsigned_tx.json ../_frozen_sigma_rust_bytes.hex',
    'Pop-Location',
    '',
    '# 2. Patched JVM extractor (output: _frozen_jvm_bytes.hex):',
    '# First update jvm-bytes-extractor/build.sbt: "sigma-state" % "6.0.3-SNAPSHOT"',
    'Push-Location relayer/.devnet-diagnostics/jvm-bytes-extractor',
    'sbt "run ../_frozen_unsigned_tx.json ../_frozen_jvm_bytes.hex"',
    'Pop-Location',
    '',
    '# 3. Compare (defaults to _frozen_jvm_bytes.hex + _frozen_sigma_rust_bytes.hex):',
    'npx tsx relayer/.devnet-diagnostics/validate-patched-stack.ts',
  ], [
    'Push-Location / Pop-Location ensures each block returns to bridge root.',
    'Both extractors MUST produce identical bytesToSign hex and TX ID.',
    'If they differ: STOP. The patched JVM does not match sigma-rust.',
    'This uses frozen diagnostics only -- NOT live boxes.',
    'Do NOT skip this gate.',
  ]);

  step(4, 'Fund relayer wallet on devnet', [
    '# Funding is automatic if WALLET_MNEMONIC matches the testMnemonic.',
    '# Safe default checks do not read mnemonic or node config material:',
    'npm.cmd run demo:devnet:signer',
    'npm.cmd run demo:devnet:funding',
    '',
    '# Public address balance check without secret material:',
    'npm.cmd run demo:devnet:funding -- --address <relayer-address>',
    '',
    '# Operator-local secret-material checks, only in a scoped private shell:',
    'npm.cmd run demo:devnet:signer -- --include-secret-material',
    'npm.cmd run demo:devnet:funding -- --include-secret-material',
    '',
    '# Convert redacted signer/funding outputs into guarded Gate 3 summary artifacts:',
    `npm.cmd run rehearsal:local-devnet-signer-funding-summary -- --source-commit <current-commit> --execution-request ${executionRequestTarget} --signer-output ../evidence/live-rehearsals/<redacted-signer-output.md> --funding-output ../evidence/live-rehearsals/<redacted-funding-output.md> --signer-command "npm run demo:devnet:signer -- --include-secret-material" --funding-command "npm run demo:devnet:funding -- --address <relayer-address>" --secret-material-scope "scoped private local operator shell; no values serialized" --out ../evidence/live-rehearsals/<local-devnet-signer-funding-summary.md> --json-out ../evidence/live-rehearsals/<local-devnet-signer-funding-summary.json>`,
  ], [
    'The relayer wallet address is derived from WALLET_MNEMONIC.',
    'Devnet has a separate UTXO set - testnet funds are not available.',
    'If signer alignment is PASS, mining rewards fund the relayer directly.',
    'Default signer/funding commands now return no-secret blocked summaries unless an address or explicit local opt-in is provided.',
    'The Gate 3 summary command consumes only redacted Markdown outputs and must not receive secret values, raw node config, runtime databases, or deployment state.',
    'Do not use node-wallet signing in this workflow.',
  ]);

  step(5, 'Preserve the legacy deployment quarantine', [
    '# No legacy aggregate deployment or funding command exists.',
  ], [
    'Use only pre-existing non-production historical boxes for read-only inspection.',
    'Do not recreate SPVTracker, aggregate DUP, or aggregate unlock V1 instances.',
  ]);

  step(6, 'Use an existing non-production Frontier observation', [
    '# No EVM deployment command is emitted by this diagnostic plan.',
  ], [
    'Deploying only EVM contracts cannot create mint or payout authority.',
    'Use an existing reviewed non-production observation or stop.',
  ]);

  step(7, 'Select an already-recorded peg-out burn', [
    '# No mutation command is emitted; use an existing non-production burn observation.',
  ], [
    'The former E2E trigger command is removed from this runner.',
    'Do not create a burn, mint, deployment, or runtime mutation from this plan.',
    'Provide the sidechainTxHash of an already-recorded diagnostic observation for the next step.',
  ]);

  step(8, 'Derive anchor extension field value', [
    'npm.cmd run e2e:aggregate -- anchor-env <sidechainTxHash>',
  ], [
    'Prints: ERGO_SIDECHAIN_EXTENSION_FIELDS=0401:<bridgeEventRootHex>',
    'Copy the <bridgeEventRootHex> (or full 0401:<hex>) for Phase 2.',
    'Requires Frontier sidechain to be running (reads EVM receipt).',
  ]);

  // ==================== PHASE 2 ====================

  console.log(`\n${SEP}`);
  console.log('  PHASE 2 -- Restart with real 0401 and inspect unsigned settlement shape');
  console.log(SEP);

  step(9, 'Stop patched Ergo devnet', [
    '# Ctrl+C in the SBT terminal running the patched node.',
  ], [
    'Keep the exact Phase 1 DataDir name.',
    'Do not substitute a legacy or unrelated node directory.',
  ]);

  step(10, 'Restart patched Ergo devnet with REAL extension', [
    '# From bridge root (separate terminal):',
    '.\\scripts\\run-patched-ergo-devnet.ps1 -ExtensionFields "0401:<bridgeEventRootHex>" ' +
      '-MiningTarget "<compressed-mining-pubkey-hex>" ' +
      '-DataDir "node1-phase011b-<session-id>" -ResumeExistingDataDir',
  ], [
    'Now injecting the real bridge event root into every mined block.',
    'Wait for 2+ blocks to be mined before running anchor preflight.',
  ]);

  step(11, 'Run readiness checks', [
    'npm.cmd run demo:devnet:safety',
    'npm.cmd run demo:sidechain:preflight',
    'npm.cmd run demo:patched-devnet:readiness',
    'npm.cmd run demo:anchor:preflight -- <bridgeEventRootHex>',
    '# Or: npm.cmd run demo:anchor:preflight -- 0401:<bridgeEventRootHex>',
    'npm.cmd run demo:readiness',
  ], [
    'demo:anchor:preflight must be root-bound with raw hex or full 0401:<hex> pair for readiness.',
    'A bare anchor scan requires --allow-generic-anchor-scan, is diagnostic only, and exits non-zero for readiness.',
    'demo:sidechain:preflight verifies Frontier is still online.',
  ]);

  step(12, 'Build unsigned aggregate settlement diagnostic', [
    '# Build a fresh unsigned diagnostic from live devnet boxes:',
    'npm.cmd run e2e:aggregate -- prepare <sidechainTxHash>',
  ], [
    'Builds a fresh unsigned V1 diagnostic from live devnet boxes.',
    'Does not sign, call /transactions/check, submit, or broadcast.',
    'The legacy V1 route remains retired because its miner fee reduces protected backing.',
  ]);

  step(13, 'Stop at the legacy V1 retirement boundary', [
    '# No legacy V1 signing, node-check, submission, or broadcast command exists.',
  ], [
    'Do not recreate the removed route through a script, signer, node API, or manual transport.',
    'Continue only with an activated external-fee replacement profile and its exact target-node acceptance evidence.',
  ]);

  step(14, 'Historical reconciliation only', [
    '# For a transaction submitted before retirement only:',
    'npm.cmd run e2e:aggregate -- confirm <sidechainTxHash> <historicalSettlementTxId> <ergoAnchorHeight>',
  ], [
    'Reconciles local state with an already-submitted historical settlement.',
    'Does not create, sign, check, submit, or broadcast a new V1 payout.',
    'bridge-state.sqlite will contain devnet-specific data - do NOT commit.',
  ]);

  console.log(`\n${SEP}`);
  console.log('  Plan complete. Review each step before executing.');
  console.log(SEP);
  console.log('');
  console.log('Post-run cleanup:');
  console.log('  - Do NOT commit contracts/deployed_state.json (devnet deployment)');
  console.log('  - Do NOT commit relayer/bridge-state.sqlite (devnet runtime state)');
  console.log('  - To restore testnet config: unset ERGO_NODE, unset ERGO_NODE_URL');
  console.log('  - Run: . .\\relayer\\scripts\\clear-devnet-session-env.ps1');
  console.log('');

  console.log = originalLog;
  const markdown = `${emittedLines.join('\n').trimEnd()}\n`;
  writeMarkdownReport(args.out, markdown);
  writeJsonReport(args.jsonOut, buildPatchedDevnetPlanReport({
    command: buildPatchedDevnetPlanCommand(args),
    markdown,
    patchedNodeUrl: PATCHED_NODE_URL,
  }));
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--execution-request') {
      args.executionRequest = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--out') {
      args.out = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--json-out') {
      args.jsonOut = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function buildPatchedDevnetPlanCommand(args: CliArgs): string {
  const parts = ['npm run demo:patched-devnet:plan --'];
  if (args.executionRequest) parts.push('--execution-request <gate3-request.md>');
  if (args.out) parts.push('--out <plan.md>');
  if (args.jsonOut) parts.push('--json-out <plan.json>');
  return parts.join(' ');
}

function buildPatchedDevnetPlanReport(input: {
  command: string;
  markdown: string;
  patchedNodeUrl: string;
}): PatchedDevnetPlanReport {
  const stepTitles = extractStepTitles(input.markdown);
  return {
    status: 'PATCHED_DEVNET_PLAN_READY',
    exitCode: 0,
    command: input.command,
    patchedNodeUrl: input.patchedNodeUrl,
    stepCount: stepTitles.length,
    stepTitles,
    evidenceTargetsToProduce: [
      '../evidence/live-rehearsals/<redacted-signer-output.md>',
      '../evidence/live-rehearsals/<redacted-funding-output.md>',
      '../evidence/live-rehearsals/<local-devnet-signer-funding-summary.md>',
      '../evidence/live-rehearsals/<local-devnet-signer-funding-summary.json>',
      '../evidence/live-rehearsals/<completed-local-devnet-rehearsal.md>',
    ],
    boundary: {
      'Plan output only': 'yes',
      'Secret or environment file read': 'no',
      'Wallet recovery material or private key read': 'no',
      'Node config secret read': 'no',
      'Runtime database opened': 'no',
      'Deployment state opened': 'no',
      'Live node probe executed': 'no',
      'Transaction signing performed': 'no',
      'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'no',
      'Gate 3 lifecycle evidence claimed complete': 'no',
      'Release gate PASS claimed': 'no',
      'Production-ready claim allowed': 'no',
      'Testnet production-candidate claim allowed': 'no',
    },
  };
}

function extractStepTitles(markdown: string): string[] {
  return [...markdown.matchAll(/^\s+Step\s+[\d.]+\s+-\s+(.+)$/gm)]
    .map(match => match[1].trim());
}

function writeMarkdownReport(out: string | undefined, markdown: string): void {
  if (!out) return;
  const resolved = resolveEvidenceOutputPath(out);
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, markdown, { encoding: 'utf8', flag: 'wx' });
}

function writeJsonReport(jsonOut: string | undefined, report: PatchedDevnetPlanReport): void {
  if (!jsonOut) return;
  const output = writeOfflineReportJson(jsonOut, report);
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exit(1);
  }
  console.log(formatOfflineReportJsonWriteLine('patched devnet plan JSON report', jsonOut));
}

function formatLogValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

main();
