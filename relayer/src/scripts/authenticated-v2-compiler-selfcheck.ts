import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  loadCanonicalAuthenticatedV2ContractTemplates,
} from '../authenticated-v2-canonical-contracts.js';
import {
  deriveAuthenticatedV2InitialBinding,
  initialBindingCompilerRunFromPinnedJvm,
} from '../authenticated-v2-initial-binding.js';
import { compileResolvedAuthenticatedV2SourcesWithPinnedJvm } from '../authenticated-v2-source-tree-conformance.js';

const TRACKER_NFT_ID = '11'.repeat(32);
const DUP_NFT_ID = '22'.repeat(32);
const EXPECTED_TREE_SHA256 = {
  tracker: '233f8a82afb0ee2b3e722a58d893b03e07d83ef571aa67779cb722f900406e3a',
  unlock: 'e96ad8193f262855c26ada0d001d2f227b03739ea2c17acf45739db1200c6afa',
  duplicatePrevention: 'df6be2ae3ef676c3eac150be8cc7cbdd738f89402a8868054f07016e33a1bbed',
} as const;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const relayerRoot = resolve(scriptDirectory, '..', '..');
const bridgeRoot = resolve(relayerRoot, '..');
const worktreeRoot = resolve(bridgeRoot, '..');

interface ParsedArgs {
  ergoSource: string | null;
  errors: string[];
}

export function parseAuthenticatedV2CompilerSelfcheckArgs(argv: string[]): ParsedArgs {
  let ergoSource: string | null = null;
  const errors: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--ergo-source') {
      errors.push('only --ergo-source is supported');
      continue;
    }
    if (ergoSource !== null) {
      errors.push('--ergo-source may be provided only once');
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) errors.push('--ergo-source requires a value');
    else {
      ergoSource = value;
      index += 1;
    }
  }
  if (ergoSource === null) errors.push('--ergo-source is required');
  return { ergoSource, errors };
}

async function main(): Promise<void> {
  const parsed = parseAuthenticatedV2CompilerSelfcheckArgs(process.argv.slice(2));
  if (parsed.errors.length > 0 || parsed.ergoSource === null) {
    console.error(parsed.errors.join('\n'));
    console.error('Usage: npm run contracts:authenticated-v2:compiler-selfcheck -- --ergo-source <patched-ergo-source>');
    process.exitCode = 1;
    return;
  }
  const ergoSourcePath = resolve(process.cwd(), parsed.ergoSource);
  const report = await deriveAuthenticatedV2InitialBinding({
    environment: 'local',
    trackerFundingBoxId: TRACKER_NFT_ID,
    dupVaultFundingBoxId: DUP_NFT_ID,
  }, {
    templates: loadCanonicalAuthenticatedV2ContractTemplates(bridgeRoot),
    compile: async resolved => initialBindingCompilerRunFromPinnedJvm(
      await compileResolvedAuthenticatedV2SourcesWithPinnedJvm({
        resolved,
        bridgeRoot,
        worktreeRoot,
        ergoSourcePath,
      }),
    ),
  });
  const observed = Object.fromEntries(Object.entries(report.provisioningContracts).map(([role, contract]) => (
    [role, contract.ergoTreeSha256Hex]
  ))) as Record<keyof typeof EXPECTED_TREE_SHA256, string>;
  const mismatches = (Object.keys(EXPECTED_TREE_SHA256) as Array<keyof typeof EXPECTED_TREE_SHA256>)
    .filter(role => observed[role] !== EXPECTED_TREE_SHA256[role])
    .map(role => (
      `${role} expected ${EXPECTED_TREE_SHA256[role]}, observed ${observed[role]}`
    ));
  if (mismatches.length > 0) {
    throw new Error(`source-to-tree golden vector does not match: ${mismatches.join('; ')}`);
  }
  console.log(JSON.stringify({
    status: 'PASS',
    sourceToBytecodeDerived: true,
    dependencyBindingStable: report.dependencyBinding.fixedPointVerified,
    compilerPasses: report.dependencyBinding.compilerPasses,
    treeSha256: observed,
    setupAuthorized: false,
    signingPerformed: false,
    submissionPerformed: false,
    deploymentPerformed: false,
    broadcastPerformed: false,
    gate5Closed: false,
    productionReady: false,
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : 'authenticated V2 compiler self-check failed');
    process.exitCode = 1;
  });
}
