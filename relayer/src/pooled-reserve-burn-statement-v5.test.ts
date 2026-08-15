import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES,
  BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES,
  decodeBridgeCausalApplicationBindingV2,
  decodeBridgeValidityApplicationPayloadV3,
  decodeEip0045BridgeApplicationStatementV2,
  encodeBridgeCausalApplicationBindingV2,
  encodeBridgeValidityApplicationPayloadV3,
  encodeEip0045BridgeApplicationStatementV2,
} from './bridge-validity-application-statement-v2.js';
import {
  decodeEip0045PooledReserveBurnStatementV4,
  decodePooledReserveBurnApplicationBindingV4,
  decodePooledReserveBurnPublicInputsV4,
} from './pooled-reserve-burn-statement-v4.js';
import {
  encodeBridgeCheckpointV1,
  type BridgeCheckpointV1Input,
} from './bridge-checkpoint-commitment.js';
import {
  EIP0045_POOLED_RESERVE_BURN_STATEMENT_V5_BYTES,
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V5_BYTES,
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V5_DOMAIN,
  POOLED_RESERVE_BURN_PUBLIC_INPUTS_V5_BYTES,
  POOLED_RESERVE_BURN_PUBLIC_INPUTS_V5_DOMAIN,
  POOLED_RESERVE_BURN_V5_REJECTED_APPLICATION_V2_PROGRAM_ID_HEX,
  assertEip0045PooledReserveBurnStatementV5Matches,
  decodeEip0045PooledReserveBurnStatementV5,
  decodePooledReserveBurnApplicationBindingV5,
  decodePooledReserveBurnPublicInputsV5,
  deriveEip0045PooledReserveBurnStatementV5DigestHex,
  derivePooledReserveBurnApplicationBindingV5DigestHex,
  derivePooledReserveBurnPublicInputsV5DigestHex,
  encodeEip0045PooledReserveBurnStatementV5,
  encodePooledReserveBurnApplicationBindingV5,
  encodePooledReserveBurnPublicInputsV5,
  type Eip0045PooledReserveBurnStatementV5Input,
  type PooledReserveBurnApplicationBindingV5Input,
} from './pooled-reserve-burn-statement-v5.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V5_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v5.js';
import {
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';

interface GoldenVector {
  readonly schema: string;
  readonly version: number;
  readonly status: string;
  readonly input: {
    readonly runtimeProfile: PooledReserveMintReservationRuntimeProfileV4;
    readonly checkpoint: BridgeCheckpointV1Input;
    readonly sourceRuntimeCodeSha256Hex: string;
    readonly sourceRuntimeCodeBytes: number;
    readonly trackerNftIdHex: string;
    readonly settlementTrackerContractIdHex: string;
    readonly targetNativeStateRootHex: string;
    readonly trustedAnchorDigestHex: string;
    readonly finalityHorizonHeight: string;
    readonly finalityHorizonHashHex: string;
    readonly chainDomainIdHex: string;
    readonly profileIdHex: string;
    readonly programIdHex: string;
    readonly contractIdHex: string;
  };
  readonly expected: {
    readonly runtimeProfileScaleHex: string;
    readonly runtimeProfileIdHex: string;
    readonly encodedBindingHex: string;
    readonly bindingDigestHex: string;
    readonly encodedCheckpointHex: string;
    readonly checkpointCommitmentHex: string;
    readonly extensionKeyHex: string;
    readonly extensionValueHex: string;
    readonly encodedPublicInputsHex: string;
    readonly publicInputsDigestHex: string;
    readonly encodedStatementHex: string;
    readonly statementDigestHex: string;
  };
}

const vector = JSON.parse(readFileSync(
  new URL('../test-vectors/pooled-reserve-burn-statement-v5.json', import.meta.url),
  'utf8',
)) as GoldenVector;

const v4Vector = JSON.parse(readFileSync(
  new URL('../test-vectors/pooled-reserve-burn-statement-v4.json', import.meta.url),
  'utf8',
)) as GoldenVector;

const finalityV2Vector = JSON.parse(readFileSync(
  new URL('../test-vectors/bridge-validity-finality-statement-v2.json', import.meta.url),
  'utf8',
)) as {
  readonly input: {
    readonly profileIdHex: string;
    readonly programIdHex: string;
  };
  readonly expected: {
    readonly contractIdHex: string;
    readonly encodedPayloadHex: string;
  };
};

function buildBinding(
  overrides: Partial<PooledReserveBurnApplicationBindingV5Input> = {},
): Buffer {
  return encodePooledReserveBurnApplicationBindingV5({
    runtimeProfileScaleHex: vector.expected.runtimeProfileScaleHex,
    sourceRuntimeCodeSha256Hex: vector.input.sourceRuntimeCodeSha256Hex,
    sourceRuntimeCodeBytes: vector.input.sourceRuntimeCodeBytes,
    trackerNftIdHex: vector.input.trackerNftIdHex,
    settlementTrackerContractIdHex: vector.input.settlementTrackerContractIdHex,
    ...overrides,
  });
}

function buildPublicInputs(input: {
  readonly binding?: Buffer;
  readonly checkpoint?: BridgeCheckpointV1Input;
  readonly targetNativeStateRootHex?: string;
  readonly trustedAnchorDigestHex?: string;
  readonly finalityHorizonHeight?: string;
  readonly finalityHorizonHashHex?: string;
} = {}): Buffer {
  return encodePooledReserveBurnPublicInputsV5({
    applicationBinding: input.binding ?? buildBinding(),
    encodedCheckpoint: encodeBridgeCheckpointV1(
      input.checkpoint ?? vector.input.checkpoint,
    ),
    targetNativeStateRootHex:
      input.targetNativeStateRootHex ?? vector.input.targetNativeStateRootHex,
    trustedAnchorDigestHex:
      input.trustedAnchorDigestHex ?? vector.input.trustedAnchorDigestHex,
    finalityHorizonHeight:
      input.finalityHorizonHeight ?? vector.input.finalityHorizonHeight,
    finalityHorizonHashHex:
      input.finalityHorizonHashHex ?? vector.input.finalityHorizonHashHex,
  });
}

function statementInput(
  publicInputs = buildPublicInputs(),
): Eip0045PooledReserveBurnStatementV5Input {
  return {
    chainDomainIdHex: vector.input.chainDomainIdHex,
    profileIdHex: vector.input.profileIdHex,
    programIdHex: vector.input.programIdHex,
    contractIdHex: vector.input.contractIdHex,
    publicInputs,
  };
}

function buildStatement(): Buffer {
  return encodeEip0045PooledReserveBurnStatementV5(statementInput());
}

function mutateByte(bytes: Buffer, offset: number, value?: number): Buffer {
  const changed = Buffer.from(bytes);
  changed[offset] = value ?? (changed[offset] ^ 0x80);
  return changed;
}

function zeroRange(bytes: Buffer, start: number, end: number): Buffer {
  const changed = Buffer.from(bytes);
  changed.fill(0, start, end);
  return changed;
}

function buildCurrentV2Statement(): {
  readonly binding: Buffer;
  readonly payload: Buffer;
  readonly statement: Buffer;
} {
  const application = {
    sourceNetworkIdHex: 'aa'.repeat(32),
    sidechainIdHex: '11'.repeat(32),
    bridgeAddressHex: '22'.repeat(20),
    tokenAddressHex: '21'.repeat(20),
    settlementProfileIdHex: 'bb'.repeat(32),
    causalProfileIdHex:
      '80fb647618a990b24084ecceaa810822c14d2649c998908043b21120b07e67ee',
    bridgeRuntimeCodeSha256Hex:
      'ba3d364b0b10103032ebc8974a70e54e1c0aa69854212edfbc7daec81f3e3751',
    bridgeRuntimeCodeBytes: 4_104,
    tokenRuntimeCodeSha256Hex:
      '43b2edc69034b0e801fd13efc3b5d4bfb50dc255b17d49e058c4dcf79d872989',
    tokenRuntimeCodeBytes: 2_356,
  };
  const binding = encodeBridgeCausalApplicationBindingV2(application);
  const payload = encodeBridgeValidityApplicationPayloadV3({
    finalityPayload: finalityV2Vector.expected.encodedPayloadHex,
    application,
  });
  const statement = encodeEip0045BridgeApplicationStatementV2({
    chainDomainIdHex: application.sourceNetworkIdHex,
    profileIdHex: finalityV2Vector.input.profileIdHex,
    programIdHex: finalityV2Vector.input.programIdHex,
    contractIdHex: finalityV2Vector.expected.contractIdHex,
    applicationPayload: payload,
  });
  return { binding, payload, statement };
}

describe('PooledReserveBurnApplicationBindingV5', () => {
  it('round-trips the exact 486-byte versioned runtime and settlement binding', () => {
    const binding = buildBinding();
    const decoded = decodePooledReserveBurnApplicationBindingV5(binding);

    expect(vector.status).toBe('structural_non_authorizing');
    expect(POOLED_RESERVE_BURN_APPLICATION_BINDING_V5_DOMAIN)
      .toBe('E2S_POOLED_RESERVE_BURN_APPLICATION_BINDING_V5');
    expect(binding).toHaveLength(POOLED_RESERVE_BURN_APPLICATION_BINDING_V5_BYTES);
    expect(binding.toString('hex')).toBe(vector.expected.encodedBindingHex);
    expect(binding[0]).toBe(5);
    expect(binding.subarray(1, 350).toString('hex'))
      .toBe(vector.expected.runtimeProfileScaleHex.slice(2));
    expect(`0x${binding.subarray(350, 382).toString('hex')}`)
      .toBe(vector.expected.runtimeProfileIdHex);
    expect(binding.readUInt32BE(414)).toBe(vector.input.sourceRuntimeCodeBytes);
    expect(binding.subarray(482).toString('hex')).toBe('00000000');
    expect(decoded.formatVersion).toBe(5);
    expect(decoded.runtimeProfile).toEqual(vector.input.runtimeProfile);
    expect(decoded.bindingDigestHex).toBe(vector.expected.bindingDigestHex);
    expect(derivePooledReserveBurnApplicationBindingV5DigestHex(binding))
      .toBe(vector.expected.bindingDigestHex);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.runtimeProfile)).toBe(true);
  });

  it('rejects identity, code-size, preactivation, authorization and reserved drift', () => {
    const binding = buildBinding();
    expect(() => decodePooledReserveBurnApplicationBindingV5(
      mutateByte(binding, 350),
    )).toThrow('profile ID mismatch');
    expect(() => decodePooledReserveBurnApplicationBindingV5(
      zeroRange(binding, 382, 414),
    )).toThrow('sourceRuntimeCodeSha256');
    expect(() => decodePooledReserveBurnApplicationBindingV5(
      zeroRange(binding, 414, 418),
    )).toThrow('sourceRuntimeCodeBytes');
    expect(() => decodePooledReserveBurnApplicationBindingV5(
      zeroRange(binding, 418, 450),
    )).toThrow('trackerNftId');
    expect(() => decodePooledReserveBurnApplicationBindingV5(
      zeroRange(binding, 450, 482),
    )).toThrow('settlementTrackerContractId');
    expect(() => decodePooledReserveBurnApplicationBindingV5(
      mutateByte(binding, 482, 1),
    )).toThrow('preactivation');
    expect(() => decodePooledReserveBurnApplicationBindingV5(
      mutateByte(binding, 483, 1),
    )).toThrow('authorization flags');
    expect(() => decodePooledReserveBurnApplicationBindingV5(
      mutateByte(binding, 484, 1),
    )).toThrow('reserved bytes');
    expect(() => decodePooledReserveBurnApplicationBindingV5(
      binding.subarray(0, binding.length - 1),
    )).toThrow('must be 486 bytes');
  });

  it('rejects noncanonical runtime-profile bytes and malformed caller identities', () => {
    const binding = buildBinding();
    expect(() => decodePooledReserveBurnApplicationBindingV5(
      mutateByte(binding, 0, 3),
    )).toThrow('binding version');
    expect(() => decodePooledReserveBurnApplicationBindingV5(
      mutateByte(binding, 1, 3),
    )).toThrow('version is unsupported');
    expect(() => buildBinding({
      sourceRuntimeCodeSha256Hex: 'AB'.repeat(32),
    })).toThrow('lowercase unprefixed hex');
    expect(() => buildBinding({ sourceRuntimeCodeBytes: 0 }))
      .toThrow('positive uint32');
    expect(() => buildBinding({ trackerNftIdHex: '00'.repeat(32) }))
      .toThrow('nonzero');
  });
});

describe('PooledReserveBurnPublicInputsV5', () => {
  it('pins the exact checkpoint, 0x0401 anchor and 981-byte golden vector', () => {
    const publicInputs = buildPublicInputs();
    const decoded = decodePooledReserveBurnPublicInputsV5(publicInputs);

    expect(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V5_DOMAIN)
      .toBe('E2S_POOLED_RESERVE_BURN_PUBLIC_INPUTS_V5');
    expect(publicInputs).toHaveLength(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V5_BYTES);
    expect(publicInputs.toString('hex')).toBe(vector.expected.encodedPublicInputsHex);
    expect([...publicInputs.subarray(41, 45)]).toEqual([5, 1, 1, 0]);
    expect(publicInputs.subarray(563, 779).toString('hex'))
      .toBe(vector.expected.encodedCheckpointHex);
    expect(publicInputs.subarray(779, 811).toString('hex'))
      .toBe(vector.expected.checkpointCommitmentHex);
    expect(publicInputs.subarray(915, 917).toString('hex')).toBe('0401');
    expect(publicInputs.subarray(917).toString('hex'))
      .toBe(vector.expected.extensionValueHex);
    expect(decoded.publicInputsDigestHex).toBe(vector.expected.publicInputsDigestHex);
    expect(derivePooledReserveBurnPublicInputsV5DigestHex(publicInputs))
      .toBe(vector.expected.publicInputsDigestHex);
    expect(decoded.application.runtimeProfile.sidechainIdHex.slice(2))
      .toBe(decoded.checkpoint.sidechainIdHex);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.checkpoint)).toBe(true);
    expect(Reflect.set(decoded.checkpoint, 'sidechainHeight', '0')).toBe(false);
    expect(decoded.checkpoint.sidechainHeight).toBe(vector.input.checkpoint.sidechainHeight);
  });

  it('rejects domain, discriminator, binding digest and total-length drift', () => {
    const publicInputs = buildPublicInputs();
    expect(() => decodePooledReserveBurnPublicInputsV5(
      mutateByte(publicInputs, 0),
    )).toThrow('domain');
    for (const [offset, message] of [
      [41, 'version'],
      [42, 'hash algorithm'],
      [43, 'source semantics'],
      [44, 'flags'],
    ] as const) {
      expect(() => decodePooledReserveBurnPublicInputsV5(
        mutateByte(publicInputs, offset),
      )).toThrow(message);
    }
    expect(() => decodePooledReserveBurnPublicInputsV5(
      mutateByte(publicInputs, 531),
    )).toThrow('binding digest');
    expect(() => decodePooledReserveBurnPublicInputsV5(
      publicInputs.subarray(0, publicInputs.length - 1),
    )).toThrow('must be 981 bytes');
    expect(() => decodePooledReserveBurnPublicInputsV5(
      Buffer.concat([publicInputs, Buffer.from([0])]),
    )).toThrow('must be 981 bytes');
  });

  it('rejects checkpoint, finality horizon and exact 0x0401 anchor drift', () => {
    const publicInputs = buildPublicInputs();
    expect(() => decodePooledReserveBurnPublicInputsV5(
      mutateByte(publicInputs, 563 + 4),
    )).toThrow('sidechain ID mismatch');

    const excessBurns = Buffer.from(publicInputs);
    excessBurns.writeUInt32BE(257, 563 + 140);
    expect(() => decodePooledReserveBurnPublicInputsV5(excessBurns))
      .toThrow('exceeds 256 leaves');

    const zeroBurns = Buffer.from(publicInputs);
    zeroBurns.writeUInt32BE(0, 563 + 140);
    expect(() => decodePooledReserveBurnPublicInputsV5(zeroBurns))
      .toThrow('greater than zero');

    expect(() => buildPublicInputs({
      checkpoint: {
        ...vector.input.checkpoint,
        sidechainHeight: '41',
      },
    })).toThrow('precedes runtime profile activation');

    expect(() => decodePooledReserveBurnPublicInputsV5(
      mutateByte(publicInputs, 779),
    )).toThrow('checkpoint commitment');
    expect(() => decodePooledReserveBurnPublicInputsV5(
      zeroRange(publicInputs, 811, 843),
    )).toThrow('targetNativeStateRoot');
    expect(() => decodePooledReserveBurnPublicInputsV5(
      zeroRange(publicInputs, 843, 875),
    )).toThrow('trustedAnchorDigest');

    const staleHorizon = Buffer.from(publicInputs);
    staleHorizon.writeBigUInt64BE(12_344n, 875);
    expect(() => decodePooledReserveBurnPublicInputsV5(staleHorizon))
      .toThrow('precedes checkpoint');
    expect(() => decodePooledReserveBurnPublicInputsV5(
      zeroRange(publicInputs, 883, 915),
    )).toThrow('finalityHorizonHash');
    expect(() => decodePooledReserveBurnPublicInputsV5(
      mutateByte(publicInputs, 915),
    )).toThrow('0x0401');
    expect(() => decodePooledReserveBurnPublicInputsV5(
      mutateByte(publicInputs, 917),
    )).toThrow('extension value');
  });
});

describe('EIP-0045 PooledReserveBurnStatementV5', () => {
  it('round-trips the exact 1,140-byte structural statement without authority claims', () => {
    const statement = buildStatement();
    const decoded = decodeEip0045PooledReserveBurnStatementV5(statement);

    expect(statement).toHaveLength(EIP0045_POOLED_RESERVE_BURN_STATEMENT_V5_BYTES);
    expect(statement.toString('hex')).toBe(vector.expected.encodedStatementHex);
    expect(statement.subarray(0, 26).toString('ascii'))
      .toBe('Ergo.VerifyStark.Statement');
    expect(statement[26]).toBe(1);
    expect(statement.readUInt32LE(155)).toBe(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V5_BYTES);
    expect(decoded.statementDigestHex).toBe(vector.expected.statementDigestHex);
    expect(deriveEip0045PooledReserveBurnStatementV5DigestHex(statement))
      .toBe(vector.expected.statementDigestHex);
    expect(decoded.contractIdHex)
      .toBe(decoded.publicInputs.application.settlementTrackerContractIdHex);
    expect(Object.isFrozen(decoded)).toBe(true);
  });

  it('rejects outer identity, length, chain-domain and tracker-contract drift', () => {
    const statement = buildStatement();
    expect(() => decodeEip0045PooledReserveBurnStatementV5(
      mutateByte(statement, 0),
    )).toThrow('domain');
    expect(() => decodeEip0045PooledReserveBurnStatementV5(
      mutateByte(statement, 26, 2),
    )).toThrow('version');
    expect(() => decodeEip0045PooledReserveBurnStatementV5(
      mutateByte(statement, 27),
    )).toThrow('settlement chain domain');
    expect(() => decodeEip0045PooledReserveBurnStatementV5(
      zeroRange(statement, 59, 91),
    )).toThrow('profileId');
    expect(() => decodeEip0045PooledReserveBurnStatementV5(
      zeroRange(statement, 91, 123),
    )).toThrow('programId');
    expect(() => decodeEip0045PooledReserveBurnStatementV5(
      mutateByte(statement, 123),
    )).toThrow('tracker contract');
    expect(() => decodeEip0045PooledReserveBurnStatementV5(
      mutateByte(statement, 155),
    )).toThrow('public inputs length');
    expect(() => decodeEip0045PooledReserveBurnStatementV5(
      statement.subarray(0, statement.length - 1),
    )).toThrow('must be 1140 bytes');
  });

  it('reuses the verifier predicate profile while rejecting the V2 guest program', () => {
    const publicInputs = buildPublicInputs();
    const sharedProfileStatement = encodeEip0045PooledReserveBurnStatementV5({
      ...statementInput(publicInputs),
      profileIdHex: POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX,
    });
    expect(decodeEip0045PooledReserveBurnStatementV5(sharedProfileStatement).profileIdHex)
      .toBe(POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX);
    expect(() => encodeEip0045PooledReserveBurnStatementV5({
      ...statementInput(publicInputs),
      programIdHex: POOLED_RESERVE_BURN_V5_REJECTED_APPLICATION_V2_PROGRAM_ID_HEX,
    })).toThrow('application V2 programId');

    const aliasedProgram = Buffer.from(buildStatement());
    Buffer.from(
      POOLED_RESERVE_BURN_V5_REJECTED_APPLICATION_V2_PROGRAM_ID_HEX,
      'hex',
    ).copy(aliasedProgram, 91);
    expect(() => decodeEip0045PooledReserveBurnStatementV5(aliasedProgram))
      .toThrow('application V2 programId');
  });

  it('binds expected profile, program, contract and public-input identities exactly', () => {
    const statement = buildStatement();
    const expected = statementInput();
    for (const mutation of [
      { ...expected, profileIdHex: '1a'.repeat(32) },
      { ...expected, programIdHex: '1b'.repeat(32) },
      {
        ...expected,
        publicInputs: buildPublicInputs({ finalityHorizonHashHex: '1c'.repeat(32) }),
      },
    ]) {
      expect(() => assertEip0045PooledReserveBurnStatementV5Matches(
        statement,
        mutation,
      )).toThrow('expected binding mismatch');
    }
  });

  it('changes statement identity when a reviewed runtime field changes coherently', () => {
    const changedRuntimeProfile = {
      ...vector.input.runtimeProfile,
      bridgeAddressHex: `0x${'35'.repeat(20)}`,
    } satisfies PooledReserveMintReservationRuntimeProfileV4;
    const changedBinding = buildBinding({
      runtimeProfileScaleHex:
        encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
          changedRuntimeProfile,
        ),
    });
    const changedStatement = encodeEip0045PooledReserveBurnStatementV5(
      statementInput(buildPublicInputs({ binding: changedBinding })),
    );

    expect(changedStatement).not.toEqual(buildStatement());
    expect(deriveEip0045PooledReserveBurnStatementV5DigestHex(changedStatement))
      .not.toBe(vector.expected.statementDigestHex);
  });

  it('is bidirectionally non-decodable as the frozen V2 and V4 families', () => {
    const currentV2 = buildCurrentV2Statement();
    const v5Binding = buildBinding();
    const v5PublicInputs = buildPublicInputs();
    const v5Statement = buildStatement();

    expect(currentV2.binding).toHaveLength(BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES);
    expect(currentV2.payload).toHaveLength(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES);
    expect(() => decodePooledReserveBurnApplicationBindingV5(currentV2.binding))
      .toThrow('must be 486 bytes');
    expect(() => decodePooledReserveBurnPublicInputsV5(currentV2.payload))
      .toThrow('must be 981 bytes');
    expect(() => decodeEip0045PooledReserveBurnStatementV5(currentV2.statement))
      .toThrow('must be 1140 bytes');

    expect(() => decodeBridgeCausalApplicationBindingV2(v5Binding))
      .toThrow('must be 240 bytes');
    expect(() => decodeBridgeValidityApplicationPayloadV3(v5PublicInputs))
      .toThrow('must be 973 bytes');
    expect(() => decodeEip0045BridgeApplicationStatementV2(v5Statement))
      .toThrow('must be 1132 bytes');

    const v4Binding = Buffer.from(v4Vector.expected.encodedBindingHex, 'hex');
    const v4PublicInputs = Buffer.from(v4Vector.expected.encodedPublicInputsHex, 'hex');
    const v4Statement = Buffer.from(v4Vector.expected.encodedStatementHex, 'hex');
    expect(() => decodePooledReserveBurnApplicationBindingV5(v4Binding))
      .toThrow('must be 486 bytes');
    expect(() => decodePooledReserveBurnPublicInputsV5(v4PublicInputs))
      .toThrow('must be 981 bytes');
    expect(() => decodeEip0045PooledReserveBurnStatementV5(v4Statement))
      .toThrow('must be 1140 bytes');
    expect(() => decodePooledReserveBurnApplicationBindingV4(v5Binding))
      .toThrow('must be 485 bytes');
    expect(() => decodePooledReserveBurnPublicInputsV4(v5PublicInputs))
      .toThrow('must be 980 bytes');
    expect(() => decodeEip0045PooledReserveBurnStatementV4(v5Statement))
      .toThrow('must be 1139 bytes');
  });

  it('uses the frozen EIP verifier profile with the distinct non-authorizing V5 guest ID', () => {
    expect(vector.input.programIdHex).toBe(POOLED_RESERVE_BURN_TRACKER_V5_PROGRAM_ID_HEX);
    expect(vector.input.programIdHex)
      .not.toBe(POOLED_RESERVE_BURN_V5_REJECTED_APPLICATION_V2_PROGRAM_ID_HEX);
    expect(vector.input.profileIdHex)
      .toBe(POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX);
    expect(POOLED_RESERVE_BURN_TRACKER_V5_VERIFIER_PROFILE_ID_HEX)
      .toBe('23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383');
    expect(vector.status).toBe('structural_non_authorizing');
    expect(vector.status).not.toBe('active');
    expect(vector.status).not.toBe('funds_authorizing');
  });
});
