import {
  assertAuthenticatedV2DupReconstructionProvenance,
  type AuthenticatedV2DupReconstruction,
} from './authenticated-v2-dup-reconstruction.js';
import {
  assertAuthenticatedV2HistoricalPayoutAgreementProvenance,
  type AuthenticatedV2HistoricalPayoutAgreement,
} from './authenticated-v2-historical-payout-evidence.js';
import {
  assertFrontierReturnedReceiptBurnSetAgreementProvenance,
  type FrontierReturnedReceiptBurnSetAgreement,
} from './frontier-burn-proof-source.js';
import {
  assertNativeCheckpointSettlementAdmissionProvenance,
  getNativeCheckpointSettlementAdmissionProfileSha256Hex,
  type NativeCheckpointSettlementAdmission,
} from './native-checkpoint-settlement-admission.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
  derivePegInPooledReserveLineageProfileV4IdHex,
  PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  REVIEWED_AUTHENTICATED_V2_REPLAY_IMPORT_PROFILE_SHA256_HEXES,
} from './reviewed-native-checkpoint-settlement-profiles.js';

export const
VALIDITY_APPLICATION_POOLED_RESERVE_AUTHENTICATED_V2_EVENT_COMPLETE_MAPPING_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-authenticated-v2-event-complete-mapping.v4' as const;

const ADMISSION_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_AUTHENTICATED_V2_EVENT_MAPPING_ADMISSION_V4';
const MAPPING_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_AUTHENTICATED_V2_EVENT_COMPLETE_MAPPING_V4';

interface EventCompleteMappingProvenance {
  readonly compiledInstance: Readonly<
    ValidityApplicationPooledReserveInstanceV4Candidate
  >;
  readonly authenticatedV2Reconstruction: AuthenticatedV2DupReconstruction;
  readonly historicalPayoutAgreement:
    Readonly<AuthenticatedV2HistoricalPayoutAgreement>;
  readonly burnSetAgreement: Readonly<
    FrontierReturnedReceiptBurnSetAgreement
  >;
  readonly nativeCheckpointAdmission: NativeCheckpointSettlementAdmission;
}

const MAPPINGS = new WeakMap<object, EventCompleteMappingProvenance>();

export interface BuildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4Input {
  readonly compiledInstance: Readonly<
    ValidityApplicationPooledReserveInstanceV4Candidate
  >;
  readonly authenticatedV2Reconstruction: AuthenticatedV2DupReconstruction;
  readonly legacyHistoryKeyHex: string;
  readonly historicalPayoutAgreement:
    Readonly<AuthenticatedV2HistoricalPayoutAgreement>;
  readonly burnSetAgreement: Readonly<
    FrontierReturnedReceiptBurnSetAgreement
  >;
  readonly nativeCheckpointAdmission: NativeCheckpointSettlementAdmission;
}

export interface ValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4 {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_AUTHENTICATED_V2_EVENT_COMPLETE_MAPPING_V4_SCHEMA;
  readonly version: 4;
  readonly mappingDigestHex: string;
  readonly lineage: {
    readonly lineageProfileIdHex: string;
    readonly sidechainIdHex: string;
    readonly bridgeAddress: string;
    readonly settlementAssetIdHex: string;
    readonly nativeCheckpointSettlementProfileSha256Hex: string;
  };
  readonly legacySettlement: {
    readonly authenticatedV2ReconstructionDigestHex: string;
    readonly legacyHistoryKeyHex: string;
    readonly legacyKeySemantics: 'sidechain-transaction-hash';
    readonly historyIndex: number;
    readonly ergoSettlementTransactionIdHex: string;
    readonly ergoSettlementBlockIdHex: string;
    readonly payoutBoxIdHex: string;
    readonly payoutValueNanoErg: string;
    readonly payoutErgoTreeHex: string;
    readonly historicalPayoutAgreementDigestHex: string;
    readonly transactionSigmaDigestHex: string;
    readonly blockTransactionsRootHex: string;
    readonly sourceIdsHex: readonly [string, string];
  };
  readonly eventSet: {
    readonly executionBlockNumber: number;
    readonly executionBlockHashHex: string;
    readonly bridgeEventRootHex: string;
    readonly burnLeafCount: number;
    readonly viewDigestHex: string;
    readonly agreementDigestHex: string;
    readonly sourceIdsHex: readonly [string, string];
  };
  readonly mappedEvent: {
    readonly sidechainTxHashHex: string;
    readonly eventIndex: number;
    readonly canonicalBurnIdHex: string;
    readonly recipientErgoTreeHex: string;
    readonly recipientErgoTreeHashHex: string;
    readonly amountNanoErg: string;
    readonly nativeCheckpointAdmissionDigestHex: string;
  };
  readonly boundaries: {
    readonly exactHistoricalPayoutEvidenceMatched: true;
    readonly admittedReturnedBurnSetMatched: true;
    readonly receiptArrayCompletenessAuthenticated: false;
    readonly distinctSourceAgreementVerified: true;
    readonly nativeCheckpointAdmissionMatched: true;
    readonly operationalIndependenceEstablished: false;
    readonly legacyRouteRetired: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

export function buildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4(
  input:
    BuildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4Input,
): Readonly<
  ValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4
> {
  assertExactObjectKeys(
    input,
    [
      'compiledInstance',
      'authenticatedV2Reconstruction',
      'legacyHistoryKeyHex',
      'historicalPayoutAgreement',
      'burnSetAgreement',
      'nativeCheckpointAdmission',
    ],
    'authenticated V2 event-complete mapping input',
  );
  const compiled = input.compiledInstance;
  const reconstruction = input.authenticatedV2Reconstruction;
  const historicalPayoutAgreement = input.historicalPayoutAgreement;
  const agreement = input.burnSetAgreement;
  const admission = input.nativeCheckpointAdmission;

  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(compiled);
  assertAuthenticatedV2DupReconstructionProvenance(reconstruction);
  assertAuthenticatedV2HistoricalPayoutAgreementProvenance(
    historicalPayoutAgreement,
    {
      authenticatedV2Reconstruction: reconstruction,
      legacyHistoryKeyHex: input.legacyHistoryKeyHex,
    },
  );
  assertFrontierReturnedReceiptBurnSetAgreementProvenance(agreement);
  assertNativeCheckpointSettlementAdmissionProvenance(admission);
  const nativeCheckpointSettlementProfileSha256Hex = prefixedFixedHex(
    getNativeCheckpointSettlementAdmissionProfileSha256Hex(admission),
    32,
    'native checkpoint settlement admission source profile digest',
  );
  if (
    !REVIEWED_AUTHENTICATED_V2_REPLAY_IMPORT_PROFILE_SHA256_HEXES.includes(
      nativeCheckpointSettlementProfileSha256Hex,
    )
  ) {
    throw new Error(
      'native checkpoint settlement admission source profile is not approved '
      + 'for authenticated V2 replay import',
    );
  }

  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  if (
    derivePegInPooledReserveLineageProfileV4IdHex(profile)
    !== compiled.lineageProfileIdHex
  ) {
    throw new Error(
      'compiled V4 lineage profile identity does not match its encoded bytes',
    );
  }
  const sidechainIdHex = fixedHex(
    profile.sidechainIdHex,
    32,
    'compiled V4 sidechain ID',
  );
  const bridgeAddress = address(
    profile.bridgeAddressHex,
    'compiled V4 bridge address',
  );
  const settlementAssetIdHex = fixedHex(
    profile.settlementAssetIdHex,
    32,
    'compiled V4 settlement asset ID',
  );
  if (
    settlementAssetIdHex
    !== fixedHex(
      PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX,
      32,
      'native ERG settlement asset ID',
    )
  ) {
    throw new Error(
      'authenticated V2 event-complete mapping requires the native ERG lane',
    );
  }

  const legacyHistoryKeyHex = fixedHex(
    input.legacyHistoryKeyHex,
    32,
    'authenticated V2 legacy history key',
  );
  const historyIndexes = reconstruction.historyKeys
    .map((value, index) => ({
      value: fixedHex(
        value,
        32,
        `authenticated V2 history key ${index}`,
      ),
      index,
    }))
    .filter(entry => entry.value === legacyHistoryKeyHex);
  if (historyIndexes.length !== 1) {
    throw new Error(
      'authenticated V2 event-complete mapping requires exactly one legacy history key',
    );
  }
  const historyIndex = historyIndexes[0].index;
  if (reconstruction.transitions.length !== reconstruction.historyKeys.length) {
    throw new Error(
      'authenticated V2 transition history does not match its reconstructed keys',
    );
  }
  const transition = reconstruction.transitions[historyIndex];
  if (
    fixedHex(
      transition?.burnIdHex,
      32,
      'authenticated V2 transition history key',
    ) !== legacyHistoryKeyHex
  ) {
    throw new Error(
      'authenticated V2 transition does not match the selected legacy history key',
    );
  }
  const historicalPayout = historicalPayoutAgreement.view;
  const payoutValueNanoErg = positiveLong(
    historicalPayout.payoutValueNanoErg,
    'authenticated V2 canonical historical payout value',
  );
  const payoutErgoTreeHex = variableHex(
    historicalPayout.payoutErgoTreeHex,
    'authenticated V2 canonical historical payout ErgoTree',
  );
  if (
    fixedHex(
      historicalPayout.authenticatedV2ReconstructionDigestHex,
      32,
      'historical payout reconstruction digest',
    ) !== fixedHex(
      reconstruction.observationDigestHex,
      32,
      'authenticated V2 reconstruction digest',
    )
    || fixedHex(
      historicalPayout.legacyHistoryKeyHex,
      32,
      'historical payout history key',
    ) !== legacyHistoryKeyHex
    || safeInteger(
      historicalPayout.historyIndex,
      'historical payout history index',
    ) !== historyIndex
    || fixedHex(
      historicalPayout.ergoSettlementTransactionIdHex,
      32,
      'historical payout settlement transaction ID',
    ) !== fixedHex(
      transition.spendingTransactionIdHex,
      32,
      'authenticated V2 settlement transaction ID',
    )
    || fixedHex(
      historicalPayout.ergoSettlementBlockIdHex,
      32,
      'historical payout settlement block ID',
    ) !== fixedHex(
      transition.spendingBlockIdHex,
      32,
      'authenticated V2 settlement block ID',
    )
    || safeInteger(
      historicalPayout.ergoSettlementInclusionHeight,
      'historical payout settlement inclusion height',
    ) !== safeInteger(
      transition.spendingInclusionHeight,
      'authenticated V2 settlement inclusion height',
    )
    || historicalPayout.payoutOutputIndex !== 1
    || fixedHex(
      historicalPayout.payoutBoxIdHex,
      32,
      'historical payout box ID',
    ) !== fixedHex(
      transition.payoutBoxIdHex,
      32,
      'authenticated V2 payout box ID',
    )
    || payoutValueNanoErg !== positiveLong(
      transition.payoutValueNanoErg,
      'authenticated V2 reconstructed payout value',
    )
  ) {
    throw new Error(
      'canonical historical payout evidence does not match the authenticated V2 transition',
    );
  }

  const view = agreement.view;
  if (
    fixedHex(view.sidechainIdHex, 32, 'Frontier burn-set sidechain ID')
      !== sidechainIdHex
  ) {
    throw new Error(
      'Frontier burn-set sidechain does not match the compiled V4 lineage',
    );
  }
  if (
    address(view.bridgeAddress, 'Frontier burn-set bridge address')
      !== bridgeAddress
  ) {
    throw new Error(
      'Frontier burn-set bridge address does not match the compiled V4 lineage',
    );
  }
  const executionBlockNumber = safeInteger(
    view.executionBlockNumber,
    'Frontier burn-set execution block number',
  );
  const executionBlockHashHex = fixedHex(
    view.executionBlockHashHex,
    32,
    'Frontier burn-set execution block hash',
  );
  const bridgeEventRootHex = fixedHex(
    view.bridgeEventRootHex,
    32,
    'Frontier bridge event root',
  );
  const burnLeafCount = uint32(
    view.burnLeafCount,
    'Frontier burn leaf count',
  );
  if (burnLeafCount < 1 || view.burns.length !== burnLeafCount) {
    throw new Error(
      'Frontier burn-set leaf count does not match its returned burn list',
    );
  }
  if (
    view.burns.some(burn =>
      fixedHex(burn.burnIdHex, 32, 'Frontier burn ID')
      === legacyHistoryKeyHex
    )
  ) {
    throw new Error(
      'selected authenticated V2 history key is already an event-level burn ID',
    );
  }

  const transactionBurns = view.burns.filter(burn =>
    fixedHex(
      burn.sidechainTxHashHex,
      32,
      'Frontier burn transaction hash',
    ) === legacyHistoryKeyHex
  );
  if (transactionBurns.length === 0) {
    throw new Error(
      'legacy transaction-level replay key is absent from the admitted Frontier burn set',
    );
  }
  const payoutMatches = transactionBurns.filter(burn =>
    positiveLong(burn.amountNanoErg, 'Frontier burn amount')
      === payoutValueNanoErg
    && variableHex(
      burn.recipientErgoTreeHex,
      'Frontier burn recipient ErgoTree',
    ) === payoutErgoTreeHex
  );
  if (payoutMatches.length !== 1) {
    throw new Error(
      'legacy transaction-level replay key does not map uniquely to one '
      + 'Frontier burn by exact payout value and ErgoTree',
    );
  }
  const mappedBurn = payoutMatches[0];
  const eventIndex = uint32(
    mappedBurn.eventIndex,
    'mapped Frontier burn event index',
  );
  const canonicalBurnIdHex = fixedHex(
    mappedBurn.burnIdHex,
    32,
    'mapped Frontier canonical burn ID',
  );
  const recipientErgoTreeHashHex = fixedHex(
    mappedBurn.recipientErgoTreeHashHex,
    32,
    'mapped Frontier recipient ErgoTree hash',
  );

  if (
    fixedHex(admission.sidechainIdHex, 32, 'native admission sidechain ID')
      !== sidechainIdHex
    || uint64(admission.sidechainHeight, 'native admission sidechain height')
      !== BigInt(executionBlockNumber)
    || fixedHex(
      admission.executionBlockHashHex,
      32,
      'native admission execution block hash',
    ) !== executionBlockHashHex
    || fixedHex(
      admission.bridgeEventRootHex,
      32,
      'native admission bridge event root',
    ) !== bridgeEventRootHex
    || uint32(
      admission.burnLeafCount,
      'native admission burn leaf count',
    ) !== burnLeafCount
  ) {
    throw new Error(
      'native checkpoint admission does not match the returned Frontier burn set',
    );
  }
  if (
    fixedHex(
      admission.sidechainTxHashHex,
      32,
      'native admission transaction hash',
    ) !== legacyHistoryKeyHex
    || uint32(admission.eventIndex, 'native admission event index')
      !== eventIndex
    || fixedHex(admission.burnIdHex, 32, 'native admission burn ID')
      !== canonicalBurnIdHex
    || fixedHex(
      admission.recipientErgoTreeHashHex,
      32,
      'native admission recipient ErgoTree hash',
    ) !== recipientErgoTreeHashHex
    || positiveLong(admission.amountNanoErg, 'native admission amount')
      !== payoutValueNanoErg
    || fixedHex(admission.assetIdHex, 32, 'native admission asset ID')
      !== settlementAssetIdHex
  ) {
    throw new Error(
      'native checkpoint admission does not match the uniquely mapped historical payout event',
    );
  }

  const nativeCheckpointAdmissionDigestHex = sha256CanonicalJson(
    admission,
    ADMISSION_DIGEST_DOMAIN,
  );
  const mappingWithoutDigest = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_AUTHENTICATED_V2_EVENT_COMPLETE_MAPPING_V4_SCHEMA,
    version: 4 as const,
    lineage: {
      lineageProfileIdHex: compiled.lineageProfileIdHex,
      sidechainIdHex,
      bridgeAddress,
      settlementAssetIdHex,
      nativeCheckpointSettlementProfileSha256Hex,
    },
    legacySettlement: {
      authenticatedV2ReconstructionDigestHex: fixedHex(
        reconstruction.observationDigestHex,
        32,
        'authenticated V2 reconstruction digest',
      ),
      legacyHistoryKeyHex,
      legacyKeySemantics: 'sidechain-transaction-hash' as const,
      historyIndex,
      ergoSettlementTransactionIdHex: fixedHex(
        transition.spendingTransactionIdHex,
        32,
        'authenticated V2 settlement transaction ID',
      ),
      ergoSettlementBlockIdHex: fixedHex(
        transition.spendingBlockIdHex,
        32,
        'authenticated V2 settlement block ID',
      ),
      payoutBoxIdHex: fixedHex(
        historicalPayout.payoutBoxIdHex,
        32,
        'authenticated V2 payout box ID',
      ),
      payoutValueNanoErg,
      payoutErgoTreeHex,
      historicalPayoutAgreementDigestHex: fixedHex(
        historicalPayoutAgreement.sources.agreementDigestHex,
        32,
        'authenticated V2 historical payout agreement digest',
      ),
      transactionSigmaDigestHex: fixedHex(
        historicalPayout.transactionSigmaDigestHex,
        32,
        'authenticated V2 historical transaction sigma digest',
      ),
      blockTransactionsRootHex: fixedHex(
        historicalPayout.blockTransactionsRootHex,
        32,
        'authenticated V2 historical block transactions root',
      ),
      sourceIdsHex: deepFreeze([
        fixedHex(
          historicalPayoutAgreement.sources.sourceIdsHex[0],
          32,
          'primary authenticated V2 historical payout source ID',
        ),
        fixedHex(
          historicalPayoutAgreement.sources.sourceIdsHex[1],
          32,
          'witness authenticated V2 historical payout source ID',
        ),
      ] as const),
    },
    eventSet: {
      executionBlockNumber,
      executionBlockHashHex,
      bridgeEventRootHex,
      burnLeafCount,
      viewDigestHex: fixedHex(
        view.viewDigestHex,
        32,
        'Frontier burn-set view digest',
      ),
      agreementDigestHex: fixedHex(
        agreement.sources.agreementDigestHex,
        32,
        'Frontier burn-set agreement digest',
      ),
      sourceIdsHex: deepFreeze([
        fixedHex(
          agreement.sources.sourceIdsHex[0],
          32,
          'primary Frontier burn-set source ID',
        ),
        fixedHex(
          agreement.sources.sourceIdsHex[1],
          32,
          'witness Frontier burn-set source ID',
        ),
      ] as const),
    },
    mappedEvent: {
      sidechainTxHashHex: legacyHistoryKeyHex,
      eventIndex,
      canonicalBurnIdHex,
      recipientErgoTreeHex: payoutErgoTreeHex,
      recipientErgoTreeHashHex,
      amountNanoErg: payoutValueNanoErg,
      nativeCheckpointAdmissionDigestHex,
    },
    boundaries: {
      exactHistoricalPayoutEvidenceMatched: true as const,
      admittedReturnedBurnSetMatched: true as const,
      receiptArrayCompletenessAuthenticated: false as const,
      distinctSourceAgreementVerified: true as const,
      nativeCheckpointAdmissionMatched: true as const,
      operationalIndependenceEstablished: false as const,
      legacyRouteRetired: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const mapping = deepFreeze({
    ...mappingWithoutDigest,
    mappingDigestHex: sha256CanonicalJson(
      mappingWithoutDigest,
      MAPPING_DIGEST_DOMAIN,
    ),
  });
  MAPPINGS.set(mapping, {
    compiledInstance: compiled,
    authenticatedV2Reconstruction: reconstruction,
    historicalPayoutAgreement,
    burnSetAgreement: agreement,
    nativeCheckpointAdmission: admission,
  });
  return mapping;
}

export function assertValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4Provenance(
  value: unknown,
  expected?: Readonly<{
    compiledInstance?: Readonly<
      ValidityApplicationPooledReserveInstanceV4Candidate
    >;
    authenticatedV2Reconstruction?: AuthenticatedV2DupReconstruction;
    nativeCheckpointAdmission?: NativeCheckpointSettlementAdmission;
  }>,
): asserts value is Readonly<
  ValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4
> {
  if (value === null || typeof value !== 'object') {
    throw new Error(
      'authenticated V2 event-complete mapping provenance is missing',
    );
  }
  const provenance = MAPPINGS.get(value);
  if (provenance === undefined) {
    throw new Error(
      'authenticated V2 event-complete mapping provenance is missing',
    );
  }
  if (
    expected?.compiledInstance !== undefined
    && provenance.compiledInstance !== expected.compiledInstance
  ) {
    throw new Error(
      'authenticated V2 event-complete mapping uses another compiled V4 instance',
    );
  }
  if (
    expected?.authenticatedV2Reconstruction !== undefined
    && provenance.authenticatedV2Reconstruction
      !== expected.authenticatedV2Reconstruction
  ) {
    throw new Error(
      'authenticated V2 event-complete mapping uses another DUP reconstruction',
    );
  }
  if (
    expected?.nativeCheckpointAdmission !== undefined
    && provenance.nativeCheckpointAdmission
      !== expected.nativeCheckpointAdmission
  ) {
    throw new Error(
      'authenticated V2 event-complete mapping uses another checkpoint admission',
    );
  }
}

function assertExactObjectKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (
    actual.length !== allowed.length
    || actual.some((key, index) => key !== allowed[index])
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function address(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be an exact 20-byte address`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (normalized.length !== 40 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} must be an exact 20-byte address`);
  }
  return `0x${normalized}`;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (
    normalized.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return normalized;
}

function prefixedFixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  return `0x${fixedHex(value, bytes, label)}`;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return normalized;
}

function positiveLong(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    && typeof value !== 'number'
    && typeof value !== 'bigint'
  ) {
    throw new Error(`${label} must be a positive signed 64-bit integer`);
  }
  if (
    typeof value === 'number'
    && (!Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new Error(`${label} must be a positive signed 64-bit integer`);
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${label} must be a positive signed 64-bit integer`);
  }
  if (parsed <= 0n || parsed > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} must be a positive signed 64-bit integer`);
  }
  return parsed.toString();
}

function uint32(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
    || value > 0xffff_ffff
  ) {
    throw new Error(`${label} must fit uint32`);
  }
  return value;
}

function safeInteger(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function uint64(value: unknown, label: string): bigint {
  if (
    typeof value !== 'string'
    && typeof value !== 'number'
    && typeof value !== 'bigint'
  ) {
    throw new Error(`${label} must fit uint64`);
  }
  if (
    typeof value === 'number'
    && (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error(`${label} must fit uint64`);
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${label} must fit uint64`);
  }
  if (parsed < 0n || parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit uint64`);
  }
  return parsed;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (
    value === null
    || typeof value !== 'object'
    || seen.has(value as object)
  ) {
    return value as Readonly<T>;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
