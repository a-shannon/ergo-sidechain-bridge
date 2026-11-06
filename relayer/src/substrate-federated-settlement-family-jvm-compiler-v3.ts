import { createHash } from 'node:crypto';

import { sha256CanonicalJson } from './strict-json.js';
import {
  parseSubstrateFederatedSettlementFamilyJvmCompilerOutputV1,
  type SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import {
  buildSubstrateFederatedSettlementFamilyV3CompilerRequest,
  resolveSubstrateFederatedSettlementFamilyV3ReserveSource,
  resolveSubstrateFederatedSettlementFamilyV3Sources,
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V3_LAYOUT,
  type BuildSubstrateFederatedSettlementFamilyV3CompilerRequestInput,
} from './substrate-federated-settlement-family-v3.js';
import { executePinnedFederatedJvmCompilerV1 } from './substrate-federated-tracker-jvm-compiler-v1.js';

export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V3_SCHEMA =
  'e2s.substrate-federated-settlement-family-jvm-compiler-receipt.v3' as const;
const REQUEST_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_REQUEST_V3';
const RECEIPT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V3';
const receipts = new WeakSet<object>();

export type CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV3Input =
  BuildSubstrateFederatedSettlementFamilyV3CompilerRequestInput;

export interface SubstrateFederatedSettlementFamilyJvmCompilerReceiptV3 {
  readonly schema: typeof SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V3_SCHEMA;
  readonly version: 3;
  readonly trackerAnchorSelector: 'absolute-ergo-header-height';
  readonly settlementLayout: typeof SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V3_LAYOUT;
  readonly receiptDigestHex: string;
  readonly trackerCompilerRequestDigestHex: string;
  readonly trackerCompilerReceiptDigestHex: string;
  readonly familyCompilerRequestDigestHex: string;
  readonly compilerLockDigestHex: string;
  readonly compiler: SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1['compiler'];
  readonly profile: SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1['profile'];
  readonly contracts: SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1['contracts'];
  readonly checks: Readonly<{
    sameProcessTrackerRequestVerified: true;
    sameProcessTrackerReceiptVerified: true;
    trackerBindingDerivedInternally: true;
    reserveV7TemplateSha256BoundIntoFamilyId: true;
    sameCompilerLockVerified: true;
    processOwnedFamilyRequestCreated: true;
    predecessorContractsCompiledFirst: true;
    predecessorIdsFromSameCompilerProcess: true;
    reserveContractIdsDerivedFromPropositions: true;
    reserveSourceDependencyRecomputed: true;
    exactCompilerOutputBound: true;
    callerTrackerIdentityAccepted: false;
    callerFamilyIdentityAccepted: false;
    callerAuthorityClaimsAccepted: false;
  }>;
  readonly boundaries: SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1['boundaries'];
}

export async function compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3(
  input: Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV3Input>,
): Promise<Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV3>> {
  // The builder validates the process-owned V2 tracker receipt and snapshots
  // each canonical template before the first await.
  const capturedInput = captureInput(input);
  const familyRequest = buildSubstrateFederatedSettlementFamilyV3CompilerRequest(capturedInput);
  const { trackerRequest, trackerReceipt } = capturedInput;
  const trackerAnchorSelector = trackerRequest.anchorSelector;
  const trackerCompilerLockDigestHex = trackerReceipt.compilerLockDigestHex;
  const digest = requestDigest(familyRequest);
  const sources = resolveSubstrateFederatedSettlementFamilyV3Sources(familyRequest);
  const records = [sources.duplicatePrevention, sources.sourceLock,
    sources.partialReserve].map(sourceRecord);
  const wire = ['BRIDGE_FED_FAMILY_REQUEST', '1', digest,
    ...records.flatMap(record => [record.sha256Hex, record.base64])].join('\t') + '\n';
  const execution = await executePinnedFederatedJvmCompilerV1(Buffer.from(wire, 'utf8'));
  if (execution.compilerLockDigestHex !== trackerCompilerLockDigestHex) {
    throw new Error('federated V3 tracker and family compiler locks differ');
  }
  const observation = parseSubstrateFederatedSettlementFamilyJvmCompilerOutputV1(execution.output, {
    requestDigestHex: digest, lock: execution.compilerLock,
  });
  const contracts = observation.contracts;
  if (contracts.duplicatePrevention.resolvedSourceSha256Hex !== records[0].sha256Hex
    || contracts.sourceLock.resolvedSourceSha256Hex !== records[1].sha256Hex) {
    throw new Error('federated V3 predecessor source binding drifted');
  }
  const reserveSource = resolveSubstrateFederatedSettlementFamilyV3ReserveSource(
    sources.partialReserve, {
      duplicatePreventionContractIdHex: contracts.duplicatePrevention.contractIdHex,
      sourceLockContractIdHex: contracts.sourceLock.contractIdHex,
    },
  );
  if (contracts.pooledReserve.resolvedSourceSha256Hex !== sourceRecord(reserveSource).sha256Hex) {
    throw new Error('federated V3 reserve dependency binding drifted');
  }
  const body = {
    schema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V3_SCHEMA,
    version: 3 as const,
    trackerAnchorSelector,
    settlementLayout: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V3_LAYOUT,
    trackerCompilerRequestDigestHex: familyRequest.trackerCompilerRequestDigestHex,
    trackerCompilerReceiptDigestHex: familyRequest.trackerCompilerReceiptDigestHex,
    familyCompilerRequestDigestHex: digest,
    compilerLockDigestHex: execution.compilerLockDigestHex,
    compiler: {
      execution: 'process-owned-dependent-family-jvm' as const,
      sigmaStateVersion: execution.compilerLock.sigmaStateVersion,
      sigmaStateArtifactSha256: observation.metadata.sigmaStateArtifactSha256,
      dependencyClasspathSha256: observation.metadata.dependencyClasspathSha256,
      javaDistribution: execution.compilerLock.javaDistribution,
      javaHomeSha256: observation.metadata.javaHomeSha256,
      toolSha256: execution.compilerLock.toolSha256,
      compiledToolClassesSha256: observation.metadata.compiledToolClassesSha256,
    },
    profile: familyRequest.profile,
    contracts,
    checks: {
      sameProcessTrackerRequestVerified: true as const,
      sameProcessTrackerReceiptVerified: true as const,
      trackerBindingDerivedInternally: true as const,
      reserveV7TemplateSha256BoundIntoFamilyId: true as const,
      sameCompilerLockVerified: true as const,
      processOwnedFamilyRequestCreated: true as const,
      predecessorContractsCompiledFirst: true as const,
      predecessorIdsFromSameCompilerProcess: true as const,
      reserveContractIdsDerivedFromPropositions: true as const,
      reserveSourceDependencyRecomputed: true as const,
      exactCompilerOutputBound: true as const,
      callerTrackerIdentityAccepted: false as const,
      callerFamilyIdentityAccepted: false as const,
      callerAuthorityClaimsAccepted: false as const,
    },
    boundaries: {
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
    },
  };
  const receipt = deepFreeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, RECEIPT_DOMAIN) });
  receipts.add(receipt);
  return receipt;
}

export function assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV3(
  receipt: Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV3>,
  expectedInput: Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV3Input>,
): Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV3> {
  if (!receipts.has(receipt)) {
    throw new Error('federated V3 settlement-family JVM receipt lacks process provenance');
  }
  const expectedRequest = buildSubstrateFederatedSettlementFamilyV3CompilerRequest(expectedInput);
  if (receipt.trackerCompilerRequestDigestHex !== expectedRequest.trackerCompilerRequestDigestHex
    || receipt.trackerCompilerReceiptDigestHex !== expectedRequest.trackerCompilerReceiptDigestHex
    || receipt.familyCompilerRequestDigestHex !== requestDigest(expectedRequest)) {
    throw new Error('federated V3 settlement-family compiler binding drifted');
  }
  return receipt;
}

function requestDigest(request: Readonly<ReturnType<typeof buildSubstrateFederatedSettlementFamilyV3CompilerRequest>>) {
  return sha256CanonicalJson({
    schema: 'e2s.substrate-federated-settlement-family-jvm-compiler-request.v3',
    version: 3,
    trackerAnchorSelector: 'absolute-ergo-header-height',
    settlementLayout: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V3_LAYOUT,
    trackerCompilerRequestDigestHex: request.trackerCompilerRequestDigestHex,
    trackerCompilerReceiptDigestHex: request.trackerCompilerReceiptDigestHex,
    familyRequest: request,
  }, REQUEST_DOMAIN);
}

function sourceRecord(source: string) {
  const bytes = Buffer.from(source, 'ascii');
  if (!bytes.length || bytes.length > 512 * 1024 || bytes.includes(0)
    || source.includes('\r') || !bytes.equals(Buffer.from(source, 'utf8'))) {
    throw new Error('federated V3 family source is outside the compiler bound');
  }
  return { sha256Hex: createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function captureInput(input: Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV3Input>) {
  const keys = ['trackerRequest', 'trackerReceipt', 'templates',
    'duplicatePreventionGenesisInputBoxIdHex', 'pooledReserveGenesisInputBoxIdHex'];
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new Error('V3 family compiler input requires exact plain data fields');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some(key => typeof key !== 'string')
    || ownKeys.sort().join(',') !== keys.sort().join(',')
    || Object.values(descriptors).some(descriptor => !descriptor.enumerable || !('value' in descriptor))) {
    throw new Error('V3 family compiler input requires exact plain data fields');
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]))) as Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV3Input>;
}
