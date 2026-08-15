/**
 * Patched Devnet Readiness — check local prerequisites for the controlled e2e.
 *
 * No .env loading. No signing. No DB writes. No mutations.
 * Uses process.env for config (set in shell if needed).
 *
 * Checks:
 *   - ergo-source directory exists
 *   - run-patched-ergo-devnet.ps1 exists
 *   - sbt executable likely exists
 *   - java is available
 *   - ERGO_NODE / ERGO_NODE_URL alignment with target patched node
 *   - patched devnet node reachable (WARN if offline)
 *   - /info endpoint reports height/network
 *
 * Exit 0 if only PASS/WARN, exit 1 if any FAIL (missing local files).
 */

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import axios from 'axios';
import { formatPreflightReport, type PreflightCheck } from '../batch-demo-preflight.js';
import { inspectConsensusSourceBaseline } from '../consensus-source-baseline.js';
import { resolvePatchedNodeUrl, classifyErgoNodeEnv } from '../patched-devnet-env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(__dirname, '..', '..', '..');
const WORKTREE_ROOT = resolve(BRIDGE_ROOT, '..');

const ERGO_SOURCE_DIR = process.env.PATCHED_ERGO_SOURCE_DIR
  ?? resolve(BRIDGE_ROOT, '.source-cache', 'ergo-node');
const DEVNET_SCRIPT = process.env.PATCHED_ERGO_DEVNET_SCRIPT
  ?? resolve(BRIDGE_ROOT, 'scripts', 'run-patched-ergo-devnet.ps1');

// Resolve the target patched node URL using env precedence
const patchedNodeUrl = resolvePatchedNodeUrl(process.env);

async function main(): Promise<void> {
  const checks: PreflightCheck[] = [];

  const sourceBaseline = inspectConsensusSourceBaseline({
    worktreeRoot: WORKTREE_ROOT,
    bridgeRoot: BRIDGE_ROOT,
    frontierSourcePath: resolve(BRIDGE_ROOT, 'substrate-node'),
    ergoSourcePath: ERGO_SOURCE_DIR,
    requireFrontierCheckout: true,
    requireErgoCheckout: true,
  });
  checks.push({
    name: 'Consensus source baseline',
    status: sourceBaseline.status === 'PASS' ? 'PASS' : 'FAIL',
    message: sourceBaseline.status === 'PASS'
      ? 'Patched Frontier and Ergo sources match the tracked source lock'
      : sourceBaseline.errors.join('; '),
  });

  // ── 1. ergo-source directory ────────────────────────────────────
  if (existsSync(ERGO_SOURCE_DIR)) {
    checks.push({
      name: 'ergo-source directory',
      status: 'PASS',
      message: ERGO_SOURCE_DIR,
    });
  } else {
    checks.push({
      name: 'ergo-source directory',
      status: 'FAIL',
      message: `not found: ${ERGO_SOURCE_DIR}`,
    });
  }

  // ── 2. run-patched-ergo-devnet.ps1 ─────────────────────────────
  if (existsSync(DEVNET_SCRIPT)) {
    checks.push({
      name: 'Devnet launcher script',
      status: 'PASS',
      message: DEVNET_SCRIPT,
    });
  } else {
    checks.push({
      name: 'Devnet launcher script',
      status: 'FAIL',
      message: `not found: ${DEVNET_SCRIPT}`,
    });
  }

  // ── 3. sbt ─────────────────────────────────────────────────────
  try {
    const sbtVersion = execSync('sbt --script-version', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    checks.push({
      name: 'sbt build tool',
      status: 'PASS',
      message: sbtVersion ? `sbt ${sbtVersion}` : 'sbt available on PATH',
    });
  } catch {
    checks.push({
      name: 'sbt build tool',
      status: 'WARN',
      message: 'sbt not found on PATH',
    });
  }

  // ── 4. java ────────────────────────────────────────────────────
  try {
    const javaVersion = execSync('java -version 2>&1', { encoding: 'utf-8', timeout: 5000 });
    const firstLine = javaVersion.trim().split('\n')[0];
    checks.push({
      name: 'Java runtime',
      status: 'PASS',
      message: firstLine,
    });
  } catch {
    checks.push({
      name: 'Java runtime',
      status: 'WARN',
      message: 'java not found on PATH',
    });
  }

  // ── 5. Env var alignment ───────────────────────────────────────
  const envResult = classifyErgoNodeEnv(process.env, patchedNodeUrl);
  checks.push({
    name: 'Ergo node env vars',
    status: envResult.status,
    message: envResult.message,
  });

  // ── 6. Patched devnet node reachable ───────────────────────────
  try {
    const { data } = await axios.get(`${patchedNodeUrl}/info`, { timeout: 3000 });
    const height = data?.fullHeight ?? data?.headersHeight ?? '?';
    const network = data?.network ?? '?';
    checks.push({
      name: `Patched devnet node (${patchedNodeUrl})`,
      status: 'PASS',
      message: `online, network=${network}, height=${height}`,
    });
  } catch {
    checks.push({
      name: `Patched devnet node (${patchedNodeUrl})`,
      status: 'WARN',
      message: 'offline - start with: .\\scripts\\run-patched-ergo-devnet.ps1 ' +
        '-ExtensionFields "0401:<bridgeEventRootHex>" ' +
        '-MiningTarget "<compressed-mining-pubkey-hex>"',
    });
  }

  // ── 7. Report ──────────────────────────────────────────────────
  console.log(formatPreflightReport(checks, 'Patched Devnet Readiness'));

  const hasFail = checks.some(c => c.status === 'FAIL');
  process.exit(hasFail ? 1 : 0);
}

main().catch((err: any) => {
  console.error(`Patched devnet readiness error: ${err.message ?? err}`);
  process.exit(1);
});
