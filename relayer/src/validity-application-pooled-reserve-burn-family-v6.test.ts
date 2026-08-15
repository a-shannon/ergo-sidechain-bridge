import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixture,
  buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixtureInput,
} from './validity-application-pooled-reserve-burn-family-v6-fixture.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V6_COMPILER_BATCH_SHA256_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V6_COMPILER_REQUEST_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V6_CONTRACT_IDS,
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V6_IDENTITY_SCHEMA,
  buildValidityApplicationPooledReserveBurnFamilyV6CompilerRequest,
  validateValidityApplicationPooledReserveBurnFamilyV6CompilerBatch,
} from './validity-application-pooled-reserve-burn-family-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
} from './validity-application-pooled-reserve-instance-v4.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const FIXTURE_PATH = resolve(
  BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'validity-application-pooled-reserve-burn-family-compiler-request-v6.json',
);
const EXPECTED_FIXTURE_SHA256 =
  '3c3fd5ce0d671f46a4d8bdcd80db646aa5ed163c80dabdcca36762fb38b12ba3';
const EXPECTED_PROFILE_ID =
  'b689cdd0c68396828a66fd72f2677019d009ecc2b8bf96a755ca3ccf0a8a18e1';
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
  'validity-application-pooled-reserve-compiler-v6.json',
);

describe('validity application pooled-reserve burn family V6', () => {
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
      await buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixture();
    const generated = Buffer.from(`${JSON.stringify(request, null, 2)}\n`, 'ascii');

    expect(createHash('sha256').update(raw).digest('hex'))
      .toBe(EXPECTED_FIXTURE_SHA256);
    expect(generated.equals(raw)).toBe(true);
    expect(request.schema)
      .toBe(
        VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V6_COMPILER_REQUEST_SCHEMA,
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
        'contracts/SPVTrackerPooledReserveBurnSettlementV6.es',
        'contracts/DoubleUnlockPreventionPooledReserveV6.es',
        'contracts/MainChainLockPooledReserveV6.es',
        'contracts/MainChainPooledReserveValidityApplicationV6.es',
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

  it('makes the exact DUP the sole V5 burn-proof consumer', () => {
    const dup = readFileSync(
      resolve(BRIDGE_ROOT, 'contracts',
        'DoubleUnlockPreventionPooledReserveV6.es'),
      'utf8',
    );
    const reserve = readFileSync(
      resolve(BRIDGE_ROOT, 'contracts',
        'MainChainPooledReserveValidityApplicationV6.es'),
      'utf8',
    );

    expect(dup).toContain('E2S_SPV_VALIDITY_APPLICATION_KEY_V5');
    expect(dup).toContain('E2S_SPV_VALIDITY_APPLICATION_VALUE_V5');
    expect(dup).toContain('trackerValue(38) == 5.toByte');
    expect(dup).toContain('val encodedLeaf = getVar[Coll[Byte]](2).get');
    expect(dup).toContain('val trackerValueOpt = trackerTree.get(');
    expect(reserve).not.toContain('E2S_SPV_VALIDITY_APPLICATION_KEY_V5');
    expect(reserve).not.toContain('E2S_SPV_VALIDITY_APPLICATION_VALUE_V5');
    expect(reserve).not.toContain('val encodedLeaf = getVar');
    expect(reserve).not.toContain('val trackerTree =');
    expect(reserve).not.toContain('trackerTree.get(');
    expect(reserve).toContain('val payoutAmount = payoutOut.value');
    expect(reserve).toContain('E2S_PEG_IN_DEPOSIT_COMMITMENT_V4');
    expect(reserve.match(/getVar\[/g)).toHaveLength(1);
  });

  it('recomputes the exact four-contract JVM identity cascade', async () => {
    const compilerBatchJson = readFileSync(COMPILER_BATCH_PATH, 'utf8');
    const request =
      await buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixture();
    const identity =
      validateValidityApplicationPooledReserveBurnFamilyV6CompilerBatch({
        request,
        compilerBatchJson,
      });

    expect(createHash('sha256')
      .update(Buffer.from(compilerBatchJson, 'ascii')).digest('hex'))
      .toBe(
        VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V6_COMPILER_BATCH_SHA256_HEX,
      );
    expect(identity.schema)
      .toBe(VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V6_IDENTITY_SCHEMA);
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
    ))).toEqual(VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V6_CONTRACT_IDS);
    expect(identity.relations).toEqual({
      sourceRuntimeBoundIntoTracker: true,
      trackerBoundIntoDuplicatePrevention: true,
      trackerBoundIntoPooledReserveViaDuplicatePrevention: true,
      duplicatePreventionBoundIntoPooledReserve: true,
      sourceLockBoundIntoPooledReserve: true,
      applicationBindingBoundIntoPooledReserveViaDuplicatePrevention: true,
    });
    expect(Object.values(identity.boundaries).every(value => value === false))
      .toBe(true);
    expect(Object.isFrozen(identity.contracts.pooledReserve.receipt)).toBe(true);
  });

  it('rejects a V5-derived runtime profile in place of the exact V4 source runtime', async () => {
    const input =
      await buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixtureInput();
    const bytes = Buffer.from(input.sourceRuntimeProfileScaleHex.slice(2), 'hex');
    bytes.set(Buffer.from(EXPECTED_PROOF_PROFILE_ID, 'hex'), 305);

    await expect(
      buildValidityApplicationPooledReserveBurnFamilyV6CompilerRequest({
        ...input,
        sourceRuntimeProfileScaleHex: `0x${bytes.toString('hex')}`,
      }),
    ).rejects.toThrow(/exact compatible V4 source runtime profile/);
  });

  it('rejects decoded requests and any compiler-batch byte drift', async () => {
    const compilerBatchJson = readFileSync(COMPILER_BATCH_PATH, 'utf8');
    const request =
      await buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixture();

    expect(() =>
      validateValidityApplicationPooledReserveBurnFamilyV6CompilerBatch({
        request: structuredClone(request),
        compilerBatchJson,
      })
    ).toThrow(/derived in this process/);
    expect(() =>
      validateValidityApplicationPooledReserveBurnFamilyV6CompilerBatch({
        request,
        compilerBatchJson: compilerBatchJson.replace(
          VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V6_CONTRACT_IDS
            .pooledReserve,
          '00'.repeat(32),
        ),
      })
    ).toThrow(/SHA-256 is not reviewed/);
    expect(() =>
      validateValidityApplicationPooledReserveBurnFamilyV6CompilerBatch({
        request,
        compilerBatchJson: compilerBatchJson.replaceAll('\n', '\r\n'),
      })
    ).toThrow(/LF-only ASCII/);
  });
});
