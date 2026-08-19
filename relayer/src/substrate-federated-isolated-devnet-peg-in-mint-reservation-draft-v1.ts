import {
  decodePegInSourceIntentV2Hex,
  derivePegInSourceIntentIdV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1,
  type SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1,
} from './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInCandidateV1,
} from './substrate-federated-isolated-devnet-peg-in-candidate-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintIdentityV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  type ValidityApplicationPooledReserveMintReservationStatementV4,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';
import {
  deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex,
} from './validity-application-pooled-reserve-instance-v4.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-mint-reservation-draft.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX =
  deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex({
    version: 1,
    requiredSuccessorDepth:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1,
    blockIdentityAndAncestryRequired: true,
    divergentRpcAction: 'hold',
    reorgAction: 'invalidate',
  });

const DRAFT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V1';
const DRAFTS = new WeakSet<object>();

export interface SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'canonical_statement_waiting_for_source_proof';
  readonly statement:
    Readonly<ValidityApplicationPooledReserveMintReservationStatementV4>;
  readonly statementHex: string;
  readonly statementIdHex: string;
  readonly reservationKeyHex: string;
  readonly provenance: Readonly<{
    readonly candidateDigestHex: string;
    readonly committedVaultObservationDigestHex: string;
    readonly familyCompilerBindingDigestHex: string;
    readonly exactSameProcessCandidateAndObservationBound: true;
  }>;
  readonly boundary: Readonly<{
    readonly exactCommittedReserveBound: true;
    readonly exactFinalityTargetBound: true;
    readonly canonicalV4StatementConstructed: true;
    readonly runtimeProfileBound: false;
    readonly canonicalSourceProofEvidenceCollected: false;
    readonly sourceProofRequestConstructed: false;
    readonly sourceAttestationEstablished: false;
    readonly runtimeReservationWritten: false;
    readonly mintExecuted: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly limitations: readonly string[];
  readonly draftDigestHex: string;
}

export function buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(
  input: Readonly<{
    readonly batch:
      Readonly<SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2>;
    readonly target:
      Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    readonly candidate:
      Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV1>;
    readonly committedVaultObservation:
      Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>;
  }>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1> {
  assertExactKeys(input, [
    'batch',
    'target',
    'candidate',
    'committedVaultObservation',
  ], 'isolated devnet mint-reservation draft input');
  const packet =
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1(
      input.committedVaultObservation,
      input.batch,
      input.candidate,
      input.target,
    );
  const lineageProfileIdHex = canonicalV4Hex(
    packet.familyIdHex,
    32,
    'federated family ID',
  );
  const sourceIntentHex = canonicalV4Hex(
    packet.sourceIntentHex,
    229,
    'source intent',
  );
  const sourceLockBoxIdHex = canonicalV4Hex(
    packet.boxes.sourceLock.boxId,
    32,
    'source-lock box ID',
  );
  const depositCommitmentHex = canonicalV4Hex(
    packet.depositCommitmentHex,
    32,
    'deposit commitment',
  );
  const sourceIntent = decodePegInSourceIntentV2Hex(sourceIntentHex);
  const mintIdentityHex =
    deriveValidityApplicationPooledReserveMintIdentityV4Hex({
      lineageProfileIdHex,
      sourceLockBoxIdHex,
      depositCommitmentHex,
    });
  const encodedStatement =
    encodeValidityApplicationPooledReserveMintReservationStatementV4Hex({
      formatVersion: 4,
      lineageProfileIdHex,
      sourceIntentHex,
      sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(sourceIntent),
      mintIdentityHex,
      sourceLockBoxIdHex,
      reserveTransitionTransactionIdHex:
        canonicalV4Hex(
          packet.transactions.reserveTransition.txId,
          32,
          'reserve-transition transaction ID',
        ),
      depositCommitmentHex,
      successorReserveBoxIdHex: canonicalV4Hex(
        packet.boxes.reserveSuccessor.boxId,
        32,
        'successor-reserve box ID',
      ),
      successorReserveDigestHex: canonicalV4Hex(
        packet.reserve.outputDigestHex,
        33,
        'successor-reserve digest',
      ),
      successorReserveLiabilityNanoErg:
        packet.reserve.outputLiabilityNanoErg,
      ergoDepositFinalityPolicyIdHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
      inclusionHeaderIdHex:
        canonicalV4Hex(
          input.committedVaultObservation.confirmationHeaderIdHex,
          32,
          'inclusion header ID',
        ),
      inclusionHeight: input.committedVaultObservation.confirmationHeight,
      targetHeaderIdHex:
        canonicalV4Hex(
          input.committedVaultObservation.finalityTargetHeaderIdHex,
          32,
          'finality target header ID',
        ),
      targetHeight: input.committedVaultObservation.finalityTargetHeight,
      requiredSuccessorDepth:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1,
    });
  const statement = deepFreeze(
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      encodedStatement,
    ),
  );
  const body = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V1_SCHEMA,
    version: 1 as const,
    status: 'canonical_statement_waiting_for_source_proof' as const,
    statement,
    statementHex: encodedStatement,
    statementIdHex:
      deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
        statement,
      ),
    reservationKeyHex: statement.mintIdentityHex,
    provenance: {
      candidateDigestHex: input.candidate.candidateDigestHex,
      committedVaultObservationDigestHex:
        input.committedVaultObservation.observationDigestHex,
      familyCompilerBindingDigestHex:
        packet.familyCompiler.bindingDigestHex,
      exactSameProcessCandidateAndObservationBound: true as const,
    },
    boundary: {
      exactCommittedReserveBound: true as const,
      exactFinalityTargetBound: true as const,
      canonicalV4StatementConstructed: true as const,
      runtimeProfileBound: false as const,
      canonicalSourceProofEvidenceCollected: false as const,
      sourceProofRequestConstructed: false as const,
      sourceAttestationEstablished: false as const,
      runtimeReservationWritten: false as const,
      mintExecuted: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
    limitations: [
      'The operator-bound runtime profile is not yet joined.',
      'Canonical source-proof evidence bytes are not yet collected.',
      'No source proof, runtime reservation, or mint has been produced.',
    ] as const,
  });
  const draft = deepFreeze({
    ...body,
    draftDigestHex: sha256CanonicalJson(body, DRAFT_DIGEST_DOMAIN),
  });
  DRAFTS.add(draft);
  return draft;
}

export function assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1
> {
  if (
    value === null
    || typeof value !== 'object'
    || !DRAFTS.has(value)
  ) {
    throw new Error(
      'isolated devnet mint-reservation draft lacks same-process provenance',
    );
  }
  const { draftDigestHex, ...body } = value as Readonly<
    SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1
  >;
  if (draftDigestHex !== sha256CanonicalJson(body, DRAFT_DIGEST_DOMAIN)) {
    throw new Error('isolated devnet mint-reservation draft digest changed');
  }
}

function assertExactKeys(
  value: object,
  required: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} fields are invalid`);
  }
}

function canonicalV4Hex(
  value: string,
  bytes: number,
  label: string,
): string {
  const normalized = value.toLowerCase().replace(/^0x/u, '');
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(normalized)) {
    throw new Error(`${label} must be ${bytes} canonical bytes`);
  }
  return `0x${normalized}`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
