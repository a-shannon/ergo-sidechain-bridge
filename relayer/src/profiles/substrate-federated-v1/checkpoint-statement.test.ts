import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES,
  assertSubstrateFederatedCheckpointStatementV1Matches,
  assertSubstrateFederatedCheckpointStatementV1MatchesProfile,
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  decodeSubstrateFederatedCheckpointProfileV1,
  decodeSubstrateFederatedCheckpointStatementV1,
  decodeSubstrateFederatedCheckpointStatementV1ForAdmission,
  deriveSubstrateFederatedCheckpointAttestationDigestHex,
  encodeSubstrateFederatedCheckpointExtensionValueV1,
  encodeSubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointProfileV1Input,
  type SubstrateFederatedCheckpointStatementV1Input,
} from './checkpoint-statement.js';

interface GoldenVector {
  readonly schema: string;
  readonly version: number;
  readonly status: string;
  readonly input: {
    readonly profile: SubstrateFederatedCheckpointProfileV1Input;
    readonly statement: Omit<SubstrateFederatedCheckpointStatementV1Input, 'profile'>;
  };
  readonly expected: {
    readonly encodedProfileHex: string;
    readonly profileIdHex: string;
    readonly sourceAttestationKeySetDigestHex: string;
    readonly ergoAdmissionKeySetDigestHex: string;
    readonly encodedStatementHex: string;
    readonly statementIdHex: string;
    readonly attestationDigestHex: string;
    readonly extensionKeyHex: string;
    readonly extensionValueHex: string;
  };
  readonly boundaries: Readonly<Record<string, false>>;
}

const vector = JSON.parse(readFileSync(
  new URL(
    '../../../test-vectors/substrate-federated-v1-checkpoint-statement.json',
    import.meta.url,
  ),
  'utf8',
)) as GoldenVector;

function fixture() {
  const profile = buildSubstrateFederatedCheckpointProfileV1(vector.input.profile);
  const input = { profile, ...vector.input.statement };
  const statement = buildSubstrateFederatedCheckpointStatementV1(input);
  return { profile, input, statement };
}

describe('substrate-federated-v1 checkpoint profile and statement', () => {
  it('matches the shared Rust/TypeScript golden vector byte for byte', () => {
    const { profile, statement } = fixture();

    expect(vector.schema)
      .toBe('e2s.substrate-federated-v1-checkpoint-statement.golden-vector');
    expect(vector.status).toBe('structural_non_authorizing');
    expect(profile.encodedProfileHex).toBe(vector.expected.encodedProfileHex);
    expect(profile.profileIdHex).toBe(vector.expected.profileIdHex);
    expect(profile.sourceAttestationKeySetDigestHex)
      .toBe(vector.expected.sourceAttestationKeySetDigestHex);
    expect(profile.ergoAdmissionKeySetDigestHex)
      .toBe(vector.expected.ergoAdmissionKeySetDigestHex);
    expect(statement.encodedStatementHex).toBe(vector.expected.encodedStatementHex);
    expect(statement.statementIdHex).toBe(vector.expected.statementIdHex);
    expect(Buffer.from(statement.encodedStatementHex, 'hex')).toHaveLength(
      SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES,
    );
    expect(deriveSubstrateFederatedCheckpointAttestationDigestHex(
      statement.encodedStatementHex,
    ))
      .toBe(vector.expected.attestationDigestHex);
    expect(encodeSubstrateFederatedCheckpointExtensionValueV1(
      statement.encodedStatementHex,
    ))
      .toBe(vector.expected.extensionValueHex);
    expect(vector.expected.extensionKeyHex).toBe('0401');
    expect(Object.values(vector.boundaries).every(value => value === false)).toBe(true);

    expect(decodeSubstrateFederatedCheckpointProfileV1(
      profile.encodedProfileHex,
    )).toEqual(profile);
    expect(decodeSubstrateFederatedCheckpointStatementV1(
      statement.encodedStatementHex,
    )).toEqual(statement);
  });

  it('keeps source-attestation and Ergo-admission key roles distinct and canonical', () => {
    const sourceKeys = [...vector.input.profile.sourceAttestationPublicKeysHex];
    const ergoKeys = [...vector.input.profile.ergoAdmissionPublicKeysHex];
    const build = (overrides: Partial<SubstrateFederatedCheckpointProfileV1Input>) =>
      buildSubstrateFederatedCheckpointProfileV1({
        ...vector.input.profile,
        ...overrides,
      });

    expect(() => build({ sourceAttestationPublicKeysHex: [...sourceKeys].reverse() }))
      .toThrow(/strictly ordered/);
    expect(() => build({ sourceAttestationPublicKeysHex: [sourceKeys[0], sourceKeys[0]] }))
      .toThrow(/strictly ordered/);
    expect(() => build({ sourceAttestationThreshold: 0 })).toThrow(/positive uint16/);
    expect(() => build({ sourceAttestationThreshold: 4 })).toThrow(/key count/);
    expect(() => build({ ergoAdmissionThreshold: 4 })).toThrow(/key count/);
    expect(() => build({ ergoAdmissionPublicKeysHex: [`04${'44'.repeat(32)}`] }))
      .toThrow(/compressed group element/);
    expect(() => build({
      sourceAttestationPublicKeysHex: Array.from(
        { length: 9 },
        (_, index) => (index + 1).toString(16).padStart(2, '0').repeat(32),
      ),
    })).toThrow(/supported bound/);
    expect(() => build({ federationEpoch: '0' })).toThrow(/must be positive/);
    expect(() => build({ maxAdmissionValidityBlocks: '0' }))
      .toThrow(/must be positive/);

    const encoded = encodeSubstrateFederatedCheckpointProfileV1(vector.input.profile);
    for (const offset of [0, 1, 2, 3]) {
      const changed = Buffer.from(encoded);
      changed[offset] ^= 0x80;
      expect(() => decodeSubstrateFederatedCheckpointProfileV1(changed))
        .toThrow(/discriminators/);
    }
    expect(() => decodeSubstrateFederatedCheckpointProfileV1(encoded.subarray(0, -1)))
      .toThrow(/length/);
    expect(() => decodeSubstrateFederatedCheckpointProfileV1(
      Buffer.concat([encoded, Buffer.from([0])]),
    )).toThrow(/length/);
  });

  it('rejects malformed statement shape, empty bindings, and invalid horizons', () => {
    const { input, statement } = fixture();
    const encoded = Buffer.from(statement.encodedStatementHex, 'hex');

    for (const offset of [0, 1, 2, 3]) {
      const changed = Buffer.from(encoded);
      changed[offset] ^= 0x80;
      expect(() => decodeSubstrateFederatedCheckpointStatementV1(changed))
        .toThrow(/discriminators/);
    }
    for (const [start, end] of [
      [4, 36],
      [36, 68],
      [76, 108],
      [108, 140],
      [140, 172],
      [176, 196],
      [196, 216],
      [216, 248],
      [252, 284],
      [288, 320],
      [324, 356],
      [356, 388],
      [388, 420],
      [420, 452],
      [454, 486],
    ] as const) {
      const changed = Buffer.from(encoded);
      changed.fill(0, start, end);
      expect(() => decodeSubstrateFederatedCheckpointStatementV1(changed)).toThrow();
    }
    expect(() => decodeSubstrateFederatedCheckpointStatementV1(encoded.subarray(0, -1)))
      .toThrow(/exactly 512 bytes/);
    expect(() => buildSubstrateFederatedCheckpointStatementV1({
      ...input,
      burnLeafCount: 0,
    })).toThrow(/positive uint32/);
    expect(() => buildSubstrateFederatedCheckpointStatementV1({
      ...input,
      burnLeafCount: 257,
    })).toThrow(/supported bound/);
    expect(() => buildSubstrateFederatedCheckpointStatementV1({
      ...input,
      tokenAddressHex: input.bridgeAddressHex,
    })).toThrow(/distinct/);
    expect(() => buildSubstrateFederatedCheckpointStatementV1({
      ...input,
      bridgeRuntimeCodeBytes: 0,
    })).toThrow(/positive uint32/);
    expect(() => buildSubstrateFederatedCheckpointStatementV1({
      ...input,
      admissionExpiresAtErgoHeight: input.admissionValidFromErgoHeight,
    })).toThrow(/empty or inverted/);
    expect(() => buildSubstrateFederatedCheckpointStatementV1({
      ...input,
      admissionExpiresAtErgoHeight: '1075',
    })).toThrow(/exceeds/);

    for (const [offset, label] of [[452, 'source'], [486, 'Ergo']] as const) {
      const changed = Buffer.from(encoded);
      changed.writeUInt16BE(9, offset);
      expect(() => decodeSubstrateFederatedCheckpointStatementV1(changed))
        .toThrow(new RegExp(`${label} threshold.*supported bound`));
    }
  });

  it('binds both role profiles and applies an exclusive validity horizon', () => {
    const { profile, statement } = fixture();
    const encoded = Buffer.from(statement.encodedStatementHex, 'hex');

    for (const offset of [388, 420, 453, 454, 487, 495]) {
      const changed = Buffer.from(encoded);
      changed[offset] ^= 0x01;
      const decoded = decodeSubstrateFederatedCheckpointStatementV1(changed);
      expect(() => assertSubstrateFederatedCheckpointStatementV1MatchesProfile(
        decoded,
        profile,
      )).toThrow(/mismatch/);
    }
    const encodedStatement = statement.encodedStatementHex;
    expect(() => decodeSubstrateFederatedCheckpointStatementV1ForAdmission(
      encodedStatement,
      profile,
      '1009',
    )).toThrow(/Ergo admission horizon/);
    expect(() => decodeSubstrateFederatedCheckpointStatementV1ForAdmission(
      encodedStatement,
      profile,
      '1010',
    )).not.toThrow();
    expect(() => decodeSubstrateFederatedCheckpointStatementV1ForAdmission(
      encodedStatement,
      profile,
      '1059',
    )).not.toThrow();
    expect(() => decodeSubstrateFederatedCheckpointStatementV1ForAdmission(
      encodedStatement,
      profile,
      '1060',
    )).toThrow(/Ergo admission horizon/);

    const overlong = Buffer.from(encodedStatement, 'hex');
    overlong.writeBigUInt64BE(1075n, 504);
    expect(() => decodeSubstrateFederatedCheckpointStatementV1(overlong)).not.toThrow();
    expect(() => decodeSubstrateFederatedCheckpointStatementV1ForAdmission(
      overlong,
      profile,
      '1010',
    )).toThrow(/exceeds/);
  });

  it('rejects every valid but unexpected application binding at the consumer boundary', () => {
    const { input, statement } = fixture();
    const mutations: readonly Partial<SubstrateFederatedCheckpointStatementV1Input>[] = [
      { sourceNetworkIdHex: '0d'.repeat(32) },
      { sidechainIdHex: '0e'.repeat(32) },
      { sourceNativeBlockHeight: '1001' },
      { sourceNativeBlockHashHex: '0f'.repeat(32) },
      { executionBlockHashHex: '10'.repeat(32) },
      { bridgeEventRootHex: '11'.repeat(32) },
      { burnLeafCount: 4 },
      { bridgeAddressHex: '12'.repeat(20) },
      { tokenAddressHex: '13'.repeat(20) },
      { bridgeRuntimeCodeSha256Hex: '14'.repeat(32) },
      { bridgeRuntimeCodeBytes: 12346 },
      { tokenRuntimeCodeSha256Hex: '15'.repeat(32) },
      { tokenRuntimeCodeBytes: 6790 },
      { sourceRuntimeCodeSha256Hex: '16'.repeat(32) },
      { sourceRuntimeCodeBytes: 54322 },
      { runtimeProfileIdHex: '17'.repeat(32) },
      { settlementProfileIdHex: '18'.repeat(32) },
      { admissionValidFromErgoHeight: '1011' },
      { admissionExpiresAtErgoHeight: '1059' },
    ];

    for (const mutation of mutations) {
      expect(() => assertSubstrateFederatedCheckpointStatementV1Matches(
        statement,
        { ...input, ...mutation },
      )).toThrow(/expected bindings/);
    }

    const changedProfile = buildSubstrateFederatedCheckpointProfileV1({
      ...vector.input.profile,
      federationEpoch: '8',
    });
    expect(() => assertSubstrateFederatedCheckpointStatementV1Matches(
      statement,
      { ...input, profile: changedProfile },
    )).toThrow(/expected bindings/);
  });

  it('derives signing and anchor bytes only from a canonical statement encoding', () => {
    const { profile, statement } = fixture();
    const forged = {
      ...statement,
      bridgeEventRootHex: 'ff'.repeat(32),
      statementIdHex: 'ee'.repeat(32),
    };

    expect(() => deriveSubstrateFederatedCheckpointAttestationDigestHex(
      forged as unknown as string,
    )).toThrow(/bytes or hex/);
    expect(() => encodeSubstrateFederatedCheckpointExtensionValueV1(
      forged as unknown as string,
    )).toThrow(/bytes or hex/);

    const changedProfile = buildSubstrateFederatedCheckpointProfileV1({
      ...vector.input.profile,
      federationEpoch: '8',
    });
    const forgedProfileFields = {
      ...statement,
      federationProfileIdHex: changedProfile.profileIdHex,
      sourceAttestationKeySetDigestHex:
        changedProfile.sourceAttestationKeySetDigestHex,
      sourceAttestationThreshold: changedProfile.sourceAttestationThreshold,
      ergoAdmissionKeySetDigestHex: changedProfile.ergoAdmissionKeySetDigestHex,
      ergoAdmissionThreshold: changedProfile.ergoAdmissionThreshold,
      federationEpoch: changedProfile.federationEpoch,
    };
    expect(() => assertSubstrateFederatedCheckpointStatementV1MatchesProfile(
      forgedProfileFields,
      changedProfile,
    )).toThrow(/mismatch/);
    expect(() => assertSubstrateFederatedCheckpointStatementV1MatchesProfile(
      forgedProfileFields,
      profile,
    )).not.toThrow();
  });
});
