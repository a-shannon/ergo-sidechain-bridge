import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import type {
  ResolvedAuthenticatedV2ContractSource,
  ResolvedAuthenticatedV2ContractSources,
} from '../../authenticated-v2-contract-sources.js';
import { buildDeterministicSyntheticVmHeaderContext } from '../../authenticated-v2-offline-vm-fixture.js';
import { compileResolvedAuthenticatedV2SourcesWithPinnedJvm } from '../../authenticated-v2-source-tree-conformance.js';
import {
  LEGACY_SPV_TRACKER_ERGO_TREE_SHA256_HEX,
  LEGACY_SPV_TRACKER_MIN_CHANGE_NANOERG,
  LEGACY_SPV_TRACKER_MINER_FEE_NANOERG,
  LEGACY_SPV_TRACKER_MINER_FEE_TREE_HEX,
  LEGACY_SPV_TRACKER_SOURCE_SHA256_HEX,
  LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
  projectStorageRent,
  serializedBoxSizeBytesFromHex,
} from '../../ergo-settlement-core/storage-rent-maintenance.js';
import {
  assertStorageRentSurfaceTree,
} from '../../adapters/ergo-storage-rent-surface.js';
import { discoverBridgeRepositoryRoot } from '../../bridge-repository-layout.js';
import {
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from '../../ergo-settlement-core/ergo-encoding.js';
import {
  encodeSpvTrackerAvlRegister,
  getEmptySpvTrackerDigest,
} from '../../spv-tracker.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(SCRIPT_DIR, '../../../..');
const WORKTREE_ROOT = discoverBridgeRepositoryRoot(BRIDGE_ROOT);
const ERGO_SOURCE_PATH = resolve(BRIDGE_ROOT, '.source-cache', 'ergo-node');
const CONTRACT_PATH = resolve(BRIDGE_ROOT, 'contracts', 'SPVTracker.es');

const CURRENT_HEIGHT = 2_000_000;
const TRACKER_CREATION_HEIGHT = CURRENT_HEIGHT - 900_000;
const TRACKER_NFT_ID = 'a5'.repeat(32);
const FIXTURE_STORAGE_FEE_FACTOR = 1_250_000n;
const TRACKER_VALUE = 10_000_000_000n;

interface DeterministicKey {
  privateKeyHex: string;
  publicKeyHex: string;
  ergoTreeHex: string;
}

async function getWasm(): Promise<any> {
  const imported = await import('ergo-lib-wasm-nodejs');
  return (imported as any).default ?? imported;
}

function deterministicKey(wasm: any, scalar: number): DeterministicKey {
  const bytes = Buffer.alloc(32);
  bytes[31] = scalar;
  const secret = wasm.SecretKey.dlog_from_bytes(bytes);
  const address = secret.get_address();
  return {
    privateKeyHex: Buffer.from(secret.to_bytes()).toString('hex'),
    publicKeyHex: Buffer.from(address.content_bytes()).toString('hex'),
    ergoTreeHex: address.to_ergo_tree().to_base16_bytes(),
  };
}

function sourceRecord(source: string): ResolvedAuthenticatedV2ContractSource {
  const sourceHash = sha256(Buffer.from(source, 'utf8'));
  const placeholderTree = '00';
  return {
    source,
    templateSha256Hex: sourceHash,
    resolvedSourceSha256Hex: sourceHash,
    ergoTreeHex: placeholderTree,
    ergoTreeSha256Hex: sha256(Buffer.from(placeholderTree, 'hex')),
  };
}

async function compileExactTrackerSource(): Promise<{
  sourceSha256Hex: string;
  ergoTreeHex: string;
  ergoTreeSha256Hex: string;
}> {
  const source = readFileSync(CONTRACT_PATH, 'utf8');
  const record = sourceRecord(source);
  const resolved: ResolvedAuthenticatedV2ContractSources = {
    tracker: record,
    unlock: { ...record },
    duplicatePrevention: { ...record },
    authenticatedUnlockErgoTreeHashHex: '00'.repeat(32),
  };
  const run = await compileResolvedAuthenticatedV2SourcesWithPinnedJvm({
    resolved,
    bridgeRoot: BRIDGE_ROOT,
    worktreeRoot: WORKTREE_ROOT,
    ergoSourcePath: ERGO_SOURCE_PATH,
  });
  const trees = [
    run.observation.contracts.tracker,
    run.observation.contracts.unlock,
    run.observation.contracts.duplicatePrevention,
  ];
  if (new Set(trees.map(contract => contract.ergoTreeHex)).size !== 1) {
    throw new Error('pinned JVM compiler produced different trees for identical SPVTracker sources');
  }
  if (trees.some(contract => contract.resolvedSourceSha256Hex !== record.resolvedSourceSha256Hex)) {
    throw new Error('pinned JVM compiler did not bind the exact SPVTracker source bytes');
  }
  return {
    sourceSha256Hex: record.resolvedSourceSha256Hex,
    ergoTreeHex: trees[0].ergoTreeHex,
    ergoTreeSha256Hex: trees[0].ergoTreeSha256Hex,
  };
}

function syntheticBox(wasm: any, input: {
  value: bigint;
  ergoTreeHex: string;
  assets: Array<{ tokenId: string; amount: string }>;
  additionalRegisters: Record<string, string>;
  transactionByte: number;
  creationHeight: number;
}): { eip12: any; serializedHex: string } {
  const parsed = wasm.ErgoBox.from_json(JSON.stringify({
    value: input.value.toString(),
    ergoTree: input.ergoTreeHex,
    assets: input.assets,
    additionalRegisters: input.additionalRegisters,
    transactionId: input.transactionByte.toString(16).padStart(2, '0').repeat(32),
    index: 0,
    creationHeight: input.creationHeight,
  }));
  return {
    eip12: parsed.to_js_eip12(),
    serializedHex: Buffer.from(parsed.sigma_serialize_bytes()).toString('hex'),
  };
}

function signSynthetic(
  wasm: any,
  stateContext: any,
  unsignedTx: unknown,
  inputBoxes: unknown[],
  privateKeyHex: string,
): any {
  const keys = new wasm.SecretKeys();
  keys.add(wasm.SecretKey.dlog_from_bytes(Buffer.from(privateKeyHex, 'hex')));
  const wallet = wasm.Wallet.from_secrets(keys);
  return JSON.parse(wallet.sign_transaction(
    stateContext,
    wasm.UnsignedTransaction.from_json(JSON.stringify(unsignedTx)),
    wasm.ErgoBoxes.from_boxes_json(inputBoxes),
    wasm.ErgoBoxes.empty(),
  ).to_json());
}

function expectAccepted(
  wasm: any,
  stateContext: any,
  label: string,
  unsignedTx: unknown,
  inputBoxes: unknown[],
  privateKeyHex: string,
): void {
  const signed = signSynthetic(
    wasm,
    stateContext,
    unsignedTx,
    inputBoxes,
    privateKeyHex,
  );
  if (!/^[0-9a-f]{64}$/.test(String(signed.id ?? ''))) {
    throw new Error(`${label}: signed transaction has no canonical ID`);
  }
  console.log(`PASS ${label}: ${String(signed.id).slice(0, 24)}...`);
}

function expectRejected(
  wasm: any,
  stateContext: any,
  label: string,
  unsignedTx: unknown,
  inputBoxes: unknown[],
  privateKeyHex: string,
): void {
  try {
    signSynthetic(wasm, stateContext, unsignedTx, inputBoxes, privateKeyHex);
  } catch (error) {
    const message = String((error as any)?.message ?? error);
    if (
      !message.includes('Prover error')
      && !message.includes('Script reduced to false')
    ) {
      throw error;
    }
    console.log(`PASS ${label}: rejected`);
    return;
  }
  throw new Error(`${label}: invalid maintenance transaction unexpectedly signed`);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mutateDigest(register: string): string {
  const replacement = register[2] === '0' ? '1' : '0';
  return `${register.slice(0, 2)}${replacement}${register.slice(3)}`;
}

async function main(): Promise<void> {
  console.log('WP-08E legacy SPVTracker storage-rent maintenance VM matrix');
  const wasm = await getWasm();
  const committee = deterministicKey(wasm, 1);
  const alternateCommittee = deterministicKey(wasm, 2);
  const compiled = await compileExactTrackerSource();
  if (
    compiled.sourceSha256Hex !== LEGACY_SPV_TRACKER_SOURCE_SHA256_HEX
    || compiled.ergoTreeSha256Hex !== LEGACY_SPV_TRACKER_ERGO_TREE_SHA256_HEX
  ) {
    throw new Error('compiled SPVTracker identity drifted from the reviewed storage-rent profile');
  }
  assertStorageRentSurfaceTree({
    surfaceId: LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
    observedErgoTreeHex: compiled.ergoTreeHex,
    configuredErgoTreeHex: compiled.ergoTreeHex,
  });
  const tracker = syntheticBox(wasm, {
    value: TRACKER_VALUE,
    ergoTreeHex: compiled.ergoTreeHex,
    assets: [{ tokenId: TRACKER_NFT_ID, amount: '1' }],
    additionalRegisters: {
      R4: encodeLongRegister(7),
      R5: encodeSpvTrackerAvlRegister(getEmptySpvTrackerDigest()),
      R6: encodeSigmaPropRegister(committee.publicKeyHex),
      R7: encodeLongRegister(1234),
      R8: encodeIntRegister(CURRENT_HEIGHT - 10),
    },
    transactionByte: 0x11,
    creationHeight: TRACKER_CREATION_HEIGHT,
  });
  const fee = syntheticBox(wasm, {
    value: LEGACY_SPV_TRACKER_MINER_FEE_NANOERG +
      LEGACY_SPV_TRACKER_MIN_CHANGE_NANOERG,
    ergoTreeHex: committee.ergoTreeHex,
    assets: [],
    additionalRegisters: {},
    transactionByte: 0x22,
    creationHeight: CURRENT_HEIGHT - 5,
  });
  const rent = projectStorageRent({
    surfaceId: LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
    currentHeight: CURRENT_HEIGHT,
    creationHeight: TRACKER_CREATION_HEIGHT,
    serializedSizeBytes: serializedBoxSizeBytesFromHex(tracker.serializedHex),
    valueNanoErg: TRACKER_VALUE,
    storageFeeFactorNanoErgPerByte: FIXTURE_STORAGE_FEE_FACTOR,
    parameterObservedAtHeight: CURRENT_HEIGHT,
    parameterSourceId: 'synthetic.vm.exact-compiled-profile.v1',
  });
  if (
    !rent.feeCovered
    || rent.ageRisk === 'fresh'
    || rent.ageRisk === 'rent_eligible'
  ) {
    throw new Error('synthetic tracker is outside the reviewed maintenance drill window');
  }
  const unsignedTx = {
    inputs: [
      { boxId: tracker.eip12.boxId, extension: {} },
      { boxId: fee.eip12.boxId, extension: {} },
    ],
    dataInputs: [],
    outputs: [
      {
        value: TRACKER_VALUE.toString(),
        ergoTree: compiled.ergoTreeHex,
        assets: [{ tokenId: TRACKER_NFT_ID, amount: '1' }],
        additionalRegisters: {
          R4: encodeLongRegister(8),
          R5: tracker.eip12.additionalRegisters.R5,
          R6: tracker.eip12.additionalRegisters.R6,
          R7: tracker.eip12.additionalRegisters.R7,
          R8: encodeIntRegister(CURRENT_HEIGHT),
        },
        creationHeight: CURRENT_HEIGHT,
      },
      {
        value: LEGACY_SPV_TRACKER_MIN_CHANGE_NANOERG.toString(),
        ergoTree: committee.ergoTreeHex,
        assets: [],
        additionalRegisters: {},
        creationHeight: CURRENT_HEIGHT,
      },
      {
        value: LEGACY_SPV_TRACKER_MINER_FEE_NANOERG.toString(),
        ergoTree: LEGACY_SPV_TRACKER_MINER_FEE_TREE_HEX,
        assets: [],
        additionalRegisters: {},
        creationHeight: CURRENT_HEIGHT,
      },
    ],
  };
  const state = buildDeterministicSyntheticVmHeaderContext(wasm, {
    currentHeight: CURRENT_HEIGHT,
    anchorContextIndex: 0,
    anchorExtensionRootHex: sha256(Buffer.from('wp08e-storage-rent-vm', 'ascii')),
  });
  const inputs = [tracker.eip12, fee.eip12];
  expectAccepted(
    wasm,
    state.stateContext,
    'exact neutral no-ingest successor',
    unsignedTx,
    inputs,
    committee.privateKeyHex,
  );

  const cases: Array<[string, (tx: any) => void]> = [
    ['AVL digest drift', tx => {
      tx.outputs[0].additionalRegisters.R5 =
        mutateDigest(tx.outputs[0].additionalRegisters.R5);
    }],
    ['latest sidechain height drift', tx => {
      tx.outputs[0].additionalRegisters.R7 = encodeLongRegister(1235);
    }],
    ['operation counter does not advance', tx => {
      tx.outputs[0].additionalRegisters.R4 = encodeLongRegister(7);
    }],
    ['Ergo height stamp does not advance', tx => {
      tx.outputs[0].additionalRegisters.R8 = encodeIntRegister(CURRENT_HEIGHT - 10);
    }],
    ['Ergo height stamp is in the future', tx => {
      tx.outputs[0].additionalRegisters.R8 = encodeIntRegister(CURRENT_HEIGHT + 1);
    }],
    ['singleton NFT changes', tx => {
      tx.outputs[0].assets[0].tokenId = tracker.eip12.boxId;
    }],
    ['contract tree changes', tx => {
      tx.outputs[0].ergoTree = committee.ergoTreeHex;
    }],
    ['committee proposition changes', tx => {
      tx.outputs[0].additionalRegisters.R6 =
        encodeSigmaPropRegister(alternateCommittee.publicKeyHex);
    }],
    ['tracker value decreases', tx => {
      tx.outputs[0].value = (TRACKER_VALUE - 1n).toString();
      tx.outputs[1].value =
        (LEGACY_SPV_TRACKER_MIN_CHANGE_NANOERG + 1n).toString();
    }],
  ];
  for (const [label, mutate] of cases) {
    const invalid = clone(unsignedTx);
    mutate(invalid);
    expectRejected(
      wasm,
      state.stateContext,
      label,
      invalid,
      inputs,
      committee.privateKeyHex,
    );
  }

  console.log(
    `PASS exact JVM source ${compiled.sourceSha256Hex.slice(0, 16)}... -> ` +
    `${compiled.ergoTreeSha256Hex.slice(0, 16)}... and ${cases.length} isolated rejections.`,
  );
  console.log(
    'BOUNDARY: synthetic VM reduction is not target-node acceptance, signer authorization, ' +
    'submission, broadcast, deployment lineage, Gate 5 closure, trustlessness, or production readiness.',
  );
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch(error => {
    console.error('FATAL:', error);
    process.exit(1);
  });
}
