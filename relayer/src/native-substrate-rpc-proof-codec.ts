import { spawn } from 'child_process';
import { dirname, isAbsolute } from 'path';
import { TextDecoder } from 'util';

import type { SubstrateRpcHeaderObservation } from './substrate-finality-provider.js';
import {
  deriveExecutableInvocationSha256Hex,
  normalizeExecutableSha256Hex,
  verifyExecutableInvocationSha256,
  verifyExecutableSha256,
} from './native-executable-pin.js';
import {
  runNativeContainedProcess,
  type NativeContainedProcessResult,
} from './native-contained-process.js';
import {
  assertNativeVerifierExecutionAuthorityProvenance,
  assertNativeVerifierExecutionAuthorityResultProvenance,
  type NativeVerifierAuthorityOperation,
  type NativeVerifierExecutionAuthority,
} from './native-verifier-execution-authority.js';
import type { NativeVerifierAttestationValidationReport } from './independently-attested-native-verifier-profile.js';
import {
  assertNativeVerifierExecutionPolicyValidationProvenance,
  validateNativeVerifierExecutionPolicyAgainstProfile,
  type NativeRuntimeDependencyManifests,
  type NativeVerifierExecutionPolicy,
} from './native-verifier-execution-policy.js';

export const RPC_HEADER_ENCODING_REQUEST_SCHEMA =
  'e2s.substrate-rpc-header-encoding-request.v1';
export const RPC_HEADER_ENCODING_RESULT_SCHEMA =
  'e2s.substrate-rpc-header-encoding-result.v1';
export const RPC_WARP_INSPECTION_REQUEST_SCHEMA =
  'e2s.substrate-rpc-warp-inspection-request.v2';
export const RPC_WARP_INSPECTION_RESULT_SCHEMA =
  'e2s.substrate-rpc-warp-inspection-result.v2';
export const RPC_FINALITY_INSPECTION_REQUEST_SCHEMA =
  'e2s.substrate-rpc-finality-inspection-request.v1';
export const RPC_FINALITY_INSPECTION_RESULT_SCHEMA =
  'e2s.substrate-rpc-finality-inspection-result.v1';

const MAX_CODEC_REQUEST_BYTES = 32 * 1024 * 1024;
export const NATIVE_RPC_CODEC_STDOUT_LIMIT_BYTES = 16 * 1024 * 1024;
const MAX_CODEC_STDERR_BYTES = 64 * 1024;
const MAX_TIMEOUT_MS = 5 * 60_000;
const MAX_EXECUTABLE_ARGS = 16;
const MAX_EXECUTABLE_ARGV_BYTES = 256 * 1024;
const MAX_HEADERS = 4_096;
const MAX_HEADER_BYTES = 64 * 1024;
const MAX_WARP_PROOF_BYTES = 8 * 1024 * 1024;
const MAX_FINALITY_PROOF_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface RpcHeaderCodecObservation {
  expectedHashHex: string;
  header: SubstrateRpcHeaderObservation;
}

export interface EncodedRpcHeader {
  hashHex: string;
  number: string;
  parentHashHex: string;
  stateRootHex: string;
  headerScaleHex: string;
}

export interface RpcWarpInspection {
  sourceTargetHashHex: string;
  sourceTargetNumber: string;
  sourceTargetParentHashHex: string;
  sourceTargetHeaderScaleHex: string;
  sourceComplete: boolean;
  sourceFragmentCount: number;
  stoppedBeforeHorizon: boolean;
  selectedFragmentCount: number;
  selectedProofScaleHex: string | null;
  selectedTargetHashHex: string | null;
  selectedTargetNumber: string | null;
  selectedTargetParentHashHex: string | null;
  selectedTargetHeaderScaleHex: string | null;
  cryptographicallyVerified: false;
}

export interface RpcFinalityInspection {
  horizonHashHex: string;
  horizonNumber: string;
  canonicalJustificationScaleHex: string;
  unknownHeaderCount: number;
  cryptographicallyVerified: false;
}

export interface NativeSubstrateRpcProofCodec {
  readonly executionBoundary:
    | DirectNativeSubstrateRpcProofCodecExecutionBoundary
    | PolicyBoundContainedNativeSubstrateRpcProofCodecExecutionBoundary
    | AuthorityBoundNativeSubstrateRpcProofCodecExecutionBoundary;
  readonly executableSha256Hex: string;
  readonly executableInvocationSha256Hex: {
    encodeHeaders: string;
    inspectWarpProof: string;
    inspectFinalityProof: string;
  };
  encodeHeaders(observations: readonly RpcHeaderCodecObservation[]): Promise<EncodedRpcHeader[]>;
  inspectWarpProof(
    proofScaleHex: string,
    finalityHorizonNumber: string,
  ): Promise<RpcWarpInspection>;
  inspectFinalityProof(proofScaleHex: string): Promise<RpcFinalityInspection>;
}

export interface DirectNativeSubstrateRpcProofCodecExecutionBoundary {
  mode: 'direct-process-acquisition-only';
  executionPolicyValidated: false;
  containedProcessRequired: false;
  cryptographicVerificationProvided: false;
  settlementAuthorityGranted: false;
}

export interface PolicyBoundContainedNativeSubstrateRpcProofCodecExecutionBoundary {
  mode: 'policy-bound-contained-acquisition-only';
  executionPolicyValidatedPerLaunch: true;
  containedProcessRequired: true;
  cryptographicVerificationProvided: false;
  settlementAuthorityGranted: false;
}

export interface AuthorityBoundNativeSubstrateRpcProofCodecExecutionBoundary {
  mode: 'source-refreshed-authority-contained-acquisition-only';
  sourceOwnedAttestorLockReloadedPerLaunch: true;
  executionPolicyValidatedPerLaunch: true;
  installerEpochFloorRequired: true;
  containedProcessRequired: true;
  cryptographicVerificationProvided: false;
  settlementAuthorityGranted: false;
}

export interface DirectNativeSubstrateRpcProofCodec extends NativeSubstrateRpcProofCodec {
  readonly executionBoundary: DirectNativeSubstrateRpcProofCodecExecutionBoundary;
}

export interface PolicyBoundContainedNativeSubstrateRpcProofCodec
  extends NativeSubstrateRpcProofCodec {
  readonly executionBoundary: PolicyBoundContainedNativeSubstrateRpcProofCodecExecutionBoundary;
}

export interface AuthorityBoundNativeSubstrateRpcProofCodec
  extends NativeSubstrateRpcProofCodec {
  readonly executionBoundary: AuthorityBoundNativeSubstrateRpcProofCodecExecutionBoundary;
}

export interface NativeSubstrateRpcProofCodecOptions {
  executablePath: string;
  expectedExecutableSha256Hex: string;
  expectedExecutableInvocationSha256Hex: {
    encodeHeaders: string;
    inspectWarpProof: string;
    inspectFinalityProof: string;
  };
  executableArgs?: readonly string[];
  timeoutMs?: number;
}

export interface PolicyBoundContainedNativeSubstrateRpcProofCodecOptions {
  profile: NativeVerifierAttestationValidationReport;
  executionPolicy: NativeVerifierExecutionPolicy;
  runtimeDependencyManifests: NativeRuntimeDependencyManifests;
  launcherPath: string;
  codecExecutablePath: string;
}

interface CodecProcessInput {
  executablePath: string;
  executableArgs: string[];
  timeoutMs: number;
  requestBytes: Buffer;
}

interface CodecExecutionStrategy {
  verifyTargetWithNode: boolean;
  boundary: NativeSubstrateRpcProofCodec['executionBoundary'];
  runProcess(input: CodecProcessInput): Promise<Buffer>;
}

export function createNativeSubstrateRpcProofCodec(
  options: NativeSubstrateRpcProofCodecOptions,
): DirectNativeSubstrateRpcProofCodec {
  return createNativeSubstrateRpcProofCodecInternal(options, {
    verifyTargetWithNode: true,
    boundary: Object.freeze({
      mode: 'direct-process-acquisition-only',
      executionPolicyValidated: false,
      containedProcessRequired: false,
      cryptographicVerificationProvided: false,
      settlementAuthorityGranted: false,
    }),
    runProcess,
  }) as DirectNativeSubstrateRpcProofCodec;
}

export function createPolicyBoundContainedNativeSubstrateRpcProofCodec(
  options: PolicyBoundContainedNativeSubstrateRpcProofCodecOptions,
): PolicyBoundContainedNativeSubstrateRpcProofCodec {
  const policy = options?.executionPolicy;
  const codecTarget = policy?.targets?.codec;
  const executableSha256Hex = normalizeExecutableSha256Hex(
    codecTarget?.artifactSha256 === undefined
      ? undefined
      : `0x${codecTarget.artifactSha256}`,
    'policy-bound native RPC codec executable digest',
  );
  const launcherSha256Hex = normalizeExecutableSha256Hex(
    policy?.bindings?.launcher?.sha256 === undefined
      ? undefined
      : `0x${policy.bindings.launcher.sha256}`,
    'policy-bound native contained launcher digest',
  );
  const launcherPath = validateExecutablePath(options?.launcherPath);
  const codecExecutablePath = validateExecutablePath(options?.codecExecutablePath);
  const modes = [
    '--encode-headers',
    '--inspect-warp-proof',
    '--inspect-finality-proof',
  ] as const;
  const invocationPins = {
    encodeHeaders: deriveExecutableInvocationSha256Hex(executableSha256Hex, [modes[0]]),
    inspectWarpProof: deriveExecutableInvocationSha256Hex(executableSha256Hex, [modes[1]]),
    inspectFinalityProof: deriveExecutableInvocationSha256Hex(executableSha256Hex, [modes[2]]),
  };

  return createNativeSubstrateRpcProofCodecInternal({
    executablePath: codecExecutablePath,
    expectedExecutableSha256Hex: executableSha256Hex,
    expectedExecutableInvocationSha256Hex: invocationPins,
    executableArgs: [],
    timeoutMs: codecTarget?.limits?.timeoutMs,
  }, {
    verifyTargetWithNode: false,
    boundary: Object.freeze({
      mode: 'policy-bound-contained-acquisition-only',
      executionPolicyValidatedPerLaunch: true,
      containedProcessRequired: true,
      cryptographicVerificationProvided: false,
      settlementAuthorityGranted: false,
    }),
    async runProcess(input): Promise<Buffer> {
      const report = validateNativeVerifierExecutionPolicyAgainstProfile({
        profile: options.profile,
        policy,
        runtimeDependencyManifests: options.runtimeDependencyManifests,
        evaluatedAt: new Date().toISOString(),
      });
      assertNativeVerifierExecutionPolicyValidationProvenance({
        profile: options.profile,
        report,
      });
      if (
        input.executablePath !== codecExecutablePath
        || input.executableArgs.length !== 1
        || !modes.includes(input.executableArgs[0] as typeof modes[number])
      ) {
        throw new Error('policy-bound native RPC codec invocation is not exact');
      }
      const limits = policy.targets.codec.limits;
      const result = await runNativeContainedProcess({
        launcherPath,
        launcherSha256Hex,
        targetPath: codecExecutablePath,
        targetSha256Hex: executableSha256Hex,
        targetArgs: input.executableArgs,
        policyNotBeforeUnixMs: Date.parse(policy.validity.notBefore),
        policyExpiresAtUnixMs: Date.parse(policy.validity.expiresAt),
        timeoutMs: limits.timeoutMs,
        requestLimitBytes: limits.requestLimitBytes,
        stdoutLimitBytes: limits.stdoutLimitBytes,
        stderrLimitBytes: limits.stderrLimitBytes,
        requestBytes: input.requestBytes,
      });
      assertContainedCodecBoundary(result);
      return result.stdout;
    },
  }) as PolicyBoundContainedNativeSubstrateRpcProofCodec;
}

export function createAuthorityBoundNativeSubstrateRpcProofCodec(
  authority: NativeVerifierExecutionAuthority,
): AuthorityBoundNativeSubstrateRpcProofCodec {
  assertNativeVerifierExecutionAuthorityProvenance(authority);
  const declaration = authority.declaration;
  const modes = {
    '--encode-headers': 'encode-headers',
    '--inspect-warp-proof': 'inspect-warp-proof',
    '--inspect-finality-proof': 'inspect-finality-proof',
  } as const;

  return createNativeSubstrateRpcProofCodecInternal({
    executablePath: declaration.codecExecutablePath,
    expectedExecutableSha256Hex: declaration.codecExecutableSha256Hex,
    expectedExecutableInvocationSha256Hex:
      declaration.codecExecutableInvocationSha256Hex,
    executableArgs: [],
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }, {
    verifyTargetWithNode: false,
    boundary: Object.freeze({
      mode: 'source-refreshed-authority-contained-acquisition-only',
      sourceOwnedAttestorLockReloadedPerLaunch: true,
      executionPolicyValidatedPerLaunch: true,
      installerEpochFloorRequired: true,
      containedProcessRequired: true,
      cryptographicVerificationProvided: false,
      settlementAuthorityGranted: false,
    }),
    async runProcess(input): Promise<Buffer> {
      if (
        input.executablePath !== declaration.codecExecutablePath
        || input.executableArgs.length !== 1
      ) {
        throw new Error('authority-bound native RPC codec invocation is not exact');
      }
      const operation = modes[input.executableArgs[0] as keyof typeof modes];
      if (operation === undefined) {
        throw new Error('authority-bound native RPC codec operation is unsupported');
      }
      const result = await authority.execute({
        operation: operation as Exclude<NativeVerifierAuthorityOperation, 'verify-checkpoint'>,
        requestBytes: input.requestBytes,
      });
      assertNativeVerifierExecutionAuthorityResultProvenance({ authority, result });
      if (result.operation !== operation) {
        throw new Error('authority-bound native RPC codec result operation does not match');
      }
      return Buffer.from(result.stdout);
    },
  }) as AuthorityBoundNativeSubstrateRpcProofCodec;
}

function createNativeSubstrateRpcProofCodecInternal(
  options: NativeSubstrateRpcProofCodecOptions,
  execution: CodecExecutionStrategy,
): NativeSubstrateRpcProofCodec {
  const executablePath = validateExecutablePath(options?.executablePath);
  const expectedExecutableSha256Hex = normalizeExecutableSha256Hex(
    options?.expectedExecutableSha256Hex,
    'native RPC codec executable digest',
  );
  const executableArgs = validateExecutableArgs(options?.executableArgs ?? []);
  const timeoutMs = validateTimeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const invocationPins = {
    encodeHeaders: normalizeExecutableSha256Hex(
      options?.expectedExecutableInvocationSha256Hex?.encodeHeaders,
      'native RPC codec header invocation digest',
    ),
    inspectWarpProof: normalizeExecutableSha256Hex(
      options?.expectedExecutableInvocationSha256Hex?.inspectWarpProof,
      'native RPC codec warp invocation digest',
    ),
    inspectFinalityProof: normalizeExecutableSha256Hex(
      options?.expectedExecutableInvocationSha256Hex?.inspectFinalityProof,
      'native RPC codec finality invocation digest',
    ),
  };
  const runPinnedCodec = async (
    mode: '--encode-headers' | '--inspect-warp-proof' | '--inspect-finality-proof',
    expectedInvocationSha256Hex: string,
    request: unknown,
  ): Promise<unknown> => {
    verifyExecutableInvocationSha256(
      expectedExecutableSha256Hex,
      [...executableArgs, mode],
      expectedInvocationSha256Hex,
      'native RPC codec executable',
    );
    if (execution.verifyTargetWithNode) {
      await verifyExecutableSha256(
        executablePath,
        expectedExecutableSha256Hex,
        'native RPC codec executable',
      );
    }
    const result = await runCodec(
      executablePath,
      executableArgs,
      timeoutMs,
      mode,
      request,
      execution.runProcess,
    );
    if (execution.verifyTargetWithNode) {
      await verifyExecutableSha256(
        executablePath,
        expectedExecutableSha256Hex,
        'native RPC codec executable after execution',
      );
    }
    return result;
  };

  return {
    executionBoundary: execution.boundary,
    executableSha256Hex: expectedExecutableSha256Hex,
    executableInvocationSha256Hex: invocationPins,
    async encodeHeaders(observations): Promise<EncodedRpcHeader[]> {
      if (!Array.isArray(observations) || observations.length === 0 || observations.length > MAX_HEADERS) {
        throw new Error(`RPC header codec requires between 1 and ${MAX_HEADERS} observations`);
      }
      const normalized = observations.map((observation, index) => ({
        expectedHashHex: hashHex(observation?.expectedHashHex, `header observation ${index} hash`),
        header: normalizeRpcHeader(observation?.header, `header observation ${index}`),
      }));
      const result = await runPinnedCodec(
        '--encode-headers',
        invocationPins.encodeHeaders,
        { schema: RPC_HEADER_ENCODING_REQUEST_SCHEMA, headers: normalized },
      );
      const record = exactRecord(result, ['schema', 'headers'], 'header codec result');
      requireLiteral(record.schema, RPC_HEADER_ENCODING_RESULT_SCHEMA, 'header codec result schema');
      if (!Array.isArray(record.headers) || record.headers.length !== normalized.length) {
        throw new Error('header codec result count does not match the request');
      }
      const headers = record.headers.map((value, index) => {
        const header = exactRecord(value, [
          'hashHex',
          'number',
          'parentHashHex',
          'stateRootHex',
          'headerScaleHex',
        ], `header codec result ${index}`);
        const hash = hashHex(header.hashHex, `header codec result ${index} hash`);
        if (hash !== normalized[index].expectedHashHex) {
          throw new Error(`header codec result ${index} hash does not match the requested hash`);
        }
        return {
          hashHex: hash,
          number: uint32Decimal(header.number, `header codec result ${index} number`),
          parentHashHex: hashHex(
            header.parentHashHex,
            `header codec result ${index} parent hash`,
          ),
          stateRootHex: hashHex(
            header.stateRootHex,
            `header codec result ${index} state root`,
          ),
          headerScaleHex: byteHex(
            header.headerScaleHex,
            MAX_HEADER_BYTES,
            `header codec result ${index} SCALE header`,
          ),
        };
      });
      return deepFreeze(headers);
    },

    async inspectWarpProof(proofScaleHex, finalityHorizonNumber): Promise<RpcWarpInspection> {
      const proof = byteHex(proofScaleHex, MAX_WARP_PROOF_BYTES, 'warp proof');
      const horizonNumber = uint32Decimal(
        finalityHorizonNumber,
        'warp finality horizon number',
      );
      const result = await runPinnedCodec(
        '--inspect-warp-proof',
        invocationPins.inspectWarpProof,
        {
          schema: RPC_WARP_INSPECTION_REQUEST_SCHEMA,
          proofScaleHex: proof,
          finalityHorizonNumber: horizonNumber,
        },
      );
      const record = exactRecord(result, [
        'schema',
        'sourceTargetHashHex',
        'sourceTargetNumber',
        'sourceTargetParentHashHex',
        'sourceTargetHeaderScaleHex',
        'sourceComplete',
        'sourceFragmentCount',
        'stoppedBeforeHorizon',
        'selectedFragmentCount',
        'selectedProofScaleHex',
        'selectedTargetHashHex',
        'selectedTargetNumber',
        'selectedTargetParentHashHex',
        'selectedTargetHeaderScaleHex',
        'cryptographicallyVerified',
      ], 'warp codec result');
      requireLiteral(record.schema, RPC_WARP_INSPECTION_RESULT_SCHEMA, 'warp codec result schema');
      requireLiteral(
        record.cryptographicallyVerified,
        false,
        'warp codec verification boundary',
      );
      if (
        typeof record.sourceComplete !== 'boolean' ||
        typeof record.stoppedBeforeHorizon !== 'boolean'
      ) {
        throw new Error('warp codec boundary flags must be boolean');
      }
      const sourceTargetNumber = uint32Decimal(
        record.sourceTargetNumber,
        'warp codec source target number',
      );
      const sourceFragmentCount = boundedInteger(
        record.sourceFragmentCount,
        1,
        MAX_HEADERS,
        'warp source fragment count',
      );
      const selectedFragmentCount = boundedInteger(
        record.selectedFragmentCount,
        0,
        sourceFragmentCount,
        'warp selected fragment count',
      );
      if (
        record.stoppedBeforeHorizon !==
        (selectedFragmentCount < sourceFragmentCount)
      ) {
        throw new Error('warp codec selection boundary is inconsistent');
      }
      const selectedFields = [
        record.selectedProofScaleHex,
        record.selectedTargetHashHex,
        record.selectedTargetNumber,
        record.selectedTargetParentHashHex,
        record.selectedTargetHeaderScaleHex,
      ];
      if (selectedFragmentCount === 0 && selectedFields.some(value => value !== null)) {
        throw new Error('warp codec emitted selected material for an empty prefix');
      }
      if (selectedFragmentCount > 0 && selectedFields.some(value => value === null)) {
        throw new Error('warp codec omitted selected material for a nonempty prefix');
      }
      const selectedTargetNumber = record.selectedTargetNumber === null
        ? null
        : uint32Decimal(record.selectedTargetNumber, 'warp codec selected target number');
      if (selectedTargetNumber !== null && BigInt(selectedTargetNumber) >= BigInt(horizonNumber)) {
        throw new Error('warp codec selected target must precede the finality horizon');
      }
      const inspected: RpcWarpInspection = {
        sourceTargetHashHex: hashHex(record.sourceTargetHashHex, 'warp codec source target hash'),
        sourceTargetNumber,
        sourceTargetParentHashHex: hashHex(
          record.sourceTargetParentHashHex,
          'warp codec source target parent hash',
        ),
        sourceTargetHeaderScaleHex: byteHex(
          record.sourceTargetHeaderScaleHex,
          MAX_HEADER_BYTES,
          'warp codec source target header',
        ),
        sourceComplete: record.sourceComplete,
        sourceFragmentCount,
        stoppedBeforeHorizon: record.stoppedBeforeHorizon,
        selectedFragmentCount,
        selectedProofScaleHex: record.selectedProofScaleHex === null
          ? null
          : byteHex(record.selectedProofScaleHex, MAX_WARP_PROOF_BYTES, 'warp selected proof'),
        selectedTargetHashHex: record.selectedTargetHashHex === null
          ? null
          : hashHex(record.selectedTargetHashHex, 'warp codec selected target hash'),
        selectedTargetNumber,
        selectedTargetParentHashHex: record.selectedTargetParentHashHex === null
          ? null
          : hashHex(
            record.selectedTargetParentHashHex,
            'warp codec selected target parent hash',
          ),
        selectedTargetHeaderScaleHex: record.selectedTargetHeaderScaleHex === null
          ? null
          : byteHex(
            record.selectedTargetHeaderScaleHex,
            MAX_HEADER_BYTES,
            'warp codec selected target header',
          ),
        cryptographicallyVerified: false,
      };
      return deepFreeze(inspected);
    },

    async inspectFinalityProof(proofScaleHex): Promise<RpcFinalityInspection> {
      const proof = byteHex(proofScaleHex, MAX_FINALITY_PROOF_BYTES, 'finality proof');
      const result = await runPinnedCodec(
        '--inspect-finality-proof',
        invocationPins.inspectFinalityProof,
        { schema: RPC_FINALITY_INSPECTION_REQUEST_SCHEMA, proofScaleHex: proof },
      );
      const record = exactRecord(result, [
        'schema',
        'horizonHashHex',
        'horizonNumber',
        'canonicalJustificationScaleHex',
        'unknownHeaderCount',
        'cryptographicallyVerified',
      ], 'finality codec result');
      requireLiteral(
        record.schema,
        RPC_FINALITY_INSPECTION_RESULT_SCHEMA,
        'finality codec result schema',
      );
      requireLiteral(
        record.cryptographicallyVerified,
        false,
        'finality codec verification boundary',
      );
      const inspected: RpcFinalityInspection = {
        horizonHashHex: hashHex(record.horizonHashHex, 'finality codec horizon hash'),
        horizonNumber: uint32Decimal(record.horizonNumber, 'finality codec horizon number'),
        canonicalJustificationScaleHex: byteHex(
          record.canonicalJustificationScaleHex,
          MAX_FINALITY_PROOF_BYTES,
          'finality codec canonical justification',
        ),
        unknownHeaderCount: boundedInteger(
          record.unknownHeaderCount,
          0,
          MAX_HEADERS,
          'finality unknown header count',
        ),
        cryptographicallyVerified: false,
      };
      return deepFreeze(inspected);
    },
  };
}

async function runCodec(
  executablePath: string,
  executableArgs: readonly string[],
  timeoutMs: number,
  mode: string,
  request: unknown,
  processRunner: CodecExecutionStrategy['runProcess'],
): Promise<unknown> {
  const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
  if (requestBytes.length > MAX_CODEC_REQUEST_BYTES) {
    throw new Error(`native RPC codec request exceeds ${MAX_CODEC_REQUEST_BYTES} bytes`);
  }
  const stdout = await processRunner({
    executablePath,
    executableArgs: [...executableArgs, mode],
    timeoutMs,
    requestBytes,
  });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text: string;
  try {
    text = decoder.decode(stdout);
  } catch {
    throw new Error('native RPC codec stdout is not valid UTF-8');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('native RPC codec stdout is not one JSON object');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('native RPC codec stdout must be one JSON object');
  }
  return parsed;
}

async function runProcess(input: CodecProcessInput): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    let child;
    try {
      child = spawn(input.executablePath, input.executableArgs, {
        shell: false,
        windowsHide: true,
        cwd: dirname(input.executablePath),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: minimalNativeEnvironment(),
      });
    } catch {
      reject(new Error('failed to spawn native RPC codec'));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let termination: 'timeout' | 'stdout' | 'stderr' | null = null;
    let settled = false;
    const finish = (error?: Error, stdout?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(stdout ?? Buffer.alloc(0));
    };
    const terminate = (reason: typeof termination) => {
      if (termination !== null) return;
      termination = reason;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => terminate('timeout'), input.timeoutMs);
    timer.unref();

    child.once('error', () => finish(new Error('failed to spawn native RPC codec')));
    child.stdout.on('data', (chunk: Buffer) => {
      if (termination !== null) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > NATIVE_RPC_CODEC_STDOUT_LIMIT_BYTES) {
        terminate('stdout');
        return;
      }
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (termination !== null) return;
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_CODEC_STDERR_BYTES) terminate('stderr');
    });
    child.once('close', code => {
      if (termination === 'timeout') {
        finish(new Error(`native RPC codec timed out after ${input.timeoutMs} ms`));
      } else if (termination === 'stdout') {
        finish(new Error(
          `native RPC codec stdout exceeds ${NATIVE_RPC_CODEC_STDOUT_LIMIT_BYTES} bytes`,
        ));
      } else if (termination === 'stderr') {
        finish(new Error(`native RPC codec stderr exceeds ${MAX_CODEC_STDERR_BYTES} bytes`));
      } else if (code !== 0) {
        finish(new Error('native RPC codec rejected the request'));
      } else {
        finish(undefined, Buffer.concat(stdoutChunks, stdoutBytes));
      }
    });
    child.stdin.once('error', () => finish(new Error('failed to write native RPC codec request')));
    child.stdin.end(input.requestBytes);
  });
}

function assertContainedCodecBoundary(
  value: NativeContainedProcessResult,
): asserts value is NativeContainedProcessResult {
  const result = exactRecord(value, ['stdout', 'boundary'], 'contained native RPC codec result');
  if (!Buffer.isBuffer(result.stdout)) {
    throw new Error('contained native RPC codec stdout must be a Buffer');
  }
  const boundary = exactRecord(result.boundary, [
    'trustedLauncherInstallationRequired',
    'launcherDigestMatchedBeforeAndAfter',
    'brokerSelfImageBoundToAuthorityRecordV2',
    'launcherInstallationActivationCampaignCompleted',
    'launcherAtomicBootstrapProven',
    'targetAtomicityDelegatedToBroker',
    'targetAtomicityObservedByTypeScript',
    'executionAdmissionGranted',
    'gate5Closed',
    'productionReady',
  ], 'contained native RPC codec boundary');
  const expected = {
    trustedLauncherInstallationRequired: true,
    launcherDigestMatchedBeforeAndAfter: true,
    brokerSelfImageBoundToAuthorityRecordV2: true,
    launcherInstallationActivationCampaignCompleted: false,
    launcherAtomicBootstrapProven: false,
    targetAtomicityDelegatedToBroker: true,
    targetAtomicityObservedByTypeScript: false,
    executionAdmissionGranted: false,
    gate5Closed: false,
    productionReady: false,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (boundary[key] !== expectedValue) {
      throw new Error(`contained native RPC codec boundary ${key} is invalid`);
    }
  }
}

function validateExecutablePath(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error('native RPC codec path must be an absolute path');
  }
  return value;
}

function validateExecutableArgs(values: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length > MAX_EXECUTABLE_ARGS) {
    throw new Error(`native RPC codec accepts at most ${MAX_EXECUTABLE_ARGS} fixed arguments`);
  }
  let bytes = 0;
  return values.map((value, index) => {
    if (typeof value !== 'string' || value.includes('\0')) {
      throw new Error(`native RPC codec argument ${index} is invalid`);
    }
    bytes += Buffer.byteLength(value, 'utf8');
    if (bytes > MAX_EXECUTABLE_ARGV_BYTES) {
      throw new Error(`native RPC codec arguments exceed ${MAX_EXECUTABLE_ARGV_BYTES} bytes`);
    }
    return value;
  });
}

function validateTimeout(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > MAX_TIMEOUT_MS) {
    throw new Error(`native RPC codec timeout must be between 1 and ${MAX_TIMEOUT_MS} ms`);
  }
  return Number(value);
}

function normalizeRpcHeader(value: unknown, label: string): SubstrateRpcHeaderObservation {
  const record = exactRecord(value, [
    'parentHash',
    'number',
    'stateRoot',
    'extrinsicsRoot',
    'digest',
  ], label);
  const digest = exactRecord(record.digest, ['logs'], `${label} digest`);
  if (!Array.isArray(digest.logs) || digest.logs.length > 256) {
    throw new Error(`${label} digest logs must be a bounded array`);
  }
  return {
    parentHash: hashHex(record.parentHash, `${label} parent hash`),
    number: uint32RpcHex(record.number, `${label} number`),
    stateRoot: hashHex(record.stateRoot, `${label} state root`),
    extrinsicsRoot: hashHex(record.extrinsicsRoot, `${label} extrinsics root`),
    digest: {
      logs: digest.logs.map((log, index) =>
        byteHex(log, MAX_HEADER_BYTES, `${label} digest log ${index}`)),
    },
  };
}

function exactRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
  return record;
}

function hashHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be lower-case 0x-prefixed 32-byte hex`);
  }
  return value;
}

function byteHex(value: unknown, maximumBytes: number, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty lower-case 0x-prefixed whole-byte hex`);
  }
  if ((value.length - 2) / 2 > maximumBytes) {
    throw new Error(`${label} exceeds ${maximumBytes} bytes`);
  }
  return value;
}

function uint32Decimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical decimal uint32 string`);
  }
  if (BigInt(value) > 0xffff_ffffn) throw new Error(`${label} exceeds uint32`);
  return value;
}

function uint32RpcHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value)) {
    throw new Error(`${label} must be canonical lower-case uint32 hex`);
  }
  if (BigInt(value) > 0xffff_ffffn) throw new Error(`${label} exceeds uint32`);
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return Number(value);
}

function requireLiteral(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new Error(`${label} must equal ${String(expected)}`);
}

function minimalNativeEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'PATH',
    'PATHEXT',
    'LD_LIBRARY_PATH',
    'DYLD_LIBRARY_PATH',
  ]) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return environment;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
