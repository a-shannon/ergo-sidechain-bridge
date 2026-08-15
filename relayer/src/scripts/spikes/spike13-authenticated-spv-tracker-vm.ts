/**
 * WP-06A authenticated SPV tracker VM evaluation.
 *
 * Both modes derive the exact current tracker tree with the pinned JVM
 * compiler. The default mode obtains a genuinely mined ten-header context and
 * complete block extension from a loopback node; `--synthetic-context` builds
 * deterministic local headers instead. Boxes, keys, and AVL state are
 * ephemeral. The VM execution signs with generated in-memory keys. When JVM
 * conformance is requested, the exact secret-free signed fixture is written to
 * an isolated per-run directory under the pinned tool target and deleted after
 * execution. No mode has external wallet or wallet-state access, submit,
 * transaction-check, deployment-state, database, or broadcast capability.
 *
 * The default mode proves sigma-rust reduction against a real header whose
 * extension root contains the exact 0x0401 checkpoint value. With
 * `--jvm-conformance`, it also verifies the exact signed transaction and mined
 * context in the pinned JVM interpreter. A generic synthetic context proves
 * only deterministic local sigma-rust acceptance; the source-bound WP-06 path
 * may instead supply a process-local, JVM-canonical synthetic header capability
 * and replay it in the same pinned JVM. In both modes admission is bound to one
 * aggregate-finality proof identity, while R9 still authorizes that finality
 * claim. No mode proves mined-header work, node-state acceptance, trustless
 * finality, organizational independence, or Gate 5 closure.
 */
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isDeepStrictEqual } from 'util';

import {
  BRIDGE_EXTENSION_KEY_HEX,
  buildBridgeCheckpointCommitmentV1,
  type BridgeCheckpointCommitmentV1,
} from '../../bridge-checkpoint-commitment.js';
import {
  buildAggregateFinalityCommitmentV1,
  type AggregateFinalityCommitmentV1,
} from '../../bridge-finality-commitment.js';
import {
  AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from '../../bridge-finality-proof.js';
import { assertContextExtensionSafe } from '../../context-extension-guard.js';
import {
  decodeCollByteRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeSigmaPropRegister,
} from '../../ergo-encoding.js';
import {
  buildErgoExtensionMembershipProof,
  type ErgoExtensionMerkleField,
} from '../../ergo-extension-membership.js';
import {
  buildDeterministicSyntheticVmHeaderContext,
  compilePinnedAuthenticatedV2VmTrees,
} from '../../authenticated-v2-offline-vm-fixture.js';
import {
  buildAuthenticatedV2JvmVmFixture,
  type AuthenticatedV2JvmVmFixture,
  verifyAuthenticatedV2JvmVmFixture,
} from '../../authenticated-v2-jvm-vm-conformance.js';
import type {
  AuthenticatedV2JvmVmConformanceReport,
} from '../../authenticated-v2-source-tree-conformance.js';
import { parseNodeJsonPreservingPowDistance } from '../../ergo-node-json.js';
import {
  buildWasmSimplifiedUpcomingPreHeaderCarrier,
  deriveSimplifiedUpcomingPreHeader,
  orderAndValidateMinedHeaderWindow,
} from '../../ergo-upcoming-state-context.js';
import {
  buildAuthenticatedSpvAdmission,
  encodeAuthenticatedSpvProofBundle,
  encodeAuthenticatedSpvTrackerAvlRegister,
} from '../../spv-tracker-authenticated.js';
import {
  validateTrustlessBurnInclusionProofEnvelope,
  type TrustlessBurnInclusionProof,
} from '../../trustless-burn-proof.js';
import {
  assertWp06CanonicalJvmFixtureHeaderBinding,
  assertWp06CanonicalJvmHeaderWindowProvenance,
  WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE,
  type Wp06CanonicalJvmHeaderWindow,
} from '../../wp06-canonical-jvm-header-chain.js';
import {
  assertWp06SignedSuccessorBinding,
  assertWp06TrackerJvmReplayReport,
  deriveWp06JvmReplayBinding,
  type Wp06JvmReplayBinding,
} from '../../wp06-source-bound-jvm-validation.js';
import { tracker_v2_insert } from '../../../../wasm-avl/pkg/bridge_avl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(__dirname, '../../../..');
const WORKTREE_ROOT = resolve(BRIDGE_ROOT, '..');
const NODE_ENDPOINT = loopbackNodeEndpoint();
const NODE_API_KEY = 'hello';
const TRACKER_NFT_ID = 'a1'.repeat(32);
const COMPILER_DUP_NFT_ID = 'a2'.repeat(32);
const TRACKER_VALUE = 2_000_000;

const CHECKPOINT_FIXTURE = buildBridgeCheckpointCommitmentV1({
  sidechainIdHex: '11'.repeat(32),
  sidechainHeight: 1_024,
  sidechainConsensusBlockHashHex: '22'.repeat(32),
  executionBlockHashHex: '33'.repeat(32),
  bridgeEventRootHex: '44'.repeat(32),
  burnLeafCount: 3,
  finalityAuthoritySetId: 7,
  finalityAuthoritySetHashHex: '55'.repeat(32),
  finalityProofHashHex: '66'.repeat(32),
});
const FINALITY_STATEMENT_FIXTURE = buildBridgeFinalityStatementV1({
  encodedCheckpointHex: CHECKPOINT_FIXTURE.encodedCheckpointHex,
  checkpointCommitmentHex: CHECKPOINT_FIXTURE.checkpointCommitmentHex,
  trustedAnchorDigestHex: '77'.repeat(32),
  finalityHorizonHeight: 1_024,
  finalityHorizonHashHex: '88'.repeat(32),
});
const AGGREGATE_FINALITY_PROOF_FIXTURE = buildAggregateFinalityProofV1({
  verifierProfileIdHex: '99'.repeat(32),
  encodedStatement: FINALITY_STATEMENT_FIXTURE.encodedStatementHex,
  payload: Buffer.from('spike13-authenticated-spv-tracker-proof', 'ascii'),
});
const AGGREGATE_FINALITY_COMMITMENT_FIXTURE = buildAggregateFinalityCommitmentV1(
  AGGREGATE_FINALITY_PROOF_FIXTURE,
);

interface KeyPair {
  privateKeyHex: string;
  pubKeyHex: string;
}

interface ExactSignedSyntheticTx {
  transaction: any;
  bytes: Uint8Array;
}

export interface HeaderRecord {
  raw: Record<string, unknown>;
  id: string;
  parentId: string;
  height: number;
  extensionRootHex: string;
}

interface VmHeaderContext {
  stateContext: any;
  currentHeight: number;
  anchorHeader: HeaderRecord;
  anchorContextIndex: number;
  extensionProofHex: string;
  headers: HeaderRecord[];
  jvmHeaderContext?: {
    preHeader: { raw: Record<string, unknown> };
    headers: HeaderRecord[];
  };
  provenance:
    | 'loopback-mined-header'
    | 'deterministic-synthetic-header-context'
    | typeof WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE;
}

interface EvalFixture {
  unsignedTx: any;
  inputBoxes: any[];
  finalityAttestorPrivateKeyHex: string;
  bridgeCommitteePrivateKeyHex: string;
  unrelatedPrivateKeyHex: string;
  plan: ReturnType<typeof buildAuthenticatedSpvAdmission>;
  headers: HeaderRecord[];
}

export interface AuthenticatedSpvTrackerVmInjection {
  checkpoint: BridgeCheckpointCommitmentV1;
  aggregateFinalityCommitment: AggregateFinalityCommitmentV1;
  extension: {
    keyHex: string;
    valueHex: string;
    fields: ErgoExtensionMerkleField[];
    proofHex: string;
    rootHex: string;
  };
  burnProof?: TrustlessBurnInclusionProof;
}

export interface RunAuthenticatedSpvTrackerVmInput {
  ergoSourcePath: string;
  injection: AuthenticatedSpvTrackerVmInjection;
  syntheticContext?: boolean;
  jvmConformance?: boolean;
  duplicatePreventionNftId?: string;
  canonicalSyntheticHeaderWindow?: Wp06CanonicalJvmHeaderWindow;
}

export interface AuthenticatedSpvTrackerVmAdmissionResult {
  injection: AuthenticatedSpvTrackerVmInjection;
  admittedSuccessor: any;
  signedTransaction: any;
  plan: ReturnType<typeof buildAuthenticatedSpvAdmission>;
  trackerTree: string;
  currentHeight: number;
  anchorHeader: HeaderRecord;
  headerContext: {
    currentHeight: number;
    anchorContextIndex: number;
    anchorHeader: HeaderRecord;
    headers: readonly HeaderRecord[];
    provenance: VmHeaderContext['provenance'];
  };
  jvmConformanceReport?: AuthenticatedV2JvmVmConformanceReport;
  jvmReplayBinding?: Wp06JvmReplayBinding;
  negativeCases: readonly string[];
  boundary: {
    syntheticContext: boolean;
    chainRpcWritesEnabled: false;
    ephemeralInMemorySigningUsed: true;
    externalWalletStateAccessed: false;
    r9FinalityAuthority: true;
    gate5Closed: false;
    submitOrBroadcastEnabled: false;
  };
}

export const AUTHENTICATED_SPV_TRACKER_NEGATIVE_CASES = Object.freeze([
  'bridge committee-only tracker signature',
  'unrelated tracker signature',
  'mismatched embedded checkpoint',
  'finality proof system ID',
  'finality statement digest',
  'finality program ID',
  'finality verifier profile ID',
  'finality proof payload digest',
  'aggregate finality proof digest',
  'wrong header index',
  'forged extension proof',
  'missing mandatory aggregate finality commitment Var',
  'unchanged AVL digest',
] as const);

let wasmModule: any;

function loopbackNodeEndpoint(): string {
  const optionIndex = process.argv.indexOf('--node');
  const raw = optionIndex === -1 ? 'http://127.0.0.1:9051' : process.argv[optionIndex + 1];
  if (!raw) throw new Error('--node requires a loopback HTTP endpoint');
  const parsed = new URL(raw);
  if (
    parsed.protocol !== 'http:' ||
    (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost')
  ) {
    throw new Error('--node must use http://127.0.0.1 or http://localhost');
  }
  return raw.replace(/\/$/, '');
}

async function getWasm(): Promise<any> {
  if (!wasmModule) {
    // @ts-ignore CommonJS/ESM interop in ergo-lib-wasm-nodejs.
    wasmModule = await import('ergo-lib-wasm-nodejs');
    if (wasmModule.default) wasmModule = wasmModule.default;
  }
  return wasmModule;
}

async function readNodeJson(path: string): Promise<any> {
  const permitted =
    path === '/info' ||
    path === '/blocks/lastHeaders/10' ||
    /^\/blocks\/[0-9a-f]{64}$/.test(path);
  if (!permitted) throw new Error(`read-only node route is not permitted: ${path}`);

  const response = await fetch(`${NODE_ENDPOINT}${path}`, {
    headers: { api_key: NODE_API_KEY },
  });
  if (!response.ok) {
    throw new Error(`GET ${path}: ${response.status} ${await response.text()}`);
  }
  return parseNodeJsonPreservingPowDistance(await response.text());
}

async function buildRealHeaderContext(
  wasm: any,
  injection: AuthenticatedSpvTrackerVmInjection,
): Promise<VmHeaderContext> {
  const rawHeaders = await readNodeJson('/blocks/lastHeaders/10');
  if (!Array.isArray(rawHeaders) || rawHeaders.length !== 10) {
    throw new Error(`ten mined headers required for the upcoming state context, got ${String(rawHeaders?.length ?? 'invalid')}`);
  }
  const headers = orderAndValidateMinedHeaderWindow(rawHeaders).map(normalizeHeader);
  const preHeader = deriveSimplifiedUpcomingPreHeader(headers[0].raw);

  const latest = wasm.BlockHeader.from_json(JSON.stringify(headers[0].raw));
  const preHeaderCarrier = wasm.BlockHeader.from_json(JSON.stringify(
    buildWasmSimplifiedUpcomingPreHeaderCarrier(headers[0].raw),
  ));
  const blockHeaders = new wasm.BlockHeaders(latest);
  for (let index = 1; index < headers.length; index++) {
    blockHeaders.add(wasm.BlockHeader.from_json(JSON.stringify(headers[index].raw)));
  }

  const expectedValueHex = injection.extension.valueHex;
  for (let contextIndex = 0; contextIndex < headers.length; contextIndex++) {
    const header = headers[contextIndex];
    const block = await readNodeJson(`/blocks/${header.id}`);
    const fields = parseExtensionFields(block?.extension?.fields);
    const target = fields.find(field =>
      Buffer.from(field.key).toString('hex') === BRIDGE_EXTENSION_KEY_HEX,
    );
    if (!target || Buffer.from(target.value).toString('hex') !== expectedValueHex) continue;

    const membership = buildErgoExtensionMembershipProof(
      fields,
      Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
    );
    const computedRootHex = membership.root.toString('hex');
    if (computedRootHex !== header.extensionRootHex) {
      throw new Error(
        `Scorex extension root mismatch at height ${header.height}: ` +
        `computed ${computedRootHex}, header ${header.extensionRootHex}`,
      );
    }

    return {
      stateContext: new wasm.ErgoStateContext(
        wasm.PreHeader.from_block_header(preHeaderCarrier),
        blockHeaders,
        wasm.Parameters.default_parameters(),
      ),
      currentHeight: preHeader.height,
      anchorHeader: header,
      anchorContextIndex: contextIndex,
      extensionProofHex: membership.proof.toString('hex'),
      headers,
      jvmHeaderContext: { preHeader: { raw: preHeader }, headers },
      provenance: 'loopback-mined-header',
    };
  }

  throw new Error(
    `no mined ${BRIDGE_EXTENSION_KEY_HEX}:${expectedValueHex} field was found in the ten-header context`,
  );
}

function buildSyntheticHeaderContext(
  wasm: any,
  injection: AuthenticatedSpvTrackerVmInjection,
  canonicalWindow?: Wp06CanonicalJvmHeaderWindow,
): VmHeaderContext {
  const fields = injection.extension.fields.map(field => ({
    key: Buffer.from(field.key),
    value: Buffer.from(field.value),
  }));
  const membership = buildErgoExtensionMembershipProof(
    fields,
    Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
  );
  if (
    membership.proof.toString('hex') !== injection.extension.proofHex
    || membership.root.toString('hex') !== injection.extension.rootHex
  ) {
    throw new Error('injected 0x0401 extension membership proof/root drifted from its fields');
  }
  if (canonicalWindow) {
    assertWp06CanonicalJvmHeaderWindowProvenance(canonicalWindow);
    if (
      canonicalWindow.anchorHeader.extensionRootHex !== membership.root.toString('hex')
      || canonicalWindow.anchorHeader !== canonicalWindow.headers[canonicalWindow.anchorContextIndex]
    ) {
      throw new Error('canonical JVM header capability does not bind the injected source root');
    }
    const headers = canonicalWindow.headers as readonly HeaderRecord[];
    const parsed = headers.map((header, index) => {
      const value = wasm.BlockHeader.from_json(JSON.stringify(header.raw));
      const expectedId = wasm.BlockId.from_str(header.id);
      if (!value.id().equals(expectedId)) {
        throw new Error(`sigma-rust changed canonical JVM header ${index} identity`);
      }
      return value;
    });
    const blockHeaders = new wasm.BlockHeaders(parsed[0]);
    for (let index = 1; index < parsed.length; index += 1) blockHeaders.add(parsed[index]);
    const preHeader = deriveSimplifiedUpcomingPreHeader(headers[0].raw);
    const carrier = wasm.BlockHeader.from_json(JSON.stringify(
      buildWasmSimplifiedUpcomingPreHeaderCarrier(headers[0].raw),
    ));
    return {
      stateContext: new wasm.ErgoStateContext(
        wasm.PreHeader.from_block_header(carrier),
        blockHeaders,
        wasm.Parameters.default_parameters(),
      ),
      currentHeight: canonicalWindow.currentHeight,
      anchorHeader: canonicalWindow.anchorHeader as HeaderRecord,
      anchorContextIndex: canonicalWindow.anchorContextIndex,
      extensionProofHex: membership.proof.toString('hex'),
      headers: [...headers],
      jvmHeaderContext: {
        preHeader: { raw: preHeader },
        headers: [...headers],
      },
      provenance: WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE,
    };
  }
  const context = buildDeterministicSyntheticVmHeaderContext(wasm, {
    currentHeight: 100_000,
    anchorContextIndex: 4,
    anchorExtensionRootHex: membership.root.toString('hex'),
  });
  return {
    stateContext: context.stateContext,
    currentHeight: context.currentHeight,
    anchorHeader: context.anchorHeader,
    anchorContextIndex: context.anchorContextIndex,
    extensionProofHex: membership.proof.toString('hex'),
    headers: [...context.headers],
    provenance: context.provenance,
  };
}

function normalizeHeader(value: any): HeaderRecord {
  if (!value || typeof value !== 'object') throw new Error('node header must be an object');
  const id = normalizeFixedHex(value.id, 32, 'header id');
  const extensionRootHex = normalizeFixedHex(
    value.extensionRoot ?? value.extensionHash,
    32,
    'header extension root',
  );
  const parentId = normalizeFixedHex(value.parentId, 32, 'header parent id');
  const height = Number(value.height);
  if (!Number.isSafeInteger(height) || height < 0) {
    throw new Error('header height must be a non-negative safe integer');
  }
  return { raw: value, id, parentId, extensionRootHex, height };
}

function parseExtensionFields(value: unknown): ErgoExtensionMerkleField[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('mined block extension must contain ordered fields');
  }
  return value.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length < 2) {
      throw new Error(`extension field ${index} must be a key/value pair`);
    }
    return {
      key: Buffer.from(normalizeFixedHex(entry[0], 2, `extension field ${index} key`), 'hex'),
      value: Buffer.from(normalizeHex(entry[1], `extension field ${index} value`), 'hex'),
    };
  });
}

async function makeKeyPair(wasm: any): Promise<KeyPair> {
  const secretKey = wasm.SecretKey.random_dlog();
  return {
    privateKeyHex: Buffer.from(secretKey.to_bytes()).toString('hex'),
    pubKeyHex: Buffer.from(secretKey.get_address().content_bytes()).toString('hex'),
  };
}

async function normalizeBox(wasm: any, box: any): Promise<any> {
  return wasm.ErgoBoxes.from_boxes_json([box]).get(0).to_js_eip12();
}

async function buildFixture(
  wasm: any,
  real: VmHeaderContext,
  trackerTree: string,
  injection: AuthenticatedSpvTrackerVmInjection,
): Promise<EvalFixture> {
  if (real.currentHeight < 1) throw new Error('VM fixture requires Ergo height >= 1');
  const finalityAttestor = await makeKeyPair(wasm);
  const bridgeCommittee = await makeKeyPair(wasm);
  const unrelated = await makeKeyPair(wasm);
  const finalityAttestorRegister = encodeSigmaPropRegister(finalityAttestor.pubKeyHex);
  const plan = buildAuthenticatedSpvAdmission({
    encodedCheckpointHex: injection.checkpoint.encodedCheckpointHex,
    aggregateFinalityCommitmentHex:
      injection.aggregateFinalityCommitment.encodedCommitmentHex,
    extensionProofHex: real.extensionProofHex,
    anchorHeader: {
      idHex: real.anchorHeader.id,
      height: real.anchorHeader.height,
      extensionRootHex: real.anchorHeader.extensionRootHex,
      contextIndex: real.anchorContextIndex,
    },
    approvedSidechainIdHex: injection.checkpoint.checkpoint.sidechainIdHex,
    history: [],
    currentCounter: 0n,
    currentLatestSidechainHeight: 0n,
    currentStampHeight: real.currentHeight - 1,
    currentErgoHeight: real.currentHeight,
    finalityAttestorSigmaPropRegisterHex: finalityAttestorRegister,
  });

  const trackerBox = await normalizeBox(wasm, {
    value: String(TRACKER_VALUE),
    ergoTree: trackerTree,
    assets: [{ tokenId: TRACKER_NFT_ID, amount: '1' }],
    additionalRegisters: plan.inputRegisters,
    transactionId: '71'.repeat(32),
    index: 0,
    creationHeight: real.currentHeight - 1,
  });
  const unsignedTx = {
    inputs: [{ boxId: trackerBox.boxId, extension: plan.contextExtension }],
    dataInputs: [],
    outputs: [{
      value: TRACKER_VALUE,
      ergoTree: trackerTree,
      assets: [{ tokenId: TRACKER_NFT_ID, amount: 1 }],
      additionalRegisters: plan.successorRegisters,
      creationHeight: real.currentHeight,
    }],
  };
  assertContextExtensionSafe(unsignedTx.inputs, 'WP-06A authenticated SPV tracker VM');

  return {
    unsignedTx,
    inputBoxes: [trackerBox],
    finalityAttestorPrivateKeyHex: finalityAttestor.privateKeyHex,
    bridgeCommitteePrivateKeyHex: bridgeCommittee.privateKeyHex,
    unrelatedPrivateKeyHex: unrelated.privateKeyHex,
    plan,
    headers: real.headers,
  };
}

async function signSyntheticTx(
  wasm: any,
  stateContext: any,
  unsignedTx: any,
  inputBoxes: any[],
  privateKeyHex: string,
): Promise<any> {
  return (await signSyntheticTxWithExactBytes(
    wasm,
    stateContext,
    unsignedTx,
    inputBoxes,
    privateKeyHex,
  )).transaction;
}

async function signSyntheticTxWithExactBytes(
  wasm: any,
  stateContext: any,
  unsignedTx: any,
  inputBoxes: any[],
  privateKeyHex: string,
): Promise<ExactSignedSyntheticTx> {
  assertContextExtensionSafe(unsignedTx.inputs, 'WP-06A authenticated SPV tracker VM');
  const secretKeys = new wasm.SecretKeys();
  secretKeys.add(wasm.SecretKey.dlog_from_bytes(Buffer.from(privateKeyHex, 'hex')));
  const wallet = wasm.Wallet.from_secrets(secretKeys);
  const signed = wallet.sign_transaction(
    stateContext,
    wasm.UnsignedTransaction.from_json(JSON.stringify(unsignedTx)),
    wasm.ErgoBoxes.from_boxes_json(inputBoxes),
    wasm.ErgoBoxes.empty(),
  );
  return {
    transaction: JSON.parse(signed.to_json()),
    bytes: Uint8Array.from(signed.sigma_serialize_bytes()),
  };
}

async function expectJvmDerivedHeaderIdReject(input: {
  ergoSourcePath: string;
  duplicatePreventionNftId: string;
  fixture: AuthenticatedV2JvmVmFixture;
}): Promise<void> {
  const mutated = structuredClone(input.fixture);
  const first = mutated.headers[0];
  if (!first) throw new Error('canonical JVM negative fixture is missing header 0');
  first.expectedIdHex = `${first.expectedIdHex[0] === '0' ? '1' : '0'}${first.expectedIdHex.slice(1)}`;
  let rejected = false;
  try {
    await verifyAuthenticatedV2JvmVmFixture({
      bridgeRoot: BRIDGE_ROOT,
      worktreeRoot: WORKTREE_ROOT,
      ergoSourcePath: input.ergoSourcePath,
      trackerNftId: TRACKER_NFT_ID,
      duplicatePreventionNftId: input.duplicatePreventionNftId,
      fixture: mutated,
    });
  } catch (error) {
    if (/JVM-derived ID mismatch/i.test(String((error as Error).message))) {
      rejected = true;
    } else {
      throw error;
    }
  }
  if (!rejected) {
    throw new Error('pinned JVM accepted a caller-supplied header ID that differs from sigma.Header.id');
  }
  console.log('PASS pinned JVM rejects an expected header ID that differs from sigma.Header.id.');
}

async function expectVmReject(
  wasm: any,
  stateContext: any,
  name: string,
  unsignedTx: any,
  fixture: EvalFixture,
  privateKeyHex = fixture.finalityAttestorPrivateKeyHex,
): Promise<void> {
  try {
    await signSyntheticTx(
      wasm,
      stateContext,
      unsignedTx,
      fixture.inputBoxes,
      privateKeyHex,
    );
  } catch (error) {
    const errorName = String((error as any)?.name ?? '');
    const message = String((error as any)?.message ?? error);
    const vmRejected =
      (errorName === 'WalletError' && message.includes('Prover error (tx input index 0)')) ||
      (errorName === 'RuntimeError' && message === 'unreachable');
    if (!vmRejected) throw error;
    console.log(`PASS ${name}: VM rejected`);
    return;
  }
  throw new Error(`${name}: invalid admission unexpectedly signed`);
}

async function runNegativeMatrix(
  wasm: any,
  stateContext: any,
  fixture: EvalFixture,
): Promise<void> {
  await expectVmReject(
    wasm,
    stateContext,
    'bridge committee-only tracker signature',
    fixture.unsignedTx,
    fixture,
    fixture.bridgeCommitteePrivateKeyHex,
  );
  await expectVmReject(
    wasm,
    stateContext,
    'unrelated tracker signature',
    fixture.unsignedTx,
    fixture,
    fixture.unrelatedPrivateKeyHex,
  );

  const changedCheckpoint = structuredClone(fixture.unsignedTx);
  const commitmentBytes = Buffer.from(
    decodeCollByteRegister(changedCheckpoint.inputs[0].extension['0']),
    'hex',
  );
  if (commitmentBytes.length !== 496) {
    throw new Error(`aggregate finality commitment must be 496 bytes, got ${commitmentBytes.length}`);
  }
  commitmentBytes[156] ^= 0x01;
  changedCheckpoint.inputs[0].extension['0'] = encodeCollByteRegister(commitmentBytes);
  await expectVmReject(
    wasm,
    stateContext,
    'mismatched embedded checkpoint',
    changedCheckpoint,
    fixture,
  );

  for (const [name, offset] of [
    ['finality proof system ID', 103],
    ['finality statement digest', 104],
    ['finality program ID', 136],
    ['finality verifier profile ID', 168],
    ['finality proof payload digest', 200],
    ['aggregate finality proof digest', 232],
  ] as const) {
    const changedIdentity = structuredClone(fixture.unsignedTx);
    const trackerValue = Buffer.from(
      decodeCollByteRegister(changedIdentity.inputs[0].extension['1']),
      'hex',
    );
    if (trackerValue.length !== 264) {
      throw new Error(`authenticated tracker value must be 264 bytes, got ${trackerValue.length}`);
    }
    trackerValue[offset] ^= 0x01;
    changedIdentity.inputs[0].extension['1'] = encodeCollByteRegister(trackerValue);
    const inserted = JSON.parse(tracker_v2_insert(
      '[]',
      fixture.plan.trackerKeyHex,
      trackerValue.toString('hex'),
    ));
    changedIdentity.inputs[0].extension['2'] = encodeCollByteRegister(Buffer.from(
      encodeAuthenticatedSpvProofBundle(
        fixture.plan.extensionProofHex,
        String(inserted.insert_proof_hex),
      ),
      'hex',
    ));
    changedIdentity.outputs[0].additionalRegisters.R5 =
      encodeAuthenticatedSpvTrackerAvlRegister(String(inserted.new_digest_hex));
    await expectVmReject(wasm, stateContext, name, changedIdentity, fixture);
  }

  const wrongHeaderIndex = structuredClone(fixture.unsignedTx);
  const currentIndex = fixture.plan.anchorHeader.contextIndex;
  wrongHeaderIndex.inputs[0].extension['3'] = encodeIntRegister(
    (currentIndex + 1) % fixture.headers.length,
  );
  await expectVmReject(wasm, stateContext, 'wrong header index', wrongHeaderIndex, fixture);

  const forgedExtensionProof = structuredClone(fixture.unsignedTx);
  const proofBundle = Buffer.from(
    decodeCollByteRegister(forgedExtensionProof.inputs[0].extension['2']),
    'hex',
  );
  const extensionProofLength = Number(proofBundle.readBigUInt64BE(0));
  if (extensionProofLength < 33) throw new Error('extension proof is unexpectedly empty');
  proofBundle[9] ^= 0x01;
  forgedExtensionProof.inputs[0].extension['2'] = encodeCollByteRegister(proofBundle);
  await expectVmReject(wasm, stateContext, 'forged extension proof', forgedExtensionProof, fixture);

  const missingCommitment = structuredClone(fixture.unsignedTx);
  delete missingCommitment.inputs[0].extension['0'];
  await expectVmReject(
    wasm,
    stateContext,
    'missing mandatory aggregate finality commitment Var',
    missingCommitment,
    fixture,
  );

  const unchangedAvlDigest = structuredClone(fixture.unsignedTx);
  unchangedAvlDigest.outputs[0].additionalRegisters.R5 = fixture.plan.inputRegisters.R5;
  await expectVmReject(wasm, stateContext, 'unchanged AVL digest', unchangedAvlDigest, fixture);
}

function normalizeFixedHex(value: unknown, expectedBytes: number, label: string): string {
  const clean = normalizeHex(value, label);
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return clean;
}

function normalizeHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return clean.toLowerCase();
}

export function buildDefaultAuthenticatedSpvTrackerVmInjection(): AuthenticatedSpvTrackerVmInjection {
  const fields: ErgoExtensionMerkleField[] = [
    { key: Buffer.from('0001', 'hex'), value: Buffer.from('11'.repeat(16), 'hex') },
    {
      key: Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
      value: Buffer.from(CHECKPOINT_FIXTURE.extensionValueHex, 'hex'),
    },
    { key: Buffer.from('7f01', 'hex'), value: Buffer.from('22'.repeat(24), 'hex') },
  ];
  const membership = buildErgoExtensionMembershipProof(
    fields,
    Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
  );
  return Object.freeze({
    checkpoint: CHECKPOINT_FIXTURE,
    aggregateFinalityCommitment: AGGREGATE_FINALITY_COMMITMENT_FIXTURE,
    extension: Object.freeze({
      keyHex: BRIDGE_EXTENSION_KEY_HEX,
      valueHex: CHECKPOINT_FIXTURE.extensionValueHex,
      fields,
      proofHex: membership.proof.toString('hex'),
      rootHex: membership.root.toString('hex'),
    }),
  });
}

export async function runAuthenticatedSpvTrackerVm(
  input: RunAuthenticatedSpvTrackerVmInput,
): Promise<AuthenticatedSpvTrackerVmAdmissionResult> {
  validateInjection(input?.injection);
  const syntheticContext = input.syntheticContext ?? true;
  const jvmConformance = input.jvmConformance ?? false;
  const canonicalSyntheticHeaderWindow = input.canonicalSyntheticHeaderWindow;
  if (canonicalSyntheticHeaderWindow) {
    assertWp06CanonicalJvmHeaderWindowProvenance(canonicalSyntheticHeaderWindow);
    if (!syntheticContext) {
      throw new Error('canonical synthetic JVM header capability requires synthetic context mode');
    }
  }
  const duplicatePreventionNftId = normalizeFixedHex(
    input.duplicatePreventionNftId ?? COMPILER_DUP_NFT_ID,
    32,
    'compiler duplicate-prevention NFT ID',
  );
  if (syntheticContext && jvmConformance && !canonicalSyntheticHeaderWindow) {
    throw new Error('--jvm-conformance requires a canonical mined-header context');
  }
  console.log(
    syntheticContext
      ? 'WP-06A authenticated SPV tracker deterministic offline VM evaluation'
      : 'WP-06A authenticated SPV tracker real-header VM evaluation',
  );
  const wasm = await getWasm();
  const ergoSourcePath = resolve(input.ergoSourcePath);
  const compiled = await compilePinnedAuthenticatedV2VmTrees({
    bridgeRoot: BRIDGE_ROOT,
    worktreeRoot: WORKTREE_ROOT,
    ergoSourcePath,
    trackerNftId: TRACKER_NFT_ID,
    duplicatePreventionNftId,
  });
  const trackerTree = compiled.trees.tracker;
  console.log(
    `Pinned tracker tree: ${compiled.treeSha256.tracker}; ` +
    `compilerPasses=${compiled.compilerPasses} fixedPoint=${compiled.fixedPointVerified}`,
  );
  let real: VmHeaderContext;
  if (syntheticContext) {
    real = buildSyntheticHeaderContext(
      wasm,
      input.injection,
      canonicalSyntheticHeaderWindow,
    );
    console.log(
      `${canonicalSyntheticHeaderWindow ? 'JVM-canonical' : 'Deterministic'} synthetic header: ` +
      `height=${real.anchorHeader.height} ` +
      `contextIndex=${real.anchorContextIndex} id=${real.anchorHeader.id.slice(0, 16)}...`,
    );
  } else {
    const nodeInfo = await readNodeJson('/info');
    if (String(nodeInfo?.network ?? '').toLowerCase() !== 'devnet') {
      throw new Error(`patched devnet required, got network=${String(nodeInfo?.network ?? 'unknown')}`);
    }
    real = await buildRealHeaderContext(wasm, input.injection);
    console.log(
      `Authenticated mined header: height=${real.anchorHeader.height} ` +
      `contextIndex=${real.anchorContextIndex} id=${real.anchorHeader.id.slice(0, 16)}...`,
    );
  }

  const fixture = await buildFixture(wasm, real, trackerTree, input.injection);
  const started = performance.now();
  const exactSigned = await signSyntheticTxWithExactBytes(
    wasm,
    real.stateContext,
    fixture.unsignedTx,
    fixture.inputBoxes,
    fixture.finalityAttestorPrivateKeyHex,
  );
  const signed = exactSigned.transaction;
  if (!/^[0-9a-f]{64}$/i.test(String(signed.id ?? ''))) {
    throw new Error('positive admission did not produce a signed transaction id');
  }
  console.log(
    `PASS valid authenticated admission: ${String(signed.id).slice(0, 24)}... ` +
    `eval=${(performance.now() - started).toFixed(1)}ms`,
  );
  let jvmConformanceReport: AuthenticatedV2JvmVmConformanceReport | undefined;
  let jvmReplayBinding: Wp06JvmReplayBinding | undefined;
  if (jvmConformance) {
    if (!real.jvmHeaderContext) throw new Error('JVM conformance requires retained mined-header data');
    const jvmFixture = buildAuthenticatedV2JvmVmFixture({
      wasm,
      mode: 'tracker',
      signedTransaction: signed,
      signedTransactionBytes: exactSigned.bytes,
      unsignedTransaction: fixture.unsignedTx,
      inputBoxes: fixture.inputBoxes,
      dataInputBoxes: [],
      contractBindings: {
        inputs: [{ role: 'tracker', ergoTreeHex: trackerTree }],
        dataInputs: [],
      },
      canonicalContractTrees: compiled.trees,
      preHeader: real.jvmHeaderContext.preHeader,
      headers: real.jvmHeaderContext.headers,
    });
    if (canonicalSyntheticHeaderWindow) {
      assertWp06CanonicalJvmFixtureHeaderBinding(
        canonicalSyntheticHeaderWindow,
        jvmFixture,
      );
    }
    jvmReplayBinding = deriveWp06JvmReplayBinding(jvmFixture);
    jvmConformanceReport = await verifyAuthenticatedV2JvmVmFixture({
      bridgeRoot: BRIDGE_ROOT,
      worktreeRoot: WORKTREE_ROOT,
      ergoSourcePath,
      trackerNftId: TRACKER_NFT_ID,
      duplicatePreventionNftId,
      fixture: jvmFixture,
    });
    assertWp06TrackerJvmReplayReport({
      report: jvmConformanceReport,
      binding: jvmReplayBinding,
      signedTransactionIdHex: String(signed.id),
      trackerNftId: TRACKER_NFT_ID,
      duplicatePreventionNftId,
      trackerTreeSha256Hex: compiled.treeSha256.tracker,
    });
    if (canonicalSyntheticHeaderWindow) {
      await expectJvmDerivedHeaderIdReject({
        ergoSourcePath,
        duplicatePreventionNftId,
        fixture: jvmFixture,
      });
    }
    console.log(
      `PASS pinned JVM tracker proof and serialization conformance: ` +
      `tx=${jvmConformanceReport.transactionIdHex.slice(0, 24)}... ` +
      `cost=${jvmConformanceReport.inputs[0].cost} ` +
      `compiler-binding=${jvmConformanceReport.canonicalCompilation.bindingDigestHex.slice(0, 24)}...`,
    );
  }

  await runNegativeMatrix(wasm, real.stateContext, fixture);
  console.log(
    syntheticContext
      ? 'PASS proof-bound attestor-authorized deterministic-context admission and negative matrix.'
      : 'PASS proof-bound attestor-authorized real-header admission and negative matrix.',
  );
  console.log(
    `BOUNDARY: ${syntheticContext
      ? 'deterministic synthetic headers are VM inputs, not mined-header evidence; '
      : ''}` +
    'synthetic tracker box and ephemeral distinct keys only; aggregate proof identity is bound, ' +
    'but R9 remains the finality authority. No trustless proof acceptance, node stateful acceptance, ' +
    'organizational-independence proof, Gate 5 closure, submit, or broadcast.',
  );
  const admittedSuccessor = signed.outputs?.[0];
  if (!admittedSuccessor || !/^[0-9a-f]{64}$/i.test(String(admittedSuccessor.boxId ?? ''))) {
    throw new Error('admitted tracker successor is missing its exact signed output box ID');
  }
  assertWp06SignedSuccessorBinding({
    signedTransactionIdHex: signed.id,
    successorTransactionIdHex: admittedSuccessor.transactionId,
    successorIndex: admittedSuccessor.index,
  });
  if (
    admittedSuccessor.ergoTree !== trackerTree
    || admittedSuccessor.value !== fixture.unsignedTx.outputs[0].value
    || admittedSuccessor.creationHeight !== fixture.unsignedTx.outputs[0].creationHeight
    || !isDeepStrictEqual(admittedSuccessor.assets, fixture.unsignedTx.outputs[0].assets)
    || !isDeepStrictEqual(
      admittedSuccessor.additionalRegisters,
      fixture.plan.successorRegisters,
    )
  ) {
    throw new Error('signed tracker successor drifted from the VM-admitted plan');
  }
  const retainedHeaders = real.headers.map(header => structuredClone(header));
  const retainedAnchorHeader = retainedHeaders[real.anchorContextIndex];
  if (!retainedAnchorHeader || retainedAnchorHeader.id !== real.anchorHeader.id) {
    throw new Error('retained tracker header context lost its admitted anchor');
  }
  const retainedHeaderContext = Object.freeze({
    currentHeight: real.currentHeight,
    anchorContextIndex: real.anchorContextIndex,
    anchorHeader: retainedAnchorHeader,
    headers: Object.freeze(retainedHeaders),
    provenance: real.provenance,
  });
  const result = Object.freeze({
    injection: input.injection,
    admittedSuccessor,
    signedTransaction: signed,
    plan: fixture.plan,
    trackerTree,
    currentHeight: real.currentHeight,
    anchorHeader: retainedAnchorHeader,
    headerContext: retainedHeaderContext,
    jvmConformanceReport,
    jvmReplayBinding,
    negativeCases: AUTHENTICATED_SPV_TRACKER_NEGATIVE_CASES,
    boundary: Object.freeze({
      syntheticContext,
      chainRpcWritesEnabled: false as const,
      ephemeralInMemorySigningUsed: true as const,
      externalWalletStateAccessed: false as const,
      r9FinalityAuthority: true as const,
      gate5Closed: false as const,
      submitOrBroadcastEnabled: false as const,
    }),
  });
  return result;
}

function validateInjection(injection: AuthenticatedSpvTrackerVmInjection): void {
  if (!injection || typeof injection !== 'object') {
    throw new Error('authenticated tracker VM injection is required');
  }
  if (
    injection.checkpoint.extensionKeyHex !== BRIDGE_EXTENSION_KEY_HEX
    || injection.extension.keyHex.toLowerCase() !== BRIDGE_EXTENSION_KEY_HEX
  ) {
    throw new Error('authenticated tracker admission requires the exact 0x0401 extension key');
  }
  if (injection.extension.valueHex !== injection.checkpoint.extensionValueHex) {
    throw new Error('injected 0x0401 value does not match the checkpoint extension value');
  }
  if (
    injection.aggregateFinalityCommitment.proofSystemId
      !== AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA
  ) {
    throw new Error('authenticated tracker admission requires native GRANDPA proofSystemId 1');
  }
  if (
    injection.aggregateFinalityCommitment.statement.encodedCheckpointHex
      !== injection.checkpoint.encodedCheckpointHex
  ) {
    throw new Error('aggregate finality commitment embeds a different checkpoint');
  }
  const matchingFields = injection.extension.fields.filter(field =>
    Buffer.from(field.key).toString('hex') === BRIDGE_EXTENSION_KEY_HEX);
  if (
    matchingFields.length !== 1
    || Buffer.from(matchingFields[0].value).toString('hex') !== injection.extension.valueHex
  ) {
    throw new Error('injected extension fields must contain one exact 0x0401 checkpoint value');
  }
  if (injection.burnProof) {
    const validation = validateTrustlessBurnInclusionProofEnvelope(injection.burnProof);
    if (!validation.ok) {
      throw new Error(`injected burn proof is invalid: ${validation.errors.join('; ')}`);
    }
    if (
      injection.burnProof.bridgeEventRootHex
        !== injection.checkpoint.checkpoint.bridgeEventRootHex
      || injection.burnProof.leafCount !== injection.checkpoint.checkpoint.burnLeafCount
    ) {
      throw new Error('injected burn proof does not match the checkpoint root/count');
    }
  }
}

async function main(): Promise<void> {
  const injection = buildDefaultAuthenticatedSpvTrackerVmInjection();
  if (process.argv.includes('--print-extension-field')) {
    console.log(`${BRIDGE_EXTENSION_KEY_HEX}:${injection.extension.valueHex}`);
    return;
  }
  await runAuthenticatedSpvTrackerVm({
    ergoSourcePath: requiredOption('--ergo-source'),
    injection,
    syntheticContext: process.argv.includes('--synthetic-context'),
    jvmConformance: process.argv.includes('--jvm-conformance'),
  });
}

function requiredOption(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch(error => {
    console.error('FATAL:', error);
    process.exit(1);
  });
}
