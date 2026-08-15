import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isDeepStrictEqual } from 'util';

import {
  BRIDGE_EXTENSION_KEY_HEX,
  type BridgeCheckpointCommitmentV1,
} from '../bridge-checkpoint-commitment.js';
import {
  buildAggregateFinalityCommitmentV1,
  type AggregateFinalityCommitmentV1,
} from '../bridge-finality-commitment.js';
import {
  AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
  type AggregateFinalityProofV1,
} from '../bridge-finality-proof.js';
import {
  collectAndVerifyNativeFinalizedCheckpoint,
  validateNativeCheckpointFinalityBounds,
} from '../native-checkpoint-proof-collector.js';
import { createNativeSubstrateRpcProofCodec } from '../native-substrate-rpc-proof-codec.js';
import { deriveExecutableInvocationSha256Hex } from '../native-executable-pin.js';
import {
  extractFrontierBridgeEventRoot,
  type CanonicalFrontierPegOutBurn,
  type FrontierBridgeEventRootInput,
} from '../frontier-bridge-event-root.js';
import {
  collectFrontierBurnProofForPegOut,
  type CollectFrontierBurnProofForPegOutResult,
  type FrontierBurnProofProvider,
} from '../frontier-burn-proof-source.js';
import {
  buildErgoExtensionMembershipProof,
  type ErgoExtensionMerkleField,
} from '../ergo-extension-membership.js';
import {
  joinPinnedLocalNativeCheckpointToFrontierBurns,
  type NativeFrontierCheckpointJoin,
} from '../native-frontier-checkpoint-join.js';
import {
  assertNativeCheckpointAggregateFinalityProofProvenance,
  buildNativeCheckpointAggregateFinalityProofV1,
  type NativeFinalizedBridgeCheckpointRequest,
  type NativeFinalizedBridgeCheckpointVerificationPayload,
} from '../native-finalized-bridge-checkpoint.js';
import {
  assertPinnedLocalSourceNativeCheckpointProvenance,
  bindNativeCheckpointToPinnedLocalBuild,
  disposePinnedLocalNativeVerifierBuild,
  getPinnedLocalNativeVerifierExecution,
  preparePinnedLocalNativeVerifierBuild,
  type PinnedLocalSourceNativeVerifiedBridgeCheckpoint,
} from '../pinned-local-native-verifier-build.js';
import type { ParsedPegOut } from '../sidechain-client.js';
import {
  ReadOnlySubstrateFinalityRpc,
  type SubstrateRpcTransport,
} from '../substrate-finality-provider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTIER_VECTOR_PATH = resolve(
  __dirname,
  '../../test-vectors/frontier-bridge-event-root-v1.json',
);
const NATIVE_VECTOR_PATH = resolve(
  __dirname,
  '../../test-vectors/native-finalized-bridge-checkpoint-v2.json',
);

export interface Wp06FrontierVector {
  schema: 'e2s.frontier-bridge-event-root.vector.v1';
  claimBoundary: {
    finalityProven: false;
    onChainAcceptanceProven: false;
    gate5Closed: false;
  };
  input: FrontierBridgeEventRootInput;
  expected: {
    burnCount: number;
    eventIndexes: number[];
    burnIdHexes: string[];
    recipientErgoTreeHashHexes: string[];
    leafHashHexes: string[];
    bridgeEventRootHex: string;
  };
}

export interface Wp06NativeVector {
  schema: 'e2s.native-finalized-bridge-checkpoint.vector.v2';
  trustedAnchorDigestHex: string;
  request: NativeFinalizedBridgeCheckpointRequest;
  expected: NativeFinalizedBridgeCheckpointVerificationPayload;
  rpcFixture: {
    synthetic: true;
    responses: Array<{
      method: string;
      params: unknown[];
      result: unknown;
    }>;
  };
}

export interface Wp06PublicVectors {
  frontier: Wp06FrontierVector;
  native: Wp06NativeVector;
}

export interface Wp06ExtensionMembership {
  keyHex: typeof BRIDGE_EXTENSION_KEY_HEX;
  valueHex: string;
  fields: ReadonlyArray<{
    keyHex: string;
    valueHex: string;
  }>;
  proofHex: string;
  rootHex: string;
}

export interface Wp06SourceDerivedFixture {
  vectors: Wp06PublicVectors;
  nativeBuildIdentity?: Readonly<{
    verifierExecutableSha256Hex: string;
    codecExecutableSha256Hex: string;
  }>;
  checkpoint: PinnedLocalSourceNativeVerifiedBridgeCheckpoint;
  aggregateFinalityProof: AggregateFinalityProofV1;
  aggregateFinalityCommitment: AggregateFinalityCommitmentV1;
  frontierInput: FrontierBridgeEventRootInput;
  targetBurn: CanonicalFrontierPegOutBurn;
  pegOut: ParsedPegOut;
  proofBundle: CollectFrontierBurnProofForPegOutResult;
  join: NativeFrontierCheckpointJoin;
  extension: Wp06ExtensionMembership;
  boundary: {
    sourceDerivedPublicFixture: true;
    sourceDependencyFetchPrevented: false;
    chainRpcAccessEnabled: false;
    pinnedLocalSourceBuildVerified: true;
    nativeFinalityVerified: true;
    runtimeStateProofVerified: true;
    ergoExtensionAnchorVerified: false;
    onChainAcceptanceVerified: false;
    admissionEligible: false;
    committeeBypassPrevented: false;
    r9FinalityAuthority: true;
    gate5Closed: false;
    transactionMutationEnabled: false;
    submitOrBroadcastEnabled: false;
  };
}

export interface BuildWp06SourceDerivedFixtureInput {
  checkpoint: PinnedLocalSourceNativeVerifiedBridgeCheckpoint;
  aggregateFinalityProof: AggregateFinalityProofV1;
  nativeBuildIdentity?: Readonly<{
    verifierExecutableSha256Hex: string;
    codecExecutableSha256Hex: string;
  }>;
  vectors?: Wp06PublicVectors;
  frontierInput?: FrontierBridgeEventRootInput;
  canonicalBlockHashesHex?: readonly string[];
  targetBurnIdHex?: string;
}

export interface CollectWp06SourceDerivedFixtureInput {
  frontierSourcePath: string;
  cargoExecutablePath: string;
  rustcExecutablePath: string;
  gitExecutablePath: string;
  targetBurnIdHex?: string;
}

const WP06_SOURCE_DERIVED_FIXTURES = new WeakSet<object>();

export const WP06_SOURCE_DERIVED_NEGATIVE_CASES = Object.freeze([
  'receipt/root drift',
  'same-height Frontier replacement',
  'absent burn',
  'wrong extension key',
  'unfinalized target',
  'finality-horizon invalidity',
] as const);

export function loadWp06PublicVectors(): Wp06PublicVectors {
  const frontier = JSON.parse(readFileSync(FRONTIER_VECTOR_PATH, 'utf8')) as Wp06FrontierVector;
  const native = JSON.parse(readFileSync(NATIVE_VECTOR_PATH, 'utf8')) as Wp06NativeVector;
  if (frontier.schema !== 'e2s.frontier-bridge-event-root.vector.v1') {
    throw new Error('unexpected WP-06 Frontier vector schema');
  }
  if (native.schema !== 'e2s.native-finalized-bridge-checkpoint.vector.v2') {
    throw new Error('unexpected WP-06 native checkpoint vector schema');
  }
  if (native.rpcFixture?.synthetic !== true) {
    throw new Error('WP-06 native RPC fixture must remain synthetic and offline');
  }
  return {
    frontier: structuredClone(frontier),
    native: structuredClone(native),
  };
}

export async function buildWp06SourceDerivedFixture(
  input: BuildWp06SourceDerivedFixtureInput,
): Promise<Wp06SourceDerivedFixture> {
  assertPinnedLocalSourceNativeCheckpointProvenance(input?.checkpoint);
  assertNativeCheckpointAggregateFinalityProofProvenance(
    input?.aggregateFinalityProof,
    input.checkpoint,
  );
  if (
    input.aggregateFinalityProof.proofSystemId
    !== AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA
  ) {
    throw new Error('WP-06 requires native GRANDPA proofSystemId 1; proofSystemId 2 is not active');
  }
  const nativeBuildIdentity = input.nativeBuildIdentity
    ? {
        verifierExecutableSha256Hex: normalizeHex32(
          input.nativeBuildIdentity.verifierExecutableSha256Hex,
          'WP-06 verifier executable digest',
        ),
        codecExecutableSha256Hex: normalizeHex32(
          input.nativeBuildIdentity.codecExecutableSha256Hex,
          'WP-06 codec executable digest',
        ),
      }
    : undefined;
  if (
    nativeBuildIdentity
    && nativeBuildIdentity.verifierExecutableSha256Hex
      !== input.aggregateFinalityProof.verifierProfileIdHex
  ) {
    throw new Error('WP-06 native build verifier digest does not match the proof profile');
  }

  const vectors = input.vectors ?? loadWp06PublicVectors();
  const frontierInput = structuredClone(input.frontierInput ?? vectors.frontier.input);
  const checkpointCommitment = input.checkpoint.checkpointCommitment;
  assertPublicVectorIdentity(vectors, checkpointCommitment);

  const extraction = extractFrontierBridgeEventRoot(frontierInput);
  if (!extraction.commitment) throw new Error('WP-06 Frontier vector produced no burn root');
  const targetBurnIdHex = normalizeHex32(
    input.targetBurnIdHex ?? vectors.frontier.expected.burnIdHexes[0],
    'WP-06 target burn ID',
  );
  const targetBurn = extraction.burns.find(burn => burn.burnIdHex === targetBurnIdHex);
  if (!targetBurn) throw new Error('WP-06 target burn is absent from the Frontier receipt set');

  const sidechainHeight = Number(checkpointCommitment.checkpoint.sidechainHeight);
  if (!Number.isSafeInteger(sidechainHeight)) {
    throw new Error('WP-06 checkpoint height must fit a safe integer');
  }
  const pegOut: ParsedPegOut = {
    user: targetBurn.userAddress,
    amount: BigInt(targetBurn.amountNanoErg),
    ergoRecipientAddress: targetBurn.recipientErgoTreeHex,
    sidechainTxHash: targetBurn.sidechainTxHashHex,
    sidechainBlockNumber: sidechainHeight,
    sidechainBlockHash: checkpointCommitment.checkpoint.executionBlockHashHex,
    sidechainLogIndex: targetBurn.logIndex,
  };
  const provider = new Wp06FrontierFixtureProvider({
    blockNumber: sidechainHeight,
    defaultBlockHashHex: checkpointCommitment.checkpoint.executionBlockHashHex,
    canonicalBlockHashesHex: input.canonicalBlockHashesHex,
    receipts: frontierInput.receipts,
  });
  const proofBundle = await collectFrontierBurnProofForPegOut({
    provider,
    pegOut,
    sidechainIdHex: frontierInput.sidechainIdHex,
    bridgeAddress: frontierInput.bridgeAddress,
    maxBurns: frontierInput.maxBurns,
  });
  const join = joinPinnedLocalNativeCheckpointToFrontierBurns({
    checkpoint: input.checkpoint,
    frontier: frontierInput,
    targetBurnIdHex,
  });
  if (
    proofBundle.proof.leaf.leafHashHex !== join.targetBurnProof.leaf.leafHashHex
    || proofBundle.proof.bridgeEventRootHex !== join.bridgeEventRootHex
  ) {
    throw new Error('WP-06 production Frontier collector drifted from the native checkpoint join');
  }
  if (
    join.boundary.nativeFinalityVerified !== true
    || join.boundary.runtimeStateProofVerified !== true
    || join.boundary.admissionEligible !== false
    || join.boundary.onChainAcceptanceVerified !== false
    || join.boundary.gate5Closed !== false
  ) {
    throw new Error('WP-06 source-derived join crossed its pinned-local claim boundary');
  }

  const aggregateFinalityCommitment = buildAggregateFinalityCommitmentV1(
    input.aggregateFinalityProof,
  );
  if (
    aggregateFinalityCommitment.statement.encodedCheckpointHex
    !== checkpointCommitment.encodedCheckpointHex
  ) {
    throw new Error('WP-06 aggregate finality proof embeds a different checkpoint');
  }
  const extension = buildWp06ExtensionMembership(checkpointCommitment);

  const fixture = deepFreeze({
    vectors,
    ...(nativeBuildIdentity ? { nativeBuildIdentity } : {}),
    checkpoint: input.checkpoint,
    aggregateFinalityProof: input.aggregateFinalityProof,
    aggregateFinalityCommitment,
    frontierInput,
    targetBurn,
    pegOut,
    proofBundle,
    join,
    extension,
    boundary: {
      sourceDerivedPublicFixture: true as const,
      sourceDependencyFetchPrevented: false as const,
      chainRpcAccessEnabled: false as const,
      pinnedLocalSourceBuildVerified: true as const,
      nativeFinalityVerified: true as const,
      runtimeStateProofVerified: true as const,
      ergoExtensionAnchorVerified: false as const,
      onChainAcceptanceVerified: false as const,
      admissionEligible: false as const,
      committeeBypassPrevented: false as const,
      r9FinalityAuthority: true as const,
      gate5Closed: false as const,
      transactionMutationEnabled: false as const,
      submitOrBroadcastEnabled: false as const,
    },
  });
  WP06_SOURCE_DERIVED_FIXTURES.add(fixture);
  return fixture;
}

export function assertWp06SourceDerivedFixtureProvenance(
  value: unknown,
): asserts value is Wp06SourceDerivedFixture {
  if (typeof value !== 'object' || value === null || !WP06_SOURCE_DERIVED_FIXTURES.has(value)) {
    throw new Error('WP-06 source-derived fixture provenance is missing');
  }
}

export async function runWp06SourceDerivedAdversarialMatrix(
  fixture: Wp06SourceDerivedFixture,
): Promise<typeof WP06_SOURCE_DERIVED_NEGATIVE_CASES> {
  assertWp06SourceDerivedFixtureProvenance(fixture);
  const observed: string[] = [];
  const buildInput = {
    checkpoint: fixture.checkpoint,
    aggregateFinalityProof: fixture.aggregateFinalityProof,
    vectors: fixture.vectors,
    nativeBuildIdentity: fixture.nativeBuildIdentity,
  } as const;

  const changedReceipts = structuredClone(fixture.frontierInput);
  changedReceipts.receipts[0].transactionHash = `0x${'fe'.repeat(32)}`;
  await observeWp06SourceDerivedRejection(
    observed,
    'receipt/root drift',
    /event root does not match/i,
    () => buildWp06SourceDerivedFixture({
      ...buildInput,
      frontierInput: changedReceipts,
    }),
  );

  await observeWp06SourceDerivedRejection(
    observed,
    'same-height Frontier replacement',
    /hash drift|reorg/i,
    () => buildWp06SourceDerivedFixture({
      ...buildInput,
      canonicalBlockHashesHex: [
        fixture.checkpoint.checkpointCommitment.checkpoint.executionBlockHashHex,
        'fe'.repeat(32),
      ],
    }),
  );

  await observeWp06SourceDerivedRejection(
    observed,
    'absent burn',
    /absent/i,
    () => buildWp06SourceDerivedFixture({
      ...buildInput,
      targetBurnIdHex: 'fe'.repeat(32),
    }),
  );

  await observeWp06SourceDerivedRejection(
    observed,
    'wrong extension key',
    /exact 0x0401/i,
    async () => buildWp06ExtensionMembership(
      fixture.checkpoint.checkpointCommitment,
      '0402',
    ),
  );

  const checkpointNumber = Number(fixture.vectors.native.request.trustAnchor.checkpointNumber);
  const targetNumber = Number(fixture.vectors.native.expected.target.nativeHeight);
  const finalityHorizonNumber = Number(
    fixture.vectors.native.expected.finality.horizonHeight,
  );
  await observeWp06SourceDerivedRejection(
    observed,
    'unfinalized target',
    /target native block is above the observed finalized head/,
    async () => validateNativeCheckpointFinalityBounds({
      checkpointNumber,
      targetNumber,
      finalizedHeadNumber: targetNumber - 1,
    }),
  );

  await observeWp06SourceDerivedRejection(
    observed,
    'finality-horizon invalidity',
    /target finality horizon is above the observed finalized head/,
    async () => validateNativeCheckpointFinalityBounds({
      checkpointNumber,
      targetNumber,
      finalizedHeadNumber: finalityHorizonNumber - 1,
      finality: {
        horizonNumber: finalityHorizonNumber,
        unknownHeaderCount: finalityHorizonNumber - targetNumber,
      },
    }),
  );

  assertWp06SourceDerivedFixtureProvenance(fixture);
  if (!isDeepStrictEqual(observed, WP06_SOURCE_DERIVED_NEGATIVE_CASES)) {
    throw new Error('WP-06 source-derived adversarial matrix did not observe its exact cases');
  }
  return WP06_SOURCE_DERIVED_NEGATIVE_CASES;
}

export async function collectWp06SourceDerivedFixture(
  input: CollectWp06SourceDerivedFixtureInput,
): Promise<Wp06SourceDerivedFixture> {
  const vectors = loadWp06PublicVectors();
  const pinnedBuild = await preparePinnedLocalNativeVerifierBuild({
    frontierSourcePath: input.frontierSourcePath,
    cargoExecutablePath: input.cargoExecutablePath,
    rustcExecutablePath: input.rustcExecutablePath,
    gitExecutablePath: input.gitExecutablePath,
  });
  try {
    const execution = getPinnedLocalNativeVerifierExecution(pinnedBuild);
    const codecInvocationSha256Hex = {
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
    };
    const transport = new Wp06SubstrateFixtureTransport(vectors.native.rpcFixture.responses);
    const verificationRun = await collectAndVerifyNativeFinalizedCheckpoint({
      rpc: new ReadOnlySubstrateFinalityRpc(transport),
      codec: createNativeSubstrateRpcProofCodec({
        executablePath: execution.codecExecutablePath,
        expectedExecutableSha256Hex: execution.codecSha256Hex,
        expectedExecutableInvocationSha256Hex: codecInvocationSha256Hex,
      }),
      trustAnchor: vectors.native.request.trustAnchor,
      targetNativeBlockHashHex: vectors.native.request.targetNativeBlockHashHex,
      trustedAnchorDigestHex: vectors.native.trustedAnchorDigestHex,
      verifierExecutablePath: execution.verifierExecutablePath,
      verifierExecutableSha256Hex: execution.verifierSha256Hex,
      verifierExecutableInvocationSha256Hex: deriveExecutableInvocationSha256Hex(
        execution.verifierSha256Hex,
        ['--trusted-anchor-digest', vectors.native.trustedAnchorDigestHex],
      ),
      maxAttempts: 1,
    });
    transport.assertConsumed();
    if (!isDeepStrictEqual(verificationRun.collection.request, vectors.native.request)) {
      throw new Error('WP-06 source collection drifted from the public native request vector');
    }
    if (!isDeepStrictEqual(verificationRun.verification, vectors.native.expected)) {
      throw new Error('WP-06 source verification drifted from the public native result vector');
    }
    const checkpoint = bindNativeCheckpointToPinnedLocalBuild({
      checkpoint: verificationRun.checkpoint,
      build: pinnedBuild,
    });
    const aggregateFinalityProof = buildNativeCheckpointAggregateFinalityProofV1({
      checkpoint,
      request: vectors.native.request,
    });
    return await buildWp06SourceDerivedFixture({
      checkpoint,
      aggregateFinalityProof,
      nativeBuildIdentity: {
        verifierExecutableSha256Hex: verificationRun.nativeExecutablePins.verifierSha256Hex,
        codecExecutableSha256Hex: verificationRun.nativeExecutablePins.codecSha256Hex,
      },
      vectors,
      targetBurnIdHex: input.targetBurnIdHex,
    });
  } finally {
    disposePinnedLocalNativeVerifierBuild(pinnedBuild);
  }
}

export function buildWp06ExtensionMembership(
  checkpoint: BridgeCheckpointCommitmentV1,
  keyHex: string = BRIDGE_EXTENSION_KEY_HEX,
): Wp06ExtensionMembership {
  if (keyHex.toLowerCase() !== BRIDGE_EXTENSION_KEY_HEX) {
    throw new Error('WP-06 extension membership must use the exact 0x0401 key');
  }
  const merkleFields: ErgoExtensionMerkleField[] = [
    { key: Buffer.from('0001', 'hex'), value: Buffer.from('11'.repeat(16), 'hex') },
    {
      key: Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
      value: Buffer.from(checkpoint.extensionValueHex, 'hex'),
    },
    { key: Buffer.from('7f01', 'hex'), value: Buffer.from('22'.repeat(24), 'hex') },
  ];
  const membership = buildErgoExtensionMembershipProof(
    merkleFields,
    Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
  );
  return deepFreeze({
    keyHex: BRIDGE_EXTENSION_KEY_HEX,
    valueHex: checkpoint.extensionValueHex,
    fields: merkleFields.map(field => ({
      keyHex: Buffer.from(field.key).toString('hex'),
      valueHex: Buffer.from(field.value).toString('hex'),
    })),
    proofHex: membership.proof.toString('hex'),
    rootHex: membership.root.toString('hex'),
  });
}

class Wp06SubstrateFixtureTransport implements SubstrateRpcTransport {
  private readonly responses: Array<{
    method: string;
    params: unknown[];
    result: unknown;
    used: boolean;
  }>;

  constructor(responses: Wp06NativeVector['rpcFixture']['responses']) {
    if (!Array.isArray(responses) || responses.length === 0) {
      throw new Error('WP-06 synthetic Substrate fixture must contain responses');
    }
    this.responses = responses.map(response => ({
      ...structuredClone(response),
      used: false,
    }));
  }

  async request<T = unknown>(method: string, params: readonly unknown[]): Promise<T> {
    const encodedParams = JSON.stringify(params);
    const match = this.responses.find(response =>
      !response.used
      && response.method === method
      && JSON.stringify(response.params) === encodedParams);
    if (!match) {
      throw new Error(`WP-06 synthetic Substrate fixture has no unused response for ${method}`);
    }
    match.used = true;
    return structuredClone(match.result) as T;
  }

  assertConsumed(): void {
    const unused = this.responses.filter(response => !response.used);
    if (unused.length !== 0) {
      throw new Error(`WP-06 synthetic Substrate fixture left ${unused.length} response(s) unused`);
    }
  }
}

class Wp06FrontierFixtureProvider implements FrontierBurnProofProvider {
  private blockReadCount = 0;
  private readonly blockNumber: number;
  private readonly blockHashesHex: string[];
  private readonly receipts: readonly unknown[];

  constructor(input: {
    blockNumber: number;
    defaultBlockHashHex: string;
    canonicalBlockHashesHex?: readonly string[];
    receipts: readonly unknown[];
  }) {
    this.blockNumber = input.blockNumber;
    const hashes = input.canonicalBlockHashesHex?.length
      ? input.canonicalBlockHashesHex
      : [input.defaultBlockHashHex];
    this.blockHashesHex = hashes.map((hash, index) =>
      normalizeHex32(hash, `WP-06 canonical block hash ${index}`));
    this.receipts = structuredClone(input.receipts);
  }

  async getBlock(number: number): Promise<{ number: number; hash: string } | null> {
    if (number !== this.blockNumber) return null;
    const index = Math.min(this.blockReadCount, this.blockHashesHex.length - 1);
    this.blockReadCount += 1;
    return { number, hash: `0x${this.blockHashesHex[index]}` };
  }

  async getBlockReceipts(blockNumber: number): Promise<unknown> {
    if (blockNumber !== this.blockNumber) {
      throw new Error(
        `WP-06 fixture provider rejects block-receipt height ${blockNumber}`,
      );
    }
    const blockHash = `0x${this.blockHashesHex[Math.min(
      Math.max(this.blockReadCount - 1, 0),
      this.blockHashesHex.length - 1,
    )]}`;
    return this.receipts.map(receipt => ({
      ...(structuredClone(receipt) as Record<string, unknown>),
      blockHash,
      blockNumber: `0x${this.blockNumber.toString(16)}`,
    }));
  }
}

function assertPublicVectorIdentity(
  vectors: Wp06PublicVectors,
  checkpoint: BridgeCheckpointCommitmentV1,
): void {
  const native = vectors.native.expected.commitment;
  const expected = vectors.frontier.expected;
  const actual = checkpoint.checkpoint;
  const matches =
    normalizeHex32(native.sidechainIdHex, 'native vector sidechain ID') === actual.sidechainIdHex
    && native.sidechainHeight === actual.sidechainHeight
    && normalizeHex32(native.executionBlockHashHex, 'native vector execution hash')
      === actual.executionBlockHashHex
    && normalizeHex32(native.bridgeEventRootHex, 'native vector event root')
      === actual.bridgeEventRootHex
    && native.burnLeafCount === actual.burnLeafCount
    && normalizeHex32(expected.bridgeEventRootHex, 'Frontier vector event root')
      === actual.bridgeEventRootHex
    && expected.burnCount === actual.burnLeafCount;
  if (!matches) {
    throw new Error('WP-06 public Frontier/native vector identity drifted from the verified checkpoint');
  }
}

async function observeWp06SourceDerivedRejection(
  observed: string[],
  label: typeof WP06_SOURCE_DERIVED_NEGATIVE_CASES[number],
  expectedMessage: RegExp,
  operation: () => unknown | Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    if (!expectedMessage.test(message)) {
      throw new Error(`${label}: unexpected rejection: ${message}`);
    }
    observed.push(label);
    return;
  }
  throw new Error(`${label}: production check unexpectedly accepted the adversarial case`);
}

function normalizeHex32(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be 32-byte hex`);
  const clean = value.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error(`${label} must be 32-byte hex`);
  return clean;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (ArrayBuffer.isView(value)) {
    throw new Error('WP-06 source-derived fixtures must not retain mutable binary views');
  }
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
