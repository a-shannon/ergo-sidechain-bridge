import { Interface, getAddress, id } from 'ethers';

import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';

export const FRONTIER_BACKING_READ_AGREEMENT_SCHEMA =
  'e2s.frontier-backing-read-agreement.v1' as const;

const PEG_OUT_EVENT = 'PegOut(address,uint256,bytes)';
const PEG_OUT_TOPIC = id(PEG_OUT_EVENT).toLowerCase();
const PEG_OUT_INTERFACE = new Interface([
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
]);
const BLOCK_PAGE_SIZE = 2_000;
const MAX_PAGE_PEG_OUTS = 4_096;
const MAX_TOTAL_PEG_OUTS = 100_000;
const MAX_CANONICAL_EVENT_BYTES = 16 * 1024 * 1024;
const MAX_RECEIPT_LOGS = 4_096;
const MAX_SCAN_PAGES = 10_000;
const MINIMUM_PEG_OUT_NANOERG = 10_000_000n;
const MAX_SIGNED_LONG = 0x7fff_ffff_ffff_ffffn;
export const FRONTIER_BACKING_MAX_READER_TIP_LAG_BLOCKS = 2;

export interface FrontierBackingBlock {
  readonly number: number;
  readonly hash: string | null;
}

export interface FrontierBackingRuntimeIdentity {
  readonly chainId: string;
  readonly bridgeCodeHashHex: string;
  readonly sergAddress: string;
  readonly sergCodeHashHex: string;
  readonly sergOwnerAddress: string;
}

interface ExpectedFrontierBackingRuntimeIdentity {
  readonly chainId: string;
  readonly bridgeAddress: string;
  readonly bridgeCodeHashHex: string;
  readonly sergAddress: string;
  readonly sergCodeHashHex: string;
  readonly profileDigestHex: string;
}

export interface FrontierBackingPegOutLike {
  readonly user: string;
  readonly amount: bigint;
  readonly ergoRecipientAddress: string;
  readonly sidechainTxHash: string;
  readonly sidechainBlockNumber: number;
  readonly sidechainBlockHash?: string;
  readonly sidechainLogIndex?: number;
}

export interface FrontierBackingPegOut {
  readonly user: string;
  readonly amount: bigint;
  readonly ergoRecipientAddress: string;
  readonly sidechainTxHash: string;
  readonly sidechainBlockNumber: number;
  readonly sidechainBlockHash: string;
  readonly sidechainLogIndex: number;
}

export interface FrontierBackingReadClient {
  getCurrentBlockNumber(): Promise<number>;
  getBlock(blockNumber: number): Promise<FrontierBackingBlock | null>;
  scanForPegOuts(
    fromBlock: number,
    toBlock: number,
  ): Promise<readonly FrontierBackingPegOutLike[]>;
  getTransactionReceipt(transactionHash: string): Promise<unknown>;
  getTotalSERGSupplyAtBlockHash(blockHashHex: string): Promise<bigint>;
  getRuntimeIdentityAtBlockHash(
    blockHashHex: string,
  ): Promise<Readonly<FrontierBackingRuntimeIdentity>>;
}

export interface FrontierBackingReadAgreementSources {
  readonly sourceIdsHex: readonly [string, string];
}

export interface FrontierBackingReadAgreementSnapshot {
  readonly schema: typeof FRONTIER_BACKING_READ_AGREEMENT_SCHEMA;
  readonly sourceIdsHex: readonly [string, string];
  readonly sidechainIdHex: string;
  readonly bridgeAddress: string;
  readonly scanFromHeight: 0;
  readonly scanPageSize: typeof BLOCK_PAGE_SIZE;
  readonly scanPageCount: number;
  readonly readerTipFloorHeight: number;
  readonly readerTipCeilingHeight: number;
  readonly maxReaderTipLagBlocks:
    typeof FRONTIER_BACKING_MAX_READER_TIP_LAG_BLOCKS;
  readonly pinnedHeight: number;
  readonly pinnedBlockHashHex: string;
  readonly totalSupplyNanoErg: bigint;
  readonly runtimeIdentityDigestHex: string;
  readonly pegOuts: readonly FrontierBackingPegOut[];
  readonly observedPegOutCount: number;
  readonly inventoryDigestHex: string;
  readonly agreementDigestHex: string;
}

interface SourceBinding {
  readonly client: FrontierBackingReadClient;
  readonly origin: string;
  readonly sourceIdHex: string;
  readonly nodeIdentityDigestHex: string;
}

interface PairBinding {
  readonly primary: SourceBinding;
  readonly witness: SourceBinding;
  readonly expectedRuntimeIdentity: ExpectedFrontierBackingRuntimeIdentity;
}

interface SourceView {
  readonly sidechainIdHex: string;
  readonly bridgeAddress: string;
  readonly scanFromHeight: 0;
  readonly scanPageSize: typeof BLOCK_PAGE_SIZE;
  readonly scanPageCount: number;
  readonly pinnedHeight: number;
  readonly pinnedBlockHashHex: string;
  readonly totalSupplyNanoErg: bigint;
  readonly runtimeIdentityDigestHex: string;
  readonly pegOuts: readonly FrontierBackingPegOut[];
  readonly inventoryDigestHex: string;
  readonly viewDigestHex: string;
}

const PAIR_BINDINGS = new WeakMap<object, PairBinding>();
const SEALED_SOURCE_PAIRS = new WeakSet<object>();
const SNAPSHOT_BINDINGS = new WeakMap<object, Readonly<{
  sources: FrontierBackingReadAgreementSources;
  captureOrdinal: number;
}>>();
const PAIR_CAPTURE_ORDINALS = new WeakMap<object, number>();

export function createFrontierBackingReadAgreementSources(input: Readonly<{
  primaryClient: FrontierBackingReadClient;
  primaryRpcUrl: string;
  primaryNodeIdentityDigestHex: string;
  primaryAdministrationIdentityDigestHex: string;
  witnessClient: FrontierBackingReadClient;
  witnessRpcUrl: string;
  witnessNodeIdentityDigestHex: string;
  witnessAdministrationIdentityDigestHex: string;
  expectedChainId: string;
  expectedBridgeAddress: string;
  expectedBridgeCodeHashHex: string;
  expectedSergAddress: string;
  expectedSergCodeHashHex: string;
}>): FrontierBackingReadAgreementSources {
  if (
    !input.primaryClient
    || !input.witnessClient
    || input.primaryClient === input.witnessClient
  ) {
    throw new Error('Frontier backing read agreement requires two distinct clients');
  }
  const primaryOrigin = canonicalNodeOrigin(
    input.primaryRpcUrl,
    'primary Frontier backing RPC URL',
  );
  const witnessOrigin = canonicalNodeOrigin(
    input.witnessRpcUrl,
    'witness Frontier backing RPC URL',
  );
  if (primaryOrigin === witnessOrigin) {
    throw new Error('Frontier backing read agreement requires distinct RPC origins');
  }

  const primaryNodeIdentityDigestHex = fixedHex32(
    input.primaryNodeIdentityDigestHex,
    'primary Frontier node identity digest',
  );
  const witnessNodeIdentityDigestHex = fixedHex32(
    input.witnessNodeIdentityDigestHex,
    'witness Frontier node identity digest',
  );
  if (primaryNodeIdentityDigestHex === witnessNodeIdentityDigestHex) {
    throw new Error('Frontier backing readers require distinct node identities');
  }
  const primaryAdministrationIdentityDigestHex = fixedHex32(
    input.primaryAdministrationIdentityDigestHex,
    'primary Frontier administration identity digest',
  );
  const witnessAdministrationIdentityDigestHex = fixedHex32(
    input.witnessAdministrationIdentityDigestHex,
    'witness Frontier administration identity digest',
  );
  if (
    primaryAdministrationIdentityDigestHex
    === witnessAdministrationIdentityDigestHex
  ) {
    throw new Error('Frontier backing readers require distinct administration identities');
  }
  const expectedRuntimeIdentity = canonicalExpectedRuntimeIdentity({
    chainId: input.expectedChainId,
    bridgeAddress: input.expectedBridgeAddress,
    bridgeCodeHashHex: input.expectedBridgeCodeHashHex,
    sergAddress: input.expectedSergAddress,
    sergCodeHashHex: input.expectedSergCodeHashHex,
  });

  const primary = Object.freeze({
    client: input.primaryClient,
    origin: primaryOrigin,
    nodeIdentityDigestHex: primaryNodeIdentityDigestHex,
    sourceIdHex: sourceId({
      origin: primaryOrigin,
      nodeIdentityDigestHex: primaryNodeIdentityDigestHex,
      administrationIdentityDigestHex:
        primaryAdministrationIdentityDigestHex,
      runtimeIdentityProfileDigestHex:
        expectedRuntimeIdentity.profileDigestHex,
    }),
  });
  const witness = Object.freeze({
    client: input.witnessClient,
    origin: witnessOrigin,
    nodeIdentityDigestHex: witnessNodeIdentityDigestHex,
    sourceIdHex: sourceId({
      origin: witnessOrigin,
      nodeIdentityDigestHex: witnessNodeIdentityDigestHex,
      administrationIdentityDigestHex:
        witnessAdministrationIdentityDigestHex,
      runtimeIdentityProfileDigestHex:
        expectedRuntimeIdentity.profileDigestHex,
    }),
  });
  const sourceIds = [primary.sourceIdHex, witness.sourceIdHex].sort();
  const sourceIdsHex = Object.freeze([
    sourceIds[0],
    sourceIds[1],
  ]) as readonly [string, string];
  const sources = Object.freeze({ sourceIdsHex });
  PAIR_BINDINGS.set(sources, Object.freeze({
    primary,
    witness,
    expectedRuntimeIdentity,
  }));
  PAIR_CAPTURE_ORDINALS.set(sources, 0);
  return sources;
}

export async function observeFrontierBackingReadAgreement(input: Readonly<{
  sources: FrontierBackingReadAgreementSources;
  sidechainIdHex: string;
  bridgeAddress: string;
}>): Promise<Readonly<FrontierBackingReadAgreementSnapshot>> {
  assertFrontierBackingReadAgreementTransportActive(input.sources);
  const pair = pairBinding(input.sources);
  const sidechainIdHex = fixedHex32(input.sidechainIdHex, 'sidechain ID');
  const bridgeAddress = canonicalAddress(input.bridgeAddress, 'bridge address');
  if (bridgeAddress !== pair.expectedRuntimeIdentity.bridgeAddress) {
    throw new Error(
      'Frontier backing bridge address does not match the reviewed runtime profile',
    );
  }
  const primaryTipHeight = await readCurrentTipHeight(pair.primary.client);
  const witnessTipHeight = await readCurrentTipHeight(pair.witness.client);
  const { floor: readerTipFloorHeight, ceiling: readerTipCeilingHeight } =
    readerTipWindow(primaryTipHeight, witnessTipHeight);
  const pinnedHeight = readerTipFloorHeight;
  if (pageCount(pinnedHeight) > MAX_SCAN_PAGES) {
    throw new Error('Frontier backing scan exceeds its page bound');
  }
  const observation = Object.freeze({
    sidechainIdHex,
    bridgeAddress,
    pinnedHeight,
    expectedRuntimeIdentity: pair.expectedRuntimeIdentity,
  });
  const primary = await observeSourceView(pair.primary, observation);
  const witness = await observeSourceView(pair.witness, observation);
  if (primary.viewDigestHex !== witness.viewDigestHex) {
    throw new Error(
      'Frontier backing readers disagree on the pinned burn inventory or supply',
    );
  }
  const agreementBinding = {
    sourceIdsHex: input.sources.sourceIdsHex,
    readerTipFloorHeight,
    readerTipCeilingHeight,
    maxReaderTipLagBlocks: FRONTIER_BACKING_MAX_READER_TIP_LAG_BLOCKS,
    viewDigestHex: primary.viewDigestHex,
  };
  const snapshot = Object.freeze({
    schema: FRONTIER_BACKING_READ_AGREEMENT_SCHEMA,
    sourceIdsHex: input.sources.sourceIdsHex,
    sidechainIdHex: primary.sidechainIdHex,
    bridgeAddress: primary.bridgeAddress,
    scanFromHeight: primary.scanFromHeight,
    scanPageSize: primary.scanPageSize,
    scanPageCount: primary.scanPageCount,
    readerTipFloorHeight,
    readerTipCeilingHeight,
    maxReaderTipLagBlocks: FRONTIER_BACKING_MAX_READER_TIP_LAG_BLOCKS,
    pinnedHeight: primary.pinnedHeight,
    pinnedBlockHashHex: primary.pinnedBlockHashHex,
    totalSupplyNanoErg: primary.totalSupplyNanoErg,
    runtimeIdentityDigestHex: primary.runtimeIdentityDigestHex,
    pegOuts: primary.pegOuts,
    observedPegOutCount: primary.pegOuts.length,
    inventoryDigestHex: primary.inventoryDigestHex,
    agreementDigestHex: sha256CanonicalJson(
      agreementBinding,
      'e2s.frontier-backing-read-agreement-digest.v1',
    ),
  });
  const previousCaptureOrdinal = PAIR_CAPTURE_ORDINALS.get(input.sources);
  if (
    previousCaptureOrdinal === undefined
    || previousCaptureOrdinal >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('Frontier backing capture ordinal is unavailable');
  }
  const captureOrdinal = previousCaptureOrdinal + 1;
  PAIR_CAPTURE_ORDINALS.set(input.sources, captureOrdinal);
  SNAPSHOT_BINDINGS.set(snapshot, Object.freeze({
    sources: input.sources,
    captureOrdinal,
  }));
  return snapshot;
}

export function sealFrontierBackingReadAgreementSources(
  sources: FrontierBackingReadAgreementSources,
): void {
  pairBinding(sources);
  SEALED_SOURCE_PAIRS.add(sources);
}

export function assertFrontierBackingReadAgreementSourcesSealed(
  sources: FrontierBackingReadAgreementSources,
): void {
  pairBinding(sources);
  if (!SEALED_SOURCE_PAIRS.has(sources)) {
    throw new Error('Frontier backing read-agreement sources are not sealed');
  }
}

export function assertFrontierBackingReadAgreementProvenance(
  sources: FrontierBackingReadAgreementSources,
  snapshot: unknown,
): asserts snapshot is Readonly<FrontierBackingReadAgreementSnapshot> {
  const binding = snapshot && typeof snapshot === 'object'
    ? SNAPSHOT_BINDINGS.get(snapshot)
    : undefined;
  if (binding?.sources !== sources) {
    throw new Error('Frontier backing read-agreement provenance is missing');
  }
  pairBinding(sources);
  const candidate = snapshot as FrontierBackingReadAgreementSnapshot;
  if (
    candidate.schema !== FRONTIER_BACKING_READ_AGREEMENT_SCHEMA
    || candidate.sourceIdsHex !== sources.sourceIdsHex
    || candidate.scanFromHeight !== 0
    || candidate.scanPageSize !== BLOCK_PAGE_SIZE
    || candidate.observedPegOutCount !== candidate.pegOuts.length
    || candidate.scanPageCount !== pageCount(candidate.pinnedHeight)
    || candidate.scanPageCount > MAX_SCAN_PAGES
    || candidate.maxReaderTipLagBlocks
      !== FRONTIER_BACKING_MAX_READER_TIP_LAG_BLOCKS
  ) {
    throw new Error('Frontier backing read-agreement snapshot is invalid');
  }
  const sidechainIdHex = fixedHex32(candidate.sidechainIdHex, 'sidechain ID');
  const bridgeAddress = canonicalAddress(candidate.bridgeAddress, 'bridge address');
  const readerTipFloorHeight = nonnegativeSafeInteger(
    candidate.readerTipFloorHeight,
    'Frontier backing reader tip floor',
  );
  const readerTipCeilingHeight = nonnegativeSafeInteger(
    candidate.readerTipCeilingHeight,
    'Frontier backing reader tip ceiling',
  );
  readerTipWindow(readerTipFloorHeight, readerTipCeilingHeight);
  const pinnedHeight = nonnegativeSafeInteger(
    candidate.pinnedHeight,
    'Frontier backing pinned height',
  );
  if (pinnedHeight !== readerTipFloorHeight) {
    throw new Error('Frontier backing pin does not match the reader tip floor');
  }
  const pinnedBlockHashHex = fixedHex32(
    candidate.pinnedBlockHashHex,
    'Frontier backing pinned block hash',
  );
  const runtimeIdentityDigestHex = fixedHex32(
    candidate.runtimeIdentityDigestHex,
    'Frontier backing runtime identity digest',
  );
  const pegOuts = canonicalSortedPegOuts(candidate.pegOuts);
  const inventoryDigestHex = inventoryDigest({
    sidechainIdHex,
    bridgeAddress,
    pinnedHeight,
    pinnedBlockHashHex,
    pegOuts,
  });
  if (candidate.inventoryDigestHex !== inventoryDigestHex) {
    throw new Error('Frontier backing read-agreement inventory digest is invalid');
  }
  const viewDigestHex = sourceViewDigest({
    sidechainIdHex,
    bridgeAddress,
    scanPageCount: candidate.scanPageCount,
    pinnedHeight,
    pinnedBlockHashHex,
    totalSupplyNanoErg: canonicalSupply(candidate.totalSupplyNanoErg),
    runtimeIdentityDigestHex,
    inventoryDigestHex,
  });
  const expectedAgreementDigestHex = sha256CanonicalJson({
    sourceIdsHex: sources.sourceIdsHex,
    readerTipFloorHeight,
    readerTipCeilingHeight,
    maxReaderTipLagBlocks: FRONTIER_BACKING_MAX_READER_TIP_LAG_BLOCKS,
    viewDigestHex,
  }, 'e2s.frontier-backing-read-agreement-digest.v1');
  if (candidate.agreementDigestHex !== expectedAgreementDigestHex) {
    throw new Error('Frontier backing read-agreement digest is invalid');
  }
}

export function assertFrontierBackingReadAgreementCaptureOrder(
  sources: FrontierBackingReadAgreementSources,
  snapshots: readonly unknown[],
): void {
  pairBinding(sources);
  let previousCaptureOrdinal = 0;
  for (const snapshot of snapshots) {
    assertFrontierBackingReadAgreementProvenance(sources, snapshot);
    const binding = SNAPSHOT_BINDINGS.get(snapshot);
    if (
      binding === undefined
      || binding.captureOrdinal <= previousCaptureOrdinal
    ) {
      throw new Error('Frontier backing snapshots differ from their capture order');
    }
    previousCaptureOrdinal = binding.captureOrdinal;
  }
}

export function assertFrontierBackingReadAgreementNodeIdentityBinding(
  sources: FrontierBackingReadAgreementSources,
  expected: Readonly<{
    primaryNodeIdentityDigestHex: string;
    witnessNodeIdentityDigestHex: string;
  }>,
): void {
  const pair = pairBinding(sources);
  const primaryNodeIdentityDigestHex = fixedHex32(
    expected.primaryNodeIdentityDigestHex,
    'expected primary Frontier node identity digest',
  );
  const witnessNodeIdentityDigestHex = fixedHex32(
    expected.witnessNodeIdentityDigestHex,
    'expected witness Frontier node identity digest',
  );
  if (
    pair.primary.nodeIdentityDigestHex !== primaryNodeIdentityDigestHex
    || pair.witness.nodeIdentityDigestHex !== witnessNodeIdentityDigestHex
  ) {
    throw new Error(
      'Frontier backing source pair differs from the owned process identities',
    );
  }
}

export async function revalidateFrontierBackingReadAgreementPin(
  sources: FrontierBackingReadAgreementSources,
  snapshot: Readonly<FrontierBackingReadAgreementSnapshot>,
): Promise<void> {
  assertFrontierBackingReadAgreementTransportActive(sources);
  assertFrontierBackingReadAgreementProvenance(sources, snapshot);
  const pair = pairBinding(sources);
  const primaryHash = await readPinnedBlockHash(
    pair.primary.client,
    snapshot.pinnedHeight,
  );
  const witnessHash = await readPinnedBlockHash(
    pair.witness.client,
    snapshot.pinnedHeight,
  );
  if (
    primaryHash !== snapshot.pinnedBlockHashHex
    || witnessHash !== snapshot.pinnedBlockHashHex
  ) {
    throw new Error('Frontier backing pinned block changed after observation');
  }
  const primaryTipHeight = await readCurrentTipHeight(pair.primary.client);
  const witnessTipHeight = await readCurrentTipHeight(pair.witness.client);
  const currentTips = readerTipWindow(primaryTipHeight, witnessTipHeight);
  if (currentTips.floor < snapshot.pinnedHeight) {
    throw new Error('Frontier backing reader regressed below the admitted pin');
  }
}

function assertFrontierBackingReadAgreementTransportActive(
  sources: FrontierBackingReadAgreementSources,
): void {
  pairBinding(sources);
  if (SEALED_SOURCE_PAIRS.has(sources)) {
    throw new Error(
      'Frontier backing read-agreement sources are sealed against transport',
    );
  }
}

async function observeSourceView(
  source: SourceBinding,
  input: Readonly<{
    sidechainIdHex: string;
    bridgeAddress: string;
    pinnedHeight: number;
    expectedRuntimeIdentity: ExpectedFrontierBackingRuntimeIdentity;
  }>,
): Promise<Readonly<SourceView>> {
  const tipBefore = nonnegativeSafeInteger(
    await source.client.getCurrentBlockNumber(),
    'initial Frontier backing tip',
  );
  if (tipBefore < input.pinnedHeight) {
    throw new Error('Frontier backing reader has not reached the pinned height');
  }
  const pinnedBlockHashBefore = await readPinnedBlockHash(
    source.client,
    input.pinnedHeight,
  );
  const runtimeIdentityDigestHex = validateRuntimeIdentity(
    input.expectedRuntimeIdentity,
    await source.client.getRuntimeIdentityAtBlockHash(pinnedBlockHashBefore),
  );
  const pegOuts: FrontierBackingPegOut[] = [];
  const seenEventIds = new Set<string>();
  let canonicalEventBytes = 2;
  let scanPageCount = 0;
  const blockHashCache = new Map<number, string>();

  for (
    let fromBlock = 0;
    fromBlock <= input.pinnedHeight;
    fromBlock += BLOCK_PAGE_SIZE
  ) {
    const toBlock = Math.min(
      input.pinnedHeight,
      fromBlock + BLOCK_PAGE_SIZE - 1,
    );
    const page = await source.client.scanForPegOuts(fromBlock, toBlock);
    scanPageCount += 1;
    if (!Array.isArray(page) || page.length > MAX_PAGE_PEG_OUTS) {
      throw new Error('Frontier backing event page exceeds its bound');
    }
    if (pegOuts.length + page.length > MAX_TOTAL_PEG_OUTS) {
      throw new Error('Frontier backing inventory exceeds its event bound');
    }
    const verifiedPage = await reconcilePageWithReceipts({
      client: source.client,
      bridgeAddress: input.bridgeAddress,
      fromBlock,
      toBlock,
      scanned: page,
      blockHashCache,
    });
    for (const pegOut of verifiedPage) {
      const eventId = `${pegOut.sidechainTxHash}:${pegOut.sidechainLogIndex}`;
      if (seenEventIds.has(eventId)) {
        throw new Error(`Frontier backing inventory repeats event ${eventId}`);
      }
      seenEventIds.add(eventId);
      const bytes = Buffer.byteLength(canonicalJson(pegOutJson(pegOut)), 'utf8');
      canonicalEventBytes += bytes + (pegOuts.length === 0 ? 0 : 1);
      if (canonicalEventBytes > MAX_CANONICAL_EVENT_BYTES) {
        throw new Error('Frontier backing inventory exceeds its canonical-byte bound');
      }
      pegOuts.push(pegOut);
    }
  }

  const totalSupplyNanoErg = canonicalSupply(
    await source.client.getTotalSERGSupplyAtBlockHash(
      pinnedBlockHashBefore,
    ),
  );
  const pinnedBlockHashAfter = await readPinnedBlockHash(
    source.client,
    input.pinnedHeight,
  );
  const tipAfter = nonnegativeSafeInteger(
    await source.client.getCurrentBlockNumber(),
    'revalidated Frontier backing tip',
  );
  if (tipAfter < input.pinnedHeight) {
    throw new Error('Frontier backing reader rolled below the pinned height');
  }
  if (pinnedBlockHashAfter !== pinnedBlockHashBefore) {
    throw new Error('Frontier backing pinned block changed during observation');
  }

  const sortedPegOuts = canonicalSortedPegOuts(pegOuts);
  const inventoryDigestHex = inventoryDigest({
    sidechainIdHex: input.sidechainIdHex,
    bridgeAddress: input.bridgeAddress,
    pinnedHeight: input.pinnedHeight,
    pinnedBlockHashHex: pinnedBlockHashAfter,
    pegOuts: sortedPegOuts,
  });
  const viewBinding = {
    sidechainIdHex: input.sidechainIdHex,
    bridgeAddress: input.bridgeAddress,
    scanPageCount,
    pinnedHeight: input.pinnedHeight,
    pinnedBlockHashHex: pinnedBlockHashAfter,
    totalSupplyNanoErg,
    runtimeIdentityDigestHex,
    inventoryDigestHex,
  };
  return Object.freeze({
    sidechainIdHex: input.sidechainIdHex,
    bridgeAddress: input.bridgeAddress,
    scanFromHeight: 0 as const,
    scanPageSize: BLOCK_PAGE_SIZE,
    scanPageCount,
    pinnedHeight: input.pinnedHeight,
    pinnedBlockHashHex: pinnedBlockHashAfter,
    totalSupplyNanoErg,
    runtimeIdentityDigestHex,
    pegOuts: sortedPegOuts,
    inventoryDigestHex,
    viewDigestHex: sourceViewDigest(viewBinding),
  });
}

async function reconcilePageWithReceipts(input: Readonly<{
  client: FrontierBackingReadClient;
  bridgeAddress: string;
  fromBlock: number;
  toBlock: number;
  scanned: readonly FrontierBackingPegOutLike[];
  blockHashCache: Map<number, string>;
}>): Promise<readonly FrontierBackingPegOut[]> {
  const scanned = input.scanned.map(pegOut => canonicalPegOut(pegOut));
  for (const pegOut of scanned) {
    if (
      pegOut.sidechainBlockNumber < input.fromBlock
      || pegOut.sidechainBlockNumber > input.toBlock
    ) {
      throw new Error('Frontier backing event falls outside its requested page');
    }
  }
  const byTransaction = new Map<string, FrontierBackingPegOut[]>();
  for (const pegOut of scanned) {
    const events = byTransaction.get(pegOut.sidechainTxHash) ?? [];
    events.push(pegOut);
    byTransaction.set(pegOut.sidechainTxHash, events);
  }

  const receiptVerified: FrontierBackingPegOut[] = [];
  for (const [transactionHashHex, expectedEvents] of byTransaction) {
    const receipt = await input.client.getTransactionReceipt(
      `0x${transactionHashHex}`,
    );
    const observedEvents = pegOutsFromReceipt(
      receipt,
      input.bridgeAddress,
      transactionHashHex,
    );
    if (observedEvents.length !== expectedEvents.length) {
      throw new Error('Frontier backing scan and receipt event counts disagree');
    }
    const expectedJson = canonicalJson(
      canonicalSortedPegOuts(expectedEvents).map(pegOutJson),
    );
    const observedJson = canonicalJson(
      canonicalSortedPegOuts(observedEvents).map(pegOutJson),
    );
    if (expectedJson !== observedJson) {
      throw new Error('Frontier backing scan and receipt event semantics disagree');
    }
    for (const pegOut of observedEvents) {
      let canonicalBlockHashHex = input.blockHashCache.get(
        pegOut.sidechainBlockNumber,
      );
      if (canonicalBlockHashHex === undefined) {
        canonicalBlockHashHex = await readPinnedBlockHash(
          input.client,
          pegOut.sidechainBlockNumber,
        );
        input.blockHashCache.set(
          pegOut.sidechainBlockNumber,
          canonicalBlockHashHex,
        );
      }
      if (canonicalBlockHashHex !== pegOut.sidechainBlockHash) {
        throw new Error('Frontier backing receipt is not in the observed canonical block');
      }
      receiptVerified.push(pegOut);
    }
  }
  return Object.freeze(receiptVerified);
}

function pegOutsFromReceipt(
  value: unknown,
  expectedBridgeAddress: string,
  expectedTransactionHashHex: string,
): readonly FrontierBackingPegOut[] {
  const receipt = record(value, 'Frontier backing receipt');
  if (!receiptSucceeded(receipt.status)) {
    throw new Error('Frontier backing receipt status is not successful');
  }
  const transactionHashHex = fixedHex32(
    receipt.hash ?? receipt.transactionHash,
    'Frontier backing receipt transaction hash',
  );
  if (transactionHashHex !== expectedTransactionHashHex) {
    throw new Error('Frontier backing receipt transaction hash changed');
  }
  const blockNumber = rpcSafeInteger(
    receipt.blockNumber,
    'Frontier backing receipt block number',
  );
  const blockHashHex = fixedHex32(
    receipt.blockHash,
    'Frontier backing receipt block hash',
  );
  if (!Array.isArray(receipt.logs) || receipt.logs.length > MAX_RECEIPT_LOGS) {
    throw new Error('Frontier backing receipt log set exceeds its bound');
  }

  const pegOuts: FrontierBackingPegOut[] = [];
  for (const valueLog of receipt.logs) {
    const log = record(valueLog, 'Frontier backing receipt log');
    let address: string;
    try {
      address = canonicalAddress(log.address, 'Frontier backing log address');
    } catch {
      continue;
    }
    if (address !== expectedBridgeAddress) continue;
    if (
      !Array.isArray(log.topics)
      || typeof log.topics[0] !== 'string'
      || log.topics[0].toLowerCase() !== PEG_OUT_TOPIC
    ) {
      continue;
    }
    const logTransactionHashHex = fixedHex32(
      log.transactionHash,
      'Frontier backing log transaction hash',
    );
    const logBlockNumber = rpcSafeInteger(
      log.blockNumber,
      'Frontier backing log block number',
    );
    const logBlockHashHex = fixedHex32(
      log.blockHash,
      'Frontier backing log block hash',
    );
    if (
      logTransactionHashHex !== transactionHashHex
      || logBlockNumber !== blockNumber
      || logBlockHashHex !== blockHashHex
    ) {
      throw new Error('Frontier backing receipt and log identities disagree');
    }
    const logIndex = rpcSafeInteger(
      log.logIndex ?? log.index,
      'Frontier backing log index',
    );
    let parsed;
    try {
      parsed = PEG_OUT_INTERFACE.parseLog({
        topics: log.topics as string[],
        data: typeof log.data === 'string' ? log.data : '',
      });
    } catch {
      throw new Error('Frontier backing receipt contains an invalid PegOut log');
    }
    if (!parsed || parsed.name !== 'PegOut') {
      throw new Error('Frontier backing receipt contains an unsupported event');
    }
    pegOuts.push(Object.freeze({
      user: canonicalAddress(parsed.args[0], 'PegOut user'),
      amount: canonicalAmount(parsed.args[1]),
      ergoRecipientAddress: canonicalRecipient(parsed.args[2]),
      sidechainTxHash: transactionHashHex,
      sidechainBlockNumber: blockNumber,
      sidechainBlockHash: blockHashHex,
      sidechainLogIndex: logIndex,
    }));
  }
  return Object.freeze(pegOuts);
}

function canonicalPegOut(value: FrontierBackingPegOutLike): FrontierBackingPegOut {
  if (!value || typeof value !== 'object') {
    throw new Error('Frontier backing event must be an object');
  }
  return Object.freeze({
    user: canonicalAddress(value.user, 'PegOut user'),
    amount: canonicalAmount(value.amount),
    ergoRecipientAddress: canonicalRecipient(value.ergoRecipientAddress),
    sidechainTxHash: fixedHex32(
      value.sidechainTxHash,
      'PegOut transaction hash',
    ),
    sidechainBlockNumber: nonnegativeSafeInteger(
      value.sidechainBlockNumber,
      'PegOut block number',
    ),
    sidechainBlockHash: fixedHex32(
      value.sidechainBlockHash,
      'PegOut block hash',
    ),
    sidechainLogIndex: nonnegativeSafeInteger(
      value.sidechainLogIndex,
      'PegOut log index',
    ),
  });
}

function canonicalSortedPegOuts(
  values: readonly FrontierBackingPegOutLike[],
): readonly FrontierBackingPegOut[] {
  const pegOuts = values.map(canonicalPegOut);
  pegOuts.sort((left, right) =>
    left.sidechainBlockNumber - right.sidechainBlockNumber
    || left.sidechainLogIndex - right.sidechainLogIndex
    || left.sidechainTxHash.localeCompare(right.sidechainTxHash),
  );
  return Object.freeze(pegOuts);
}

function inventoryDigest(input: Readonly<{
  sidechainIdHex: string;
  bridgeAddress: string;
  pinnedHeight: number;
  pinnedBlockHashHex: string;
  pegOuts: readonly FrontierBackingPegOut[];
}>): string {
  return sha256CanonicalJson({
    sidechainIdHex: input.sidechainIdHex,
    bridgeAddress: input.bridgeAddress,
    scanFromHeight: 0,
    scanPageSize: BLOCK_PAGE_SIZE,
    pinnedHeight: input.pinnedHeight,
    pinnedBlockHashHex: input.pinnedBlockHashHex,
    pegOuts: input.pegOuts.map(pegOutJson),
  }, 'e2s.frontier-backing-inventory.v1');
}

function sourceViewDigest(input: Readonly<{
  sidechainIdHex: string;
  bridgeAddress: string;
  scanPageCount: number;
  pinnedHeight: number;
  pinnedBlockHashHex: string;
  totalSupplyNanoErg: bigint;
  runtimeIdentityDigestHex: string;
  inventoryDigestHex: string;
}>): string {
  return sha256CanonicalJson({
    sidechainIdHex: input.sidechainIdHex,
    bridgeAddress: input.bridgeAddress,
    scanFromHeight: 0,
    scanPageSize: BLOCK_PAGE_SIZE,
    scanPageCount: input.scanPageCount,
    pinnedHeight: input.pinnedHeight,
    pinnedBlockHashHex: input.pinnedBlockHashHex,
    totalSupplyNanoErg: input.totalSupplyNanoErg.toString(),
    runtimeIdentityDigestHex: input.runtimeIdentityDigestHex,
    inventoryDigestHex: input.inventoryDigestHex,
  }, 'e2s.frontier-backing-source-view.v1');
}

function pegOutJson(pegOut: FrontierBackingPegOut): Readonly<{
  user: string;
  amountNanoErg: string;
  ergoRecipientAddress: string;
  sidechainTxHash: string;
  sidechainBlockNumber: number;
  sidechainBlockHash: string;
  sidechainLogIndex: number;
}> {
  return {
    user: pegOut.user,
    amountNanoErg: pegOut.amount.toString(),
    ergoRecipientAddress: pegOut.ergoRecipientAddress,
    sidechainTxHash: pegOut.sidechainTxHash,
    sidechainBlockNumber: pegOut.sidechainBlockNumber,
    sidechainBlockHash: pegOut.sidechainBlockHash,
    sidechainLogIndex: pegOut.sidechainLogIndex,
  };
}

function sourceId(input: Readonly<{
  origin: string;
  nodeIdentityDigestHex: string;
  administrationIdentityDigestHex: string;
  runtimeIdentityProfileDigestHex: string;
}>): string {
  return sha256CanonicalJson({
    schema: 'e2s.frontier-backing-source.v1',
    ...input,
  });
}

function canonicalExpectedRuntimeIdentity(input: Readonly<{
  chainId: string;
  bridgeAddress: string;
  bridgeCodeHashHex: string;
  sergAddress: string;
  sergCodeHashHex: string;
}>): ExpectedFrontierBackingRuntimeIdentity {
  const chainId = canonicalPositiveDecimal(input.chainId, 'Frontier chain ID');
  const bridgeAddress = canonicalAddress(input.bridgeAddress, 'bridge address');
  const bridgeCodeHashHex = fixedHex32(
    input.bridgeCodeHashHex,
    'reviewed bridge code hash',
  );
  const sergAddress = canonicalAddress(input.sergAddress, 'sERG address');
  const sergCodeHashHex = fixedHex32(
    input.sergCodeHashHex,
    'reviewed sERG code hash',
  );
  const profile = {
    chainId,
    bridgeAddress,
    bridgeCodeHashHex,
    sergAddress,
    sergCodeHashHex,
  };
  return Object.freeze({
    ...profile,
    profileDigestHex: sha256CanonicalJson(
      profile,
      'e2s.frontier-backing-runtime-identity-profile.v1',
    ),
  });
}

function validateRuntimeIdentity(
  expected: ExpectedFrontierBackingRuntimeIdentity,
  observed: Readonly<FrontierBackingRuntimeIdentity>,
): string {
  const chainId = canonicalPositiveDecimal(
    observed.chainId,
    'observed Frontier chain ID',
  );
  const bridgeCodeHashHex = fixedHex32(
    observed.bridgeCodeHashHex,
    'observed bridge code hash',
  );
  const sergAddress = canonicalAddress(
    observed.sergAddress,
    'observed sERG address',
  );
  const sergCodeHashHex = fixedHex32(
    observed.sergCodeHashHex,
    'observed sERG code hash',
  );
  const sergOwnerAddress = canonicalAddress(
    observed.sergOwnerAddress,
    'observed sERG owner address',
    true,
  );
  if (
    chainId !== expected.chainId
    || bridgeCodeHashHex !== expected.bridgeCodeHashHex
    || sergAddress !== expected.sergAddress
    || sergCodeHashHex !== expected.sergCodeHashHex
  ) {
    throw new Error(
      'Frontier backing runtime identity does not match the reviewed profile',
    );
  }
  return sha256CanonicalJson({
    profileDigestHex: expected.profileDigestHex,
    chainId,
    bridgeAddress: expected.bridgeAddress,
    bridgeCodeHashHex,
    sergAddress,
    sergCodeHashHex,
    sergOwnerAddress,
  }, 'e2s.frontier-backing-runtime-identity.v1');
}

function pairBinding(sources: unknown): PairBinding {
  if (!sources || typeof sources !== 'object') {
    throw new Error('Frontier backing read-agreement source provenance is missing');
  }
  const binding = PAIR_BINDINGS.get(sources);
  if (!binding) {
    throw new Error('Frontier backing read-agreement source provenance is missing');
  }
  return binding;
}

async function readPinnedBlockHash(
  client: FrontierBackingReadClient,
  expectedHeight: number,
): Promise<string> {
  const block = await client.getBlock(expectedHeight);
  if (block === null) {
    throw new Error('Frontier backing pinned block is unavailable');
  }
  if (
    nonnegativeSafeInteger(block.number, 'Frontier backing block number')
    !== expectedHeight
  ) {
    throw new Error('Frontier backing block number does not match its request');
  }
  return fixedHex32(block.hash, 'Frontier backing block hash');
}

async function readCurrentTipHeight(
  client: FrontierBackingReadClient,
): Promise<number> {
  return nonnegativeSafeInteger(
    await client.getCurrentBlockNumber(),
    'Frontier backing reader tip',
  );
}

function readerTipWindow(
  primaryTipHeight: number,
  witnessTipHeight: number,
): Readonly<{ floor: number; ceiling: number }> {
  const primary = nonnegativeSafeInteger(
    primaryTipHeight,
    'primary Frontier backing reader tip',
  );
  const witness = nonnegativeSafeInteger(
    witnessTipHeight,
    'witness Frontier backing reader tip',
  );
  const floor = Math.min(primary, witness);
  const ceiling = Math.max(primary, witness);
  if (ceiling - floor > FRONTIER_BACKING_MAX_READER_TIP_LAG_BLOCKS) {
    throw new Error('Frontier backing reader tips exceed the allowed lag');
  }
  return Object.freeze({ floor, ceiling });
}

function pageCount(pinnedHeight: number): number {
  return Math.floor(
    nonnegativeSafeInteger(pinnedHeight, 'Frontier backing pinned height')
      / BLOCK_PAGE_SIZE,
  ) + 1;
}

function canonicalSupply(value: bigint): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > MAX_SIGNED_LONG) {
    throw new Error('sERG supply must be a nonnegative signed Long');
  }
  return value;
}

function canonicalAmount(value: unknown): bigint {
  let amount: bigint;
  try {
    amount = typeof value === 'bigint' ? value : BigInt(String(value));
  } catch {
    throw new Error('PegOut amount must be an integer');
  }
  if (amount < MINIMUM_PEG_OUT_NANOERG || amount > MAX_SIGNED_LONG) {
    throw new Error('PegOut amount is outside the native-ERG V1 range');
  }
  return amount;
}

function canonicalRecipient(value: unknown): string {
  if (typeof value !== 'string') throw new Error('PegOut recipient must be hex');
  const clean = value.replace(/^0x/i, '').toLowerCase();
  const compressed = clean.length === 66 && /^(02|03)/.test(clean);
  const p2pk = clean.length === 72 && /^(0008cd02|0008cd03)/.test(clean);
  if (!/^[0-9a-f]+$/.test(clean) || (!compressed && !p2pk)) {
    throw new Error('PegOut recipient must be a compressed key or P2PK ErgoTree');
  }
  return clean;
}

function canonicalAddress(
  value: unknown,
  label: string,
  allowZero = false,
): string {
  if (typeof value !== 'string') throw new Error(`${label} must be an EVM address`);
  let address: string;
  try {
    address = getAddress(value).toLowerCase();
  } catch {
    throw new Error(`${label} must be an EVM address`);
  }
  if (!allowZero && address === `0x${'00'.repeat(20)}`) {
    throw new Error(`${label} must not be zero`);
  }
  return address;
}

function canonicalPositiveDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal`);
  }
  return BigInt(value).toString();
}

function fixedHex32(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  return clean;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function rpcSafeInteger(value: unknown, label: string): number {
  let parsed: bigint;
  try {
    if (typeof value === 'bigint') parsed = value;
    else if (typeof value === 'number' && Number.isInteger(value)) parsed = BigInt(value);
    else if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) parsed = BigInt(value);
    else if (typeof value === 'string' && /^[0-9]+$/.test(value)) parsed = BigInt(value);
    else throw new Error('invalid');
  } catch {
    throw new Error(`${label} must be an integer`);
  }
  const number = Number(parsed);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return number;
}

function receiptSucceeded(value: unknown): boolean {
  if (value === 1 || value === 1n) return true;
  return typeof value === 'string'
    && (value.toLowerCase() === '0x1' || value === '1');
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
