import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  encodeErgoUtxoStateRuntimeWitnessV1,
} from './ergo-settlement-core/ergo-utxo-state-runtime-witness-v1.js';
import {
  assertFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3Matches,
  buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3,
  decodeFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3,
  deriveFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementIdV3Hex,
  encodeFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_PROOF_SYSTEM_ID_V3_HEX,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_PROFILE_ID_V3_HEX,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_BYTES,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_VERIFIER_PROFILE_ID_V3_HEX,
  type BuildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3Input,
} from './frontier-ergo-autolykos-committed-vault-utxo-runtime-derived-statement-v3.js';
import {
  buildFrontierErgoUtxoRuntimeStatementV3Fixture,
  type FrontierErgoUtxoRuntimeStatementV3Fixture,
} from './test-fixtures/frontier-ergo-utxo-runtime-statement-v3-fixture.js';

const GOLDEN_RELAY = golden(
  'ergo-autolykos-v2-utxo-runtime-statement-v3-relay-witness-v1.hex',
);
const GOLDEN_UTXO = golden('ergo-utxo-state-runtime-witness-v1.hex');
const GOLDEN_STATEMENT = golden(
  'frontier-ergo-autolykos-committed-vault-utxo-runtime-derived-statement-v3.hex',
);
const PRE_UTXO_RELAY = golden(
  'ergo-autolykos-v2-runtime-statement-v2-relay-witness-v1.hex',
);

let fixture: Readonly<FrontierErgoUtxoRuntimeStatementV3Fixture>;

beforeAll(() => {
  fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
});

describe('Frontier Ergo committed-vault UTXO runtime statement V3', () => {
  it('freezes exact TypeScript relay, UTXO witness, and statement bytes', () => {
    expect(fixture.relayWitnessBytes).toEqual(GOLDEN_RELAY);
    expect(fixture.utxoWitnessBytes).toEqual(GOLDEN_UTXO);
    expect(fixture.statementBytes).toEqual(GOLDEN_STATEMENT);
    expect(fixture.statementBytes).toHaveLength(
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_BYTES,
    );
    const decoded =
      decodeFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(
        fixture.statementBytes,
      );
    expect(encodeFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(
      decoded,
    )).toEqual(fixture.statementBytes);
    expect(decoded).toMatchObject({
      proofSystemIdHex:
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_PROOF_SYSTEM_ID_V3_HEX,
      statementProfileIdHex:
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_PROFILE_ID_V3_HEX,
      verifierProfileIdHex:
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_VERIFIER_PROFILE_ID_V3_HEX,
      relayWitnessIdHex:
        '0654665402a37c2a99d92e76a4861c3c14b5db200db587e4ccac4c601633abd6',
      transactionWitnessIdHex:
        'b4a285454e8d0595c2e7e2986c7d8a9abe9e61707a5153940491a765036195f4',
      baseRuntimeStatementV2IdHex:
        'f724bd1bec79439674ffc8a812711690913c5f48085fc54a3f62296813009d49',
      utxoWitnessIdHex:
        'e7c82bef7d520d0f30d1122221f97f41ae1d275d495a5e5e41df517367fdebf5',
      targetHeaderIdHex:
        'e18adb07452aa006ab4367612b171af36835d18a5e712bd51806405571bff493',
      targetStateRootHex:
        '840d866bfe5cc593b4ad92f3091041914686eb20c7329abccd0e70727a2a56dd01',
      vaultBoxIdHex:
        '4f78935151aad7a1a99af76b60a984ce11d3c2cc76a083cbdf64e5c479323bf6',
      refundableSourceBoxIdHex:
        '987ee35df12f3754ad68364ed454ce581bad419a51d16a916728230cbaf11d78',
      expectedVaultBoxLength: 175,
      proofLength: 280,
      authorityFlags: 0,
    });
    expect({
      relaySha256Hex: sha256(fixture.relayWitnessBytes),
      utxoSha256Hex: sha256(fixture.utxoWitnessBytes),
      statementSha256Hex: sha256(fixture.statementBytes),
      statementIdHex:
        deriveFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementIdV3Hex(
          fixture.statementBytes,
        ),
    }).toEqual({
      relaySha256Hex:
        '6b7c9ec2d25b64a14806ff3c1127830baaafef741e2baca811d84b27d1f8c1a2',
      utxoSha256Hex:
        '1dacdf4bf5b1aecbb9d4cf04a1dc58a18b8a41ad1434a65ddf226a3fe2ffc900',
      statementSha256Hex:
        'f056021a81aea62331615de8e8b84aed2c6590bad29a73c9c3d083ee0d18aec6',
      statementIdHex:
        'c79f76fa360e7a798e9f8cbadded9d58dedab39bd1a55003e4a79f39f7de7100',
    });
  });

  it('keeps every authority boundary false after supplied-root replay', () => {
    const candidate =
      buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(input());
    expect(candidate.authority).toEqual({
      suppliedStateRootLookupsVerified: true,
      checkpointExternallyAuthenticated: false,
      completeCompetingBranchKnowledgeEstablished: false,
      globallyCanonicalErgoConsensusAccepted: false,
      deterministicFinalityEstablished: false,
      sourceTransactionExecutionValidated: false,
      currentUtxoMembershipEstablished: false,
      runtimeStateMutationAuthorized: false,
      runtimeAdmissionAuthorized: false,
      mintAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(assertFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3Matches(
      fixture.statementBytes,
      input(),
    )).toEqual(candidate.statement);
  });

  it('rejects non-data and symbol-keyed statement inputs', () => {
    const accessorInput = { ...input() };
    Object.defineProperty(accessorInput, 'utxoWitnessBytes', {
      enumerable: true,
      get: () => fixture.utxoWitnessBytes,
    });
    expect(() =>
      buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(accessorInput),
    ).toThrow(/enumerable data property/);

    const symbolInput = Object.assign(
      { ...input() },
      { [Symbol('unregistered-authority')]: true },
    );
    expect(() =>
      buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(symbolInput),
    ).toThrow(/must contain exactly/);
  });

  it('rejects a valid but stale root and a valid proof for a different source key', () => {
    expect(() => buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3({
      ...input(),
      relayWitnessBytes: PRE_UTXO_RELAY,
    })).toThrow(/state root does not match the selected target header/);

    const differentSource = `${fixture.utxoInput.refundableSourceBoxIdHex.slice(0, -2)}79`;
    const otherKeyWitness = encodeErgoUtxoStateRuntimeWitnessV1({
      ...fixture.utxoInput,
      refundableSourceBoxIdHex: differentSource,
    });
    expect(() => buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3({
      ...input(),
      utxoWitnessBytes: otherKeyWitness,
    })).toThrow(/source key does not match the transaction witness/);
  });

  it('isolates every statement binding and all three witness identities', () => {
    for (const [label, offset] of [
      ['format', 0],
      ['proof system', 1],
      ['statement profile', 33],
      ['branch policy', 65],
      ['verifier profile', 97],
      ['relay family', 129],
      ['relay witness', 161],
      ['transaction family', 193],
      ['transaction witness', 225],
      ['base V2 statement', 257],
      ['UTXO family', 289],
      ['UTXO witness', 321],
      ['UTXO verifier', 353],
      ['target header', 385],
      ['target state root', 417],
      ['vault box', 450],
      ['source box', 482],
      ['vault value digest', 514],
      ['vault value length', 549],
      ['proof digest', 550],
      ['proof length', 585],
      ['authority flags', 587],
    ] as const) {
      const mutant = Buffer.from(fixture.statementBytes);
      mutant[offset] ^= 1;
      expect(() =>
        assertFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3Matches(
          mutant,
          input(),
        ), label).toThrow();
    }

    for (const [label, field] of [
      ['relay', 'relayWitnessBytes'],
      ['transaction', 'transactionWitnessBytes'],
      ['UTXO', 'utxoWitnessBytes'],
    ] as const) {
      const mutant = Buffer.from(input()[field]);
      mutant[16] ^= 1;
      expect(() =>
        assertFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3Matches(
          fixture.statementBytes,
          { ...input(), [field]: mutant },
        ), label).toThrow();
    }
  });
});

function input(): BuildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3Input {
  return {
    relayWitnessBytes: fixture.relayWitnessBytes,
    expectedSpvProfileIdHex: fixture.expectedSpvProfileIdHex,
    transactionWitnessBytes: fixture.transactionWitnessBytes,
    expectedTransactionProfile: fixture.expectedTransactionProfile,
    utxoWitnessBytes: fixture.utxoWitnessBytes,
  };
}

function golden(name: string): Buffer {
  return Buffer.from(readFileSync(new URL(`../test-vectors/${name}`, import.meta.url),
    'utf8').trim(), 'hex');
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
