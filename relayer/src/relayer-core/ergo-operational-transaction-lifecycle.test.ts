import { describe, expect, it, vi } from 'vitest';

import {
  DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
  DUP_HEARTBEAT_OPERATION_PROFILE,
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  SCS_ORACLE_UPDATE_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_FEE_FUNDING_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_V2_OPERATION_PROFILE,
  admitErgoOperationalTransaction,
  executeErgoOperationalTransaction,
  type ErgoOperationalSubmission,
  type ErgoOperationalTransactionExecutionPorts,
  type ErgoOperationalTransactionInput,
} from './ergo-operational-transaction-lifecycle.js';

const hex = (byte: string): string => byte.repeat(32);

const EXPECTED_TX_ID = hex('01');
const SOURCE_BOX_ID = hex('02');
const FEE_BOX_ID = hex('03');
const SIGNED_TX_DIGEST = hex('04');
const CHECK_RESPONSE_DIGEST = hex('05');
const REVALIDATION_DIGEST = hex('06');
const AUTHORIZATION_DIGEST = hex('07');
const DURABLE_ATTEMPT_DIGEST = hex('08');
const RESPONSE_DIGEST = hex('09');
const JOURNAL_DIGEST = hex('0a');
const HEARTBEAT_KEY = hex('0b');

function input(
  patch: Partial<ErgoOperationalTransactionInput> = {},
): ErgoOperationalTransactionInput {
  return {
    operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    expectedTxId: EXPECTED_TX_ID,
    sourceBoxId: SOURCE_BOX_ID,
    inputBoxIds: [SOURCE_BOX_ID, FEE_BOX_ID],
    attemptedAtHeight: 120,
    targetSidechainHeight: null,
    heartbeatKeyHex: null,
    unsignedTransaction: Object.freeze({
      inputs: Object.freeze([
        Object.freeze({ boxId: SOURCE_BOX_ID }),
        Object.freeze({ boxId: FEE_BOX_ID }),
      ]),
    }),
    ...patch,
  };
}

interface FixtureOptions {
  readonly signingRejected?: boolean;
  readonly checkRejected?: boolean;
  readonly revalidationRejected?: boolean;
  readonly submission?: ErgoOperationalSubmission | null;
  readonly submissionThrows?: boolean;
}

function fixture(options: FixtureOptions = {}) {
  const events: string[] = [];
  let reserved = false;
  const reserve = vi.fn<ErgoOperationalTransactionExecutionPorts['journal']['reserve']>(
    authorization => {
      events.push('reserve');
      reserved = true;
      return {
        durableAttemptDigestHex: DURABLE_ATTEMPT_DIGEST,
        durableArtifact: Object.freeze({ authorization }),
      };
    },
  );
  const finalize = vi.fn<ErgoOperationalTransactionExecutionPorts['journal']['finalize']>(
    ({ submission }) => {
      events.push(`finalize:${submission.status}`);
      return {
        status: submission.status,
        journalDigestHex: JOURNAL_DIGEST,
      };
    },
  );
  const submit = vi.fn<ErgoOperationalTransactionExecutionPorts['submitter']['submit']>(
    async () => {
      events.push('submit');
      expect(reserved).toBe(true);
      if (options.submissionThrows) throw new Error('transport outcome unknown');
      if (Object.hasOwn(options, 'submission')) return options.submission ?? null;
      return {
        status: 'accepted',
        submittedTxId: EXPECTED_TX_ID,
        responseDigestHex: RESPONSE_DIGEST,
      };
    },
  );
  const ports: ErgoOperationalTransactionExecutionPorts = {
    signer: {
      sign: vi.fn(async () => {
        events.push('sign');
        if (options.signingRejected) return null;
        return {
          nodeOrigin: 'http://127.0.0.1:9052',
          signedTransactionDigestHex: SIGNED_TX_DIGEST,
          signerArtifact: Object.freeze({ stage: 'signed' }),
        };
      }),
    },
    checker: {
      check: vi.fn(async () => {
        events.push('check');
        if (options.checkRejected) return null;
        return {
          checkResponseDigestHex: CHECK_RESPONSE_DIGEST,
          checkerArtifact: Object.freeze({ stage: 'checked' }),
        };
      }),
    },
    revalidator: {
      revalidate: vi.fn(async () => {
        events.push('revalidate');
        if (options.revalidationRejected) {
          throw new Error('route revalidation rejected');
        }
        return { revalidationDigestHex: REVALIDATION_DIGEST };
      }),
    },
    broadcastAuthorizer: {
      authorize: vi.fn(() => {
        events.push('authorize');
        return {
          authorizationDigestHex: AUTHORIZATION_DIGEST,
          authorizationArtifact: Object.freeze({ stage: 'authorized' }),
        };
      }),
    },
    journal: { reserve, finalize },
    submitter: { submit },
  };
  return { events, ports, reserve, finalize, submit };
}

describe('Ergo operational transaction lifecycle', () => {
  it('binds withdrawal V2 to exactly reserve, DUP and fee without granting authority', () => {
    expect(SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_V2_OPERATION_PROFILE)
      .toBe('e2s.substrate-federated-local-devnet-withdrawal-operation.v2');
    const exact = input({
      operationProfile: SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_V2_OPERATION_PROFILE,
      inputBoxIds: [SOURCE_BOX_ID, hex('31'), FEE_BOX_ID],
    });
    const admission = admitErgoOperationalTransaction(exact);
    expect(admission).toMatchObject({
      sourceBoxId: SOURCE_BOX_ID, inputBoxIds: exact.inputBoxIds,
      targetSidechainHeight: null, targetSidechainBlockHashHex: null, heartbeatKeyHex: null,
    });
    expect(Object.isFrozen(admission.inputBoxIds)).toBe(true);
    expect(admission).not.toHaveProperty('authorizationArtifact');
    expect(admission.bindingDigestHex).not.toBe(admitErgoOperationalTransaction({
      ...exact, operationProfile: SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_FEE_FUNDING_OPERATION_PROFILE,
    }).bindingDigestHex);
  });

  it.each([
    { inputBoxIds: [SOURCE_BOX_ID, FEE_BOX_ID] },
    { inputBoxIds: [SOURCE_BOX_ID, hex('31'), FEE_BOX_ID, hex('32')] },
    { inputBoxIds: [SOURCE_BOX_ID, SOURCE_BOX_ID, FEE_BOX_ID] },
    { inputBoxIds: [SOURCE_BOX_ID, hex('31'), SOURCE_BOX_ID] },
    { inputBoxIds: [SOURCE_BOX_ID, FEE_BOX_ID, FEE_BOX_ID] },
    { sourceBoxId: FEE_BOX_ID },
    { targetSidechainHeight: 1 },
    { targetSidechainBlockHashHex: hex('33') },
    { heartbeatKeyHex: HEARTBEAT_KEY },
    { operationProfile: 'e2s.substrate-federated-local-devnet-withdrawal-operation.v1' },
    { operationProfile: 'e2s.substrate-federated-local-devnet-withdrawal-operation.v3' },
  ])('rejects withdrawal V2 shape or context drift %j before capabilities run', async patch => {
    const flow = fixture();
    await expect(executeErgoOperationalTransaction(input({
      operationProfile: SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_V2_OPERATION_PROFILE,
      inputBoxIds: [SOURCE_BOX_ID, hex('31'), FEE_BOX_ID],
      ...patch,
    } as Partial<ErgoOperationalTransactionInput>), flow.ports)).rejects.toThrow(
      /exactly three inputs|must be unique|first input|forbids sidechain|unknown Ergo operational/,
    );
    expect(flow.events).toEqual([]);
  });

  it('binds withdrawal fee funding separately from tracker funding and other operations', () => {
    expect(SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_FEE_FUNDING_OPERATION_PROFILE)
      .toBe('e2s.substrate-federated-local-devnet-withdrawal-fee-funding-operation.v1');
    const admission = admitErgoOperationalTransaction(input({
      operationProfile: SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_FEE_FUNDING_OPERATION_PROFILE,
    }));
    expect(admission).toMatchObject({
      targetSidechainHeight: null, targetSidechainBlockHashHex: null, heartbeatKeyHex: null,
    });
    expect(Object.isFrozen(admission)).toBe(true);
    for (const operationProfile of [
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE,
      PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
      DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    ]) {
      expect(admission.bindingDigestHex).not.toBe(
        admitErgoOperationalTransaction(input({ operationProfile })).bindingDigestHex,
      );
    }
  });

  it.each([
    { targetSidechainHeight: 1 },
    { targetSidechainBlockHashHex: hex('21') },
    { heartbeatKeyHex: HEARTBEAT_KEY },
    { operationProfile: 'e2s.substrate-federated-local-devnet-withdrawal-fee-funding-operation.v2' },
    { operationProfile: 'e2s.substrate-federated-local-devnet-withdrawal-operation.v1' },
    { operationProfile: undefined },
  ])('rejects withdrawal fee funding context or profile drift %j before capabilities run', async patch => {
    const flow = fixture();
    await expect(executeErgoOperationalTransaction(input({
      operationProfile: SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_FEE_FUNDING_OPERATION_PROFILE,
      ...patch,
    } as ErgoOperationalTransactionInput), flow.ports)).rejects.toThrow(
      /forbids sidechain and heartbeat context|unknown Ergo operational transaction profile/,
    );
    expect(flow.events).toEqual([]);
  });

  it('keeps withdrawal fee funding in the exact ordered lifecycle', async () => {
    const flow = fixture();
    await expect(executeErgoOperationalTransaction(input({
      operationProfile: SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_FEE_FUNDING_OPERATION_PROFILE,
    }), flow.ports)).resolves.toMatchObject({ status: 'accepted' });
    expect(flow.events).toEqual([
      'sign', 'check', 'revalidate', 'authorize', 'reserve', 'submit', 'finalize:accepted',
    ]);
  });

  it('binds tracker fee funding to its own profile without acquiring context or authority', () => {
    expect(SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE)
      .toBe('e2s.substrate-federated-local-devnet-tracker-fee-funding-operation.v1');
    const admission = admitErgoOperationalTransaction(input({
      operationProfile: SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE,
    }));
    expect(admission).toMatchObject({
      targetSidechainHeight: null,
      targetSidechainBlockHashHex: null,
      heartbeatKeyHex: null,
    });
    for (const operationProfile of [
      PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
      DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    ]) {
      expect(admission.bindingDigestHex).not.toBe(
        admitErgoOperationalTransaction(input({ operationProfile })).bindingDigestHex,
      );
    }
  });

  it.each([
    { targetSidechainHeight: 1 },
    { targetSidechainBlockHashHex: hex('21') },
    { heartbeatKeyHex: HEARTBEAT_KEY },
  ])('rejects independent tracker fee funding context drift %j before capabilities run', async patch => {
    const flow = fixture();
    await expect(executeErgoOperationalTransaction(input({
      operationProfile: SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE,
      ...patch,
    }), flow.ports)).rejects.toThrow(/forbids sidechain and heartbeat context/);
    expect(flow.events).toEqual([]);
  });

  it('keeps tracker fee funding in the exact ordered lifecycle', async () => {
    const flow = fixture();
    await expect(executeErgoOperationalTransaction(input({
      operationProfile: SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE,
    }), flow.ports)).resolves.toMatchObject({ status: 'accepted' });
    expect(flow.events).toEqual([
      'sign', 'check', 'revalidate', 'authorize', 'reserve', 'submit', 'finalize:accepted',
    ]);
  });

  it('orders every stage and records the durable reservation before transport', async () => {
    const flow = fixture();

    await expect(
      executeErgoOperationalTransaction(input(), flow.ports),
    ).resolves.toEqual({
      status: 'accepted',
      expectedTxId: EXPECTED_TX_ID,
      submittedTxId: EXPECTED_TX_ID,
      durableAttemptRecorded: true,
      durableAttemptDigestHex: DURABLE_ATTEMPT_DIGEST,
      journalDigestHex: JOURNAL_DIGEST,
    });

    expect(flow.events).toEqual([
      'sign',
      'check',
      'revalidate',
      'authorize',
      'reserve',
      'submit',
      'finalize:accepted',
    ]);
  });

  it.each([
    {
      name: 'sign rejection',
      options: { signingRejected: true },
      events: ['sign'],
      result: {
        status: 'signing_rejected',
        expectedTxId: EXPECTED_TX_ID,
        durableAttemptRecorded: false,
      },
    },
    {
      name: 'check rejection',
      options: { checkRejected: true },
      events: ['sign', 'check'],
      result: {
        status: 'check_rejected',
        expectedTxId: EXPECTED_TX_ID,
        durableAttemptRecorded: false,
      },
    },
  ])('does not create a durable row after $name', async ({
    options,
    events,
    result,
  }) => {
    const flow = fixture(options);

    await expect(
      executeErgoOperationalTransaction(input(), flow.ports),
    ).resolves.toEqual(result);
    expect(flow.events).toEqual(events);
    expect(flow.reserve).not.toHaveBeenCalled();
    expect(flow.submit).not.toHaveBeenCalled();
    expect(flow.finalize).not.toHaveBeenCalled();
  });

  it('does not create a durable row when route revalidation fails', async () => {
    const flow = fixture({ revalidationRejected: true });

    await expect(
      executeErgoOperationalTransaction(input(), flow.ports),
    ).rejects.toThrow(/route revalidation rejected/);
    expect(flow.events).toEqual(['sign', 'check', 'revalidate']);
    expect(flow.reserve).not.toHaveBeenCalled();
    expect(flow.submit).not.toHaveBeenCalled();
    expect(flow.finalize).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'an explicit ambiguous response',
      options: {
        submission: {
          status: 'ambiguous' as const,
          submittedTxId: null,
          responseDigestHex: RESPONSE_DIGEST,
        },
      },
    },
    {
      name: 'a null response',
      options: { submission: null },
    },
    {
      name: 'a thrown transport outcome',
      options: { submissionThrows: true },
    },
  ])('finalizes $name as an ambiguous durable outcome', async ({
    options,
  }) => {
    const flow = fixture(options);

    await expect(
      executeErgoOperationalTransaction(input(), flow.ports),
    ).resolves.toEqual({
      status: 'ambiguous',
      expectedTxId: EXPECTED_TX_ID,
      submittedTxId: null,
      durableAttemptRecorded: true,
      durableAttemptDigestHex: DURABLE_ATTEMPT_DIGEST,
      journalDigestHex: JOURNAL_DIGEST,
    });
    expect(flow.events).toEqual([
      'sign',
      'check',
      'revalidate',
      'authorize',
      'reserve',
      'submit',
      'finalize:ambiguous',
    ]);
    expect(flow.finalize).toHaveBeenCalledWith(expect.objectContaining({
      submission: expect.objectContaining({ status: 'ambiguous' }),
    }));
  });

  it('rejects operation-specific context drift before any capability runs', () => {
    expect(() => admitErgoOperationalTransaction(input({
      targetSidechainHeight: 12,
    }))).toThrow(/committed-vault operation forbids/);

    expect(() => admitErgoOperationalTransaction(input({
      operationProfile: SCS_ORACLE_UPDATE_OPERATION_PROFILE,
      targetSidechainHeight: null,
    }))).toThrow(/SCS target sidechain height/);

    expect(() => admitErgoOperationalTransaction(input({
      operationProfile: SCS_ORACLE_UPDATE_OPERATION_PROFILE,
      targetSidechainHeight: 12,
      targetSidechainBlockHashHex: null,
    }))).toThrow(/SCS target sidechain block hash/);

    expect(() => admitErgoOperationalTransaction(input({
      operationProfile: SCS_ORACLE_UPDATE_OPERATION_PROFILE,
      targetSidechainHeight: 12,
      heartbeatKeyHex: HEARTBEAT_KEY,
    }))).toThrow(/SCS oracle operation forbids heartbeat/);

    expect(() => admitErgoOperationalTransaction(input({
      operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
      heartbeatKeyHex: null,
    }))).toThrow(/DUP heartbeat key/);

    expect(() => admitErgoOperationalTransaction(input({
      operationProfile: DUP_HEARTBEAT_OPERATION_PROFILE,
      targetSidechainHeight: 12,
      heartbeatKeyHex: HEARTBEAT_KEY,
    }))).toThrow(/DUP heartbeat operation forbids SCS/);

    expect(admitErgoOperationalTransaction(input({
      operationProfile: DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
    }))).toMatchObject({
      operationProfile: DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
      targetSidechainHeight: null,
      targetSidechainBlockHashHex: null,
      heartbeatKeyHex: null,
    });

    expect(() => admitErgoOperationalTransaction(input({
      operationProfile: DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
      heartbeatKeyHex: HEARTBEAT_KEY,
    }))).toThrow(/local devnet operational profile forbids/);

    expect(admitErgoOperationalTransaction(input({
      operationProfile:
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
    }))).toMatchObject({
      operationProfile:
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      targetSidechainHeight: null,
      targetSidechainBlockHashHex: null,
      heartbeatKeyHex: null,
    });

    expect(() => admitErgoOperationalTransaction(input({
      operationProfile:
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      heartbeatKeyHex: HEARTBEAT_KEY,
    }))).toThrow(/local devnet operational profile forbids/);
  });
});
