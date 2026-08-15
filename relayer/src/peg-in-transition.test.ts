import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyBlockTransactionCommitment = vi.fn();

import {
  encodeCollByteRegister,
  encodeLongRegister,
} from './ergo-helpers.js';
import {
  classifyLegacyPegIn,
  PegInIncidentPersistenceError,
  PegInTransitionCoordinator,
  resolveActivePegInDeployment,
} from './peg-in-transition.js';
import {
  createPegInCommitmentReceipt,
  pegInCommitmentReceiptDigestHex,
} from './peg-in-commitment-receipt.js';
import type {
  PegInMintTransportConfirmationObservation,
} from './relayer-core/peg-in-mint-transport-lifecycle.js';
import type { PegInEvent } from './state-tracker.js';

const sourceBoxId = '11'.repeat(32);
const commitTxId = '33'.repeat(32);
const vaultBoxId = '44'.repeat(32);
const blockId = '55'.repeat(32);
const vaultTree = '100204a00b08cd';
const depositorTree = '0008cd02' + '66'.repeat(32);
const targetH160 = '0x' + '77'.repeat(20);

function verificationReceipt(overrides: Record<string, unknown> = {}) {
  return {
    headerIdHex: blockId,
    height: 100,
    blockVersion: 2,
    transactionsRootHex: 'aa'.repeat(32),
    transactionIdHex: commitTxId,
    transactionSigmaDigestHex: 'bb'.repeat(32),
    transactionIndex: 0,
    transactionCount: 1,
    headerIdMatchedCanonicalBytes: true as const,
    transactionsRootMatchedCanonicalHeaderBytes: true as const,
    transactionRootMatched: true as const,
    ...overrides,
  };
}

function retainedReceipt(overrides: Record<string, unknown> = {}) {
  return createPegInCommitmentReceipt({
    sourceBoxIdHex: sourceBoxId,
    committedVaultBoxIdHex: vaultBoxId,
    commitmentTxIdHex: commitTxId,
    verification: verificationReceipt(overrides),
  });
}

function event(overrides: Partial<PegInEvent> = {}): PegInEvent {
  const result: PegInEvent = {
    id: 1,
    ergoLockBoxId: sourceBoxId,
    targetEvmAddress: targetH160,
    amountNanoErg: 5_000_000n,
    ergoLockHeight: 90,
    status: 'consume_submitted',
    sourceClassification: 'active_committed_vault',
    depositorErgoTreeHex: depositorTree,
    commitTxId,
    committedVaultBoxId: null,
    commitInclusionHeight: null,
    commitInclusionHeaderId: null,
    commitmentReceipt: null,
    commitmentReceiptDigestHex: null,
    commitFailure: null,
    sidechainMintTxHash: null,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
  if (
    ['consume_confirmed', 'minting', 'minted'].includes(result.status)
    && !Object.prototype.hasOwnProperty.call(overrides, 'commitmentReceipt')
  ) {
    const receipt = retainedReceipt();
    result.commitmentReceipt = receipt;
    result.commitmentReceiptDigestHex = pegInCommitmentReceiptDigestHex(receipt);
    result.commitInclusionHeaderId ??= blockId;
    result.commitInclusionHeight ??= 100;
    result.committedVaultBoxId ??= vaultBoxId;
  }
  return result;
}

function depositBox() {
  return {
    boxId: sourceBoxId,
    value: 5_000_000,
    ergoTree: '1001',
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(targetH160.slice(2), 'hex')),
      R5: encodeLongRegister(5_000_000),
      R6: encodeCollByteRegister(Buffer.from('02' + '88'.repeat(32), 'hex')),
      R7: encodeCollByteRegister(Buffer.from(depositorTree, 'hex')),
    },
    creationHeight: 90,
    transactionId: '99'.repeat(32),
    index: 0,
  };
}

function committedVaultBox(overrides: Record<string, unknown> = {}) {
  return {
    boxId: vaultBoxId,
    value: 5_000_000,
    ergoTree: vaultTree,
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(sourceBoxId, 'hex')),
      R5: encodeCollByteRegister(Buffer.from(targetH160.slice(2), 'hex')),
      R6: encodeLongRegister(5_000_000),
      R7: encodeCollByteRegister(Buffer.from(depositorTree, 'hex')),
    },
    creationHeight: 100,
    transactionId: commitTxId,
    index: 0,
    ...overrides,
  };
}

function canonicalCommit(overrides: Record<string, unknown> = {}) {
  return {
    id: commitTxId,
    headerId: blockId,
    inclusionHeight: 100,
    inputs: [{ boxId: sourceBoxId }],
    outputs: [committedVaultBox()],
    ...overrides,
  };
}

function stateMock() {
  const authorization = Object.freeze({
    open: false,
    incidentCount: 0,
    continuityStatus: 'established' as const,
    continuityRecoveryRequired: false,
    externalContinuityWitnessCurrent: true,
    retainedExecutionAuthority: false,
    stateDigestHex: '91'.repeat(32),
    executionAuthorityEpochHex: '92'.repeat(32),
  });
  return {
    recordPegInConsumeConfirmed: vi.fn(),
    beginPegInMint: vi.fn(),
    recordPegInMinted: vi.fn(),
    confirmPegInMintTransportRecovery: vi.fn(),
    resetPegInMintForRetry: vi.fn(),
    getLatestPegInMintTransportAttempt: vi.fn(() => null),
    resetPegInCommit: vi.fn(),
    markPegInCommitInvalid: vi.fn(),
    markPegInIncident: vi.fn(),
    updatePegInClassification: vi.fn(),
    assertFundsReleaseAuthorized: vi.fn(() => authorization),
  };
}

function harness(overrides: {
  tx?: any | null;
  block?: any | null;
  blockError?: Error;
  blockIdsError?: Error;
  boxReadError?: Error;
  sourceBox?: any | null;
  vaultBox?: any | null;
  blockIds?: string[];
  processed?: boolean;
  processedSequence?: Array<boolean | Error>;
  mintConfirmation?: PegInMintTransportConfirmationObservation;
  unconfirmed?: boolean;
  assertReadQuorumCurrent?: (boundary: string) => void;
} = {}) {
  const state = stateMock();
  const tx = Object.prototype.hasOwnProperty.call(overrides, 'tx')
    ? overrides.tx
    : canonicalCommit();
  const sourceBox = Object.prototype.hasOwnProperty.call(overrides, 'sourceBox')
    ? overrides.sourceBox
    : null;
  const vaultBox = Object.prototype.hasOwnProperty.call(overrides, 'vaultBox')
    ? overrides.vaultBox
    : committedVaultBox();
  let processedRead = 0;
  const isBoxProcessed = vi.fn(async () => {
    const sequenced = overrides.processedSequence?.[processedRead++];
    if (sequenced instanceof Error) throw sequenced;
    return sequenced ?? overrides.processed ?? false;
  });
  const observePegInMintTransportConfirmation = vi.fn(async () =>
    overrides.mintConfirmation ?? Object.freeze({ status: 'absent' as const }));
  const block = Object.prototype.hasOwnProperty.call(overrides, 'block')
    ? overrides.block
    : { marker: 'canonical-block' };
  const ergo = {
    getTransaction: vi.fn(async () => tx),
    hasUnconfirmedTransaction: vi.fn(async () => overrides.unconfirmed ?? false),
    getBlockHeaderIdsAtHeight: vi.fn(async () => {
      if (overrides.blockIdsError) throw overrides.blockIdsError;
      return overrides.blockIds ?? [blockId];
    }),
    getBlockByHeaderId: vi.fn(async () => {
      if (overrides.blockError) throw overrides.blockError;
      return block;
    }),
    getBoxByIdOrNull: vi.fn(async (boxId: string) => {
      if (overrides.boxReadError) throw overrides.boxReadError;
      if (boxId === sourceBoxId) return sourceBox;
      if (boxId === vaultBoxId) return vaultBox;
      return null;
    }),
  };
  const coordinator = new PegInTransitionCoordinator({
    ergo,
    state,
    sidechain: {
      isBoxProcessed,
      getCurrentBlockNumber: vi.fn(async () => 1_000),
      observePegInMintTransportConfirmation,
    },
    vaultErgoTreeHex: vaultTree,
    assertReadQuorumCurrent: overrides.assertReadQuorumCurrent,
    verifyBlockTransactionCommitment,
  });
  return {
    coordinator,
    ergo,
    state,
    isBoxProcessed,
    observePegInMintTransportConfirmation,
  };
}

describe('committed-vault peg-in transition', () => {
  beforeEach(() => {
    verifyBlockTransactionCommitment.mockReset();
    verifyBlockTransactionCommitment.mockImplementation(async input =>
      verificationReceipt({
        headerIdHex: input.expectedHeaderIdHex,
        height: input.expectedHeight,
        transactionIdHex: input.expectedTransactionIdHex,
      }));
  });

  it('cannot mint directly from detected state', async () => {
    const { coordinator, state } = harness();
    await expect(coordinator.advance(
      event({ status: 'detected', commitTxId: null }),
      109,
    )).resolves.toMatchObject({ status: 'pending' });
    expect(state.recordPegInMinted).not.toHaveBeenCalled();
  });

  it('confirms the canonical commitment then holds before retired owner mint', async () => {
    const block = { marker: 'canonical-block' };
    const { coordinator, ergo, state } = harness({ block });
    await expect(coordinator.advance(event(), 109)).resolves.toEqual({
      status: 'pending',
      reason:
        'legacy owner-mint execution is retired; an authenticated V4 pending reservation and atomic runtime consumption are required',
    });
    expect(state.recordPegInConsumeConfirmed).toHaveBeenCalledWith(
      sourceBoxId,
      vaultBoxId,
      {
        inclusionHeight: 100,
        inclusionHeaderId: blockId,
        verification: verificationReceipt(),
      },
    );
    expect(state.beginPegInMint).not.toHaveBeenCalled();
    expect(ergo.getBlockByHeaderId).toHaveBeenCalledTimes(3);
    expect(verifyBlockTransactionCommitment).toHaveBeenCalledTimes(3);
    expect(verifyBlockTransactionCommitment).toHaveBeenNthCalledWith(3, {
      block,
      expectedHeaderIdHex: blockId,
      expectedHeight: 100,
      expectedTransactionIdHex: commitTxId,
      expectedTransaction: canonicalCommit(),
    });
    expect(state.recordPegInMinted).not.toHaveBeenCalled();
  });

  it('checks the read-quorum decision without entering a mint callback', async () => {
    const assertReadQuorumCurrent = vi.fn();
    const { coordinator, state } = harness({
      assertReadQuorumCurrent,
    });

    await expect(coordinator.advance(event(), 109)).resolves.toEqual({
      status: 'pending',
      reason:
        'legacy owner-mint execution is retired; an authenticated V4 pending reservation and atomic runtime consumption are required',
    });
    expect(state.beginPegInMint).not.toHaveBeenCalled();
    expect(assertReadQuorumCurrent).toHaveBeenCalledWith(
      'peg-in mint reservation',
    );
    expect(assertReadQuorumCurrent).toHaveBeenCalledTimes(1);
  });

  it('holds an unauthenticated block transaction without persistence or mint', async () => {
    verifyBlockTransactionCommitment.mockRejectedValueOnce(
      new Error('Ergo block transactions do not match the header transactions root'),
    );
    const { coordinator, state } = harness();

    await expect(coordinator.advance(event(), 109)).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('transactions root'),
    });
    expect(state.recordPegInConsumeConfirmed).not.toHaveBeenCalled();
    expect(state.markPegInCommitInvalid).not.toHaveBeenCalled();
    expect(state.beginPegInMint).not.toHaveBeenCalled();
  });

  it('holds without mutation when the inclusion block cannot be read', async () => {
    const { coordinator, state } = harness({
      blockError: new Error('RPC unavailable'),
    });

    await expect(coordinator.advance(event(), 109)).resolves.toEqual({
      status: 'uncertain',
      reason: 'cannot read commitment inclusion block: RPC unavailable',
    });
    expect(verifyBlockTransactionCommitment).not.toHaveBeenCalled();
    expect(state.recordPegInConsumeConfirmed).not.toHaveBeenCalled();
    expect(state.beginPegInMint).not.toHaveBeenCalled();
  });

  it('holds without mutation when canonical-height classification is unavailable', async () => {
    const { coordinator, state } = harness({
      blockIdsError: new Error('height index unavailable'),
    });

    await expect(coordinator.advance(event(), 109)).resolves.toEqual({
      status: 'uncertain',
      reason:
        'cannot read canonical commitment inclusion height: height index unavailable',
    });
    expect(state.markPegInCommitInvalid).not.toHaveBeenCalled();
    expect(state.recordPegInConsumeConfirmed).not.toHaveBeenCalled();
    expect(state.beginPegInMint).not.toHaveBeenCalled();
  });

  it('holds without mutation when source or vault state cannot be read', async () => {
    const { coordinator, state } = harness({
      boxReadError: new Error('UTXO index unavailable'),
    });

    await expect(coordinator.advance(event(), 109)).resolves.toEqual({
      status: 'uncertain',
      reason:
        'cannot read commitment source or vault state: UTXO index unavailable',
    });
    expect(state.markPegInCommitInvalid).not.toHaveBeenCalled();
    expect(state.recordPegInConsumeConfirmed).not.toHaveBeenCalled();
    expect(state.beginPegInMint).not.toHaveBeenCalled();
  });

  it('does not mint at nine inclusive confirmations', async () => {
    const { coordinator } = harness();
    await expect(coordinator.advance(event(), 108)).resolves.toMatchObject({
      status: 'pending',
      reason: expect.stringContaining('9/10'),
    });
  });

  it.each([
    ['wrong vault tree', committedVaultBox({ ergoTree: '1009' })],
    ['wrong vault value', committedVaultBox({ value: 4_999_999 })],
    ['wrong target binding', committedVaultBox({
      additionalRegisters: {
        ...committedVaultBox().additionalRegisters,
        R5: encodeCollByteRegister(Buffer.from('88'.repeat(20), 'hex')),
      },
    })],
  ])('rejects %s without minting', async (_label, wrongVault) => {
    const tx = canonicalCommit({ outputs: [wrongVault] });
    const { coordinator, state } = harness({ tx, vaultBox: wrongVault });
    await expect(coordinator.advance(event(), 109)).resolves.toMatchObject({ status: 'invalid' });
    expect(state.markPegInCommitInvalid).toHaveBeenCalled();
  });

  it('requires the exact committed vault at output zero', async () => {
    const wrongVault = committedVaultBox({ ergoTree: '1009' });
    const tx = canonicalCommit({ outputs: [wrongVault, committedVaultBox()] });
    const { coordinator } = harness({ tx, vaultBox: committedVaultBox() });

    await expect(coordinator.advance(event(), 109)).resolves.toMatchObject({
      status: 'invalid',
      reason: expect.stringContaining('wrong ErgoTree'),
    });
  });

  it.each([
    [
      'transaction ID',
      canonicalCommit({ txId: '99'.repeat(32) }),
      /commit transaction id aliases disagree/,
    ],
    [
      'inclusion block ID',
      canonicalCommit({ blockId: '99'.repeat(32) }),
      /commit inclusion block id aliases disagree/,
    ],
    [
      'inclusion height',
      canonicalCommit({ blockHeight: 101 }),
      /commit inclusion height aliases disagree/,
    ],
  ])('holds contradictory RPC %s aliases before minting', async (_label, tx, expected) => {
    const { coordinator, state } = harness({ tx });
    await expect(coordinator.advance(event(), 109)).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringMatching(expected),
    });
    expect(state.markPegInCommitInvalid).not.toHaveBeenCalled();
    expect(state.recordPegInConsumeConfirmed).not.toHaveBeenCalled();
    expect(state.beginPegInMint).not.toHaveBeenCalled();
  });

  it('resets a reorged commitment only when the refundable source box reappears', async () => {
    const { coordinator, state } = harness({ tx: null, sourceBox: depositBox() });
    await expect(coordinator.advance(event(), 109)).resolves.toMatchObject({
      status: 'reset',
      reason: expect.stringContaining('refundable again'),
    });
    expect(state.resetPegInCommit).toHaveBeenCalled();
  });

  it('holds a non-canonical commitment unless its source deposit definitely reappears', async () => {
    const wrongBlock = harness({ blockIds: ['99'.repeat(32)] });
    await expect(wrongBlock.coordinator.advance(event(), 109)).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('source deposit remains unavailable'),
    });
    expect(wrongBlock.state.resetPegInCommit).not.toHaveBeenCalled();
    expect(wrongBlock.state.markPegInCommitInvalid).not.toHaveBeenCalled();

    const refundableAgain = harness({
      blockIds: ['99'.repeat(32)],
      sourceBox: depositBox(),
    });
    await expect(refundableAgain.coordinator.advance(event(), 109)).resolves.toMatchObject({
      status: 'reset',
      reason: expect.stringContaining('refundable again'),
    });
    expect(refundableAgain.state.resetPegInCommit).toHaveBeenCalled();
  });

  it('holds a missing committed-vault UTXO response before mint without terminal mutation', async () => {
    const spentVault = harness({ vaultBox: null });
    await expect(spentVault.coordinator.advance(event(), 109)).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('could not be established as unspent'),
    });
    expect(spentVault.state.markPegInCommitInvalid).not.toHaveBeenCalled();
    expect(spentVault.state.markPegInIncident).not.toHaveBeenCalled();
    expect(spentVault.state.beginPegInMint).not.toHaveBeenCalled();
  });

  it('holds contradictory canonical-commit and refundable-source RPC evidence', async () => {
    const refundable = harness({ sourceBox: depositBox() });
    await expect(refundable.coordinator.advance(event(), 109)).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('RPC evidence disagree'),
    });
    expect(refundable.state.markPegInCommitInvalid).not.toHaveBeenCalled();
  });

  it('rejects a canonical commitment that resolves to another persisted vault box', async () => {
    const mismatch = harness();
    await expect(mismatch.coordinator.advance(event({
      committedVaultBoxId: '99'.repeat(32),
    }), 109)).resolves.toMatchObject({
      status: 'invalid',
      reason: expect.stringContaining('does not match persisted vault box id'),
    });
  });

  it('holds stale retained receipt evidence before mint without terminal mutation', async () => {
    verifyBlockTransactionCommitment.mockImplementation(async input =>
      verificationReceipt({
        headerIdHex: input.expectedHeaderIdHex,
        height: input.expectedHeight,
        transactionIdHex: input.expectedTransactionIdHex,
        transactionSigmaDigestHex: 'cc'.repeat(32),
      }));
    const { coordinator, state } = harness();

    await expect(coordinator.advance(event({
      status: 'consume_confirmed',
    }), 109)).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('does not match retained evidence'),
    });
    expect(state.markPegInCommitInvalid).not.toHaveBeenCalled();
    expect(state.markPegInIncident).not.toHaveBeenCalled();
    expect(state.beginPegInMint).not.toHaveBeenCalled();
  });

  it.each([
    ['header', { headerIdHex: '99'.repeat(32) }],
    ['height', { height: 101 }],
  ])('holds a verifier receipt whose %s disagrees with the observed inclusion', async (
    _label,
    receiptOverride,
  ) => {
    verifyBlockTransactionCommitment.mockImplementation(async input =>
      verificationReceipt({
        headerIdHex: input.expectedHeaderIdHex,
        height: input.expectedHeight,
        transactionIdHex: input.expectedTransactionIdHex,
        ...receiptOverride,
      }));
    const { coordinator, state } = harness();

    await expect(coordinator.advance(event(), 109)).resolves.toEqual({
      status: 'uncertain',
      reason:
        'authenticated commitment receipt does not match independently observed inclusion',
    });
    expect(state.recordPegInConsumeConfirmed).not.toHaveBeenCalled();
    expect(state.markPegInCommitInvalid).not.toHaveBeenCalled();
    expect(state.beginPegInMint).not.toHaveBeenCalled();
  });

  it('holds post-mint RPC receipt disagreement without creating an incident', async () => {
    verifyBlockTransactionCommitment.mockRejectedValue(
      new Error('primary and witness block responses disagree'),
    );
    const { coordinator, state } = harness();

    await expect(coordinator.reconcileMinted(event({
      status: 'minted',
    }), 109)).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('responses disagree'),
    });
    expect(state.markPegInIncident).not.toHaveBeenCalled();
    expect(state.resetPegInMintForRetry).not.toHaveBeenCalled();
  });

  it('retains historical processed-only recovery when no exact attempt exists', async () => {
    const restart = harness({ processed: true });
    await expect(restart.coordinator.advance(
      event({
        status: 'minting',
        committedVaultBoxId: vaultBoxId,
        commitInclusionHeight: 100,
      }),
      109,
    )).resolves.toEqual({ status: 'minted' });
    expect(restart.state.recordPegInMinted).toHaveBeenCalledWith(sourceBoxId);
    expect(verifyBlockTransactionCommitment).toHaveBeenCalled();
  });

  it('does not infer a next-tick mint from processedPegIns without the reserved receipt', async () => {
    const transactionHashHex = 'ab'.repeat(32);
    const {
      coordinator,
      state,
      observePegInMintTransportConfirmation,
    } = harness({
      processed: true,
      mintConfirmation: Object.freeze({ status: 'absent' }),
    });
    state.getLatestPegInMintTransportAttempt.mockImplementation(() => ({
      status: 'pending',
      expectedTransactionHashHex: transactionHashHex,
      expiresAtBlockNumber: 1_000,
    } as any));

    await expect(coordinator.advance(
      event({ status: 'minting' }),
      109,
    )).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('exact reserved transaction'),
    });
    expect(observePegInMintTransportConfirmation).toHaveBeenCalledWith(
      transactionHashHex,
    );
    expect(state.confirmPegInMintTransportRecovery).not.toHaveBeenCalled();
    expect(state.recordPegInMinted).not.toHaveBeenCalled();
  });

  it('opens an incident when an uncertain EVM mint outlives its Ergo commitment', async () => {
    const restart = harness({
      tx: null,
      sourceBox: depositBox(),
      blockIds: ['99'.repeat(32)],
      processed: true,
    });
    await expect(restart.coordinator.advance(
      event({
        status: 'minting',
        committedVaultBoxId: vaultBoxId,
        commitInclusionHeight: 100,
      }),
      109,
    )).resolves.toMatchObject({
      status: 'incident',
      reason: expect.stringContaining('mint submission may already have been accepted'),
    });
    expect(restart.isBoxProcessed).not.toHaveBeenCalled();
    expect(restart.state.recordPegInMinted).not.toHaveBeenCalled();
    expect(restart.state.markPegInIncident).toHaveBeenCalled();
    expect(restart.state.resetPegInCommit).not.toHaveBeenCalled();
  });

  it('finalizes a restart-reconciled minting row when the sidechain identity is processed', async () => {
    const { coordinator, state } = harness({ processed: true });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minting' }),
      109,
    )).resolves.toMatchObject({ status: 'minted' });
    expect(state.recordPegInMinted).toHaveBeenCalledWith(sourceBoxId);
    expect(state.resetPegInMintForRetry).not.toHaveBeenCalled();
    expect(state.markPegInIncident).not.toHaveBeenCalled();
  });

  it('atomically confirms the exact reserved transaction during restart recovery', async () => {
    const transactionHashHex = 'ab'.repeat(32);
    const submission = Object.freeze({
      status: 'accepted' as const,
      transactionHashHex,
      responseDigestHex: 'bc'.repeat(32),
      confirmationBlockNumber: 700,
      confirmationBlockHashHex: 'cd'.repeat(32),
      confirmationCount: 3 as const,
    });
    const {
      coordinator,
      state,
      observePegInMintTransportConfirmation,
    } = harness({
      processed: true,
      mintConfirmation: Object.freeze({
        status: 'confirmed',
        submission,
      }),
    });
    state.getLatestPegInMintTransportAttempt.mockImplementation(() => ({
      status: 'ambiguous',
      expectedTransactionHashHex: transactionHashHex,
      expiresAtBlockNumber: 1_000,
    } as any));

    await expect(coordinator.reconcileMinted(
      event({ status: 'minting' }),
      109,
    )).resolves.toEqual({
      status: 'minted',
      mintTxHash: `0x${transactionHashHex}`,
    });
    expect(observePegInMintTransportConfirmation).toHaveBeenCalledWith(
      transactionHashHex,
    );
    expect(state.confirmPegInMintTransportRecovery).toHaveBeenCalledWith(
      sourceBoxId,
      transactionHashHex,
      submission,
    );
    expect(state.recordPegInMinted).not.toHaveBeenCalled();
  });

  it('does not infer confirmation from processedPegIns without the reserved receipt', async () => {
    const transactionHashHex = 'ab'.repeat(32);
    const {
      coordinator,
      state,
      observePegInMintTransportConfirmation,
    } = harness({
      processed: true,
      mintConfirmation: Object.freeze({ status: 'absent' }),
    });
    state.getLatestPegInMintTransportAttempt.mockImplementation(() => ({
      status: 'pending',
      expectedTransactionHashHex: transactionHashHex,
      expiresAtBlockNumber: 1_000,
    } as any));

    await expect(coordinator.reconcileMinted(
      event({ status: 'minting' }),
      109,
    )).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('exact reserved transaction'),
    });
    expect(observePegInMintTransportConfirmation).toHaveBeenCalledWith(
      transactionHashHex,
    );
    expect(state.confirmPegInMintTransportRecovery).not.toHaveBeenCalled();
    expect(state.recordPegInMinted).not.toHaveBeenCalled();
  });

  it('incidents an ambiguous mint before a shallow replacement header can authorize new work', async () => {
    const replacementBlockId = '88'.repeat(32);
    const { coordinator, state } = harness({
      tx: canonicalCommit({ headerId: replacementBlockId }),
      blockIds: [replacementBlockId],
      processed: true,
    });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minting' }),
      100,
    )).resolves.toMatchObject({
      status: 'incident',
      reason: expect.stringContaining('replacement inclusion header'),
    });
    expect(state.markPegInIncident).toHaveBeenCalledWith(
      sourceBoxId,
      expect.objectContaining({ kind: 'canonical_header_replaced' }),
    );
    expect(state.recordPegInMinted).not.toHaveBeenCalled();
  });

  it('raises an incident if a minted commitment leaves the canonical chain', async () => {
    const { coordinator, state } = harness({
      tx: null,
      sourceBox: depositBox(),
      blockIds: ['99'.repeat(32)],
      processed: true,
    });
    await expect(coordinator.reconcileMinted(
      event({
        status: 'minted',
        committedVaultBoxId: vaultBoxId,
        commitInclusionHeight: 100,
      }),
      109,
    )).resolves.toMatchObject({ status: 'incident' });
    expect(state.markPegInIncident).toHaveBeenCalledWith(
      sourceBoxId,
      expect.objectContaining({ kind: 'refundable_source_restored' }),
    );
  });

  it('raises a durable incident if a minted commitment disappears', async () => {
    const { coordinator, state } = harness({
      tx: null,
      sourceBox: null,
      blockIds: ['99'.repeat(32)],
      processed: true,
    });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minted' }),
      109,
    )).resolves.toMatchObject({ status: 'incident' });
    expect(state.markPegInIncident).toHaveBeenCalledWith(
      sourceBoxId,
      expect.objectContaining({ kind: 'commitment_disappeared' }),
    );
  });

  it('identifies a post-mint incident persistence failure separately from RPC uncertainty', async () => {
    const { coordinator, state } = harness({
      tx: null,
      sourceBox: null,
      blockIds: ['99'.repeat(32)],
      processed: true,
    });
    state.markPegInIncident.mockImplementationOnce(() => {
      throw new Error('incident journal is unavailable');
    });

    await expect(coordinator.reconcileMinted(
      event({ status: 'minted' }),
      109,
    )).rejects.toBeInstanceOf(PegInIncidentPersistenceError);
  });

  it('holds a missing transaction while the retained inclusion header remains canonical', async () => {
    const { coordinator, state } = harness({
      tx: null,
      sourceBox: null,
      processed: true,
    });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minted' }),
      109,
    )).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('retained canonical-header RPC evidence disagree'),
    });
    expect(state.markPegInIncident).not.toHaveBeenCalled();
    expect(state.resetPegInMintForRetry).not.toHaveBeenCalled();
  });

  it.each(['minting', 'minted'] as const)(
    'incidents a %s row when a missing transaction has a positively restored source',
    async (status) => {
      const { coordinator, state } = harness({
        tx: null,
        sourceBox: depositBox(),
        processed: true,
      });
      await expect(coordinator.reconcileMinted(
        event({ status }),
        109,
      )).resolves.toMatchObject({
        status: 'incident',
        reason: expect.stringContaining('source deposit is refundable'),
      });
      expect(state.markPegInIncident).toHaveBeenCalledWith(
        sourceBoxId,
        expect.objectContaining({ kind: 'refundable_source_restored' }),
      );
      expect(state.resetPegInMintForRetry).not.toHaveBeenCalled();
    },
  );

  it('holds the same restored-source RPC disagreement before mint', async () => {
    const { coordinator, state } = harness({
      tx: null,
      sourceBox: depositBox(),
    });
    await expect(coordinator.advance(
      event({ status: 'consume_confirmed' }),
      109,
    )).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('source deposit is refundable'),
    });
    expect(state.markPegInIncident).not.toHaveBeenCalled();
    expect(state.resetPegInCommit).not.toHaveBeenCalled();
    expect(state.markPegInCommitInvalid).not.toHaveBeenCalled();
  });

  it.each([
    ['visible', canonicalCommit()],
    ['missing', null],
  ])('holds a %s transaction when the canonical header index returns an empty height', async (
    _label,
    tx,
  ) => {
    const { coordinator, state } = harness({
      tx,
      sourceBox: null,
      blockIds: [],
      processed: true,
    });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minted' }),
      109,
    )).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('returned no identity'),
    });
    expect(state.markPegInIncident).not.toHaveBeenCalled();
    expect(state.resetPegInMintForRetry).not.toHaveBeenCalled();
  });

  it('holds a tip rollback below the retained inclusion height without terminal mutation', async () => {
    const { coordinator, state } = harness({
      tx: null,
      sourceBox: null,
      blockIds: [],
      processed: true,
    });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minted' }),
      99,
    )).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('rolled below'),
    });
    expect(state.markPegInIncident).not.toHaveBeenCalled();
  });

  it('incidents a retained commitment reorged back into the mempool', async () => {
    const { coordinator, state } = harness({
      tx: null,
      sourceBox: null,
      blockIds: ['99'.repeat(32)],
      unconfirmed: true,
      processed: true,
    });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minted' }),
      109,
    )).resolves.toMatchObject({
      status: 'incident',
      reason: expect.stringContaining('only in the mempool'),
    });
    expect(state.markPegInIncident).toHaveBeenCalledWith(
      sourceBoxId,
      expect.objectContaining({ kind: 'commitment_disappeared' }),
    );
  });

  it('raises a durable incident when a minted source becomes refundable while the transaction remains visible', async () => {
    const { coordinator, state } = harness({
      sourceBox: depositBox(),
      processed: true,
    });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minted' }),
      109,
    )).resolves.toMatchObject({ status: 'incident' });
    expect(state.markPegInIncident).toHaveBeenCalledWith(
      sourceBoxId,
      expect.objectContaining({ kind: 'refundable_source_restored' }),
    );
  });

  it('raises a durable incident when the same minted transaction moves to a one-confirmation replacement header', async () => {
    const replacementBlockId = '88'.repeat(32);
    const { coordinator, state } = harness({
      tx: canonicalCommit({ headerId: replacementBlockId }),
      blockIds: [replacementBlockId],
      processed: true,
    });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minted' }),
      100,
    )).resolves.toMatchObject({
      status: 'incident',
      reason: expect.stringContaining('replacement inclusion header'),
    });
    expect(state.markPegInIncident).toHaveBeenCalledWith(
      sourceBoxId,
      expect.objectContaining({
        kind: 'canonical_header_replaced',
        observedCommitmentReceiptDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it('uses only the first height-index header as best-chain identity', async () => {
    const bestHeaderId = '99'.repeat(32);
    const postMint = harness({
      blockIds: [bestHeaderId, blockId],
      processed: true,
    });
    await expect(postMint.coordinator.reconcileMinted(
      event({ status: 'minted' }),
      109,
    )).resolves.toMatchObject({ status: 'incident' });
    expect(postMint.state.markPegInIncident).toHaveBeenCalledWith(
      sourceBoxId,
      expect.objectContaining({ kind: 'canonical_header_replaced' }),
    );

    const missingTransaction = harness({
      tx: null,
      sourceBox: null,
      blockIds: [bestHeaderId, blockId],
      processed: true,
    });
    await expect(missingTransaction.coordinator.reconcileMinted(
      event({ status: 'minted' }),
      109,
    )).resolves.toMatchObject({ status: 'incident' });
    expect(missingTransaction.state.markPegInIncident).toHaveBeenCalledWith(
      sourceBoxId,
      expect.objectContaining({ kind: 'commitment_disappeared' }),
    );

    const preMint = harness({
      blockIds: [bestHeaderId, blockId],
    });
    await expect(preMint.coordinator.advance(
      event({ status: 'consume_confirmed' }),
      109,
    )).resolves.toMatchObject({ status: 'uncertain' });
    expect(preMint.state.markPegInIncident).not.toHaveBeenCalled();
    expect(preMint.state.markPegInCommitInvalid).not.toHaveBeenCalled();
    expect(preMint.state.beginPegInMint).not.toHaveBeenCalled();
  });

  it('requires two agreeing sidechain absence reads before retrying a minted row', async () => {
    const { coordinator, state } = harness({
      processedSequence: [false, true],
    });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minted' }),
      109,
    )).resolves.toMatchObject({ status: 'minted' });
    expect(state.resetPegInMintForRetry).not.toHaveBeenCalled();
    expect(state.markPegInIncident).not.toHaveBeenCalled();
  });

  it('retains pre-WP-08F second-read recovery when no exact attempt exists', async () => {
    const { coordinator, state } = harness({
      processedSequence: [false, true],
    });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minting' }),
      109,
    )).resolves.toMatchObject({ status: 'minted' });
    expect(state.recordPegInMinted).toHaveBeenCalledWith(sourceBoxId);
    expect(state.resetPegInMintForRetry).not.toHaveBeenCalled();
  });

  it('does not infer a second-read mint without the exact reserved receipt', async () => {
    const transactionHashHex = 'ab'.repeat(32);
    const {
      coordinator,
      state,
      observePegInMintTransportConfirmation,
    } = harness({
      processedSequence: [false, true],
      mintConfirmation: Object.freeze({ status: 'absent' }),
    });
    state.getLatestPegInMintTransportAttempt.mockImplementation(() => ({
      status: 'ambiguous',
      expectedTransactionHashHex: transactionHashHex,
      expiresAtBlockNumber: 1_000,
    } as any));

    await expect(coordinator.reconcileMinted(
      event({ status: 'minting' }),
      109,
    )).resolves.toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('exact reserved transaction'),
    });
    expect(observePegInMintTransportConfirmation).toHaveBeenCalledWith(
      transactionHashHex,
    );
    expect(state.confirmPegInMintTransportRecovery).not.toHaveBeenCalled();
    expect(state.recordPegInMinted).not.toHaveBeenCalled();
    expect(state.resetPegInMintForRetry).not.toHaveBeenCalled();
  });

  it('retries only after two mint-absence reads and unchanged unspent collateral', async () => {
    const { coordinator, state } = harness({
      processedSequence: [false, false],
    });
    await expect(coordinator.reconcileMinted(
      event({ status: 'minted' }),
      109,
    )).resolves.toMatchObject({
      status: 'reset',
      reason: expect.stringContaining('idempotent retry'),
    });
    expect(state.resetPegInMintForRetry).toHaveBeenCalledWith(
      sourceBoxId,
      expect.stringContaining('committed vault remains canonical and unspent'),
    );
    expect(state.markPegInIncident).not.toHaveBeenCalled();
  });

  it('classifies immutable legacy sources without treating them as mintable', () => {
    expect(classifyLegacyPegIn(true, false)).toBe('legacy_unminted_refundable');
    expect(classifyLegacyPegIn(true, true)).toBe('legacy_minted_requires_migration');
    expect(classifyLegacyPegIn(false, false)).toBe('legacy_already_consumed');
    expect(classifyLegacyPegIn(false, true)).toBe('legacy_already_consumed');
  });

  it('requires explicit v3 deployment metadata bound to the V2 vault', () => {
    const deployed: any = {
      mainChainLock: {
        address: 'mcl',
        ergoTreeHex: '1001',
        version: 'committed-vault-v3',
        settlementVaultErgoTreeHex: vaultTree,
      },
      mainChainAggregateUnlockTrustless: {
        address: 'vault',
        ergoTreeHex: vaultTree,
      },
    };
    expect(resolveActivePegInDeployment(deployed)).toMatchObject({
      lockAddress: 'mcl',
      vaultAddress: 'vault',
      vaultErgoTreeHex: vaultTree,
    });
    expect(resolveActivePegInDeployment({
      ...deployed,
      mainChainLock: { address: 'legacy', ergoTreeHex: '1000' },
    })).toBeNull();
    expect(() => resolveActivePegInDeployment({
      ...deployed,
      mainChainLock: {
        ...deployed.mainChainLock,
        settlementVaultErgoTreeHex: '1009',
      },
    })).toThrow(/does not match/);
  });

  it('rejects a commitment confirmation policy below ten blocks', () => {
    expect(() => new PegInTransitionCoordinator({
      ergo: {} as any,
      state: {} as any,
      sidechain: {} as any,
      vaultErgoTreeHex: vaultTree,
      commitConfirmations: 9,
      verifyBlockTransactionCommitment,
    })).toThrow(/at least 10/);
  });
});
