import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from './ergo-settlement-core/ergo-encoding.js';
import {
  buildAggregateFinalityCommitmentV1,
} from './profiles/substrate-grandpa-v1/bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './profiles/substrate-grandpa-v1/bridge-finality-proof.js';
import {
  buildBridgeCheckpointCommitmentV1,
} from './profiles/substrate-grandpa-v1/bridge-checkpoint-commitment.js';
import {
  buildAuthenticatedSettlementExternalFeePlan,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-external-fee-plan.js';
import {
  buildAuthenticatedSettlementExternalFeePacket,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-external-fee-transaction.js';
import {
  assertAuthenticatedSettlementExternalFeeVmCandidateDigest,
  assertAuthenticatedSettlementExternalFeeVmCandidateProvenance,
  buildAuthenticatedSettlementExternalFeeVmCandidate,
} from './authenticated-settlement-external-fee-vm-candidate.js';
import {
  EMPTY_AVL_DIGEST,
  MINER_FEE,
} from './profiles/substrate-grandpa-v1/ergo-settlement-policy.js';
import {
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerAvlRegister,
  encodeAuthenticatedSpvTrackerValue,
} from './profiles/substrate-grandpa-v1/spv-tracker-authenticated.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
} from './profiles/substrate-grandpa-v1/trustless-burn-proof.js';
import { parseStrictJson } from './strict-json.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';

export const AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_JVM_FIXTURE_V1_SCHEMA =
  'e2s.authenticated-external-fee-settlement-jvm-fixture.v1' as const;
export const AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_JVM_COMPILER_RECEIPT_V1_SCHEMA =
  'e2s.authenticated-external-fee-settlement-jvm-compiler-receipt.v1' as const;
export const AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_SIGMASTATE_COMMIT =
  'f78deadd668f801e7fae3bc884283f79c6f484fa' as const;

const COMPILER_SPEC_SHA256 =
  '81c4e0ec79f7fb861c2de9be4f71858866aab50779298e72f82ec192e17dedbb';
const UNLOCK_TEMPLATE_PATH =
  'contracts/MainChainAggregateUnlockAuthenticatedExternalFeeV1.es';
const DUP_TEMPLATE_PATH =
  'contracts/DoubleUnlockPreventionAuthenticatedExternalFeeV1.es';
const UNLOCK_TEMPLATE_SHA256 =
  '3e0807ad84dac5ed9dcacd78beeec82650367aa3c04614ea9a10b6d9c8f0947e';
const DUP_TEMPLATE_SHA256 =
  '9ffc36b1fde633cfd8ee60442bb4c363c593d98d95605f71a89505db8b5fcf3e';
const OLD_DUP_TEMPLATE_SHA256 =
  'c4947b034b40ebf8c6385d48da1e8c109a98958cb9c1d5431b9714853ad24a33';
const OLD_DUP_PROPOSITION_BLAKE2B256 =
  'f402b053feea363a179bc7adabcc804050aba973126743be37f3306522bd341e';
const MAX_COMPILER_RECEIPT_BYTES = 64 * 1024;

const SIDECHAIN_ID_HEX = '11'.repeat(32);
const EXECUTION_BLOCK_HASH_HEX = '22'.repeat(32);
const SIDECHAIN_HEIGHT = 1_024n;
const SIDECHAIN_TX_HASH_HEX = '33'.repeat(32);
const SIDECHAIN_LOG_INDEX = 7;
const TRACKER_NFT_ID = 'aa'.repeat(32);
const DUP_NFT_ID = 'bb'.repeat(32);
const TRACKER_TREE = '10010100d17300';
const RECIPIENT_TREE =
  '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const EXTERNAL_FEE_TREE =
  '0008cd02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
const RECIPIENT_HASH_HEX = blake2b256Hex(Buffer.from(RECIPIENT_TREE, 'hex'));
const CURRENT_ERGO_HEIGHT = 900_020;
const INPUT_CREATION_HEIGHT = 900_000;
const PAYOUT_AMOUNT = 2_000_000n;
const PARTIAL_VAULT_VALUE = 5_000_000n;
const TERMINAL_VAULT_VALUE = PAYOUT_AMOUNT;
const FINALITY_ATTESTOR_METADATA = encodeSigmaPropRegister(
  '02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5',
);
const BRIDGE_COMMITTEE_METADATA = encodeSigmaPropRegister(
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
);

const BOUNDARIES = Object.freeze({
  nodeCheckPerformed: false,
  signingAuthorityEstablished: false,
  submissionAuthorityEstablished: false,
  broadcastAuthorityEstablished: false,
  fundsAuthorityEstablished: false,
  gate5Closed: false,
  trustlessStatusEstablished: false,
  productionReadinessEstablished: false,
} as const);

interface CompilerContractIdentity {
  propositionHex: string;
  propositionBytes: number;
  propositionSha256Hex: string;
  propositionBlake2b256Hex: string;
}

interface CompilerReceiptContract extends CompilerContractIdentity {
  templatePath: string;
  templateSha256Hex: string;
  resolvedSourceSha256Hex: string;
}

interface ParsedCompilerReceipt {
  sha256Hex: string;
  contracts: {
    mainChainAggregateUnlockAuthenticatedExternalFee:
      CompilerReceiptContract;
    doubleUnlockPreventionAuthenticatedExternalFee:
      CompilerReceiptContract;
  };
}

export interface AuthenticatedExternalFeeSettlementJvmFixtureCaseV1 {
  kind: 'partialVault' | 'terminalVault';
  prooflessTransactionHex: string;
  prooflessTransactionIdHex: string;
  inputBoxSigmaHex: [string, string, string];
  dataInputBoxSigmaHex: [string];
}

export interface AuthenticatedExternalFeeSettlementJvmFixtureV1 {
  schema: typeof AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_JVM_FIXTURE_V1_SCHEMA;
  version: 1;
  sigmaStateCommit:
    typeof AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_SIGMASTATE_COMMIT;
  compilerReceiptSha256Hex: string;
  currentErgoHeight: number;
  bindings: {
    trackerNftIdHex: string;
    duplicatePreventionNftIdHex: string;
  };
  contracts: {
    mainChainAggregateUnlockAuthenticatedExternalFee:
      CompilerContractIdentity;
    doubleUnlockPreventionAuthenticatedExternalFee:
      CompilerContractIdentity;
  };
  cases: [
    AuthenticatedExternalFeeSettlementJvmFixtureCaseV1,
    AuthenticatedExternalFeeSettlementJvmFixtureCaseV1,
  ];
  boundaries: typeof BOUNDARIES;
}

export async function buildAuthenticatedExternalFeeSettlementJvmFixtureV1(
  compilerReceiptSource: string,
): Promise<Readonly<AuthenticatedExternalFeeSettlementJvmFixtureV1>> {
  const compilerReceipt = parseCompilerReceipt(compilerReceiptSource);
  const partial = await buildCase(
    'partialVault',
    PARTIAL_VAULT_VALUE,
    compilerReceipt,
  );
  const terminal = await buildCase(
    'terminalVault',
    TERMINAL_VAULT_VALUE,
    compilerReceipt,
  );
  return deepFreeze({
    schema: AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_JVM_FIXTURE_V1_SCHEMA,
    version: 1 as const,
    sigmaStateCommit:
      AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_SIGMASTATE_COMMIT,
    compilerReceiptSha256Hex: compilerReceipt.sha256Hex,
    currentErgoHeight: CURRENT_ERGO_HEIGHT,
    bindings: {
      trackerNftIdHex: TRACKER_NFT_ID,
      duplicatePreventionNftIdHex: DUP_NFT_ID,
    },
    contracts: {
      mainChainAggregateUnlockAuthenticatedExternalFee:
        publicContractIdentity(
          compilerReceipt.contracts
            .mainChainAggregateUnlockAuthenticatedExternalFee,
        ),
      doubleUnlockPreventionAuthenticatedExternalFee:
        publicContractIdentity(
          compilerReceipt.contracts
            .doubleUnlockPreventionAuthenticatedExternalFee,
        ),
    },
    cases: [partial, terminal],
    boundaries: { ...BOUNDARIES },
  });
}

async function buildCase(
  kind: AuthenticatedExternalFeeSettlementJvmFixtureCaseV1['kind'],
  vaultValue: bigint,
  compilerReceipt: ParsedCompilerReceipt,
): Promise<AuthenticatedExternalFeeSettlementJvmFixtureCaseV1> {
  const burnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainTxHashHex: SIDECHAIN_TX_HASH_HEX,
    eventIndex: SIDECHAIN_LOG_INDEX,
  });
  const leaf = encodeTrustlessBurnLeaf({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
    burnIdHex,
    sidechainTxHashHex: SIDECHAIN_TX_HASH_HEX,
    eventIndex: SIDECHAIN_LOG_INDEX,
    recipientErgoTreeHashHex: RECIPIENT_HASH_HEX,
    amountNanoErg: PAYOUT_AMOUNT,
  });
  const trackerKeyHex = deriveAuthenticatedSpvTrackerKey({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainHeight: SIDECHAIN_HEIGHT,
    executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
  });
  const plan = buildAuthenticatedSettlementExternalFeePlan({
    spvHistory: [{
      key: trackerKeyHex,
      value: canonicalTrackerValue(leaf.leafHashHex),
    }],
    dupHistoryKeys: [],
    claim: {
      pegOut: {
        user: '0x0000000000000000000000000000000000000001',
        amount: PAYOUT_AMOUNT,
        ergoRecipientAddress: RECIPIENT_TREE,
        sidechainTxHash: SIDECHAIN_TX_HASH_HEX,
        sidechainBlockNumber: Number(SIDECHAIN_HEIGHT),
        sidechainLogIndex: SIDECHAIN_LOG_INDEX,
      },
      trackerIdentity: {
        sidechainIdHex: SIDECHAIN_ID_HEX,
        sidechainHeight: SIDECHAIN_HEIGHT,
        sidechainHeaderHashHex: EXECUTION_BLOCK_HASH_HEX,
      },
      settlementIdentity: {
        source: 'trustless-burn-leaf',
        duplicatePreventionKeyHex: burnIdHex,
        bridgeEventRootHex: leaf.leafHashHex,
        recipientErgoTreeHashHex: RECIPIENT_HASH_HEX,
        amountNanoErg: PAYOUT_AMOUNT,
        trustlessBurnProof: [],
      },
    },
  });

  const trackerDataInput = await syntheticBox({
    value: 1_000_000n,
    ergoTree: TRACKER_TREE,
    assets: [{ tokenId: TRACKER_NFT_ID, amount: '1' }],
    additionalRegisters: {
      R4: encodeLongRegister(1),
      R5: encodeAuthenticatedSpvTrackerAvlRegister(plan.trackerInputDigestHex),
      R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID_HEX, 'hex')),
      R7: encodeLongRegister(SIDECHAIN_HEIGHT),
      R8: encodeIntRegister(900_001),
      R9: FINALITY_ATTESTOR_METADATA,
    },
    transactionByte: kind === 'partialVault' ? 0x10 : 0x11,
  });
  const duplicatePreventionBox = await syntheticBox({
    value: 1_000_000n,
    ergoTree: compilerReceipt.contracts
      .doubleUnlockPreventionAuthenticatedExternalFee.propositionHex,
    assets: [{ tokenId: DUP_NFT_ID, amount: '1' }],
    additionalRegisters: {
      R4: encodeLongRegister(3),
      R5: encodeAvlTreeRegister(
        Buffer.from(EMPTY_AVL_DIGEST, 'hex'),
        0x0b,
        1,
      ),
      R6: BRIDGE_COMMITTEE_METADATA,
    },
    transactionByte: kind === 'partialVault' ? 0x20 : 0x21,
  });
  const vaultRegisters = {
    R4: encodeCollByteRegister(Buffer.from('31'.repeat(32), 'hex')),
    R5: encodeCollByteRegister(Buffer.from('77'.repeat(20), 'hex')),
    R6: encodeLongRegister(vaultValue),
    R7: encodeCollByteRegister(Buffer.from(RECIPIENT_TREE, 'hex')),
  };
  const vaultBox = await syntheticBox({
    value: vaultValue,
    ergoTree: compilerReceipt.contracts
      .mainChainAggregateUnlockAuthenticatedExternalFee.propositionHex,
    additionalRegisters: vaultRegisters,
    transactionByte: kind === 'partialVault' ? 0x30 : 0x31,
  });
  const externalFeeBox = await syntheticBox({
    value: BigInt(MINER_FEE),
    ergoTree: EXTERNAL_FEE_TREE,
    additionalRegisters: {},
    transactionByte: kind === 'partialVault' ? 0x40 : 0x41,
  });
  const packet = buildAuthenticatedSettlementExternalFeePacket({
    contractIdentities: {
      spvTrackerAuthenticated: {
        nftId: TRACKER_NFT_ID,
        ergoTreeHex: TRACKER_TREE,
      },
      doubleUnlockPreventionAuthenticatedExternalFee: {
        nftId: DUP_NFT_ID,
        ergoTreeHex: compilerReceipt.contracts
          .doubleUnlockPreventionAuthenticatedExternalFee.propositionHex,
      },
      mainChainAggregateUnlockAuthenticatedExternalFee: {
        ergoTreeHex: compilerReceipt.contracts
          .mainChainAggregateUnlockAuthenticatedExternalFee.propositionHex,
      },
    },
    plan,
    trackerBox: trackerDataInput,
    duplicatePreventionBox,
    vaultBox,
    externalFeeBox,
    recipientErgoTreeHex: RECIPIENT_TREE,
    creationHeight: CURRENT_ERGO_HEIGHT,
  });
  const candidate = await buildAuthenticatedSettlementExternalFeeVmCandidate({
    packet,
    currentErgoHeight: CURRENT_ERGO_HEIGHT,
    duplicatePreventionBox,
    vaultBox,
    externalFeeBox,
    trackerDataInput,
  });
  assertAuthenticatedSettlementExternalFeeVmCandidateProvenance(candidate);
  assertAuthenticatedSettlementExternalFeeVmCandidateDigest(candidate);
  return {
    kind,
    prooflessTransactionHex: candidate.transaction.prooflessTransactionHex,
    prooflessTransactionIdHex:
      candidate.transaction.prooflessTransactionIdHex,
    inputBoxSigmaHex: [...candidate.transaction.inputBoxSigmaHex],
    dataInputBoxSigmaHex: [...candidate.transaction.dataInputBoxSigmaHex],
  };
}

function parseCompilerReceipt(source: string): ParsedCompilerReceipt {
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('compiler receipt must be non-empty JSON');
  }
  const bytes = Buffer.from(source, 'utf8');
  if (
    bytes.length > MAX_COMPILER_RECEIPT_BYTES
    || bytes.includes(13)
    || bytes.some(byte => byte > 0x7f)
  ) {
    throw new Error(
      'compiler receipt must be bounded non-empty LF-only ASCII JSON',
    );
  }
  const parsed = requireRecord(
    parseStrictJson(source, 'external-fee compiler receipt'),
    'external-fee compiler receipt',
  );
  assertExactKeys(parsed, [
    'schema',
    'version',
    'sigmaStateCommit',
    'specSha256Hex',
    'bindings',
    'contracts',
    'negativeDependencies',
    'boundaries',
  ], 'external-fee compiler receipt');
  if (
    parsed.schema
      !== AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_JVM_COMPILER_RECEIPT_V1_SCHEMA
    || parsed.version !== 1
    || parsed.sigmaStateCommit
      !== AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_SIGMASTATE_COMMIT
    || parsed.specSha256Hex !== COMPILER_SPEC_SHA256
  ) {
    throw new Error('external-fee compiler receipt identity is unsupported');
  }

  const bindings = requireRecord(parsed.bindings, 'compiler receipt bindings');
  assertExactKeys(
    bindings,
    ['trackerNftIdHex', 'duplicatePreventionNftIdHex'],
    'compiler receipt bindings',
  );
  if (
    bindings.trackerNftIdHex !== TRACKER_NFT_ID
    || bindings.duplicatePreventionNftIdHex !== DUP_NFT_ID
  ) {
    throw new Error('external-fee compiler receipt NFT bindings drifted');
  }

  const contracts = requireRecord(
    parsed.contracts,
    'compiler receipt contracts',
  );
  assertExactKeys(contracts, [
    'mainChainAggregateUnlockAuthenticatedExternalFee',
    'doubleUnlockPreventionAuthenticatedExternalFee',
  ], 'compiler receipt contracts');
  const unlock = parseCompilerContract(
    contracts.mainChainAggregateUnlockAuthenticatedExternalFee,
    UNLOCK_TEMPLATE_PATH,
    UNLOCK_TEMPLATE_SHA256,
    'external-fee unlock contract',
  );
  const duplicatePrevention = parseCompilerContract(
    contracts.doubleUnlockPreventionAuthenticatedExternalFee,
    DUP_TEMPLATE_PATH,
    DUP_TEMPLATE_SHA256,
    'external-fee DUP contract',
  );
  if (
    unlock.propositionBlake2b256Hex
    === duplicatePrevention.propositionBlake2b256Hex
  ) {
    throw new Error('external-fee compiler contract identities must differ');
  }

  const negativeDependencies = requireRecord(
    parsed.negativeDependencies,
    'compiler receipt negative dependencies',
  );
  assertExactKeys(negativeDependencies, [
    'oldAuthenticatedDuplicatePreventionTemplateSha256Hex',
    'oldAuthenticatedDuplicatePreventionPropositionBlake2b256Hex',
  ], 'compiler receipt negative dependencies');
  if (
    negativeDependencies
      .oldAuthenticatedDuplicatePreventionTemplateSha256Hex
      !== OLD_DUP_TEMPLATE_SHA256
    || negativeDependencies
      .oldAuthenticatedDuplicatePreventionPropositionBlake2b256Hex
      !== OLD_DUP_PROPOSITION_BLAKE2B256
  ) {
    throw new Error('old authenticated DUP negative dependency drifted');
  }
  assertFalseBoundaries(parsed.boundaries, 'compiler receipt boundaries');
  return {
    sha256Hex: createHash('sha256').update(bytes).digest('hex'),
    contracts: {
      mainChainAggregateUnlockAuthenticatedExternalFee: unlock,
      doubleUnlockPreventionAuthenticatedExternalFee: duplicatePrevention,
    },
  };
}

function parseCompilerContract(
  value: unknown,
  expectedTemplatePath: string,
  expectedTemplateSha256: string,
  label: string,
): CompilerReceiptContract {
  const contract = requireRecord(value, label);
  assertExactKeys(contract, [
    'templatePath',
    'templateSha256Hex',
    'resolvedSourceSha256Hex',
    'propositionHex',
    'propositionBytes',
    'propositionSha256Hex',
    'propositionBlake2b256Hex',
  ], label);
  if (
    contract.templatePath !== expectedTemplatePath
    || contract.templateSha256Hex !== expectedTemplateSha256
  ) {
    throw new Error(`${label} template identity drifted`);
  }
  const resolvedSourceSha256Hex = fixedHex(
    contract.resolvedSourceSha256Hex,
    32,
    `${label} resolved source SHA-256`,
  );
  const propositionHex = nonemptyEvenHex(
    contract.propositionHex,
    `${label} proposition`,
  );
  if (
    !Number.isSafeInteger(contract.propositionBytes)
    || Number(contract.propositionBytes) <= 0
    || propositionHex.length !== Number(contract.propositionBytes) * 2
  ) {
    throw new Error(`${label} proposition byte length does not match`);
  }
  const propositionBytes = Number(contract.propositionBytes);
  const proposition = Buffer.from(propositionHex, 'hex');
  const propositionSha256Hex = fixedHex(
    contract.propositionSha256Hex,
    32,
    `${label} proposition SHA-256`,
  );
  const propositionBlake2b256Hex = fixedHex(
    contract.propositionBlake2b256Hex,
    32,
    `${label} proposition Blake2b-256`,
  );
  if (
    propositionSha256Hex
      !== createHash('sha256').update(proposition).digest('hex')
    || propositionBlake2b256Hex !== blake2b256Hex(proposition)
  ) {
    throw new Error(`${label} proposition digest does not match its bytes`);
  }
  return {
    templatePath: expectedTemplatePath,
    templateSha256Hex: expectedTemplateSha256,
    resolvedSourceSha256Hex,
    propositionHex,
    propositionBytes,
    propositionSha256Hex,
    propositionBlake2b256Hex,
  };
}

function publicContractIdentity(
  contract: CompilerReceiptContract,
): CompilerContractIdentity {
  return {
    propositionHex: contract.propositionHex,
    propositionBytes: contract.propositionBytes,
    propositionSha256Hex: contract.propositionSha256Hex,
    propositionBlake2b256Hex: contract.propositionBlake2b256Hex,
  };
}

function assertFalseBoundaries(value: unknown, label: string): void {
  const boundaries = requireRecord(value, label);
  assertExactKeys(boundaries, Object.keys(BOUNDARIES), label);
  if (Object.values(boundaries).some(entry => entry !== false)) {
    throw new Error(`${label} must remain all-false`);
  }
}

async function syntheticBox(input: {
  value: bigint;
  ergoTree: string;
  assets?: Array<{ tokenId: string; amount: string }>;
  additionalRegisters: Record<string, string>;
  transactionByte: number;
}): Promise<Eip12Box> {
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const boxes = wasm.ErgoBoxes.from_boxes_json([{
    value: input.value.toString(),
    ergoTree: input.ergoTree,
    assets: input.assets ?? [],
    additionalRegisters: input.additionalRegisters,
    transactionId:
      input.transactionByte.toString(16).padStart(2, '0').repeat(32),
    index: 0,
    creationHeight: INPUT_CREATION_HEIGHT,
  }]);
  try {
    const box = boxes.get(0);
    try {
      return box.to_js_eip12();
    } finally {
      box.free?.();
    }
  } finally {
    boxes.free?.();
  }
}

function canonicalTrackerValue(bridgeEventRootHex: string): string {
  const checkpoint = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainHeight: SIDECHAIN_HEIGHT,
    sidechainConsensusBlockHashHex: '21'.repeat(32),
    executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
    bridgeEventRootHex,
    burnLeafCount: 1,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: '23'.repeat(32),
    finalityProofHashHex: '24'.repeat(32),
  });
  const statement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: '25'.repeat(32),
    finalityHorizonHeight: SIDECHAIN_HEIGHT,
    finalityHorizonHashHex: '26'.repeat(32),
  });
  const proof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: '27'.repeat(32),
    encodedStatement: statement.encodedStatementHex,
    payload: Buffer.from('external-fee-settlement-proof', 'ascii'),
  });
  return encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    anchorHeaderIdHex: '66'.repeat(32),
    anchorHeaderHeight: INPUT_CREATION_HEIGHT,
    finalityProofSystemId: proof.proofSystemId,
    finalityStatementDigestHex: proof.statementDigestHex,
    finalityProgramIdHex: proof.statement.programIdHex,
    finalityVerifierProfileIdHex: proof.verifierProfileIdHex,
    finalityProofPayloadDigestHex: proof.payloadDigestHex,
    finalityProofDigestHex:
      buildAggregateFinalityCommitmentV1(proof).proofDigestHex,
  });
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} has an unexpected field set`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be ${bytes} bytes of lowercase hex`);
  }
  return value;
}

function nonemptyEvenHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase even-length hex`);
  }
  return value;
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
