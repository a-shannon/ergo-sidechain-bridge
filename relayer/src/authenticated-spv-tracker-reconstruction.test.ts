import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('./authenticated-settlement-candidate.js', () => ({
  assertNativeVerifiedAuthenticatedSettlementCandidateProvenance: vi.fn(),
}));
vi.mock('./authenticated-settlement-jvm-check.js', () => ({
  assertAuthenticatedSettlementJvmCheckAcceptanceProvenance: vi.fn(),
}));

import {
  AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES,
  isAuthenticatedSpvTrackerTipCurrent,
  isAuthenticatedSpvTrackerTipCurrentOnIndependentSources,
  observeAuthenticatedSpvTrackerTipCurrentOnIndependentSources,
  reconstructAuthenticatedSpvTrackerHistory,
  reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources,
  type AuthenticatedSpvTrackerChainSource,
} from './authenticated-spv-tracker-reconstruction.js';
import {
  AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
} from './authenticated-settlement-candidate-schema.js';
import {
  BRIDGE_EXTENSION_KEY_HEX,
  buildBridgeCheckpointCommitmentV1,
} from './bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import { buildErgoExtensionMembershipProof } from './ergo-extension-membership.js';
import { decodeCollByteRegister, encodeCollByteRegister } from './ergo-encoding.js';
import {
  AUTHENTICATED_SPV_TRACKER_MAX_PROOF_BUNDLE_BYTES,
  buildAuthenticatedSpvAdmission,
} from './spv-tracker-authenticated.js';
import { StateTracker, type AuthenticatedSettlementCandidateInput } from './state-tracker.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';

const SIDECHAIN_ID = '11'.repeat(32);
const TRACKER_NFT_ID = '12'.repeat(32);
const TRACKER_TREE = `1008cd02${'13'.repeat(32)}`;
const FINALITY_ATTESTOR =
  '08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const GENESIS_BOX_ID = '21'.repeat(32);
const TIP_BOX_ID = '22'.repeat(32);
const GENESIS_TX_ID = '31'.repeat(32);
const ADMISSION_TX_ID = '32'.repeat(32);
const ANCHOR_HEADER_ID = '41'.repeat(32);
const PARENT_HEADER_ID = '42'.repeat(32);
const ADMISSION_HEADER_ID = '43'.repeat(32);
const BEST_HEADER_ID = '44'.repeat(32);

type MutableFixture = ReturnType<typeof trackerFixture>;

function finalityCommitmentFor(checkpoint: ReturnType<typeof buildBridgeCheckpointCommitmentV1>) {
  const statement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: '51'.repeat(32),
    finalityHorizonHeight: 1_024,
    finalityHorizonHashHex: '52'.repeat(32),
  });
  const proof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: '53'.repeat(32),
    encodedStatement: statement.encodedStatementHex,
    payload: Buffer.from('tracker-reconstruction-proof', 'ascii'),
  });
  return buildAggregateFinalityCommitmentV1(proof);
}

function trackerFixture() {
  const checkpoint = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainHeight: 1_024,
    sidechainConsensusBlockHashHex: '61'.repeat(32),
    executionBlockHashHex: '62'.repeat(32),
    bridgeEventRootHex: '63'.repeat(32),
    burnLeafCount: 1,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: '64'.repeat(32),
    finalityProofHashHex: '65'.repeat(32),
  });
  const membership = buildErgoExtensionMembershipProof([
    { key: Buffer.from('0100', 'hex'), value: Buffer.alloc(32, 0x01) },
    {
      key: Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
      value: Buffer.from(checkpoint.extensionValueHex, 'hex'),
    },
  ], Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'));
  const plan = buildAuthenticatedSpvAdmission({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    aggregateFinalityCommitmentHex: finalityCommitmentFor(checkpoint).encodedCommitmentHex,
    extensionProofHex: membership.proof.toString('hex'),
    anchorHeader: {
      idHex: ANCHOR_HEADER_ID,
      height: 98,
      extensionRootHex: membership.root.toString('hex'),
      contextIndex: 1,
    },
    approvedSidechainIdHex: SIDECHAIN_ID,
    history: [],
    currentCounter: 0,
    currentLatestSidechainHeight: 0,
    currentStampHeight: 90,
    currentErgoHeight: 100,
    finalityAttestorSigmaPropRegisterHex: FINALITY_ATTESTOR,
  });
  const spendingProof = { proofBytes: '', extension: { ...plan.contextExtension } };
  const genesisBox = {
    boxId: GENESIS_BOX_ID,
    transactionId: GENESIS_TX_ID,
    index: 0,
    inclusionHeight: 90,
    globalIndex: 10,
    ergoTree: TRACKER_TREE,
    assets: [{ tokenId: TRACKER_NFT_ID, amount: 1 }],
    additionalRegisters: { ...plan.inputRegisters },
    spentTransactionId: ADMISSION_TX_ID,
    spendingProof,
  };
  const tipBox = {
    boxId: TIP_BOX_ID,
    transactionId: ADMISSION_TX_ID,
    index: 0,
    inclusionHeight: 100,
    globalIndex: 11,
    ergoTree: TRACKER_TREE,
    assets: [{ tokenId: TRACKER_NFT_ID, amount: 1 }],
    additionalRegisters: { ...plan.successorRegisters },
    spentTransactionId: null,
    spendingProof: null,
  };
  const transaction = {
    id: ADMISSION_TX_ID,
    blockId: ADMISSION_HEADER_ID,
    inclusionHeight: 100,
    inputs: [{ ...genesisBox }],
    outputs: [{ ...tipBox }],
  };
  const headers = new Map([
    [ADMISSION_HEADER_ID, {
      id: ADMISSION_HEADER_ID,
      parentId: PARENT_HEADER_ID,
      height: 100,
      extensionHash: '71'.repeat(32),
    }],
    [PARENT_HEADER_ID, {
      id: PARENT_HEADER_ID,
      parentId: ANCHOR_HEADER_ID,
      height: 99,
      extensionHash: '72'.repeat(32),
    }],
    [ANCHOR_HEADER_ID, {
      id: ANCHOR_HEADER_ID,
      parentId: '40'.repeat(32),
      height: 98,
      extensionHash: membership.root.toString('hex'),
    }],
  ]);
  const bestHeaders = [{
    id: BEST_HEADER_ID,
    parentId: '45'.repeat(32),
    height: 120,
    extensionHash: '73'.repeat(32),
  }];
  const indexProgress = [{ indexedHeight: 120, fullHeight: 120 }];
  const unspentById = new Map<string, any>([[TIP_BOX_ID, tipBox]]);
  const source: AuthenticatedSpvTrackerChainSource = {
    getIndexedHeight: vi.fn(async () => indexProgress[0]),
    getBestHeader: vi.fn(async () => bestHeaders[0]),
    getIndexedBoxesByTokenId: vi.fn(async () => [tipBox, genesisBox]),
    getTransaction: vi.fn(async (txId: string) => txId === ADMISSION_TX_ID ? transaction : null),
    getBlockHeaderById: vi.fn(async (headerId: string) => headers.get(headerId) ?? null),
    getBoxByIdOrNull: vi.fn(async (boxId: string) => unspentById.get(boxId) ?? null),
  };
  return {
    checkpoint,
    genesisBox,
    tipBox,
    transaction,
    headers,
    bestHeaders,
    indexProgress,
    unspentById,
    plan,
    source,
  };
}

async function reconstruct(fixture: MutableFixture) {
  return reconstructAuthenticatedSpvTrackerHistory({
    source: fixture.source,
    trackerNftIdHex: TRACKER_NFT_ID,
    trackerErgoTreeHex: TRACKER_TREE,
    expectedSidechainIdHex: SIDECHAIN_ID,
    expectedGenesisBoxIdHex: GENESIS_BOX_ID,
  });
}

async function reconstructIndependently(
  primary: MutableFixture,
  witness: MutableFixture = trackerFixture(),
) {
  return reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources({
    primarySource: primary.source,
    witnessSource: witness.source,
    trackerNftIdHex: TRACKER_NFT_ID,
    trackerErgoTreeHex: TRACKER_TREE,
    expectedSidechainIdHex: SIDECHAIN_ID,
    expectedGenesisBoxIdHex: GENESIS_BOX_ID,
  });
}

async function currentTip(fixture: MutableFixture) {
  return isAuthenticatedSpvTrackerTipCurrent({
    source: fixture.source,
    trackerNftIdHex: TRACKER_NFT_ID,
    trackerErgoTreeHex: TRACKER_TREE,
    expectedSidechainIdHex: SIDECHAIN_ID,
    expectedTipBoxId: TIP_BOX_ID,
    expectedTipDigestHex: fixture.plan.successorDigestHex,
  });
}

describe('authenticated SPV tracker chain reconstruction', () => {
  it('replays an out-of-order singleton lineage into the exact authenticated history', async () => {
    const fixture = trackerFixture();
    const result = await reconstruct(fixture);

    expect(result).toEqual(expect.objectContaining({
      sidechainIdHex: SIDECHAIN_ID,
      trackerNftIdHex: TRACKER_NFT_ID,
      genesisBoxId: GENESIS_BOX_ID,
      finalityAttestorSigmaPropRegisterHex: FINALITY_ATTESTOR,
      tipBoxId: TIP_BOX_ID,
      tipDigestHex: fixture.plan.successorDigestHex,
      observationDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      observedTip: {
        idHex: BEST_HEADER_ID,
        parentIdHex: '45'.repeat(32),
        height: 120,
        extensionRootHex: '73'.repeat(32),
      },
    }));
    expect(result.entries).toEqual([{
      keyHex: fixture.plan.trackerKeyHex,
      valueHex: fixture.plan.trackerValueHex,
      encodedCheckpointHex: fixture.checkpoint.encodedCheckpointHex,
      sidechainId: SIDECHAIN_ID,
      sidechainHeight: 1_024n,
      executionBlockHash: fixture.checkpoint.checkpoint.executionBlockHashHex,
      bridgeEventRoot: fixture.checkpoint.checkpoint.bridgeEventRootHex,
      checkpointCommitment: fixture.checkpoint.checkpointCommitmentHex,
      anchorHeaderId: ANCHOR_HEADER_ID,
      anchorHeaderHeight: 98,
    }]);
    expect(fixture.source.getBestHeader).toHaveBeenCalledTimes(2);
    expect(fixture.source.getIndexedHeight).toHaveBeenCalledTimes(2);
    expect(fixture.source.getBoxByIdOrNull).toHaveBeenCalledWith(TIP_BOX_ID);
    expect(fixture.source.getTransaction).toHaveBeenCalledWith(ADMISSION_TX_ID);
  });

  it('requires two independent observations to reconstruct the same lineage and snapshot', async () => {
    const primary = trackerFixture();
    const witness = trackerFixture();
    const result = await reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources({
      primarySource: primary.source,
      witnessSource: witness.source,
      trackerNftIdHex: TRACKER_NFT_ID,
      trackerErgoTreeHex: TRACKER_TREE,
      expectedSidechainIdHex: SIDECHAIN_ID,
      expectedGenesisBoxIdHex: GENESIS_BOX_ID,
    });

    expect(result.tipBoxId).toBe(TIP_BOX_ID);
    expect(result.tipDigestHex).toBe(primary.plan.successorDigestHex);
    await expect(reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources({
      primarySource: primary.source,
      witnessSource: primary.source,
      trackerNftIdHex: TRACKER_NFT_ID,
      trackerErgoTreeHex: TRACKER_TREE,
      expectedSidechainIdHex: SIDECHAIN_ID,
      expectedGenesisBoxIdHex: GENESIS_BOX_ID,
    })).rejects.toThrow(/two independent source instances/i);
  });

  it.each([
    ['header ID', (fixture: MutableFixture) => {
      fixture.bestHeaders[0] = { ...fixture.bestHeaders[0], id: 'fe'.repeat(32) };
    }],
    ['parent ID', (fixture: MutableFixture) => {
      fixture.bestHeaders[0] = { ...fixture.bestHeaders[0], parentId: 'fe'.repeat(32) };
    }],
    ['extension root', (fixture: MutableFixture) => {
      fixture.bestHeaders[0] = { ...fixture.bestHeaders[0], extensionHash: 'fe'.repeat(32) };
    }],
  ])('fails closed when independent observations disagree on their canonical snapshot %s', async (_label, mutate) => {
    const primary = trackerFixture();
    const witness = trackerFixture();
    mutate(witness);

    await expect(reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources({
      primarySource: primary.source,
      witnessSource: witness.source,
      trackerNftIdHex: TRACKER_NFT_ID,
      trackerErgoTreeHex: TRACKER_TREE,
      expectedSidechainIdHex: SIDECHAIN_ID,
      expectedGenesisBoxIdHex: GENESIS_BOX_ID,
    })).rejects.toThrow(/independent Ergo observations disagree/i);
  });

  it('waits for both bounded reconstruction sessions to close when either source fails', async () => {
    const primary = trackerFixture();
    const witness = trackerFixture();
    primary.source.beginAuthenticatedTrackerReconstruction = vi.fn();
    primary.source.endAuthenticatedTrackerReconstruction = vi.fn();
    witness.source.beginAuthenticatedTrackerReconstruction = vi.fn();
    witness.source.endAuthenticatedTrackerReconstruction = vi.fn();
    (primary.source.getIndexedBoxesByTokenId as any)
      .mockRejectedValue(new Error('primary observation failed'));
    (witness.source.getIndexedBoxesByTokenId as any).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return [witness.tipBox, witness.genesisBox];
    });

    await expect(reconstructIndependently(primary, witness))
      .rejects.toThrow(/primary observation failed/i);
    expect(primary.source.endAuthenticatedTrackerReconstruction).toHaveBeenCalledTimes(1);
    expect(witness.source.endAuthenticatedTrackerReconstruction).toHaveBeenCalledTimes(1);
  });

  it('rejects a lineage that does not start at the expected provisioned genesis', async () => {
    const fixture = trackerFixture();
    await expect(reconstructAuthenticatedSpvTrackerHistory({
      source: fixture.source,
      trackerNftIdHex: TRACKER_NFT_ID,
      trackerErgoTreeHex: TRACKER_TREE,
      expectedSidechainIdHex: SIDECHAIN_ID,
      expectedGenesisBoxIdHex: 'ff'.repeat(32),
    })).rejects.toThrow(/expected genesis box/i);
  });

  it('rejects tracker boxes carrying any asset beyond the exact singleton NFT', async () => {
    const fixture = trackerFixture();
    fixture.tipBox.assets.push({ tokenId: 'ff'.repeat(32), amount: 1 });
    await expect(reconstruct(fixture)).rejects.toThrow(/exactly one tracker NFT/i);
  });

  it('scopes a paired source budget around success and fail-closed reconstruction', async () => {
    const accepted = trackerFixture();
    accepted.source.beginAuthenticatedTrackerReconstruction = vi.fn();
    accepted.source.endAuthenticatedTrackerReconstruction = vi.fn();
    await expect(reconstruct(accepted)).resolves.toEqual(expect.objectContaining({
      genesisBoxId: GENESIS_BOX_ID,
      tipBoxId: TIP_BOX_ID,
    }));
    expect(accepted.source.beginAuthenticatedTrackerReconstruction).toHaveBeenCalledTimes(1);
    expect(accepted.source.endAuthenticatedTrackerReconstruction).toHaveBeenCalledTimes(1);

    const rejected = trackerFixture();
    rejected.source.beginAuthenticatedTrackerReconstruction = vi.fn();
    rejected.source.endAuthenticatedTrackerReconstruction = vi.fn();
    rejected.genesisBox.additionalRegisters.R4 = rejected.plan.successorRegisters.R4;
    await expect(reconstruct(rejected)).rejects.toThrow(/genesis counter must be zero/i);
    expect(rejected.source.beginAuthenticatedTrackerReconstruction).toHaveBeenCalledTimes(1);
    expect(rejected.source.endAuthenticatedTrackerReconstruction).toHaveBeenCalledTimes(1);

    const unpaired = trackerFixture();
    unpaired.source.beginAuthenticatedTrackerReconstruction = vi.fn();
    await expect(reconstruct(unpaired)).rejects.toThrow(/budget hooks must be paired/i);
  });

  it('fails closed when independent observations disagree on an intermediate lineage field', async () => {
    const primary = trackerFixture();
    const witness = trackerFixture();
    witness.genesisBox.inclusionHeight -= 1;

    await expect(reconstructIndependently(primary, witness)).rejects.toThrow(
      /independent Ergo observations disagree/i,
    );
  });

  it.each([
    ['two unspent singleton tips', (f: MutableFixture) => {
      f.genesisBox.spentTransactionId = null as any;
      f.genesisBox.spendingProof = null as any;
    }, /exactly one unspent/i],
    ['a missing singleton successor', (f: MutableFixture) => {
      f.genesisBox.spentTransactionId = 'aa'.repeat(32);
    }, /successor.*missing/i],
    ['a duplicate singleton box', (f: MutableFixture) => {
      (f.source.getIndexedBoxesByTokenId as any).mockResolvedValue([
        f.tipBox,
        f.genesisBox,
        { ...f.tipBox },
      ]);
    }, /duplicate tracker box/i],
    ['a lineage above the operational reconstruction bound', (f: MutableFixture) => {
      (f.source.getIndexedBoxesByTokenId as any).mockResolvedValue(
        new Array(AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES + 1).fill(f.genesisBox),
      );
    }, /operational bound/i],
    ['a disconnected singleton cycle', (f: MutableFixture) => {
      const first = {
        ...f.genesisBox,
        boxId: '91'.repeat(32),
        transactionId: '92'.repeat(32),
        spentTransactionId: '94'.repeat(32),
      };
      const second = {
        ...f.genesisBox,
        boxId: '93'.repeat(32),
        transactionId: '94'.repeat(32),
        spentTransactionId: '92'.repeat(32),
      };
      (f.source.getIndexedBoxesByTokenId as any).mockResolvedValue([
        f.tipBox,
        f.genesisBox,
        first,
        second,
      ]);
    }, /lineage is disconnected/i],
    ['a nonzero genesis counter', (f: MutableFixture) => {
      f.genesisBox.additionalRegisters.R4 = f.plan.successorRegisters.R4;
    }, /genesis counter must be zero/i],
    ['a nonempty genesis AVL digest', (f: MutableFixture) => {
      f.genesisBox.additionalRegisters.R5 = f.plan.successorRegisters.R5;
    }, /genesis AVL digest must be empty/i],
    ['a genesis sidechain mismatch', (f: MutableFixture) => {
      f.genesisBox.additionalRegisters.R6 = encodeCollByteRegister(Buffer.alloc(32, 0xff));
    }, /genesis sidechain id does not match/i],
    ['a nonzero genesis sidechain height', (f: MutableFixture) => {
      f.genesisBox.additionalRegisters.R7 = f.plan.successorRegisters.R7;
    }, /genesis sidechain height must be zero/i],
    ['a malformed genesis finality authority', (f: MutableFixture) => {
      f.genesisBox.additionalRegisters.R9 = f.plan.inputRegisters.R8;
    }, /genesis R9|SigmaProp|DLog/i],
    ['tampered tracker context value', (f: MutableFixture) => {
      const value = Buffer.from(f.plan.contextExtension['1'], 'hex');
      value[value.length - 1] ^= 1;
      f.genesisBox.spendingProof.extension['1'] = value.toString('hex');
      f.transaction.inputs[0].spendingProof.extension['1'] = value.toString('hex');
    }, /tracker|register|admission/i],
    ['a truncated historical AVL insert proof', (f: MutableFixture) => {
      const bundle = Buffer.from(
        decodeCollByteRegister(f.plan.contextExtension['2'], 'fixture proof bundle'),
        'hex',
      );
      const extensionEnd = 8 + Number(bundle.readBigUInt64BE(0));
      const truncated = encodeCollByteRegister(bundle.subarray(0, extensionEnd + 1));
      f.genesisBox.spendingProof.extension['2'] = truncated;
      f.transaction.inputs[0].spendingProof.extension['2'] = truncated;
    }, /AVL|proof|verif|digest/i],
    ['an oversized serialized Var(2)', (f: MutableFixture) => {
      const oversized = `0e${'00'.repeat(AUTHENTICATED_SPV_TRACKER_MAX_PROOF_BUNDLE_BYTES + 6)}`;
      f.genesisBox.spendingProof.extension['2'] = oversized;
      f.transaction.inputs[0].spendingProof.extension['2'] = oversized;
    }, /serialized bound/i],
    ['broken header ancestry', (f: MutableFixture) => {
      f.headers.get(PARENT_HEADER_ID)!.parentId = 'ff'.repeat(32);
    }, /anchor header|ancestry|not found/i],
    ['conflicting historical anchor extension aliases', (f: MutableFixture) => {
      (f.headers.get(ANCHOR_HEADER_ID)! as any).extensionRoot = 'ff'.repeat(32);
    }, /extension aliases disagree/i],
    ['tracker digest drift', (f: MutableFixture) => {
      f.tipBox.additionalRegisters.R5 = f.plan.inputRegisters.R5;
      f.transaction.outputs[0].additionalRegisters.R5 = f.plan.inputRegisters.R5;
    }, /successor register R5|tracker digest/i],
    ['a lagging extra index', (f: MutableFixture) => {
      f.indexProgress[0] = { indexedHeight: 119, fullHeight: 120 };
    }, /extra index is not synchronized/i],
    ['a best header that does not identify the full-block tip', (f: MutableFixture) => {
      f.bestHeaders[0] = { ...f.bestHeaders[0], height: 121 };
    }, /does not identify full height/i],
    ['a tracker tip absent from the canonical UTXO set', (f: MutableFixture) => {
      f.unspentById.clear();
    }, /not present in the canonical UTXO set/i],
    ['extra-index progress drift during replay', (f: MutableFixture) => {
      (f.source.getIndexedHeight as any)
        .mockResolvedValueOnce(f.indexProgress[0])
        .mockResolvedValueOnce({ indexedHeight: 121, fullHeight: 121 });
      (f.source.getBestHeader as any)
        .mockResolvedValueOnce(f.bestHeaders[0])
        .mockResolvedValueOnce({ ...f.bestHeaders[0], id: 'fe'.repeat(32), height: 121 });
    }, /snapshot changed/i],
    ['tip drift during pagination and replay', (f: MutableFixture) => {
      const changed = { ...f.bestHeaders[0], id: 'ff'.repeat(32) };
      (f.source.getBestHeader as any)
        .mockResolvedValueOnce(f.bestHeaders[0])
        .mockResolvedValueOnce(changed);
    }, /snapshot changed/i],
    ['tip parent drift under the same ID and height', (f: MutableFixture) => {
      const changed = { ...f.bestHeaders[0], parentId: 'ff'.repeat(32) };
      (f.source.getBestHeader as any)
        .mockResolvedValueOnce(f.bestHeaders[0])
        .mockResolvedValueOnce(changed);
    }, /snapshot changed/i],
    ['tip extension-root drift under the same ID and height', (f: MutableFixture) => {
      const changed = { ...f.bestHeaders[0], extensionHash: 'ff'.repeat(32) };
      (f.source.getBestHeader as any)
        .mockResolvedValueOnce(f.bestHeaders[0])
        .mockResolvedValueOnce(changed);
    }, /snapshot changed/i],
  ])('rejects %s', async (_label, mutate, expected) => {
    const fixture = trackerFixture();
    mutate(fixture);
    await expect(reconstruct(fixture)).rejects.toThrow(expected);
  });

  it('rechecks the exact canonical tip against one stable synchronized snapshot', async () => {
    const fixture = trackerFixture();
    await expect(currentTip(fixture)).resolves.toBe(true);
    expect(fixture.source.getIndexedHeight).toHaveBeenCalledTimes(2);
    expect(fixture.source.getBestHeader).toHaveBeenCalledTimes(2);
    expect(fixture.source.getBoxByIdOrNull).toHaveBeenCalledWith(TIP_BOX_ID);
  });

  it('rechecks the exact canonical tip on both independent sources', async () => {
    const primary = trackerFixture();
    const witness = trackerFixture();
    await expect(isAuthenticatedSpvTrackerTipCurrentOnIndependentSources({
      primarySource: primary.source,
      witnessSource: witness.source,
      trackerNftIdHex: TRACKER_NFT_ID,
      trackerErgoTreeHex: TRACKER_TREE,
      expectedSidechainIdHex: SIDECHAIN_ID,
      expectedTipBoxId: TIP_BOX_ID,
      expectedTipDigestHex: primary.plan.successorDigestHex,
    })).resolves.toBe(true);

    witness.bestHeaders[0] = { ...witness.bestHeaders[0], id: 'fd'.repeat(32) };
    await expect(isAuthenticatedSpvTrackerTipCurrentOnIndependentSources({
      primarySource: primary.source,
      witnessSource: witness.source,
      trackerNftIdHex: TRACKER_NFT_ID,
      trackerErgoTreeHex: TRACKER_TREE,
      expectedSidechainIdHex: SIDECHAIN_ID,
      expectedTipBoxId: TIP_BOX_ID,
      expectedTipDigestHex: primary.plan.successorDigestHex,
    })).rejects.toThrow(/disagree on the current canonical snapshot/i);

    witness.bestHeaders[0] = { ...primary.bestHeaders[0] };
    witness.unspentById.clear();
    await expect(isAuthenticatedSpvTrackerTipCurrentOnIndependentSources({
      primarySource: primary.source,
      witnessSource: witness.source,
      trackerNftIdHex: TRACKER_NFT_ID,
      trackerErgoTreeHex: TRACKER_TREE,
      expectedSidechainIdHex: SIDECHAIN_ID,
      expectedTipBoxId: TIP_BOX_ID,
      expectedTipDigestHex: primary.plan.successorDigestHex,
    })).resolves.toBe(false);
  });

  it('returns the exact agreed source height with a current dual-source tip', async () => {
    const primary = trackerFixture();
    const witness = trackerFixture();
    for (const fixture of [primary, witness]) {
      fixture.bestHeaders[0] = {
        ...fixture.bestHeaders[0],
        height: 119,
      };
      fixture.indexProgress[0] = {
        indexedHeight: 119,
        fullHeight: 119,
      };
    }

    await expect(
      observeAuthenticatedSpvTrackerTipCurrentOnIndependentSources({
        primarySource: primary.source,
        witnessSource: witness.source,
        trackerNftIdHex: TRACKER_NFT_ID,
        trackerErgoTreeHex: TRACKER_TREE,
        expectedSidechainIdHex: SIDECHAIN_ID,
        expectedTipBoxId: TIP_BOX_ID,
        expectedTipDigestHex: primary.plan.successorDigestHex,
      }),
    ).resolves.toEqual({
      current: true,
      observedErgoHeight: 119,
    });
  });

  it('rejects a dual-source fast path when a non-digest tip register disagrees', async () => {
    const primary = trackerFixture();
    const witness = trackerFixture();
    witness.tipBox.additionalRegisters.R4 = witness.plan.inputRegisters.R4;

    await expect(isAuthenticatedSpvTrackerTipCurrentOnIndependentSources({
      primarySource: primary.source,
      witnessSource: witness.source,
      trackerNftIdHex: TRACKER_NFT_ID,
      trackerErgoTreeHex: TRACKER_TREE,
      expectedSidechainIdHex: SIDECHAIN_ID,
      expectedTipBoxId: TIP_BOX_ID,
      expectedTipDigestHex: primary.plan.successorDigestHex,
    })).rejects.toThrow(/canonical tracker tip/i);
  });

  it('requires full reconstruction when the expected tip is no longer unspent', async () => {
    const fixture = trackerFixture();
    fixture.unspentById.clear();
    await expect(currentTip(fixture)).resolves.toBe(false);
  });

  it.each([
    ['a lagging extra index', (f: MutableFixture) => {
      f.indexProgress[0] = { indexedHeight: 119, fullHeight: 120 };
    }, /extra index is not synchronized/i],
    ['a changed tip digest under the same box identity', (f: MutableFixture) => {
      f.tipBox.additionalRegisters.R5 = f.plan.inputRegisters.R5;
    }, /tip digest changed/i],
    ['snapshot drift around the UTXO lookup', (f: MutableFixture) => {
      (f.source.getIndexedHeight as any)
        .mockResolvedValueOnce(f.indexProgress[0])
        .mockResolvedValueOnce({ indexedHeight: 121, fullHeight: 121 });
      (f.source.getBestHeader as any)
        .mockResolvedValueOnce(f.bestHeaders[0])
        .mockResolvedValueOnce({ ...f.bestHeaders[0], id: 'fd'.repeat(32), height: 121 });
    }, /snapshot changed/i],
  ])('fails the pre-candidate tip check for %s', async (_label, mutate, expected) => {
    const fixture = trackerFixture();
    mutate(fixture);
    await expect(currentTip(fixture)).rejects.toThrow(expected);
  });

  it('replaces a reconstructible cache atomically and rejects unproven callers', async () => {
    const fixture = trackerFixture();
    const uncorroborated = await reconstruct(fixture);
    const reconstructed = await reconstructIndependently(fixture);
    const dir = mkdtempSync(join(tmpdir(), 'tracker-reconstruction-'));
    const dbPath = join(dir, 'state.sqlite');
    const state = new StateTracker(dbPath);
    try {
      expect(() => state.replaceAuthenticatedSpvTrackerHistory(uncorroborated as any))
        .toThrow(/independent.*provenance/i);
      expect(state.replaceAuthenticatedSpvTrackerHistory(reconstructed)).toEqual({
        changed: true,
        previousEntries: 0,
        currentEntries: 1,
        invalidatedCandidates: 0,
      });
      expect(state.getAuthenticatedSpvTrackerHistory(SIDECHAIN_ID)).toEqual([{
        key: fixture.plan.trackerKeyHex,
        value: fixture.plan.trackerValueHex,
      }]);
      expect(state.getAuthenticatedSpvTrackerReconstructionState(SIDECHAIN_ID)).toEqual({
        sidechainIdHex: SIDECHAIN_ID,
        trackerNftIdHex: TRACKER_NFT_ID,
        genesisBoxId: GENESIS_BOX_ID,
        finalityAttestorSigmaPropRegisterHex: reconstructed.finalityAttestorSigmaPropRegisterHex,
        tipBoxId: TIP_BOX_ID,
        tipDigest: fixture.plan.successorDigestHex,
        observationDigest: reconstructed.observationDigestHex,
        observedErgoTip: reconstructed.observedTip.height,
        observedErgoTipId: reconstructed.observedTip.idHex,
        observedErgoParentId: reconstructed.observedTip.parentIdHex,
        observedErgoExtensionRoot: reconstructed.observedTip.extensionRootHex,
      });
      expect(state.replaceAuthenticatedSpvTrackerHistory(reconstructed).changed).toBe(false);
      expect(() => state.replaceAuthenticatedSpvTrackerHistory({} as any)).toThrow(/provenance/i);
    } finally {
      state.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('removes reorged rows and invalidates active candidates for the same sidechain', async () => {
    const fixture = trackerFixture();
    const reconstructed = await reconstructIndependently(fixture);
    const dir = mkdtempSync(join(tmpdir(), 'tracker-reconstruction-'));
    const state = new StateTracker(join(dir, 'state.sqlite'));
    try {
      state.replaceAuthenticatedSpvTrackerHistory(reconstructed);
      const burnTxHash = '81'.repeat(32);
      const sidechainLogIndex = 7;
      const candidate: AuthenticatedSettlementCandidateInput = {
        schemaVersion: AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
        candidateId: '82'.repeat(32),
        burnId: deriveTrustlessBurnIdHex({
          sidechainIdHex: SIDECHAIN_ID,
          sidechainTxHashHex: burnTxHash,
          eventIndex: sidechainLogIndex,
        }),
        burnTxHash,
        sidechainId: SIDECHAIN_ID,
        sidechainHeight: 1_024n,
        sidechainBlockHash: fixture.checkpoint.checkpoint.executionBlockHashHex,
        sidechainLogIndex,
        trackerKey: fixture.plan.trackerKeyHex,
        trackerValue: fixture.plan.trackerValueHex,
        trackerBoxId: TIP_BOX_ID,
        anchorHeaderId: ANCHOR_HEADER_ID,
        anchorHeaderHeight: 98,
        dupInputBoxId: '83'.repeat(32),
        dupInputDigest: '84'.repeat(33),
        vaultBoxId: '85'.repeat(32),
        unsignedTxDigest: '86'.repeat(32),
        creationHeight: 110,
        observedSidechainTip: 1_100n,
        observedErgoTip: 120,
      };
      state.insertPegOut(burnTxHash, `02${'87'.repeat(32)}`, 1_000_000n, 1_024, {
        user: `0x${'88'.repeat(20)}`,
        sidechainId: SIDECHAIN_ID,
        sidechainBlockHash: candidate.sidechainBlockHash,
        sidechainLogIndex,
      });
      state.recordAuthenticatedSettlementCandidate(candidate);

      const reorged = trackerFixture();
      const reorgedWitness = trackerFixture();
      for (const observation of [reorged, reorgedWitness]) {
        observation.genesisBox.spentTransactionId = null as any;
        observation.genesisBox.spendingProof = null as any;
        (observation.source.getIndexedBoxesByTokenId as any)
          .mockResolvedValue([observation.genesisBox]);
        observation.unspentById.clear();
        observation.unspentById.set(GENESIS_BOX_ID, observation.genesisBox);
      }
      const emptyReconstruction = await reconstructIndependently(reorged, reorgedWitness);
      expect(state.replaceAuthenticatedSpvTrackerHistory(emptyReconstruction)).toEqual({
        changed: true,
        previousEntries: 1,
        currentEntries: 0,
        invalidatedCandidates: 1,
      });
      expect(state.getAuthenticatedSpvTrackerHistory(SIDECHAIN_ID)).toEqual([]);
      expect(state.getAuthenticatedSpvTrackerReconstructionState(SIDECHAIN_ID)).toEqual(
        expect.objectContaining({
          tipBoxId: GENESIS_BOX_ID,
          observationDigest: emptyReconstruction.observationDigestHex,
          observedErgoTipId: emptyReconstruction.observedTip.idHex,
        }),
      );
      expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
    } finally {
      state.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
