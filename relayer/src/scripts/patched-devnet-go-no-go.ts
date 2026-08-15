/**
 * Patched Devnet Go/No-Go Checklist - combined preflight.
 *
 * Read-only. No .env loading. No signing. No DB writes. No deployment.
 * Checks all local prerequisites for a controlled patched-devnet e2e run.
 *
 * Exit 1: missing mandatory local files/scripts.
 * Exit 0: all mandatory checks pass (WARNs are allowed).
 *
 * Verdict wording:
 *   NO-GO                              -- missing mandatory prereqs
 *   LOCAL PREREQS OK - EXECUTION NOT READY -- files exist but live checks warn
 *   LOCAL PREREQS OK - VALUE EXECUTION DISABLED -- all local checks green
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import axios from 'axios';
import { ErgoHDKey } from '@fleet-sdk/wallet';
import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import {
  resolvePatchedNodeUrl,
  classifyErgoNodeEnv,
  type EnvBag,
} from '../patched-devnet-env.js';
import {
  pass,
  warn,
  fail,
  buildGoNoGoJsonReport,
  classifyRuntimeFile,
  classifyFinalVerdict,
  classifyPatchedDevnetPackageScripts,
  formatGoNoGoReport,
  runtimeStateInspectionSkipped,
  nodeConfigInspectionSkipped,
  type CheckResult,
} from '../patched-devnet-go-no-go.js';
import {
  classifyDeployReadiness,
  classifyNodeOffline as fundingNodeOffline,
  sumPureErgBalance,
  formatErg,
  DEVNET_MIN_FUNDING_NANOERG,
} from '../devnet-funding-preflight.js';
import {
  checkSignerAlignment,
} from '../devnet-signer-alignment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RELAYER_ROOT = resolve(__dirname, '..', '..');
const BRIDGE_ROOT = resolve(RELAYER_ROOT, '..');
const DEFAULT_CONFIG_REL = '.source-cache/ergo-node/src/main/resources/node1/application.conf';
const DEFAULT_ERGO_SOURCE_REL = '.source-cache/ergo-node';

interface CliArgs {
  help: boolean;
  includeSecretEnv: boolean;
  skipRuntimeStateChecks: boolean;
  ergoSourceRoot?: string;
  frontierBinary?: string;
  jsonOut?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false, includeSecretEnv: false, skipRuntimeStateChecks: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--include-secret-env') {
      args.includeSecretEnv = true;
    } else if (arg === '--skip-runtime-state-checks') {
      args.skipRuntimeStateChecks = true;
    } else if (arg === '--ergo-source-root') {
      index += 1;
      const value = argv[index];
      if (!value) throw new Error('--ergo-source-root requires a value');
      args.ergoSourceRoot = value;
    } else if (arg === '--frontier-binary') {
      index += 1;
      const value = argv[index];
      if (!value) throw new Error('--frontier-binary requires a value');
      args.frontierBinary = value;
    } else if (arg === '--json-out') {
      index += 1;
      const value = argv[index];
      if (!value) throw new Error('--json-out requires a value');
      args.jsonOut = value;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log([
    'Usage: npm run demo:patched-devnet:go-no-go -- [--json-out <report.json>] [--include-secret-env] [--skip-runtime-state-checks] [--ergo-source-root <path>] [--frontier-binary <path>]',
    '',
    'Read-only patched-devnet prerequisite diagnostic.',
    'Default mode does not read secret-bearing environment variables such as WALLET_MNEMONIC.',
    'Default mode does not read node application.conf because devnet configs can contain testMnemonic.',
    'Use --include-secret-env only for a local operator readiness check that needs funding/signer derivation.',
    'Use --skip-runtime-state-checks when deployment-state files, SQLite state, and backup directories must not be inspected.',
    'Use --ergo-source-root to check a source tree outside .source-cache/ergo-node without serializing the local path.',
    'Use --frontier-binary to check a Frontier binary outside substrate-node/target/release/frontier-template-node.exe without serializing the local path.',
    'Set PATCHED_ERGO_SOURCE_ROOT to check a source tree outside .source-cache/ergo-node without serializing the local path.',
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// Mandatory file/directory checks
// ---------------------------------------------------------------------------

function checkMandatoryPath(label: string, relPath: string): CheckResult {
  const abs = resolve(BRIDGE_ROOT, relPath);
  return existsSync(abs)
    ? pass(label, `found: ${relPath}`)
    : fail(label, `missing: ${relPath}`);
}

function checkConfiguredPath(label: string, configuredPath: string | undefined, fallbackRelPath: string): CheckResult {
  if (!configuredPath) return checkMandatoryPath(label, fallbackRelPath);
  return existsSync(configuredPath)
    ? pass(label, 'found at configured location')
    : fail(label, 'missing at configured location');
}

// ---------------------------------------------------------------------------
// Package.json script checks
// ---------------------------------------------------------------------------

function checkPackageScripts(): CheckResult[] {
  const pkgPath = resolve(RELAYER_ROOT, 'package.json');
  if (!existsSync(pkgPath)) {
    return [fail('package.json', `missing: ${pkgPath}`)];
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const scripts: Record<string, string> = pkg.scripts ?? {};
  return classifyPatchedDevnetPackageScripts(scripts);
}

// ---------------------------------------------------------------------------
// Env var alignment (live-execution check)
// ---------------------------------------------------------------------------

function checkEnvVars(): CheckResult {
  const env: EnvBag = {
    PATCHED_ERGO_NODE_URL: process.env.PATCHED_ERGO_NODE_URL,
    ERGO_NODE_URL: process.env.ERGO_NODE_URL,
    ERGO_NODE: process.env.ERGO_NODE,
  };
  const targetUrl = resolvePatchedNodeUrl(env);
  const classification = classifyErgoNodeEnv(env, targetUrl);
  return classification.status === 'PASS'
    ? pass('Ergo node env vars', classification.message, true)
    : warn('Ergo node env vars', classification.message, true);
}

// ---------------------------------------------------------------------------
// Network reachability (live-execution checks)
// ---------------------------------------------------------------------------

async function checkNodeOnline(label: string, url: string): Promise<CheckResult> {
  try {
    const resp = await axios.get(`${url}/info`, { timeout: 3000 });
    const height = resp.data?.fullHeight ?? resp.data?.headersHeight ?? '?';
    return pass(label, `online at ${url}, height=${height}`, true);
  } catch {
    return warn(label, `offline at ${url}`, true);
  }
}

async function checkFrontierOnline(): Promise<CheckResult> {
  const url = process.env.SUBSTRATE_EVM_URL ?? 'http://127.0.0.1:9945';
  try {
    const resp = await axios.post(
      url,
      { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 },
      { timeout: 3000 },
    );
    const blockNum = parseInt(resp.data?.result ?? '0x0', 16);
    return pass('Frontier sidechain', `online at ${url}, block=${blockNum}`, true);
  } catch {
    return warn('Frontier sidechain', `offline at ${url}`, true);
  }
}

// ---------------------------------------------------------------------------
// Runtime file dirty checks (actual git status)
// ---------------------------------------------------------------------------

const RUNTIME_FILES = [
  { label: 'contracts/deployed_state.json', path: resolve(BRIDGE_ROOT, 'contracts', 'deployed_state.json') },
  { label: 'relayer/bridge-state.sqlite', path: resolve(RELAYER_ROOT, 'bridge-state.sqlite') },
];

function isGitDirty(pathspec: string): boolean {
  try {
    const output = execSync(`git status --porcelain -- "${pathspec}"`, {
      cwd: BRIDGE_ROOT,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function checkRuntimeDirty(): CheckResult[] {
  return RUNTIME_FILES.map(f => {
    const exists = existsSync(f.path);
    const dirty = exists ? isGitDirty(f.label) : false;
    return classifyRuntimeFile(f.label, exists, dirty);
  });
}

// ---------------------------------------------------------------------------
// Backup checks (live-execution)
// ---------------------------------------------------------------------------

function checkBackups(): CheckResult {
  const backupDir = resolve(BRIDGE_ROOT, '.devnet-backups');
  if (!existsSync(backupDir)) {
    return warn('Devnet backups', '.devnet-backups/ directory does not exist', true);
  }

  let files: string[];
  try { files = readdirSync(backupDir); }
  catch { files = []; }

  const hasDeployedBak = files.some(f => f.includes('deployed_state') && f.endsWith('.bak'));
  const hasSqliteBak = files.some(f => f.includes('bridge-state') && f.endsWith('.bak'));

  if (hasDeployedBak && hasSqliteBak) {
    return pass('Devnet backups', '.devnet-backups/ has deployed_state + sqlite backups', true);
  }
  const missing = [];
  if (!hasDeployedBak) missing.push('deployed_state');
  if (!hasSqliteBak) missing.push('bridge-state');
  return warn('Devnet backups', `missing backup(s): ${missing.join(', ')}`, true);
}

// ---------------------------------------------------------------------------
// Funding check (live-execution, conditional on node being online)
// ---------------------------------------------------------------------------

async function checkFunding(nodeUrl: string, includeSecretEnv: boolean): Promise<CheckResult> {
  if (!includeSecretEnv) {
    return warn('Relayer funding', 'secret env inspection disabled -- pass --include-secret-env for balance check', true);
  }

  // Try to derive address without printing secrets
  const mnemonic = process.env.WALLET_MNEMONIC?.trim();
  if (!mnemonic) {
    return warn('Relayer funding', 'WALLET_MNEMONIC not set -- cannot check balance', true);
  }

  let address: string;
  let pubKeyHex: string;
  try {
    const masterKey = await ErgoHDKey.fromMnemonic(mnemonic);
    const childKey = masterKey.deriveChild(0);
    const networkPrefix = parseInt(process.env.ERGO_NETWORK_PREFIX ?? '16', 10);
    address = childKey.address.toString(networkPrefix);
    pubKeyHex = Buffer.from(childKey.publicKey).toString('hex');
  } catch (err: any) {
    return warn('Relayer funding', `cannot derive address: ${err.message}`, true);
  }

  try {
    // Query P2PK balance
    const resp = await axios.get(
      `${nodeUrl}/blockchain/box/unspent/byAddress/${address}?offset=0&limit=100`,
      { timeout: 5000 },
    );
    let p2pkBalance = 0n;
    if (Array.isArray(resp.data)) {
      p2pkBalance = sumPureErgBalance(resp.data);
    }

    // Query mining reward balance (time-locked rewardOutputScript boxes)
    let rewardBalance = 0n;
    try {
      const headersResp = await axios.get(`${nodeUrl}/blocks/lastHeaders/1`, { timeout: 5000 });
      if (Array.isArray(headersResp.data) && headersResp.data.length > 0) {
        const blockId = headersResp.data[0].id;
        const blockResp = await axios.get(`${nodeUrl}/blocks/${blockId}`, { timeout: 5000 });
        const txs = blockResp.data?.blockTransactions?.transactions;
        if (Array.isArray(txs) && txs.length > 0) {
          const rewardOutput = txs[0]?.outputs?.[1];
          if (rewardOutput?.ergoTree?.includes(pubKeyHex)) {
            const addrResp = await axios.get(
              `${nodeUrl}/utils/ergoTreeToAddress/${rewardOutput.ergoTree}`,
              { timeout: 5000 },
            );
            const rewardAddress = addrResp.data?.address;
            if (rewardAddress) {
              const boxResp = await axios.get(
                `${nodeUrl}/blockchain/box/unspent/byAddress/${rewardAddress}?offset=0&limit=100`,
                { timeout: 5000 },
              );
              if (Array.isArray(boxResp.data)) {
                rewardBalance = sumPureErgBalance(boxResp.data);
              }
            }
          }
        }
      }
    } catch { /* reward query is best-effort */ }

    // Use deploy readiness classifier (P2PK-specific)
    const result = classifyDeployReadiness(p2pkBalance, rewardBalance);
    return result.status === 'PASS'
      ? pass(result.label, result.detail, true)
      : warn(result.label, result.detail, true);
  } catch {
    return warn('Deploy readiness', `failed to query balance at ${nodeUrl}`, true);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (args.jsonOut) {
    const jsonOutputTarget = resolveEvidenceJsonOutputPath(args.jsonOut);
    if (jsonOutputTarget.errors.length > 0) {
      for (const error of jsonOutputTarget.errors) console.error(error);
      process.exit(1);
    }
  }

  const results: CheckResult[] = [];

  // Mandatory local paths
  const ergoSourceRoot = args.ergoSourceRoot ?? process.env.PATCHED_ERGO_SOURCE_ROOT;
  results.push(checkConfiguredPath('ergo-source', ergoSourceRoot, DEFAULT_ERGO_SOURCE_REL));
  results.push(checkMandatoryPath('run-patched-ergo-devnet.ps1', 'scripts/run-patched-ergo-devnet.ps1'));
  results.push(checkMandatoryPath('start-substrate.bat', 'start-substrate.bat'));
  // Frontier binary (absolute path)
  const frontierPath = args.frontierBinary
    ?? process.env.FRONTIER_TEMPLATE_NODE_PATH
    ?? resolve(BRIDGE_ROOT, 'substrate-node', 'target', 'release', 'frontier-template-node.exe');
  results.push(
    existsSync(frontierPath)
      ? pass('frontier-template-node.exe', 'found at configured default frontier binary location')
      : fail('frontier-template-node.exe', 'missing at configured default frontier binary location'),
  );

  // Package scripts
  results.push(...checkPackageScripts());

  if (!args.includeSecretEnv) {
    results.push(warn(
      'Secret env inspection',
      'disabled by default; funding and signer derivation are skipped unless --include-secret-env is set',
      true,
    ));
  }

  // Env vars (live-execution)
  results.push(checkEnvVars());

  // Network (live-execution)
  const env: EnvBag = {
    PATCHED_ERGO_NODE_URL: process.env.PATCHED_ERGO_NODE_URL,
    ERGO_NODE_URL: process.env.ERGO_NODE_URL,
    ERGO_NODE: process.env.ERGO_NODE,
  };
  const patchedUrl = resolvePatchedNodeUrl(env);
  results.push(await checkNodeOnline('Patched Ergo devnet', patchedUrl));
  results.push(await checkFrontierOnline());

  // Runtime state (live-execution)
  if (args.skipRuntimeStateChecks) {
    results.push(runtimeStateInspectionSkipped());
  } else {
    results.push(...checkRuntimeDirty());
    results.push(checkBackups());
  }

  // Funding check (live-execution, only if node is online)
  const ergoNodeResult = results.find(r => r.label === 'Patched Ergo devnet');
  const nodeIsOnline = ergoNodeResult?.status === 'PASS';
  if (nodeIsOnline) {
    results.push(await checkFunding(patchedUrl, args.includeSecretEnv));
  } else {
    results.push(warn('Relayer funding', 'skipped -- node offline', true));
  }

  // Signer / mining target alignment check (live-execution)
  const configPath = process.env.PATCHED_DEVNET_NODE_CONFIG
    ?? (ergoSourceRoot
      ? resolve(ergoSourceRoot, 'src', 'main', 'resources', 'node1', 'application.conf')
      : resolve(BRIDGE_ROOT, DEFAULT_CONFIG_REL));
  let configContent: string | null = null;
  if (args.includeSecretEnv && existsSync(configPath)) {
    configContent = readFileSync(configPath, 'utf-8');
  }
  const relayerMnemonic = args.includeSecretEnv
    ? process.env.WALLET_MNEMONIC?.trim() || null
    : null;
  const networkPrefix = parseInt(process.env.ERGO_NETWORK_PREFIX ?? '16', 10);
  const miningTarget = process.env.DEVNET_MINING_TARGET?.trim() || null;
  const fleetMiningAddress = process.env.DEVNET_FLEET_ADDRESS?.trim() || null;
  if (!args.includeSecretEnv) {
    results.push(nodeConfigInspectionSkipped());
  } else {
    const alignResult = await checkSignerAlignment(configContent, configPath, relayerMnemonic, networkPrefix, miningTarget, fleetMiningAddress);

    // Mining target alignment (the important check)
    if (alignResult.miningTargetAlignment) {
      const mt = alignResult.miningTargetAlignment;
      results.push(
        mt.status === 'PASS'
          ? pass(mt.label, mt.detail, true)
          : warn(mt.label, mt.detail, true),
      );
    } else {
      results.push(warn('Devnet mining target', 'DEVNET_MINING_TARGET not set -- mining rewards may not reach Fleet signer', true));
    }

    // Config-only alignment (secondary diagnostic)
    const alignCheck = alignResult.alignment;
    results.push(
      alignCheck.status === 'PASS'
        ? pass(alignCheck.label, alignCheck.detail, true)
        : warn(alignCheck.label, alignCheck.detail, true),
    );
  }

  // Print report via pure formatter
  const report = formatGoNoGoReport(results);
  console.log(report);

  if (args.jsonOut) {
    const output = writeOfflineReportJson(args.jsonOut, buildGoNoGoJsonReport(results, {
      secretEnvInspection: args.includeSecretEnv ? 'enabled' : 'disabled',
      nodeConfigInspection: args.includeSecretEnv ? 'enabled' : 'disabled',
      runtimeStateInspection: args.skipRuntimeStateChecks ? 'skipped' : 'inspected',
    }));
    if (output.errors.length > 0) {
      for (const error of output.errors) console.error(error);
      process.exit(1);
    }
    console.log(formatOfflineReportJsonWriteLine('go/no-go JSON report', args.jsonOut));
  }

  // Exit
  const verdict = classifyFinalVerdict(results);
  process.exit(verdict.exitCode);
}

main().catch((err: any) => {
  console.error(`Go/No-Go error: ${err.message ?? err}`);
  process.exit(1);
});
