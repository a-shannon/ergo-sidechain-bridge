import { createHash, ECDH } from 'node:crypto';

import blakejs from 'blakejs';

import {
  FRONTIER_PEG_OUT_TOPIC,
} from './frontier-bridge-event-root.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
} from './substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  buildTrustlessBurnCommitment,
  deriveTrustlessBurnIdHex,
} from './trustless-burn-proof.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_EVIDENCE_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-frontier-peg-out-application-evidence.v1' as const;

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_OVERLAY_SHA256 =
  'f0c31b1cf5f4da548438eab7a2467b8e6ef6e5eb023053ad07cdd6735fca93dc' as const;

const CANONICAL_FRONTIER_PATCH_SHA256 =
  '47fdb34df23ebd5aad7d64885d030f67b3ae1aa25d1990bccc010903039a8813';
const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_EVIDENCE_V1';
const MARKER_PREFIX = 'bridge-lab-peg-out-';
const MAX_STDOUT_BYTES = 1024 * 1024;
const MAX_PATCH_BYTES = 4 * 1024 * 1024;
const EXPECTED_OWNER_ADDRESS =
  '0xf24ff3a9cf04c71dbc94d0b566f7a27b94566cac';
const EXPECTED_EXECUTION_BLOCK_NUMBER = 7;
const EXPECTED_TRANSACTION_INDEX = 1;
const EXPECTED_EVENT_INDEX = 3;
const BRIDGE_FEE_NANO_ERG = 5_000_000n;
const EXPECTED_MINT_AMOUNT_NANO_ERG = 15_000_000n;
const EXPECTED_NET_AMOUNT_NANO_ERG = 10_000_000n;
const P2PK_ERGO_TREE_PREFIX_HEX = '0008cd';
const CONSUMER_RECEIPTS = new WeakSet<object>();

const MARKERS = [
  'sidechain-id',
  'execution-block-number',
  'execution-block-hash',
  'bridge-address',
  'token-address',
  'transaction-index',
  'transaction-hash',
  'receipt-status',
  'log-index',
  'topic0',
  'topic1',
  'data',
  'bridge-event-root',
  'burn-leaf-count',
  'burn-id',
  'burn-leaf-hash',
  'net-amount-nano-erg',
  'recipient-ergo-tree',
  'recipient-ergo-tree-hash',
  'supply-before',
  'supply-after',
  'escrow-after',
] as const;

type MarkerName = typeof MARKERS[number];

export interface ConsumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1Input {
  readonly stdout: string;
  readonly canonicalFrontierPatchBytes: Uint8Array;
  readonly applicationEvidenceOverlayPatchBytes: Uint8Array;
}

export interface SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_EVIDENCE_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'local_application_burn_transcript_validated';
  readonly source: Readonly<{
    readonly canonicalFrontierPatchSha256: string;
    readonly applicationEvidenceOverlayPatchSha256: string;
  }>;
  readonly application: Readonly<{
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
    readonly ownerAddressHex: string;
  }>;
  readonly execution: Readonly<{
    readonly sidechainIdHex: string;
    readonly blockNumber: number;
    readonly blockHashHex: string;
    readonly transactionIndex: 1;
    readonly transactionHashHex: string;
    readonly eventIndex: 3;
  }>;
  readonly burn: Readonly<{
    readonly burnIdHex: string;
    readonly bridgeEventRootHex: string;
    readonly burnLeafHashHex: string;
    readonly burnLeafCount: 1;
    readonly amountNanoErg: '10000000';
    readonly recipientErgoTreeHex: string;
    readonly recipientErgoTreeHashHex: string;
  }>;
  readonly conservation: Readonly<{
    readonly supplyBeforeNanoErg: '15000000';
    readonly supplyAfterNanoErg: '5000000';
    readonly bridgeEscrowAfterNanoErg: '5000000';
    readonly bridgeFeeNanoErg: '5000000';
  }>;
  readonly checks: Readonly<{
    readonly exactCanonicalFrontierPatchBytesMatched: true;
    readonly exactApplicationOverlayPatchBytesMatched: true;
    readonly exactMarkerSetConsumedOnce: true;
    readonly consumerConstructionProvenanceEstablished: true;
    readonly reviewedBridgeAndTokenApplicationBound: true;
    readonly reportedSuccessfulPegOutStatusBound: true;
    readonly proofRelevantPegOutFieldsBound: true;
    readonly canonicalPegOutAbiDecoded: true;
    readonly burnIdentityReconstructed: true;
    readonly burnLeafAndRootReconstructed: true;
    readonly netBurnSupplyDeltaVerified: true;
    readonly bridgeFeeEscrowVerified: true;
  }>;
  readonly boundary: Readonly<{
    readonly isolatedTestClientOnly: true;
    readonly deterministicSyntheticAccountOnly: true;
    readonly completeReceiptArrayExported: false;
    readonly receiptTopologyIndependentlyEstablished: false;
    readonly callerSuppliedStdoutHasProcessProvenance: false;
    readonly sourceConsensusEstablished: false;
    readonly sidechainFinalityEstablished: false;
    readonly ergoAnchorEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly payoutAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly limitations: readonly string[];
  readonly receiptDigestHex: string;
}

export function consumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1(
  input: Readonly<
    ConsumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1Input
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceReceiptV1
> {
  assertExactInput(input);
  const canonicalFrontierPatchSha256 = hashBoundedBytes(
    input.canonicalFrontierPatchBytes,
    'canonical Frontier patch',
  );
  const applicationEvidenceOverlayPatchSha256 = hashBoundedBytes(
    input.applicationEvidenceOverlayPatchBytes,
    'application evidence overlay patch',
  );
  if (canonicalFrontierPatchSha256 !== CANONICAL_FRONTIER_PATCH_SHA256) {
    throw new Error('canonical Frontier patch bytes changed');
  }
  if (
    applicationEvidenceOverlayPatchSha256
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_OVERLAY_SHA256
  ) {
    throw new Error('Frontier peg-out application evidence overlay bytes changed');
  }

  const markers = parseExactMarkers(input.stdout);
  const bridgeAddressHex = canonicalAddress(
    markers.get('bridge-address'),
    'bridge address',
  );
  const tokenAddressHex = canonicalAddress(
    markers.get('token-address'),
    'token address',
  );
  if (
    bridgeAddressHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1
    || tokenAddressHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1
  ) {
    throw new Error('Frontier peg-out evidence targets a different application');
  }

  const sidechainIdHex = canonicalFixedHex(
    markers.get('sidechain-id'),
    32,
    'sidechain ID',
    true,
  );
  const blockHashHex = canonicalFixedHex(
    markers.get('execution-block-hash'),
    32,
    'execution block hash',
    true,
  );
  const transactionHashHex = canonicalFixedHex(
    markers.get('transaction-hash'),
    32,
    'transaction hash',
    true,
  );
  const bridgeEventRootHex = canonicalFixedHex(
    markers.get('bridge-event-root'),
    32,
    'bridge event root',
    true,
  );
  const burnIdHex = canonicalFixedHex(
    markers.get('burn-id'),
    32,
    'burn ID',
    true,
  );
  const burnLeafHashHex = canonicalFixedHex(
    markers.get('burn-leaf-hash'),
    32,
    'burn leaf hash',
    true,
  );
  const recipientErgoTreeHashHex = canonicalFixedHex(
    markers.get('recipient-ergo-tree-hash'),
    32,
    'recipient ErgoTree hash',
    true,
  );
  const recipientErgoTreeHex = canonicalVariableHex(
    markers.get('recipient-ergo-tree'),
    'recipient ErgoTree',
  );
  const topic0 = canonicalFixedHex(markers.get('topic0'), 32, 'topic0');
  const topic1 = canonicalFixedHex(markers.get('topic1'), 32, 'topic1');
  const data = canonicalVariableHex(markers.get('data'), 'PegOut data');
  if (topic0 !== FRONTIER_PEG_OUT_TOPIC) {
    throw new Error('Frontier peg-out evidence uses a different event topic');
  }
  if (`0x${topic1.slice(26)}` !== EXPECTED_OWNER_ADDRESS) {
    throw new Error('Frontier peg-out evidence uses a different synthetic owner');
  }
  if (!/^0x0{24}[0-9a-f]{40}$/u.test(topic1)) {
    throw new Error('Frontier peg-out owner topic is not canonically padded');
  }

  const blockNumber = canonicalSafeInteger(
    markers.get('execution-block-number'),
    'execution block number',
    true,
  );
  const transactionIndex = canonicalSafeInteger(
    markers.get('transaction-index'),
    'transaction index',
  );
  const receiptStatus = canonicalSafeInteger(
    markers.get('receipt-status'),
    'receipt status',
  );
  const eventIndex = canonicalSafeInteger(
    markers.get('log-index'),
    'global event index',
  );
  const burnLeafCount = canonicalSafeInteger(
    markers.get('burn-leaf-count'),
    'burn leaf count',
    true,
  );
  if (
    blockNumber !== EXPECTED_EXECUTION_BLOCK_NUMBER
    || transactionIndex !== EXPECTED_TRANSACTION_INDEX
    || receiptStatus !== 1
    || eventIndex !== EXPECTED_EVENT_INDEX
    || burnLeafCount !== 1
  ) {
    throw new Error('Frontier peg-out execution topology changed');
  }

  const parsedPegOut = parseCanonicalPegOutTranscript(topic1, data);
  const derivedBurnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex,
    sidechainTxHashHex: transactionHashHex,
    eventIndex,
  });
  const commitment = buildTrustlessBurnCommitment([{
    sidechainIdHex,
    sidechainBlockHashHex: blockHashHex,
    burnIdHex: derivedBurnIdHex,
    sidechainTxHashHex: transactionHashHex,
    eventIndex,
    recipientErgoTreeHashHex: parsedPegOut.recipientErgoTreeHashHex,
    amountNanoErg: parsedPegOut.amountNanoErg,
  }]);
  const leaf = commitment.leaves[0];
  if (
    parsedPegOut.userAddressHex !== EXPECTED_OWNER_ADDRESS
    || `0x${derivedBurnIdHex}` !== burnIdHex
    || parsedPegOut.recipientErgoTreeHex !== recipientErgoTreeHex
    || parsedPegOut.recipientErgoTreeHashHex !== recipientErgoTreeHashHex
    || `0x${leaf.leafHashHex}` !== burnLeafHashHex
    || `0x${commitment.bridgeEventRootHex}` !== bridgeEventRootHex
    || burnLeafHashHex !== bridgeEventRootHex
  ) {
    throw new Error('Frontier peg-out burn or commitment binding changed');
  }

  const netAmount = canonicalBigInt(
    markers.get('net-amount-nano-erg'),
    'net amount',
    true,
  );
  const supplyBefore = canonicalBigInt(
    markers.get('supply-before'),
    'supply before',
    true,
  );
  const supplyAfter = canonicalBigInt(
    markers.get('supply-after'),
    'supply after',
  );
  const escrowAfter = canonicalBigInt(
    markers.get('escrow-after'),
    'bridge escrow after',
    true,
  );
  if (
    netAmount !== EXPECTED_NET_AMOUNT_NANO_ERG
    || supplyBefore !== EXPECTED_MINT_AMOUNT_NANO_ERG
    || supplyAfter !== BRIDGE_FEE_NANO_ERG
    || escrowAfter !== BRIDGE_FEE_NANO_ERG
    || supplyBefore - supplyAfter !== netAmount
    || supplyAfter !== escrowAfter
    || parsedPegOut.amountNanoErg !== netAmount
  ) {
    throw new Error('Frontier peg-out supply or fee conservation changed');
  }

  const body = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_EVIDENCE_V1_SCHEMA,
    version: 1 as const,
    status: 'local_application_burn_transcript_validated' as const,
    source: {
      canonicalFrontierPatchSha256,
      applicationEvidenceOverlayPatchSha256,
    },
    application: {
      bridgeAddressHex,
      tokenAddressHex,
      ownerAddressHex: EXPECTED_OWNER_ADDRESS,
    },
    execution: {
      sidechainIdHex,
      blockNumber,
      blockHashHex,
      transactionIndex: 1 as const,
      transactionHashHex,
      eventIndex: 3 as const,
    },
    burn: {
      burnIdHex,
      bridgeEventRootHex,
      burnLeafHashHex,
      burnLeafCount: 1 as const,
      amountNanoErg: '10000000' as const,
      recipientErgoTreeHex,
      recipientErgoTreeHashHex,
    },
    conservation: {
      supplyBeforeNanoErg: '15000000' as const,
      supplyAfterNanoErg: '5000000' as const,
      bridgeEscrowAfterNanoErg: '5000000' as const,
      bridgeFeeNanoErg: '5000000' as const,
    },
    checks: {
      exactCanonicalFrontierPatchBytesMatched: true as const,
      exactApplicationOverlayPatchBytesMatched: true as const,
      exactMarkerSetConsumedOnce: true as const,
      consumerConstructionProvenanceEstablished: true as const,
      reviewedBridgeAndTokenApplicationBound: true as const,
      reportedSuccessfulPegOutStatusBound: true as const,
      proofRelevantPegOutFieldsBound: true as const,
      canonicalPegOutAbiDecoded: true as const,
      burnIdentityReconstructed: true as const,
      burnLeafAndRootReconstructed: true as const,
      netBurnSupplyDeltaVerified: true as const,
      bridgeFeeEscrowVerified: true as const,
    },
    boundary: {
      isolatedTestClientOnly: true as const,
      deterministicSyntheticAccountOnly: true as const,
      completeReceiptArrayExported: false as const,
      receiptTopologyIndependentlyEstablished: false as const,
      callerSuppliedStdoutHasProcessProvenance: false as const,
      sourceConsensusEstablished: false as const,
      sidechainFinalityEstablished: false as const,
      ergoAnchorEstablished: false as const,
      trackerAdmissionEstablished: false as const,
      payoutAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
    limitations: [
      'The Rust producer executes the reviewed Solidity peg-out and runtime commitment in an isolated TestClient; it does not establish source consensus or sidechain finality.',
      'This pure consumer receives caller-supplied stdout and reconstructs only the proof-relevant receipt view; same-process Cargo execution provenance remains for a later runner.',
      'No Ergo anchor, tracker admission, payout acceptance, replay update, signing, submission, broadcast, funds authority, Gate 5, trustless status, or production readiness follows from this receipt.',
    ] as const,
  });
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
  });
  CONSUMER_RECEIPTS.add(receipt);
  return receipt;
}

export function assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1ConsumerConstruction(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceReceiptV1
> {
  if (value === null || typeof value !== 'object' || !CONSUMER_RECEIPTS.has(value)) {
    throw new Error(
      'Frontier peg-out application evidence lacks consumer construction provenance',
    );
  }
  const receipt = value as SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceReceiptV1;
  const { receiptDigestHex, ...body } = receipt;
  if (sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN) !== receiptDigestHex) {
    throw new Error('Frontier peg-out application evidence receipt drifted');
  }
}

function parseExactMarkers(stdout: string): ReadonlyMap<MarkerName, string> {
  if (
    typeof stdout !== 'string'
    || Buffer.byteLength(stdout, 'utf8') > MAX_STDOUT_BYTES
    || stdout.includes('\0')
  ) {
    throw new Error('Frontier peg-out evidence stdout is invalid or too large');
  }
  const allowed = new Set<string>(MARKERS);
  const values = new Map<MarkerName, string>();
  for (const line of stdout.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(MARKER_PREFIX)) continue;
    const separator = trimmed.indexOf('=', MARKER_PREFIX.length);
    if (separator === -1) {
      throw new Error('Frontier peg-out evidence marker lacks a value');
    }
    const name = trimmed.slice(MARKER_PREFIX.length, separator);
    if (!allowed.has(name)) {
      throw new Error(`unknown Frontier peg-out evidence marker: ${name}`);
    }
    if (values.has(name as MarkerName)) {
      throw new Error(`duplicate Frontier peg-out evidence marker: ${name}`);
    }
    const value = trimmed.slice(separator + 1);
    if (value.length === 0) {
      throw new Error(`empty Frontier peg-out evidence marker: ${name}`);
    }
    values.set(name as MarkerName, value);
  }
  for (const marker of MARKERS) {
    if (!values.has(marker)) {
      throw new Error(`missing Frontier peg-out evidence marker: ${marker}`);
    }
  }
  return values;
}

function parseCanonicalPegOutTranscript(topic1: string, data: string): Readonly<{
  userAddressHex: string;
  amountNanoErg: bigint;
  recipientErgoTreeHex: string;
  recipientErgoTreeHashHex: string;
}> {
  const userAddressHex = `0x${topic1.slice(26)}`;
  const dataHex = data.slice(2);
  if (dataHex.length !== 160 * 2) {
    throw new Error('Frontier PegOut ABI data must be exactly 160 bytes');
  }
  const amountNanoErg = BigInt(`0x${dataHex.slice(0, 64)}`);
  if (amountNanoErg <= 0n) {
    throw new Error('Frontier PegOut ABI amount must be positive');
  }
  if (BigInt(`0x${dataHex.slice(64, 128)}`) !== 64n) {
    throw new Error('Frontier PegOut ABI recipient offset changed');
  }
  if (BigInt(`0x${dataHex.slice(128, 192)}`) !== 33n) {
    throw new Error('Frontier PegOut recipient must be one compressed public key');
  }
  const recipientPublicKeyHex = dataHex.slice(192, 258);
  const recipientPublicKey = Buffer.from(recipientPublicKeyHex, 'hex');
  if (!['02', '03'].includes(recipientPublicKeyHex.slice(0, 2))) {
    throw new Error('Frontier PegOut recipient must use a compressed public key');
  }
  try {
    const canonicalPublicKey = ECDH.convertKey(
      recipientPublicKey,
      'secp256k1',
      undefined,
      undefined,
      'compressed',
    );
    if (!Buffer.from(canonicalPublicKey).equals(recipientPublicKey)) {
      throw new Error('non-canonical compressed public key');
    }
  } catch {
    throw new Error('Frontier PegOut recipient is not a valid secp256k1 public key');
  }
  if (!/^0+$/u.test(dataHex.slice(258))) {
    throw new Error('Frontier PegOut ABI padding must be zero');
  }
  const recipientErgoTreeHex = `0x${P2PK_ERGO_TREE_PREFIX_HEX}${recipientPublicKeyHex}`;
  const recipientErgoTreeHashHex = `0x${Buffer.from(blakejs.blake2b(
    Buffer.from(recipientErgoTreeHex.slice(2), 'hex'),
    undefined,
    32,
  )).toString('hex')}`;
  return {
    userAddressHex,
    amountNanoErg,
    recipientErgoTreeHex,
    recipientErgoTreeHashHex,
  };
}

function assertExactInput(
  value: Readonly<
    ConsumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1Input
  >,
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Frontier peg-out evidence input must be an object');
  }
  const actual = Object.keys(value).sort();
  const expected = [
    'applicationEvidenceOverlayPatchBytes',
    'canonicalFrontierPatchBytes',
    'stdout',
  ];
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Frontier peg-out evidence input fields changed');
  }
}

function hashBoundedBytes(value: Uint8Array, label: string): string {
  if (!(value instanceof Uint8Array) || value.byteLength === 0 || value.byteLength > MAX_PATCH_BYTES) {
    throw new Error(`${label} bytes are invalid or too large`);
  }
  return createHash('sha256').update(value).digest('hex');
}

function canonicalAddress(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/u.test(value)) {
    throw new Error(`${label} must be an exact address`);
  }
  return value.toLowerCase();
}

function canonicalFixedHex(
  value: unknown,
  bytes: number,
  label: string,
  nonZero = false,
): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`, 'u').test(value)) {
    throw new Error(`${label} must be exact 0x-prefixed hex`);
  }
  const canonical = value.toLowerCase();
  if (nonZero && /^0x0+$/u.test(canonical)) {
    throw new Error(`${label} must be nonzero`);
  }
  return canonical;
}

function canonicalVariableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^0x(?:[0-9a-fA-F]{2})+$/u.test(value)
  ) {
    throw new Error(`${label} must contain whole 0x-prefixed bytes`);
  }
  return value.toLowerCase();
}

function canonicalSafeInteger(value: unknown, label: string, positive = false): number {
  const parsed = canonicalBigInt(value, label, positive);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds the safe integer range`);
  }
  return Number(parsed);
}

function canonicalBigInt(value: unknown, label: string, positive = false): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`${label} must be canonical unsigned decimal`);
  }
  const parsed = BigInt(value);
  if (positive ? parsed <= 0n : parsed < 0n) {
    throw new Error(`${label} is outside its allowed range`);
  }
  return parsed;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
