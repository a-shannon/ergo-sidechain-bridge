import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  inspectConsensusSourceBaseline,
  type ConsensusSourceBaselineReport,
} from '../consensus-source-baseline.js';
import { discoverBridgeRepositoryRoot } from '../bridge-repository-layout.js';

export interface ConsensusSourceBaselineArgs {
  frontierSourcePath?: string;
  ergoSourcePath?: string;
  requireFrontierCheckout: boolean;
  requireErgoCheckout: boolean;
  checkoutMode: 'full' | 'lock-only' | 'ergo-only';
  help: boolean;
}

export function parseConsensusSourceBaselineArgs(argv: string[]): ConsensusSourceBaselineArgs {
  const args: ConsensusSourceBaselineArgs = {
    requireFrontierCheckout: true,
    requireErgoCheckout: true,
    checkoutMode: 'full',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--lock-only') {
      if (args.checkoutMode !== 'full') {
        throw new Error('--lock-only cannot be combined with another checkout mode');
      }
      args.requireFrontierCheckout = false;
      args.requireErgoCheckout = false;
      args.checkoutMode = 'lock-only';
      continue;
    }
    if (arg === '--ergo-only') {
      if (args.checkoutMode !== 'full') {
        throw new Error('--ergo-only cannot be combined with another checkout mode');
      }
      args.requireFrontierCheckout = false;
      args.requireErgoCheckout = true;
      args.checkoutMode = 'ergo-only';
      continue;
    }
    if (arg === '--frontier-source') {
      if (args.checkoutMode === 'ergo-only') {
        throw new Error('--frontier-source cannot be combined with --ergo-only');
      }
      args.frontierSourcePath = requireValue(argv, index, arg);
      args.requireFrontierCheckout = true;
      index += 1;
      continue;
    }
    if (arg === '--ergo-source') {
      args.ergoSourcePath = requireValue(argv, index, arg);
      args.requireErgoCheckout = true;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.checkoutMode === 'ergo-only' && !args.ergoSourcePath) {
    throw new Error('--ergo-only requires --ergo-source');
  }

  return args;
}

export function formatConsensusSourceBaselineReport(
  report: ConsensusSourceBaselineReport,
): string {
  const lines = [
    '# Bridge Consensus Source Baseline',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Result | ${report.status} |`,
    `| Source lock bindings validated | ${yesNo(report.checks.lockBindingsValidated)} |`,
    `| Solidity build closure artifacts validated | ${yesNo(report.checks.solidityBuildClosureArtifactsValidated)} |`,
    `| Frontier checkout required | ${yesNo(report.checks.frontierCheckoutRequired)} |`,
    `| Frontier checkout validated | ${yesNo(report.checks.frontierCheckoutValidated)} |`,
    `| Ergo checkout required | ${yesNo(report.checks.ergoCheckoutRequired)} |`,
    `| Ergo checkout validated | ${yesNo(report.checks.ergoCheckoutValidated)} |`,
    `| Solidity build manifest SHA-256 | ${report.sourceIdentity.solidityBuildManifestSha256 ?? '<unavailable>'} |`,
    `| Frontier commit | ${report.sourceIdentity.frontierCommit ?? '<unavailable>'} |`,
    `| Frontier patch SHA-256 | ${report.sourceIdentity.frontierPatchSha256 ?? '<unavailable>'} |`,
    `| Ergo base commit | ${report.sourceIdentity.ergoBaseCommit ?? '<unavailable>'} |`,
    `| Ergo patch SHA-256 | ${report.sourceIdentity.ergoPatchSha256 ?? '<unavailable>'} |`,
    '',
    '## Claim Boundaries',
    '',
    '| Boundary | Value |',
    '|---|---|',
    `| Sidechain finality implemented | ${yesNo(report.boundaries.sidechainFinalityImplemented)} |`,
    `| Runtime commitment producer implemented | ${yesNo(report.boundaries.runtimeCommitmentProducerImplemented)} |`,
    `| GRANDPA authority-transition verification implemented | ${yesNo(report.boundaries.grandpaAuthorityTransitionVerificationImplemented)} |`,
    `| Hash-linked GRANDPA checkpoint verification implemented | ${yesNo(report.boundaries.hashLinkedGrandpaVerificationImplemented)} |`,
    `| Native runtime commitment state verification implemented | ${yesNo(report.boundaries.nativeRuntimeCommitmentStateVerificationImplemented)} |`,
    `| Native finalized checkpoint verification implemented | ${yesNo(report.boundaries.nativeFinalizedCheckpointVerificationImplemented)} |`,
    `| Native read-only RPC proof codec implemented | ${yesNo(report.boundaries.nativeRpcProofCodecImplemented)} |`,
    `| Trustless burn verification implemented | ${yesNo(report.boundaries.trustlessBurnVerificationImplemented)} |`,
    `| Gate 5 closed | ${yesNo(report.boundaries.gate5Closed)} |`,
  ];

  if (report.errors.length > 0) {
    lines.push('', '## Blockers', '');
    for (const error of report.errors) lines.push(`- ${error}`);
  }

  return `${lines.join('\n')}\n`;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function yesNo(value: boolean): 'yes' | 'no' {
  return value ? 'yes' : 'no';
}

function usage(): string {
  return [
    'Usage:',
    '  npm run sources:verify -- [--frontier-source <path>] [--ergo-source <path>]',
    '  npm run sources:verify -- --ergo-only --ergo-source <path>',
    '  npm run sources:verify:lock',
    '',
    'Full mode requires the pinned Frontier base plus tracked runtime patch and the patched Ergo source checkout.',
    'Ergo-only mode validates the patched Ergo checkout for isolated Ergo-node execution without claiming a Frontier build.',
    'Lock-only mode validates tracked source identities and patch bytes without claiming a build.',
  ].join('\n');
}

async function main(): Promise<void> {
  const args = parseConsensusSourceBaselineArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = resolve(scriptDir, '..', '..', '..');
  const worktreeRoot = discoverBridgeRepositoryRoot(bridgeRoot);
  const report = inspectConsensusSourceBaseline({
    worktreeRoot,
    bridgeRoot,
    frontierSourcePath: args.frontierSourcePath,
    ergoSourcePath: args.ergoSourcePath,
    requireFrontierCheckout: args.requireFrontierCheckout,
    requireErgoCheckout: args.requireErgoCheckout,
  });

  process.stdout.write(formatConsensusSourceBaselineReport(report));
  if (report.status !== 'PASS') process.exitCode = 1;
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : '';
if (entrypoint === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
