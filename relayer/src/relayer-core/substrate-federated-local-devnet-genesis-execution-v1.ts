import { sha256CanonicalJson } from '../ergo-settlement-core/strict-json.js';

export const SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA =
  'e2s.substrate-federated-local-devnet-genesis-execution.v1' as const;
export const SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN =
  'http://127.0.0.1:9051' as const;
export const SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS = 10;

const ADMISSION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_ADMISSION_V1';

export type SubstrateFederatedLocalDevnetGenesisRole =
  | 'tracker'
  | 'duplicatePrevention'
  | 'pooledReserve';

export interface SubstrateFederatedLocalDevnetGenesisExecutionInput {
  readonly role: SubstrateFederatedLocalDevnetGenesisRole;
  readonly planDigestHex: string;
  readonly targetGenesisHeaderIdHex: string;
  readonly expectedTxId: string;
  readonly sourceBoxId: string;
  readonly attemptedAtHeight: number;
  readonly nodeOrigin:
    typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN;
  readonly unsignedTransaction: unknown;
}

export interface SubstrateFederatedLocalDevnetGenesisAdmission {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA;
  readonly role: SubstrateFederatedLocalDevnetGenesisRole;
  readonly planDigestHex: string;
  readonly targetGenesisHeaderIdHex: string;
  readonly expectedTxId: string;
  readonly sourceBoxId: string;
  readonly attemptedAtHeight: number;
  readonly nodeOrigin:
    typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN;
  readonly admissionDigestHex: string;
  readonly unsignedTransaction: unknown;
}

export interface SubstrateFederatedLocalDevnetGenesisSignedCandidate {
  readonly admission: SubstrateFederatedLocalDevnetGenesisAdmission;
  readonly signedTransactionDigestHex: string;
  readonly signerArtifact: object;
}

export interface SubstrateFederatedLocalDevnetGenesisCheckedCandidate {
  readonly signed: SubstrateFederatedLocalDevnetGenesisSignedCandidate;
  readonly checkResponseDigestHex: string;
  readonly checkerArtifact: object;
}

export type SubstrateFederatedLocalDevnetGenesisRevalidationPhase =
  | 'post-check'
  | 'pre-transport';

export interface SubstrateFederatedLocalDevnetGenesisRevalidation {
  readonly sourceBoxId: string;
  readonly sourceBoxUnspent: true;
  readonly targetGenesisHeaderIdHex: string;
  readonly observedAtHeight: number;
  readonly observationDigestHex: string;
}

export interface SubstrateFederatedLocalDevnetGenesisRevalidatedCandidate {
  readonly checked: SubstrateFederatedLocalDevnetGenesisCheckedCandidate;
  readonly postCheckEvidence:
    SubstrateFederatedLocalDevnetGenesisRevalidation;
}

export interface SubstrateFederatedLocalDevnetGenesisAuthorization {
  readonly revalidated:
    SubstrateFederatedLocalDevnetGenesisRevalidatedCandidate;
  readonly preTransportEvidence:
    SubstrateFederatedLocalDevnetGenesisRevalidation;
  readonly authorizationDigestHex: string;
  readonly authorizationArtifact: object;
}

export interface SubstrateFederatedLocalDevnetGenesisTransportCandidate {
  readonly authorization: SubstrateFederatedLocalDevnetGenesisAuthorization;
}

export interface SubstrateFederatedLocalDevnetGenesisDurableAttempt {
  readonly candidate:
    SubstrateFederatedLocalDevnetGenesisTransportCandidate;
  readonly durableAttemptDigestHex: string;
  readonly durableArtifact: object;
}

export type SubstrateFederatedLocalDevnetGenesisSubmission =
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

export type SubstrateFederatedLocalDevnetGenesisConfirmationStatus =
  | 'confirmed'
  | 'pending'
  | 'not_found'
  | 'unavailable';

export interface SubstrateFederatedLocalDevnetGenesisConfirmation {
  readonly status: Exclude<
    SubstrateFederatedLocalDevnetGenesisConfirmationStatus,
    'unavailable'
  >;
  readonly confirmations: number;
  readonly observedAtHeight: number;
  readonly observationDigestHex: string;
  readonly confirmationHeight: number | null;
  readonly confirmationHeaderIdHex: string | null;
}

export interface SubstrateFederatedLocalDevnetGenesisExecutionPorts {
  readonly signer: Readonly<{
    sign(
      admission: SubstrateFederatedLocalDevnetGenesisAdmission,
    ): Promise<Readonly<{
      signedTransactionDigestHex: string;
      signerArtifact: object;
    }> | null>;
  }>;
  readonly checker: Readonly<{
    check(
      signed: SubstrateFederatedLocalDevnetGenesisSignedCandidate,
    ): Promise<Readonly<{
      checkResponseDigestHex: string;
      checkerArtifact: object;
    }> | null>;
  }>;
  readonly revalidator: Readonly<{
    revalidate(
      checked: SubstrateFederatedLocalDevnetGenesisCheckedCandidate,
      phase: SubstrateFederatedLocalDevnetGenesisRevalidationPhase,
    ): Promise<SubstrateFederatedLocalDevnetGenesisRevalidation>;
  }>;
  readonly broadcastAuthorizer: Readonly<{
    authorize(
      revalidated:
        SubstrateFederatedLocalDevnetGenesisRevalidatedCandidate,
      preTransportEvidence:
        SubstrateFederatedLocalDevnetGenesisRevalidation,
    ): Readonly<{
      authorizationDigestHex: string;
      authorizationArtifact: object;
    }>;
  }>;
  readonly journal: Readonly<{
    reserve(
      candidate: SubstrateFederatedLocalDevnetGenesisTransportCandidate,
    ): Readonly<{
      durableAttemptDigestHex: string;
      durableArtifact: object;
    }>;
    finalize(input: Readonly<{
      attempt: SubstrateFederatedLocalDevnetGenesisDurableAttempt;
      submission: SubstrateFederatedLocalDevnetGenesisSubmission;
    }>): Readonly<{
      status: SubstrateFederatedLocalDevnetGenesisSubmission['status'];
      journalDigestHex: string;
    }>;
    confirm(input: Readonly<{
      attempt: SubstrateFederatedLocalDevnetGenesisDurableAttempt;
      confirmation: SubstrateFederatedLocalDevnetGenesisConfirmation;
    }>): void;
  }>;
  readonly transport: Readonly<{
    submit(
      attempt: SubstrateFederatedLocalDevnetGenesisDurableAttempt,
    ): Promise<SubstrateFederatedLocalDevnetGenesisSubmission | null>;
  }>;
  readonly confirmationObserver: Readonly<{
    observe(
      expectedTxId: string,
      nodeOrigin:
        typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    ): Promise<SubstrateFederatedLocalDevnetGenesisConfirmation | null>;
  }>;
}

export type SubstrateFederatedLocalDevnetGenesisExecutionResult =
  | Readonly<{
      status: 'signing_rejected' | 'check_rejected';
      role: SubstrateFederatedLocalDevnetGenesisRole;
      expectedTxId: string;
      transportAttempted: false;
    }>
  | Readonly<{
      status: 'accepted' | 'ambiguous' | 'reconciled';
      role: SubstrateFederatedLocalDevnetGenesisRole;
      expectedTxId: string;
      submittedTxId: string | null;
      confirmationStatus:
        SubstrateFederatedLocalDevnetGenesisConfirmationStatus;
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

export function admitSubstrateFederatedLocalDevnetGenesisExecutionV1(
  input: SubstrateFederatedLocalDevnetGenesisExecutionInput,
): SubstrateFederatedLocalDevnetGenesisAdmission {
  const role = normalizeRole(input.role);
  const planDigestHex = fixedHex32(input.planDigestHex, 'genesis plan digest');
  const targetGenesisHeaderIdHex = fixedHex32(
    input.targetGenesisHeaderIdHex,
    'genesis target header ID',
  );
  const expectedTxId = fixedHex32(input.expectedTxId, 'genesis expected transaction ID');
  const sourceBoxId = fixedHex32(input.sourceBoxId, 'genesis source box ID');
  const attemptedAtHeight = nonNegativeHeight(
    input.attemptedAtHeight,
    'genesis attempted height',
  );
  const nodeOrigin = normalizePrimaryOrigin(input.nodeOrigin);
  const admissionDigestHex = sha256CanonicalJson({
    schema: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA,
    role,
    planDigestHex,
    targetGenesisHeaderIdHex,
    expectedTxId,
    sourceBoxId,
    attemptedAtHeight,
    nodeOrigin,
  }, ADMISSION_DIGEST_DOMAIN);
  const admission = Object.freeze({
    schema: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA,
    role,
    planDigestHex,
    targetGenesisHeaderIdHex,
    expectedTxId,
    sourceBoxId,
    attemptedAtHeight,
    nodeOrigin,
    admissionDigestHex,
    unsignedTransaction: input.unsignedTransaction,
  });
  ADMISSIONS.add(admission);
  return admission;
}

export async function executeSubstrateFederatedLocalDevnetGenesisV1(
  input: SubstrateFederatedLocalDevnetGenesisExecutionInput,
  ports: SubstrateFederatedLocalDevnetGenesisExecutionPorts,
): Promise<SubstrateFederatedLocalDevnetGenesisExecutionResult> {
  const admission = admitSubstrateFederatedLocalDevnetGenesisExecutionV1(input);
  const signedEvidence = await ports.signer.sign(admission);
  if (signedEvidence === null) {
    return Object.freeze({
      status: 'signing_rejected' as const,
      role: admission.role,
      expectedTxId: admission.expectedTxId,
      transportAttempted: false as const,
    });
  }
  assertAdmission(admission);
  const signed = Object.freeze({
    admission,
    signedTransactionDigestHex: fixedHex32(
      signedEvidence.signedTransactionDigestHex,
      'genesis signed transaction digest',
    ),
    signerArtifact: opaqueArtifact(
      signedEvidence.signerArtifact,
      'genesis signer artifact',
    ),
  });
  SIGNED.add(signed);

  const checkedEvidence = await ports.checker.check(signed);
  if (checkedEvidence === null) {
    return Object.freeze({
      status: 'check_rejected' as const,
      role: admission.role,
      expectedTxId: admission.expectedTxId,
      transportAttempted: false as const,
    });
  }
  assertSigned(signed);
  const checked = Object.freeze({
    signed,
    checkResponseDigestHex: fixedHex32(
      checkedEvidence.checkResponseDigestHex,
      'genesis check response digest',
    ),
    checkerArtifact: opaqueArtifact(
      checkedEvidence.checkerArtifact,
      'genesis checker artifact',
    ),
  });
  CHECKED.add(checked);

  const postCheckEvidence = normalizeRevalidation(
    admission,
    await ports.revalidator.revalidate(checked, 'post-check'),
  );
  const revalidated = Object.freeze({ checked, postCheckEvidence });
  REVALIDATED.add(revalidated);

  const preTransportEvidence = normalizeRevalidation(
    admission,
    await ports.revalidator.revalidate(checked, 'pre-transport'),
  );
  if (preTransportEvidence.observedAtHeight < postCheckEvidence.observedAtHeight) {
    throw new Error('genesis pre-transport observation height moved backwards');
  }
  assertRevalidated(revalidated);
  const authorizationEvidence = ports.broadcastAuthorizer.authorize(
    revalidated,
    preTransportEvidence,
  );
  const authorization = Object.freeze({
    revalidated,
    preTransportEvidence,
    authorizationDigestHex: fixedHex32(
      authorizationEvidence.authorizationDigestHex,
      'genesis broadcast authorization digest',
    ),
    authorizationArtifact: opaqueArtifact(
      authorizationEvidence.authorizationArtifact,
      'genesis broadcast authorization artifact',
    ),
  });
  AUTHORIZATIONS.add(authorization);

  const transportCandidate = Object.freeze({ authorization });
  TRANSPORT_CANDIDATES.add(transportCandidate);
  assertTransportCandidate(transportCandidate);
  const durableEvidence = ports.journal.reserve(transportCandidate);
  const durableAttempt = Object.freeze({
    candidate: transportCandidate,
    durableAttemptDigestHex: fixedHex32(
      durableEvidence.durableAttemptDigestHex,
      'genesis durable attempt digest',
    ),
    durableArtifact: opaqueArtifact(
      durableEvidence.durableArtifact,
      'genesis durable attempt artifact',
    ),
  });
  DURABLE_ATTEMPTS.add(durableAttempt);

  let rawSubmission: SubstrateFederatedLocalDevnetGenesisSubmission | null;
  try {
    rawSubmission = await ports.transport.submit(durableAttempt);
  } catch {
    rawSubmission = null;
  }
  assertDurableAttempt(durableAttempt);
  const submission = normalizeSubmission(admission, rawSubmission);
  const finalization = ports.journal.finalize({
    attempt: durableAttempt,
    submission,
  });
  if (finalization.status !== submission.status) {
    throw new Error('genesis journal changed the submission status');
  }
  const journalDigestHex = fixedHex32(
    finalization.journalDigestHex,
    'genesis journal digest',
  );

  let rawConfirmation: SubstrateFederatedLocalDevnetGenesisConfirmation | null;
  try {
    rawConfirmation = await ports.confirmationObserver.observe(
      admission.expectedTxId,
      admission.nodeOrigin,
    );
  } catch {
    rawConfirmation = null;
  }
  const confirmation = rawConfirmation === null
    ? null
    : normalizeConfirmation(rawConfirmation);
  if (confirmation?.status === 'confirmed') {
    assertDurableAttempt(durableAttempt);
    ports.journal.confirm({ attempt: durableAttempt, confirmation });
  }

  return Object.freeze({
    status: submission.status === 'ambiguous'
      && confirmation?.status === 'confirmed'
      ? 'reconciled' as const
      : submission.status,
    role: admission.role,
    expectedTxId: admission.expectedTxId,
    submittedTxId: confirmation?.status === 'confirmed'
      ? admission.expectedTxId
      : submission.submittedTxId,
    confirmationStatus: confirmation?.status ?? 'unavailable',
    confirmationDigestHex: confirmation?.observationDigestHex ?? null,
    transportAttempted: true as const,
    durableAttemptRecorded: true as const,
    durableAttemptDigestHex: durableAttempt.durableAttemptDigestHex,
    journalDigestHex,
  });
}

function normalizeRole(
  value: unknown,
): SubstrateFederatedLocalDevnetGenesisRole {
  if (
    value !== 'tracker'
    && value !== 'duplicatePrevention'
    && value !== 'pooledReserve'
  ) {
    throw new Error('unknown federated local devnet genesis role');
  }
  return value;
}

function normalizePrimaryOrigin(
  value: unknown,
): typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN {
  if (value !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN) {
    throw new Error('genesis execution requires the exact loopback primary node origin');
  }
  return value;
}

function fixedHex32(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be 32-byte hex`);
  const normalized = value.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return normalized;
}

function nonNegativeHeight(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function opaqueArtifact(value: unknown, label: string): object {
  if (value === null || typeof value !== 'object') {
    throw new Error(`${label} must be an opaque object`);
  }
  return value;
}

function normalizeRevalidation(
  admission: SubstrateFederatedLocalDevnetGenesisAdmission,
  value: SubstrateFederatedLocalDevnetGenesisRevalidation,
): SubstrateFederatedLocalDevnetGenesisRevalidation {
  const sourceBoxId = fixedHex32(value.sourceBoxId, 'genesis revalidated source box ID');
  const targetGenesisHeaderIdHex = fixedHex32(
    value.targetGenesisHeaderIdHex,
    'genesis revalidated target header ID',
  );
  if (
    sourceBoxId !== admission.sourceBoxId
    || targetGenesisHeaderIdHex !== admission.targetGenesisHeaderIdHex
    || value.sourceBoxUnspent !== true
  ) {
    throw new Error('genesis revalidation changed the admitted source or target');
  }
  return Object.freeze({
    sourceBoxId,
    sourceBoxUnspent: true as const,
    targetGenesisHeaderIdHex,
    observedAtHeight: nonNegativeHeight(
      value.observedAtHeight,
      'genesis revalidation height',
    ),
    observationDigestHex: fixedHex32(
      value.observationDigestHex,
      'genesis revalidation digest',
    ),
  });
}

function normalizeSubmission(
  admission: SubstrateFederatedLocalDevnetGenesisAdmission,
  value: SubstrateFederatedLocalDevnetGenesisSubmission | null,
): SubstrateFederatedLocalDevnetGenesisSubmission {
  if (value === null) {
    return Object.freeze({
      status: 'ambiguous' as const,
      submittedTxId: null,
      responseDigestHex: null,
    });
  }
  if (value.status === 'accepted') {
    const submittedTxId = fixedHex32(
      value.submittedTxId,
      'genesis submitted transaction ID',
    );
    if (submittedTxId !== admission.expectedTxId) {
      throw new Error('genesis transport returned another transaction ID');
    }
    return Object.freeze({
      status: 'accepted' as const,
      submittedTxId,
      responseDigestHex: fixedHex32(
        value.responseDigestHex,
        'genesis submission response digest',
      ),
    });
  }
  if (value.status !== 'ambiguous' || value.submittedTxId !== null) {
    throw new Error('genesis transport returned an invalid ambiguous outcome');
  }
  return Object.freeze({
    status: 'ambiguous' as const,
    submittedTxId: null,
    responseDigestHex: value.responseDigestHex === null
      ? null
      : fixedHex32(
          value.responseDigestHex,
          'genesis ambiguous response digest',
        ),
  });
}

function normalizeConfirmation(
  value: SubstrateFederatedLocalDevnetGenesisConfirmation,
): SubstrateFederatedLocalDevnetGenesisConfirmation {
  if (!['confirmed', 'pending', 'not_found'].includes(value.status)) {
    throw new Error('genesis confirmation status is unsupported');
  }
  const confirmations = nonNegativeHeight(
    value.confirmations,
    'genesis confirmation count',
  );
  const observedAtHeight = nonNegativeHeight(
    value.observedAtHeight,
    'genesis confirmation observation height',
  );
  const observationDigestHex = fixedHex32(
    value.observationDigestHex,
    'genesis confirmation observation digest',
  );
  if (value.status === 'confirmed') {
    const confirmationHeight = nonNegativeHeight(
      value.confirmationHeight,
      'genesis confirmation height',
    );
    const confirmationHeaderIdHex = fixedHex32(
      value.confirmationHeaderIdHex,
      'genesis confirmation header ID',
    );
    if (
      confirmationHeight === 0
      || confirmations < SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS
      || observedAtHeight - confirmationHeight + 1 !== confirmations
    ) {
      throw new Error('genesis confirmation lacks consistent final depth');
    }
    return Object.freeze({
      status: 'confirmed' as const,
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
    || (value.status === 'not_found' && confirmations !== 0)
    || (
      value.status === 'pending'
      && confirmations >= SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS
    )
  ) {
    throw new Error('genesis non-final confirmation is inconsistent');
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

function assertAdmission(
  value: SubstrateFederatedLocalDevnetGenesisAdmission,
): void {
  if (!ADMISSIONS.has(value)) {
    throw new Error('genesis admission lacks process provenance');
  }
}

function assertSigned(
  value: SubstrateFederatedLocalDevnetGenesisSignedCandidate,
): void {
  assertAdmission(value.admission);
  if (!SIGNED.has(value)) {
    throw new Error('genesis signed candidate lacks process provenance');
  }
}

function assertChecked(
  value: SubstrateFederatedLocalDevnetGenesisCheckedCandidate,
): void {
  assertSigned(value.signed);
  if (!CHECKED.has(value)) {
    throw new Error('genesis checked candidate lacks process provenance');
  }
}

function assertRevalidated(
  value: SubstrateFederatedLocalDevnetGenesisRevalidatedCandidate,
): void {
  assertChecked(value.checked);
  if (!REVALIDATED.has(value)) {
    throw new Error('genesis revalidated candidate lacks process provenance');
  }
}

function assertAuthorization(
  value: SubstrateFederatedLocalDevnetGenesisAuthorization,
): void {
  assertRevalidated(value.revalidated);
  if (!AUTHORIZATIONS.has(value)) {
    throw new Error('genesis broadcast authorization lacks process provenance');
  }
}

function assertTransportCandidate(
  value: SubstrateFederatedLocalDevnetGenesisTransportCandidate,
): void {
  assertAuthorization(value.authorization);
  if (!TRANSPORT_CANDIDATES.has(value)) {
    throw new Error('genesis transport candidate lacks process provenance');
  }
}

function assertDurableAttempt(
  value: SubstrateFederatedLocalDevnetGenesisDurableAttempt,
): void {
  assertTransportCandidate(value.candidate);
  if (!DURABLE_ATTEMPTS.has(value)) {
    throw new Error('genesis durable attempt lacks process provenance');
  }
}
