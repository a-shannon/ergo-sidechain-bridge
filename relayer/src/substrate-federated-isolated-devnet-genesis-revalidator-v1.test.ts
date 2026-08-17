import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSource: vi.fn(),
  assertHandleBinding: vi.fn(),
  assertHandleProvenance: vi.fn(),
  assertTarget: vi.fn(),
  assertBatch: vi.fn(),
  validateBoxPair: vi.fn(),
}));

vi.mock('./authenticated-spv-tracker-read-only-node-client.js', () => ({
  createBoundedAuthenticatedSpvTrackerReadOnlySource: mocks.createSource,
}));

vi.mock('./fleet-signer.js', () => ({
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding:
    mocks.assertHandleBinding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance:
    mocks.assertHandleProvenance,
}));

vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1:
    mocks.assertTarget,
}));

vi.mock('./substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2:
    mocks.assertBatch,
}));

vi.mock('./substrate-federated-genesis-observation-v1.js', () => ({
  validateSubstrateFederatedGenesisBoxPairV1: mocks.validateBoxPair,
}));

import {
  assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1,
  createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1,
} from './substrate-federated-isolated-devnet-genesis-revalidator-v1.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA,
  deriveSubstrateFederatedLocalDevnetGenesisAdmissionDigestV1,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

const hex = (byte: string): string => byte.repeat(32);
const REQUEST_DIGEST = hex('11');
const GENESIS_HEADER_ID = hex('22');
const TIP_HEADER_ID = hex('23');
const PROCESS_BINDING = hex('31');
const EXECUTION_IDENTITY = hex('32');
const SIGNED_DIGEST = hex('41');
const CHECK_DIGEST = hex('42');
const PRIMARY_ORIGIN = 'http://127.0.0.1:9051';
const WITNESS_ORIGIN = 'http://127.0.0.1:9052';
const BINDING = Object.freeze({
  processBindingDigestHex: PROCESS_BINDING,
  executionTargetIdentityDigestHex: EXECUTION_IDENTITY,
});
const TARGET = Object.freeze({
  primaryNodeOrigin: PRIMARY_ORIGIN,
  witnessNodeOrigin: WITNESS_ORIGIN,
  primaryMining: true as const,
  witnessReadOnly: true as const,
});

type SetupRole = 'tracker' | 'duplicate-prevention' | 'pooled-reserve';

function box(byte: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    boxId: hex(byte),
    value: '1000000000',
    ergoTree: '00',
    assets: Object.freeze([]),
    additionalRegisters: Object.freeze({}),
    creationHeight: 100,
    transactionId: hex('90'),
    index: 0,
  });
}

function transaction(
  role: SetupRole,
  ordinal: 0 | 1 | 2,
  inputBox: Readonly<Record<string, unknown>>,
  txByte: string,
) {
  const unsignedTransactionIdHex = hex(txByte);
  const unsignedTransactionBody = Object.freeze({
    inputs: Object.freeze([Object.freeze({
      ...inputBox,
      extension: Object.freeze({}),
    })]),
    dataInputs: Object.freeze([]),
    outputs: Object.freeze([]),
  });
  const signedCandidate = Object.freeze({
    role,
    txId: unsignedTransactionIdHex,
    nodeOrigin: PRIMARY_ORIGIN,
    signedTransactionDigestHex: SIGNED_DIGEST,
  });
  const submissionHandle = Object.freeze({
    txId: unsignedTransactionIdHex,
    checkResponseDigestHex: CHECK_DIGEST,
  });
  return Object.freeze({
    issuance: Object.freeze({
      ordinal,
      role,
      genesisInputBoxIdHex: inputBox.boxId,
      unsignedTransactionIdHex,
      unsignedTransactionBody,
    }),
    signedCandidate,
    checkedAcceptance: Object.freeze({
      checked: Object.freeze({ txId: unsignedTransactionIdHex }),
      submissionHandle,
    }),
  });
}

function batch() {
  const transactions = Object.freeze([
    transaction('tracker', 0, box('51'), '61'),
    transaction('duplicate-prevention', 1, box('52'), '62'),
    transaction('pooled-reserve', 2, box('53'), '63'),
  ]);
  return Object.freeze({
    receipt: Object.freeze({}),
    request: Object.freeze({
      requestDigestHex: REQUEST_DIGEST,
      target: Object.freeze({
        genesisHeaderIdHex: GENESIS_HEADER_ID,
        primary: Object.freeze({
          nodeOrigin: PRIMARY_ORIGIN,
          sourceIdHex: hex('71'),
        }),
        witness: Object.freeze({
          nodeOrigin: WITNESS_ORIGIN,
          sourceIdHex: hex('72'),
        }),
      }),
    }),
    targetBinding: BINDING,
    orderedTransactions: transactions,
  }) as any;
}

function source(
  boxes: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  onBoxRead?: () => void,
) {
  return {
    getInfo: vi.fn(async () => ({ network: 'devnet', fullHeight: 120 })),
    getBestHeader: vi.fn(async () => ({
      id: TIP_HEADER_ID,
      height: 120,
    })),
    getBlockHeaderIdsAtHeight: vi.fn(async () => [GENESIS_HEADER_ID]),
    getBoxByIdOrNull: vi.fn(async (boxId: string) => {
      onBoxRead?.();
      return boxes.get(boxId) ?? null;
    }),
    getBoxBinaryByIdOrNull: vi.fn(async (boxId: string) => (
      boxes.has(boxId) ? { bytes: '00' } : null
    )),
  };
}

function nodeBox(
  unsignedInput: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const { extension: _extension, ...withoutExtension } = unsignedInput;
  return Object.freeze(withoutExtension);
}

function checkedCandidate(setupBatch: ReturnType<typeof batch>, index = 0) {
  const setup = setupBatch.orderedTransactions[index]!;
  const role = setup.issuance.role === 'duplicate-prevention'
    ? 'duplicatePrevention'
    : setup.issuance.role === 'pooled-reserve'
      ? 'pooledReserve'
      : 'tracker';
  const admissionBinding = Object.freeze({
    role,
    planDigestHex: setupBatch.request.requestDigestHex,
    targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
    expectedTxId: setup.issuance.unsignedTransactionIdHex,
    sourceBoxId: setup.issuance.genesisInputBoxIdHex,
    inputBoxIds: Object.freeze([setup.issuance.genesisInputBoxIdHex]),
    attemptedAtHeight: 120,
    nodeOrigin: PRIMARY_ORIGIN,
  });
  const admission = Object.freeze({
    schema: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA,
    ...admissionBinding,
    admissionDigestHex:
      deriveSubstrateFederatedLocalDevnetGenesisAdmissionDigestV1(
        admissionBinding as any,
      ),
    unsignedTransaction: setup.issuance.unsignedTransactionBody,
  });
  return Object.freeze({
    signed: Object.freeze({
      admission,
      signedTransactionDigestHex: SIGNED_DIGEST,
      signerArtifact: setup.signedCandidate,
    }),
    checkResponseDigestHex: CHECK_DIGEST,
    checkerArtifact: setup.checkedAcceptance.submissionHandle,
  }) as any;
}

function configureSources(
  primaryBoxes: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  witnessBoxes = primaryBoxes,
  onBoxRead?: () => void,
) {
  const primary = source(primaryBoxes, onBoxRead);
  const witness = source(witnessBoxes, onBoxRead);
  mocks.createSource.mockImplementation((origin: string) => (
    origin === PRIMARY_ORIGIN ? primary : witness
  ));
  return { primary, witness };
}

describe('isolated devnet genesis revalidator V1', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.assertTarget.mockReturnValue(BINDING);
    mocks.assertBatch.mockReturnValue(BINDING);
    mocks.validateBoxPair.mockImplementation(async (
      rawBox: Readonly<Record<string, unknown>>,
      bytes: string,
      _boxId: string,
      role: SetupRole,
    ) => Object.freeze({
      role,
      box: rawBox,
      sigmaSerializedHex: bytes,
      sigmaSerializedSha256Hex: bytes === '00' ? hex('81') : hex('82'),
      checks: Object.freeze({ validated: true }),
    }));
  });

  it('binds both revalidation phases to the exact checked candidate and nodes', async () => {
    const setupBatch = batch();
    const boxMap = new Map<
      string,
      Readonly<Record<string, unknown>>
    >();
    for (const entry of setupBatch.orderedTransactions) {
      boxMap.set(
        entry.issuance.genesisInputBoxIdHex,
        nodeBox(
          entry.issuance.unsignedTransactionBody.inputs[0] as Readonly<
            Record<string, unknown>
          >,
        ),
      );
    }
    configureSources(boxMap);
    const revalidator =
      createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1(
        TARGET,
        setupBatch,
      );
    const checked = checkedCandidate(setupBatch);

    const postCheck = await revalidator.revalidate(checked, 'post-check');
    expect(postCheck).toMatchObject({
      sourceBoxId: setupBatch.orderedTransactions[0].issuance.genesisInputBoxIdHex,
      sourceBoxUnspent: true,
      targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
      observedAtHeight: 120,
    });
    const artifactExpectation = Object.freeze({
      checkedCandidate: checked,
      role: 'tracker' as const,
      phase: 'post-check' as const,
      sourceBoxId: postCheck.sourceBoxId,
      targetGenesisHeaderIdHex: postCheck.targetGenesisHeaderIdHex,
      expectedTxId: setupBatch.orderedTransactions[0]
        .issuance.unsignedTransactionIdHex,
      observedAtHeight: postCheck.observedAtHeight,
      observedTipHeaderIdHex: postCheck.observedTipHeaderIdHex,
      sourceBoxDigestHex: postCheck.sourceBoxDigestHex,
      sourceBoxSigmaSerializedSha256Hex:
        postCheck.sourceBoxSigmaSerializedSha256Hex,
      observationDigestHex: postCheck.observationDigestHex,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1(
        revalidator,
        postCheck.revalidationArtifact,
        artifactExpectation,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1(
        revalidator,
        structuredClone(postCheck.revalidationArtifact),
        artifactExpectation,
      )
    ).toThrow(/lacks exact process provenance/);
    for (const mutation of [
      { observedTipHeaderIdHex: hex('a1') },
      { sourceBoxDigestHex: hex('a2') },
      { sourceBoxSigmaSerializedSha256Hex: hex('a3') },
      { observationDigestHex: hex('a4') },
      { checkedCandidate: checkedCandidate(setupBatch) },
    ]) {
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1(
          revalidator,
          postCheck.revalidationArtifact,
          { ...artifactExpectation, ...mutation },
        )
      ).toThrow(/lacks exact process provenance/);
    }
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1(
        revalidator,
        postCheck.revalidationArtifact,
        {
          ...artifactExpectation,
          observedAtHeight: artifactExpectation.observedAtHeight + 1,
        },
      )
    ).toThrow(/lacks exact process provenance/);

    const preTransport = await revalidator.revalidate(
      checked,
      'pre-transport',
    );
    expect(preTransport.observationDigestHex)
      .not.toBe(postCheck.observationDigestHex);
    await expect(revalidator.revalidate(checked, 'post-check'))
      .rejects.toThrow(/already issued/);
    await expect(revalidator.revalidate(
      checkedCandidate(setupBatch),
      'post-check',
    )).rejects.toThrow(/already issued/);
    mocks.assertHandleProvenance.mockImplementationOnce(() => {
      throw new Error('local WASM checked submission handle is already consumed');
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1(
        revalidator,
        postCheck.revalidationArtifact,
        artifactExpectation,
      )
    ).toThrow(/already consumed/);
    mocks.assertTarget.mockReturnValue(Object.freeze({
      processBindingDigestHex: hex('ff'),
      executionTargetIdentityDigestHex: EXECUTION_IDENTITY,
    }));
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1(
        revalidator,
        postCheck.revalidationArtifact,
        artifactExpectation,
      )
    ).toThrow(/process binding changed/);
    expect(mocks.createSource).toHaveBeenCalledTimes(2);
    expect(mocks.assertHandleBinding).toHaveBeenCalled();
  });

  it('rejects a checked candidate that is not the promoted setup material', async () => {
    const setupBatch = batch();
    const sourceBox = nodeBox(
      setupBatch.orderedTransactions[0]
        .issuance.unsignedTransactionBody.inputs[0] as Readonly<
          Record<string, unknown>
        >,
    );
    const sources = configureSources(new Map([[
      setupBatch.orderedTransactions[0].issuance.genesisInputBoxIdHex,
      sourceBox,
    ]]));
    const revalidator =
      createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1(
        TARGET,
        setupBatch,
      );
    const checked = checkedCandidate(setupBatch);
    const changed = {
      ...checked,
      signed: {
        ...checked.signed,
        signerArtifact: Object.freeze({ copied: true }),
      },
    } as any;

    await expect(revalidator.revalidate(changed, 'post-check'))
      .rejects.toThrow(/checked candidate binding changed/);
    expect(sources.primary.getBoxByIdOrNull).not.toHaveBeenCalled();
    expect(sources.witness.getBoxByIdOrNull).not.toHaveBeenCalled();
  });

  it('reserves each handle phase before asynchronous node observation', async () => {
    const setupBatch = batch();
    const sourceBoxId = setupBatch.orderedTransactions[0]
      .issuance.genesisInputBoxIdHex;
    const expected = nodeBox(
      setupBatch.orderedTransactions[0]
        .issuance.unsignedTransactionBody.inputs[0] as Readonly<
          Record<string, unknown>
        >,
    );
    configureSources(new Map([[sourceBoxId, expected]]));
    const revalidator =
      createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1(
        TARGET,
        setupBatch,
      );

    const first = revalidator.revalidate(
      checkedCandidate(setupBatch),
      'post-check',
    );
    await expect(revalidator.revalidate(
      checkedCandidate(setupBatch),
      'post-check',
    )).rejects.toThrow(/already issued or in progress/);
    await expect(first).resolves.toMatchObject({ sourceBoxUnspent: true });
  });

  it('fails closed when the two nodes do not expose the same signed source box', async () => {
    vi.useFakeTimers();
    const setupBatch = batch();
    const expected = nodeBox(
      setupBatch.orderedTransactions[0]
        .issuance.unsignedTransactionBody.inputs[0] as Readonly<
          Record<string, unknown>
        >,
    );
    const changed = Object.freeze({ ...expected, value: '999999999' });
    const sourceBoxId = setupBatch.orderedTransactions[0]
      .issuance.genesisInputBoxIdHex;
    configureSources(
      new Map([[sourceBoxId, expected]]),
      new Map([[sourceBoxId, changed]]),
    );
    const revalidator =
      createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1(
        TARGET,
        setupBatch,
      );
    const pending = revalidator.revalidate(
      checkedCandidate(setupBatch),
      'post-check',
    );
    const rejected = expect(pending).rejects.toThrow(
      /dual-node revalidation did not stabilize.*differs from the signed input/,
    );
    await vi.runAllTimersAsync();
    await rejected;
    await expect(revalidator.revalidate(
      checkedCandidate(setupBatch),
      'post-check',
    )).rejects.toThrow(/already issued or in progress/);
  });

  it('rejects binary disagreement even when node JSON matches', async () => {
    vi.useFakeTimers();
    const setupBatch = batch();
    const sourceBoxId = setupBatch.orderedTransactions[0]
      .issuance.genesisInputBoxIdHex;
    const expected = nodeBox(
      setupBatch.orderedTransactions[0]
        .issuance.unsignedTransactionBody.inputs[0] as Readonly<
          Record<string, unknown>
        >,
    );
    const sources = configureSources(new Map([[sourceBoxId, expected]]));
    sources.witness.getBoxBinaryByIdOrNull
      .mockResolvedValue({ bytes: '01' });
    const revalidator =
      createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1(
        TARGET,
        setupBatch,
      );
    const pending = revalidator.revalidate(
      checkedCandidate(setupBatch),
      'post-check',
    );
    const rejected = expect(pending).rejects.toThrow(
      /dual-node revalidation did not stabilize.*observations disagree/,
    );
    await vi.runAllTimersAsync();
    await rejected;
  });

  it('retries transient binary disagreement within one reserved phase', async () => {
    vi.useFakeTimers();
    const setupBatch = batch();
    const sourceBoxId = setupBatch.orderedTransactions[0]
      .issuance.genesisInputBoxIdHex;
    const expected = nodeBox(
      setupBatch.orderedTransactions[0]
        .issuance.unsignedTransactionBody.inputs[0] as Readonly<
          Record<string, unknown>
        >,
    );
    const sources = configureSources(new Map([[sourceBoxId, expected]]));
    const revalidator =
      createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1(
        TARGET,
        setupBatch,
      );
    const checked = checkedCandidate(setupBatch);
    await revalidator.revalidate(checked, 'post-check');
    sources.witness.getBoxBinaryByIdOrNull
      .mockResolvedValueOnce({ bytes: '01' })
      .mockResolvedValue({ bytes: '00' });

    const pending = revalidator.revalidate(checked, 'pre-transport');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ sourceBoxUnspent: true });
  });

  it('revalidates only the current source as prior setup boxes become spent', async () => {
    const setupBatch = batch();
    const primaryBoxes = new Map<
      string,
      Readonly<Record<string, unknown>>
    >();
    for (const entry of setupBatch.orderedTransactions) {
      primaryBoxes.set(
        entry.issuance.genesisInputBoxIdHex,
        nodeBox(entry.issuance.unsignedTransactionBody.inputs[0] as Readonly<
          Record<string, unknown>
        >),
      );
    }
    const witnessBoxes = new Map(primaryBoxes);
    configureSources(primaryBoxes, witnessBoxes);
    const revalidator =
      createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1(
        TARGET,
        setupBatch,
      );

    for (let index = 0; index < 3; index += 1) {
      const checked = checkedCandidate(setupBatch, index);
      await expect(revalidator.revalidate(checked, 'post-check'))
        .resolves.toMatchObject({ sourceBoxUnspent: true });
      await expect(revalidator.revalidate(checked, 'pre-transport'))
        .resolves.toMatchObject({ sourceBoxUnspent: true });
      const spentBoxId = setupBatch.orderedTransactions[index]
        .issuance.genesisInputBoxIdHex;
      primaryBoxes.delete(spentBoxId);
      witnessBoxes.delete(spentBoxId);
    }
  });

  it('rejects process replacement during source observation', async () => {
    const setupBatch = batch();
    const expected = nodeBox(
      setupBatch.orderedTransactions[0]
        .issuance.unsignedTransactionBody.inputs[0] as Readonly<
          Record<string, unknown>
        >,
    );
    const sourceBoxId = setupBatch.orderedTransactions[0]
      .issuance.genesisInputBoxIdHex;
    let drifted = false;
    configureSources(new Map([[sourceBoxId, expected]]), undefined, () => {
      drifted = true;
    });
    mocks.assertTarget.mockImplementation(() => drifted
      ? Object.freeze({
          processBindingDigestHex: hex('ff'),
          executionTargetIdentityDigestHex: EXECUTION_IDENTITY,
        })
      : BINDING);
    const revalidator =
      createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1(
        TARGET,
        setupBatch,
      );

    await expect(revalidator.revalidate(
      checkedCandidate(setupBatch),
      'post-check',
    )).rejects.toThrow(/process binding changed/);
  });
});
