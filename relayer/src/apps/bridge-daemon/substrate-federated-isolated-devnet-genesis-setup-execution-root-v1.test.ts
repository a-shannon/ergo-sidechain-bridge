import {
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocked = vi.hoisted(() => ({
  build: vi.fn(),
  process: vi.fn(),
  setup: vi.fn(),
  claim: vi.fn(),
  packet: vi.fn(),
  sourceHistory: vi.fn(),
  rewardDiscovery: vi.fn(),
  rewardDiscoveryAssert: vi.fn(),
  ergoHistory: vi.fn(),
  familyDecode: vi.fn(),
  pegInCandidateBuild: vi.fn(),
  pegInCandidateAssert: vi.fn(),
  pegInSourceLockCheck: vi.fn(),
  pegInSourceLockRetainingCheck: vi.fn(),
  pegInSourceLockPromote: vi.fn(),
  pegInSourceLockDiscard: vi.fn(),
  ownedRewardDiscovery: vi.fn(),
  pegInSourceLockAuthorizer: vi.fn(),
  pegInSourceLockTransport: vi.fn(),
  pegInSourceLockJournal: vi.fn(),
  pegInSourceLockOutputObserve: vi.fn(),
  pegInSourceLockOutputAssert: vi.fn(),
  pegInCommittedVaultCheck: vi.fn(),
  pegInCommittedVaultPromote: vi.fn(),
  pegInCommittedVaultAuthorizationSession: vi.fn(),
  pegInCommittedVaultTransport: vi.fn(),
  pegInCommittedVaultJournal: vi.fn(),
  pegInCommittedVaultOutputObserve: vi.fn(),
  pegInCommittedVaultOutputAssert: vi.fn(),
  execute: vi.fn(),
  revalidator: vi.fn(),
  observer: vi.fn(),
  authorizer: vi.fn(),
  assertConfirmed: vi.fn(),
  transport: vi.fn(),
  journal: vi.fn(),
  stateClose: vi.fn(),
}));

vi.mock('../../substrate-federated-isolated-devnet-ergo-node-build-v1.js', () => ({
  buildSubstrateFederatedIsolatedDevnetErgoNodeV1: mocked.build,
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1: mocked.process,
}));
vi.mock('../../substrate-federated-isolated-devnet-setup-check-runner-v2.js', () => ({
  claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2: mocked.claim,
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2: mocked.setup,
}));
vi.mock('../../substrate-federated-isolated-devnet-packet-producer-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetPacketSessionV1: mocked.packet,
}));
vi.mock('../../substrate-federated-authority-safe-devnet-history-v1.js', () => ({
  collectSubstrateFederatedAuthoritySafeDevnetHistoryV1: mocked.sourceHistory,
}));
vi.mock('../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js', () => ({
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance:
    mocked.rewardDiscoveryAssert,
  discoverSubstrateFederatedRewardInputsV2: mocked.rewardDiscovery,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN: 'http://127.0.0.1:9051',
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN: 'http://127.0.0.1:9052',
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-candidate-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1:
    mocked.pegInCandidateAssert,
  buildSubstrateFederatedIsolatedDevnetPegInCandidateV1:
    mocked.pegInCandidateBuild,
}));
vi.mock('../../substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1:
    mocked.pegInCommittedVaultPromote,
  discardSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1:
    mocked.pegInSourceLockDiscard,
  promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1:
    mocked.pegInSourceLockPromote,
}));
vi.mock('../../substrate-federated-settlement-family-v1.js', () => ({
  decodeSubstrateFederatedSettlementFamilyV1Profile: mocked.familyDecode,
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js', () => ({
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2:
    mocked.ergoHistory,
}));
vi.mock('../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js', () => ({
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN:
    'http://127.0.0.1:9051',
  executeSubstrateFederatedLocalDevnetGenesisV1: mocked.execute,
  normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1:
    (value: unknown) => value,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-revalidator-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1:
    mocked.revalidator,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1:
    mocked.observer,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1:
    mocked.assertConfirmed,
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1:
    mocked.authorizer,
}));
vi.mock('../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1:
    mocked.transport,
  createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1:
    mocked.pegInSourceLockTransport,
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1:
    mocked.pegInCommittedVaultTransport,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1:
    mocked.pegInCommittedVaultAuthorizationSession,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1:
    mocked.pegInSourceLockAuthorizer,
}));
vi.mock('../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js', () => ({
  discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1:
    mocked.ownedRewardDiscovery,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1:
    mocked.pegInSourceLockOutputAssert,
  observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1:
    mocked.pegInSourceLockOutputObserve,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1:
    mocked.pegInCommittedVaultOutputAssert,
  observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1:
    mocked.pegInCommittedVaultOutputObserve,
}));
vi.mock('../../substrate-federated-local-devnet-genesis-journal-v1.js', () => ({
  createSubstrateFederatedLocalDevnetGenesisJournalV1: mocked.journal,
}));
vi.mock('../../substrate-federated-local-devnet-peg-in-source-lock-journal-v1.js', () => ({
  createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1:
    mocked.pegInSourceLockJournal,
}));
vi.mock('../../substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.js', () => ({
  createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1:
    mocked.pegInCommittedVaultJournal,
}));
vi.mock('../../state-tracker.js', () => ({
  StateTracker: class {
    close(): void {
      mocked.stateClose();
    }
  },
}));

import {
  runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1,
  runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1,
  runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1,
  runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1,
  runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
} from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_EXPECTED_STATIC_MANIFEST_DIGEST_V1,
} from '../../scripts/run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-receipt-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
} from '../../scripts/run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';

const MINING_CREDENTIAL = Object.freeze({ schema: 'synthetic-mining-credential' });

describe('isolated devnet genesis setup execution root V1', () => {
  let order: string[];
  let currentBatch: ReturnType<typeof setupBatch>;
  let processSession: ReturnType<typeof validProcessSession>;
  let observerPort: ReturnType<typeof validObserver>;
  let authorizerPort: ReturnType<typeof validAuthorizer>;
  let journalPort: ReturnType<typeof validJournal>;
  let rewardDiscoveryCount: number;
  let fundingObservation: ReturnType<typeof validPegInFundingObservation>;
  let postCandidateFundingObservation:
    ReturnType<typeof validPegInFundingObservation>;
  let postCheckFundingObservation:
    ReturnType<typeof validPegInFundingObservation>;
  let preTransportFundingObservation:
    ReturnType<typeof validPegInFundingObservation>;

  beforeEach(() => {
    vi.clearAllMocks();
    order = [];
    currentBatch = setupBatch();
    observerPort = validObserver(order);
    authorizerPort = validAuthorizer(order);
    journalPort = validJournal(order);
    processSession = validProcessSession(order);
    rewardDiscoveryCount = 0;
    fundingObservation = validPegInFundingObservation();
    postCandidateFundingObservation = structuredClone(fundingObservation);
    postCandidateFundingObservation.reportDigestHex = digest('d');
    postCandidateFundingObservation.observedAt = '2026-08-18T09:01:00.000Z';
    postCandidateFundingObservation.target.tipHeight = 131;
    postCandidateFundingObservation.target.tipHeaderIdHex = digest('e');
    postCheckFundingObservation = structuredClone(fundingObservation);
    postCheckFundingObservation.reportDigestHex = digest('f');
    postCheckFundingObservation.observedAt = '2026-08-18T09:02:00.000Z';
    postCheckFundingObservation.target.tipHeight = 132;
    postCheckFundingObservation.target.tipHeaderIdHex = digest('0');
    preTransportFundingObservation = structuredClone(fundingObservation);
    preTransportFundingObservation.reportDigestHex = digest('6');
    preTransportFundingObservation.observedAt = '2026-08-18T09:03:00.000Z';
    preTransportFundingObservation.target.tipHeight = 133;
    preTransportFundingObservation.target.tipHeaderIdHex = digest('1');

    mocked.build.mockImplementation(async () => {
      order.push('build');
      return validBuild();
    });
    mocked.setup.mockImplementation(async () => {
      order.push('setup');
      return {
        signer: setupSigner(),
        dispose: vi.fn(() => order.push('dispose:setup')),
        runForExecution: vi.fn(async () => {
          order.push('setup:execution');
          return currentBatch;
        }),
        runForExecutionRetainingPegInSigner: vi.fn(async () => {
          order.push('setup:execution:retain-peg-in-signer');
          return currentBatch;
        }),
        checkPegInSourceLock: mocked.pegInSourceLockCheck,
        checkPegInSourceLockRetainingSigner:
          mocked.pegInSourceLockRetainingCheck,
        checkPegInCommittedVault: mocked.pegInCommittedVaultCheck,
      };
    });
    mocked.claim.mockReturnValue(MINING_CREDENTIAL);
    mocked.packet.mockImplementation(() => ({
      signer: packetSigner(),
      dispose: vi.fn(() => order.push('dispose:packet')),
      produce: vi.fn(async () => {
        order.push('packet:produce');
        return {
          receipt: { receiptDigestHex: digest('9') },
          portableReplayInput: { packet: 'portable' },
        };
      }),
    }));
    mocked.process.mockReturnValue(processSession);
    mocked.sourceHistory.mockImplementation(async () => {
      order.push('source:history');
      return { source: 'history' };
    });
    mocked.rewardDiscovery.mockImplementation(async () => {
      rewardDiscoveryCount += 1;
      if (rewardDiscoveryCount === 1) {
        order.push('ergo:rewards');
        return { rewards: 'observed' };
      }
      if (rewardDiscoveryCount === 2) {
        order.push('ergo:rewards:peg-in');
        return fundingObservation;
      }
      if (rewardDiscoveryCount === 3) {
        order.push('ergo:rewards:peg-in:revalidate');
        return postCandidateFundingObservation;
      }
      if (rewardDiscoveryCount === 4) {
        order.push('ergo:rewards:peg-in:post-check');
        return postCheckFundingObservation;
      }
      order.push('ergo:rewards:peg-in:pre-transport');
      return preTransportFundingObservation;
    });
    mocked.ownedRewardDiscovery.mockImplementation(async () => ({
      schema:
        'e2s.substrate-federated-isolated-devnet-owned-reward-input-discovery.v1',
      observation: await mocked.rewardDiscovery(),
      processBindingDigestHex:
        currentBatch.targetBinding.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        currentBatch.targetBinding.executionTargetIdentityDigestHex,
    }));
    mocked.rewardDiscoveryAssert.mockImplementation(value => {
      order.push('peg-in:funding:assert');
      if (
        value !== fundingObservation
        && value !== postCandidateFundingObservation
        && value !== postCheckFundingObservation
        && value !== preTransportFundingObservation
      ) {
        throw new Error('funding observation provenance changed');
      }
    });
    mocked.ergoHistory.mockImplementation(async () => {
      order.push('ergo:history');
      return { ergo: 'history' };
    });
    mocked.familyDecode.mockReturnValue(validFamilyProfile());
    mocked.revalidator.mockReturnValue({
      revalidate: vi.fn(async (_checked, phase) => ({
        sourceBoxId: digest('1'),
        sourceBoxUnspent: true,
        targetGenesisHeaderIdHex: digest('a'),
        observedAtHeight: phase === 'post-check' ? 120 : 121,
        observedTipHeaderIdHex: digest('b'),
        sourceBoxDigestHex: digest('c'),
        sourceBoxSigmaSerializedSha256Hex: digest('d'),
        observationDigestHex: phase === 'post-check' ? digest('e') : digest('f'),
        revalidationArtifact: {},
      })),
    });
    mocked.observer.mockReturnValue(observerPort);
    mocked.authorizer.mockReturnValue(authorizerPort);
    mocked.assertConfirmed.mockImplementation(authorizer => {
      if (authorizer !== authorizerPort || authorizer.nextOrdinal() !== 3) {
        throw new Error('setup not confirmed');
      }
    });
    mocked.transport.mockReturnValue({
      submit: vi.fn(async attempt => {
        const role = attempt.candidate.authorization.revalidated.checked.signed
          .admission.role;
        order.push(`transport:${role}`);
        return {
          status: 'accepted',
          submittedTxId: attempt.candidate.authorization.revalidated.checked
            .signed.admission.expectedTxId,
          responseDigestHex: digest('8'),
        };
      }),
    });
    mocked.journal.mockReturnValue(journalPort);
    mocked.execute.mockImplementation(executeThroughPorts(order));
    mocked.pegInCandidateBuild.mockImplementation(async input => {
      order.push('peg-in:candidate:build');
      return validPegInCandidate(
        input.sourceFundingInput,
        currentBatch.targetBinding,
      );
    });
    mocked.pegInCandidateAssert.mockImplementation(candidate => {
      order.push('peg-in:candidate:assert');
      return candidate.depositPacket;
    });
    mocked.pegInSourceLockCheck.mockImplementation(async input => {
      order.push('peg-in:source-lock:check');
      return validPegInSourceLockCheck(input, currentBatch.targetBinding);
    });
    mocked.pegInSourceLockRetainingCheck.mockImplementation(async input => {
      order.push('peg-in:source-lock:check:retain-signer');
      return validPegInSourceLockCheck(input, currentBatch.targetBinding);
    });
    mocked.pegInSourceLockPromote.mockImplementation(receipt => {
      order.push('peg-in:source-lock:promote');
      return validPegInSourceLockExecutionCheck(receipt);
    });
    mocked.pegInSourceLockDiscard.mockImplementation(() => {
      order.push('peg-in:source-lock:discard');
    });
    mocked.pegInSourceLockAuthorizer.mockImplementation(() => ({
      schema:
        'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer.v1',
      revalidationDigestHex: digest('2'),
      authorize: vi.fn(revalidated => {
        order.push('peg-in:source-lock:authorize');
        return {
          authorizationDigestHex: digest('3'),
          authorizationArtifact: { revalidated },
        };
      }),
    }));
    mocked.pegInSourceLockTransport.mockImplementation(() => ({
      submit: vi.fn(async attempt => {
        order.push('peg-in:source-lock:transport');
        return {
          status: 'accepted' as const,
          submittedTxId: attempt.authorization.revalidated.checked.signed
            .admission.expectedTxId,
          responseDigestHex: digest('4'),
        };
      }),
    }));
    let sourceLockReconciliationCount = 0;
    mocked.pegInSourceLockJournal.mockImplementation(() => ({
      journal: {
        reserve: vi.fn(authorization => {
          order.push('peg-in:source-lock:journal:reserve');
          return {
            durableAttemptDigestHex: digest('5'),
            durableArtifact: { authorization },
          };
        }),
        finalize: vi.fn(({ submission }) => {
          order.push('peg-in:source-lock:journal:finalize');
          return {
            status: submission.status,
            journalDigestHex: digest('6'),
          };
        }),
      },
      reconcileActive: vi.fn(async () => {
        sourceLockReconciliationCount += 1;
        const status = sourceLockReconciliationCount === 1
          ? 'none' as const
          : 'confirmed' as const;
        order.push(`peg-in:source-lock:journal:reconcile:${status}`);
        return status;
      }),
      revalidateConfirmed: vi.fn(async () => {
        order.push('peg-in:source-lock:journal:revalidate');
        return 1;
      }),
    }));
    mocked.pegInSourceLockOutputObserve.mockImplementation(async () => {
      order.push('peg-in:source-lock:outputs');
      return validPegInSourceLockOutputObservation();
    });
    mocked.pegInSourceLockOutputAssert.mockImplementation(value => {
      if (value.schema
        !== 'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-output-observation.v1') {
        throw new Error('source-lock output observation changed');
      }
    });
    mocked.pegInCommittedVaultCheck.mockImplementation(async input => {
      order.push('peg-in:committed-vault:check');
      return validPegInCommittedVaultCheck(input, currentBatch.targetBinding);
    });
    mocked.pegInCommittedVaultPromote.mockImplementation(receipt => {
      order.push('peg-in:committed-vault:promote');
      return validPegInCommittedVaultExecutionCheck(receipt);
    });
    mocked.pegInCommittedVaultAuthorizationSession.mockImplementation(() => {
      const preTransportObservation =
        validPegInCommittedVaultPreTransportObservation();
      return {
        revalidator: {
          revalidate: vi.fn(async () => {
            order.push('peg-in:committed-vault:revalidate');
            return { revalidationDigestHex: digest('a') };
          }),
        },
        broadcastAuthorizer: {
          schema:
            'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer.v1',
          authorize: vi.fn(revalidated => {
            order.push('peg-in:committed-vault:authorize');
            return {
              authorizationDigestHex: digest('b'),
              authorizationArtifact: { revalidated },
            };
          }),
        },
        takePreTransportObservation: vi.fn(() => {
          order.push('peg-in:committed-vault:take-pre-transport');
          return preTransportObservation;
        }),
      };
    });
    mocked.pegInCommittedVaultTransport.mockImplementation(() => ({
      submit: vi.fn(async attempt => {
        order.push('peg-in:committed-vault:transport');
        return {
          status: 'accepted' as const,
          submittedTxId: attempt.authorization.revalidated.checked.signed
            .admission.expectedTxId,
          responseDigestHex: digest('c'),
        };
      }),
    }));
    let committedVaultReconciliationCount = 0;
    const latestCommittedVaultConfirmation = Object.freeze({
      ...confirmation(digest('9'), 4, 1),
      confirmationHeight: 139,
      observedAtHeight: 141,
    });
    const outputBoundCommittedVaultConfirmation = Object.freeze({
      ...latestCommittedVaultConfirmation,
      confirmationHeight: 140,
      observedAtHeight: 142,
      confirmationHeaderIdHex: digest('7'),
      observationDigestHex: digest('8'),
    });
    mocked.pegInCommittedVaultJournal.mockImplementation(() => ({
      journal: {
        reserve: vi.fn(authorization => {
          order.push('peg-in:committed-vault:journal:reserve');
          return {
            durableAttemptDigestHex: digest('d'),
            durableArtifact: { authorization },
          };
        }),
        finalize: vi.fn(({ submission }) => {
          order.push('peg-in:committed-vault:journal:finalize');
          return {
            status: submission.status,
            journalDigestHex: digest('e'),
          };
        }),
      },
      reconcileActive: vi.fn(async () => {
        committedVaultReconciliationCount += 1;
        const status = committedVaultReconciliationCount === 1
          ? 'none' as const
          : 'confirmed' as const;
        order.push(`peg-in:committed-vault:journal:reconcile:${status}`);
        return status;
      }),
      revalidateConfirmed: vi.fn(async () => {
        order.push('peg-in:committed-vault:journal:revalidate');
        return [latestCommittedVaultConfirmation];
      }),
    }));
    mocked.pegInCommittedVaultOutputObserve.mockImplementation(async input => {
      order.push('peg-in:committed-vault:outputs');
      if (input.confirmation !== latestCommittedVaultConfirmation) {
        throw new Error('stale committed-vault confirmation was consumed');
      }
      return validPegInCommittedVaultOutputObservation(
        outputBoundCommittedVaultConfirmation,
      );
    });
    mocked.pegInCommittedVaultOutputAssert.mockImplementation(value => {
      if (value.schema
        !== 'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-output-observation.v1') {
        throw new Error('committed-vault output observation changed');
      }
    });
  });

  it('broadcasts and confirms the exact three setup roles in canonical order', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
        rootInput(),
      );

    expect(order).toEqual([
      'build',
      'setup',
      'mining:start',
      'execution:enter',
      'source:history',
      'ergo:rewards',
      'ergo:history',
      'packet:produce',
      'setup:execution',
      'execute:tracker',
      'authorize:tracker',
      'journal:reserve:tracker',
      'transport:tracker',
      'journal:finalize:tracker',
      'observe:tracker',
      'journal:reconcile',
      'ack:tracker',
      'execute:duplicatePrevention',
      'authorize:duplicatePrevention',
      'journal:reserve:duplicatePrevention',
      'transport:duplicatePrevention',
      'journal:finalize:duplicatePrevention',
      'observe:duplicatePrevention',
      'journal:reconcile',
      'ack:duplicatePrevention',
      'execute:pooledReserve',
      'authorize:pooledReserve',
      'journal:reserve:pooledReserve',
      'transport:pooledReserve',
      'journal:finalize:pooledReserve',
      'observe:pooledReserve',
      'journal:reconcile',
      'ack:pooledReserve',
      'journal:revalidate',
      'observe:tracker',
      'observe:duplicatePrevention',
      'observe:pooledReserve',
      'execution:leave',
      'dispose:packet',
      'dispose:setup',
      'process:stop',
    ]);
    expect(result.receipt.status)
      .toBe('three_local_setup_transactions_canonically_confirmed');
    expect(result.receipt.staticExecutionManifestDigestHex)
      .toBe(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
      );
    expect(result.receipt.transactions.map(value => value.role)).toEqual([
      'tracker',
      'duplicatePrevention',
      'pooledReserve',
    ]);
    expect(result.receipt.transactions.map(value => value.confirmationHeight))
      .toEqual([120, 121, 122]);
    expect(result.receipt.checks.durableReservationPrecededTransport).toBe(true);
    expect(result.receipt.boundaries.localSetupBroadcastExecuted).toBe(true);
    expect(result.receipt.boundaries.publicNetworkUsed).toBe(false);
    expect(result.receipt.boundaries.gate5Closed).toBe(false);
    expect(result.receipt.boundaries.trustlessStatusEstablished).toBe(false);
    expect(result.receipt.receiptDigestHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(mocked.stateClose).toHaveBeenCalledTimes(1);
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:^|[^A-Za-z])[A-Za-z]:[\\/]/u,
    );
  });

  it('constructs one unsigned peg-in candidate after fresh same-lifetime funding observation', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1(
        pegInRootInput(),
      );

    expect(order.indexOf('ack:pooledReserve')).toBeLessThan(
      order.indexOf('ergo:rewards:peg-in'),
    );
    expect(order.indexOf('peg-in:funding:assert')).toBeLessThan(
      order.indexOf('peg-in:candidate:build'),
    );
    expect(order.indexOf('peg-in:candidate:build')).toBeLessThan(
      order.indexOf('ergo:rewards:peg-in:revalidate'),
    );
    expect(order.indexOf('ergo:rewards:peg-in:revalidate')).toBeLessThan(
      order.lastIndexOf('journal:revalidate'),
    );
    expect(order.lastIndexOf('journal:revalidate')).toBeLessThan(
      order.indexOf('execution:leave'),
    );
    expect(journalPort.revalidateConfirmed).toHaveBeenCalledTimes(2);
    expect(mocked.assertConfirmed).toHaveBeenCalledTimes(2);
    expect(mocked.rewardDiscoveryAssert).toHaveBeenCalledTimes(2);
    expect(mocked.pegInCandidateBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        batch: currentBatch,
        sourceFundingInput: fundingObservation.genesisInputs.tracker,
        depositorErgoTreeHex: setupSigner().p2pkErgoTreeHex,
        creationHeights: {
          currentErgoHeight: fundingObservation.target.tipHeight,
          sourceLockCreation: fundingObservation.target.tipHeight,
          reserveTransition: fundingObservation.target.tipHeight,
        },
        sourceIntent: expect.objectContaining({
          amountNanoErg: '5000000',
          recipientAddressHex: 'b1'.repeat(20),
        }),
      }),
    );
    expect(result.receipt).toMatchObject({
      status: 'setup_confirmed_and_unsigned_peg_in_candidate_constructed',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
      checks: {
        setupAndFundingObservedInOneTargetLifetime: true,
        allSetupLineagesRevalidatedAfterCandidateConstruction: true,
        exactDualNodeFundingObservationConsumed: true,
        sourceFundingDistinctFromSetupInputsAndOutputs: true,
        sourceFundingRevalidatedAfterCandidateConstruction: true,
        deterministicUnsignedCandidateConstructed: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        localSetupCanonicalConfirmationEstablished: true,
        localSourceFundingObservationEstablished: true,
        localSourceFundingReobservationEstablished: true,
        valuePathNodeCheckPerformed: false,
        valuePathSigningAuthorityEstablished: false,
        valuePathSubmissionAuthorityEstablished: false,
        valuePathBroadcastAuthorityEstablished: false,
        sourceLockConsumptionEstablished: false,
        reserveLineageEstablished: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(result.receipt.pegIn.fundingObservation.sourceFundingBoxIdHex)
      .toBe(fundingObservation.genesisInputs.tracker.boxId);
    expect(result.receipt.pegIn.fundingObservation.postCandidateReportDigestHex)
      .toBe(postCandidateFundingObservation.reportDigestHex);
    expect(result.receipt.pegIn.fundingObservation.postCandidateTipHeight)
      .toBe(131);
    expect(mocked.stateClose).toHaveBeenCalledTimes(1);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
    expect(containsFunction(result)).toBe(false);
  });

  it('signs and JVM-checks the exact source-lock candidate without exposing submission', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1(
        pegInRootInput(),
      );

    expect(order.indexOf('setup:execution:retain-peg-in-signer')).toBeLessThan(
      order.indexOf('peg-in:source-lock:check'),
    );
    expect(order.indexOf('ergo:rewards:peg-in:revalidate')).toBeLessThan(
      order.indexOf('peg-in:source-lock:check'),
    );
    expect(order.indexOf('peg-in:source-lock:check')).toBeLessThan(
      order.indexOf('ergo:rewards:peg-in:post-check'),
    );
    expect(mocked.pegInSourceLockCheck).toHaveBeenCalledTimes(1);
    expect(mocked.pegInSourceLockCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFundingBoxIdHex: fundingObservation.genesisInputs.tracker.boxId,
        unsignedTransaction: expect.objectContaining({ txId: digest('8') }),
      }),
      executionTarget(),
    );
    expect(mocked.rewardDiscoveryAssert).toHaveBeenCalledTimes(3);
    expect(result.receipt).toMatchObject({
      status: 'setup_confirmed_and_peg_in_source_lock_node_check_passed',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
      checks: {
        setupCandidateAndCheckCompletedInOneTargetLifetime: true,
        exactCandidateFundingAndUnsignedTransactionBound: true,
        sourceFundingRevalidatedImmediatelyBeforeSigning: true,
        sourceFundingRevalidatedAfterNodeCheck: true,
        exactSameNodeSigningContextAndJvmCheckUsed: true,
        signedTransactionBytesReturnedOrPersisted: false,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        valuePathLocalSyntheticSigningPerformed: true,
        valuePathJvmNodeCheckPassed: true,
        valuePathSubmissionAuthorityEstablished: false,
        valuePathBroadcastAuthorityEstablished: false,
        sourceLockConsumptionEstablished: false,
        reserveLineageEstablished: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(result.receipt.pegIn.fundingObservation.postCheckReportDigestHex)
      .toBe(postCheckFundingObservation.reportDigestHex);
    expect(result.receipt.pegIn.sourceLockCheck.signedTransactionIdHex)
      .toBe(digest('8'));
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
  });

  it('reserves, submits, confirms, and observes only the refundable source-lock creation', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      );

    expect(order.indexOf('peg-in:source-lock:check')).toBeLessThan(
      order.indexOf('ergo:rewards:peg-in:pre-transport'),
    );
    expect(order.indexOf('ergo:rewards:peg-in:pre-transport')).toBeLessThan(
      order.indexOf('peg-in:source-lock:promote'),
    );
    expect(order.indexOf('peg-in:source-lock:journal:reserve')).toBeLessThan(
      order.indexOf('peg-in:source-lock:transport'),
    );
    expect(order.indexOf('peg-in:source-lock:transport')).toBeLessThan(
      order.indexOf('observe:sourceLock'),
    );
    expect(order.indexOf('observe:sourceLock')).toBeLessThan(
      order.indexOf('peg-in:source-lock:outputs'),
    );
    expect(mocked.pegInSourceLockPromote).toHaveBeenCalledTimes(1);
    expect(mocked.pegInSourceLockDiscard).not.toHaveBeenCalled();
    expect(mocked.pegInSourceLockOutputObserve).toHaveBeenCalledWith({
      target: executionTarget(),
      batch: currentBatch,
      candidate: expect.any(Object),
      confirmation: expect.objectContaining({
        status: 'confirmed',
        confirmationHeight: 135,
      }),
    });
    expect(result.receipt).toMatchObject({
      status: 'peg_in_source_lock_creation_canonically_confirmed',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
      checks: {
        exactCheckedCandidatePromotedOnce: true,
        sourceFundingRevalidatedImmediatelyBeforeAuthorization: true,
        durableReservationPrecededTransport: true,
        exactLoopbackTransportConsumedCheckedBytesOnce: true,
        canonicalConfirmationObservedByBothNodes: true,
        exactSourceSpentAndOutputsObserved: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        valuePathSubmissionExecuted: true,
        valuePathBroadcastExecuted: true,
        sourceLockCreationConfirmed: true,
        sourceLockStillRefundable: true,
        sourceLockConsumptionEstablished: false,
        reserveLineageEstablished: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
      pegIn: {
        fundingObservation: {
          preTransportReportDigestHex:
            preTransportFundingObservation.reportDigestHex,
          preTransportTipHeight: 133,
        },
        sourceLockExecution: {
          expectedTxId: digest('8'),
          transportStatus: 'accepted',
          durableAttemptDigestHex: digest('5'),
          journalDigestHex: digest('6'),
          outputObservation: {
            status: 'exact_source_spent_and_refundable_outputs_unspent',
          },
        },
      },
    });
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
  });

  it('consumes the confirmed source lock into the exact committed reserve and stops before mint', async () => {
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1(
        pegInRootInput(),
      );

    expect(mocked.pegInSourceLockCheck).not.toHaveBeenCalled();
    expect(mocked.pegInSourceLockRetainingCheck).toHaveBeenCalledTimes(1);
    expect(order.indexOf('peg-in:source-lock:outputs')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:check'),
    );
    expect(order.indexOf('peg-in:committed-vault:check')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:promote'),
    );
    expect(order.indexOf('peg-in:committed-vault:revalidate')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:authorize'),
    );
    expect(order.indexOf('peg-in:committed-vault:authorize')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:journal:reserve'),
    );
    expect(order.indexOf('peg-in:committed-vault:journal:reserve')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:transport'),
    );
    expect(order.indexOf('peg-in:committed-vault:transport')).toBeLessThan(
      order.indexOf('observe:committedVault'),
    );
    expect(order.indexOf('observe:committedVault')).toBeLessThan(
      order.indexOf('peg-in:committed-vault:outputs'),
    );
    expect(mocked.pegInCommittedVaultCheck).toHaveBeenCalledWith({
      reservePredecessorBoxIdHex: digest('a'),
      sourceLockBoxIdHex: digest('b'),
      transitionFeeFundingBoxIdHex: digest('d'),
      unsignedTransaction: expect.objectContaining({ txId: digest('9') }),
    }, executionTarget());
    expect(result.receipt).toMatchObject({
      status: 'peg_in_source_lock_consumed_into_committed_reserve',
      staticExecutionManifestDigestHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_COMMITTED_VAULT_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
      checks: {
        sourceLockConfirmedBeforeCommittedVaultCheck: true,
        exactThreeInputTransitionCheckedAndRevalidated: true,
        freshJvmCheckPrecededAuthorization: true,
        durableReservationPrecededTransport: true,
        exactTransitionInputsSpentAndReserveSuccessorObserved: true,
        returnedValueContainsCapabilities: false,
      },
      boundaries: {
        sourceLockCreationConfirmed: true,
        sourceLockStillRefundable: false,
        sourceLockConsumptionEstablished: true,
        reserveLineageEstablished: true,
        depositCommitmentStateEstablished: true,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
      pegIn: {
        committedVaultCheck: {
          status: 'PASS',
          unsignedTransactionIdHex: digest('9'),
        },
        committedVaultExecution: {
          expectedTxId: digest('9'),
          transportStatus: 'accepted',
          durableAttemptDigestHex: digest('d'),
          journalDigestHex: digest('e'),
          confirmationDigestHex: digest('8'),
          confirmationHeight: 140,
          confirmationHeaderIdHex: digest('7'),
          preTransportObservation: {
            observedTipHeight: 136,
          },
          outputObservation: {
            status:
              'exact_transition_inputs_spent_and_reserve_successor_unspent',
            boundaries: {
              sourceLockConsumptionEstablished: true,
              reserveLineageEstablished: true,
              mintAuthorized: false,
              gate5Closed: false,
            },
          },
        },
      },
    });
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:signedTx|signedCandidate|submissionHandle|mnemonic|privateKey)/iu,
    );
  });

  it('rejects post-check observation after pre-transport authorization', async () => {
    postCheckFundingObservation.target.tipHeight = 134;
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/funding observation is not a fresh setup successor/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects confirmation before pre-transport authorization', async () => {
    preTransportFundingObservation.target.tipHeight = 136;
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/source-lock execution chronology changed/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects confirmation after the managed process final height', async () => {
    processSession.withMiningActiveExecutionTarget.mockImplementationOnce(
      async action => {
        order.push('execution:enter');
        const value = await action(executionTarget());
        order.push('execution:leave');
        return { value, receipt: processReceipt(134) };
      },
    );
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/source-lock execution chronology changed/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects signed material hidden in an opaque candidate subtree', async () => {
    mocked.pegInCandidateBuild.mockImplementationOnce(async input => {
      const candidate = structuredClone(validPegInCandidate(
        input.sourceFundingInput,
        currentBatch.targetBinding,
      )) as any;
      candidate.depositPacket.reserve = {
        signedTransactionBytesHex: 'ab'.repeat(64),
      };
      return candidate;
    });
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/signed or capability material/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects cyclic data hidden in an opaque candidate subtree', async () => {
    mocked.pegInCandidateBuild.mockImplementationOnce(async input => {
      const candidate = structuredClone(validPegInCandidate(
        input.sourceFundingInput,
        currentBatch.targetBinding,
      )) as any;
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      candidate.depositPacket.reserve = cyclic;
      return candidate;
    });
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/must not contain cyclic data/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects a check receipt that is not bound to the exact unsigned transaction', async () => {
    mocked.pegInSourceLockCheck.mockImplementationOnce(async input => ({
      ...validPegInSourceLockCheck(input, currentBatch.targetBinding),
      unsignedTransactionIdHex: digest('0'),
    }));
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/source-lock check binding changed/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects source funding drift after the JVM node check', async () => {
    postCheckFundingObservation.genesisInputs.tracker.value = '999999999';
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/funding changed after source-lock check/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['reused setup input', () => {
      fundingObservation.genesisBoxIds.tracker = digest('1');
      fundingObservation.genesisInputs.tracker.boxId = digest('1');
    }],
    ['wrong target genesis', () => {
      fundingObservation.target.genesisHeaderIdHex = digest('f');
    }],
    ['observation before setup confirmation', () => {
      fundingObservation.target.tipHeight = 121;
    }],
    ['setup transaction output', () => {
      fundingObservation.genesisInputs.tracker.transactionId =
        currentBatch.orderedTransactions[0]!.issuance.unsignedTransactionIdHex;
    }],
  ])('rejects peg-in funding with %s', async (_label, mutate) => {
    mutate();
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/funding observation is not a fresh setup successor/);
    expect(mocked.pegInCandidateBuild).not.toHaveBeenCalled();
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects funding drift after candidate construction', async () => {
    postCandidateFundingObservation.genesisBoxIds.tracker = digest('f');
    postCandidateFundingObservation.genesisInputs.tracker.boxId = digest('f');
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/funding changed after candidate construction/);
    expect(mocked.pegInCandidateBuild).toHaveBeenCalledTimes(1);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects a process receipt bound to another target', async () => {
    processSession.withMiningActiveExecutionTarget.mockImplementationOnce(
      async action => {
        order.push('execution:enter');
        const value = await action(executionTarget());
        order.push('execution:leave');
        return {
          value,
          receipt: {
            ...processReceipt(),
            executionTargetIdentityDigestHex: digest('f'),
          },
        };
      },
    );
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/managed process binding changed/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['alternating accessor', (receipt: Record<PropertyKey, unknown>) => {
      let reads = 0;
      Object.defineProperty(receipt, 'buildIdentityDigestHex', {
        enumerable: true,
        get: () => digest(reads++ === 0 ? '3' : 'f'),
      });
    }],
    ['custom prototype', (receipt: Record<PropertyKey, unknown>) => {
      Object.setPrototypeOf(receipt, { hiddenCapability: () => undefined });
    }],
    ['symbol capability', (receipt: Record<PropertyKey, unknown>) => {
      receipt[Symbol('hidden')] = () => undefined;
    }],
    ['non-enumerable capability', (receipt: Record<PropertyKey, unknown>) => {
      Object.defineProperty(receipt, 'hiddenCapability', {
        enumerable: false,
        value: () => undefined,
      });
    }],
  ])('rejects producer-owned %s data', async (_label, mutate) => {
    const build = validBuild();
    mutate(build.receipt as unknown as Record<PropertyKey, unknown>);
    mocked.build.mockResolvedValueOnce(build);
    await expect(
      runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
        rootInput(),
      ),
    ).rejects.toThrow(/capability-free plain data|custom prototypes|symbol-keyed|enumerable data fields/);
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('rejects setup rollback detected after candidate construction', async () => {
    journalPort.revalidateConfirmed
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1(
        pegInRootInput(),
      ),
    ).rejects.toThrow(/setup changed after peg-in candidate construction/);
    expect(mocked.pegInCandidateBuild).toHaveBeenCalledTimes(1);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid peg-in data before building or starting a target', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInCandidateExecutionRootV1({
        ...(pegInRootInput() as unknown as Record<string, unknown>),
        pegIn: {
          amountNanoErg: '05000000',
          recipientAddressHex: 'b1'.repeat(20),
        },
      } as never),
    ).rejects.toThrow(/amount must be canonical/);
    expect(mocked.build).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('does not authorize a successor when predecessor confirmation fails', async () => {
    const clock = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValue(9 * 60_000 + 1);
    observerPort.observe.mockRejectedValue(
      new Error('dual-node confirmation disagreement'),
    );
    try {
      await expect(
        runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
          rootInput(),
        ),
      ).rejects.toThrow(/confirmation remained unavailable/);
      expect(order.filter(value => value.startsWith('execute:'))).toEqual([
        'execute:tracker',
      ]);
      expect(order).not.toContain('ack:tracker');
      expect(mocked.stateClose).toHaveBeenCalledTimes(1);
      expect(processSession.stop).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });

  it('retains the journal if an unresolved attempt outlives proven node cleanup', async () => {
    const before = localJournalDirectories();
    const clock = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValue(9 * 60_000 + 1);
    observerPort.observe.mockRejectedValue(
      new Error('dual-node confirmation disagreement'),
    );
    processSession.stop.mockRejectedValue(new Error('node termination unproven'));
    try {
      await expect(
        runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
          rootInput(),
        ),
      ).rejects.toThrow(/teardown was incomplete/);
      const retained = [...localJournalDirectories()]
        .filter(directory => !before.has(directory));
      expect(retained).toHaveLength(1);
      expect(order.filter(value => value.startsWith('execute:'))).toEqual([
        'execute:tracker',
      ]);
      expect(order).not.toContain('ack:tracker');
    } finally {
      clock.mockRestore();
      for (const directory of localJournalDirectories()) {
        if (before.has(directory)) continue;
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rejects creation-height drift before any transaction can execute', async () => {
    currentBatch.orderedTransactions[1]!.issuance.predictedStateOutput
      .creationHeight += 1;
    await expect(
      runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
        rootInput(),
      ),
    ).rejects.toThrow(/batch order or anchor changed/);
    expect(mocked.execute).not.toHaveBeenCalled();
    expect(mocked.transport).not.toHaveBeenCalled();
  });

  it('keeps the execution composition static and exposes no injected ports', () => {
    const source = readFileSync(join(
      import.meta.dirname,
      'substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts',
    ), 'utf8');
    expect(source).toContain('const STATIC_EXECUTION_MANIFEST');
    expect(source).toContain(
      'createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
    );
    expect(source).toContain(
      'createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1',
    );
    expect(source).toContain('replacementPortAccepted: false');
    expect(source).not.toMatch(/export interface .*Deps/u);
    expect(source).not.toContain('process.env');
  });

  it('keeps the check receipt parser pinned to the exact static manifest', () => {
    expect(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    ).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    );
  });

  it('keeps the execution receipt parser pinned to the exact static manifest', () => {
    expect(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_EXPECTED_STATIC_MANIFEST_DIGEST_V1,
    ).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
    );
  });
});

function executeThroughPorts(order: string[]) {
  return async (input: any, ports: any) => {
    order.push(`execute:${input.role}`);
    const admission = Object.freeze({
      schema: 'e2s.substrate-federated-local-devnet-genesis-execution.v1',
      ...input,
      inputBoxIds: Object.freeze([...input.inputBoxIds]),
      admissionDigestHex: digest('7'),
    });
    const signedEvidence = await ports.signer.sign(admission);
    const signed = Object.freeze({
      admission,
      signedTransactionDigestHex: signedEvidence.signedTransactionDigestHex,
      signerArtifact: signedEvidence.signerArtifact,
    });
    const checkedEvidence = await ports.checker.check(signed);
    const checked = Object.freeze({
      signed,
      checkResponseDigestHex: checkedEvidence.checkResponseDigestHex,
      checkerArtifact: checkedEvidence.checkerArtifact,
    });
    const postCheckEvidence = await ports.revalidator.revalidate(
      checked,
      'post-check',
    );
    const revalidated = Object.freeze({ checked, postCheckEvidence });
    const preTransportEvidence = await ports.revalidator.revalidate(
      checked,
      'pre-transport',
    );
    const authorizationEvidence = ports.broadcastAuthorizer.authorize(
      revalidated,
      preTransportEvidence,
    );
    const authorization = Object.freeze({
      revalidated,
      preTransportEvidence,
      ...authorizationEvidence,
    });
    const candidate = Object.freeze({ authorization });
    const durableEvidence = ports.journal.reserve(candidate);
    const durable = Object.freeze({
      candidate,
      ...durableEvidence,
    });
    const submission = await ports.transport.submit(durable);
    const finalized = ports.journal.finalize({
      attempt: durable,
      submission,
    });
    return Object.freeze({
      status: submission.status,
      role: input.role,
      expectedTxId: input.expectedTxId,
      submittedTxId: submission.submittedTxId,
      confirmationStatus: 'pending',
      confirmationDigestHex: null,
      transportAttempted: true,
      durableAttemptRecorded: true,
      durableAttemptDigestHex: durable.durableAttemptDigestHex,
      journalDigestHex: finalized.journalDigestHex,
    });
  };
}

function validObserver(order: string[]) {
  const observationCount = new Map<string, number>();
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-genesis-confirmation-observer.v1',
    reconciliationIdentityDigestHex: digest('6'),
    observe: vi.fn(async (expectedTxId: string) => {
      if (expectedTxId === digest('8')) {
        const round = observationCount.get(expectedTxId) ?? 0;
        observationCount.set(expectedTxId, round + 1);
        order.push('observe:sourceLock');
        return {
          ...confirmation(expectedTxId, 3, round),
          confirmationHeight: 135,
          observedAtHeight: 140,
        } as const;
      }
      if (expectedTxId === digest('9')) {
        const round = observationCount.get(expectedTxId) ?? 0;
        observationCount.set(expectedTxId, round + 1);
        order.push('observe:committedVault');
        return {
          ...confirmation(expectedTxId, 4, round),
          confirmationHeight: 138,
          observedAtHeight: 140,
        } as const;
      }
      const index = setupTransactions().findIndex(value =>
        value.issuance.unsignedTransactionIdHex === expectedTxId
      );
      const role = ['tracker', 'duplicatePrevention', 'pooledReserve'][index];
      const round = observationCount.get(expectedTxId) ?? 0;
      observationCount.set(expectedTxId, round + 1);
      order.push(`observe:${role}`);
      return confirmation(expectedTxId, index, round);
    }),
  };
}

function validAuthorizer(order: string[]) {
  let nextOrdinal = 0;
  let pending: string | null = null;
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-genesis-broadcast-authorizer.v1',
    authorize: vi.fn((revalidated: any) => {
      const role = revalidated.checked.signed.admission.role;
      if (pending !== null || role !== ROLE_ORDER[nextOrdinal]) {
        throw new Error('authorization order changed');
      }
      pending = role;
      order.push(`authorize:${role}`);
      return {
        authorizationDigestHex: digest(String(nextOrdinal + 1)),
        authorizationArtifact: {},
      };
    }),
    acknowledgeCanonicalConfirmation: vi.fn((role: string) => {
      if (pending !== role) throw new Error('confirmation role changed');
      order.push(`ack:${role}`);
      pending = null;
      nextOrdinal += 1;
    }),
    nextOrdinal: () => nextOrdinal,
  };
}

function validJournal(order: string[]) {
  return {
    journal: {
      reserve: vi.fn((candidate: any) => {
        const role = candidate.authorization.revalidated.checked.signed
          .admission.role;
        order.push(`journal:reserve:${role}`);
        return {
          durableAttemptDigestHex: digest('4'),
          reconciliationIdentityDigestHex: digest('6'),
          durableArtifact: {},
        };
      }),
      finalize: vi.fn(({ attempt, submission }: any) => {
        const role = attempt.candidate.authorization.revalidated.checked.signed
          .admission.role;
        order.push(`journal:finalize:${role}`);
        return {
          status: submission.status,
          journalDigestHex: digest('5'),
        };
      }),
      confirm: vi.fn(),
    },
    reconcileActive: vi.fn(async () => {
      order.push('journal:reconcile');
      return 'confirmed';
    }),
    revalidateConfirmed: vi.fn(async () => {
      order.push('journal:revalidate');
      return 3;
    }),
  };
}

function validProcessSession(order: string[]) {
  return {
    startMining: vi.fn(async () => {
      order.push('mining:start');
    }),
    withMiningActiveExecutionTarget: vi.fn(async action => {
      order.push('execution:enter');
      const value = await action(executionTarget());
      order.push('execution:leave');
      return { value, receipt: processReceipt() };
    }),
    stop: vi.fn(async () => {
      order.push('process:stop');
    }),
  };
}

function validBuild() {
  return {
    javaExecutablePath: 'reviewed/java.exe',
    nodeAssemblyJarPath: 'reviewed/ergo.jar',
    receipt: {
      schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-build.v1',
      version: 1,
      status: 'exact_locked_patched_node_built',
      toolchain: { javaExecutableSha256Hex: digest('1') },
      build: { artifactSha256Hex: digest('2') },
      buildIdentityDigestHex: digest('3'),
      boundaries: { gate5Closed: false },
    },
  };
}

function processReceipt(finalHeight = 140) {
  return {
    schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1',
    version: 1,
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMiningDuringAction: true,
    witnessReadOnlyDuringAction: true,
    buildIdentityDigestHex: digest('3'),
    executableIdentityDigestHex: digest('4'),
    processBindingDigestHex: digest('5'),
    executionTargetIdentityDigestHex: digest('6'),
    initialSnapshot: {
      network: 'devnet',
      fullHeight: 100,
      indexedHeight: 100,
      headerIdHex: digest('a'),
    },
    finalSnapshot: {
      network: 'devnet',
      fullHeight: finalHeight,
      indexedHeight: finalHeight,
      headerIdHex: digest('b'),
    },
  } as const;
}

function setupBatch() {
  return {
    receipt: { receiptDigestHex: digest('d') },
    request: {
      requestDigestHex: digest('e'),
      target: {
        genesisHeaderIdHex: digest('a'),
        preSetupAnchor: { height: 100, headerIdHex: digest('b') },
        primary: { nodeOrigin: 'http://127.0.0.1:9051' },
        witness: { nodeOrigin: 'http://127.0.0.1:9052' },
      },
    },
    targetBinding: {
      processBindingDigestHex: digest('5'),
      executionTargetIdentityDigestHex: digest('6'),
    },
    familyCompilerBinding: {
      profile: { familyIdHex: digest('f') },
    },
    orderedTransactions: setupTransactions(),
  };
}

function setupTransactions() {
  return [
    setupTransaction(0, 'tracker', '1'),
    setupTransaction(1, 'duplicate-prevention', '2'),
    setupTransaction(2, 'pooled-reserve', '3'),
  ];
}

function setupTransaction(
  ordinal: 0 | 1 | 2,
  role: 'tracker' | 'duplicate-prevention' | 'pooled-reserve',
  character: string,
) {
  const sourceBoxId = digest(character);
  const expectedTxId = digest(String(Number(character) + 3));
  const unsignedTransactionBody = {
    inputs: [{ boxId: sourceBoxId }],
    dataInputs: [],
    outputs: [],
  };
  const signedCandidate = {
    signedTransactionDigestHex: digest(String(Number(character) + 6)),
  };
  return {
    issuance: {
      ordinal,
      role,
      genesisInputBoxIdHex: sourceBoxId,
      unsignedTransactionIdHex: expectedTxId,
      unsignedTransactionBody,
      predictedStateOutput: {
        boxIdHex: digest('a'),
        transactionIdHex: expectedTxId,
        index: 0,
        creationHeight: 100,
        bodyDigestHex: digest('b'),
      },
    },
    signedCandidate,
    checkedAcceptance: {
      submissionHandle: {
        checkResponseDigestHex: digest(String(Number(character) + 7)),
      },
    },
  };
}

function confirmation(expectedTxId: string, index: number, round: number) {
  return {
    status: 'confirmed',
    expectedTxId,
    observedTxId: expectedTxId,
    confirmations: 10,
    confirmationHeight: 110 + index + (round * 10),
    observedAtHeight: 120 + index + (round * 10),
    confirmationHeaderIdHex: digest(String(index + 1 + round)),
    observationDigestHex: digest(String(index + 4 + round)),
    observerArtifact: {},
  } as const;
}

function setupSigner() {
  const publicKeyHex = publicKey('1');
  return {
    publicKeyHex,
    p2pkErgoTreeHex: `0008cd${publicKeyHex}`,
    rewardInputErgoTrees: {
      delay1: '01',
      delay720: '02',
    },
    networkPrefix: 16,
  } as const;
}

function packetSigner() {
  return {
    sourceAttestationThreshold: 2,
    sourceAttestationPublicKeysHex: [
      digest('2'),
      digest('3'),
      digest('4'),
    ],
    ergoAdmissionThreshold: 1,
    ergoAdmissionPublicKeysHex: [setupSigner().publicKeyHex],
  } as const;
}

function executionTarget() {
  return {
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMining: true,
    witnessReadOnly: true,
  } as const;
}

function rootInput() {
  return {
    build: {
      worktreeRoot: 'reviewed/worktree',
      bridgeRoot: 'reviewed/bridge',
      ergoSourcePath: 'reviewed/ergo',
      gitExecutablePath: 'reviewed/git.exe',
      javaExecutablePath: 'reviewed/java.exe',
      sbtLauncherJarPath: 'reviewed/sbt-launch.jar',
    },
    lifecycle: {
      sourceHistory: {},
      relayerArtifacts: {},
    },
  } as never;
}

function pegInRootInput() {
  return {
    ...(rootInput() as unknown as Record<string, unknown>),
    pegIn: {
      amountNanoErg: '5000000',
      recipientAddressHex: 'b1'.repeat(20),
    },
  } as never;
}

function validPegInFundingObservation() {
  const rewardBox = (boxId: string, transactionId: string, index: number) => ({
    boxId,
    value: '1000000000',
    ergoTree: '00',
    assets: [],
    additionalRegisters: {},
    creationHeight: 50 + index,
    transactionId,
    index,
  });
  return {
    reportDigestHex: digest('c'),
    observedAt: '2026-08-18T09:00:00.000Z',
    sources: {
      primaryNodeOrigin: 'http://127.0.0.1:9051',
      witnessNodeOrigin: 'http://127.0.0.1:9052',
    },
    target: {
      genesisHeaderIdHex: digest('a'),
      tipHeight: 130,
      tipHeaderIdHex: digest('b'),
    },
    signer: {
      publicKeyHex: setupSigner().publicKeyHex,
      p2pkErgoTreeHex: setupSigner().p2pkErgoTreeHex,
    },
    genesisBoxIds: {
      tracker: digest('c'),
      duplicatePrevention: digest('d'),
      pooledReserve: digest('e'),
    },
    genesisInputs: {
      tracker: rewardBox(digest('c'), digest('7'), 0),
      duplicatePrevention: rewardBox(digest('d'), digest('8'), 0),
      pooledReserve: rewardBox(digest('e'), digest('9'), 0),
    },
  };
}

function validFamilyProfile() {
  return {
    sourceNetworkIdHex: digest('1'),
    sidechainIdHex: digest('2'),
    bridgeAddressHex: '03'.repeat(20),
    tokenAddressHex: '04'.repeat(20),
    settlementProfileIdHex: digest('5'),
    settlementAssetIdHex: digest('6'),
  };
}

function validPegInCandidate(
  sourceFundingInput: Record<string, unknown>,
  targetBinding: Readonly<{
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
  }>,
) {
  const eip12Box = (
    boxId: string,
    transactionId: string,
    index: number,
  ) => ({
    boxId,
    value: '5000000',
    ergoTree: '00',
    assets: [],
    additionalRegisters: {},
    creationHeight: 130,
    transactionId,
    index,
  });
  const reservePredecessor = eip12Box(digest('a'), digest('6'), 0);
  const sourceLock = eip12Box(digest('b'), digest('8'), 0);
  const transitionFeeFunding = eip12Box(digest('d'), digest('8'), 1);
  const sourceChange = eip12Box(digest('c'), digest('8'), 2);
  const sourceMinerFee = eip12Box(digest('e'), digest('8'), 3);
  const reserveSuccessor = eip12Box(digest('f'), digest('9'), 0);
  const transitionMinerFee = eip12Box(digest('0'), digest('9'), 1);
  const asOutputCandidate = (
    box: ReturnType<typeof eip12Box>,
  ) => ({
    value: box.value,
    ergoTree: box.ergoTree,
    assets: box.assets,
    additionalRegisters: box.additionalRegisters,
    creationHeight: box.creationHeight,
  });
  const sourceLockCreation = {
    txId: digest('8'),
    eip12Tx: {
      inputs: [{ ...structuredClone(sourceFundingInput), extension: {} }],
      dataInputs: [],
      outputs: [
        asOutputCandidate(sourceLock),
        asOutputCandidate(transitionFeeFunding),
        asOutputCandidate(sourceChange),
        asOutputCandidate(sourceMinerFee),
      ],
    },
    outputs: [
      sourceLock,
      transitionFeeFunding,
      sourceChange,
      sourceMinerFee,
    ],
  };
  const reserveTransition = {
    txId: digest('9'),
    eip12Tx: {
      inputs: [
        { ...reservePredecessor, extension: { '0': '0e20' } },
        { ...sourceLock, extension: {} },
        { ...transitionFeeFunding, extension: {} },
      ],
      dataInputs: [],
      outputs: [
        asOutputCandidate(reserveSuccessor),
        asOutputCandidate(transitionMinerFee),
      ],
    },
    outputs: [reserveSuccessor, transitionMinerFee],
  };
  return {
    schema: 'e2s.substrate-federated-isolated-devnet-peg-in-candidate.v1',
    version: 1,
    status: 'unsigned_non_authorizing_candidate',
    candidateDigestHex: digest('7'),
    target: { ...targetBinding },
    depositPacket: {
      boxes: {
        sourceFundingInput: structuredClone(sourceFundingInput),
        reservePredecessor,
        sourceLock,
        transitionFeeFunding,
        reserveSuccessor,
      },
      transactions: { sourceLockCreation, reserveTransition },
    },
    boundaries: {
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    },
  };
}

function validPegInSourceLockCheck(
  input: Readonly<{
    sourceFundingBoxIdHex: string;
    unsignedTransaction: Readonly<{ txId: string }>;
  }>,
  targetBinding: Readonly<{
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
  }>,
) {
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check.v1',
    version: 1,
    status: 'PASS',
    sourceFundingBoxIdHex: input.sourceFundingBoxIdHex,
    unsignedTransactionIdHex: input.unsignedTransaction.txId,
    unsignedTransactionDigestHex: digest('1'),
    signedTransactionIdHex: input.unsignedTransaction.txId,
    signedTransactionCanonicalJsonSha256Hex: digest('2'),
    signedTransactionBytesSha256Hex: digest('3'),
    signedTransactionBytesLength: 500,
    checkResponseSha256Hex: digest('4'),
    target: { ...targetBinding },
    signer: {
      derivation: 'wasm-root',
      publicKeyHex: setupSigner().publicKeyHex,
      p2pkErgoTreeHex: setupSigner().p2pkErgoTreeHex,
      stateContextTipHeight: 131,
      stateContextTipIdHex: digest('e'),
    },
    checker: {
      nodeOrigin: 'http://127.0.0.1:9051',
      path: '/transactions/check',
      method: 'POST',
      transportPolicy: 'no-redirect-no-proxy',
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true,
      exactProcessOwnedTargetBound: true,
      exactTransactionAndSourceBoxBound: true,
      localWasmRootSigningPerformed: true,
      localJvmNodeCheckPassed: true,
      signedTransactionBytesPersisted: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
    receiptDigestHex: digest('5'),
  } as const;
}

function validPegInSourceLockExecutionCheck(
  receipt: ReturnType<typeof validPegInSourceLockCheck>,
) {
  const signedCandidate = Object.freeze({
    profile: 'synthetic-source-lock-signed-candidate',
    txId: receipt.signedTransactionIdHex,
    signedTransactionDigestHex:
      receipt.signedTransactionCanonicalJsonSha256Hex,
  });
  const submissionHandle = Object.freeze({
    profile: 'synthetic-source-lock-submission-handle',
    checkResponseDigestHex: receipt.checkResponseSha256Hex,
  });
  return Object.freeze({
    receipt,
    signedCandidate,
    checkedAcceptance: Object.freeze({
      checked: Object.freeze({ status: 'PASS' }),
      submissionHandle,
    }),
  });
}

function validPegInSourceLockOutputObservation() {
  return Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-output-observation.v1',
    version: 1,
    status: 'exact_source_spent_and_refundable_outputs_unspent',
    expectedTxId: digest('8'),
    observationDigestHex: digest('9'),
    boundaries: Object.freeze({
      sourceFundingSpent: true,
      sourceLockUnspentAndRefundable: true,
      transitionFeeFundingUnspent: true,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    }),
  } as const);
}

function validPegInCommittedVaultCheck(
  input: Readonly<{
    reservePredecessorBoxIdHex: string;
    sourceLockBoxIdHex: string;
    transitionFeeFundingBoxIdHex: string;
    unsignedTransaction: Readonly<{ txId: string }>;
  }>,
  targetBinding: Readonly<{
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
  }>,
) {
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-check.v1',
    version: 1,
    status: 'PASS',
    reservePredecessorBoxIdHex: input.reservePredecessorBoxIdHex,
    sourceLockBoxIdHex: input.sourceLockBoxIdHex,
    transitionFeeFundingBoxIdHex: input.transitionFeeFundingBoxIdHex,
    unsignedTransactionIdHex: input.unsignedTransaction.txId,
    unsignedTransactionDigestHex: digest('1'),
    signedTransactionIdHex: input.unsignedTransaction.txId,
    signedTransactionCanonicalJsonSha256Hex: digest('2'),
    signedTransactionBytesSha256Hex: digest('3'),
    signedTransactionBytesLength: 750,
    checkResponseSha256Hex: digest('4'),
    target: { ...targetBinding },
    signer: {
      derivation: 'wasm-root',
      publicKeyHex: setupSigner().publicKeyHex,
      p2pkErgoTreeHex: setupSigner().p2pkErgoTreeHex,
      stateContextTipHeight: 136,
      stateContextTipIdHex: digest('2'),
    },
    checker: {
      nodeOrigin: 'http://127.0.0.1:9051',
      path: '/transactions/check',
      method: 'POST',
      transportPolicy: 'no-redirect-no-proxy',
    },
    boundaries: {
      localSyntheticCompatibilityOnly: true,
      exactProcessOwnedTargetBound: true,
      exactThreeInputTransitionBound: true,
      localWasmRootSigningPerformed: true,
      localJvmNodeCheckPassed: true,
      signedTransactionBytesPersisted: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
    receiptDigestHex: digest('5'),
  } as const;
}

function validPegInCommittedVaultExecutionCheck(
  receipt: ReturnType<typeof validPegInCommittedVaultCheck>,
) {
  const signedCandidate = Object.freeze({
    profile: 'synthetic-committed-vault-signed-candidate',
    txId: receipt.signedTransactionIdHex,
    signedTransactionDigestHex:
      receipt.signedTransactionCanonicalJsonSha256Hex,
  });
  const submissionHandle = Object.freeze({
    profile: 'synthetic-committed-vault-submission-handle',
    checkResponseDigestHex: receipt.checkResponseSha256Hex,
  });
  return Object.freeze({
    receipt,
    signedCandidate,
    checkedAcceptance: Object.freeze({
      checked: Object.freeze({ status: 'PASS' }),
      submissionHandle,
    }),
  });
}

function validPegInCommittedVaultPreTransportObservation() {
  return Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-pre-transport-observation.v1',
    version: 1,
    status: 'exact_transition_inputs_unspent_and_dual_node_equal',
    expectedTxId: digest('9'),
    reservePredecessorBoxIdHex: digest('a'),
    sourceLockBoxIdHex: digest('b'),
    transitionFeeFundingBoxIdHex: digest('d'),
    sourceLockConfirmationHeight: 135,
    sourceLockConfirmationDigestHex: digest('9'),
    observedTipHeight: 136,
    observedTipHeaderIdHex: digest('2'),
    processBindingDigestHex: digest('5'),
    executionTargetIdentityDigestHex: digest('6'),
    primaryObservationDigestHex: digest('7'),
    witnessObservationDigestHex: digest('7'),
    boundaries: Object.freeze({
      exactDualLoopbackNodesAgreed: true,
      originalSourceFundingRemainsSpent: true,
      exactReservePredecessorUnspent: true,
      exactSourceLockUnspent: true,
      exactTransitionFeeFundingUnspent: true,
      sourceLockConsumptionEstablished: false,
      reserveLineageEstablished: false,
      mintAuthorized: false,
    }),
    observationDigestHex: digest('8'),
  } as const);
}

function validPegInCommittedVaultOutputObservation(
  exactConfirmation = confirmation(digest('9'), 4, 0),
) {
  return Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-output-observation.v1',
    version: 1,
    status: 'exact_transition_inputs_spent_and_reserve_successor_unspent',
    expectedTxId: digest('9'),
    sourceFundingBoxIdHex: digest('c'),
    reservePredecessorBoxIdHex: digest('a'),
    sourceLockBoxIdHex: digest('b'),
    transitionFeeFundingBoxIdHex: digest('d'),
    reserveSuccessorBoxIdHex: digest('f'),
    confirmationHeight: exactConfirmation.confirmationHeight,
    confirmationHeaderIdHex: exactConfirmation.confirmationHeaderIdHex,
    confirmationObservationDigestHex: exactConfirmation.observationDigestHex,
    observedTipHeight: exactConfirmation.observedAtHeight,
    observedTipHeaderIdHex: exactConfirmation.confirmationHeaderIdHex,
    processBindingDigestHex: digest('5'),
    executionTargetIdentityDigestHex: digest('6'),
    primaryObservationDigestHex: digest('7'),
    witnessObservationDigestHex: digest('7'),
    boundaries: Object.freeze({
      exactDualLoopbackNodesAgreed: true,
      originalSourceFundingRemainsSpent: true,
      exactReservePredecessorSpent: true,
      exactSourceLockSpent: true,
      exactTransitionFeeFundingSpent: true,
      exactReserveSuccessorUnspent: true,
      sourceLockConsumptionEstablished: true,
      reserveLineageEstablished: true,
      depositCommitmentStateEstablished: true,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    }),
    observationDigestHex: digest('9'),
  } as const);
}

const ROLE_ORDER = [
  'tracker',
  'duplicatePrevention',
  'pooledReserve',
] as const;

function digest(character: string): string {
  return character.repeat(64);
}

function publicKey(character: string): string {
  return `02${character.repeat(64)}`;
}

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (Array.isArray(value)) return value.some(containsFunction);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(containsFunction);
  }
  return false;
}

function localJournalDirectories(): ReadonlySet<string> {
  return new Set(
    readdirSync(tmpdir(), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('e2s-fed6lab-'))
      .map(entry => join(tmpdir(), entry.name)),
  );
}
