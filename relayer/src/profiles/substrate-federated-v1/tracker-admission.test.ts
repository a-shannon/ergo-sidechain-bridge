import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  type SubstrateFederatedCheckpointProfileV1Input,
  type SubstrateFederatedCheckpointStatementV1Input,
} from './checkpoint-statement.js';
import {
  buildSubstrateFederatedTrackerAdmissionV1,
  decodeSubstrateFederatedTrackerValueV1,
  deriveSubstrateFederatedTrackerKeyV1Hex,
  SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
} from './tracker-admission.js';

interface TrackerVector {
  readonly schema: string;
  readonly status: string;
  readonly input: {
    readonly profile: SubstrateFederatedCheckpointProfileV1Input;
    readonly statement: Omit<SubstrateFederatedCheckpointStatementV1Input, 'profile'>;
    readonly tracker: {
      readonly trackerNftIdHex: string;
      readonly currentErgoHeight: number;
      readonly anchorHeaderIdHex: string;
      readonly anchorHeaderHeight: number;
    };
  };
  readonly expected: {
    readonly encodedProfileHex: string;
    readonly federationProfileIdHex: string;
    readonly sourceAttestationKeySetDigestHex: string;
    readonly ergoAdmissionKeySetDigestHex: string;
    readonly encodedStatementHex: string;
    readonly statementIdHex: string;
    readonly extensionKeyHex: string;
    readonly extensionValueHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
  };
  readonly boundaries: Readonly<Record<string, false>>;
}

const vector = JSON.parse(readFileSync(new URL(
  '../../../test-vectors/substrate-federated-v1-tracker-admission.json',
  import.meta.url,
), 'utf8')) as TrackerVector;

function fixture() {
  const profile = buildSubstrateFederatedCheckpointProfileV1(vector.input.profile);
  const statement = buildSubstrateFederatedCheckpointStatementV1({
    profile,
    ...vector.input.statement,
  });
  const admission = buildSubstrateFederatedTrackerAdmissionV1({
    profile,
    encodedStatementHex: statement.encodedStatementHex,
    currentErgoHeight: vector.input.tracker.currentErgoHeight,
    anchorHeaderIdHex: vector.input.tracker.anchorHeaderIdHex,
    anchorHeaderHeight: vector.input.tracker.anchorHeaderHeight,
  });
  return { profile, statement, admission };
}

describe('substrate-federated-v1 tracker admission', () => {
  it('matches the frozen key, value and 0x0401 bytes', () => {
    const { profile, statement, admission } = fixture();

    expect(vector.schema)
      .toBe('e2s.substrate-federated-v1-tracker-admission.golden-vector');
    expect(vector.status).toBe('federated_non_trustless_non_authorizing');
    expect(profile.encodedProfileHex).toBe(vector.expected.encodedProfileHex);
    expect(profile.profileIdHex).toBe(vector.expected.federationProfileIdHex);
    expect(profile.sourceAttestationKeySetDigestHex)
      .toBe(vector.expected.sourceAttestationKeySetDigestHex);
    expect(profile.ergoAdmissionKeySetDigestHex)
      .toBe(vector.expected.ergoAdmissionKeySetDigestHex);
    expect(statement.encodedStatementHex).toBe(vector.expected.encodedStatementHex);
    expect(statement.statementIdHex).toBe(vector.expected.statementIdHex);
    expect(admission.extensionKeyHex).toBe(vector.expected.extensionKeyHex);
    expect(admission.extensionValueHex).toBe(vector.expected.extensionValueHex);
    expect(admission.trackerKeyHex).toBe(vector.expected.trackerKeyHex);
    expect(admission.trackerValueHex).toBe(vector.expected.trackerValueHex);
    expect(deriveSubstrateFederatedTrackerKeyV1Hex({
      sourceNetworkIdHex: statement.sourceNetworkIdHex,
      sidechainIdHex: statement.sidechainIdHex,
      sourceNativeBlockHeight: statement.sourceNativeBlockHeight,
      sourceNativeBlockHashHex: statement.sourceNativeBlockHashHex,
      executionBlockHashHex: statement.executionBlockHashHex,
    })).toBe(admission.trackerKeyHex);
    expect(decodeSubstrateFederatedTrackerValueV1(
      admission.trackerValueHex,
    )).toEqual(expect.objectContaining({
      bridgeEventRootHex: statement.bridgeEventRootHex,
      statementIdHex: statement.statementIdHex,
      sourceNativeBlockHeight: statement.sourceNativeBlockHeight,
      sourceNativeBlockHashHex: statement.sourceNativeBlockHashHex,
      executionBlockHashHex: statement.executionBlockHashHex,
      federationProfileIdHex: profile.profileIdHex,
      ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
      ergoAdmissionThreshold: profile.ergoAdmissionThreshold,
      federationEpoch: profile.federationEpoch,
    }));
    expect(Buffer.from(admission.trackerValueHex, 'hex'))
      .toHaveLength(SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES);
    expect(Object.values(vector.boundaries).every(value => value === false)).toBe(true);
  });

  it('pins every 370-byte value field and leaves source authorization in the statement ID', () => {
    const { profile, statement, admission } = fixture();
    const value = Buffer.from(admission.trackerValueHex, 'hex');

    expect(value.subarray(0, 36).toString('ascii'))
      .toBe('E2S_SPV_SUBSTRATE_FEDERATED_VALUE_V1');
    expect([...value.subarray(36, 40)]).toEqual([1, 1, 1, 0]);
    expect(value.subarray(40, 72).toString('hex')).toBe(statement.bridgeEventRootHex);
    expect(value.subarray(72, 104).toString('hex')).toBe(statement.statementIdHex);
    expect(value.subarray(104, 136).toString('hex'))
      .toBe(vector.input.tracker.anchorHeaderIdHex);
    expect(value.readUInt32BE(136)).toBe(vector.input.tracker.anchorHeaderHeight);
    expect(value.readBigUInt64BE(140).toString()).toBe(statement.sourceNativeBlockHeight);
    expect(value.subarray(148, 180).toString('hex')).toBe(statement.sourceNativeBlockHashHex);
    expect(value.subarray(180, 212).toString('hex')).toBe(statement.executionBlockHashHex);
    expect(value.readUInt32BE(212)).toBe(statement.burnLeafCount);
    expect(value.subarray(216, 248).toString('hex')).toBe(statement.runtimeProfileIdHex);
    expect(value.subarray(248, 280).toString('hex')).toBe(statement.settlementProfileIdHex);
    expect(value.subarray(280, 312).toString('hex')).toBe(profile.profileIdHex);
    expect(value.subarray(312, 344).toString('hex'))
      .toBe(profile.ergoAdmissionKeySetDigestHex);
    expect(value.readUInt16BE(344)).toBe(profile.ergoAdmissionThreshold);
    expect(value.readBigUInt64BE(346).toString()).toBe(profile.federationEpoch);
    expect(value.readBigUInt64BE(354).toString())
      .toBe(statement.admissionValidFromErgoHeight);
    expect(value.readBigUInt64BE(362).toString())
      .toBe(statement.admissionExpiresAtErgoHeight);
    expect(value.toString('hex')).not.toContain(profile.sourceAttestationKeySetDigestHex);
  });

  it('fails closed on profile, horizon, anchor and signed-Long drift', () => {
    const { profile, statement } = fixture();
    const build = (overrides: Partial<Parameters<
      typeof buildSubstrateFederatedTrackerAdmissionV1
    >[0]> = {}) => buildSubstrateFederatedTrackerAdmissionV1({
      profile,
      encodedStatementHex: statement.encodedStatementHex,
      currentErgoHeight: vector.input.tracker.currentErgoHeight,
      anchorHeaderIdHex: vector.input.tracker.anchorHeaderIdHex,
      anchorHeaderHeight: vector.input.tracker.anchorHeaderHeight,
      ...overrides,
    });

    const otherProfile = buildSubstrateFederatedCheckpointProfileV1({
      ...vector.input.profile,
      federationEpoch: '8',
    });
    expect(() => build({ profile: otherProfile })).toThrow(/profile ID mismatch/);
    expect(() => build({ currentErgoHeight: 1_060 }))
      .toThrow(/outside its Ergo admission horizon/);
    expect(() => build({ anchorHeaderHeight: 1_009 }))
      .toThrow(/anchor is outside/);
    expect(() => build({ anchorHeaderHeight: 1_031 }))
      .toThrow(/exceeds the current/);
    expect(() => build({ anchorHeaderIdHex: '00'.repeat(32) }))
      .toThrow(/nonzero lowercase hex/);

    const oversized = Buffer.from(statement.encodedStatementHex, 'hex');
    oversized.writeBigUInt64BE(0x8000_0000_0000_0000n, 68);
    expect(() => build({ encodedStatementHex: oversized.toString('hex') }))
      .toThrow(/positive signed Long range/);
  });

  it('rejects non-canonical tracker values before they reach settlement', () => {
    const encoded = Buffer.from(fixture().admission.trackerValueHex, 'hex');
    for (const [offset, replacement] of [
      [36, 2],
      [37, 2],
      [38, 2],
      [39, 1],
    ] as const) {
      const mutated = Buffer.from(encoded);
      mutated[offset] = replacement;
      expect(() => decodeSubstrateFederatedTrackerValueV1(
        mutated.toString('hex'),
      )).toThrow(/discriminators/i);
    }
    const zeroStatement = Buffer.from(encoded);
    zeroStatement.fill(0, 72, 104);
    expect(() => decodeSubstrateFederatedTrackerValueV1(
      zeroStatement.toString('hex'),
    )).toThrow(/statement ID/i);

    const invalidHorizon = Buffer.from(encoded);
    invalidHorizon.writeBigUInt64BE(1_000n, 354);
    invalidHorizon.writeBigUInt64BE(1_000n, 362);
    expect(() => decodeSubstrateFederatedTrackerValueV1(
      invalidHorizon.toString('hex'),
    )).toThrow(/horizon/i);
  });
});
