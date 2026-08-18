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
}));
vi.mock('../../substrate-federated-local-devnet-genesis-journal-v1.js', () => ({
  createSubstrateFederatedLocalDevnetGenesisJournalV1: mocked.journal,
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
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_STATIC_EXECUTION_MANIFEST_DIGEST_V1,
} from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';

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
      order.push('ergo:rewards:peg-in:revalidate');
      return postCandidateFundingObservation;
    });
    mocked.rewardDiscoveryAssert.mockImplementation(value => {
      order.push('peg-in:funding:assert');
      if (
        value !== fundingObservation
        && value !== postCandidateFundingObservation
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

function processReceipt() {
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
      fullHeight: 140,
      indexedHeight: 140,
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
  return {
    schema: 'e2s.substrate-federated-isolated-devnet-peg-in-candidate.v1',
    version: 1,
    status: 'unsigned_non_authorizing_candidate',
    candidateDigestHex: digest('7'),
    target: { ...targetBinding },
    depositPacket: {
      boxes: { sourceFundingInput: structuredClone(sourceFundingInput) },
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
