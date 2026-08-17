import { describe, expect, it, vi } from 'vitest';

import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  admitSubstrateFederatedLocalDevnetGenesisExecutionV1,
  assertSubstrateFederatedLocalDevnetGenesisDurableAttemptV1,
  executeSubstrateFederatedLocalDevnetGenesisV1,
  type SubstrateFederatedLocalDevnetGenesisExecutionInput,
  type SubstrateFederatedLocalDevnetGenesisExecutionPorts,
  type SubstrateFederatedLocalDevnetGenesisSubmission,
} from './substrate-federated-local-devnet-genesis-execution-v1.js';

const hex = (byte: string): string => byte.repeat(32);

const PLAN_DIGEST = hex('01');
const GENESIS_HEADER_ID = hex('02');
const EXPECTED_TX_ID = hex('03');
const SOURCE_BOX_ID = hex('04');
const SIGNED_DIGEST = hex('05');
const CHECK_DIGEST = hex('06');
const POST_CHECK_DIGEST = hex('07');
const PRE_TRANSPORT_DIGEST = hex('08');
const AUTHORIZATION_DIGEST = hex('09');
const ATTEMPT_DIGEST = hex('0a');
const RESPONSE_DIGEST = hex('0b');
const JOURNAL_DIGEST = hex('0c');
const CONFIRMATION_DIGEST = hex('0d');
const CONFIRMATION_HEADER_ID = hex('0e');

function input(
  patch: Partial<SubstrateFederatedLocalDevnetGenesisExecutionInput> = {},
): SubstrateFederatedLocalDevnetGenesisExecutionInput {
  return {
    role: 'tracker',
    planDigestHex: PLAN_DIGEST,
    targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
    expectedTxId: EXPECTED_TX_ID,
    sourceBoxId: SOURCE_BOX_ID,
    attemptedAtHeight: 720,
    nodeOrigin: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    unsignedTransaction: Object.freeze({ inputs: [{ boxId: SOURCE_BOX_ID }] }),
    ...patch,
  };
}

interface FixtureOptions {
  readonly signingRejected?: boolean;
  readonly checkRejected?: boolean;
  readonly revalidationFailurePhase?: 'post-check' | 'pre-transport';
  readonly submission?: SubstrateFederatedLocalDevnetGenesisSubmission | null;
  readonly transportThrows?: boolean;
  readonly confirmation?: Awaited<
    ReturnType<
      SubstrateFederatedLocalDevnetGenesisExecutionPorts['confirmationObserver']['observe']
    >
  >;
}

function fixture(options: FixtureOptions = {}) {
  const events: string[] = [];
  let reserved = false;
  const reserve = vi.fn<
    SubstrateFederatedLocalDevnetGenesisExecutionPorts['journal']['reserve']
  >(candidate => {
    events.push('reserve');
    reserved = true;
    return {
      durableAttemptDigestHex: ATTEMPT_DIGEST,
      durableArtifact: Object.freeze({ candidate }),
    };
  });
  const submit = vi.fn<
    SubstrateFederatedLocalDevnetGenesisExecutionPorts['transport']['submit']
  >(async () => {
    events.push('submit');
    expect(reserved).toBe(true);
    if (options.transportThrows) throw new Error('transport outcome unknown');
    if (Object.hasOwn(options, 'submission')) return options.submission ?? null;
    return {
      status: 'accepted',
      submittedTxId: EXPECTED_TX_ID,
      responseDigestHex: RESPONSE_DIGEST,
    };
  });
  const finalize = vi.fn<
    SubstrateFederatedLocalDevnetGenesisExecutionPorts['journal']['finalize']
  >(({ submission }) => {
    events.push(`finalize:${submission.status}`);
    return { status: submission.status, journalDigestHex: JOURNAL_DIGEST };
  });
  const confirm = vi.fn<
    SubstrateFederatedLocalDevnetGenesisExecutionPorts['journal']['confirm']
  >(() => {
    events.push('confirm');
  });
  const observe = vi.fn<
    SubstrateFederatedLocalDevnetGenesisExecutionPorts['confirmationObserver']['observe']
  >(async () => {
    events.push('observe-confirmation');
    if (Object.hasOwn(options, 'confirmation')) {
      return options.confirmation ?? null;
    }
    return {
      status: 'confirmed',
      confirmations: 10,
      observedAtHeight: 731,
      observationDigestHex: CONFIRMATION_DIGEST,
      confirmationHeight: 722,
      confirmationHeaderIdHex: CONFIRMATION_HEADER_ID,
    };
  });
  const ports: SubstrateFederatedLocalDevnetGenesisExecutionPorts = {
    signer: {
      sign: vi.fn(async () => {
        events.push('sign');
        if (options.signingRejected) return null;
        return {
          signedTransactionDigestHex: SIGNED_DIGEST,
          signerArtifact: Object.freeze({ stage: 'signed' }),
        };
      }),
    },
    checker: {
      check: vi.fn(async () => {
        events.push('check');
        if (options.checkRejected) return null;
        return {
          checkResponseDigestHex: CHECK_DIGEST,
          checkerArtifact: Object.freeze({ stage: 'checked' }),
        };
      }),
    },
    revalidator: {
      revalidate: vi.fn(async (_checked, phase) => {
        events.push(`revalidate:${phase}`);
        if (options.revalidationFailurePhase === phase) {
          throw new Error(`${phase} source observation rejected`);
        }
        return {
          sourceBoxId: SOURCE_BOX_ID,
          sourceBoxUnspent: true as const,
          targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
          observedAtHeight: phase === 'post-check' ? 720 : 721,
          observationDigestHex: phase === 'post-check'
            ? POST_CHECK_DIGEST
            : PRE_TRANSPORT_DIGEST,
        };
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
    journal: { reserve, finalize, confirm },
    transport: { submit },
    confirmationObserver: { observe },
  };
  return { events, ports, reserve, submit, finalize, confirm, observe };
}

describe('substrate federated local-devnet genesis execution V1', () => {
  it('orders two source checks, durable reservation, transport, and confirmation', async () => {
    const flow = fixture();

    await expect(
      executeSubstrateFederatedLocalDevnetGenesisV1(input(), flow.ports),
    ).resolves.toEqual({
      status: 'accepted',
      role: 'tracker',
      expectedTxId: EXPECTED_TX_ID,
      submittedTxId: EXPECTED_TX_ID,
      confirmationStatus: 'confirmed',
      confirmationDigestHex: CONFIRMATION_DIGEST,
      transportAttempted: true,
      durableAttemptRecorded: true,
      durableAttemptDigestHex: ATTEMPT_DIGEST,
      journalDigestHex: JOURNAL_DIGEST,
    });
    expect(flow.events).toEqual([
      'sign',
      'check',
      'revalidate:post-check',
      'revalidate:pre-transport',
      'authorize',
      'reserve',
      'submit',
      'finalize:accepted',
      'observe-confirmation',
      'confirm',
    ]);
  });

  it('does not grant durable-attempt provenance to a structural clone', async () => {
    const flow = fixture();
    vi.mocked(flow.ports.transport.submit).mockImplementation(async attempt => {
      expect(() => assertSubstrateFederatedLocalDevnetGenesisDurableAttemptV1({
        ...attempt,
      })).toThrow(/lacks process provenance/);
      return {
        status: 'accepted',
        submittedTxId: EXPECTED_TX_ID,
        responseDigestHex: RESPONSE_DIGEST,
      };
    });

    await expect(
      executeSubstrateFederatedLocalDevnetGenesisV1(input(), flow.ports),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it.each([
    {
      name: 'signing rejection',
      options: { signingRejected: true },
      events: ['sign'],
      status: 'signing_rejected',
    },
    {
      name: 'check rejection',
      options: { checkRejected: true },
      events: ['sign', 'check'],
      status: 'check_rejected',
    },
  ])('does not reserve or transport after $name', async ({
    options,
    events,
    status,
  }) => {
    const flow = fixture(options);
    const result = await executeSubstrateFederatedLocalDevnetGenesisV1(
      input(),
      flow.ports,
    );

    expect(result).toEqual({
      status,
      role: 'tracker',
      expectedTxId: EXPECTED_TX_ID,
      transportAttempted: false,
    });
    expect(flow.events).toEqual(events);
    expect(flow.reserve).not.toHaveBeenCalled();
    expect(flow.submit).not.toHaveBeenCalled();
  });

  it.each(['post-check', 'pre-transport'] as const)(
    'does not authorize or reserve when %s source revalidation fails',
    async phase => {
      const flow = fixture({ revalidationFailurePhase: phase });

      await expect(
        executeSubstrateFederatedLocalDevnetGenesisV1(input(), flow.ports),
      ).rejects.toThrow(new RegExp(`${phase} source observation rejected`));
      expect(flow.events).toEqual(
        phase === 'post-check'
          ? ['sign', 'check', 'revalidate:post-check']
          : [
              'sign',
              'check',
              'revalidate:post-check',
              'revalidate:pre-transport',
            ],
      );
      expect(flow.reserve).not.toHaveBeenCalled();
      expect(flow.submit).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: 'a null transport result',
      options: { submission: null, confirmation: null },
    },
    {
      name: 'a thrown transport result',
      options: { transportThrows: true, confirmation: null },
    },
  ])('durably records $name as ambiguous', async ({ options }) => {
    const flow = fixture(options);

    await expect(
      executeSubstrateFederatedLocalDevnetGenesisV1(input(), flow.ports),
    ).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTxId: null,
      confirmationStatus: 'unavailable',
      durableAttemptRecorded: true,
    });
    expect(flow.finalize).toHaveBeenCalledWith(expect.objectContaining({
      submission: expect.objectContaining({ status: 'ambiguous' }),
    }));
    expect(flow.confirm).not.toHaveBeenCalled();
  });

  it('reconciles an ambiguous response when the exact transaction is confirmed', async () => {
    const flow = fixture({
      submission: {
        status: 'ambiguous',
        submittedTxId: null,
        responseDigestHex: RESPONSE_DIGEST,
      },
    });

    await expect(
      executeSubstrateFederatedLocalDevnetGenesisV1(input(), flow.ports),
    ).resolves.toMatchObject({
      status: 'reconciled',
      submittedTxId: EXPECTED_TX_ID,
      confirmationStatus: 'confirmed',
    });
  });

  it('retains an explicit transport rejection without claiming submission', async () => {
    const flow = fixture({
      submission: {
        status: 'rejected',
        submittedTxId: null,
        responseDigestHex: RESPONSE_DIGEST,
      },
      confirmation: {
        status: 'not_found',
        confirmations: 0,
        observedAtHeight: 721,
        observationDigestHex: CONFIRMATION_DIGEST,
        confirmationHeight: null,
        confirmationHeaderIdHex: null,
      },
    });

    await expect(
      executeSubstrateFederatedLocalDevnetGenesisV1(input(), flow.ports),
    ).resolves.toMatchObject({
      status: 'rejected',
      submittedTxId: null,
      confirmationStatus: 'not_found',
      durableAttemptRecorded: true,
    });
    expect(flow.events).toContain('finalize:rejected');
    expect(flow.confirm).not.toHaveBeenCalled();
  });

  it('fails closed when an explicit rejection conflicts with canonical confirmation', async () => {
    const flow = fixture({
      submission: {
        status: 'rejected',
        submittedTxId: null,
        responseDigestHex: RESPONSE_DIGEST,
      },
    });

    await expect(
      executeSubstrateFederatedLocalDevnetGenesisV1(input(), flow.ports),
    ).rejects.toThrow(/rejection conflicts with canonical confirmation/);
    expect(flow.confirm).not.toHaveBeenCalled();
  });

  it('retains a pending observation without claiming confirmation', async () => {
    const flow = fixture({
      confirmation: {
        status: 'pending',
        confirmations: 2,
        observedAtHeight: 723,
        observationDigestHex: CONFIRMATION_DIGEST,
        confirmationHeight: null,
        confirmationHeaderIdHex: null,
      },
    });

    await expect(
      executeSubstrateFederatedLocalDevnetGenesisV1(input(), flow.ports),
    ).resolves.toMatchObject({
      status: 'accepted',
      submittedTxId: EXPECTED_TX_ID,
      confirmationStatus: 'pending',
      confirmationDigestHex: CONFIRMATION_DIGEST,
    });
    expect(flow.confirm).not.toHaveBeenCalled();
  });

  it('rejects target, role, and confirmation drift', async () => {
    expect(() => admitSubstrateFederatedLocalDevnetGenesisExecutionV1(input({
      nodeOrigin: 'http://127.0.0.1:9052' as never,
    }))).toThrow(/exact loopback primary/);
    expect(() => admitSubstrateFederatedLocalDevnetGenesisExecutionV1(input({
      role: 'other' as never,
    }))).toThrow(/unknown federated/);

    const changedSource = fixture();
    vi.mocked(changedSource.ports.revalidator.revalidate).mockResolvedValue({
      sourceBoxId: hex('ff'),
      sourceBoxUnspent: true,
      targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
      observedAtHeight: 720,
      observationDigestHex: POST_CHECK_DIGEST,
    });
    await expect(executeSubstrateFederatedLocalDevnetGenesisV1(
      input(),
      changedSource.ports,
    )).rejects.toThrow(/changed the admitted source or target/);

    const shallow = fixture({
      confirmation: {
        status: 'confirmed',
        confirmations: 9,
        observedAtHeight: 730,
        observationDigestHex: CONFIRMATION_DIGEST,
        confirmationHeight: 722,
        confirmationHeaderIdHex: CONFIRMATION_HEADER_ID,
      },
    });
    await expect(executeSubstrateFederatedLocalDevnetGenesisV1(
      input(),
      shallow.ports,
    )).rejects.toThrow(/lacks consistent final depth/);
  });
});
