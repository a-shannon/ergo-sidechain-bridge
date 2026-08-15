import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import { sha256CanonicalJson } from './strict-json.js';
import {
  buildSubstrateFederatedSettlementFamilyV1CompilerRequest,
  resolveSubstrateFederatedSettlementFamilyV1PooledReserveSource,
  resolveSubstrateFederatedSettlementFamilyV1PooledReserveTemplateSource,
  resolveSubstrateFederatedSettlementFamilyV1PredecessorSources,
  type BuildSubstrateFederatedSettlementFamilyV1CompilerRequestInput,
  type SubstrateFederatedSettlementFamilyV1CompilerRequest,
  type SubstrateFederatedSettlementFamilyV1Profile,
} from './substrate-federated-settlement-family-v1.js';
import {
  assertSubstrateFederatedTrackerJvmCompilerReceiptV1,
  executePinnedFederatedJvmCompilerV1,
  validateSubstrateFederatedTrackerJvmCompilerLockV1,
  type SubstrateFederatedTrackerJvmCompilerLockV1,
  type SubstrateFederatedTrackerJvmCompilerReceiptV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import type {
  SubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';

export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V1_SCHEMA =
  'e2s.substrate-federated-settlement-family-jvm-compiler-receipt.v1' as const;

const REQUEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_REQUEST_V1';
const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V1';
const INPUT_PREFIX = 'BRIDGE_FED_FAMILY_REQUEST';
const META_PREFIX = 'BRIDGE_FED_FAMILY_META';
const CONTRACT_PREFIX = 'BRIDGE_FED_FAMILY_CONTRACT';
const CONTRACT_ROLES = [
  'duplicatePrevention',
  'sourceLock',
  'pooledReserve',
] as const;
const processReceipts = new WeakSet<object>();
const parsedObservations = new WeakSet<object>();

type ContractRole = typeof CONTRACT_ROLES[number];

export interface CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input {
  readonly trackerRequest:
    Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
  readonly trackerReceipt:
    Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
  readonly templates:
    BuildSubstrateFederatedSettlementFamilyV1CompilerRequestInput['templates'];
  readonly duplicatePreventionGenesisInputBoxIdHex: string;
  readonly pooledReserveGenesisInputBoxIdHex: string;
}

export interface SubstrateFederatedSettlementFamilyJvmCompilerContractV1 {
  readonly resolvedSourceSha256Hex: string;
  readonly propositionBytes: number;
  readonly propositionHex: string;
  readonly propositionSha256Hex: string;
  readonly contractIdHex: string;
}

export interface SubstrateFederatedSettlementFamilyJvmCompilerObservationV1 {
  readonly authority: 'observation-only';
  readonly requestDigestHex: string;
  readonly contracts: Readonly<Record<
    ContractRole,
    Readonly<SubstrateFederatedSettlementFamilyJvmCompilerContractV1>
  >>;
  readonly metadata: Readonly<{
    readonly networkPrefix: 16;
    readonly scriptVersion: 3;
    readonly treeVersion: 0;
    readonly javaMajorVersion: '17';
    readonly scalaVersion: '2.12.20';
    readonly sigmaStateArtifactSha256: string;
    readonly dependencyClasspathSha256: string;
    readonly javaHomeSha256: string;
    readonly compiledToolClassesSha256: string;
  }>;
}

export interface SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V1_SCHEMA;
  readonly version: 1;
  readonly receiptDigestHex: string;
  readonly trackerCompilerRequestDigestHex: string;
  readonly trackerCompilerReceiptDigestHex: string;
  readonly familyCompilerRequestDigestHex: string;
  readonly compilerLockDigestHex: string;
  readonly compiler: Readonly<{
    readonly execution: 'process-owned-dependent-family-jvm';
    readonly sigmaStateVersion: '6.0.2';
    readonly sigmaStateArtifactSha256: string;
    readonly dependencyClasspathSha256: string;
    readonly javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS';
    readonly javaHomeSha256: string;
    readonly toolSha256: string;
    readonly compiledToolClassesSha256: string;
  }>;
  readonly profile: Readonly<SubstrateFederatedSettlementFamilyV1Profile>;
  readonly contracts: Readonly<Record<
    ContractRole,
    Readonly<SubstrateFederatedSettlementFamilyJvmCompilerContractV1>
  >>;
  readonly checks: Readonly<{
    readonly sameProcessTrackerRequestVerified: true;
    readonly sameProcessTrackerReceiptVerified: true;
    readonly trackerBindingDerivedInternally: true;
    readonly processOwnedFamilyRequestCreated: true;
    readonly predecessorContractsCompiledFirst: true;
    readonly reserveContractIdsDerivedFromPropositions: true;
    readonly reserveSourceDependencyRecomputed: true;
    readonly exactCompilerOutputBound: true;
    readonly callerTrackerIdentityAccepted: false;
    readonly callerFamilyIdentityAccepted: false;
    readonly callerAuthorityClaimsAccepted: false;
  }>;
  readonly boundaries: Readonly<{
    readonly profileActivated: false;
    readonly targetGenesisBoxesObserved: false;
    readonly targetNetworkIdentityAuthenticated: false;
    readonly jvmCompilationReplayed: true;
    readonly compilerReceiptAuthenticated: true;
    readonly trustedHostRequired: true;
    readonly concurrentSameUserTamperingOutOfScope: true;
    readonly nodeCheckPerformed: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export async function compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1(
  input: Readonly<
    CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input
  >,
): Promise<Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>> {
  const {
    trackerRequest,
    trackerReceipt,
    familyRequest,
    familyCompilerRequestDigestHex,
  } = deriveFamilyCompilerRequest(input);
  const predecessors =
    resolveSubstrateFederatedSettlementFamilyV1PredecessorSources(familyRequest);
  const reserveTemplate =
    resolveSubstrateFederatedSettlementFamilyV1PooledReserveTemplateSource(
      familyRequest,
    );
  const duplicatePrevention = sourceRecord(predecessors.duplicatePrevention);
  const sourceLock = sourceRecord(predecessors.sourceLock);
  const pooledReserve = sourceRecord(reserveTemplate);
  const compilerInput = [
    INPUT_PREFIX,
    '1',
    familyCompilerRequestDigestHex,
    duplicatePrevention.sha256Hex,
    duplicatePrevention.base64,
    sourceLock.sha256Hex,
    sourceLock.base64,
    pooledReserve.sha256Hex,
    pooledReserve.base64,
  ].join('\t') + '\n';
  const execution = await executePinnedFederatedJvmCompilerV1(
    Buffer.from(compilerInput, 'utf8'),
  );
  const observation =
    parseSubstrateFederatedSettlementFamilyJvmCompilerOutputV1(
      execution.output,
      {
        requestDigestHex: familyCompilerRequestDigestHex,
        lock: execution.compilerLock,
      },
    );
  const boundObservation =
    bindSubstrateFederatedSettlementFamilyJvmCompilerObservationV1(
      observation,
      familyRequest,
    );

  const binding = {
    schema:
      SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V1_SCHEMA,
    version: 1 as const,
    trackerCompilerRequestDigestHex: trackerRequest.requestDigestHex,
    trackerCompilerReceiptDigestHex: trackerReceipt.receiptDigestHex,
    familyCompilerRequestDigestHex,
    compilerLockDigestHex: execution.compilerLockDigestHex,
    compiler: {
      execution: 'process-owned-dependent-family-jvm' as const,
      sigmaStateVersion: execution.compilerLock.sigmaStateVersion,
      sigmaStateArtifactSha256:
        observation.metadata.sigmaStateArtifactSha256,
      dependencyClasspathSha256:
        observation.metadata.dependencyClasspathSha256,
      javaDistribution: execution.compilerLock.javaDistribution,
      javaHomeSha256: observation.metadata.javaHomeSha256,
      toolSha256: execution.compilerLock.toolSha256,
      compiledToolClassesSha256:
        observation.metadata.compiledToolClassesSha256,
    },
    profile: familyRequest.profile,
    contracts: boundObservation.contracts,
    checks: {
      sameProcessTrackerRequestVerified: true as const,
      sameProcessTrackerReceiptVerified: true as const,
      trackerBindingDerivedInternally: true as const,
      processOwnedFamilyRequestCreated: true as const,
      predecessorContractsCompiledFirst: true as const,
      reserveContractIdsDerivedFromPropositions: true as const,
      reserveSourceDependencyRecomputed: true as const,
      exactCompilerOutputBound: true as const,
      callerTrackerIdentityAccepted: false as const,
      callerFamilyIdentityAccepted: false as const,
      callerAuthorityClaimsAccepted: false as const,
    },
    boundaries: receiptBoundaries(),
  };
  const receipt = deepFreeze({
    ...binding,
    receiptDigestHex: sha256CanonicalJson(binding, RECEIPT_DIGEST_DOMAIN),
  });
  processReceipts.add(receipt);
  return receipt;
}

export function assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
  receipt: Readonly<
    SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1
  >,
  expectedInput: Readonly<
    CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input
  >,
): Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1> {
  const expected = deriveFamilyCompilerRequest(expectedInput);
  if (!processReceipts.has(receipt)) {
    throw new Error(
      'federated settlement-family JVM compiler receipt lacks process provenance',
    );
  }
  if (
    receipt.trackerCompilerRequestDigestHex
      !== expected.trackerRequest.requestDigestHex
    || receipt.trackerCompilerReceiptDigestHex
      !== expected.trackerReceipt.receiptDigestHex
    || receipt.familyCompilerRequestDigestHex
      !== expected.familyCompilerRequestDigestHex
  ) {
    throw new Error(
      'federated settlement-family JVM compiler family binding drifted',
    );
  }
  return receipt;
}

/** Parse family compiler output as data only; this grants no provenance. */
export function parseSubstrateFederatedSettlementFamilyJvmCompilerOutputV1(
  outputInput: Buffer | string,
  expected: Readonly<{
    readonly requestDigestHex: string;
    readonly lock: Readonly<SubstrateFederatedTrackerJvmCompilerLockV1>;
  }>,
): Readonly<SubstrateFederatedSettlementFamilyJvmCompilerObservationV1> {
  assertExactKeys(expected, [
    'requestDigestHex',
    'lock',
  ], 'federated settlement-family JVM compiler output expectation');
  const lock = validateSubstrateFederatedTrackerJvmCompilerLockV1(expected.lock);
  const requestDigestHex = fixedSha256(
    expected.requestDigestHex,
    'federated settlement-family compiler request digest',
  );
  const outputBytes = Buffer.isBuffer(outputInput)
    ? Buffer.from(outputInput)
    : Buffer.from(outputInput, 'utf8');
  if (
    outputBytes.length === 0
    || outputBytes.length > lock.maximumOutputBytes
    || outputBytes.includes(0)
  ) {
    throw new Error('federated settlement-family JVM compiler output size is invalid');
  }
  const output = outputBytes.toString('utf8');
  if (!Buffer.from(output, 'utf8').equals(outputBytes)) {
    throw new Error(
      'federated settlement-family JVM compiler output is not canonical UTF-8',
    );
  }
  if (output.includes('\r') || !output.endsWith('\n')) {
    throw new Error('federated settlement-family JVM compiler output must be LF-only');
  }
  const lines = output.slice(0, -1).split('\n');
  if (lines.length !== 4) {
    throw new Error(
      'federated settlement-family JVM compiler output must contain four records',
    );
  }
  const metadata = lines[0].split('\t');
  if (
    metadata.length !== 12
    || metadata[0] !== META_PREFIX
    || metadata[1] !== '1'
    || metadata[2] !== String(lock.networkPrefix)
    || metadata[3] !== String(lock.scriptVersion)
    || metadata[4] !== String(lock.treeVersion)
    || metadata[5] !== String(lock.javaMajorVersion)
    || metadata[6] !== lock.scalaVersion
    || metadata[7] !== lock.sigmaStateArtifactSha256
    || metadata[8] !== lock.dependencyClasspathSha256
    || metadata[9] !== lock.javaHomeSha256
    || metadata[10] !== lock.compiledToolClassesSha256
    || metadata[11] !== requestDigestHex
  ) {
    throw new Error('federated settlement-family JVM compiler metadata drifted');
  }
  const contracts = Object.fromEntries(CONTRACT_ROLES.map((role, index) => [
    role,
    parseContract(lines[index + 1], role),
  ])) as Record<
    ContractRole,
    Readonly<SubstrateFederatedSettlementFamilyJvmCompilerContractV1>
  >;
  const observation = deepFreeze({
    authority: 'observation-only' as const,
    requestDigestHex,
    contracts,
    metadata: {
      networkPrefix: 16 as const,
      scriptVersion: 3 as const,
      treeVersion: 0 as const,
      javaMajorVersion: '17' as const,
      scalaVersion: '2.12.20' as const,
      sigmaStateArtifactSha256: metadata[7],
      dependencyClasspathSha256: metadata[8],
      javaHomeSha256: metadata[9],
      compiledToolClassesSha256: metadata[10],
    },
  });
  parsedObservations.add(observation);
  return observation;
}

export function bindSubstrateFederatedSettlementFamilyJvmCompilerObservationV1(
  observation: Readonly<
    SubstrateFederatedSettlementFamilyJvmCompilerObservationV1
  >,
  familyRequest: Readonly<
    SubstrateFederatedSettlementFamilyV1CompilerRequest
  >,
): Readonly<SubstrateFederatedSettlementFamilyJvmCompilerObservationV1> {
  if (!parsedObservations.has(observation)) {
    throw new Error(
      'federated settlement-family JVM compiler observation lacks parser provenance',
    );
  }
  const predecessors =
    resolveSubstrateFederatedSettlementFamilyV1PredecessorSources(familyRequest);
  if (
    observation.contracts.duplicatePrevention.resolvedSourceSha256Hex
      !== sha256Bytes(Buffer.from(predecessors.duplicatePrevention, 'ascii'))
    || observation.contracts.sourceLock.resolvedSourceSha256Hex
      !== sha256Bytes(Buffer.from(predecessors.sourceLock, 'ascii'))
  ) {
    throw new Error('federated settlement predecessor source binding drifted');
  }
  const resolvedReserve =
    resolveSubstrateFederatedSettlementFamilyV1PooledReserveSource(
      familyRequest,
      {
        duplicatePreventionContractIdHex:
          observation.contracts.duplicatePrevention.contractIdHex,
        sourceLockContractIdHex:
          observation.contracts.sourceLock.contractIdHex,
      },
    );
  if (
    observation.contracts.pooledReserve.resolvedSourceSha256Hex
      !== sha256Bytes(Buffer.from(resolvedReserve, 'ascii'))
  ) {
    throw new Error('federated settlement reserve dependency binding drifted');
  }
  return observation;
}

function parseContract(
  line: string,
  expectedRole: ContractRole,
): Readonly<SubstrateFederatedSettlementFamilyJvmCompilerContractV1> {
  const fields = line.split('\t');
  if (
    fields.length !== 7
    || fields[0] !== CONTRACT_PREFIX
    || fields[1] !== expectedRole
  ) {
    throw new Error(
      `${expectedRole} federated settlement-family compiler record drifted`,
    );
  }
  const resolvedSourceSha256Hex = fixedSha256(
    fields[2],
    `${expectedRole} resolved source digest`,
  );
  const propositionBytes = positiveInteger(
    fields[3],
    `${expectedRole} proposition bytes`,
  );
  if (propositionBytes >= 4096) {
    throw new Error(`${expectedRole} proposition exceeds the supported bound`);
  }
  const propositionHex = variableHex(
    fields[4],
    `${expectedRole} proposition`,
  );
  const proposition = Buffer.from(propositionHex, 'hex');
  const propositionSha256Hex = fixedSha256(
    fields[5],
    `${expectedRole} proposition digest`,
  );
  const contractIdHex = fixedSha256(
    fields[6],
    `${expectedRole} contract ID`,
  );
  if (
    proposition.length !== propositionBytes
    || sha256Bytes(proposition) !== propositionSha256Hex
    || blake2b256Hex(proposition) !== contractIdHex
  ) {
    throw new Error(`${expectedRole} proposition identity drifted`);
  }
  return deepFreeze({
    resolvedSourceSha256Hex,
    propositionBytes,
    propositionHex,
    propositionSha256Hex,
    contractIdHex,
  });
}

function sourceRecord(source: string): Readonly<{
  readonly sha256Hex: string;
  readonly base64: string;
}> {
  const bytes = Buffer.from(source, 'ascii');
  if (
    bytes.length === 0
    || bytes.length > 512 * 1024
    || bytes.includes(0)
    || source.includes('\r')
    || !Buffer.from(source, 'utf8').equals(bytes)
  ) {
    throw new Error('federated settlement-family source is outside the compiler bound');
  }
  return Object.freeze({
    sha256Hex: sha256Bytes(bytes),
    base64: bytes.toString('base64'),
  });
}

function deriveFamilyCompilerRequest(
  input: Readonly<
    CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input
  >,
): Readonly<{
  readonly trackerRequest:
    Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
  readonly trackerReceipt:
    Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
  readonly familyRequest:
    Readonly<SubstrateFederatedSettlementFamilyV1CompilerRequest>;
  readonly familyCompilerRequestDigestHex: string;
}> {
  assertExactKeys(input, [
    'trackerRequest',
    'trackerReceipt',
    'templates',
    'duplicatePreventionGenesisInputBoxIdHex',
    'pooledReserveGenesisInputBoxIdHex',
  ], 'federated settlement-family JVM compiler input');
  const trackerReceipt = assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
    input.trackerReceipt,
    input.trackerRequest,
  );
  const trackerRequest = input.trackerRequest;
  const familyRequest = buildSubstrateFederatedSettlementFamilyV1CompilerRequest({
    templates: input.templates,
    duplicatePreventionGenesisInputBoxIdHex:
      input.duplicatePreventionGenesisInputBoxIdHex,
    pooledReserveGenesisInputBoxIdHex:
      input.pooledReserveGenesisInputBoxIdHex,
    tracker: {
      contractIdHex: trackerReceipt.contract.contractIdHex,
      templateSourceSha256Hex:
        trackerRequest.template.templateSourceSha256Hex,
      trackerNftIdHex: trackerRequest.trackerNftIdHex,
      sourceNetworkIdHex: trackerRequest.application.sourceNetworkIdHex,
      sidechainIdHex: trackerRequest.application.sidechainIdHex,
      bridgeAddressHex: trackerRequest.application.bridgeAddressHex,
      tokenAddressHex: trackerRequest.application.tokenAddressHex,
      runtimeProfileIdHex: trackerRequest.application.runtimeProfileIdHex,
      settlementProfileIdHex:
        trackerRequest.application.settlementProfileIdHex,
      federationProfileIdHex: trackerRequest.profile.profileIdHex,
      sourceAttestationKeySetDigestHex:
        trackerRequest.profile.sourceAttestationKeySetDigestHex,
      sourceAttestationThreshold:
        trackerRequest.profile.sourceAttestationThreshold,
      ergoAdmissionKeySetDigestHex:
        trackerRequest.profile.ergoAdmissionKeySetDigestHex,
      ergoAdmissionThreshold: trackerRequest.profile.ergoAdmissionThreshold,
      federationEpoch: trackerRequest.profile.federationEpoch,
    },
  });
  return Object.freeze({
    trackerRequest,
    trackerReceipt,
    familyRequest,
    familyCompilerRequestDigestHex: sha256CanonicalJson({
      schema:
        'e2s.substrate-federated-settlement-family-jvm-compiler-request.v1',
      version: 1,
      trackerCompilerRequestDigestHex: trackerRequest.requestDigestHex,
      trackerCompilerReceiptDigestHex: trackerReceipt.receiptDigestHex,
      familyRequest,
    }, REQUEST_DIGEST_DOMAIN),
  });
}

function receiptBoundaries() {
  return Object.freeze({
    profileActivated: false as const,
    targetGenesisBoxesObserved: false as const,
    targetNetworkIdentityAuthenticated: false as const,
    jvmCompilationReplayed: true as const,
    compilerReceiptAuthenticated: true as const,
    trustedHostRequired: true as const,
    concurrentSameUserTamperingOutOfScope: true as const,
    nodeCheckPerformed: false as const,
    targetNodeAcceptanceEstablished: false as const,
    signingAuthorityEstablished: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function fixedSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be lowercase SHA-256 hex`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase hex bytes`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be canonical positive decimal text`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || String(parsed) !== value) {
    throw new Error(`${label} must encode a positive safe integer`);
  }
  return parsed;
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expected.join(', ')}`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value !== null && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child, seen);
    }
  }
  return value;
}
