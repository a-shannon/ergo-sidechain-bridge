import { describe, expect, it, vi } from 'vitest';

import blakejs from 'blakejs';

import {
  ERGO_NODE_CHECKER_PROFILE,
  ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
  LOCAL_WASM_CHECK_SIGNER_PROFILE,
  LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE,
} from './ergo-check-profiles.js';
import type {
  LocalWasmOpaqueCheckResult,
  PreparedLocalWasmRootCheckBatch,
} from './fleet-signer.js';
import {
  assertBridgeValidityTrackerObservedHeaderContextV1,
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
  buildBridgeValidityTrackerObservedHeaderContextV1,
  BridgeValidityTrackerObservedHeaderContextV1,
  serializeCanonicalErgoHeaderV2,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  executeObservedAnchorTrackerCheckKernelV1,
  executeObservedAnchorTrackerCheckKernelV2,
  executeObservedAnchorTrackerReservationFreshnessCheckKernelV1,
} from './substrate-federated-isolated-devnet-observed-anchor-tracker-check-kernel-v1.js';
import type { SubstrateFederatedTrackerV1Context } from './substrate-federated-tracker-v1.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';

const PRIMARY_ORIGIN = 'http://127.0.0.1:9051';
const WITNESS_ORIGIN = 'http://127.0.0.1:9052';
const TX_ID = hex('a');
const SIGNED_JSON_DIGEST = hex('b');
const SIGNED_BYTES_DIGEST = hex('c');
const PROCESS_BINDING = hex('d');
const TARGET_BINDING = hex('e');
const PUBLIC_KEY = `02${'11'.repeat(32)}`;
const ERGO_TREE = `0008cd${PUBLIC_KEY}`;

describe('isolated devnet observed-anchor tracker check kernel V1', () => {
  it('binds the active checkpoint target, observed context, signer, and JVM check', async () => {
    const harness = buildHarness();

    const result = await executeObservedAnchorTrackerCheckKernelV1(
      harness.input,
    );

    expect(harness.operations.captureTargetBinding).toHaveBeenCalledTimes(2);
    expect(harness.operations.captureContext)
      .toHaveBeenCalledWith(harness.context);
    expect(harness.operations.captureObservedHeaderContext)
      .toHaveBeenCalledWith(harness.observedHeaderContext);
    expect(harness.operations.captureTrackerInputBox)
      .toHaveBeenCalledWith(harness.context, harness.trackerInputBox);
    expect(harness.operations.prepareCandidate).toHaveBeenCalledWith({
      networkPrefix: 16,
      nodeOrigin: PRIMARY_ORIGIN,
      role: 'observed-anchor-tracker',
      headers: harness.observedHeaderContext.headers.map(header => header.raw),
      eip12Tx: {
        inputs: [{
          ...harness.trackerInputBox,
          extension: { 0: '0e20' },
        }],
        dataInputs: [],
        outputs: [{ value: '10000000' }],
      },
      expectedTxId: TX_ID,
    });
    expect(harness.operations.checkCandidate)
      .toHaveBeenCalledWith(harness.signedCandidate, PRIMARY_ORIGIN);
    expect(result).toMatchObject({
      trackerInputBoxIdHex: harness.trackerInputBox.boxId,
      statementIdHex: hex('3'),
      anchorHeaderIdHex: hex('7'),
      anchorHeight: 107,
      anchorContextIndex: 2,
      unsignedTransactionIdHex: TX_ID,
      signedTransactionIdHex: TX_ID,
      signedTransactionCanonicalJsonSha256Hex: SIGNED_JSON_DIGEST,
      signedTransactionBytesSha256Hex: SIGNED_BYTES_DIGEST,
      signedTransactionBytesLength: 2_048,
      target: {
        processBindingDigestHex: PROCESS_BINDING,
        executionTargetIdentityDigestHex: TARGET_BINDING,
      },
      signer: {
        derivation: 'wasm-root',
        publicKeyHex: PUBLIC_KEY,
        p2pkErgoTreeHex: ERGO_TREE,
        stateContextTipHeight: 109,
        stateContextTipIdHex: hex('9'),
      },
      checker: {
        nodeOrigin: PRIMARY_ORIGIN,
        path: '/transactions/check',
        method: 'POST',
        transportPolicy: 'no-redirect-no-proxy',
      },
      boundaries: {
        checkpointBoundActiveTarget: true,
        observedAnchorContextBound: true,
        localWasmRootSigningPerformed: true,
        localJvmNodeCheckPassed: true,
        signedTransactionBytesPersisted: false,
        submissionAuthorityEstablished: false,
        broadcastAuthorityEstablished: false,
        trackerAdmissionEstablished: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(result.unsignedTransactionDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(result.checkResponseSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(result).not.toHaveProperty('receiptDigestHex');
    expect(result).not.toHaveProperty('status');
  });

  it('binds the frozen V2 target without changing the transaction/check core', async () => {
    const harness = buildHarness();
    const result = await executeObservedAnchorTrackerCheckKernelV2({
      ...harness.input,
      target: frozenTarget(),
    });

    expect(result.boundaries).toMatchObject({
      checkpointBoundFrozenTarget: true,
      localWasmRootSigningPerformed: true,
      localJvmNodeCheckPassed: true,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
    });
    expect(result.unsignedTransactionIdHex).toBe(TX_ID);
    expect(harness.operations.checkCandidate).toHaveBeenCalledTimes(1);
  });

  it('binds a reservation-freshness target without inheriting the V2 boundary', async () => {
    const harness = buildHarness();
    const expectedFrozenCheck = await checkedFrozenResult();
    const result =
      await executeObservedAnchorTrackerReservationFreshnessCheckKernelV1({
        ...harness.input,
        target: freshnessTarget(),
        expectedFrozenCheck,
      });

    expect(result.boundaries).toMatchObject({
      reservationFreshnessRevalidationTarget: true,
      observedAnchorContextBound: true,
      exactTrackerInputAndTransactionBound: true,
      localWasmRootSigningPerformed: true,
      localJvmNodeCheckPassed: true,
      durableReservationBound: false,
      signedTransactionBytesPersisted: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      trackerAdmissionEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(result.boundaries).not.toHaveProperty('checkpointBoundFrozenTarget');
    expect(result.unsignedTransactionIdHex).toBe(TX_ID);
    expect(harness.operations.checkCandidate).toHaveBeenCalledTimes(1);
  });

  it('accepts a fresh valid Sigma proof for the exact frozen transaction', async () => {
    const expectedFrozenCheck = await checkedFrozenResult();
    const harness = buildHarness();
    const freshSignedCandidate = Object.freeze({
      ...harness.signedCandidate,
      signedTransactionDigestHex: hex('5'),
      signedTransactionBytesSha256Hex: hex('6'),
      signedTransactionBytesLength: 2_049,
    });
    harness.setPreparedBatch(Object.freeze({
      ...harness.preparedBatch,
      candidates: Object.freeze([Object.freeze({
        ...harness.preparedBatch.candidates[0]!,
        signedCandidate: freshSignedCandidate,
      })]),
    }));
    harness.setChecked(Object.freeze({
      ...harness.checked,
      checkResult: Object.freeze({ accepted: true, revalidated: true }),
      signedTransactionDigestHex:
        freshSignedCandidate.signedTransactionDigestHex,
      signedTransactionBytesSha256Hex:
        freshSignedCandidate.signedTransactionBytesSha256Hex,
      signedTransactionBytesLength:
        freshSignedCandidate.signedTransactionBytesLength,
    }));

    const result =
      await executeObservedAnchorTrackerReservationFreshnessCheckKernelV1({
        ...harness.input,
        target: freshnessTarget(),
        expectedFrozenCheck,
      });

    expect(result).toMatchObject({
      unsignedTransactionIdHex: expectedFrozenCheck.unsignedTransactionIdHex,
      unsignedTransactionDigestHex:
        expectedFrozenCheck.unsignedTransactionDigestHex,
      signedTransactionIdHex: expectedFrozenCheck.signedTransactionIdHex,
      signedTransactionCanonicalJsonSha256Hex: hex('5'),
      signedTransactionBytesSha256Hex: hex('6'),
      signedTransactionBytesLength: 2_049,
    });
    expect(result.checkResponseSha256Hex)
      .not.toBe(expectedFrozenCheck.checkResponseSha256Hex);
  });

  it('rejects a reservation-freshness target through the V2 entrypoint', async () => {
    const harness = buildHarness();

    await expect(executeObservedAnchorTrackerCheckKernelV2({
      ...harness.input,
      target: freshnessTarget(),
    })).rejects.toThrow(/checkpoint-bound frozen pair/);
    expect(harness.operations.prepareCandidate).not.toHaveBeenCalled();
    expect(harness.operations.checkCandidate).not.toHaveBeenCalled();
  });

  it('rejects a frozen V2 target through the reservation-freshness entrypoint', async () => {
    const harness = buildHarness();
    const expectedFrozenCheck = await checkedFrozenResult();

    await expect(
      executeObservedAnchorTrackerReservationFreshnessCheckKernelV1({
        ...harness.input,
        target: frozenTarget() as unknown as ReturnType<typeof freshnessTarget>,
        expectedFrozenCheck,
      }),
    ).rejects.toThrow(/checkpoint-bound reservation-freshness pair/);
    expect(harness.operations.prepareCandidate).not.toHaveBeenCalled();
    expect(harness.operations.checkCandidate).not.toHaveBeenCalled();
  });

  it('rejects a different valid candidate after the frozen V2 check', async () => {
    const expectedFrozenCheck = await checkedFrozenResult();
    const harness = buildHarness();
    harness.setContext(Object.freeze({
      ...harness.context,
      statement: Object.freeze({ statementIdHex: hex('4') }),
    }) as Readonly<SubstrateFederatedTrackerV1Context>);

    await expect(
      executeObservedAnchorTrackerReservationFreshnessCheckKernelV1({
        ...harness.input,
        target: freshnessTarget(),
        expectedFrozenCheck,
      }),
    ).rejects.toThrow(/differs from the frozen candidate/);
    expect(harness.operations.prepareCandidate).not.toHaveBeenCalled();
    expect(harness.operations.checkCandidate).not.toHaveBeenCalled();
  });

  it.each([
    ['primary mining', { primaryMining: true }],
    ['primary mutability', { primaryReadOnly: false }],
    ['witness mutability', { witnessReadOnly: false }],
    ['unstopped mining', { miningStopped: false }],
  ])('rejects V2 %s drift before signing', async (_label, mutation) => {
    const harness = buildHarness();
    await expect(executeObservedAnchorTrackerCheckKernelV2({
      ...harness.input,
      target: {
        ...frozenTarget(),
        ...mutation,
      } as Parameters<typeof executeObservedAnchorTrackerCheckKernelV2>[0]['target'],
    })).rejects.toThrow(/checkpoint-bound frozen pair/);
    expect(harness.operations.prepareCandidate).not.toHaveBeenCalled();
    expect(harness.operations.checkCandidate).not.toHaveBeenCalled();
  });

  it('rejects process drift after the JVM check', async () => {
    const harness = buildHarness();
    harness.setTargetBindings([
      binding(),
      { ...binding(), processBindingDigestHex: hex('f') },
    ]);

    await expect(executeObservedAnchorTrackerCheckKernelV1(harness.input))
      .rejects.toThrow(/checkpoint target changed during check/);

    expect(harness.operations.checkCandidate).toHaveBeenCalledTimes(1);
  });

  it('rejects signer output that is not bound to the observed tip', async () => {
    const harness = buildHarness();
    harness.setPreparedBatch({
      ...harness.preparedBatch,
      stateContextTipIdHex: hex('0'),
    });

    await expect(executeObservedAnchorTrackerCheckKernelV1(harness.input))
      .rejects.toThrow(/signer or observed context binding changed/);

    expect(harness.operations.checkCandidate).not.toHaveBeenCalled();
  });

  it('rejects a valid one-block-shifted header window before preparation', async () => {
    const harness = buildHarness();
    const wasmModule = await import('ergo-lib-wasm-nodejs');
    const wasm = wasmModule.default ?? wasmModule;
    const canonical = buildBridgeValidityTrackerCanonicalHeaderContextV1(
      wasm,
      {
        currentHeight: 110,
        anchorContextIndex: 2,
        anchorExtensionRootHex: hex('4'),
      },
    );
    const observed = buildBridgeValidityTrackerObservedHeaderContextV1(
      wasm,
      {
        rawHeaders: canonical.headers.map(header => header.raw),
        anchorContextIndex: canonical.anchorContextIndex,
        expectedAnchorHeaderIdHex: canonical.anchorHeader.id,
        expectedAnchorExtensionRootHex:
          canonical.anchorHeader.extensionRootHex,
      },
    );
    const nextRaw = structuredClone(
      observed.headers[0]!.raw,
    ) as Record<string, unknown>;
    nextRaw.parentId = observed.headers[0]!.id;
    nextRaw.height = observed.currentHeight;
    nextRaw.timestamp = Number(nextRaw.timestamp) + 120_000;
    delete nextRaw.id;
    delete nextRaw.headerId;
    const nextSerialized = serializeCanonicalErgoHeaderV2(nextRaw);
    const nextHeader = Object.freeze({
      ...nextRaw,
      id: Buffer.from(
        blakejs.blake2b(nextSerialized, undefined, 32),
      ).toString('hex'),
    });
    const shifted = buildBridgeValidityTrackerObservedHeaderContextV1(
      wasm,
      {
        rawHeaders: [
          nextHeader,
          ...observed.headers.slice(0, 9).map(header => header.raw),
        ],
        anchorContextIndex: observed.anchorContextIndex + 1,
        expectedAnchorHeaderIdHex: observed.anchorHeader.id,
        expectedAnchorExtensionRootHex:
          observed.anchorHeader.extensionRootHex,
      },
    );
    const alignedContext = Object.freeze({
      ...harness.context,
      trackerTransition: Object.freeze({
        ...harness.context.trackerTransition,
        currentErgoHeight: observed.currentHeight,
        anchorContextIndex: observed.anchorContextIndex,
        headers: Object.freeze(observed.headers.map(header => Object.freeze({
          id: header.id,
          height: header.height,
          extensionRootHex: header.extensionRootHex,
          jvmHeaderJson: header.jvmHeaderJson,
          serializedHex: header.serializedHex,
        }))),
      }),
    }) as unknown as Readonly<SubstrateFederatedTrackerV1Context>;
    harness.setContext(alignedContext);
    harness.setObservedHeaderContext(shifted);
    harness.operations.captureObservedHeaderContext.mockImplementation(value => {
      assertBridgeValidityTrackerObservedHeaderContextV1(value);
      return value;
    });

    await expect(executeObservedAnchorTrackerCheckKernelV1(harness.input))
      .rejects.toThrow(/observed header context differs from the tracker candidate/);

    expect(harness.operations.prepareCandidate).not.toHaveBeenCalled();
    expect(harness.operations.checkCandidate).not.toHaveBeenCalled();
  });

  it('rejects a JVM receipt from a different checker identity', async () => {
    const harness = buildHarness();
    harness.setChecked({
      ...harness.checked,
      checkerIdentity: {
        ...harness.checked.checkerIdentity,
        nodeOrigin: WITNESS_ORIGIN,
      },
    });

    await expect(executeObservedAnchorTrackerCheckKernelV1(harness.input))
      .rejects.toThrow(/signer and JVM node receipt disagree/);
  });

  it('fails closed when the JVM node rejects the signed candidate', async () => {
    const harness = buildHarness();
    harness.setChecked(null);

    await expect(executeObservedAnchorTrackerCheckKernelV1(harness.input))
      .rejects.toThrow(/JVM node check failed/);
  });
});

function buildHarness() {
  const trackerInputBox = Object.freeze({
    boxId: hex('1'),
    value: '10000000',
    ergoTree: '00',
    assets: [],
    additionalRegisters: {},
    creationHeight: 100,
    transactionId: hex('2'),
    index: 0,
  }) satisfies Readonly<Eip12Box>;
  const observedHeaders = Object.freeze(Array.from(
    { length: 10 },
    (_, index) => Object.freeze({
      raw: Object.freeze({
        id: hex(String(9 - index)),
        marker: `observed-header-${index}`,
      }),
      id: hex(String(9 - index)),
      parentId: index === 9 ? hex('f') : hex(String(8 - index)),
      height: 109 - index,
      extensionRootHex: hex('4'),
      jvmHeaderJson: '{}',
      serializedHex: '00',
    }),
  ));
  let observedHeaderContext:
    Readonly<BridgeValidityTrackerObservedHeaderContextV1> = Object.freeze({
    currentHeight: 110,
    anchorHeader: observedHeaders[2]!,
    anchorContextIndex: 2,
    headers: observedHeaders,
    provenance: 'eip0045-validity-tracker-observed-header-context' as const,
  });
  const headers = Object.freeze(observedHeaders.map(header => Object.freeze({
    id: header.id,
    height: header.height,
    extensionRootHex: header.extensionRootHex,
    jvmHeaderJson: header.jvmHeaderJson,
    serializedHex: header.serializedHex,
  })));
  let context = Object.freeze({
    contract: Object.freeze({
      ergoAdmissionThreshold: 1,
      ergoAdmissionPublicKeysHex: Object.freeze([PUBLIC_KEY]),
    }),
    statement: Object.freeze({ statementIdHex: hex('3') }),
    trackerTransition: Object.freeze({
      anchorContextProvenance:
        'eip0045-validity-tracker-observed-header-context',
      anchorContextIndex: 2,
      currentErgoHeight: 110,
      headers,
    }),
    eip12UnsignedTransaction: Object.freeze({
      inputs: Object.freeze([Object.freeze({
        boxId: trackerInputBox.boxId,
        extension: Object.freeze({ 0: '0e20' }),
      })]),
      dataInputs: Object.freeze([]),
      outputs: Object.freeze([Object.freeze({ value: '10000000' })]),
    }),
    unsignedTransactionIdHex: TX_ID,
  }) as unknown as Readonly<SubstrateFederatedTrackerV1Context>;
  const signedCandidate = Object.freeze({
    profile: LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE,
    txId: TX_ID,
    signedTransactionDigestHex: SIGNED_JSON_DIGEST,
    signedTransactionBytesSha256Hex: SIGNED_BYTES_DIGEST,
    signedTransactionBytesLength: 2_048,
    nodeOrigin: PRIMARY_ORIGIN,
    signerContext: Object.freeze({
      profile: LOCAL_WASM_CHECK_SIGNER_PROFILE,
      pubKeyHex: PUBLIC_KEY,
      ergoTreeHex: ERGO_TREE,
      networkPrefix: 16,
      stateContextTipHeight: 109,
      stateContextTipIdHex: headers[0]!.id,
    }),
  });
  const defaultPreparedBatch = Object.freeze({
    derivation: 'wasm-root' as const,
    pubKeyHex: PUBLIC_KEY,
    ergoTreeHex: ERGO_TREE,
    stateContextTipHeight: 109,
    stateContextTipIdHex: headers[0]!.id,
    candidates: Object.freeze([Object.freeze({
      role: 'observed-anchor-tracker',
      expectedTxId: TX_ID,
      signedCandidate,
    })]),
  });
  const defaultChecked = Object.freeze({
    txId: TX_ID,
    checkResult: Object.freeze({ accepted: true }),
    signedTransactionDigestHex: SIGNED_JSON_DIGEST,
    signedTransactionBytesSha256Hex: SIGNED_BYTES_DIGEST,
    signedTransactionBytesLength: 2_048,
    signerContext: signedCandidate.signerContext,
    checkerIdentity: Object.freeze({
      profile: ERGO_NODE_CHECKER_PROFILE,
      sourceAdapterProfile: ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
      nodeOrigin: PRIMARY_ORIGIN,
      path: '/transactions/check' as const,
      method: 'POST' as const,
      transportPolicy: 'no-redirect-no-proxy' as const,
    }),
  });
  let targetBindings: Array<ReturnType<typeof binding>> = [
    binding(),
    binding(),
  ];
  let preparedBatch: Readonly<PreparedLocalWasmRootCheckBatch> =
    defaultPreparedBatch;
  let checked: Readonly<LocalWasmOpaqueCheckResult> | null = defaultChecked;
  const operations = {
    captureContext: vi.fn(() => context),
    captureObservedHeaderContext: vi.fn(
      (_value: unknown) => observedHeaderContext,
    ),
    captureTargetBinding: vi.fn(() => {
      const next = targetBindings.shift();
      if (next === undefined) throw new Error('unexpected target capture');
      return next;
    }),
    captureTrackerInputBox: vi.fn(async () => trackerInputBox),
    deriveUnsignedTransactionId: vi.fn(async () => TX_ID),
    prepareCandidate: vi.fn(async () => preparedBatch),
    checkCandidate: vi.fn(async () => checked),
  };
  const input = {
    inputValue: Object.freeze({
      context,
      observedHeaderContext,
      trackerInputBox,
    }),
    target: Object.freeze({
      primaryNodeOrigin: PRIMARY_ORIGIN,
      witnessNodeOrigin: WITNESS_ORIGIN,
      primaryMining: true,
      witnessReadOnly: true,
      checkpointBound: true,
    }),
    expectedSigner: Object.freeze({
      publicKeyHex: PUBLIC_KEY,
      p2pkErgoTreeHex: ERGO_TREE,
      networkPrefix: 16,
    }),
    operations,
  };
  return {
    input,
    get context() {
      return context;
    },
    get observedHeaderContext() {
      return observedHeaderContext;
    },
    trackerInputBox,
    signedCandidate,
    get preparedBatch() {
      return preparedBatch;
    },
    get checked() {
      if (checked === null) throw new Error('checked result is absent');
      return checked;
    },
    operations,
    setTargetBindings: (
      values: ReadonlyArray<ReturnType<typeof binding>>,
    ) => {
      targetBindings = [...values];
    },
    setPreparedBatch: (
      value: Readonly<PreparedLocalWasmRootCheckBatch>,
    ) => {
      preparedBatch = value;
    },
    setContext: (
      value: Readonly<SubstrateFederatedTrackerV1Context>,
    ) => {
      context = value;
      input.inputValue = Object.freeze({
        context,
        observedHeaderContext,
        trackerInputBox,
      });
    },
    setObservedHeaderContext: (
      value: Readonly<BridgeValidityTrackerObservedHeaderContextV1>,
    ) => {
      observedHeaderContext = value;
      input.inputValue = Object.freeze({
        context,
        observedHeaderContext,
        trackerInputBox,
      });
    },
    setChecked: (value: Readonly<LocalWasmOpaqueCheckResult> | null) => {
      checked = value;
    },
  };
}

function frozenTarget() {
  return Object.freeze({
    primaryNodeOrigin: PRIMARY_ORIGIN,
    witnessNodeOrigin: WITNESS_ORIGIN,
    primaryMining: false as const,
    primaryReadOnly: true as const,
    witnessReadOnly: true as const,
    miningStopped: true as const,
    checkpointBound: true as const,
  });
}

function freshnessTarget() {
  return Object.freeze({
    ...frozenTarget(),
    reservationFreshnessRevalidation: true as const,
  });
}

async function checkedFrozenResult() {
  const harness = buildHarness();
  return await executeObservedAnchorTrackerCheckKernelV2({
    ...harness.input,
    target: frozenTarget(),
  });
}

function binding() {
  return Object.freeze({
    processBindingDigestHex: PROCESS_BINDING,
    executionTargetIdentityDigestHex: TARGET_BINDING,
  });
}

function hex(character: string): string {
  return character.repeat(64);
}
