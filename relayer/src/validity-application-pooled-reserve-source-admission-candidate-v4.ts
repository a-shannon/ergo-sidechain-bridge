import {
  assertFrontierReturnedReceiptBurnSetAgreementProvenance,
  type FrontierReturnedReceiptBurnSetAgreement,
} from './frontier-burn-proof-source.js';
import {
  decodeEip0045PooledReserveBurnStatementV4,
} from './pooled-reserve-burn-statement-v4.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
} from './profiles/substrate-grandpa-v1/asset-profile.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  buildTrustlessBurnInclusionProof,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  assertValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture,
  type ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture,
} from './validity-application-pooled-reserve-historical-dup-lineage-v4-fixture.js';

export const
VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_ADMISSION_CANDIDATE_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-source-admission-candidate.v4' as const;

const CANDIDATE_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_ADMISSION_CANDIDATE_V4';
const candidates = new WeakSet<object>();

export interface BuildValidityApplicationPooledReserveSourceAdmissionCandidateV4Input {
  readonly historicalJoin: Readonly<
    ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture
  >;
  readonly burnSetAgreement: Readonly<
    FrontierReturnedReceiptBurnSetAgreement
  >;
}

export interface ValidityApplicationPooledReserveSourceAdmissionCandidateV4 {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_ADMISSION_CANDIDATE_V4_SCHEMA;
  readonly version: 4;
  readonly status: 'non_authorizing_source_admission_candidate';
  readonly candidateDigestHex: string;
  readonly provenance: Readonly<{
    readonly historicalJoinDigestHex: string;
    readonly historicalLineagePacketDigestHex: string;
    readonly frontierViewDigestHex: string;
    readonly frontierAgreementDigestHex: string;
    readonly frontierSourceIdsHex: readonly [string, string];
  }>;
  readonly application: Readonly<{
    readonly lineageProfileIdHex: string;
    readonly runtimeProfileIdHex: string;
    readonly applicationBindingDigestHex: string;
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly bridgeAddress: string;
    readonly tokenAddress: string;
    readonly sourceRuntimeCodeSha256Hex: string;
    readonly sourceRuntimeCodeBytes: number;
    readonly bridgeRuntimeCodeSha256Hex: string;
    readonly bridgeRuntimeCodeBytes: number;
    readonly tokenRuntimeCodeSha256Hex: string;
    readonly tokenRuntimeCodeBytes: number;
    readonly settlementProfileIdHex: string;
    readonly trackerContractIdHex: string;
    readonly trackerNftIdHex: string;
    readonly programIdHex: string;
    readonly verifierProfileIdHex: string;
  }>;
  readonly checkpoint: Readonly<{
    readonly statementDigestHex: string;
    readonly publicInputsDigestHex: string;
    readonly checkpointCommitmentHex: string;
    readonly sidechainHeight: string;
    readonly sidechainConsensusBlockHashHex: string;
    readonly executionBlockHashHex: string;
    readonly bridgeEventRootHex: string;
    readonly burnLeafCount: number;
    readonly finalityAuthoritySetId: string;
    readonly finalityAuthoritySetHashHex: string;
    readonly finalityProofHashHex: string;
    readonly targetNativeStateRootHex: string;
    readonly trustedAnchorDigestHex: string;
    readonly finalityHorizonHeight: string;
    readonly finalityHorizonHashHex: string;
    readonly extensionKeyHex: '0401';
    readonly extensionValueHex: string;
  }>;
  readonly mappedBurn: Readonly<{
    readonly transactionIndex: number;
    readonly logIndex: number;
    readonly eventIndex: number;
    readonly sidechainTxHashHex: string;
    readonly burnIdHex: string;
    readonly burnLeafHex: string;
    readonly burnLeafHashHex: string;
    readonly recipientErgoTreeHex: string;
    readonly recipientErgoTreeHashHex: string;
    readonly amountNanoErg: string;
    readonly assetIdHex: string;
    readonly leafIndex: number;
    readonly leafCount: number;
  }>;
  readonly settlement: Readonly<{
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly payoutBoxIdHex: string;
    readonly settlementTransactionIdHex: string;
  }>;
  readonly replay: Readonly<{
    readonly duplicatePreventionKeyHex: string;
    readonly predecessorBoxIdHex: string;
    readonly successorBoxIdHex: string;
    readonly inputDigestHex: string;
    readonly outputDigestHex: string;
    readonly historicalTransitionContextDigestHex: string;
  }>;
  readonly boundaries: Readonly<{
    readonly exactReturnedEventSetBound: true;
    readonly exactApplicationStatementBound: true;
    readonly exactCheckpointSemanticsBound: true;
    readonly exactSettlementAndReplayLineageBound: true;
    readonly distinctSourceInstancesVerified: true;
    readonly receiptArrayCompletenessAuthenticated: false;
    readonly eventApplicationRuntimeCodeAuthenticated: false;
    readonly operationalIndependenceEstablished: false;
    readonly canonicalEventMappingEstablished: false;
    readonly sourceAdmissionEstablished: false;
    readonly sidechainFinalityEstablished: false;
    readonly proofSystemActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
  }>;
}

export function
buildValidityApplicationPooledReserveSourceAdmissionCandidateV4(
  input:
    BuildValidityApplicationPooledReserveSourceAdmissionCandidateV4Input,
): Readonly<ValidityApplicationPooledReserveSourceAdmissionCandidateV4> {
  return buildSourceAdmissionCandidate(input, true);
}

function buildSourceAdmissionCandidate(
  input:
    BuildValidityApplicationPooledReserveSourceAdmissionCandidateV4Input,
  validateSerializedBinding: boolean,
): Readonly<ValidityApplicationPooledReserveSourceAdmissionCandidateV4> {
  exactObjectKeys(
    input,
    ['historicalJoin', 'burnSetAgreement'],
    'pooled-reserve V4 source-admission candidate input',
  );
  const historical = input.historicalJoin;
  const agreement = input.burnSetAgreement;
  assertValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture(
    historical,
  );
  assertFrontierReturnedReceiptBurnSetAgreementProvenance(agreement);

  const fixture = historical.settlementFixture;
  const compiled = fixture.compiledInstance;
  const tracker = fixture.trackerContext;
  const settlement = fixture.settlementPacket;
  const statement = decodeEip0045PooledReserveBurnStatementV4(
    tracker.statement.encodedHex,
  );
  const publicInputs = statement.publicInputs;
  const application = publicInputs.application;
  const runtime = application.runtimeProfile;
  const checkpoint = publicInputs.checkpoint;
  const view = agreement.view;

  assertApplicationBindings({
    historical,
    compiled,
    tracker,
    settlement,
    statement,
  });
  assertCheckpointAndEventSet({
    checkpoint,
    publicInputs,
    settlement,
    view,
    runtime,
  });
  const proof = reconstructExactBurnProof(view, settlement.burn.leaf.burnIdHex);
  if (
    canonicalJson(proof.leaf) !== canonicalJson(settlement.burn.leaf)
    || proof.leafIndex !== settlement.burn.leafIndex
    || proof.leafCount !== settlement.burn.leafCount
    || canonicalJson(proof.proof) !== canonicalJson(settlement.burn.proof)
  ) {
    throw new Error(
      'returned Frontier burn proof does not match the exact V4 settlement burn',
    );
  }
  const target = view.burns.filter(
    burn => fixedHex(burn.burnIdHex, 32, 'Frontier burn ID')
      === proof.leaf.burnIdHex,
  );
  if (target.length !== 1) {
    throw new Error(
      'returned Frontier burn set must contain the exact settlement burn once',
    );
  }
  const burn = target[0]!;
  if (
    fixedHex(burn.sidechainTxHashHex, 32, 'Frontier burn transaction hash')
      !== proof.leaf.sidechainTxHashHex
    || safeUint32(burn.eventIndex, 'Frontier burn event index')
      !== proof.leaf.eventIndex
    || fixedHex(
      burn.recipientErgoTreeHashHex,
      32,
      'Frontier burn recipient ErgoTree hash',
    ) !== proof.leaf.recipientErgoTreeHashHex
    || variableHex(
      burn.recipientErgoTreeHex,
      'Frontier burn recipient ErgoTree',
    ) !== variableHex(
      settlement.burn.recipientErgoTreeHex,
      'settlement burn recipient ErgoTree',
    )
    || positiveLong(burn.amountNanoErg, 'Frontier burn amount')
      !== proof.leaf.amountNanoErg
  ) {
    throw new Error(
      'returned Frontier event identity does not match the exact V4 settlement burn',
    );
  }

  const boundaries = deepFreeze({
    exactReturnedEventSetBound: true as const,
    exactApplicationStatementBound: true as const,
    exactCheckpointSemanticsBound: true as const,
    exactSettlementAndReplayLineageBound: true as const,
    distinctSourceInstancesVerified: true as const,
    receiptArrayCompletenessAuthenticated: false as const,
    eventApplicationRuntimeCodeAuthenticated: false as const,
    operationalIndependenceEstablished: false as const,
    canonicalEventMappingEstablished: false as const,
    sourceAdmissionEstablished: false as const,
    sidechainFinalityEstablished: false as const,
    proofSystemActivated: false as const,
    targetNodeAcceptanceEstablished: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
  });
  const binding = deepFreeze({
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_ADMISSION_CANDIDATE_V4_SCHEMA,
    version: 4 as const,
    status: 'non_authorizing_source_admission_candidate' as const,
    provenance: {
      historicalJoinDigestHex: fixedHex(
        historical.joinDigestHex,
        32,
        'historical join digest',
      ),
      historicalLineagePacketDigestHex: fixedHex(
        historical.historicalLineage.packetDigestHex,
        32,
        'historical lineage packet digest',
      ),
      frontierViewDigestHex: fixedHex(
        view.viewDigestHex,
        32,
        'Frontier burn-set view digest',
      ),
      frontierAgreementDigestHex: fixedHex(
        agreement.sources.agreementDigestHex,
        32,
        'Frontier burn-set agreement digest',
      ),
      frontierSourceIdsHex: agreement.sources.sourceIdsHex.map(
        (value, index) => fixedHex(
          value,
          32,
          `Frontier burn-set source ID ${index}`,
        ),
      ) as [string, string],
    },
    application: {
      lineageProfileIdHex: fixedHex(
        compiled.lineageProfileIdHex,
        32,
        'compiled lineage profile ID',
      ),
      runtimeProfileIdHex: fixedHex(
        application.runtimeProfileIdHex,
        32,
        'runtime profile ID',
      ),
      applicationBindingDigestHex: fixedHex(
        publicInputs.applicationBindingDigestHex,
        32,
        'application binding digest',
      ),
      sourceNetworkIdHex: fixedHex(
        runtime.sourceNetworkIdHex,
        32,
        'source network ID',
      ),
      sidechainIdHex: fixedHex(
        runtime.sidechainIdHex,
        32,
        'sidechain ID',
      ),
      bridgeAddress: address(runtime.bridgeAddressHex, 'bridge address'),
      tokenAddress: address(runtime.tokenAddressHex, 'token address'),
      sourceRuntimeCodeSha256Hex: fixedHex(
        application.sourceRuntimeCodeSha256Hex,
        32,
        'source runtime code hash',
      ),
      sourceRuntimeCodeBytes: positiveSafeInteger(
        application.sourceRuntimeCodeBytes,
        'source runtime code bytes',
      ),
      bridgeRuntimeCodeSha256Hex: fixedHex(
        runtime.bridgeRuntimeCodeSha256Hex,
        32,
        'bridge runtime code hash',
      ),
      bridgeRuntimeCodeBytes: positiveSafeInteger(
        runtime.bridgeRuntimeCodeBytes,
        'bridge runtime code bytes',
      ),
      tokenRuntimeCodeSha256Hex: fixedHex(
        runtime.tokenRuntimeCodeSha256Hex,
        32,
        'token runtime code hash',
      ),
      tokenRuntimeCodeBytes: positiveSafeInteger(
        runtime.tokenRuntimeCodeBytes,
        'token runtime code bytes',
      ),
      settlementProfileIdHex: fixedHex(
        runtime.settlementProfileIdHex,
        32,
        'settlement profile ID',
      ),
      trackerContractIdHex: fixedHex(
        application.settlementTrackerContractIdHex,
        32,
        'tracker contract ID',
      ),
      trackerNftIdHex: fixedHex(
        application.trackerNftIdHex,
        32,
        'tracker NFT ID',
      ),
      programIdHex: fixedHex(statement.programIdHex, 32, 'program ID'),
      verifierProfileIdHex: fixedHex(
        statement.profileIdHex,
        32,
        'verifier profile ID',
      ),
    },
    checkpoint: {
      statementDigestHex: fixedHex(
        statement.statementDigestHex,
        32,
        'statement digest',
      ),
      publicInputsDigestHex: fixedHex(
        publicInputs.publicInputsDigestHex,
        32,
        'public inputs digest',
      ),
      checkpointCommitmentHex: fixedHex(
        publicInputs.checkpointCommitmentHex,
        32,
        'checkpoint commitment',
      ),
      sidechainHeight: positiveLong(
        checkpoint.sidechainHeight,
        'checkpoint sidechain height',
      ),
      sidechainConsensusBlockHashHex: fixedHex(
        checkpoint.sidechainConsensusBlockHashHex,
        32,
        'checkpoint consensus block hash',
      ),
      executionBlockHashHex: fixedHex(
        checkpoint.executionBlockHashHex,
        32,
        'checkpoint execution block hash',
      ),
      bridgeEventRootHex: fixedHex(
        checkpoint.bridgeEventRootHex,
        32,
        'checkpoint bridge event root',
      ),
      burnLeafCount: safeUint32(
        checkpoint.burnLeafCount,
        'checkpoint burn leaf count',
      ),
      finalityAuthoritySetId: nonnegativeLong(
        checkpoint.finalityAuthoritySetId,
        'checkpoint finality authority set ID',
      ),
      finalityAuthoritySetHashHex: fixedHex(
        checkpoint.finalityAuthoritySetHashHex,
        32,
        'checkpoint finality authority set hash',
      ),
      finalityProofHashHex: fixedHex(
        checkpoint.finalityProofHashHex,
        32,
        'checkpoint finality proof hash',
      ),
      targetNativeStateRootHex: fixedHex(
        publicInputs.targetNativeStateRootHex,
        32,
        'target native state root',
      ),
      trustedAnchorDigestHex: fixedHex(
        publicInputs.trustedAnchorDigestHex,
        32,
        'trusted anchor digest',
      ),
      finalityHorizonHeight: positiveLong(
        publicInputs.finalityHorizonHeight,
        'finality horizon height',
      ),
      finalityHorizonHashHex: fixedHex(
        publicInputs.finalityHorizonHashHex,
        32,
        'finality horizon hash',
      ),
      extensionKeyHex: publicInputs.extensionKeyHex,
      extensionValueHex: variableHex(
        publicInputs.extensionValueHex,
        'extension value',
      ),
    },
    mappedBurn: {
      transactionIndex: safeUint32(
        burn.transactionIndex,
        'Frontier burn transaction index',
      ),
      logIndex: safeUint32(burn.logIndex, 'Frontier burn log index'),
      eventIndex: proof.leaf.eventIndex,
      sidechainTxHashHex: proof.leaf.sidechainTxHashHex,
      burnIdHex: proof.leaf.burnIdHex,
      burnLeafHex: proof.leaf.encodedLeafHex,
      burnLeafHashHex: proof.leaf.leafHashHex,
      recipientErgoTreeHex: variableHex(
        settlement.burn.recipientErgoTreeHex,
        'settlement recipient ErgoTree',
      ),
      recipientErgoTreeHashHex: proof.leaf.recipientErgoTreeHashHex,
      amountNanoErg: proof.leaf.amountNanoErg,
      assetIdHex: proof.leaf.assetIdHex,
      leafIndex: proof.leafIndex,
      leafCount: proof.leafCount,
    },
    settlement: {
      trackerKeyHex: fixedHex(
        historical.bindings.trackerKeyHex,
        32,
        'settlement tracker key',
      ),
      trackerValueHex: variableHex(
        historical.bindings.trackerValueHex,
        'settlement tracker value',
      ),
      payoutBoxIdHex: fixedHex(
        historical.bindings.payoutBoxIdHex,
        32,
        'settlement payout box ID',
      ),
      settlementTransactionIdHex: fixedHex(
        historical.bindings.settlementTransactionIdHex,
        32,
        'settlement transaction ID',
      ),
    },
    replay: {
      duplicatePreventionKeyHex: fixedHex(
        settlement.burn.duplicatePreventionKeyHex,
        32,
        'duplicate-prevention key',
      ),
      predecessorBoxIdHex: fixedHex(
        historical.bindings.duplicatePreventionPredecessorBoxIdHex,
        32,
        'duplicate-prevention predecessor box ID',
      ),
      successorBoxIdHex: fixedHex(
        historical.bindings.duplicatePreventionSuccessorBoxIdHex,
        32,
        'duplicate-prevention successor box ID',
      ),
      inputDigestHex: fixedHex(
        historical.bindings.duplicatePreventionInputDigestHex,
        33,
        'duplicate-prevention input digest',
      ),
      outputDigestHex: fixedHex(
        historical.bindings.duplicatePreventionOutputDigestHex,
        33,
        'duplicate-prevention output digest',
      ),
      historicalTransitionContextDigestHex: fixedHex(
        historical.bindings.historicalTransitionContextDigestHex,
        32,
        'historical transition context digest',
      ),
    },
    boundaries,
  });
  const result = deepFreeze({
    ...binding,
    candidateDigestHex: sha256CanonicalJson(
      binding,
      CANDIDATE_DIGEST_DOMAIN,
    ),
  });
  if (validateSerializedBinding) {
    validateValidityApplicationPooledReserveSourceAdmissionCandidateV4Bindings(
      input,
      result,
    );
  }
  candidates.add(result);
  return result;
}

export function
assertValidityApplicationPooledReserveSourceAdmissionCandidateV4Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveSourceAdmissionCandidateV4
> {
  if (value === null || typeof value !== 'object' || !candidates.has(value)) {
    throw new Error(
      'pooled-reserve V4 source-admission candidate must be built in this process',
    );
  }
}

export function
validateValidityApplicationPooledReserveSourceAdmissionCandidateV4Bindings(
  input:
    BuildValidityApplicationPooledReserveSourceAdmissionCandidateV4Input,
  candidate: Readonly<
    ValidityApplicationPooledReserveSourceAdmissionCandidateV4
  >,
): void {
  exactObjectKeys(
    input,
    ['historicalJoin', 'burnSetAgreement'],
    'pooled-reserve V4 source-admission validation input',
  );
  const historical = input.historicalJoin;
  const agreement = input.burnSetAgreement;
  assertValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture(
    historical,
  );
  assertFrontierReturnedReceiptBurnSetAgreementProvenance(agreement);
  if (
    candidate === null
    || typeof candidate !== 'object'
    || candidate.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_ADMISSION_CANDIDATE_V4_SCHEMA
    || candidate.version !== 4
    || candidate.status !== 'non_authorizing_source_admission_candidate'
  ) {
    throw new Error('pooled-reserve V4 source-admission candidate identity is invalid');
  }

  const settlement = historical.settlementFixture.settlementPacket;
  const tracker = historical.settlementFixture.trackerContext;
  const statement = decodeEip0045PooledReserveBurnStatementV4(
    tracker.statement.encodedHex,
  );
  const runtime = statement.publicInputs.application.runtimeProfile;
  const checkpoint = statement.publicInputs.checkpoint;
  const checks: readonly [boolean, string][] = [
    [
      address(candidate.application.tokenAddress, 'candidate token address')
        === address(runtime.tokenAddressHex, 'statement token address'),
      'token address',
    ],
    [
      fixedHex(
        candidate.application.bridgeRuntimeCodeSha256Hex,
        32,
        'candidate bridge runtime code hash',
      ) === fixedHex(
        runtime.bridgeRuntimeCodeSha256Hex,
        32,
        'statement bridge runtime code hash',
      ),
      'bridge runtime code hash',
    ],
    [
      fixedHex(
        candidate.application.tokenRuntimeCodeSha256Hex,
        32,
        'candidate token runtime code hash',
      ) === fixedHex(
        runtime.tokenRuntimeCodeSha256Hex,
        32,
        'statement token runtime code hash',
      ),
      'token runtime code hash',
    ],
    [
      fixedHex(
        candidate.checkpoint.sidechainConsensusBlockHashHex,
        32,
        'candidate consensus block hash',
      ) === fixedHex(
        checkpoint.sidechainConsensusBlockHashHex,
        32,
        'statement consensus block hash',
      )
      && fixedHex(
        candidate.checkpoint.sidechainConsensusBlockHashHex,
        32,
        'candidate tracker consensus block hash',
      ) === fixedHex(
        settlement.tracker.decodedValue.sidechainConsensusBlockHashHex,
        32,
        'tracker consensus block hash',
      ),
      'consensus block hash',
    ],
    [
      fixedHex(
        candidate.checkpoint.executionBlockHashHex,
        32,
        'candidate execution block hash',
      ) === fixedHex(
        checkpoint.executionBlockHashHex,
        32,
        'statement execution block hash',
      )
      && fixedHex(
        candidate.checkpoint.executionBlockHashHex,
        32,
        'candidate Frontier execution block hash',
      ) === fixedHex(
        agreement.view.executionBlockHashHex,
        32,
        'Frontier execution block hash',
      ),
      'execution block hash',
    ],
    [
      fixedHex(
        candidate.checkpoint.checkpointCommitmentHex,
        32,
        'candidate checkpoint commitment',
      ) === fixedHex(
        statement.publicInputs.checkpointCommitmentHex,
        32,
        'statement checkpoint commitment',
      )
      && fixedHex(
        candidate.checkpoint.checkpointCommitmentHex,
        32,
        'candidate tracker checkpoint commitment',
      ) === fixedHex(
        settlement.tracker.decodedValue.checkpointCommitmentHex,
        32,
        'tracker checkpoint commitment',
      ),
      'checkpoint commitment',
    ],
    [
      variableHex(
        candidate.settlement.trackerValueHex,
        'candidate tracker value',
      ) === variableHex(settlement.tracker.valueHex, 'settlement tracker value'),
      'tracker value',
    ],
    [
      fixedHex(
        candidate.settlement.settlementTransactionIdHex,
        32,
        'candidate settlement transaction ID',
      ) === fixedHex(
        settlement.transaction.txId,
        32,
        'settlement transaction ID',
      ),
      'settlement transaction',
    ],
    [
      variableHex(
        candidate.mappedBurn.recipientErgoTreeHex,
        'candidate burn recipient',
      ) === variableHex(
        settlement.burn.recipientErgoTreeHex,
        'settlement burn recipient',
      ),
      'burn recipient',
    ],
    [
      fixedHex(
        candidate.replay.predecessorBoxIdHex,
        32,
        'candidate DUP predecessor',
      ) === fixedHex(
        settlement.boxes.duplicatePreventionPredecessor.boxId,
        32,
        'settlement DUP predecessor',
      ),
      'DUP predecessor',
    ],
    [
      fixedHex(
        candidate.replay.successorBoxIdHex,
        32,
        'candidate DUP successor',
      ) === fixedHex(
        settlement.boxes.duplicatePreventionSuccessor.boxId,
        32,
        'settlement DUP successor',
      ),
      'DUP successor',
    ],
  ];
  const failed = checks.find(([matched]) => !matched);
  if (failed !== undefined) {
    throw new Error(
      `pooled-reserve V4 serialized source-admission candidate mismatch at ${failed[1]}`,
    );
  }
  const { candidateDigestHex, ...binding } = candidate;
  if (
    fixedHex(candidateDigestHex, 32, 'source-admission candidate digest')
      !== sha256CanonicalJson(binding, CANDIDATE_DIGEST_DOMAIN)
  ) {
    throw new Error(
      'pooled-reserve V4 serialized source-admission candidate digest mismatch',
    );
  }
  const expected = buildSourceAdmissionCandidate(input, false);
  if (canonicalJson(candidate) !== canonicalJson(expected)) {
    throw new Error(
      'pooled-reserve V4 serialized source-admission candidate does not exactly match process-provenant producers',
    );
  }
}

function assertApplicationBindings(input: {
  readonly historical: Readonly<
    ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture
  >;
  readonly compiled:
    ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture[
      'settlementFixture'
    ]['compiledInstance'];
  readonly tracker:
    ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture[
      'settlementFixture'
    ]['trackerContext'];
  readonly settlement:
    ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture[
      'settlementFixture'
    ]['settlementPacket'];
  readonly statement: ReturnType<
    typeof decodeEip0045PooledReserveBurnStatementV4
  >;
}): void {
  const { historical, compiled, tracker, settlement, statement } = input;
  const publicInputs = statement.publicInputs;
  const application = publicInputs.application;
  const runtime = application.runtimeProfile;
  const failed = [
    [statement.statementDigestHex === tracker.statement.digestHex, 'statement'],
    [
      statement.encodedStatementHex === tracker.statement.encodedHex,
      'encoded statement',
    ],
    [
      publicInputs.encodedPublicInputsHex === tracker.statement.publicInputsHex,
      'public inputs',
    ],
    [
      publicInputs.publicInputsDigestHex
        === tracker.statement.publicInputsDigestHex,
      'public-input digest',
    ],
    [
      variableHex(application.encodedBindingHex, 'statement application binding')
        === variableHex(compiled.application.burnBindingHex, 'compiled application binding'),
      'application binding',
    ],
    [
      fixedHex(
        publicInputs.applicationBindingDigestHex,
        32,
        'statement application binding digest',
      )
        === fixedHex(
          compiled.application.burnBindingDigestHex,
          32,
          'compiled burn binding digest',
        ),
      'application-binding digest',
    ],
    [
      fixedHex(
        publicInputs.applicationBindingDigestHex,
        32,
        'statement historical application binding digest',
      ) === fixedHex(
        historical.bindings.applicationBindingDigestHex,
        32,
        'historical application binding digest',
      ),
      'historical application binding',
    ],
    [
      variableHex(
        application.runtimeProfileScaleHex,
        'statement runtime profile',
      )
        === variableHex(
          compiled.application.runtimeProfileScaleHex,
          'compiled runtime profile',
        ),
      'runtime profile',
    ],
    [
      fixedHex(
        application.runtimeProfileIdHex,
        32,
        'statement runtime profile ID',
      )
        === fixedHex(
          compiled.application.runtimeProfileIdHex,
          32,
          'compiled runtime profile ID',
        ),
      'runtime profile ID',
    ],
    [
      fixedHex(runtime.lineageProfileIdHex, 32, 'runtime lineage profile ID')
        === fixedHex(
          compiled.lineageProfileIdHex,
          32,
          'compiled lineage profile ID',
        ),
      'lineage profile',
    ],
    [
      fixedHex(
        application.sourceRuntimeCodeSha256Hex,
        32,
        'statement source runtime code hash',
      )
        === fixedHex(
          compiled.application.sourceRuntimeCodeSha256Hex,
          32,
          'compiled source runtime code hash',
        ),
      'source runtime code hash',
    ],
    [
      application.sourceRuntimeCodeBytes
        === compiled.application.sourceRuntimeCodeBytes,
      'source runtime code size',
    ],
    [
      fixedHex(application.trackerNftIdHex, 32, 'statement tracker NFT')
        === fixedHex(compiled.genesis.trackerNftIdHex, 32, 'compiled tracker NFT'),
      'tracker NFT',
    ],
    [
      fixedHex(
        application.settlementTrackerContractIdHex,
        32,
        'statement tracker contract',
      ) === fixedHex(
        compiled.contracts.tracker.receipt.contractIdHex,
        32,
        'compiled tracker contract',
      ),
      'tracker contract',
    ],
    [
      statement.chainDomainIdHex
        === fixedHex(runtime.sourceNetworkIdHex, 32, 'runtime source network'),
      'statement chain domain',
    ],
    [
      statement.profileIdHex
        === fixedHex(compiled.application.verifierProfileIdHex, 32, 'verifier profile'),
      'statement verifier profile',
    ],
    [
      statement.programIdHex
        === fixedHex(compiled.application.programIdHex, 32, 'program ID'),
      'statement program',
    ],
    [
      fixedHex(statement.contractIdHex, 32, 'statement contract')
        === fixedHex(
          compiled.contracts.tracker.receipt.contractIdHex,
          32,
          'compiled statement contract',
        ),
      'statement contract',
    ],
    [
      fixedHex(
        settlement.tracker.decodedValue.applicationBindingDigestHex,
        32,
        'tracker application binding digest',
      ) === fixedHex(
        publicInputs.applicationBindingDigestHex,
        32,
        'public-input application binding digest',
      ),
      'tracker application binding',
    ],
  ].find(([matched]) => matched !== true);
  if (failed !== undefined) {
    throw new Error(
      `pooled-reserve V4 source-admission application mismatch at ${failed[1]}`,
    );
  }
}

function assertCheckpointAndEventSet(input: {
  readonly checkpoint: ReturnType<
    typeof decodeEip0045PooledReserveBurnStatementV4
  >['publicInputs']['checkpoint'];
  readonly publicInputs: ReturnType<
    typeof decodeEip0045PooledReserveBurnStatementV4
  >['publicInputs'];
  readonly settlement:
    ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture[
      'settlementFixture'
    ]['settlementPacket'];
  readonly view: FrontierReturnedReceiptBurnSetAgreement['view'];
  readonly runtime: ReturnType<
    typeof decodeEip0045PooledReserveBurnStatementV4
  >['publicInputs']['application']['runtimeProfile'];
}): void {
  const { checkpoint, publicInputs, settlement, view, runtime } = input;
  const failed = [
    [
      fixedHex(view.sidechainIdHex, 32, 'Frontier sidechain ID')
        === fixedHex(runtime.sidechainIdHex, 32, 'runtime sidechain ID'),
      'sidechain ID',
    ],
    [
      address(view.bridgeAddress, 'Frontier bridge address')
        === address(runtime.bridgeAddressHex, 'runtime bridge address'),
      'bridge address',
    ],
    [
      BigInt(safeUint32(view.executionBlockNumber, 'Frontier block number'))
        === BigInt(positiveLong(checkpoint.sidechainHeight, 'checkpoint height')),
      'sidechain height',
    ],
    [
      fixedHex(view.executionBlockHashHex, 32, 'Frontier block hash')
        === checkpoint.executionBlockHashHex,
      'execution block hash',
    ],
    [
      fixedHex(view.bridgeEventRootHex, 32, 'Frontier bridge event root')
        === checkpoint.bridgeEventRootHex,
      'bridge event root',
    ],
    [
      safeUint32(view.burnLeafCount, 'Frontier burn leaf count')
        === checkpoint.burnLeafCount,
      'burn leaf count',
    ],
    [view.burns.length === view.burnLeafCount, 'returned burn count'],
    [
      publicInputs.checkpointCommitmentHex
        === settlement.tracker.decodedValue.checkpointCommitmentHex,
      'tracker checkpoint commitment',
    ],
    [
      checkpoint.bridgeEventRootHex
        === settlement.tracker.decodedValue.bridgeEventRootHex,
      'tracker bridge event root',
    ],
    [
      checkpoint.burnLeafCount
        === settlement.tracker.decodedValue.burnLeafCount,
      'tracker burn leaf count',
    ],
    [
      checkpoint.sidechainConsensusBlockHashHex
        === settlement.tracker.decodedValue.sidechainConsensusBlockHashHex,
      'tracker consensus block hash',
    ],
    [
      checkpoint.executionBlockHashHex
        === settlement.burn.leaf.sidechainBlockHashHex,
      'settlement execution block hash',
    ],
  ].find(([matched]) => matched !== true);
  if (failed !== undefined) {
    throw new Error(
      `pooled-reserve V4 source-admission checkpoint/event mismatch at ${failed[1]}`,
    );
  }
}

function reconstructExactBurnProof(
  view: FrontierReturnedReceiptBurnSetAgreement['view'],
  targetBurnIdHex: string,
) {
  const leaves: TrustlessBurnLeafInput[] = view.burns.map(burn => ({
    sidechainIdHex: view.sidechainIdHex,
    sidechainBlockHashHex: view.executionBlockHashHex,
    burnIdHex: burn.burnIdHex,
    sidechainTxHashHex: burn.sidechainTxHashHex,
    eventIndex: burn.eventIndex,
    recipientErgoTreeHashHex: burn.recipientErgoTreeHashHex,
    amountNanoErg: burn.amountNanoErg,
    assetIdHex: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex,
  }));
  const proof = buildTrustlessBurnInclusionProof(leaves, targetBurnIdHex);
  if (
    proof.bridgeEventRootHex
      !== fixedHex(view.bridgeEventRootHex, 32, 'Frontier bridge event root')
    || proof.leafCount !== view.burnLeafCount
  ) {
    throw new Error(
      'returned Frontier burn set does not reproduce its committed root and count',
    );
  }
  return proof;
}

function exactObjectKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    throw new Error(`${label} has unexpected fields`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes}-byte hex`);
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(clean)) {
    throw new Error(`${label} must be ${bytes}-byte hex`);
  }
  return clean.toLowerCase();
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be whole-byte hex`);
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be whole-byte hex`);
  }
  return clean.toLowerCase();
}

function address(value: unknown, label: string): string {
  return `0x${fixedHex(value, 20, label)}`;
}

function safeUint32(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
    || value > 0xffff_ffff
  ) {
    throw new Error(`${label} must be a uint32`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function positiveLong(value: unknown, label: string): string {
  const normalized = nonnegativeLong(value, label);
  if (normalized === '0') {
    throw new Error(`${label} must be positive`);
  }
  return normalized;
}

function nonnegativeLong(value: unknown, label: string): string {
  try {
    const normalized = BigInt(value as string | number | bigint);
    if (normalized < 0n || normalized > 0xffff_ffff_ffff_ffffn) {
      throw new Error('out of range');
    }
    return normalized.toString();
  } catch {
    throw new Error(`${label} must be a uint64`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested, seen);
  }
  return Object.freeze(value);
}
