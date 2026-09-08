import {
  decodePegInSourceIntentV2Hex,
  derivePegInSourceIntentIdV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1,
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1,
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1,
  type SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1,
} from './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInCandidateV1,
} from './substrate-federated-isolated-devnet-peg-in-candidate-v1.js';
import type { SubstrateFederatedIsolatedDevnetPegInCandidateV2 } from './substrate-federated-isolated-devnet-peg-in-candidate-v2.js';
import { assertSubstrateFederatedNativeGenesisPegInPacketV1 } from './substrate-federated-isolated-devnet-peg-in-candidate-v2.js';
import type { SubstrateFederatedPooledReserveDepositV1Packet } from './substrate-federated-pooled-reserve-deposit-v1.js';
import type { SubstrateFederatedPooledReserveDepositV2Packet } from './substrate-federated-pooled-reserve-deposit-v2.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupFamilyExecutionBatchV2,
  SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3,
  SubstrateFederatedNativeGenesisSetupExecutionBatchV1,
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
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-mint-reservation-draft.v2' as const;
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
const DRAFT_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V2';
const DRAFTS_V2 = new WeakSet<object>();
export const SUBSTRATE_FEDERATED_NATIVE_GENESIS_PEG_IN_MINT_RESERVATION_DRAFT_V1_SCHEMA =
  'e2s.substrate-federated-native-genesis-peg-in-mint-reservation-draft.v1' as const;
const NATIVE_DRAFT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_GENESIS_PEG_IN_MINT_RESERVATION_DRAFT_V1';
const NATIVE_PACKET_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_GENESIS_RESERVE_PACKET_V1';
const NATIVE_DRAFTS = new WeakMap<object, Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1Input>>();

export interface SubstrateFederatedNativeGenesisPegInMintReservationDraftV1Input {
  readonly batch: Readonly<SubstrateFederatedNativeGenesisSetupExecutionBatchV1>;
  readonly target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>;
  readonly committedVaultObservation: Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>;
}

export interface SubstrateFederatedNativeGenesisPegInMintReservationDraftV1
  extends Omit<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1, 'schema' | 'provenance'> {
  readonly schema: typeof SUBSTRATE_FEDERATED_NATIVE_GENESIS_PEG_IN_MINT_RESERVATION_DRAFT_V1_SCHEMA;
  readonly provenance: Readonly<{
    readonly profile: 'fed-native-height-zero-v1';
    readonly setupRequestDigestHex: string;
    readonly setupCheckReceiptDigestHex: string;
    readonly packetDigestHex: string;
    readonly committedVaultObservationDigestHex: string;
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
    readonly familyCompiler: SubstrateFederatedPooledReserveDepositV2Packet['familyCompiler'];
    readonly exactSameProcessBatchPacketAndObservationBound: true;
  }>;
}

export function buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV1(
  input: Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1Input>,
): Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1> {
  assertNativeInput(input);
  input = Object.freeze({ ...input });
  const body = buildNativeDraftBody(input);
  const draft = deepFreeze({ ...body, draftDigestHex: sha256CanonicalJson(body, NATIVE_DRAFT_DOMAIN) });
  NATIVE_DRAFTS.set(draft, input);
  return draft;
}

export function assertSubstrateFederatedNativeGenesisPegInMintReservationDraftV1(
  value: unknown,
  expectedInput?: Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1Input>,
): asserts value is Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1> {
  if (value === null || typeof value !== 'object' || !NATIVE_DRAFTS.has(value)) {
    throw new Error('native mint-reservation draft lacks same-process provenance');
  }
  const retained = NATIVE_DRAFTS.get(value)!;
  if (expectedInput !== undefined) {
    assertNativeInput(expectedInput);
    if (retained.batch !== expectedInput.batch || retained.target !== expectedInput.target
      || retained.packet !== expectedInput.packet
      || retained.committedVaultObservation !== expectedInput.committedVaultObservation) {
      throw new Error('native mint-reservation draft requires exact original inputs');
    }
  }
  const { draftDigestHex, ...body } = value as Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1>;
  if (draftDigestHex !== sha256CanonicalJson(body, NATIVE_DRAFT_DOMAIN)
    || draftDigestHex !== sha256CanonicalJson(buildNativeDraftBody(retained), NATIVE_DRAFT_DOMAIN)) {
    throw new Error('native mint-reservation draft retained lineage changed');
  }
}

function buildNativeDraftBody(input: Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1Input>) {
  const { packet, batch, target, committedVaultObservation: observation } = input;
  assertSubstrateFederatedNativeGenesisPegInPacketV1(packet, batch, target);
  if (assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1(
    observation, target, batch, packet,
  ) !== packet) throw new Error('native committed reserve requires the original packet');
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_NATIVE_GENESIS_PEG_IN_MINT_RESERVATION_DRAFT_V1_SCHEMA,
    version: 1 as const,
    ...buildDraftStatement(observation, packet),
    provenance: {
      profile: 'fed-native-height-zero-v1' as const,
      setupRequestDigestHex: batch.request.requestDigestHex,
      setupCheckReceiptDigestHex: batch.receipt.receiptDigestHex,
      packetDigestHex: sha256CanonicalJson(packet, NATIVE_PACKET_DOMAIN),
      committedVaultObservationDigestHex: observation.observationDigestHex,
      processBindingDigestHex: observation.processBindingDigestHex,
      executionTargetIdentityDigestHex: observation.executionTargetIdentityDigestHex,
      familyCompiler: { ...packet.familyCompiler },
      exactSameProcessBatchPacketAndObservationBound: true as const,
    },
  });
}

function assertNativeInput(value: unknown): void {
  const fields = ['batch', 'target', 'packet', 'committedVaultObservation'];
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== fields.length
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !fields.includes(key)
      || !Object.getOwnPropertyDescriptor(value, key)?.enumerable
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) {
    throw new Error('native mint-reservation draft input requires exact own-data fields');
  }
}

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

export interface SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2
  extends Omit<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
    'schema' | 'version' | 'provenance'> {
  readonly schema: typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V2_SCHEMA;
  readonly version: 2;
  readonly provenance: Readonly<{
    readonly candidateDigestHex: string;
    readonly committedVaultObservationDigestHex: string;
    readonly familyCompiler: SubstrateFederatedPooledReserveDepositV2Packet['familyCompiler'];
    readonly exactSameProcessCandidateAndObservationBound: true;
  }>;
}

export function buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2(
  input: Readonly<{
    readonly batch: Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>;
    readonly target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    readonly candidate: Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV2>;
    readonly committedVaultObservation: Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>;
  }>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2> {
  input = Object.freeze({ ...input });
  assertExactKeys(input, ['batch', 'target', 'candidate', 'committedVaultObservation'],
    'isolated devnet mint-reservation draft input');
  const packet = assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV2(
    input.committedVaultObservation, input.batch, input.candidate, input.target,
  );
  const body = deepFreeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V2_SCHEMA,
    version: 2 as const,
    ...buildDraftStatement(input.committedVaultObservation, packet),
    provenance: {
      candidateDigestHex: input.candidate.candidateDigestHex,
      committedVaultObservationDigestHex: input.committedVaultObservation.observationDigestHex,
      familyCompiler: { ...packet.familyCompiler },
      exactSameProcessCandidateAndObservationBound: true as const,
    },
  });
  const draft = deepFreeze({ ...body, draftDigestHex: sha256CanonicalJson(body, DRAFT_V2_DIGEST_DOMAIN) });
  DRAFTS_V2.add(draft);
  return draft;
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
  input = Object.freeze({ ...input });
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
  const body = deepFreeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_MINT_RESERVATION_DRAFT_V1_SCHEMA,
    version: 1 as const,
    ...buildDraftStatement(input.committedVaultObservation, packet),
    provenance: {
      candidateDigestHex: input.candidate.candidateDigestHex,
      committedVaultObservationDigestHex: input.committedVaultObservation.observationDigestHex,
      familyCompilerBindingDigestHex: packet.familyCompiler.bindingDigestHex,
      exactSameProcessCandidateAndObservationBound: true as const,
    },
  });
  const draft = deepFreeze({ ...body, draftDigestHex: sha256CanonicalJson(body, DRAFT_DIGEST_DOMAIN) });
  DRAFTS.add(draft);
  return draft;
}

function buildDraftStatement(
  observation: Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1>,
  packet: Readonly<SubstrateFederatedPooledReserveDepositV1Packet | SubstrateFederatedPooledReserveDepositV2Packet>,
) {
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
          observation.confirmationHeaderIdHex,
          32,
          'inclusion header ID',
        ),
      inclusionHeight: observation.confirmationHeight,
      targetHeaderIdHex:
        canonicalV4Hex(
          observation.finalityTargetHeaderIdHex,
          32,
          'finality target header ID',
        ),
      targetHeight: observation.finalityTargetHeight,
      requiredSuccessorDepth:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1,
    });
  const statement = deepFreeze(
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      encodedStatement,
    ),
  );
  return deepFreeze({
    status: 'canonical_statement_waiting_for_source_proof' as const,
    statement,
    statementHex: encodedStatement,
    statementIdHex:
      deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
        statement,
      ),
    reservationKeyHex: statement.mintIdentityHex,
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
}

export function assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2> {
  if (value === null || typeof value !== 'object' || !DRAFTS_V2.has(value)) {
    throw new Error('isolated devnet V2 mint-reservation draft lacks same-process provenance');
  }
  const { draftDigestHex, ...body } = value as Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2>;
  if (draftDigestHex !== sha256CanonicalJson(body, DRAFT_V2_DIGEST_DOMAIN)) {
    throw new Error('isolated devnet V2 mint-reservation draft digest changed');
  }
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
