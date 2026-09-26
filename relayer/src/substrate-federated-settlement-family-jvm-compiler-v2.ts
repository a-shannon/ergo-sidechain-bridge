import { createHash } from 'node:crypto';

import { sha256CanonicalJson } from './strict-json.js';
import {
  bindSubstrateFederatedSettlementFamilyJvmCompilerObservationV1,
  parseSubstrateFederatedSettlementFamilyJvmCompilerOutputV1,
  type SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import {
  buildSubstrateFederatedSettlementFamilyV1CompilerRequest,
  resolveSubstrateFederatedSettlementFamilyV1PooledReserveTemplateSource,
  resolveSubstrateFederatedSettlementFamilyV1PredecessorSources,
  type BuildSubstrateFederatedSettlementFamilyV1CompilerRequestInput,
} from './substrate-federated-settlement-family-v1.js';
import type { SubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { executePinnedFederatedJvmCompilerV1 } from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  assertSubstrateFederatedTrackerJvmCompilerReceiptV2,
  type SubstrateFederatedTrackerJvmCompilerReceiptV2,
} from './substrate-federated-tracker-jvm-compiler-v2.js';

export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V2_SCHEMA =
  'e2s.substrate-federated-settlement-family-jvm-compiler-receipt.v2' as const;

const REQUEST_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_REQUEST_V2';
const RECEIPT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V2';
const SETTLEMENT_LAYOUT = 'native-erg-federated-family-v1' as const;
const receipts = new WeakSet<object>();

export interface CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input {
  readonly trackerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV2>;
  readonly trackerReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2>;
  readonly templates: BuildSubstrateFederatedSettlementFamilyV1CompilerRequestInput['templates'];
  readonly duplicatePreventionGenesisInputBoxIdHex: string;
  readonly pooledReserveGenesisInputBoxIdHex: string;
}

export interface SubstrateFederatedSettlementFamilyJvmCompilerReceiptV2 {
  readonly schema: typeof SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V2_SCHEMA;
  readonly version: 2;
  readonly trackerAnchorSelector: 'absolute-ergo-header-height';
  readonly settlementLayout: typeof SETTLEMENT_LAYOUT;
  readonly receiptDigestHex: string;
  readonly trackerCompilerRequestDigestHex: string;
  readonly trackerCompilerReceiptDigestHex: string;
  readonly familyCompilerRequestDigestHex: string;
  readonly compilerLockDigestHex: string;
  readonly compiler: SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1['compiler'];
  readonly profile: SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1['profile'];
  readonly contracts: SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1['contracts'];
  readonly checks: SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1['checks'] &
    Readonly<{ sameCompilerLockVerified: true }>;
  readonly boundaries: SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1['boundaries'];
}

export async function compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2(
  input: Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input>,
): Promise<Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV2>> {
  const { trackerRequest, trackerReceipt, familyRequest, digest } = deriveRequest(input);
  const predecessors = resolveSubstrateFederatedSettlementFamilyV1PredecessorSources(familyRequest);
  const reserve = resolveSubstrateFederatedSettlementFamilyV1PooledReserveTemplateSource(familyRequest);
  const sources = [predecessors.duplicatePrevention, predecessors.sourceLock, reserve].map(sourceRecord);
  // Wire V1 is the locked compiler protocol, not a V1 tracker receipt. The
  // unchanged family layout binds the exact new tracker tree and template hash.
  const wire = ['BRIDGE_FED_FAMILY_REQUEST', '1', digest,
    ...sources.flatMap(source => [source.sha256Hex, source.base64])].join('\t') + '\n';
  const execution = await executePinnedFederatedJvmCompilerV1(Buffer.from(wire, 'utf8'));
  if (execution.compilerLockDigestHex !== trackerReceipt.compilerLockDigestHex) {
    throw new Error('federated V2 tracker and family compiler locks differ');
  }
  const observation = parseSubstrateFederatedSettlementFamilyJvmCompilerOutputV1(execution.output, {
    requestDigestHex: digest, lock: execution.compilerLock,
  });
  const bound = bindSubstrateFederatedSettlementFamilyJvmCompilerObservationV1(observation, familyRequest);
  const body = {
    schema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V2_SCHEMA,
    version: 2 as const,
    trackerAnchorSelector: trackerRequest.anchorSelector,
    settlementLayout: SETTLEMENT_LAYOUT,
    trackerCompilerRequestDigestHex: trackerRequest.requestDigestHex,
    trackerCompilerReceiptDigestHex: trackerReceipt.receiptDigestHex,
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
    contracts: bound.contracts,
    checks: {
      sameProcessTrackerRequestVerified: true as const,
      sameProcessTrackerReceiptVerified: true as const,
      trackerBindingDerivedInternally: true as const,
      sameCompilerLockVerified: true as const,
      processOwnedFamilyRequestCreated: true as const,
      predecessorContractsCompiledFirst: true as const,
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

export function assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(
  receipt: Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV2>,
  expectedInput: Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input>,
): Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV2> {
  if (!receipts.has(receipt)) {
    throw new Error('federated V2 settlement-family JVM receipt lacks process provenance');
  }
  const expected = deriveRequest(expectedInput);
  if (receipt.trackerCompilerRequestDigestHex !== expected.trackerRequest.requestDigestHex
    || receipt.trackerCompilerReceiptDigestHex !== expected.trackerReceipt.receiptDigestHex
    || receipt.familyCompilerRequestDigestHex !== expected.digest) {
    throw new Error('federated V2 settlement-family compiler binding drifted');
  }
  return receipt;
}

function deriveRequest(input: Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input>) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).sort().join(',')
      !== 'duplicatePreventionGenesisInputBoxIdHex,pooledReserveGenesisInputBoxIdHex,templates,trackerReceipt,trackerRequest') {
    throw new Error('federated V2 family requires exact compiler inputs');
  }
  // Capture caller references and resolve immutable template snapshots before
  // launching the compiler. No post-await access to mutable caller input.
  const { trackerRequest, trackerReceipt, templates,
    duplicatePreventionGenesisInputBoxIdHex, pooledReserveGenesisInputBoxIdHex } = input;
  assertSubstrateFederatedTrackerJvmCompilerReceiptV2(trackerReceipt, trackerRequest);
  const { application, profile } = trackerRequest;
  const familyRequest = buildSubstrateFederatedSettlementFamilyV1CompilerRequest({
    templates, duplicatePreventionGenesisInputBoxIdHex, pooledReserveGenesisInputBoxIdHex,
    tracker: {
      contractIdHex: trackerReceipt.contract.contractIdHex,
      templateSourceSha256Hex: trackerRequest.template.templateSourceSha256Hex,
      trackerNftIdHex: trackerRequest.trackerNftIdHex,
      sourceNetworkIdHex: application.sourceNetworkIdHex,
      sidechainIdHex: application.sidechainIdHex,
      bridgeAddressHex: application.bridgeAddressHex,
      tokenAddressHex: application.tokenAddressHex,
      runtimeProfileIdHex: application.runtimeProfileIdHex,
      settlementProfileIdHex: application.settlementProfileIdHex,
      federationProfileIdHex: profile.profileIdHex,
      sourceAttestationKeySetDigestHex: profile.sourceAttestationKeySetDigestHex,
      sourceAttestationThreshold: profile.sourceAttestationThreshold,
      ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
      ergoAdmissionThreshold: profile.ergoAdmissionThreshold,
      federationEpoch: profile.federationEpoch,
    },
  });
  const digest = sha256CanonicalJson({
    schema: 'e2s.substrate-federated-settlement-family-jvm-compiler-request.v2',
    version: 2,
    trackerAnchorSelector: trackerRequest.anchorSelector,
    settlementLayout: SETTLEMENT_LAYOUT,
    trackerCompilerRequestDigestHex: trackerRequest.requestDigestHex,
    trackerCompilerReceiptDigestHex: trackerReceipt.receiptDigestHex,
    familyRequest,
  }, REQUEST_DOMAIN);
  return { trackerRequest, trackerReceipt, familyRequest, digest };
}

function sourceRecord(source: string) {
  const bytes = Buffer.from(source, 'ascii');
  if (!bytes.length || bytes.length > 512 * 1024 || bytes.includes(0)
    || source.includes('\r') || !bytes.equals(Buffer.from(source, 'utf8'))) {
    throw new Error('federated V2 family source is outside the compiler bound');
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
