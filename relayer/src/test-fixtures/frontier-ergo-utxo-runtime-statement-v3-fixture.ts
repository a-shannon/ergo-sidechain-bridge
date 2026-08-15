import { readFileSync } from 'node:fs';

import {
  encodeErgoCompactDifficulty,
  verifyClaimedAutolykosV2ProofOfWork,
} from '../ergo-settlement-core/ergo-autolykos-v2-header.js';
import {
  encodeErgoAutolykosV2RelayRuntimeWitnessV1,
} from '../ergo-settlement-core/ergo-autolykos-v2-relay-runtime-witness-v1.js';
import {
  buildErgoAutolykosV2RelayWitnessV1,
} from '../ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  computeErgoAutolykosV2SpvProfileId,
  computeErgoDifficultyContextDigest,
  type ErgoAutolykosV2SpvCheckpoint,
  type ErgoAutolykosV2SpvProfile,
} from '../ergo-settlement-core/ergo-autolykos-v2-spv-branch.js';
import type { ErgoDifficultyHeader } from '../ergo-settlement-core/ergo-eip37-difficulty.js';
import {
  computeErgoHeaderId,
  type ErgoHeaderIdentityFields,
} from '../ergo-settlement-core/ergo-header-id.js';
import {
  decodeErgoScorexTransactionRuntimeWitnessV1,
  type ErgoScorexTransactionRuntimeParserProfileV1,
} from '../ergo-settlement-core/ergo-scorex-transaction-runtime-witness-v1.js';
import {
  encodeErgoUtxoStateRuntimeWitnessV1,
  type ErgoUtxoStateRuntimeWitnessInputV1,
} from '../ergo-settlement-core/ergo-utxo-state-runtime-witness-v1.js';
import {
  buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3,
} from '../frontier-ergo-autolykos-committed-vault-utxo-runtime-derived-statement-v3.js';
import {
  FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
  FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
} from '../frontier-ergo-autolykos-committed-vault-source-proof-v1.js';

const SOURCE_LOCK_TREE = `0008cd02${'22'.repeat(32)}`;
const VAULT_TREE = `0008cd02${'11'.repeat(32)}`;
const GENERATOR = Buffer.from(
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  'hex',
);
const NETWORK_ID = Buffer.from('66'.repeat(32), 'hex');
const DIFFICULTY = 4n;
const NBITS = encodeErgoCompactDifficulty(DIFFICULTY);
const INTERVAL = 120_000n;

interface DifferentialVector {
  readonly postTransitionRootHex: string;
  readonly proofHex: string;
  readonly lookups: readonly [
    Readonly<{ kind: 'membership'; keyHex: string; expectedValueHex: string }>,
    Readonly<{ kind: 'non-membership'; keyHex: string }>,
  ];
}

export interface FrontierErgoUtxoRuntimeStatementV3Fixture {
  readonly relayWitnessBytes: Buffer;
  readonly transactionWitnessBytes: Buffer;
  readonly utxoWitnessBytes: Buffer;
  readonly statementBytes: Buffer;
  readonly statementIdHex: string;
  readonly expectedSpvProfileIdHex: string;
  readonly expectedTransactionProfile: ErgoScorexTransactionRuntimeParserProfileV1;
  readonly utxoInput: ErgoUtxoStateRuntimeWitnessInputV1;
}

export function buildFrontierErgoUtxoRuntimeStatementV3Fixture():
Readonly<FrontierErgoUtxoRuntimeStatementV3Fixture> {
  const vector = JSON.parse(readFileSync(new URL(
    '../../../wasm-avl/test-vectors/ergo-utxo-state-lookup-v1.json',
    import.meta.url,
  ), 'utf8')) as DifferentialVector;
  const transactionWitnessBytes = Buffer.from(readFileSync(new URL(
    '../../test-vectors/ergo-scorex-transaction-runtime-witness-v1.hex',
    import.meta.url,
  ), 'utf8').trim(), 'hex');
  const expectedTransactionProfile: ErgoScorexTransactionRuntimeParserProfileV1 = {
    routeProfileIdHex: FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
    assetProfileIdHex: FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
    sourceLockErgoTreeHex: SOURCE_LOCK_TREE,
    vaultErgoTreeHex: VAULT_TREE,
    changeErgoTreeHex: SOURCE_LOCK_TREE,
  };
  const transaction = decodeErgoScorexTransactionRuntimeWitnessV1(
    transactionWitnessBytes,
    expectedTransactionProfile,
  );
  const relay = buildRelayWitness(
    transaction.targetTransactionsRootHex,
    vector.postTransitionRootHex,
  );
  const utxoInput: ErgoUtxoStateRuntimeWitnessInputV1 = {
    stateRootHex: vector.postTransitionRootHex,
    vaultBoxIdHex: vector.lookups[0].keyHex,
    refundableSourceBoxIdHex: vector.lookups[1].keyHex,
    expectedVaultBoxHex: vector.lookups[0].expectedValueHex,
    proofHex: vector.proofHex,
  };
  const utxoWitnessBytes = encodeErgoUtxoStateRuntimeWitnessV1(utxoInput);
  const candidate =
    buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3({
      relayWitnessBytes: relay.bytes,
      expectedSpvProfileIdHex: relay.spvProfileIdHex,
      transactionWitnessBytes,
      expectedTransactionProfile,
      utxoWitnessBytes,
    });
  return Object.freeze({
    relayWitnessBytes: relay.bytes,
    transactionWitnessBytes,
    utxoWitnessBytes,
    statementBytes: Buffer.from(candidate.statementHex.slice(2), 'hex'),
    statementIdHex: candidate.statementIdHex,
    expectedSpvProfileIdHex: relay.spvProfileIdHex,
    expectedTransactionProfile,
    utxoInput,
  });
}

function buildRelayWitness(
  targetTransactionsRootHex: string,
  targetStateRootHex: string,
): { readonly bytes: Buffer; readonly spvProfileIdHex: string } {
  const context: ErgoDifficultyHeader[] = [{ height: 0, timestamp: 0n, nBits: NBITS }];
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
    stateRoot: Buffer.from(targetStateRootHex, 'hex'),
  }));
  const tip = mineHeader(baseHeader({
    height: 130,
    timestamp: target.timestamp + INTERVAL,
    parentId: computeErgoHeaderId(target),
    salt: 2,
  }));
  return {
    bytes: encodeErgoAutolykosV2RelayRuntimeWitnessV1(
      buildErgoAutolykosV2RelayWitnessV1({
        profile,
        checkpoint,
        currentBranch: { suffix: [target, tip], observedAtTimestamp: tip.timestamp },
        competingBranches: [],
        targetHeader: target,
      }),
    ),
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
  throw new Error('UTXO runtime statement V3 test miner exhausted its nonce bound');
}

function baseHeader(input: {
  readonly height: number;
  readonly timestamp: bigint;
  readonly parentId: Uint8Array;
  readonly salt: number;
  readonly transactionsRoot?: Uint8Array;
  readonly stateRoot?: Uint8Array;
}): ErgoHeaderIdentityFields {
  return {
    version: 4,
    parentId: Buffer.from(input.parentId),
    adProofsRoot: Buffer.alloc(32, input.salt + 1),
    stateRoot: input.stateRoot === undefined
      ? Buffer.alloc(33, input.salt + 2)
      : Buffer.from(input.stateRoot),
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
