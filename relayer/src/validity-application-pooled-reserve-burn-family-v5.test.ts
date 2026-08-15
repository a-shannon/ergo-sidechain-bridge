import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixture,
  buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixtureInput,
} from './validity-application-pooled-reserve-burn-family-v5-fixture.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_COMPILER_BATCH_SHA256_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_COMPILER_REQUEST_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS,
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_IDENTITY_SCHEMA,
  buildValidityApplicationPooledReserveBurnFamilyV5CompilerRequest,
  validateValidityApplicationPooledReserveBurnFamilyV5CompilerBatch,
} from './validity-application-pooled-reserve-burn-family-v5.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
} from './validity-application-pooled-reserve-instance-v4.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const FIXTURE_PATH = resolve(
  BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'validity-application-pooled-reserve-burn-family-compiler-request-v5.json',
);
const EXPECTED_FIXTURE_SHA256 =
  'fed2f9fbc77e4f9913c9232e040a06c018e3a2a6abce4377f2d36e855c52f795';
const EXPECTED_PROFILE_ID =
  'ffba97e5ce0b2a467b7b18dde382ce2a6c4fff7448804f793641fd9955c74dd2';
const EXPECTED_PROOF_PROFILE_ID =
  'c0d3605293a64f01656d4eafe3f1d24e28db7d94dc0aaf7c82849c3779be5833';
const EXPECTED_SOURCE_RUNTIME_PROFILE_ID =
  '881b1501f629edbec0ccfe9723952ede9b52786672be60d7c929376d9759b394';
const EXPECTED_SOURCE_RUNTIME_LINEAGE_PROFILE_ID =
  'f0cd15e335996211353a2eb895b5bbdeaf7a5de4f10ec0f547a8f6e505a522f9';
const STANDALONE_TRACKER_SOURCE_SHA256 =
  'db88ddcacaf01d92d13daa8ac96f234ab6720fceefbf0018e671f41eb26a1d16';
const STANDALONE_TRACKER_CONTRACT_ID =
  '008a6dfbcadae28b4383ff35b0d333a163dfe54b925e565844ae128331abb7a0';
const COMPILER_BATCH_PATH = resolve(
  BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'validity-application-pooled-reserve-compiler-v5.json',
);

describe('validity application pooled-reserve burn family V5', () => {
  it('preserves the frozen standalone V5 tracker source and proposition identity', () => {
    const source = readFileSync(
      resolve(BRIDGE_ROOT, 'contracts', 'SPVTrackerPooledReserveBurnV5.es'),
    );
    const vector = JSON.parse(readFileSync(resolve(
      BRIDGE_ROOT,
      'relayer',
      'test-vectors',
      'pooled-reserve-burn-tracker-contract-v5.json',
    ), 'utf8')) as {
      readonly templateSourceSha256Hex: string;
      readonly propositionBytes: number;
      readonly propositionHex: string;
      readonly contractIdHex: string;
    };
    const proposition = Buffer.from(vector.propositionHex, 'hex');

    expect(createHash('sha256').update(source).digest('hex'))
      .toBe(STANDALONE_TRACKER_SOURCE_SHA256);
    expect(vector.templateSourceSha256Hex)
      .toBe(STANDALONE_TRACKER_SOURCE_SHA256);
    expect(proposition).toHaveLength(2943);
    expect(vector.propositionBytes).toBe(2943);
    expect(Buffer.from(blakejs.blake2b(proposition, undefined, 32)).toString('hex'))
      .toBe(STANDALONE_TRACKER_CONTRACT_ID);
    expect(vector.contractIdHex).toBe(STANDALONE_TRACKER_CONTRACT_ID);
  });

  it('reproduces the exact compiler request from the four canonical templates', async () => {
    const raw = readFileSync(FIXTURE_PATH);
    const request =
      await buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixture();
    const generated = Buffer.from(`${JSON.stringify(request, null, 2)}\n`, 'ascii');

    expect(createHash('sha256').update(raw).digest('hex'))
      .toBe(EXPECTED_FIXTURE_SHA256);
    expect(generated.equals(raw)).toBe(true);
    expect(request.schema)
      .toBe(
        VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_COMPILER_REQUEST_SCHEMA,
      );
    expect(request.lineage.profileIdHex).toBe(EXPECTED_PROFILE_ID);
    expect(request.policies.proofProfileIdHex)
      .toBe(EXPECTED_PROOF_PROFILE_ID);
    expect(request.sourceRuntime.profileIdHex)
      .toBe(EXPECTED_SOURCE_RUNTIME_PROFILE_ID);
    expect(request.sourceRuntime.lineageProfileIdHex)
      .toBe(EXPECTED_SOURCE_RUNTIME_LINEAGE_PROFILE_ID);
    expect(request.sourceRuntime.proofProfileIdHex)
      .toBe(VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX.slice(2));
    expect(request.lineage.profileIdHex)
      .not.toBe(request.sourceRuntime.lineageProfileIdHex);
    expect(request.bindings.applicationBindingPrefixHex).toHaveLength(900);
    expect(request.bindings.applicationBindingPrefixHex.slice(0, 2))
      .toBe('05');
    expect(request.bindings.applicationBindingPrefixHex.slice(2, 700))
      .toBe(request.sourceRuntime.profileScaleHex);
    expect(request.contracts.map(contract => contract.relativePath))
      .toEqual([
        'contracts/SPVTrackerPooledReserveBurnSettlementV5.es',
        'contracts/DoubleUnlockPreventionPooledReserveV5.es',
        'contracts/MainChainLockPooledReserveV5.es',
        'contracts/MainChainPooledReserveValidityApplicationV5.es',
      ]);
    expect(request.boundaries).toEqual({
      contractsCompiled: false,
      profileActivated: false,
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });
  });

  it('keeps unchanged deposit semantics separate from the V5 tracker domains', () => {
    const dup = readFileSync(
      resolve(BRIDGE_ROOT, 'contracts',
        'DoubleUnlockPreventionPooledReserveV5.es'),
      'utf8',
    );
    const reserve = readFileSync(
      resolve(BRIDGE_ROOT, 'contracts',
        'MainChainPooledReserveValidityApplicationV5.es'),
      'utf8',
    );

    expect(dup).toContain('E2S_SPV_VALIDITY_APPLICATION_KEY_V5');
    expect(dup).toContain('E2S_SPV_VALIDITY_APPLICATION_VALUE_V5');
    expect(dup).toContain('trackerValue(38) == 5.toByte');
    expect(reserve).toContain('E2S_SPV_VALIDITY_APPLICATION_KEY_V5');
    expect(reserve).toContain('E2S_SPV_VALIDITY_APPLICATION_VALUE_V5');
    expect(reserve).toContain('trackerValue(38) == 5.toByte');
    expect(reserve).toContain('E2S_PEG_IN_DEPOSIT_COMMITMENT_V4');
  });

  it('recomputes the exact four-contract JVM identity cascade', async () => {
    const compilerBatchJson = readFileSync(COMPILER_BATCH_PATH, 'utf8');
    const request =
      await buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixture();
    const identity =
      validateValidityApplicationPooledReserveBurnFamilyV5CompilerBatch({
        request,
        compilerBatchJson,
      });

    expect(createHash('sha256')
      .update(Buffer.from(compilerBatchJson, 'ascii')).digest('hex'))
      .toBe(
        VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_COMPILER_BATCH_SHA256_HEX,
      );
    expect(identity.schema)
      .toBe(VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_IDENTITY_SCHEMA);
    expect(identity.lineageProfileIdHex).toBe(EXPECTED_PROFILE_ID);
    expect(identity.sourceRuntimeProfileIdHex)
      .toBe(EXPECTED_SOURCE_RUNTIME_PROFILE_ID);
    expect(identity.sourceRuntimeLineageProfileIdHex)
      .toBe(EXPECTED_SOURCE_RUNTIME_LINEAGE_PROFILE_ID);
    expect(identity.proofProfileIdHex).toBe(EXPECTED_PROOF_PROFILE_ID);
    expect(identity.applicationBindingHex.slice(0, 900))
      .toBe(request.bindings.applicationBindingPrefixHex);
    expect(identity.applicationBindingHex).toHaveLength(972);
    expect(Object.fromEntries(Object.entries(identity.contracts).map(
      ([role, contract]) => [role, contract.receipt.contractIdHex],
    ))).toEqual(VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS);
    expect(identity.relations).toEqual({
      sourceRuntimeBoundIntoTracker: true,
      trackerBoundIntoDuplicatePrevention: true,
      trackerBoundIntoPooledReserve: true,
      duplicatePreventionBoundIntoPooledReserve: true,
      sourceLockBoundIntoPooledReserve: true,
      applicationBindingBoundIntoPooledReserve: true,
    });
    expect(Object.values(identity.boundaries).every(value => value === false))
      .toBe(true);
    expect(Object.isFrozen(identity.contracts.pooledReserve.receipt)).toBe(true);
  });

  it('rejects a V5-derived runtime profile in place of the exact V4 source runtime', async () => {
    const input =
      await buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixtureInput();
    const bytes = Buffer.from(input.sourceRuntimeProfileScaleHex.slice(2), 'hex');
    bytes.set(Buffer.from(EXPECTED_PROOF_PROFILE_ID, 'hex'), 305);

    await expect(
      buildValidityApplicationPooledReserveBurnFamilyV5CompilerRequest({
        ...input,
        sourceRuntimeProfileScaleHex: `0x${bytes.toString('hex')}`,
      }),
    ).rejects.toThrow(/exact compatible V4 source runtime profile/);
  });

  it('rejects decoded requests and any compiler-batch byte drift', async () => {
    const compilerBatchJson = readFileSync(COMPILER_BATCH_PATH, 'utf8');
    const request =
      await buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixture();

    expect(() =>
      validateValidityApplicationPooledReserveBurnFamilyV5CompilerBatch({
        request: structuredClone(request),
        compilerBatchJson,
      })
    ).toThrow(/derived in this process/);
    expect(() =>
      validateValidityApplicationPooledReserveBurnFamilyV5CompilerBatch({
        request,
        compilerBatchJson: compilerBatchJson.replace(
          VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS
            .pooledReserve,
          '00'.repeat(32),
        ),
      })
    ).toThrow(/SHA-256 is not reviewed/);
    expect(() =>
      validateValidityApplicationPooledReserveBurnFamilyV5CompilerBatch({
        request,
        compilerBatchJson: compilerBatchJson.replaceAll('\n', '\r\n'),
      })
    ).toThrow(/LF-only ASCII/);
  });
});
