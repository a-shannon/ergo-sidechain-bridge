import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  encodeErgoCompactDifficulty,
  verifyClaimedAutolykosV2ProofOfWork,
} from './ergo-settlement-core/ergo-autolykos-v2-header.js';
import {
  encodeErgoAutolykosV2RelayRuntimeWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-runtime-witness-v1.js';
import {
  buildErgoAutolykosV2RelayWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  computeErgoAutolykosV2SpvProfileId,
  computeErgoDifficultyContextDigest,
  type ErgoAutolykosV2SpvCheckpoint,
  type ErgoAutolykosV2SpvProfile,
} from './ergo-settlement-core/ergo-autolykos-v2-spv-branch.js';
import type { ErgoDifficultyHeader } from './ergo-settlement-core/ergo-eip37-difficulty.js';
import {
  computeErgoBlockTransactionsRoot,
  computeErgoTransactionWitnessId,
} from './ergo-settlement-core/ergo-block-transactions-root.js';
import {
  encodeCollByteRegister,
  encodeLongRegister,
} from './ergo-settlement-core/ergo-encoding.js';
import {
  computeErgoHeaderId,
  type ErgoHeaderIdentityFields,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  encodeErgoScorexTransactionRuntimeWitnessV1,
  type ErgoScorexTransactionRuntimeParserProfileV1,
  type ErgoScorexTransactionRuntimeWitnessInputV1,
} from './ergo-settlement-core/ergo-scorex-transaction-runtime-witness-v1.js';
import {
  assertFrontierErgoAutolykosCommittedVaultRuntimeStatementV2Matches,
  buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2,
  decodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2,
  deriveFrontierErgoAutolykosCommittedVaultRuntimeStatementIdV2Hex,
  encodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_PROOF_SYSTEM_ID_V2_HEX,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_PROFILE_ID_V2_HEX,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_BYTES,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_VERIFIER_PROFILE_ID_V2_HEX,
  FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCH_POLICY_ID_V2_HEX,
  type BuildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2Input,
} from './frontier-ergo-autolykos-committed-vault-runtime-derived-statement-v2.js';
import {
  decodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_STATEMENT_BYTES,
  FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
  FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
} from './frontier-ergo-autolykos-committed-vault-source-proof-v1.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const SOURCE_AMOUNT = 100_000_000n;
const SOURCE_LOCK_TREE = `0008cd02${'22'.repeat(32)}`;
const VAULT_TREE = `0008cd02${'11'.repeat(32)}`;
const RECIPIENT_H160 = '44'.repeat(20);
const DEPOSITOR_TREE = `0008cd02${'33'.repeat(32)}`;
const GENERATOR = Buffer.from(
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  'hex',
);
const NETWORK_ID = Buffer.from('66'.repeat(32), 'hex');
const GOLDEN_STATEMENT_HEX = readFileSync(new URL(
  '../test-vectors/frontier-ergo-autolykos-committed-vault-runtime-derived-statement-v2.hex',
  import.meta.url,
), 'utf8').trim();
const GOLDEN_RELAY_WITNESS_HEX = readFileSync(new URL(
  '../test-vectors/ergo-autolykos-v2-runtime-statement-v2-relay-witness-v1.hex',
  import.meta.url,
), 'utf8').trim();
const DIFFICULTY = 4n;
const NBITS = encodeErgoCompactDifficulty(DIFFICULTY);
const INTERVAL = 120_000n;
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: SOURCE_LOCK_TREE,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId:
    '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};

interface Fixture {
  readonly input: BuildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2Input;
  readonly transactionInput: ErgoScorexTransactionRuntimeWitnessInputV1;
}

let fixture: Fixture;

beforeAll(async () => {
  fixture = await buildFixture();
});

describe('Frontier Ergo Autolykos committed-vault runtime statement V2', () => {
  it('freezes one fixed statement derived only from verified runtime envelopes', () => {
    const candidate = buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
      fixture.input,
    );
    const bytes = Buffer.from(candidate.statementHex.slice(2), 'hex');
    expect(bytes).toHaveLength(
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_BYTES,
    );
    expect(bytes.toString('hex')).toBe(GOLDEN_STATEMENT_HEX);
    expect(Buffer.from(fixture.input.relayWitnessBytes).toString('hex'))
      .toBe(GOLDEN_RELAY_WITNESS_HEX);
    expect(decodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(bytes))
      .toEqual(candidate.statement);
    expect(encodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
      candidate.statement,
    )).toEqual(bytes);
    expect(assertFrontierErgoAutolykosCommittedVaultRuntimeStatementV2Matches(
      bytes,
      fixture.input,
    )).toEqual(candidate.statement);
    expect(candidate.statement).toMatchObject({
      proofSystemIdHex:
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_PROOF_SYSTEM_ID_V2_HEX,
      statementProfileIdHex:
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_PROFILE_ID_V2_HEX,
      suppliedBranchPolicyIdHex:
        FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCH_POLICY_ID_V2_HEX,
      verifierProfileIdHex:
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_VERIFIER_PROFILE_ID_V2_HEX,
      targetBlockVersion: 4,
      targetTransactionsRootHex:
        '0x60de6bd37e625419e282a58b95d82a2103aa460422a4f9be38f93ca706fbd045',
      transactionIdHex:
        '0xf4540c518ecba96efa9fb2aa658381ea01c865a13cfb94bb667c10c1cc6d1562',
      signedTransactionLength: 257,
      transactionWitnessLeafIdHex:
        '0x5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8',
      routeProfileIdHex: FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
      assetProfileIdHex: FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
      sourceBoxIdHex:
        '0x987ee35df12f3754ad68364ed454ce581bad419a51d16a916728230cbaf11d78',
      sourceBoxLength: 176,
      amountNanoErg: SOURCE_AMOUNT.toString(),
      recipientH160Hex: `0x${RECIPIENT_H160}`,
      vaultBoxIdHex:
        '0x4f78935151aad7a1a99af76b60a984ce11d3c2cc76a083cbdf64e5c479323bf6',
      authorityFlags: 0,
    });
    expect(candidate.authority).toEqual({
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
    expect({
      statementBytes: bytes.length,
      statementSha256Hex: sha256(bytes),
      statementIdHex: candidate.statementIdHex,
      proofSystemIdHex: candidate.statement.proofSystemIdHex,
      statementProfileIdHex: candidate.statement.statementProfileIdHex,
      suppliedBranchPolicyIdHex: candidate.statement.suppliedBranchPolicyIdHex,
      verifierProfileIdHex: candidate.statement.verifierProfileIdHex,
      relayWitnessIdHex: candidate.statement.relayWitnessIdHex,
      transactionWitnessIdHex: candidate.statement.transactionWitnessIdHex,
    }).toEqual({
      statementBytes: 978,
      statementSha256Hex:
        '6023edf6fb08fd01c48e9a5f57c128e321a06ae41213cd95152b26dcc4b2b991',
      statementIdHex:
        '0x4e2dbf7d271c4ab1e8ffc0229c79b127f36ab70adfa0bdaf75321dfd093f93d0',
      proofSystemIdHex:
        '0xca246e127abd78a5ec82d430a7c653c29bb6674aebacdd5065de337589aefca4',
      statementProfileIdHex:
        '0xfaf3547fb14aa43abb4f7e6a0bd11d56de4a8a8f46eb16b437df4b9aa3de0fa4',
      suppliedBranchPolicyIdHex:
        '0x874cfca9f96f1f7578dbcd697ef6c5f60664a74e4f92d9e5ee072e8234b46e24',
      verifierProfileIdHex:
        '0x62b4f1f892d9ae47ffcb284e791ebc412491dcee7ff434f62dba01ea3de9633c',
      relayWitnessIdHex:
        '0x091c7a5f46b962544988b3dbd7ceda5630d22ffcb37be48f02545f3c773033ee',
      transactionWitnessIdHex:
        '0xb4a285454e8d0595c2e7e2986c7d8a9abe9e61707a5153940491a765036195f4',
    });
  });

  it('joins target root and block version instead of trusting either envelope alone', () => {
    const rootDrift = clone(fixture.transactionInput) as MutableWitness;
    rootDrift.inputs[0]!.proofHex = 'aa';
    rebindSingleTransactionRoots(rootDrift);
    expect(() => buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2({
      ...fixture.input,
      transactionWitnessBytes:
        encodeErgoScorexTransactionRuntimeWitnessV1(rootDrift),
    })).toThrow(/disagree on target transactions root/);

    const versionDrift = clone(fixture.transactionInput) as MutableWitness;
    versionDrift.blockVersion = 3;
    expect(() => buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2({
      ...fixture.input,
      transactionWitnessBytes:
        encodeErgoScorexTransactionRuntimeWitnessV1(versionDrift),
    })).toThrow(/disagree on target block version/);
  });

  it.each([
    'sourceConsensusCandidateDigestHex',
    'committedVaultCandidateDigestHex',
    'wp01cVerificationDigestHex',
    'transactionSemanticsDigestHex',
    'sourceBoxContentDigestHex',
    'currentStateObservationDigestHex',
  ] as const)('rejects injected V1 process field %s', (field) => {
    expect(() => buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2({
      ...fixture.input,
      [field]: '00'.repeat(32),
    } as never)).toThrow(/must contain exactly/);
  });

  it('rejects static SPV, parser, route, and asset substitution', () => {
    expect(() => buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2({
      ...fixture.input,
      expectedSpvProfileIdHex: 'ff'.repeat(32),
    })).toThrow(/not statically registered/);

    expect(() => buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2({
      ...fixture.input,
      expectedTransactionProfile: {
        ...fixture.input.expectedTransactionProfile,
        changeErgoTreeHex: `0008cd02${'35'.repeat(32)}`,
      },
    })).toThrow(/not statically registered/);

    for (const field of ['routeProfileIdHex', 'assetProfileIdHex'] as const) {
      const profile = {
        ...fixture.input.expectedTransactionProfile,
        [field]: 'ff'.repeat(32),
      };
      const transaction = clone(fixture.transactionInput) as MutableWitness;
      transaction.profile = profile;
      expect(() => buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2({
        ...fixture.input,
        transactionWitnessBytes:
          encodeErgoScorexTransactionRuntimeWitnessV1(transaction),
        expectedTransactionProfile: profile,
      })).toThrow(/registered Frontier native-ERG compatibility profile/);
    }
  });

  it('rejects statement-to-witness rebinding across every deciding surface', () => {
    const candidate = buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
      fixture.input,
    );
    const bytes = Buffer.from(candidate.statementHex.slice(2), 'hex');
    const offsets = [
      161, // relay witness ID
      257, // transaction witness ID
      321, // source network
      353, // checkpoint ID
      389, // supplied branches digest
      423, // selected tip
      491, // target header
      528, // joined transactions root
      612, // transaction ID
      644, // signed transaction SHA-256
      679, // signed transaction length, least-significant byte
      680, // witness leaf
      775, // source box ID
      810, // source box length, least-significant byte
      816, // amount
      856, // recipient
      908, // vault box ID
    ];
    for (const offset of offsets) {
      const mutant = flipped(bytes, offset);
      expect(() => assertFrontierErgoAutolykosCommittedVaultRuntimeStatementV2Matches(
        mutant,
        fixture.input,
      )).toThrow(/does not match the exact witnesses/);
    }
  });

  it('rejects every nonzero authority or reserved flag bit', () => {
    const candidate = buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
      fixture.input,
    );
    const bytes = Buffer.from(candidate.statementHex.slice(2), 'hex');
    for (let bit = 0; bit < 16; bit += 1) {
      const mutant = Buffer.from(bytes);
      mutant.writeUInt16BE(1 << bit, 976);
      expect(() => decodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
        mutant,
      )).toThrow(/authority flags must remain zero/);
    }
  });

  it('keeps V1 and V2 decoding disjoint by exact length and domains', () => {
    const candidate = buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
      fixture.input,
    );
    const bytes = Buffer.from(candidate.statementHex.slice(2), 'hex');
    expect(() => decodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
      Buffer.alloc(
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_STATEMENT_BYTES,
      ),
    )).toThrow(/exactly 978 bytes/);
    expect(() => decodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex(
      `0x${bytes.toString('hex')}`,
    )).toThrow(/exactly 1065 bytes/);
  });

  it('does not alias caller-owned witnesses or returned statement objects', () => {
    const relay = Buffer.from(fixture.input.relayWitnessBytes);
    const transaction = Buffer.from(fixture.input.transactionWitnessBytes);
    const candidate = buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2({
      ...fixture.input,
      relayWitnessBytes: relay,
      transactionWitnessBytes: transaction,
    });
    const before = candidate.statementHex;
    relay.fill(0);
    transaction.fill(0);
    expect(candidate.statementHex).toBe(before);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.statement)).toBe(true);
    expect(deriveFrontierErgoAutolykosCommittedVaultRuntimeStatementIdV2Hex(
      Buffer.from(before.slice(2), 'hex'),
    )).toBe(candidate.statementIdHex);
  });
});

type MutableWitness = {
  -readonly [K in keyof ErgoScorexTransactionRuntimeWitnessInputV1]:
    K extends 'profile'
      ? { -readonly [P in keyof ErgoScorexTransactionRuntimeParserProfileV1]: string }
      : K extends 'inputs'
        ? Array<{ boxIdHex: string; proofHex: string; contextExtensionHex: string }>
        : K extends 'outputs'
          ? Array<{
            valueNanoErg: string;
            ergoTreeHex: string;
            creationHeight: number;
            registersHex: string[];
          }>
          : K extends 'transactionMerkleSiblingsHex' | 'witnessMerkleSiblingsHex'
            ? string[]
            : ErgoScorexTransactionRuntimeWitnessInputV1[K]
};

async function buildFixture(): Promise<Fixture> {
  const transaction = await buildTransactionWitness();
  const relay = buildRelayWitness(transaction.targetTransactionsRootHex);
  return {
    input: {
      relayWitnessBytes: relay.bytes,
      expectedSpvProfileIdHex: relay.spvProfileIdHex,
      transactionWitnessBytes: transaction.bytes,
      expectedTransactionProfile: transaction.profile,
    },
    transactionInput: transaction.input,
  };
}

async function buildTransactionWitness(): Promise<{
  readonly bytes: Buffer;
  readonly input: ErgoScorexTransactionRuntimeWitnessInputV1;
  readonly profile: ErgoScorexTransactionRuntimeParserProfileV1;
  readonly targetTransactionsRootHex: string;
}> {
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: SOURCE_AMOUNT,
      ergoTree: SOURCE_LOCK_TREE,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(RECIPIENT_H160, 'hex')),
        R5: encodeLongRegister(SOURCE_AMOUNT),
        R6: encodeCollByteRegister(GENERATOR),
        R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
      },
      creationHeight: 111,
    }, {
      value: SOURCE_AMOUNT,
      ergoTree: SOURCE_LOCK_TREE,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(RECIPIENT_H160, 'hex')),
        R5: encodeLongRegister(SOURCE_AMOUNT),
        R6: encodeCollByteRegister(GENERATOR),
        R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
      },
      creationHeight: 111,
    }, {
      value: SOURCE_AMOUNT,
      ergoTree: SOURCE_LOCK_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 111,
    }],
  }, 'runtime statement V2 source fixture');
  const sourceBox = funding.outputs[0]!;
  const feeBox = funding.outputs[2]!;
  const committed = await materializeUnsignedTransaction({
    inputs: [{ ...sourceBox, extension: {} }, { ...feeBox, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: SOURCE_AMOUNT,
      ergoTree: VAULT_TREE,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(sourceBox.boxId, 'hex')),
        R5: encodeCollByteRegister(Buffer.from(RECIPIENT_H160, 'hex')),
        R6: encodeLongRegister(SOURCE_AMOUNT),
        R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
      },
      creationHeight: 112,
    }, {
      value: SOURCE_AMOUNT,
      ergoTree: feeBox.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: 112,
    }],
  }, 'runtime statement V2 commitment fixture');
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const parsedSource = wasm.ErgoBox.from_json(JSON.stringify(sourceBox));
  const sourceBoxBytes = Buffer.from(parsedSource.sigma_serialize_bytes());
  parsedSource.free?.();
  const transactionId = Buffer.from(committed.txId, 'hex');
  const witnessLeafId = computeErgoTransactionWitnessId([
    Buffer.alloc(0),
    Buffer.alloc(0),
  ]);
  const targetTransactionsRootHex = computeErgoBlockTransactionsRoot({
    blockVersion: 4,
    transactions: [{
      transactionId,
      spendingProofs: [Buffer.alloc(0), Buffer.alloc(0)],
    }],
  }).toString('hex');
  const profile: ErgoScorexTransactionRuntimeParserProfileV1 = {
    routeProfileIdHex: FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
    assetProfileIdHex: FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
    sourceLockErgoTreeHex: SOURCE_LOCK_TREE,
    vaultErgoTreeHex: VAULT_TREE,
    changeErgoTreeHex: feeBox.ergoTree,
  };
  const input: ErgoScorexTransactionRuntimeWitnessInputV1 = {
    profile,
    blockVersion: 4,
    transactionIndex: 0,
    transactionCount: 1,
    inputs: committed.eip12Tx.inputs.map(value => ({
      boxIdHex: value.boxId,
      proofHex: '',
      contextExtensionHex: '00',
    })),
    outputs: committed.eip12Tx.outputs.map((output, index) => ({
      valueNanoErg: String(output.value),
      ergoTreeHex: output.ergoTree,
      creationHeight: output.creationHeight,
      registersHex: index === 0
        ? ['R4', 'R5', 'R6', 'R7'].map(key => output.additionalRegisters?.[key]!)
        : [],
    })),
    transactionMerkleSiblingsHex: [scorexLeafHash(witnessLeafId).toString('hex')],
    witnessMerkleSiblingsHex: [scorexLeafHash(transactionId).toString('hex')],
    sourceBoxHex: sourceBoxBytes.toString('hex'),
  };
  return {
    bytes: encodeErgoScorexTransactionRuntimeWitnessV1(input),
    input,
    profile,
    targetTransactionsRootHex,
  };
}

function buildRelayWitness(targetTransactionsRootHex: string): {
  readonly bytes: Buffer;
  readonly spvProfileIdHex: string;
} {
  const context: ErgoDifficultyHeader[] = [{
    height: 0,
    timestamp: 0n,
    nBits: NBITS,
  }];
  const checkpointHeader = baseHeader({
    height: 128,
    timestamp: 128n * INTERVAL,
    parentId: Buffer.from('aa'.repeat(32), 'hex'),
    salt: 0,
  });
  const checkpoint: ErgoAutolykosV2SpvCheckpoint = {
    sourceNetworkId: NETWORK_ID,
    header: checkpointHeader,
    difficultyContext: context,
  };
  const profile: ErgoAutolykosV2SpvProfile = {
    sourceNetworkId: NETWORK_ID,
    checkpointHeaderId: computeErgoHeaderId(checkpointHeader),
    checkpointDifficultyContextDigest: computeErgoDifficultyContextDigest(context),
    checkpointCumulativeWork: 10_000n,
    expectedHeaderVersion: 4,
    difficulty: {
      activationHeight: 1,
      epochLength: 128,
      useLastEpochs: 2,
      desiredBlockIntervalMs: INTERVAL,
      initialDifficulty: 1n,
    },
    requiredConfirmations: 2,
    maximumHeaders: 16,
    maximumFutureDriftMs: 10n * INTERVAL,
  };
  const target = mineHeader(baseHeader({
    height: 129,
    timestamp: checkpointHeader.timestamp + INTERVAL,
    parentId: computeErgoHeaderId(checkpointHeader),
    salt: 1,
    transactionsRoot: Buffer.from(targetTransactionsRootHex, 'hex'),
  }));
  const tip = mineHeader(baseHeader({
    height: 130,
    timestamp: target.timestamp + INTERVAL,
    parentId: computeErgoHeaderId(target),
    salt: 2,
  }));
  const witness = buildErgoAutolykosV2RelayWitnessV1({
    profile,
    checkpoint,
    currentBranch: {
      suffix: [target, tip],
      observedAtTimestamp: tip.timestamp,
    },
    competingBranches: [],
    targetHeader: target,
  });
  return {
    bytes: encodeErgoAutolykosV2RelayRuntimeWitnessV1(witness),
    spvProfileIdHex: computeErgoAutolykosV2SpvProfileId(profile).toString('hex'),
  };
}

function mineHeader(candidate: ErgoHeaderIdentityFields): ErgoHeaderIdentityFields {
  for (let nonce = 0n; nonce < 10_000n; nonce += 1n) {
    const nonceBytes = Buffer.alloc(8);
    nonceBytes.writeBigUInt64BE(nonce);
    const header = {
      ...candidate,
      powSolution: { ...candidate.powSolution, nonce: nonceBytes },
    };
    if (verifyClaimedAutolykosV2ProofOfWork(header)) return header;
  }
  throw new Error('runtime statement V2 test miner exhausted its nonce bound');
}

function baseHeader(input: {
  readonly height: number;
  readonly timestamp: bigint;
  readonly parentId: Uint8Array;
  readonly salt: number;
  readonly transactionsRoot?: Uint8Array;
}): ErgoHeaderIdentityFields {
  return {
    version: 4,
    parentId: Buffer.from(input.parentId),
    adProofsRoot: Buffer.alloc(32, input.salt + 1),
    stateRoot: Buffer.alloc(33, input.salt + 2),
    transactionsRoot: input.transactionsRoot === undefined
      ? Buffer.alloc(32, input.salt + 3)
      : Buffer.from(input.transactionsRoot),
    timestamp: input.timestamp,
    nBits: NBITS,
    height: input.height,
    extensionHash: Buffer.alloc(32, input.salt + 4),
    votes: Buffer.from('000000', 'hex'),
    powSolution: { publicKey: GENERATOR, nonce: Buffer.alloc(8) },
  };
}

function rebindSingleTransactionRoots(input: MutableWitness): void {
  input.transactionIndex = 0;
  input.transactionCount = 1;
  const transactionId = scorexBlake2b256(serializeFixtureTransaction(input, true));
  const witnessLeafId = computeErgoTransactionWitnessId(
    input.inputs.map(value => Buffer.from(value.proofHex, 'hex')),
  );
  input.transactionMerkleSiblingsHex = [scorexLeafHash(witnessLeafId).toString('hex')];
  input.witnessMerkleSiblingsHex = [scorexLeafHash(transactionId).toString('hex')];
}

function serializeFixtureTransaction(input: MutableWitness, proofless: boolean): Buffer {
  const chunks: Buffer[] = [scorexUnsignedVlq(BigInt(input.inputs.length))];
  for (const value of input.inputs) {
    const proof = proofless ? Buffer.alloc(0) : Buffer.from(value.proofHex, 'hex');
    chunks.push(
      Buffer.from(value.boxIdHex, 'hex'),
      scorexUnsignedVlq(BigInt(proof.length)),
      proof,
      Buffer.from(value.contextExtensionHex, 'hex'),
    );
  }
  chunks.push(
    scorexUnsignedVlq(0n),
    scorexUnsignedVlq(0n),
    scorexUnsignedVlq(BigInt(input.outputs.length)),
  );
  input.outputs.forEach(output => chunks.push(Buffer.concat([
    scorexUnsignedVlq(BigInt(output.valueNanoErg)),
    Buffer.from(output.ergoTreeHex, 'hex'),
    scorexUnsignedVlq(BigInt(output.creationHeight)),
    Buffer.from([0, output.registersHex.length]),
    ...output.registersHex.map(value => Buffer.from(value, 'hex')),
  ])));
  return Buffer.concat(chunks);
}

function scorexUnsignedVlq(value: bigint): Buffer {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
  return Buffer.from(bytes);
}

function scorexLeafHash(value: Buffer): Buffer {
  return scorexBlake2b256(Buffer.concat([Buffer.from([0]), value]));
}

function scorexBlake2b256(value: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, 32));
}

function flipped(value: Buffer, offset: number): Buffer {
  const result = Buffer.from(value);
  result[offset] ^= 0x01;
  return result;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
