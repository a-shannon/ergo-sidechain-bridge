import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedTrackerAdmissionV1,
} from './profiles/substrate-federated-v1/tracker-admission.js';
import {
  encodeIntRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  materializeSubstrateFederatedSingletonIssuanceV1,
} from './substrate-federated-genesis-issuance-materialization-v1.js';
import {
  buildSubstrateFederatedTrackerV1AcceptanceFixture,
} from './substrate-federated-tracker-v1-fixture.js';
import {
  assertExactSubstrateFederatedTrackerV1InputBox,
  assertSubstrateFederatedTrackerV1Context,
  buildCompilerBoundSubstrateFederatedTrackerV1Context,
  buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context,
  buildSubstrateFederatedTrackerV1Context,
  type SubstrateFederatedTrackerContractV1Identity,
} from './substrate-federated-tracker-v1.js';
import {
  BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE,
  BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE,
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
  buildBridgeValidityTrackerObservedHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json',
  import.meta.url,
), 'utf8'));
const contract = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-contract.json',
  import.meta.url,
), 'utf8')) as SubstrateFederatedTrackerContractV1Identity;
const trackerTemplate = readFileSync(new URL(
  '../../contracts/SPVTrackerSubstrateFederatedV1.es',
  import.meta.url,
), 'utf8');

function inputs() {
  const profile = buildSubstrateFederatedCheckpointProfileV1(vector.input.profile);
  const statement = buildSubstrateFederatedCheckpointStatementV1({
    profile,
    ...vector.input.statement,
  });
  return { profile, statement };
}

describe('substrate federated tracker V1 transaction plan', () => {
  it('constructs one deterministic exact successor without transport authority', async () => {
    const first = await buildSubstrateFederatedTrackerV1AcceptanceFixture();
    const second = await buildSubstrateFederatedTrackerV1AcceptanceFixture();

    expect(first).toEqual(second);
    expect(first.schema).toBe('e2s.substrate-federated-v1-tracker-context');
    expect(first.trustModel).toBe('federated_non_trustless');
    expect(first.contract.contractIdHex)
      .toBe('4fbcc5372efb4338b6f150ee5455a7a0cebd1f07c6cb0cc2929e17155086af8c');
    expect(first.contextExtension.keys).toEqual([0, 1, 2]);
    expect(Object.keys(first.contextExtension.eip12Values)).toEqual(['0', '1', '2']);
    expect(first.trackerTransition.trackerValueHex).toHaveLength(370 * 2);
    expect(first.trackerTransition.trackerKeyHex).toHaveLength(64);
    expect(first.trackerTransition.anchorContextProvenance).toBe(
      BRIDGE_VALIDITY_TRACKER_CANONICAL_HEADER_CONTEXT_V1_PROVENANCE,
    );
    expect(first.trackerTransition.successorRegisters.R4)
      .toBe(first.trackerTransition.inputRegisters.R4);
    expect(first.trackerTransition.successorRegisters.R6)
      .toBe(first.trackerTransition.inputRegisters.R6);
    expect(first.trackerTransition.successorRegisters.R9)
      .toBe(first.trackerTransition.inputRegisters.R9);
    expect(first.prooflessTransactionBytes).toBeGreaterThan(0);
    expect(first.prooflessTransactionBytes).toBeLessThanOrEqual(262_144);
    expect(first.boundaries).toEqual({
      contractIdentityBound: true,
      statementAndProfileValidated: true,
      anchorMembershipConstructed: true,
      exactContextExtensionRoundTrip: true,
      avlTransitionConstructed: true,
      sourceSignaturesVerifiedOnChain: false,
      jvmReductionAccepted: false,
      nodeCheckPerformed: false,
      profileActivated: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
    });
    expect(() => assertSubstrateFederatedTrackerV1Context(first)).not.toThrow();
    expect(() =>
      assertSubstrateFederatedTrackerV1Context(structuredClone(first)),
    ).toThrow(/provenance is missing/i);
  });

  it('derives the exact key/value from the canonical anchor header', async () => {
    const context = await buildSubstrateFederatedTrackerV1AcceptanceFixture();
    const { profile, statement } = inputs();
    const anchor = context.trackerTransition.headers[
      context.trackerTransition.anchorContextIndex
    ];
    const admission = buildSubstrateFederatedTrackerAdmissionV1({
      profile,
      encodedStatementHex: statement.encodedStatementHex,
      currentErgoHeight: context.trackerTransition.currentErgoHeight,
      anchorHeaderIdHex: anchor.id,
      anchorHeaderHeight: anchor.height,
    });

    expect(context.statement.encodedHex).toBe(statement.encodedStatementHex);
    expect(context.trackerTransition.trackerKeyHex).toBe(admission.trackerKeyHex);
    expect(context.trackerTransition.trackerValueHex).toBe(admission.trackerValueHex);
    expect(anchor.extensionRootHex).not.toBe('00'.repeat(32));
  });

  it('rejects contract identity, compiled profile and application drift', async () => {
    const { profile, statement } = inputs();
    const build = (identity: SubstrateFederatedTrackerContractV1Identity) =>
      buildSubstrateFederatedTrackerV1Context({
        contract: identity,
        profile,
        encodedStatementHex: statement.encodedStatementHex,
        currentErgoHeight: 1_030,
        anchorContextIndex: 1,
      });
    await expect(build({ ...contract, contractIdHex: '11'.repeat(32) }))
      .rejects.toThrow(/contract identity is invalid/);
    await expect(build({
      ...contract,
      application: { ...contract.application, bridgeAddressHex: '12'.repeat(20) },
    })).rejects.toThrow(/differs from the compiled profile/);
    await expect(build({
      ...contract,
      ergoAdmissionPublicKeysHex: [...contract.ergoAdmissionPublicKeysHex].reverse(),
    })).rejects.toThrow(/Ergo admission keys differ/);
  });

  it('rejects invalid header selection before emitting transaction bytes', async () => {
    const { profile, statement } = inputs();
    await expect(buildSubstrateFederatedTrackerV1Context({
      contract,
      profile,
      encodedStatementHex: statement.encodedStatementHex,
      currentErgoHeight: 1_030,
      anchorContextIndex: 10,
    })).rejects.toThrow(/anchor context index/);
  });

  it('binds a real setup transaction output and same-process JVM receipt', async () => {
    const { profile, statement } = inputs();
    const genesisInput = await boxFromCandidate({
      value: (10_000_000n + BigInt(MINER_FEE)).toString(),
      ergoTree: MINER_FEE_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 999,
    });
    const compilerRequest = buildSubstrateFederatedTrackerCompilerRequestV1({
      template: {
        relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
        source: trackerTemplate,
      },
      trackerGenesisInputBoxIdHex: genesisInput.boxId,
      profile,
      application: {
        sourceNetworkIdHex: statement.sourceNetworkIdHex,
        sidechainIdHex: statement.sidechainIdHex,
        bridgeAddressHex: statement.bridgeAddressHex,
        tokenAddressHex: statement.tokenAddressHex,
        bridgeRuntimeCodeSha256Hex:
          statement.bridgeRuntimeCodeSha256Hex,
        bridgeRuntimeCodeBytes: statement.bridgeRuntimeCodeBytes,
        tokenRuntimeCodeSha256Hex: statement.tokenRuntimeCodeSha256Hex,
        tokenRuntimeCodeBytes: statement.tokenRuntimeCodeBytes,
        sourceRuntimeCodeSha256Hex:
          statement.sourceRuntimeCodeSha256Hex,
        sourceRuntimeCodeBytes: statement.sourceRuntimeCodeBytes,
        runtimeProfileIdHex: statement.runtimeProfileIdHex,
        settlementProfileIdHex: statement.settlementProfileIdHex,
      },
    });
    const nodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    let compilerReceipt;
    try {
      compilerReceipt =
        await compileSubstrateFederatedTrackerWithPinnedJvmV1(compilerRequest);
    } finally {
      if (nodeOptions !== undefined) process.env.NODE_OPTIONS = nodeOptions;
    }
    const fixture = await buildSubstrateFederatedTrackerV1AcceptanceFixture();
    const registers = {
      ...fixture.trackerTransition.inputRegisters,
      R8: encodeIntRegister(0),
    };
    const setupTransaction =
      await materializeSubstrateFederatedSingletonIssuanceV1({
        label: 'isolated federated tracker issuance',
        genesisInput,
        expectedNftIdHex: compilerRequest.trackerNftIdHex,
        propositionHex: compilerReceipt.contract.propositionHex,
        registers,
        singletonValue: 10_000_000n,
        fee: BigInt(MINER_FEE),
        creationHeight: 1_000,
      });
    const rematerializedSetup = await materializeUnsignedTransaction(
      setupTransaction.eip12Tx,
      'rematerialized isolated federated tracker issuance',
    );
    expect(rematerializedSetup).toEqual(setupTransaction);
    const trackerInputBox = rematerializedSetup.outputs[0]!;

    const context = await buildCompilerBoundSubstrateFederatedTrackerV1Context({
      compilerRequest,
      compilerReceipt,
      trackerInputBox,
      encodedStatementHex: statement.encodedStatementHex,
      currentErgoHeight: 1_030,
      anchorContextIndex: 1,
    });

    expect(context.contract.contractIdHex)
      .toBe(compilerReceipt.contract.contractIdHex);
    expect(context.trackerTransition.inputRegisters.R8)
      .toBe(encodeIntRegister(0));
    expect((context.eip12UnsignedTransaction.inputs as any[])[0].boxId)
      .toBe(trackerInputBox.boxId);
    expect(context.unsignedTransactionIdHex).toHaveLength(64);
    const wasmModule = await import('ergo-lib-wasm-nodejs');
    const wasm = wasmModule.default ?? wasmModule;
    const syntheticHeaders =
      buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
        currentHeight: context.trackerTransition.currentErgoHeight,
        anchorContextIndex: context.trackerTransition.anchorContextIndex,
        anchorExtensionRootHex: context.trackerTransition.headers[
          context.trackerTransition.anchorContextIndex
        ]!.extensionRootHex,
      });
    const observedHeaders = buildBridgeValidityTrackerObservedHeaderContextV1(
      wasm,
      {
        rawHeaders: syntheticHeaders.headers.map(header => header.raw),
        anchorContextIndex: syntheticHeaders.anchorContextIndex,
        expectedAnchorHeaderIdHex: syntheticHeaders.anchorHeader.id,
        expectedAnchorExtensionRootHex:
          syntheticHeaders.anchorHeader.extensionRootHex,
      },
    );
    const observedContext =
      await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context({
        compilerRequest,
        compilerReceipt,
        trackerInputBox,
        encodedStatementHex: statement.encodedStatementHex,
        observedHeaderContext: observedHeaders,
        extensionMembershipProofHex:
          context.trackerTransition.extensionProofHex,
      });
    expect(observedContext.unsignedTransactionIdHex)
      .toBe(context.unsignedTransactionIdHex);
    expect(observedContext.prooflessTransactionHex)
      .toBe(context.prooflessTransactionHex);
    expect(observedContext.trackerTransition.anchorContextProvenance).toBe(
      BRIDGE_VALIDITY_TRACKER_OBSERVED_HEADER_CONTEXT_V1_PROVENANCE,
    );
    await expect(
      assertExactSubstrateFederatedTrackerV1InputBox(
        observedContext,
        trackerInputBox,
      ),
    ).resolves.toEqual(trackerInputBox);
    await expect(
      assertExactSubstrateFederatedTrackerV1InputBox(
        observedContext,
        {
          ...trackerInputBox,
          value: (BigInt(trackerInputBox.value) + 1n).toString(),
        },
      ),
    ).rejects.toThrow(/valid EIP-12 box|Sigma bytes differ/);
    await expect(
      buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV1Context({
        compilerRequest,
        compilerReceipt,
        trackerInputBox,
        encodedStatementHex: statement.encodedStatementHex,
        observedHeaderContext: observedHeaders,
        extensionMembershipProofHex:
          `ff${context.trackerTransition.extensionProofHex.slice(2)}`,
      }),
    ).rejects.toThrow(/membership proof|invalid side/i);
    await expect(buildCompilerBoundSubstrateFederatedTrackerV1Context({
      compilerRequest,
      compilerReceipt: structuredClone(compilerReceipt),
      trackerInputBox,
      encodedStatementHex: statement.encodedStatementHex,
      currentErgoHeight: 1_030,
      anchorContextIndex: 1,
    })).rejects.toThrow(/lacks process provenance/);

    const mutations: ReadonlyArray<readonly [string, TrackerBoxMutation]> = [
      ['value', candidate => {
        candidate.value = (BigInt(candidate.value) + 1n).toString();
      }],
      ['ErgoTree', candidate => {
        candidate.ergoTree = MINER_FEE_TREE;
      }],
      ['asset cardinality', candidate => {
        candidate.assets = [];
      }],
      ['token ID', candidate => {
        candidate.assets[0]!.tokenId = 'ff'.repeat(32);
      }],
      ['token amount', candidate => {
        candidate.assets[0]!.amount = '2';
      }],
      ...(['R4', 'R5', 'R6', 'R7', 'R8', 'R9'] as const).map(register => [
        `register ${register}`,
        (candidate: MutableBoxCandidate) => {
          candidate.additionalRegisters[register] = encodeIntRegister(1);
        },
      ] as const),
      ['register cardinality', candidate => {
        delete candidate.additionalRegisters.R9;
      }],
      ['creation height', candidate => {
        candidate.creationHeight = 1_030;
      }],
    ];
    for (const [label, mutate] of mutations) {
      const candidate = candidateFromBox(trackerInputBox);
      mutate(candidate);
      const mutatedBox = await boxFromCandidate(candidate);
      await expect(buildCompilerBoundSubstrateFederatedTrackerV1Context({
        compilerRequest,
        compilerReceipt,
        trackerInputBox: mutatedBox,
        encodedStatementHex: statement.encodedStatementHex,
        currentErgoHeight: 1_030,
        anchorContextIndex: 1,
      }), label).rejects.toThrow(/differs from genesis state/);
    }

    const rawMutations: ReadonlyArray<readonly [
      string,
      (candidate: Eip12Box) => void,
      RegExp,
    ]> = [
      ['extra register key', candidate => {
        candidate.additionalRegisters.R3 = encodeIntRegister(1);
      }, /not a non-mandatory register/],
      ['negative creation height', candidate => {
        candidate.creationHeight = -1;
      }, /positive safe integer/],
      ['unsafe creation height', candidate => {
        candidate.creationHeight = Number.MAX_SAFE_INTEGER + 1;
      }, /positive safe integer/],
    ];
    for (const [label, mutate, expected] of rawMutations) {
      const mutatedBox = structuredClone(trackerInputBox);
      mutate(mutatedBox);
      await expect(buildCompilerBoundSubstrateFederatedTrackerV1Context({
        compilerRequest,
        compilerReceipt,
        trackerInputBox: mutatedBox,
        encodedStatementHex: statement.encodedStatementHex,
        currentErgoHeight: 1_030,
        anchorContextIndex: 1,
      }), label).rejects.toThrow(expected);
    }
  }, 20_000);
});

interface MutableBoxCandidate {
  value: string;
  ergoTree: string;
  assets: Array<{ tokenId: string; amount: string }>;
  additionalRegisters: Record<string, string>;
  creationHeight: number;
}

type TrackerBoxMutation = (candidate: MutableBoxCandidate) => void;

function candidateFromBox(box: Readonly<Eip12Box>): MutableBoxCandidate {
  return {
    value: box.value,
    ergoTree: box.ergoTree,
    assets: box.assets.map(asset => ({ ...asset })),
    additionalRegisters: { ...box.additionalRegisters },
    creationHeight: box.creationHeight,
  };
}

async function boxFromCandidate(
  input: Readonly<MutableBoxCandidate>,
): Promise<Eip12Box> {
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
    inputs: [{ boxId: '67'.repeat(32), extension: {} }],
    dataInputs: [],
    outputs: [{
      value: input.value,
      ergoTree: input.ergoTree,
      assets: input.assets,
      additionalRegisters: input.additionalRegisters,
      creationHeight: input.creationHeight,
    }],
  }));
  const id = unsigned.id();
  const candidates = unsigned.output_candidates();
  const candidate = candidates.get(0);
  const box = wasm.ErgoBox.from_box_candidate(candidate, id, 0);
  try {
    return box.to_js_eip12() as Eip12Box;
  } finally {
    box.free?.();
    candidate.free?.();
    candidates.free?.();
    id.free?.();
    unsigned.free?.();
  }
}
