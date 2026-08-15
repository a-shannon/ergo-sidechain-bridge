/**
 * Sidechain Demo Preflight — read-only EVM/Frontier readiness check.
 *
 * Validates that the sidechain side of the live batch demo is operational:
 *   1. EVM/Frontier JSON-RPC is reachable
 *   2. deployed_state.json has solidity contract addresses
 *   3. EVM contracts have code deployed at their addresses
 *   4. Current sidechain block number
 *
 * This script does NOT load .env, sign, submit, or modify any state.
 *
 * Usage:
 *   npm run demo:sidechain:preflight
 *
 * Exit code:
 *   0 = all PASS/WARN
 *   1 = at least one FAIL
 */

import {
  hasFailure,
  formatPreflightReport,
  type PreflightCheck,
} from '../batch-demo-preflight.js';
import {
  classifyLegacyOwnerMintDeploymentMetadata,
  classifyLegacyOwnerMintRuntimeCode,
} from '../legacy-owner-mint-readiness.js';

const HELP_FLAGS = new Set(['--help', '-h']);

type EvmProvider = {
  getBlockNumber(): Promise<number>;
  getCode(address: string): Promise<string>;
};

function isHelpRequested(argv: string[]): boolean {
  return argv.some(arg => HELP_FLAGS.has(arg));
}

function printUsage(): void {
  console.log('Usage: npm run demo:sidechain:preflight');
  console.log('');
  console.log('Runs the read-only sidechain EVM/Frontier preflight.');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h   Print this help without opening runtime state');
}

async function main(): Promise<void> {
  if (isHelpRequested(process.argv)) {
    printUsage();
    return;
  }

  const { ethers } = await import('ethers');
  const { loadDeployedState } = await import('../config.js');
  const EVM_RPC_URL = process.env.SUBSTRATE_EVM_URL ?? 'http://localhost:9945';
  const checks: PreflightCheck[] = [];

  // ── 1. EVM/Frontier RPC reachable ───────────────────────────────────
  let provider: EvmProvider | null = null;
  let blockNumber = 0;
  try {
    provider = new ethers.JsonRpcProvider(EVM_RPC_URL);
    blockNumber = await provider.getBlockNumber();
    checks.push({
      name: 'Frontier EVM RPC',
      status: 'PASS',
      message: `reachable at ${EVM_RPC_URL}, block=${blockNumber}`,
    });
  } catch (err: any) {
    provider = null;
    checks.push({
      name: 'Frontier EVM RPC',
      status: 'FAIL',
      message: `unreachable at ${EVM_RPC_URL}: ${err.message ?? err}`,
    });
  }

  // ── 2. deployed_state.json has solidity addresses ───────────────────
  let deployed: any;
  try {
    deployed = loadDeployedState();
  } catch (err: any) {
    checks.push({
      name: 'deployed_state.json',
      status: 'FAIL',
      message: `cannot load: ${err.message ?? err}`,
    });
    console.log(formatPreflightReport(checks, 'Sidechain Demo Preflight'));
    process.exit(1);
  }

  const hasSerg = !!deployed.solidity?.sergAddress;
  const hasBridge = !!deployed.solidity?.bridgeAddress;
  checks.push(classifyLegacyOwnerMintDeploymentMetadata(deployed.solidity));

  // ── 3. EVM contract code verification ───────────────────────────────
  if (provider && hasSerg && hasBridge) {
    for (const [label, addr] of [
      ['SERG contract', deployed.solidity.sergAddress],
      ['ErgoBridge contract', deployed.solidity.bridgeAddress],
    ] as const) {
      try {
        const code = await provider.getCode(addr);
        checks.push(classifyLegacyOwnerMintRuntimeCode({
          label,
          address: addr,
          code,
        }));
      } catch (err: any) {
        checks.push({
          name: label,
          status: 'WARN',
          message: `eth_getCode failed: ${err.message ?? err}`,
        });
      }
    }
  } else if (!provider) {
    checks.push({
      name: 'EVM contracts',
      status: 'WARN',
      message: 'skipped — RPC offline',
    });
  } else {
    checks.push({
      name: 'EVM contracts',
      status: 'WARN',
      message: 'skipped — missing solidity addresses',
    });
  }

  // ── 4. WS endpoint (best-effort, non-critical) ─────────────────────
  const wsUrl = process.env.SUBSTRATE_WS_URL ?? 'ws://localhost:9945';
  checks.push({
    name: 'WebSocket endpoint',
    status: 'WARN',
    message: `skipped — non-invasive check only; WS expected at ${wsUrl}`,
  });

  // ── Report ──────────────────────────────────────────────────────────
  console.log(formatPreflightReport(checks, 'Sidechain Demo Preflight'));
  process.exit(hasFailure(checks) ? 1 : 0);
}

main().catch((err) => {
  console.error('Sidechain preflight crashed:', err);
  process.exit(1);
});
