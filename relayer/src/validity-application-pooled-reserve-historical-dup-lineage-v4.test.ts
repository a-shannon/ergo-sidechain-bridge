import { createECDH, createHash } from 'node:crypto';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { describe, expect, it } from 'vitest';

import {
  insertLockRecord,
  insertLockRecordsBatch,
} from './avl-bridge.js';
import {
  reconstructAuthenticatedV2DupHistoryFromDistinctSources,
} from './authenticated-v2-dup-reconstruction.js';
import type { AuthenticatedV2VaultChainSource } from './authenticated-v2-vault-reconstruction.js';
import {
  EMPTY_AVL_DIGEST,
  MINER_FEE_TREE,
  decodeAvlTreeRegisterDigest,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from './ergo-encoding.js';
import {
  deriveValidityApplicationPooledReserveTrackerKeyV4Hex,
} from './validity-application-pooled-reserve-burn-settlement-v4.js';
import {
  HISTORICAL_DUP_FAMILIES_V4,
  HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
  assertValidityApplicationPooledReserveHistoricalDupLineageV4Provenance,
  reconstructValidityApplicationPooledReserveHistoricalDupLineageV4,
  validateValidityApplicationPooledReserveHistoricalDupLineageV4,
  type HistoricalDupFamilyDescriptorV4,
} from './validity-application-pooled-reserve-historical-dup-lineage-v4.js';
import {
  assertValidityApplicationPooledReserveErgoLegacyInventoryV4Packet,
  buildValidityApplicationPooledReserveErgoLegacyInventoryV4,
} from './validity-application-pooled-reserve-ergo-legacy-inventory-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
} from './validity-application-pooled-reserve-cutover-candidate-v4.js';
import {
  buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
  type BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input,
} from './validity-application-pooled-reserve-ergo-legacy-route-profile-v4.js';
import {
  encodeValidityApplicationSettlementBundleV2,
} from './validity-application-settlement-v2.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
} from './trustless-burn-proof.js';

const importedWasm: any = await import('ergo-lib-wasm-nodejs');
const TEST_WASM = importedWasm.default ?? importedWasm;
const BEST_HEADER_ID = 'f1'.repeat(32);
const BEST_PARENT_ID = 'f2'.repeat(32);
const EXTENSION_ROOT = 'f3'.repeat(32);
const TRACKER_BOX_ID = 'f4'.repeat(32);
const VAULT_BOX_ID = 'f5'.repeat(32);
const FEE_BOX_ID = 'f6'.repeat(32);
const PAYOUT_TREE = p2pkTree(230);
const POOLED_RESERVE_V4_LINEAGE_PROFILE_ID = hashHex(
  'pooled-reserve-v4-lineage-profile',
);

interface FixtureData {
  indexed: any[];
  current: any[];
  transactions: Record<string, any>;
  headers: Record<string, any>;
  bestHeader: any;
  indexedHeight: number;
  fullHeight: number;
  network: string;
  binaryOverride?: string;
}

interface Fixture {
  descriptor: HistoricalDupFamilyDescriptorV4;
  profile: ReturnType<typeof buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4>;
  route: ReturnType<typeof buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4>['routes'][number];
  instance: ReturnType<typeof buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4>['routes'][number]['instances'][number];
  data: FixtureData;
  source(id: string, data?: FixtureData): AuthenticatedV2VaultChainSource;
}

function p2pkTree(seed: number): string {
  const ecdh = createECDH('secp256k1');
  const key = Buffer.alloc(32);
  key[30] = Math.floor(seed / 255);
  key[31] = (seed % 255) + 1;
  ecdh.setPrivateKey(key);
  return `1008cd${ecdh.getPublicKey(undefined, 'compressed').toString('hex')}`;
}

function sigmaProp(seed: number): string {
  const tree = p2pkTree(seed);
  return encodeSigmaPropRegister(tree.slice('1008cd'.length));
}

function materializeBox(input: {
  transactionId: string;
  index: number;
  creationHeight: number;
  value?: number;
  ergoTree: string;
  tokenId?: string;
  registers?: Record<string, string>;
}): any {
  const value = TEST_WASM.BoxValue.from_i64(
    TEST_WASM.I64.from_str(String(input.value ?? 2_000_000)),
  );
  const tree = TEST_WASM.ErgoTree.from_base16_bytes(input.ergoTree);
  const contract = TEST_WASM.Contract.new(tree);
  const builder = new TEST_WASM.ErgoBoxCandidateBuilder(
    value,
    contract,
    input.creationHeight,
  );
  try {
    if (input.tokenId !== undefined) {
      builder.add_token(
        TEST_WASM.TokenId.from_str(input.tokenId),
        TEST_WASM.TokenAmount.from_i64(TEST_WASM.I64.from_str('1')),
      );
    }
    for (const [name, encoded] of Object.entries(input.registers ?? {})) {
      builder.set_register_value(
        TEST_WASM.NonMandatoryRegisterId[name],
        TEST_WASM.Constant.decode_from_base16(encoded),
      );
    }
    const candidate = builder.build();
    const transactionId = TEST_WASM.TxId.from_str(input.transactionId);
    const box = TEST_WASM.ErgoBox.from_box_candidate(candidate, transactionId, input.index);
    try {
      return box.to_js_eip12();
    } finally {
      box.free?.();
      transactionId.free?.();
      candidate.free?.();
    }
  } finally {
    builder.free?.();
  }
}

async function binaryResponse(box: any): Promise<{ bytes: string }> {
  const parsed = TEST_WASM.ErgoBox.from_json(JSON.stringify(box));
  try {
    return { bytes: Buffer.from(parsed.sigma_serialize_bytes()).toString('hex') };
  } finally {
    parsed.free?.();
  }
}

function profileInput(): BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input {
  const ergo = VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
    .filter(requirement => requirement.layer === 'ergo');
  return {
    network: { networkId: 'ergo-testnet', addressNetworkPrefix: 16 },
    reviewedSource: {
      sourceRevisionHex: 'a1'.repeat(20),
      basis: [{
        reference: 'repository://bridge/historical-dup-lineage-test-basis-v4',
        sha256Hex: 'b2'.repeat(32),
      }],
    },
    routes: ergo.map((requirement, index) => {
      const ergoTreeHex = p2pkTree(index + 1);
      const singleton = requirement.routeClass === 'tracker'
        || requirement.routeClass === 'duplicate-prevention'
        || requirement.routeClass === 'sidechain-state';
      return {
        routeId: requirement.routeId,
        sourceSurface: requirement.sourceSurface,
        requiredDisposition: requirement.requiredDisposition,
        instances: [{
          instanceId: `instance-${String(index).padStart(2, '0')}`,
          address: ErgoAddress.fromErgoTree(ergoTreeHex, Network.Testnet).toString(),
          ergoTreeHex,
          ergoTreeSha256Hex: sha256Bytes(ergoTreeHex),
          singletonTokenIdHex: singleton ? hashHex(`token-${index}`) : null,
          genesisBoxIdHex: singleton ? hashHex(`temporary-genesis-${index}`) : null,
        }],
      };
    }),
  };
}

function fixture(
  descriptor: HistoricalDupFamilyDescriptorV4,
  batches: readonly (readonly string[])[] = [[hashHex('key-0')]],
  options: Readonly<{
    neverFunded?: boolean;
    profileGenesisOverrideHex?: string;
    secondGeneration?: boolean;
    sourceRevisionHex?: string;
  }> = {},
): Fixture {
  const input = profileInput() as any;
  if (options.sourceRevisionHex !== undefined) {
    input.reviewedSource.sourceRevisionHex = options.sourceRevisionHex;
  }
  const routeInput = input.routes.find((route: any) => route.routeId === descriptor.routeId);
  const instanceInput = routeInput.instances[0];
  const r6 = descriptor.r6Codec === 'fixed-32-byte-profile-id'
    ? encodeCollByteRegister(Buffer.from(hashHex(`profile-${descriptor.routeId}`), 'hex'))
    : sigmaProp(240);
  const setupTxId = hashHex(`setup-${descriptor.routeId}`);
  const setupBlockId = hashHex(`setup-block-${descriptor.routeId}`);
  const rootTemplate = materializeBox({
    transactionId: setupTxId,
    index: 0,
    creationHeight: 100,
    ergoTree: instanceInput.ergoTreeHex,
    tokenId: instanceInput.singletonTokenIdHex,
    registers: dupRegisters(descriptor, 0, EMPTY_AVL_DIGEST, r6),
  });
  instanceInput.genesisBoxIdHex = options.profileGenesisOverrideHex ?? rootTemplate.boxId;
  if (options.secondGeneration) {
    routeInput.instances.push({
      ...instanceInput,
      instanceId: `${instanceInput.instanceId}-prior-generation`,
      singletonTokenIdHex: hashHex(`prior-token-${descriptor.routeId}`),
      genesisBoxIdHex: hashHex(`prior-genesis-${descriptor.routeId}`),
    });
  }
  const profile = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(input);
  const route = profile.routes.find(candidate => candidate.routeId === descriptor.routeId)!;
  const instance = route.instances.find(candidate => candidate.instanceId === instanceInput.instanceId)!;

  if (options.neverFunded) {
    const data = baseData();
    return makeFixture(descriptor, profile, route, instance, data);
  }

  const indexed: any[] = [];
  const current: any[] = [];
  const transactions: Record<string, any> = {};
  const headers: Record<string, any> = {};
  const setupDummy = materializeBox({
    transactionId: setupTxId,
    index: 1,
    creationHeight: 100,
    ergoTree: PAYOUT_TREE,
  });
  transactions[setupTxId] = {
    id: setupTxId,
    blockId: setupBlockId,
    inclusionHeight: 100,
    inputs: [{ boxId: instance.singletonTokenIdHex, spendingProof: { extension: {} } }],
    dataInputs: [],
    outputs: [structuredClone(rootTemplate), setupDummy],
  };
  headers[setupBlockId] = {
    id: setupBlockId,
    parentId: hashHex(`setup-parent-${descriptor.routeId}`),
    height: 100,
    extensionRoot: EXTENSION_ROOT,
  };

  let inputTemplate = rootTemplate;
  const history: string[] = [];
  for (const [transitionIndex, keys] of batches.entries()) {
    const transactionId = hashHex(`spend-${descriptor.routeId}-${transitionIndex}`);
    const blockId = hashHex(`block-${descriptor.routeId}-${transitionIndex}`);
    const height = 101 + transitionIndex;
    let insertedKeys = [...keys];
    let proof: ReturnType<typeof insertLockRecord>
      | ReturnType<typeof insertLockRecordsBatch>;
    let context: Record<string, string>;
    if (descriptor.contextGrammar.kind === 'batch-1-to-20') {
      proof = insertLockRecordsBatch([...history], insertedKeys);
      context = batchContext(
        insertedKeys,
        proof as ReturnType<typeof insertLockRecordsBatch>,
      );
    } else if (descriptor.contextGrammar.kind === 'burn-leaf-proof-bundle') {
      if (insertedKeys.length !== 1) throw new Error('V4 fixture requires one burn seed');
      const burn = v4BurnLeaf(insertedKeys[0], transitionIndex);
      insertedKeys = [burn.burnIdHex];
      proof = insertLockRecord([...history], burn.burnIdHex);
      context = pooledReserveV4Context(
        burn,
        proof as ReturnType<typeof insertLockRecord>,
      );
    } else {
      proof = insertLockRecord([...history], insertedKeys[0]);
      context = singleContext(
        insertedKeys[0],
        proof as ReturnType<typeof insertLockRecord>,
      );
    }
    history.push(...insertedKeys);
    const successorTemplate = materializeBox({
      transactionId,
      index: descriptor.successorOutputIndex,
      creationHeight: height,
      ergoTree: instance.ergoTreeHex,
      tokenId: instance.singletonTokenIdHex!,
      registers: dupRegisters(
        descriptor,
        transitionIndex + 1,
        proof.new_digest_hex,
        r6,
      ),
    });
    indexed.push({
      ...structuredClone(inputTemplate),
      inclusionHeight: 100 + transitionIndex,
      spentTransactionId: transactionId,
      spendingProof: { proofBytes: '', extension: structuredClone(context) },
    });

    const inputs = transactionInputs(descriptor, inputTemplate.boxId, context);
    const outputs = transactionOutputs(descriptor, transactionId, height, successorTemplate);
    transactions[transactionId] = {
      id: transactionId,
      blockId,
      inclusionHeight: height,
      inputs,
      dataInputs: descriptor.topology.dataInputCount === 1
        ? [{ boxId: TRACKER_BOX_ID }]
        : [],
      outputs,
    };
    headers[blockId] = {
      id: blockId,
      parentId: transitionIndex === 0
        ? transactions[setupTxId].blockId
        : hashHex(`block-${descriptor.routeId}-${transitionIndex - 1}`),
      height,
      extensionRoot: EXTENSION_ROOT,
    };
    inputTemplate = successorTemplate;
  }
  indexed.push({
    ...structuredClone(inputTemplate),
    inclusionHeight: 100 + batches.length,
    spentTransactionId: null,
    spendingProof: null,
  });
  current.push(structuredClone(inputTemplate));

  if (options.secondGeneration) {
    const sibling = route.instances.find(candidate => candidate !== instance)!;
    const siblingBox = materializeBox({
      transactionId: hashHex(`prior-setup-${descriptor.routeId}`),
      index: 0,
      creationHeight: 90,
      ergoTree: sibling.ergoTreeHex,
      tokenId: sibling.singletonTokenIdHex!,
      registers: dupRegisters(descriptor, 0, EMPTY_AVL_DIGEST, r6),
    });
    indexed.unshift({
      ...structuredClone(siblingBox),
      inclusionHeight: 90,
      spentTransactionId: null,
      spendingProof: null,
    });
    current.unshift(structuredClone(siblingBox));
  }

  const data = {
    ...baseData(),
    indexed,
    current,
    transactions,
    headers,
  };
  return makeFixture(descriptor, profile, route, instance, data);
}

function baseData(): FixtureData {
  return {
    indexed: [],
    current: [],
    transactions: {},
    headers: {},
    bestHeader: {
      id: BEST_HEADER_ID,
      parentId: BEST_PARENT_ID,
      height: 500,
      extensionRoot: EXTENSION_ROOT,
    },
    indexedHeight: 500,
    fullHeight: 500,
    network: 'testnet',
  };
}

function makeFixture(
  descriptor: HistoricalDupFamilyDescriptorV4,
  profile: Fixture['profile'],
  route: Fixture['route'],
  instance: Fixture['instance'],
  data: FixtureData,
): Fixture {
  return {
    descriptor,
    profile,
    route,
    instance,
    data,
    source(id, sourceData = data) {
      return sourceFor(id, sourceData);
    },
  };
}

function sourceFor(id: string, data: FixtureData): AuthenticatedV2VaultChainSource {
  return {
    observationSourceId: id,
    async getInfo() {
      return { network: data.network };
    },
    async getIndexedHeight() {
      return { indexedHeight: data.indexedHeight, fullHeight: data.fullHeight };
    },
    async getBestHeader() {
      return structuredClone(data.bestHeader);
    },
    async getIndexedBoxesByAddress() {
      return structuredClone(data.indexed);
    },
    async getUnspentBoxesByAddress() {
      return structuredClone(data.current);
    },
    async getIndexedBoxesByTokenId(tokenId: string) {
      return structuredClone(data.indexed.filter(box =>
        box.assets?.some((asset: any) => asset.tokenId === tokenId)
      ));
    },
    async getTransaction(transactionId: string) {
      return structuredClone(data.transactions[transactionId] ?? null);
    },
    async getBlockHeaderById(blockId: string) {
      return structuredClone(data.headers[blockId] ?? null);
    },
    async getBoxByIdOrNull(boxId: string) {
      return structuredClone(data.current.find(box => box.boxId === boxId) ?? null);
    },
    async getBoxBinaryByIdOrNull(boxId: string) {
      if (data.binaryOverride !== undefined) return { bytes: data.binaryOverride };
      const box = data.current.find(candidate => candidate.boxId === boxId);
      return box === undefined ? null : binaryResponse(box);
    },
  };
}

function profileWideSourceFor(id: string, f: Fixture): AuthenticatedV2VaultChainSource {
  const source = sourceFor(id, f.data);
  return {
    ...source,
    async getIndexedBoxesByAddress(address: string) {
      return address === f.instance.address
        ? structuredClone(f.data.indexed)
        : [];
    },
    async getUnspentBoxesByAddress(address: string) {
      return address === f.instance.address
        ? structuredClone(f.data.current)
        : [];
    },
  };
}

function transactionInputs(
  descriptor: HistoricalDupFamilyDescriptorV4,
  singletonBoxId: string,
  context: Record<string, string>,
): any[] {
  const singleton = {
    boxId: singletonBoxId,
    spendingProof: { proofBytes: '', extension: structuredClone(context) },
  };
  if (descriptor.topology.selfInputIndex === 1) {
    return [
      { boxId: VAULT_BOX_ID, spendingProof: { extension: {} } },
      singleton,
      { boxId: FEE_BOX_ID, spendingProof: { extension: {} } },
    ];
  }
  if (descriptor.topology.inputCount === 2) {
    return [singleton, { boxId: VAULT_BOX_ID, spendingProof: { extension: {} } }];
  }
  if (descriptor.topology.inputCount === 3) {
    return [
      singleton,
      { boxId: VAULT_BOX_ID, spendingProof: { extension: {} } },
      { boxId: FEE_BOX_ID, spendingProof: { extension: {} } },
    ];
  }
  if (descriptor.successorOutputIndex === 1) {
    return [
      { boxId: TRACKER_BOX_ID, spendingProof: { extension: {} } },
      singleton,
      { boxId: VAULT_BOX_ID, spendingProof: { extension: {} } },
    ];
  }
  return [singleton, { boxId: VAULT_BOX_ID, spendingProof: { extension: {} } }];
}

function transactionOutputs(
  descriptor: HistoricalDupFamilyDescriptorV4,
  transactionId: string,
  height: number,
  successor: any,
): any[] {
  const payout = materializeBox({
    transactionId,
    index: descriptor.successorOutputIndex + 1,
    creationHeight: height,
    value: 3_900_000,
    ergoTree: PAYOUT_TREE,
  });
  const fee = materializeBox({
    transactionId,
    index: descriptor.successorOutputIndex + 2,
    creationHeight: height,
    value: 1_100_000,
    ergoTree: MINER_FEE_TREE,
  });
  if (descriptor.successorOutputIndex === 0) return [structuredClone(successor), payout, fee];
  const tracker = materializeBox({
    transactionId,
    index: 0,
    creationHeight: height,
    ergoTree: PAYOUT_TREE,
  });
  return [tracker, structuredClone(successor), payout, fee];
}

function singleContext(
  key: string,
  proof: ReturnType<typeof insertLockRecord>,
): Record<string, string> {
  return {
    '0': encodeCollByteRegister(Buffer.from(proof.lookup_proof_hex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(key, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(proof.insert_proof_hex, 'hex')),
  };
}

function batchContext(
  keys: readonly string[],
  proof: ReturnType<typeof insertLockRecordsBatch>,
): Record<string, string> {
  const context: Record<string, string> = {
    '0': encodeIntRegister(keys.length),
    '1': encodeCollByteRegister(Buffer.from(proof.insert_proof_hex, 'hex')),
  };
  keys.forEach((key, index) => {
    context[String(2 + index)] = encodeCollByteRegister(Buffer.from(key, 'hex'));
    context[String(22 + index)] = encodeCollByteRegister(
      Buffer.from(proof.lookup_proofs_hex[index], 'hex'),
    );
  });
  return context;
}

function dupRegisters(
  descriptor: HistoricalDupFamilyDescriptorV4,
  counter: number,
  digestHex: string,
  r6: string,
): Record<string, string> {
  const flags = descriptor.contextGrammar.kind === 'burn-leaf-proof-bundle'
    ? 0x01
    : 0x0b;
  const common = {
    R5: encodeAvlTreeRegister(Buffer.from(digestHex, 'hex'), flags, 1),
  };
  if (descriptor.r6Codec === 'absent') {
    return {
      R4: encodeCollByteRegister(
        Buffer.from(POOLED_RESERVE_V4_LINEAGE_PROFILE_ID, 'hex'),
      ),
      ...common,
    };
  }
  return { R4: encodeLongRegister(counter), ...common, R6: r6 };
}

function v4BurnLeaf(seedHex: string, eventIndex: number) {
  const sidechainIdHex = hashHex('pooled-reserve-v4-sidechain');
  const sidechainTxHashHex = seedHex;
  const burnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex,
    sidechainTxHashHex,
    eventIndex,
  });
  return encodeTrustlessBurnLeaf({
    sidechainIdHex,
    sidechainBlockHashHex: hashHex(`pooled-reserve-v4-block-${eventIndex}`),
    burnIdHex,
    sidechainTxHashHex,
    eventIndex,
    recipientErgoTreeHashHex: hashHex('pooled-reserve-v4-recipient'),
    amountNanoErg: '1000000',
  });
}

function pooledReserveV4Context(
  burn: ReturnType<typeof encodeTrustlessBurnLeaf>,
  proof: ReturnType<typeof insertLockRecord>,
): Record<string, string> {
  const sidechainHeight = 100;
  const proofBundleHex = encodeValidityApplicationSettlementBundleV2({
    sidechainHeight,
    leafIndex: 0,
    leafCount: 1,
    leafHashHex: burn.leafHashHex,
    burnProof: [],
    dupLookupProofHex: proof.lookup_proof_hex,
    dupInsertProofHex: proof.insert_proof_hex,
  });
  return {
    '0': encodeCollByteRegister(Buffer.from(
      deriveValidityApplicationPooledReserveTrackerKeyV4Hex({
        sidechainIdHex: burn.sidechainIdHex,
        sidechainHeight,
        executionBlockHashHex: burn.sidechainBlockHashHex,
      }),
      'hex',
    )),
    '1': encodeCollByteRegister(Buffer.from('01', 'hex')),
    '2': encodeCollByteRegister(Buffer.from(burn.encodedLeafHex, 'hex')),
    '3': encodeCollByteRegister(Buffer.from(proofBundleHex, 'hex')),
  };
}

async function reconstruct(f: Fixture, witnessData = f.data) {
  return reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
    profile: f.profile,
    route: f.route,
    instance: f.instance,
    primarySource: f.source('fixture://primary'),
    witnessSource: f.source('fixture://witness', witnessData),
  });
}

function transition(f: Fixture, index = 0): any {
  return f.data.transactions[hashHex(`spend-${f.descriptor.routeId}-${index}`)];
}

function indexedInput(f: Fixture, index = 0): any {
  return f.data.indexed.filter(box => box.assets[0].tokenId === f.instance.singletonTokenIdHex)[index];
}

function tip(f: Fixture): any {
  return f.data.current.find(box => box.assets[0].tokenId === f.instance.singletonTokenIdHex);
}

function synchronizeSuccessorMutation(f: Fixture, mutate: (box: any) => void): void {
  const indexedTip = f.data.indexed.find(box => box.boxId === tip(f).boxId)!;
  const txOutput = transition(f).outputs[f.descriptor.successorOutputIndex];
  mutate(indexedTip);
  mutate(txOutput);
  mutate(tip(f));
}

function synchronizeContextMutation(
  f: Fixture,
  mutate: (context: Record<string, string>) => void,
): void {
  const indexed = indexedInput(f);
  const transactionInput = transition(f).inputs.find(
    (input: any) => input.boxId === indexed.boxId,
  );
  mutate(indexed.spendingProof.extension);
  mutate(transactionInput.spendingProof.extension);
}

function synchronizeIntermediateSuccessorMutation(
  f: Fixture,
  mutate: (box: any) => void,
): void {
  const lineage = f.data.indexed.filter(box =>
    box.assets[0].tokenId === f.instance.singletonTokenIdHex
  );
  mutate(lineage[1]);
  mutate(transition(f).outputs[f.descriptor.successorOutputIndex]);
}

function hashHex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Bytes(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'hex')).digest('hex');
}

describe('pooled-reserve V4 historical DUP lineage reconstruction', () => {
  it('freezes an exact descriptor for every static historical DUP route', () => {
    expect(HISTORICAL_DUP_FAMILIES_V4.map(descriptor => [
      descriptor.routeId,
      descriptor.sourceSurface,
      descriptor.declaredKeyIntent,
      descriptor.observedKeySemantics,
      descriptor.successorOutputIndex,
      descriptor.contextGrammar.kind,
      descriptor.r6Codec,
      descriptor.treeUpdateStrength,
      descriptor.counterRule,
      descriptor.tokenStrength,
    ])).toEqual([
      ['ergo-double-unlock-prevention', 'contracts/DoubleUnlockPrevention.es', 'sidechain-burn-transaction-hash', 'opaque-32-byte-replay-key', 0, 'single-key', 'canonical-dlog-sigmaprop', 'digest-only', 'one-per-spending-transaction', 'script-preserves-token-id-only'],
      ['ergo-double-unlock-prevention-aggregate', 'contracts/DoubleUnlockPreventionAggregate.es', 'sidechain-burn-transaction-hash', 'opaque-32-byte-replay-key', 1, 'single-key', 'canonical-dlog-sigmaprop', 'digest-only', 'one-per-spending-transaction', 'script-preserves-first-token-id-and-amount'],
      ['ergo-double-unlock-prevention-aggregate-batch', 'contracts/DoubleUnlockPreventionAggregateBatch.es', 'sidechain-burn-transaction-hash', 'opaque-32-byte-replay-key', 1, 'batch-1-to-20', 'canonical-dlog-sigmaprop', 'digest-only', 'one-per-spending-transaction', 'script-preserves-first-token-id-and-amount'],
      ['ergo-double-unlock-prevention-authenticated', 'contracts/DoubleUnlockPreventionAuthenticated.es', 'event-level-burn-id', 'opaque-32-byte-replay-key', 0, 'single-key', 'canonical-dlog-sigmaprop', 'full-avl-equality', 'one-per-spending-transaction', 'script-enforces-exact-singleton'],
      ['ergo-double-unlock-prevention-authenticated-external-fee-v1', 'contracts/DoubleUnlockPreventionAuthenticatedExternalFeeV1.es', 'event-level-burn-id', 'opaque-32-byte-replay-key', 0, 'single-key', 'canonical-dlog-sigmaprop', 'full-avl-equality', 'one-per-spending-transaction', 'script-enforces-exact-singleton'],
      ['ergo-double-unlock-prevention-causal-v2', 'contracts/DoubleUnlockPreventionCausalV2.es', 'event-level-burn-id', 'opaque-32-byte-replay-key', 0, 'single-key', 'canonical-dlog-sigmaprop', 'full-avl-equality', 'one-per-spending-transaction', 'script-enforces-exact-singleton'],
      ['ergo-double-unlock-prevention-validity-v1', 'contracts/DoubleUnlockPreventionValidityV1.es', 'event-level-burn-id', 'opaque-32-byte-replay-key', 0, 'single-key', 'fixed-32-byte-profile-id', 'full-avl-equality', 'one-per-spending-transaction', 'script-enforces-exact-singleton'],
      ['ergo-double-unlock-prevention-validity-application-v2', 'contracts/DoubleUnlockPreventionValidityApplicationV2.es', 'event-level-burn-id', 'opaque-32-byte-replay-key', 0, 'single-key', 'fixed-32-byte-profile-id', 'full-avl-equality', 'one-per-spending-transaction', 'script-enforces-exact-singleton'],
      ['ergo-double-unlock-prevention-pooled-reserve-v4', 'contracts/DoubleUnlockPreventionPooledReserveV4.es', 'event-level-burn-id', 'opaque-32-byte-replay-key', 1, 'burn-leaf-proof-bundle', 'absent', 'full-avl-equality', 'not-encoded-profile-bound', 'script-enforces-exact-singleton'],
    ]);
    expect(HISTORICAL_DUP_FAMILIES_V4.every(descriptor =>
      Object.isFrozen(descriptor) && Object.isFrozen(descriptor.topology)
    )).toBe(true);
    expect(HISTORICAL_DUP_FAMILIES_V4.map(descriptor => [
      descriptor.topology,
      descriptor.valueRule,
      descriptor.creationHeightRule,
      descriptor.companionRouteSemantics,
    ])).toEqual([
      [{ selfInputIndex: 'script-unconstrained', inputCount: 'script-unconstrained', dataInputCount: 'script-unconstrained' }, 'nondecreasing', 'script-unconstrained', 'legacy direct unlock route'],
      [{ selfInputIndex: 'script-unconstrained', inputCount: 'script-unconstrained', dataInputCount: 'script-unconstrained' }, 'nondecreasing', 'script-unconstrained', 'legacy tracker plus aggregate settlement vault'],
      [{ selfInputIndex: 'script-unconstrained', inputCount: 'script-unconstrained', dataInputCount: 'script-unconstrained' }, 'nondecreasing', 'script-unconstrained', 'legacy tracker plus batch aggregate settlement vault'],
      [{ selfInputIndex: 0, inputCount: 2, dataInputCount: 1 }, 'nondecreasing', 'script-unconstrained', 'SPVTrackerAuthenticated.es plus MainChainAggregateUnlockAuthenticated.es'],
      [{ selfInputIndex: 0, inputCount: 3, dataInputCount: 1 }, 'exactly-preserved', 'script-unconstrained', 'SPVTrackerAuthenticated.es plus MainChainAggregateUnlockAuthenticatedExternalFeeV1.es'],
      [{ selfInputIndex: 0, inputCount: 2, dataInputCount: 1 }, 'nondecreasing', 'script-unconstrained', 'SPVTrackerAuthenticated.es plus MainChainCausalVaultV2.es'],
      [{ selfInputIndex: 0, inputCount: 3, dataInputCount: 1 }, 'exactly-preserved', 'successor-within-spending-height-minus-100', 'SPVTrackerValidityV1.es plus MainChainCausalVaultValidityV1.es'],
      [{ selfInputIndex: 0, inputCount: 3, dataInputCount: 1 }, 'exactly-preserved', 'successor-within-spending-height-minus-100', 'SPVTrackerValidityApplicationV2.es plus MainChainCausalVaultValidityApplicationV2.es'],
      [{ selfInputIndex: 1, inputCount: 3, dataInputCount: 1 }, 'exactly-preserved', 'successor-within-spending-height-minus-100', 'SPVTrackerPooledReserveBurnV4.es plus MainChainPooledReserveValidityApplicationV4.es'],
    ]);
  });

  it('reconstructs empty and funded pooled-reserve V4 DUP lineages without promoting raw keys', async () => {
    const descriptor = HISTORICAL_DUP_FAMILIES_V4.find(candidate =>
      candidate.routeId === 'ergo-double-unlock-prevention-pooled-reserve-v4'
    )!;
    const empty = fixture(descriptor, [], { neverFunded: true });
    await expect(reconstruct(empty)).resolves.toMatchObject({
      classification: 'never-funded',
      rawInsertedKeysHex: [],
    });

    const funded = fixture(descriptor, [
      [hashHex('funded-v4-burn-0')],
      [hashHex('funded-v4-burn-1')],
    ]);
    const result = await reconstruct(funded);
    expect(result).toMatchObject({
      classification: 'raw-reconstructed',
      tipCounter: '2',
      boundaries: {
        canonicalEventMappingEstablished: false,
        fundsAuthorityEstablished: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
      },
    });
    expect(result.rawInsertedKeysHex).toEqual([
      v4BurnLeaf(hashHex('funded-v4-burn-0'), 0).burnIdHex,
      v4BurnLeaf(hashHex('funded-v4-burn-1'), 1).burnIdHex,
    ]);
    expect(result.lineageBoxes.map(box => box.registers)).toEqual([
      expect.objectContaining({
        R4: encodeCollByteRegister(
          Buffer.from(POOLED_RESERVE_V4_LINEAGE_PROFILE_ID, 'hex'),
        ),
      }),
      expect.objectContaining({
        R4: encodeCollByteRegister(
          Buffer.from(POOLED_RESERVE_V4_LINEAGE_PROFILE_ID, 'hex'),
        ),
      }),
      expect.objectContaining({
        R4: encodeCollByteRegister(
          Buffer.from(POOLED_RESERVE_V4_LINEAGE_PROFILE_ID, 'hex'),
        ),
      }),
    ]);
    expect(result.lineageBoxes.every(box => !Object.hasOwn(box.registers, 'R6')))
      .toBe(true);
    expect(() => validateValidityApplicationPooledReserveHistoricalDupLineageV4(result))
      .not.toThrow();
  });

  it.each([
    ['R4 lineage-profile drift', (f: Fixture) => {
      synchronizeSuccessorMutation(f, box => {
        box.additionalRegisters.R4 = encodeCollByteRegister(
          Buffer.from(hashHex('wrong-pooled-reserve-v4-profile'), 'hex'),
        );
      });
    }, /changes the pooled-reserve V4 lineage profile/],
    ['introduced R6', (f: Fixture) => {
      synchronizeSuccessorMutation(f, box => {
        box.additionalRegisters.R6 = sigmaProp(242);
      });
    }, /registers|R6/],
    ['non-insert-only AVL policy', (f: Fixture) => {
      synchronizeSuccessorMutation(f, box => {
        const digest = decodeAvlTreeRegisterDigest(box.additionalRegisters.R5);
        box.additionalRegisters.R5 = encodeAvlTreeRegister(
          Buffer.from(digest, 'hex'),
          0x03,
          1,
        );
      });
    }, /insert-only/],
    ['non-canonical burn leaf', (f: Fixture) => {
      synchronizeContextMutation(f, context => {
        const leaf = Buffer.from(decodeCollByteRegister(context['2']), 'hex');
        leaf[0] ^= 0x01;
        context['2'] = encodeCollByteRegister(leaf);
      });
    }, /burn leaf|canonical V1/],
    ['DUP proof drift', (f: Fixture) => {
      synchronizeContextMutation(f, context => {
        const bundle = Buffer.from(decodeCollByteRegister(context['3']), 'hex');
        bundle[bundle.length - 1] ^= 0x01;
        context['3'] = encodeCollByteRegister(bundle);
      });
    }, /DUP proofs do not replay/],
    ['tracker key drift', (f: Fixture) => {
      synchronizeContextMutation(f, context => {
        context['0'] = encodeCollByteRegister(Buffer.from(hashHex('wrong-tracker-key'), 'hex'));
      });
    }, /tracker key does not match/],
    ['wrong singleton input index', (f: Fixture) => {
      const transaction = transition(f);
      [transaction.inputs[0], transaction.inputs[1]] = [
        transaction.inputs[1],
        transaction.inputs[0],
      ];
    }, /wrong input index/],
    ['extra output', (f: Fixture) => {
      const transaction = transition(f);
      transaction.outputs.push(structuredClone(transaction.outputs[3]));
    }, /must have four outputs/],
  ])('rejects funded pooled-reserve V4 %s', async (_label, mutate, expected) => {
    const descriptor = HISTORICAL_DUP_FAMILIES_V4.find(candidate =>
      candidate.routeId === 'ergo-double-unlock-prevention-pooled-reserve-v4'
    )!;
    const f = fixture(descriptor, [[hashHex('funded-v4-negative')]]);
    mutate(f);
    await expect(reconstruct(f)).rejects.toThrow(expected);
  });

  it.each(HISTORICAL_DUP_FAMILIES_V4.filter(descriptor =>
    descriptor.contextGrammar.kind === 'single-key'
  ))('reconstructs $sourceSurface without promoting its raw key', async descriptor => {
    const key = hashHex(`positive-${descriptor.routeId}`);
    const f = fixture(descriptor, [[key]]);
    const result = await reconstruct(f);
    expect(result.classification).toBe('raw-reconstructed');
    expect(result.rawInsertedKeysHex).toEqual([key]);
    expect(result.tipCounter).toBe('1');
    expect(result.descriptor).toBe(descriptor);
    expect(result.historicalScriptLimitations).toEqual(expect.objectContaining({
      declaredKeyIntent: descriptor.declaredKeyIntent,
      observedKeySemantics: HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
      rawKeysPromotedToCanonicalEvents: false,
      contextExtensionDigestValidation:
        'producer-attested-format-and-packet-digest-only',
      spendingBlockIdValidation:
        'producer-attested-format-and-packet-digest-only',
    }));
    expect(result.packetDigestHex).toHaveLength(64);
    expect(result.lineageBoxes).toHaveLength(2);
    expect(result.boundaries).toEqual(expect.objectContaining({
      canonicalEventMappingEstablished: false,
      completeIndexedTokenLineageMatchedAddress: true,
      singletonIssuanceRootEstablished: true,
      ergoConsensusAuthenticated: false,
      transactionInclusionAuthenticated: false,
      globalGenesisBuilt: false,
      fundsAuthorityEstablished: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
    }));
    expect(() =>
      assertValidityApplicationPooledReserveHistoricalDupLineageV4Provenance(result)
    ).not.toThrow();
    expect(
      validateValidityApplicationPooledReserveHistoricalDupLineageV4(
        structuredClone(result),
      ).packetDigestHex,
    ).toBe(result.packetDigestHex);
    expect(Object.isFrozen(result.transitions[0])).toBe(true);
  });

  it.each([1, 2, 20])('reconstructs a native batch of %i raw transaction hashes', async count => {
    const descriptor = HISTORICAL_DUP_FAMILIES_V4[2];
    const keys = Array.from({ length: count }, (_, index) => hashHex(`batch-${count}-${index}`));
    const result = await reconstruct(fixture(descriptor, [keys]));
    expect(result.rawInsertedKeysHex).toEqual(keys);
    expect(result.transitions[0].rawInsertedKeysHex).toEqual(keys);
    expect(result.tipCounter).toBe('1');
    expect(
      validateValidityApplicationPooledReserveHistoricalDupLineageV4(
        structuredClone(result),
      ).packetDigestHex,
    ).toBe(result.packetDigestHex);
  });

  it('counts sequential batch transactions rather than inserted keys', async () => {
    const descriptor = HISTORICAL_DUP_FAMILIES_V4[2];
    const first = [hashHex('batch-a'), hashHex('batch-b')];
    const second = [hashHex('batch-c')];
    const result = await reconstruct(fixture(descriptor, [first, second]));
    expect(result.rawInsertedKeysHex).toEqual([...first, ...second]);
    expect(result.transitions.map(entry => entry.counterAfter)).toEqual(['1', '2']);
    expect(result.tipCounter).toBe('2');
  });

  it('preserves each family native full-tree versus digest-only update semantics', async () => {
    const keys = [[hashHex('policy-first')], [hashHex('policy-second')]];
    const digestOnly = fixture(HISTORICAL_DUP_FAMILIES_V4[0], keys);
    synchronizeIntermediateSuccessorMutation(digestOnly, box => {
      const register = box.additionalRegisters.R5;
      box.additionalRegisters.R5 = `${register.slice(0, 68)}0f${register.slice(70)}`;
    });
    await expect(reconstruct(digestOnly)).resolves.toEqual(expect.objectContaining({
      classification: 'raw-reconstructed',
    }));

    const fullEquality = fixture(HISTORICAL_DUP_FAMILIES_V4[3], keys);
    synchronizeIntermediateSuccessorMutation(fullEquality, box => {
      const register = box.additionalRegisters.R5;
      box.additionalRegisters.R5 = `${register.slice(0, 68)}0f${register.slice(70)}`;
    });
    await expect(reconstruct(fullEquality)).rejects.toThrow(/full AvlTree policy/);
  });

  it('binds the profiled genesis to its setup transaction height and block header', async () => {
    const wrongHeight = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    const setupId = hashHex(`setup-${wrongHeight.descriptor.routeId}`);
    wrongHeight.data.transactions[setupId].inclusionHeight += 1;
    await expect(reconstruct(wrongHeight)).rejects.toThrow(/genesis height/);

    const missingHeader = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    const missingSetupId = hashHex(`setup-${missingHeader.descriptor.routeId}`);
    delete missingHeader.data.headers[missingHeader.data.transactions[missingSetupId].blockId];
    await expect(reconstruct(missingHeader)).rejects.toThrow(/block header is unavailable/);

    const wrongIssuanceRoot = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    const wrongRootSetupId = hashHex(`setup-${wrongIssuanceRoot.descriptor.routeId}`);
    wrongIssuanceRoot.data.transactions[wrongRootSetupId].inputs[0].boxId =
      hashHex('not-the-singleton-issuance-input');
    await expect(reconstruct(wrongIssuanceRoot)).rejects.toThrow(
      /singleton NFT must equal the setup transaction first input box ID/,
    );
  });

  it('requires complete token history to equal the profiled address lineage', async () => {
    const f = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    const rogue = materializeBox({
      transactionId: hashHex('rogue-singleton-transaction'),
      index: 0,
      creationHeight: 99,
      ergoTree: PAYOUT_TREE,
      tokenId: f.instance.singletonTokenIdHex!,
      registers: {
        R4: encodeLongRegister(0),
        R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
        R6: sigmaProp(240),
      },
    });
    const sourceWithRogueTokenHistory = (id: string) => {
      const source = f.source(id);
      const original = source.getIndexedBoxesByTokenId.bind(source);
      source.getIndexedBoxesByTokenId = async tokenId => [
        ...await original(tokenId),
        structuredClone(rogue),
      ];
      return source;
    };

    await expect(
      reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
        profile: f.profile,
        route: f.route,
        instance: f.instance,
        primarySource: sourceWithRogueTokenHistory('fixture://rogue-primary'),
        witnessSource: sourceWithRogueTokenHistory('fixture://rogue-witness'),
      }),
    ).rejects.toThrow(/wrong ErgoTree|complete singleton-token lineage/);
  });

  it('classifies two-source empty exact instances as never funded', async () => {
    const result = await reconstruct(fixture(HISTORICAL_DUP_FAMILIES_V4[0], [], {
      neverFunded: true,
    }));
    expect(result.classification).toBe('never-funded');
    expect(result.genesisObservedBoxIdHex).toBeNull();
    expect(result.tipBoxIdHex).toBeNull();
    expect(result.rawInsertedKeysHex).toEqual([]);
    expect(result.boundaries.inventoryExhaustive).toBe(false);
    expect(result.boundaries.completeIndexedTokenLineageMatchedAddress).toBe(true);
    expect(result.boundaries.singletonIssuanceRootEstablished).toBe(false);
  });

  it('separates generations sharing one tree by exact NFT and genesis identity', async () => {
    const f = fixture(HISTORICAL_DUP_FAMILIES_V4[3], [[hashHex('current-generation')]], {
      secondGeneration: true,
    });
    const result = await reconstruct(f);
    expect(result.singletonTokenIdHex).toBe(f.instance.singletonTokenIdHex);
    expect(result.genesisObservedBoxIdHex).toBe(f.instance.genesisBoxIdHex);
    expect(result.rawInsertedKeysHex).toEqual([hashHex('current-generation')]);
  });

  it('binds the observation digest to the process-provenant profile identity', async () => {
    const descriptor = HISTORICAL_DUP_FAMILIES_V4[3];
    const key = hashHex('profile-bound-observation');
    const first = fixture(descriptor, [[key]], { sourceRevisionHex: 'a1'.repeat(20) });
    const second = fixture(descriptor, [[key]], { sourceRevisionHex: 'a2'.repeat(20) });
    const left = await reconstruct(first);
    const right = await reconstruct(second);
    expect(left.rawInsertedKeysHex).toEqual(right.rawInsertedKeysHex);
    expect(left.profileDigestHex).not.toBe(right.profileDigestHex);
    expect(left.observationDigestHex).not.toBe(right.observationDigestHex);
  });

  it('keeps observation identity source-neutral while binding the outer packet to the source pair', async () => {
    const f = fixture(HISTORICAL_DUP_FAMILIES_V4[3]);
    const first = await reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
      profile: f.profile,
      route: f.route,
      instance: f.instance,
      primarySource: f.source('fixture://pair-a'),
      witnessSource: f.source('fixture://pair-b'),
    });
    const second = await reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
      profile: f.profile,
      route: f.route,
      instance: f.instance,
      primarySource: f.source('fixture://pair-c'),
      witnessSource: f.source('fixture://pair-d'),
    });
    expect(first.observationDigestHex).toBe(second.observationDigestHex);
    expect(first.packetDigestHex).not.toBe(second.packetDigestHex);
    expect(first.sourceIdDigestsHex).not.toEqual(second.sourceIdDigestsHex);
  });

  it('cross-checks the authenticated V2 family without changing its existing API or bytes', async () => {
    const descriptor = HISTORICAL_DUP_FAMILIES_V4[3];
    const key = hashHex('authenticated-v2-cross-check');
    const f = fixture(descriptor, [[key]]);
    const historical = await reconstruct(f);
    const existing = await reconstructAuthenticatedV2DupHistoryFromDistinctSources({
      primarySource: f.source('fixture://authenticated-primary'),
      witnessSource: f.source('fixture://authenticated-witness'),
      duplicatePreventionNftIdHex: f.instance.singletonTokenIdHex!,
      duplicatePreventionErgoTreeHex: f.instance.ergoTreeHex,
    });
    expect(existing.historyKeys).toEqual(historical.rawInsertedKeysHex);
    expect(existing.tipDigestHex).toBe(historical.tipDigestHex);
    expect(existing.tipCounter).toBe(historical.tipCounter);
  });

  it('rejects wrong route, cloned profile dependencies, and forged output provenance', async () => {
    const f = fixture(HISTORICAL_DUP_FAMILIES_V4[3]);
    const nonDup = f.profile.routes.find(route => route.routeClass !== 'duplicate-prevention')!;
    await expect(reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
      profile: f.profile,
      route: nonDup,
      instance: nonDup.instances[0],
      primarySource: f.source('fixture://wrong-route-primary'),
      witnessSource: f.source('fixture://wrong-route-witness'),
    })).rejects.toThrow(/supported historical DUP family/);

    await expect(reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
      profile: structuredClone(f.profile),
      route: structuredClone(f.route),
      instance: structuredClone(f.instance),
      primarySource: f.source('fixture://cloned-primary'),
      witnessSource: f.source('fixture://cloned-witness'),
    } as any)).rejects.toThrow(/not built in this process/);

    await expect(reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
      profile: f.profile,
      route: structuredClone(f.route),
      instance: f.instance,
      primarySource: f.source('fixture://route-clone-primary'),
      witnessSource: f.source('fixture://route-clone-witness'),
    } as any)).rejects.toThrow(/exact object/);

    const result = await reconstruct(f);
    expect(() =>
      assertValidityApplicationPooledReserveHistoricalDupLineageV4Provenance(
        structuredClone(result),
      )
    ).toThrow(/not built in this process/);
    expect(() => {
      (result.boundaries as any).fundsAuthorityEstablished = true;
    }).toThrow();
    expect(result.boundaries.fundsAuthorityEstablished).toBe(false);
  });

  it.each([
    ['wrong ErgoTree', (f: Fixture) => {
      indexedInput(f).ergoTree = PAYOUT_TREE;
    }, /wrong ErgoTree/],
    ['wrong singleton NFT', (f: Fixture) => {
      indexedInput(f).assets[0].tokenId = hashHex('unknown-alias');
    }, /unprofiled singleton alias/],
    ['wrong profiled genesis', (_f: Fixture) => {}, /profiled genesis/],
    ['multiple tips', (f: Fixture) => {
      indexedInput(f).spentTransactionId = null;
      indexedInput(f).spendingProof = null;
    }, /exactly one tip/],
    ['disconnected successor', (f: Fixture) => {
      indexedInput(f).spentTransactionId = hashHex('missing-successor');
    }, /successor is missing/],
    ['wrong successor output', (f: Fixture) => {
      transition(f).outputs[f.descriptor.successorOutputIndex] = transition(f).outputs.at(-1);
    }, /does not match|wrong ErgoTree|exact profiled singleton/],
    ['wrong input topology', (f: Fixture) => {
      transition(f).inputs.shift();
    }, /consume the singleton|wrong input count/],
    ['counter drift', (f: Fixture) => {
      synchronizeSuccessorMutation(f, box => {
        box.additionalRegisters.R4 = encodeLongRegister(9);
      });
    }, /counter must advance/],
    ['AVL digest drift', (f: Fixture) => {
      synchronizeSuccessorMutation(f, box => {
        box.additionalRegisters.R5 = encodeAvlTreeRegister(
          Buffer.from(EMPTY_AVL_DIGEST, 'hex'),
          0x0b,
          1,
        );
      });
    }, /successor digest/],
    ['R6 drift', (f: Fixture) => {
      synchronizeSuccessorMutation(f, box => {
        box.additionalRegisters.R6 = sigmaProp(241);
      });
    }, /changes R6/],
    ['value drift', (f: Fixture) => {
      synchronizeSuccessorMutation(f, box => {
        box.value = '1000000';
      });
    }, /preserve value|reduces singleton value/],
    ['script drift', (f: Fixture) => {
      synchronizeSuccessorMutation(f, box => {
        box.ergoTree = PAYOUT_TREE;
      });
    }, /wrong ErgoTree/],
    ['token amount drift', (f: Fixture) => {
      synchronizeSuccessorMutation(f, box => {
        box.assets[0].amount = '2';
      });
    }, /exact singleton|amount one/],
    ['missing context variable', (f: Fixture) => {
      delete indexedInput(f).spendingProof.extension['2'];
      delete transition(f).inputs[0].spendingProof.extension['2'];
    }, /missing required/],
    ['malformed raw key', (f: Fixture) => {
      indexedInput(f).spendingProof.extension['1'] = encodeCollByteRegister(Buffer.from('01', 'hex'));
      transition(f).inputs[0].spendingProof.extension['1'] = indexedInput(f).spendingProof.extension['1'];
    }, /must be 32 bytes/],
    ['malformed proof', (f: Fixture) => {
      indexedInput(f).spendingProof.extension['0'] = encodeCollByteRegister(Buffer.from('00', 'hex'));
      transition(f).inputs[0].spendingProof.extension['0'] = indexedInput(f).spendingProof.extension['0'];
    }, /proofs do not replay/],
  ])('rejects %s', async (label, mutate, expected) => {
    const descriptor = label === 'wrong input topology'
      ? HISTORICAL_DUP_FAMILIES_V4[3]
      : label === 'value drift'
        ? HISTORICAL_DUP_FAMILIES_V4[4]
        : HISTORICAL_DUP_FAMILIES_V4[0];
    const f = label === 'wrong profiled genesis'
      ? fixture(descriptor, [[hashHex('negative-key')]], {
        profileGenesisOverrideHex: hashHex('wrong-profile-genesis'),
      })
      : fixture(descriptor, [[hashHex('negative-key')]]);
    mutate(f);
    await expect(reconstruct(f)).rejects.toThrow(expected);
  });

  it('rejects forked lineage, canonical-binary disagreement, and source disagreement', async () => {
    const forked = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    const duplicate = structuredClone(tip(forked));
    duplicate.transactionId = hashHex('fork-transaction');
    duplicate.boxId = hashHex('fork-box');
    duplicate.inclusionHeight = 101;
    duplicate.spentTransactionId = null;
    duplicate.spendingProof = null;
    forked.data.indexed.push(duplicate);
    await expect(reconstruct(forked)).rejects.toThrow(/multiple profiled singleton|exactly one tip|forked/);

    const binary = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    binary.data.binaryOverride = '00';
    await expect(reconstruct(binary)).rejects.toThrow(/canonical binary|disagree/);

    const primary = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    const witness = structuredClone(primary.data);
    witness.bestHeader.extensionRoot = hashHex('different-extension-root');
    await expect(reconstruct(primary, witness)).rejects.toThrow(/reconstructions disagree/);
  });

  it.each([0, 21])('rejects batch count %i', async count => {
    const f = fixture(HISTORICAL_DUP_FAMILIES_V4[2], [[hashHex('batch-count')]]);
    const encoded = encodeIntRegister(count);
    indexedInput(f).spendingProof.extension['0'] = encoded;
    transition(f).inputs[1].spendingProof.extension['0'] = encoded;
    await expect(reconstruct(f)).rejects.toThrow(/between 1 and 20/);
  });

  it('rejects duplicate batch keys', async () => {
    const f = fixture(HISTORICAL_DUP_FAMILIES_V4[2], [[
      hashHex('batch-duplicate-a'),
      hashHex('batch-duplicate-b'),
    ]]);
    const first = indexedInput(f).spendingProof.extension['2'];
    indexedInput(f).spendingProof.extension['3'] = first;
    transition(f).inputs[1].spendingProof.extension['3'] = first;
    await expect(reconstruct(f)).rejects.toThrow(/duplicate key/);
  });

  it('accepts script-ignored context variables while retaining them in provenance', async () => {
    const singleBase = fixture(HISTORICAL_DUP_FAMILIES_V4[0], [[
      hashHex('single-extra-context'),
    ]]);
    const singleExtra = fixture(HISTORICAL_DUP_FAMILIES_V4[0], [[
      hashHex('single-extra-context'),
    ]]);
    indexedInput(singleExtra).spendingProof.extension['3'] = '01';
    transition(singleExtra).inputs[0].spendingProof.extension['3'] = '01';
    const singleBaseResult = await reconstruct(singleBase);
    const singleExtraResult = await reconstruct(singleExtra);
    expect(singleExtraResult.rawInsertedKeysHex).toEqual(
      singleBaseResult.rawInsertedKeysHex,
    );
    expect(singleExtraResult.tipDigestHex).toBe(singleBaseResult.tipDigestHex);
    expect(singleExtraResult.transitions[0].contextExtensionDigestHex)
      .not.toBe(singleBaseResult.transitions[0].contextExtensionDigestHex);
    expect(singleExtraResult.observationDigestHex)
      .not.toBe(singleBaseResult.observationDigestHex);

    const batchBase = fixture(HISTORICAL_DUP_FAMILIES_V4[2], [[
      hashHex('batch-extra-context'),
    ]]);
    const batchExtra = fixture(HISTORICAL_DUP_FAMILIES_V4[2], [[
      hashHex('batch-extra-context'),
    ]]);
    indexedInput(batchExtra).spendingProof.extension['3'] = encodeCollByteRegister(
      Buffer.from(hashHex('inactive-key'), 'hex'),
    );
    transition(batchExtra).inputs[1].spendingProof.extension['3'] =
      indexedInput(batchExtra).spendingProof.extension['3'];
    indexedInput(batchExtra).spendingProof.extension['23'] = '01';
    transition(batchExtra).inputs[1].spendingProof.extension['23'] = '01';
    const batchBaseResult = await reconstruct(batchBase);
    const batchExtraResult = await reconstruct(batchExtra);
    expect(batchExtraResult.rawInsertedKeysHex).toEqual(
      batchBaseResult.rawInsertedKeysHex,
    );
    expect(batchExtraResult.tipDigestHex).toBe(batchBaseResult.tipDigestHex);
    expect(batchExtraResult.transitions[0].contextExtensionDigestHex)
      .not.toBe(batchBaseResult.transitions[0].contextExtensionDigestHex);
  });

  it('rejects context variables outside the canonical u8 index range', async () => {
    const f = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    indexedInput(f).spendingProof.extension['256'] = '01';
    transition(f).inputs[0].spendingProof.extension['256'] = '01';
    await expect(reconstruct(f)).rejects.toThrow(/invalid Var\(256\)/);
  });

  it('rejects same source identity, snapshot drift, and address/current-view disagreement', async () => {
    const same = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    const source = same.source('fixture://same');
    await expect(reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
      profile: same.profile,
      route: same.route,
      instance: same.instance,
      primarySource: source,
      witnessSource: source,
    })).rejects.toThrow(/two distinct source identities/);

    const drift = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    let reads = 0;
    const driftingSource = drift.source('fixture://drifting');
    const original = driftingSource.getBestHeader.bind(driftingSource);
    driftingSource.getBestHeader = async () => {
      reads += 1;
      const header = await original() as any;
      return reads > 1 ? { ...header, extensionRoot: hashHex('snapshot-drift') } : header;
    };
    await expect(reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
      profile: drift.profile,
      route: drift.route,
      instance: drift.instance,
      primarySource: driftingSource,
      witnessSource: drift.source('fixture://stable-witness'),
    })).rejects.toThrow(/snapshot changed/);

    const current = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    current.data.current = [];
    await expect(reconstruct(current)).rejects.toThrow(/exactly one current singleton/);

    const network = fixture(HISTORICAL_DUP_FAMILIES_V4[0]);
    network.data.network = 'mainnet';
    await expect(reconstruct(network)).rejects.toThrow(/differs from testnet/);
  });

  it('joins real producer packets to the exact inventory without granting authority', async () => {
    const pooledReserveV4 = HISTORICAL_DUP_FAMILIES_V4.find(descriptor =>
      descriptor.routeId === 'ergo-double-unlock-prevention-pooled-reserve-v4'
    )!;
    const funded = fixture(pooledReserveV4, [[
      hashHex('producer-inventory-join'),
    ]]);
    const primarySource = profileWideSourceFor(
      'fixture://inventory-primary',
      funded,
    );
    const witnessSource = profileWideSourceFor(
      'fixture://inventory-witness',
      funded,
    );
    const lineages = [];
    for (const descriptor of HISTORICAL_DUP_FAMILIES_V4) {
      const route = funded.profile.routes.find(
        candidate => candidate.routeId === descriptor.routeId,
      )!;
      lineages.push(
        await reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
          profile: funded.profile,
          route,
          instance: route.instances[0],
          primarySource,
          witnessSource,
        }),
      );
    }

    const inventory = await buildValidityApplicationPooledReserveErgoLegacyInventoryV4({
      profile: funded.profile,
      primarySource,
      witnessSource,
      authenticatedV2: null,
      replayImport: null,
      historicalDupLineages: lineages,
      observedAt: () => new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(() =>
      assertValidityApplicationPooledReserveErgoLegacyInventoryV4Packet(inventory)
    ).not.toThrow();
    expect(inventory.summary).toEqual(expect.objectContaining({
      historicalLineagePacketCount: HISTORICAL_DUP_FAMILIES_V4.length,
      historicalLineageMissingCount: 0,
      historicalLineageJoinedCount: HISTORICAL_DUP_FAMILIES_V4.length,
      historicalFundedLineageReplayedCount: 1,
      historicalNeverFundedInstanceConfirmedCount:
        HISTORICAL_DUP_FAMILIES_V4.length - 1,
      historicalLineagesAwaitingSourceEvidenceCount: 1,
    }));
    const fundedCoverage = inventory.historicalDuplicatePrevention.find(
      entry => entry.routeId === funded.route.routeId,
    );
    expect(fundedCoverage).toEqual(expect.objectContaining({
      status:
        'opaque-event-id-intent-mapping-and-source-admission-required',
      observedKeySemantics: HISTORICAL_DUP_OBSERVED_KEY_SEMANTICS_V4,
      exactInventoryJoinEstablished: true,
      canonicalEventMappingEstablished: false,
      sourceAdmissionEvidenceJoined: false,
      canonicalSourceFinalityEstablished: false,
      replayGenesisEligible: false,
      fundsAuthorityEstablished: false,
    }));
    expect(inventory.authority).toEqual(expect.objectContaining({
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
    }));
    expect(lineages.every(packet => Object.isFrozen(packet))).toBe(true);
  });
});
