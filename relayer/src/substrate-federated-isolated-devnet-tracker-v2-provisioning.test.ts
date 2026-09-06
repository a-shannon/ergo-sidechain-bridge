import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import blakejs from 'blakejs';
import axios from 'axios';
import { Mnemonic } from 'ethers';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { getDupTreeDigest, getPooledReserveEmptyDigest } from './avl-bridge.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1,
  buildBridgeValidityTrackerObservedHeaderContextV1 } from './bridge-validity-tracker-header-context-v1.js';
import { buildErgoExtensionMembershipProof } from './ergo-settlement-core/ergo-extension-membership.js';
import { buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context } from './substrate-federated-tracker-v2.js';
import { buildSubstrateFederatedTrackerV2ExternalFeeTransaction } from './substrate-federated-tracker-v2-external-fee.js';
import { deriveLocalWasmRootSignerPublicIdentity } from './local-wasm-root-signer-public-identity.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import * as fleet from './fleet-signer.js';
import * as ergoHelpers from './ergo-helpers.js';
import { StateTracker } from './state-tracker.js';
import { executeSubstrateFederatedIsolatedDevnetGenesisBatchV3 as executeGenesisBatchV3,
  executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1 as executeFeeFunding }
  from './apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import { SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE as GENESIS_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE as FEE_OPERATION_PROFILE }
  from './relayer-core/ergo-operational-transaction-lifecycle.js';
import { createSubstrateFederatedLocalDevnetGenesisJournalV1 as createGenesisJournal }
  from './substrate-federated-local-devnet-genesis-journal-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1 as createTransportV1,
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV2 as createTransportV2,
  submitSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1 as submitFeeFunding,
  finalizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1 as finalizeFeeFunding,
} from './substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import {
  authorizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1 as authorizeFeeFunding,
  reserveSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1 as reserveFeeFunding,
  claimSubstrateFederatedIsolatedDevnetTrackerFeeFundingTransportV1 as claimFeeTransport,
  requireSubstrateFederatedIsolatedDevnetTrackerFeeFundingFinalizationV1 as requireFeeFinalization,
  confirmSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1 as confirmFeeFunding,
} from './substrate-federated-isolated-devnet-tracker-fee-funding-authority-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1 as createAuthorizerV1,
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2 as createAuthorizerV2,
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1 as assertAuthorizationV1,
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV2 as assertAuthorizationV2,
} from './substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js';
import { createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1 as createConfirmationObserver }
  from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1 as createRevalidatorV1,
  createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV2 as createRevalidatorV2,
  assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1 as assertRevalidationV1,
  assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV2 as assertRevalidationV2,
} from './substrate-federated-isolated-devnet-genesis-revalidator-v1.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA as GENESIS_EXECUTION_SCHEMA,
  deriveSubstrateFederatedLocalDevnetGenesisAdmissionDigestV1 as admissionDigest,
  type SubstrateFederatedLocalDevnetGenesisRevalidation,
  type SubstrateFederatedLocalDevnetGenesisDurableAttempt,
  executeSubstrateFederatedLocalDevnetGenesisV1 as executeGenesis,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import * as ownedTargets from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetSetupCheckExecutionSessionV2 as createSession,
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2 as assertExecutionV2,
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3 as assertExecutionV3,
  promoteSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2 as promoteExecutionV2,
  assertSubstrateFederatedIsolatedDevnetTrackerV2Check as assertTrackerV2Check,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import { assertSubstrateFederatedIsolatedDevnetMiningCredentialV1 as assertMiningCredential } from './substrate-federated-isolated-devnet-mining-credential-v1.js';
import {
  encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  encodeSubstrateFederatedCheckpointExtensionValueV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import * as observations from './substrate-federated-genesis-observation-v1.js';
import {
  buildSubstrateFederatedGenesisTargetProfileV1,
  observeSubstrateFederatedGenesisV1,
} from './substrate-federated-genesis-observation-v1.js';
import {
  inspectSubstrateFederatedAuthoritySafeDevnetHistoryBundleV1,
  type SubstrateFederatedAuthoritySafeDevnetHistoryBundleV1,
  type SubstrateFederatedIsolatedDevnetTargetPinsV1,
} from './substrate-federated-isolated-devnet-launch-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetLocalProvisioningV2Provenance as assertV2,
  assertSubstrateFederatedIsolatedDevnetLocalProvisioningV3Provenance as assertV3,
  buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2 as buildV2,
  buildSubstrateFederatedIsolatedDevnetLocalProvisioningV3 as buildV3,
  getSubstrateFederatedIsolatedDevnetLocalCheckTargetV2 as checkTargetV2,
  getSubstrateFederatedIsolatedDevnetLocalCheckTargetV3 as checkTargetV3,
  reobserveSubstrateFederatedIsolatedDevnetLocalProvisioningV2 as reobserveV2,
  reobserveSubstrateFederatedIsolatedDevnetLocalProvisioningV3 as reobserveV3,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_PROVISIONING_V2_DIGEST_DOMAIN as PLAN_DOMAIN_V2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_PROVISIONING_V3_DIGEST_DOMAIN as PLAN_DOMAIN_V3,
} from './substrate-federated-isolated-devnet-local-provisioning-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetSettlementTargetV2Provenance as assertTargetV2,
  assertSubstrateFederatedIsolatedDevnetSettlementTargetV3Provenance as assertTargetV3,
  buildSubstrateFederatedIsolatedDevnetSettlementTargetV2 as targetV2,
  buildSubstrateFederatedIsolatedDevnetSettlementTargetV3 as targetV3,
} from './substrate-federated-isolated-devnet-settlement-target-v2.js';
import {
  buildSubstrateFederatedIsolatedDevnetGenerationTargetV1,
} from './substrate-federated-isolated-devnet-generation-v1.js';
import {
  materializeSubstrateFederatedIsolatedDevnetProvisioningCoreV1,
} from './substrate-federated-isolated-devnet-provisioning-v1.js';
import { compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1 } from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import { compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2 } from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import { buildSubstrateFederatedTrackerCompilerRequestV1 } from './substrate-federated-tracker-compiler-v1.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV1 } from './substrate-federated-tracker-jvm-compiler-v1.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';
import { getSubstrateFederatedTrackerDigestV1Hex } from './substrate-federated-burn-settlement-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2 as requestV2,
  buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV3 as requestV3,
  validateSubstrateFederatedIsolatedDevnetSetupCheckRequestV3 as validateRequestV3,
  assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV3Provenance as assertRequestV3Plan,
  assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV3RuntimeProvenance as assertRequestV3,
} from './substrate-federated-isolated-devnet-setup-check-request-v2.js';
import {
  runSubstrateFederatedIsolatedDevnetSetupCheckV2 as runCheckV2,
  runSubstrateFederatedIsolatedDevnetSetupCheckV3 as runCheckV3,
  validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2 as validateCheckV2,
  validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV3 as validateCheckV3,
  takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV2 as takeCheckV2,
  takeSubstrateFederatedIsolatedDevnetSetupCheckExecutionMaterialV3 as takeCheckV3,
} from './substrate-federated-isolated-devnet-setup-check-v2.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import { discoverSubstrateFederatedRewardInputsV1, discoverSubstrateFederatedRewardInputsV2 }
  from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import type { SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt } from './substrate-federated-isolated-devnet-ergo-node-build-v1.js';
import type { Eip12Box, MaterializedUnsignedTransaction } from './unsigned-ergo-transaction.js';

const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json', import.meta.url,
), 'utf8'));
const profile = buildSubstrateFederatedCheckpointProfileV1(vector.input.profile);
const BRIDGE_ADDRESS = '06'.repeat(20);
const TOKEN_ADDRESS = '07'.repeat(20);
const SOURCE_RUNTIME_DIGEST = '08'.repeat(32);
const BRIDGE_RUNTIME_DIGEST = '09'.repeat(32);
const TOKEN_RUNTIME_DIGEST = '0a'.repeat(32);
const GENESIS_NATIVE_HASH = '0b'.repeat(32);
const TIP_NATIVE_HASH = '0c'.repeat(32);
const TIP_EXECUTION_HASH = '0d'.repeat(32);
const HISTORY_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_HISTORY_V1';
const FUNDING_TREE = '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const GENESIS_HEADER_ID = '91'.repeat(32);
const TIP_HEADER_ID = '92'.repeat(32);
const TIP_HEIGHT = 999;
const MAX_INT = 2_147_483_647;
const roles = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
type Role = typeof roles[number];
type Boxes = Readonly<Record<Role, Eip12Box>>;
type TargetInputV3 = Parameters<typeof targetV3>[0];
type TargetInputV2 = Parameters<typeof targetV2>[0];
type CompilerInputV3 = Omit<TargetInputV3, 'settlementTargetProfile' | 'settlementObservation'>;
type CompilerInputV2 = Omit<TargetInputV2, 'settlementTargetProfile' | 'settlementObservation'>;
type BuildInputV3 = Parameters<typeof buildV3>[0];
type PlanV3 = Awaited<ReturnType<typeof buildV3>>;
let wasm: any;
let boxes: Boxes;
let compilerV3: CompilerInputV3;
let compilerV2: CompilerInputV2;
let checkBoxes: Boxes;
let checkCompiler: CompilerInputV3;
let checkCompilerV2: CompilerInputV2;
let checkMnemonic: string;
let checkPublicKey: string;
let checkHeaders: readonly Readonly<Record<string, unknown>>[];

function contractTemplate(relativePath: string) {
  return { relativePath, source: readFileSync(new URL('../../' + relativePath, import.meta.url), 'utf8') };
}

beforeAll(async () => {
  const module = await import('ergo-lib-wasm-nodejs');
  wasm = module.default ?? module;
  boxes = {
    tracker: fundingCandidate('50000000'),
    duplicatePrevention: fundingCandidate('100000000'),
    pooledReserve: fundingCandidate('150000000'),
  };
  checkMnemonic = Mnemonic.fromEntropy(`0x${'58'.repeat(32)}`).phrase;
  const checkSigner = await deriveLocalWasmRootSignerPublicIdentity(checkMnemonic);
  checkPublicKey = checkSigner.publicKeyHex;
  const rewardTree = deriveDevnetRewardErgoTreeHexForDelay(checkPublicKey, 1);
  checkBoxes = {
    tracker: fundingCandidate('50000000', rewardTree),
    duplicatePrevention: fundingCandidate('100000000', rewardTree),
    pooledReserve: fundingCandidate('150000000', rewardTree),
  };
  checkHeaders = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: TIP_HEIGHT + 1, anchorContextIndex: 0, anchorExtensionRootHex: '94'.repeat(32),
  }).headers.map(header => header.raw);
  const application = {
    sourceNetworkIdHex: '41'.repeat(32), sidechainIdHex: '42'.repeat(32),
    bridgeAddressHex: BRIDGE_ADDRESS, tokenAddressHex: TOKEN_ADDRESS,
    bridgeRuntimeCodeSha256Hex: BRIDGE_RUNTIME_DIGEST, bridgeRuntimeCodeBytes: 4_104,
    tokenRuntimeCodeSha256Hex: TOKEN_RUNTIME_DIGEST, tokenRuntimeCodeBytes: 2_356,
    sourceRuntimeCodeSha256Hex: SOURCE_RUNTIME_DIGEST, sourceRuntimeCodeBytes: 1_969_685,
    runtimeProfileIdHex: '43'.repeat(32), settlementProfileIdHex: '44'.repeat(32),
  };
  const familyTemplates = {
    duplicatePrevention: contractTemplate('contracts/DoubleUnlockPreventionSubstrateFederatedV1.es'),
    sourceLock: contractTemplate('contracts/MainChainLockPooledReserveV6.es'),
    pooledReserve: contractTemplate('contracts/MainChainPooledReserveValidityApplicationV6.es'),
  };
  const history = historyFixture();
  inspectSubstrateFederatedAuthoritySafeDevnetHistoryBundleV1(history.bundle, history.pins);
  const common = {
    familyTemplates, historyBundle: history.bundle,
    trustPins: {
      ...history.pins,
      expectedSourceNetworkIdHex: application.sourceNetworkIdHex,
      expectedSidechainIdHex: application.sidechainIdHex,
      expectedRuntimeProfileIdHex: application.runtimeProfileIdHex,
      expectedSettlementProfileIdHex: application.settlementProfileIdHex,
      expectedSourceAttestationKeySetDigestHex: profile.sourceAttestationKeySetDigestHex,
      expectedSourceAttestationThreshold: profile.sourceAttestationThreshold,
    },
  };
  const familyInputs = {
    templates: familyTemplates,
    duplicatePreventionGenesisInputBoxIdHex: boxes.duplicatePrevention.boxId,
    pooledReserveGenesisInputBoxIdHex: boxes.pooledReserve.boxId,
  };
  // The same reviewed compiler harness as V156/V157; every positive receipt is genuine.
  if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
    throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
  }
  const testNodeOptions = process.env.NODE_OPTIONS;
  delete process.env.NODE_OPTIONS;
  try {
    const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
      trackerGenesisInputBoxIdHex: boxes.tracker.boxId, profile, application,
      template: contractTemplate('contracts/SPVTrackerSubstrateFederatedV2.es'),
    });
    const trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
    const familyReceipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2({
      ...familyInputs, trackerRequest, trackerReceipt,
    });
    compilerV3 = { ...common, trackerRequest, trackerReceipt, familyReceipt };
    const requestV1 = buildSubstrateFederatedTrackerCompilerRequestV1({
      trackerGenesisInputBoxIdHex: boxes.tracker.boxId, profile, application,
      template: contractTemplate('contracts/SPVTrackerSubstrateFederatedV1.es'),
    });
    const receiptV1 = await compileSubstrateFederatedTrackerWithPinnedJvmV1(requestV1);
    const familyV1 = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
      ...familyInputs, trackerRequest: requestV1, trackerReceipt: receiptV1,
    });
    compilerV2 = { ...common, trackerRequest: requestV1, trackerReceipt: receiptV1, familyReceipt: familyV1 };
    const checkRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
      trackerGenesisInputBoxIdHex: checkBoxes.tracker.boxId, profile, application,
      template: contractTemplate('contracts/SPVTrackerSubstrateFederatedV2.es'),
    });
    const checkReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(checkRequest);
    const checkFamily = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2({
      templates: familyTemplates, trackerRequest: checkRequest, trackerReceipt: checkReceipt,
      duplicatePreventionGenesisInputBoxIdHex: checkBoxes.duplicatePrevention.boxId,
      pooledReserveGenesisInputBoxIdHex: checkBoxes.pooledReserve.boxId,
    });
    checkCompiler = { ...common, trackerRequest: checkRequest, trackerReceipt: checkReceipt, familyReceipt: checkFamily };
    const oldCheckRequest = buildSubstrateFederatedTrackerCompilerRequestV1({
      trackerGenesisInputBoxIdHex: checkBoxes.tracker.boxId, profile, application,
      template: contractTemplate('contracts/SPVTrackerSubstrateFederatedV1.es'),
    });
    const oldCheckReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV1(oldCheckRequest);
    const oldCheckFamily = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
      templates: familyTemplates, trackerRequest: oldCheckRequest, trackerReceipt: oldCheckReceipt,
      duplicatePreventionGenesisInputBoxIdHex: checkBoxes.duplicatePrevention.boxId,
      pooledReserveGenesisInputBoxIdHex: checkBoxes.pooledReserve.boxId,
    });
    checkCompilerV2 = { ...common, trackerRequest: oldCheckRequest, trackerReceipt: oldCheckReceipt, familyReceipt: oldCheckFamily };
  } finally {
    process.env.NODE_OPTIONS = testNodeOptions;
  }
}, 120_000);

describe('genuine V2 tracker and family -> local provisioning V3', () => {
  it('materializes all three exact unsigned issuances without launch or funds authority', async () => {
    await withObservations(async observed => {
      const input = await provisioningInput(observed);
      const plan = await buildV3(input);
      assertTargetV3(input.settlementTarget);
      assertV3(plan);
      expect(() => assertTargetV2(input.settlementTarget)).toThrow(/not built in this process/);
      expect(plan.schema).toBe('e2s.substrate-federated-isolated-devnet-local-provisioning.v3');
      expect(plan.version).toBe(3);
      expect(plan.target.compilerProfile).toBe('absolute-height-tracker-v2');
      expect(plan.target).not.toHaveProperty('compatibilityTargetV1AuditDigestHex');
      expect(input.settlementTarget).not.toHaveProperty('compatibilityTargetV1AuditDigestHex');
      expect(plan.target.settlementNetworkScope).toBe('ergo-local-devnet');
      expect(plan.globalReplay).toEqual({
        canonicalBurnIdsHex: [], canonicalBurnIdCount: 0,
        duplicatePreventionDigestHex: getDupTreeDigest([]),
        derivation: 'empty-new-local-profile-intent',
        predecessorNonInstantiationAuthenticated: false,
      });
      expect(Object.values(plan.execution).every(value => value === false)).toBe(true);
      for (const [name, value] of Object.entries(plan.boundaries)) {
        expect(value, name).toBe(['localCompatibilityIntentOnly', 'currentGenesisInputsObservedUnspent'].includes(name));
      }
      expect(plan.genesisPayloads.tracker.ergoTreeHex).toBe(compilerV3.trackerReceipt.contract.propositionHex);
      expect(plan.genesisPayloads.tracker.ergoTreeHex).not.toBe(compilerV2.trackerReceipt.contract.propositionHex);
      expect(plan.genesisPayloads.duplicatePrevention.ergoTreeHex)
        .toBe(compilerV3.familyReceipt.contracts.duplicatePrevention.propositionHex);
      expect(plan.genesisPayloads.pooledReserve.ergoTreeHex)
        .toBe(compilerV3.familyReceipt.contracts.pooledReserve.propositionHex);
      expect(plan.genesisPayloads.tracker.additionalRegisters).toEqual({
        R4: encodeCollByteRegister(Buffer.from(profile.profileIdHex, 'hex')),
        R5: encodeAvlTreeRegister(Buffer.from(getSubstrateFederatedTrackerDigestV1Hex([]), 'hex'), 1, 370),
        R6: encodeCollByteRegister(Buffer.from(compilerV3.trackerRequest.application.sidechainIdHex, 'hex')),
        R7: encodeLongRegister(0n), R8: encodeIntRegister(0),
        R9: encodeCollByteRegister(Buffer.from(profile.ergoAdmissionKeySetDigestHex, 'hex')),
      });
      const familyRegister = encodeCollByteRegister(Buffer.from(compilerV3.familyReceipt.profile.familyIdHex, 'hex'));
      expect(plan.genesisPayloads.duplicatePrevention.additionalRegisters).toEqual({
        R4: familyRegister, R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest([]), 'hex'), 1, 1),
      });
      expect(plan.genesisPayloads.pooledReserve.additionalRegisters).toEqual({
        R4: familyRegister,
        R5: encodeAvlTreeRegister(Buffer.from(getPooledReserveEmptyDigest(), 'hex'), 1, 32),
        R6: encodeLongRegister(0n),
      });
      for (const role of roles) {
        expectIssuance(plan, role, TIP_HEIGHT + 1);
        expect(Buffer.from(blakejs.blake2b(
          Buffer.from(plan.genesisPayloads[role].ergoTreeHex, 'hex'), undefined, 32,
        )).toString('hex')).toBe(input.settlementTarget.lineages[role].contractIdHex);
      }
      const { planDigestHex, ...body } = plan;
      expect(sha256CanonicalJson(body, PLAN_DOMAIN_V3)).toBe(planDigestHex);
      expect(sha256CanonicalJson(body, PLAN_DOMAIN_V2)).not.toBe(planDigestHex);
      expect(plan.launchIntentIdHex).toBe(sha256CanonicalJson({
        settlementTargetDigestHex: input.settlementTarget.descriptorDigestHex,
        freshObservationDigestHex: input.freshSettlementObservation.reportDigestHex,
        preSetupAnchor: plan.freshObservation.preSetupAnchor,
        genesisPayloadSetDigestHex: plan.genesisPayloads.payloadSetDigestHex,
        provisioningIdentitySetDigestHex: plan.provisioning.identitySetDigestHex,
      }, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_LAUNCH_INTENT_V3'));
      expect(checkTargetV3(plan)).toEqual({
        environment: 'patched-devnet', nodeReportedNetwork: 'devnet',
        genesisHeaderIdHex: GENESIS_HEADER_ID,
        primary: {
          nodeOrigin: observed.profile.sources.primary.endpointOrigin,
          sourceIdHex: observed.profile.sources.primary.sourceIdHex,
        },
        witness: {
          nodeOrigin: observed.profile.sources.witness.endpointOrigin,
          sourceIdHex: observed.profile.sources.witness.sourceIdHex,
        },
      });
      const fresh = await reobserveV3(plan);
      observations.assertSubstrateFederatedGenesisObservationV1Provenance(observed.profile, fresh);
      expect(fresh.target).toEqual(input.freshSettlementObservation.target);
      expectDeepFrozen(plan);
    });
  });

  it('retains the V2 tip-height materialization and digest domains and rejects cross-version APIs', async () => {
    await withObservations(async observed => {
      const input = await provisioningInput(observed);
      const plan3 = await buildV3(input);
      const settlementTarget = targetV2({
        ...compilerV2, settlementTargetProfile: observed.profile, settlementObservation: observed.retained,
      });
      const input2 = { ...input, settlementTarget };
      const plan2 = await buildV2(input2);
      assertV2(plan2);
      const oldRequest = await requestV2(plan2);
      expect(oldRequest.version).toBe(2);
      expect(oldRequest.sourceBindings.compatibilityTargetV1AuditDigestHex).toBe(settlementTarget.compatibilityTargetV1AuditDigestHex);
      await expect(Reflect.apply(requestV3, undefined, [plan2])).rejects.toThrow(/not built in this process/);
      await expect(assertRequestV3(oldRequest)).rejects.toThrow(/process/);
      const generation = buildSubstrateFederatedIsolatedDevnetGenerationTargetV1(settlementTarget, getDupTreeDigest([]));
      const core = await materializeSubstrateFederatedIsolatedDevnetProvisioningCoreV1({
        genesisInputs: boxes, lineages: generation.lineages, genesisPayloads: generation.genesisPayloads,
        creationHeight: TIP_HEIGHT, inputMode: 'fresh-current',
      });
      expect(plan2.genesisPayloads).toEqual(generation.genesisPayloads);
      expect(plan2.genesisInputs).toEqual(core.genesisInputs);
      expect(plan2.provisioning).toEqual(core.provisioning);
      expect(plan2.target.compatibilityTargetV1AuditDigestHex).toBe(settlementTarget.compatibilityTargetV1AuditDigestHex);
      expect(plan2.target).not.toHaveProperty('compilerProfile');
      const { planDigestHex, ...body } = plan2;
      expect(sha256CanonicalJson(body, PLAN_DOMAIN_V2)).toBe(planDigestHex);
      expect(plan2.launchIntentIdHex).toBe(sha256CanonicalJson({
        settlementTargetDigestHex: settlementTarget.descriptorDigestHex,
        freshObservationDigestHex: input.freshSettlementObservation.reportDigestHex,
        preSetupAnchor: plan2.freshObservation.preSetupAnchor,
        genesisPayloadSetDigestHex: generation.genesisPayloads.payloadSetDigestHex,
        provisioningIdentitySetDigestHex: core.provisioning.identitySetDigestHex,
      }, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_LAUNCH_INTENT_V2'));
      await expect(Reflect.apply(buildV2, undefined, [input])).rejects.toThrow(/not built in this process/);
      await expect(Reflect.apply(buildV3, undefined, [input2])).rejects.toThrow(/not built in this process/);
      expect(() => assertV2(plan3)).toThrow(/not built in this process/);
      expect(() => assertV3(plan2)).toThrow(/not built in this process/);
      expect(() => Reflect.apply(checkTargetV2, undefined, [plan3])).toThrow(/not built in this process/);
      expect(() => Reflect.apply(checkTargetV3, undefined, [plan2])).toThrow(/not built in this process/);
      await expect(Reflect.apply(reobserveV2, undefined, [plan3])).rejects.toThrow(/not built in this process/);
      await expect(Reflect.apply(reobserveV3, undefined, [plan2])).rejects.toThrow(/not built in this process/);
    });
  });

  it('rejects a genuine V1 family and copied V2 compiler receipts at compiler provenance', async () => {
    await withObservations(async observed => {
      const input = {
        ...compilerV3, settlementTargetProfile: observed.profile, settlementObservation: observed.retained,
      };
      expect(() => Reflect.apply(targetV3, undefined, [{ ...input, familyReceipt: compilerV2.familyReceipt }]))
        .toThrow('federated V2 settlement-family JVM receipt lacks process provenance');
      for (const field of ['trackerReceipt', 'familyReceipt'] as const) {
        expect(() => targetV3({ ...input, [field]: structuredClone(input[field]) })).toThrow(/process provenance/);
      }
      const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
        trackerGenesisInputBoxIdHex: fundingCandidate('51000000').boxId,
        profile, application: compilerV3.trackerRequest.application,
        template: contractTemplate('contracts/SPVTrackerSubstrateFederatedV2.es'),
      });
      expect(() => targetV3({ ...input, trackerRequest }))
        .toThrow('federated tracker V2 JVM compiler receipt request binding drifted');
    });
  });

  it('rejects a wrong history receipt pin without weakening source-history validation', async () => {
    await withObservations(async observed => {
      expect(() => targetV3({
        ...compilerV3, trustPins: { ...compilerV3.trustPins, expectedHistoryDigestHex: 'aa'.repeat(32) },
        settlementTargetProfile: observed.profile, settlementObservation: observed.retained,
      })).toThrow('G1dA history digest differs from its explicit pin');
    });
  });

  it('rejects copied targets, observations and plans independently', async () => {
    await withObservations(async observed => {
      const input = await provisioningInput(observed);
      for (const field of ['settlementTarget', 'freshSettlementObservation'] as const) {
        await expect(buildV3({ ...input, [field]: structuredClone(input[field]) }))
          .rejects.toThrow(/not built in this process|same-process provenance/);
      }
      const plan = await buildV3(input);
      for (const copy of [{ ...plan }, structuredClone(plan)]) {
        expect(() => assertV3(copy)).toThrow(/not built in this process/);
        expect(() => checkTargetV3(copy)).toThrow(/not built in this process/);
        await expect(reobserveV3(copy)).rejects.toThrow(/not built in this process/);
      }
    });
  });

  it('requires a strictly newer observation and rejects stale or future local-clock observations', async () => {
    await withObservations(async observed => {
      const input = await provisioningInput(observed);
      await expect(buildV3({ ...input, freshSettlementObservation: observed.retained }))
        .rejects.toThrow(/newer than the retained target snapshot/);
      const sameTime = await observed.observeAt(observed.retained.observedAt);
      await expect(buildV3({ ...input, freshSettlementObservation: sameTime }))
        .rejects.toThrow(/newer than the retained target snapshot/);
      const now = Date.now();
      for (const observedAt of [now - 60_001, now + 10_000]) {
        const olderRetained = await observed.observeAt(new Date(now - 120_000).toISOString());
        const target = targetV3({
          ...compilerV3, settlementTargetProfile: observed.profile, settlementObservation: olderRetained,
        });
        const freshSettlementObservation = await observed.observeAt(new Date(observedAt).toISOString());
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
        try {
          await expect(buildV3({ ...input, settlementTarget: target, freshSettlementObservation }))
            .rejects.toThrow(/fixed local clock window/);
        } finally { clock.mockRestore(); }
      }
    });
  });

  it('rechecks the freshness window after asynchronous materialization', async () => {
    await withObservations(async observed => {
      const input = await provisioningInput(observed);
      const now = Date.parse(input.freshSettlementObservation.observedAt) + 1_000;
      const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(now).mockReturnValue(now + 60_001);
      try { await expect(buildV3(input)).rejects.toThrow(/fixed local clock window/); }
      finally { clock.mockRestore(); }
    });
  });

  it('rejects a different genuine genesis/profile before materialization', async () => {
    await withObservations(async observed => {
      const input = await provisioningInput(observed);
      await withObservations(async other => {
        const freshSettlementObservation = await other.observeAt(new Date(Date.now() - 1_000).toISOString());
        await expect(buildV3({
          ...input, settlementTargetProfile: other.profile, freshSettlementObservation,
        })).rejects.toThrow(/profile or genesis differs/);
      }, { genesisHeaderId: '93'.repeat(32) });
    });
  });

  it.each(roles)('rejects a genuine observation with the wrong compiled %s funding identity', async role => {
    await withObservations(async observed => {
      expect(() => targetV3({
        ...compilerV3, settlementTargetProfile: observed.profile, settlementObservation: observed.retained,
      })).toThrow('isolated local-settlement genesis inputs differ from the compiled target lineages');
    }, { boxes: { ...boxes, [role]: fundingCandidate('51000000') } });
  });

  it.each(roles)('passes the exact %s funding ID to canonical revalidation', async role => {
    await withObservations(async observed => {
      const input = await provisioningInput(observed);
      const realRevalidate = observations.revalidateSubstrateFederatedGenesisBoxObservationV1;
      // Rejection-only fault at the exact-box predicate; never manufactures positive provenance.
      const revalidate = vi.spyOn(observations, 'revalidateSubstrateFederatedGenesisBoxObservationV1')
        .mockImplementation((observation, expectedId, expectedRole, tip) =>
          realRevalidate(observation, observation === input.freshSettlementObservation.boxes[role]
            ? 'aa'.repeat(32) : expectedId, expectedRole, tip));
      try {
        await expect(buildV3(input)).rejects.toThrow(/genesis box does not match the requested box ID/);
        expect(revalidate).toHaveBeenCalledWith(
          input.freshSettlementObservation.boxes[role], boxes[role].boxId,
          role === 'tracker' ? 'tracker' : role === 'duplicatePrevention' ? 'duplicate-prevention' : 'pooled-reserve',
          TIP_HEIGHT,
        );
      } finally { revalidate.mockRestore(); }
    });
  });

  it.each(roles.flatMap(role => [
    { role, fault: 'malformed' as const, rejection: /not a valid Sigma-serialized Ergo box/ },
    { role, fault: 'noncanonical' as const, rejection: /is not canonical Sigma serialization/ },
    { role, fault: 'mismatched' as const, rejection: /JSON and binary observations do not match/ },
  ]))('rejects $role $fault Sigma bytes at the intended serialization predicate', async ({ role, fault, rejection }) => {
    await withObservations(async observed => {
      const input = await provisioningInput(observed);
      const original = input.freshSettlementObservation.boxes[role];
      const sigmaSerializedHex = fault === 'malformed' ? '00'
        : fault === 'noncanonical' ? original.sigmaSerializedHex + '00'
          : sigmaBytes(fundingCandidate('51000000'));
      if (fault !== 'malformed') {
        const parsed = wasm.ErgoBox.sigma_parse_bytes(Buffer.from(sigmaSerializedHex, 'hex'));
        try {
          const canonical = Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
          if (fault === 'noncanonical') {
            expect(canonical).toBe(original.sigmaSerializedHex);
            expect(parsed.to_js_eip12()).toEqual(original.box);
          } else {
            expect(canonical).toBe(sigmaSerializedHex);
            expect(parsed.to_js_eip12()).not.toEqual(original.box);
          }
        } finally { parsed.free(); }
      }
      const faulted = {
        ...original, sigmaSerializedHex,
        sigmaSerializedSha256Hex: sha256(Buffer.from(sigmaSerializedHex, 'hex')),
      };
      const realRevalidate = observations.revalidateSubstrateFederatedGenesisBoxObservationV1;
      // Alter only serialization evidence after genuine observation provenance;
      // retain the expected ID and refresh its hash so the real parser decides.
      const revalidate = vi.spyOn(observations, 'revalidateSubstrateFederatedGenesisBoxObservationV1')
        .mockImplementation((observation, expectedId, expectedRole, tip) =>
          realRevalidate(observation === original ? faulted : observation, expectedId, expectedRole, tip));
      try {
        await expect(buildV3(input)).rejects.toThrow(rejection);
        expect(revalidate).toHaveBeenCalledWith(
          original, boxes[role].boxId,
          role === 'tracker' ? 'tracker' : role === 'duplicatePrevention' ? 'duplicate-prevention' : 'pooled-reserve',
          TIP_HEIGHT,
        );
      } finally { revalidate.mockRestore(); }
    });
  });

  it('accepts signed-Int maximum creation height and rejects tip-plus-one overflow', async () => {
    await withObservations(async observed => {
      const plan = await buildV3(await provisioningInput(observed));
      for (const role of roles) expectIssuance(plan, role, MAX_INT);
    }, { tipHeight: MAX_INT - 1 });
    await withObservations(async observed => {
      await expect(buildV3(await provisioningInput(observed))).rejects.toThrow(/signed Int range/);
    }, { tipHeight: MAX_INT });
  });

  it.each(['settlementTarget', 'settlementTargetProfile', 'freshSettlementObservation'] as const)(
    'captures caller-owned %s before its first await', async field => {
      await withObservations(async observed => {
        const input = await provisioningInput(observed);
        const expected = await buildV3(input);
        const caller = { ...input };
        const pending = buildV3(caller);
        Object.assign(caller, { [field]: structuredClone(input[field]) });
        expect(await pending).toEqual(expected);
      });
    },
  );
});

describe('V3 genesis plan -> no-submit request and check', () => {
  it('preserves each exact unsigned identity through request creation and rejects copied or cross-version provenance', async () => {
    await withObservations(async observed => {
      const plan = await buildV3(await provisioningInput(observed));
      const request = await requestV3(plan);
      await assertRequestV3(request);
      expect(request.schema).toBe('e2s.substrate-federated-isolated-devnet-setup-check-request.v3');
      expect(request.sourceBindings.compilerProfile).toBe('absolute-height-tracker-v2');
      expect(request.sourceBindings).not.toHaveProperty('compatibilityTargetV1AuditDigestHex');
      expect(request.sourceBindings.provisioningPlanDigestHex).toBe(plan.planDigestHex);
      for (const [ordinal, role] of roles.entries()) {
        const issuance = request.orderedIssuances[ordinal]!;
        const entry = plan.provisioning[role];
        expect(issuance.unsignedTransactionBody).toEqual(entry.transaction.eip12Tx);
        expect(issuance.unsignedTransactionIdHex).toBe(entry.transaction.txId);
        expect(issuance.genesisInputBoxIdHex).toBe(boxes[role].boxId);
        expect(issuance.predictedStateOutput).toMatchObject({
          boxIdHex: entry.transaction.outputs[0]!.boxId, transactionIdHex: entry.transaction.txId,
          index: 0, creationHeight: TIP_HEIGHT + 1,
        });
        expect(Buffer.from(blakejs.blake2b(Buffer.from(issuance.bytesToSignHex, 'hex'), undefined, 32)).toString('hex'))
          .toBe(entry.transaction.txId);
      }
      expect(request.stages).toMatchObject({ signedBytes: 'absent', nodeCheck: 'not-performed', broadcast: 'not-authorized' });
      const copy = structuredClone(request);
      const validated = await validateRequestV3(copy, plan);
      expect(validated).toEqual(request);
      await expect(assertRequestV3(validated)).rejects.toThrow(/not built in this process/);
      await expect(assertRequestV3(copy)).rejects.toThrow(/process/);
      const otherPlan = await buildV3(await provisioningInput(observed));
      assertV3(otherPlan);
      await expect(assertRequestV3Plan(request, otherPlan)).rejects.toThrow(/belongs to another provisioning plan/);
      await assertRequestV3Plan(request, plan);
      await expect(Reflect.apply(requestV2, undefined, [plan])).rejects.toThrow(/not built in this process/);
      await expect(Reflect.apply(runCheckV2, undefined, [request, checkMnemonic])).rejects.toThrow(/process/);
      expect(observed.checkBodies).toEqual([]);
      expectDeepFrozen(request);
    });
  });

  it('root-signs the real three genesis transactions and sends only their exact bytes to a bounded check oracle', async () => {
    await withObservations(async observed => {
      const plan = await buildV3(await provisioningInput(observed, checkCompiler));
      const request = await requestV3(plan);
      const receipt = await runCheckV3(request, checkMnemonic);
      expect(receipt.schema).toBe('e2s.substrate-federated-isolated-devnet-setup-check-receipt.v3');
      expect(receipt.sourceBindings).toEqual(request.sourceBindings);
      expect(receipt.signer.publicKeyHex).toBe(checkPublicKey);
      expect(receipt.signer.rewardDelayBlocks).toBe(1);
      expect(receipt.orderedChecks).toHaveLength(3);
      expect(observed.checkBodies).toHaveLength(3);
      for (const [ordinal, body] of observed.checkBodies.entries()) {
        const parsed = wasm.Transaction.from_json(JSON.stringify(body));
        const id = parsed.id();
        try {
          const check = receipt.orderedChecks[ordinal]!;
          expect(id.to_str()).toBe(request.orderedIssuances[ordinal]!.unsignedTransactionIdHex);
          expect(check.signedTransactionIdHex).toBe(id.to_str());
          expect(check.signedTransactionBytesSha256Hex).toBe(sha256(Buffer.from(parsed.sigma_serialize_bytes())));
          expect(check.signedTransactionCanonicalJsonSha256Hex).toBe(sha256(Buffer.from(canonicalJson(body))));
          expect((body.inputs as any[])[0].spendingProof.proofBytes.length).toBeGreaterThan(0);
          expect((body.inputs as any[])[0].spendingProof.extension).toEqual({});
          expect((body.outputs as any[])[0].assets[0].tokenId).toBe(checkBoxes[roles[ordinal]!].boxId);
        } finally { id.free(); parsed.free(); }
      }
      expect(validateCheckV3(structuredClone(receipt), request)).toEqual(receipt);
      expect(() => Reflect.apply(validateCheckV2, undefined, [structuredClone(receipt), request])).toThrow(/exact request/);
      expect(receipt.boundaries).toMatchObject({
        containsBroadcastCapability: false, containsSubmissionCapability: false,
        canonicalLineagesEstablished: false, profileActivated: false, fundsAuthorityEstablished: false,
      });
      expect(JSON.stringify(receipt)).not.toContain(checkMnemonic);
      const target = {
        primaryNodeOrigin: request.target.primary.nodeOrigin,
        witnessNodeOrigin: request.target.witness.nodeOrigin,
        primaryMining: true, witnessReadOnly: true,
      };
      expect(() => Reflect.apply(takeCheckV3, undefined, [receipt, request, target]))
        .toThrow(/process|owned/);
      // Only the process-custody predicate is doubled here. The request,
      // signed candidates and check receipt above have genuine provenance.
      const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
        .mockReturnValue({ processBindingDigestHex: '31'.repeat(32), executionTargetIdentityDigestHex: '32'.repeat(32) });
      try {
        for (const mutation of [
          { primaryNodeOrigin: target.witnessNodeOrigin },
          { witnessNodeOrigin: target.primaryNodeOrigin },
          { primaryMining: false },
          { witnessReadOnly: false },
        ]) {
          expect(() => Reflect.apply(takeCheckV3, undefined, [receipt, request, { ...target, ...mutation }]))
            .toThrow(/execution target differs from its request/);
        }
        expect(() => Reflect.apply(takeCheckV3, undefined, [structuredClone(receipt), request, target]))
          .toThrow(/process provenance/);
        expect(() => Reflect.apply(takeCheckV3, undefined, [receipt, structuredClone(request), target]))
          .toThrow(/process provenance/);
        expect(() => Reflect.apply(takeCheckV2, undefined, [receipt, request, target]))
          .toThrow(/process provenance/);
        const material = Reflect.apply(takeCheckV3, undefined, [receipt, request, target]);
        expect(material.request).toBe(request);
        expect(material.orderedTransactions.map((entry: any) => entry.checked.txId))
          .toEqual(request.orderedIssuances.map(issuance => issuance.unsignedTransactionIdHex));
        expect(() => Reflect.apply(takeCheckV3, undefined, [receipt, request, target]))
          .toThrow(/process provenance/);
      } finally { custody.mockRestore(); }
    }, checkObservationOptions());
  });

  it('rejects genuine V2 execution material through V3 without consuming the V2 receipt', async () => {
    await withObservations(async observed => {
      const plan = await buildV2({
        settlementTarget: targetV2({
          ...checkCompilerV2, settlementTargetProfile: observed.profile, settlementObservation: observed.retained,
        }),
        settlementTargetProfile: observed.profile,
        freshSettlementObservation: await observed.observeAt(new Date(Date.now() - 1_000).toISOString()),
      });
      const request = await requestV2(plan);
      const receipt = await runCheckV2(request, checkMnemonic);
      expect(receipt.version).toBe(2);
      expect(observed.checkBodies).toHaveLength(3);
      const target = {
        primaryNodeOrigin: request.target.primary.nodeOrigin,
        witnessNodeOrigin: request.target.witness.nodeOrigin,
        primaryMining: true, witnessReadOnly: true,
      };
      // As above, only owned-process custody is doubled, not V2 provenance.
      const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
        .mockReturnValue({ processBindingDigestHex: '31'.repeat(32), executionTargetIdentityDigestHex: '32'.repeat(32) });
      try {
        expect(() => Reflect.apply(takeCheckV3, undefined, [receipt, request, target]))
          .toThrow(/process provenance/);
        const batch = Reflect.apply(promoteExecutionV2, undefined, [{ executionReceipt: receipt, request, target,
          expectedTargetBinding: executionBinding }]);
        expect(Reflect.apply(assertExecutionV2, undefined, [batch, target])).toEqual(executionBinding);
        expect(() => Reflect.apply(assertExecutionV3, undefined, [batch, target])).toThrow(/process provenance/);
        expect(() => Reflect.apply(createRevalidatorV2, undefined, [target, batch])).toThrow(/process provenance/);
        expect(() => Reflect.apply(createAuthorizerV2, undefined, [target, batch, null, null]))
          .toThrow(/process provenance/);
      } finally { custody.mockRestore(); }
    }, checkObservationOptions());
  });

  it.each(roles)('rejects a re-digested request with mutated %s bytes against the genuine plan', async role => {
    await withObservations(async observed => {
      const plan = await buildV3(await provisioningInput(observed));
      const request = await requestV3(plan);
      const altered = structuredClone(request) as any;
      const issuance = altered.orderedIssuances[roles.indexOf(role)];
      issuance.unsignedTransactionBody.outputs[0].value = '9999999';
      const { requestDigestHex: _digest, ...body } = altered;
      altered.requestDigestHex = sha256CanonicalJson(body, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_REQUEST_V3');
      await expect(validateRequestV3(altered, plan)).rejects.toThrow(/does not match the provisioning plan/);
      expect(observed.checkBodies).toEqual([]);
    });
  });

  it.each([0, 1, 2])('stops at check ordinal %s when the endpoint returns a different transaction ID', async failedOrdinal => {
    await withObservations(async observed => {
      const request = await requestV3(await buildV3(await provisioningInput(observed, checkCompiler)));
      const errorOutput = vi.spyOn(console, 'error').mockImplementation(() => {});
      try { await expect(runCheckV3(request, checkMnemonic)).rejects.toThrow(/JVM node check failed/); }
      finally { errorOutput.mockRestore(); }
      expect(observed.checkBodies).toHaveLength(failedOrdinal + 1);
    }, { ...checkObservationOptions(), checkOracle: (body, ordinal) =>
      ordinal === failedOrdinal ? 'ff'.repeat(32) : signedCheckOracle(body) });
  });

  it.each(roles)('does not issue a receipt when %s funding changes after all three checks', async role => {
    await withObservations(async observed => {
      const request = await requestV3(await buildV3(await provisioningInput(observed, checkCompiler)));
      await expect(runCheckV3(request, checkMnemonic)).rejects.toThrow(/genesis box does not match the requested box ID/);
      expect(observed.checkBodies).toHaveLength(3);
    }, { ...checkObservationOptions(), postCheckReplacementRole: role });
  });

  it('rejects an absent observed tip in the signing headers before any node check', async () => {
    await withObservations(async observed => {
      const request = await requestV3(await buildV3(await provisioningInput(observed, checkCompiler)));
      await expect(runCheckV3(request, checkMnemonic)).rejects.toThrow(/observation tip is absent from signer headers/);
      expect(observed.checkBodies).toEqual([]);
    }, { ...checkObservationOptions(), tipHeaderId: TIP_HEADER_ID });
  });

  it('rejects nine otherwise valid signing headers before any node check', async () => {
    await withObservations(async observed => {
      const request = await requestV3(await buildV3(await provisioningInput(observed, checkCompiler)));
      await expect(runCheckV3(request, checkMnemonic)).rejects.toThrow(/requires exactly 10 headers/);
      expect(observed.checkBodies).toEqual([]);
    }, { ...checkObservationOptions(), headers: checkHeaders.slice(0, 9) });
  });

  it('rejects ten signing headers with one broken parent link before any node check', async () => {
    const headers = checkHeaders.map(header => ({ ...header }));
    headers[0] = { ...headers[0], parentId: 'ff'.repeat(32) };
    await withObservations(async observed => {
      const request = await requestV3(await buildV3(await provisioningInput(observed, checkCompiler)));
      await expect(runCheckV3(request, checkMnemonic)).rejects.toThrow(/not one contiguous chain/);
      expect(observed.checkBodies).toEqual([]);
    }, { ...checkObservationOptions(), headers });
  });

  it('rejects a request that ages out during serialization without granting runtime provenance', async () => {
    await withObservations(async observed => {
      const plan = await buildV3(await provisioningInput(observed));
      const now = Date.parse(plan.freshObservation.observedAt) + 1_000;
      const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(now).mockReturnValue(now + 60_001);
      try { await expect(requestV3(plan)).rejects.toThrow(/fixed freshness window/); }
      finally { clock.mockRestore(); }
      expect(observed.checkBodies).toEqual([]);
    });
  });
});

const executionBinding = Object.freeze({
  processBindingDigestHex: '31'.repeat(32), executionTargetIdentityDigestHex: '32'.repeat(32),
});
function executionTarget() {
  return Object.freeze({ primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052', primaryMining: true, witnessReadOnly: true });
}

describe('owned synthetic session -> V3 execution promotion', () => {
  it('composes all three genuine V3 genesis transactions with ordered observed confirmations', async () => {
    const fixture = await createRootFixture();
    const target = executionTarget();
    const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
      .mockReturnValue(executionBinding);
    let markerDirectory: string | undefined;
    let state: StateTracker | undefined;
    try {
      const directory = mkdtempSync(join(tmpdir(), 'e2s-v166-genesis-'));
      markerDirectory = directory;
      const journalState = new StateTracker(':memory:');
      state = journalState;
      await withObservations(async observed => {
        const batch = await fixture.session.runForExecutionV3(fixture.input, target);
        const confirmations = await executeGenesisBatchV3({
          target, batch, state: journalState, markerDirectory: directory,
        });
        expect(confirmations.map(value => value.role)).toEqual(roles);
        expect(confirmations.map(value => value.expectedTxId))
          .toEqual(batch.orderedTransactions.map(value => value.issuance.unsignedTransactionIdHex));
        expect(confirmations.map(value => value.confirmationHeight))
          .toEqual([TIP_HEIGHT + 1, TIP_HEIGHT + 12, TIP_HEIGHT + 23]);
        expect(observed.submissionBodies).toEqual(observed.checkBodies);
        expect(observed.submissionBodies).toHaveLength(3);
        expect(journalState.getActiveErgoOperationalTransactionAttempts(GENESIS_OPERATION_PROFILE)).toHaveLength(0);
        expect(journalState.getConfirmedErgoOperationalTransactionAttempts(GENESIS_OPERATION_PROFILE)).toHaveLength(3);
        await expect(executeGenesisBatchV3({ target, batch, state: journalState, markerDirectory: directory }))
          .rejects.toThrow(/consumed|provenance/);
        expect(observed.submissionBodies).toHaveLength(3);
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true,
        submissionOracle: signedCheckOracle, confirmSubmittedGenesis: true });
    } finally {
      state?.close();
      if (markerDirectory !== undefined) rmSync(markerDirectory, { recursive: true, force: true });
      custody.mockRestore(); fixture.session.dispose();
    }
  }, 90_000);

  it('executes a genuine V3 genesis handle through the journal and V2 transport once', async () => {
    const fixture = await createRootFixture();
    const target = executionTarget();
    const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
      .mockReturnValue(executionBinding);
    let markerDirectory: string | undefined;
    let state: StateTracker | undefined;
    try {
      const directory = mkdtempSync(join(tmpdir(), 'e2s-v165-genesis-'));
      markerDirectory = directory;
      const journalState = new StateTracker(':memory:');
      state = journalState;
      await withObservations(async observed => {
        const batch = await fixture.session.runForExecutionV3(fixture.input, target);
        const revalidator = createRevalidatorV2(target, batch);
        const observer = createConfirmationObserver(target, batch.request.target.genesisHeaderIdHex);
        const authorizer = createAuthorizerV2(target, batch, revalidator, observer);
        expect(() => Reflect.apply(createTransportV1, undefined, [target, authorizer]))
          .toThrow(/version differs/);
        const transport = createTransportV2(target, authorizer);
        const { journal } = createGenesisJournal({ state: journalState, markerDirectory: directory,
          reconciliationIdentityDigestHex: executionBinding.executionTargetIdentityDigestHex });
        const transaction = batch.orderedTransactions[0]!;
        const { issuance, signedCandidate, checkedAcceptance } = transaction;
        let attempt: SubstrateFederatedLocalDevnetGenesisDurableAttempt | undefined;
        const result = await executeGenesis({
          role: 'tracker', planDigestHex: batch.request.requestDigestHex,
          targetGenesisHeaderIdHex: batch.request.target.genesisHeaderIdHex,
          expectedTxId: issuance.unsignedTransactionIdHex, sourceBoxId: issuance.genesisInputBoxIdHex,
          inputBoxIds: [issuance.genesisInputBoxIdHex],
          attemptedAtHeight: batch.request.target.preSetupAnchor.height,
          nodeOrigin: target.primaryNodeOrigin, unsignedTransaction: issuance.unsignedTransactionBody,
        }, {
          signer: { sign: async () => ({
            signedTransactionDigestHex: signedCandidate.signedTransactionDigestHex,
            signerArtifact: signedCandidate,
          }) },
          checker: { check: async () => ({
            checkResponseDigestHex: checkedAcceptance.submissionHandle.checkResponseDigestHex,
            checkerArtifact: checkedAcceptance.submissionHandle,
          }) },
          revalidator, broadcastAuthorizer: authorizer, transport,
          journal: { ...journal, finalize: input => {
            attempt = input.attempt;
            return journal.finalize(input);
          } },
          // Transport acceptance is not confirmation; no chain state is fabricated.
          confirmationObserver: { observe: async () => null },
        });
        expect(result).toMatchObject({ status: 'accepted', confirmationStatus: 'unavailable',
          submittedTxId: issuance.unsignedTransactionIdHex, durableAttemptRecorded: true });
        expect(observed.submissionBodies).toEqual([observed.checkBodies[0]]);
        expect(signedCheckOracle(observed.submissionBodies[0]!)).toBe(issuance.unsignedTransactionIdHex);
        expect(journalState.getActiveErgoOperationalTransactionAttempts(GENESIS_OPERATION_PROFILE)).toHaveLength(1);
        expect(journalState.getConfirmedErgoOperationalTransactionAttempts(GENESIS_OPERATION_PROFILE)).toHaveLength(0);
        expect(attempt).toBeDefined();
        await expect(transport.submit({ ...attempt! })).rejects.toThrow(/provenance/);
        await expect(transport.submit(attempt!)).rejects.toThrow(/consumed|provenance/);
        expect(observed.submissionBodies).toHaveLength(1);
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true,
        submissionOracle: signedCheckOracle });
    } finally {
      state?.close();
      if (markerDirectory !== undefined) rmSync(markerDirectory, { recursive: true, force: true });
      custody.mockRestore(); fixture.session.dispose();
    }
  }, 60_000);

  it('revalidates genuine V3 genesis handles and binds ordered V2 authorization', async () => {
    const fixture = await createRootFixture();
    const target = executionTarget();
    const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
      .mockReturnValue(executionBinding);
    try {
      await withObservations(async observed => {
        const batch = await fixture.session.runForExecutionV3(fixture.input, target);
        expect(() => Reflect.apply(createRevalidatorV1, undefined, [target, batch])).toThrow(/process provenance/);
        expect(() => createRevalidatorV2(target, { ...batch })).toThrow(/process provenance/);
        const revalidator = createRevalidatorV2(target, batch);
        const observer = createConfirmationObserver(target, batch.request.target.genesisHeaderIdHex);
        expect(() => Reflect.apply(createAuthorizerV1, undefined, [target, batch, revalidator, observer]))
          .toThrow(/process provenance/);
        const authorizer = createAuthorizerV2(target, batch, revalidator, observer);
        for (const [ordinal, transaction] of batch.orderedTransactions.entries()) {
          const { issuance, signedCandidate, checkedAcceptance } = transaction;
          const binding = Object.freeze({
            role: roles[ordinal]!, planDigestHex: batch.request.requestDigestHex,
            targetGenesisHeaderIdHex: batch.request.target.genesisHeaderIdHex,
            expectedTxId: issuance.unsignedTransactionIdHex, sourceBoxId: issuance.genesisInputBoxIdHex,
            inputBoxIds: Object.freeze([issuance.genesisInputBoxIdHex]),
            attemptedAtHeight: batch.request.target.preSetupAnchor.height,
            nodeOrigin: target.primaryNodeOrigin,
          });
          const checked = Object.freeze({
            signed: Object.freeze({
              admission: Object.freeze({ schema: GENESIS_EXECUTION_SCHEMA, ...binding,
                admissionDigestHex: admissionDigest(binding), unsignedTransaction: issuance.unsignedTransactionBody }),
              signedTransactionDigestHex: signedCandidate.signedTransactionDigestHex, signerArtifact: signedCandidate,
            }),
            checkResponseDigestHex: checkedAcceptance.submissionHandle.checkResponseDigestHex,
            checkerArtifact: checkedAcceptance.submissionHandle,
          });
          const observations = new Map<string, SubstrateFederatedLocalDevnetGenesisRevalidation>();
          for (const phase of ['post-check', 'pre-transport'] as const) {
            const result = await revalidator.revalidate(checked, phase);
            observations.set(phase, result);
            expect(result.sourceBoxUnspent).toBe(true);
            expect(result.sourceBoxId).toBe(issuance.genesisInputBoxIdHex);
            expect(result.observedAtHeight).toBe(batch.request.target.preSetupAnchor.height);
            const expectation = Object.freeze({
              checkedCandidate: checked, role: binding.role, phase,
              sourceBoxId: result.sourceBoxId, targetGenesisHeaderIdHex: result.targetGenesisHeaderIdHex,
              expectedTxId: issuance.unsignedTransactionIdHex, observedAtHeight: result.observedAtHeight,
              observedTipHeaderIdHex: result.observedTipHeaderIdHex, sourceBoxDigestHex: result.sourceBoxDigestHex,
              sourceBoxSigmaSerializedSha256Hex: result.sourceBoxSigmaSerializedSha256Hex,
              observationDigestHex: result.observationDigestHex,
            });
            assertRevalidationV2(revalidator, result.revalidationArtifact, expectation);
            expect(() => assertRevalidationV2(revalidator, structuredClone(result.revalidationArtifact), expectation))
              .toThrow(/exact process provenance/);
            expect(() => Reflect.apply(assertRevalidationV1, undefined, [revalidator, result.revalidationArtifact, expectation]))
              .toThrow(/version differs/);
            await expect(revalidator.revalidate(checked, phase)).rejects.toThrow(/already issued/);
          }
          const revalidated = Object.freeze({ checked, postCheckEvidence: observations.get('post-check')! });
          const preTransportEvidence = observations.get('pre-transport')!;
          let assertAfterConsumption: (() => void) | undefined;
          if (ordinal === 0) {
            const authorization = authorizer.authorize(revalidated, preTransportEvidence);
            const expectation = { revalidated, preTransportEvidence,
              authorizationDigestHex: authorization.authorizationDigestHex };
            const { authorizationArtifact } = authorization;
            assertAuthorizationV2(authorizer, authorizationArtifact, expectation);
            expect(() => assertAuthorizationV2(authorizer, { ...authorizationArtifact }, expectation))
              .toThrow(/exact process provenance/);
            expect(() => Reflect.apply(assertAuthorizationV1, undefined,
              [authorizer, authorizationArtifact, expectation])).toThrow(/version differs/);
            const second = createAuthorizerV2(target, batch, revalidator, observer);
            expect(() => second.authorize(revalidated, preTransportEvidence)).toThrow(/already authorized/);
            assertAfterConsumption = () => assertAuthorizationV2(authorizer, authorizationArtifact, expectation);
          } else {
            // No confirmation is fabricated: later authorizations must remain blocked.
            expect(() => authorizer.authorize(revalidated, preTransportEvidence))
              .toThrow(/predecessor confirmation is required/);
          }
          await fleet.consumeLocalWasmCheckedSubmissionHandleV1(checkedAcceptance.submissionHandle,
            signedCandidate, async body => {
              expect(signedCheckOracle(body)).toBe(issuance.unsignedTransactionIdHex);
            });
          if (assertAfterConsumption !== undefined) {
            expect(assertAfterConsumption).toThrow(/consumed|provenance/);
          }
        }
        expect(observed.checkBodies).toHaveLength(3);
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true });
    } finally { custody.mockRestore(); fixture.session.dispose(); }
  }, 60_000);

  it('promotes genuine checks to exact one-use Fleet handles without retaining the key', async () => {
    const fixture = await createRootFixture();
    const target = executionTarget();
    // Only process ownership is doubled; compilation, signatures, checks and Fleet handles are genuine.
    const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
      .mockReturnValue(executionBinding);
    try {
      await withObservations(async observed => {
        const batch = await fixture.session.runForExecutionV3(fixture.input, target);
        expect(assertExecutionV3(batch, target)).toEqual(executionBinding);
        expect(Object.isFrozen(batch)).toBe(true);
        expect(Object.isFrozen(batch.orderedTransactions)).toBe(true);
        expect(batch.receipt.version).toBe(3);
        expect(batch.request.version).toBe(3);
        expect(observed.checkBodies).toHaveLength(3);
        expect(batch.orderedTransactions.map(entry => entry.issuance.role))
          .toEqual(['tracker', 'duplicate-prevention', 'pooled-reserve']);
        for (const [ordinal, transaction] of batch.orderedTransactions.entries()) {
          expect(Object.isFrozen(transaction)).toBe(true);
          const { signedCandidate, checkedAcceptance, issuance } = transaction;
          const handle = checkedAcceptance.submissionHandle;
          const check = batch.receipt.orderedChecks[ordinal]!;
          expect(signedCandidate.txId).toBe(issuance.unsignedTransactionIdHex);
          expect(signedCandidate.txId).toBe(signedCheckOracle(observed.checkBodies[ordinal]!));
          expect(handle.txId).toBe(check.signedTransactionIdHex);
          expect(handle.signedTransactionBytesSha256Hex).toBe(check.signedTransactionBytesSha256Hex);
          fleet.assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(handle, executionBinding);
          expect(() => fleet.assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(
            structuredClone(handle), executionBinding)).toThrow(/provenance/);
          for (const field of ['processBindingDigestHex', 'executionTargetIdentityDigestHex'] as const) {
            expect(() => fleet.assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(
              handle, { ...executionBinding, [field]: 'ff'.repeat(32) })).toThrow(/binding changed/);
          }
        }
        for (const copy of [{ ...batch }, structuredClone(batch)]) {
          expect(() => assertExecutionV3(copy, target)).toThrow(/process provenance/);
        }
        expect(() => assertExecutionV3(batch, { ...target })).toThrow(/process provenance/);
        expect(() => Reflect.apply(assertExecutionV2, undefined, [batch, target])).toThrow(/process provenance/);
        expect(() => takeCheckV3(batch.receipt, batch.request, target)).toThrow(/process provenance/);
        const first = batch.orderedTransactions[0]!;
        const callback = vi.fn(async (body: Readonly<Record<string, unknown>>) => signedCheckOracle(body));
        await expect(fleet.consumeLocalWasmCheckedSubmissionHandleV1(
          first.checkedAcceptance.submissionHandle, batch.orderedTransactions[1]!.signedCandidate, callback))
          .rejects.toThrow(/differs from its signed candidate/);
        expect(callback).not.toHaveBeenCalled();
        await expect(fleet.consumeLocalWasmCheckedSubmissionHandleV1(
          first.checkedAcceptance.submissionHandle, first.signedCandidate, callback)).resolves.toBe(first.signedCandidate.txId);
        await expect(fleet.consumeLocalWasmCheckedSubmissionHandleV1(
          first.checkedAcceptance.submissionHandle, first.signedCandidate, callback)).rejects.toThrow(/consumed/);
        expect(callback).toHaveBeenCalledTimes(1);
        // Per-role consumption must not invalidate the two remaining genesis capabilities.
        expect(assertExecutionV3(batch, target)).toEqual(executionBinding);
        for (const transaction of batch.orderedTransactions.slice(1)) {
          fleet.assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(transaction.checkedAcceptance.submissionHandle, executionBinding);
        }
        for (const field of ['processBindingDigestHex', 'executionTargetIdentityDigestHex'] as const) {
          custody.mockReturnValue({ ...executionBinding, [field]: 'ff'.repeat(32) });
          expect(() => assertExecutionV3(batch, target)).toThrow(/process binding changed/);
        }
        custody.mockReturnValue(executionBinding);
        expect(() => assertMiningCredential(fixture.session.miningCredential, fixture.session.signer.publicKeyHex))
          .toThrow(/revoked/);
        expect(() => fixture.session.claimCheckpointMiningCredential()).toThrow(/absent/);
        await expect(fixture.session.runForExecutionV3(fixture.input, target)).rejects.toThrow(/consumed or disposed/);
        await expect(Reflect.apply(fixture.session.checkPegInSourceLock, undefined, [{}, target]))
          .rejects.toThrow(/continuation is absent/);
        expect(observed.checkBodies).toHaveLength(3);
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true });
    } finally { custody.mockRestore(); fixture.session.dispose(); }
  }, 60_000);

  it.each([
    { primaryNodeOrigin: 'http://127.0.0.1:19051' },
    { witnessNodeOrigin: 'http://127.0.0.1:19052' },
    { primaryMining: false }, { witnessReadOnly: false },
  ])('rejects mismatched target %j before observation', async mutation => {
    const session = await createSession();
    const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
      .mockReturnValue(executionBinding);
    const observe = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1');
    try {
      await expect(Reflect.apply(session.runForExecutionV3, undefined, [rootInput(checkCompiler), { ...executionTarget(), ...mutation }]))
        .rejects.toThrow(/execution target differs/);
      expect(observe).not.toHaveBeenCalled();
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { custody.mockRestore(); observe.mockRestore(); session.dispose(); }
  });

  it('rejects an unowned execution target before observation', async () => {
    const session = await createSession();
    const observe = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1');
    try {
      await expect(session.runForExecutionV3(rootInput(checkCompiler), executionTarget())).rejects.toThrow(/owned|process/);
      expect(observe).not.toHaveBeenCalled();
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { observe.mockRestore(); session.dispose(); }
  });

  it.each(['processBindingDigestHex', 'executionTargetIdentityDigestHex', 'target-ended'] as const)(
    'rejects %s drift during the async checks before promotion', async fault => {
      const fixture = await createRootFixture();
      const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
        .mockReturnValue(executionBinding);
      const promotion = vi.spyOn(fleet, 'promoteLocalWasmCheckedTransactionForSubmissionV1');
      try {
        await withObservations(async observed => {
          await expect(fixture.session.runForExecutionV3(fixture.input, executionTarget()))
            .rejects.toThrow(/process binding changed|target ended/);
          expect(observed.checkBodies).toHaveLength(3);
          expect(promotion).not.toHaveBeenCalled();
          expect(() => assertMiningCredential(fixture.session.miningCredential, fixture.session.signer.publicKeyHex))
            .toThrow(/revoked/);
          await expect(fixture.session.runV3(fixture.input)).rejects.toThrow(/consumed or disposed/);
        }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true,
          checkOracle: (body, ordinal) => {
            if (ordinal === 2) {
              if (fault === 'target-ended') custody.mockImplementation(() => { throw new Error('target ended'); });
              else custody.mockReturnValue({ ...executionBinding, [fault]: 'ff'.repeat(32) });
            }
            return signedCheckOracle(body);
          } });
      } finally { custody.mockRestore(); promotion.mockRestore(); fixture.session.dispose(); }
    }, 60_000,
  );

  it.each([0, 1, 2])('closes custody without returning a partial batch when promotion %s fails', async failedOrdinal => {
    const fixture = await createRootFixture();
    const target = executionTarget();
    const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
      .mockReturnValue(executionBinding);
    const original = fleet.promoteLocalWasmCheckedTransactionForSubmissionV1;
    let calls = 0;
    const promotion = vi.spyOn(fleet, 'promoteLocalWasmCheckedTransactionForSubmissionV1')
      .mockImplementation((...args) => {
        if (calls++ === failedOrdinal) throw new Error('promotion failed');
        return original(...args);
      });
    try {
      await withObservations(async observed => {
        await expect(fixture.session.runForExecutionV3(fixture.input, target)).rejects.toThrow('promotion failed');
        expect(observed.checkBodies).toHaveLength(3);
        expect(calls).toBe(failedOrdinal + 1);
        expect(() => assertMiningCredential(fixture.session.miningCredential, fixture.session.signer.publicKeyHex))
          .toThrow(/revoked/);
        await expect(fixture.session.runForExecutionV3(fixture.input, target)).rejects.toThrow(/consumed or disposed/);
        expect(calls).toBe(failedOrdinal + 1);
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true });
    } finally { custody.mockRestore(); promotion.mockRestore(); fixture.session.dispose(); }
  }, 60_000);

  it('rejects target drift after all handles are promoted without returning the batch', async () => {
    const fixture = await createRootFixture();
    const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
      .mockReturnValue(executionBinding);
    const original = fleet.promoteLocalWasmCheckedTransactionForSubmissionV1;
    let calls = 0;
    const promotion = vi.spyOn(fleet, 'promoteLocalWasmCheckedTransactionForSubmissionV1')
      .mockImplementation((...args) => {
        const result = original(...args);
        if (++calls === 3) custody.mockReturnValue({ ...executionBinding, processBindingDigestHex: 'ff'.repeat(32) });
        return result;
      });
    try {
      await withObservations(async observed => {
        await expect(fixture.session.runForExecutionV3(fixture.input, executionTarget()))
          .rejects.toThrow(/process binding changed/);
        expect(calls).toBe(3);
        expect(observed.checkBodies).toHaveLength(3);
        expect(() => assertMiningCredential(fixture.session.miningCredential, fixture.session.signer.publicKeyHex))
          .toThrow(/revoked/);
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true });
    } finally { custody.mockRestore(); promotion.mockRestore(); fixture.session.dispose(); }
  }, 60_000);

  it.each(['concurrent-run', 'dispose'] as const)('preserves exclusive session custody on %s during checks', async fault => {
    const fixture = await createRootFixture();
    const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
      .mockReturnValue(executionBinding);
    try {
      await withObservations(async observed => {
        const original = observations.observeSubstrateFederatedGenesisV1;
        let announce!: () => void;
        let release!: () => void;
        const entered = new Promise<void>(resolve => { announce = resolve; });
        const gate = new Promise<void>(resolve => { release = resolve; });
        const firstObservation = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1')
          .mockImplementationOnce(async (...args) => {
            const result = await original(...args);
            announce();
            await gate;
            return result;
          });
        const target = executionTarget();
        const pending = fixture.session.runForExecutionV3(fixture.input, target);
        const settled = pending.then(
          batch => ({ batch, error: undefined }),
          (error: unknown) => ({ batch: undefined, error }),
        );
        try {
          await Promise.race([entered, pending.then(() => { throw new Error('session ended before the observation gate'); })]);
          if (fault === 'dispose') expect(() => fixture.session.dispose()).toThrow(/session is running/);
          else await expect(fixture.session.runV3(fixture.input)).rejects.toThrow(/consumed or disposed/);
          release();
          const outcome = await settled;
          if (fault === 'dispose') {
            expect(outcome.error).toBeUndefined();
            expect(outcome.batch).toBeDefined();
            expect(assertExecutionV3(outcome.batch!, target)).toEqual(executionBinding);
          } else {
            expect(outcome.batch).toBeUndefined();
            expect(outcome.error).toBeInstanceOf(Error);
            expect((outcome.error as Error).message).toMatch(/invalidated by a concurrent transition/);
          }
          expect(observed.checkBodies).toHaveLength(3);
          expect(() => assertMiningCredential(fixture.session.miningCredential, fixture.session.signer.publicKeyHex))
            .toThrow(/revoked/);
        } finally { release(); firstObservation.mockRestore(); await pending.catch(() => undefined); }
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true });
    } finally { custody.mockRestore(); fixture.session.dispose(); }
  }, 60_000);
});

describe('owned synthetic session -> V3 no-submit setup root', () => {
  it('rejects a different compiled admission profile before retaining the V3 tracker signer', async () => {
    const session = await createSession();
    try {
      await expect(session.runForExecutionV3RetainingTrackerSigner(rootInput(checkCompiler), executionTarget()))
        .rejects.toThrow(/exact synthetic admission signer/);
      await expect(session.runForExecutionV3RetainingTrackerSigner(rootInput(checkCompiler), executionTarget()))
        .rejects.toThrow(/consumed or disposed/);
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { session.dispose(); }
  });

  it.each(['valid', 'default-closed', 'wrong-input', 'wrong-fee', 'wrong-genesis',
    'wrong-target', 'copied-context', 'disposed', 'concurrent'] as const)(
    'retains exact V3 custody through funding into the protocol V2 checker: %s', async fault => {
      const fixture = await createRootFixture(true);
      const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
        .mockReturnValue(executionBinding);
      const frozenBinding = Object.freeze({ processBindingDigestHex: '51'.repeat(32),
        executionTargetIdentityDigestHex: '52'.repeat(32) });
      const frozenCustody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2')
        .mockImplementation(() => {
          if (fault === 'wrong-target') throw new Error('synthetic frozen target ownership mismatch');
          return frozenBinding;
        });
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await withObservations(async observed => {
          const target = executionTarget();
          const batch = fault === 'default-closed'
            ? await fixture.session.runForExecutionV3RetainingTrackerFeeSigner(fixture.input, target, fixture.session.signer.publicKeyHex)
            : await fixture.session.runForExecutionV3RetainingTrackerSigner(fixture.input, target);
          const genesis = wasm.UnsignedTransaction.from_json(JSON.stringify(batch.orderedTransactions[0]!.issuance.unsignedTransactionBody));
          const id = genesis.id();
          const outputs = genesis.output_candidates();
          const boxes: Eip12Box[] = [];
          try {
            for (let i = 0; i < 2; i++) {
              const candidate = outputs.get(i);
              const box = wasm.ErgoBox.from_box_candidate(candidate, id, i);
              try { boxes.push(box.to_js_eip12()); }
              finally { box.free(); candidate.free(); }
            }
          } finally { outputs.free(); id.free(); genesis.free(); }
          const fundingHeaders = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
            currentHeight: 1012, anchorContextIndex: 1, anchorExtensionRootHex: '25'.repeat(32),
          }).headers.map(header => header.raw);
          observed.publishBox(boxes[1]!, fundingHeaders);
          const feeCheck = await fixture.session.checkTrackerFeeFundingV3(target);
          const { trackerRequest, trackerReceipt } = fixture.input.sourceAndCompilerInput;
          const statement = buildSubstrateFederatedCheckpointStatementV1({
            ...vector.input.statement, ...trackerRequest.application, profile: trackerRequest.profile,
          });
          const membership = buildErgoExtensionMembershipProof([
            { key: Buffer.from('0401', 'hex'), value: Buffer.from(
              encodeSubstrateFederatedCheckpointExtensionValueV1(statement.encodedStatementHex), 'hex') },
          ], Buffer.from('0401', 'hex'));
          const headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
            currentHeight: 1030, anchorContextIndex: 1, anchorExtensionRootHex: membership.root.toString('hex'),
          }).headers.map(header => header.raw);
          const observedHeaderContext = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
            rawHeaders: headers, anchorContextIndex: 1,
            expectedAnchorHeaderIdHex: String(headers[1]!.id), expectedAnchorExtensionRootHex: membership.root.toString('hex'),
          });
          let trackerBox = boxes[0]!;
          let feeBox = feeCheck.transaction.outputs[0]!;
          if (fault === 'wrong-input') {
            trackerBox = reidentifyBox(trackerBox, '61'.repeat(32));
          }
          if (fault === 'wrong-fee') {
            feeBox = reidentifyBox(feeBox, '62'.repeat(32));
          }
          observed.publishBox(trackerBox, headers);
          observed.publishBox(feeBox, headers);
          const context = await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context({
            compilerRequest: trackerRequest, compilerReceipt: trackerReceipt, trackerInputBox: trackerBox,
            observedHeaderContext, encodedStatementHex: statement.encodedStatementHex,
            extensionMembershipProofHex: membership.proof.toString('hex'),
          });
          const transaction = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({
            trackerContext: context, trackerInputBox: trackerBox, feeInputBox: feeBox,
            feePayerPublicKeyHex: fixture.session.signer.publicKeyHex,
          });
          const frozenTarget = Object.freeze({ primaryNodeOrigin: 'http://127.0.0.1:9051' as const,
            witnessNodeOrigin: 'http://127.0.0.1:9052' as const, primaryMining: false as const,
            primaryReadOnly: true as const, witnessReadOnly: true as const,
            miningStopped: true as const, checkpointBound: true as const });
          const originalGet = ergoHelpers.ngetDirect;
          const genesisDrift = vi.spyOn(ergoHelpers, 'ngetDirect').mockImplementation(async (...args) =>
            fault === 'wrong-genesis' && args[0] === '/blocks/at/1' ? ['ef'.repeat(32)] : await originalGet(...args));
          try {
            if (fault === 'disposed') fixture.session.dispose();
            const input = { context: fault === 'copied-context' ? { ...context } : context, transaction, observedHeaderContext };
            const pending = fixture.session.checkFrozenTrackerV2Candidate(input, frozenTarget);
            if (fault === 'concurrent') {
              await expect(fixture.session.checkFrozenTrackerV2Candidate(input, frozenTarget)).rejects.toThrow(/continuation/);
            }
            if (fault === 'valid') {
              const checked = await pending;
              expect(checked.result.transaction.unsignedTransactionIdHex).toBe(transaction.unsignedTransactionIdHex);
              expect(checked.feeFundingTransactionIdHex).toBe(feeCheck.transaction.txId);
              expect(() => assertTrackerV2Check(checked, frozenTarget)).not.toThrow();
              expect(() => assertTrackerV2Check({ ...checked }, frozenTarget)).toThrow(/session provenance/);
              expect(() => assertTrackerV2Check(checked, { ...frozenTarget })).toThrow(/session provenance/);
              expect(observed.checkBodies).toHaveLength(5);
              expect(observed.checkBodies[4]!.inputs).toHaveLength(2);
              expect(observed.submissionBodies).toHaveLength(0);
              expect(() => assertMiningCredential(fixture.session.miningCredential, fixture.session.signer.publicKeyHex)).toThrow(/revoked/);
            } else {
              const expected = fault === 'wrong-input' || fault === 'wrong-fee' ? /inputs differ from retained/
                : fault === 'wrong-genesis' ? /frozen target genesis differs/
                : fault === 'wrong-target' ? /synthetic frozen target ownership mismatch/
                : fault === 'copied-context' ? /context provenance is missing/
                : fault === 'concurrent' ? /invalidated by a concurrent transition/ : /continuation/;
              await expect(pending).rejects.toThrow(expected);
              expect(observed.submissionBodies).toHaveLength(0);
            }
            await expect(fixture.session.checkFrozenTrackerV2Candidate(input, frozenTarget)).rejects.toThrow(/continuation/);
          } finally { genesisDrift.mockRestore(); }
        }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true });
      } finally { errors.mockRestore(); frozenCustody.mockRestore(); custody.mockRestore(); fixture.session.dispose(); }
    }, 60_000,
  );

  it.each(['valid', 'ambiguous-response', 'forged-check', 'wrong-target', 'journal-failure',
    'journal-drift', 'pretransport-source-drift', 'post-check-source-drift',
    'pretransport-check-rejected', 'wrong-confirmed-fee', 'concurrent-execution',
    'reservation-field-drift', 'fabricated-transport-result', 'copied-transport-result', 'mutable-confirmation'] as const)(
    'executes only the exact durably reserved V3 fee funding: %s', async fault => {
      const fixture = await createRootFixture();
      const state = new StateTracker(':memory:');
      const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
        .mockReturnValue(executionBinding);
      try {
        await withObservations(async observed => {
          const target = executionTarget();
          const batch = await fixture.session.runForExecutionV3RetainingTrackerFeeSigner(fixture.input, target, checkPublicKey);
          const genesis = wasm.UnsignedTransaction.from_json(JSON.stringify(batch.orderedTransactions[0]!.issuance.unsignedTransactionBody));
          const id = genesis.id();
          const outputs = genesis.output_candidates();
          const output = outputs.get(1);
          const box = wasm.ErgoBox.from_box_candidate(output, id, 1);
          let source: Eip12Box;
          try { source = box.to_js_eip12(); }
          finally { box.free(); output.free(); outputs.free(); id.free(); genesis.free(); }
          const headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
            currentHeight: source.creationHeight + 12, anchorContextIndex: 1,
            anchorExtensionRootHex: '25'.repeat(32),
          }).headers.map(header => header.raw);
          observed.publishBox(source, headers);
          const checked = await fixture.session.checkTrackerFeeFundingV3(target);
          if (['reservation-field-drift', 'fabricated-transport-result', 'copied-transport-result', 'mutable-confirmation'].includes(fault)) {
            const authorization = await authorizeFeeFunding(checked, target);
            const attempt = reserveFeeFunding(authorization, state);
            if (fault === 'reservation-field-drift' || fault === 'fabricated-transport-result') {
              await claimFeeTransport(attempt, target);
              if (fault === 'reservation-field-drift') {
                const get = state.getErgoOperationalTransactionAttempt.bind(state);
                const row = get(attempt.expectedTxId)!;
                for (const patch of [
                  { schema: 'different' }, { operationProfile: GENESIS_OPERATION_PROFILE },
                  { expectedTxId: 'ef'.repeat(32) }, { sourceBoxId: 'ef'.repeat(32) },
                  { inputBoxIds: ['ef'.repeat(32)] }, { attemptedAtHeight: row.attemptedAtHeight + 1 },
                  { targetSidechainHeight: 1 }, { targetSidechainBlockHashHex: 'ef'.repeat(32) },
                  { heartbeatKeyHex: 'ef'.repeat(32) }, { reconciliationIdentityDigestHex: 'ef'.repeat(32) },
                  { bindingDigestHex: 'ef'.repeat(32) }, { signedTransactionDigestHex: 'ef'.repeat(32) },
                  { checkResponseDigestHex: 'ef'.repeat(32) }, { revalidationDigestHex: 'ef'.repeat(32) },
                  { authorizationDigestHex: 'ef'.repeat(32) }, { fundsReleaseAuthorityEpochHex: 'ef'.repeat(32) },
                  { durableAttemptDigestHex: 'ef'.repeat(32) },
                ]) {
                  const drift = vi.spyOn(state, 'getErgoOperationalTransactionAttempt').mockReturnValue({ ...row, ...patch } as typeof row);
                  try { expect(() => requireFeeFinalization(attempt), Object.keys(patch)[0]).toThrow(/durable journal binding or state differs/); }
                  finally { drift.mockRestore(); }
                }
              }
              expect(() => finalizeFeeFunding(attempt, { status: 'accepted', submittedTxId: attempt.expectedTxId,
                responseDigestHex: 'ef'.repeat(32) })).toThrow(/exact completed transport provenance/);
              expect(state.getErgoOperationalTransactionAttempt(attempt.expectedTxId)!.status).toBe('pending');
              expect(observed.submissionBodies).toHaveLength(0);
              return;
            }
            const submission = await submitFeeFunding(target, attempt);
            expect(() => finalizeFeeFunding(attempt, { ...submission })).toThrow(/exact completed transport provenance/);
            expect(() => finalizeFeeFunding({ ...attempt }, submission)).toThrow(/exact completed transport provenance/);
            finalizeFeeFunding(attempt, submission);
            expect(() => finalizeFeeFunding(attempt, submission)).toThrow(/exact completed transport provenance/);
            const observer = createConfirmationObserver(target, authorization.genesisHeaderIdHex);
            const original = (await observer.observe(attempt.expectedTxId, target.primaryNodeOrigin))!;
            const mutable = { ...original };
            const originalGet = ergoHelpers.ngetDirect;
            const mutation = vi.spyOn(ergoHelpers, 'ngetDirect').mockImplementation(async (...args) => {
              if (fault === 'mutable-confirmation' && args[0] === `/utxo/byId/${checked.transaction.outputs[0]!.boxId}`) {
                mutable.confirmationHeight = original.confirmationHeight! + 1;
                mutable.confirmationHeaderIdHex = 'ef'.repeat(32);
              }
              return await originalGet(...args);
            });
            try {
              const confirmed = await confirmFeeFunding(attempt, mutable);
              expect(confirmed.confirmationHeight).toBe(original.confirmationHeight);
              expect(confirmed.confirmationHeaderId).toBe(original.confirmationHeaderIdHex);
              if (fault === 'mutable-confirmation') expect(mutable.confirmationHeaderIdHex).not.toBe(original.confirmationHeaderIdHex);
              expect(observed.submissionBodies).toEqual([observed.checkBodies[3]]);
            } finally { mutation.mockRestore(); }
            return;
          }
          const originalGet = ergoHelpers.ngetDirect;
          let sourceReads = 0;
          const reads = vi.spyOn(ergoHelpers, 'ngetDirect').mockImplementation(async (...args) => {
            const result = await originalGet(...args);
            if (args[0] === `/utxo/byId/${source.boxId}`) {
              sourceReads += 1;
              if ((fault === 'pretransport-source-drift' && sourceReads >= 3)
                || (fault === 'post-check-source-drift' && observed.checkBodies.length === 5)) {
                return checked.transaction.outputs[1];
              }
            }
            if (fault === 'wrong-confirmed-fee' && args[0] === `/utxo/byId/${checked.transaction.outputs[0]!.boxId}`) {
              return checked.transaction.outputs[1];
            }
            return result;
          });
          const reserve = state.reserveErgoOperationalTransactionAttempt.bind(state);
          const get = state.getErgoOperationalTransactionAttempt.bind(state);
          const reservation = vi.spyOn(state, 'reserveErgoOperationalTransactionAttempt').mockImplementation((...args) => {
            expect(observed.submissionBodies).toHaveLength(0);
            if (fault === 'journal-failure') throw new Error('synthetic journal persistence failed');
            return reserve(...args);
          });
          let journalReads = 0;
          const stored = vi.spyOn(state, 'getErgoOperationalTransactionAttempt').mockImplementation((...args) => {
            const result = get(...args);
            if (result !== null) journalReads += 1;
            return fault === 'journal-drift' && journalReads >= 3
              ? { ...result!, authorizationDigestHex: 'fe'.repeat(32) } : result;
          });
          const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
          try {
            const pending = executeFeeFunding({ state,
              target: fault === 'wrong-target' ? executionTarget() : target,
              checked: fault === 'forged-check' ? { ...checked } : checked });
            if (fault === 'concurrent-execution') {
              await expect(executeFeeFunding({ state, target, checked })).rejects.toThrow(/unconsumed exact provenance/);
            }
            if (['valid', 'ambiguous-response', 'concurrent-execution'].includes(fault)) {
              const result = await pending;
              expect(result.expectedTxId).toBe(checked.transaction.txId);
              expect(result.transportStatus).toBe(fault === 'ambiguous-response' ? 'ambiguous' : 'accepted');
              expect(result.feeInputBox).toEqual(checked.transaction.outputs[0]);
              expect(state.getConfirmedErgoOperationalTransactionAttempts(FEE_OPERATION_PROFILE)).toHaveLength(1);
              expect(state.getActiveErgoOperationalTransactionAttempts(FEE_OPERATION_PROFILE)).toHaveLength(0);
              expect(observed.submissionBodies).toEqual([observed.checkBodies[3]]);
              expect(observed.checkBodies[4]).toEqual(observed.checkBodies[3]);
            } else {
              const expected = fault === 'journal-failure' ? /synthetic journal persistence failed/
                : fault === 'journal-drift' ? /durable journal binding or state differs/
                : fault === 'wrong-confirmed-fee' ? /confirmed tracker fee box differs/
                : fault === 'pretransport-check-rejected' ? /pretransport node check failed/
                : fault.endsWith('source-drift') ? /pretransport source differs/ : /unconsumed exact provenance/;
              await expect(pending).rejects.toThrow(expected);
              expect(observed.submissionBodies).toHaveLength(fault === 'wrong-confirmed-fee' ? 1 : 0);
              expect(state.getConfirmedErgoOperationalTransactionAttempts(FEE_OPERATION_PROFILE)).toHaveLength(0);
            }
            if (!['forged-check', 'wrong-target'].includes(fault)) {
              const before = observed.submissionBodies.length;
              await expect(executeFeeFunding({ state, target, checked })).rejects.toThrow(/unconsumed exact provenance/);
              expect(observed.submissionBodies).toHaveLength(before);
            }
          } finally { errors.mockRestore(); stored.mockRestore(); reservation.mockRestore(); reads.mockRestore(); }
        }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true,
          confirmSubmittedGenesis: true, publishSubmittedOutputs: true,
          checkOracle: (body, index) => fault === 'pretransport-check-rejected' && index === 4 ? 'ff'.repeat(32) : signedCheckOracle(body),
          submissionOracle: body => fault === 'ambiguous-response' ? 'ff'.repeat(32) : signedCheckOracle(body) });
      } finally { custody.mockRestore(); state.close(); fixture.session.dispose(); }
    }, 60_000,
  );

  it.each(['valid', 'missing-source', 'source-drift', 'post-check-drift', 'wrong-target', 'check-rejected', 'disposed', 'concurrent-fee-check', 'dispose-while-running'] as const)(
    'limits retained V3 custody to one tracker fee funding check: %s', async fault => {
      const fixture = await createRootFixture();
      const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
        .mockReturnValue(executionBinding);
      try {
        await withObservations(async observed => {
          const target = executionTarget();
          const batch = await fixture.session.runForExecutionV3RetainingTrackerFeeSigner(
            fixture.input, target, checkPublicKey,
          );
          const genesis = wasm.UnsignedTransaction.from_json(JSON.stringify(batch.orderedTransactions[0]!.issuance.unsignedTransactionBody));
          const id = genesis.id();
          const outputs = genesis.output_candidates();
          const output = outputs.get(1);
          const box = wasm.ErgoBox.from_box_candidate(output, id, 1);
          let source: Eip12Box;
          try { source = box.to_js_eip12(); }
          finally { box.free(); output.free(); outputs.free(); id.free(); genesis.free(); }
          const driftUnsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
            inputs: [{ boxId: '67'.repeat(32), extension: {} }], dataInputs: [],
            outputs: [{ ...candidateFromBox(source), value: (BigInt(source.value) + 1n).toString() }],
          }));
          const driftCandidates = driftUnsigned.output_candidates();
          const driftCandidate = driftCandidates.get(0);
          const sourceTransactionId = wasm.TxId.from_str(source.transactionId);
          const driftBox = wasm.ErgoBox.from_box_candidate(driftCandidate, sourceTransactionId, source.index);
          let replacement: Eip12Box;
          try { replacement = driftBox.to_js_eip12(); }
          finally { driftBox.free(); sourceTransactionId.free(); driftCandidate.free(); driftCandidates.free(); driftUnsigned.free(); }
          expect(replacement.boxId).not.toBe(source.boxId);
          const headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
            currentHeight: source.creationHeight + 12, anchorContextIndex: 1,
            anchorExtensionRootHex: '25'.repeat(32),
          }).headers.map(header => header.raw);
          observed.publishBox(source, headers);
          const originalGet = ergoHelpers.ngetDirect;
          let concurrentAttempted = false;
          const reads = vi.spyOn(ergoHelpers, 'ngetDirect').mockImplementation(async (...args) => {
            const result = await originalGet(...args);
            if (args[0] === `/utxo/byId/${source.boxId}`) {
              if (!concurrentAttempted) {
                concurrentAttempted = true;
                if (fault === 'concurrent-fee-check') {
                  await expect(fixture.session.checkTrackerFeeFundingV3(target)).rejects.toThrow(/absent|consumed|disposed/);
                } else if (fault === 'dispose-while-running') {
                  expect(() => fixture.session.dispose()).toThrow(/running/);
                }
              }
              if (fault === 'missing-source') return undefined;
              if (fault === 'source-drift' || (fault === 'post-check-drift' && observed.checkBodies.length > 3)) {
                return replacement;
              }
            }
            return result;
          });
          const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
          try {
            if (fault === 'disposed') fixture.session.dispose();
            const pending = fixture.session.checkTrackerFeeFundingV3(fault === 'wrong-target' ? executionTarget() : target);
            if (fault === 'valid' || fault === 'dispose-while-running') {
              const result = await pending;
              expect(result.transaction.outputs[0]).toMatchObject({ value: '1100000', ergoTree: `0008cd${checkPublicKey}` });
              expect(result.transaction.eip12Tx.inputs[0]!.boxId).toBe(source.boxId);
              expect(result.checkedAcceptance.submissionHandle.txId).toBe(result.transaction.txId);
              expect(result.checkedAcceptance.checked.signedTransactionBytesSha256Hex)
                .toBe(result.signedCandidate.signedTransactionBytesSha256Hex);
              expect(observed.checkBodies).toHaveLength(4);
            } else await expect(pending).rejects.toThrow(
              fault === 'source-drift' || fault === 'post-check-drift'
                ? /live source differs from retained genesis change/
                : fault === 'concurrent-fee-check' ? /invalidated by a concurrent transition/ : undefined,
            );
            if (fault === 'concurrent-fee-check') {
              expect(concurrentAttempted).toBe(true);
              expect(observed.checkBodies).toHaveLength(4);
            }
            expect(observed.submissionBodies).toHaveLength(0);
            expect(() => assertMiningCredential(fixture.session.miningCredential, fixture.session.signer.publicKeyHex))
              .toThrow(/revoked/);
            await expect(fixture.session.checkTrackerFeeFundingV3(target)).rejects.toThrow(/absent|consumed|disposed/);
            await expect(fixture.session.runForExecutionV3(fixture.input, target)).rejects.toThrow(/consumed|disposed/);
            if (['missing-source', 'source-drift', 'wrong-target', 'disposed'].includes(fault)) {
              expect(observed.checkBodies).toHaveLength(3);
            }
          } finally { reads.mockRestore(); errors.mockRestore(); }
        }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true,
          checkOracle: (body, index) => fault === 'check-rejected' && index === 3 ? 'ff'.repeat(32) : signedCheckOracle(body) });
      } finally { custody.mockRestore(); fixture.session.dispose(); }
    }, 60_000,
  );

  it('does not expose the fee continuation on the default closing V3 route', async () => {
    const fixture = await createRootFixture();
    const custody = vi.spyOn(ownedTargets, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
      .mockReturnValue(executionBinding);
    try {
      await withObservations(async observed => {
        const target = executionTarget();
        await fixture.session.runForExecutionV3(fixture.input, target);
        await expect(fixture.session.checkTrackerFeeFundingV3(target)).rejects.toThrow(/absent|consumed|disposed/);
        expect(observed.checkBodies).toHaveLength(3);
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true });
    } finally { custody.mockRestore(); fixture.session.dispose(); }
  }, 60_000);

  it('uses its own signer with the genuine V2 family and closes custody after the three checks', async () => {
    const fixture = await createRootFixture();
    try {
      await withObservations(async observed => {
        assertMiningCredential(fixture.session.miningCredential, fixture.session.signer.publicKeyHex);
        const receipt = await fixture.session.runV3(fixture.input);
        expect(receipt.version).toBe(3);
        expect(receipt.sourceBindings.compilerProfile).toBe('absolute-height-tracker-v2');
        expect(receipt.sourceBindings).not.toHaveProperty('compatibilityTargetV1AuditDigestHex');
        expect(receipt.signer.publicKeyHex).toBe(fixture.session.signer.publicKeyHex);
        expect(receipt.orderedChecks).toHaveLength(3);
        expect(observed.checkBodies).toHaveLength(3);
        for (const [ordinal, body] of observed.checkBodies.entries()) {
          expect(signedCheckOracle(body)).toBe(receipt.orderedChecks[ordinal]!.signedTransactionIdHex);
          expect((body.outputs as any[])[0].assets[0].tokenId).toBe(fixture.boxes[roles[ordinal]!].boxId);
        }
        expect(receipt.boundaries).toMatchObject({
          containsSubmissionCapability: false, containsBroadcastCapability: false,
          profileActivated: false, fundsAuthorityEstablished: false,
        });
        expect(() => assertMiningCredential(fixture.session.miningCredential, fixture.session.signer.publicKeyHex))
          .toThrow(/revoked/);
        expect(() => fixture.session.claimCheckpointMiningCredential()).toThrow(/absent/);
        await expect(fixture.session.runV3(fixture.input)).rejects.toThrow(/consumed or disposed/);
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true });
    } finally { fixture.session.dispose(); }
  }, 60_000);

  it('revokes custody after a real signed check is rejected without falling back to V2', async () => {
    const fixture = await createRootFixture();
    try {
      await withObservations(async observed => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        try { await expect(fixture.session.runV3(fixture.input)).rejects.toThrow(/JVM node check failed/); }
        finally { errors.mockRestore(); }
        expect(observed.checkBodies).toHaveLength(1);
        expect(() => assertMiningCredential(fixture.session.miningCredential, fixture.session.signer.publicKeyHex))
          .toThrow(/revoked/);
        await expect(fixture.session.runV3(fixture.input)).rejects.toThrow(/consumed or disposed/);
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true, checkOracle: () => 'ff'.repeat(32) });
    } finally { fixture.session.dispose(); }
  }, 60_000);

  it('invalidates an in-flight V3 run on concurrent session use and releases no receipt', async () => {
    const fixture = await createRootFixture();
    try {
      await withObservations(async observed => {
        const original = observations.observeSubstrateFederatedGenesisV1;
        let announce!: () => void;
        let release!: () => void;
        const entered = new Promise<void>(resolve => { announce = resolve; });
        const gate = new Promise<void>(resolve => { release = resolve; });
        const firstObservation = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1')
          .mockImplementationOnce(async (...args) => {
            const result = await original(...args);
            announce();
            await gate;
            return result;
          });
        const pending = fixture.session.runV3(fixture.input);
        const rejected = expect(pending).rejects.toThrow(/invalidated by a concurrent transition/);
        try {
          await Promise.race([entered, pending.then(() => { throw new Error('session ended before the observation gate'); })]);
          await expect(fixture.session.runV3(fixture.input)).rejects.toThrow(/consumed or disposed/);
          release();
          await rejected;
          expect(observed.checkBodies).toHaveLength(3);
          expect(() => assertMiningCredential(fixture.session.miningCredential, fixture.session.signer.publicKeyHex))
            .toThrow(/revoked/);
        } finally { release(); firstObservation.mockRestore(); await pending.catch(() => undefined); }
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true });
    } finally { fixture.session.dispose(); }
  }, 60_000);

  it.each(['primaryNodeOrigin', 'witnessNodeOrigin'] as const)('rejects another %s before observation and closes custody', async field => {
    const session = await createSession();
    const observe = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1');
    try {
      await expect(session.runV3({ ...rootInput(checkCompiler), [field]: 'http://127.0.0.1:19051' }))
        .rejects.toThrow(/origin must be exactly/);
      expect(observe).not.toHaveBeenCalled();
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { observe.mockRestore(); session.dispose(); }
  });

  it('rejects V1 compiler provenance before observation', async () => {
    const session = await createSession();
    const observe = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1');
    try {
      await expect(Reflect.apply(session.runV3, undefined, [rootInput(compilerV2 as unknown as CompilerInputV3)]))
        .rejects.toThrow(/process|V2/);
      expect(observe).not.toHaveBeenCalled();
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { observe.mockRestore(); session.dispose(); }
  });

  it('rejects a copied compiler receipt before observation', async () => {
    const session = await createSession();
    const observe = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1');
    try {
      await expect(session.runV3(rootInput({ ...checkCompiler, trackerReceipt: structuredClone(checkCompiler.trackerReceipt) })))
        .rejects.toThrow(/process|V2/);
      expect(observe).not.toHaveBeenCalled();
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { observe.mockRestore(); session.dispose(); }
  });

  it('rejects accessor input without evaluating it', async () => {
    const session = await createSession();
    const getter = vi.fn(() => checkCompiler);
    const input = rootInput(checkCompiler);
    Object.defineProperty(input, 'sourceAndCompilerInput', { enumerable: true, get: getter });
    try {
      await expect(session.runV3(input)).rejects.toThrow(/enumerable data property|data property/);
      expect(getter).not.toHaveBeenCalled();
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { session.dispose(); }
  });

  it('rejects an extra input field rather than selecting an implicit route', async () => {
    const session = await createSession();
    const observe = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1');
    try {
      await expect(Reflect.apply(session.runV3, undefined, [{ ...rootInput(checkCompiler), portableReplayInput: {} }]))
        .rejects.toThrow(/fields/);
      expect(observe).not.toHaveBeenCalled();
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { observe.mockRestore(); session.dispose(); }
  });

  it('does not reopen disposed custody for a V3 request', async () => {
    const session = await createSession();
    session.dispose();
    await expect(session.runV3(rootInput(checkCompiler))).rejects.toThrow(/consumed or disposed/);
    expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
  });

  it('rejects shared history byte storage before observation', async () => {
    const session = await createSession();
    const observe = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1');
    const original = checkCompiler.historyBundle.acceptanceReport;
    const shared = new Uint8Array(new SharedArrayBuffer(original.byteLength));
    shared.set(original);
    try {
      await expect(session.runV3(rootInput({ ...checkCompiler,
        historyBundle: { ...checkCompiler.historyBundle, acceptanceReport: shared },
      }))).rejects.toThrow(/history requires unshared byte arrays/);
      expect(observe).not.toHaveBeenCalled();
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { observe.mockRestore(); session.dispose(); }
  });

  it.each(['templates', 'pins'] as const)('rejects nested %s accessor without evaluating it', async surface => {
    const session = await createSession();
    const observe = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1');
    const source = { ...checkCompiler,
      familyTemplates: structuredClone(checkCompiler.familyTemplates),
      trustPins: structuredClone(checkCompiler.trustPins),
    };
    const getter = vi.fn(() => surface === 'templates'
      ? checkCompiler.familyTemplates.sourceLock.source : checkCompiler.trustPins.expectedHistoryDigestHex);
    Object.defineProperty(surface === 'templates' ? source.familyTemplates.sourceLock : source.trustPins,
      surface === 'templates' ? 'source' : 'expectedHistoryDigestHex', { enumerable: true, get: getter });
    try {
      await expect(session.runV3(rootInput(source))).rejects.toThrow(/data propert/);
      expect(getter).not.toHaveBeenCalled();
      expect(observe).not.toHaveBeenCalled();
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { observe.mockRestore(); session.dispose(); }
  });

  it('rejects nested template prototype before observation', async () => {
    const session = await createSession();
    const observe = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1');
    try {
      await expect(session.runV3(rootInput({ ...checkCompiler,
        familyTemplates: { ...checkCompiler.familyTemplates,
          sourceLock: Object.create(checkCompiler.familyTemplates.sourceLock),
        },
      }))).rejects.toThrow(/custom object prototype/);
      expect(observe).not.toHaveBeenCalled();
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { observe.mockRestore(); session.dispose(); }
  });

  it('rejects history typed-array subclass before observation', async () => {
    const session = await createSession();
    const observe = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1');
    class DerivedBytes extends Uint8Array {}
    try {
      await expect(session.runV3(rootInput({ ...checkCompiler,
        historyBundle: { ...checkCompiler.historyBundle,
          acceptanceReport: new DerivedBytes(checkCompiler.historyBundle.acceptanceReport),
        },
      }))).rejects.toThrow(/history requires byte arrays/);
      expect(observe).not.toHaveBeenCalled();
      expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
    } finally { observe.mockRestore(); session.dispose(); }
  });

  it.each(['templates', 'history', 'pins'] as const)('captures caller %s before asynchronous observation', async surface => {
    const fixture = await createRootFixture();
    const originalSource = fixture.input.sourceAndCompilerInput;
    const callerSource = {
      ...originalSource,
      familyTemplates: structuredClone(originalSource.familyTemplates),
      historyBundle: structuredClone(originalSource.historyBundle),
      trustPins: structuredClone(originalSource.trustPins),
    };
    fixture.input.sourceAndCompilerInput = callerSource;
    try {
      await withObservations(async observed => {
        const original = observations.observeSubstrateFederatedGenesisV1;
        const first = vi.spyOn(observations, 'observeSubstrateFederatedGenesisV1').mockImplementationOnce(async (...args) => {
          const observation = await original(...args);
          if (surface === 'templates') {
            Reflect.set(callerSource.familyTemplates.sourceLock, 'source', callerSource.familyTemplates.sourceLock.source + '\n');
          } else if (surface === 'history') {
            callerSource.historyBundle.acceptanceReport[0] = callerSource.historyBundle.acceptanceReport[0]! ^ 1;
          } else {
            Reflect.set(callerSource.trustPins, 'expectedSourceNetworkIdHex', 'ff'.repeat(32));
          }
          return observation;
        });
        try {
          const receipt = await fixture.session.runV3(fixture.input);
          expect(first).toHaveBeenCalled();
          expect(receipt.sourceBindings.compilerProfile).toBe('absolute-height-tracker-v2');
          expect(receipt.signer.publicKeyHex).toBe(fixture.session.signer.publicKeyHex);
          expect(observed.checkBodies).toHaveLength(3);
          for (const [ordinal, body] of observed.checkBodies.entries()) {
            expect((body.outputs as any[])[0].assets[0].tokenId).toBe(fixture.boxes[roles[ordinal]!].boxId);
          }
        } finally { first.mockRestore(); }
      }, { ...checkObservationOptions(), boxes: fixture.boxes, fixedSetupPorts: true });
    } finally { fixture.session.dispose(); }
  }, 60_000);
});

function rootInput(sourceAndCompilerInput: CompilerInputV3) {
  return { sourceAndCompilerInput, expectedSettlementGenesisHeaderIdHex: GENESIS_HEADER_ID,
    primaryNodeOrigin: 'http://127.0.0.1:9051', witnessNodeOrigin: 'http://127.0.0.1:9052' };
}

// Explicit local integration command only; ordinary unit/CI runs start no node.
it.runIf(process.env.BRIDGE_TRACKER_V2_NODE_BUILD_RECEIPT !== undefined)(
  'checks V3 genesis on fresh owned Ergo nodes without submitting', async () => {
    const build: SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt = JSON.parse(
      readFileSync(process.env.BRIDGE_TRACKER_V2_NODE_BUILD_RECEIPT!, 'utf8'),
    );
    const javaExecutablePath = process.env.BRIDGE_TRACKER_V2_JAVA;
    const nodeAssemblyJarPath = process.env.BRIDGE_TRACKER_V2_NODE_JAR;
    if (!javaExecutablePath || !nodeAssemblyJarPath) {
      throw new Error('explicit local Java and node artifact paths are required');
    }
    expect(build.status).toBe('exact_locked_patched_node_built');
    const lock = JSON.parse(readFileSync(new URL(
      '../../sources/substrate-federated-isolated-devnet-node-build-lock-v1.json', import.meta.url,
    ), 'utf8'));
    expect(build.source.ergoNodeBaseCommit).toBe(lock.ergoNodeBaseCommit);
    expect(build.source.ergoPatchSha256Hex).toBe(lock.ergoPatchSha256);
    expect(build.toolchain.javaHomeSha256Hex).toBe(lock.javaHomeSha256);
    const session = await createSession();
    let nodes: ReturnType<typeof ownedTargets.createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2> | undefined;
    try {
      nodes = ownedTargets.createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2({
        javaExecutablePath,
        expectedJavaExecutableSha256Hex: build.toolchain.javaExecutableSha256Hex,
        nodeAssemblyJarPath,
        expectedNodeAssemblyJarSha256Hex: build.build.artifactSha256Hex,
        buildIdentityDigestHex: build.buildIdentityDigestHex,
      }, {
        miningTargetPublicKeyHex: session.signer.publicKeyHex,
        p2pkErgoTreeHex: session.signer.p2pkErgoTreeHex,
        rewardInputErgoTrees: session.signer.rewardInputErgoTrees,
        networkPrefix: session.signer.networkPrefix,
        primaryNodeOrigin: 'http://127.0.0.1:9051',
        witnessNodeOrigin: 'http://127.0.0.1:9052',
      }, session.miningCredential);
      await nodes.startMining();
      const checked = await nodes.withMiningStoppedReadOnlyTarget(async target => {
        ownedTargets.assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1(target);
        const funding = await discoverSubstrateFederatedRewardInputsV1(session.signer);
        expect(funding.target.tipHeight).toBeGreaterThanOrEqual(10);
        const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
          trackerGenesisInputBoxIdHex: funding.genesisBoxIds.tracker,
          profile, application: compilerV3.trackerRequest.application,
          template: contractTemplate('contracts/SPVTrackerSubstrateFederatedV2.es'),
        });
        if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
          throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
        }
        const nodeOptions = process.env.NODE_OPTIONS;
        delete process.env.NODE_OPTIONS;
        let compiled: CompilerInputV3;
        try {
          const trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
          const familyReceipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2({
            trackerRequest, trackerReceipt, templates: compilerV3.familyTemplates,
            duplicatePreventionGenesisInputBoxIdHex: funding.genesisBoxIds.duplicatePrevention,
            pooledReserveGenesisInputBoxIdHex: funding.genesisBoxIds.pooledReserve,
          });
          // Synthetic source history tests only the Ergo setup consumer, not source consensus.
          compiled = { ...compilerV3, trackerRequest, trackerReceipt, familyReceipt };
        } finally { process.env.NODE_OPTIONS = nodeOptions; }
        const bodies: Record<string, any>[] = [];
        const post = axios.post.bind(axios);
        const capture = vi.spyOn(axios, 'post').mockImplementation(async (...args) => {
          expect(args[0]).toBe(target.primaryNodeOrigin + '/transactions/check');
          if (args[1] === null || typeof args[1] !== 'object' || Array.isArray(args[1])) {
            throw new Error('node check body is not an object');
          }
          bodies.push(structuredClone(args[1] as Record<string, any>));
          return post(...args);
        });
        let receipt: Awaited<ReturnType<typeof session.runV3>>;
        try {
          receipt = await session.runV3({
            ...rootInput(compiled),
            expectedSettlementGenesisHeaderIdHex: funding.target.genesisHeaderIdHex,
          });
        } finally { capture.mockRestore(); }
        expect(bodies).toHaveLength(3);
        expect(receipt.orderedChecks).toHaveLength(3);
        expect(receipt.signer.publicKeyHex).toBe(session.signer.publicKeyHex);
        expect(receipt.boundaries).toMatchObject({
          containsSubmissionCapability: false, containsBroadcastCapability: false,
          profileActivated: false, fundsAuthorityEstablished: false,
        });
        const mutated = structuredClone(bodies[0]!);
        const proof = mutated.inputs[0].spendingProof.proofBytes as string;
        expect(proof).toMatch(/^[0-9a-f]{2,}$/);
        mutated.inputs[0].spendingProof.proofBytes = proof.slice(0, -2)
          + (Number.parseInt(proof.slice(-2), 16) ^ 1).toString(16).padStart(2, '0');
        const parsed = wasm.Transaction.from_json(JSON.stringify(mutated));
        try { expect(parsed.id().to_str()).toBe(receipt.orderedChecks[0]!.signedTransactionIdHex); }
        finally { parsed.free(); }
        const rejected = await post(target.primaryNodeOrigin + '/transactions/check', mutated, {
          headers: { 'Content-Type': 'application/json' }, proxy: false, maxRedirects: 0,
          timeout: 30_000, validateStatus: () => true,
        });
        expect(rejected.status).toBe(400);
        const after = await discoverSubstrateFederatedRewardInputsV1(session.signer);
        expect(after.target).toEqual(funding.target);
        expect(after.genesisInputs).toEqual(funding.genesisInputs);
        ownedTargets.assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1(target);
        expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex)).toThrow(/revoked/);
        return {
          buildIdentityDigestHex: build.buildIdentityDigestHex,
          nodeArtifactSha256Hex: build.build.artifactSha256Hex,
          genesisHeaderIdHex: funding.target.genesisHeaderIdHex,
          tipHeight: funding.target.tipHeight,
          receiptDigestHex: receipt.receiptDigestHex,
          transactionIds: receipt.orderedChecks.map(check => check.signedTransactionIdHex),
          signatureMutationStatus: rejected.status,
        };
      });
      console.info('V3_NODE_SETUP_CHECK', JSON.stringify(checked.value));
    } finally {
      try { await nodes?.stop(); }
      finally { session.dispose(); }
    }
  // The owned manager bounds and joins work; Vitest must not detach its cleanup.
  }, 0,
);

// A separate opt-in from the read-only node check: local synthetic genesis only.
it.runIf(process.env.BRIDGE_TRACKER_V2_EXECUTE_GENESIS === '1')(
  'confirms three V3 genesis transactions on fresh owned Ergo nodes', async () => {
    const checkFeeFunding = process.env.BRIDGE_TRACKER_V2_CHECK_FEE_FUNDING === '1';
    const receiptPath = process.env.BRIDGE_TRACKER_V2_NODE_BUILD_RECEIPT;
    const javaExecutablePath = process.env.BRIDGE_TRACKER_V2_JAVA;
    const nodeAssemblyJarPath = process.env.BRIDGE_TRACKER_V2_NODE_JAR;
    if (!receiptPath || !javaExecutablePath || !nodeAssemblyJarPath) {
      throw new Error('explicit local build receipt, Java and node artifact paths are required');
    }
    const build: SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt = JSON.parse(
      readFileSync(receiptPath, 'utf8'),
    );
    const lock = JSON.parse(readFileSync(new URL(
      '../../sources/substrate-federated-isolated-devnet-node-build-lock-v1.json', import.meta.url,
    ), 'utf8'));
    expect(build.status).toBe('exact_locked_patched_node_built');
    expect(build.source.ergoNodeBaseCommit).toBe(lock.ergoNodeBaseCommit);
    expect(build.source.ergoPatchSha256Hex).toBe(lock.ergoPatchSha256);
    expect(build.toolchain.javaHomeSha256Hex).toBe(lock.javaHomeSha256);
    const session = await createSession();
    let nodes: ReturnType<typeof ownedTargets.createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2> | undefined;
    let journalRoot: string | undefined;
    let state: StateTracker | undefined;
    let failure: unknown;
    let result: unknown;
    try {
      nodes = ownedTargets.createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2({
        javaExecutablePath,
        expectedJavaExecutableSha256Hex: build.toolchain.javaExecutableSha256Hex,
        nodeAssemblyJarPath,
        expectedNodeAssemblyJarSha256Hex: build.build.artifactSha256Hex,
        buildIdentityDigestHex: build.buildIdentityDigestHex,
      }, {
        miningTargetPublicKeyHex: session.signer.publicKeyHex,
        p2pkErgoTreeHex: session.signer.p2pkErgoTreeHex,
        rewardInputErgoTrees: session.signer.rewardInputErgoTrees,
        networkPrefix: session.signer.networkPrefix,
        primaryNodeOrigin: 'http://127.0.0.1:9051',
        witnessNodeOrigin: 'http://127.0.0.1:9052',
      }, session.miningCredential);
      await nodes.startMining();
      const confirmed = await nodes.withMiningActiveExecutionTarget(async target => {
        ownedTargets.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
        const funding = await discoverSubstrateFederatedRewardInputsV2(session.signer);
        expect(funding.target.tipHeight).toBeGreaterThanOrEqual(10);
        const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
          trackerGenesisInputBoxIdHex: funding.genesisBoxIds.tracker,
          profile, application: compilerV3.trackerRequest.application,
          template: contractTemplate('contracts/SPVTrackerSubstrateFederatedV2.es'),
        });
        if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
          throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
        }
        const nodeOptions = process.env.NODE_OPTIONS;
        delete process.env.NODE_OPTIONS;
        let compiled: CompilerInputV3;
        try {
          const trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
          const familyReceipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2({
            trackerRequest, trackerReceipt, templates: compilerV3.familyTemplates,
            duplicatePreventionGenesisInputBoxIdHex: funding.genesisBoxIds.duplicatePrevention,
            pooledReserveGenesisInputBoxIdHex: funding.genesisBoxIds.pooledReserve,
          });
          // Source history remains synthetic; this run decides Ergo genesis only.
          compiled = { ...compilerV3, trackerRequest, trackerReceipt, familyReceipt };
        } finally { process.env.NODE_OPTIONS = nodeOptions; }
        const root = mkdtempSync(join(tmpdir(), 'e2s-v167-genesis-'));
        journalRoot = root;
        const markerDirectory = join(root, 'attempt-markers');
        mkdirSync(markerDirectory);
        const journalState = new StateTracker(join(root, 'state-store'));
        state = journalState;
        const checks: Record<string, unknown>[] = [];
        const submissions: Record<string, unknown>[] = [];
        const post = axios.post.bind(axios);
        const capture = vi.spyOn(axios, 'post').mockImplementation(async (...args) => {
          const path = String(args[0]);
          if (path !== target.primaryNodeOrigin + '/transactions/check'
            && path !== target.primaryNodeOrigin + '/transactions') {
            throw new Error('unexpected POST outside owned genesis check/submission');
          }
          const body = args[1];
          if (body === null || typeof body !== 'object' || Array.isArray(body)) {
            throw new Error('genesis POST body is not an object');
          }
          (path.endsWith('/check') ? checks : submissions)
            .push(structuredClone(body as Record<string, unknown>));
          return post(...args);
        });
        try {
          const setupInput = {
            ...rootInput(compiled),
            expectedSettlementGenesisHeaderIdHex: funding.target.genesisHeaderIdHex,
          };
          const batch = checkFeeFunding
            ? await session.runForExecutionV3RetainingTrackerFeeSigner(setupInput, target, checkPublicKey)
            : await session.runForExecutionV3(setupInput, target);
          if (!checkFeeFunding) {
            expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex))
              .toThrow(/revoked/);
          }
          const confirmations = await executeGenesisBatchV3({
            target, batch, state: journalState, markerDirectory,
          });
          expect(confirmations.map(value => value.role)).toEqual(roles);
          expect(confirmations.map(value => value.expectedTxId))
            .toEqual(batch.orderedTransactions.map(value => value.issuance.unsignedTransactionIdHex));
          expect(checks).toHaveLength(3);
          expect(submissions).toEqual(checks);
          expect(journalState.getActiveErgoOperationalTransactionAttempts(GENESIS_OPERATION_PROFILE)).toHaveLength(0);
          expect(journalState.getConfirmedErgoOperationalTransactionAttempts(GENESIS_OPERATION_PROFILE)).toHaveLength(3);
          await expect(executeGenesisBatchV3({ target, batch, state: journalState, markerDirectory }))
            .rejects.toThrow(/consumed|provenance/);
          expect(submissions).toHaveLength(3);
          let feeFundingCheck;
          if (checkFeeFunding) {
            const checked = await session.checkTrackerFeeFundingV3(target);
            expect(checks).toHaveLength(4);
            expect(submissions).toHaveLength(3);
            expect(submissions).toEqual(checks.slice(0, 3));
            expect(checked.transaction.outputs[0]).toMatchObject({
              value: '1100000', ergoTree: `0008cd${checkPublicKey}`,
            });
            expect(() => assertMiningCredential(session.miningCredential, session.signer.publicKeyHex))
              .toThrow(/revoked/);
            await expect(session.checkTrackerFeeFundingV3(target)).rejects.toThrow(/absent|consumed|disposed/);
            feeFundingCheck = {
              unsignedTransactionIdHex: checked.transaction.txId,
              feeInputBoxIdHex: checked.transaction.outputs[0]!.boxId,
              signedTransactionBytesSha256Hex: checked.signedCandidate.signedTransactionBytesSha256Hex,
              checkResponseDigestHex: checked.checkedAcceptance.submissionHandle.checkResponseDigestHex,
              fundingTransactionSubmitted: false,
              trackerUpdateChecked: false,
            };
          }
          ownedTargets.assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
          return {
            buildIdentityDigestHex: build.buildIdentityDigestHex,
            nodeArtifactSha256Hex: build.build.artifactSha256Hex,
            genesisHeaderIdHex: funding.target.genesisHeaderIdHex,
            requestDigestHex: batch.request.requestDigestHex,
            trackerErgoTreeSha256Hex: compiled.trackerReceipt.contract.propositionSha256Hex,
            confirmations,
            ...(feeFundingCheck === undefined ? {} : { feeFundingCheck }),
          };
        } finally { capture.mockRestore(); }
      });
      result = confirmed;
    } catch (error) { failure = error; }
    const cleanupErrors: unknown[] = [];
    let chainDestroyed = nodes === undefined;
    try { await nodes?.stop(); chainDestroyed = true; }
    catch (error) { cleanupErrors.push(error); }
    try { state?.close(); }
    catch (error) { cleanupErrors.push(error); }
    try { session.dispose(); }
    catch (error) { cleanupErrors.push(error); }
    if (chainDestroyed && journalRoot !== undefined) {
      try { rmSync(journalRoot, { recursive: true, force: false }); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (failure !== undefined || cleanupErrors.length > 0) {
      throw new AggregateError(
        [...(failure === undefined ? [] : [failure]), ...cleanupErrors],
        'owned V3 genesis confirmation failed or cleanup was incomplete',
      );
    }
    expect(result).toBeDefined();
    console.info(checkFeeFunding ? 'V3_NODE_GENESIS_AND_FEE_FUNDING_CHECKED' : 'V3_NODE_GENESIS_CONFIRMED', JSON.stringify(result));
  // The owned manager bounds and joins work before its cleanup; do not detach it.
  }, 0,
);

function reidentifyBox(box: Eip12Box, transactionId: string): Eip12Box {
  const { boxId: _boxId, transactionId: _transactionId, index, ...output } = box;
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
    inputs: [{ boxId: 'ef'.repeat(32), extension: {} }], dataInputs: [], outputs: [output],
  }));
  const candidates = unsigned.output_candidates();
  const candidate = candidates.get(0);
  const id = wasm.TxId.from_str(transactionId);
  const changed = wasm.ErgoBox.from_box_candidate(candidate, id, index);
  try { return changed.to_js_eip12(); }
  finally { changed.free(); id.free(); candidate.free(); candidates.free(); unsigned.free(); }
}

async function createRootFixture(retainTrackerSigner = false) {
  const session = await createSession();
  try {
    const funding = {
      tracker: fundingCandidate('50000000', session.signer.rewardInputErgoTrees.delay1),
      duplicatePrevention: fundingCandidate('100000000', session.signer.rewardInputErgoTrees.delay1),
      pooledReserve: fundingCandidate('150000000', session.signer.rewardInputErgoTrees.delay1),
    };
    if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    const nodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    try {
      const selectedProfile = retainTrackerSigner ? buildSubstrateFederatedCheckpointProfileV1({
        ...vector.input.profile, ergoAdmissionThreshold: 1,
        ergoAdmissionPublicKeysHex: [session.signer.publicKeyHex],
      }) : profile;
      const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
        trackerGenesisInputBoxIdHex: funding.tracker.boxId,
        profile: selectedProfile, application: compilerV3.trackerRequest.application,
        template: contractTemplate('contracts/SPVTrackerSubstrateFederatedV2.es'),
      });
      const trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
      const familyReceipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV2({
        trackerRequest, trackerReceipt, templates: compilerV3.familyTemplates,
        duplicatePreventionGenesisInputBoxIdHex: funding.duplicatePrevention.boxId,
        pooledReserveGenesisInputBoxIdHex: funding.pooledReserve.boxId,
      });
      return { session, boxes: funding, input: rootInput({ ...compilerV3, trackerRequest, trackerReceipt, familyReceipt }) };
    } finally { process.env.NODE_OPTIONS = nodeOptions; }
  } catch (error) { session.dispose(); throw error; }
}

// This parses received signed bytes; it is deliberately not an Ergo node/JVM oracle.
function signedCheckOracle(body: Record<string, unknown>): string {
  const parsed = wasm.Transaction.from_json(JSON.stringify(body));
  const id = parsed.id();
  try { return id.to_str(); }
  finally { id.free(); parsed.free(); }
}

function checkObservationOptions(): ObservationOptions {
  return { boxes: checkBoxes, headers: checkHeaders, tipHeaderId: String(checkHeaders[0]!.id), checkOracle: signedCheckOracle };
}

// Only these two bounded loopback origins exist while a test callback is active.
interface ObservationOptions {
  readonly publishSubmittedOutputs?: boolean;
  readonly boxes?: Boxes;
  readonly tipHeight?: number;
  readonly genesisHeaderId?: string;
  readonly tipHeaderId?: string;
  readonly headers?: readonly Readonly<Record<string, unknown>>[];
  readonly checkOracle?: (body: Record<string, unknown>, ordinal: number) => unknown;
  readonly submissionOracle?: (body: Record<string, unknown>, ordinal: number) => unknown;
  readonly confirmSubmittedGenesis?: boolean;
  readonly postCheckReplacementRole?: Role;
  readonly fixedSetupPorts?: boolean;
}

async function withObservations<T>(
  run: (observed: ObservationFixture) => Promise<T>,
  options: ObservationOptions = {},
): Promise<T> {
  const funding = options.boxes ?? boxes;
  let signingHeaders = options.headers;
  let tipHeight = options.tipHeight ?? TIP_HEIGHT;
  const genesisHeaderId = options.genesisHeaderId ?? GENESIS_HEADER_ID;
  let tipHeaderId = options.tipHeaderId ?? TIP_HEADER_ID;
  const json = new Map(roles.map(role => [funding[role].boxId, funding[role]]));
  const sigma = new Map(roles.map(role => [funding[role].boxId, sigmaBytes(funding[role])]));
  const servers: Server[] = [];
  const methods: string[] = [];
  const unexpected: string[] = [];
  const checkBodies: Record<string, unknown>[] = [];
  const submissionBodies: Record<string, unknown>[] = [];
  const confirmations = new Map<string, { inclusionHeight: number; headerId: string }>();
  const confirmationReads = new Map<string, Set<string>>();
  const syntheticHeaderId = (height: number) => createHash('sha256')
    .update(`V166 synthetic confirmation header ${height}`).digest('hex');
  const start = async () => {
    const primary = servers.length === 0;
    const server = createServer(async (request, response) => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      methods.push(request.method ?? '');
      let body: unknown;
      const oracle = path === '/transactions/check' ? options.checkOracle
        : path === '/transactions' ? options.submissionOracle : undefined;
      if (primary && oracle && request.method === 'POST') {
        try {
          const chunks: Buffer[] = [];
          let length = 0;
          for await (const chunk of request) {
            const bytes = Buffer.from(chunk);
            length += bytes.length;
            if (length > 1_048_576) throw new Error('synthetic check body exceeds fixture bound');
            chunks.push(bytes);
          }
          const candidate = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
          const bodies = path === '/transactions/check' ? checkBodies : submissionBodies;
          bodies.push(candidate);
          body = oracle(candidate, bodies.length - 1);
          if (path === '/transactions' && options.confirmSubmittedGenesis) {
            const previousId = [...confirmations.keys()].at(-1);
            if (previousId !== undefined) {
              expect(confirmationReads.get(previousId)).toEqual(new Set(['primary', 'witness']));
            }
            const id = signedCheckOracle(candidate);
            const inclusionHeight = tipHeight + 1;
            confirmations.set(id, { inclusionHeight, headerId: syntheticHeaderId(inclusionHeight) });
            tipHeight = inclusionHeight + 10;
            tipHeaderId = syntheticHeaderId(tipHeight);
            if (options.publishSubmittedOutputs) {
              const transaction = wasm.Transaction.from_json(JSON.stringify(candidate));
              const outputs = transaction.outputs();
              try {
                for (let i = 0; i < outputs.len(); i += 1) {
                  const output = outputs.get(i);
                  try { const box = output.to_js_eip12(); json.set(box.boxId, box); sigma.set(box.boxId, sigmaBytes(box)); }
                  finally { output.free(); }
                }
              } finally { outputs.free(); transaction.free(); }
            }
          }
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(body));
        } catch {
          unexpected.push('synthetic check oracle failed');
          response.writeHead(500, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'synthetic check oracle failed' }));
        }
        return;
      }
      if (request.method === 'GET') {
        if (path === '/info') body = { network: 'devnet', fullHeight: tipHeight };
        else if (path === '/blocks/lastHeaders/1') body = [{ id: tipHeaderId, height: tipHeight }];
        else if (path === '/blocks/lastHeaders/10' && signingHeaders) body = signingHeaders;
        else if (path === '/blocks/at/1') body = [genesisHeaderId];
        else if (options.confirmSubmittedGenesis && path.startsWith('/blockchain/transaction/byId/')) {
          const id = path.slice('/blockchain/transaction/byId/'.length);
          const confirmation = confirmations.get(id);
          if (confirmation !== undefined) {
            const readers = confirmationReads.get(id) ?? new Set<string>();
            readers.add(primary ? 'primary' : 'witness');
            confirmationReads.set(id, readers);
            body = { id, ...confirmation, numConfirmations: tipHeight - confirmation.inclusionHeight };
          }
        } else if (options.confirmSubmittedGenesis && /^\/blocks\/at\/[1-9][0-9]*$/.test(path)) {
          body = [syntheticHeaderId(Number(path.slice('/blocks/at/'.length)))];
        }
        else {
          const binary = path.match(/^\/utxo\/byIdBinary\/([0-9a-f]{64})$/);
          const byId = path.match(/^\/utxo\/byId\/([0-9a-f]{64})$/);
          if (binary && sigma.has(binary[1]!)) body = { bytes: sigma.get(binary[1]!) };
          else if (byId) body = json.get(byId[1]!);
          const changedRole = options.postCheckReplacementRole;
          if (changedRole && checkBodies.length === 3
            && (byId?.[1] === funding[changedRole].boxId || binary?.[1] === funding[changedRole].boxId)) {
            const replacement = fundingCandidate('51000000', funding[changedRole].ergoTree);
            body = binary ? { bytes: sigmaBytes(replacement) } : replacement;
          }
        }
      }
      if (body === undefined) unexpected.push(request.method + ' ' + path);
      response.writeHead(body === undefined ? 404 : 200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body ?? {}));
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.fixedSetupPorts ? (primary ? 9051 : 9052) : 0, '127.0.0.1', resolve);
    });
    return 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  };
  try {
    const primaryNodeOrigin = await start();
    const witnessNodeOrigin = await start();
    const targetProfile = buildSubstrateFederatedGenesisTargetProfileV1({
      profileIdHex: profile.profileIdHex, environment: 'patched-devnet', expectedNetwork: 'devnet',
      expectedGenesisHeaderIdHex: genesisHeaderId,
      primaryNodeOrigin, primaryNodeIdentityDigestHex: '11'.repeat(32),
      primaryAdministrationIdentityDigestHex: '12'.repeat(32),
      witnessNodeOrigin, witnessNodeIdentityDigestHex: '13'.repeat(32),
      witnessAdministrationIdentityDigestHex: '14'.repeat(32),
      trackerGenesisBoxIdHex: funding.tracker.boxId,
      duplicatePreventionGenesisBoxIdHex: funding.duplicatePrevention.boxId,
      pooledReserveGenesisBoxIdHex: funding.pooledReserve.boxId,
    });
    const observeAt = (at: string) => observeSubstrateFederatedGenesisV1(targetProfile, { now: () => new Date(at) });
    const retained = await observeAt(new Date(Date.now() - 2_000).toISOString());
    return await run({ profile: targetProfile, retained, observeAt, checkBodies, submissionBodies,
      publishBox: (box, headers) => {
        json.set(box.boxId, structuredClone(box)); sigma.set(box.boxId, sigmaBytes(box));
        signingHeaders = headers;
        const tip = fleet.selectLatestHeader([...headers] as Array<{ height: number; [key: string]: unknown }>).header;
        tipHeight = tip.height; tipHeaderId = tip.id as string;
      },
    });
  } finally {
    for (const server of servers) {
      if (!server.listening) continue;
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
    expect(methods.length).toBeGreaterThan(0);
    expect(new Set(methods)).toEqual(new Set(checkBodies.length ? ['GET', 'POST'] : ['GET']));
    expect(unexpected).toEqual([]);
  }
}

interface ObservationFixture {
  readonly profile: ReturnType<typeof buildSubstrateFederatedGenesisTargetProfileV1>;
  readonly retained: Awaited<ReturnType<typeof observeSubstrateFederatedGenesisV1>>;
  readonly observeAt: (at: string) => Promise<Awaited<ReturnType<typeof observeSubstrateFederatedGenesisV1>>>;
  readonly checkBodies: readonly Record<string, unknown>[];
  readonly submissionBodies: readonly Record<string, unknown>[];
  readonly publishBox: (box: Eip12Box, headers: readonly Readonly<Record<string, unknown>>[]) => void;
}

async function provisioningInput(observed: ObservationFixture, compiler = compilerV3): Promise<BuildInputV3> {
  return {
    settlementTarget: targetV3({
      ...compiler, settlementTargetProfile: observed.profile, settlementObservation: observed.retained,
    }),
    settlementTargetProfile: observed.profile,
    freshSettlementObservation: await observed.observeAt(new Date(Date.now() - 1_000).toISOString()),
  };
}

function fundingCandidate(value: string, ergoTree = FUNDING_TREE): Eip12Box {
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
    inputs: [{ boxId: '67'.repeat(32), extension: {} }], dataInputs: [],
    outputs: [{ value, ergoTree, assets: [], additionalRegisters: {}, creationHeight: 110 }],
  }));
  const id = unsigned.id();
  const candidates = unsigned.output_candidates();
  const candidate = candidates.get(0);
  let box: any;
  try {
    box = wasm.ErgoBox.from_box_candidate(candidate, id, 0);
    return box.to_js_eip12() as Eip12Box;
  } finally {
    box?.free?.(); candidate.free?.(); candidates.free?.(); id.free?.(); unsigned.free?.();
  }
}

function sigmaBytes(box: Eip12Box): string {
  const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
  let roundTrip: any;
  try {
    const bytes = parsed.sigma_serialize_bytes();
    roundTrip = wasm.ErgoBox.sigma_parse_bytes(bytes);
    expect(roundTrip.to_js_eip12()).toEqual(box);
    return Buffer.from(bytes).toString('hex');
  } finally { roundTrip?.free?.(); parsed.free?.(); }
}

function candidateFromBox(box: Eip12Box) {
  return { value: box.value, ergoTree: box.ergoTree, assets: box.assets,
    additionalRegisters: box.additionalRegisters, creationHeight: box.creationHeight };
}

function expectIssuance(plan: PlanV3, role: Role, creationHeight: number): void {
  const entry = plan.provisioning[role];
  const transaction = entry.transaction;
  const funding = boxes[role];
  const payload = plan.genesisPayloads[role];
  expect(transaction.eip12Tx.inputs).toEqual([{ ...funding, extension: {} }]);
  expect(transaction.eip12Tx.dataInputs).toEqual([]);
  expect(transaction.outputs).toHaveLength(3);
  expect(candidateFromBox(transaction.outputs[0]!)).toEqual({
    value: '10000000', ergoTree: payload.ergoTreeHex, creationHeight,
    assets: [{ tokenId: funding.boxId, amount: '1' }], additionalRegisters: payload.additionalRegisters,
  });
  expect(candidateFromBox(transaction.outputs[1]!)).toEqual({
    value: String(BigInt(funding.value) - 11_100_000n), ergoTree: FUNDING_TREE,
    creationHeight, assets: [], additionalRegisters: {},
  });
  expect(candidateFromBox(transaction.outputs[2]!)).toEqual({
    value: '1100000', ergoTree: MINER_FEE_TREE, creationHeight, assets: [], additionalRegisters: {},
  });
  expect(transaction.outputs.reduce((sum, box) => sum + BigInt(box.value), 0n)).toBe(BigInt(funding.value));
  expect(transaction.outputs.flatMap(box => box.assets)).toEqual([{ tokenId: funding.boxId, amount: '1' }]);
  expect(entry.identity).toMatchObject({
    genesisInputBoxIdHex: funding.boxId, unsignedTransactionIdHex: transaction.txId,
    stateOutputBoxIdHex: transaction.outputs[0]!.boxId, stateOutputIndex: 0, creationHeight,
  });
  expect(plan.freshObservation.boxes[role]).toEqual({
    boxIdHex: funding.boxId, sigmaSerializedSha256Hex: sha256(Buffer.from(sigmaBytes(funding), 'hex')),
  });
  expectUnsignedRoundTrip(transaction);
}

function expectUnsignedRoundTrip(transaction: Readonly<MaterializedUnsignedTransaction>): void {
  let unsigned: any;
  let id: any;
  let candidates: any;
  let proofless: any;
  let roundTrip: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(transaction.eip12Tx));
    expect(unsigned.to_js_eip12()).toEqual({
      inputs: transaction.eip12Tx.inputs.map(box => ({ boxId: box.boxId, extension: box.extension })),
      dataInputs: [], outputs: transaction.eip12Tx.outputs,
    });
    id = unsigned.id();
    expect(id.to_str()).toBe(transaction.txId);
    candidates = unsigned.output_candidates();
    for (const [index, expectedBox] of transaction.outputs.entries()) {
      const candidate = candidates.get(index);
      let box: any;
      try {
        box = wasm.ErgoBox.from_box_candidate(candidate, id, index);
        expect(box.to_js_eip12()).toEqual(expectedBox);
        expect(expectedBox.transactionId).toBe(transaction.txId);
        expect(expectedBox.index).toBe(index);
        sigmaBytes(expectedBox);
      } finally { box?.free?.(); candidate.free?.(); }
    }
    const consumed = unsigned;
    unsigned = undefined;
    proofless = wasm.Transaction.from_unsigned_tx(consumed, [new Uint8Array()]);
    const bytes = Buffer.from(proofless.sigma_serialize_bytes());
    expect(Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')).toBe(transaction.txId);
    const json = proofless.to_js_eip12();
    expect(json.inputs.map((box: any) => box.spendingProof)).toEqual([{ proofBytes: '', extension: {} }]);
    roundTrip = wasm.Transaction.from_json(JSON.stringify(json));
    expect(Buffer.from(roundTrip.sigma_serialize_bytes())).toEqual(bytes);
  } finally {
    roundTrip?.free?.(); proofless?.free?.(); candidates?.free?.(); id?.free?.(); unsigned?.free?.();
  }
}

function expectDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectDeepFrozen(child);
  }
}

// Bounded local source-history bytes copied from the launch tests, not a runtime-finality receipt.
function historyFixture(): {
  bundle: SubstrateFederatedAuthoritySafeDevnetHistoryBundleV1;
  pins: Omit<
    SubstrateFederatedIsolatedDevnetTargetPinsV1,
    | 'expectedSourceAttestationKeySetDigestHex'
    | 'expectedSourceAttestationThreshold'
    | 'expectedSourceNetworkIdHex'
    | 'expectedSidechainIdHex'
    | 'expectedRuntimeProfileIdHex'
    | 'expectedSettlementProfileIdHex'
  >;
} {
  const target = {
    frontierCommit: '81'.repeat(20),
    frontierPatchSha256Hex: '82'.repeat(32),
    generatedSpecSha256Hex: '83'.repeat(32),
    nativeGenesisHashHex: GENESIS_NATIVE_HASH,
    acceptedNativeTipHashHex: TIP_NATIVE_HASH,
    acceptedExecutionTipHashHex: TIP_EXECUTION_HASH,
    sourceRuntimeCodeSha256Hex: SOURCE_RUNTIME_DIGEST,
    sourceRuntimeCodeBytes: 1_969_685,
    storageLayoutDigestHex: '84'.repeat(32),
    bridgeAddressHex: BRIDGE_ADDRESS,
    bridgeRuntimeCodeSha256Hex: BRIDGE_RUNTIME_DIGEST,
    bridgeRuntimeCodeBytes: 4_104,
    tokenAddressHex: TOKEN_ADDRESS,
    tokenRuntimeCodeSha256Hex: TOKEN_RUNTIME_DIGEST,
    tokenRuntimeCodeBytes: 2_356,
    binarySha256Hex: '85'.repeat(32),
    processBindingDigestHex: '86'.repeat(32),
  };
  const acceptanceBody = {
    schema: 'e2s.substrate-federated-authority-safe-devnet-acceptance.v1',
    version: 1,
    status: 'isolated_exact_authority_safe_target_accepted',
    source: {
      frontierCommit: target.frontierCommit,
      frontierPatchSha256Hex: target.frontierPatchSha256Hex,
      checkoutDigestHex: '88'.repeat(32),
    },
    toolchain: {
      lockSha256Hex: '87'.repeat(32),
      platformKey: 'win32-x64',
      rustTarget: 'x86_64-pc-windows-msvc',
      cargo: { version: 'cargo 1.82.0', sha256Hex: '90'.repeat(32) },
      rustc: { version: 'rustc 1.82.0', sha256Hex: '91'.repeat(32) },
      git: { version: 'git version 2.54.0', sha256Hex: '92'.repeat(32) },
    },
    binary: {
      byteLength: 96_144_384,
      sha256Hex: target.binarySha256Hex,
      version: 'frontier-template-node.exe 0.0.0-test',
    },
    chainSpec: {
      reproducedBaseByteLength: 3_941_816,
      reproducedBaseSha256Hex: '89'.repeat(32),
      generatedByteLength: 3_962_352,
      generatedSha256Hex: target.generatedSpecSha256Hex,
      nodeAcceptedByteLength: 4_073_595,
      nodeAcceptedSha256Hex: '8a'.repeat(32),
      semanticDigestHex: '8b'.repeat(32),
    },
    runtimeTests: [{
      name: 'bridge_atomicity_tests::authority_safe_genesis_quarantines_owner_mint_without_sudo_or_active_profile',
      outputDigestHex: '93'.repeat(32),
    }, {
      name: 'bridge_atomicity_tests::inactive_profile_rejects_direct_owner_mint_before_evm_and_preserves_authoring',
      outputDigestHex: '94'.repeat(32),
    }],
    observation: {
      nativeGenesisHashHex: `0x${target.nativeGenesisHashHex}`,
      nativeTipHeight: '2',
      runtimeCodeSha256Hex: target.sourceRuntimeCodeSha256Hex,
      storageLayoutDigestHex: target.storageLayoutDigestHex,
      twoNodeConsensusDigestHex: '8c'.repeat(32),
      observationDigestHex: '8d'.repeat(32),
    },
    processes: {
      primaryPeerIdSha256Hex: '8e'.repeat(32),
      witnessPeerIdSha256Hex: '8f'.repeat(32),
      processBindingDigestHex: target.processBindingDigestHex,
    },
    checks: acceptanceChecks(),
    boundaries: acceptanceBoundaries(),
  };
  const acceptance = {
    ...acceptanceBody,
    acceptanceDigestHex: g1cDigest(acceptanceBody),
  };
  const commonManifest = {
    version: 1,
    target: withoutProcessTarget(target),
    firstHeight: '0',
    lastHeight: '2',
  };
  const nativeHashes = [GENESIS_NATIVE_HASH, '95'.repeat(32), TIP_NATIVE_HASH];
  const executionHashes = ['96'.repeat(32), '97'.repeat(32), TIP_EXECUTION_HASH];
  const blocks = nativeHashes.map((nativeBlockHashHex, index) => ({
    height: String(index),
    nativeBlockHashHex,
    nativeHeader: {
      digest: { logs: [] },
      extrinsicsRoot: `0x${'a1'.repeat(32)}`,
      number: `0x${index.toString(16)}`,
      parentHash: `0x${index === 0 ? '00'.repeat(32) : nativeHashes[index - 1]}`,
      stateRoot: `0x${'a2'.repeat(32)}`,
    },
    executionBlockHashHex: executionHashes[index],
    executionBlock: {
      author: `0x${'00'.repeat(20)}`,
      baseFeePerGas: '0x1',
      difficulty: '0x0',
      extraData: '0x',
      gasLimit: '0x1',
      gasUsed: '0x0',
      hash: `0x${executionHashes[index]}`,
      logsBloom: `0x${'00'.repeat(256)}`,
      miner: `0x${'00'.repeat(20)}`,
      nonce: `0x${'00'.repeat(8)}`,
      number: `0x${index.toString(16)}`,
      parentHash: `0x${index === 0 ? '00'.repeat(32) : executionHashes[index - 1]}`,
      receiptsRoot: `0x${'a3'.repeat(32)}`,
      sha3Uncles: `0x${'a4'.repeat(32)}`,
      size: '0x1',
      stateRoot: `0x${'a5'.repeat(32)}`,
      timestamp: `0x${index.toString(16)}`,
      totalDifficulty: '0x0',
      transactions: [],
      transactionsRoot: `0x${'a6'.repeat(32)}`,
      uncles: [],
    },
  }));
  const reportedFinality = ['primary', 'witness'].map(role => ({
    role,
    headHeight: '2',
    headNativeBlockHashHex: TIP_NATIVE_HASH,
    ancestryToAcceptedTip: [{
      height: '2',
      nativeBlockHashHex: TIP_NATIVE_HASH,
      parentNativeBlockHashHex: nativeHashes[1],
    }],
  }));
  const finalized = {
    schema: 'e2s.substrate-federated-authority-safe-devnet-reported-finalized-blocks.v1',
    ...commonManifest,
    finalityAuthority: 'two-owned-node-rpc-reported',
    blocks,
    reportedFinality,
  };
  const runtime = {
    schema: 'e2s.substrate-federated-authority-safe-devnet-runtime-history.v1',
    ...commonManifest,
    states: blocks.map((block, index) => ({
      height: block.height,
      nativeBlockHashHex: block.nativeBlockHashHex,
      runtimeCodeSha256Hex: index === 2 ? SOURCE_RUNTIME_DIGEST : '98'.repeat(32),
      runtimeCodeBytes: index === 2 ? 1_969_685 : 1,
    })),
  };
  const application = {
    schema: 'e2s.substrate-federated-authority-safe-devnet-application-history.v1',
    ...commonManifest,
    bridgeAddressHex: BRIDGE_ADDRESS,
    tokenAddressHex: TOKEN_ADDRESS,
    states: blocks.map((block, index) => ({
      height: block.height,
      executionBlockHashHex: block.executionBlockHashHex,
      bridgeRuntimeCodeSha256Hex: index === 2 ? BRIDGE_RUNTIME_DIGEST : '99'.repeat(32),
      bridgeRuntimeCodeBytes: index === 2 ? 4_104 : 1,
      tokenRuntimeCodeSha256Hex: index === 2 ? TOKEN_RUNTIME_DIGEST : '9a'.repeat(32),
      tokenRuntimeCodeBytes: index === 2 ? 2_356 : 1,
    })),
  };
  const acceptanceReport = jsonBytes(acceptance);
  const reportedFinalizedBlocks = jsonBytes(finalized);
  const runtimeHistory = jsonBytes(runtime);
  const applicationHistory = jsonBytes(application);
  const receiptBody = {
    schema: 'e2s.substrate-federated-authority-safe-devnet-history.v1',
    version: 1,
    status: 'isolated_exact_target_history_collected',
    acceptanceDigestHex: acceptance.acceptanceDigestHex,
    target,
    interval: {
      semantics: 'genesis-through-accepted-observation-tip-inclusive',
      genesisNativeBlockHashHex: GENESIS_NATIVE_HASH,
      observedTipHeight: '2',
      observedTipNativeBlockHashHex: TIP_NATIVE_HASH,
      observedTipExecutionBlockHashHex: TIP_EXECUTION_HASH,
      blockCount: 3,
      reportedFinality,
    },
    artifacts: {
      acceptanceReport: artifact(acceptanceReport),
      reportedFinalizedBlocks: artifact(reportedFinalizedBlocks),
      runtimeHistory: artifact(runtimeHistory),
      applicationHistory: artifact(applicationHistory),
    },
    checks: receiptChecks(),
    boundaries: receiptBoundaries(),
  };
  const receipt = {
    ...receiptBody,
    historyDigestHex: sha256CanonicalJson(receiptBody, HISTORY_DOMAIN),
  };
  const historyReceipt = jsonBytes(receipt);
  return {
    bundle: {
      acceptanceReport,
      reportedFinalizedBlocks,
      runtimeHistory,
      applicationHistory,
      historyReceipt,
    },
    pins: {
      expectedAcceptanceDigestHex: acceptance.acceptanceDigestHex,
      expectedHistoryDigestHex: receipt.historyDigestHex,
      expectedHistoryArtifacts: {
        acceptanceReportSha256Hex: sha256(acceptanceReport),
        reportedFinalizedBlocksSha256Hex: sha256(reportedFinalizedBlocks),
        runtimeHistorySha256Hex: sha256(runtimeHistory),
        applicationHistorySha256Hex: sha256(applicationHistory),
        historyReceiptSha256Hex: sha256(historyReceipt),
      },
    },
  };
}

function withoutProcessTarget(target: Record<string, unknown>) {
  const { binarySha256Hex: _binary, processBindingDigestHex: _process, ...rest } = target;
  return rest;
}

function acceptanceChecks() {
  return {
    exactPatchedSourceCheckoutVerifiedBeforeAndAfter: true,
    exactLockedToolchainVerifiedBeforeAndAfter: true,
    sourceLockedOfflineBuildPassed: true,
    freshIsolatedCargoTargetUsed: true,
    deterministicWasmPathRemappingApplied: true,
    builtInRuntimeBaseSpecReproducedExactly: true,
    runningNodeImageIdentityBoundForBothNodesAndVerifiedBeforeAndAfter: true,
    exactMutualPeerIdentityAndLoopbackIsolationObservedAtActionBoundaries: true,
    spawnedNodeListenersBoundAndReleased: true,
    generatedSpecAcceptedByExactBinary: true,
    nodeAcceptedSpecSemanticallyMatchesGeneratedSpec: true,
    exactTwoNodeRuntimeObservationJoined: true,
    directOwnerMintDryRunRejected: true,
    sourceLockedDirectOwnerMintBlockRejected: true,
    sourceLockedForwardedOwnerMintBlockRejected: true,
    typedQuarantineAndAbsentAuthorityStateObserved: true,
  };
}

function acceptanceBoundaries() {
  return {
    exactAuthoritySafeTargetIdentityObserved: true,
    targetHistoryIntakeEligible: true,
    targetHistoryCollected: false,
    targetHistoryAuthenticated: false,
    independentSourceAdministrationEstablished: false,
    sourceFinalityAuthenticated: false,
    completeBuildToolClosureVerified: false,
    dependencyCacheContentAttested: false,
    independentBuildAttestationVerified: false,
    syntheticDryRunProbeOnly: true,
    probeSubmitted: false,
    probeBroadcast: false,
    federatedLaunchEligible: false,
    mintAuthorized: false,
    settlementAuthorized: false,
    valueLifecycleTransactionConstructed: false,
    signingAuthorized: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    profileActivated: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  };
}

function receiptChecks() {
  return {
    freshExactTargetAcceptanceConsumed: true,
    exactProcessOwnedObservationTipConsumed: true,
    exactAcceptedTargetIdentityRecheckedAtHistoryTip: true,
    archiveGenesisStateReadFromBothOrigins: true,
    completeBoundedHeightIntervalCollected: true,
    nativeAndExecutionParentChainsContiguous: true,
    bothOriginsMatchedEveryCollectedHeight: true,
    acceptedTipIsAncestorOfEachRpcReportedFinalizedHead: true,
    everyCollectedRowStableAfterCollection: true,
    exactRuntimeAndApplicationHistoryMaterialized: true,
  };
}

function receiptBoundaries() {
  return {
    targetHistoryCollected: true,
    targetHistoryAuthenticated: false,
    sourceAttestationQuorumVerified: false,
    sourceConsensusIndependentlyVerified: false,
    independentSourceAdministrationEstablished: false,
    sourceFinalityAuthenticated: false,
    ergoHistoryCollected: false,
    relayerClosureCollected: false,
    isolatedDevnetTargetDescriptorProduced: false,
    isolatedDevnetLaunchStatementProduced: false,
    portableReplayCompleted: false,
    setupTransactionIdentitiesFrozen: false,
    setupTransactionConstructed: false,
    setupTransactionSigned: false,
    nodeCheckPerformed: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    profileActivated: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  };
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

function artifact(value: Uint8Array) {
  return { sha256Hex: sha256(value), sizeBytes: value.length };
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function g1cDigest(value: unknown): string {
  const sort = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(sort);
    if (child !== null && typeof child === 'object') {
      return Object.fromEntries(
        Object.entries(child as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, sort(nested)]),
      );
    }
    return child;
  };
  return createHash('sha256')
    .update(JSON.stringify(sort(value)), 'utf8')
    .digest('hex');
}
