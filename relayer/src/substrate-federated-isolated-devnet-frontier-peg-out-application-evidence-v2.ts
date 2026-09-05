import { createHash, ECDH } from 'node:crypto';
import blakejs from 'blakejs';

import { FRONTIER_PEG_OUT_TOPIC } from './frontier-bridge-event-root.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1 as BRIDGE,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1 as TOKEN,
} from './substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import type { SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceReceiptV1 as V1 } from './substrate-federated-isolated-devnet-frontier-peg-out-application-evidence-v1.js';
import { sha256CanonicalJson } from './strict-json.js';
import { buildTrustlessBurnCommitment, deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_EVIDENCE_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-frontier-peg-out-application-evidence.v2' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_SIGNED_APPLICATION_OVERLAY_SHA256 =
  '921d1488b78f8123b1772d20d88da00670140e70b7a1a763381e1158416250dd' as const;
const DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_EVIDENCE_V2';
const DEPLOYER = '0xf24ff3a9cf04c71dbc94d0b566f7a27b94566cac';
const PEG_PREFIX = 'bridge-lab-peg-out-';
const SIGNED_PREFIX = 'bridge-lab-signed-application-';
const PEG_MARKERS = [
  'sidechain-id', 'source-native-block-height', 'source-native-block-hash',
  'execution-block-number', 'execution-block-hash', 'bridge-address', 'token-address',
  'transaction-index', 'transaction-hash', 'receipt-status', 'log-index', 'topic0',
  'topic1', 'data', 'bridge-event-root', 'burn-leaf-count', 'burn-id', 'burn-leaf-hash',
  'net-amount-nano-erg', 'recipient-ergo-tree', 'recipient-ergo-tree-hash',
  'supply-before', 'supply-after', 'escrow-after',
] as const;
const SIGNED_MARKERS = ['format', 'owner', 'mint-hash', 'approval-hash'] as const;
const RECEIPTS = new WeakSet<object>();

export interface ConsumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV2Input {
  readonly stdout: string;
  readonly canonicalFrontierPatchBytes: Uint8Array;
  readonly applicationEvidenceOverlayPatchBytes: Uint8Array;
  readonly signedApplicationOverlayPatchBytes: Uint8Array;
  readonly expected: Readonly<{
    readonly ownerAddressHex: string;
    readonly ergoRecipientPublicKeyHex: string;
    readonly transactionHashes: Readonly<{ mint: string; approval: string; pegOut: string }>;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceReceiptV2 {
  readonly schema: typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_EVIDENCE_V2_SCHEMA;
  readonly version: 2;
  readonly status: V1['status'];
  readonly source: V1['source'] & Readonly<{ signedApplicationOverlayPatchSha256: string }>;
  readonly application: V1['application'];
  readonly sourceNativeBlock: V1['sourceNativeBlock'];
  readonly execution: V1['execution'];
  readonly burn: V1['burn'];
  readonly conservation: V1['conservation'];
  readonly signedApplication: Readonly<{
    format: 1;
    ergoRecipientPublicKeyHex: string;
    transactionHashes: Readonly<{ mint: string; approval: string; pegOut: string }>;
  }>;
  readonly checks: V1['checks'] & Readonly<{
    exactSignedApplicationOverlayPatchBytesMatched: true;
    expectedOwnerRecipientAndTransactionHashesBound: true;
  }>;
  readonly boundary: Omit<V1['boundary'], 'deterministicSyntheticAccountOnly'> & Readonly<{
    deterministicSyntheticAccountOnly: false;
  }>;
  readonly limitations: readonly string[];
  readonly receiptDigestHex: string;
}

export function consumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV2(
  input: Readonly<ConsumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV2Input>,
): Readonly<SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceReceiptV2> {
  exactObject(input, ['stdout', 'canonicalFrontierPatchBytes', 'applicationEvidenceOverlayPatchBytes',
    'signedApplicationOverlayPatchBytes', 'expected'], 'input');
  exactObject(input.expected, ['ownerAddressHex', 'ergoRecipientPublicKeyHex', 'transactionHashes'], 'expected');
  exactObject(input.expected.transactionHashes, ['mint', 'approval', 'pegOut'], 'transaction hashes');
  const source = {
    canonicalFrontierPatchSha256: patchHash(input.canonicalFrontierPatchBytes,
      'bd8500696af4dd7b67dd99c9446f5ef2f23803e58f6669a5e80d8548124d7634', 'canonical Frontier'),
    applicationEvidenceOverlayPatchSha256: patchHash(input.applicationEvidenceOverlayPatchBytes,
      '2a7504ece8f175ba0ab25a2ab5ad9076afcf3b195618efbca6103544fadec495', 'application evidence'),
    signedApplicationOverlayPatchSha256: patchHash(input.signedApplicationOverlayPatchBytes,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_SIGNED_APPLICATION_OVERLAY_SHA256, 'signed application'),
  };
  const ownerAddressHex = fixedHex(input.expected.ownerAddressHex, 20, 'expected owner', true);
  if ([DEPLOYER, BRIDGE, TOKEN].includes(ownerAddressHex)) throw new Error('forbidden application owner');
  const ergoRecipientPublicKeyHex = publicKey(input.expected.ergoRecipientPublicKeyHex);
  const transactionHashes = {
    mint: fixedHex(input.expected.transactionHashes.mint, 32, 'expected mint hash', true),
    approval: fixedHex(input.expected.transactionHashes.approval, 32, 'expected approval hash', true),
    pegOut: fixedHex(input.expected.transactionHashes.pegOut, 32, 'expected peg-out hash', true),
  };
  const markers = parseMarkers(input.stdout);
  const peg = (name: typeof PEG_MARKERS[number]): string => markers.get(PEG_PREFIX + name)!;
  const signed = (name: typeof SIGNED_MARKERS[number]): string => markers.get(SIGNED_PREFIX + name)!;
  if (signed('format') !== '1') throw new Error('signed application format changed');
  if (fixedHex(signed('owner'), 20, 'signed owner', true) !== ownerAddressHex) {
    throw new Error('signed application owner binding changed');
  }
  if (fixedHex(signed('mint-hash'), 32, 'mint hash', true) !== transactionHashes.mint
    || fixedHex(signed('approval-hash'), 32, 'approval hash', true) !== transactionHashes.approval
    || fixedHex(peg('transaction-hash'), 32, 'peg-out hash', true) !== transactionHashes.pegOut) {
    throw new Error('signed application transaction hash binding changed');
  }
  const bridgeAddressHex = fixedHex(peg('bridge-address'), 20, 'bridge address');
  const tokenAddressHex = fixedHex(peg('token-address'), 20, 'token address');
  if (bridgeAddressHex !== BRIDGE || tokenAddressHex !== TOKEN) throw new Error('different application');
  if (fixedHex(peg('topic0'), 32, 'topic0') !== FRONTIER_PEG_OUT_TOPIC) throw new Error('different event topic');
  const topic1 = fixedHex(peg('topic1'), 32, 'topic1');
  if (!/^0x0{24}[0-9a-f]{40}$/u.test(topic1)) throw new Error('owner topic padding changed');
  if (`0x${topic1.slice(26)}` !== ownerAddressHex) throw new Error('indexed owner binding changed');
  for (const [name, value] of [
    ['source-native-block-height', '7'], ['execution-block-number', '7'],
    ['transaction-index', '1'], ['receipt-status', '1'], ['log-index', '3'], ['burn-leaf-count', '1'],
  ] as const) {
    if (peg(name) !== value) throw new Error(`execution topology changed: ${name}`);
  }
  const sidechainIdHex = fixedHex(peg('sidechain-id'), 32, 'sidechain ID', true);
  const nativeHash = fixedHex(peg('source-native-block-hash'), 32, 'native hash', true);
  const blockHashHex = fixedHex(peg('execution-block-hash'), 32, 'execution hash', true);
  const data = fixedHex(peg('data'), 160, 'PegOut ABI data').slice(2);
  const amount = BigInt(`0x${data.slice(0, 64)}`);
  if (amount <= 0n) throw new Error('ABI amount must be positive');
  if (BigInt(`0x${data.slice(64, 128)}`) !== 64n) throw new Error('ABI recipient offset changed');
  if (BigInt(`0x${data.slice(128, 192)}`) !== 33n) throw new Error('ABI recipient length changed');
  const decodedRecipient = publicKey(`0x${data.slice(192, 258)}`);
  if (!/^0+$/u.test(data.slice(258))) throw new Error('ABI padding must be zero');
  if (decodedRecipient !== ergoRecipientPublicKeyHex) throw new Error('expected recipient binding changed');
  const recipientErgoTreeHex = `0x0008cd${decodedRecipient.slice(2)}`;
  const recipientErgoTreeHashHex = `0x${Buffer.from(blakejs.blake2b(
    Buffer.from(recipientErgoTreeHex.slice(2), 'hex'), undefined, 32,
  )).toString('hex')}`;
  const burnId = deriveTrustlessBurnIdHex({ sidechainIdHex, sidechainTxHashHex: transactionHashes.pegOut, eventIndex: 3 });
  const commitment = buildTrustlessBurnCommitment([{
    sidechainIdHex, sidechainBlockHashHex: blockHashHex, burnIdHex: burnId,
    sidechainTxHashHex: transactionHashes.pegOut, eventIndex: 3,
    recipientErgoTreeHashHex, amountNanoErg: amount,
  }]);
  const burnIdHex = fixedHex(peg('burn-id'), 32, 'burn ID', true);
  const burnLeafHashHex = fixedHex(peg('burn-leaf-hash'), 32, 'burn leaf', true);
  const bridgeEventRootHex = fixedHex(peg('bridge-event-root'), 32, 'root', true);
  if (burnIdHex !== `0x${burnId}`
    || burnLeafHashHex !== `0x${commitment.leaves[0].leafHashHex}`
    || bridgeEventRootHex !== `0x${commitment.bridgeEventRootHex}`
    || burnLeafHashHex !== bridgeEventRootHex
    || fixedHex(peg('recipient-ergo-tree'), 36, 'recipient tree') !== recipientErgoTreeHex
    || fixedHex(peg('recipient-ergo-tree-hash'), 32, 'recipient tree hash', true) !== recipientErgoTreeHashHex) {
    throw new Error('burn or commitment binding changed');
  }
  if (amount !== 10_000_000n || peg('net-amount-nano-erg') !== '10000000'
    || peg('supply-before') !== '15000000' || peg('supply-after') !== '5000000'
    || peg('escrow-after') !== '5000000') throw new Error('supply or fee conservation changed');

  const body = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_EVIDENCE_V2_SCHEMA,
    version: 2, status: 'local_application_burn_transcript_validated', source,
    application: { bridgeAddressHex, tokenAddressHex, ownerAddressHex },
    sourceNativeBlock: { height: 7, hashHex: nativeHash },
    execution: { sidechainIdHex, blockNumber: 7, blockHashHex, transactionIndex: 1,
      transactionHashHex: transactionHashes.pegOut, eventIndex: 3 },
    burn: { burnIdHex, bridgeEventRootHex, burnLeafHashHex, burnLeafCount: 1,
      amountNanoErg: '10000000', recipientErgoTreeHex, recipientErgoTreeHashHex },
    conservation: { supplyBeforeNanoErg: '15000000', supplyAfterNanoErg: '5000000',
      bridgeEscrowAfterNanoErg: '5000000', bridgeFeeNanoErg: '5000000' },
    signedApplication: { format: 1, ergoRecipientPublicKeyHex, transactionHashes },
    checks: {
      exactCanonicalFrontierPatchBytesMatched: true, exactApplicationOverlayPatchBytesMatched: true,
      exactSignedApplicationOverlayPatchBytesMatched: true, exactMarkerSetConsumedOnce: true,
      expectedOwnerRecipientAndTransactionHashesBound: true, consumerConstructionProvenanceEstablished: true,
      reviewedBridgeAndTokenApplicationBound: true, reportedSuccessfulPegOutStatusBound: true,
      proofRelevantPegOutFieldsBound: true, sourceNativeBlockIdentityParsed: true,
      canonicalPegOutAbiDecoded: true, burnIdentityReconstructed: true,
      burnLeafAndRootReconstructed: true, netBurnSupplyDeltaVerified: true, bridgeFeeEscrowVerified: true,
    },
    boundary: {
      isolatedTestClientOnly: true, deterministicSyntheticAccountOnly: false,
      completeReceiptArrayExported: false, receiptTopologyIndependentlyEstablished: false,
      callerSuppliedStdoutHasProcessProvenance: false, sourceConsensusEstablished: false,
      sidechainFinalityEstablished: false, ergoAnchorEstablished: false, trackerAdmissionEstablished: false,
      payoutAuthorized: false, signingAuthorized: false, submissionAuthorized: false,
      broadcastAuthorized: false, fundsAuthorityEstablished: false, gate5Closed: false,
      trustlessStatusEstablished: false, productionReadinessEstablished: false,
    },
    limitations: [
      'Caller-supplied stdout and expected identities are compared, not authenticated as process output or custody.',
      'No signature verification, owner freshness, source-proof validation, native-to-EVM block relation, consensus or finality is established by this consumer.',
      'This isolated application transcript does not authorize signing, submission, broadcast, tracker admission or payout, and does not establish funds authority, Gate 5 or production readiness.',
    ],
  } as const;
  const receipt = deepFreeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, DOMAIN) });
  RECEIPTS.add(receipt);
  return receipt;
}

export function assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV2ConsumerConstruction(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceReceiptV2> {
  if (value === null || typeof value !== 'object' || !RECEIPTS.has(value)) {
    throw new Error('Frontier peg-out V2 evidence lacks consumer construction provenance');
  }
  const { receiptDigestHex, ...body } = value as SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceReceiptV2;
  if (sha256CanonicalJson(body, DOMAIN) !== receiptDigestHex) throw new Error('V2 evidence receipt drifted');
}

// Require own data properties so accessors cannot change identities between checks.
function exactObject(value: unknown, keys: readonly string[], label: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) {
    throw new Error(`${label} fields changed`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error(`${label} requires own data fields`);
  }
}

function patchHash(bytes: Uint8Array, expected: string, label: string): string {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > 4 * 1024 * 1024) {
    throw new Error(`${label} patch bytes invalid or too large`);
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expected) throw new Error(`${label} patch bytes changed`);
  return hash;
}

function fixedHex(value: unknown, bytes: number, label: string, nonzero = false): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`, 'u').test(value)) {
    throw new Error(`${label} must be exact ${bytes}-byte hex`);
  }
  if (nonzero && /^0x0+$/u.test(value)) throw new Error(`${label} must be nonzero`);
  return value.toLowerCase();
}

function publicKey(value: unknown): string {
  const key = fixedHex(value, 33, 'recipient public key');
  if (!/^0x0[23]/u.test(key)) throw new Error('recipient must be compressed');
  try {
    const bytes = Buffer.from(key.slice(2), 'hex');
    if (!Buffer.from(ECDH.convertKey(bytes, 'secp256k1', undefined, undefined, 'compressed')).equals(bytes)) {
      throw new Error('noncanonical key');
    }
  } catch { throw new Error('recipient is not a valid secp256k1 public key'); }
  return key;
}

function parseMarkers(stdout: string): ReadonlyMap<string, string> {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout, 'utf8') > 1024 * 1024 || stdout.includes('\0')) {
    throw new Error('stdout invalid or too large');
  }
  const allowed = new Set([
    ...PEG_MARKERS.map(name => PEG_PREFIX + name), ...SIGNED_MARKERS.map(name => SIGNED_PREFIX + name),
  ]);
  const values = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(PEG_PREFIX) && !trimmed.startsWith(SIGNED_PREFIX)) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) throw new Error('marker lacks a value');
    const name = trimmed.slice(0, separator);
    if (!allowed.has(name)) throw new Error(`unknown marker: ${name}`);
    if (values.has(name)) throw new Error(`duplicate marker: ${name}`);
    const value = trimmed.slice(separator + 1);
    if (!value) throw new Error(`empty marker: ${name}`);
    values.set(name, value);
  }
  for (const name of allowed) if (!values.has(name)) throw new Error(`missing marker: ${name}`);
  return values;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
