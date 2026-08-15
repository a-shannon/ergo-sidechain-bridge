import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';

import { getDupTreeDigest, getPooledReserveEmptyDigest } from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  type SubstrateFederatedCheckpointProfileV1Input,
  type SubstrateFederatedCheckpointStatementV1Input,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedBurnSettlementV1,
  type BuildSubstrateFederatedBurnSettlementV1Input,
  type SubstrateFederatedBurnSettlementV1Packet,
} from './substrate-federated-burn-settlement-v1.js';
import {
  buildSubstrateFederatedSettlementFamilyV1CompilerFixture,
} from './substrate-federated-settlement-family-v1-fixture.js';
import {
  validateSubstrateFederatedSettlementFamilyV1CompilerBatch,
  type SubstrateFederatedSettlementFamilyV1Identity,
} from './substrate-federated-settlement-family-v1.js';
import {
  buildSubstrateFederatedTrackerV1Context,
  type SubstrateFederatedTrackerContractV1Identity,
} from './substrate-federated-tracker-v1.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';

interface TrackerVectorInput {
  readonly input: {
    readonly profile: SubstrateFederatedCheckpointProfileV1Input;
    readonly statement:
      Omit<SubstrateFederatedCheckpointStatementV1Input, 'profile'>;
    readonly tracker: { readonly currentErgoHeight: number };
  };
}

const TRACKER_VECTOR = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json',
  import.meta.url,
), 'utf8')) as TrackerVectorInput;
const TRACKER_CONTRACT = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-contract.json',
  import.meta.url,
), 'utf8')) as SubstrateFederatedTrackerContractV1Identity;
const COMPILER_BATCH_JSON = readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-settlement-family-compiler-v1.json',
  import.meta.url,
), 'ascii');
const RECIPIENT_TREE =
  '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const BURN_AMOUNT = '10000000';
const RESERVE_VALUE = '42000000';
const RESERVE_LIABILITY = 40_000_000n;
const SINGLETON_VALUE = '2000000';
const SETUP_INPUT_ID = '91'.repeat(32);

let familyIdentity:
Readonly<SubstrateFederatedSettlementFamilyV1Identity> | undefined;
let inputPromise:
Promise<BuildSubstrateFederatedBurnSettlementV1Input> | undefined;

export function getSubstrateFederatedSettlementFamilyV1FixtureIdentity():
Readonly<SubstrateFederatedSettlementFamilyV1Identity> {
  familyIdentity ??=
    validateSubstrateFederatedSettlementFamilyV1CompilerBatch({
      request: buildSubstrateFederatedSettlementFamilyV1CompilerFixture(),
      compilerBatchJson: COMPILER_BATCH_JSON,
    });
  return familyIdentity;
}

export function buildSubstrateFederatedBurnSettlementV1FixtureInput():
Promise<BuildSubstrateFederatedBurnSettlementV1Input> {
  inputPromise ??= buildFixtureInput();
  return inputPromise.then(value => {
    const { familyIdentity: identity, ...mutableInput } = value;
    return {
      ...structuredClone(mutableInput),
      familyIdentity: identity,
    };
  });
}

export async function buildSubstrateFederatedBurnSettlementV1FixturePacket():
Promise<Readonly<SubstrateFederatedBurnSettlementV1Packet>> {
  return buildSubstrateFederatedBurnSettlementV1(
    await buildSubstrateFederatedBurnSettlementV1FixtureInput(),
  );
}

async function buildFixtureInput():
Promise<BuildSubstrateFederatedBurnSettlementV1Input> {
  const family = getSubstrateFederatedSettlementFamilyV1FixtureIdentity();
  const profile = buildSubstrateFederatedCheckpointProfileV1(
    TRACKER_VECTOR.input.profile,
  );
  const executionBlockHashHex =
    TRACKER_VECTOR.input.statement.executionBlockHashHex;
  const burnLeaves = deterministicBurnLeaves(
    TRACKER_VECTOR.input.statement.sidechainIdHex,
    executionBlockHashHex,
  );
  const proof = buildTrustlessBurnInclusionProof(
    [...burnLeaves],
    burnLeaves[1].burnIdHex,
  );
  const statement = buildSubstrateFederatedCheckpointStatementV1({
    profile,
    ...TRACKER_VECTOR.input.statement,
    bridgeEventRootHex: proof.bridgeEventRootHex,
    burnLeafCount: proof.leafCount,
  });
  const tracker = await buildSubstrateFederatedTrackerV1Context({
    contract: TRACKER_CONTRACT,
    profile,
    encodedStatementHex: statement.encodedStatementHex,
    currentErgoHeight: TRACKER_VECTOR.input.tracker.currentErgoHeight,
    anchorContextIndex: 1,
  });
  const settlementCurrentHeight =
    TRACKER_VECTOR.input.tracker.currentErgoHeight + 8;
  const trackerDataInput = await materializeTrackerSuccessor(tracker);
  const state = await buildSyntheticSettlementState(
    family,
    settlementCurrentHeight,
  );
  return {
    familyIdentity: family,
    trackerState: {
      dataInput: trackerDataInput,
      history: [{
        key: tracker.trackerTransition.trackerKeyHex,
        value: tracker.trackerTransition.trackerValueHex,
      }],
    },
    reserveState: { predecessor: state.reservePredecessor },
    duplicatePreventionState: {
      predecessor: state.duplicatePreventionPredecessor,
      historyKeys: [],
    },
    feeFundingInput: state.feeFundingInput,
    claim: {
      trackerIdentity: {
        sourceNativeBlockHeight: statement.sourceNativeBlockHeight,
        sourceNativeBlockHashHex: statement.sourceNativeBlockHashHex,
        executionBlockHashHex: statement.executionBlockHashHex,
      },
      burnLeaf: burnLeaves[1],
      leafIndex: proof.leafIndex,
      leafCount: proof.leafCount,
      burnProof: proof.proof,
      recipientErgoTreeHex: RECIPIENT_TREE,
    },
    currentErgoHeight: settlementCurrentHeight,
    creationHeight: settlementCurrentHeight,
    feeNanoErg: MINER_FEE,
  };
}

function deterministicBurnLeaves(
  sidechainIdHex: string,
  executionBlockHashHex: string,
): readonly TrustlessBurnLeafInput[] {
  return [0, 1, 2].map(index => {
    const sidechainTxHashHex =
      `0x${String(index + 1).padStart(2, '0').repeat(32)}`;
    return {
      sidechainIdHex,
      sidechainBlockHashHex: executionBlockHashHex,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex,
        sidechainTxHashHex,
        eventIndex: index,
      }),
      sidechainTxHashHex,
      eventIndex: index,
      recipientErgoTreeHashHex: blake2b256Hex(
        Buffer.from(RECIPIENT_TREE, 'hex'),
      ),
      amountNanoErg: index === 1 ? BURN_AMOUNT : '1000000',
      assetIdHex: `0x${'00'.repeat(32)}`,
    };
  });
}

async function materializeTrackerSuccessor(
  context: Awaited<ReturnType<typeof buildSubstrateFederatedTrackerV1Context>>,
): Promise<Eip12Box> {
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  let unsigned: any;
  let id: any;
  let candidates: any;
  let candidate: any;
  let box: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(context.eip12UnsignedTransaction),
    );
    id = unsigned.id();
    if (String(id.to_str()).toLowerCase() !== context.unsignedTransactionIdHex) {
      throw new Error('federated tracker fixture transaction ID drifted');
    }
    candidates = unsigned.output_candidates();
    if (candidates.len() !== 1) {
      throw new Error('federated tracker fixture must have one successor');
    }
    candidate = candidates.get(0);
    box = wasm.ErgoBox.from_box_candidate(candidate, id, 0);
    candidate = undefined;
    id = undefined;
    return box.to_js_eip12() as Eip12Box;
  } finally {
    box?.free?.();
    candidate?.free?.();
    candidates?.free?.();
    id?.free?.();
    unsigned?.free?.();
  }
}

async function buildSyntheticSettlementState(
  family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>,
  currentErgoHeight: number,
): Promise<{
  readonly reservePredecessor: Eip12Box;
  readonly duplicatePreventionPredecessor: Eip12Box;
  readonly feeFundingInput: Eip12Box;
}> {
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const familyRegister = encodeCollByteRegister(Buffer.from(
    family.profile.familyIdHex,
    'hex',
  ));
  const outputs = [{
    value: RESERVE_VALUE,
    ergoTree: family.contracts.pooledReserve.receipt.propositionHex,
    assets: [{ tokenId: family.profile.pooledReserveNftIdHex, amount: '1' }],
    additionalRegisters: {
      R4: familyRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(getPooledReserveEmptyDigest(), 'hex'),
        0x01,
        32,
      ),
      R6: encodeLongRegister(RESERVE_LIABILITY),
    },
    creationHeight: currentErgoHeight - 5,
  }, {
    value: SINGLETON_VALUE,
    ergoTree: family.contracts.duplicatePrevention.receipt.propositionHex,
    assets: [{
      tokenId: family.profile.duplicatePreventionNftIdHex,
      amount: '1',
    }],
    additionalRegisters: {
      R4: familyRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(getDupTreeDigest([]), 'hex'),
        0x01,
        1,
      ),
    },
    creationHeight: currentErgoHeight - 5,
  }, {
    value: String(MINER_FEE),
    ergoTree: RECIPIENT_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: currentErgoHeight - 5,
  }];
  let unsigned: any;
  let id: any;
  let candidates: any;
  const boxes: Eip12Box[] = [];
  try {
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
      inputs: [{ boxId: SETUP_INPUT_ID, extension: {} }],
      dataInputs: [],
      outputs,
    }));
    id = unsigned.id();
    candidates = unsigned.output_candidates();
    if (candidates.len() !== outputs.length) {
      throw new Error('federated settlement fixture output count drifted');
    }
    for (let index = 0; index < candidates.len(); index += 1) {
      const candidate = candidates.get(index);
      const box = wasm.ErgoBox.from_box_candidate(candidate, id, index);
      try {
        boxes.push(box.to_js_eip12() as Eip12Box);
      } finally {
        box.free?.();
        candidate.free?.();
      }
    }
  } finally {
    candidates?.free?.();
    id?.free?.();
    unsigned?.free?.();
  }
  return {
    reservePredecessor: boxes[0],
    duplicatePreventionPredecessor: boxes[1],
    feeFundingInput: boxes[2],
  };
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
