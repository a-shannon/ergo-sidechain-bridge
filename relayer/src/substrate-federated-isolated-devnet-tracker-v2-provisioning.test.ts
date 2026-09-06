import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import blakejs from 'blakejs';
import { Mnemonic } from 'ethers';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { getDupTreeDigest, getPooledReserveEmptyDigest } from './avl-bridge.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1 } from './bridge-validity-tracker-header-context-v1.js';
import { deriveLocalWasmRootSignerPublicIdentity } from './local-wasm-root-signer-public-identity.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import * as ownedTargets from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
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
        expect(Reflect.apply(takeCheckV2, undefined, [receipt, request, target]).request).toBe(request);
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
  readonly boxes?: Boxes;
  readonly tipHeight?: number;
  readonly genesisHeaderId?: string;
  readonly tipHeaderId?: string;
  readonly headers?: readonly Readonly<Record<string, unknown>>[];
  readonly checkOracle?: (body: Record<string, unknown>, ordinal: number) => unknown;
  readonly postCheckReplacementRole?: Role;
}

async function withObservations<T>(
  run: (observed: ObservationFixture) => Promise<T>,
  options: ObservationOptions = {},
): Promise<T> {
  const funding = options.boxes ?? boxes;
  const tipHeight = options.tipHeight ?? TIP_HEIGHT;
  const genesisHeaderId = options.genesisHeaderId ?? GENESIS_HEADER_ID;
  const tipHeaderId = options.tipHeaderId ?? TIP_HEADER_ID;
  const json = new Map(roles.map(role => [funding[role].boxId, funding[role]]));
  const sigma = new Map(roles.map(role => [funding[role].boxId, sigmaBytes(funding[role])]));
  const servers: Server[] = [];
  const methods: string[] = [];
  const unexpected: string[] = [];
  const checkBodies: Record<string, unknown>[] = [];
  const start = async () => {
    const primary = servers.length === 0;
    const server = createServer(async (request, response) => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      methods.push(request.method ?? '');
      let body: unknown;
      if (primary && options.checkOracle && request.method === 'POST' && path === '/transactions/check') {
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
          checkBodies.push(candidate);
          body = options.checkOracle(candidate, checkBodies.length - 1);
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
        else if (path === '/blocks/lastHeaders/10' && options.headers) body = options.headers;
        else if (path === '/blocks/at/1') body = [genesisHeaderId];
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
      server.listen(0, '127.0.0.1', resolve);
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
    return await run({ profile: targetProfile, retained, observeAt, checkBodies });
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
