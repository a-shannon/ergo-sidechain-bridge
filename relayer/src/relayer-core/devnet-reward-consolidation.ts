import { sha256CanonicalJson } from '../ergo-settlement-core/strict-json.js';
import { safeNanoErgNumber } from '../ergo-settlement-core/tx-balance.js';

export const DEVNET_REWARD_CONSOLIDATION_SCHEMA =
  'e2s.devnet-reward-consolidation.v1' as const;
export const DEVNET_REWARD_CONSOLIDATION_TARGET_NANOERG = 10_000_000_000n;
export const DEVNET_REWARD_CONSOLIDATION_MAX_INPUTS = 20;
export const DEVNET_REWARD_CONSOLIDATION_MATURITY_MARGIN = 2;
export const DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT = 1 as const;
export const DEVNET_REWARD_CONSOLIDATION_NODE_NETWORK = 'devnet' as const;
export const DEVNET_REWARD_CONSOLIDATION_FINAL_CONFIRMATIONS = 10;

const DEVNET_REWARD_ERGO_TREE_PREFIX = '100204';
const DEVNET_REWARD_ERGO_TREE_SUFFIX = 'ea02d192a39a8cc7a70173007301';

const PLAN_DIGEST_DOMAIN = 'E2S_DEVNET_REWARD_CONSOLIDATION_PLAN_V1';
const SOURCE_SET_DIGEST_DOMAIN =
  'E2S_DEVNET_REWARD_CONSOLIDATION_SOURCE_SET_V1';
const SESSION_IDENTITY_DIGEST_DOMAIN =
  'E2S_DEVNET_REWARD_CONSOLIDATION_SESSION_IDENTITY_V1';

type PlainRecord = Record<string, unknown>;

export interface DevnetRewardConsolidationPlan {
  readonly schema: typeof DEVNET_REWARD_CONSOLIDATION_SCHEMA;
  readonly nodeOrigin: string;
  readonly nodeNetwork: typeof DEVNET_REWARD_CONSOLIDATION_NODE_NETWORK;
  readonly chainAnchorHeight: typeof DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT;
  readonly chainAnchorHeaderIdHex: string;
  readonly addressNetworkPrefix: 16;
  readonly currentHeight: number;
  readonly rewardErgoTreeHex: string;
  readonly destinationErgoTreeHex: string;
  readonly sessionIdentityDigestHex: string;
  readonly inputBoxIds: readonly string[];
  readonly inputFingerprints: readonly DevnetRewardBoxFingerprint[];
  readonly sourceSetDigestHex: string;
  readonly selectedValueNanoErg: string;
  readonly observedBoxCount: number;
  readonly eligibleBoxCount: number;
  readonly ignoredBoxCount: number;
  readonly unsignedTransaction: Readonly<{
    inputs: readonly PlainRecord[];
    dataInputs: readonly [];
    outputs: readonly [Readonly<{
      value: number;
      ergoTree: string;
      assets: readonly [];
      additionalRegisters: Readonly<Record<string, never>>;
      creationHeight: number;
    }>];
  }>;
  readonly planDigestHex: string;
}

export interface DevnetRewardBoxFingerprint {
  readonly boxId: string;
  readonly valueNanoErg: string;
  readonly ergoTreeHex: string;
  readonly creationHeight: number;
  readonly transactionId: string;
  readonly outputIndex: number;
}

export interface DevnetRewardConsolidationRevalidation {
  readonly sourceSetDigestHex: string;
  readonly observedAtHeight: number;
  readonly observationDigestHex: string;
}

export type DevnetRewardConsolidationRevalidationPhase =
  | 'post-check'
  | 'pre-transport';

export interface DevnetRewardConsolidationAdmission {
  readonly plan: DevnetRewardConsolidationPlan;
  readonly expectedTxId: string;
}

export interface DevnetRewardConsolidationSignedCandidate {
  readonly admission: DevnetRewardConsolidationAdmission;
  readonly signedTransactionDigestHex: string;
  readonly signerArtifact: object;
}

export interface DevnetRewardConsolidationCheckedCandidate {
  readonly signed: DevnetRewardConsolidationSignedCandidate;
  readonly checkResponseDigestHex: string;
  readonly checkerArtifact: object;
}

export interface DevnetRewardConsolidationRevalidatedCandidate {
  readonly checked: DevnetRewardConsolidationCheckedCandidate;
  readonly evidence: DevnetRewardConsolidationRevalidation;
}

export interface DevnetRewardConsolidationAuthorization {
  readonly revalidated: DevnetRewardConsolidationRevalidatedCandidate;
  readonly preTransportEvidence: DevnetRewardConsolidationRevalidation;
  readonly authorizationDigestHex: string;
  readonly authorizationArtifact: object;
}

export interface DevnetRewardConsolidationTransportCandidate {
  readonly authorization: DevnetRewardConsolidationAuthorization;
}

export interface DevnetRewardConsolidationDurableAttempt {
  readonly candidate: DevnetRewardConsolidationTransportCandidate;
  readonly durableAttemptDigestHex: string;
  readonly durableArtifact: object;
}

export type DevnetRewardConsolidationSubmission =
  | Readonly<{
      status: 'accepted';
      submittedTxId: string;
      responseDigestHex: string;
    }>
  | Readonly<{
      status: 'ambiguous';
      submittedTxId: null;
      responseDigestHex: string | null;
    }>;

export type DevnetRewardConsolidationConfirmationStatus =
  | 'confirmed'
  | 'pending'
  | 'not_found'
  | 'unavailable';

export interface DevnetRewardConsolidationConfirmation {
  readonly status: Exclude<DevnetRewardConsolidationConfirmationStatus, 'unavailable'>;
  readonly confirmations: number;
  readonly observedAtHeight: number;
  readonly observationDigestHex: string;
  readonly confirmationHeight: number | null;
  readonly confirmationHeaderIdHex: string | null;
}

export interface DevnetRewardConsolidationExecutionPorts {
  readonly signer: Readonly<{
    sign(
      admission: DevnetRewardConsolidationAdmission,
    ): Promise<Readonly<{
      signedTransactionDigestHex: string;
      signerArtifact: object;
    }> | null>;
  }>;
  readonly checker: Readonly<{
    check(
      signed: DevnetRewardConsolidationSignedCandidate,
    ): Promise<Readonly<{
      checkResponseDigestHex: string;
      checkerArtifact: object;
    }> | null>;
  }>;
  readonly revalidator: Readonly<{
    revalidate(
      checked: DevnetRewardConsolidationCheckedCandidate,
      phase: DevnetRewardConsolidationRevalidationPhase,
    ): Promise<DevnetRewardConsolidationRevalidation>;
  }>;
  readonly broadcastAuthorizer: Readonly<{
    authorize(
      revalidated: DevnetRewardConsolidationRevalidatedCandidate,
      preTransportEvidence: DevnetRewardConsolidationRevalidation,
    ): Readonly<{
      authorizationDigestHex: string;
      authorizationArtifact: object;
    }>;
  }>;
  readonly transport: Readonly<{
    submit(
      attempt: DevnetRewardConsolidationDurableAttempt,
    ): Promise<DevnetRewardConsolidationSubmission | null>;
  }>;
  readonly journal: Readonly<{
    reserve(
      candidate: DevnetRewardConsolidationTransportCandidate,
    ): Readonly<{
      durableAttemptDigestHex: string;
      durableArtifact: object;
    }>;
    finalize(input: Readonly<{
      attempt: DevnetRewardConsolidationDurableAttempt;
      submission: DevnetRewardConsolidationSubmission;
    }>): Readonly<{
      status: DevnetRewardConsolidationSubmission['status'];
      journalDigestHex: string;
    }>;
    confirm(input: Readonly<{
      attempt: DevnetRewardConsolidationDurableAttempt;
      confirmation: DevnetRewardConsolidationConfirmation;
    }>): void;
  }>;
  readonly confirmationObserver: Readonly<{
    observe(
      expectedTxId: string,
      nodeOrigin: string,
    ): Promise<DevnetRewardConsolidationConfirmation | null>;
  }>;
}

export type DevnetRewardConsolidationExecutionResult =
  | Readonly<{
      status: 'signing_rejected' | 'check_rejected';
      expectedTxId: string;
      transportAttempted: false;
    }>
  | Readonly<{
      status: 'accepted' | 'ambiguous' | 'reconciled';
      expectedTxId: string;
      submittedTxId: string | null;
      confirmationStatus: DevnetRewardConsolidationConfirmationStatus;
      confirmationDigestHex: string | null;
      transportAttempted: true;
      durableAttemptRecorded: true;
      durableAttemptDigestHex: string;
      journalDigestHex: string;
    }>;

const ADMISSIONS = new WeakSet<object>();
const SIGNED = new WeakSet<object>();
const CHECKED = new WeakSet<object>();
const REVALIDATED = new WeakSet<object>();
const AUTHORIZATIONS = new WeakSet<object>();
const TRANSPORT_CANDIDATES = new WeakSet<object>();
const DURABLE_ATTEMPTS = new WeakSet<object>();

function normalizeHex(value: unknown, label: string, bytes?: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const normalized = value.trim().replace(/^0x/i, '').toLowerCase();
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)
    || (bytes !== undefined && normalized.length !== bytes * 2)
  ) {
    throw new Error(
      bytes === undefined
        ? `${label} must be non-empty even-length hex`
        : `${label} must be canonical ${bytes}-byte hex`,
    );
  }
  return normalized;
}

function normalizeHeight(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function normalizeBoundedPositiveInteger(
  value: unknown,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value)
    || Number(value) < 1
    || Number(value) > maximum
  ) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}`);
  }
  return Number(value);
}

function normalizeBoundedNonNegativeInteger(
  value: unknown,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value)
    || Number(value) < 0
    || Number(value) > maximum
  ) {
    throw new Error(`${label} must be an integer between 0 and ${maximum}`);
  }
  return Number(value);
}

function normalizeNanoErg(value: unknown, label: string): bigint {
  let normalized: bigint;
  if (typeof value === 'bigint') {
    normalized = value;
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} must be a positive integer`);
    }
    normalized = BigInt(value);
  } else if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) {
    normalized = BigInt(value);
  } else {
    throw new Error(`${label} must be canonical unsigned decimal`);
  }
  if (normalized <= 0n) throw new Error(`${label} must be positive`);
  return normalized;
}

function normalizePlainRecord(value: unknown, label: string): PlainRecord {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  return value as PlainRecord;
}

export function normalizeLocalDevnetRewardNodeOrigin(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('reward consolidation node must be a local HTTP origin');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('reward consolidation node must be a local HTTP origin');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== 'http:'
    || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)
    || parsed.username
    || parsed.password
    || parsed.port !== '9051'
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(
      'reward consolidation node must be the credential-free local patched-devnet HTTP origin on port 9051',
    );
  }
  return parsed.origin.toLowerCase();
}

export function deriveDevnetRewardErgoTreeHex(
  signerPublicKeyHex: unknown,
): string {
  return deriveDevnetRewardErgoTreeHexForDelay(signerPublicKeyHex, 1);
}

export function deriveDevnetRewardErgoTreeHexForDelay(
  signerPublicKeyHex: unknown,
  rewardDelay: 1 | 720,
): string {
  const publicKey = normalizeHex(
    signerPublicKeyHex,
    'reward signer public key',
    33,
  );
  const encodedRewardDelay = rewardDelay === 1
    ? '02'
    : rewardDelay === 720
      ? 'a00b'
      : null;
  if (encodedRewardDelay === null) {
    throw new Error('devnet reward delay must be exactly 1 or 720 blocks');
  }
  return `${DEVNET_REWARD_ERGO_TREE_PREFIX}${encodedRewardDelay}08cd${publicKey}${DEVNET_REWARD_ERGO_TREE_SUFFIX}`;
}

function assertDevnetIdentity(input: {
  nodeOrigin: unknown;
  nodeNetwork: unknown;
  chainAnchorHeight: unknown;
  chainAnchorHeaderIdHex: unknown;
  addressNetworkPrefix: unknown;
}): {
  nodeOrigin: string;
  nodeNetwork: typeof DEVNET_REWARD_CONSOLIDATION_NODE_NETWORK;
  chainAnchorHeight: typeof DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT;
  chainAnchorHeaderIdHex: string;
  addressNetworkPrefix: 16;
} {
  const nodeOrigin = normalizeLocalDevnetRewardNodeOrigin(input.nodeOrigin);
  if (typeof input.nodeNetwork !== 'string') {
    throw new Error('reward consolidation node network must be devnet');
  }
  const nodeNetwork = input.nodeNetwork.trim().toLowerCase();
  if (nodeNetwork !== DEVNET_REWARD_CONSOLIDATION_NODE_NETWORK) {
    throw new Error('reward consolidation requires the patched node devnet identity');
  }
  if (input.chainAnchorHeight !== DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT) {
    throw new Error(
      `reward consolidation chain anchor height must be ${DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT}`,
    );
  }
  const chainAnchorHeaderIdHex = normalizeHex(
    input.chainAnchorHeaderIdHex,
    'reward consolidation chain anchor header ID',
    32,
  );
  if (input.addressNetworkPrefix !== 16) {
    throw new Error('reward consolidation requires address network prefix 16');
  }
  return {
    nodeOrigin,
    nodeNetwork,
    chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
    chainAnchorHeaderIdHex,
    addressNetworkPrefix: 16,
  };
}

export function devnetRewardConsolidationSessionIdentityDigestHex(
  input: Readonly<{
    nodeOrigin: string;
    nodeNetwork: string;
    chainAnchorHeight: number;
    chainAnchorHeaderIdHex: string;
    addressNetworkPrefix: number;
    signerPublicKeyHex: string;
    destinationErgoTreeHex: string;
  }>,
): string {
  const identity = assertDevnetIdentity(input);
  const signerPublicKeyHex = normalizeHex(
    input.signerPublicKeyHex,
    'reward signer public key',
    33,
  );
  const rewardErgoTreeHex = deriveDevnetRewardErgoTreeHex(signerPublicKeyHex);
  const destinationErgoTreeHex = normalizeHex(
    input.destinationErgoTreeHex,
    'reward consolidation destination ErgoTree',
  );
  return sha256CanonicalJson({
    schema: DEVNET_REWARD_CONSOLIDATION_SCHEMA,
    nodeOrigin: identity.nodeOrigin,
    nodeNetwork: identity.nodeNetwork,
    chainAnchorHeight: identity.chainAnchorHeight,
    chainAnchorHeaderIdHex: identity.chainAnchorHeaderIdHex,
    addressNetworkPrefix: identity.addressNetworkPrefix,
    signerPublicKeyHex,
    rewardErgoTreeHex,
    destinationErgoTreeHex,
  }, SESSION_IDENTITY_DIGEST_DOMAIN);
}

function normalizeRewardBox(
  value: unknown,
  rewardErgoTreeHex: string,
  currentHeight: number,
  maturityMargin: number,
): {
  fingerprint: DevnetRewardBoxFingerprint;
  input: PlainRecord;
  eligible: boolean;
} {
  const box = normalizePlainRecord(value, 'reward box');
  const boxId = normalizeHex(box.boxId, 'reward box ID', 32);
  const ergoTreeHex = normalizeHex(box.ergoTree, `reward box ${boxId} ErgoTree`);
  if (ergoTreeHex !== rewardErgoTreeHex) {
    throw new Error(`reward box ${boxId} does not use the discovered reward ErgoTree`);
  }
  const valueNanoErg = normalizeNanoErg(box.value, `reward box ${boxId} value`);
  const creationHeight = normalizeHeight(
    box.creationHeight,
    `reward box ${boxId} creation height`,
  );
  const transactionId = normalizeHex(
    box.transactionId,
    `reward box ${boxId} transaction ID`,
    32,
  );
  const outputIndex = normalizeBoundedNonNegativeInteger(
    box.index,
    32_767,
    `reward box ${boxId} output index`,
  );
  if (!Array.isArray(box.assets)) {
    throw new Error(`reward box ${boxId} assets must be an array`);
  }
  const assets = box.assets;
  const registers = normalizePlainRecord(
    box.additionalRegisters,
    `reward box ${boxId} registers`,
  );
  const extension = normalizePlainRecord(
    box.extension ?? {},
    `reward box ${boxId} extension`,
  );
  const eligible =
    assets.length === 0
    && Object.keys(registers).length === 0
    && Object.keys(extension).length === 0
    && creationHeight <= currentHeight - maturityMargin;
  const fingerprint = Object.freeze({
    boxId,
    valueNanoErg: valueNanoErg.toString(),
    ergoTreeHex,
    creationHeight,
    transactionId,
    outputIndex,
  });
  return {
    fingerprint,
    eligible,
    input: Object.freeze({
      boxId,
      value: valueNanoErg,
      ergoTree: ergoTreeHex,
      assets: Object.freeze([]),
      additionalRegisters: Object.freeze({}),
      transactionId,
      index: outputIndex,
      creationHeight,
      extension: Object.freeze({}),
    }),
  };
}

function sourceSetDigest(
  fingerprints: readonly DevnetRewardBoxFingerprint[],
): string {
  return sha256CanonicalJson(
    fingerprints,
    SOURCE_SET_DIGEST_DOMAIN,
  );
}

export function buildDevnetRewardConsolidationPlan(input: Readonly<{
  nodeOrigin: string;
  nodeNetwork: string;
  chainAnchorHeight: number;
  chainAnchorHeaderIdHex: string;
  addressNetworkPrefix: number;
  currentHeight: number;
  signerPublicKeyHex: string;
  rewardErgoTreeHex: string;
  destinationErgoTreeHex: string;
  rewardBoxes: readonly unknown[];
  targetNanoErg?: bigint;
  maxInputs?: number;
  maturityMargin?: number;
}>): DevnetRewardConsolidationPlan | null {
  const identity = assertDevnetIdentity(input);
  const currentHeight = normalizeHeight(input.currentHeight, 'current Ergo height');
  const signerPublicKeyHex = normalizeHex(
    input.signerPublicKeyHex,
    'reward signer public key',
    33,
  );
  const rewardErgoTreeHex = normalizeHex(
    input.rewardErgoTreeHex,
    'reward ErgoTree',
  );
  if (rewardErgoTreeHex !== deriveDevnetRewardErgoTreeHex(signerPublicKeyHex)) {
    throw new Error('reward ErgoTree is not the exact patched-devnet reward proposition');
  }
  const destinationErgoTreeHex = normalizeHex(
    input.destinationErgoTreeHex,
    'reward consolidation destination ErgoTree',
  );
  const sessionIdentityDigestHex =
    devnetRewardConsolidationSessionIdentityDigestHex({
      ...identity,
      signerPublicKeyHex,
      destinationErgoTreeHex,
    });
  if (!Array.isArray(input.rewardBoxes)) {
    throw new Error('reward boxes must be an array');
  }
  const targetNanoErg = input.targetNanoErg
    ?? DEVNET_REWARD_CONSOLIDATION_TARGET_NANOERG;
  if (targetNanoErg <= 0n) {
    throw new Error('reward consolidation target must be positive');
  }
  const maxInputs = normalizeBoundedPositiveInteger(
    input.maxInputs ?? DEVNET_REWARD_CONSOLIDATION_MAX_INPUTS,
    DEVNET_REWARD_CONSOLIDATION_MAX_INPUTS,
    'reward consolidation maximum inputs',
  );
  const maturityMargin = normalizeBoundedPositiveInteger(
    input.maturityMargin ?? DEVNET_REWARD_CONSOLIDATION_MATURITY_MARGIN,
    100,
    'reward consolidation maturity margin',
  );
  const normalized = input.rewardBoxes.map(box =>
    normalizeRewardBox(box, rewardErgoTreeHex, currentHeight, maturityMargin));
  if (new Set(normalized.map(box => box.fingerprint.boxId)).size !== normalized.length) {
    throw new Error('reward box observation contains duplicate box IDs');
  }
  const eligible = normalized
    .filter(box => box.eligible)
    .sort((left, right) =>
      left.fingerprint.creationHeight - right.fingerprint.creationHeight
      || left.fingerprint.boxId.localeCompare(right.fingerprint.boxId));
  if (eligible.length === 0) return null;

  const selected: typeof eligible = [];
  let selectedValue = 0n;
  for (const box of eligible) {
    if (selected.length >= maxInputs || selectedValue >= targetNanoErg) break;
    selected.push(box);
    selectedValue += BigInt(box.fingerprint.valueNanoErg);
  }
  if (selected.length === 0 || selectedValue <= 0n) return null;

  const inputFingerprints = Object.freeze(
    selected.map(box => box.fingerprint),
  );
  const inputBoxIds = Object.freeze(
    inputFingerprints.map(box => box.boxId),
  );
  const sourceSetDigestHex = sourceSetDigest(inputFingerprints);
  const output = Object.freeze({
    value: safeNanoErgNumber(selectedValue, 'reward consolidation output'),
    ergoTree: destinationErgoTreeHex,
    assets: Object.freeze([]) as readonly [],
    additionalRegisters: Object.freeze({}) as Readonly<Record<string, never>>,
    creationHeight: currentHeight,
  });
  const unsignedTransaction = Object.freeze({
    inputs: Object.freeze(selected.map(box => box.input)),
    dataInputs: Object.freeze([]) as readonly [],
    outputs: Object.freeze([output]) as unknown as readonly [typeof output],
  });
  const binding = {
    schema: DEVNET_REWARD_CONSOLIDATION_SCHEMA,
    nodeOrigin: identity.nodeOrigin,
    nodeNetwork: identity.nodeNetwork,
    chainAnchorHeight: identity.chainAnchorHeight,
    chainAnchorHeaderIdHex: identity.chainAnchorHeaderIdHex,
    addressNetworkPrefix: identity.addressNetworkPrefix,
    currentHeight,
    rewardErgoTreeHex,
    destinationErgoTreeHex,
    sessionIdentityDigestHex,
    inputBoxIds,
    sourceSetDigestHex,
    selectedValueNanoErg: selectedValue.toString(),
    outputValueNanoErg: selectedValue.toString(),
    outputCreationHeight: currentHeight,
    feeNanoErg: '0',
  };
  return Object.freeze({
    ...binding,
    inputFingerprints,
    observedBoxCount: normalized.length,
    eligibleBoxCount: eligible.length,
    ignoredBoxCount: normalized.length - eligible.length,
    unsignedTransaction,
    planDigestHex: sha256CanonicalJson(binding, PLAN_DIGEST_DOMAIN),
  });
}

export function revalidateDevnetRewardConsolidationPlan(input: Readonly<{
  plan: DevnetRewardConsolidationPlan;
  nodeOrigin: string;
  nodeNetwork: string;
  chainAnchorHeight: number;
  chainAnchorHeaderIdHex: string;
  addressNetworkPrefix: number;
  observedAtHeight: number;
  boxes: readonly unknown[];
}>): DevnetRewardConsolidationRevalidation {
  const identity = assertDevnetIdentity(input);
  if (
    identity.nodeOrigin !== input.plan.nodeOrigin
    || identity.nodeNetwork !== input.plan.nodeNetwork
    || identity.chainAnchorHeight !== input.plan.chainAnchorHeight
    || identity.chainAnchorHeaderIdHex !== input.plan.chainAnchorHeaderIdHex
    || identity.addressNetworkPrefix !== input.plan.addressNetworkPrefix
  ) {
    throw new Error('reward consolidation node identity changed after planning');
  }
  const observedAtHeight = normalizeHeight(
    input.observedAtHeight,
    'reward consolidation revalidation height',
  );
  if (observedAtHeight < input.plan.currentHeight) {
    throw new Error('reward consolidation revalidation height moved backwards');
  }
  if (!Array.isArray(input.boxes) || input.boxes.length !== input.plan.inputBoxIds.length) {
    throw new Error('reward consolidation revalidation must return every selected input exactly once');
  }
  const observed = input.boxes.map(box =>
    normalizeRewardBox(
      box,
      input.plan.rewardErgoTreeHex,
      observedAtHeight,
      DEVNET_REWARD_CONSOLIDATION_MATURITY_MARGIN,
    ));
  if (observed.some(box => !box.eligible)) {
    throw new Error('reward consolidation input is no longer an eligible pure-ERG reward box');
  }
  const byId = new Map(observed.map(box => [box.fingerprint.boxId, box.fingerprint]));
  if (byId.size !== observed.length) {
    throw new Error('reward consolidation revalidation contains duplicate input boxes');
  }
  const fingerprints = input.plan.inputBoxIds.map((boxId, index) => {
    const fingerprint = byId.get(boxId);
    if (!fingerprint) {
      throw new Error(`reward consolidation input ${boxId} is no longer unspent`);
    }
    if (
      sha256CanonicalJson(fingerprint)
      !== sha256CanonicalJson(input.plan.inputFingerprints[index])
    ) {
      throw new Error(`reward consolidation input ${boxId} changed after planning`);
    }
    return fingerprint;
  });
  const sourceSetDigestHex = sourceSetDigest(fingerprints);
  if (sourceSetDigestHex !== input.plan.sourceSetDigestHex) {
    throw new Error('reward consolidation source-set digest changed after planning');
  }
  return Object.freeze({
    sourceSetDigestHex,
    observedAtHeight,
    observationDigestHex: sha256CanonicalJson({
      schema: DEVNET_REWARD_CONSOLIDATION_SCHEMA,
      planDigestHex: input.plan.planDigestHex,
      nodeOrigin: identity.nodeOrigin,
      nodeNetwork: identity.nodeNetwork,
      chainAnchorHeight: identity.chainAnchorHeight,
      chainAnchorHeaderIdHex: identity.chainAnchorHeaderIdHex,
      observedAtHeight,
      sourceSetDigestHex,
    }, 'E2S_DEVNET_REWARD_CONSOLIDATION_REVALIDATION_V1'),
  });
}

function exactDigest(value: unknown, label: string): string {
  return normalizeHex(value, label, 32);
}

function opaqueArtifact(value: unknown, label: string): object {
  if (value === null || typeof value !== 'object') {
    throw new Error(`${label} must be an opaque object`);
  }
  return value;
}

function assertAdmission(value: DevnetRewardConsolidationAdmission): void {
  if (!ADMISSIONS.has(value)) {
    throw new Error('reward consolidation admission lacks process provenance');
  }
}

function assertSigned(value: DevnetRewardConsolidationSignedCandidate): void {
  assertAdmission(value.admission);
  if (!SIGNED.has(value)) {
    throw new Error('reward consolidation signed candidate lacks process provenance');
  }
}

function assertChecked(value: DevnetRewardConsolidationCheckedCandidate): void {
  assertSigned(value.signed);
  if (!CHECKED.has(value)) {
    throw new Error('reward consolidation checked candidate lacks process provenance');
  }
}

function assertDurableAttempt(
  value: DevnetRewardConsolidationDurableAttempt,
): void {
  if (!DURABLE_ATTEMPTS.has(value)) {
    throw new Error('reward consolidation durable attempt lacks process provenance');
  }
}

function normalizeRevalidation(
  plan: DevnetRewardConsolidationPlan,
  evidence: DevnetRewardConsolidationRevalidation,
): DevnetRewardConsolidationRevalidation {
  const sourceSetDigestHex = exactDigest(
    evidence.sourceSetDigestHex,
    'reward consolidation revalidation source-set digest',
  );
  if (sourceSetDigestHex !== plan.sourceSetDigestHex) {
    throw new Error('reward consolidation revalidation changed the source set');
  }
  return Object.freeze({
    sourceSetDigestHex,
    observedAtHeight: normalizeHeight(
      evidence.observedAtHeight,
      'reward consolidation observed height',
    ),
    observationDigestHex: exactDigest(
      evidence.observationDigestHex,
      'reward consolidation observation digest',
    ),
  });
}

function normalizeConfirmation(
  value: DevnetRewardConsolidationConfirmation,
): DevnetRewardConsolidationConfirmation {
  if (!['confirmed', 'pending', 'not_found'].includes(value.status)) {
    throw new Error('reward consolidation confirmation status is unsupported');
  }
  const observationDigestHex = exactDigest(
    value.observationDigestHex,
    'reward consolidation confirmation digest',
  );
  if (!Number.isSafeInteger(value.confirmations) || Number(value.confirmations) < 0) {
    throw new Error(
      'reward consolidation confirmation count must be a non-negative safe integer',
    );
  }
  const confirmations = Number(value.confirmations);
  const observedAtHeight = normalizeHeight(
    value.observedAtHeight,
    'reward consolidation confirmation observation height',
  );
  if (value.status === 'confirmed') {
    if (confirmations < DEVNET_REWARD_CONSOLIDATION_FINAL_CONFIRMATIONS) {
      throw new Error('reward consolidation confirmation lacks final depth');
    }
    const confirmationHeight = normalizeHeight(
      value.confirmationHeight,
      'reward consolidation confirmation height',
    );
    const derivedConfirmations = observedAtHeight - confirmationHeight;
    if (
      derivedConfirmations !== confirmations
      || derivedConfirmations < DEVNET_REWARD_CONSOLIDATION_FINAL_CONFIRMATIONS
    ) {
      throw new Error('reward consolidation confirmation depth is inconsistent');
    }
    const confirmationHeaderIdHex = exactDigest(
      value.confirmationHeaderIdHex,
      'reward consolidation confirmation header ID',
    );
    return Object.freeze({
      status: 'confirmed',
      confirmations,
      observedAtHeight,
      observationDigestHex,
      confirmationHeight,
      confirmationHeaderIdHex,
    });
  }
  if (
    value.confirmationHeight !== null
    || value.confirmationHeaderIdHex !== null
  ) {
    throw new Error(
      'unconfirmed reward consolidation observation must not claim a block identity',
    );
  }
  if (value.status === 'not_found' && confirmations !== 0) {
    throw new Error('missing reward consolidation transaction cannot claim confirmations');
  }
  if (
    value.status === 'pending'
    && confirmations >= DEVNET_REWARD_CONSOLIDATION_FINAL_CONFIRMATIONS
  ) {
    throw new Error('pending reward consolidation transaction claims final depth');
  }
  return Object.freeze({
    status: value.status,
    confirmations,
    observedAtHeight,
    observationDigestHex,
    confirmationHeight: null,
    confirmationHeaderIdHex: null,
  });
}

export async function executeDevnetRewardConsolidation(
  input: Readonly<{
    plan: DevnetRewardConsolidationPlan;
    expectedTxId: string;
  }>,
  ports: DevnetRewardConsolidationExecutionPorts,
): Promise<DevnetRewardConsolidationExecutionResult> {
  const expectedTxId = exactDigest(
    input.expectedTxId,
    'reward consolidation expected transaction ID',
  );
  const admission = Object.freeze({ plan: input.plan, expectedTxId });
  ADMISSIONS.add(admission);

  const signedEvidence = await ports.signer.sign(admission);
  if (signedEvidence === null) {
    return Object.freeze({
      status: 'signing_rejected',
      expectedTxId,
      transportAttempted: false,
    });
  }
  const signed = Object.freeze({
    admission,
    signedTransactionDigestHex: exactDigest(
      signedEvidence.signedTransactionDigestHex,
      'reward consolidation signed transaction digest',
    ),
    signerArtifact: opaqueArtifact(
      signedEvidence.signerArtifact,
      'reward consolidation signer artifact',
    ),
  });
  SIGNED.add(signed);

  const checkEvidence = await ports.checker.check(signed);
  if (checkEvidence === null) {
    return Object.freeze({
      status: 'check_rejected',
      expectedTxId,
      transportAttempted: false,
    });
  }
  const checked = Object.freeze({
    signed,
    checkResponseDigestHex: exactDigest(
      checkEvidence.checkResponseDigestHex,
      'reward consolidation check response digest',
    ),
    checkerArtifact: opaqueArtifact(
      checkEvidence.checkerArtifact,
      'reward consolidation checker artifact',
    ),
  });
  CHECKED.add(checked);

  const postCheckEvidence = normalizeRevalidation(
    input.plan,
    await ports.revalidator.revalidate(checked, 'post-check'),
  );
  const revalidated = Object.freeze({ checked, evidence: postCheckEvidence });
  REVALIDATED.add(revalidated);

  const preTransportEvidence = normalizeRevalidation(
    input.plan,
    await ports.revalidator.revalidate(checked, 'pre-transport'),
  );
  if (preTransportEvidence.observedAtHeight < postCheckEvidence.observedAtHeight) {
    throw new Error('reward consolidation pre-transport height moved backwards');
  }
  const authorizationEvidence = ports.broadcastAuthorizer.authorize(
    revalidated,
    preTransportEvidence,
  );
  const authorization = Object.freeze({
    revalidated,
    preTransportEvidence,
    authorizationDigestHex: exactDigest(
      authorizationEvidence.authorizationDigestHex,
      'reward consolidation authorization digest',
    ),
    authorizationArtifact: opaqueArtifact(
      authorizationEvidence.authorizationArtifact,
      'reward consolidation authorization artifact',
    ),
  });
  AUTHORIZATIONS.add(authorization);

  const transportCandidate = Object.freeze({ authorization });
  TRANSPORT_CANDIDATES.add(transportCandidate);

  const durableEvidence = ports.journal.reserve(transportCandidate);
  const durableAttempt = Object.freeze({
    candidate: transportCandidate,
    durableAttemptDigestHex: exactDigest(
      durableEvidence.durableAttemptDigestHex,
      'reward consolidation durable attempt digest',
    ),
    durableArtifact: opaqueArtifact(
      durableEvidence.durableArtifact,
      'reward consolidation durable artifact',
    ),
  });
  DURABLE_ATTEMPTS.add(durableAttempt);

  let rawSubmission: DevnetRewardConsolidationSubmission | null;
  try {
    rawSubmission = await ports.transport.submit(durableAttempt);
  } catch {
    rawSubmission = null;
  }
  assertDurableAttempt(durableAttempt);
  const submission: DevnetRewardConsolidationSubmission =
    rawSubmission?.status === 'accepted'
      ? Object.freeze({
          status: 'accepted',
          submittedTxId: exactDigest(
            rawSubmission.submittedTxId,
            'reward consolidation submitted transaction ID',
          ),
          responseDigestHex: exactDigest(
            rawSubmission.responseDigestHex,
            'reward consolidation submission response digest',
          ),
        })
      : Object.freeze({
          status: 'ambiguous',
          submittedTxId: null,
          responseDigestHex: rawSubmission?.responseDigestHex === null
            || rawSubmission?.responseDigestHex === undefined
            ? null
            : exactDigest(
                rawSubmission.responseDigestHex,
                'reward consolidation ambiguous response digest',
              ),
        });
  if (
    submission.status === 'accepted'
    && submission.submittedTxId !== expectedTxId
  ) {
    throw new Error('reward consolidation transport returned another transaction ID');
  }
  const finalization = ports.journal.finalize({
    attempt: durableAttempt,
    submission,
  });
  if (finalization.status !== submission.status) {
    throw new Error('reward consolidation journal changed the submission status');
  }
  const journalDigestHex = exactDigest(
    finalization.journalDigestHex,
    'reward consolidation journal digest',
  );

  let rawConfirmation: Awaited<
    ReturnType<DevnetRewardConsolidationExecutionPorts['confirmationObserver']['observe']>
  > = null;
  try {
    rawConfirmation = await ports.confirmationObserver.observe(
      expectedTxId,
      input.plan.nodeOrigin,
    );
  } catch {
    rawConfirmation = null;
  }
  const confirmation = rawConfirmation === null
    ? null
    : normalizeConfirmation(rawConfirmation);
  if (confirmation?.status === 'confirmed') {
    assertDurableAttempt(durableAttempt);
    ports.journal.confirm({
      attempt: durableAttempt,
      confirmation,
    });
  }
  return Object.freeze({
    status: submission.status === 'ambiguous'
      && confirmation?.status === 'confirmed'
      ? 'reconciled'
      : submission.status,
    expectedTxId,
    submittedTxId: confirmation?.status === 'confirmed'
      ? expectedTxId
      : submission.submittedTxId,
    confirmationStatus: confirmation?.status ?? 'unavailable',
    confirmationDigestHex: confirmation === null
      ? null
      : confirmation.observationDigestHex,
    transportAttempted: true,
    durableAttemptRecorded: true,
    durableAttemptDigestHex: durableAttempt.durableAttemptDigestHex,
    journalDigestHex,
  });
}
