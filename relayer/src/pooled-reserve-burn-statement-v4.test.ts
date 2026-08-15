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
  encodeBridgeCheckpointV1,
  type BridgeCheckpointV1Input,
} from './bridge-checkpoint-commitment.js';
import {
  EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES,
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES,
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN,
  POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES,
  POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN,
  POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID_HEX,
  assertEip0045PooledReserveBurnStatementV4Matches,
  decodeEip0045PooledReserveBurnStatementV4,
  decodePooledReserveBurnApplicationBindingV4,
  decodePooledReserveBurnPublicInputsV4,
  deriveEip0045PooledReserveBurnStatementV4DigestHex,
  derivePooledReserveBurnApplicationBindingV4DigestHex,
  derivePooledReserveBurnPublicInputsV4DigestHex,
  encodeEip0045PooledReserveBurnStatementV4,
  encodePooledReserveBurnApplicationBindingV4,
  encodePooledReserveBurnPublicInputsV4,
  type Eip0045PooledReserveBurnStatementV4Input,
  type PooledReserveBurnApplicationBindingV4Input,
} from './pooled-reserve-burn-statement-v4.js';
import {
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';

const EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID_HEX =
  '23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383';

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
  overrides: Partial<PooledReserveBurnApplicationBindingV4Input> = {},
): Buffer {
  return encodePooledReserveBurnApplicationBindingV4({
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
  return encodePooledReserveBurnPublicInputsV4({
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
): Eip0045PooledReserveBurnStatementV4Input {
  return {
    chainDomainIdHex: vector.input.chainDomainIdHex,
    profileIdHex: vector.input.profileIdHex,
    programIdHex: vector.input.programIdHex,
    contractIdHex: vector.input.contractIdHex,
    publicInputs,
  };
}

function buildStatement(): Buffer {
  return encodeEip0045PooledReserveBurnStatementV4(statementInput());
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

describe('PooledReserveBurnApplicationBindingV4', () => {
  it('round-trips the exact 485-byte runtime and settlement binding', () => {
    const binding = buildBinding();
    const decoded = decodePooledReserveBurnApplicationBindingV4(binding);

    expect(vector.status).toBe('structural_non_authorizing');
    expect(POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN)
      .toBe('E2S_POOLED_RESERVE_BURN_APPLICATION_BINDING_V4');
    expect(binding).toHaveLength(POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES);
    expect(binding.toString('hex')).toBe(vector.expected.encodedBindingHex);
    expect(binding.subarray(0, 349).toString('hex'))
      .toBe(vector.expected.runtimeProfileScaleHex.slice(2));
    expect(`0x${binding.subarray(349, 381).toString('hex')}`)
      .toBe(vector.expected.runtimeProfileIdHex);
    expect(binding.readUInt32BE(413)).toBe(vector.input.sourceRuntimeCodeBytes);
    expect(binding.subarray(481).toString('hex')).toBe('00000000');
    expect(decoded.runtimeProfile).toEqual(vector.input.runtimeProfile);
    expect(decoded.bindingDigestHex).toBe(vector.expected.bindingDigestHex);
    expect(derivePooledReserveBurnApplicationBindingV4DigestHex(binding))
      .toBe(vector.expected.bindingDigestHex);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.runtimeProfile)).toBe(true);
  });

  it('rejects identity, code-size, preactivation, authorization and reserved drift', () => {
    const binding = buildBinding();
    expect(() => decodePooledReserveBurnApplicationBindingV4(
      mutateByte(binding, 349),
    )).toThrow('profile ID mismatch');
    expect(() => decodePooledReserveBurnApplicationBindingV4(
      zeroRange(binding, 381, 413),
    )).toThrow('sourceRuntimeCodeSha256');
    expect(() => decodePooledReserveBurnApplicationBindingV4(
      zeroRange(binding, 413, 417),
    )).toThrow('sourceRuntimeCodeBytes');
    expect(() => decodePooledReserveBurnApplicationBindingV4(
      zeroRange(binding, 417, 449),
    )).toThrow('trackerNftId');
    expect(() => decodePooledReserveBurnApplicationBindingV4(
      zeroRange(binding, 449, 481),
    )).toThrow('settlementTrackerContractId');
    expect(() => decodePooledReserveBurnApplicationBindingV4(
      mutateByte(binding, 481, 1),
    )).toThrow('preactivation');
    expect(() => decodePooledReserveBurnApplicationBindingV4(
      mutateByte(binding, 482, 1),
    )).toThrow('authorization flags');
    expect(() => decodePooledReserveBurnApplicationBindingV4(
      mutateByte(binding, 483, 1),
    )).toThrow('reserved bytes');
    expect(() => decodePooledReserveBurnApplicationBindingV4(
      binding.subarray(0, binding.length - 1),
    )).toThrow('must be 485 bytes');
  });

  it('rejects noncanonical runtime-profile bytes and malformed caller identities', () => {
    const binding = buildBinding();
    expect(() => decodePooledReserveBurnApplicationBindingV4(
      mutateByte(binding, 0, 3),
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

describe('PooledReserveBurnPublicInputsV4', () => {
  it('pins the exact checkpoint, 0x0401 anchor and 980-byte golden vector', () => {
    const publicInputs = buildPublicInputs();
    const decoded = decodePooledReserveBurnPublicInputsV4(publicInputs);

    expect(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN)
      .toBe('E2S_POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4');
    expect(publicInputs).toHaveLength(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES);
    expect(publicInputs.toString('hex')).toBe(vector.expected.encodedPublicInputsHex);
    expect([...publicInputs.subarray(41, 45)]).toEqual([4, 1, 1, 0]);
    expect(publicInputs.subarray(562, 778).toString('hex'))
      .toBe(vector.expected.encodedCheckpointHex);
    expect(publicInputs.subarray(778, 810).toString('hex'))
      .toBe(vector.expected.checkpointCommitmentHex);
    expect(publicInputs.subarray(914, 916).toString('hex')).toBe('0401');
    expect(publicInputs.subarray(916).toString('hex'))
      .toBe(vector.expected.extensionValueHex);
    expect(decoded.publicInputsDigestHex).toBe(vector.expected.publicInputsDigestHex);
    expect(derivePooledReserveBurnPublicInputsV4DigestHex(publicInputs))
      .toBe(vector.expected.publicInputsDigestHex);
    expect(decoded.application.runtimeProfile.sidechainIdHex.slice(2))
      .toBe(decoded.checkpoint.sidechainIdHex);
    expect(Object.isFrozen(decoded)).toBe(true);
  });

  it('rejects domain, discriminator, binding digest and total-length drift', () => {
    const publicInputs = buildPublicInputs();
    expect(() => decodePooledReserveBurnPublicInputsV4(
      mutateByte(publicInputs, 0),
    )).toThrow('domain');
    for (const [offset, message] of [
      [41, 'version'],
      [42, 'hash algorithm'],
      [43, 'source semantics'],
      [44, 'flags'],
    ] as const) {
      expect(() => decodePooledReserveBurnPublicInputsV4(
        mutateByte(publicInputs, offset),
      )).toThrow(message);
    }
    expect(() => decodePooledReserveBurnPublicInputsV4(
      mutateByte(publicInputs, 530),
    )).toThrow('binding digest');
    expect(() => decodePooledReserveBurnPublicInputsV4(
      publicInputs.subarray(0, publicInputs.length - 1),
    )).toThrow('must be 980 bytes');
    expect(() => decodePooledReserveBurnPublicInputsV4(
      Buffer.concat([publicInputs, Buffer.from([0])]),
    )).toThrow('must be 980 bytes');
  });

  it('rejects checkpoint, finality horizon and exact 0x0401 anchor drift', () => {
    const publicInputs = buildPublicInputs();
    expect(() => decodePooledReserveBurnPublicInputsV4(
      mutateByte(publicInputs, 562 + 4),
    )).toThrow('sidechain ID mismatch');

    const excessBurns = Buffer.from(publicInputs);
    excessBurns.writeUInt32BE(257, 562 + 140);
    expect(() => decodePooledReserveBurnPublicInputsV4(excessBurns))
      .toThrow('exceeds 256 leaves');

    const zeroBurns = Buffer.from(publicInputs);
    zeroBurns.writeUInt32BE(0, 562 + 140);
    expect(() => decodePooledReserveBurnPublicInputsV4(zeroBurns))
      .toThrow('greater than zero');

    expect(() => buildPublicInputs({
      checkpoint: {
        ...vector.input.checkpoint,
        sidechainHeight: '41',
      },
    })).toThrow('precedes runtime profile activation');

    expect(() => decodePooledReserveBurnPublicInputsV4(
      mutateByte(publicInputs, 778),
    )).toThrow('checkpoint commitment');
    expect(() => decodePooledReserveBurnPublicInputsV4(
      zeroRange(publicInputs, 810, 842),
    )).toThrow('targetNativeStateRoot');
    expect(() => decodePooledReserveBurnPublicInputsV4(
      zeroRange(publicInputs, 842, 874),
    )).toThrow('trustedAnchorDigest');

    const staleHorizon = Buffer.from(publicInputs);
    staleHorizon.writeBigUInt64BE(12_344n, 874);
    expect(() => decodePooledReserveBurnPublicInputsV4(staleHorizon))
      .toThrow('precedes checkpoint');
    expect(() => decodePooledReserveBurnPublicInputsV4(
      zeroRange(publicInputs, 882, 914),
    )).toThrow('finalityHorizonHash');
    expect(() => decodePooledReserveBurnPublicInputsV4(
      mutateByte(publicInputs, 914),
    )).toThrow('0x0401');
    expect(() => decodePooledReserveBurnPublicInputsV4(
      mutateByte(publicInputs, 916),
    )).toThrow('extension value');
  });
});

describe('EIP-0045 PooledReserveBurnStatementV4', () => {
  it('round-trips the exact 1,139-byte structural statement without authority claims', () => {
    const statement = buildStatement();
    const decoded = decodeEip0045PooledReserveBurnStatementV4(statement);

    expect(statement).toHaveLength(EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES);
    expect(statement.toString('hex')).toBe(vector.expected.encodedStatementHex);
    expect(statement.subarray(0, 26).toString('ascii'))
      .toBe('Ergo.VerifyStark.Statement');
    expect(statement[26]).toBe(1);
    expect(statement.readUInt32LE(155)).toBe(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES);
    expect(decoded.statementDigestHex).toBe(vector.expected.statementDigestHex);
    expect(deriveEip0045PooledReserveBurnStatementV4DigestHex(statement))
      .toBe(vector.expected.statementDigestHex);
    expect(decoded.contractIdHex)
      .toBe(decoded.publicInputs.application.settlementTrackerContractIdHex);
    expect(Object.isFrozen(decoded)).toBe(true);
  });

  it('rejects outer identity, length, chain-domain and tracker-contract drift', () => {
    const statement = buildStatement();
    expect(() => decodeEip0045PooledReserveBurnStatementV4(
      mutateByte(statement, 0),
    )).toThrow('domain');
    expect(() => decodeEip0045PooledReserveBurnStatementV4(
      mutateByte(statement, 26, 2),
    )).toThrow('version');
    expect(() => decodeEip0045PooledReserveBurnStatementV4(
      mutateByte(statement, 27),
    )).toThrow('settlement chain domain');
    expect(() => decodeEip0045PooledReserveBurnStatementV4(
      zeroRange(statement, 59, 91),
    )).toThrow('profileId');
    expect(() => decodeEip0045PooledReserveBurnStatementV4(
      zeroRange(statement, 91, 123),
    )).toThrow('programId');
    expect(() => decodeEip0045PooledReserveBurnStatementV4(
      mutateByte(statement, 123),
    )).toThrow('tracker contract');
    expect(() => decodeEip0045PooledReserveBurnStatementV4(
      mutateByte(statement, 155),
    )).toThrow('public inputs length');
    expect(() => decodeEip0045PooledReserveBurnStatementV4(
      statement.subarray(0, statement.length - 1),
    )).toThrow('must be 1139 bytes');
  });

  it('reuses the verifier predicate profile while rejecting the V2 guest program', () => {
    const publicInputs = buildPublicInputs();
    const sharedProfileStatement = encodeEip0045PooledReserveBurnStatementV4({
      ...statementInput(publicInputs),
      profileIdHex: EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID_HEX,
    });
    expect(decodeEip0045PooledReserveBurnStatementV4(sharedProfileStatement).profileIdHex)
      .toBe(EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID_HEX);
    expect(() => encodeEip0045PooledReserveBurnStatementV4({
      ...statementInput(publicInputs),
      programIdHex: POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID_HEX,
    })).toThrow('application V2 programId');

    const aliasedProgram = Buffer.from(buildStatement());
    Buffer.from(
      POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID_HEX,
      'hex',
    ).copy(aliasedProgram, 91);
    expect(() => decodeEip0045PooledReserveBurnStatementV4(aliasedProgram))
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
      expect(() => assertEip0045PooledReserveBurnStatementV4Matches(
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
    const changedStatement = encodeEip0045PooledReserveBurnStatementV4(
      statementInput(buildPublicInputs({ binding: changedBinding })),
    );

    expect(changedStatement).not.toEqual(buildStatement());
    expect(deriveEip0045PooledReserveBurnStatementV4DigestHex(changedStatement))
      .not.toBe(vector.expected.statementDigestHex);
  });

  it('is bidirectionally non-decodable as the frozen V2 application family', () => {
    const currentV2 = buildCurrentV2Statement();
    const v4Binding = buildBinding();
    const v4PublicInputs = buildPublicInputs();
    const v4Statement = buildStatement();

    expect(currentV2.binding).toHaveLength(BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES);
    expect(currentV2.payload).toHaveLength(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES);
    expect(() => decodePooledReserveBurnApplicationBindingV4(currentV2.binding))
      .toThrow('must be 485 bytes');
    expect(() => decodePooledReserveBurnPublicInputsV4(currentV2.payload))
      .toThrow('must be 980 bytes');
    expect(() => decodeEip0045PooledReserveBurnStatementV4(currentV2.statement))
      .toThrow('must be 1139 bytes');

    expect(() => decodeBridgeCausalApplicationBindingV2(v4Binding))
      .toThrow('must be 240 bytes');
    expect(() => decodeBridgeValidityApplicationPayloadV3(v4PublicInputs))
      .toThrow('must be 973 bytes');
    expect(() => decodeEip0045BridgeApplicationStatementV2(v4Statement))
      .toThrow('must be 1132 bytes');
  });

  it('uses the frozen EIP verifier profile with a distinct non-authorizing V4 guest ID', () => {
    expect(vector.input.programIdHex)
      .not.toBe(POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID_HEX);
    expect(vector.input.profileIdHex)
      .toBe(EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID_HEX);
    expect(vector.status).toBe('structural_non_authorizing');
    expect(vector.status).not.toBe('active');
    expect(vector.status).not.toBe('funds_authorizing');
  });
});
