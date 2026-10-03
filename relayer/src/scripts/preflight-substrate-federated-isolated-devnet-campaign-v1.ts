import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalPathIdentity,
  isPathInside,
  readBoundedRegularFile,
} from '../create-only-out-of-repository-artifact.js';
import {
  resolveBridgeRepositoryRootsFromCheckoutLayout,
} from '../bridge-repository-layout.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1,
} from '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1,
} from '../substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2,
} from '../substrate-federated-isolated-devnet-frontier-lab-owner-binding-v2.js';
import {
  buildAuthoritySafeLegacyMintProbeV1,
} from '../substrate-federated-authority-safe-devnet-observation-v1.js';
import {
  preflightSubstrateFederatedIsolatedDevnetFrontierApplicationV1,
} from '../substrate-federated-isolated-devnet-frontier-application-preflight-v1.js';
import {
  inspectSubstrateFederatedAuthoritySafePinnedProtocV1,
} from '../substrate-federated-authority-safe-devnet-protoc-v1.js';
import {
  inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1,
} from '../substrate-federated-authority-safe-devnet-rust-src-v1.js';
import {
  buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1,
} from '../substrate-federated-authority-safe-devnet-chain-spec-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1,
  inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1,
} from '../substrate-federated-isolated-devnet-ergo-node-build-v1.js';
import {
  assertNoLocalPathValue,
  childEnvironment,
  explicitExistingLocalNonSensitivePath,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';
import {
  loadCanonicalBootstrapRequestBoundToSha256,
} from './substrate-federated-isolated-devnet-bootstrap-request-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInPlanV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-campaign-preflight.v1' as const;

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_PHASES =
  Object.freeze([
    'arguments and platform',
    'canonical request loading',
    'pinned Git and bridge checkout',
    'base spec application and topology',
    'external root binding',
    'Ergo node build output readiness',
    'Frontier native host preflight',
    'pinned Protobuf compiler',
    'pinned Rust source before closure',
    'offline Frontier dependency closure',
    'pinned Rust source after closure',
    'receipt finalization',
  ] as const);

export type SubstrateFederatedIsolatedDevnetCampaignPreflightV1Phase =
  typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_PHASES[number];

const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1';
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const MAX_GIT_EXECUTABLE_BYTES = 64 * 1024 * 1024;
const OFFLINE_CARGO_FETCH_TIMEOUT_MS = 120_000;
const MAX_OFFLINE_CARGO_FETCH_OUTPUT_BYTES = 1024 * 1024;

export interface SubstrateFederatedIsolatedDevnetCampaignPreflightV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'request_bound_lab_campaign_preflight_passed';
  readonly requestSha256Hex: string;
  readonly requestBindings: Readonly<{
    readonly expectedHeadCommitSha1Hex: string;
    readonly expectedBaseSpecSha256Hex: string;
    readonly expectedFrontierCommit: string;
    readonly expectedFrontierPatchSha256Hex: string;
    readonly expectedRuntimeCodeSha256Hex: string;
  }>;
  readonly pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
  readonly checks: Readonly<{
    readonly canonicalRequestDigestBound: true;
    readonly pinnedGitExecutableBound: true;
    readonly exactBridgeHeadObserved: true;
    readonly trackedWorktreeClean: true;
    readonly exactBaseSpecBytesBound: true;
    readonly deterministicLabApplicationBound: true;
    readonly distinctLoopbackSourceTopologyBound: true;
    readonly freshArtifactDestinationBound: true;
    readonly externalRootsDisjointAndOutsideWorktree: true;
    readonly exactPegInPlanBound: true;
    readonly visualStudioAndOfflineFrontierPreflightPassed: true;
    readonly workerNodeAndCampaignLaunchAbsent: true;
  }>;
  readonly boundaries: Readonly<{
    readonly localPreflightOnly: true;
    readonly sourceConsensusAuthenticated: false;
    readonly ergoConsensusAuthenticated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly trackerAdmissionEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
    readonly hostileSameUserMutationResistanceEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export function preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
  argv: readonly string[],
  observePhase: (
    phase: SubstrateFederatedIsolatedDevnetCampaignPreflightV1Phase,
  ) => void = () => undefined,
): Readonly<SubstrateFederatedIsolatedDevnetCampaignPreflightV1Receipt> {
  observePhase('arguments and platform');
  const args = parseArguments(argv);
  if (process.platform !== 'win32') {
    throw new Error('isolated campaign preflight requires Windows');
  }
  observePhase('canonical request loading');
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const { bridgeRoot, worktreeRoot } =
    resolveBridgeRepositoryRootsFromCheckoutLayout(
      resolve(scriptDirectory, '..', '..', '..'),
    );
  const requestPath = explicitExistingLocalNonSensitivePath(
    args.requestPath,
    'isolated campaign bootstrap request',
    'file',
  );
  if (pathsOverlap(worktreeRoot, requestPath)) {
    throw new Error('isolated campaign request must remain outside the worktree');
  }
  const input = loadCanonicalBootstrapRequestBoundToSha256(
    requestPath,
    bridgeRoot,
    worktreeRoot,
    args.expectedRequestSha256Hex,
  );
  const acceptance = input.lifecycle.sourceHistory.acceptance;
  const relayerArtifacts = input.lifecycle.relayerArtifacts;
  assertSubstrateFederatedIsolatedDevnetFrontierLabApplicationV1({
    bridgeAddressHex: acceptance.bridgeAddress,
    tokenAddressHex: acceptance.tokenAddress,
  });
  const probe = buildAuthoritySafeLegacyMintProbeV1({
    signedTransactionHex: acceptance.signedLegacyOwnerMintTransactionHex,
    expectedChainId: acceptance.expectedChainId,
    expectedBridgeAddress: acceptance.bridgeAddress,
    expectedBridgeOwnerAddress: acceptance.bridgeOwnerAddress,
  });
  assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
    bridgeAddressHex: acceptance.bridgeAddress,
    bridgeOwnerAddressHex: acceptance.bridgeOwnerAddress,
    recipientAddressHex: args.pegIn.recipientAddressHex,
    removedBaseSudoAddressHex: acceptance.expectedSudoAddress,
    tokenAddressHex: acceptance.tokenAddress,
  });
  if (
    probe.recipientAddress !== `0x${args.pegIn.recipientAddressHex}`
    || probe.amount !== args.pegIn.amountNanoErg
  ) {
    throw new Error(
      'Frontier LAB owner-mint rejection probe differs from the peg-in plan',
    );
  }
  const expectedHeadCommitSha1Hex = exactCommit(
    relayerArtifacts.expectedHeadCommitSha1Hex,
  );
  observePhase('pinned Git and bridge checkout');
  assertPinnedGitExecutable(
    acceptance.gitExecutablePath,
    bridgeRoot,
  );
  const observedHeadCommitSha1Hex = observeExactCleanBridgeCheckout(
    acceptance.gitExecutablePath,
    bridgeRoot,
    worktreeRoot,
  );
  assertPinnedGitExecutable(
    acceptance.gitExecutablePath,
    bridgeRoot,
  );
  if (observedHeadCommitSha1Hex !== expectedHeadCommitSha1Hex) {
    throw new Error('bootstrap request HEAD differs from the active bridge HEAD');
  }
  observePhase('base spec application and topology');
  if (
    createHash('sha256').update(acceptance.baseSpecBytes).digest('hex')
      !== acceptance.expectedBaseSpecSha256Hex
  ) {
    throw new Error('bootstrap request base spec bytes differ from their digest');
  }
  buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1({
    bridgeRoot,
    baseSpecBytes: acceptance.baseSpecBytes,
    expectedChainId: acceptance.expectedChainId,
    bridgeAddress: acceptance.bridgeAddress,
    tokenAddress: acceptance.tokenAddress,
    bridgeOwnerAddress: acceptance.bridgeOwnerAddress,
    expectedBaseSpecSha256Hex: acceptance.expectedBaseSpecSha256Hex,
    expectedFrontierCommit: acceptance.expectedFrontierCommit,
    expectedFrontierPatchSha256Hex:
      acceptance.expectedFrontierPatchSha256Hex,
    expectedRuntimeCodeSha256Hex: acceptance.expectedRuntimeCodeSha256Hex,
    expectedSudoAddress: acceptance.expectedSudoAddress,
  });
  assertDistinctLoopbackTopology(
    acceptance.primaryRpcUrl,
    acceptance.witnessRpcUrl,
    [
      acceptance.primaryP2pPort,
      acceptance.witnessP2pPort,
      acceptance.primaryPrometheusPort,
      acceptance.witnessPrometheusPort,
    ],
  );
  observePhase('external root binding');
  const temporaryDirectoryRoot = explicitExistingLocalNonSensitivePath(
    args.frontierTemporaryRoot,
    'Frontier campaign temporary root',
    'directory',
  );
  const frontierCargoCache = explicitExistingLocalNonSensitivePath(
    args.frontierCargoCache,
    'Frontier campaign Cargo dependency cache',
    'directory',
  );
  const relayerCargoCache = explicitExistingLocalNonSensitivePath(
    args.relayerCargoCache,
    'relayer campaign Cargo dependency cache',
    'directory',
  );
  assertExternalRoots(
    worktreeRoot,
    acceptance.frontierSourcePath,
    input.build.ergoSourcePath,
    relayerArtifacts.destinationDirectory,
    requestPath,
    temporaryDirectoryRoot,
    frontierCargoCache,
    relayerCargoCache,
  );
  observePhase('Ergo node build output readiness');
  assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1(
    bridgeRoot,
    input.build.ergoSourcePath,
  );
  observePhase('Frontier native host preflight');
  preflightSubstrateFederatedIsolatedDevnetFrontierApplicationV1({
    frontierSourceDirectory: acceptance.frontierSourcePath,
    temporaryDirectoryRoot,
    cargoDependencyCacheDirectory: frontierCargoCache,
    cargoExecutablePath: acceptance.cargoExecutablePath,
    rustcExecutablePath: acceptance.rustcExecutablePath,
    gitExecutablePath: acceptance.gitExecutablePath,
    offline: true,
  });
  observePhase('pinned Protobuf compiler');
  inspectSubstrateFederatedAuthoritySafePinnedProtocV1({
    bridgeRoot,
    cwd: acceptance.frontierSourcePath,
  });
  observePhase('pinned Rust source before closure');
  const rustSrcBefore =
    inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1({
      bridgeRoot,
      rustcExecutablePath: acceptance.rustcExecutablePath,
    });
  observePhase('offline Frontier dependency closure');
  assertOfflineFrontierDependencyClosure({
    cargoExecutablePath: acceptance.cargoExecutablePath,
    frontierSourcePath: acceptance.frontierSourcePath,
    frontierCargoCache,
    rustStandardLibraryManifest: rustSrcBefore.cargoManifestPath,
    worktreeRoot,
  });
  observePhase('pinned Rust source after closure');
  const rustSrcAfter =
    inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1({
      bridgeRoot,
      rustcExecutablePath: acceptance.rustcExecutablePath,
    });
  assertSameObservation(
    rustSrcBefore,
    rustSrcAfter,
    'locked Rust standard-library source changed during offline closure',
  );
  observePhase('receipt finalization');
  const body = deepFreeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_SCHEMA,
    version: 1 as const,
    status: 'request_bound_lab_campaign_preflight_passed' as const,
    requestSha256Hex: args.expectedRequestSha256Hex,
    requestBindings: {
      expectedHeadCommitSha1Hex,
      expectedBaseSpecSha256Hex: acceptance.expectedBaseSpecSha256Hex,
      expectedFrontierCommit: acceptance.expectedFrontierCommit,
      expectedFrontierPatchSha256Hex:
        acceptance.expectedFrontierPatchSha256Hex,
      expectedRuntimeCodeSha256Hex: acceptance.expectedRuntimeCodeSha256Hex,
    },
    pegIn: args.pegIn,
    checks: {
      canonicalRequestDigestBound: true as const,
      pinnedGitExecutableBound: true as const,
      exactBridgeHeadObserved: true as const,
      trackedWorktreeClean: true as const,
      exactBaseSpecBytesBound: true as const,
      deterministicLabApplicationBound: true as const,
      distinctLoopbackSourceTopologyBound: true as const,
      freshArtifactDestinationBound: true as const,
      externalRootsDisjointAndOutsideWorktree: true as const,
      exactPegInPlanBound: true as const,
      visualStudioAndOfflineFrontierPreflightPassed: true as const,
      workerNodeAndCampaignLaunchAbsent: true as const,
    },
    boundaries: {
      localPreflightOnly: true as const,
      sourceConsensusAuthenticated: false as const,
      ergoConsensusAuthenticated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      trackerAdmissionEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
      hostileSameUserMutationResistanceEstablished: false as const,
    },
  });
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'isolated campaign preflight receipt');
  return receipt;
}

function parseArguments(argv: readonly string[]): Readonly<{
  requestPath: string;
  expectedRequestSha256Hex: string;
  frontierTemporaryRoot: string;
  frontierCargoCache: string;
  relayerCargoCache: string;
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
}> {
  if (
    argv.length !== 14
    || argv[0] !== '--request'
    || invalidValue(argv[1])
    || argv[2] !== '--expected-request-sha256'
    || argv[3] === undefined
    || !/^[0-9a-f]{64}$/u.test(argv[3])
    || argv[4] !== '--amount-nano-erg'
    || argv[5] === undefined
    || argv[6] !== '--recipient-address-hex'
    || argv[7] === undefined
    || argv[8] !== '--frontier-temporary-root'
    || invalidValue(argv[9])
    || argv[10] !== '--frontier-cargo-cache'
    || invalidValue(argv[11])
    || argv[12] !== '--relayer-cargo-cache'
    || invalidValue(argv[13])
  ) {
    throw new Error('isolated campaign preflight arguments are invalid');
  }
  return Object.freeze({
    requestPath: argv[1],
    expectedRequestSha256Hex: argv[3],
    frontierTemporaryRoot: argv[9],
    frontierCargoCache: argv[11],
    relayerCargoCache: argv[13],
    pegIn: normalizePegInPlan(argv[5], argv[7]),
  });
}

function invalidValue(value: string | undefined): value is undefined {
  return value === undefined || value.length === 0 || value.startsWith('--');
}

function normalizePegInPlan(
  amountNanoErg: string,
  recipientAddressHex: string,
): Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1> {
  if (
    !/^[1-9][0-9]*$/u.test(amountNanoErg)
    || BigInt(amountNanoErg) > ERGO_POSITIVE_LONG_MAX
    || !/^[0-9a-f]{40}$/u.test(recipientAddressHex)
    || /^0{40}$/u.test(recipientAddressHex)
  ) {
    throw new Error('isolated campaign preflight peg-in plan is invalid');
  }
  return Object.freeze({ amountNanoErg, recipientAddressHex });
}

function exactCommit(value: string): string {
  if (!/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error('bootstrap request expected HEAD is invalid');
  }
  return value;
}

function observeExactCleanBridgeCheckout(
  gitExecutablePath: string,
  bridgeRoot: string,
  worktreeRoot: string,
): string {
  const result = spawnSync(
    gitExecutablePath,
    [
      '-C',
      worktreeRoot,
      'status',
      '--porcelain=v2',
      '--branch',
      '--untracked-files=no',
    ],
    {
      cwd: bridgeRoot,
      env: childEnvironment(worktreeRoot, {
        omitInheritedCargoHome: true,
      }),
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 64 * 1024,
    },
  );
  if (
    result.error !== undefined
    || result.status !== 0
    || result.signal !== null
    || result.stderr !== ''
  ) {
    throw new Error('active bridge checkout could not be observed exactly');
  }
  const lines = result.stdout.replace(/\r\n/gu, '\n').split('\n');
  if (lines.at(-1) !== '') {
    throw new Error('active bridge checkout could not be observed exactly');
  }
  lines.pop();
  const oidLines = lines.filter(line => line.startsWith('# branch.oid '));
  if (
    oidLines.length !== 1
    || !/^# branch\.oid [0-9a-f]{40}$/u.test(oidLines[0]!)
  ) {
    throw new Error('active bridge checkout could not be observed exactly');
  }
  if (lines.some(line => !line.startsWith('# '))) {
    throw new Error('isolated campaign preflight requires a clean tracked worktree');
  }
  return oidLines[0]!.slice('# branch.oid '.length);
}

function assertPinnedGitExecutable(
  gitExecutablePath: string,
  bridgeRoot: string,
): void {
  const lock =
    inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1(bridgeRoot);
  const executable = readBoundedRegularFile(
    gitExecutablePath,
    'campaign preflight Git executable',
    MAX_GIT_EXECUTABLE_BYTES,
  );
  if (
    createHash('sha256').update(executable.bytes).digest('hex')
      !== lock.gitExecutableSha256Hex
  ) {
    throw new Error('campaign preflight Git executable differs from the build lock');
  }
}

function assertOfflineFrontierDependencyClosure(input: Readonly<{
  cargoExecutablePath: string;
  frontierSourcePath: string;
  frontierCargoCache: string;
  rustStandardLibraryManifest: string;
  worktreeRoot: string;
}>): void {
  const rustStandardLibraryManifest = input.rustStandardLibraryManifest;
  const environment = childEnvironment(input.worktreeRoot, {
    cargoHomeDirectory: input.frontierCargoCache,
  });
  for (const closure of [
    {
      args: ['fetch', '--locked', '--offline'],
      cwd: input.frontierSourcePath,
    },
    {
      args: [
        'fetch',
        '--locked',
        '--offline',
        '--manifest-path',
        rustStandardLibraryManifest,
      ],
      cwd: dirname(rustStandardLibraryManifest),
      environment: Object.freeze({
        ...environment,
        RUSTC_BOOTSTRAP: '1',
      }),
    },
  ]) {
    const result = spawnSync(
      input.cargoExecutablePath,
      closure.args,
      {
        cwd: closure.cwd,
        env: closure.environment ?? environment,
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        timeout: OFFLINE_CARGO_FETCH_TIMEOUT_MS,
        maxBuffer: MAX_OFFLINE_CARGO_FETCH_OUTPUT_BYTES,
      },
    );
    if (
      result.error !== undefined
      || result.status !== 0
      || result.signal !== null
    ) {
      throw new Error(
        'Frontier offline Cargo dependency closure is incomplete',
      );
    }
  }
}

function assertSameObservation(
  left: unknown,
  right: unknown,
  message: string,
): void {
  if (canonicalJson(left) !== canonicalJson(right)) throw new Error(message);
}

function assertDistinctLoopbackTopology(
  primaryRpcUrl: string,
  witnessRpcUrl: string,
  nonRpcPorts: readonly number[],
): void {
  const primary = exactLoopbackOrigin(primaryRpcUrl, 'primary source RPC');
  const witness = exactLoopbackOrigin(witnessRpcUrl, 'witness source RPC');
  const ports = [primary.port, witness.port, ...nonRpcPorts];
  if (primary.origin === witness.origin || new Set(ports).size !== ports.length) {
    throw new Error('isolated campaign source topology must use distinct ports');
  }
}

function exactLoopbackOrigin(value: string, label: string): Readonly<{
  origin: string;
  port: number;
}> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be one loopback HTTP origin`);
  }
  if (
    url.protocol !== 'http:'
    || url.hostname !== '127.0.0.1'
    || url.username !== ''
    || url.password !== ''
    || url.pathname !== '/'
    || url.search !== ''
    || url.hash !== ''
    || !/^[1-9][0-9]*$/u.test(url.port)
  ) {
    throw new Error(`${label} must be one loopback HTTP origin`);
  }
  const port = Number(url.port);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error(`${label} port is invalid`);
  }
  return Object.freeze({ origin: url.origin, port });
}

function assertExternalRoots(
  worktreeRoot: string,
  frontierSourcePath: string,
  ergoSourcePath: string,
  artifactDestination: string,
  requestPath: string,
  temporaryDirectoryRoot: string,
  frontierCargoCache: string,
  relayerCargoCache: string,
): void {
  const roots = [
    temporaryDirectoryRoot,
    frontierCargoCache,
    relayerCargoCache,
    ergoSourcePath,
  ];
  if (
    roots.some(path => pathsOverlap(worktreeRoot, path))
    || roots.some((left, index) =>
      roots.slice(index + 1).some(right => pathsOverlap(left, right)))
    || canonicalPathIdentity(frontierSourcePath)
      === canonicalPathIdentity(temporaryDirectoryRoot)
    || !isPathInside(temporaryDirectoryRoot, frontierSourcePath)
    || roots.some(path => pathsOverlap(path, artifactDestination))
    || roots.some(path => pathsOverlap(path, requestPath))
    || pathsOverlap(requestPath, artifactDestination)
  ) {
    throw new Error(
      'isolated campaign roots must be disjoint, external and source-containing',
    );
  }
}

function pathsOverlap(left: string, right: string): boolean {
  return canonicalPathIdentity(left) === canonicalPathIdentity(right)
    || isPathInside(left, right)
    || isPathInside(right, left);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function main(): Promise<void> {
  let phase: SubstrateFederatedIsolatedDevnetCampaignPreflightV1Phase =
    'arguments and platform';
  try {
    const receipt =
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        process.argv.slice(2),
        currentPhase => {
          phase = currentPhase;
        },
      );
    process.stdout.write(`${canonicalJson(receipt)}\n`);
  } catch {
    process.stderr.write(
      `isolated campaign preflight failed during ${phase}\n`,
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  void main();
}
