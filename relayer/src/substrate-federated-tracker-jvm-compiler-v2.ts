import { createHash } from 'node:crypto';

import { sha256CanonicalJson } from './strict-json.js';
import {
  resolveSubstrateFederatedTrackerCompilerSourceV2,
  type SubstrateFederatedTrackerCompilerRequestV2,
} from './substrate-federated-tracker-compiler-v2.js';
import {
  executePinnedFederatedJvmCompilerV1,
  parseSubstrateFederatedTrackerJvmCompilerOutputV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';

export const SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V2_SCHEMA =
  'e2s.substrate-federated-tracker-jvm-compiler-receipt.v2' as const;
const RECEIPT_DIGEST_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V2';
const processReceipts = new WeakSet<object>();

export interface SubstrateFederatedTrackerJvmCompilerReceiptV2 {
  readonly schema: typeof SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V2_SCHEMA;
  readonly version: 2;
  readonly anchorSelector: 'absolute-ergo-header-height';
  readonly receiptDigestHex: string;
  readonly compilerRequestDigestHex: string;
  readonly compilerLockDigestHex: string;
  readonly compiler: Readonly<{
    readonly execution: 'process-owned-resolver-free-jvm';
    readonly sigmaStateVersion: '6.0.2';
    readonly sigmaStateArtifactSha256: string;
    readonly dependencyClasspathSha256: string;
    readonly javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS';
    readonly javaHomeSha256: string;
    readonly toolSha256: string;
    readonly compiledToolClassesSha256: string;
    readonly networkPrefix: 16;
    readonly scriptVersion: 3;
    readonly treeVersion: 0;
  }>;
  readonly contract: Readonly<{
    readonly resolvedSourceSha256Hex: string;
    readonly propositionBytes: number;
    readonly propositionHex: string;
    readonly propositionSha256Hex: string;
    readonly contractIdHex: string;
  }>;
  readonly checks: Readonly<{
    readonly sameProcessCompilerRequestVerified: true;
    readonly processOwnedInputCreated: true;
    readonly pinnedToolSourceCompiled: true;
    readonly pinnedRuntimeSnapshotVerified: true;
    readonly exactCompilerOutputBound: true;
    readonly propositionIdentityRecomputed: true;
    readonly jvmSerializationRoundTripVerified: true;
    readonly callerContractIdentityAccepted: false;
    readonly callerAuthorityClaimsAccepted: false;
  }>;
  readonly boundaries: Readonly<{
    readonly profileActivated: false;
    readonly targetGenesisBoxObserved: false;
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
  }>;
}

export async function compileSubstrateFederatedTrackerWithPinnedJvmV2(
  request: Readonly<SubstrateFederatedTrackerCompilerRequestV2>,
): Promise<Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2>> {
  const source = resolveSubstrateFederatedTrackerCompilerSourceV2(request);
  const bytes = Buffer.from(source, 'utf8');
  if (
    bytes.length === 0 || bytes.length > 512 * 1024
    || bytes.includes(0) || source.includes('\r')
    || sha256(bytes) !== request.template.resolvedSourceSha256Hex
  ) {
    throw new Error('federated tracker V2 source does not match its bounded request');
  }

  // Wire version 1 describes the locked compiler protocol, not the contract profile.
  // No V1 request or receipt is constructed or promoted here.
  const wire = `BRIDGE_FED_TRACKER_REQUEST\t1\t${request.requestDigestHex}`
    + `\t${request.template.resolvedSourceSha256Hex}\t${bytes.toString('base64')}\n`;
  const execution = await executePinnedFederatedJvmCompilerV1(Buffer.from(wire, 'utf8'));
  const observation = parseSubstrateFederatedTrackerJvmCompilerOutputV1(execution.output, {
    requestDigestHex: request.requestDigestHex,
    resolvedSourceSha256Hex: request.template.resolvedSourceSha256Hex,
    lock: execution.compilerLock,
  });
  if (
    observation.metadata.scriptVersion !== request.compiler.scriptVersion
    || observation.metadata.treeVersion !== request.compiler.treeVersion
  ) {
    throw new Error('federated tracker V2 compiler version binding drifted');
  }
  const binding = {
    schema: SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V2_SCHEMA,
    version: 2 as const,
    anchorSelector: request.anchorSelector,
    compilerRequestDigestHex: request.requestDigestHex,
    compilerLockDigestHex: execution.compilerLockDigestHex,
    compiler: {
      execution: 'process-owned-resolver-free-jvm' as const,
      sigmaStateVersion: execution.compilerLock.sigmaStateVersion,
      sigmaStateArtifactSha256: observation.metadata.sigmaStateArtifactSha256,
      dependencyClasspathSha256: observation.metadata.dependencyClasspathSha256,
      javaDistribution: execution.compilerLock.javaDistribution,
      javaHomeSha256: observation.metadata.javaHomeSha256,
      toolSha256: execution.compilerLock.toolSha256,
      compiledToolClassesSha256: observation.metadata.compiledToolClassesSha256,
      networkPrefix: observation.metadata.networkPrefix,
      scriptVersion: observation.metadata.scriptVersion,
      treeVersion: observation.metadata.treeVersion,
    },
    contract: {
      resolvedSourceSha256Hex: observation.resolvedSourceSha256Hex,
      propositionBytes: observation.propositionBytes,
      propositionHex: observation.propositionHex,
      propositionSha256Hex: observation.propositionSha256Hex,
      contractIdHex: observation.contractIdHex,
    },
    checks: {
      sameProcessCompilerRequestVerified: true as const,
      processOwnedInputCreated: true as const,
      pinnedToolSourceCompiled: true as const,
      pinnedRuntimeSnapshotVerified: true as const,
      exactCompilerOutputBound: true as const,
      propositionIdentityRecomputed: true as const,
      jvmSerializationRoundTripVerified: true as const,
      callerContractIdentityAccepted: false as const,
      callerAuthorityClaimsAccepted: false as const,
    },
    boundaries: {
      ...request.boundaries,
      jvmCompilationReplayed: true as const,
      compilerReceiptAuthenticated: true as const,
      trustedHostRequired: true as const,
      concurrentSameUserTamperingOutOfScope: true as const,
    },
  };
  const receipt = deepFreeze({
    ...binding,
    receiptDigestHex: sha256CanonicalJson(binding, RECEIPT_DIGEST_DOMAIN),
  });
  processReceipts.add(receipt);
  return receipt;
}

export function assertSubstrateFederatedTrackerJvmCompilerReceiptV2(
  receipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2>,
  request: Readonly<SubstrateFederatedTrackerCompilerRequestV2>,
): Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2> {
  const source = resolveSubstrateFederatedTrackerCompilerSourceV2(request);
  if (!processReceipts.has(receipt)) {
    throw new Error('federated tracker V2 JVM compiler receipt lacks process provenance');
  }
  if (
    receipt.compilerRequestDigestHex !== request.requestDigestHex
    || receipt.contract.resolvedSourceSha256Hex !== request.template.resolvedSourceSha256Hex
    || sha256(Buffer.from(source, 'utf8')) !== receipt.contract.resolvedSourceSha256Hex
  ) {
    throw new Error('federated tracker V2 JVM compiler receipt request binding drifted');
  }
  return receipt;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
