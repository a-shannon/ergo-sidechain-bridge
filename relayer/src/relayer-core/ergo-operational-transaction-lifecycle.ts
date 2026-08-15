import { sha256CanonicalJson } from '../ergo-settlement-core/strict-json.js';

export const ERGO_OPERATIONAL_TRANSACTION_SCHEMA =
  'e2s.ergo-operational-transaction.v1' as const;
export const PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE =
  'e2s.peg-in-committed-vault-operation.v1' as const;
export const SCS_ORACLE_UPDATE_OPERATION_PROFILE =
  'e2s.scs-oracle-update-operation.v1' as const;
export const DUP_HEARTBEAT_OPERATION_PROFILE =
  'e2s.dup-heartbeat-operation.v1' as const;
export const DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE =
  'e2s.devnet-reward-consolidation-operation.v1' as const;
export const SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE =
  'e2s.substrate-federated-local-devnet-genesis-operation.v1' as const;

const OPERATION_BINDING_DIGEST_DOMAIN =
  'E2S_ERGO_OPERATIONAL_TRANSACTION_BINDING_V1';

export type ErgoOperationalTransactionProfile =
  | typeof PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE
  | typeof SCS_ORACLE_UPDATE_OPERATION_PROFILE
  | typeof DUP_HEARTBEAT_OPERATION_PROFILE
  | typeof DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE
  | typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE;

export interface ErgoOperationalTransactionInput {
  readonly operationProfile: ErgoOperationalTransactionProfile;
  readonly expectedTxId: string;
  readonly sourceBoxId: string;
  readonly inputBoxIds: readonly string[];
  readonly attemptedAtHeight: number;
  readonly targetSidechainHeight?: number | null;
  readonly targetSidechainBlockHashHex?: string | null;
  readonly heartbeatKeyHex?: string | null;
  readonly unsignedTransaction: unknown;
}

export interface ErgoOperationalTransactionAdmission {
  readonly schema: typeof ERGO_OPERATIONAL_TRANSACTION_SCHEMA;
  readonly operationProfile: ErgoOperationalTransactionProfile;
  readonly expectedTxId: string;
  readonly sourceBoxId: string;
  readonly inputBoxIds: readonly string[];
  readonly attemptedAtHeight: number;
  readonly targetSidechainHeight: number | null;
  readonly targetSidechainBlockHashHex: string | null;
  readonly heartbeatKeyHex: string | null;
  readonly bindingDigestHex: string;
  readonly unsignedTransaction: unknown;
}

export interface ErgoOperationalSignedCandidate {
  readonly admission: ErgoOperationalTransactionAdmission;
  readonly nodeOrigin: string;
  readonly signedTransactionDigestHex: string;
  readonly signerArtifact: object;
}

export interface ErgoOperationalCheckedCandidate {
  readonly signed: ErgoOperationalSignedCandidate;
  readonly checkResponseDigestHex: string;
  readonly checkerArtifact: object;
}

export interface ErgoOperationalRevalidatedCandidate {
  readonly checked: ErgoOperationalCheckedCandidate;
  readonly revalidationDigestHex: string;
}

export interface ErgoOperationalBroadcastAuthorization {
  readonly revalidated: ErgoOperationalRevalidatedCandidate;
  readonly authorizationDigestHex: string;
  readonly authorizationArtifact: object;
}

export interface ErgoOperationalDurableAttempt {
  readonly authorization: ErgoOperationalBroadcastAuthorization;
  readonly durableAttemptDigestHex: string;
  readonly durableArtifact: object;
}

export type ErgoOperationalSubmission =
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

export interface ErgoOperationalFinalization {
  readonly attempt: ErgoOperationalDurableAttempt;
  readonly submission: ErgoOperationalSubmission;
  readonly journalDigestHex: string;
}

export type ErgoOperationalExecutionResult =
  | Readonly<{
      status: 'signing_rejected' | 'check_rejected';
      expectedTxId: string;
      durableAttemptRecorded: false;
    }>
  | Readonly<{
      status: 'accepted';
      expectedTxId: string;
      submittedTxId: string;
      durableAttemptRecorded: true;
      durableAttemptDigestHex: string;
      journalDigestHex: string;
    }>
  | Readonly<{
      status: 'ambiguous';
      expectedTxId: string;
      submittedTxId: null;
      durableAttemptRecorded: true;
      durableAttemptDigestHex: string;
      journalDigestHex: string;
    }>;

export interface ErgoOperationalTransactionExecutionPorts {
  readonly signer: Readonly<{
    sign(
      admission: ErgoOperationalTransactionAdmission,
    ): Promise<Readonly<{
      nodeOrigin: string;
      signedTransactionDigestHex: string;
      signerArtifact: object;
    }> | null>;
  }>;
  readonly checker: Readonly<{
    check(
      signed: ErgoOperationalSignedCandidate,
    ): Promise<Readonly<{
      checkResponseDigestHex: string;
      checkerArtifact: object;
    }> | null>;
  }>;
  readonly revalidator: Readonly<{
    revalidate(
      checked: ErgoOperationalCheckedCandidate,
    ): Promise<Readonly<{
      revalidationDigestHex: string;
    }>>;
  }>;
  readonly broadcastAuthorizer: Readonly<{
    authorize(
      revalidated: ErgoOperationalRevalidatedCandidate,
    ): Readonly<{
      authorizationDigestHex: string;
      authorizationArtifact: object;
    }>;
  }>;
  readonly journal: Readonly<{
    reserve(
      authorization: ErgoOperationalBroadcastAuthorization,
    ): Readonly<{
      durableAttemptDigestHex: string;
      durableArtifact: object;
    }>;
    finalize(input: Readonly<{
      attempt: ErgoOperationalDurableAttempt;
      submission: ErgoOperationalSubmission;
    }>): Readonly<{
      status: ErgoOperationalSubmission['status'];
      journalDigestHex: string;
    }>;
  }>;
  readonly submitter: Readonly<{
    submit(
      attempt: ErgoOperationalDurableAttempt,
    ): Promise<ErgoOperationalSubmission | null>;
  }>;
}

const ADMISSIONS = new WeakSet<object>();
const SIGNED_CANDIDATES = new WeakSet<object>();
const CHECKED_CANDIDATES = new WeakSet<object>();
const REVALIDATED_CANDIDATES = new WeakSet<object>();
const BROADCAST_AUTHORIZATIONS = new WeakSet<object>();
const DURABLE_ATTEMPTS = new WeakSet<object>();

function normalizeHex32(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be canonical 32-byte hex`);
  }
  const normalized = value.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be canonical 32-byte hex`);
  }
  return normalized;
}

function normalizeHeight(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function normalizeNodeOrigin(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('operational signer node origin must be a credential-free HTTP(S) origin');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('operational signer node origin must be a credential-free HTTP(S) origin');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('operational signer node origin must be a credential-free HTTP(S) origin');
  }
  return parsed.origin.toLowerCase();
}

function normalizeArtifact(value: unknown, label: string): object {
  if (value === null || typeof value !== 'object') {
    throw new Error(`${label} must be an opaque object`);
  }
  return value;
}

function normalizeInputBoxIds(
  values: readonly string[],
  sourceBoxId: string,
): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('operational transaction must bind at least one input box');
  }
  const normalized = values.map((value, index) =>
    normalizeHex32(value, `operational inputBoxIds[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('operational transaction input box IDs must be unique');
  }
  if (normalized[0] !== sourceBoxId) {
    throw new Error('operational transaction source box must be its first input');
  }
  return Object.freeze(normalized);
}

function normalizeOperationContext(input: ErgoOperationalTransactionInput): {
  targetSidechainHeight: number | null;
  targetSidechainBlockHashHex: string | null;
  heartbeatKeyHex: string | null;
} {
  if (input.operationProfile === PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE) {
    if (
      input.targetSidechainHeight != null
      || input.targetSidechainBlockHashHex != null
      || input.heartbeatKeyHex != null
    ) {
      throw new Error('committed-vault operation forbids SCS and heartbeat context');
    }
    return {
      targetSidechainHeight: null,
      targetSidechainBlockHashHex: null,
      heartbeatKeyHex: null,
    };
  }
  if (input.operationProfile === SCS_ORACLE_UPDATE_OPERATION_PROFILE) {
    if (input.heartbeatKeyHex != null) {
      throw new Error('SCS oracle operation forbids heartbeat context');
    }
    return {
      targetSidechainHeight: normalizeHeight(
        input.targetSidechainHeight,
        'SCS target sidechain height',
      ),
      targetSidechainBlockHashHex: normalizeHex32(
        input.targetSidechainBlockHashHex,
        'SCS target sidechain block hash',
      ),
      heartbeatKeyHex: null,
    };
  }
  if (input.operationProfile === DUP_HEARTBEAT_OPERATION_PROFILE) {
    if (
      input.targetSidechainHeight != null
      || input.targetSidechainBlockHashHex != null
    ) {
      throw new Error('DUP heartbeat operation forbids SCS context');
    }
    return {
      targetSidechainHeight: null,
      targetSidechainBlockHashHex: null,
      heartbeatKeyHex: normalizeHex32(
        input.heartbeatKeyHex,
        'DUP heartbeat key',
      ),
    };
  }
  if (
    input.operationProfile === DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE
    || input.operationProfile
      === SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE
  ) {
    if (
      input.targetSidechainHeight != null
      || input.targetSidechainBlockHashHex != null
      || input.heartbeatKeyHex != null
    ) {
      throw new Error('local devnet operational profile forbids sidechain and heartbeat context');
    }
    return {
      targetSidechainHeight: null,
      targetSidechainBlockHashHex: null,
      heartbeatKeyHex: null,
    };
  }
  throw new Error('unknown Ergo operational transaction profile');
}

export function admitErgoOperationalTransaction(
  input: ErgoOperationalTransactionInput,
): ErgoOperationalTransactionAdmission {
  const expectedTxId = normalizeHex32(input.expectedTxId, 'operational expectedTxId');
  const sourceBoxId = normalizeHex32(input.sourceBoxId, 'operational sourceBoxId');
  const inputBoxIds = normalizeInputBoxIds(input.inputBoxIds, sourceBoxId);
  const attemptedAtHeight = normalizeHeight(
    input.attemptedAtHeight,
    'operational attempted height',
  );
  const context = normalizeOperationContext(input);
  const bindingDigestHex = sha256CanonicalJson({
    domain: OPERATION_BINDING_DIGEST_DOMAIN,
    schema: ERGO_OPERATIONAL_TRANSACTION_SCHEMA,
    operationProfile: input.operationProfile,
    expectedTxId,
    sourceBoxId,
    inputBoxIds,
    attemptedAtHeight,
    targetSidechainHeight: context.targetSidechainHeight,
    targetSidechainBlockHashHex: context.targetSidechainBlockHashHex,
    heartbeatKeyHex: context.heartbeatKeyHex,
  });
  const admission = Object.freeze({
    schema: ERGO_OPERATIONAL_TRANSACTION_SCHEMA,
    operationProfile: input.operationProfile,
    expectedTxId,
    sourceBoxId,
    inputBoxIds,
    attemptedAtHeight,
    targetSidechainHeight: context.targetSidechainHeight,
    targetSidechainBlockHashHex: context.targetSidechainBlockHashHex,
    heartbeatKeyHex: context.heartbeatKeyHex,
    bindingDigestHex,
    unsignedTransaction: input.unsignedTransaction,
  });
  ADMISSIONS.add(admission);
  return admission;
}

function assertAdmission(
  admission: ErgoOperationalTransactionAdmission,
): void {
  if (!ADMISSIONS.has(admission)) {
    throw new Error('operational transaction admission lacks process provenance');
  }
}

function assertSigned(candidate: ErgoOperationalSignedCandidate): void {
  assertAdmission(candidate.admission);
  if (!SIGNED_CANDIDATES.has(candidate)) {
    throw new Error('operational signed candidate lacks process provenance');
  }
}

function assertChecked(candidate: ErgoOperationalCheckedCandidate): void {
  assertSigned(candidate.signed);
  if (!CHECKED_CANDIDATES.has(candidate)) {
    throw new Error('operational checked candidate lacks process provenance');
  }
}

function assertRevalidated(candidate: ErgoOperationalRevalidatedCandidate): void {
  assertChecked(candidate.checked);
  if (!REVALIDATED_CANDIDATES.has(candidate)) {
    throw new Error('operational revalidation lacks process provenance');
  }
}

function assertAuthorization(
  authorization: ErgoOperationalBroadcastAuthorization,
): void {
  assertRevalidated(authorization.revalidated);
  if (!BROADCAST_AUTHORIZATIONS.has(authorization)) {
    throw new Error('operational broadcast authorization lacks process provenance');
  }
}

function assertAttempt(attempt: ErgoOperationalDurableAttempt): void {
  assertAuthorization(attempt.authorization);
  if (!DURABLE_ATTEMPTS.has(attempt)) {
    throw new Error('operational durable attempt lacks process provenance');
  }
}

function normalizeSubmission(
  admission: ErgoOperationalTransactionAdmission,
  value: ErgoOperationalSubmission | null,
): ErgoOperationalSubmission {
  if (value === null) {
    return Object.freeze({
      status: 'ambiguous',
      submittedTxId: null,
      responseDigestHex: null,
    });
  }
  if (value.status === 'accepted') {
    const submittedTxId = normalizeHex32(
      value.submittedTxId,
      'operational submitted transaction ID',
    );
    if (submittedTxId !== admission.expectedTxId) {
      throw new Error('operational submitter returned a transaction outside the admission');
    }
    return Object.freeze({
      status: 'accepted',
      submittedTxId,
      responseDigestHex: normalizeHex32(
        value.responseDigestHex,
        'operational response digest',
      ),
    });
  }
  if (
    value.status !== 'ambiguous'
    || value.submittedTxId !== null
    || (
      value.responseDigestHex !== null
      && normalizeHex32(
        value.responseDigestHex,
        'operational ambiguous response digest',
      ) !== value.responseDigestHex.toLowerCase()
    )
  ) {
    throw new Error('operational submitter returned an invalid ambiguous outcome');
  }
  return Object.freeze({
    status: 'ambiguous',
    submittedTxId: null,
    responseDigestHex: value.responseDigestHex?.toLowerCase() ?? null,
  });
}

export async function executeErgoOperationalTransaction(
  input: ErgoOperationalTransactionInput,
  ports: ErgoOperationalTransactionExecutionPorts,
): Promise<ErgoOperationalExecutionResult> {
  const admission = admitErgoOperationalTransaction(input);
  const signedEvidence = await ports.signer.sign(admission);
  if (signedEvidence === null) {
    return Object.freeze({
      status: 'signing_rejected',
      expectedTxId: admission.expectedTxId,
      durableAttemptRecorded: false,
    });
  }
  const signed = Object.freeze({
    admission,
    nodeOrigin: normalizeNodeOrigin(signedEvidence.nodeOrigin),
    signedTransactionDigestHex: normalizeHex32(
      signedEvidence.signedTransactionDigestHex,
      'operational signed transaction digest',
    ),
    signerArtifact: normalizeArtifact(
      signedEvidence.signerArtifact,
      'operational signer artifact',
    ),
  });
  SIGNED_CANDIDATES.add(signed);

  const checkEvidence = await ports.checker.check(signed);
  if (checkEvidence === null) {
    return Object.freeze({
      status: 'check_rejected',
      expectedTxId: admission.expectedTxId,
      durableAttemptRecorded: false,
    });
  }
  const checked = Object.freeze({
    signed,
    checkResponseDigestHex: normalizeHex32(
      checkEvidence.checkResponseDigestHex,
      'operational check response digest',
    ),
    checkerArtifact: normalizeArtifact(
      checkEvidence.checkerArtifact,
      'operational checker artifact',
    ),
  });
  CHECKED_CANDIDATES.add(checked);

  const revalidationEvidence = await ports.revalidator.revalidate(checked);
  const revalidated = Object.freeze({
    checked,
    revalidationDigestHex: normalizeHex32(
      revalidationEvidence.revalidationDigestHex,
      'operational revalidation digest',
    ),
  });
  REVALIDATED_CANDIDATES.add(revalidated);

  const authorizationEvidence =
    ports.broadcastAuthorizer.authorize(revalidated);
  const authorization = Object.freeze({
    revalidated,
    authorizationDigestHex: normalizeHex32(
      authorizationEvidence.authorizationDigestHex,
      'operational authorization digest',
    ),
    authorizationArtifact: normalizeArtifact(
      authorizationEvidence.authorizationArtifact,
      'operational authorization artifact',
    ),
  });
  BROADCAST_AUTHORIZATIONS.add(authorization);

  const durableEvidence = ports.journal.reserve(authorization);
  const attempt = Object.freeze({
    authorization,
    durableAttemptDigestHex: normalizeHex32(
      durableEvidence.durableAttemptDigestHex,
      'operational durable attempt digest',
    ),
    durableArtifact: normalizeArtifact(
      durableEvidence.durableArtifact,
      'operational durable artifact',
    ),
  });
  DURABLE_ATTEMPTS.add(attempt);

  let rawSubmission: ErgoOperationalSubmission | null;
  try {
    rawSubmission = await ports.submitter.submit(attempt);
  } catch {
    rawSubmission = null;
  }
  assertAttempt(attempt);
  const submission = normalizeSubmission(admission, rawSubmission);
  const finalization = ports.journal.finalize({ attempt, submission });
  if (finalization.status !== submission.status) {
    throw new Error('operational journal finalization changed the submission status');
  }
  const journalDigestHex = normalizeHex32(
    finalization.journalDigestHex,
    'operational journal digest',
  );

  if (submission.status === 'accepted') {
    return Object.freeze({
      status: 'accepted',
      expectedTxId: admission.expectedTxId,
      submittedTxId: submission.submittedTxId,
      durableAttemptRecorded: true,
      durableAttemptDigestHex: attempt.durableAttemptDigestHex,
      journalDigestHex,
    });
  }
  return Object.freeze({
    status: 'ambiguous',
    expectedTxId: admission.expectedTxId,
    submittedTxId: null,
    durableAttemptRecorded: true,
    durableAttemptDigestHex: attempt.durableAttemptDigestHex,
    journalDigestHex,
  });
}
