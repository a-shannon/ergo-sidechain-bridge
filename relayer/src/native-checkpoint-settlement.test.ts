import blakejs from 'blakejs';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { ethers } from 'ethers';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeSourceMocks = vi.hoisted(() => ({
  assertAuthority: vi.fn(),
  assertAuthorityCheckpoint: vi.fn(),
  collectAndVerify: vi.fn(),
  createAuthorityCodec: vi.fn(() => ({
    executionBoundary: {
      mode: 'source-refreshed-authority-contained-acquisition-only',
    },
  })),
  createAuthorityVerifier: vi.fn(),
  createCodec: vi.fn(() => ({})),
  requestBlockHashAt: vi.fn(),
}));

const splitCheckMocks = vi.hoisted(() => ({
  signedCandidates: new WeakSet<object>(),
  sign: vi.fn(),
  check: vi.fn(),
}));

vi.mock('./native-checkpoint-proof-collector.js', () => ({
  collectAndVerifyNativeFinalizedCheckpoint: nativeSourceMocks.collectAndVerify,
}));
vi.mock('./native-substrate-rpc-proof-codec.js', () => ({
  createAuthorityBoundNativeSubstrateRpcProofCodec:
    nativeSourceMocks.createAuthorityCodec,
  createNativeSubstrateRpcProofCodec: nativeSourceMocks.createCodec,
}));
vi.mock('./native-verifier-execution-authority.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-verifier-execution-authority.js')
  >();
  return {
    ...actual,
    assertNativeVerifierExecutionAuthorityProvenance:
      nativeSourceMocks.assertAuthority,
  };
});
vi.mock('./native-finalized-bridge-checkpoint.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-finalized-bridge-checkpoint.js')
  >();
  return {
    ...actual,
    assertNativeVerifiedBridgeCheckpointAuthorityExecutionProvenance:
      nativeSourceMocks.assertAuthorityCheckpoint,
    createAuthorityBoundNativeFinalizedBridgeCheckpointVerifier:
      nativeSourceMocks.createAuthorityVerifier,
  };
});
vi.mock('./substrate-finality-provider.js', () => ({
  BoundedHttpSubstrateRpcTransport: class {
    constructor(readonly rpcUrl: string) {}
  },
  ReadOnlySubstrateFinalityRpc: class {
    constructor(readonly transport: unknown) {}
  },
  requestSubstrateBlockHashAt: nativeSourceMocks.requestBlockHashAt,
}));
vi.mock('./fleet-signer.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./fleet-signer.js')>();
  return {
    ...actual,
    signTransactionForCheck: splitCheckMocks.sign,
    checkSignedTransaction: splitCheckMocks.check,
    assertLocalWasmSignedCheckCandidateProvenance: (candidate: unknown) => {
      if (
        typeof candidate !== 'object'
        || candidate === null
        || !splitCheckMocks.signedCandidates.has(candidate)
      ) {
        throw new Error('local WASM signed check candidate provenance is missing');
      }
    },
  };
});

import {
  assertNativeCheckpointSettlementCandidateBindings,
  assertNativeVerifiedAuthenticatedSettlementCandidateProvenance,
  buildAuthenticatedSettlementCandidate,
  deriveNativeVerifiedAuthenticatedSettlementCandidateId,
  recordNativeVerifiedAuthenticatedSettlementCandidate,
} from './authenticated-settlement-candidate.js';
import { AggregateSettlementService } from './aggregate-settlement-service.js';
import type { BoxLike } from './aggregate-settlement-tx.js';
import {
  EMPTY_AVL_DIGEST,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from './ergo-helpers.js';
import { deriveExecutableInvocationSha256Hex } from './native-executable-pin.js';
import {
  buildNativeVerifiedBridgeCheckpoint,
  verifyNativeFinalizedBridgeCheckpoint,
  type NativeFinalizedBridgeCheckpointRequest,
  type NativeFinalizedBridgeCheckpointVerificationPayload,
  type NativeVerifiedBridgeCheckpoint,
} from './native-finalized-bridge-checkpoint.js';
import {
  bindNativeCheckpointToAuthenticatedSettlement,
} from './native-checkpoint-settlement-admission.js';
import type { AggregateFinalityProofV1 } from './bridge-finality-proof.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import {
  assertAuthenticatedSettlementStableErgoViewProvenance,
  observeAuthenticatedSettlementStableErgoView,
} from './authenticated-settlement-ergo-anchor.js';
import {
  authorizeAuthenticatedSettlementCheckAdmission,
} from './authenticated-settlement-check-admission.js';
import {
  runAuthenticatedSettlementCheckReservationCompatibility,
} from './authenticated-settlement-check-reservation-compatibility.js';
import {
  assertAuthenticatedSettlementExecutionAuthorizationProvenance,
  authorizeAuthenticatedSettlementExecution,
} from './authenticated-settlement-execution-authorization.js';
import {
  assertAuthenticatedSettlementExecutionReservationAdmissionProvenance,
  authorizeAuthenticatedSettlementExecutionReservation,
} from './authenticated-settlement-execution-reservation.js';
import {
  createAuthenticatedSettlementSidechainObservationSourcePair,
  destroyAuthenticatedSettlementSidechainObservationSourcePair,
  observeAuthenticatedSettlementStableSidechainView,
  type StableSidechainSource,
} from './authenticated-settlement-sidechain-view.js';
import {
  assertAuthenticatedSettlementJvmCheckAcceptanceProvenance,
  assertAuthenticatedSettlementSignedCheckCandidateProvenance,
  assertRevalidatedAuthenticatedSettlementCandidateProvenance,
  checkPackageBoundRevalidatedAuthenticatedSettlementCandidate,
  checkPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting,
  checkPackageBoundSignedAuthenticatedSettlementCandidate,
  revalidateAuthenticatedSettlementCandidate,
  revalidateAuthenticatedSettlementCandidateForTesting,
  signPackageBoundRevalidatedAuthenticatedSettlementCandidate,
} from './authenticated-settlement-jvm-check.js';
import {
  recoverAuthenticatedV2Caches,
} from './authenticated-v2-cache-recovery.js';
import {
  recoverAuthenticatedV2PreparedCandidate,
} from './authenticated-v2-package-recovery.js';
import {
  AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA,
  AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_PACKAGE_SCHEMA,
  validateAuthenticatedV2UnsignedSettlementPackage,
  type AuthenticatedV2UnsignedSettlementPackage,
} from './authenticated-v2-unsigned-settlement-package.js';
import {
  bindAuthenticatedV2UnsignedSettlementPackage,
} from './authenticated-v2-settlement-package-binding.js';
import {
  AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA,
} from './authenticated-v2-stateful-check-readiness.js';
import {
  ERGO_NODE_CHECKER_PROFILE,
  ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
  LOCAL_WASM_CHECK_SIGNER_PROFILE,
  LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE,
  deriveUnsignedTransactionId,
  type LocalWasmSignedCheckCandidate,
  type SignedCheckSignerContext,
} from './fleet-signer.js';
import { buildErgoExtensionMembershipProof } from './ergo-extension-membership.js';
import {
  NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SCHEMA,
  createAuthorityBoundNativeCheckpointSettlementSource,
  createNativeCheckpointSettlementSource,
  createUnreviewedNativeCheckpointSettlementSourceForTesting,
  deriveNativeCheckpointSettlementProfileSha256Hex,
  getReviewedNativeCheckpointSettlementProfileSha256Hex,
  loadNativeCheckpointSettlementSourceFromEnvironment,
  parseNativeCheckpointSettlementProfile,
  REVIEWED_NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SHA256_HEXES,
  type NativeCheckpointSettlementProfile,
} from './native-checkpoint-settlement-source.js';
import type { NativeVerifierExecutionAuthority } from './native-verifier-execution-authority.js';
import type { NativeCheckpointSettlementAdmission } from './native-checkpoint-settlement-admission.js';
import {
  REVIEWED_AUTHENTICATED_V2_REPLAY_IMPORT_PROFILE_SHA256_HEXES,
} from './reviewed-native-checkpoint-settlement-profiles.js';
import {
  buildAuthenticatedSpvAdmission,
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerValue,
  encodeAuthenticatedSpvTrackerAvlRegister,
  getAuthenticatedSpvTrackerDigest,
  type AuthenticatedSpvTrackerHistoryEntry,
  type AuthenticatedSpvTrackerIdentity,
} from './spv-tracker-authenticated.js';
import type { AuthenticatedV2VaultChainSource } from './authenticated-v2-vault-reconstruction.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
} from './trustless-burn-proof.js';
import type { ParsedPegOut } from './sidechain-client.js';
import type { CollectFrontierBurnProofForPegOutResult } from './frontier-burn-proof-source.js';
import {
  SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_SELECTION,
} from './profiles/index.js';
import { StateTracker } from './state-tracker.js';
import { startStableSidechainJsonRpcFixture } from './stable-sidechain-json-rpc.test-helper.js';

const hex = (byte: string) => byte.repeat(64);
const signedCheckIdentity = (overrides: {
  signerContext?: Record<string, unknown>;
  checkerIdentity?: Record<string, unknown>;
} = {}) => ({
  signerContext: {
    profile: LOCAL_WASM_CHECK_SIGNER_PROFILE,
    pubKeyHex: `02${'31'.repeat(32)}`,
    ergoTreeHex: `0008cd02${'31'.repeat(32)}`,
    networkPrefix: 16,
    stateContextTipHeight: 1_500,
    stateContextTipIdHex: '32'.repeat(32),
    ...overrides.signerContext,
  },
  checkerIdentity: {
    profile: ERGO_NODE_CHECKER_PROFILE,
    sourceAdapterProfile: ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
    nodeOrigin: 'http://127.0.0.1:9052',
    path: '/transactions/check' as const,
    method: 'POST' as const,
    transportPolicy: 'no-redirect-no-proxy' as const,
    ...overrides.checkerIdentity,
  },
});

function digestMockSignedCheckTransaction(value: unknown): string {
  const canonicalJson = (child: unknown): string => {
    if (
      child === null
      || typeof child === 'string'
      || typeof child === 'boolean'
      || typeof child === 'number'
    ) {
      return JSON.stringify(child);
    }
    if (Array.isArray(child)) {
      return `[${child.map(canonicalJson).join(',')}]`;
    }
    const record = child as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  };
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function createMockSignedCheckCandidate(input: {
  txId: string;
  signedTx: Readonly<Record<string, unknown>>;
  nodeOrigin: string;
  signerContext: SignedCheckSignerContext;
}): LocalWasmSignedCheckCandidate {
  const candidate = Object.freeze({
    profile: LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE,
    txId: input.txId,
    signedTransactionDigestHex: digestMockSignedCheckTransaction(input.signedTx),
    nodeOrigin: input.nodeOrigin,
    signerContext: Object.freeze({ ...input.signerContext }),
  });
  splitCheckMocks.signedCandidates.add(candidate);
  return candidate;
}

async function opaqueSplitAcceptanceForTesting(input: {
  packageBinding: Parameters<
    typeof signPackageBoundRevalidatedAuthenticatedSettlementCandidate
  >[0];
  revalidated: Parameters<
    typeof signPackageBoundRevalidatedAuthenticatedSettlementCandidate
  >[1];
  identity?: ReturnType<typeof signedCheckIdentity>;
  checkResult?: string;
}) {
  const identity = input.identity ?? signedCheckIdentity();
  splitCheckMocks.sign.mockImplementationOnce(
    async (_tx, _label, expectedTxId, nodeOrigin) =>
      createMockSignedCheckCandidate({
        txId: expectedTxId,
        signedTx: {
          id: expectedTxId,
          proofs: ['opaque-split-check-proof'],
        },
        nodeOrigin,
        signerContext: identity.signerContext as SignedCheckSignerContext,
      }),
  );
  const signed =
    await signPackageBoundRevalidatedAuthenticatedSettlementCandidate(
      input.packageBinding,
      input.revalidated,
      'Authenticated V2 opaque split JVM check',
      identity.checkerIdentity.nodeOrigin,
    );
  splitCheckMocks.check.mockImplementationOnce(
    async (candidate, _label, nodeOrigin) => ({
      txId: candidate.txId,
      checkResult: input.checkResult ?? `0x${candidate.txId}`,
      signedTransactionDigestHex: candidate.signedTransactionDigestHex,
      signerContext: candidate.signerContext,
      checkerIdentity: {
        ...identity.checkerIdentity,
        nodeOrigin,
      },
    }),
  );
  return checkPackageBoundSignedAuthenticatedSettlementCandidate(
    input.packageBinding,
    input.revalidated,
    signed,
    'Authenticated V2 opaque split JVM check',
  );
}

const prefixedHash = (byte: string) => `0x${hex(byte)}`;
const sidechainIdHex = hex('1');
const nativeBlockHashHex = prefixedHash('4');
const executionBlockHashHex = hex('7');
const sidechainHeight = 42;
const sidechainTxHashHex = hex('a');
const eventIndex = 3;
const recipientErgoTreeHex = `0008cd02${'5'.repeat(64)}`;
const recipientErgoTreeHashHex = Buffer.from(
  blakejs.blake2b(Buffer.from(recipientErgoTreeHex, 'hex'), undefined, 32),
).toString('hex');
const burnIdHex = deriveTrustlessBurnIdHex({
  sidechainIdHex,
  sidechainTxHashHex,
  eventIndex,
});
const proof = buildTrustlessBurnInclusionProof([{
  sidechainIdHex,
  sidechainBlockHashHex: executionBlockHashHex,
  burnIdHex,
  sidechainTxHashHex,
  eventIndex,
  recipientErgoTreeHashHex,
  amountNanoErg: 10_000_000n,
}], burnIdHex);

const authoritySetDomain = Buffer.from('E2S_GRANDPA_AUTHORITY_SET_V1', 'utf8');
const trustAnchorDomain = Buffer.from('E2S_GRANDPA_TRUST_ANCHOR_V1', 'utf8');
const bridgeCommitmentStorageKeyHex =
  '0xaf86fef4216ac2bcd1c592b204011ad00d2d4fb825af1fcd4c2be9f955a780c5';
const executableSha256Hex =
  `0x${createHash('sha256').update(readFileSync(process.execPath)).digest('hex')}`;
const importedWasm: any = await import('ergo-lib-wasm-nodejs');
const TEST_WASM = importedWasm.default ?? importedWasm;

function bytes(value: string): Buffer {
  return Buffer.from(value.startsWith('0x') ? value.slice(2) : value, 'hex');
}

function digestHex(value: Buffer): string {
  return `0x${Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex')}`;
}

function authoritySetHash(authorityListScaleHex: string): string {
  return digestHex(Buffer.concat([authoritySetDomain, bytes(authorityListScaleHex)]));
}

const request: NativeFinalizedBridgeCheckpointRequest = {
  schema: 'e2s.native-finalized-bridge-checkpoint-request.v2',
  trustAnchor: {
    sidechainIdHex: `0x${sidechainIdHex}`,
    checkpointHashHex: prefixedHash('2'),
    checkpointNumber: '10',
    grandpaSetId: '7',
    authorityListScaleHex: '0x0401',
  },
  targetNativeBlockHashHex: nativeBlockHashHex,
  targetHeaderScaleHex: '0x0102',
  linkedGrandpaProofs: [{
    ancestryHeadersScaleHex: ['0x0304'],
    proofScaleHex: '0x0506',
  }],
  checkpointTailHeadersScaleHex: ['0x0708'],
  finalityProofScaleHex: '0x0607',
  runtimeStateProofNodesHex: ['0x0a0b'],
};

function trustAnchorDigest(): string {
  const checkpointNumber = Buffer.alloc(8);
  checkpointNumber.writeBigUInt64BE(BigInt(request.trustAnchor.checkpointNumber));
  const setId = Buffer.alloc(8);
  setId.writeBigUInt64BE(BigInt(request.trustAnchor.grandpaSetId));
  return digestHex(Buffer.concat([
    trustAnchorDomain,
    bytes(request.trustAnchor.sidechainIdHex),
    bytes(request.trustAnchor.checkpointHashHex),
    checkpointNumber,
    setId,
    bytes(authoritySetHash(request.trustAnchor.authorityListScaleHex)),
  ]));
}

function requestDigest(): string {
  return digestHex(Buffer.from(JSON.stringify(request), 'utf8'));
}

function commitmentScaleHex(): string {
  const height = Buffer.alloc(8);
  height.writeBigUInt64LE(BigInt(sidechainHeight));
  const count = Buffer.alloc(4);
  count.writeUInt32LE(proof.leafCount);
  return `0x${Buffer.concat([
    Buffer.from([1]),
    bytes(sidechainIdHex),
    height,
    bytes(executionBlockHashHex),
    bytes(proof.bridgeEventRootHex),
    count,
  ]).toString('hex')}`;
}

function validVerification(
  finalityOverrides: Partial<NativeFinalizedBridgeCheckpointVerificationPayload['finality']> = {},
): NativeFinalizedBridgeCheckpointVerificationPayload {
  const finalitySigningAuthorityListScaleHex = '0x0801';
  return {
    schema: 'e2s.native-finalized-bridge-checkpoint-verification.v2',
    status: 'NATIVE_CHECKPOINT_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT',
    requestDigestHex: requestDigest(),
    trustAnchorDigestHex: trustAnchorDigest(),
    target: {
      nativeBlockHashHex,
      nativeHeight: sidechainHeight.toString(),
      stateRootHex: prefixedHash('5'),
    },
    authority: {
      finalitySigningSetId: '8',
      finalitySigningAuthorityListScaleHex,
      finalitySigningAuthoritySetHashHex: authoritySetHash(
        finalitySigningAuthorityListScaleHex,
      ),
      transitionCount: 1,
      linkedAncestryVerified: true,
    },
    finality: {
      horizonHashHex: prefixedHash('9'),
      horizonHeight: '43',
      canonicalJustificationScaleHex: '0x0809',
      verified: true,
      ...finalityOverrides,
    },
    runtimeState: {
      storageKeyHex: bridgeCommitmentStorageKeyHex,
      storageValueScaleHex: commitmentScaleHex(),
      proofNodeCount: request.runtimeStateProofNodesHex.length,
      proofBytes: 2,
      verified: true,
    },
    commitment: {
      sidechainIdHex: `0x${sidechainIdHex}`,
      sidechainHeight: sidechainHeight.toString(),
      executionBlockHashHex: `0x${executionBlockHashHex}`,
      bridgeEventRootHex: `0x${proof.bridgeEventRootHex}`,
      burnLeafCount: proof.leafCount,
    },
    boundary: {
      sidechainFinalityVerified: true,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    },
  };
}

async function verifiedCheckpoint(
  verificationPayload = validVerification(),
): Promise<NativeVerifiedBridgeCheckpoint> {
  const encoded = Buffer.from(JSON.stringify(verificationPayload), 'utf8').toString('base64');
  const script = [
    "const chunks = [];",
    "process.stdin.on('data', chunk => chunks.push(chunk));",
    "process.stdin.on('end', () => {",
    "  JSON.parse(Buffer.concat(chunks).toString('utf8'));",
    `  process.stdout.write(Buffer.from('${encoded}', 'base64'));`,
    "});",
  ].join('\n');
  const executableArgs = ['-e', script, '--'];
  const verification = await verifyNativeFinalizedBridgeCheckpoint({
    executablePath: process.execPath,
    expectedExecutableSha256Hex: executableSha256Hex,
    expectedExecutableInvocationSha256Hex: deriveExecutableInvocationSha256Hex(
      executableSha256Hex,
      [...executableArgs, '--trusted-anchor-digest', trustAnchorDigest()],
    ),
    executableArgs,
    timeoutMs: 2_000,
    trustedAnchorDigestHex: trustAnchorDigest(),
    request,
  });
  return buildNativeVerifiedBridgeCheckpoint(verification);
}

const pegOut: ParsedPegOut = {
  sidechainTxHash: sidechainTxHashHex,
  ergoRecipientAddress: recipientErgoTreeHex,
  amount: 10_000_000n,
  user: `0x${'6'.repeat(40)}`,
  sidechainBlockNumber: sidechainHeight,
  sidechainBlockHash: executionBlockHashHex,
  sidechainLogIndex: eventIndex,
};

const trackerIdentity: AuthenticatedSpvTrackerIdentity = {
  sidechainIdHex,
  sidechainHeight,
  executionBlockHashHex,
};

const proofBundle: CollectFrontierBurnProofForPegOutResult = {
  proof,
  settlementIdentity: {
    source: 'trustless-burn-leaf',
    duplicatePreventionKeyHex: burnIdHex,
    bridgeEventRootHex: proof.bridgeEventRootHex,
    recipientErgoTreeHashHex,
    amountNanoErg: 10_000_000n,
    assetIdHex: proof.leaf.assetIdHex,
    trustlessBurnProof: proof.proof,
  },
};

let checkpoint: NativeVerifiedBridgeCheckpoint;
let aggregateFinalityProof: AggregateFinalityProofV1;
let trackerHistory: AuthenticatedSpvTrackerHistoryEntry[];

function encodedTrackerValue(overrides: {
  bridgeEventRootHex?: string;
  checkpointCommitmentHex?: string;
} = {}): string {
  const commitment = buildAggregateFinalityCommitmentV1(aggregateFinalityProof);
  return encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex: overrides.bridgeEventRootHex ?? proof.bridgeEventRootHex,
    checkpointCommitmentHex: overrides.checkpointCommitmentHex
      ?? checkpoint.checkpointCommitment.checkpointCommitmentHex,
    anchorHeaderIdHex: hex('b'),
    anchorHeaderHeight: 100,
    finalityProofSystemId: commitment.proofSystemId,
    finalityStatementDigestHex: commitment.statementDigestHex,
    finalityProgramIdHex: commitment.statement.programIdHex,
    finalityVerifierProfileIdHex: commitment.verifierProfileIdHex,
    finalityProofPayloadDigestHex: commitment.payloadDigestHex,
    finalityProofDigestHex: commitment.proofDigestHex,
  });
}

beforeAll(async () => {
  checkpoint = await verifiedCheckpoint();
  configureNativeSourceMocks({ checkpoint });
  const reviewedSource = createAuthorityBoundNativeCheckpointSettlementSource(
    profile,
    authorityForProfile(),
  );
  const finalityPackage = await reviewedSource.collectForSettlement({
    sidechainIdHex,
    sidechainHeight,
  });
  checkpoint = finalityPackage.checkpoint;
  aggregateFinalityProof = finalityPackage.aggregateFinalityProof;
  trackerHistory = [{
    key: deriveAuthenticatedSpvTrackerKey(trackerIdentity),
    value: encodedTrackerValue(),
  }];
});

beforeEach(() => {
  splitCheckMocks.sign.mockReset();
  splitCheckMocks.check.mockReset();
});

function bind(overrides: Partial<Parameters<typeof bindNativeCheckpointToAuthenticatedSettlement>[0]> = {}) {
  return bindNativeCheckpointToAuthenticatedSettlement({
    checkpoint,
    aggregateFinalityProof,
    expectedSidechainIdHex: sidechainIdHex,
    pegOut,
    proofBundle,
    trackerIdentity,
    trackerHistory,
    ...overrides,
  });
}

function settlementBox(
  transactionIdHex: string,
  ergoTree: string,
  value: number,
  registers: Record<string, string>,
  tokenId?: string,
): BoxLike {
  const boxValue = TEST_WASM.BoxValue.from_i64(TEST_WASM.I64.from_str(String(value)));
  const tree = TEST_WASM.ErgoTree.from_base16_bytes(ergoTree);
  const contract = TEST_WASM.Contract.new(tree);
  const builder = new TEST_WASM.ErgoBoxCandidateBuilder(boxValue, contract, 100);
  try {
    if (tokenId) {
      builder.add_token(
        TEST_WASM.TokenId.from_str(tokenId),
        TEST_WASM.TokenAmount.from_i64(TEST_WASM.I64.from_str('1')),
      );
    }
    for (const [name, encoded] of Object.entries(registers)) {
      builder.set_register_value(
        TEST_WASM.NonMandatoryRegisterId[name],
        TEST_WASM.Constant.decode_from_base16(encoded),
      );
    }
    const candidate = builder.build();
    const transactionId = TEST_WASM.TxId.from_str(transactionIdHex);
    const box = TEST_WASM.ErgoBox.from_box_candidate(candidate, transactionId, 0);
    try {
      return box.to_js_eip12() as BoxLike;
    } finally {
      box.free?.();
      transactionId.free?.();
      candidate.free?.();
    }
  } finally {
    builder.free?.();
  }
}

async function prepareCanonicalSettlement(creationHeight = 120) {
  const finalityAttestorMetadata = encodeSigmaPropRegister(`02${'8'.repeat(64)}`);
  const bridgeCommitteeMetadata = encodeSigmaPropRegister(`02${'89'.repeat(32)}`);
  const deployed = {
    network: 'testnet',
    deployedAt: new Date(0).toISOString(),
    sideChainState: { nftId: hex('1'), boxId: hex('1'), address: 'scs', ergoTreeHex: '1000' },
    doubleUnlockPrevention: { nftId: hex('2'), boxId: hex('2'), address: 'dup', ergoTreeHex: '1001' },
    spvTrackerAuthenticated: {
      nftId: hex('a'),
      boxId: hex('3'),
      address: 'spv-authenticated',
      ergoTreeHex: '1002',
    },
    doubleUnlockPreventionAuthenticated: {
      nftId: hex('b'),
      boxId: hex('4'),
      address: 'dup-authenticated',
      ergoTreeHex: '1003',
    },
    mainChainAggregateUnlockAuthenticated: {
      address: 'unlock-authenticated',
      ergoTreeHex: '1004',
    },
    mainChainLock: { address: 'lock', ergoTreeHex: '1005' },
    mainChainUnlock: { address: 'unlock', ergoTreeHex: '1006' },
    relayer: { address: 'relayer', publicKey: `02${'8'.repeat(64)}` },
  };
  const trackerBox = settlementBox(
    hex('d'),
    deployed.spvTrackerAuthenticated.ergoTreeHex,
    1_000_000,
    {
      R4: encodeLongRegister(1),
      R5: encodeAuthenticatedSpvTrackerAvlRegister(
        getAuthenticatedSpvTrackerDigest(trackerHistory),
      ),
      R6: encodeCollByteRegister(Buffer.from(sidechainIdHex, 'hex')),
      R7: encodeLongRegister(sidechainHeight),
      R8: encodeIntRegister(101),
      R9: finalityAttestorMetadata,
    },
    deployed.spvTrackerAuthenticated.nftId,
  );
  const authenticatedDupBox = settlementBox(
    hex('e'),
    deployed.doubleUnlockPreventionAuthenticated.ergoTreeHex,
    1_000_000,
    {
      R4: encodeLongRegister(0),
      R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
      R6: bridgeCommitteeMetadata,
    },
    deployed.doubleUnlockPreventionAuthenticated.nftId,
  );
  const unlockBox = settlementBox(
    hex('f'),
    deployed.mainChainAggregateUnlockAuthenticated.ergoTreeHex,
    12_100_000,
    {
      R4: encodeCollByteRegister(Buffer.from(hex('1'), 'hex')),
      R5: encodeCollByteRegister(Buffer.from('7'.repeat(40), 'hex')),
      R6: encodeLongRegister(12_100_000),
      R7: encodeCollByteRegister(Buffer.from(recipientErgoTreeHex, 'hex')),
    },
  );
  const service = new AggregateSettlementService({
    ergo: {
      addressToTree: async () => { throw new Error('raw recipient tree must not use address conversion'); },
      findSingletonBox: async (tokenId: string) => {
        if (tokenId === deployed.spvTrackerAuthenticated.nftId) return trackerBox;
        if (tokenId === deployed.doubleUnlockPreventionAuthenticated.nftId) {
          return authenticatedDupBox;
        }
        throw new Error(`unexpected singleton token ${tokenId}`);
      },
      getCurrentHeight: async () => creationHeight,
      getTransaction: async () => null,
      getUnspentBoxesByAddress: async () => [unlockBox],
    },
    state: {
      getAllAvlKeys: () => { throw new Error('legacy DUP history must not feed authenticated V2'); },
      getAuthenticatedV2DupHistory: () => [],
      getAuthenticatedSpvTrackerHistory: () => trackerHistory,
      updatePegOutStatus: vi.fn(),
    },
    deployed,
    verifySidechainBurn: async () => 'confirmed',
  } as any);
  return service.prepareAuthenticatedSettlementUnsignedTx({
    pegOut,
    trackerIdentity,
    settlementIdentity: proofBundle.settlementIdentity,
    creationHeight,
  });
}

async function buildNativeUnsignedSettlementPackage(
  prepared: Awaited<ReturnType<typeof prepareCanonicalSettlement>>,
  readinessReportDigestHex = hex('8'),
): Promise<AuthenticatedV2UnsignedSettlementPackage> {
  const creationHeight = Number(prepared.eip12Tx.outputs[0]?.creationHeight);
  const eip12 = toJsonSafe(prepared.eip12Tx) as typeof prepared.eip12Tx;
  const withoutDigest: Omit<AuthenticatedV2UnsignedSettlementPackage, 'packageDigestHex'> = {
    schema: AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_PACKAGE_SCHEMA,
    source: {
      readinessSchema: AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA,
      readinessReportDigestHex,
      companionSchema: AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA,
      companionDigestHex: hex('9'),
      environment: 'testnet',
      observedAt: new Date(0).toISOString(),
    },
    creationHeight,
    targetBurn: {
      trackerEntryIndex: 0,
      sidechainIdHex,
      sidechainTxHashHex,
      sidechainHeight: sidechainHeight.toString(),
      executionBlockHashHex,
      eventIndex,
      burnIdHex,
      amountNanoErg: pegOut.amount.toString(),
      recipientErgoTreeHex,
      recipientErgoTreeHashHex,
      assetIdHex: proof.leaf.assetIdHex,
      bridgeEventRootHex: proof.bridgeEventRootHex,
      inclusion: {
        leafIndex: proof.leafIndex,
        leafCount: proof.leafCount,
        proof: proof.proof,
      },
    },
    contracts: {
      tracker: {
        nftId: singletonTokenId(prepared.trackerBox, 'tracker'),
        ergoTreeHex: prepared.trackerBox.ergoTree,
      },
      duplicatePrevention: {
        nftId: singletonTokenId(prepared.authenticatedDupBox, 'DUP'),
        ergoTreeHex: prepared.authenticatedDupBox.ergoTree,
      },
      vault: { ergoTreeHex: prepared.unlockBox.ergoTree },
    },
    trackerHistory: structuredClone(trackerHistory),
    duplicatePrevention: {
      historyKeys: [],
      currentDigestHex: EMPTY_AVL_DIGEST,
    },
    canonicalInputBytes: {
      trackerDataInput: canonicalInputBytes(prepared.trackerBox),
      duplicatePreventionInput: canonicalInputBytes(prepared.authenticatedDupBox),
      vaultInput: canonicalInputBytes(prepared.unlockBox),
    },
    transaction: {
      eip12,
      eip12Sha256Hex: sha256Canonical(eip12),
      unsignedTransactionIdHex: await deriveUnsignedTransactionId(prepared.eip12Tx),
      contextExtensionGuard: {
        status: prepared.contextExtensionGuard.status,
        reason: prepared.contextExtensionGuard.reason,
        effectiveThreshold: prepared.contextExtensionGuard.effectiveThreshold,
        offenderCount: prepared.contextExtensionGuard.offenders.length,
        signingPermitted: false,
        broadcastPermitted: false,
      },
    },
    boundary: {
      transactionConstructed: true,
      transactionCheckPerformed: false,
      transactionSigned: false,
      transactionSubmitted: false,
      transactionBroadcast: false,
      deploymentPerformed: false,
      packageDigestAuthenticatesSources: false,
      gate5Closed: false,
      trustlessSettlementClaim: false,
      productionReady: false,
      r9RemainsFinalityAuthority: true,
    },
  };
  return validateAuthenticatedV2UnsignedSettlementPackage({
    ...withoutDigest,
    packageDigestHex: sha256Canonical(withoutDigest),
  });
}

function singletonTokenId(box: BoxLike, label: string): string {
  if (box.assets?.length !== 1 || BigInt(box.assets[0].amount) !== 1n) {
    throw new Error(`${label} fixture must contain exactly one singleton token`);
  }
  return box.assets[0].tokenId;
}

function canonicalInputBytes(box: BoxLike) {
  const parsed = TEST_WASM.ErgoBox.from_json(JSON.stringify(toJsonSafe(box)));
  try {
    const sigmaSerializedHex = Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
    return {
      boxIdHex: box.boxId,
      sigmaSerializedHex,
      sigmaSerializedSha256Hex: createHash('sha256')
        .update(Buffer.from(sigmaSerializedHex, 'hex'))
        .digest('hex'),
    };
  } finally {
    parsed.free?.();
  }
}

function authenticatedV2RecoveryChainFixture(
  prepared: Awaited<ReturnType<typeof prepareCanonicalSettlement>>,
) {
  const trackerRegisters = prepared.trackerBox.additionalRegisters;
  if (trackerRegisters?.R9 === undefined) {
    throw new Error('prepared tracker fixture must bind the finality authority in R9');
  }
  const duplicatePreventionTransactionId = prepared.authenticatedDupBox.transactionId;
  if (duplicatePreventionTransactionId === undefined) {
    throw new Error('prepared DUP fixture must have a creating transaction ID');
  }
  const trackerNftIdHex = singletonTokenId(prepared.trackerBox, 'tracker');
  const duplicatePreventionNftIdHex = singletonTokenId(
    prepared.authenticatedDupBox,
    'DUP',
  );
  const anchorHeaderIdHex = hex('b');
  const admissionHeaderIdHex = hex('c');
  const snapshot = Object.freeze({
    id: hex('8'),
    parentId: hex('9'),
    height: 130,
    extensionRoot: hex('7'),
    extensionHash: hex('7'),
  });
  const membership = buildErgoExtensionMembershipProof([
    { key: Buffer.from('0100', 'hex'), value: Buffer.alloc(32, 0x01) },
    {
      key: Buffer.from(checkpoint.checkpointCommitment.extensionKeyHex, 'hex'),
      value: Buffer.from(checkpoint.checkpointCommitment.extensionValueHex, 'hex'),
    },
  ], Buffer.from(checkpoint.checkpointCommitment.extensionKeyHex, 'hex'));
  const trackerPlan = buildAuthenticatedSpvAdmission({
    encodedCheckpointHex: checkpoint.checkpointCommitment.encodedCheckpointHex,
    aggregateFinalityCommitmentHex:
      buildAggregateFinalityCommitmentV1(aggregateFinalityProof).encodedCommitmentHex,
    extensionProofHex: membership.proof.toString('hex'),
    anchorHeader: {
      idHex: anchorHeaderIdHex,
      height: 100,
      extensionRootHex: membership.root.toString('hex'),
      contextIndex: 0,
    },
    approvedSidechainIdHex: sidechainIdHex,
    history: [],
    currentCounter: 0,
    currentLatestSidechainHeight: 0,
    currentStampHeight: 90,
    currentErgoHeight: 101,
    finalityAttestorSigmaPropRegisterHex: trackerRegisters.R9,
  });
  expect(trackerPlan.trackerKeyHex).toBe(trackerHistory[0].key);
  expect(trackerPlan.trackerValueHex).toBe(trackerHistory[0].value);
  expect(trackerPlan.successorRegisters).toEqual(prepared.trackerBox.additionalRegisters);

  const trackerGenesisTemplate = settlementBox(
    hex('6'),
    prepared.trackerBox.ergoTree,
    Number(prepared.trackerBox.value),
    trackerPlan.inputRegisters,
    trackerNftIdHex,
  );
  const trackerGenesis = {
    ...structuredClone(trackerGenesisTemplate),
    inclusionHeight: 100,
    globalIndex: 1,
    spentTransactionId: prepared.trackerBox.transactionId,
    spendingProof: { proofBytes: '', extension: { ...trackerPlan.contextExtension } },
  };
  const trackerTip = {
    ...structuredClone(prepared.trackerBox),
    inclusionHeight: 101,
    globalIndex: 2,
    spentTransactionId: null,
    spendingProof: null,
  };
  const trackerTransaction = {
    id: prepared.trackerBox.transactionId,
    blockId: admissionHeaderIdHex,
    inclusionHeight: 101,
    inputs: [structuredClone(trackerGenesis)],
    outputs: [structuredClone(prepared.trackerBox)],
  };
  const admissionHeader = {
    id: admissionHeaderIdHex,
    parentId: anchorHeaderIdHex,
    height: 101,
    extensionRoot: hex('a'),
    extensionHash: hex('a'),
  };
  const anchorHeader = {
    id: anchorHeaderIdHex,
    parentId: hex('a'),
    height: 100,
    extensionRoot: membership.root.toString('hex'),
    extensionHash: membership.root.toString('hex'),
  };

  const duplicatePreventionTip = {
    ...structuredClone(prepared.authenticatedDupBox),
    inclusionHeight: 100,
    spentTransactionId: null,
    spendingProof: null,
  };
  const duplicatePreventionPairedOutput = Object.freeze({ boxId: hex('d') });
  const duplicatePreventionSetup = {
    id: prepared.authenticatedDupBox.transactionId,
    blockId: hex('5'),
    inclusionHeight: 100,
    inputs: [{ boxId: duplicatePreventionNftIdHex, spendingProof: { proofBytes: '', extension: {} } }],
    dataInputs: [],
    outputs: [
      structuredClone(prepared.authenticatedDupBox),
      duplicatePreventionPairedOutput,
    ],
  };

  const vaultIndexed = {
    ...structuredClone(prepared.unlockBox),
    inclusionHeight: 102,
    globalIndex: 3,
    spentTransactionId: null,
  };
  const vaultCurrent = structuredClone(vaultIndexed);
  const vaultAddress = `9${'A'.repeat(50)}`;

  const source = (observationSourceId: string): AuthenticatedV2VaultChainSource => ({
    observationSourceId,
    async getInfo() {
      return { network: 'testnet' };
    },
    async getIndexedHeight() {
      return { indexedHeight: snapshot.height, fullHeight: snapshot.height };
    },
    async getBestHeader() {
      return structuredClone(snapshot);
    },
    async getIndexedBoxesByTokenId(tokenId: string) {
      if (tokenId === trackerNftIdHex) {
        return [structuredClone(trackerTip), structuredClone(trackerGenesis)];
      }
      if (tokenId === duplicatePreventionNftIdHex) {
        return [structuredClone(duplicatePreventionTip)];
      }
      return [];
    },
    async getTransaction(txId: string) {
      if (txId === trackerTransaction.id) return structuredClone(trackerTransaction);
      if (txId === duplicatePreventionSetup.id) {
        return structuredClone(duplicatePreventionSetup);
      }
      return null;
    },
    async getBlockHeaderById(headerId: string) {
      if (headerId === admissionHeaderIdHex) return structuredClone(admissionHeader);
      if (headerId === anchorHeaderIdHex) return structuredClone(anchorHeader);
      return null;
    },
    async getBoxByIdOrNull(boxId: string) {
      if (boxId === trackerTip.boxId) return structuredClone(trackerTip);
      if (boxId === duplicatePreventionTip.boxId) {
        return structuredClone(duplicatePreventionTip);
      }
      if (boxId === vaultCurrent.boxId) return structuredClone(vaultCurrent);
      return null;
    },
    async getBoxBinaryByIdOrNull(boxId: string) {
      const box = boxId === duplicatePreventionTip.boxId
        ? prepared.authenticatedDupBox
        : boxId === vaultCurrent.boxId
          ? vaultCurrent
          : null;
      return box ? { bytes: canonicalInputBytes(box).sigmaSerializedHex } : null;
    },
    async getIndexedBoxesByAddress() {
      return [structuredClone(vaultIndexed)];
    },
    async getUnspentBoxesByAddress() {
      return [structuredClone(vaultCurrent)];
    },
  });

  return {
    primarySource: source('https://primary.ergo.example'),
    witnessSource: source('https://witness.ergo.example'),
    trackerNftIdHex,
    trackerErgoTreeHex: prepared.trackerBox.ergoTree,
    expectedTrackerGenesisBoxIdHex: trackerGenesis.boxId,
    duplicatePreventionNftIdHex,
    duplicatePreventionErgoTreeHex: prepared.authenticatedDupBox.ergoTree,
    vaultAddress,
    vaultErgoTreeHex: prepared.unlockBox.ergoTree,
  };
}

const RECOVERY_BRIDGE_ADDRESS = '0x00000000000000000000000000000000000000b1';
const RECOVERY_SIDECHAIN_TIP_HASH = hex('f');

function authenticatedV2RecoverySidechainSource(): StableSidechainSource {
  const bridgeInterface = new ethers.Interface([
    'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
  ]);
  const encoded = bridgeInterface.encodeEventLog(
    bridgeInterface.getEvent('PegOut')!,
    [pegOut.user, pegOut.amount, `0x${pegOut.ergoRecipientAddress}`],
  );
  const receipt = {
    status: 1,
    hash: `0x${pegOut.sidechainTxHash}`,
    blockNumber: pegOut.sidechainBlockNumber,
    blockHash: `0x${pegOut.sidechainBlockHash}`,
    logs: [{
      address: RECOVERY_BRIDGE_ADDRESS,
      topics: [...encoded.topics],
      data: encoded.data,
      transactionHash: `0x${pegOut.sidechainTxHash}`,
      blockNumber: pegOut.sidechainBlockNumber,
      blockHash: `0x${pegOut.sidechainBlockHash}`,
      logIndex: pegOut.sidechainLogIndex,
    }],
  };
  return {
    async getBlockNumber() {
      return 51;
    },
    async getTransactionReceipt() {
      return structuredClone(receipt);
    },
    async getBlock(blockNumber: number) {
      return {
        hash: `0x${blockNumber === pegOut.sidechainBlockNumber
          ? pegOut.sidechainBlockHash
          : RECOVERY_SIDECHAIN_TIP_HASH}`,
      };
    },
  };
}

function toJsonSafe(value: unknown): any {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, toJsonSafe(entry)]));
  }
  return value;
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalJson(object[key])}`
  )).join(',')}}`;
}

function journalCandidateFixture(
  nativeAdmission: NativeCheckpointSettlementAdmission,
  prepared: Awaited<ReturnType<typeof prepareCanonicalSettlement>>,
) {
  return recordNativeVerifiedAuthenticatedSettlementCandidate({
    state: {
      recordAuthenticatedSettlementCandidate: candidate => ({
        ...candidate,
        status: 'prepared',
        recoverySchema: null,
        recoverySidechainConsensusDigest: null,
        recoveryAdmissionDigest: null,
        recoverySidechainTipHash: null,
        recoverySidechainSourceCount: null,
        checkExpectedTxId: null,
        checkUnsignedPackageDigest: null,
        checkSignedTransactionDigest: null,
        checkResponseDigest: null,
        checkSignerContextDigest: null,
        checkCheckerIdentityDigest: null,
        checkRevalidationDigest: null,
        checkNativeVerificationRequestDigest: null,
        checkTrustAnchorDigest: null,
        checkFinalityHorizonHash: null,
        checkFinalityHorizonHeight: null,
        checkFinalityStatementDigest: null,
        checkFinalityProgramId: null,
        checkFinalityProofSystemId: null,
        checkFinalityVerifierProfileId: null,
        checkFinalityProofPayloadDigest: null,
        checkFinalityProofDigest: null,
        checkStableErgoViewDigest: null,
        checkStableSidechainViewDigest: null,
        checkAdmissionDigest: null,
        invalidationReason: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }),
    },
    nativeAdmission,
    prepared,
    pegOut,
    trackerIdentity,
    observedSidechainTip: 50,
    observedErgoTip: 120,
  });
}

describe('native checkpoint settlement admission', () => {
  it('binds one provenance-verified finalized checkpoint to the exact tracker and burn proof', () => {
    expect(bind()).toMatchObject({
      nativeCheckpointSettlementProfileSha256Hex:
        deriveNativeCheckpointSettlementProfileSha256Hex(profile),
      sidechainIdHex,
      sidechainHeight: sidechainHeight.toString(),
      nativeConsensusBlockHashHex: nativeBlockHashHex.slice(2),
      executionBlockHashHex,
      bridgeEventRootHex: proof.bridgeEventRootHex,
      burnLeafCount: proof.leafCount,
      burnIdHex,
      sidechainTxHashHex,
      eventIndex,
      leafIndex: proof.leafIndex,
      leafHashHex: proof.leaf.leafHashHex,
      recipientErgoTreeHashHex,
      amountNanoErg: '10000000',
      assetIdHex: proof.leaf.assetIdHex,
      checkpointCommitmentHex:
        checkpoint.checkpointCommitment.checkpointCommitmentHex,
      nativeVerificationRequestDigestHex:
        checkpoint.nativeVerification.requestDigestHex.slice(2),
      trustAnchorDigestHex:
        checkpoint.finalityStatement.trustedAnchorDigestHex,
      finalityHorizonHashHex:
        checkpoint.finalityStatement.finalityHorizonHashHex,
      finalityHorizonHeight:
        checkpoint.finalityStatement.finalityHorizonHeight,
      finalityStatementDigestHex:
        checkpoint.finalityStatement.statementDigestHex,
      finalityProgramIdHex:
        checkpoint.finalityStatement.programIdHex,
      finalityProofSystemId: aggregateFinalityProof.proofSystemId,
      finalityVerifierProfileIdHex: aggregateFinalityProof.verifierProfileIdHex,
      finalityProofPayloadDigestHex: aggregateFinalityProof.payloadDigestHex,
      finalityProofDigestHex: aggregateFinalityProof.proofDigestHex,
      boundary: {
        sidechainFinalityVerified: true,
        trackerCommitmentMatched: true,
        ergoExtensionAnchorVerified: false,
        onChainAcceptanceVerified: false,
        transactionMutationEnabled: false,
        gate5Closed: false,
      },
    });
  });

  it('rejects a structurally forged native checkpoint', () => {
    const forged = structuredClone(checkpoint) as NativeVerifiedBridgeCheckpoint;
    expect(() => bind({ checkpoint: forged })).toThrow(/checkpoint provenance/i);
  });

  it('rejects a structurally cloned aggregate finality proof', () => {
    expect(() => bind({
      aggregateFinalityProof: structuredClone(aggregateFinalityProof),
    })).toThrow(/aggregate finality proof provenance/i);
  });

  it('rejects a verifier-built checkpoint that did not pass through a reviewed profile', async () => {
    const unreviewedCheckpoint = await verifiedCheckpoint();
    expect(() => bind({ checkpoint: unreviewedCheckpoint }))
      .toThrow(/reviewed native checkpoint settlement profile provenance/i);
  });

  it.each([
    ['configured sidechain ID', { expectedSidechainIdHex: hex('f') }, /configured sidechain ID/i],
    ['tracker sidechain ID', { trackerIdentity: { ...trackerIdentity, sidechainIdHex: hex('f') } }, /tracker sidechain ID/i],
    ['tracker height', { trackerIdentity: { ...trackerIdentity, sidechainHeight: sidechainHeight + 1 } }, /tracker height/i],
    ['tracker execution hash', { trackerIdentity: { ...trackerIdentity, executionBlockHashHex: hex('f') } }, /tracker execution block hash/i],
    ['peg-out height', { pegOut: { ...pegOut, sidechainBlockNumber: sidechainHeight + 1 } }, /peg-out height/i],
    ['peg-out execution hash', { pegOut: { ...pegOut, sidechainBlockHash: hex('f') } }, /peg-out execution block hash/i],
    ['burn proof sidechain ID', { proofBundle: { ...proofBundle, proof: { ...proof, leaf: { ...proof.leaf, sidechainIdHex: hex('f') } } } }, /burn proof sidechain ID/i],
    ['burn proof height identity', { proofBundle: { ...proofBundle, proof: { ...proof, leaf: { ...proof.leaf, sidechainBlockHashHex: hex('f') } } } }, /burn proof execution block hash/i],
    ['burn proof root', { proofBundle: { ...proofBundle, proof: { ...proof, bridgeEventRootHex: hex('f') } } }, /burn proof event root/i],
    ['burn count', { proofBundle: { ...proofBundle, proof: { ...proof, leafCount: proof.leafCount + 1 } } }, /burn proof leaf count/i],
  ])('rejects an isolated %s mismatch', (_label, overrides, message) => {
    expect(() => bind(overrides)).toThrow(message);
  });

  it('rejects a tracker event-root mismatch independently of its checkpoint commitment', () => {
    const decodedValue = encodedTrackerValue({ bridgeEventRootHex: hex('f') });
    expect(() => bind({ trackerHistory: [{ ...trackerHistory[0], value: decodedValue }] }))
      .toThrow(/tracker event root/i);
  });

  it('rejects a tracker checkpoint-commitment mismatch independently of its event root', () => {
    const decodedValue = encodedTrackerValue({ checkpointCommitmentHex: hex('f') });
    expect(() => bind({ trackerHistory: [{ ...trackerHistory[0], value: decodedValue }] }))
      .toThrow(/tracker checkpoint commitment/i);
  });

  it.each([
    ['proof system ID', 103, /proof system/i],
    ['statement digest', 104, /tracker finality proof identity/i],
    ['program ID', 136, /program ID/i],
    ['verifier profile ID', 168, /tracker finality proof identity/i],
    ['proof payload digest', 200, /tracker finality proof identity/i],
    ['aggregate proof digest', 232, /tracker finality proof identity/i],
  ])('rejects an isolated tracker finality %s mismatch', (_label, offset, message) => {
    const valueBytes = Buffer.from(encodedTrackerValue(), 'hex');
    valueBytes[offset] ^= 0x01;
    const value = valueBytes.toString('hex');
    expect(() => bind({ trackerHistory: [{ ...trackerHistory[0], value }] }))
      .toThrow(message);
  });

  it.each([
    ['transaction hash', { ...proof, leaf: { ...proof.leaf, sidechainTxHashHex: hex('f') } }, /transaction hash/i],
    ['event index', { ...proof, leaf: { ...proof.leaf, eventIndex: eventIndex + 1 } }, /event index/i],
    ['burn ID', { ...proof, leaf: { ...proof.leaf, burnIdHex: hex('f') } }, /burn ID/i],
    ['amount', { ...proof, leaf: { ...proof.leaf, amountNanoErg: '10000001' } }, /amount/i],
    ['recipient', { ...proof, leaf: { ...proof.leaf, recipientErgoTreeHashHex: hex('f') } }, /recipient/i],
    ['asset', { ...proof, leaf: { ...proof.leaf, assetIdHex: hex('f') } }, /asset/i],
  ])('rejects an isolated target burn %s mismatch before envelope validation', (
    _label,
    changedProof,
    message,
  ) => {
    expect(() => bind({
      proofBundle: { ...proofBundle, proof: changedProof },
    })).toThrow(message);
  });

  it('rejects settlement identity drift independently of the proof envelope', () => {
    expect(() => bind({
      proofBundle: {
        ...proofBundle,
        settlementIdentity: {
          ...proofBundle.settlementIdentity,
          duplicatePreventionKeyHex: hex('f'),
        },
      },
    })).toThrow(/settlement identity/i);
  });

  it('rejects a peg-out amount above the positive Ergo Long range', () => {
    expect(() => bind({
      pegOut: { ...pegOut, amount: 0x8000_0000_0000_0000n },
    })).toThrow(/peg-out amount must fit the positive Ergo Long range/i);
  });

  it('rejects non-canonical proof envelope metadata after semantic bindings match', () => {
    expect(() => bind({
      proofBundle: {
        ...proofBundle,
        proof: {
          ...proof,
          leaf: { ...proof.leaf, encodedLeafHex: `${proof.leaf.encodedLeafHex}00` },
        },
      },
    })).toThrow(/burn proof envelope.*encodedLeafHex/i);
  });

  it('requires exactly one tracker history entry for the derived key', () => {
    expect(() => bind({ trackerHistory: [] })).toThrow(/exactly one matching checkpoint/i);
    expect(() => bind({ trackerHistory: [trackerHistory[0], trackerHistory[0]] }))
      .toThrow(/exactly one matching checkpoint/i);
  });

  it('carries producer provenance through the daemon candidate coordinator', async () => {
    const nativeAdmission = bind();
    const prepared = await prepareCanonicalSettlement();
    const recordAuthenticatedSettlementCandidate = vi.fn(candidate => ({
      ...candidate,
      status: 'prepared',
    }));
    const input = {
      state: { recordAuthenticatedSettlementCandidate },
      nativeAdmission,
      prepared,
      pegOut,
      trackerIdentity,
      observedSidechainTip: 50,
      observedErgoTip: 120,
    };

    expect(() => assertNativeCheckpointSettlementCandidateBindings(input)).not.toThrow();
    expect(recordNativeVerifiedAuthenticatedSettlementCandidate(input).status)
      .toBe('prepared');
    expect(recordAuthenticatedSettlementCandidate).toHaveBeenCalledTimes(1);
    const recordedInput = recordAuthenticatedSettlementCandidate.mock.calls[0][0];
    expect(() => assertNativeVerifiedAuthenticatedSettlementCandidateProvenance(
      recordedInput,
    )).not.toThrow();
    expect(() => assertNativeVerifiedAuthenticatedSettlementCandidateProvenance(
      structuredClone(recordedInput),
    )).toThrow(/candidate provenance/i);
    const storage = new StateTracker(':memory:');
    try {
      expect(() => storage.recordAuthenticatedSettlementCandidate(
        buildAuthenticatedSettlementCandidate(input),
      )).toThrow(/candidate provenance/i);
      expect(() => storage.recordAuthenticatedSettlementCandidate(
        structuredClone(recordedInput),
      )).toThrow(/candidate provenance/i);
    } finally {
      storage.close();
    }
    expect(recordedInput.candidateId).not.toBe(
      buildAuthenticatedSettlementCandidate(input).candidateId,
    );
    const baseCandidate = buildAuthenticatedSettlementCandidate(input);
    const nativeBoundCandidateId = deriveNativeVerifiedAuthenticatedSettlementCandidateId(
      baseCandidate,
      nativeAdmission,
    );
    for (const drift of [
      { finalityStatementDigestHex: hex('e') },
      { finalityProgramIdHex: hex('d') },
      { finalityProofSystemId: 2 },
      { finalityVerifierProfileIdHex: hex('c') },
      { finalityProofPayloadDigestHex: hex('b') },
      { finalityProofDigestHex: hex('a') },
    ]) {
      expect(deriveNativeVerifiedAuthenticatedSettlementCandidateId(
        baseCandidate,
        { ...nativeAdmission, ...drift } as NativeCheckpointSettlementAdmission,
      )).not.toBe(nativeBoundCandidateId);
    }
    expect(() => recordNativeVerifiedAuthenticatedSettlementCandidate({
      ...input,
      nativeAdmission: structuredClone(nativeAdmission) as NativeCheckpointSettlementAdmission,
    })).toThrow(/settlement admission provenance/i);
    expect(() => recordNativeVerifiedAuthenticatedSettlementCandidate({
      ...input,
      prepared: structuredClone(prepared),
    })).toThrow(/prepared authenticated settlement transaction provenance/i);
    expect(() => assertNativeCheckpointSettlementCandidateBindings({
      ...input,
      prepared: {
        ...prepared,
        plan: {
          ...prepared.plan,
          claims: [{ ...prepared.plan.claims[0], bridgeEventRootHex: hex('f') }],
        },
      },
    })).toThrow(/prepared tracker value/i);
    expect(recordAuthenticatedSettlementCandidate).toHaveBeenCalledTimes(1);
    expect(() => assertNativeCheckpointSettlementCandidateBindings({
      ...input,
      prepared: {
        ...prepared,
        plan: {
          ...prepared.plan,
          claims: [{
            ...prepared.plan.claims[0],
            trackerCheckpointCommitmentHex: hex('f'),
          }],
        },
      },
    })).toThrow(/prepared tracker value/i);
    expect(recordAuthenticatedSettlementCandidate).toHaveBeenCalledTimes(1);
    expect(() => assertNativeCheckpointSettlementCandidateBindings({
      ...input,
      prepared: {
        ...prepared,
        plan: {
          ...prepared.plan,
          claims: [prepared.plan.claims[0], prepared.plan.claims[0]],
        },
      } as any,
    })).toThrow(/exactly one claim/i);
    expect(() => assertNativeCheckpointSettlementCandidateBindings({
      ...input,
      prepared: {
        ...prepared,
        eip12Tx: {
          ...prepared.eip12Tx,
          outputs: prepared.eip12Tx.outputs.map((output: any, index: number) =>
            index === 1 ? { ...output, ergoTree: `0008cd02${'f'.repeat(64)}` } : output
          ),
        },
      },
    })).toThrow(/payout recipient/i);
    expect(() => assertNativeCheckpointSettlementCandidateBindings({
      ...input,
      prepared: {
        ...prepared,
        eip12Tx: {
          ...prepared.eip12Tx,
          outputs: prepared.eip12Tx.outputs.map((output: any, index: number) =>
            index === 1 ? { ...output, value: 10_000_001 } : output
          ),
        },
      },
    })).toThrow(/payout amount/i);
    expect(() => assertNativeCheckpointSettlementCandidateBindings({
      ...input,
      prepared: {
        ...prepared,
        eip12Tx: {
          ...prepared.eip12Tx,
          outputs: prepared.eip12Tx.outputs.map((output: any, index: number) =>
            index === 1
              ? { ...output, assets: [{ tokenId: hex('f'), amount: 1 }] }
              : output
          ),
        },
      },
    })).toThrow(/payout asset/i);
    expect(() => assertNativeCheckpointSettlementCandidateBindings({
      ...input,
      prepared: {
        ...prepared,
        plan: {
          ...prepared.plan,
          claims: [{
            ...prepared.plan.claims[0],
            settlementIdentity: {
              ...prepared.plan.claims[0].settlementIdentity,
              trustlessBurnProof: [{ side: 'right', hashHex: hex('f') }],
            },
          }],
        },
      },
    })).toThrow(/settlement identity/i);
    expect(() => assertNativeCheckpointSettlementCandidateBindings({
      ...input,
      prepared: {
        ...prepared,
        contextExtensionGuard: {
          ...prepared.contextExtensionGuard,
          status: 'blocked',
        },
      },
    })).toThrow(/context-extension guard/i);
    expect(() => assertNativeCheckpointSettlementCandidateBindings({
      ...input,
      prepared: {
        ...prepared,
        eip12Tx: {
          ...prepared.eip12Tx,
          inputs: [...prepared.eip12Tx.inputs].reverse(),
        },
      },
    })).toThrow(/input ordering/i);
    expect(() => assertNativeCheckpointSettlementCandidateBindings({
      ...input,
      prepared: {
        ...prepared,
        eip12Tx: {
          ...prepared.eip12Tx,
          dataInputs: [{ boxId: '00'.repeat(32) }],
        },
      },
    })).toThrow(/tracker data-input/i);
    expect(() => assertNativeCheckpointSettlementCandidateBindings({
      ...input,
      prepared: {
        ...prepared,
        unsignedTx: {
          ...prepared.unsignedTx,
          outputs: prepared.unsignedTx.outputs.map((output: any, index: number) =>
            index === 0 ? { ...output, value: 1_000_001 } : output
          ),
        },
      },
    })).toThrow(/EIP-12 outputs/i);
  });

  it('recovers one prepared candidate through real package, cache, sidechain, and SQLite producers', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'bridge-native-package-recovery-'));
    const dbPath = join(directory, 'state.sqlite');
    let primarySidechainRpc: Awaited<ReturnType<typeof startStableSidechainJsonRpcFixture>> | undefined;
    let witnessSidechainRpc: Awaited<ReturnType<typeof startStableSidechainJsonRpcFixture>> | undefined;
    let sidechainSources: ReturnType<
      typeof createAuthenticatedSettlementSidechainObservationSourcePair
    > | undefined;
    try {
      const nativeAdmission = bind();
      const prepared = await prepareCanonicalSettlement();
      const unsignedPackage = await buildNativeUnsignedSettlementPackage(prepared);
      const chain = authenticatedV2RecoveryChainFixture(prepared);
      const state = new StateTracker(dbPath);
      let recovery: Awaited<ReturnType<typeof recoverAuthenticatedV2PreparedCandidate>>;
      try {
        const cacheRecovery = await recoverAuthenticatedV2Caches({
          stateTracker: state,
          primarySource: chain.primarySource,
          witnessSource: chain.witnessSource,
          trackerNftIdHex: chain.trackerNftIdHex,
          trackerErgoTreeHex: chain.trackerErgoTreeHex,
          expectedSidechainIdHex: sidechainIdHex,
          expectedTrackerGenesisBoxIdHex: chain.expectedTrackerGenesisBoxIdHex,
          duplicatePreventionNftIdHex: chain.duplicatePreventionNftIdHex,
          duplicatePreventionErgoTreeHex: chain.duplicatePreventionErgoTreeHex,
          expectedNetwork: 'testnet',
          vaultAddress: chain.vaultAddress,
          vaultErgoTreeHex: chain.vaultErgoTreeHex,
          now: () => new Date('2026-07-15T00:00:00.000Z'),
        });
        expect(cacheRecovery.currentInputs).toEqual({
          trackerBoxIdHex: prepared.trackerBox.boxId,
          duplicatePreventionBoxIdHex: prepared.authenticatedDupBox.boxId,
          vaultBoxIdsHex: [prepared.unlockBox.boxId],
        });

        primarySidechainRpc = await startStableSidechainJsonRpcFixture(
          authenticatedV2RecoverySidechainSource(),
        );
        witnessSidechainRpc = await startStableSidechainJsonRpcFixture(
          authenticatedV2RecoverySidechainSource(),
        );
        sidechainSources = createAuthenticatedSettlementSidechainObservationSourcePair({
          primaryRpcUrl: primarySidechainRpc.rpcUrl,
          witnessRpcUrl: witnessSidechainRpc.rpcUrl,
        });
        recovery = await recoverAuthenticatedV2PreparedCandidate({
          state,
          cacheRecovery,
          packageValue: unsignedPackage,
          expectedPackageDigestHex: unsignedPackage.packageDigestHex,
          nativeAdmission,
          prepared,
          pegOut,
          trackerIdentity,
          observedSidechainTip: 51,
          sidechainSources,
          bridgeAddress: RECOVERY_BRIDGE_ADDRESS,
          requiredSidechainConfirmations: 10,
        });

        expect(recovery.candidate).toEqual(expect.objectContaining({
          status: 'prepared',
          recoverySchema: recovery.schema,
          recoverySidechainConsensusDigest: recovery.sidechainConsensusDigestHex,
          recoveryAdmissionDigest: recovery.recoveryAdmissionDigestHex,
          recoverySidechainTipHash: RECOVERY_SIDECHAIN_TIP_HASH,
          recoverySidechainSourceCount: 2,
          checkExpectedTxId: null,
          checkAdmissionDigest: null,
        }));
        expect(state.getRecoverableAggregateSettlementAttempts()).toEqual([]);
      } finally {
        state.close();
      }

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(recovery!.candidate.candidateId))
          .toEqual(expect.objectContaining({
            status: 'prepared',
            recoverySidechainConsensusDigest: recovery!.sidechainConsensusDigestHex,
            recoveryAdmissionDigest: recovery!.recoveryAdmissionDigestHex,
            recoverySidechainTipHash: recovery!.sidechainTipHashHex,
            recoverySidechainSourceCount: 2,
            checkExpectedTxId: null,
          }));
      } finally {
        reopened.close();
      }
    } finally {
      if (sidechainSources) {
        destroyAuthenticatedSettlementSidechainObservationSourcePair(sidechainSources);
      }
      if (primarySidechainRpc) await primarySidechainRpc.close();
      if (witnessSidechainRpc) await witnessSidechainRpc.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  });

  it('rebuilds the exact journaled transaction before producing a bound JVM check acceptance', async () => {
    const nativeAdmission = bind();
    const prepared = await prepareCanonicalSettlement();
    const unsignedPackage = await buildNativeUnsignedSettlementPackage(prepared);
    const candidate = journalCandidateFixture(nativeAdmission, prepared);
    const revalidated = await revalidateAuthenticatedSettlementCandidate({
      candidate,
      nativeAdmission,
      prepared,
      pegOut,
      trackerIdentity,
    });
    const packageBinding = await bindAuthenticatedV2UnsignedSettlementPackage({
      packageValue: unsignedPackage,
      expectedPackageDigestHex: unsignedPackage.packageDigestHex,
      expectedTxId: revalidated.expectedTxId,
      prepared,
    });
    const splitIdentity = signedCheckIdentity();
    const exactSignedTx = Object.freeze({
      id: revalidated.expectedTxId,
      inputs: prepared.eip12Tx.inputs,
      proofs: ['exact-checked-proof-bytes'],
    });
    splitCheckMocks.sign.mockImplementationOnce(async (
      eip12Tx,
      _label,
      expectedTxId,
      nodeOrigin,
    ) => {
      expect(eip12Tx).toBe(prepared.eip12Tx);
      return createMockSignedCheckCandidate({
        txId: expectedTxId,
        signedTx: exactSignedTx,
        nodeOrigin,
        signerContext: splitIdentity.signerContext,
      });
    });
    const signedCandidate =
      await signPackageBoundRevalidatedAuthenticatedSettlementCandidate(
        packageBinding,
        revalidated,
        'Authenticated V2 split JVM check',
        splitIdentity.checkerIdentity.nodeOrigin,
      );
    expect(splitCheckMocks.sign).toHaveBeenCalledOnce();
    expect(signedCandidate.signed.signedTransactionDigestHex)
      .toBe(signedCandidate.signedTransactionDigestHex);
    expect(JSON.stringify(signedCandidate)).not.toContain('"signedTx":');
    expect(JSON.stringify(signedCandidate)).not.toContain(
      'exact-checked-proof-bytes',
    );
    expect(() => assertAuthenticatedSettlementSignedCheckCandidateProvenance(
      signedCandidate,
    )).not.toThrow();
    expect(() => assertAuthenticatedSettlementSignedCheckCandidateProvenance(
      structuredClone(signedCandidate),
    )).toThrow(/signed check candidate provenance/i);

    splitCheckMocks.check.mockImplementationOnce(async (signed, _label, nodeOrigin) => ({
      txId: signed.txId,
      checkResult: `0x${signed.txId}`,
      signedTransactionDigestHex: signed.signedTransactionDigestHex,
      signerContext: signed.signerContext,
      checkerIdentity: {
        ...splitIdentity.checkerIdentity,
        nodeOrigin,
      },
    }));
    const splitAcceptance =
      await checkPackageBoundSignedAuthenticatedSettlementCandidate(
        packageBinding,
        revalidated,
        signedCandidate,
        'Authenticated V2 split JVM check',
      );
    expect(splitCheckMocks.check).toHaveBeenCalledWith(
      signedCandidate.signed,
      'Authenticated V2 split JVM check',
      splitIdentity.checkerIdentity.nodeOrigin,
    );
    expect(splitAcceptance.signedTransactionDigestHex)
      .toBe(signedCandidate.signedTransactionDigestHex);
    expect(splitAcceptance.signerContextDigestHex)
      .toBe(signedCandidate.signerContextDigestHex);

    splitCheckMocks.check.mockImplementationOnce(async signed => ({
      txId: signed.txId,
      checkResult: `0x${signed.txId}`,
      signedTransactionDigestHex: 'ff'.repeat(32),
      signerContext: signed.signerContext,
      checkerIdentity: splitIdentity.checkerIdentity,
    }));
    await expect(
      checkPackageBoundSignedAuthenticatedSettlementCandidate(
        packageBinding,
        revalidated,
        signedCandidate,
        'Authenticated V2 split JVM check with changed proof bytes',
      ),
    ).rejects.toThrow(/exact signed settlement candidate/i);

    expect(revalidated.expectedTxId).toMatch(/^[0-9a-f]{64}$/);
    expect(revalidated.unsignedTxDigest).toBe(candidate.unsignedTxDigest);
    expect(revalidated.finalityStatementDigestHex)
      .toBe(nativeAdmission.finalityStatementDigestHex);
    expect(revalidated.finalityProgramIdHex).toBe(nativeAdmission.finalityProgramIdHex);
    expect(revalidated.finalityProofSystemId).toBe(nativeAdmission.finalityProofSystemId);
    expect(revalidated.finalityVerifierProfileIdHex)
      .toBe(nativeAdmission.finalityVerifierProfileIdHex);
    expect(revalidated.finalityProofPayloadDigestHex)
      .toBe(nativeAdmission.finalityProofPayloadDigestHex);
    expect(revalidated.finalityProofDigestHex).toBe(nativeAdmission.finalityProofDigestHex);
    expect(() => assertRevalidatedAuthenticatedSettlementCandidateProvenance(
      revalidated,
    )).not.toThrow();
    expect(() => assertRevalidatedAuthenticatedSettlementCandidateProvenance(
      structuredClone(revalidated),
    )).toThrow(/revalidated.*provenance/i);
    await expect(checkPackageBoundRevalidatedAuthenticatedSettlementCandidate(
      {} as any,
      revalidated,
      'Authenticated V2 JVM check',
    )).rejects.toThrow(/package-bound.*provenance/i);

    const checkTransaction = vi.fn(async (eip12Tx, _label, expectedTxId) => ({
      txId: expectedTxId,
      signedTx: { id: expectedTxId, inputs: eip12Tx.inputs },
      signedTransactionDigestHex: expectedTxId,
      checkResult: `0x${expectedTxId}`,
      ...signedCheckIdentity(),
    }));
    const unboundCheck = vi.fn();
    await expect(checkPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting(
      {} as any,
      revalidated,
      'Authenticated V2 JVM check',
      unboundCheck,
    )).rejects.toThrow(/package-bound.*provenance/i);
    expect(unboundCheck).not.toHaveBeenCalled();
    const acceptance = await checkPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting(
      packageBinding,
      revalidated,
      'Authenticated V2 JVM check',
      checkTransaction,
    );
    expect(checkTransaction).toHaveBeenCalledWith(
      prepared.eip12Tx,
      'Authenticated V2 JVM check',
      revalidated.expectedTxId,
    );
    expect(acceptance).toMatchObject({
      candidateId: candidate.candidateId,
      expectedTxId: revalidated.expectedTxId,
      revalidationDigestHex: revalidated.revalidationDigestHex,
      finalityHorizonHeight: 43n,
      finalityStatementDigestHex: nativeAdmission.finalityStatementDigestHex,
      finalityProgramIdHex: nativeAdmission.finalityProgramIdHex,
      finalityProofSystemId: nativeAdmission.finalityProofSystemId,
      finalityVerifierProfileIdHex: nativeAdmission.finalityVerifierProfileIdHex,
      finalityProofPayloadDigestHex: nativeAdmission.finalityProofPayloadDigestHex,
      finalityProofDigestHex: nativeAdmission.finalityProofDigestHex,
      unsignedPackageDigestHex: unsignedPackage.packageDigestHex,
      signerContextDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      checkerIdentityDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(() => assertAuthenticatedSettlementJvmCheckAcceptanceProvenance(
      acceptance,
    )).not.toThrow();
    expect(() => assertAuthenticatedSettlementJvmCheckAcceptanceProvenance(
      structuredClone(acceptance),
    )).toThrow(/JVM check acceptance provenance/i);

    await expect(checkPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting(
      packageBinding,
      revalidated,
      'Authenticated V2 JVM check with unsupported signer',
      async (_tx, _label, expectedTxId) => ({
        txId: expectedTxId,
        signedTx: { id: expectedTxId },
        signedTransactionDigestHex: expectedTxId,
        checkResult: `0x${expectedTxId}`,
        ...signedCheckIdentity({ signerContext: { profile: 'unknown-signer' } }),
      }) as any,
    )).rejects.toThrow(/signer profile is unsupported/i);
    await expect(checkPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting(
      packageBinding,
      revalidated,
      'Authenticated V2 JVM check with inconsistent signer identity',
      async (_tx, _label, expectedTxId) => ({
        txId: expectedTxId,
        signedTx: { id: expectedTxId },
        signedTransactionDigestHex: expectedTxId,
        checkResult: `0x${expectedTxId}`,
        ...signedCheckIdentity({ signerContext: { ergoTreeHex: `0008cd02${'42'.repeat(32)}` } }),
      }),
    )).rejects.toThrow(/public key and ErgoTree do not match/i);
    await expect(checkPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting(
      packageBinding,
      revalidated,
      'Authenticated V2 JVM check with non-canonical checker',
      async (_tx, _label, expectedTxId) => ({
        txId: expectedTxId,
        signedTx: { id: expectedTxId },
        signedTransactionDigestHex: expectedTxId,
        checkResult: `0x${expectedTxId}`,
        ...signedCheckIdentity({ checkerIdentity: { nodeOrigin: 'http://127.0.0.1:9052/' } }),
      }),
    )).rejects.toThrow(/checker origin is not canonical/i);

    for (const [label, identity, expectedError] of [
      [
        'malformed signer public key',
        signedCheckIdentity({ signerContext: { pubKeyHex: '02' } }),
        /signer public key must be 33 bytes/i,
      ],
      [
        'malformed signer ErgoTree',
        signedCheckIdentity({ signerContext: { ergoTreeHex: '0008cd' } }),
        /signer ErgoTree must be 36 bytes/i,
      ],
      [
        'out-of-range signer network prefix',
        signedCheckIdentity({ signerContext: { networkPrefix: 256 } }),
        /network prefix must be an unsigned byte/i,
      ],
      [
        'non-positive signer context height',
        signedCheckIdentity({ signerContext: { stateContextTipHeight: 0 } }),
        /context tip height must be positive/i,
      ],
      [
        'malformed signer context tip ID',
        signedCheckIdentity({ signerContext: { stateContextTipIdHex: '32'.repeat(31) } }),
        /context tip ID must be 32 bytes/i,
      ],
      [
        'unsupported checker profile',
        signedCheckIdentity({ checkerIdentity: { profile: 'unknown-checker' } }),
        /checker identity is unsupported/i,
      ],
      [
        'unsupported checker source adapter',
        signedCheckIdentity({ checkerIdentity: { sourceAdapterProfile: 'unknown-source' } }),
        /checker identity is unsupported/i,
      ],
      [
        'wrong checker path',
        signedCheckIdentity({ checkerIdentity: { path: '/transactions' } }),
        /checker identity is unsupported/i,
      ],
      [
        'wrong checker method',
        signedCheckIdentity({ checkerIdentity: { method: 'GET' } }),
        /checker identity is unsupported/i,
      ],
      [
        'wrong checker transport policy',
        signedCheckIdentity({ checkerIdentity: { transportPolicy: 'redirecting-proxy' } }),
        /checker identity is unsupported/i,
      ],
    ] as const) {
      await expect(checkPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting(
        packageBinding,
        revalidated,
        `Authenticated V2 JVM check with ${label}`,
        (async (_tx: any, _checkLabel: string, expectedTxId: string) => ({
          txId: expectedTxId,
          signedTx: { id: expectedTxId },
          signedTransactionDigestHex: expectedTxId,
          checkResult: `0x${expectedTxId}`,
          ...identity,
        })) as any,
      )).rejects.toThrow(expectedError);
    }

    await expect(checkPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting(
      packageBinding,
      revalidated,
      'Authenticated V2 JVM check',
      async () => ({
        txId: hex('f'),
        signedTx: { id: hex('f') },
        signedTransactionDigestHex: hex('f'),
        checkResult: hex('f'),
        ...signedCheckIdentity(),
      }),
    )).rejects.toThrow(/does not match the revalidated unsigned transaction/i);
  });

  it('accepts fresh process provenance for the anchored finality identity and rejects proof or creation-height drift', async () => {
    const originalAdmission = bind();
    const prepared = await prepareCanonicalSettlement();
    const candidate = journalCandidateFixture(originalAdmission, prepared);
    const originalRevalidation = await revalidateAuthenticatedSettlementCandidateForTesting({
      candidate,
      nativeAdmission: originalAdmission,
      prepared,
      pegOut,
      trackerIdentity,
    }, async () => 'de'.repeat(32));

    const freshUnreviewedCheckpoint = await verifiedCheckpoint();
    configureNativeSourceMocks({ checkpoint: freshUnreviewedCheckpoint });
    const freshFinalityPackage = await createAuthorityBoundNativeCheckpointSettlementSource(
      profile,
      authorityForProfile(),
    )
      .collectForSettlement({ sidechainIdHex, sidechainHeight });
    expect(() => bind({
      aggregateFinalityProof: freshFinalityPackage.aggregateFinalityProof,
    })).toThrow(/aggregate finality proof provenance/i);
    const freshAdmission = bind({
      checkpoint: freshFinalityPackage.checkpoint,
      aggregateFinalityProof: freshFinalityPackage.aggregateFinalityProof,
    });
    const freshRevalidation = await revalidateAuthenticatedSettlementCandidateForTesting({
      candidate,
      nativeAdmission: freshAdmission,
      prepared,
      pegOut,
      trackerIdentity,
    }, async () => 'de'.repeat(32));
    expect(freshRevalidation.expectedTxId).toBe(originalRevalidation.expectedTxId);
    expect(freshRevalidation.finalityHorizonHeight).toBe(43n);
    expect(freshRevalidation.revalidationDigestHex)
      .toBe(originalRevalidation.revalidationDigestHex);

    const newerUnreviewedCheckpoint = await verifiedCheckpoint(validVerification({
      horizonHashHex: prefixedHash('c'),
      horizonHeight: '44',
      canonicalJustificationScaleHex: '0x0a0b',
    }));
    configureNativeSourceMocks({ checkpoint: newerUnreviewedCheckpoint });
    const newerFinalityPackage = await createAuthorityBoundNativeCheckpointSettlementSource(
      profile,
      authorityForProfile(),
    )
      .collectForSettlement({ sidechainIdHex, sidechainHeight });
    expect(() => bind({
      checkpoint: newerFinalityPackage.checkpoint,
      aggregateFinalityProof: newerFinalityPackage.aggregateFinalityProof,
    }))
      .toThrow(/tracker checkpoint commitment does not match/i);
    configureNativeSourceMocks({ checkpoint });

    const changedCreationHeight = await prepareCanonicalSettlement(121);
    await expect(revalidateAuthenticatedSettlementCandidateForTesting({
      candidate,
      nativeAdmission: originalAdmission,
      prepared: changedCreationHeight,
      pegOut,
      trackerIdentity,
    }, async () => 'de'.repeat(32))).rejects.toThrow(/does not match the journaled transaction binding/i);

    await expect(revalidateAuthenticatedSettlementCandidateForTesting({
      candidate: { ...candidate, candidateId: hex('f') },
      nativeAdmission: originalAdmission,
      prepared,
      pegOut,
      trackerIdentity,
    }, async () => 'de'.repeat(32))).rejects.toThrow(/native-bound candidate ID/i);
  });

  it('runs the exact V2 check-only path through the extracted reservation composition', async () => {
    const nativeAdmission = bind();
    const prepared = await prepareCanonicalSettlement();
    const unsignedPackage = await buildNativeUnsignedSettlementPackage(prepared);
    const tempDir = mkdtempSync(join(tmpdir(), 'e2s-check-reservation-app-'));
    const statePath = join(tempDir, 'state.sqlite');
    const state = new StateTracker(statePath);
    try {
      state.insertPegOut(
        pegOut.sidechainTxHash,
        pegOut.ergoRecipientAddress,
        pegOut.amount,
        pegOut.sidechainBlockNumber,
        {
          user: pegOut.user,
          sidechainId: sidechainIdHex,
          sidechainBlockHash: executionBlockHashHex,
          sidechainLogIndex: eventIndex,
        },
      );
      const candidate = recordNativeVerifiedAuthenticatedSettlementCandidate({
        state,
        nativeAdmission,
        prepared,
        pegOut,
        trackerIdentity,
        observedSidechainTip: 50,
        observedErgoTip: 120,
      });
      const revalidated = await revalidateAuthenticatedSettlementCandidate({
        candidate,
        nativeAdmission,
        prepared,
        pegOut,
        trackerIdentity,
      });
      const packageBinding = await bindAuthenticatedV2UnsignedSettlementPackage({
        packageValue: unsignedPackage,
        expectedPackageDigestHex: unsignedPackage.packageDigestHex,
        expectedTxId: revalidated.expectedTxId,
        prepared,
      });
      const checkIdentity = signedCheckIdentity();
      const exactSignedTx = Object.freeze({
        id: revalidated.expectedTxId,
        inputs: prepared.eip12Tx.inputs,
        proofs: ['check-reservation-composition-proof'],
      });
      splitCheckMocks.sign.mockImplementationOnce(
        async (_tx, _label, expectedTxId, nodeOrigin) =>
          createMockSignedCheckCandidate({
            txId: expectedTxId,
            signedTx: exactSignedTx,
            nodeOrigin,
            signerContext: checkIdentity.signerContext,
          }),
      );
      const signed =
        await signPackageBoundRevalidatedAuthenticatedSettlementCandidate(
          packageBinding,
          revalidated,
          'Authenticated V2 reservation composition',
          checkIdentity.checkerIdentity.nodeOrigin,
        );
      splitCheckMocks.check.mockImplementationOnce(
        async (candidate, _label, nodeOrigin) => ({
          txId: candidate.txId,
          checkResult: `0x${candidate.txId}`,
          signedTransactionDigestHex: candidate.signedTransactionDigestHex,
          signerContext: candidate.signerContext,
          checkerIdentity: {
            ...checkIdentity.checkerIdentity,
            nodeOrigin,
          },
        }),
      );
      const acceptance =
        await checkPackageBoundSignedAuthenticatedSettlementCandidate(
          packageBinding,
          revalidated,
          signed,
          'Authenticated V2 reservation composition',
        );
      const stableErgoHeight = Math.max(
        candidate.creationHeight,
        candidate.anchorHeaderHeight + 10,
      );
      const liveBoxes = new Map<string, BoxLike>([
        [candidate.trackerBoxId, prepared.trackerBox],
        [candidate.dupInputBoxId, prepared.authenticatedDupBox],
        [candidate.vaultBoxId, prepared.unlockBox],
      ]);
      const stableErgoView = await observeAuthenticatedSettlementStableErgoView({
        ergo: {
          getCurrentHeight: vi.fn(async () => stableErgoHeight),
          getBlockHeaderHash: vi.fn(async (height: number) =>
            height === candidate.anchorHeaderHeight
              ? candidate.anchorHeaderId
              : hex('f')),
          getBoxByIdOrNull: vi.fn(async (boxId: string) =>
            liveBoxes.get(boxId) ?? null),
        } as any,
        candidate,
        prepared,
        minimumConfirmations: 10,
      });
      const bridgeAddress = `0x${'b'.repeat(40)}`;
      const burnInterface = new ethers.Interface([
        'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
      ]);
      const encodedBurn = burnInterface.encodeEventLog(
        burnInterface.getEvent('PegOut')!,
        [pegOut.user, pegOut.amount, `0x${pegOut.ergoRecipientAddress}`],
      );
      const burnBlockNumber = Number(pegOut.sidechainBlockNumber);
      const burnReceipt = {
        status: 1,
        hash: `0x${pegOut.sidechainTxHash}`,
        blockNumber: burnBlockNumber,
        blockHash: `0x${pegOut.sidechainBlockHash}`,
        logs: [{
          address: bridgeAddress,
          topics: [...encodedBurn.topics],
          data: encodedBurn.data,
          transactionHash: `0x${pegOut.sidechainTxHash}`,
          blockNumber: burnBlockNumber,
          blockHash: `0x${pegOut.sidechainBlockHash}`,
          logIndex: pegOut.sidechainLogIndex,
        }],
      };
      const stableSidechainHeight = burnBlockNumber + 9;
      const stableSidechainView =
        await observeAuthenticatedSettlementStableSidechainView({
          source: {
            getBlockNumber: vi.fn(async () => stableSidechainHeight),
            getTransactionReceipt: vi.fn(async () => burnReceipt),
            getBlock: vi.fn(async () => ({
              hash: `0x${pegOut.sidechainBlockHash}`,
            })),
          },
          bridgeAddress,
          sidechainIdHex,
          requiredConfirmations: 10,
          candidate,
          pegOut,
        });
      const events: string[] = [];

      const result =
        await runAuthenticatedSettlementCheckReservationCompatibility(
          {
            sourceProfileSelection:
              SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_SELECTION,
            candidate,
            pegOut,
            expectedPackageDigestHex: unsignedPackage.packageDigestHex,
          },
          {
            state,
            revalidate: async () => {
              events.push('revalidate');
              return revalidated;
            },
            bindPackage: async exactRevalidation => {
              events.push('bind-package');
              expect(exactRevalidation).toBe(revalidated);
              return packageBinding;
            },
            sign: async (exactPackageBinding, exactRevalidation) => {
              events.push('sign');
              expect(exactPackageBinding).toBe(packageBinding);
              expect(exactRevalidation).toBe(revalidated);
              return signed;
            },
            check: async (
              exactPackageBinding,
              exactRevalidation,
              exactSigned,
            ) => {
              events.push('check');
              expect(exactPackageBinding).toBe(packageBinding);
              expect(exactRevalidation).toBe(revalidated);
              expect(exactSigned).toBe(signed);
              return acceptance;
            },
            observeStableErgo: async (
              exactRevalidation,
              exactAcceptance,
            ) => {
              events.push('observe-ergo');
              expect(exactRevalidation).toBe(revalidated);
              expect(exactAcceptance).toBe(acceptance);
              return stableErgoView;
            },
            observeStableSidechain: async (
              exactRevalidation,
              exactAcceptance,
            ) => {
              events.push('observe-sidechain');
              expect(exactRevalidation).toBe(revalidated);
              expect(exactAcceptance).toBe(acceptance);
              return stableSidechainView;
            },
          },
        );

      expect(events).toEqual([
        'revalidate',
        'bind-package',
        'sign',
        'check',
        'observe-ergo',
        'observe-sidechain',
      ]);
      expect(result.acceptance).toBe(acceptance);
      expect(result.handoff.signedArtifact).toBe(signed);
      expect(JSON.stringify(
        result.handoff,
        (_key, value) => typeof value === 'bigint' ? value.toString() : value,
      )).not.toContain('"signedTx":');
      expect(() => {
        (result.handoff.signedArtifact as any).signedTx = {
          id: revalidated.expectedTxId,
          proofs: ['post-reservation-bearer-mutation'],
        };
      }).toThrow();
      expect(result.handoff.boundary).toEqual({
        laterExecutionRequired: true,
        submissionCapabilityPresent: false,
        fundsAuthorityGranted: false,
      });
      expect(result.reservation).toEqual(expect.objectContaining({
        candidateId: candidate.candidateId,
        expectedTxId: revalidated.expectedTxId,
        reservationDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
        status: 'active',
      }));
      expect(state.getAuthenticatedSettlementCandidate(candidate.candidateId))
        .toEqual(expect.objectContaining({
          status: 'check_passed',
          checkExpectedTxId: revalidated.expectedTxId,
          checkSignedTransactionDigest: acceptance.signedTransactionDigestHex,
        }));
    } finally {
      state.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('carries real candidate and JVM-check provenance through the StateTracker boundary', async () => {
    const nativeAdmission = bind();
    const prepared = await prepareCanonicalSettlement();
    const unsignedPackage = await buildNativeUnsignedSettlementPackage(prepared);
    const tempDir = mkdtempSync(join(tmpdir(), 'e2s-execution-reservation-'));
    const statePath = join(tempDir, 'state.sqlite');
    let state = new StateTracker(statePath);
    try {
      state.insertPegOut(
        pegOut.sidechainTxHash,
        pegOut.ergoRecipientAddress,
        pegOut.amount,
        pegOut.sidechainBlockNumber,
        {
          user: pegOut.user,
          sidechainId: sidechainIdHex,
          sidechainBlockHash: executionBlockHashHex,
          sidechainLogIndex: eventIndex,
        },
      );
      const candidate = recordNativeVerifiedAuthenticatedSettlementCandidate({
        state,
        nativeAdmission,
        prepared,
        pegOut,
        trackerIdentity,
        observedSidechainTip: 50,
        observedErgoTip: 120,
      });
      const revalidated = await revalidateAuthenticatedSettlementCandidate({
        candidate,
        nativeAdmission,
        prepared,
        pegOut,
        trackerIdentity,
      });
      const packageBinding = await bindAuthenticatedV2UnsignedSettlementPackage({
        packageValue: unsignedPackage,
        expectedPackageDigestHex: unsignedPackage.packageDigestHex,
        expectedTxId: revalidated.expectedTxId,
        prepared,
      });
      const acceptance = await opaqueSplitAcceptanceForTesting({
        packageBinding,
        revalidated,
      });

      const stableErgoHeight = Math.max(
        candidate.creationHeight,
        candidate.anchorHeaderHeight + 10,
      );
      const liveBoxes = new Map<string, BoxLike>([
        [candidate.trackerBoxId, prepared.trackerBox],
        [candidate.dupInputBoxId, prepared.authenticatedDupBox],
        [candidate.vaultBoxId, prepared.unlockBox],
      ]);
      const stableErgoView = await observeAuthenticatedSettlementStableErgoView({
        ergo: {
          getCurrentHeight: vi.fn(async () => stableErgoHeight),
          getBlockHeaderHash: vi.fn(async (height: number) =>
            height === candidate.anchorHeaderHeight ? candidate.anchorHeaderId : hex('f')),
          getBoxByIdOrNull: vi.fn(async (boxId: string) => liveBoxes.get(boxId) ?? null),
        } as any,
        candidate,
        prepared,
        minimumConfirmations: 10,
      });
      const checkBridgeAddress = `0x${'b'.repeat(40)}`;
      const burnInterface = new ethers.Interface([
        'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
      ]);
      const encodedBurn = burnInterface.encodeEventLog(
        burnInterface.getEvent('PegOut')!,
        [pegOut.user, pegOut.amount, `0x${pegOut.ergoRecipientAddress}`],
      );
      const burnBlockNumber = Number(pegOut.sidechainBlockNumber);
      const burnReceipt = {
        status: 1,
        hash: `0x${pegOut.sidechainTxHash}`,
        blockNumber: burnBlockNumber,
        blockHash: `0x${pegOut.sidechainBlockHash}`,
        logs: [{
          address: checkBridgeAddress,
          topics: [...encodedBurn.topics],
          data: encodedBurn.data,
          transactionHash: `0x${pegOut.sidechainTxHash}`,
          blockNumber: burnBlockNumber,
          blockHash: `0x${pegOut.sidechainBlockHash}`,
          logIndex: pegOut.sidechainLogIndex,
        }],
      };
      const stableSidechainHeight = burnBlockNumber + 9;
      const stableSidechainView = await observeAuthenticatedSettlementStableSidechainView({
        source: {
          getBlockNumber: vi.fn(async () => stableSidechainHeight),
          getTransactionReceipt: vi.fn(async () => burnReceipt),
          getBlock: vi.fn(async () => ({ hash: `0x${pegOut.sidechainBlockHash}` })),
        },
        bridgeAddress: checkBridgeAddress,
        sidechainIdHex,
        requiredConfirmations: 10,
        candidate,
        pegOut,
      });
      const legacyCombinedAcceptance =
        await checkPackageBoundRevalidatedAuthenticatedSettlementCandidateForTesting(
          packageBinding,
          revalidated,
          'Legacy combined authenticated V2 JVM check',
          async (_tx, _label, expectedTxId) => ({
            txId: expectedTxId,
            signedTx: { id: expectedTxId },
            signedTransactionDigestHex: expectedTxId,
            checkResult: `0x${expectedTxId}`,
            ...signedCheckIdentity(),
          }),
        );
      expect(() => authorizeAuthenticatedSettlementCheckAdmission({
        acceptance: legacyCombinedAcceptance,
        revalidated,
        stableErgoView,
        stableSidechainView,
      })).toThrow(/opaque split check path/i);
      const checkAdmission = authorizeAuthenticatedSettlementCheckAdmission({
        acceptance,
        revalidated,
        stableErgoView,
        stableSidechainView,
      });
      expect(state.markAuthenticatedSettlementCandidateCheckPassed(checkAdmission)).toBe(true);
      expect(state.getAuthenticatedSettlementCandidate(candidate.candidateId)).toEqual(
        expect.objectContaining({
          status: 'check_passed',
          checkExpectedTxId: revalidated.expectedTxId,
          checkUnsignedPackageDigest: unsignedPackage.packageDigestHex,
          checkSignedTransactionDigest: acceptance.signedTransactionDigestHex,
          checkSignerContextDigest: acceptance.signerContextDigestHex,
          checkCheckerIdentityDigest: acceptance.checkerIdentityDigestHex,
          checkRevalidationDigest: revalidated.revalidationDigestHex,
          checkNativeVerificationRequestDigest:
            revalidated.nativeVerificationRequestDigestHex,
          checkTrustAnchorDigest: revalidated.trustAnchorDigestHex,
          checkFinalityHorizonHash: revalidated.finalityHorizonHashHex,
          checkFinalityHorizonHeight: revalidated.finalityHorizonHeight,
          checkFinalityStatementDigest: revalidated.finalityStatementDigestHex,
          checkFinalityProgramId: revalidated.finalityProgramIdHex,
          checkFinalityProofSystemId: revalidated.finalityProofSystemId,
          checkFinalityVerifierProfileId: revalidated.finalityVerifierProfileIdHex,
          checkFinalityProofPayloadDigest: revalidated.finalityProofPayloadDigestHex,
          checkFinalityProofDigest: revalidated.finalityProofDigestHex,
          checkStableErgoViewDigest: stableErgoView.viewDigestHex,
          checkStableSidechainViewDigest: stableSidechainView.viewDigestHex,
          checkAdmissionDigest: checkAdmission.admissionDigestHex,
        }),
      );
      expect(() => assertAuthenticatedSettlementStableErgoViewProvenance(stableErgoView))
        .not.toThrow();
      const authorization = authorizeAuthenticatedSettlementExecution({
        state,
        candidateId: candidate.candidateId,
        revalidated,
        packageBinding,
        acceptance,
        checkAdmission,
        stableErgoView,
        stableSidechainView,
      });
      expect(authorization).toEqual(expect.objectContaining({
        candidateId: candidate.candidateId,
        candidateAuthorityDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
        burnId: candidate.burnId,
        burnTxHash: candidate.burnTxHash,
        amountNanoErg: pegOut.amount,
        recipientErgoTreeHex,
        duplicatePreventionBoxId: candidate.dupInputBoxId,
        vaultBoxId: candidate.vaultBoxId,
        expectedTxId: revalidated.expectedTxId,
        unsignedTxDigestHex: candidate.unsignedTxDigest,
        unsignedPackageDigestHex: unsignedPackage.packageDigestHex,
        signedTransactionDigestHex: acceptance.signedTransactionDigestHex,
        signerContextDigestHex: acceptance.signerContextDigestHex,
        checkerIdentityDigestHex: acceptance.checkerIdentityDigestHex,
        revalidationDigestHex: revalidated.revalidationDigestHex,
        stableErgoViewDigestHex: stableErgoView.viewDigestHex,
        stableSidechainViewDigestHex: stableSidechainView.viewDigestHex,
        finalityProofDigestHex: revalidated.finalityProofDigestHex,
      }));
      expect(() => assertAuthenticatedSettlementExecutionAuthorizationProvenance(
        authorization,
      )).not.toThrow();
      expect(() => assertAuthenticatedSettlementExecutionAuthorizationProvenance(
        structuredClone(authorization),
      )).toThrow(/execution authorization provenance/i);

      for (const identityDrift of [
        signedCheckIdentity({
          signerContext: {
            pubKeyHex: `02${'41'.repeat(32)}`,
            ergoTreeHex: `0008cd02${'41'.repeat(32)}`,
          },
        }),
        signedCheckIdentity({ checkerIdentity: { nodeOrigin: 'http://127.0.0.1:9053' } }),
      ]) {
        const driftedAcceptance = await opaqueSplitAcceptanceForTesting({
          packageBinding,
          revalidated,
          identity: identityDrift as ReturnType<typeof signedCheckIdentity>,
        });
        const driftedAdmission = authorizeAuthenticatedSettlementCheckAdmission({
          acceptance: driftedAcceptance,
          revalidated,
          stableErgoView,
          stableSidechainView,
        });
        expect(() => state.markAuthenticatedSettlementCandidateCheckPassed(
          driftedAdmission,
        )).toThrow(/check result conflicts with journal/i);
        expect(() => authorizeAuthenticatedSettlementExecution({
          state,
          candidateId: candidate.candidateId,
          revalidated,
          packageBinding,
          acceptance: driftedAcceptance,
          checkAdmission: driftedAdmission,
          stableErgoView,
          stableSidechainView,
        })).toThrow(/(?:signer context|checker identity) digest does not match/i);
      }
      const reservationAdmission = authorizeAuthenticatedSettlementExecutionReservation({
        state,
        authorization,
      });
      expect(() => assertAuthenticatedSettlementExecutionReservationAdmissionProvenance(
        reservationAdmission,
      )).not.toThrow();
      expect(() => assertAuthenticatedSettlementExecutionReservationAdmissionProvenance(
        structuredClone(reservationAdmission),
      )).toThrow(/execution reservation provenance/i);

      state.close();
      const semanticDriftPath = join(tempDir, 'semantic-drift.sqlite');
      const candidateDriftPath = join(tempDir, 'candidate-drift.sqlite');
      const repairDriftPath = join(tempDir, 'repair-drift.sqlite');
      copyFileSync(statePath, semanticDriftPath);
      copyFileSync(statePath, candidateDriftPath);
      copyFileSync(statePath, repairDriftPath);
      state = new StateTracker(statePath);
      const semanticDriftDb = new Database(semanticDriftPath);
      try {
        semanticDriftDb.prepare(`
          UPDATE peg_out_events
          SET amount_nanoerg = ?
          WHERE lower(burn_id) = ?
        `).run((pegOut.amount + 1n).toString(), candidate.burnId);
      } finally {
        semanticDriftDb.close();
      }
      const semanticDriftState = new StateTracker(semanticDriftPath);
      try {
        expect(() => semanticDriftState.reserveAuthenticatedSettlementExecution(
          reservationAdmission,
        )).toThrow(/does not match current persisted authority/i);
      } finally {
        semanticDriftState.close();
      }

      const candidateDriftDb = new Database(candidateDriftPath);
      try {
        candidateDriftDb.prepare(`
          UPDATE authenticated_settlement_candidates
          SET check_trust_anchor_digest = ?
          WHERE candidate_id = ?
        `).run(hex('9'), candidate.candidateId);
      } finally {
        candidateDriftDb.close();
      }
      const candidateDriftState = new StateTracker(candidateDriftPath);
      try {
        expect(() => candidateDriftState.reserveAuthenticatedSettlementExecution(
          reservationAdmission,
        )).toThrow(/does not match current persisted authority/i);
      } finally {
        candidateDriftState.close();
      }

      const repairDriftState = new StateTracker(repairDriftPath);
      try {
        expect(repairDriftState.repairDetectedPegOut(
          { burnId: candidate.burnId },
          pegOut.ergoRecipientAddress,
          pegOut.amount + 1n,
          Number(pegOut.sidechainBlockNumber),
        )).toBe(true);
        expect(repairDriftState.getAuthenticatedSettlementCandidate(candidate.candidateId))
          .toEqual(expect.objectContaining({
            status: 'invalidated',
            invalidationReason:
              'peg-out semantics were repaired after candidate preparation',
          }));
        expect(() => repairDriftState.reserveAuthenticatedSettlementExecution(
          reservationAdmission,
        )).toThrow(/not currently reservable/i);
      } finally {
        repairDriftState.close();
      }

      state.recordAggregateSettlementAttempt(
        'single',
        [candidate.burnTxHash],
        revalidated.expectedTxId,
      );
      expect(() => state.reserveAuthenticatedSettlementExecution(
        reservationAdmission,
      )).toThrow(/legacy aggregate journal.*conflicts with authenticated execution reservation/i);
      expect(state.markAggregateSettlementAttemptAbandoned(revalidated.expectedTxId))
        .toBe(true);

      const faultDb = new Database(statePath);
      try {
        faultDb.exec(`
          CREATE TRIGGER force_execution_reservation_insert_failure
          BEFORE INSERT ON authenticated_settlement_execution_reservations
          BEGIN
            SELECT RAISE(ABORT, 'forced execution reservation failure');
          END;
        `);
      } finally {
        faultDb.close();
      }
      expect(() => state.reserveAuthenticatedSettlementExecution(
        reservationAdmission,
      )).toThrow(/forced execution reservation failure/i);
      expect(state.getAuthenticatedSettlementExecutionReservation({
        reservationDigestHex: reservationAdmission.reservationDigestHex,
      })).toBeNull();
      const repairedDb = new Database(statePath);
      try {
        repairedDb.exec('DROP TRIGGER force_execution_reservation_insert_failure');
      } finally {
        repairedDb.close();
      }

      const reservation = state.reserveAuthenticatedSettlementExecution(
        reservationAdmission,
      );
      expect(reservation).toEqual(expect.objectContaining({
        schema: 'e2s.authenticated-settlement-execution-reservation.v2',
        reservationDigestHex: reservationAdmission.reservationDigestHex,
        authorizationDigestHex: authorization.authorizationDigestHex,
        candidateId: candidate.candidateId,
        candidateAuthorityDigestHex: authorization.candidateAuthorityDigestHex,
        burnId: candidate.burnId,
        burnTxHash: candidate.burnTxHash,
        amountNanoErg: pegOut.amount,
        recipientErgoTreeHex: authorization.recipientErgoTreeHex,
        duplicatePreventionBoxId: candidate.dupInputBoxId,
        vaultBoxId: candidate.vaultBoxId,
        expectedTxId: revalidated.expectedTxId,
        signerContextDigestHex: acceptance.signerContextDigestHex,
        checkerIdentityDigestHex: acceptance.checkerIdentityDigestHex,
        status: 'active',
        revocationReason: null,
      }));
      expect(state.reserveAuthenticatedSettlementExecution(reservationAdmission)).toEqual(
        reservation,
      );
      expect(() => state.recordAggregateSettlementAttempt(
        'single',
        [candidate.burnTxHash],
        revalidated.expectedTxId,
      )).toThrow(/execution reservation.*conflicts with legacy aggregate journal/i);

      const candidateDriftProbe = new Database(statePath);
      candidateDriftProbe.exec('BEGIN IMMEDIATE');
      try {
        candidateDriftProbe.prepare(`
          UPDATE authenticated_settlement_candidates
          SET status = 'invalidated',
              invalidation_reason = 'transactional candidate-drift probe'
          WHERE candidate_id = ?
        `).run(candidate.candidateId);
        expect(candidateDriftProbe.prepare(`
          SELECT status, revocation_reason
          FROM authenticated_settlement_execution_reservations
          WHERE reservation_digest = ?
        `).get(reservation.reservationDigestHex)).toEqual({
          status: 'revoked',
          revocation_reason: 'candidate lifecycle or binding changed',
        });
      } finally {
        candidateDriftProbe.exec('ROLLBACK');
        candidateDriftProbe.close();
      }
      expect(state.getAuthenticatedSettlementExecutionReservation({
        reservationDigestHex: reservation.reservationDigestHex,
      })).toEqual(reservation);

      const pegOutIdentityDriftProbe = new Database(statePath);
      pegOutIdentityDriftProbe.exec('BEGIN IMMEDIATE');
      try {
        pegOutIdentityDriftProbe.prepare(`
          UPDATE peg_out_events
          SET burn_id = ?, sidechain_burn_tx_hash = ?
          WHERE lower(burn_id) = ?
        `).run(hex('6'), `0x${hex('7')}`, candidate.burnId);
        expect(pegOutIdentityDriftProbe.prepare(`
          SELECT status, revocation_reason
          FROM authenticated_settlement_execution_reservations
          WHERE reservation_digest = ?
        `).get(reservation.reservationDigestHex)).toEqual({
          status: 'revoked',
          revocation_reason: 'peg-out lifecycle or binding changed',
        });
      } finally {
        pegOutIdentityDriftProbe.exec('ROLLBACK');
        pegOutIdentityDriftProbe.close();
      }
      expect(state.getAuthenticatedSettlementExecutionReservation({
        reservationDigestHex: reservation.reservationDigestHex,
      })).toEqual(reservation);

      state.close();
      state = new StateTracker(statePath);
      const restoredReservation = state.getAuthenticatedSettlementExecutionReservation({
        reservationDigestHex: reservation.reservationDigestHex,
      });
      expect(restoredReservation).toEqual(reservation);
      expect(() => assertAuthenticatedSettlementExecutionReservationAdmissionProvenance(
        restoredReservation,
      )).toThrow(/execution reservation provenance/i);
      expect(state.reserveAuthenticatedSettlementExecution(reservationAdmission)).toEqual(
        reservation,
      );
      state.updatePegOutStatus({ burnId: candidate.burnId }, 'confirmed');
      expect(state.getAuthenticatedSettlementExecutionReservation({
        reservationDigestHex: reservation.reservationDigestHex,
      })).toEqual(reservation);
      for (const driftedPegOut of [
        { ...pegOut, amount: pegOut.amount + 1n },
        { ...pegOut, ergoRecipientAddress: `0008cd02${'9'.repeat(64)}` },
      ]) {
        const driftedEncodedBurn = burnInterface.encodeEventLog(
          burnInterface.getEvent('PegOut')!,
          [
            driftedPegOut.user,
            driftedPegOut.amount,
            `0x${driftedPegOut.ergoRecipientAddress}`,
          ],
        );
        const driftedStableSidechainView = await observeAuthenticatedSettlementStableSidechainView({
          source: {
            getBlockNumber: vi.fn(async () => stableSidechainHeight),
            getTransactionReceipt: vi.fn(async () => ({
              ...burnReceipt,
              logs: [{
                ...burnReceipt.logs[0],
                topics: [...driftedEncodedBurn.topics],
                data: driftedEncodedBurn.data,
              }],
            })),
            getBlock: vi.fn(async () => ({ hash: `0x${pegOut.sidechainBlockHash}` })),
          },
          bridgeAddress: checkBridgeAddress,
          sidechainIdHex,
          requiredConfirmations: 10,
          candidate,
          pegOut: driftedPegOut,
        });
        expect(() => authorizeAuthenticatedSettlementExecution({
          state,
          candidateId: candidate.candidateId,
          revalidated,
          packageBinding,
          acceptance,
          checkAdmission,
          stableErgoView,
          stableSidechainView: driftedStableSidechainView,
        })).toThrow(/burn semantics do not match/i);
      }
      expect(() => authorizeAuthenticatedSettlementExecution({
        state,
        candidateId: candidate.candidateId,
        revalidated,
        packageBinding,
        acceptance: structuredClone(acceptance),
        checkAdmission,
        stableErgoView,
        stableSidechainView,
      })).toThrow(/JVM check acceptance provenance/i);
      expect(() => state.markAuthenticatedSettlementCandidateCheckPassed(
        structuredClone(checkAdmission),
      )).toThrow(/check admission provenance/i);

      const conflictingAcceptance = await opaqueSplitAcceptanceForTesting({
        packageBinding,
        revalidated,
        checkResult: `different:${revalidated.expectedTxId}`,
      });
      const conflictingAdmission = authorizeAuthenticatedSettlementCheckAdmission({
        acceptance: conflictingAcceptance,
        revalidated,
        stableErgoView,
        stableSidechainView,
      });
      expect(() => authorizeAuthenticatedSettlementExecution({
        state,
        candidateId: candidate.candidateId,
        revalidated,
        packageBinding,
        acceptance: conflictingAcceptance,
        checkAdmission: conflictingAdmission,
        stableErgoView,
        stableSidechainView,
      })).toThrow(/JVM check response digest does not match/i);
      expect(() => state.markAuthenticatedSettlementCandidateCheckPassed(
        conflictingAdmission,
      )).toThrow(/check result conflicts with journal/i);

      const driftedUnsignedPackage = await buildNativeUnsignedSettlementPackage(
        prepared,
        hex('7'),
      );
      const driftedPackageBinding = await bindAuthenticatedV2UnsignedSettlementPackage({
        packageValue: driftedUnsignedPackage,
        expectedPackageDigestHex: driftedUnsignedPackage.packageDigestHex,
        expectedTxId: revalidated.expectedTxId,
        prepared,
      });
      const driftedAcceptance = await opaqueSplitAcceptanceForTesting({
        packageBinding: driftedPackageBinding,
        revalidated,
      });
      const driftedCheckAdmission = authorizeAuthenticatedSettlementCheckAdmission({
        acceptance: driftedAcceptance,
        revalidated,
        stableErgoView,
        stableSidechainView,
      });
      expect(() => authorizeAuthenticatedSettlementExecution({
        state,
        candidateId: candidate.candidateId,
        revalidated,
        packageBinding: driftedPackageBinding,
        acceptance: driftedAcceptance,
        checkAdmission: driftedCheckAdmission,
        stableErgoView,
        stableSidechainView,
      })).toThrow(/unsigned package digest does not match/i);

      state.markPegOutBurnRevertedAndInvalidateCandidates(
        { burnId: candidate.burnId },
        'canonical sidechain burn was reverted',
      );
      expect(state.getAuthenticatedSettlementExecutionReservation({
        reservationDigestHex: reservation.reservationDigestHex,
      })).toEqual(expect.objectContaining({
        status: 'revoked',
        revocationReason: 'peg-out lifecycle or binding changed',
      }));
      expect(() => authorizeAuthenticatedSettlementExecution({
        state,
        candidateId: candidate.candidateId,
        revalidated,
        packageBinding,
        acceptance,
        checkAdmission,
        stableErgoView,
        stableSidechainView,
      })).toThrow(/not currently check-passed/i);
    } finally {
      state.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function installedAuthorityLauncherPath(version = 'v1'): string {
  return `${String.fromCharCode(67)}:\\Program Files\\E2SBridge\\NativeExecution\\${version}\\bridge-contained-launcher.exe`;
}

const profile: NativeCheckpointSettlementProfile = {
  schema: NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SCHEMA,
  rpcUrl: 'http://127.0.0.1:1',
  authority: {
    profileId: 'institutional-win32-x64-v1',
    attestationId: 'build-2026-07-12-review-01',
    policyId: 'native-verifier-execution-2026-07-12-01',
    executionPolicySha256: hex('e'),
    minimumPolicyEpoch: 1,
    launcherPath: installedAuthorityLauncherPath(),
  },
  trustAnchor: {
    ...request.trustAnchor,
    trustedAnchorDigestHex: trustAnchorDigest(),
  },
  codec: {
    executablePath: '/nonexistent/e2s-native-checkpoint-codec',
    executableSha256Hex: prefixedHash('c'),
    executableInvocationSha256Hex: {
      encodeHeaders: prefixedHash('1'),
      inspectWarpProof: prefixedHash('2'),
      inspectFinalityProof: prefixedHash('3'),
    },
  },
  verifier: {
    executablePath: '/nonexistent/e2s-native-checkpoint-verifier',
    executableSha256Hex: prefixedHash('d'),
    executableInvocationSha256Hex: prefixedHash('4'),
  },
};

function authorityForProfile(): NativeVerifierExecutionAuthority {
  return {
    declaration: {
      profileId: profile.authority.profileId,
      attestationId: profile.authority.attestationId,
      policyId: profile.authority.policyId,
      executionPolicySha256: profile.authority.executionPolicySha256,
      policyEpoch: profile.authority.minimumPolicyEpoch,
      launcherPath: profile.authority.launcherPath,
      verifierExecutablePath: profile.verifier.executablePath,
      codecExecutablePath: profile.codec.executablePath,
      verifierExecutableSha256Hex: profile.verifier.executableSha256Hex,
      codecExecutableSha256Hex: profile.codec.executableSha256Hex,
      codecExecutableInvocationSha256Hex: {
        ...profile.codec.executableInvocationSha256Hex,
      },
    },
    execute: vi.fn(),
  };
}

function configureNativeSourceMocks(
  checkpointResult: unknown = { checkpoint },
  blockHash: string = nativeBlockHashHex,
): void {
  const result = (
    typeof checkpointResult === 'object'
    && checkpointResult !== null
    && 'checkpoint' in checkpointResult
    && !('collection' in checkpointResult)
  )
    ? { ...checkpointResult, collection: { request } }
    : checkpointResult;
  nativeSourceMocks.requestBlockHashAt.mockReset().mockResolvedValue(blockHash);
  nativeSourceMocks.collectAndVerify.mockReset().mockResolvedValue(result);
  nativeSourceMocks.createCodec.mockReset().mockReturnValue({});
  nativeSourceMocks.createAuthorityCodec.mockReset().mockReturnValue({
    executionBoundary: {
      mode: 'source-refreshed-authority-contained-acquisition-only',
    },
  });
  nativeSourceMocks.createAuthorityVerifier.mockReset().mockReturnValue({
    executableSha256Hex: profile.verifier.executableSha256Hex,
    deriveExecutableInvocationSha256Hex: vi.fn().mockReturnValue(
      profile.verifier.executableInvocationSha256Hex,
    ),
    verify: vi.fn(),
  });
  nativeSourceMocks.assertAuthorityCheckpoint.mockReset();
}

describe('native checkpoint settlement source', () => {
  it('loads no verifier when the explicit public profile is absent', () => {
    expect(loadNativeCheckpointSettlementSourceFromEnvironment({})).toBeNull();
  });

  it('keeps authenticated V2 replay import disabled without a purpose-reviewed profile', () => {
    expect(
      REVIEWED_AUTHENTICATED_V2_REPLAY_IMPORT_PROFILE_SHA256_HEXES,
    ).toEqual([]);
  });

  it('requires the whole normalized profile digest to be committed in the reviewed registry', () => {
    const digest = deriveNativeCheckpointSettlementProfileSha256Hex(profile);
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(deriveNativeCheckpointSettlementProfileSha256Hex(
      structuredClone(profile),
    )).toBe(digest);
    expect(REVIEWED_NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SHA256_HEXES)
      .toContain(digest);
    expect(() => loadNativeCheckpointSettlementSourceFromEnvironment({
      NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_JSON: JSON.stringify(profile),
    })).toThrow(/without a source-refreshed execution authority/i);
    expect(loadNativeCheckpointSettlementSourceFromEnvironment({
      NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_JSON: JSON.stringify(profile),
    }, authorityForProfile())).not.toBeNull();
    expect(() => createNativeCheckpointSettlementSource(profile))
      .toThrow(/direct process profiles are disabled/i);
    expect(() => createNativeCheckpointSettlementSource({
      ...profile,
      rpcUrl: 'http://127.0.0.1:2',
    })).toThrow(/reviewed profile registry/i);
  });

  it('parses one exact profile and rejects unknown fields', () => {
    expect(parseNativeCheckpointSettlementProfile(profile)).toEqual(profile);
    expect(() => parseNativeCheckpointSettlementProfile({
      ...profile,
      schema: 'e2s.native-checkpoint-settlement-profile.v1',
    })).toThrow(/schema is unsupported/i);
    expect(() => parseNativeCheckpointSettlementProfile({
      ...profile,
      unreviewedOverride: true,
    })).toThrow(/unexpected field/i);
    expect(() => parseNativeCheckpointSettlementProfile({
      ...profile,
      rpcUrl: 'https://operator:password@example.test',
    })).toThrow(/uncredentialed HTTP/i);
    expect(() => parseNativeCheckpointSettlementProfile({
      ...profile,
      rpcUrl: 'https://example.test/rpc?api_key=value',
    })).toThrow(/uncredentialed HTTP/i);
    expect(() => parseNativeCheckpointSettlementProfile({
      ...profile,
      authority: {
        ...profile.authority,
        minimumPolicyEpoch: 0,
      },
    })).toThrow(/positive safe integer/i);
    expect(() => parseNativeCheckpointSettlementProfile({
      ...profile,
      authority: {
        ...profile.authority,
        launcherPath: 'C:\\tmp\\bridge-contained-launcher.exe',
      },
    })).toThrow(/fixed Program Files installation/i);
    expect(() => loadNativeCheckpointSettlementSourceFromEnvironment({
      NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_JSON: '{not-json}',
    })).toThrow(/not valid JSON/i);
  });

  it('rejects an authority whose verifier or codec declaration drifts from the reviewed profile', () => {
    const wrongVerifier = authorityForProfile();
    wrongVerifier.declaration.verifierExecutableSha256Hex = prefixedHash('f');
    expect(() => createAuthorityBoundNativeCheckpointSettlementSource(
      profile,
      wrongVerifier,
    )).toThrow(/authority verifier does not match/i);

    const wrongCodec = authorityForProfile();
    wrongCodec.declaration.codecExecutableInvocationSha256Hex.encodeHeaders =
      prefixedHash('f');
    expect(() => createAuthorityBoundNativeCheckpointSettlementSource(
      profile,
      wrongCodec,
    )).toThrow(/authority codec does not match/i);
  });

  it.each([
    ['profile ID', (authority: NativeVerifierExecutionAuthority) => {
      authority.declaration.profileId = 'other-win32-x64-v1';
    }, /identity or policy/i],
    ['attestation ID', (authority: NativeVerifierExecutionAuthority) => {
      authority.declaration.attestationId = 'build-2026-07-12-review-02';
    }, /identity or policy/i],
    ['policy ID', (authority: NativeVerifierExecutionAuthority) => {
      authority.declaration.policyId = 'native-verifier-execution-2026-07-12-02';
    }, /identity or policy/i],
    ['policy digest', (authority: NativeVerifierExecutionAuthority) => {
      authority.declaration.executionPolicySha256 = hex('f');
    }, /identity or policy/i],
    ['policy epoch', (authority: NativeVerifierExecutionAuthority) => {
      authority.declaration.policyEpoch = 0;
    }, /below the reviewed profile minimum/i],
    ['launcher path', (authority: NativeVerifierExecutionAuthority) => {
      authority.declaration.launcherPath = installedAuthorityLauncherPath('v2');
    }, /identity or policy/i],
  ])('rejects authority %s drift from the reviewed settlement profile', (
    _field,
    mutate,
    expected,
  ) => {
    const authority = authorityForProfile();
    mutate(authority);
    expect(() => createAuthorityBoundNativeCheckpointSettlementSource(
      profile,
      authority,
    )).toThrow(expected);
  });

  it('resolves the native block at the exact peg-out height before verification', async () => {
    configureNativeSourceMocks();
    const authority = authorityForProfile();
    const source = createAuthorityBoundNativeCheckpointSettlementSource(profile, authority);

    const collected = await source.collectForSettlement({
      sidechainIdHex,
      sidechainHeight,
    });
    expect(collected.checkpoint).toBe(checkpoint);
    expect(collected.aggregateFinalityProof).toMatchObject({
      statementDigestHex: checkpoint.finalityStatement.statementDigestHex,
      verifierProfileIdHex: executableSha256Hex.slice(2),
    });
    expect(nativeSourceMocks.requestBlockHashAt)
      .toHaveBeenCalledWith(expect.anything(), sidechainHeight);
    expect(nativeSourceMocks.collectAndVerify).toHaveBeenCalledWith(expect.objectContaining({
      targetNativeBlockHashHex: nativeBlockHashHex,
      trustedAnchorDigestHex: trustAnchorDigest(),
      trustAnchor: request.trustAnchor,
      verifier: expect.anything(),
    }));
    expect(nativeSourceMocks.assertAuthorityCheckpoint)
      .toHaveBeenCalledWith(checkpoint, authority);
    expect(getReviewedNativeCheckpointSettlementProfileSha256Hex(
      collected.checkpoint,
    )).toBe(deriveNativeCheckpointSettlementProfileSha256Hex(profile));
  });

  it('refuses a source request for another sidechain before any RPC call', async () => {
    configureNativeSourceMocks();
    const source = createAuthorityBoundNativeCheckpointSettlementSource(
      profile,
      authorityForProfile(),
    );

    await expect(source.collectForSettlement({
      sidechainIdHex: hex('f'),
      sidechainHeight,
    })).rejects.toThrow(/trust anchor sidechain ID/i);
    expect(nativeSourceMocks.requestBlockHashAt).not.toHaveBeenCalled();
    expect(nativeSourceMocks.collectAndVerify).not.toHaveBeenCalled();
  });

  it('refuses a structurally forged checkpoint returned by a collector dependency', async () => {
    configureNativeSourceMocks({ checkpoint: structuredClone(checkpoint) });
    const source = createAuthorityBoundNativeCheckpointSettlementSource(
      profile,
      authorityForProfile(),
    );

    await expect(source.collectForSettlement({ sidechainIdHex, sidechainHeight }))
      .rejects.toThrow(/checkpoint provenance/i);
  });

  it('refuses a valid checkpoint verified for a different requested height or native hash', async () => {
    configureNativeSourceMocks();
    const wrongHeight = createAuthorityBoundNativeCheckpointSettlementSource(
      profile,
      authorityForProfile(),
    );
    await expect(wrongHeight.collectForSettlement({
      sidechainIdHex,
      sidechainHeight: sidechainHeight + 1,
    })).rejects.toThrow(/requested sidechain height/i);

    configureNativeSourceMocks({ checkpoint }, prefixedHash('f'));
    const wrongHash = createAuthorityBoundNativeCheckpointSettlementSource(
      profile,
      authorityForProfile(),
    );
    await expect(wrongHash.collectForSettlement({
      sidechainIdHex,
      sidechainHeight,
    })).rejects.toThrow(/resolved native target block hash/i);
  });

  it('never mints reviewed provenance from the dependency-injected test source', async () => {
    const unreviewedCheckpoint = await verifiedCheckpoint();
    const source = createUnreviewedNativeCheckpointSettlementSourceForTesting(
      profile,
      {
        rpc: {} as never,
        codec: {} as never,
        requestBlockHashAt: vi.fn().mockResolvedValue(nativeBlockHashHex),
        collectAndVerify: vi.fn().mockResolvedValue({
          checkpoint: unreviewedCheckpoint,
          collection: { request },
        }),
      },
    );
    const collected = await source.collectForSettlement({
      sidechainIdHex,
      sidechainHeight,
    });
    expect(() => bind({
      checkpoint: collected.checkpoint,
      aggregateFinalityProof: collected.aggregateFinalityProof,
    }))
      .toThrow(/reviewed native checkpoint settlement profile provenance/i);
  });
});
