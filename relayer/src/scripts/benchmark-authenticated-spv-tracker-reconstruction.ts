import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

import {
  reconstructAuthenticatedSpvTrackerHistory,
  type AuthenticatedSpvTrackerChainSource,
} from '../authenticated-spv-tracker-reconstruction.js';
import {
  BRIDGE_EXTENSION_KEY_HEX,
  buildBridgeCheckpointCommitmentV1,
} from '../bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from '../bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from '../bridge-finality-proof.js';
import { buildErgoExtensionMembershipProof } from '../ergo-extension-membership.js';
import { buildAuthenticatedSpvAdmission } from '../spv-tracker-authenticated.js';

const DEFAULT_TRANSITIONS = 256;
const MAX_TRANSITIONS = 1_024;
const SIDECHAIN_ID = '11'.repeat(32);
const TRACKER_NFT_ID = '12'.repeat(32);
const TRACKER_TREE = `1008cd02${'13'.repeat(32)}`;
const FINALITY_ATTESTOR =
  '08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

interface BenchmarkFixture {
  source: AuthenticatedSpvTrackerChainSource;
  expectedTipBoxId: string;
  expectedTipDigestHex: string;
  avlProofBytes: number;
  maxAvlProofBytes: number;
  transitionCount: number;
}

function parseTransitionCount(argv: string[]): number {
  const flagIndex = argv.indexOf('--entries');
  const raw = flagIndex === -1 ? DEFAULT_TRANSITIONS : argv[flagIndex + 1];
  const count = Number(raw);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_TRANSITIONS) {
    throw new Error(`--entries must be an integer between 1 and ${MAX_TRANSITIONS}`);
  }
  return count;
}

function fixtureId(label: string, index: number): string {
  return createHash('sha256').update(`${label}:${index}`, 'ascii').digest('hex');
}

function buildFinalityCommitment(
  checkpoint: ReturnType<typeof buildBridgeCheckpointCommitmentV1>,
  index: number,
) {
  const statement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: fixtureId('trusted-anchor', index),
    finalityHorizonHeight: 10_000 + index,
    finalityHorizonHashHex: fixtureId('finality-horizon', index),
  });
  const proof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: fixtureId('verifier-profile', index),
    encodedStatement: statement.encodedStatementHex,
    payload: Buffer.from(`tracker-reconstruction-proof:${index}`, 'ascii'),
  });
  return buildAggregateFinalityCommitmentV1(proof);
}

function buildFixture(transitionCount: number): BenchmarkFixture {
  const boxes: any[] = [];
  const transactions = new Map<string, any>();
  const headers = new Map<string, any>();
  const history: Array<{ key: string; value: string }> = [];
  let avlProofBytes = 0;
  let maxAvlProofBytes = 0;
  let currentBox: any = {
    boxId: fixtureId('tracker-box', 0),
    transactionId: fixtureId('tracker-creation', 0),
    index: 0,
    inclusionHeight: 90,
    globalIndex: 1_000,
    ergoTree: TRACKER_TREE,
    assets: [{ tokenId: TRACKER_NFT_ID, amount: 1 }],
    additionalRegisters: {},
    spentTransactionId: null,
    spendingProof: null,
  };
  let expectedTipDigestHex = '';

  for (let index = 0; index < transitionCount; index++) {
    const sidechainHeight = 1_024 + index;
    const transactionHeight = 100 + index;
    const checkpoint = buildBridgeCheckpointCommitmentV1({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainHeight,
      sidechainConsensusBlockHashHex: fixtureId('consensus-block', index),
      executionBlockHashHex: fixtureId('execution-block', index),
      bridgeEventRootHex: fixtureId('bridge-event-root', index),
      burnLeafCount: 1,
      finalityAuthoritySetId: 7,
      finalityAuthoritySetHashHex: fixtureId('authority-set', index),
      finalityProofHashHex: fixtureId('finality-proof', index),
    });
    const membership = buildErgoExtensionMembershipProof([
      { key: Buffer.from('0100', 'hex'), value: Buffer.from(fixtureId('extension-extra', index), 'hex') },
      {
        key: Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
        value: Buffer.from(checkpoint.extensionValueHex, 'hex'),
      },
    ], Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'));
    const plan = buildAuthenticatedSpvAdmission({
      encodedCheckpointHex: checkpoint.encodedCheckpointHex,
      aggregateFinalityCommitmentHex: buildFinalityCommitment(checkpoint, index).encodedCommitmentHex,
      extensionProofHex: membership.proof.toString('hex'),
      anchorHeader: {
        idHex: fixtureId('anchor-header', index),
        height: transactionHeight - 2,
        extensionRootHex: membership.root.toString('hex'),
        contextIndex: 1,
      },
      approvedSidechainIdHex: SIDECHAIN_ID,
      history,
      currentCounter: index,
      currentLatestSidechainHeight: index === 0 ? 0 : sidechainHeight - 1,
      currentStampHeight: index === 0 ? 90 : transactionHeight - 1,
      currentErgoHeight: transactionHeight,
      finalityAttestorSigmaPropRegisterHex: FINALITY_ATTESTOR,
    });
    if (index === 0) {
      currentBox.additionalRegisters = { ...plan.inputRegisters };
    } else if (JSON.stringify(currentBox.additionalRegisters) !== JSON.stringify(plan.inputRegisters)) {
      throw new Error(`generated tracker input registers diverged at transition ${index}`);
    }

    const transactionId = fixtureId('admission-transaction', index);
    const transactionHeaderId = fixtureId('admission-header', index);
    const parentHeaderId = fixtureId('admission-parent', index);
    const anchorHeaderId = plan.anchorHeader.idHex;
    const spendingProof = { proofBytes: '', extension: { ...plan.contextExtension } };
    currentBox.spentTransactionId = transactionId;
    currentBox.spendingProof = spendingProof;
    const successor = {
      boxId: fixtureId('tracker-box', index + 1),
      transactionId,
      index: 0,
      inclusionHeight: transactionHeight,
      globalIndex: 1_001 + index,
      ergoTree: TRACKER_TREE,
      assets: [{ tokenId: TRACKER_NFT_ID, amount: 1 }],
      additionalRegisters: { ...plan.successorRegisters },
      spentTransactionId: null,
      spendingProof: null,
    };
    transactions.set(transactionId, {
      id: transactionId,
      blockId: transactionHeaderId,
      inclusionHeight: transactionHeight,
      inputs: [{ ...currentBox, spendingProof }],
      outputs: [{ ...successor }],
    });
    headers.set(transactionHeaderId, {
      id: transactionHeaderId,
      parentId: parentHeaderId,
      height: transactionHeight,
      extensionHash: fixtureId('transaction-extension', index),
    });
    headers.set(parentHeaderId, {
      id: parentHeaderId,
      parentId: anchorHeaderId,
      height: transactionHeight - 1,
      extensionHash: fixtureId('parent-extension', index),
    });
    headers.set(anchorHeaderId, {
      id: anchorHeaderId,
      parentId: fixtureId('anchor-parent', index),
      height: transactionHeight - 2,
      extensionHash: membership.root.toString('hex'),
    });
    boxes.push(currentBox);
    currentBox = successor;
    history.push({ key: plan.trackerKeyHex, value: plan.trackerValueHex });
    expectedTipDigestHex = plan.successorDigestHex;
    const proofBytes = plan.avlInsertProofHex.length / 2;
    avlProofBytes += proofBytes;
    maxAvlProofBytes = Math.max(maxAvlProofBytes, proofBytes);
  }

  boxes.push(currentBox);
  const bestHeight = 100 + transitionCount + 20;
  const bestHeader = {
    id: fixtureId('best-header', transitionCount),
    parentId: fixtureId('best-parent', transitionCount),
    height: bestHeight,
    extensionHash: fixtureId('best-extension', transitionCount),
  };
  const source: AuthenticatedSpvTrackerChainSource = {
    getIndexedHeight: async () => ({ indexedHeight: bestHeight, fullHeight: bestHeight }),
    getBestHeader: async () => bestHeader,
    getIndexedBoxesByTokenId: async () => [...boxes].reverse(),
    getTransaction: async (transactionId: string) => transactions.get(transactionId) ?? null,
    getBlockHeaderById: async (headerId: string) => headers.get(headerId) ?? null,
    getBoxByIdOrNull: async (boxId: string) => boxId === currentBox.boxId ? currentBox : null,
  };
  return {
    source,
    expectedTipBoxId: currentBox.boxId,
    expectedTipDigestHex,
    avlProofBytes,
    maxAvlProofBytes,
    transitionCount,
  };
}

async function main(): Promise<void> {
  const transitionCount = parseTransitionCount(process.argv.slice(2));
  const wasmBytes = readFileSync(fileURLToPath(new URL(
    '../../../wasm-avl/pkg/bridge_avl_bg.wasm',
    import.meta.url,
  )));
  const wasmSha256 = createHash('sha256').update(wasmBytes).digest('hex');
  const setupStarted = performance.now();
  const fixture = buildFixture(transitionCount);
  const setupMs = performance.now() - setupStarted;

  const replayStarted = performance.now();
  const reconstruction = await reconstructAuthenticatedSpvTrackerHistory({
    source: fixture.source,
    trackerNftIdHex: TRACKER_NFT_ID,
    trackerErgoTreeHex: TRACKER_TREE,
    expectedSidechainIdHex: SIDECHAIN_ID,
  });
  const replayMs = performance.now() - replayStarted;
  if (
    reconstruction.entries.length !== fixture.transitionCount
    || reconstruction.tipBoxId !== fixture.expectedTipBoxId
    || reconstruction.tipDigestHex !== fixture.expectedTipDigestHex
  ) {
    throw new Error('reconstruction benchmark did not reproduce the exact tracker tip');
  }

  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    transitionCount,
    lineageBoxCount: transitionCount + 1,
    avlProofBytes: fixture.avlProofBytes,
    maxAvlProofBytes: fixture.maxAvlProofBytes,
    fixtureGenerationMs: Number(setupMs.toFixed(3)),
    exactReconstructionMs: Number(replayMs.toFixed(3)),
    transitionsPerSecond: Number((transitionCount / (replayMs / 1_000)).toFixed(3)),
    exactProofReplay: true,
    finalTipMatched: true,
    wasmSha256,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    benchmarkBoundary: 'synthetic-chain-source-no-network-no-db-no-sign-no-submit',
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
