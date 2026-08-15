import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  assertContextExtensionSafe,
} from './context-extension-guard.js';
import {
  decodeEip0045PooledReserveBurnStatementV5,
  encodePooledReserveBurnApplicationBindingV5,
  POOLED_RESERVE_BURN_PUBLIC_INPUTS_V5_BYTES,
} from './pooled-reserve-burn-statement-v5.js';
import {
  buildPooledReserveBurnTrackerV5AcceptanceFixture,
} from './pooled-reserve-burn-tracker-v5-fixture.js';
import {
  buildPooledReserveBurnTrackerV5Context,
  POOLED_RESERVE_BURN_TRACKER_V5_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V5_VALUE_BYTES,
  POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX,
  type BuildPooledReserveBurnTrackerV5Input,
  type PooledReserveBurnTrackerContractV5Identity,
} from './pooled-reserve-burn-tracker-v5.js';
import {
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  type BridgeCheckpointV1,
} from './bridge-checkpoint-commitment.js';

interface GoldenVector {
  readonly input: {
    readonly runtimeProfile: PooledReserveMintReservationRuntimeProfileV4;
    readonly checkpoint: BridgeCheckpointV1;
    readonly sourceRuntimeCodeSha256Hex: string;
    readonly sourceRuntimeCodeBytes: number;
    readonly trackerNftIdHex: string;
    readonly targetNativeStateRootHex: string;
    readonly trustedAnchorDigestHex: string;
    readonly finalityHorizonHeight: string;
    readonly finalityHorizonHashHex: string;
    readonly chainDomainIdHex: string;
  };
  readonly expected: {
    readonly runtimeProfileScaleHex: string;
  };
}

const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/pooled-reserve-burn-statement-v5.json',
  import.meta.url,
), 'utf8')) as GoldenVector;
const contract = JSON.parse(readFileSync(new URL(
  '../test-vectors/pooled-reserve-burn-tracker-contract-v5.json',
  import.meta.url,
), 'utf8')) as PooledReserveBurnTrackerContractV5Identity;

function input(
  overrides: Partial<BuildPooledReserveBurnTrackerV5Input> = {},
): BuildPooledReserveBurnTrackerV5Input {
  return {
    contract,
    runtimeProfileScaleHex: vector.expected.runtimeProfileScaleHex,
    sourceRuntimeCodeSha256Hex: vector.input.sourceRuntimeCodeSha256Hex,
    sourceRuntimeCodeBytes: vector.input.sourceRuntimeCodeBytes,
    trackerNftIdHex: vector.input.trackerNftIdHex,
    checkpoint: vector.input.checkpoint,
    targetNativeStateRootHex: vector.input.targetNativeStateRootHex,
    trustedAnchorDigestHex: vector.input.trustedAnchorDigestHex,
    finalityHorizonHeight: vector.input.finalityHorizonHeight,
    finalityHorizonHashHex: vector.input.finalityHorizonHashHex,
    chainDomainIdHex: vector.input.chainDomainIdHex,
    currentErgoHeight: 1_000,
    anchorContextIndex: 2,
    proofChunksHex: ['01', '0203'],
    ...overrides,
  };
}

describe('pooled-reserve burn tracker V5 consumer context', () => {
  it('binds the exact V5 program, compiler identity, 1,140-byte statement, and AVL successor', async () => {
    const fixture = await buildPooledReserveBurnTrackerV5AcceptanceFixture();
    const statement = decodeEip0045PooledReserveBurnStatementV5(
      fixture.statement.encodedHex,
    );

    expect(fixture.contract.contractIdHex).toBe(
      '008a6dfbcadae28b4383ff35b0d333a163dfe54b925e565844ae128331abb7a0',
    );
    expect(fixture.contract.propositionBytes).toBe(2_943);
    expect(fixture.statement.encodedHex.length / 2).toBe(1_140);
    expect(statement.programIdHex).toBe(
      POOLED_RESERVE_BURN_TRACKER_V5_PROGRAM_ID_HEX,
    );
    expect(statement.profileIdHex).toBe(
      POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX,
    );
    expect(statement.contractIdHex).toBe(fixture.contract.contractIdHex);
    expect(statement.publicInputs.application.settlementTrackerContractIdHex)
      .toBe(fixture.contract.contractIdHex);
    expect(statement.publicInputs.encodedPublicInputsHex.length / 2)
      .toBe(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V5_BYTES);
    expect(fixture.trackerTransition.trackerValueHex.length / 2)
      .toBe(POOLED_RESERVE_BURN_TRACKER_V5_VALUE_BYTES);
    expect(fixture.trackerTransition.inputDigestHex)
      .not.toBe(fixture.trackerTransition.successorDigestHex);
    expect(fixture.contextExtension.keys).toEqual([0, 1, 2, 3]);
    expect(fixture.contextExtension.proofChunksHex).toEqual(['01', '0203']);
    expect(fixture.inputBoxSigmaHex.length).toBeGreaterThan(0);
    expect(fixture.prooflessTransactionBytes).toBeLessThan(262_144);
    expect(fixture.boundaries).toEqual({
      frozenContractIdentityBound: true,
      statementCodecValidated: true,
      selfContractBindingValidated: true,
      exactContextExtensionRoundTrip: true,
      avlTransitionConstructed: true,
      profileActivated: false,
      nodeCheckPerformed: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });
  });

  it('is deterministic for the exact compiler identity and fixture inputs', async () => {
    const first = await buildPooledReserveBurnTrackerV5Context(input());
    const second = await buildPooledReserveBurnTrackerV5Context(input());
    expect(second).toEqual(first);
  });

  it('rejects compiler receipt, proposition, binding-prefix, and V2-program substitutions', async () => {
    const wrongCompilerCommit = {
      ...contract,
      sigmaStateCommit: 'aa'.repeat(20),
    } as PooledReserveBurnTrackerContractV5Identity;
    await expect(buildPooledReserveBurnTrackerV5Context(input({
      contract: wrongCompilerCommit,
    }))).rejects.toThrow('contract identity is invalid');

    const wrongSourceReceipt = {
      ...contract,
      resolvedSourceSha256Hex: 'bb'.repeat(32),
    } as PooledReserveBurnTrackerContractV5Identity;
    await expect(buildPooledReserveBurnTrackerV5Context(input({
      contract: wrongSourceReceipt,
    }))).rejects.toThrow('contract identity is invalid');

    const wrongProposition = {
      ...contract,
      propositionHex: `${contract.propositionHex.slice(0, -2)}00`,
    } as PooledReserveBurnTrackerContractV5Identity;
    await expect(buildPooledReserveBurnTrackerV5Context(input({
      contract: wrongProposition,
    }))).rejects.toThrow('contract identity is invalid');

    const wrongContractId = {
      ...contract,
      contractIdHex: 'aa'.repeat(32),
    } as PooledReserveBurnTrackerContractV5Identity;
    await expect(buildPooledReserveBurnTrackerV5Context(input({
      contract: wrongContractId,
    }))).rejects.toThrow('contract identity is invalid');

    const wrongPrefix = {
      ...contract,
      applicationBindingPrefixHex:
        `${contract.applicationBindingPrefixHex.slice(0, -2)}00`,
    } as PooledReserveBurnTrackerContractV5Identity;
    await expect(buildPooledReserveBurnTrackerV5Context(input({
      contract: wrongPrefix,
    }))).rejects.toThrow('contract identity is invalid');

    const coordinatedTrackerNftIdHex = 'cc'.repeat(32);
    const coordinatedBinding = encodePooledReserveBurnApplicationBindingV5({
      runtimeProfileScaleHex: vector.expected.runtimeProfileScaleHex,
      sourceRuntimeCodeSha256Hex: vector.input.sourceRuntimeCodeSha256Hex,
      sourceRuntimeCodeBytes: vector.input.sourceRuntimeCodeBytes,
      trackerNftIdHex: coordinatedTrackerNftIdHex,
      settlementTrackerContractIdHex: contract.contractIdHex,
    });
    const coordinatedPrefix = {
      ...contract,
      applicationBindingPrefixHex:
        coordinatedBinding.subarray(0, 450).toString('hex'),
    } as PooledReserveBurnTrackerContractV5Identity;
    await expect(buildPooledReserveBurnTrackerV5Context(input({
      contract: coordinatedPrefix,
      trackerNftIdHex: coordinatedTrackerNftIdHex,
    }))).rejects.toThrow('contract identity is invalid');

    const v2Program = {
      ...contract,
      programIdHex:
        '230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c',
    } as unknown as PooledReserveBurnTrackerContractV5Identity;
    await expect(buildPooledReserveBurnTrackerV5Context(input({
      contract: v2Program,
    }))).rejects.toThrow('contract identity is invalid');

    const v4Program = {
      ...contract,
      programIdHex:
        'ad8ad97a4a060059e70e793fc10a311d1e16fbe05b7cdcbeb58aa597a60b3fe4',
    } as unknown as PooledReserveBurnTrackerContractV5Identity;
    await expect(buildPooledReserveBurnTrackerV5Context(input({
      contract: v4Program,
    }))).rejects.toThrow('contract identity is invalid');

    const unknownProfile = {
      ...contract,
      verifierProfileIdHex: 'bb'.repeat(32),
    } as unknown as PooledReserveBurnTrackerContractV5Identity;
    await expect(buildPooledReserveBurnTrackerV5Context(input({
      contract: unknownProfile,
    }))).rejects.toThrow('contract identity is invalid');
  });

  it('rejects a foreign chain domain and an empty proof transport', async () => {
    await expect(buildPooledReserveBurnTrackerV5Context(input({
      chainDomainIdHex: 'bb'.repeat(32),
    }))).rejects.toThrow('chain domain mismatch');
    await expect(buildPooledReserveBurnTrackerV5Context(input({
      proofChunksHex: [],
    }))).rejects.toThrow('proof chunks must be non-empty');
  });

  it('blocks an unknown fifth ContextExtension variable before signing', async () => {
    const fixture = await buildPooledReserveBurnTrackerV5AcceptanceFixture();
    const firstInput = fixture.eip12UnsignedTransaction.inputs as readonly {
      readonly boxId: string;
      readonly extension: Readonly<Record<string, string>>;
    }[];
    const withUnknownVariable = [{
      ...firstInput[0],
      extension: {
        ...firstInput[0].extension,
        '4': '0402',
      },
    }];

    expect(() => assertContextExtensionSafe(
      withUnknownVariable,
      'pooled-reserve burn tracker V5 ContextExtension',
      4,
    )).toThrow(/exceed the ContextExtension guard threshold of 4 Vars/i);
  });
});
