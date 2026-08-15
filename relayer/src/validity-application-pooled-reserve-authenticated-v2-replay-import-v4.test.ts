import { createECDH, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import blakejs from 'blakejs';
import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock(
  './reviewed-native-checkpoint-settlement-profiles.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./reviewed-native-checkpoint-settlement-profiles.js')
    >();
    return {
      ...actual,
      REVIEWED_AUTHENTICATED_V2_REPLAY_IMPORT_PROFILE_SHA256_HEXES:
        Object.freeze([`0x${'fa'.repeat(32)}`]),
    };
  },
);
vi.mock('./native-checkpoint-settlement-source.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-checkpoint-settlement-source.js')
  >();
  return {
    ...actual,
    assertReviewedNativeCheckpointSettlementProfileProvenance: vi.fn(),
    getReviewedNativeCheckpointSettlementProfileSha256Hex:
      vi.fn(() => `0x${'fa'.repeat(32)}`),
  };
});
vi.mock('./native-finalized-bridge-checkpoint.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-finalized-bridge-checkpoint.js')
  >();
  return {
    ...actual,
    assertNativeCheckpointAggregateFinalityProofProvenance: vi.fn(),
    assertNativeVerifiedBridgeCheckpointProvenance: vi.fn(),
  };
});

import { getDupTreeDigest, insertLockRecord } from './avl-bridge.js';
import {
  reconstructAuthenticatedV2DupHistoryFromDistinctSources,
  type AuthenticatedV2DupChainSource,
  type AuthenticatedV2DupReconstruction,
} from './authenticated-v2-dup-reconstruction.js';
import type { AuthenticatedV2VaultChainSource } from './authenticated-v2-vault-reconstruction.js';
import {
  collectAuthenticatedV2HistoricalPayoutFromDistinctSources,
  type AuthenticatedV2HistoricalPayoutChainSource,
} from './authenticated-v2-historical-payout-evidence.js';
import {
  buildBridgeCheckpointCommitmentV1,
} from './bridge-checkpoint-commitment.js';
import {
  buildAggregateFinalityCommitmentV1,
} from './bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import {
  EMPTY_AVL_DIGEST,
  MINER_FEE_TREE,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from './ergo-encoding.js';
import {
  computeErgoBlockTransactionsRoot,
} from './ergo-settlement-core/ergo-block-transactions-root.js';
import {
  computeErgoHeaderId,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  collectFrontierReturnedReceiptBurnSetFromDistinctSources,
  type FrontierBurnProofProvider,
} from './frontier-burn-proof-source.js';
import {
  FRONTIER_PEG_OUT_TOPIC,
} from './frontier-bridge-event-root.js';
import {
  bindNativeCheckpointToAuthenticatedSettlement,
  type NativeCheckpointSettlementAdmission,
} from './native-checkpoint-settlement-admission.js';
import {
  getReviewedNativeCheckpointSettlementProfileSha256Hex,
} from './native-checkpoint-settlement-source.js';
import {
  derivePegInPooledReserveLineageProfileV4,
  type PegInPooledReserveLineageProfileV4Semantics,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  buildPooledReserveMintReservationRuntimeProfileV4Candidate,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerValue,
} from './spv-tracker-authenticated.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v4.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnInclusionProof,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
  compileValidityApplicationPooledReserveInstanceV4,
  createPinnedValidityApplicationPooledReserveCompilerV4,
  deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex,
  deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex,
  type ValidityApplicationPooledReserveDepositStatePolicyV1,
  type ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
  type ValidityApplicationPooledReserveSidechainFinalityPolicyV1,
  type ValidityApplicationPooledReserveSourceCommitmentPolicyV1,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  assertValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet,
  buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4,
} from './validity-application-pooled-reserve-authenticated-v2-replay-import-v4.js';
import {
  assertValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4Provenance,
  buildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4,
} from './validity-application-pooled-reserve-authenticated-v2-event-complete-mapping-v4.js';
import {
  buildValidityApplicationPooledReserveCutoverCandidateV4,
} from './validity-application-pooled-reserve-cutover-candidate-v4.js';
import {
  observeValidityApplicationPooledReserveErgoCutoverV4,
} from './validity-application-pooled-reserve-ergo-cutover-observation-v4.js';
import {
  buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
  type BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input,
} from './validity-application-pooled-reserve-ergo-legacy-route-profile-v4.js';
import {
  buildValidityApplicationPooledReserveHistoricalReplayGenesisV4,
} from './validity-application-pooled-reserve-historical-replay-genesis-v4.js';
import {
  HISTORICAL_DUP_FAMILIES_V4,
} from './validity-application-pooled-reserve-historical-dup-lineage-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import {
  buildValidityApplicationPooledReserveProvisioningV4,
} from './validity-application-pooled-reserve-provisioning-v4.js';

const importedWasm: any = await import('ergo-lib-wasm-nodejs');
const TEST_WASM = importedWasm.default ?? importedWasm;

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const TEMPLATES = Object.freeze({
  tracker: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'SPVTrackerPooledReserveBurnV4.es',
  ), 'utf8'),
  duplicatePrevention: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'DoubleUnlockPreventionPooledReserveV4.es',
  ), 'utf8'),
  sourceLock: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainLockPooledReserveV4.es',
  ), 'utf8'),
  pooledReserve: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainPooledReserveValidityApplicationV4.es',
  ), 'utf8'),
});
const COMPILER_BATCH_JSON = readFileSync(resolve(
  BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'validity-application-pooled-reserve-compiler-v4.json',
), 'utf8');

const SIDECHAIN_ID = '22'.repeat(32);
const NATIVE_ERG_ASSET_ID = '00'.repeat(32);
const LEGACY_KEY_A = '51'.repeat(32);
const LEGACY_KEY_B = '52'.repeat(32);
const LEGACY_KEY_C = '53'.repeat(32);
const DUP_NFT_ID = '11'.repeat(32);
const DUP_TREE = `1008cd02${'12'.repeat(32)}`;
const PAYOUT_TREE = `1008cd02${'13'.repeat(32)}`;
const TRACKER_BOX_ID = '14'.repeat(32);
const VAULT_BOX_ID_A = '15'.repeat(32);
const VAULT_BOX_ID_B = '16'.repeat(32);
const SETUP_TX_ID = '21'.repeat(32);
const SETTLEMENT_TX_ID_A = '31'.repeat(32);
const SETTLEMENT_TX_ID_B = '32'.repeat(32);
const SETUP_BLOCK_ID = '41'.repeat(32);
const SETTLEMENT_BLOCK_ID_A = '42'.repeat(32);
const SETTLEMENT_BLOCK_ID_B = '43'.repeat(32);
const BEST_HEADER_ID = '44'.repeat(32);
const BEST_PARENT_ID = '45'.repeat(32);
const EXTENSION_ROOT = '46'.repeat(32);
const RECIPIENT_TREE = `0008cd02${'77'.repeat(32)}`;
const RECIPIENT_TREE_HASH = Buffer.from(blakejs.blake2b(
  Buffer.from(RECIPIENT_TREE, 'hex'),
  undefined,
  32,
)).toString('hex');
const BRIDGE_ADDRESS = `0x${'33'.repeat(20)}`;
const MAPPING_BLOCK_NUMBER = 201;
const MAPPING_BLOCK_HASH = '81'.repeat(32);
const MAPPING_AMOUNT = 3_900_000n;
const MAPPING_USER = `0x${'88'.repeat(20)}`;
const AUTHORITY = sigmaProp(7);

const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId:
    '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const GENESIS_TREE = `0008cd02${'11'.repeat(32)}`;
const RUNTIME_BINDING = {
  sourceRuntimeCodeSha256Hex: `0x${'dd'.repeat(32)}`,
  sourceRuntimeCodeBytes: 8192,
  bridgeRuntimeCodeSha256Hex: `0x${'bb'.repeat(32)}`,
  bridgeRuntimeCodeBytes: 4096,
  tokenRuntimeCodeSha256Hex: `0x${'cc'.repeat(32)}`,
  tokenRuntimeCodeBytes: 2048,
  maxPendingBlocks: 20,
} as const;
const SIDECHAIN_FINALITY_POLICY:
  ValidityApplicationPooledReserveSidechainFinalityPolicyV1 = {
    proofSystemIdHex:
      VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex:
      VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
    approvedTrustAnchorDigestHex: `0x${'aa'.repeat(32)}`,
    programIdHex: `0x${POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX}`,
    verifierProfileIdHex:
      `0x${POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX}`,
  };
const ERGO_DEPOSIT_FINALITY_POLICY:
  ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1 = {
    version: 1,
    requiredSuccessorDepth: 10,
    blockIdentityAndAncestryRequired: true,
    divergentRpcAction: 'hold',
    reorgAction: 'invalidate',
  };
const SOURCE_COMMITMENT_POLICY:
  ValidityApplicationPooledReserveSourceCommitmentPolicyV1 = {
    version: 1,
    refundDelayBlocks:
      VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
    pooledReserveInputIndex: 0,
    sourceLockInputIndex: 1,
    externalFeeInputIndex: 2,
    pooledReserveOutputIndex: 0,
    externalFeeOutputIndex: 1,
    sourceLockMustBeConsumed: true,
    externalFeeMustBeValueNeutral: true,
  };
const DEPOSIT_STATE_POLICY:
  ValidityApplicationPooledReserveDepositStatePolicyV1 = {
    version: 1,
    keyLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
    valueLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
    operationFlags: VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
    keySource: 'source-lock-box-id',
    valueHash: 'blake2b256',
    commitmentDomain:
      VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  };

let compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
let provisioningGenesisInputs: {
  readonly tracker: Eip12Box;
  readonly duplicatePrevention: Eip12Box;
  readonly pooledReserve: Eip12Box;
};
let reconstruction: AuthenticatedV2DupReconstruction;
let admissionA: NativeCheckpointSettlementAdmission;
let admissionB: NativeCheckpointSettlementAdmission;

beforeAll(async () => {
  const built = await buildCompiledInstance();
  compiled = built.compiled;
  provisioningGenesisInputs = built.provisioningGenesisInputs;
  admissionA = buildAdmission({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainTxHashHex: LEGACY_KEY_A,
    eventIndex: 7,
    discriminator: 1,
  });
  admissionB = buildAdmission({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainTxHashHex: LEGACY_KEY_B,
    eventIndex: 3,
    discriminator: 2,
  });
  reconstruction = await buildReconstruction([
    admissionA.burnIdHex,
    admissionB.burnIdHex,
  ]);
});

describe('authenticated V2 replay import into pooled-reserve V4', () => {
  it('derives one deterministic, recursively frozen, non-authorizing V4 DUP genesis', () => {
    const forward = buildPacket([admissionA, admissionB]);
    const reversed = buildPacket([admissionB, admissionA]);
    const explicitEmptyMappingSet =
      buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: reconstruction,
        admissions: [admissionA, admissionB],
        eventCompleteMappings: [],
      });
    const expectedBurnIds = [
      deriveTrustlessBurnIdHex({
        sidechainIdHex: SIDECHAIN_ID,
        sidechainTxHashHex: LEGACY_KEY_A,
        eventIndex: admissionA.eventIndex,
      }),
      deriveTrustlessBurnIdHex({
        sidechainIdHex: SIDECHAIN_ID,
        sidechainTxHashHex: LEGACY_KEY_B,
        eventIndex: admissionB.eventIndex,
      }),
    ].sort();
    const expectedDigest = getDupTreeDigest(expectedBurnIds);

    expect(reversed).toEqual(forward);
    expect(reversed.packetDigestHex).toBe(forward.packetDigestHex);
    expect(forward.packetDigestHex).toBe(
      'a45be4ca611bad0383dac4b384c7149ae0c3fd2e4604b6cfade2557e5475b79c',
    );
    expect(explicitEmptyMappingSet).toEqual(forward);
    expect(explicitEmptyMappingSet.packetDigestHex)
      .toBe(forward.packetDigestHex);
    expect(forward.duplicatePreventionGenesis.canonicalBurnIdsHex)
      .toEqual(expectedBurnIds);
    expect(forward.duplicatePreventionGenesis.digestHex).toBe(expectedDigest);
    expect(forward.duplicatePreventionGenesis.registers).toEqual({
      R4: encodeCollByteRegister(Buffer.from(
        compiled.lineageProfileIdHex.slice(2),
        'hex',
      )),
      R5: encodeAvlTreeRegister(
        Buffer.from(expectedDigest, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        1,
      ),
    });
    expect(forward.source.authenticatedV2ReconstructionDigestHex)
      .toBe(reconstruction.observationDigestHex);
    expect(forward.source.nativeCheckpointAdmissionDigestsHex)
      .toHaveLength(2);
    expect(forward.source.nativeCheckpointAdmissionProfile).toMatchObject({
      finalityProofSystemId: 1,
    });
    expect(admissionA.nativeCheckpointSettlementProfileSha256Hex)
      .toBe(`0x${'fa'.repeat(32)}`);
    expect(compiled.sidechainFinalityPolicy.proofSystemIdHex).not.toBe(
      '0x00000001',
    );
    expect(forward.imports.map(entry => entry.legacyKeySemantics))
      .toEqual([
        'canonical-v4-burn-id',
        'canonical-v4-burn-id',
      ]);
    expect(forward.boundaries).toEqual({
      authenticatedV2LineageImported: true,
      allLineagesImported: false,
      legacyRoutesRetired: false,
      profileActivated: false,
      transactionConstructed: false,
      targetNodeAcceptanceEstablished: false,
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(isRecursivelyFrozen(forward)).toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet(
        forward,
      )
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet(
        structuredClone(forward),
      )
    ).toThrow(/not built in this process/);
  });

  it('rejects an omitted or extra authenticated checkpoint admission', () => {
    expect(() => buildPacket([admissionA]))
      .toThrow(/has no native checkpoint settlement admission/);

    const extra = buildAdmission({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: LEGACY_KEY_C,
      eventIndex: 1,
      discriminator: 3,
    });
    expect(() => buildPacket([admissionA, admissionB, extra]))
      .toThrow(/does not cover an authenticated V2 history key/);
  });

  it('rejects duplicate canonical coverage or another event from the same transaction', () => {
    expect(() => buildPacket([admissionA, admissionA, admissionB]))
      .toThrow(/duplicate or ambiguous/);

    const wrongEvent = buildAdmission({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: LEGACY_KEY_A,
      eventIndex: admissionA.eventIndex + 1,
      discriminator: 4,
    });
    expect(() => buildPacket([wrongEvent, admissionB]))
      .toThrow(/does not cover an authenticated V2 history key/);
  });

  it('rejects a genuine admission from another sidechain or finality profile', () => {
    const wrongSidechain = buildAdmission({
      sidechainIdHex: '99'.repeat(32),
      sidechainTxHashHex: LEGACY_KEY_B,
      eventIndex: admissionB.eventIndex,
      discriminator: 5,
    });
    expect(() => buildPacket([admissionA, wrongSidechain]))
      .toThrow(/sidechain does not match the compiled V4 lineage/);

    const mixedProfile = buildAdmission({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: LEGACY_KEY_B,
      eventIndex: admissionB.eventIndex,
      discriminator: 6,
      verifierProfileIdHex: 'de'.repeat(32),
    });
    expect(() => buildPacket([admissionA, mixedProfile]))
      .toThrow(/mix finality or settlement profiles/);
  });

  it('rejects a consistently wrong but process-provenant native source profile', () => {
    const profileDigest =
      vi.mocked(getReviewedNativeCheckpointSettlementProfileSha256Hex);
    profileDigest
      .mockReturnValueOnce(`0x${'fb'.repeat(32)}`)
      .mockReturnValueOnce(`0x${'fb'.repeat(32)}`);
    const wrongProfileA = buildAdmission({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: LEGACY_KEY_A,
      eventIndex: admissionA.eventIndex,
      discriminator: 11,
    });
    const wrongProfileB = buildAdmission({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: LEGACY_KEY_B,
      eventIndex: admissionB.eventIndex,
      discriminator: 12,
    });

    expect(() => buildPacket([wrongProfileA, wrongProfileB]))
      .toThrow(/source profile is not approved/);
  });

  it('rejects spread or cloned provenance, including forged burn and asset fields', () => {
    expect(() => buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4({
      compiledInstance: { ...compiled } as any,
      authenticatedV2Reconstruction: reconstruction,
      admissions: [admissionA, admissionB],
    })).toThrow(/compiled from the same-process/);
    expect(() => buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4({
      compiledInstance: compiled,
      authenticatedV2Reconstruction: {
        ...reconstruction,
      } as AuthenticatedV2DupReconstruction,
      admissions: [admissionA, admissionB],
    })).toThrow(/reconstruction provenance is missing/);
    expect(() => buildPacket([
      {
        ...admissionA,
        burnIdHex: 'fe'.repeat(32),
      } as NativeCheckpointSettlementAdmission,
      admissionB,
    ])).toThrow(/admission 0 provenance failed/);
    expect(() => buildPacket([
      admissionA,
      {
        ...admissionB,
        assetIdHex: '01'.repeat(32),
      } as NativeCheckpointSettlementAdmission,
    ])).toThrow(/admission 1 provenance failed/);
    expect(() => buildPacket([
      structuredClone(admissionA) as NativeCheckpointSettlementAdmission,
      admissionB,
    ])).toThrow(/admission 0 provenance failed/);
  });

  it('fails closed on raw transaction-level history even when a valid event from that transaction is supplied', async () => {
    const mixedReconstruction = await buildReconstruction([
      LEGACY_KEY_A,
      admissionB.burnIdHex,
    ]);
    const wrongEvent = buildAdmission({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: LEGACY_KEY_A,
      eventIndex: admissionA.eventIndex + 1,
      discriminator: 4,
    });
    expect(() =>
      buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: mixedReconstruction,
        admissions: [wrongEvent, admissionB],
      })
    ).toThrow(/transaction-level replay semantics/);
  });

  it('maps one legacy transaction-level key through the admitted burn set and exact historical payout', async () => {
    const fixture = await buildEventCompleteIngredients();
    const mapping =
      buildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: fixture.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY_A,
        historicalPayoutAgreement: fixture.historicalPayoutAgreement,
        burnSetAgreement: fixture.agreement,
        nativeCheckpointAdmission: fixture.admission,
      });

    expect(mapping.legacySettlement).toMatchObject({
      legacyHistoryKeyHex: LEGACY_KEY_A,
      legacyKeySemantics: 'sidechain-transaction-hash',
      historyIndex: 0,
      payoutValueNanoErg: MAPPING_AMOUNT.toString(),
      payoutErgoTreeHex: RECIPIENT_TREE,
    });
    expect(mapping.eventSet).toMatchObject({
      executionBlockNumber: MAPPING_BLOCK_NUMBER,
      executionBlockHashHex: MAPPING_BLOCK_HASH,
      bridgeEventRootHex: fixture.admission.bridgeEventRootHex,
      burnLeafCount: 1,
    });
    expect(mapping.mappedEvent).toMatchObject({
      sidechainTxHashHex: LEGACY_KEY_A,
      eventIndex: 0,
      canonicalBurnIdHex: fixture.admission.burnIdHex,
      recipientErgoTreeHex: RECIPIENT_TREE,
      recipientErgoTreeHashHex: RECIPIENT_TREE_HASH,
      amountNanoErg: MAPPING_AMOUNT.toString(),
    });
    expect(isRecursivelyFrozen(mapping)).toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4Provenance(
        mapping,
      )
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4Provenance(
        structuredClone(mapping),
      )
    ).toThrow(/provenance/);
    expect(() =>
      buildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: fixture.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY_A,
        historicalPayoutAgreement:
          structuredClone(fixture.historicalPayoutAgreement),
        burnSetAgreement: fixture.agreement,
        nativeCheckpointAdmission: fixture.admission,
      })
    ).toThrow(/historical payout agreement provenance/);
    expect(() =>
      buildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: fixture.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY_A,
        burnSetAgreement: fixture.agreement,
        nativeCheckpointAdmission: fixture.admission,
      } as any)
    ).toThrow(/unknown or missing fields/);

    const packet =
      buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: fixture.reconstruction,
        admissions: [fixture.admission, admissionB],
        eventCompleteMappings: [mapping],
      });
    const mappedImport = packet.imports.find(
      entry => entry.legacyHistoryKeyHex === LEGACY_KEY_A,
    );
    expect(mappedImport).toMatchObject({
      legacyHistoryKeyHex: LEGACY_KEY_A,
      legacyKeySemantics: 'legacy-transaction-hash-event-complete',
      sidechainTxHashHex: LEGACY_KEY_A,
      eventIndex: 0,
      canonicalBurnIdHex: fixture.admission.burnIdHex,
      eventCompleteMappingDigestHex: mapping.mappingDigestHex,
    });
    expect(mappedImport?.nativeCheckpointAdmissionDigestHex)
      .toMatch(/^[0-9a-f]{64}$/);
    expect(packet.duplicatePreventionGenesis.canonicalBurnIdsHex)
      .toContain(fixture.admission.burnIdHex);
  });

  it('rejects an ambiguous transaction-level key when two burns match the same historical payout', async () => {
    const fixture = await buildEventCompleteIngredients([
      {
        amountNanoErg: MAPPING_AMOUNT,
        recipientErgoTreeHex: RECIPIENT_TREE,
      },
      {
        amountNanoErg: MAPPING_AMOUNT,
        recipientErgoTreeHex: RECIPIENT_TREE,
      },
    ]);

    expect(() =>
      buildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: fixture.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY_A,
        historicalPayoutAgreement: fixture.historicalPayoutAgreement,
        burnSetAgreement: fixture.agreement,
        nativeCheckpointAdmission: fixture.admission,
      })
    ).toThrow(/does not map uniquely/);
  });

  it.each([
    [
      'value',
      {
        amountNanoErg: MAPPING_AMOUNT + 1n,
        recipientErgoTreeHex: RECIPIENT_TREE,
      },
    ],
    [
      'ErgoTree',
      {
        amountNanoErg: MAPPING_AMOUNT,
        recipientErgoTreeHex: `0008cd02${'78'.repeat(32)}`,
      },
    ],
  ] as const)(
    'rejects a burn whose %s does not match the exact historical payout',
    async (_label, burn) => {
      const fixture = await buildEventCompleteIngredients([burn]);

      expect(() =>
        buildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4({
          compiledInstance: compiled,
          authenticatedV2Reconstruction: fixture.reconstruction,
          legacyHistoryKeyHex: LEGACY_KEY_A,
          historicalPayoutAgreement: fixture.historicalPayoutAgreement,
          burnSetAgreement: fixture.agreement,
          nativeCheckpointAdmission: fixture.admission,
        })
      ).toThrow(/does not map uniquely/);
    },
  );

  it('rejects burn-set admission drift, duplicate mappings, and mixed reconstruction provenance', async () => {
    const single = await buildEventCompleteIngredients();
    const multi = await buildEventCompleteIngredients([
      {
        amountNanoErg: MAPPING_AMOUNT,
        recipientErgoTreeHex: RECIPIENT_TREE,
      },
      {
        amountNanoErg: 4_100_000n,
        recipientErgoTreeHex: RECIPIENT_TREE,
      },
    ]);

    expect(() =>
      buildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: single.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY_A,
        historicalPayoutAgreement: single.historicalPayoutAgreement,
        burnSetAgreement: single.agreement,
        nativeCheckpointAdmission: multi.admission,
      })
    ).toThrow(/does not match the returned Frontier burn set/);
    expect(() =>
      buildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: multi.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY_A,
        historicalPayoutAgreement: multi.historicalPayoutAgreement,
        burnSetAgreement: multi.agreement,
        nativeCheckpointAdmission: multi.admissions[1],
      })
    ).toThrow(/does not match the uniquely mapped historical payout event/);

    const mapping =
      buildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: single.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY_A,
        historicalPayoutAgreement: single.historicalPayoutAgreement,
        burnSetAgreement: single.agreement,
        nativeCheckpointAdmission: single.admission,
      });
    expect(() =>
      buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: single.reconstruction,
        admissions: [single.admission, admissionB],
        eventCompleteMappings: [mapping, mapping],
      })
    ).toThrow(/duplicate event-complete mappings/);

    const otherReconstruction = await buildReconstruction(
      [LEGACY_KEY_A, admissionB.burnIdHex],
      [RECIPIENT_TREE, PAYOUT_TREE],
    );
    expect(() =>
      buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: otherReconstruction,
        admissions: [single.admission, admissionB],
        eventCompleteMappings: [mapping],
      })
    ).toThrow(/another DUP reconstruction/);

    const multiMapping =
      buildValidityApplicationPooledReserveAuthenticatedV2EventCompleteMappingV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: multi.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY_A,
        historicalPayoutAgreement: multi.historicalPayoutAgreement,
        burnSetAgreement: multi.agreement,
        nativeCheckpointAdmission: multi.admission,
      });
    expect(() =>
      buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4({
        compiledInstance: compiled,
        authenticatedV2Reconstruction: multi.reconstruction,
        admissions: [...multi.admissions, admissionB],
        eventCompleteMappings: [multiMapping],
      })
    ).toThrow(/unused native checkpoint settlement admissions/);
  });

  it('cannot authorize provisioning without the complete historical replay genesis', async () => {
    const replayImport = buildPacket([admissionA, admissionB]);
    await expect(buildProvisioning(replayImport))
      .rejects.toThrow(/unknown authenticatedV2ReplayImport/);
  });

  it('preserves real provenance through the cutover activation boundary', async () => {
    const built = await buildCompiledInstance();
    const cutoverProfile =
      buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
        emptyCutoverProfileInput(),
      );
    const cutoverObservation =
      await observeValidityApplicationPooledReserveErgoCutoverV4({
        profile: cutoverProfile,
        expectedProfileDigestHex: cutoverProfile.profileDigestHex,
        primarySource: emptyCutoverSource('https://primary.invalid'),
        witnessSource: emptyCutoverSource('https://witness.invalid'),
        observedAt: () => new Date('2026-08-01T12:00:00.000Z'),
      });
    expect(cutoverObservation.historicalDupLineages)
      .toHaveLength(HISTORICAL_DUP_FAMILIES_V4.length);

    const contributions = cutoverObservation.historicalDupLineages.map(
      lineage => ({
        kind: 'empty-observed-lineage' as const,
        routeId: lineage.routeId,
        instanceId: lineage.instanceId,
        lineagePacketDigestHex: lineage.packetDigestHex,
      }),
    );
    const replayGenesis =
      buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
        compiledInstance: built.compiled,
        cutoverObservation,
        contributions,
      });
    expect(() =>
      buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
        compiledInstance: built.compiled,
        cutoverObservation: structuredClone(cutoverObservation),
        contributions,
      })
    ).toThrow(/not built in this process/);
    expect(Object.values(replayGenesis.boundaries).every(
      value => value === false || value === true,
    )).toBe(true);
    expect(replayGenesis.boundaries).toMatchObject({
      allObservedHistoricalLineagesComposed: true,
      profileInstanceInventoryExhaustiveAuthenticated: false,
      profileActivated: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });

    const provisioningInput = {
      compiledInstance: built.compiled,
      trackerGenesisInputBox: built.provisioningGenesisInputs.tracker,
      duplicatePreventionGenesisInputBox:
        built.provisioningGenesisInputs.duplicatePrevention,
      settlementVaultGenesisInputBox:
        built.provisioningGenesisInputs.pooledReserve,
      values: {
        trackerNanoErg: 2_000_000,
        duplicatePreventionNanoErg: 2_000_000,
        pooledReserveNanoErg: 2_000_000,
      },
      creationHeights: {
        trackerIssuance: 112,
        duplicatePreventionIssuance: 112,
        pooledReserveIssuance: 112,
      },
      historicalReplayGenesis: replayGenesis,
    };
    const provisioning =
      await buildValidityApplicationPooledReserveProvisioningV4(
        provisioningInput,
      );
    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...provisioningInput,
      historicalReplayGenesis: structuredClone(replayGenesis),
    })).rejects.toThrow(/not built in this process/);
    expect(Object.values(provisioning.boundaries).every(
      value => value === false || value === true,
    )).toBe(true);
    expect(provisioning.boundaries).toMatchObject({
      profileActivated: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });

    const runtimeProfile =
      buildPooledReserveMintReservationRuntimeProfileV4Candidate({
        compiledInstance: built.compiled,
        maxPendingBlocks: 20,
      });
    const candidateInput = {
      compiledInstance: built.compiled,
      runtimeProfile,
      historicalReplayGenesis: replayGenesis,
      provisioning,
      activationParent: {
        sidechainIdHex: SIDECHAIN_ID,
        nativeBlockHashHex: 'c1'.repeat(32),
        nativeHeight: 0,
        nativeStateRootHex: 'c2'.repeat(32),
        executionBlockHashHex: 'c3'.repeat(32),
        runtimeCodeSha256Hex: 'c4'.repeat(32),
        runtimeCodeBytes: 1_048_576,
        sourceAdmissionPolicyIdHex:
          built.compiled.sidechainFinalityPolicy.policyIdHex,
        observationDigestHex: cutoverObservation.reportDigestHex,
      },
      legacyRouteDeclarations:
        VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4.map(
          (requirement, index) => ({
            routeId: requirement.routeId,
            declaredDisposition: requirement.requiredDisposition,
            declaredStatus: 'inactive-unverified' as const,
            inventoryEvidenceDigestHex:
              (index + 1).toString(16).padStart(2, '0').repeat(32),
            retirementEvidenceDigestHex:
              (index + 65).toString(16).padStart(2, '0').repeat(32),
          }),
        ),
    };
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...candidateInput,
      historicalReplayGenesis: structuredClone(replayGenesis),
    })).toThrow(/not built in this process/);
    expect(() => buildValidityApplicationPooledReserveCutoverCandidateV4({
      ...candidateInput,
      provisioning: structuredClone(provisioning),
    })).toThrow(/must be built in this process/);
    expect(() =>
      buildValidityApplicationPooledReserveCutoverCandidateV4(candidateInput)
    ).toThrow(/activation height must have a parent/);
  });

});

function buildPacket(
  admissions: readonly NativeCheckpointSettlementAdmission[],
) {
  return buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4({
    compiledInstance: compiled,
    authenticatedV2Reconstruction: reconstruction,
    admissions,
  });
}

async function buildProvisioning(
  replayImport?: ReturnType<
    typeof buildValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4
  >,
) {
  return buildValidityApplicationPooledReserveProvisioningV4({
    compiledInstance: compiled,
    trackerGenesisInputBox: provisioningGenesisInputs.tracker,
    duplicatePreventionGenesisInputBox:
      provisioningGenesisInputs.duplicatePrevention,
    settlementVaultGenesisInputBox:
      provisioningGenesisInputs.pooledReserve,
    values: {
      trackerNanoErg: 2_000_000,
      duplicatePreventionNanoErg: 2_000_000,
      pooledReserveNanoErg: 2_000_000,
    },
    creationHeights: {
      trackerIssuance: 112,
      duplicatePreventionIssuance: 112,
      pooledReserveIssuance: 112,
    },
    ...(replayImport === undefined
      ? {}
      : { authenticatedV2ReplayImport: replayImport }),
  } as any);
}

async function buildCompiledInstance() {
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [0, 1, 2].map(() => ({
      value: '100000000',
      ergoTree: GENESIS_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 111,
    })),
  }, 'authenticated V2 replay import V4 genesis fixture');
  const [
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
  ] = funding.outputs;
  const semantics: PegInPooledReserveLineageProfileV4Semantics = {
    sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
    sidechainIdHex: `0x${SIDECHAIN_ID}`,
    bridgeAddressHex: `0x${'33'.repeat(20)}`,
    tokenAddressHex: `0x${'44'.repeat(20)}`,
    settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    sourceLockTemplateSha256Hex: `0x${sha256(TEMPLATES.sourceLock)}`,
    validityTrackerTemplateSha256Hex: `0x${sha256(TEMPLATES.tracker)}`,
    settlementVaultTemplateSha256Hex:
      `0x${sha256(TEMPLATES.pooledReserve)}`,
    duplicatePreventionTemplateSha256Hex:
      `0x${sha256(TEMPLATES.duplicatePrevention)}`,
    sidechainFinalityPolicyIdHex:
      deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex(
        SIDECHAIN_FINALITY_POLICY,
      ),
    ergoDepositFinalityPolicyIdHex:
      deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex(
        ERGO_DEPOSIT_FINALITY_POLICY,
      ),
    proofSystemIdHex: SIDECHAIN_FINALITY_POLICY.proofSystemIdHex,
    proofProfileIdHex: SIDECHAIN_FINALITY_POLICY.proofProfileIdHex,
    sourceCommitmentPolicyIdHex:
      deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex(
        SOURCE_COMMITMENT_POLICY,
      ),
    depositCommitmentStatePolicyIdHex:
      deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex(
        DEPOSIT_STATE_POLICY,
      ),
    profileRevision: '1',
    activationHeight: '0',
  };
  const lineage = await derivePegInPooledReserveLineageProfileV4({
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
    semantics,
  });
  const compiledInstance =
    await compileValidityApplicationPooledReserveInstanceV4({
    lineageCandidate: lineage,
    templates: TEMPLATES,
    runtimeBinding: RUNTIME_BINDING,
    sidechainFinalityPolicy: SIDECHAIN_FINALITY_POLICY,
    ergoDepositFinalityPolicy: ERGO_DEPOSIT_FINALITY_POLICY,
    sourceCommitmentPolicy: SOURCE_COMMITMENT_POLICY,
    depositCommitmentStatePolicy: DEPOSIT_STATE_POLICY,
    compiler: createPinnedValidityApplicationPooledReserveCompilerV4(
      COMPILER_BATCH_JSON,
    ),
  });
  return {
    compiled: compiledInstance,
    provisioningGenesisInputs: {
      tracker: trackerGenesisInputBox,
      duplicatePrevention: duplicatePreventionGenesisInputBox,
      pooledReserve: settlementVaultGenesisInputBox,
    },
  };
}

function emptyCutoverProfileInput():
  BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input {
  return {
    network: {
      networkId: 'ergo-testnet',
      addressNetworkPrefix: 16,
    },
    reviewedSource: {
      sourceRevisionHex: 'a1'.repeat(20),
      basis: [{
        reference: 'repository://bridge/reviewed-ergo-cutover-observation-basis-v4',
        sha256Hex: 'b2'.repeat(32),
      }],
    },
    routes: VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
      .filter(requirement => requirement.layer === 'ergo')
      .map((requirement, index) => {
        const ergoTreeHex = cutoverTree(index);
        const singleton = requirement.routeClass === 'tracker'
          || requirement.routeClass === 'duplicate-prevention'
          || requirement.routeClass === 'sidechain-state';
        return {
          routeId: requirement.routeId,
          sourceSurface: requirement.sourceSurface,
          requiredDisposition: requirement.requiredDisposition,
          instances: [{
            instanceId: `candidate-${String(index).padStart(2, '0')}`,
            address: ErgoAddress.fromErgoTree(
              ergoTreeHex,
              Network.Testnet,
            ).toString(),
            ergoTreeHex,
            ergoTreeSha256Hex: sha256HexBytes(ergoTreeHex),
            singletonTokenIdHex: singleton ? cutoverHex(index + 1) : null,
            genesisBoxIdHex: singleton ? cutoverHex(index + 65) : null,
          }],
        };
      }),
  };
}

function emptyCutoverSource(
  observationSourceId: string,
): AuthenticatedV2VaultChainSource {
  let budgetActive = false;
  const assertBudget = (): void => {
    if (!budgetActive) {
      throw new Error('test source read occurred outside aggregate budget');
    }
  };
  return {
    observationSourceId,
    beginAuthenticatedTrackerReconstruction() {
      if (budgetActive) {
        throw new Error('test source budget is already active');
      }
      budgetActive = true;
    },
    endAuthenticatedTrackerReconstruction() {
      if (!budgetActive) {
        throw new Error('test source budget is not active');
      }
      budgetActive = false;
    },
    async getInfo() {
      assertBudget();
      return { network: 'testnet' };
    },
    async getIndexedHeight() {
      assertBudget();
      return { indexedHeight: 500, fullHeight: 500 };
    },
    async getBestHeader() {
      assertBudget();
      return {
        id: BEST_HEADER_ID,
        parentId: BEST_PARENT_ID,
        height: 500,
        extensionRoot: EXTENSION_ROOT,
      };
    },
    async getIndexedBoxesByTokenId() {
      assertBudget();
      return [];
    },
    async getIndexedBoxesByAddress() {
      assertBudget();
      return [];
    },
    async getUnspentBoxesByAddress() {
      assertBudget();
      return [];
    },
    async getTransaction() {
      assertBudget();
      return null;
    },
    async getBlockHeaderById() {
      assertBudget();
      return null;
    },
    async getBoxByIdOrNull() {
      assertBudget();
      return null;
    },
    async getBoxBinaryByIdOrNull() {
      assertBudget();
      return null;
    },
  };
}

function cutoverTree(index: number): string {
  return `10010100d1${(0x40 + index).toString(16)}00`;
}

function cutoverHex(value: number): string {
  return value.toString(16).padStart(2, '0').repeat(32);
}

function sha256HexBytes(value: string): string {
  return createHash('sha256')
    .update(Buffer.from(value, 'hex'))
    .digest('hex');
}

interface EventCompleteBurnSpec {
  readonly amountNanoErg: bigint;
  readonly recipientErgoTreeHex: string;
}

async function buildEventCompleteIngredients(
  burns: readonly EventCompleteBurnSpec[] = [{
    amountNanoErg: MAPPING_AMOUNT,
    recipientErgoTreeHex: RECIPIENT_TREE,
  }],
) {
  const reconstructionBundle = await buildCanonicalMappingReconstruction(
    [LEGACY_KEY_A, admissionB.burnIdHex],
    [RECIPIENT_TREE, PAYOUT_TREE],
  );
  const reconstructionForMapping = reconstructionBundle.reconstruction;
  const historicalPayoutAgreement =
    await collectAuthenticatedV2HistoricalPayoutFromDistinctSources({
      primarySource: historicalPayoutSource(
        reconstructionBundle.primaryFixture,
        LEGACY_KEY_A,
      ),
      primarySourceIdHex: '93'.repeat(32),
      witnessSource: historicalPayoutSource(
        reconstructionBundle.witnessFixture,
        LEGACY_KEY_A,
      ),
      witnessSourceIdHex: '94'.repeat(32),
      authenticatedV2Reconstruction: reconstructionForMapping,
      legacyHistoryKeyHex: LEGACY_KEY_A,
    });
  const receipts = eventCompleteReceipts(burns);
  const primaryProvider = eventCompleteProvider(receipts);
  const witnessProvider = eventCompleteProvider(receipts);
  const agreement =
    await collectFrontierReturnedReceiptBurnSetFromDistinctSources({
      primary: {
        provider: primaryProvider,
        sourceIdHex: '91'.repeat(32),
        sidechainIdHex: SIDECHAIN_ID,
        executionBlockNumber: MAPPING_BLOCK_NUMBER,
        executionBlockHashHex: MAPPING_BLOCK_HASH,
        bridgeAddress: BRIDGE_ADDRESS,
        maxBurns: 16,
      },
      witness: {
        provider: witnessProvider,
        sourceIdHex: '92'.repeat(32),
        sidechainIdHex: SIDECHAIN_ID,
        executionBlockNumber: MAPPING_BLOCK_NUMBER,
        executionBlockHashHex: MAPPING_BLOCK_HASH,
        bridgeAddress: BRIDGE_ADDRESS,
        maxBurns: 16,
      },
    });
  const leaves = agreement.view.burns.map<TrustlessBurnLeafInput>(burn => ({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainBlockHashHex: MAPPING_BLOCK_HASH,
    burnIdHex: burn.burnIdHex,
    sidechainTxHashHex: burn.sidechainTxHashHex,
    eventIndex: burn.eventIndex,
    recipientErgoTreeHashHex: burn.recipientErgoTreeHashHex,
    amountNanoErg: burn.amountNanoErg,
    assetIdHex: NATIVE_ERG_ASSET_ID,
  }));
  const admissions = agreement.view.burns.map(burn => {
    const proof = buildTrustlessBurnInclusionProof(
      leaves,
      burn.burnIdHex,
    );
    return buildAdmission({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: LEGACY_KEY_A,
      eventIndex: burn.eventIndex,
      discriminator: 7,
      amountNanoErg: BigInt(burn.amountNanoErg),
      recipientErgoTreeHex: burn.recipientErgoTreeHex,
      executionBlockHashHex: MAPPING_BLOCK_HASH,
      sidechainHeight: MAPPING_BLOCK_NUMBER,
      proof,
    });
  });
  return {
    reconstruction: reconstructionForMapping,
    historicalPayoutAgreement,
    agreement,
    admission: admissions[0],
    admissions,
  };
}

function eventCompleteProvider(
  receipts: readonly unknown[],
): FrontierBurnProofProvider {
  return {
    async getBlock(number) {
      return {
        number,
        hash: `0x${MAPPING_BLOCK_HASH}`,
      };
    },
    async getBlockReceipts() {
      return structuredClone(receipts);
    },
  };
}

function eventCompleteReceipts(
  burns: readonly EventCompleteBurnSpec[],
) {
  return [{
    status: '0x1',
    transactionIndex: '0x0',
    transactionHash: `0x${LEGACY_KEY_A}`,
    blockHash: `0x${MAPPING_BLOCK_HASH}`,
    blockNumber: `0x${MAPPING_BLOCK_NUMBER.toString(16)}`,
    logs: burns.map((burn, index) => ({
      address: BRIDGE_ADDRESS,
      topics: [
        FRONTIER_PEG_OUT_TOPIC,
        `0x${MAPPING_USER.slice(2).padStart(64, '0')}`,
      ],
      data: pegOutData(
        burn.amountNanoErg,
        burn.recipientErgoTreeHex,
      ),
      logIndex: `0x${index.toString(16)}`,
    })),
  }];
}

function pegOutData(amount: bigint, recipientErgoTreeHex: string): string {
  const recipient = recipientErgoTreeHex.replace(/^0x/, '');
  const padded = recipient.padEnd(
    Math.ceil(recipient.length / 64) * 64,
    '0',
  );
  return `0x${uint256Word(amount)}${uint256Word(64n)}`
    + `${uint256Word(BigInt(recipient.length / 2))}${padded}`;
}

function uint256Word(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

interface ReconstructionFixture {
  readonly source: AuthenticatedV2DupChainSource;
}

interface HistoricalPayoutFixture {
  readonly legacyHistoryKeyHex: string;
  readonly transaction: Record<string, any>;
  readonly block: Record<string, any>;
}

interface CanonicalReconstructionFixture extends ReconstructionFixture {
  readonly historicalPayouts: readonly HistoricalPayoutFixture[];
}

async function buildReconstruction(
  historyKeys: readonly [string, string] = [
    LEGACY_KEY_A,
    LEGACY_KEY_B,
  ],
  payoutErgoTrees: readonly [string, string] = [
    PAYOUT_TREE,
    PAYOUT_TREE,
  ],
) {
  const primary = reconstructionFixture(
    'fixture://replay-import-primary',
    historyKeys,
    payoutErgoTrees,
  );
  const witness = reconstructionFixture(
    'fixture://replay-import-witness',
    historyKeys,
    payoutErgoTrees,
  );
  return reconstructAuthenticatedV2DupHistoryFromDistinctSources({
    primarySource: primary.source,
    witnessSource: witness.source,
    duplicatePreventionNftIdHex: DUP_NFT_ID,
    duplicatePreventionErgoTreeHex: DUP_TREE,
  });
}

async function buildCanonicalMappingReconstruction(
  historyKeys: readonly [string, string],
  payoutErgoTrees: readonly [string, string],
) {
  const primaryFixture = canonicalReconstructionFixture(
    'fixture://replay-import-canonical-primary',
    historyKeys,
    payoutErgoTrees,
  );
  const witnessFixture = canonicalReconstructionFixture(
    'fixture://replay-import-canonical-witness',
    historyKeys,
    payoutErgoTrees,
  );
  const reconstruction =
    await reconstructAuthenticatedV2DupHistoryFromDistinctSources({
      primarySource: primaryFixture.source,
      witnessSource: witnessFixture.source,
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    });
  return {
    reconstruction,
    primaryFixture,
    witnessFixture,
  };
}

function canonicalReconstructionFixture(
  observationSourceId: string,
  historyKeys: readonly [string, string],
  payoutErgoTrees: readonly [string, string],
): CanonicalReconstructionFixture {
  const [firstHistoryKey, secondHistoryKey] = historyKeys;
  const firstProof = insertLockRecord([], firstHistoryKey);
  const secondProof = insertLockRecord([firstHistoryKey], secondHistoryKey);
  const firstContext = proofContext(firstProof, firstHistoryKey);
  const secondContext = proofContext(secondProof, secondHistoryKey);
  const rootTemplate = dupBoxTemplate(
    SETUP_TX_ID,
    100,
    0,
    EMPTY_AVL_DIGEST,
  );
  const canonicalSettlementA = canonicalSettlementTransaction({
    inclusionHeight: 101,
    dupInputBoxId: rootTemplate.boxId,
    vaultInputBoxId: VAULT_BOX_ID_A,
    context: firstContext,
    successorCounter: 1,
    successorDigestHex: firstProof.new_digest_hex,
    payoutErgoTreeHex: payoutErgoTrees[0],
  });
  const middleTemplate = structuredClone(canonicalSettlementA.outputs[0]);
  const canonicalSettlementB = canonicalSettlementTransaction({
    inclusionHeight: 102,
    dupInputBoxId: middleTemplate.boxId,
    vaultInputBoxId: VAULT_BOX_ID_B,
    context: secondContext,
    successorCounter: 2,
    successorDigestHex: secondProof.new_digest_hex,
    payoutErgoTreeHex: payoutErgoTrees[1],
  });
  const tipTemplate = structuredClone(canonicalSettlementB.outputs[0]);
  const blockA = canonicalSettlementBlock({
    transaction: canonicalSettlementA,
    parentIdHex: SETUP_BLOCK_ID,
    height: 101,
    discriminator: 0x51,
  });
  const blockB = canonicalSettlementBlock({
    transaction: canonicalSettlementB,
    parentIdHex: blockA.header.id,
    height: 102,
    discriminator: 0x52,
  });
  const root = {
    ...structuredClone(rootTemplate),
    inclusionHeight: 100,
    spentTransactionId: canonicalSettlementA.id,
    spendingProof: structuredClone(
      canonicalSettlementA.inputs[0].spendingProof,
    ),
  };
  const middle = {
    ...structuredClone(middleTemplate),
    inclusionHeight: 101,
    spentTransactionId: canonicalSettlementB.id,
    spendingProof: structuredClone(
      canonicalSettlementB.inputs[0].spendingProof,
    ),
  };
  const tip = {
    ...structuredClone(tipTemplate),
    inclusionHeight: 102,
    spentTransactionId: null,
    spendingProof: null,
  };
  const setup = {
    id: SETUP_TX_ID,
    blockId: SETUP_BLOCK_ID,
    inclusionHeight: 100,
    inputs: [{
      boxId: DUP_NFT_ID,
      spendingProof: { proofBytes: '', extension: {} },
    }],
    dataInputs: [],
    outputs: [
      structuredClone(rootTemplate),
      plainBox(SETUP_TX_ID, 1, 100, 5_000_000, PAYOUT_TREE),
    ],
  };
  const settlementA = {
    ...structuredClone(canonicalSettlementA),
    blockId: blockA.header.id,
    inclusionHeight: 101,
  };
  const settlementB = {
    ...structuredClone(canonicalSettlementB),
    blockId: blockB.header.id,
    inclusionHeight: 102,
  };
  const currentTip = structuredClone(tipTemplate);
  const source: AuthenticatedV2DupChainSource = {
    observationSourceId,
    async getIndexedHeight() {
      return { indexedHeight: 120, fullHeight: 120 };
    },
    async getBestHeader() {
      return {
        id: BEST_HEADER_ID,
        parentId: BEST_PARENT_ID,
        height: 120,
        extensionRoot: EXTENSION_ROOT,
      };
    },
    async getIndexedBoxesByTokenId() {
      return [
        structuredClone(root),
        structuredClone(middle),
        structuredClone(tip),
      ];
    },
    async getTransaction(transactionId: string) {
      if (transactionId === SETUP_TX_ID) return structuredClone(setup);
      if (transactionId === canonicalSettlementA.id) {
        return structuredClone(settlementA);
      }
      if (transactionId === canonicalSettlementB.id) {
        return structuredClone(settlementB);
      }
      return null;
    },
    async getBlockHeaderById(blockId: string) {
      if (blockId === blockA.header.id) {
        return {
          ...structuredClone(blockA.header),
          extensionRoot: blockA.header.extensionHash,
        };
      }
      if (blockId === blockB.header.id) {
        return {
          ...structuredClone(blockB.header),
          extensionRoot: blockB.header.extensionHash,
        };
      }
      return null;
    },
    async getBoxByIdOrNull(boxId: string) {
      return boxId === currentTip.boxId ? structuredClone(currentTip) : null;
    },
    async getBoxBinaryByIdOrNull(boxId: string) {
      return boxId === currentTip.boxId
        ? binaryResponse(currentTip)
        : null;
    },
  };
  return {
    source,
    historicalPayouts: [
      {
        legacyHistoryKeyHex: firstHistoryKey,
        transaction: canonicalSettlementA,
        block: blockA,
      },
      {
        legacyHistoryKeyHex: secondHistoryKey,
        transaction: canonicalSettlementB,
        block: blockB,
      },
    ],
  };
}

function historicalPayoutSource(
  fixture: CanonicalReconstructionFixture,
  legacyHistoryKeyHex: string,
): AuthenticatedV2HistoricalPayoutChainSource {
  const payout = fixture.historicalPayouts.find(
    entry => entry.legacyHistoryKeyHex === legacyHistoryKeyHex,
  );
  if (payout === undefined) {
    throw new Error(
      `missing canonical historical payout fixture for ${legacyHistoryKeyHex}`,
    );
  }
  return {
    async getTransaction(transactionIdHex) {
      return transactionIdHex === payout.transaction.id
        ? structuredClone(payout.transaction)
        : null;
    },
    async getBlockByHeaderId(headerIdHex) {
      return headerIdHex === payout.block.header.id
        ? structuredClone(payout.block)
        : null;
    },
  };
}

function reconstructionFixture(
  observationSourceId: string,
  historyKeys: readonly [string, string],
  payoutErgoTrees: readonly [string, string],
): ReconstructionFixture {
  const [firstHistoryKey, secondHistoryKey] = historyKeys;
  const firstProof = insertLockRecord([], firstHistoryKey);
  const secondProof = insertLockRecord([firstHistoryKey], secondHistoryKey);
  const firstContext = proofContext(firstProof, firstHistoryKey);
  const secondContext = proofContext(secondProof, secondHistoryKey);
  const rootTemplate = dupBoxTemplate(
    SETUP_TX_ID,
    100,
    0,
    EMPTY_AVL_DIGEST,
  );
  const middleTemplate = dupBoxTemplate(
    SETTLEMENT_TX_ID_A,
    101,
    1,
    firstProof.new_digest_hex,
  );
  const tipTemplate = dupBoxTemplate(
    SETTLEMENT_TX_ID_B,
    102,
    2,
    secondProof.new_digest_hex,
  );
  const root = {
    ...structuredClone(rootTemplate),
    inclusionHeight: 100,
    spentTransactionId: SETTLEMENT_TX_ID_A,
    spendingProof: { proofBytes: '', extension: firstContext },
  };
  const middle = {
    ...structuredClone(middleTemplate),
    inclusionHeight: 101,
    spentTransactionId: SETTLEMENT_TX_ID_B,
    spendingProof: { proofBytes: '', extension: secondContext },
  };
  const tip = {
    ...structuredClone(tipTemplate),
    inclusionHeight: 102,
    spentTransactionId: null,
    spendingProof: null,
  };
  const setup = {
    id: SETUP_TX_ID,
    blockId: SETUP_BLOCK_ID,
    inclusionHeight: 100,
    inputs: [{
      boxId: DUP_NFT_ID,
      spendingProof: { proofBytes: '', extension: {} },
    }],
    dataInputs: [],
    outputs: [
      structuredClone(rootTemplate),
      plainBox(SETUP_TX_ID, 1, 100, 5_000_000, PAYOUT_TREE),
    ],
  };
  const settlementA = settlementTransaction({
    transactionId: SETTLEMENT_TX_ID_A,
    blockId: SETTLEMENT_BLOCK_ID_A,
    inclusionHeight: 101,
    dupInputBoxId: rootTemplate.boxId,
    dupSuccessor: middleTemplate,
    vaultInputBoxId: VAULT_BOX_ID_A,
    context: firstContext,
    payoutErgoTreeHex: payoutErgoTrees[0],
  });
  const settlementB = settlementTransaction({
    transactionId: SETTLEMENT_TX_ID_B,
    blockId: SETTLEMENT_BLOCK_ID_B,
    inclusionHeight: 102,
    dupInputBoxId: middleTemplate.boxId,
    dupSuccessor: tipTemplate,
    vaultInputBoxId: VAULT_BOX_ID_B,
    context: secondContext,
    payoutErgoTreeHex: payoutErgoTrees[1],
  });
  const currentTip = structuredClone(tipTemplate);
  const source: AuthenticatedV2DupChainSource = {
    observationSourceId,
    async getIndexedHeight() {
      return { indexedHeight: 120, fullHeight: 120 };
    },
    async getBestHeader() {
      return {
        id: BEST_HEADER_ID,
        parentId: BEST_PARENT_ID,
        height: 120,
        extensionRoot: EXTENSION_ROOT,
      };
    },
    async getIndexedBoxesByTokenId() {
      return [
        structuredClone(root),
        structuredClone(middle),
        structuredClone(tip),
      ];
    },
    async getTransaction(transactionId: string) {
      if (transactionId === SETUP_TX_ID) return structuredClone(setup);
      if (transactionId === SETTLEMENT_TX_ID_A) {
        return structuredClone(settlementA);
      }
      if (transactionId === SETTLEMENT_TX_ID_B) {
        return structuredClone(settlementB);
      }
      return null;
    },
    async getBlockHeaderById(blockId: string) {
      if (blockId === SETTLEMENT_BLOCK_ID_A) {
        return {
          id: SETTLEMENT_BLOCK_ID_A,
          parentId: SETUP_BLOCK_ID,
          height: 101,
          extensionRoot: EXTENSION_ROOT,
        };
      }
      if (blockId === SETTLEMENT_BLOCK_ID_B) {
        return {
          id: SETTLEMENT_BLOCK_ID_B,
          parentId: SETTLEMENT_BLOCK_ID_A,
          height: 102,
          extensionRoot: EXTENSION_ROOT,
        };
      }
      return null;
    },
    async getBoxByIdOrNull(boxId: string) {
      return boxId === currentTip.boxId ? structuredClone(currentTip) : null;
    },
    async getBoxBinaryByIdOrNull(boxId: string) {
      return boxId === currentTip.boxId
        ? binaryResponse(currentTip)
        : null;
    },
  };
  return { source };
}

function proofContext(
  proof: ReturnType<typeof insertLockRecord>,
  keyHex: string,
) {
  return {
    '0': encodeCollByteRegister(Buffer.from(proof.lookup_proof_hex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(keyHex, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(proof.insert_proof_hex, 'hex')),
  };
}

function dupBoxTemplate(
  transactionId: string,
  creationHeight: number,
  counter: number,
  digestHex: string,
) {
  return materializeBox({
    transactionId,
    index: 0,
    creationHeight,
    value: 2_000_000,
    ergoTree: DUP_TREE,
    assets: [{ tokenId: DUP_NFT_ID, amount: 1 }],
    additionalRegisters: {
      R4: encodeLongRegister(counter),
      R5: encodeAvlTreeRegister(Buffer.from(digestHex, 'hex'), 0x0b, 1),
      R6: AUTHORITY,
    },
  });
}

function canonicalSettlementTransaction(input: {
  readonly inclusionHeight: number;
  readonly dupInputBoxId: string;
  readonly vaultInputBoxId: string;
  readonly context: Record<string, string>;
  readonly successorCounter: number;
  readonly successorDigestHex: string;
  readonly payoutErgoTreeHex: string;
}): Record<string, any> {
  const unsigned = TEST_WASM.UnsignedTransaction.from_json(JSON.stringify({
    inputs: [
      {
        boxId: input.dupInputBoxId,
        extension: structuredClone(input.context),
      },
      {
        boxId: input.vaultInputBoxId,
        extension: {},
      },
    ],
    dataInputs: [{ boxId: TRACKER_BOX_ID }],
    outputs: [
      {
        value: '2000000',
        ergoTree: DUP_TREE,
        assets: [{ tokenId: DUP_NFT_ID, amount: '1' }],
        additionalRegisters: {
          R4: encodeLongRegister(input.successorCounter),
          R5: encodeAvlTreeRegister(
            Buffer.from(input.successorDigestHex, 'hex'),
            0x0b,
            1,
          ),
          R6: AUTHORITY,
        },
        creationHeight: input.inclusionHeight,
      },
      canonicalOutputCandidate(
        3_900_000,
        input.payoutErgoTreeHex,
        input.inclusionHeight,
      ),
      canonicalOutputCandidate(
        1_100_000,
        MINER_FEE_TREE,
        input.inclusionHeight,
      ),
    ],
  }));
  const signed = TEST_WASM.Transaction.from_unsigned_tx(
    unsigned,
    [new Uint8Array(), new Uint8Array()],
  );
  try {
    return signed.to_js_eip12() as Record<string, any>;
  } finally {
    signed.free?.();
  }
}

function canonicalOutputCandidate(
  valueNanoErg: number,
  ergoTreeHex: string,
  creationHeight: number,
) {
  return {
    value: String(valueNanoErg),
    ergoTree: ergoTreeHex,
    assets: [],
    additionalRegisters: {},
    creationHeight,
  };
}

function canonicalSettlementBlock(input: {
  readonly transaction: Record<string, any>;
  readonly parentIdHex: string;
  readonly height: number;
  readonly discriminator: number;
}): Record<string, any> {
  const transactionsRootHex = computeErgoBlockTransactionsRoot({
    blockVersion: 2,
    transactions: [{
      transactionId: Buffer.from(input.transaction.id, 'hex'),
      spendingProofs: input.transaction.inputs.map(
        (transactionInput: Record<string, any>) =>
          Buffer.from(transactionInput.spendingProof.proofBytes, 'hex'),
      ),
    }],
  }).toString('hex');
  const marker = input.discriminator.toString(16).padStart(2, '0');
  const nonce = Buffer.alloc(8);
  nonce.writeBigUInt64BE(BigInt(input.height));
  const headerFields = {
    version: 2,
    parentId: Buffer.from(input.parentIdHex, 'hex'),
    adProofsRoot: Buffer.from(marker.repeat(32), 'hex'),
    stateRoot: Buffer.from(`00${marker.repeat(32)}`, 'hex'),
    transactionsRoot: Buffer.from(transactionsRootHex, 'hex'),
    timestamp: 1_720_000_000_000n + BigInt(input.height),
    nBits: 117_440_511,
    height: input.height,
    extensionHash: Buffer.from(
      (input.discriminator + 1).toString(16).padStart(2, '0').repeat(32),
      'hex',
    ),
    votes: Buffer.from('000000', 'hex'),
    powSolution: {
      publicKey: Buffer.from(
        '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        'hex',
      ),
      nonce,
    },
  } as const;
  const headerIdHex = computeErgoHeaderId(headerFields).toString('hex');
  return {
    header: {
      id: headerIdHex,
      parentId: input.parentIdHex,
      height: input.height,
      version: 2,
      adProofsRoot: headerFields.adProofsRoot.toString('hex'),
      stateRoot: headerFields.stateRoot.toString('hex'),
      transactionsRoot: transactionsRootHex,
      timestamp: Number(headerFields.timestamp),
      nBits: headerFields.nBits,
      extensionHash: headerFields.extensionHash.toString('hex'),
      powSolutions: {
        pk: headerFields.powSolution.publicKey.toString('hex'),
        w:
          '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        n: headerFields.powSolution.nonce.toString('hex'),
        d: '0',
      },
      votes: headerFields.votes.toString('hex'),
    },
    blockTransactions: {
      headerId: headerIdHex,
      blockVersion: 2,
      transactions: [structuredClone(input.transaction)],
    },
  };
}

function settlementTransaction(input: {
  readonly transactionId: string;
  readonly blockId: string;
  readonly inclusionHeight: number;
  readonly dupInputBoxId: string;
  readonly dupSuccessor: any;
  readonly vaultInputBoxId: string;
  readonly context: Record<string, string>;
  readonly payoutErgoTreeHex: string;
}) {
  return {
    id: input.transactionId,
    blockId: input.blockId,
    inclusionHeight: input.inclusionHeight,
    inputs: [
      {
        boxId: input.dupInputBoxId,
        spendingProof: {
          proofBytes: '',
          extension: structuredClone(input.context),
        },
      },
      {
        boxId: input.vaultInputBoxId,
        spendingProof: { proofBytes: '', extension: {} },
      },
    ],
    dataInputs: [{ boxId: TRACKER_BOX_ID }],
    outputs: [
      structuredClone(input.dupSuccessor),
      plainBox(
        input.transactionId,
        1,
        input.inclusionHeight,
        3_900_000,
        input.payoutErgoTreeHex,
      ),
      plainBox(
        input.transactionId,
        2,
        input.inclusionHeight,
        1_100_000,
        MINER_FEE_TREE,
      ),
    ],
  };
}

function plainBox(
  transactionId: string,
  index: number,
  creationHeight: number,
  value: number,
  ergoTree: string,
) {
  return materializeBox({
    transactionId,
    index,
    creationHeight,
    value,
    ergoTree,
  });
}

function materializeBox(input: {
  readonly transactionId: string;
  readonly index: number;
  readonly creationHeight: number;
  readonly value: number;
  readonly ergoTree: string;
  readonly assets?: readonly { tokenId: string; amount: number }[];
  readonly additionalRegisters?: Readonly<Record<string, string>>;
}): any {
  const value = TEST_WASM.BoxValue.from_i64(
    TEST_WASM.I64.from_str(String(input.value)),
  );
  const tree = TEST_WASM.ErgoTree.from_base16_bytes(input.ergoTree);
  const contract = TEST_WASM.Contract.new(tree);
  const builder = new TEST_WASM.ErgoBoxCandidateBuilder(
    value,
    contract,
    input.creationHeight,
  );
  try {
    for (const asset of input.assets ?? []) {
      builder.add_token(
        TEST_WASM.TokenId.from_str(asset.tokenId),
        TEST_WASM.TokenAmount.from_i64(
          TEST_WASM.I64.from_str(String(asset.amount)),
        ),
      );
    }
    for (
      const [name, encoded]
      of Object.entries(input.additionalRegisters ?? {})
    ) {
      builder.set_register_value(
        TEST_WASM.NonMandatoryRegisterId[name],
        TEST_WASM.Constant.decode_from_base16(encoded),
      );
    }
    const candidate = builder.build();
    const transactionId = TEST_WASM.TxId.from_str(input.transactionId);
    const box = TEST_WASM.ErgoBox.from_box_candidate(
      candidate,
      transactionId,
      input.index,
    );
    try {
      return box.to_js_eip12();
    } finally {
      box.free?.();
      transactionId.free?.();
      candidate.free?.();
    }
  } finally {
    builder.free?.();
  }
}

async function binaryResponse(box: any): Promise<{ bytes: string }> {
  const parsed = TEST_WASM.ErgoBox.from_json(JSON.stringify(box));
  try {
    return {
      bytes: Buffer.from(parsed.sigma_serialize_bytes()).toString('hex'),
    };
  } finally {
    parsed.free?.();
  }
}

function buildAdmission(input: {
  readonly sidechainIdHex: string;
  readonly sidechainTxHashHex: string;
  readonly eventIndex: number;
  readonly discriminator: number;
  readonly verifierProfileIdHex?: string;
  readonly amountNanoErg?: bigint;
  readonly recipientErgoTreeHex?: string;
  readonly executionBlockHashHex?: string;
  readonly sidechainHeight?: number;
  readonly proof?: TrustlessBurnInclusionProof;
}): NativeCheckpointSettlementAdmission {
  const byte = input.discriminator.toString(16).padStart(2, '0');
  const executionBlockHashHex = input.executionBlockHashHex
    ?? (input.discriminator + 128).toString(16).padStart(2, '0').repeat(32);
  const sidechainHeight = input.sidechainHeight
    ?? 200 + input.discriminator;
  const amountNanoErg = input.amountNanoErg ?? 10_000_000n;
  const recipientErgoTreeHex =
    input.recipientErgoTreeHex ?? RECIPIENT_TREE;
  const recipientErgoTreeHashHex = Buffer.from(blakejs.blake2b(
    Buffer.from(recipientErgoTreeHex, 'hex'),
    undefined,
    32,
  )).toString('hex');
  const burnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: input.sidechainIdHex,
    sidechainTxHashHex: input.sidechainTxHashHex,
    eventIndex: input.eventIndex,
  });
  const proof = input.proof ?? buildTrustlessBurnInclusionProof([{
    sidechainIdHex: input.sidechainIdHex,
    sidechainBlockHashHex: executionBlockHashHex,
    burnIdHex,
    sidechainTxHashHex: input.sidechainTxHashHex,
    eventIndex: input.eventIndex,
    recipientErgoTreeHashHex,
    amountNanoErg,
    assetIdHex: NATIVE_ERG_ASSET_ID,
  }], burnIdHex);
  const checkpointCommitment = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: input.sidechainIdHex,
    sidechainHeight,
    sidechainConsensusBlockHashHex: byte.repeat(32),
    executionBlockHashHex,
    bridgeEventRootHex: proof.bridgeEventRootHex,
    burnLeafCount: proof.leafCount,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: 'a1'.repeat(32),
    finalityProofHashHex: 'a2'.repeat(32),
  });
  const trustAnchorDigestHex = 'aa'.repeat(32);
  const finalityHorizonHashHex = 'ab'.repeat(32);
  const finalityStatement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpointCommitment.encodedCheckpointHex,
    checkpointCommitmentHex:
      checkpointCommitment.checkpointCommitmentHex,
    trustedAnchorDigestHex: trustAnchorDigestHex,
    finalityHorizonHeight: sidechainHeight + 1,
    finalityHorizonHashHex,
  });
  const aggregateFinalityProof = buildAggregateFinalityProofV1({
    verifierProfileIdHex:
      input.verifierProfileIdHex ?? 'ac'.repeat(32),
    encodedStatement: finalityStatement.encodedStatementHex,
    payload: `01${byte}`,
  });
  const checkpoint = {
    checkpointCommitment,
    finalityStatement,
    nativeVerification: {
      requestDigestHex: `ad${byte}`.repeat(16),
      trustAnchorDigestHex,
      finality: {
        horizonHashHex: finalityHorizonHashHex,
        horizonHeight: String(sidechainHeight + 1),
      },
    },
  } as any;
  const trackerIdentity = {
    sidechainIdHex: input.sidechainIdHex,
    sidechainHeight,
    executionBlockHashHex,
  };
  const finalityCommitment =
    buildAggregateFinalityCommitmentV1(aggregateFinalityProof);
  const trackerHistory = [{
    key: deriveAuthenticatedSpvTrackerKey(trackerIdentity),
    value: encodeAuthenticatedSpvTrackerValue({
      bridgeEventRootHex: proof.bridgeEventRootHex,
      checkpointCommitmentHex:
        checkpointCommitment.checkpointCommitmentHex,
      anchorHeaderIdHex: 'ae'.repeat(32),
      anchorHeaderHeight: 150,
      finalityProofSystemId: finalityCommitment.proofSystemId,
      finalityStatementDigestHex:
        finalityCommitment.statementDigestHex,
      finalityProgramIdHex: finalityCommitment.statement.programIdHex,
      finalityVerifierProfileIdHex:
        finalityCommitment.verifierProfileIdHex,
      finalityProofPayloadDigestHex:
        finalityCommitment.payloadDigestHex,
      finalityProofDigestHex: finalityCommitment.proofDigestHex,
    }),
  }];
  return bindNativeCheckpointToAuthenticatedSettlement({
    checkpoint,
    aggregateFinalityProof,
    expectedSidechainIdHex: input.sidechainIdHex,
    pegOut: {
      sidechainTxHash: input.sidechainTxHashHex,
      ergoRecipientAddress: recipientErgoTreeHex,
      amount: amountNanoErg,
      user: `0x${'88'.repeat(20)}`,
      sidechainBlockNumber: sidechainHeight,
      sidechainBlockHash: executionBlockHashHex,
      sidechainLogIndex: input.eventIndex,
    },
    proofBundle: {
      proof,
      settlementIdentity: {
        source: 'trustless-burn-leaf',
        duplicatePreventionKeyHex: burnIdHex,
        bridgeEventRootHex: proof.bridgeEventRootHex,
        recipientErgoTreeHashHex,
        amountNanoErg,
        assetIdHex: NATIVE_ERG_ASSET_ID,
        trustlessBurnProof: proof.proof,
      },
    },
    trackerIdentity,
    trackerHistory,
  });
}

function sigmaProp(privateKeyByte: number): string {
  const ecdh = createECDH('secp256k1');
  const key = Buffer.alloc(32);
  key[31] = privateKeyByte;
  ecdh.setPrivateKey(key);
  return encodeSigmaPropRegister(
    ecdh.getPublicKey(undefined, 'compressed').toString('hex'),
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isRecursivelyFrozen(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return true;
  }
  seen.add(value);
  return Object.isFrozen(value)
    && Object.values(value as Record<string, unknown>)
      .every(child => isRecursivelyFrozen(child, seen));
}
