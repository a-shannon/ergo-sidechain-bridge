import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  decodeEip0045PooledReserveBurnStatementV4,
  encodePooledReserveBurnApplicationBindingV4,
  POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES,
} from './pooled-reserve-burn-statement-v4.js';
import {
  buildPooledReserveBurnTrackerV4AcceptanceFixture,
} from './pooled-reserve-burn-tracker-v4-fixture.js';
import {
  assertPooledReserveBurnTrackerV4ContextProvenance,
  buildCompiledPooledReserveBurnTrackerV4Context,
  buildPooledReserveBurnTrackerV4Context,
  POOLED_RESERVE_BURN_TRACKER_V4_KEY_DOMAIN,
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VALUE_BYTES,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
  type BuildPooledReserveBurnTrackerV4Input,
  type PooledReserveBurnTrackerContractV4Identity,
} from './pooled-reserve-burn-tracker-v4.js';
import {
  AUTHENTICATED_SPV_TRACKER_DOMAIN,
  deriveAuthenticatedSpvTrackerKey,
} from './profiles/substrate-grandpa-v1/spv-tracker-authenticated.js';
import {
  deriveValidityApplicationPooledReserveTrackerKeyV4Hex,
} from './validity-application-pooled-reserve-burn-settlement-v4.js';
import {
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  type BridgeCheckpointV1,
} from './bridge-checkpoint-commitment.js';
import {
  buildValidityApplicationPooledReserveV4CompiledFixtureInstance,
} from './validity-application-pooled-reserve-burn-settlement-v4-fixture.js';

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
  '../test-vectors/pooled-reserve-burn-statement-v4.json',
  import.meta.url,
), 'utf8')) as GoldenVector;
const contract = JSON.parse(readFileSync(new URL(
  '../test-vectors/pooled-reserve-burn-tracker-contract-v4.json',
  import.meta.url,
), 'utf8')) as PooledReserveBurnTrackerContractV4Identity;

function input(
  overrides: Partial<BuildPooledReserveBurnTrackerV4Input> = {},
): BuildPooledReserveBurnTrackerV4Input {
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

describe('pooled-reserve burn tracker V4 consumer context', () => {
  it('checks out every ErgoScript contract with canonical LF line endings', () => {
    const attributes = readFileSync(
      new URL('../../.gitattributes', import.meta.url),
      'utf8',
    ).replace(/\r\n/g, '\n');

    expect(attributes).toContain('contracts/*.es text eol=lf');
  });

  it('binds the corrected program, exact compiler identity, 980-byte payload, and AVL successor', async () => {
    const fixture = await buildPooledReserveBurnTrackerV4AcceptanceFixture();
    const statement = decodeEip0045PooledReserveBurnStatementV4(
      fixture.statement.encodedHex,
    );

    expect(fixture.contract.contractIdHex).toBe(
      'dff42d1bb808fc30e87011c493b5eef0bb257acc9c35940b112b14bf455e92cd',
    );
    expect(fixture.contract.propositionBytes).toBe(2_942);
    expect(statement.programIdHex).toBe(
      POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
    );
    expect(statement.profileIdHex).toBe(
      POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
    );
    expect(statement.contractIdHex).toBe(fixture.contract.contractIdHex);
    expect(statement.publicInputs.application.settlementTrackerContractIdHex)
      .toBe(fixture.contract.contractIdHex);
    expect(statement.publicInputs.encodedPublicInputsHex.length / 2)
      .toBe(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES);
    expect(fixture.trackerTransition.trackerValueHex.length / 2)
      .toBe(POOLED_RESERVE_BURN_TRACKER_V4_VALUE_BYTES);
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
    const first = await buildPooledReserveBurnTrackerV4Context(input());
    const second = await buildPooledReserveBurnTrackerV4Context(input());
    expect(second).toEqual(first);
  });

  it('accepts only same-process V4 tracker contexts as provenance', async () => {
    const fixture = await buildPooledReserveBurnTrackerV4AcceptanceFixture();

    expect(() => assertPooledReserveBurnTrackerV4ContextProvenance(fixture))
      .not.toThrow();
    expect(() => assertPooledReserveBurnTrackerV4ContextProvenance({
      ...fixture,
    })).toThrow('must be built in this process');
  });

  it('keeps the V2 native-admission and pooled-reserve V4 key domains disjoint', async () => {
    const fixture = await buildPooledReserveBurnTrackerV4AcceptanceFixture();
    const statement = decodeEip0045PooledReserveBurnStatementV4(
      fixture.statement.encodedHex,
    );
    const identity = {
      sidechainIdHex:
        statement.publicInputs.application.runtimeProfile.sidechainIdHex,
      sidechainHeight: statement.publicInputs.checkpoint.sidechainHeight,
      executionBlockHashHex:
        statement.publicInputs.checkpoint.executionBlockHashHex,
    };
    const v2KeyHex = deriveAuthenticatedSpvTrackerKey(identity);
    const v4KeyHex =
      deriveValidityApplicationPooledReserveTrackerKeyV4Hex(identity);

    expect(AUTHENTICATED_SPV_TRACKER_DOMAIN).toBe('E2S_SPV_V2');
    expect(POOLED_RESERVE_BURN_TRACKER_V4_KEY_DOMAIN)
      .toBe('E2S_SPV_VALIDITY_APPLICATION_KEY_V4');
    expect(fixture.trackerTransition.trackerKeyHex).toBe(v4KeyHex);
    expect(v2KeyHex).not.toBe(v4KeyHex);
  });

  it('derives an integrated tracker context from the exact compiled V4 instance', async () => {
    const compiled =
      await buildValidityApplicationPooledReserveV4CompiledFixtureInstance();
    const runtimeProfile =
      decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
        compiled.application.runtimeProfileScaleHex,
      );
    const checkpoint: BridgeCheckpointV1 = {
      version: 1,
      hashAlgorithmId: 1,
      finalityRuleId: 1,
      flags: 0,
      sidechainIdHex: runtimeProfile.sidechainIdHex.slice(2),
      sidechainHeight: '77',
      sidechainConsensusBlockHashHex: 'de'.repeat(32),
      executionBlockHashHex: 'ab'.repeat(32),
      bridgeEventRootHex: 'cd'.repeat(32),
      burnLeafCount: 3,
      finalityAuthoritySetId: '1',
      finalityAuthoritySetHashHex: 'bc'.repeat(32),
      finalityProofHashHex: 'ef'.repeat(32),
    };
    const compiledInput = {
      compiledInstance: compiled,
      checkpoint,
      targetNativeStateRootHex: '12'.repeat(32),
      finalityHorizonHeight: '100',
      finalityHorizonHashHex: '34'.repeat(32),
      currentErgoHeight: 1_000,
      anchorContextIndex: 2,
      proofChunksHex: ['01', '0203'],
    } as const;

    const integrated =
      await buildCompiledPooledReserveBurnTrackerV4Context(compiledInput);

    expect(integrated.contract.contractIdHex)
      .toBe(compiled.contracts.tracker.receipt.contractIdHex);
    expect(integrated.contract.contractIdHex).not.toBe(contract.contractIdHex);
    expect(integrated.contract.propositionHex)
      .toBe(compiled.contracts.tracker.receipt.propositionHex);
    expect(integrated.statement.applicationBindingHex)
      .toBe(compiled.application.burnBindingHex);
    expect(integrated.statement.applicationBindingDigestHex)
      .toBe(compiled.application.burnBindingDigestHex);
    expect(integrated.trackerTransition.trackerNftIdHex)
      .toBe(compiled.genesis.trackerNftIdHex.slice(2));
    expect(integrated.trackerTransition.trackerKeyHex).toBe(
      deriveValidityApplicationPooledReserveTrackerKeyV4Hex({
        sidechainIdHex: runtimeProfile.sidechainIdHex,
        sidechainHeight: checkpoint.sidechainHeight,
        executionBlockHashHex: checkpoint.executionBlockHashHex,
      }),
    );
    expect(() => assertPooledReserveBurnTrackerV4ContextProvenance(integrated))
      .not.toThrow();

    await expect(buildCompiledPooledReserveBurnTrackerV4Context({
      ...compiledInput,
      compiledInstance: { ...compiled },
    })).rejects.toThrow('must be compiled from the same-process');
  });

  it('rejects compiler receipt, proposition, binding-prefix, and V2-program substitutions', async () => {
    const wrongCompilerCommit = {
      ...contract,
      sigmaStateCommit: 'aa'.repeat(20),
    } as PooledReserveBurnTrackerContractV4Identity;
    await expect(buildPooledReserveBurnTrackerV4Context(input({
      contract: wrongCompilerCommit,
    }))).rejects.toThrow('contract identity is invalid');

    const wrongSourceReceipt = {
      ...contract,
      resolvedSourceSha256Hex: 'bb'.repeat(32),
    } as PooledReserveBurnTrackerContractV4Identity;
    await expect(buildPooledReserveBurnTrackerV4Context(input({
      contract: wrongSourceReceipt,
    }))).rejects.toThrow('contract identity is invalid');

    const wrongProposition = {
      ...contract,
      propositionHex: `${contract.propositionHex.slice(0, -2)}00`,
    } as PooledReserveBurnTrackerContractV4Identity;
    await expect(buildPooledReserveBurnTrackerV4Context(input({
      contract: wrongProposition,
    }))).rejects.toThrow('contract identity is invalid');

    const wrongContractId = {
      ...contract,
      contractIdHex: 'aa'.repeat(32),
    } as PooledReserveBurnTrackerContractV4Identity;
    await expect(buildPooledReserveBurnTrackerV4Context(input({
      contract: wrongContractId,
    }))).rejects.toThrow('contract identity is invalid');

    const wrongPrefix = {
      ...contract,
      applicationBindingPrefixHex:
        `${contract.applicationBindingPrefixHex.slice(0, -2)}00`,
    } as PooledReserveBurnTrackerContractV4Identity;
    await expect(buildPooledReserveBurnTrackerV4Context(input({
      contract: wrongPrefix,
    }))).rejects.toThrow('contract identity is invalid');

    const coordinatedTrackerNftIdHex = 'cc'.repeat(32);
    const coordinatedBinding = encodePooledReserveBurnApplicationBindingV4({
      runtimeProfileScaleHex: vector.expected.runtimeProfileScaleHex,
      sourceRuntimeCodeSha256Hex: vector.input.sourceRuntimeCodeSha256Hex,
      sourceRuntimeCodeBytes: vector.input.sourceRuntimeCodeBytes,
      trackerNftIdHex: coordinatedTrackerNftIdHex,
      settlementTrackerContractIdHex: contract.contractIdHex,
    });
    const coordinatedPrefix = {
      ...contract,
      applicationBindingPrefixHex:
        coordinatedBinding.subarray(0, 449).toString('hex'),
    } as PooledReserveBurnTrackerContractV4Identity;
    await expect(buildPooledReserveBurnTrackerV4Context(input({
      contract: coordinatedPrefix,
      trackerNftIdHex: coordinatedTrackerNftIdHex,
    }))).rejects.toThrow('contract identity is invalid');

    const v2Program = {
      ...contract,
      programIdHex:
        '230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c',
    } as unknown as PooledReserveBurnTrackerContractV4Identity;
    await expect(buildPooledReserveBurnTrackerV4Context(input({
      contract: v2Program,
    }))).rejects.toThrow('contract identity is invalid');
  });

  it('rejects a foreign chain domain and an empty proof transport', async () => {
    await expect(buildPooledReserveBurnTrackerV4Context(input({
      chainDomainIdHex: 'bb'.repeat(32),
    }))).rejects.toThrow('chain domain mismatch');
    await expect(buildPooledReserveBurnTrackerV4Context(input({
      proofChunksHex: [],
    }))).rejects.toThrow('proof chunks must be non-empty');
  });
});
