import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DUP_HEARTBEAT_OPERATION_PROFILE,
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  SCS_ORACLE_UPDATE_OPERATION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  StateTracker,
  type ErgoOperationalTransactionAttempt,
  type ReserveErgoOperationalTransactionAttemptInput,
} from './state-tracker.js';

const daemonSource = readFileSync(
  join(process.cwd(), 'src', 'relayer-daemon.ts'),
  'utf8',
);
const retiredCompatibilityPath = join(
  process.cwd(),
  'src',
  'ergo-operational-transaction-compatibility.ts',
);
const historicalScsSource = readFileSync(
  join(process.cwd(), 'src', 'historical-scs-reconciliation.ts'),
  'utf8',
);
const stateTrackerSource = readFileSync(
  join(process.cwd(), 'src', 'state-tracker.ts'),
  'utf8',
);

const hex = (byte: string): string => byte.repeat(32);

const PEG_IN_BOX_ID = hex('31');
const PEG_IN_COMMIT_TX_ID = hex('32');
const PEG_IN_VAULT_BOX_ID = hex('33');
const PEG_IN_FEE_BOX_ID = hex('34');
const PEG_IN_TARGET = `0x${'35'.repeat(20)}`;
const PEG_IN_DEPOSITOR_TREE = `0008cd02${hex('36')}`;
const SCS_TX_ID = hex('41');
const SCS_BOX_ID = hex('42');
const SCS_FEE_BOX_ID = hex('43');

function pegInCommitmentVerification(
  overrides: Record<string, unknown> = {},
) {
  return {
    headerIdHex: hex('76'),
    height: 1_010,
    blockVersion: 2,
    transactionsRootHex: hex('77'),
    transactionIdHex: PEG_IN_COMMIT_TX_ID,
    transactionSigmaDigestHex: hex('78'),
    transactionIndex: 0,
    transactionCount: 1,
    headerIdMatchedCanonicalBytes: true as const,
    transactionsRootMatchedCanonicalHeaderBytes: true as const,
    transactionRootMatched: true as const,
    ...overrides,
  };
}

function pegInCommitmentConfirmation(
  overrides: Record<string, unknown> = {},
) {
  return {
    inclusionHeight: 1_010,
    inclusionHeaderId: hex('76'),
    verification: pegInCommitmentVerification(overrides),
  };
}

function methodSource(startMarker: string, endMarker: string): string {
  const start = daemonSource.indexOf(startMarker);
  const end = daemonSource.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return daemonSource.slice(start, end);
}

function withTracker<T>(run: (tracker: StateTracker) => T): T {
  const directory = mkdtempSync(join(tmpdir(), 'ergo-operational-review-'));
  const tracker = new StateTracker(join(directory, 'state.sqlite'));
  try {
    return run(tracker);
  } finally {
    tracker.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function operationalAttemptInput(
  patch: Partial<ReserveErgoOperationalTransactionAttemptInput> = {},
): ReserveErgoOperationalTransactionAttemptInput {
  return {
    operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    expectedTxId: PEG_IN_COMMIT_TX_ID,
    sourceBoxId: PEG_IN_BOX_ID,
    inputBoxIds: [PEG_IN_BOX_ID, PEG_IN_FEE_BOX_ID],
    attemptedAtHeight: 1_000,
    targetSidechainHeight: null,
    targetSidechainBlockHashHex: null,
    heartbeatKeyHex: null,
    bindingDigestHex: hex('51'),
    signedTransactionDigestHex: hex('52'),
    checkResponseDigestHex: hex('53'),
    revalidationDigestHex: hex('54'),
    authorizationDigestHex: hex('55'),
    ...patch,
  };
}

function seedSubmittedPegIn(
  tracker: StateTracker,
): ErgoOperationalTransactionAttempt {
  tracker.insertPegIn(
    PEG_IN_BOX_ID,
    PEG_IN_TARGET,
    5_000_000n,
    990,
    'active_committed_vault',
    PEG_IN_DEPOSITOR_TREE,
  );
  tracker.recordPegInConsumeSubmitted(
    PEG_IN_BOX_ID,
    PEG_IN_COMMIT_TX_ID,
  );
  const reserved = tracker.reserveErgoOperationalTransactionAttempt(
    operationalAttemptInput(),
  );
  return tracker.finalizeErgoOperationalTransactionAttempt({
    expectedTxId: PEG_IN_COMMIT_TX_ID,
    durableAttemptDigestHex: reserved.durableAttemptDigestHex,
    disposition: 'accepted',
    submittedTxId: PEG_IN_COMMIT_TX_ID,
    responseDigestHex: hex('56'),
  }).attempt;
}

describe('independent-review operational transaction regressions', () => {
  it('binds the SCS durable identity to an exact canonical sidechain block or checkpoint', () => {
    const firstBlockHash = hex('61');
    const secondBlockHash = hex('62');
    const reserve = (
      targetSidechainBlockHash: string,
    ): ErgoOperationalTransactionAttempt => withTracker(tracker =>
      tracker.reserveErgoOperationalTransactionAttempt({
        ...operationalAttemptInput({
          operationProfile: SCS_ORACLE_UPDATE_OPERATION_PROFILE,
          expectedTxId: SCS_TX_ID,
          sourceBoxId: SCS_BOX_ID,
          inputBoxIds: [SCS_BOX_ID, SCS_FEE_BOX_ID],
          targetSidechainHeight: 2_000,
          targetSidechainBlockHashHex: targetSidechainBlockHash,
        }),
      }));

    const first = reserve(firstBlockHash) as ErgoOperationalTransactionAttempt
      & Record<string, unknown>;
    const second = reserve(secondBlockHash) as ErgoOperationalTransactionAttempt
      & Record<string, unknown>;
    expect(first.targetSidechainBlockHashHex).toBe(firstBlockHash);
    expect(first.durableAttemptDigestHex).not.toBe(
      second.durableAttemptDigestHex,
    );
  });

  it('keeps every fixed operational compatibility transport retired', () => {
    expect(existsSync(retiredCompatibilityPath)).toBe(false);
    expect(daemonSource).not.toContain('submitPegInCommittedVaultTransition');
    expect(daemonSource).not.toContain('submitScs');
    expect(daemonSource).toContain(
      'SCS oracle mutation is retired; finalized sidechain state is observation-only',
    );
  });

  it('requires final depth and block identity before historical SCS confirmation', () => {
    const guardedConfirmations = historicalScsSource.match(
      /inclusion\.confirmations < input\.finalConfirmations[\s\S]{0,260}input\.ports\.confirm\(\{/g,
    );
    expect(guardedConfirmations).toHaveLength(2);
    for (const guarded of guardedConfirmations ?? []) {
      expect(guarded).toContain('inclusion.inclusionHeight === null');
      expect(guarded).toContain('inclusion.headerId === null');
    }
  });

  it('reconciles confirmed SCS attempts after reorg and quarantines disappearance', () => {
    const confirmedScsReconciliation = methodSource(
      'private async reconcileConfirmedOperationalTransactionsAfterReorg',
      'private async reconcilePegIns',
    );
    expect(confirmedScsReconciliation).toContain(
      'SCS_ORACLE_UPDATE_OPERATION_PROFILE',
    );
    expect(confirmedScsReconciliation).toMatch(/canonical|reorg/i);
    expect(confirmedScsReconciliation).toContain(
      'quarantineErgoOperationalTransactionAttempt(',
    );
  });

  it('keeps an exact DUP attempt recoverable after a single-node null observation', () => {
    const source = methodSource(
      'private async confirmPendingDupHeartbeats',
      'private async storageRentCheck',
    );

    expect(source).toContain('attempt.expectedTxId');
    expect(source).toContain('attempt.heartbeatKeyHex');
    expect(source).toContain(
      'getReconcilableErgoOperationalTransactionAttempts(',
    );
    expect(stateTrackerSource).toMatch(
      /status IN \('pending', 'accepted', 'ambiguous', 'abandoned'\)/,
    );
    expect(stateTrackerSource).toMatch(
      /status IN \('pending', 'accepted', 'ambiguous', 'abandoned'\)[\s\S]{0,500}confirmed/,
    );
  });

  it('can confirm the exact DUP transaction after local abandonment', () => {
    withTracker(tracker => {
      const expectedTxId = hex('71');
      const sourceBoxId = hex('72');
      const reserved = tracker.reserveErgoOperationalTransactionAttempt({
        ...operationalAttemptInput({
          operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
          expectedTxId,
          sourceBoxId,
          inputBoxIds: [sourceBoxId, hex('73')],
          targetSidechainHeight: null,
          targetSidechainBlockHashHex: null,
          heartbeatKeyHex: hex('74'),
        }),
      });
      tracker.finalizeErgoOperationalTransactionAttempt({
        expectedTxId,
        durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        disposition: 'ambiguous',
        submittedTxId: null,
        responseDigestHex: null,
      });
      tracker.abandonErgoOperationalTransactionAttempt(
        expectedTxId,
        'exact transaction temporarily absent',
      );

      expect(tracker.getReconcilableErgoOperationalTransactionAttempts(
        DUP_HEARTBEAT_OPERATION_PROFILE,
      )).toEqual([
        expect.objectContaining({
          expectedTxId,
          status: 'abandoned',
          heartbeatKeyHex: hex('74'),
        }),
      ]);
      expect(tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId,
        confirmationHeight: 1_020,
        confirmationHeaderId: hex('75'),
      })).toMatchObject({
        expectedTxId,
        status: 'confirmed',
        abandonmentReason: null,
      });
    });
  });

  it('reopens rather than quarantines confirmed history after a weak null observation', () => {
    const source = methodSource(
      'private async reconcileConfirmedOperationalTransactionsAfterReorg',
      'private async reconcilePegIns',
    );
    const canonicalHeaderIndex = source.indexOf(
      'await this.ergo.getBlockHeaderHash(attempt.confirmationHeight)',
    );
    const mismatchIndex = source.indexOf(
      'canonicalHeaderId === attempt.confirmationHeaderId',
    );
    const reopenIndex = source.indexOf(
      'this.state.reopenConfirmedErgoOperationalTransactionAttempt(',
      mismatchIndex,
    );

    expect(canonicalHeaderIndex).toBeGreaterThan(-1);
    expect(mismatchIndex).toBeGreaterThan(canonicalHeaderIndex);
    expect(reopenIndex).toBeGreaterThan(mismatchIndex);
    expect(source).not.toContain('this.state.removeAvlKey(');
  });

  it.each([
    {
      transition: 'confirm',
      coupledMethod: 'confirmErgoOperationalTransactionAttempt' as const,
      mutate: (tracker: StateTracker) =>
        tracker.recordPegInConsumeConfirmed(
          PEG_IN_BOX_ID,
          PEG_IN_VAULT_BOX_ID,
          pegInCommitmentConfirmation(),
        ),
    },
    {
      transition: 'reset',
      coupledMethod: 'abandonErgoOperationalTransactionAttempt' as const,
      mutate: (tracker: StateTracker) =>
        tracker.resetPegInCommit(
          PEG_IN_BOX_ID,
          'commit left the canonical chain',
        ),
    },
    {
      transition: 'invalidate',
      coupledMethod: 'quarantineErgoOperationalTransactionAttempt' as const,
      mutate: (tracker: StateTracker) =>
        tracker.markPegInCommitInvalid(
          PEG_IN_BOX_ID,
          'commit binding invalid',
        ),
    },
    {
      transition: 'incident',
      coupledMethod: 'quarantineErgoOperationalTransactionAttempt' as const,
      mutate: (tracker: StateTracker) =>
        tracker.markPegInIncident(
          PEG_IN_BOX_ID,
          'confirmed route incident',
        ),
    },
  ])('rolls back both linked rows when peg-in $transition coupling fails', ({
    coupledMethod,
    mutate,
  }) => {
    withTracker(tracker => {
      seedSubmittedPegIn(tracker);
      vi.spyOn(tracker, coupledMethod).mockImplementation(() => {
        throw new Error('injected linked-attempt write failure');
      });

      expect(() => mutate(tracker)).toThrow(
        /injected linked-attempt write failure/,
      );
      expect(tracker.getPegInByBoxId(PEG_IN_BOX_ID)).toMatchObject({
        status: 'consume_submitted',
        commitTxId: PEG_IN_COMMIT_TX_ID,
        committedVaultBoxId: null,
        commitInclusionHeight: null,
      });
      expect(tracker.getErgoOperationalTransactionAttempt(
        PEG_IN_COMMIT_TX_ID,
      )).toMatchObject({
        status: 'accepted',
        expectedTxId: PEG_IN_COMMIT_TX_ID,
        sourceBoxId: PEG_IN_BOX_ID,
      });
    });
  });

  it('quarantines a confirmed operational attempt when its peg-in commit rolls back', () => {
    withTracker(tracker => {
      seedSubmittedPegIn(tracker);
      tracker.recordPegInConsumeConfirmed(
        PEG_IN_BOX_ID,
        PEG_IN_VAULT_BOX_ID,
        pegInCommitmentConfirmation(),
      );
      expect(tracker.getErgoOperationalTransactionAttempt(
        PEG_IN_COMMIT_TX_ID,
      )?.status).toBe('confirmed');

      tracker.resetPegInCommit(
        PEG_IN_BOX_ID,
        'confirmed commit left the canonical chain',
      );

      expect(tracker.getErgoOperationalTransactionAttempt(
        PEG_IN_COMMIT_TX_ID,
      )).toMatchObject({
        status: 'quarantined',
        quarantineReason: 'confirmed commit left the canonical chain',
      });
      expect(tracker.getPegInByBoxId(PEG_IN_BOX_ID)?.commitTxId).toBe(
        null,
      );
    });
  });

  it('does not mutate the linked journal when a peg-in CAS does not apply', () => {
    withTracker(tracker => {
      seedSubmittedPegIn(tracker);
      tracker.recordPegInConsumeConfirmed(
        PEG_IN_BOX_ID,
        PEG_IN_VAULT_BOX_ID,
        pegInCommitmentConfirmation(),
      );
      tracker.recordPegInMinted(PEG_IN_BOX_ID, `0x${hex('77')}`);

      tracker.resetPegInCommit(
        PEG_IN_BOX_ID,
        'reset must not apply after mint',
      );
      tracker.markPegInCommitInvalid(
        PEG_IN_BOX_ID,
        'invalid must not apply after mint',
      );

      expect(tracker.getPegInByBoxId(PEG_IN_BOX_ID)).toMatchObject({
        status: 'minted',
        commitTxId: PEG_IN_COMMIT_TX_ID,
      });
      expect(tracker.getErgoOperationalTransactionAttempt(
        PEG_IN_COMMIT_TX_ID,
      )).toMatchObject({
        status: 'confirmed',
        quarantineReason: null,
      });
    });
  });

  it('rejects a linked peg-in confirmation without exact block identity', () => {
    withTracker(tracker => {
      seedSubmittedPegIn(tracker);

      expect(() => tracker.recordPegInConsumeConfirmed(
        PEG_IN_BOX_ID,
        PEG_IN_VAULT_BOX_ID,
        pegInCommitmentConfirmation({ headerIdHex: '' }),
      )).toThrow(/receipt header ID must be 32-byte hex/);

      expect(tracker.getPegInByBoxId(PEG_IN_BOX_ID)).toMatchObject({
        status: 'consume_submitted',
        committedVaultBoxId: null,
        commitInclusionHeight: null,
      });
      expect(tracker.getErgoOperationalTransactionAttempt(
        PEG_IN_COMMIT_TX_ID,
      )).toMatchObject({
        status: 'accepted',
        confirmationHeight: null,
        confirmationHeaderId: null,
      });
    });
  });

  it('atomically confirms a delayed DUP attempt and supersedes its replacement', () => {
    withTracker(tracker => {
      const delayedTxId = hex('81');
      const replacementTxId = hex('82');
      const sourceBoxId = hex('83');
      const delayedKey = hex('84');
      const replacementKey = hex('85');
      const delayed = tracker.reserveErgoOperationalTransactionAttempt({
        ...operationalAttemptInput({
          operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
          expectedTxId: delayedTxId,
          sourceBoxId,
          inputBoxIds: [sourceBoxId, hex('86')],
          targetSidechainHeight: null,
          targetSidechainBlockHashHex: null,
          heartbeatKeyHex: delayedKey,
        }),
      });
      tracker.finalizeErgoOperationalTransactionAttempt({
        expectedTxId: delayedTxId,
        durableAttemptDigestHex: delayed.durableAttemptDigestHex,
        disposition: 'ambiguous',
        submittedTxId: null,
        responseDigestHex: null,
      });
      tracker.abandonErgoOperationalTransactionAttempt(
        delayedTxId,
        'exact transaction temporarily absent',
      );

      const replacement = tracker.reserveErgoOperationalTransactionAttempt({
        ...operationalAttemptInput({
          operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
          expectedTxId: replacementTxId,
          sourceBoxId,
          inputBoxIds: [sourceBoxId, hex('87')],
          targetSidechainHeight: null,
          targetSidechainBlockHashHex: null,
          heartbeatKeyHex: replacementKey,
        }),
      });
      tracker.finalizeErgoOperationalTransactionAttempt({
        expectedTxId: replacementTxId,
        durableAttemptDigestHex: replacement.durableAttemptDigestHex,
        disposition: 'accepted',
        submittedTxId: replacementTxId,
        responseDigestHex: hex('88'),
      });

      const confirmed = tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId: delayedTxId,
        confirmationHeight: 1_020,
        confirmationHeaderId: hex('89'),
      });

      expect(confirmed.status).toBe('confirmed');
      expect(tracker.hasAvlKey(delayedKey)).toBe(true);
      expect(tracker.hasAvlKey(replacementKey)).toBe(false);
      expect(tracker.getErgoOperationalTransactionAttempt(
        replacementTxId,
      )).toMatchObject({
        status: 'abandoned',
        quarantineReason: null,
        abandonmentReason: expect.stringContaining(delayedTxId),
      });
      expect(tracker.getQuarantinedErgoOperationalTransactionAttempts(
        DUP_HEARTBEAT_OPERATION_PROFILE,
      )).toEqual([]);
    });
  });

  it('reopens a shallow re-inclusion and removes DUP history atomically', () => {
    withTracker(tracker => {
      const expectedTxId = hex('91');
      const sourceBoxId = hex('92');
      const heartbeatKey = hex('93');
      const reserved = tracker.reserveErgoOperationalTransactionAttempt({
        ...operationalAttemptInput({
          operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
          expectedTxId,
          sourceBoxId,
          inputBoxIds: [sourceBoxId, hex('94')],
          targetSidechainHeight: null,
          targetSidechainBlockHashHex: null,
          heartbeatKeyHex: heartbeatKey,
        }),
      });
      tracker.finalizeErgoOperationalTransactionAttempt({
        expectedTxId,
        durableAttemptDigestHex: reserved.durableAttemptDigestHex,
        disposition: 'accepted',
        submittedTxId: expectedTxId,
        responseDigestHex: hex('95'),
      });
      tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId,
        confirmationHeight: 1_020,
        confirmationHeaderId: hex('96'),
      });
      expect(tracker.hasAvlKey(heartbeatKey)).toBe(true);

      const reopened =
        tracker.reopenConfirmedErgoOperationalTransactionAttempt(expectedTxId);

      expect(reopened).toMatchObject({
        status: 'accepted',
        confirmationHeight: null,
        confirmationHeaderId: null,
        confirmedAt: null,
      });
      expect(tracker.hasAvlKey(heartbeatKey)).toBe(false);
    });
  });

  it('rebinds a deep canonical re-inclusion without deleting DUP history', () => {
    withTracker(tracker => {
      const expectedTxId = hex('a1');
      const sourceBoxId = hex('a2');
      const heartbeatKey = hex('a3');
      tracker.reserveErgoOperationalTransactionAttempt({
        ...operationalAttemptInput({
          operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
          expectedTxId,
          sourceBoxId,
          inputBoxIds: [sourceBoxId, hex('a4')],
          targetSidechainHeight: null,
          targetSidechainBlockHashHex: null,
          heartbeatKeyHex: heartbeatKey,
        }),
      });
      tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId,
        confirmationHeight: 1_020,
        confirmationHeaderId: hex('a5'),
      });

      const rebound =
        tracker.rebindConfirmedErgoOperationalTransactionAttempt({
          expectedTxId,
          confirmationHeight: 1_021,
          confirmationHeaderId: hex('a6'),
        });

      expect(rebound).toMatchObject({
        status: 'confirmed',
        confirmationHeight: 1_021,
        confirmationHeaderId: hex('a6'),
      });
      expect(tracker.hasAvlKey(heartbeatKey)).toBe(true);
    });
  });

  it('requires exact block identity for every operational confirmation', () => {
    withTracker(tracker => {
      tracker.reserveErgoOperationalTransactionAttempt({
        ...operationalAttemptInput({
          operationProfile: SCS_ORACLE_UPDATE_OPERATION_PROFILE,
          expectedTxId: SCS_TX_ID,
          sourceBoxId: SCS_BOX_ID,
          inputBoxIds: [SCS_BOX_ID, SCS_FEE_BOX_ID],
          targetSidechainHeight: 2_000,
          targetSidechainBlockHashHex: hex('a7'),
        }),
      });

      expect(() => tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId: SCS_TX_ID,
        confirmationHeight: 1_020,
        confirmationHeaderId: undefined as unknown as string,
      })).toThrow(/confirmation header ID/);
      expect(tracker.getErgoOperationalTransactionAttempt(
        SCS_TX_ID,
      )?.status).toBe('pending');
    });
  });

  it('fails closed if confirmed DUP history loses its committed key', () => {
    withTracker(tracker => {
      const expectedTxId = hex('ad');
      const sourceBoxId = hex('ae');
      const heartbeatKey = hex('af');
      tracker.reserveErgoOperationalTransactionAttempt({
        ...operationalAttemptInput({
          operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
          expectedTxId,
          sourceBoxId,
          inputBoxIds: [sourceBoxId, hex('b0')],
          targetSidechainHeight: null,
          targetSidechainBlockHashHex: null,
          heartbeatKeyHex: heartbeatKey,
        }),
      });
      tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId,
        confirmationHeight: 1_020,
        confirmationHeaderId: hex('b1'),
      });
      tracker.removeAvlKey(heartbeatKey);

      expect(() => tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId,
        confirmationHeight: 1_020,
        confirmationHeaderId: hex('b1'),
      })).toThrow(/lacks committed AVL history/);
    });
  });

  it('removes confirmed DUP history in the same quarantine transition', () => {
    withTracker(tracker => {
      const expectedTxId = hex('b1');
      const sourceBoxId = hex('b2');
      const heartbeatKey = hex('b3');
      tracker.reserveErgoOperationalTransactionAttempt({
        ...operationalAttemptInput({
          operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
          expectedTxId,
          sourceBoxId,
          inputBoxIds: [sourceBoxId, hex('b4')],
          targetSidechainHeight: null,
          targetSidechainBlockHashHex: null,
          heartbeatKeyHex: heartbeatKey,
        }),
      });
      tracker.confirmErgoOperationalTransactionAttempt({
        expectedTxId,
        confirmationHeight: 1_020,
        confirmationHeaderId: hex('b5'),
      });

      const quarantined = tracker.quarantineErgoOperationalTransactionAttempt(
        expectedTxId,
        'stored confirmation block was replaced',
      );

      expect(quarantined).toMatchObject({
        status: 'quarantined',
        quarantineReason: 'stored confirmation block was replaced',
      });
      expect(tracker.hasAvlKey(heartbeatKey)).toBe(false);
    });
  });

  it('keeps legacy DUP heartbeat rows as an explicit fail-closed hold', () => {
    const source = methodSource(
      'private async confirmPendingDupHeartbeats',
      'private async storageRentCheck',
    );

    expect(source).toContain('legacyHeartbeats.length > 0');
    expect(source).toContain('this.dupHeartbeatInFlight = true');
    expect(source).toContain('automatic migration remains fail-closed');
    expect(source).not.toContain('clearPendingDupHeartbeat(');
    expect(source).not.toContain('insertAvlKey(');
  });

  it('confirms delayed exact DUP transactions before adjudicating absent replacements', () => {
    const source = methodSource(
      'private async confirmPendingDupHeartbeats',
      'private async storageRentCheck',
    );
    const confirmIndex = source.indexOf(
      'this.state.confirmErgoOperationalTransactionAttempt({',
    );
    const absentPassIndex = source.indexOf(
      'for (const expectedTxId of absentAttemptIds)',
    );
    const reloadIndex = source.indexOf(
      'this.state.getErgoOperationalTransactionAttempt(',
      absentPassIndex,
    );
    const refreshedObservationIndex = source.indexOf(
      'this.ergo.getTransaction(attempt.expectedTxId)',
      absentPassIndex,
    );
    const sourceLookupIndex = source.indexOf(
      'this.ergo.getBoxByIdOrNull(attempt.sourceBoxId)',
      absentPassIndex,
    );

    expect(confirmIndex).toBeGreaterThan(-1);
    expect(absentPassIndex).toBeGreaterThan(confirmIndex);
    expect(reloadIndex).toBeGreaterThan(absentPassIndex);
    expect(refreshedObservationIndex).toBeGreaterThan(reloadIndex);
    expect(sourceLookupIndex).toBeGreaterThan(refreshedObservationIndex);
    expect(source).toContain(
      'retaining a fail-closed reconciliation hold',
    );
  });

  it('reopens confirmed operational state when the current tip loses policy depth', () => {
    const source = methodSource(
      'private async reconcileConfirmedOperationalTransactionsAfterReorg',
      'private async reconcilePegIns',
    );
    const depthIndex = source.indexOf(
      'currentHeight - attempt.confirmationHeight + 1',
    );
    const headerLookupIndex = source.indexOf(
      'await this.ergo.getBlockHeaderHash(attempt.confirmationHeight)',
    );

    expect(depthIndex).toBeGreaterThan(-1);
    expect(source.indexOf(
      'reopenConfirmedErgoOperationalTransactionAttempt(',
      depthIndex,
    )).toBeGreaterThan(depthIndex);
    expect(headerLookupIndex).toBeGreaterThan(depthIndex);
  });
});
