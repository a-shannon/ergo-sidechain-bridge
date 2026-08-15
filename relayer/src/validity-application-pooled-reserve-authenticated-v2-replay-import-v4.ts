import { getDupTreeDigest } from './avl-bridge.js';
import {
  assertAuthenticatedV2DupReconstructionProvenance,
  type AuthenticatedV2DupReconstruction,
} from './authenticated-v2-dup-reconstruction.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
} from './ergo-encoding.js';
import {
  assertNativeCheckpointSettlementAdmissionProvenance,
  getNativeCheckpointSettlementAdmissionProfileSha256Hex,
  type NativeCheckpointSettlementAdmission,
} from './native-checkpoint-settlement-admission.js';
import {
  REVIEWED_AUTHENTICATED_V2_REPLAY_IMPORT_PROFILE_SHA256_HEXES,
} from './reviewed-native-checkpoint-settlement-profiles.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
  derivePegInPooledReserveLineageProfileV4IdHex,
  PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  assertValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4Provenance,
  type ValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4,
} from './validity-application-pooled-reserve-authenticated-v2-event-complete-mapping-v4.js';

export const
VALIDITY_APPLICATION_POOLED_RESERVE_AUTHENTICATED_V2_REPLAY_IMPORT_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-authenticated-v2-replay-import.v4' as const;

const PACKET_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_AUTHENTICATED_V2_REPLAY_IMPORT_V4';
const ADMISSION_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_AUTHENTICATED_V2_REPLAY_ADMISSION_V4';
const DUP_VALUE_BYTES = 1;
const packets = new WeakSet<object>();

export interface BuildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Input {
  readonly compiledInstance: Readonly<
    ValidityApplicationPooledReserveInstanceV4Candidate
  >;
  readonly authenticatedV2Reconstruction: AuthenticatedV2DupReconstruction;
  readonly admissions: readonly NativeCheckpointSettlementAdmission[];
  readonly eventCompleteMappings?: readonly Readonly<
    ValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4
  >[];
}

export interface ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_AUTHENTICATED_V2_REPLAY_IMPORT_V4_SCHEMA;
  readonly version: 4;
  readonly packetDigestHex: string;
  readonly lineage: {
    readonly lineageProfileIdHex: string;
    readonly encodedLineageProfileHex: string;
    readonly sidechainIdHex: string;
    readonly settlementAssetIdHex: string;
    readonly settlementProfileIdHex: string;
  };
  readonly source: {
    readonly authenticatedV2ReconstructionDigestHex: string;
    readonly authenticatedV2DuplicatePreventionNftIdHex: string;
    readonly authenticatedV2DuplicatePreventionErgoTreeHex: string;
    readonly authenticatedV2GenesisBoxIdHex: string;
    readonly authenticatedV2TipBoxIdHex: string;
    readonly authenticatedV2TipDigestHex: string;
    readonly authenticatedV2TipCounter: string;
    readonly nativeCheckpointAdmissionProfile:
      NativeCheckpointAdmissionProfileIdentity | null;
    readonly nativeCheckpointAdmissionDigestsHex: readonly string[];
  };
  readonly imports: readonly AuthenticatedV2ReplayImportEntryV4[];
  readonly duplicatePreventionGenesis: {
    readonly canonicalBurnIdsHex: readonly string[];
    readonly digestHex: string;
    readonly registers: {
      readonly R4: string;
      readonly R5: string;
    };
  };
  readonly boundaries: {
    readonly authenticatedV2LineageImported: true;
    readonly allLineagesImported: false;
    readonly legacyRoutesRetired: false;
    readonly profileActivated: false;
    readonly transactionConstructed: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

export type AuthenticatedV2ReplayImportEntryV4 =
  | CanonicalAuthenticatedV2ReplayImportEntryV4
  | EventCompleteAuthenticatedV2ReplayImportEntryV4;

export interface CanonicalAuthenticatedV2ReplayImportEntryV4 {
  readonly legacyHistoryKeyHex: string;
  readonly legacyKeySemantics: 'canonical-v4-burn-id';
  readonly sidechainTxHashHex: string;
  readonly eventIndex: number;
  readonly canonicalBurnIdHex: string;
  readonly nativeCheckpointAdmissionDigestHex: string;
}

export interface EventCompleteAuthenticatedV2ReplayImportEntryV4 {
  readonly legacyHistoryKeyHex: string;
  readonly legacyKeySemantics: 'legacy-transaction-hash-event-complete';
  readonly sidechainTxHashHex: string;
  readonly eventIndex: number;
  readonly canonicalBurnIdHex: string;
  readonly nativeCheckpointAdmissionDigestHex: string;
  readonly eventCompleteMappingDigestHex: string;
}

export interface NativeCheckpointAdmissionProfileIdentity {
  readonly sidechainIdHex: string;
  readonly assetIdHex: string;
  readonly finalityProofSystemId: number;
  readonly finalityProgramIdHex: string;
  readonly finalityVerifierProfileIdHex: string;
  readonly trustAnchorDigestHex: string;
}

export function buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4(
  input: BuildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Input,
): Readonly<
  ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet
> {
  const hasEventCompleteMappings = Object.prototype.hasOwnProperty.call(
    input,
    'eventCompleteMappings',
  );
  assertExactObjectKeys(
    input,
    [
      'compiledInstance',
      'authenticatedV2Reconstruction',
      'admissions',
      ...(hasEventCompleteMappings ? ['eventCompleteMappings'] : []),
    ],
    'authenticated V2 replay import input',
  );
  const compiled = input.compiledInstance;
  const reconstruction = input.authenticatedV2Reconstruction;
  const admissions = Array.isArray(input.admissions)
    ? [...input.admissions]
    : null;
  if (admissions === null) {
    throw new Error('authenticated V2 replay import admissions must be an array');
  }
  const eventCompleteMappings = input.eventCompleteMappings === undefined
    ? []
    : Array.isArray(input.eventCompleteMappings)
      ? [...input.eventCompleteMappings]
      : null;
  if (eventCompleteMappings === null) {
    throw new Error(
      'authenticated V2 event-complete mappings must be an array',
    );
  }

  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(compiled);
  assertAuthenticatedV2DupReconstructionProvenance(reconstruction);
  admissions.forEach((admission, index) => {
    try {
      assertNativeCheckpointSettlementAdmissionProvenance(admission);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `native checkpoint settlement admission ${index} provenance failed: ${detail}`,
      );
    }
  });

  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  const derivedLineageProfileIdHex =
    derivePegInPooledReserveLineageProfileV4IdHex(profile);
  if (
    derivedLineageProfileIdHex !== compiled.lineageProfileIdHex
    || profile.sidechainFinalityPolicyIdHex
      !== compiled.sidechainFinalityPolicy.policyIdHex
    || profile.proofSystemIdHex
      !== compiled.sidechainFinalityPolicy.proofSystemIdHex
    || profile.proofProfileIdHex
      !== compiled.sidechainFinalityPolicy.proofProfileIdHex
  ) {
    throw new Error(
      'compiled V4 lineage profile identity does not match its finality policy',
    );
  }
  if (
    profile.settlementAssetIdHex
    !== PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX
  ) {
    throw new Error('compiled V4 lineage profile must use the native ERG asset');
  }

  const sidechainIdHex = fixedHex(
    profile.sidechainIdHex,
    32,
    'compiled V4 sidechain ID',
  );
  const nativeErgAssetIdHex = fixedHex(
    PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX,
    32,
    'native ERG asset ID',
  );
  const historyKeys = reconstruction.historyKeys.map((value, index) =>
    fixedHex(value, 32, `authenticated V2 history key ${index}`)
  );
  assertUnique(historyKeys, 'authenticated V2 history key');
  if (
    reconstruction.transitions.length !== historyKeys.length
    || reconstruction.transitions.some((transition, index) =>
      fixedHex(
        transition.burnIdHex,
        32,
        `authenticated V2 transition ${index} burn ID`,
      ) !== historyKeys[index]
    )
  ) {
    throw new Error(
      'authenticated V2 transition history does not match its reconstructed keys',
    );
  }

  const normalizedAdmissions = admissions.map((admission, index) => {
    const normalized = normalizeAdmission(admission, index);
    if (normalized.sidechainIdHex !== sidechainIdHex) {
      throw new Error(
        `native checkpoint settlement admission ${index} sidechain `
        + 'does not match the compiled V4 lineage',
      );
    }
    if (normalized.assetIdHex !== nativeErgAssetIdHex) {
      throw new Error(
        `native checkpoint settlement admission ${index} asset `
        + 'does not match the native ERG settlement lane',
      );
    }
    return normalized;
  });

  const admissionProfile =
    normalizedAdmissions.length === 0
      ? null
      : normalizedAdmissions[0].profile;
  if (
    admissionProfile !== null
    && normalizedAdmissions.some(admission =>
      canonicalJson(admission.profile) !== canonicalJson(admissionProfile)
    )
  ) {
    throw new Error(
      'native checkpoint settlement admissions mix finality or settlement profiles',
    );
  }
  const admissionSourceProfileSha256Hex =
    normalizedAdmissions.length === 0
      ? null
      : normalizedAdmissions[0].sourceProfileSha256Hex;
  if (
    admissionSourceProfileSha256Hex !== null
    && normalizedAdmissions.some(admission =>
      admission.sourceProfileSha256Hex
        !== admissionSourceProfileSha256Hex
    )
  ) {
    throw new Error(
      'native checkpoint settlement admissions mix reviewed source profiles',
    );
  }

  const historyKeySet = new Set(historyKeys);
  const mappingByLegacyHistoryKey = new Map<
    string,
    Readonly<
      ValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4
    >
  >();
  for (const [index, mapping] of eventCompleteMappings.entries()) {
    try {
      assertValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4Provenance(
        mapping,
        {
          compiledInstance: compiled,
          authenticatedV2Reconstruction: reconstruction,
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `authenticated V2 event-complete mapping ${index} provenance failed: ${detail}`,
      );
    }
    const legacyHistoryKeyHex = fixedHex(
      mapping.legacySettlement.legacyHistoryKeyHex,
      32,
      `authenticated V2 event-complete mapping ${index} legacy history key`,
    );
    if (!historyKeySet.has(legacyHistoryKeyHex)) {
      throw new Error(
        `authenticated V2 event-complete mapping ${index} does not cover `
        + 'an authenticated V2 history key',
      );
    }
    if (mappingByLegacyHistoryKey.has(legacyHistoryKeyHex)) {
      throw new Error(
        `authenticated V2 history key ${legacyHistoryKeyHex} has duplicate `
        + 'event-complete mappings',
      );
    }
    mappingByLegacyHistoryKey.set(legacyHistoryKeyHex, mapping);
  }
  for (const admission of normalizedAdmissions) {
    if (
      !historyKeySet.has(admission.sidechainTxHashHex)
      && !historyKeySet.has(admission.canonicalBurnIdHex)
    ) {
      throw new Error(
        `native checkpoint settlement admission ${admission.index} `
        + 'does not cover an authenticated V2 history key',
      );
    }
  }

  const usedEventCompleteMappings = new Set<string>();
  const usedAdmissionIndexes = new Set<number>();
  const imports = historyKeys.map((legacyHistoryKeyHex, historyIndex) => {
    const matching = normalizedAdmissions.filter(
      admission => admission.canonicalBurnIdHex === legacyHistoryKeyHex,
    );
    if (matching.length === 0) {
      const transactionAdmissions = normalizedAdmissions.filter(
        admission => admission.sidechainTxHashHex === legacyHistoryKeyHex,
      );
      const mapping = mappingByLegacyHistoryKey.get(legacyHistoryKeyHex);
      if (mapping === undefined && transactionAdmissions.length > 0) {
        throw new Error(
          `authenticated V2 history key ${historyIndex} uses legacy `
          + 'transaction-level replay semantics; automatic V4 migration '
          + 'requires an authenticated event-complete mapping or a reviewed '
          + 'manual cutover decision',
        );
      }
      if (mapping !== undefined) {
        const mappedAdmission = normalizedAdmissions.filter(admission =>
          admission.canonicalBurnIdHex
            === mapping.mappedEvent.canonicalBurnIdHex
        );
        if (mappedAdmission.length !== 1) {
          throw new Error(
            `authenticated V2 history key ${historyIndex} event-complete `
            + 'mapping has no unique native checkpoint settlement admission',
          );
        }
        const admission = mappedAdmission[0];
        try {
          assertValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4Provenance(
            mapping,
            {
              compiledInstance: compiled,
              authenticatedV2Reconstruction: reconstruction,
              nativeCheckpointAdmission: admission.raw,
            },
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(
            `authenticated V2 history key ${historyIndex} event-complete `
            + `mapping provenance failed: ${detail}`,
          );
        }
        if (
          mapping.mappedEvent.sidechainTxHashHex !== legacyHistoryKeyHex
          || mapping.mappedEvent.eventIndex !== admission.eventIndex
          || mapping.mappedEvent.canonicalBurnIdHex
            !== admission.canonicalBurnIdHex
        ) {
          throw new Error(
            `authenticated V2 history key ${historyIndex} event-complete `
            + 'mapping does not match its admitted event',
          );
        }
        usedEventCompleteMappings.add(legacyHistoryKeyHex);
        usedAdmissionIndexes.add(admission.index);
        return {
          legacyHistoryKeyHex,
          legacyKeySemantics:
            'legacy-transaction-hash-event-complete' as const,
          sidechainTxHashHex: admission.sidechainTxHashHex,
          eventIndex: admission.eventIndex,
          canonicalBurnIdHex: admission.canonicalBurnIdHex,
          nativeCheckpointAdmissionDigestHex: admission.digestHex,
          eventCompleteMappingDigestHex: fixedHex(
            mapping.mappingDigestHex,
            32,
            `authenticated V2 history key ${historyIndex} event-complete mapping digest`,
          ),
        };
      }
      throw new Error(
        `authenticated V2 history key ${historyIndex} has no native `
        + 'checkpoint settlement admission',
      );
    }
    if (matching.length !== 1) {
      throw new Error(
        `authenticated V2 history key ${historyIndex} has duplicate or `
        + 'ambiguous native checkpoint settlement admissions',
      );
    }
    const admission = matching[0];
    usedAdmissionIndexes.add(admission.index);
    return {
      legacyHistoryKeyHex,
      legacyKeySemantics: 'canonical-v4-burn-id' as const,
      sidechainTxHashHex: admission.sidechainTxHashHex,
      eventIndex: admission.eventIndex,
      canonicalBurnIdHex: admission.canonicalBurnIdHex,
      nativeCheckpointAdmissionDigestHex: admission.digestHex,
    };
  });
  if (usedAdmissionIndexes.size !== normalizedAdmissions.length) {
    const unused = normalizedAdmissions
      .filter(admission => !usedAdmissionIndexes.has(admission.index))
      .map(admission => String(admission.index));
    throw new Error(
      `authenticated V2 replay import contains unused native checkpoint `
      + `settlement admissions: ${unused.join(', ')}`,
    );
  }
  if (
    usedEventCompleteMappings.size !== mappingByLegacyHistoryKey.size
  ) {
    const unused = [...mappingByLegacyHistoryKey.keys()].filter(
      key => !usedEventCompleteMappings.has(key),
    );
    throw new Error(
      `authenticated V2 event-complete mappings contain unused history keys: ${unused.join(', ')}`,
    );
  }
  imports.sort((left, right) =>
    left.canonicalBurnIdHex.localeCompare(right.canonicalBurnIdHex)
  );

  const canonicalBurnIdsHex = imports.map(entry => entry.canonicalBurnIdHex);
  assertUnique(canonicalBurnIdsHex, 'canonical V4 burn ID');
  const digestHex = fixedHex(
    getDupTreeDigest([...canonicalBurnIdsHex]),
    33,
    'canonical V4 duplicate-prevention digest',
  );
  const registers = {
    R4: encodeCollByteRegister(Buffer.from(
      fixedHex(compiled.lineageProfileIdHex, 32, 'compiled V4 lineage profile ID'),
      'hex',
    )),
    R5: encodeAvlTreeRegister(
      Buffer.from(digestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      DUP_VALUE_BYTES,
    ),
  };

  const packetWithoutDigest = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_AUTHENTICATED_V2_REPLAY_IMPORT_V4_SCHEMA,
    version: 4 as const,
    lineage: {
      lineageProfileIdHex: compiled.lineageProfileIdHex,
      encodedLineageProfileHex: compiled.encodedLineageProfileHex,
      sidechainIdHex: profile.sidechainIdHex,
      settlementAssetIdHex: profile.settlementAssetIdHex,
      settlementProfileIdHex: profile.settlementProfileIdHex,
    },
    source: {
      authenticatedV2ReconstructionDigestHex: fixedHex(
        reconstruction.observationDigestHex,
        32,
        'authenticated V2 reconstruction digest',
      ),
      authenticatedV2DuplicatePreventionNftIdHex: fixedHex(
        reconstruction.duplicatePreventionNftIdHex,
        32,
        'authenticated V2 duplicate-prevention NFT ID',
      ),
      authenticatedV2DuplicatePreventionErgoTreeHex: variableHex(
        reconstruction.duplicatePreventionErgoTreeHex,
        'authenticated V2 duplicate-prevention ErgoTree',
      ),
      authenticatedV2GenesisBoxIdHex: fixedHex(
        reconstruction.genesisBoxIdHex,
        32,
        'authenticated V2 genesis box ID',
      ),
      authenticatedV2TipBoxIdHex: fixedHex(
        reconstruction.tipBoxIdHex,
        32,
        'authenticated V2 tip box ID',
      ),
      authenticatedV2TipDigestHex: fixedHex(
        reconstruction.tipDigestHex,
        33,
        'authenticated V2 tip digest',
      ),
      authenticatedV2TipCounter: canonicalUint64(
        reconstruction.tipCounter,
        'authenticated V2 tip counter',
      ),
      nativeCheckpointAdmissionProfile: admissionProfile,
      nativeCheckpointAdmissionDigestsHex: imports.map(
        entry => entry.nativeCheckpointAdmissionDigestHex,
      ),
    },
    imports,
    duplicatePreventionGenesis: {
      canonicalBurnIdsHex,
      digestHex,
      registers,
    },
    boundaries: {
      authenticatedV2LineageImported: true as const,
      allLineagesImported: false as const,
      legacyRoutesRetired: false as const,
      profileActivated: false as const,
      transactionConstructed: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const packet = deepFreeze({
    ...packetWithoutDigest,
    packetDigestHex: sha256CanonicalJson(
      packetWithoutDigest,
      PACKET_DIGEST_DOMAIN,
    ),
  });
  packets.add(packet);
  return packet;
}

export function assertValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet
> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error(
      'authenticated V2 replay import packet was not built in this process',
    );
  }
}

function normalizeAdmission(
  admission: NativeCheckpointSettlementAdmission,
  index: number,
) {
  const nativeCheckpointSettlementProfileSha256Hex = prefixedFixedHex(
    getNativeCheckpointSettlementAdmissionProfileSha256Hex(admission),
    32,
    `native checkpoint settlement admission ${index} source profile digest`,
  );
  if (
    !REVIEWED_AUTHENTICATED_V2_REPLAY_IMPORT_PROFILE_SHA256_HEXES.includes(
      nativeCheckpointSettlementProfileSha256Hex,
    )
  ) {
    throw new Error(
      `native checkpoint settlement admission ${index} source profile `
      + 'is not approved for authenticated V2 replay import',
    );
  }
  const sidechainIdHex = fixedHex(
    admission.sidechainIdHex,
    32,
    `native checkpoint settlement admission ${index} sidechain ID`,
  );
  const sidechainTxHashHex = fixedHex(
    admission.sidechainTxHashHex,
    32,
    `native checkpoint settlement admission ${index} transaction hash`,
  );
  const eventIndex = uint32(
    admission.eventIndex,
    `native checkpoint settlement admission ${index} event index`,
  );
  const canonicalBurnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex,
    sidechainTxHashHex,
    eventIndex,
  });
  if (
    fixedHex(
      admission.burnIdHex,
      32,
      `native checkpoint settlement admission ${index} burn ID`,
    ) !== canonicalBurnIdHex
  ) {
    throw new Error(
      `native checkpoint settlement admission ${index} burn ID `
      + 'does not match its canonical V4 event identity',
    );
  }
  const profile = {
    sidechainIdHex,
    assetIdHex: fixedHex(
      admission.assetIdHex,
      32,
      `native checkpoint settlement admission ${index} asset ID`,
    ),
    finalityProofSystemId: uint32(
      admission.finalityProofSystemId,
      `native checkpoint settlement admission ${index} proof-system ID`,
    ),
    finalityProgramIdHex: fixedHex(
      admission.finalityProgramIdHex,
      32,
      `native checkpoint settlement admission ${index} finality program ID`,
    ),
    finalityVerifierProfileIdHex: fixedHex(
      admission.finalityVerifierProfileIdHex,
      32,
      `native checkpoint settlement admission ${index} verifier profile ID`,
    ),
    trustAnchorDigestHex: fixedHex(
      admission.trustAnchorDigestHex,
      32,
      `native checkpoint settlement admission ${index} trust-anchor digest`,
    ),
  };
  return {
    index,
    raw: admission,
    sidechainIdHex,
    sidechainTxHashHex,
    eventIndex,
    canonicalBurnIdHex,
    assetIdHex: profile.assetIdHex,
    sourceProfileSha256Hex:
      nativeCheckpointSettlementProfileSha256Hex,
    profile,
    digestHex: sha256CanonicalJson(
      admissionDigestPayload(admission),
      ADMISSION_DIGEST_DOMAIN,
    ),
  };
}

function admissionDigestPayload(
  admission: NativeCheckpointSettlementAdmission,
): Omit<
  NativeCheckpointSettlementAdmission,
  'nativeCheckpointSettlementProfileSha256Hex'
> {
  const {
    nativeCheckpointSettlementProfileSha256Hex: _sourceProfileSha256Hex,
    ...payload
  } = admission;
  return payload;
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

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} ${value} appears more than once`);
    }
    seen.add(value);
  }
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

function canonicalUint64(value: unknown, label: string): string {
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
  return parsed.toString();
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
