import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  decodeErgoUtxoStateRuntimeWitnessV1,
  deriveErgoUtxoStateRuntimeWitnessIdV1Hex,
  encodeErgoUtxoStateRuntimeWitnessV1,
  ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1_ID_HEX,
  ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
  type ErgoUtxoStateRuntimeWitnessInputV1,
} from './ergo-utxo-state-runtime-witness-v1.js';

interface DifferentialVector {
  readonly postTransitionRootHex: string;
  readonly proofHex: string;
  readonly lookups: readonly [
    Readonly<{ kind: 'membership'; keyHex: string; expectedValueHex: string }>,
    Readonly<{ kind: 'non-membership'; keyHex: string }>,
  ];
}

const vector = JSON.parse(readFileSync(new URL(
  '../../../wasm-avl/test-vectors/ergo-utxo-state-lookup-v1.json',
  import.meta.url,
), 'utf8')) as DifferentialVector;

const canonical: ErgoUtxoStateRuntimeWitnessInputV1 = {
  stateRootHex: vector.postTransitionRootHex,
  vaultBoxIdHex: vector.lookups[0].keyHex,
  refundableSourceBoxIdHex: vector.lookups[1].keyHex,
  expectedVaultBoxHex: vector.lookups[0].expectedValueHex,
  proofHex: vector.proofHex,
};

describe('Ergo UTXO state runtime witness V1', () => {
  it('freezes one bounded ordered lookup envelope', () => {
    const bytes = encodeErgoUtxoStateRuntimeWitnessV1(canonical);
    const decoded = decodeErgoUtxoStateRuntimeWitnessV1(bytes);
    expect(decoded).toMatchObject({
      status: 'NON_AUTHORIZING_ERGO_UTXO_RUNTIME_WITNESS_VERIFIED',
      formatFamilyIdHex: ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
      verifierProfileIdHex:
        ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1_ID_HEX,
      stateRootHex: canonical.stateRootHex,
      vaultBoxIdHex: canonical.vaultBoxIdHex,
      refundableSourceBoxIdHex: canonical.refundableSourceBoxIdHex,
      expectedVaultBoxHex: canonical.expectedVaultBoxHex,
      expectedVaultBoxLength: 175,
      proofLength: 280,
      authority: {
        stateRootConsensusAuthenticated: false,
        currentUtxoMembershipEstablished: false,
        runtimeAdmissionAuthorized: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        productionReady: false,
      },
    });
    expect(decoded.witnessIdHex)
      .toBe(deriveErgoUtxoStateRuntimeWitnessIdV1Hex(bytes));
    expect(encodeErgoUtxoStateRuntimeWitnessV1(canonical)).toEqual(bytes);
    expect(bytes).toHaveLength(652);
  });

  it('rejects root, key, value, proof-kind, and proof-byte drift independently', () => {
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1({
      ...canonical,
      stateRootHex: `00${canonical.stateRootHex.slice(2)}`,
    })).toThrow(/proof root disagrees/);
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1({
      ...canonical,
      vaultBoxIdHex: canonical.refundableSourceBoxIdHex,
    })).toThrow(/lookup keys must be distinct|vault bytes do not derive/);
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1({
      ...canonical,
      refundableSourceBoxIdHex: canonical.vaultBoxIdHex,
    })).toThrow(/lookup keys must be distinct/);
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1({
      ...canonical,
      expectedVaultBoxHex: `00${canonical.expectedVaultBoxHex.slice(2)}`,
    })).toThrow(/vault bytes do not derive/);

    const bytes = encodeErgoUtxoStateRuntimeWitnessV1(canonical);
    for (const offset of [127, 128]) {
      const mutant = Buffer.from(bytes);
      mutant[offset] ^= 3;
      expect(() => decodeErgoUtxoStateRuntimeWitnessV1(mutant))
        .toThrow(/lookup profile is unsupported/);
    }
    const proofMutant = Buffer.from(bytes);
    proofMutant[proofMutant.length - 2] ^= 1;
    expect(() => decodeErgoUtxoStateRuntimeWitnessV1(proofMutant)).toThrow();
  });

  it('rejects malformed trees and non-canonical direction framing before replay', () => {
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1({
      ...canonical,
      proofHex: canonical.proofHex.slice(0, -4),
    })).toThrow(/truncated|direction/);
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1({
      ...canonical,
      proofHex: `05${canonical.proofHex.slice(2)}`,
    })).toThrow(/invalid internal balance/);
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1({
      ...canonical,
      proofHex: `${canonical.proofHex}00`,
    })).toThrow(/unused direction bytes/);
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1({
      ...canonical,
      proofHex: `${canonical.proofHex.slice(0, -2)}80`,
    })).toThrow(/nonzero direction padding/);
  });

  it('rejects accessors, unknown fields, and non-canonical hexadecimal input', () => {
    const accessor = {
      ...canonical,
      get proofHex(): string {
        return canonical.proofHex;
      },
    };
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1(accessor))
      .toThrow(/enumerable data property/);
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1({
      ...canonical,
      ignored: true,
    } as never)).toThrow(/must contain exactly/);
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1(Object.assign(
      { ...canonical },
      { [Symbol('ignored')]: true },
    ) as never)).toThrow(/must contain exactly/);
    expect(() => encodeErgoUtxoStateRuntimeWitnessV1({
      ...canonical,
      stateRootHex: canonical.stateRootHex.toUpperCase(),
    })).toThrow(/invalid hexadecimal/);
  });
});
