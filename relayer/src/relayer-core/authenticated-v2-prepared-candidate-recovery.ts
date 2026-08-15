export const AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA =
  'e2s.authenticated-v2-package-recovery.v2';

const AUTHENTICATED_V2_PREPARED_RECOVERY_ADMISSIONS = new WeakSet<object>();

export interface AuthenticatedV2RecoveryCandidateView {
  readonly schemaVersion: number;
  readonly candidateId: string;
  readonly burnId: string;
  readonly burnTxHash: string;
  readonly sidechainId: string;
  readonly sidechainHeight: bigint;
  readonly sidechainBlockHash: string;
  readonly sidechainLogIndex: number;
  readonly trackerKey: string;
  readonly trackerValue: string;
  readonly trackerBoxId: string;
  readonly anchorHeaderId: string;
  readonly anchorHeaderHeight: number;
  readonly dupInputBoxId: string;
  readonly dupInputDigest: string;
  readonly vaultBoxId: string;
  readonly unsignedTxDigest: string;
  readonly creationHeight: number;
  readonly observedSidechainTip: bigint;
  readonly observedErgoTip: number;
}

export interface AuthenticatedV2RecoveryPegOutView {
  readonly user: string;
  readonly amount: bigint;
  readonly ergoRecipientAddress: string;
  readonly sidechainTxHash: string;
  readonly sidechainBlockNumber: number;
  readonly sidechainBlockHash?: string;
  readonly sidechainLogIndex?: number;
}

export interface AuthenticatedV2CacheRecoveryView {
  readonly schema: string;
  readonly observedTip: Readonly<{
    idHex: string;
    parentIdHex: string;
    height: number;
    extensionRootHex: string;
  }>;
  readonly reconstructionDigests: Readonly<{
    tracker: string;
    duplicatePrevention: string;
    vault: string;
  }>;
  readonly currentInputs: Readonly<{
    trackerBoxIdHex: string;
    duplicatePreventionBoxIdHex: string;
    vaultBoxIdsHex: readonly string[];
  }>;
}

export interface AuthenticatedV2RecoverySidechainConsensusView {
  readonly view: Readonly<{
    candidateId: string;
    burnIdHex: string;
    sidechainIdHex: string;
    sidechainTxHashHex: string;
    sidechainHeight: bigint;
    executionBlockHashHex: string;
    eventIndex: number;
    amountNanoErg: bigint;
    recipientErgoTreeHex: string;
    observedTipHeight: bigint;
    observedTipHashHex: string;
    confirmations: bigint;
    requiredConfirmations: bigint;
  }>;
  readonly sourceCount: number;
  readonly consensusDigestHex: string;
}

export interface AuthenticatedV2PreparedCandidateRecoveryDraft<
  Candidate extends AuthenticatedV2RecoveryCandidateView =
    AuthenticatedV2RecoveryCandidateView,
  PegOut extends AuthenticatedV2RecoveryPegOutView =
    AuthenticatedV2RecoveryPegOutView,
  CacheRecovery extends AuthenticatedV2CacheRecoveryView =
    AuthenticatedV2CacheRecoveryView,
> {
  readonly candidate: Candidate;
  readonly pegOut: PegOut;
  readonly cacheRecovery: CacheRecovery;
  readonly packageDigestHex: string;
  readonly expectedTxId: string;
  readonly cacheRecoveryDigestHex: string;
}

export interface AuthenticatedV2PreparedCandidateRecoveryBinding {
  readonly schema: typeof AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA;
  readonly candidateId: string;
  readonly burnId: string;
  readonly packageDigestHex: string;
  readonly expectedTxId: string;
  readonly cacheRecoveryDigestHex: string;
  readonly sidechainConsensusDigestHex: string;
  readonly sidechainTipHashHex: string;
}

export interface AuthenticatedV2PreparedCandidateRecoveryAdmission<
  Candidate extends AuthenticatedV2RecoveryCandidateView =
    AuthenticatedV2RecoveryCandidateView,
  PegOut extends AuthenticatedV2RecoveryPegOutView =
    AuthenticatedV2RecoveryPegOutView,
  CacheRecovery extends AuthenticatedV2CacheRecoveryView =
    AuthenticatedV2CacheRecoveryView,
  Consensus extends AuthenticatedV2RecoverySidechainConsensusView =
    AuthenticatedV2RecoverySidechainConsensusView,
> extends AuthenticatedV2PreparedCandidateRecoveryDraft<
  Candidate,
  PegOut,
  CacheRecovery
> {
  readonly schema: typeof AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA;
  readonly sidechainConsensus: Consensus;
  readonly sidechainConsensusDigestHex: string;
  readonly sidechainTipHashHex: string;
  readonly recoveryAdmissionDigestHex: string;
}

export interface RecoveredAuthenticatedV2PreparedCandidateView
  extends AuthenticatedV2RecoveryCandidateView {
  readonly status: string;
  readonly recoverySchema: string | null;
  readonly recoverySidechainConsensusDigest: string | null;
  readonly recoveryAdmissionDigest: string | null;
  readonly recoverySidechainTipHash: string | null;
  readonly recoverySidechainSourceCount: number | null;
  readonly checkExpectedTxId: string | null;
  readonly checkUnsignedPackageDigest: string | null;
  readonly checkSignedTransactionDigest: string | null;
  readonly checkResponseDigest: string | null;
  readonly checkSignerContextDigest: string | null;
  readonly checkCheckerIdentityDigest: string | null;
  readonly checkRevalidationDigest: string | null;
  readonly checkNativeVerificationRequestDigest: string | null;
  readonly checkTrustAnchorDigest: string | null;
  readonly checkFinalityHorizonHash: string | null;
  readonly checkFinalityHorizonHeight: bigint | null;
  readonly checkFinalityStatementDigest: string | null;
  readonly checkFinalityProgramId: string | null;
  readonly checkFinalityProofSystemId: number | null;
  readonly checkFinalityVerifierProfileId: string | null;
  readonly checkFinalityProofPayloadDigest: string | null;
  readonly checkFinalityProofDigest: string | null;
  readonly checkStableErgoViewDigest: string | null;
  readonly checkStableSidechainViewDigest: string | null;
  readonly checkAdmissionDigest: string | null;
}

export interface AuthenticatedV2PreparedCandidateReconstructionPort<
  Input,
  Draft extends AuthenticatedV2PreparedCandidateRecoveryDraft,
> {
  reconstruct(input: Input): Promise<Draft>;
}

export interface AuthenticatedV2PreparedCandidateSourceObservationPort<
  Draft extends AuthenticatedV2PreparedCandidateRecoveryDraft,
  Consensus extends AuthenticatedV2RecoverySidechainConsensusView,
> {
  observe(draft: Draft): Promise<Consensus>;
}

export interface AuthenticatedV2PreparedCandidateRecoveryBindingPort {
  digest(binding: AuthenticatedV2PreparedCandidateRecoveryBinding): string;
}

export interface AuthenticatedV2PreparedCandidateRecoveryJournalPort<
  Admission extends AuthenticatedV2PreparedCandidateRecoveryAdmission,
  Recovered extends RecoveredAuthenticatedV2PreparedCandidateView,
> {
  record(admission: Admission): Recovered;
}

export interface AuthenticatedV2PreparedCandidateRecoveryPorts<
  Input,
  Draft extends AuthenticatedV2PreparedCandidateRecoveryDraft,
  Consensus extends AuthenticatedV2RecoverySidechainConsensusView,
  Recovered extends RecoveredAuthenticatedV2PreparedCandidateView,
> {
  reconstruction: AuthenticatedV2PreparedCandidateReconstructionPort<Input, Draft>;
  sourceObservation: AuthenticatedV2PreparedCandidateSourceObservationPort<
    Draft,
    Consensus
  >;
  binding: AuthenticatedV2PreparedCandidateRecoveryBindingPort;
  journal: AuthenticatedV2PreparedCandidateRecoveryJournalPort<
    AuthenticatedV2PreparedCandidateRecoveryAdmission<
      Draft['candidate'],
      Draft['pegOut'],
      Draft['cacheRecovery'],
      Consensus
    >,
    Recovered
  >;
}

export interface AuthenticatedV2PreparedCandidateRecoveryResult<
  Recovered extends RecoveredAuthenticatedV2PreparedCandidateView =
    RecoveredAuthenticatedV2PreparedCandidateView,
> {
  readonly schema: typeof AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA;
  readonly candidate: Recovered;
  readonly packageDigestHex: string;
  readonly expectedTxId: string;
  readonly cacheRecoveryDigestHex: string;
  readonly sidechainConsensusDigestHex: string;
  readonly sidechainTipHashHex: string;
  readonly recoveryAdmissionDigestHex: string;
  readonly boundary: Readonly<{
    externalPackageIsAuthorityByItself: false;
    freshChainRecoveryRequired: true;
    ergoCacheSnapshotRevalidatedAtomically: true;
    sidechainBurnViewReobserved: true;
    matchingSidechainSourcesReobserved: true;
    distinctOriginsDetectDisagreementButDoNotProveConsensus: true;
    nativeAdmissionRecollectedInsideRecovery: false;
    restoredCandidateStatus: 'prepared';
    checkPassedRestored: false;
    signerSubmitterOrBroadcastAuthorityRestored: false;
  }>;
}

export async function recoverAuthenticatedV2PreparedCandidateLifecycle<
  Input,
  Draft extends AuthenticatedV2PreparedCandidateRecoveryDraft,
  Consensus extends AuthenticatedV2RecoverySidechainConsensusView,
  Recovered extends RecoveredAuthenticatedV2PreparedCandidateView,
>(
  input: Input,
  ports: AuthenticatedV2PreparedCandidateRecoveryPorts<
    Input,
    Draft,
    Consensus,
    Recovered
  >,
): Promise<AuthenticatedV2PreparedCandidateRecoveryResult<Recovered>> {
  const draft = await ports.reconstruction.reconstruct(input);
  const packageDigestHex = fixedHex(
    draft.packageDigestHex,
    'unsigned package digest',
  );
  const expectedTxId = fixedHex(
    draft.expectedTxId,
    'expected transaction ID',
  );
  const cacheRecoveryDigestHex = fixedHex(
    draft.cacheRecoveryDigestHex,
    'cache recovery digest',
  );
  const sidechainConsensus = await ports.sourceObservation.observe(draft);
  assertAuthenticatedV2RecoverySourceMatchesDraft(draft, sidechainConsensus);
  if (
    !Number.isSafeInteger(sidechainConsensus.sourceCount)
    || sidechainConsensus.sourceCount < 2
  ) {
    throw new Error(
      'authenticated settlement recovery requires at least two matching sidechain sources',
    );
  }

  const sidechainConsensusDigestHex = fixedHex(
    sidechainConsensus.consensusDigestHex,
    'sidechain consensus digest',
  );
  const sidechainTipHashHex = fixedHex(
    sidechainConsensus.view.observedTipHashHex,
    'sidechain tip hash',
  );
  const binding: AuthenticatedV2PreparedCandidateRecoveryBinding = {
    schema: AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
    candidateId: draft.candidate.candidateId,
    burnId: draft.candidate.burnId,
    packageDigestHex,
    expectedTxId,
    cacheRecoveryDigestHex,
    sidechainConsensusDigestHex,
    sidechainTipHashHex,
  };
  const recoveryAdmissionDigestHex = fixedHex(
    ports.binding.digest(binding),
    'recovery admission digest',
  );
  const admission = deepFreeze({
    schema: AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
    ...draft,
    packageDigestHex,
    expectedTxId,
    cacheRecoveryDigestHex,
    sidechainConsensus,
    sidechainConsensusDigestHex,
    sidechainTipHashHex,
    recoveryAdmissionDigestHex,
  }) as AuthenticatedV2PreparedCandidateRecoveryAdmission<
    Draft['candidate'],
    Draft['pegOut'],
    Draft['cacheRecovery'],
    Consensus
  >;
  AUTHENTICATED_V2_PREPARED_RECOVERY_ADMISSIONS.add(admission);

  const recovered = ports.journal.record(admission);
  assertPreparedOnly(recovered, admission);

  return deepFreeze({
    schema: AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
    candidate: recovered,
    packageDigestHex: admission.packageDigestHex,
    expectedTxId: admission.expectedTxId,
    cacheRecoveryDigestHex: admission.cacheRecoveryDigestHex,
    sidechainConsensusDigestHex: admission.sidechainConsensusDigestHex,
    sidechainTipHashHex: admission.sidechainTipHashHex,
    recoveryAdmissionDigestHex: admission.recoveryAdmissionDigestHex,
    boundary: {
      externalPackageIsAuthorityByItself: false as const,
      freshChainRecoveryRequired: true as const,
      ergoCacheSnapshotRevalidatedAtomically: true as const,
      sidechainBurnViewReobserved: true as const,
      matchingSidechainSourcesReobserved: true as const,
      distinctOriginsDetectDisagreementButDoNotProveConsensus: true as const,
      nativeAdmissionRecollectedInsideRecovery: false as const,
      restoredCandidateStatus: 'prepared' as const,
      checkPassedRestored: false as const,
      signerSubmitterOrBroadcastAuthorityRestored: false as const,
    },
  });
}

export function assertAuthenticatedV2RecoverySourceMatchesDraft(
  draft: AuthenticatedV2PreparedCandidateRecoveryDraft,
  sidechainConsensus: AuthenticatedV2RecoverySidechainConsensusView,
): void {
  const candidate = draft.candidate;
  const pegOut = draft.pegOut;
  const view = sidechainConsensus.view;
  if (view.observedTipHeight !== candidate.observedSidechainTip) {
    throw new Error(
      'authenticated settlement recovery candidate tip does not match the freshly observed sidechain tip',
    );
  }
  if (
    view.candidateId !== candidate.candidateId
    || view.burnIdHex !== candidate.burnId
    || view.sidechainIdHex !== candidate.sidechainId
    || view.sidechainTxHashHex !== candidate.burnTxHash
    || view.sidechainTxHashHex !== pegOut.sidechainTxHash
    || view.sidechainHeight !== candidate.sidechainHeight
    || view.sidechainHeight !== BigInt(pegOut.sidechainBlockNumber)
    || view.executionBlockHashHex !== candidate.sidechainBlockHash
    || (
      pegOut.sidechainBlockHash !== undefined
      && view.executionBlockHashHex !== pegOut.sidechainBlockHash
    )
    || view.eventIndex !== candidate.sidechainLogIndex
    || (
      pegOut.sidechainLogIndex !== undefined
      && view.eventIndex !== pegOut.sidechainLogIndex
    )
    || view.amountNanoErg !== pegOut.amount
    || view.recipientErgoTreeHex !== pegOut.ergoRecipientAddress
  ) {
    throw new Error(
      'authenticated settlement recovery source observation does not match the candidate and payout',
    );
  }
}

export function assertAuthenticatedV2PreparedCandidateRecoveryAdmissionProvenance(
  admission: unknown,
): asserts admission is AuthenticatedV2PreparedCandidateRecoveryAdmission {
  if (
    typeof admission !== 'object'
    || admission === null
    || !AUTHENTICATED_V2_PREPARED_RECOVERY_ADMISSIONS.has(admission)
  ) {
    throw new Error('authenticated V2 prepared-candidate recovery provenance is missing');
  }
  const branded = admission as AuthenticatedV2PreparedCandidateRecoveryAdmission;
  if (
    branded.schema !== AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA
    || branded.sidechainConsensusDigestHex
      !== branded.sidechainConsensus.consensusDigestHex
    || branded.sidechainTipHashHex
      !== branded.sidechainConsensus.view.observedTipHashHex
    || branded.sidechainConsensus.sourceCount < 2
  ) {
    throw new Error('authenticated V2 prepared-candidate recovery binding is inconsistent');
  }
}

function assertPreparedOnly(
  recovered: RecoveredAuthenticatedV2PreparedCandidateView,
  admission: AuthenticatedV2PreparedCandidateRecoveryAdmission,
): void {
  const authorityFields = [
    recovered.checkExpectedTxId,
    recovered.checkUnsignedPackageDigest,
    recovered.checkSignedTransactionDigest,
    recovered.checkResponseDigest,
    recovered.checkSignerContextDigest,
    recovered.checkCheckerIdentityDigest,
    recovered.checkRevalidationDigest,
    recovered.checkNativeVerificationRequestDigest,
    recovered.checkTrustAnchorDigest,
    recovered.checkFinalityHorizonHash,
    recovered.checkFinalityHorizonHeight,
    recovered.checkFinalityStatementDigest,
    recovered.checkFinalityProgramId,
    recovered.checkFinalityProofSystemId,
    recovered.checkFinalityVerifierProfileId,
    recovered.checkFinalityProofPayloadDigest,
    recovered.checkFinalityProofDigest,
    recovered.checkStableErgoViewDigest,
    recovered.checkStableSidechainViewDigest,
    recovered.checkAdmissionDigest,
  ];
  if (
    recovered.status !== 'prepared'
    || recovered.recoverySchema !== AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA
    || recovered.recoverySidechainConsensusDigest
      !== admission.sidechainConsensusDigestHex
    || recovered.recoveryAdmissionDigest !== admission.recoveryAdmissionDigestHex
    || recovered.recoverySidechainTipHash !== admission.sidechainTipHashHex
    || recovered.recoverySidechainSourceCount
      !== admission.sidechainConsensus.sourceCount
    || authorityFields.some(value => value !== null)
  ) {
    throw new Error(
      'authenticated package recovery may restore only an unchecked prepared candidate',
    );
  }
}

function fixedHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`authenticated settlement recovery ${label} must be 32-byte lowercase hex`);
  }
  return value;
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
