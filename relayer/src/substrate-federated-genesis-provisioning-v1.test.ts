import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it, vi } from 'vitest';

function yieldToTestWorker(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

const provenance = vi.hoisted(() => ({
  reviews: new WeakSet<object>(),
  replayPackets: new WeakSet<object>(),
  assert(set: WeakSet<object>, value: unknown, label: string): void {
    if (value === null || typeof value !== 'object' || !set.has(value)) {
      throw new Error(`${label} was not built in this process`);
    }
  },
}));

vi.mock(
  './validity-application-pooled-reserve-testnet-cutover-review-profile-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-testnet-cutover-review-profile-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance(
      value: unknown,
    ) {
      provenance.assert(provenance.reviews, value, 'cutover review');
    },
    validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
      value: unknown,
    ) {
      provenance.assert(provenance.reviews, value, 'cutover review');
      return {
        profile: value,
        serializedValidation: {
          canonicalDigestMatched: true,
          exactStaticRouteSetMatched: true,
          exactInternalReplayRouteJoinMatched: true,
          sanitizedFieldPolicyMatched: true,
          componentProvenanceReplayed: false,
          sourceComponentMembershipReplayed: false,
          callerAuthorityClaimsAccepted: false,
        },
      };
    },
  }),
);

vi.mock(
  './validity-application-pooled-reserve-historical-replay-genesis-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-historical-replay-genesis-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
      value: unknown,
    ) {
      provenance.assert(provenance.replayPackets, value, 'historical replay packet');
    },
  }),
);

import { getDupTreeDigest } from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointProfileV1Input,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { canonicalJson } from './strict-json.js';
import {
  buildSubstrateFederatedCutoverGenerationV1,
  type SubstrateFederatedCutoverGenerationV1Manifest,
} from './substrate-federated-cutover-generation-v1.js';
import {
  assertSubstrateFederatedInactiveRegistrationCandidateV1Provenance,
  buildSubstrateFederatedInactiveRegistrationCandidateV1,
  validateSubstrateFederatedInactiveRegistrationCandidateV1,
  type SubstrateFederatedInactiveRegistrationCandidateV1,
} from './substrate-federated-inactive-registration-candidate-v1.js';
import {
  getSubstrateFederatedSettlementFamilyV1FixtureIdentity,
} from './substrate-federated-burn-settlement-v1-fixture.js';
import {
  assertSubstrateFederatedGenesisObservationV1Provenance,
  buildSubstrateFederatedGenesisTargetProfileV1,
  observeSubstrateFederatedGenesisV1,
  type SubstrateFederatedGenesisObservationV1,
  type SubstrateFederatedGenesisTargetProfileV1,
} from './substrate-federated-genesis-observation-v1.js';
import {
  assertSubstrateFederatedGenesisProvisioningV1Provenance,
  buildSubstrateFederatedGenesisProvisioningV1,
  type BuildSubstrateFederatedGenesisProvisioningV1Input,
  type SubstrateFederatedGenesisProvisioningV1Plan,
} from './substrate-federated-genesis-provisioning-v1.js';
import {
  assertSubstrateFederatedGenesisSetupCheckRequestV1Provenance,
  buildSubstrateFederatedGenesisSetupCheckRequestV1,
  validateSubstrateFederatedGenesisSetupCheckRequestV1,
  type SubstrateFederatedGenesisSetupCheckRequestV1,
} from './substrate-federated-genesis-setup-check-request-v1.js';
import {
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1,
  type CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input,
  type SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import type {
  SubstrateFederatedSettlementFamilyV1Template,
} from './substrate-federated-settlement-family-v1.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
  type SubstrateFederatedTrackerJvmCompilerReceiptV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV1,
  type SubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';
import {
  assertSubstrateFederatedTrackerContractV1Identity,
  type SubstrateFederatedTrackerContractV1Identity,
} from './substrate-federated-tracker-v1.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6,
} from './validity-application-pooled-reserve-legacy-route-requirements-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS,
} from './validity-application-pooled-reserve-testnet-cutover-review-profile-v4.js';

interface TrackerVector {
  readonly input: {
    readonly profile: SubstrateFederatedCheckpointProfileV1Input;
    readonly statement: {
      readonly sourceNetworkIdHex: string;
      readonly sidechainIdHex: string;
      readonly bridgeAddressHex: string;
      readonly tokenAddressHex: string;
      readonly bridgeRuntimeCodeSha256Hex: string;
      readonly bridgeRuntimeCodeBytes: number;
      readonly tokenRuntimeCodeSha256Hex: string;
      readonly tokenRuntimeCodeBytes: number;
      readonly sourceRuntimeCodeSha256Hex: string;
      readonly sourceRuntimeCodeBytes: number;
      readonly runtimeProfileIdHex: string;
      readonly settlementProfileIdHex: string;
    };
  };
}

interface GenesisFixture {
  readonly tracker: Eip12Box;
  readonly duplicatePrevention: Eip12Box;
  readonly pooledReserve: Eip12Box;
  readonly sigmaByBoxId: ReadonlyMap<string, string>;
}

interface ObservationPair {
  readonly targetProfile: Readonly<SubstrateFederatedGenesisTargetProfileV1>;
  readonly observation: Readonly<SubstrateFederatedGenesisObservationV1>;
}

const GENESIS_HEADER_ID = '91'.repeat(32);
const TIP_HEADER_ID = '92'.repeat(32);
const OBSERVED_AT = '2026-08-12T12:00:00.000Z';
const FUNDING_TREE = `0008cd02${'22'.repeat(32)}`;
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: FUNDING_TREE,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const SOURCE_LINEAGE_ID = '41'.repeat(32);
const REPLAY_BURN_ID = '51'.repeat(32);
const REPLAY_ROUTE_ID = 'ergo-double-unlock-prevention-authenticated';
const REPLAY_INSTANCE_ID = 'authenticated-v2-instance-1';
const trackerTemplate = readFileSync(new URL(
  '../../contracts/SPVTrackerSubstrateFederatedV1.es',
  import.meta.url,
), 'utf8');
const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json',
  import.meta.url,
), 'utf8')) as TrackerVector;
const trackerContract = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-contract.json',
  import.meta.url,
), 'utf8')) as SubstrateFederatedTrackerContractV1Identity;

let baseline: BuildSubstrateFederatedGenesisProvisioningV1Input;
let plan: Readonly<SubstrateFederatedGenesisProvisioningV1Plan>;
let setupCheckRequest:
  Readonly<SubstrateFederatedGenesisSetupCheckRequestV1>;
let inactiveRegistrationCandidate:
  Readonly<SubstrateFederatedInactiveRegistrationCandidateV1>;
let swappedObservation: ObservationPair;
let siblingTrackerRequest:
  Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
let siblingTrackerReceipt:
  Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
let siblingFamilyReceipt:
  Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>;
let underfundedInput: BuildSubstrateFederatedGenesisProvisioningV1Input;
let dustChangeInput: BuildSubstrateFederatedGenesisProvisioningV1Input;

describe('Substrate federated genesis provisioning V1', () => {
  beforeAll(async () => {
    if (
      ORIGINAL_NODE_OPTIONS !== undefined
      || process.env.NODE_OPTIONS !== '--no-deprecation'
    ) {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    const fixture = await genesisFixture();
    const observed = await observeFixture(fixture);
    swappedObservation = await observeFixture(fixture, {
      tracker: fixture.tracker,
      duplicatePrevention: fixture.pooledReserve,
      pooledReserve: fixture.duplicatePrevention,
    }, '15'.repeat(32));
    const underfundedFixture = await genesisFixture([
      '10000000',
      '110000000',
      '180000000',
    ]);
    const underfundedObservation = await observeFixture(
      underfundedFixture,
      underfundedFixture,
      '16'.repeat(32),
    );
    const dustChangeFixture = await genesisFixture([
      '11500000',
      '108500000',
      '180000000',
    ]);
    const dustChangeObservation = await observeFixture(
      dustChangeFixture,
      dustChangeFixture,
      '17'.repeat(32),
    );
    const generationManifest = generationFixture();
    const templates = familyTemplates();
    const parentNodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    try {
      const trackerRequest = buildTrackerRequest(fixture.tracker.boxId);
      const trackerReceipt =
        await compileSubstrateFederatedTrackerWithPinnedJvmV1(trackerRequest);
      await yieldToTestWorker();
      const familyReceipt =
        await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
          trackerRequest,
          trackerReceipt,
          templates,
          duplicatePreventionGenesisInputBoxIdHex:
            fixture.duplicatePrevention.boxId,
          pooledReserveGenesisInputBoxIdHex: fixture.pooledReserve.boxId,
        });
      await yieldToTestWorker();
      siblingTrackerRequest = buildTrackerRequest(
        fixture.tracker.boxId,
        {
          ...vector.input.profile,
          maxAdmissionValidityBlocks:
            (BigInt(vector.input.profile.maxAdmissionValidityBlocks) + 1n)
              .toString(),
        },
      );
      siblingTrackerReceipt =
        await compileSubstrateFederatedTrackerWithPinnedJvmV1(
          siblingTrackerRequest,
        );
      await yieldToTestWorker();
      siblingFamilyReceipt =
        await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
          trackerRequest: siblingTrackerRequest,
          trackerReceipt: siblingTrackerReceipt,
          templates,
          duplicatePreventionGenesisInputBoxIdHex:
            fixture.duplicatePrevention.boxId,
          pooledReserveGenesisInputBoxIdHex: fixture.pooledReserve.boxId,
        });
      await yieldToTestWorker();
      baseline = {
        targetProfile: observed.targetProfile,
        observation: observed.observation,
        trackerRequest,
        trackerReceipt,
        familyTemplates: templates,
        familyReceipt,
        generationManifest,
      };
      underfundedInput = await compileProvisioningInput(
        underfundedFixture,
        underfundedObservation,
        templates,
        generationManifest,
      );
      await yieldToTestWorker();
      dustChangeInput = await compileProvisioningInput(
        dustChangeFixture,
        dustChangeObservation,
        templates,
        generationManifest,
      );
      await yieldToTestWorker();
      plan = await buildSubstrateFederatedGenesisProvisioningV1(baseline);
      setupCheckRequest =
        buildSubstrateFederatedGenesisSetupCheckRequestV1(plan);
      inactiveRegistrationCandidate =
        buildSubstrateFederatedInactiveRegistrationCandidateV1(
          setupCheckRequest,
          generationManifest,
        );
    } finally {
      process.env.NODE_OPTIONS = parentNodeOptions;
    }
  }, 120_000);

  it('materializes exact unsigned tracker, DUP and reserve issuance lineages', () => {
    assertSubstrateFederatedGenesisProvisioningV1Provenance(plan);
    expect(plan.status).toBe('unsigned_non_authorizing_candidate');
    expect(plan.targetGenerationCandidateIdHex).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.targetGenerationCandidateIdHex).not.toBe(
      baseline.generationManifest.generation.generationIdHex,
    );
    expect(plan.target).toMatchObject({
      network: 'testnet',
      genesisHeaderIdHex: GENESIS_HEADER_ID,
      observedTipHeight: 120,
      observedTipHeaderIdHex: TIP_HEADER_ID,
      issuanceCreationHeight: 120,
    });
    expect(plan.economics).toEqual({
      stateBoxValueNanoErg: '10000000',
      issuanceFeeNanoErg: '1100000',
      feesFundedOnlyByGenesisInputs: true,
    });

    const roles = [
      ['tracker', 'trackerIssuance'],
      ['duplicatePrevention', 'duplicatePreventionIssuance'],
      ['pooledReserve', 'pooledReserveIssuance'],
    ] as const;
    for (const [role, transactionRole] of roles) {
      const lineage = plan.lineages[role];
      const transaction = plan.transactions[transactionRole];
      const state = plan.boxes[role];
      expect(lineage).toEqual({
        genesisInputBoxIdHex: transaction.eip12Tx.inputs[0]!.boxId,
        singletonTokenIdHex: transaction.eip12Tx.inputs[0]!.boxId,
        issuanceTransactionIdHex: transaction.txId,
        stateOutputBoxIdHex: state.boxId,
        stateOutputIndex: 0,
        creationHeight: 120,
      });
      expect(state).toMatchObject({
        value: '10000000',
        assets: [{
          tokenId: lineage.singletonTokenIdHex,
          amount: '1',
        }],
        creationHeight: 120,
        transactionId: transaction.txId,
        index: 0,
      });
      expect(transaction.outputs.at(-1)).toMatchObject({
        value: '1100000',
        ergoTree: MINER_FEE_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight: 120,
      });
      const genesisInput = baseline.observation.boxes[role].box;
      const expectedChange = BigInt(genesisInput.value) - 11_100_000n;
      expect(transaction.outputs).toHaveLength(3);
      expect(transaction.outputs[1]).toMatchObject({
        value: expectedChange.toString(),
        ergoTree: genesisInput.ergoTree,
        assets: [],
        additionalRegisters: {},
        creationHeight: 120,
      });
      expect(transaction.outputs.reduce(
        (sum, output) => sum + BigInt(output.value),
        0n,
      )).toBe(BigInt(genesisInput.value));
    }
    expect(plan.boxes.tracker.additionalRegisters).toEqual(
      baseline.generationManifest.target.genesisPayloads.tracker
        .additionalRegisters,
    );
    expect(plan.boxes.duplicatePrevention.additionalRegisters.R5).toBe(
      baseline.generationManifest.target.genesisPayloads.duplicatePrevention
        .additionalRegisters.R5,
    );
    expect({
      R5: plan.boxes.pooledReserve.additionalRegisters.R5,
      R6: plan.boxes.pooledReserve.additionalRegisters.R6,
    }).toEqual({
      R5: baseline.generationManifest.target.genesisPayloads.pooledReserve
        .additionalRegisters.R5,
      R6: baseline.generationManifest.target.genesisPayloads.pooledReserve
        .additionalRegisters.R6,
    });
    expect(plan.boxes.duplicatePrevention.additionalRegisters.R5)
      .toBe(baseline.generationManifest.globalReplay.sourceRegisters.R5);
    expect(plan.sourceBindings).toMatchObject({
      targetProfileDigestHex: baseline.targetProfile.profileDigestHex,
      genesisObservationReportDigestHex: baseline.observation.reportDigestHex,
      trackerCompilerRequestDigestHex:
        baseline.trackerRequest.requestDigestHex,
      trackerCompilerReceiptDigestHex:
        baseline.trackerReceipt.receiptDigestHex,
      familyCompilerReceiptDigestHex:
        baseline.familyReceipt.receiptDigestHex,
      cutoverGenerationManifestDigestHex:
        baseline.generationManifest.manifestDigestHex,
      semanticBaselineGenerationIdHex:
        baseline.generationManifest.generation.generationIdHex,
    });
    expect(plan.checks).toMatchObject({
      stableCompilerSemanticsMatched: true,
      stableManifestPayloadSemanticsMatched: true,
    });
    expect(Object.values(plan.boundaries).every(value => value === false))
      .toBe(true);
    expect(plan.stages).toEqual({
      construction: 'unsigned-plan-complete',
      setupCheckRequest: 'not-created',
      jvmCheck: 'not-performed',
      signing: 'not-authorized',
      submission: 'not-authorized',
      broadcastAuthorization: 'not-granted',
      confirmation: 'not-established',
    });
  });

  it('reproduces the exact transaction and output identities', async () => {
    const replay = await buildSubstrateFederatedGenesisProvisioningV1(baseline);
    expect(Object.keys(plan.sourceBindings).sort()).toEqual([
      'cutoverGenerationManifestDigestHex',
      'familyCompilerReceiptDigestHex',
      'familyCompilerRequestDigestHex',
      'genesisObservationReportDigestHex',
      'semanticBaselineGenerationIdHex',
      'targetProfileDigestHex',
      'trackerCompilerReceiptDigestHex',
      'trackerCompilerRequestDigestHex',
    ]);
    expect(Object.keys(plan.checks).sort()).toEqual([
      'callerTargetApprovalAccepted',
      'exactCreationHeightsBound',
      'exactObservedGenesisInputsConsumed',
      'globalReplayImportedIntoDuplicatePrevention',
      'predictedTransactionAndOutputIdsBound',
      'sameProcessCutoverGenerationVerified',
      'sameProcessFamilyCompilationVerified',
      'sameProcessGenesisObservationVerified',
      'sameProcessTrackerCompilationVerified',
      'singletonIdsEqualGenesisInputIds',
      'stableCompilerSemanticsMatched',
      'stableManifestPayloadSemanticsMatched',
      'unsignedConstructionOnly',
    ]);
    expect(plan.targetGenerationCandidateIdHex).toBe(
      independentDomainDigest({
        schema: plan.schema,
        version: plan.version,
        sourceBindings: plan.sourceBindings,
        target: plan.target,
        profile: plan.profile,
        contracts: plan.contracts,
        replay: plan.replay,
        lineages: plan.lineages,
      }, 'E2S_SUBSTRATE_FEDERATED_TARGET_GENERATION_CANDIDATE_V1'),
    );
    const { planDigestHex, ...planBinding } = plan;
    expect(planDigestHex).toBe(independentDomainDigest(
      planBinding,
      'E2S_SUBSTRATE_FEDERATED_GENESIS_PROVISIONING_V1',
    ));
    expect(replay.planDigestHex).toBe(plan.planDigestHex);
    expect(replay.targetGenerationCandidateIdHex)
      .toBe(plan.targetGenerationCandidateIdHex);
    expect(Object.fromEntries(Object.entries(replay.lineages).map(
      ([role, lineage]) => [role, {
        transaction: lineage.issuanceTransactionIdHex,
        output: lineage.stateOutputBoxIdHex,
      }],
    ))).toEqual(Object.fromEntries(Object.entries(plan.lineages).map(
      ([role, lineage]) => [role, {
        transaction: lineage.issuanceTransactionIdHex,
        output: lineage.stateOutputBoxIdHex,
      }],
    )));
    expect(Object.isFrozen(replay)).toBe(true);
    expect(() => assertSubstrateFederatedGenesisProvisioningV1Provenance(
      structuredClone(replay),
    )).toThrow(/not built in this process/);
  });

  it('rejects observed DUP and reserve role drift at the family receipt join', async () => {
    await expect(buildSubstrateFederatedGenesisProvisioningV1({
      ...baseline,
      targetProfile: swappedObservation.targetProfile,
      observation: swappedObservation.observation,
    })).rejects.toThrow(/family binding drifted/);
  });

  it('rejects a genuine sibling federation that no longer matches FED-5A', async () => {
    await expect(buildSubstrateFederatedGenesisProvisioningV1({
      ...baseline,
      trackerRequest: siblingTrackerRequest,
      trackerReceipt: siblingTrackerReceipt,
      familyReceipt: siblingFamilyReceipt,
    })).rejects.toThrow(
      /compiler semantics do not match the FED-5A generation baseline/,
    );
  });

  it('rejects caller-copied producer outputs independently', async () => {
    const cases: ReadonlyArray<{
      label: string;
      input: BuildSubstrateFederatedGenesisProvisioningV1Input;
    }> = [
      {
        label: 'target profile',
        input: { ...baseline, targetProfile: structuredClone(baseline.targetProfile) },
      },
      {
        label: 'observation',
        input: { ...baseline, observation: structuredClone(baseline.observation) },
      },
      {
        label: 'tracker request',
        input: { ...baseline, trackerRequest: structuredClone(baseline.trackerRequest) },
      },
      {
        label: 'tracker receipt',
        input: { ...baseline, trackerReceipt: structuredClone(baseline.trackerReceipt) },
      },
      {
        label: 'family receipt',
        input: { ...baseline, familyReceipt: structuredClone(baseline.familyReceipt) },
      },
      {
        label: 'generation manifest',
        input: {
          ...baseline,
          generationManifest: structuredClone(baseline.generationManifest),
        },
      },
    ];
    for (const testCase of cases) {
      await expect(
        buildSubstrateFederatedGenesisProvisioningV1(testCase.input),
        testCase.label,
      ).rejects.toThrow();
    }
  });

  it('rejects accessor-backed caller inputs before producer validation', async () => {
    const accessorInput: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(baseline)) {
      Object.defineProperty(accessorInput, key, {
        configurable: true,
        enumerable: true,
        value,
      });
    }
    Object.defineProperty(accessorInput, 'observation', {
      enumerable: true,
      get: () => baseline.observation,
    });
    await expect(buildSubstrateFederatedGenesisProvisioningV1(
      accessorInput as unknown as BuildSubstrateFederatedGenesisProvisioningV1Input,
    )).rejects.toThrow(/must use enumerable own data properties/);

    const sourceAccessor = {};
    Object.defineProperties(sourceAccessor, {
      relativePath: {
        enumerable: true,
        value: baseline.familyTemplates.pooledReserve.relativePath,
      },
      source: {
        enumerable: true,
        get: () => baseline.familyTemplates.pooledReserve.source,
      },
    });
    await expect(buildSubstrateFederatedGenesisProvisioningV1({
      ...baseline,
      familyTemplates: {
        ...baseline.familyTemplates,
        pooledReserve: sourceAccessor as SubstrateFederatedSettlementFamilyV1Template,
      },
    })).rejects.toThrow(/must use enumerable own data properties/);
  });

  it('rejects underfunded issuance and dust change independently', async () => {
    await expect(buildSubstrateFederatedGenesisProvisioningV1(
      underfundedInput,
    )).rejects.toThrow(/tracker issuance is underfunded/);
    await expect(buildSubstrateFederatedGenesisProvisioningV1(
      dustChangeInput,
    )).rejects.toThrow(/tracker issuance would create a dust change output/);
  });

  it('freezes the exact non-executable ordered three-issuance request', () => {
    assertSubstrateFederatedGenesisSetupCheckRequestV1Provenance(
      setupCheckRequest,
      plan,
    );
    expect(setupCheckRequest.status)
      .toBe('non_executable_unsigned_setup_check_request');
    expect(setupCheckRequest.sourceBindings).toEqual({
      provisioningPlanDigestHex: plan.planDigestHex,
      targetGenerationCandidateIdHex: plan.targetGenerationCandidateIdHex,
      ...plan.sourceBindings,
    });
    expect(setupCheckRequest.target).toEqual(plan.target);
    expect(setupCheckRequest.orderedIssuances.map(issuance => [
      issuance.ordinal,
      issuance.role,
      issuance.unsignedTransactionIdHex,
      issuance.predictedStateOutputBoxIdHex,
    ])).toEqual([
      [
        0,
        'tracker',
        plan.lineages.tracker.issuanceTransactionIdHex,
        plan.lineages.tracker.stateOutputBoxIdHex,
      ],
      [
        1,
        'duplicatePrevention',
        plan.lineages.duplicatePrevention.issuanceTransactionIdHex,
        plan.lineages.duplicatePrevention.stateOutputBoxIdHex,
      ],
      [
        2,
        'pooledReserve',
        plan.lineages.pooledReserve.issuanceTransactionIdHex,
        plan.lineages.pooledReserve.stateOutputBoxIdHex,
      ],
    ]);
    for (const issuance of setupCheckRequest.orderedIssuances) {
      const transaction = {
        tracker: plan.transactions.trackerIssuance,
        duplicatePrevention: plan.transactions.duplicatePreventionIssuance,
        pooledReserve: plan.transactions.pooledReserveIssuance,
      }[issuance.role];
      expect(issuance.unsignedTransactionBodyDigestHex).toBe(
        independentDomainDigest(
          transaction.eip12Tx,
          `E2S_SUBSTRATE_FEDERATED_GENESIS_SETUP_CHECK_TRANSACTION_BODY_V1_${issuance.role.toUpperCase()}`,
        ),
      );
      expect(issuance.materializedTransactionDigestHex).toBe(
        independentDomainDigest(
          transaction,
          `E2S_SUBSTRATE_FEDERATED_GENESIS_SETUP_CHECK_MATERIALIZED_TRANSACTION_V1_${issuance.role.toUpperCase()}`,
        ),
      );
    }
    const { requestDigestHex, ...requestBinding } = setupCheckRequest;
    expect(requestDigestHex).toBe(independentDomainDigest(
      requestBinding,
      'E2S_SUBSTRATE_FEDERATED_GENESIS_SETUP_CHECK_REQUEST_V1',
    ));
    expect(Object.values(setupCheckRequest.boundaries).every(
      value => value === false,
    )).toBe(true);
    expect(setupCheckRequest.stages).toEqual({
      requestFreeze: 'complete',
      signedBytes: 'absent',
      jvmCheck: 'not-performed',
      nodeCheck: 'not-performed',
      submission: 'not-authorized',
      broadcast: 'not-authorized',
      confirmation: 'not-established',
    });
  });

  it('rebuilds deterministically and separates structural validity from provenance', () => {
    const replay = buildSubstrateFederatedGenesisSetupCheckRequestV1(plan);
    expect(replay).toEqual(setupCheckRequest);
    expect(replay.requestDigestHex).toBe(setupCheckRequest.requestDigestHex);
    const copied = structuredClone(replay);
    expect(validateSubstrateFederatedGenesisSetupCheckRequestV1(copied, plan))
      .toEqual(replay);
    expect(() =>
      assertSubstrateFederatedGenesisSetupCheckRequestV1Provenance(copied, plan)
    ).toThrow(/not built in this process/);
  });

  it('rejects order, role, identity, lineage and authority drift independently', () => {
    const mutations: ReadonlyArray<{
      label: string;
      mutate: (candidate: any) => void;
    }> = [
      {
        label: 'order',
        mutate(candidate) {
          [candidate.orderedIssuances[0], candidate.orderedIssuances[1]] =
            [candidate.orderedIssuances[1], candidate.orderedIssuances[0]];
        },
      },
      {
        label: 'role',
        mutate(candidate) {
          candidate.orderedIssuances[0].role = 'pooledReserve';
        },
      },
      {
        label: 'transaction identity',
        mutate(candidate) {
          candidate.orderedIssuances[0].unsignedTransactionIdHex = 'ab'.repeat(32);
        },
      },
      {
        label: 'transaction body digest',
        mutate(candidate) {
          candidate.orderedIssuances[0].unsignedTransactionBodyDigestHex =
            'b1'.repeat(32);
        },
      },
      {
        label: 'materialized transaction digest',
        mutate(candidate) {
          candidate.orderedIssuances[0].materializedTransactionDigestHex =
            'b2'.repeat(32);
        },
      },
      {
        label: 'genesis input identity',
        mutate(candidate) {
          candidate.orderedIssuances[1].genesisInputBoxIdHex = 'b3'.repeat(32);
        },
      },
      {
        label: 'singleton identity',
        mutate(candidate) {
          candidate.orderedIssuances[1].singletonTokenIdHex = 'b4'.repeat(32);
        },
      },
      {
        label: 'predicted lineage',
        mutate(candidate) {
          candidate.orderedIssuances[2].predictedStateOutputBoxIdHex =
            'ac'.repeat(32);
        },
      },
      {
        label: 'state output index',
        mutate(candidate) {
          candidate.orderedIssuances[2].stateOutputIndex = 1;
        },
      },
      {
        label: 'creation height',
        mutate(candidate) {
          candidate.orderedIssuances[2].creationHeight += 1;
        },
      },
      {
        label: 'request digest',
        mutate(candidate) {
          candidate.requestDigestHex = 'b5'.repeat(32);
        },
      },
      {
        label: 'coordinated transaction and request digest',
        mutate(candidate) {
          candidate.orderedIssuances[0].unsignedTransactionIdHex =
            'bc'.repeat(32);
          const { requestDigestHex: _requestDigestHex, ...binding } = candidate;
          candidate.requestDigestHex = independentDomainDigest(
            binding,
            'E2S_SUBSTRATE_FEDERATED_GENESIS_SETUP_CHECK_REQUEST_V1',
          );
        },
      },
      {
        label: 'provisioning plan digest',
        mutate(candidate) {
          candidate.sourceBindings.provisioningPlanDigestHex = 'b6'.repeat(32);
        },
      },
      {
        label: 'target candidate identity',
        mutate(candidate) {
          candidate.sourceBindings.targetGenerationCandidateIdHex =
            'ad'.repeat(32);
        },
      },
      {
        label: 'target profile digest',
        mutate(candidate) {
          candidate.sourceBindings.targetProfileDigestHex = 'b7'.repeat(32);
        },
      },
      {
        label: 'observation digest',
        mutate(candidate) {
          candidate.sourceBindings.genesisObservationReportDigestHex =
            'b8'.repeat(32);
        },
      },
      {
        label: 'semantic baseline identity',
        mutate(candidate) {
          candidate.sourceBindings.semanticBaselineGenerationIdHex =
            'b9'.repeat(32);
        },
      },
      {
        label: 'target tip identity',
        mutate(candidate) {
          candidate.target.observedTipHeaderIdHex = 'ba'.repeat(32);
        },
      },
      {
        label: 'profile family identity',
        mutate(candidate) {
          candidate.profile.familyIdHex = 'bb'.repeat(32);
        },
      },
      {
        label: 'check stage',
        mutate(candidate) {
          candidate.stages.nodeCheck = 'performed';
        },
      },
      {
        label: 'authority boundary',
        mutate(candidate) {
          candidate.boundaries.targetNodeAcceptanceEstablished = true;
        },
      },
      {
        label: 'extra authority field',
        mutate(candidate) {
          candidate.signer = { key: 'not-allowed' };
        },
      },
    ];
    for (const mutation of mutations) {
      const candidate = structuredClone(setupCheckRequest) as any;
      mutation.mutate(candidate);
      expect(
        () => validateSubstrateFederatedGenesisSetupCheckRequestV1(
          candidate,
          plan,
        ),
        mutation.label,
      ).toThrow(/does not match the provisioning plan/);
    }
  });

  it('rejects accessor-backed request objects and copied provisioning plans', () => {
    const accessor = structuredClone(setupCheckRequest) as Record<string, unknown>;
    Object.defineProperty(accessor, 'target', {
      configurable: true,
      enumerable: true,
      get: () => setupCheckRequest.target,
    });
    expect(() => validateSubstrateFederatedGenesisSetupCheckRequestV1(
      accessor,
      plan,
    )).toThrow(/must be an own data property/);
    expect(() => buildSubstrateFederatedGenesisSetupCheckRequestV1(
      structuredClone(plan),
    )).toThrow(/not built in this process/);
  });

  it('rejects proto keys, inherited authority and Proxies', () => {
    const protoKey = structuredClone(setupCheckRequest) as Record<string, unknown>;
    Object.defineProperty(protoKey, '__proto__', {
      enumerable: true,
      value: null,
    });
    expect(() => validateSubstrateFederatedGenesisSetupCheckRequestV1(
      protoKey,
      plan,
    )).toThrow(/does not match the provisioning plan/);

    const inherited = Object.assign(
      Object.create({ signer: { capability: 'not-allowed' } }),
      structuredClone(setupCheckRequest),
    );
    expect(() => validateSubstrateFederatedGenesisSetupCheckRequestV1(
      inherited,
      plan,
    )).toThrow(/must be a plain object/);

    const proxied = new Proxy(structuredClone(setupCheckRequest), {});
    expect(() => validateSubstrateFederatedGenesisSetupCheckRequestV1(
      proxied,
      plan,
    )).toThrow(/must not be a Proxy/);
  });

  it('freezes all 53 unresolved routes into an inactive registration candidate', () => {
    const manifest = baseline.generationManifest;
    assertSubstrateFederatedInactiveRegistrationCandidateV1Provenance(
      inactiveRegistrationCandidate,
      setupCheckRequest,
      manifest,
    );
    expect(inactiveRegistrationCandidate.status)
      .toBe('inactive_blocked_registration_candidate');
    expect(inactiveRegistrationCandidate.sourceBindings).toEqual({
      setupCheckRequestDigestHex: setupCheckRequest.requestDigestHex,
      provisioningPlanDigestHex:
        setupCheckRequest.sourceBindings.provisioningPlanDigestHex,
      targetGenerationCandidateIdHex:
        setupCheckRequest.sourceBindings.targetGenerationCandidateIdHex,
      targetProfileDigestHex:
        setupCheckRequest.sourceBindings.targetProfileDigestHex,
      cutoverGenerationManifestDigestHex: manifest.manifestDigestHex,
      semanticBaselineGenerationIdHex: manifest.generation.generationIdHex,
      semanticBaselineFamilyIdHex: manifest.target.profile.familyIdHex,
      exactStaticRouteSetDigestHex:
        manifest.legacyRoutes.exactStaticRouteSetDigestHex,
      boundRouteSetDigestHex: manifest.legacyRoutes.boundRouteSetDigestHex,
    });
    expect(inactiveRegistrationCandidate.predictedLineages)
      .toEqual(setupCheckRequest.orderedIssuances);
    expect(inactiveRegistrationCandidate.globalReplay)
      .toEqual(manifest.globalReplay);
    expect(inactiveRegistrationCandidate.retirement).toMatchObject({
      routeCount: 53,
      unresolvedRouteCount: 53,
      allRetirementEvidenceAuthenticated: false,
      allLegacyRoutesRetired: false,
    });
    expect(inactiveRegistrationCandidate.retirement.routes).toHaveLength(53);
    expect(inactiveRegistrationCandidate.retirement.routes.map(route => ({
      routeId: route.routeId,
      layer: route.layer,
      routeClass: route.routeClass,
      sourceSurface: route.sourceSurface,
      historicalAuthority: route.historicalAuthority,
      requiredDisposition: route.requiredDisposition,
      introducedBy: route.introducedBy,
      contractIdHex: route.contractIdHex,
    }))).toEqual(
      [...VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6]
        .sort((left, right) => left.routeId.localeCompare(right.routeId)),
    );
    expect(inactiveRegistrationCandidate.retirement.routes.every(route =>
      !route.retirementEvidenceAuthenticated && !route.routeRetired
    )).toBe(true);
    expect(inactiveRegistrationCandidate.registration).toEqual({
      status: 'inactive_blocked',
      activeRegistrySelection: null,
      runtimeSelectable: false,
      activationConsumerExported: false,
    });
    expect(inactiveRegistrationCandidate.checks).toEqual({
      sameProcessSetupCheckRequestVerified: true,
      sameProcessGenerationManifestVerified: true,
      exact53RouteRequirementSetMatched: true,
      importedReplayLineageBound: true,
      allThreePredictedSingletonLineagesBound: true,
      unresolvedBlockersPreserved: true,
      identicalInventoryAndRetirementDigestRejected: true,
      retirementEvidenceSemanticIndependenceEstablished: false,
      callerRetirementClaimsAccepted: false,
    });
    expect(Object.values(inactiveRegistrationCandidate.boundaries).every(
      value => value === false,
    )).toBe(true);

    const registrationIdentity = {
      setupCheckRequestDigestHex: setupCheckRequest.requestDigestHex,
      cutoverGenerationManifestDigestHex: manifest.manifestDigestHex,
      targetGenerationCandidateIdHex:
        setupCheckRequest.sourceBindings.targetGenerationCandidateIdHex,
      targetProfileDigestHex:
        setupCheckRequest.sourceBindings.targetProfileDigestHex,
      familyIdHex: setupCheckRequest.profile.familyIdHex,
      semanticBaselineFamilyIdHex: manifest.target.profile.familyIdHex,
      federationProfileIdHex: setupCheckRequest.profile.federationProfileIdHex,
      settlementProfileIdHex: setupCheckRequest.profile.settlementProfileIdHex,
      predictedLineages: setupCheckRequest.orderedIssuances,
      globalReplayLineageSetDigestHex: manifest.globalReplay.lineageSetDigestHex,
      globalReplayDuplicatePreventionDigestHex:
        manifest.globalReplay.duplicatePreventionDigestHex,
      requirementSetDigestHex:
        inactiveRegistrationCandidate.retirement.requirementSetDigestHex,
      boundRouteSetDigestHex: manifest.legacyRoutes.boundRouteSetDigestHex,
      blockerCodes: inactiveRegistrationCandidate.retirement.blockerCodes,
    };
    expect(inactiveRegistrationCandidate.registrationCandidateIdHex).toBe(
      independentDomainDigest(
        registrationIdentity,
        'E2S_SUBSTRATE_FEDERATED_INACTIVE_REGISTRATION_ID_V1',
      ),
    );
    const { candidateDigestHex, ...candidateBinding } =
      inactiveRegistrationCandidate;
    expect(candidateDigestHex).toBe(independentDomainDigest(
      candidateBinding,
      'E2S_SUBSTRATE_FEDERATED_INACTIVE_REGISTRATION_CANDIDATE_V1',
    ));
  });

  it('rebuilds the inactive candidate deterministically without transferring provenance', () => {
    const replay = buildSubstrateFederatedInactiveRegistrationCandidateV1(
      setupCheckRequest,
      baseline.generationManifest,
    );
    expect(replay).toEqual(inactiveRegistrationCandidate);
    const copied = structuredClone(replay);
    expect(validateSubstrateFederatedInactiveRegistrationCandidateV1(
      copied,
      setupCheckRequest,
      baseline.generationManifest,
    )).toEqual(replay);
    expect(() =>
      assertSubstrateFederatedInactiveRegistrationCandidateV1Provenance(
        copied,
        setupCheckRequest,
        baseline.generationManifest,
      )
    ).toThrow(/not built in this process/);
  });

  it('rejects retirement, lineage, replay and registration authority drift', () => {
    const mutations: ReadonlyArray<{
      label: string;
      mutate: (candidate: any) => void;
      rehash?: boolean;
    }> = [
      {
        label: 'legacy route identity',
        mutate(candidate) {
          candidate.retirement.routes[0].routeId = 'invented-route';
        },
      },
      {
        label: 'retirement claim with coordinated digest',
        mutate(candidate) {
          candidate.retirement.routes[0].routeRetired = true;
        },
        rehash: true,
      },
      {
        label: 'reused inventory evidence with coordinated digest',
        mutate(candidate) {
          candidate.retirement.routes[0].retirementEvidenceDigestHex =
            candidate.retirement.routes[0].inventoryBindingDigestHex;
        },
        rehash: true,
      },
      {
        label: 'dropped blocker',
        mutate(candidate) {
          candidate.retirement.blockerCodes.pop();
        },
      },
      {
        label: 'predicted singleton lineage',
        mutate(candidate) {
          candidate.predictedLineages[0].singletonTokenIdHex = 'c1'.repeat(32);
        },
      },
      {
        label: 'global replay lineage',
        mutate(candidate) {
          candidate.globalReplay.lineageSetDigestHex = 'c2'.repeat(32);
        },
      },
      {
        label: 'active registry selection',
        mutate(candidate) {
          candidate.registration.activeRegistrySelection = {
            profileIdHex: 'c3'.repeat(32),
          };
        },
      },
      {
        label: 'runtime selection',
        mutate(candidate) {
          candidate.registration.runtimeSelectable = true;
        },
      },
      {
        label: 'funds authority',
        mutate(candidate) {
          candidate.boundaries.fundsAuthorityEstablished = true;
        },
      },
    ];
    for (const mutation of mutations) {
      const candidate = structuredClone(inactiveRegistrationCandidate) as any;
      mutation.mutate(candidate);
      if (mutation.rehash) {
        const { candidateDigestHex: _candidateDigestHex, ...binding } = candidate;
        candidate.candidateDigestHex = independentDomainDigest(
          binding,
          'E2S_SUBSTRATE_FEDERATED_INACTIVE_REGISTRATION_CANDIDATE_V1',
        );
      }
      expect(
        () => validateSubstrateFederatedInactiveRegistrationCandidateV1(
          candidate,
          setupCheckRequest,
          baseline.generationManifest,
        ),
        mutation.label,
      ).toThrow(/does not match its exact inputs/);
    }
  });

  it('rejects copied producer inputs and hostile candidate object shapes', () => {
    expect(() => buildSubstrateFederatedInactiveRegistrationCandidateV1(
      structuredClone(setupCheckRequest),
      baseline.generationManifest,
    )).toThrow(/not built in this process/);
    expect(() => buildSubstrateFederatedInactiveRegistrationCandidateV1(
      setupCheckRequest,
      structuredClone(baseline.generationManifest),
    )).toThrow(/not built in this process/);

    const accessor = structuredClone(
      inactiveRegistrationCandidate,
    ) as Record<string, unknown>;
    Object.defineProperty(accessor, 'retirement', {
      configurable: true,
      enumerable: true,
      get: () => inactiveRegistrationCandidate.retirement,
    });
    expect(() => validateSubstrateFederatedInactiveRegistrationCandidateV1(
      accessor,
      setupCheckRequest,
      baseline.generationManifest,
    )).toThrow(/must be an own data property/);
    expect(() => validateSubstrateFederatedInactiveRegistrationCandidateV1(
      Object.assign(
        Object.create({ signer: { capability: 'not-allowed' } }),
        structuredClone(inactiveRegistrationCandidate),
      ),
      setupCheckRequest,
      baseline.generationManifest,
    )).toThrow(/must be a plain object/);
    expect(() => validateSubstrateFederatedInactiveRegistrationCandidateV1(
      new Proxy(structuredClone(inactiveRegistrationCandidate), {}),
      setupCheckRequest,
      baseline.generationManifest,
    )).toThrow(/must not be a Proxy/);
  });

  it('keeps the inactive candidate outside the active source-profile registry', () => {
    const candidateModule = fileURLToPath(new URL(
      './substrate-federated-inactive-registration-candidate-v1.ts',
      import.meta.url,
    ));
    const forbiddenTokens = [
      'substrate-federated-inactive-registration-candidate-v1',
      'SUBSTRATE_FEDERATED_INACTIVE_REGISTRATION_CANDIDATE_V1_SCHEMA',
      'buildSubstrateFederatedInactiveRegistrationCandidateV1',
      'validateSubstrateFederatedInactiveRegistrationCandidateV1',
      'assertSubstrateFederatedInactiveRegistrationCandidateV1Provenance',
    ];
    const consumers = collectProductionTypeScriptFiles(fileURLToPath(new URL(
      '.',
      import.meta.url,
    )))
      .filter(path => path !== candidateModule)
      .flatMap(path => {
        const source = readFileSync(path, 'utf8');
        return forbiddenTokens
          .filter(token => source.includes(token))
          .map(token => ({ path, token }));
      });
    expect(consumers).toEqual([]);
  });
});

function independentDomainDigest(value: unknown, domain: string): string {
  return createHash('sha256')
    .update(domain, 'ascii')
    .update('\0', 'ascii')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
}

function collectProductionTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectProductionTypeScriptFiles(path);
    }
    if (
      entry.isFile()
      && entry.name.endsWith('.ts')
      && !entry.name.endsWith('.test.ts')
      && !entry.name.endsWith('.spec.ts')
      && !entry.name.endsWith('.d.ts')
    ) {
      return [path];
    }
    return [];
  });
}

function buildTrackerRequest(
  trackerGenesisInputBoxIdHex: string,
  profileInput = vector.input.profile,
): Readonly<SubstrateFederatedTrackerCompilerRequestV1> {
  const statement = vector.input.statement;
  return buildSubstrateFederatedTrackerCompilerRequestV1({
    template: {
      relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
      source: trackerTemplate,
    },
    trackerGenesisInputBoxIdHex,
    profile: buildSubstrateFederatedCheckpointProfileV1(profileInput),
    application: {
      sourceNetworkIdHex: statement.sourceNetworkIdHex,
      sidechainIdHex: statement.sidechainIdHex,
      bridgeAddressHex: statement.bridgeAddressHex,
      tokenAddressHex: statement.tokenAddressHex,
      bridgeRuntimeCodeSha256Hex: statement.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: statement.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex: statement.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes: statement.tokenRuntimeCodeBytes,
      sourceRuntimeCodeSha256Hex: statement.sourceRuntimeCodeSha256Hex,
      sourceRuntimeCodeBytes: statement.sourceRuntimeCodeBytes,
      runtimeProfileIdHex: statement.runtimeProfileIdHex,
      settlementProfileIdHex: statement.settlementProfileIdHex,
    },
  });
}

function familyTemplates(): CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input[
  'templates'
] {
  return {
    duplicatePrevention: contractTemplate(
      'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
    ),
    sourceLock: contractTemplate('contracts/MainChainLockPooledReserveV6.es'),
    pooledReserve: contractTemplate(
      'contracts/MainChainPooledReserveValidityApplicationV6.es',
    ),
  };
}

function contractTemplate(relativePath: string): SubstrateFederatedSettlementFamilyV1Template {
  return {
    relativePath,
    source: readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8'),
  };
}

async function genesisFixture(
  values: readonly [string, string, string] = [
    '50000000',
    '100000000',
    '150000000',
  ],
): Promise<GenesisFixture> {
  const materialized = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: values.map(stateSeed),
  }, 'federated provisioning genesis fixture');
  const [tracker, duplicatePrevention, pooledReserve] = materialized.outputs;
  const sigmaByBoxId = new Map<string, string>();
  for (const box of materialized.outputs) {
    sigmaByBoxId.set(box.boxId, await sigmaBytes(box));
  }
  return { tracker, duplicatePrevention, pooledReserve, sigmaByBoxId };
}

async function compileProvisioningInput(
  fixture: GenesisFixture,
  observed: ObservationPair,
  templates: CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input[
    'templates'
  ],
  generationManifest: Readonly<SubstrateFederatedCutoverGenerationV1Manifest>,
): Promise<BuildSubstrateFederatedGenesisProvisioningV1Input> {
  const trackerRequest = buildTrackerRequest(fixture.tracker.boxId);
  const trackerReceipt =
    await compileSubstrateFederatedTrackerWithPinnedJvmV1(trackerRequest);
  const familyReceipt =
    await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
      trackerRequest,
      trackerReceipt,
      templates,
      duplicatePreventionGenesisInputBoxIdHex:
        fixture.duplicatePrevention.boxId,
      pooledReserveGenesisInputBoxIdHex: fixture.pooledReserve.boxId,
    });
  return {
    targetProfile: observed.targetProfile,
    observation: observed.observation,
    trackerRequest,
    trackerReceipt,
    familyTemplates: templates,
    familyReceipt,
    generationManifest,
  };
}

function stateSeed(value: string) {
  return {
    value,
    ergoTree: FUNDING_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: 110,
  };
}

async function sigmaBytes(box: Eip12Box): Promise<string> {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
  try {
    return Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
  } finally {
    parsed.free?.();
  }
}

async function observeFixture(
  fixture: GenesisFixture,
  roles: Readonly<{
    tracker: Eip12Box;
    duplicatePrevention: Eip12Box;
    pooledReserve: Eip12Box;
  }> = fixture,
  profileIdHex = '10'.repeat(32),
): Promise<ObservationPair> {
  const primary = nodeServer(fixture);
  const witness = nodeServer(fixture);
  const [primaryOrigin, witnessOrigin] = await Promise.all([
    listen(primary),
    listen(witness),
  ]);
  try {
    const targetProfile = buildSubstrateFederatedGenesisTargetProfileV1({
      profileIdHex,
      environment: 'testnet',
      expectedNetwork: 'testnet',
      expectedGenesisHeaderIdHex: GENESIS_HEADER_ID,
      primaryNodeOrigin: primaryOrigin,
      primaryNodeIdentityDigestHex: '11'.repeat(32),
      primaryAdministrationIdentityDigestHex: '12'.repeat(32),
      witnessNodeOrigin: witnessOrigin,
      witnessNodeIdentityDigestHex: '13'.repeat(32),
      witnessAdministrationIdentityDigestHex: '14'.repeat(32),
      trackerGenesisBoxIdHex: roles.tracker.boxId,
      duplicatePreventionGenesisBoxIdHex: roles.duplicatePrevention.boxId,
      pooledReserveGenesisBoxIdHex: roles.pooledReserve.boxId,
    });
    const observation = await observeSubstrateFederatedGenesisV1(
      targetProfile,
      { now: () => new Date(OBSERVED_AT) },
    );
    assertSubstrateFederatedGenesisObservationV1Provenance(
      targetProfile,
      observation,
    );
    return { targetProfile, observation };
  } finally {
    await Promise.all([close(primary), close(witness)]);
  }
}

function nodeServer(fixture: GenesisFixture): Server {
  const boxes = new Map([
    [fixture.tracker.boxId, fixture.tracker],
    [fixture.duplicatePrevention.boxId, fixture.duplicatePrevention],
    [fixture.pooledReserve.boxId, fixture.pooledReserve],
  ]);
  return createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (path === '/info') {
      return sendJson(response, 200, { network: 'testnet', fullHeight: 120 });
    }
    if (path === '/blocks/lastHeaders/1') {
      return sendJson(response, 200, [{ id: TIP_HEADER_ID, height: 120 }]);
    }
    if (path === '/blocks/at/1') {
      return sendJson(response, 200, [GENESIS_HEADER_ID]);
    }
    const binary = path.match(/^\/utxo\/byIdBinary\/([0-9a-f]{64})$/);
    if (binary) {
      const bytes = fixture.sigmaByBoxId.get(binary[1]!);
      return sendJson(response, bytes === undefined ? 404 : 200, { bytes });
    }
    const json = path.match(/^\/utxo\/byId\/([0-9a-f]{64})$/);
    if (json) {
      const box = boxes.get(json[1]!);
      return sendJson(response, box === undefined ? 404 : 200, box ?? {});
    }
    return sendJson(response, 404, {});
  });
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

function generationFixture(): Readonly<SubstrateFederatedCutoverGenerationV1Manifest> {
  assertSubstrateFederatedTrackerContractV1Identity(trackerContract);
  const replayDigest = getDupTreeDigest([REPLAY_BURN_ID]);
  const replayPacketDigest = hash('historical-replay-packet');
  const cutoverObservationDigest = hash('cutover-observation');
  const routes = VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
    .map(requirement => {
      const inventoryDigest = hash(`inventory-${requirement.routeId}`);
      const instances = requirement.routeId === REPLAY_ROUTE_ID
        ? [{
          instanceId: REPLAY_INSTANCE_ID,
          address: 'test-address',
          ergoTreeSha256Hex: hash('replay-tree'),
          singletonTokenIdHex: hash('replay-singleton'),
          genesisBoxIdHex: hash('replay-genesis'),
          inventoryClassification: 'drained',
          inventoryEvidenceDigestHex: hash('replay-inventory-evidence'),
        }]
        : [];
      return {
        ...requirement,
        inventory: {
          source: requirement.layer === 'ergo'
            ? 'ergo-cutover-observation'
            : 'frontier-relayer-compatibility-inventory',
          bindingDigestHex: inventoryDigest,
          sanitizedBindingDigestHex: hash(`sanitized-${requirement.routeId}`),
          instances,
          blockerCodes: [],
        },
        declaration: {
          declaredStatus: 'inactive-unverified',
          inventoryEvidenceDigestHex: inventoryDigest,
          retirementEvidenceDigestHex: hash(`retirement-${requirement.routeId}`),
        },
        retirement: { evidenceAuthenticated: false, routeRetired: false },
      };
    });
  const cutoverReview = {
    schema: 'e2s.validity-application-pooled-reserve-testnet-cutover-review-profile.v4',
    version: 4,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS,
    profileDigestHex: hash('cutover-review-profile'),
    scope: {
      settlementNetworkId: 'ergo-testnet',
      sourceNetworkScope: 'public-testnet',
      sourceChainId: '7777',
      sourceOriginIdentifiersIncluded: false,
      rawObservationObjectsIncluded: false,
    },
    components: {
      historicalReplayGenesisPacketDigestHex: replayPacketDigest,
      compatibilityInventoryPacketDigestHex: hash('compatibility-inventory'),
      ergoCutoverObservationReportDigestHex: cutoverObservationDigest,
    },
    application: {
      lineageProfileIdHex: SOURCE_LINEAGE_ID,
      runtimeProfileIdHex: trackerContract.application.runtimeProfileIdHex,
      contractIds: {
        tracker: hash('legacy-tracker'),
        duplicatePrevention: hash('legacy-dup'),
        sourceLock: hash('legacy-source-lock'),
        pooledReserve: hash('legacy-reserve'),
      },
    },
    deployment: {
      bridgeAddress: `0x${trackerContract.application.bridgeAddressHex}`,
      tokenAddress: `0x${trackerContract.application.tokenAddressHex}`,
      bridgeRuntimeCodeSha256Hex:
        trackerContract.application.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: trackerContract.application.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex:
        trackerContract.application.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes: trackerContract.application.tokenRuntimeCodeBytes,
    },
    replay: {
      routeProfileDigestHex: hash('route-profile'),
      routeRequirementsDigestHex: hash('route-requirements'),
      historicalLineageCount: 1,
      importedCanonicalBurnIdCount: 1,
      lineageSetDigestHex: hash('lineage-set'),
      duplicatePreventionGenesisDigestHex: replayDigest,
      allObservedLineagesComposed: true,
      inventoryExhaustivenessAuthenticated: false,
      lineages: [{
        routeId: REPLAY_ROUTE_ID,
        instanceId: REPLAY_INSTANCE_ID,
        lineagePacketDigestHex: hash('replay-lineage-packet'),
        lineageClassification: 'raw-reconstructed',
        rawReplayKeyCount: 1,
        contributionKind: 'authenticated-v2-replay-import',
        eventMapping: 'event-complete-mapping-bound',
        sourceAdmission: 'source-admission-bound',
        replayImportPacketDigestHex: hash('replay-import'),
        canonicalBurnIdCount: 1,
        canonicalBurnIdsDigestHex: hash('canonical-burn-set'),
      }],
    },
    routes,
    blockers: ['cutover-review-remains-non-authorizing'],
    authority: allFalse([
      'activationParentAuthenticated',
      'sourceAdmissionActivated',
      'legacyRouteInventoryAuthenticated',
      'legacyRoutesRetired',
      'profileActivated',
      'targetNodeAcceptanceEstablished',
      'mintAuthorized',
      'payoutAuthorized',
      'signingAuthorized',
      'submissionAuthorized',
      'broadcastAuthorized',
      'fundsAuthorityEstablished',
      'gate5Closed',
      'trustlessStatusEstablished',
      'productionReadinessEstablished',
    ]),
  };
  const historicalReplayGenesis = {
    schema: 'e2s.validity-application-pooled-reserve-historical-replay-genesis.v4',
    version: 4,
    packetDigestHex: replayPacketDigest,
    lineage: {
      lineageProfileIdHex: `0x${SOURCE_LINEAGE_ID}`,
      encodedLineageProfileHex: `0x${'42'.repeat(64)}`,
    },
    observation: {
      cutoverObservationReportDigestHex: cutoverObservationDigest,
      routeProfileDigestHex: hash('route-profile'),
      requirementsDigestHex: hash('route-requirements'),
      networkId: 'ergo-testnet',
      stableSnapshot: {},
      sourceIdDigestsHex: [hash('source-a'), hash('source-b')],
    },
    contributions: [{
      kind: 'authenticated-v2-replay-import',
      routeId: REPLAY_ROUTE_ID,
      sourceSurface: 'contracts/DoubleUnlockPreventionAuthenticated.es',
      instanceId: REPLAY_INSTANCE_ID,
      lineagePacketDigestHex: hash('replay-lineage-packet'),
      lineageClassification: 'raw-reconstructed',
      rawReplayKeyCount: 1,
      replayImportPacketDigestHex: hash('replay-import'),
      canonicalBurnIdsHex: [REPLAY_BURN_ID],
    }],
    duplicatePreventionGenesis: {
      canonicalBurnIdsHex: [REPLAY_BURN_ID],
      digestHex: replayDigest,
      registers: {
        R4: encodeCollByteRegister(Buffer.from(SOURCE_LINEAGE_ID, 'hex')),
        R5: encodeAvlTreeRegister(
          Buffer.from(replayDigest, 'hex'),
          VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
          1,
        ),
      },
    },
    boundaries: {
      cutoverObservationValidatedInProcess: true,
      exactContributionPerObservedLineage: true,
      deterministicInsertOnlyGenesisBuilt: true,
      allObservedHistoricalLineagesComposed: true,
      profileInstanceInventoryExhaustiveAuthenticated: false,
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
    },
  };
  provenance.reviews.add(cutoverReview);
  provenance.replayPackets.add(historicalReplayGenesis);
  return buildSubstrateFederatedCutoverGenerationV1({
    familyIdentity: getSubstrateFederatedSettlementFamilyV1FixtureIdentity(),
    trackerContract,
    cutoverReview: cutoverReview as any,
    historicalReplayGenesis: historicalReplayGenesis as any,
  });
}

function allFalse(keys: readonly string[]): Record<string, false> {
  return Object.fromEntries(keys.map(key => [key, false]));
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
