import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveProvisioningInputPath, resolveProvisioningOutputPath }
  from '../authenticated-v2-sanitized-io.js';
import {
  createNativePegInCausalF2dDualOriginCampaignReportV1,
  createNativePegInCausalF2dInstallationDeclarationsV1,
  createNativePegInCausalF2dSingleRunReportV1,
  validateNativePegInCausalF2dDualOriginCampaignReportV1,
  validateNativePegInCausalF2dInstallationDeclarationsV1,
  validateNativePegInCausalF2dSingleRunReportV1,
  type NativePegInCausalF2dDualOriginCampaignReportV1,
  type NativePegInCausalF2dInstallationDeclarationsV1,
  type NativePegInCausalF2dSingleRunReportV1,
} from '../native-peg-in-causal-f2d-dual-origin-campaign-v1.js';
import {
  reacquireNativePegInCausalF2cAfterRestartV1,
  type NativePegInCausalF2cFreshProcessReacquisitionV1Input,
}
  from '../native-peg-in-causal-f2c-fresh-process-reacquisition-v1.js';
import { normalizeNativeCheckpointTrustAnchor }
  from '../native-checkpoint-proof-collector.js';
import { createPinnedLocalCausalV3ResultCandidateEvaluator }
  from '../native-peg-in-causal-mint-transition-v3-execution-authority.js';
import { createPinnedLocalCausalSourceProofProducerCandidateEvaluator }
  from '../native-peg-in-causal-source-proof-result-producer-execution-authority.js';
import { createNativeSubstrateRpcProofCodec }
  from '../native-substrate-rpc-proof-codec.js';
import { deriveExecutableInvocationSha256Hex } from '../native-executable-pin.js';
import { normalizePegInCausalSourceProofEnvelopeV1,
  normalizePegInCausalSourceProofRequestV1 }
  from '../peg-in-causal-source-proof-admission-v1.js';
import { normalizePegInFrontierContractStateStatementV1 }
  from '../peg-in-frontier-contract-state-v1.js';
import { normalizePegInFrontierEventStatementV1 }
  from '../peg-in-frontier-event-v1.js';
import { normalizePegInFrontierExecutionIdentityStatementV1 }
  from '../peg-in-frontier-execution-identity-v1.js';
import {
  disposePinnedLocalNativeVerifierBuild,
  getPinnedLocalNativeVerifierExecution,
  preparePinnedLocalNativeVerifierBuild,
  runBoundedProcess,
} from '../pinned-local-native-verifier-build.js';
import {
  BoundedHttpSubstrateRpcTransport,
  ReadOnlySubstrateFinalityRpc,
} from '../substrate-finality-provider.js';

const INPUT_SCHEMA = 'e2s.native-peg-in-causal-f2d-campaign-input.v1';
const WORKER_REQUEST_SCHEMA =
  'e2s.native-peg-in-causal-f2d-single-run-worker-request.v1' as const;
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_WORKER_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_WORKER_ERROR_BYTES = 1024 * 1024;
const MAX_WORKER_REQUEST_BYTES = 8 * 1024 * 1024;
const WORKER_TIMEOUT_MS = 45 * 60 * 1000;
const WORKER_TERMINATION_GRACE_MS = 15 * 1000;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RELAYER_ROOT = resolve(dirname(SCRIPT_PATH), '..', '..');
const WORKER_SCRIPT_PATH = fileURLToPath(new URL(
  './native-peg-in-causal-f2d-campaign-worker.ts',
  import.meta.url,
));

export interface NativePegInCausalF2dDualOriginCampaignArgs {
  mode?: 'describe' | 'execute';
  input?: string;
  expectedInputSha256Hex?: string;
  out?: string;
  primaryRpcUrl?: string;
  witnessRpcUrl?: string;
  frontierSource?: string;
  cargo?: string;
  rustc?: string;
  git?: string;
  launcherPath?: string;
  launcherSha256Hex?: string;
  policyEpoch?: string;
  policyNotBeforeUnixMs?: string;
  policyExpiresAtUnixMs?: string;
  allowedSystemDlls: string[];
  help: boolean;
  errors: string[];
}

export interface CampaignInputManifestV1 {
  readonly schema: typeof INPUT_SCHEMA;
  readonly targetNativeBlockHashHex: string;
  readonly trustAnchor:
    NativePegInCausalF2cFreshProcessReacquisitionV1Input['causalV3Collection']['trustAnchor'];
  readonly executionIdentityStatement:
    NativePegInCausalF2cFreshProcessReacquisitionV1Input['causalV3Collection']['executionIdentityStatement'];
  readonly eventStatement:
    NativePegInCausalF2cFreshProcessReacquisitionV1Input['causalV3Collection']['eventStatement'];
  readonly contractStateStatement:
    NativePegInCausalF2cFreshProcessReacquisitionV1Input['causalV3Collection']['contractStateStatement'];
  readonly trustedAnchorDigestHex: string;
  readonly sourceProofRequest:
    NativePegInCausalF2cFreshProcessReacquisitionV1Input['sourceProofRequest'];
  readonly sourceProofEnvelope:
    NativePegInCausalF2cFreshProcessReacquisitionV1Input['sourceProofEnvelope'];
  readonly rpcTimeoutMs: number;
  readonly nativeTimeoutMs: number;
  readonly collectionDeadlineMs: number;
  readonly rpcConcurrency: number;
  readonly maxAttempts: number;
}

type CampaignArtifact =
  | NativePegInCausalF2dDualOriginCampaignReportV1
  | NativePegInCausalF2dInstallationDeclarationsV1;

export interface CampaignExecutionRequest {
  readonly args: NativePegInCausalF2dDualOriginCampaignArgs;
  readonly manifest?: CampaignInputManifestV1;
  readonly cwd: string;
  readonly capturedAt: Date;
}

export interface NativePegInCausalF2dSingleRunWorkerRequestV1 {
  readonly schema: typeof WORKER_REQUEST_SCHEMA;
  readonly campaignInput: CampaignInputManifestV1;
  readonly capturedAtIso: string;
  readonly rpcOrigin: string;
  readonly frontierSourcePath: string;
  readonly cargoExecutablePath: string;
  readonly rustcExecutablePath: string;
  readonly gitExecutablePath: string;
  readonly launcherPath: string;
  readonly launcherSha256Hex: string;
  readonly policyEpoch: number;
  readonly policyNotBeforeUnixMs: number;
  readonly policyExpiresAtUnixMs: number;
  readonly allowedSystemDlls: readonly string[];
}

interface CampaignExecutionDependencies {
  readonly runWorker?: (
    request: NativePegInCausalF2dSingleRunWorkerRequestV1,
  ) => Promise<NativePegInCausalF2dSingleRunReportV1>;
}

interface CliOptions {
  readonly cwd?: string;
  readonly bridgeRoot?: string;
  readonly now?: () => Date;
  readonly execute?: (request: CampaignExecutionRequest) => Promise<CampaignArtifact>;
}

const valueOptions = [
  '--mode',
  '--input',
  '--expected-input-sha256',
  '--out',
  '--primary-rpc-url',
  '--witness-rpc-url',
  '--frontier-source',
  '--cargo',
  '--rustc',
  '--git',
  '--launcher-path',
  '--launcher-sha256',
  '--policy-epoch',
  '--policy-not-before-unix-ms',
  '--policy-expires-at-unix-ms',
  '--allowed-system-dll',
] as const;

const usage = [
  'Usage (derive V2 installer records): npm run peg-in:causal-f2d:campaign -- --mode describe --out <new.json> --frontier-source <absolute-path> --cargo <absolute-exe> --rustc <absolute-exe> --git <absolute-exe> --launcher-path <canonical-v2-path> --launcher-sha256 <0x-digest> --policy-epoch <positive> --policy-not-before-unix-ms <ms> --policy-expires-at-unix-ms <ms> --allowed-system-dll <name> [--allowed-system-dll <name> ...]',
  'Usage (execute dual-origin F2d): add --mode execute --input <public-proof-input.json> --expected-input-sha256 <0x-canonical-digest> --primary-rpc-url <origin> --witness-rpc-url <distinct-origin> to the common arguments.',
  'The command performs source-locked local builds and read-only RPC acquisition. It accepts no bridge environment/configuration, runtime database, deployment state, signer, or wallet input; build workers receive only the documented tool-environment allowlist. It cannot submit or broadcast a transaction.',
  'Describe mode does not install anything. Execute mode requires an already reviewed V2 installation and still leaves its separate elevated activation campaign, source finality, Gate 5, and readiness open.',
];

export async function runNativePegInCausalF2dDualOriginCampaignCli(
  argv: string[],
  options: CliOptions = {},
): Promise<void> {
  const args = parseNativePegInCausalF2dDualOriginCampaignArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));
  const cwd = resolve(options.cwd ?? process.cwd());
  const outputPath = resolveProvisioningOutputPath(requireArg(args.out, '--out'), {
    cwd,
    bridgeRoot: options.bridgeRoot,
  });
  let manifest: CampaignInputManifestV1 | undefined;
  if (args.mode === 'execute') {
    const inputPath = resolveProvisioningInputPath(requireArg(args.input, '--input'), {
      cwd,
      bridgeRoot: options.bridgeRoot,
    });
    manifest = parseCampaignInputManifest(readFileSync(inputPath));
    const expectedInputSha256Hex = digest32(
      requireArg(args.expectedInputSha256Hex, '--expected-input-sha256'),
      '--expected-input-sha256',
    );
    if (deriveCampaignInputManifestDigestHex(manifest) !== expectedInputSha256Hex) {
      throw new Error('campaign input canonical digest differs from --expected-input-sha256');
    }
  }
  const execute = options.execute ?? executeNativePegInCausalF2dCampaign;
  const artifact = await execute({
    args,
    ...(manifest === undefined ? {} : { manifest }),
    cwd,
    capturedAt: (options.now ?? (() => new Date()))(),
  });
  if (args.mode === 'execute') {
    validateNativePegInCausalF2dDualOriginCampaignReportV1(artifact);
  } else validateNativePegInCausalF2dInstallationDeclarationsV1(artifact);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`F2d ${args.mode} artifact written: ${relative(cwd, outputPath)}`);
  console.log(`Artifact digest: ${artifact.reportDigestHex}`);
  console.log('Boundary: no source-finality, mint, signing, submission, broadcast, Gate 5, trustless, or readiness authority.');
}

export function parseNativePegInCausalF2dDualOriginCampaignArgs(
  argv: string[],
): NativePegInCausalF2dDualOriginCampaignArgs {
  const result: NativePegInCausalF2dDualOriginCampaignArgs = {
    allowedSystemDlls: [],
    help: false,
    errors: [],
  };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help' || option === '-h') {
      result.help = true;
      continue;
    }
    if (!(valueOptions as readonly string[]).includes(option)) {
      result.errors.push(`unknown option: ${option}`);
      continue;
    }
    const repeatable = option === '--allowed-system-dll';
    if (!repeatable && seen.has(option)) {
      result.errors.push(`${option} may be provided only once`);
      index += 1;
      continue;
    }
    seen.add(option);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      result.errors.push(`${option} requires a value`);
      continue;
    }
    index += 1;
    if (option === '--mode') {
      if (value === 'describe' || value === 'execute') result.mode = value;
      else result.errors.push('--mode must be describe or execute');
    } else if (option === '--input') result.input = value;
    else if (option === '--expected-input-sha256') result.expectedInputSha256Hex = value;
    else if (option === '--out') result.out = value;
    else if (option === '--primary-rpc-url') result.primaryRpcUrl = value;
    else if (option === '--witness-rpc-url') result.witnessRpcUrl = value;
    else if (option === '--frontier-source') result.frontierSource = value;
    else if (option === '--cargo') result.cargo = value;
    else if (option === '--rustc') result.rustc = value;
    else if (option === '--git') result.git = value;
    else if (option === '--launcher-path') result.launcherPath = value;
    else if (option === '--launcher-sha256') result.launcherSha256Hex = value;
    else if (option === '--policy-epoch') result.policyEpoch = value;
    else if (option === '--policy-not-before-unix-ms') {
      result.policyNotBeforeUnixMs = value;
    } else if (option === '--policy-expires-at-unix-ms') {
      result.policyExpiresAtUnixMs = value;
    } else result.allowedSystemDlls.push(value);
  }
  if (!result.help) {
    requireParsed(result, 'mode', '--mode');
    requireParsed(result, 'out', '--out');
    requireParsed(result, 'frontierSource', '--frontier-source');
    requireParsed(result, 'cargo', '--cargo');
    requireParsed(result, 'rustc', '--rustc');
    requireParsed(result, 'git', '--git');
    requireParsed(result, 'launcherPath', '--launcher-path');
    requireParsed(result, 'launcherSha256Hex', '--launcher-sha256');
    requireParsed(result, 'policyEpoch', '--policy-epoch');
    requireParsed(result, 'policyNotBeforeUnixMs', '--policy-not-before-unix-ms');
    requireParsed(result, 'policyExpiresAtUnixMs', '--policy-expires-at-unix-ms');
    if (result.allowedSystemDlls.length === 0) {
      result.errors.push('--allowed-system-dll is required at least once');
    }
    if (result.mode === 'execute' || result.mode === undefined) {
      requireParsed(result, 'input', '--input');
      requireParsed(result, 'expectedInputSha256Hex', '--expected-input-sha256');
      requireParsed(result, 'primaryRpcUrl', '--primary-rpc-url');
      requireParsed(result, 'witnessRpcUrl', '--witness-rpc-url');
    } else {
      if (result.input) result.errors.push('--input applies only to execute mode');
      if (result.expectedInputSha256Hex) {
        result.errors.push('--expected-input-sha256 applies only to execute mode');
      }
      if (result.primaryRpcUrl) {
        result.errors.push('--primary-rpc-url applies only to execute mode');
      }
      if (result.witnessRpcUrl) {
        result.errors.push('--witness-rpc-url applies only to execute mode');
      }
    }
  }
  return result;
}

export async function executeNativePegInCausalF2dCampaign(
  request: CampaignExecutionRequest,
  dependencies: CampaignExecutionDependencies = {},
): Promise<CampaignArtifact> {
  const { args, cwd, capturedAt } = request;
  const common = normalizeCampaignExecutionArguments(args, cwd);
  if (args.mode === 'execute') {
    if (!request.manifest) throw new Error('execute mode requires a parsed campaign input');
    const manifest = parseCampaignInputManifestValue(request.manifest);
    const expectedInputSha256Hex = digest32(
      requireArg(args.expectedInputSha256Hex, '--expected-input-sha256'),
      '--expected-input-sha256',
    );
    if (deriveCampaignInputManifestDigestHex(manifest) !== expectedInputSha256Hex) {
      throw new Error('campaign input canonical digest differs from --expected-input-sha256');
    }
    const capturedAtIso = capturedAt.toISOString();
    const primaryRpcOrigin = canonicalRpcOrigin(
      requireArg(args.primaryRpcUrl, '--primary-rpc-url'),
      'primary campaign RPC origin',
    );
    const witnessRpcOrigin = canonicalRpcOrigin(
      requireArg(args.witnessRpcUrl, '--witness-rpc-url'),
      'witness campaign RPC origin',
    );
    if (primaryRpcOrigin === witnessRpcOrigin) {
      throw new Error('F2d campaign requires distinct RPC origins');
    }
    const runWorker = dependencies.runWorker ?? runF2dSingleRunWorkerProcess;
    const createRequest = (rpcOrigin: string) => (
      parseNativePegInCausalF2dSingleRunWorkerRequestV1({
        schema: WORKER_REQUEST_SCHEMA,
        campaignInput: manifest,
        capturedAtIso,
        rpcOrigin,
        ...common,
      })
    );
    const primaryRequest = createRequest(primaryRpcOrigin);
    const witnessRequest = createRequest(witnessRpcOrigin);
    const primaryRun = await runWorker(primaryRequest);
    validateNativePegInCausalF2dSingleRunReportV1(primaryRun);
    assertWorkerReportMatchesRequest(primaryRun, primaryRequest);
    const witnessRun = await runWorker(witnessRequest);
    validateNativePegInCausalF2dSingleRunReportV1(witnessRun);
    assertWorkerReportMatchesRequest(witnessRun, witnessRequest);
    return createNativePegInCausalF2dDualOriginCampaignReportV1({
      capturedAt: new Date(capturedAtIso),
      primaryRun,
      witnessRun,
    });
  }

  const build = await preparePinnedLocalNativeVerifierBuild({
    frontierSourcePath: common.frontierSourcePath,
    cargoExecutablePath: common.cargoExecutablePath,
    rustcExecutablePath: common.rustcExecutablePath,
    gitExecutablePath: common.gitExecutablePath,
    cargoDependencyMode: 'private-copy-offline',
  });
  try {
    const evaluatorOptions = {
      build,
      launcherPath: common.launcherPath,
      launcherSha256Hex: common.launcherSha256Hex,
      policyEpoch: common.policyEpoch,
      policyNotBeforeUnixMs: common.policyNotBeforeUnixMs,
      policyExpiresAtUnixMs: common.policyExpiresAtUnixMs,
      allowedSystemDlls: [...common.allowedSystemDlls],
    };
    const causalV3Evaluator = createPinnedLocalCausalV3ResultCandidateEvaluator(
      evaluatorOptions,
    );
    const sourceProofProducerEvaluator =
      createPinnedLocalCausalSourceProofProducerCandidateEvaluator(evaluatorOptions);
    return createNativePegInCausalF2dInstallationDeclarationsV1({
      generatedAt: capturedAt,
      causalV3Evaluator,
      sourceProofProducerEvaluator,
    });
  } finally {
    disposePinnedLocalNativeVerifierBuild(build);
  }
}

function assertWorkerReportMatchesRequest(
  report: NativePegInCausalF2dSingleRunReportV1,
  request: NativePegInCausalF2dSingleRunWorkerRequestV1,
): void {
  if (report.rpcOrigin !== request.rpcOrigin) {
    throw new Error('F2d worker report does not match its requested RPC origin');
  }
  if (report.launcherSha256Hex !== request.launcherSha256Hex) {
    throw new Error('F2d worker report does not match its requested launcher identity');
  }
  const expectedRequestDigestHex =
    deriveNativePegInCausalF2dSingleRunWorkerRequestDigestHex(request);
  if (report.workerRequestDigestHex !== expectedRequestDigestHex) {
    throw new Error('F2d worker report does not match its complete requested input');
  }
}

export async function executeNativePegInCausalF2dSingleRunWorkerV1(
  value: unknown,
): Promise<NativePegInCausalF2dSingleRunReportV1> {
  const request = parseNativePegInCausalF2dSingleRunWorkerRequestV1(value);
  const build = await preparePinnedLocalNativeVerifierBuild({
    frontierSourcePath: request.frontierSourcePath,
    cargoExecutablePath: request.cargoExecutablePath,
    rustcExecutablePath: request.rustcExecutablePath,
    gitExecutablePath: request.gitExecutablePath,
    cargoDependencyMode: 'private-copy-offline',
  });
  try {
    const evaluatorOptions = {
      build,
      launcherPath: request.launcherPath,
      launcherSha256Hex: request.launcherSha256Hex,
      policyEpoch: request.policyEpoch,
      policyNotBeforeUnixMs: request.policyNotBeforeUnixMs,
      policyExpiresAtUnixMs: request.policyExpiresAtUnixMs,
      allowedSystemDlls: [...request.allowedSystemDlls],
    };
    const causalV3Evaluator = createPinnedLocalCausalV3ResultCandidateEvaluator(
      evaluatorOptions,
    );
    const sourceProofProducerEvaluator =
      createPinnedLocalCausalSourceProofProducerCandidateEvaluator(evaluatorOptions);
    const execution = getPinnedLocalNativeVerifierExecution(build);
    const codec = createNativeSubstrateRpcProofCodec({
      executablePath: execution.codecExecutablePath,
      expectedExecutableSha256Hex: execution.codecSha256Hex,
      expectedExecutableInvocationSha256Hex: {
        encodeHeaders: deriveExecutableInvocationSha256Hex(
          execution.codecSha256Hex,
          ['--encode-headers'],
        ),
        inspectWarpProof: deriveExecutableInvocationSha256Hex(
          execution.codecSha256Hex,
          ['--inspect-warp-proof'],
        ),
        inspectFinalityProof: deriveExecutableInvocationSha256Hex(
          execution.codecSha256Hex,
          ['--inspect-finality-proof'],
        ),
      },
      timeoutMs: request.campaignInput.nativeTimeoutMs,
    });
    const candidate = await reacquireNativePegInCausalF2cAfterRestartV1({
      causalV3Collection: {
        rpc: new ReadOnlySubstrateFinalityRpc(new BoundedHttpSubstrateRpcTransport(
          request.rpcOrigin,
          { timeoutMs: request.campaignInput.rpcTimeoutMs },
        )),
        codec,
        trustAnchor: request.campaignInput.trustAnchor,
        targetNativeBlockHashHex: request.campaignInput.targetNativeBlockHashHex,
        executionIdentityStatement: request.campaignInput.executionIdentityStatement,
        eventStatement: request.campaignInput.eventStatement,
        contractStateStatement: request.campaignInput.contractStateStatement,
        trustedAnchorDigestHex: request.campaignInput.trustedAnchorDigestHex,
        evaluator: causalV3Evaluator,
        deadlineMs: request.campaignInput.collectionDeadlineMs,
        rpcConcurrency: request.campaignInput.rpcConcurrency,
        maxAttempts: request.campaignInput.maxAttempts,
      },
      sourceProofProducerEvaluator,
      sourceProofRequest: request.campaignInput.sourceProofRequest,
      sourceProofEnvelope: request.campaignInput.sourceProofEnvelope,
    });
    return createNativePegInCausalF2dSingleRunReportV1({
      capturedAt: new Date(request.capturedAtIso),
      rpcOrigin: request.rpcOrigin,
      launcherSha256Hex: request.launcherSha256Hex,
      workerRequestDigestHex:
        deriveNativePegInCausalF2dSingleRunWorkerRequestDigestHex(request),
      candidate,
    });
  } finally {
    disposePinnedLocalNativeVerifierBuild(build);
  }
}

export function parseNativePegInCausalF2dSingleRunWorkerRequestV1(
  value: unknown,
): NativePegInCausalF2dSingleRunWorkerRequestV1 {
  const record = exactRecord(value, [
    'allowedSystemDlls',
    'campaignInput',
    'capturedAtIso',
    'cargoExecutablePath',
    'frontierSourcePath',
    'gitExecutablePath',
    'launcherPath',
    'launcherSha256Hex',
    'policyEpoch',
    'policyExpiresAtUnixMs',
    'policyNotBeforeUnixMs',
    'rpcOrigin',
    'rustcExecutablePath',
    'schema',
  ], 'F2d single-run worker request');
  if (record.schema !== WORKER_REQUEST_SCHEMA) {
    throw new Error('unsupported F2d single-run worker request schema');
  }
  const rpcOrigin = canonicalRpcOrigin(record.rpcOrigin, 'worker RPC origin');
  if (rpcOrigin !== record.rpcOrigin) {
    throw new Error('worker RPC origin must use canonical URL form');
  }
  const capturedAtIso = canonicalIso(record.capturedAtIso, 'worker capture time');
  const policyNotBeforeUnixMs = boundedInteger(
    record.policyNotBeforeUnixMs,
    0,
    Number.MAX_SAFE_INTEGER,
    'worker policyNotBeforeUnixMs',
  );
  const policyExpiresAtUnixMs = boundedInteger(
    record.policyExpiresAtUnixMs,
    0,
    Number.MAX_SAFE_INTEGER,
    'worker policyExpiresAtUnixMs',
  );
  if (policyExpiresAtUnixMs <= policyNotBeforeUnixMs) {
    throw new Error('worker policy expiry must be after its not-before time');
  }
  const allowedSystemDlls = normalizeAllowedSystemDlls(record.allowedSystemDlls);
  return deepFreeze({
    schema: WORKER_REQUEST_SCHEMA,
    campaignInput: parseCampaignInputManifestValue(record.campaignInput),
    capturedAtIso,
    rpcOrigin,
    frontierSourcePath: canonicalAbsolutePath(
      record.frontierSourcePath,
      'worker Frontier source path',
    ),
    cargoExecutablePath: canonicalAbsolutePath(
      record.cargoExecutablePath,
      'worker cargo executable path',
    ),
    rustcExecutablePath: canonicalAbsolutePath(
      record.rustcExecutablePath,
      'worker rustc executable path',
    ),
    gitExecutablePath: canonicalAbsolutePath(
      record.gitExecutablePath,
      'worker git executable path',
    ),
    launcherPath: canonicalAbsolutePath(record.launcherPath, 'worker launcher path'),
    launcherSha256Hex: digest32(record.launcherSha256Hex, 'worker launcher SHA-256'),
    policyEpoch: boundedInteger(
      record.policyEpoch,
      1,
      Number.MAX_SAFE_INTEGER,
      'worker policy epoch',
    ),
    policyNotBeforeUnixMs,
    policyExpiresAtUnixMs,
    allowedSystemDlls,
  });
}

export function deriveNativePegInCausalF2dSingleRunWorkerRequestDigestHex(
  value: unknown,
): string {
  const request = parseNativePegInCausalF2dSingleRunWorkerRequestV1(value);
  return `0x${createHash('sha256')
    .update(Buffer.from('E2S_NATIVE_PEG_IN_CAUSAL_F2D_WORKER_REQUEST_V1', 'utf8'))
    .update(Buffer.from([0]))
    .update(Buffer.from(canonicalJson(request), 'utf8'))
    .digest('hex')}`;
}

function normalizeCampaignExecutionArguments(
  args: NativePegInCausalF2dDualOriginCampaignArgs,
  cwd: string,
): Omit<NativePegInCausalF2dSingleRunWorkerRequestV1,
  'schema' | 'campaignInput' | 'capturedAtIso' | 'rpcOrigin'> {
  const policyNotBeforeUnixMs = nonNegativeInteger(
    requireArg(args.policyNotBeforeUnixMs, '--policy-not-before-unix-ms'),
    '--policy-not-before-unix-ms',
  );
  const policyExpiresAtUnixMs = nonNegativeInteger(
    requireArg(args.policyExpiresAtUnixMs, '--policy-expires-at-unix-ms'),
    '--policy-expires-at-unix-ms',
  );
  if (policyExpiresAtUnixMs <= policyNotBeforeUnixMs) {
    throw new Error('--policy-expires-at-unix-ms must be after the not-before time');
  }
  return deepFreeze({
    frontierSourcePath: resolve(cwd, requireArg(args.frontierSource, '--frontier-source')),
    cargoExecutablePath: resolve(cwd, requireArg(args.cargo, '--cargo')),
    rustcExecutablePath: resolve(cwd, requireArg(args.rustc, '--rustc')),
    gitExecutablePath: resolve(cwd, requireArg(args.git, '--git')),
    launcherPath: resolve(cwd, requireArg(args.launcherPath, '--launcher-path')),
    launcherSha256Hex: digest32(
      requireArg(args.launcherSha256Hex, '--launcher-sha256'),
      '--launcher-sha256',
    ),
    policyEpoch: positiveInteger(
      requireArg(args.policyEpoch, '--policy-epoch'),
      '--policy-epoch',
    ),
    policyNotBeforeUnixMs,
    policyExpiresAtUnixMs,
    allowedSystemDlls: normalizeAllowedSystemDlls(args.allowedSystemDlls),
  });
}

async function runF2dSingleRunWorkerProcess(
  request: NativePegInCausalF2dSingleRunWorkerRequestV1,
): Promise<NativePegInCausalF2dSingleRunReportV1> {
  const validatedRequest = parseNativePegInCausalF2dSingleRunWorkerRequestV1(request);
  const tsxLoaderPath = fileURLToPath(import.meta.resolve('tsx'));
  const requestBytes = Buffer.from(`${JSON.stringify(validatedRequest)}\n`, 'utf8');
  if (requestBytes.length > MAX_WORKER_REQUEST_BYTES) {
    throw new Error('F2d single-run worker request exceeded its byte limit');
  }
  const requestDirectory = mkdtempSync(join(tmpdir(), 'e2s-f2d-worker-'));
  const requestPath = join(requestDirectory, 'request.json');
  let executionError: unknown;
  try {
    writeFileSync(requestPath, requestBytes, { flag: 'wx' });
    const result = await runBoundedProcess({
      executablePath: process.execPath,
      args: ['--import', tsxLoaderPath, WORKER_SCRIPT_PATH, requestPath],
      cwd: RELAYER_ROOT,
      env: minimalWorkerEnvironment(),
      timeoutMs: WORKER_TIMEOUT_MS,
      maxOutputBytes: MAX_WORKER_OUTPUT_BYTES + MAX_WORKER_ERROR_BYTES,
      maxStdoutBytes: MAX_WORKER_OUTPUT_BYTES,
      maxStderrBytes: MAX_WORKER_ERROR_BYTES,
      terminationGraceMs: WORKER_TERMINATION_GRACE_MS,
      label: 'F2d single-run worker',
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
      validateNativePegInCausalF2dSingleRunReportV1(parsed);
    } catch (error) {
      throw new Error(
        `F2d single-run worker returned an invalid report: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return parsed;
  } catch (error) {
    executionError = error;
    throw error;
  } finally {
    let cleanupError: unknown;
    try {
      if (existsSync(requestPath)) unlinkSync(requestPath);
    } catch (error) {
      cleanupError = error;
    }
    try {
      rmdirSync(requestDirectory);
    } catch (error) {
      cleanupError ??= error;
    }
    if (executionError === undefined && cleanupError !== undefined) throw cleanupError;
  }
}

function minimalWorkerEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'USERPROFILE',
    'HOME',
    'TEMP',
    'TMP',
    'CARGO_HOME',
  ]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}

export function parseCampaignInputManifest(bytes: Buffer): CampaignInputManifestV1 {
  if (bytes.length === 0 || bytes.length > MAX_INPUT_BYTES) {
    throw new Error(`campaign input must contain 1..${MAX_INPUT_BYTES} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('campaign input must be valid JSON');
  }
  return parseCampaignInputManifestValue(parsed);
}

export function parseCampaignInputManifestValue(value: unknown): CampaignInputManifestV1 {
  const record = exactRecord(value, [
    'collectionDeadlineMs',
    'contractStateStatement',
    'eventStatement',
    'executionIdentityStatement',
    'maxAttempts',
    'nativeTimeoutMs',
    'rpcConcurrency',
    'rpcTimeoutMs',
    'schema',
    'sourceProofEnvelope',
    'sourceProofRequest',
    'targetNativeBlockHashHex',
    'trustAnchor',
    'trustedAnchorDigestHex',
  ], 'F2d campaign input');
  if (record.schema !== INPUT_SCHEMA) throw new Error('unsupported F2d campaign input schema');
  const trustAnchor = normalizeNativeCheckpointTrustAnchor(record.trustAnchor);
  const executionIdentityStatement = normalizePegInFrontierExecutionIdentityStatementV1(
    record.executionIdentityStatement,
    trustAnchor.sidechainIdHex,
  );
  return deepFreeze({
    schema: INPUT_SCHEMA,
    targetNativeBlockHashHex: digest32(record.targetNativeBlockHashHex, 'target native block hash'),
    trustAnchor,
    executionIdentityStatement,
    eventStatement: normalizePegInFrontierEventStatementV1(record.eventStatement),
    contractStateStatement: normalizePegInFrontierContractStateStatementV1(
      record.contractStateStatement,
      executionIdentityStatement.ergoBoxIdHex,
    ),
    trustedAnchorDigestHex: digest32(record.trustedAnchorDigestHex, 'trusted anchor digest'),
    sourceProofRequest: normalizePegInCausalSourceProofRequestV1(record.sourceProofRequest),
    sourceProofEnvelope: normalizePegInCausalSourceProofEnvelopeV1(record.sourceProofEnvelope),
    rpcTimeoutMs: boundedInteger(record.rpcTimeoutMs, 1, 60_000, 'rpcTimeoutMs'),
    nativeTimeoutMs: boundedInteger(record.nativeTimeoutMs, 1, 300_000, 'nativeTimeoutMs'),
    collectionDeadlineMs: boundedInteger(
      record.collectionDeadlineMs,
      1,
      600_000,
      'collectionDeadlineMs',
    ),
    rpcConcurrency: boundedInteger(record.rpcConcurrency, 1, 32, 'rpcConcurrency'),
    maxAttempts: boundedInteger(record.maxAttempts, 1, 3, 'maxAttempts'),
  });
}

export function deriveCampaignInputManifestDigestHex(value: unknown): string {
  const manifest = parseCampaignInputManifestValue(value);
  return `0x${createHash('sha256')
    .update(Buffer.from('E2S_NATIVE_PEG_IN_CAUSAL_F2D_CAMPAIGN_INPUT_V1', 'utf8'))
    .update(Buffer.from([0]))
    .update(Buffer.from(canonicalJson(manifest), 'utf8'))
    .digest('hex')}`;
}

function requireParsed(
  result: NativePegInCausalF2dDualOriginCampaignArgs,
  field: keyof NativePegInCausalF2dDualOriginCampaignArgs,
  option: string,
): void {
  if (!result[field]) result.errors.push(`${option} is required`);
}

function requireArg(value: string | undefined, option: string): string {
  if (!value) throw new Error(`${option} is required`);
  return value;
}

function digest32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase 0x-prefixed 32-byte digest`);
  }
  return value;
}

function positiveInteger(value: string, label: string): number {
  const parsed = nonNegativeInteger(value, label);
  if (parsed === 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function nonNegativeInteger(value: string, label: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical non-negative integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} exceeds the safe integer range`);
  return parsed;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return Number(value);
}

function canonicalRpcOrigin(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL`);
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(
      `${label} must be a credential-free HTTP(S) origin without path, query, or fragment`,
    );
  }
  return parsed.toString();
}

function canonicalIso(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be an ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function canonicalAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || !isAbsolute(value)
  ) {
    throw new Error(`${label} must be an absolute NUL-free path`);
  }
  const normalized = resolve(value);
  if (normalized !== value) throw new Error(`${label} must use canonical path form`);
  return value;
}

function normalizeAllowedSystemDlls(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    throw new Error('allowed system DLLs must contain 1..64 entries');
  }
  const normalized = value.map((entry, index) => {
    if (
      typeof entry !== 'string'
      || Buffer.byteLength(entry, 'utf8') > 128
      || !/^[a-z0-9._-]+\.dll$/.test(entry)
    ) {
      throw new Error(`allowed system DLL ${index} must be a bare DLL file name`);
    }
    if (index > 0 && value[index - 1] >= entry) {
      throw new Error('allowed system DLLs must be sorted and unique');
    }
    return entry;
  });
  return deepFreeze(normalized);
}

function exactRecord(
  value: unknown,
  expected: readonly string[],
  label: string,
): Record<string, unknown> {
  exactRecordShape(value, label);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((field, index) => field !== wanted[index])) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
  return record;
}

function exactRecordShape(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('worker request contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new Error('worker request contains a non-canonical value');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

if (process.argv[1] && SCRIPT_PATH === process.argv[1]) {
  runNativePegInCausalF2dDualOriginCampaignCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
