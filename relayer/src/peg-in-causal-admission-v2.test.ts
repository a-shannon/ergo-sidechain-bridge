import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { derivePegInRuntimeRecordKeyV1Hex } from './peg-in-runtime-state.js';

const vector = JSON.parse(
  readFileSync(
    new URL('../test-vectors/peg-in-causal-admission-v2.json', import.meta.url),
    'utf8',
  ),
) as Record<string, any>;

describe('peg-in causal admission V2', () => {
  it('reproduces every canonical byte string and identifier', async () => {
    const api = await loadAdmissionApi();
    const profileHex = api.encodePegInCausalAdmissionProfileV2Hex(vector.profile);
    const sourceIntentHex = api.encodePegInSourceIntentV2Hex(vector.sourceIntent);
    const statementHex = api.encodePegInCausalAdmissionStatementV2Hex(vector.statement);
    const consumedHex = api.encodePegInConsumedAdmissionV2Hex(
      vector.transition.consumedAdmission,
    );

    expect(vector.schema).toBe('e2s.peg-in-causal-admission-vector.v2');
    expect(api.PEG_IN_CAUSAL_ADMISSION_PROFILE_V2_BYTES).toBe(
      vector.expected.profileBytes,
    );
    expect(api.PEG_IN_SOURCE_INTENT_V2_BYTES).toBe(
      vector.expected.sourceIntentBytes,
    );
    expect(api.PEG_IN_CAUSAL_ADMISSION_STATEMENT_V2_BYTES).toBe(
      vector.expected.statementBytes,
    );
    expect(api.PEG_IN_CONSUMED_ADMISSION_V2_BYTES).toBe(
      vector.expected.consumedAdmissionBytes,
    );
    expect(profileHex).toBe(vector.expected.profileHex);
    expect(sourceIntentHex).toBe(vector.expected.sourceIntentHex);
    expect(statementHex).toBe(vector.expected.statementHex);
    expect(consumedHex).toBe(vector.expected.consumedAdmissionHex);
    expect(api.decodePegInCausalAdmissionProfileV2Hex(profileHex)).toEqual(
      vector.profile,
    );
    expect(api.decodePegInSourceIntentV2Hex(sourceIntentHex)).toEqual(
      vector.sourceIntent,
    );
    expect(api.decodePegInCausalAdmissionStatementV2Hex(statementHex)).toEqual(
      vector.statement,
    );
    expect(api.decodePegInConsumedAdmissionV2Hex(consumedHex)).toEqual(
      vector.transition.consumedAdmission,
    );
    expect(api.derivePegInCausalAdmissionProfileIdV2Hex(vector.profile)).toBe(
      vector.expected.profileIdHex,
    );
    expect(api.derivePegInSourceIntentIdV2Hex(vector.sourceIntent)).toBe(
      vector.expected.sourceIntentIdHex,
    );
    expect(api.derivePegInCausalAdmissionIdV2Hex(vector.statement)).toBe(
      vector.expected.admissionIdHex,
    );
    expect(api.blake2b256Hex(consumedHex)).toBe(
      vector.expected.consumedAdmissionBlake2b256Hex,
    );
    expect(
      derivePegInRuntimeRecordKeyV1Hex({
        sidechainIdHex: vector.sourceIntent.sidechainIdHex,
        ergoBoxIdHex: vector.statement.sourceBoxIdHex,
      }),
    ).toBe(vector.expected.legacyMintIdentityHex);
    expect(() => api.assertPegInCausalAdmissionV2Bindings({
      profile: vector.profile,
      sourceIntent: vector.sourceIntent,
      statement: vector.statement,
    })).not.toThrow();
  });

  it('binds every profile and source-intent field without changing the V1 replay key', async () => {
    const api = await loadAdmissionApi();
    const baselineProfileId = api.derivePegInCausalAdmissionProfileIdV2Hex(
      vector.profile,
    );
    const profileMutations: Array<(value: any) => void> = [
      value => { value.sourceNetworkIdHex = repeatHex('21', 32); },
      value => { value.sidechainIdHex = repeatHex('23', 32); },
      value => { value.bridgeAddressHex = repeatHex('34', 20); },
      value => { value.tokenAddressHex = repeatHex('45', 20); },
      value => { value.settlementProfileIdHex = repeatHex('56', 32); },
      value => { value.sourceLockErgoTreeHashHex = repeatHex('c1', 32); },
      value => { value.vaultErgoTreeHashHex = repeatHex('f1', 32); },
      value => { value.finalityPolicyIdHex = repeatHex('67', 32); },
      value => { value.proofSystemIdHex = repeatHex('78', 32); },
      value => { value.proofProfileIdHex = repeatHex('89', 32); },
      value => { value.profileRevision = '4'; },
      value => { value.activationHeight = '1001'; },
    ];
    for (const mutate of profileMutations) {
      const candidate = clone(vector.profile);
      mutate(candidate);
      expect(api.derivePegInCausalAdmissionProfileIdV2Hex(candidate)).not.toBe(
        baselineProfileId,
      );
    }

    const baselineIntentId = api.derivePegInSourceIntentIdV2Hex(
      vector.sourceIntent,
    );
    const intentMutations: Array<(value: any) => void> = [
      value => { value.sourceNetworkIdHex = repeatHex('21', 32); },
      value => { value.sidechainIdHex = repeatHex('23', 32); },
      value => { value.bridgeAddressHex = repeatHex('34', 20); },
      value => { value.tokenAddressHex = repeatHex('45', 20); },
      value => { value.settlementProfileIdHex = repeatHex('56', 32); },
      value => { value.admissionProfileIdHex = repeatHex('70', 32); },
      value => { value.sourceAssetIdHex = repeatHex('01', 32); },
      value => { value.amountNanoErg = '2000001'; },
      value => { value.recipientAddressHex = repeatHex('9a', 20); },
    ];
    for (const mutate of intentMutations) {
      const candidate = clone(vector.sourceIntent);
      mutate(candidate);
      expect(api.derivePegInSourceIntentIdV2Hex(candidate)).not.toBe(
        baselineIntentId,
      );
      expect(() => api.assertPegInCausalAdmissionV2Bindings({
        profile: vector.profile,
        sourceIntent: candidate,
        statement: vector.statement,
      })).toThrow();
    }

    const rotatedProfile = { ...vector.profile, profileRevision: '4' };
    const rotatedProfileId = api.derivePegInCausalAdmissionProfileIdV2Hex(
      rotatedProfile,
    );
    const rotatedIntent = {
      ...vector.sourceIntent,
      admissionProfileIdHex: rotatedProfileId,
    };
    expect(api.derivePegInSourceIntentIdV2Hex(rotatedIntent)).not.toBe(
      baselineIntentId,
    );
    expect(
      derivePegInRuntimeRecordKeyV1Hex({
        sidechainIdHex: rotatedIntent.sidechainIdHex,
        ergoBoxIdHex: vector.statement.sourceBoxIdHex,
      }),
    ).toBe(vector.expected.legacyMintIdentityHex);
  });

  it('changes identity for every statement field and rejects inconsistent bindings', async () => {
    const api = await loadAdmissionApi();
    const baseline = api.derivePegInCausalAdmissionIdV2Hex(vector.statement);
    const statementMutations: Array<(value: any) => void> = [
      value => { value.sourceIntentIdHex = repeatHex('ab', 32); },
      value => { value.legacyMintIdentityHex = repeatHex('c4', 32); },
      value => { value.sourceBoxIdHex = repeatHex('a1', 32); },
      value => { value.sourceCreationTransactionIdHex = repeatHex('b1', 32); },
      value => { value.sourceOutputIndex = 2; },
      value => { value.sourceLockErgoTreeHashHex = repeatHex('c1', 32); },
      value => { value.commitmentTransactionIdHex = repeatHex('d1', 32); },
      value => { value.vaultOutputIndex = 1; },
      value => { value.vaultBoxIdHex = repeatHex('e1', 32); },
      value => { value.vaultErgoTreeHashHex = repeatHex('f1', 32); },
      value => { value.commitmentInclusionBlockIdHex = repeatHex('14', 32); },
      value => { value.commitmentInclusionHeight = '500001'; },
      value => { value.acceptanceCheckpointBlockIdHex = repeatHex('15', 32); },
      value => { value.acceptanceCheckpointHeight = '500012'; },
      value => { value.finalityPolicyIdHex = repeatHex('67', 32); },
      value => { value.requiredConfirmations = 11; },
    ];
    for (const mutate of statementMutations) {
      const candidate = clone(vector.statement);
      mutate(candidate);
      expect(api.derivePegInCausalAdmissionIdV2Hex(candidate)).not.toBe(baseline);
    }

    for (const mutate of [
      (value: any) => { value.sourceIntentIdHex = repeatHex('ab', 32); },
      (value: any) => { value.legacyMintIdentityHex = repeatHex('c4', 32); },
      (value: any) => { value.sourceBoxIdHex = repeatHex('a1', 32); },
      (value: any) => { value.sourceLockErgoTreeHashHex = repeatHex('c1', 32); },
      (value: any) => { value.vaultErgoTreeHashHex = repeatHex('f1', 32); },
      (value: any) => { value.finalityPolicyIdHex = repeatHex('67', 32); },
      (value: any) => { value.acceptanceCheckpointHeight = '500008'; },
      (value: any) => { value.requiredConfirmations = 13; },
    ]) {
      const candidate = clone(vector.statement);
      mutate(candidate);
      expect(() => api.assertPegInCausalAdmissionV2Bindings({
        profile: vector.profile,
        sourceIntent: vector.sourceIntent,
        statement: candidate,
      })).toThrow();
    }

    const exactDepth = {
      ...vector.statement,
      acceptanceCheckpointHeight: (
        BigInt(vector.statement.commitmentInclusionHeight)
        + BigInt(vector.statement.requiredConfirmations)
        - 1n
      ).toString(),
    };
    expect(() => api.assertPegInCausalAdmissionV2Bindings({
      profile: vector.profile,
      sourceIntent: vector.sourceIntent,
      statement: exactDepth,
    })).not.toThrow();
    expect(() => api.encodePegInCausalAdmissionStatementV2Hex({
      ...exactDepth,
      acceptanceCheckpointHeight: (
        BigInt(exactDepth.acceptanceCheckpointHeight) - 1n
      ).toString(),
    })).toThrow('required confirmations');
  });

  it('requires a new active profile identity for coordinated ErgoTree rotation', async () => {
    const api = await loadAdmissionApi();
    const rotatedProfile = {
      ...vector.profile,
      sourceLockErgoTreeHashHex: repeatHex('c1', 32),
      vaultErgoTreeHashHex: repeatHex('f1', 32),
      profileRevision: '4',
    };
    const rotatedProfileId = api.derivePegInCausalAdmissionProfileIdV2Hex(
      rotatedProfile,
    );
    const rotatedIntent = {
      ...vector.sourceIntent,
      admissionProfileIdHex: rotatedProfileId,
    };
    const rotatedStatement = {
      ...vector.statement,
      sourceIntentIdHex: api.derivePegInSourceIntentIdV2Hex(rotatedIntent),
      sourceLockErgoTreeHashHex: rotatedProfile.sourceLockErgoTreeHashHex,
      vaultErgoTreeHashHex: rotatedProfile.vaultErgoTreeHashHex,
    };

    expect(rotatedProfileId).not.toBe(vector.expected.profileIdHex);
    expect(rotatedStatement.sourceIntentIdHex).not.toBe(
      vector.expected.sourceIntentIdHex,
    );
    expect(() => api.assertPegInCausalAdmissionV2Bindings({
      profile: vector.profile,
      sourceIntent: rotatedIntent,
      statement: rotatedStatement,
    })).toThrow('exact causal admission profile');
    expect(() => api.assertPegInCausalAdmissionV2Bindings({
      profile: rotatedProfile,
      sourceIntent: rotatedIntent,
      statement: rotatedStatement,
    })).not.toThrow();
  });

  it('rejects unsupported, non-canonical, zero, overflow, and self-referential shapes', async () => {
    const api = await loadAdmissionApi();
    expect(() => api.encodePegInCausalAdmissionProfileV2Hex({
      ...vector.profile,
      formatVersion: 1,
    })).toThrow('format version');
    expect(() => api.encodePegInSourceIntentV2Hex({
      ...vector.sourceIntent,
      recipientAddressHex: repeatHex('00', 20),
    })).toThrow('recipient');
    expect(() => api.encodePegInSourceIntentV2Hex({
      ...vector.sourceIntent,
      amountNanoErg: '0',
    })).toThrow('amount');
    expect(() => api.encodePegInSourceIntentV2Hex({
      ...vector.sourceIntent,
      amountNanoErg: (1n << 64n).toString(),
    })).toThrow('uint64');
    expect(() => api.encodePegInSourceIntentV2Hex({
      ...vector.sourceIntent,
      amountNanoErg: (1n << 63n).toString(),
    })).toThrow('Ergo Long');
    expect(() => api.encodePegInCausalAdmissionStatementV2Hex({
      ...vector.statement,
      sourceOutputIndex: 2 ** 32,
    })).toThrow('uint32');
    expect(() => api.encodePegInCausalAdmissionStatementV2Hex({
      ...vector.statement,
      sourceCreationTransactionIdHex: vector.statement.commitmentTransactionIdHex,
    })).toThrow('distinct');
    expect(() => api.encodePegInCausalAdmissionStatementV2Hex({
      ...vector.statement,
      vaultBoxIdHex: vector.statement.sourceBoxIdHex,
    })).toThrow('distinct');
    expect(() => api.decodePegInSourceIntentV2Hex(
      vector.expected.sourceIntentHex.slice(2),
    )).toThrow('lowercase 0x-prefixed');
    expect(() => api.decodePegInCausalAdmissionStatementV2Hex(
      `${vector.expected.statementHex.slice(0, -2)}FF`,
    )).toThrow('lowercase 0x-prefixed');
    expect(() => api.decodePegInConsumedAdmissionV2Hex(
      `0x01${vector.expected.consumedAdmissionHex.slice(4)}`,
    )).toThrow('format version');
  });
});

async function loadAdmissionApi(): Promise<any> {
  let loaded: any;
  let failure: unknown;
  try {
    loaded = await import('./peg-in-causal-admission-v2.js');
  } catch (error) {
    failure = error;
  }
  expect(failure === undefined, `module load failed: ${String(failure)}`).toBe(true);
  return loaded;
}

function repeatHex(byte: string, bytes: number): string {
  return `0x${byte.repeat(bytes)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
