import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  assertErgoBlockTransactionCommitmentVerificationProvenance,
  verifyErgoBlockTransactionCommitment,
  type ErgoBlockTransactionCommitmentVerification,
} from './adapters/ergo-block-transaction-commitment.js';
import {
  createErgoCommittedVaultCurrentStatePortV1,
} from './adapters/ergo-committed-vault-current-state.js';
import {
  SqliteErgoSourceRelayWitnessStoreV1,
} from './adapters/sqlite-ergo-source-relay-witness-store-v1.js';
import {
  encodeErgoCompactDifficulty,
  verifyClaimedAutolykosV2ProofOfWork,
} from './ergo-settlement-core/ergo-autolykos-v2-header.js';
import {
  computeErgoAutolykosV2SpvProfileId,
  computeErgoDifficultyContextDigest,
  verifyErgoAutolykosV2SpvBranch,
  type ErgoAutolykosV2SpvCheckpoint,
  type ErgoAutolykosV2SpvProfile,
  type VerifiedErgoAutolykosV2Branch,
} from './ergo-settlement-core/ergo-autolykos-v2-spv-branch.js';
import {
  buildErgoAutolykosV2RelayWitnessV1,
  type ErgoAutolykosV2RelayWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  computeErgoBlockTransactionsRoot,
} from './ergo-settlement-core/ergo-block-transactions-root.js';
import {
  computeErgoHeaderId,
  type ErgoHeaderIdentityFields,
} from './ergo-settlement-core/ergo-header-id.js';
import { canonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  buildFrontierErgoAutolykosCommittedVaultSourceProofCandidateV1,
  createFrontierErgoAutolykosCommittedVaultSourceProofRegistryV1,
  decodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex,
  deriveFrontierErgoAutolykosCommittedVaultSourceProofStatementIdV1Hex,
  encodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_FINALITY_POLICY_ID_V1_HEX,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_PROFILE_ID_V1_HEX,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_SYSTEM_ID_V1_HEX,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_STATEMENT_BYTES,
  FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_VERIFIER_PROFILE_ID_V1_HEX,
  FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
  FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
  type FrontierErgoAutolykosCommittedVaultSourceProofStatementV1,
} from './frontier-ergo-autolykos-committed-vault-source-proof-v1.js';
import {
  encodeCollByteRegister,
  encodeLongRegister,
} from './ergo-settlement-core/ergo-encoding.js';
import {
  assertErgoSourceCommittedVaultCandidateV1Provenance,
  buildErgoSourceCommittedVaultCandidateV1,
} from './ergo-source-committed-vault-candidate-v1.js';
import {
  assertErgoSourceConsensusCandidateV1Provenance,
  buildErgoSourceConsensusCandidateV1,
} from './ergo-source-consensus-candidate-v1.js';
import {
  assertErgoSourceRelayRecoveryV1Provenance,
  recoverLatestErgoSourceRelayWitnessV1,
  replayErgoSourceRelayWitnessPacketV1,
} from './ergo-source-relay-recovery-v1.js';
import {
  buildErgoSourceRelayWitnessPacketV1,
  ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_GENERATIONS,
  ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_JSON_BYTES,
  type ErgoSourceRelayBoxReadWitnessV1,
  type ErgoSourceRelayWitnessPacketV1,
} from './relayer-core/ergo-source-relay-witness-packet-v1.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
} from './profiles/substrate-grandpa-v1/asset-profile.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type Eip12UnsignedTransaction,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

const GENERATOR = hex(
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
);
const NETWORK_ID = hex('11'.repeat(32));
const DIFFICULTY = 4n;
const NBITS = encodeErgoCompactDifficulty(DIFFICULTY);
const INTERVAL = 120_000n;
const SOURCE_AMOUNT = 100_000_000n;
const SOURCE_LOCK_TREE = `0008cd02${'22'.repeat(32)}`;
const VAULT_TREE = `0008cd02${'11'.repeat(32)}`;
const TARGET_H160 = '44'.repeat(20);
const DEPOSITOR_TREE = `0008cd02${'33'.repeat(32)}`;
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId:
    '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const OUTPUT_TREE = VAULT_TREE;

interface CandidateFixture {
  readonly profile: ErgoAutolykosV2SpvProfile;
  readonly checkpoint: ErgoAutolykosV2SpvCheckpoint;
  readonly currentSuffix: readonly ErgoHeaderIdentityFields[];
  readonly selectedSuffix: readonly ErgoHeaderIdentityFields[];
  readonly currentBranch: VerifiedErgoAutolykosV2Branch;
  readonly selectedBranch: VerifiedErgoAutolykosV2Branch;
  readonly targetHeader: ErgoHeaderIdentityFields;
  readonly verification: Readonly<ErgoBlockTransactionCommitmentVerification>;
  readonly signedTransaction: Readonly<Record<string, unknown>>;
  readonly commitmentTransaction: MaterializedUnsignedTransaction;
  readonly refundableSourceBox: Eip12Box;
  readonly alternateRefundableSourceBox: Eip12Box;
  readonly feeSourceBox: Eip12Box;
}

interface CandidateFixtureOptions {
  readonly vaultAmountNanoErg?: bigint;
  readonly vaultRecipientH160Hex?: string;
  readonly vaultDepositorErgoTreeHex?: string;
  readonly extraVaultRegisters?: Readonly<Record<string, string>>;
  readonly sourceAlsoDataInput?: boolean;
}

let fixture: CandidateFixture;
const relayTestDirectories: string[] = [];

beforeAll(async () => {
  fixture = await candidateFixture();
});

afterEach(async () => {
  while (relayTestDirectories.length > 0) {
    const directory = relayTestDirectories.pop()!;
    await rm(directory, { recursive: true, force: true });
  }
});

describe('Ergo source-consensus candidate V1', () => {
  it('binds the best locally known branch target to static WP-01C bytes', () => {
    const candidate = buildCandidate();
    assertErgoSourceConsensusCandidateV1Provenance(candidate);

    expect(candidate.branchSet.profileIdHex).toBe(
      computeErgoAutolykosV2SpvProfileId(fixture.profile).toString('hex'),
    );
    expect(candidate.branchSet.knownBranches).toHaveLength(2);
    expect(candidate.branchSet.selectedTipHeaderIdHex).toBe(
      computeErgoHeaderId(fixture.selectedSuffix.at(-1)!).toString('hex'),
    );
    expect(candidate.targetHeader).toMatchObject({
      headerIdHex: computeErgoHeaderId(fixture.targetHeader).toString('hex'),
      height: fixture.targetHeader.height,
      blockVersion: fixture.targetHeader.version,
      confirmations: 3,
      requiredConfirmations: 2,
    });
    expect(candidate.transaction.commitmentTxIdHex).toBe(
      fixture.verification.transactionIdHex,
    );
    expect(candidate.transaction).not.toHaveProperty('sourceBoxIdHex');
    expect(candidate.transaction).not.toHaveProperty('committedVaultBoxIdHex');
    expect(Object.values(candidate.authority).every(value => value === false))
      .toBe(true);
    expect(candidate.candidateDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(buildCandidate().candidateDigestHex).toBe(
      candidate.candidateDigestHex,
    );
    expect(Object.isFrozen(candidate.branchSet.knownBranches)).toBe(true);
  });

  it('keeps the current branch on an equal-work tie', () => {
    const tieSuffix = mineSuffix(
      fixture.checkpoint.header,
      3,
      900,
      fixture.targetHeader.transactionsRoot,
    );
    const tieBranch = verifyErgoAutolykosV2SpvBranch(
      fixture.profile,
      fixture.checkpoint,
      tieSuffix,
      tieSuffix.at(-1)!.timestamp,
    );
    const candidate = buildErgoSourceConsensusCandidateV1({
      currentBranch: fixture.selectedBranch,
      competingBranches: [tieBranch],
      targetHeader: fixture.targetHeader,
      staticCommitmentVerification: fixture.verification,
    });
    expect(candidate.branchSet.selectedTipHeaderIdHex).toBe(
      fixture.selectedBranch.headers.at(-1)!.headerId.toString('hex'),
    );
  });

  it('rejects a forged static verification even when every field matches', () => {
    const forged = { ...fixture.verification };
    expect(() => assertErgoBlockTransactionCommitmentVerificationProvenance(
      forged,
    )).toThrow(/not produced by the static adapter/);
    expect(() => buildErgoSourceConsensusCandidateV1({
      currentBranch: fixture.currentBranch,
      competingBranches: [fixture.selectedBranch],
      targetHeader: fixture.targetHeader,
      staticCommitmentVerification: forged,
    })).toThrow(/not produced by the static adapter/);
  });

  it('rejects target-header and input-shape drift', () => {
    expect(() => buildErgoSourceConsensusCandidateV1({
      currentBranch: fixture.currentBranch,
      competingBranches: [fixture.selectedBranch],
      targetHeader: {
        ...fixture.targetHeader,
        votes: hex('010000'),
      },
      staticCommitmentVerification: fixture.verification,
    })).toThrow(/not present in the selected known Ergo branch/);

    expect(() => buildErgoSourceConsensusCandidateV1({
      currentBranch: fixture.currentBranch,
      competingBranches: [fixture.selectedBranch],
      targetHeader: fixture.targetHeader,
      staticCommitmentVerification: fixture.verification,
      unexpected: true,
    } as never)).toThrow(/must contain exactly/);
  });

  it('rejects accessors and snapshots Proxy values without property reads', () => {
    const accessorInput = {
      currentBranch: fixture.currentBranch,
      competingBranches: [fixture.selectedBranch],
      targetHeader: fixture.targetHeader,
    } as Record<string, unknown>;
    Object.defineProperty(accessorInput, 'staticCommitmentVerification', {
      enumerable: true,
      get: () => fixture.verification,
    });
    expect(() => buildErgoSourceConsensusCandidateV1(
      accessorInput as never,
    )).toThrow(/must be a data property/);

    let propertyReads = 0;
    const proxy = new Proxy({
      currentBranch: fixture.currentBranch,
      competingBranches: [fixture.selectedBranch],
      targetHeader: fixture.targetHeader,
      staticCommitmentVerification: fixture.verification,
    }, {
      get(target, property, receiver) {
        propertyReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const candidate = buildErgoSourceConsensusCandidateV1(proxy);
    expect(candidate.targetHeader.headerIdHex).toBe(
      computeErgoHeaderId(fixture.targetHeader).toString('hex'),
    );
    expect(propertyReads).toBe(0);
  });

  it('rejects a nested target PoW accessor', () => {
    const powSolution = {
      publicKey: fixture.targetHeader.powSolution.publicKey,
    } as Record<string, unknown>;
    Object.defineProperty(powSolution, 'nonce', {
      enumerable: true,
      get: () => fixture.targetHeader.powSolution.nonce,
    });
    expect(() => buildErgoSourceConsensusCandidateV1({
      currentBranch: fixture.currentBranch,
      competingBranches: [fixture.selectedBranch],
      targetHeader: {
        ...fixture.targetHeader,
        powSolution: powSolution as never,
      },
      staticCommitmentVerification: fixture.verification,
    })).toThrow(/target PoW solution.nonce must be a data property/);
  });

  it('rejects a sparse competing-branch array', () => {
    const sparse = new Array<VerifiedErgoAutolykosV2Branch>(2);
    sparse[0] = fixture.selectedBranch;
    expect(() => buildErgoSourceConsensusCandidateV1({
      currentBranch: fixture.currentBranch,
      competingBranches: sparse,
      targetHeader: fixture.targetHeader,
      staticCommitmentVerification: fixture.verification,
    })).toThrow(/\[1\] must be a dense data property/);
  });

  it('rejects a competing-branch array accessor', () => {
    const branches: VerifiedErgoAutolykosV2Branch[] = [];
    Object.defineProperty(branches, '0', {
      enumerable: true,
      configurable: true,
      get: () => fixture.selectedBranch,
    });
    Object.defineProperty(branches, 'length', { value: 1 });
    expect(() => buildErgoSourceConsensusCandidateV1({
      currentBranch: fixture.currentBranch,
      competingBranches: branches,
      targetHeader: fixture.targetHeader,
      staticCommitmentVerification: fixture.verification,
    })).toThrow(/\[0\] must be a dense data property/);
  });

  it('rejects a target that has not reached the profile depth', () => {
    const shallowProfile = { ...fixture.profile, requiredConfirmations: 4 };
    const current = verifyErgoAutolykosV2SpvBranch(
      shallowProfile,
      fixture.checkpoint,
      fixture.currentSuffix,
      fixture.currentSuffix.at(-1)!.timestamp,
    );
    const competing = verifyErgoAutolykosV2SpvBranch(
      shallowProfile,
      fixture.checkpoint,
      fixture.selectedSuffix,
      fixture.selectedSuffix.at(-1)!.timestamp,
    );
    expect(() => buildErgoSourceConsensusCandidateV1({
      currentBranch: current,
      competingBranches: [competing],
      targetHeader: fixture.targetHeader,
      staticCommitmentVerification: fixture.verification,
    })).toThrow(/depth policy/);
  });

  it('rejects forged candidates and duplicate known branch tips', () => {
    const candidate = buildCandidate();
    expect(() => assertErgoSourceConsensusCandidateV1Provenance({
      ...candidate,
    })).toThrow(/not produced by the V1 builder/);
    expect(() => buildErgoSourceConsensusCandidateV1({
      currentBranch: fixture.currentBranch,
      competingBranches: [fixture.selectedBranch, fixture.selectedBranch],
      targetHeader: fixture.targetHeader,
      staticCommitmentVerification: fixture.verification,
    })).toThrow(/duplicate tip/);
  });
});

describe('Ergo source committed-vault candidate V1', () => {
  it('binds exact source bytes and signed input reference to the current vault', async () => {
    const candidate = await buildCommittedVaultCandidate();
    assertErgoSourceCommittedVaultCandidateV1Provenance(candidate);

    expect(candidate.consensus).toMatchObject({
      sourceNetworkIdHex: NETWORK_ID.toString('hex'),
      targetHeaderIdHex: computeErgoHeaderId(fixture.targetHeader).toString('hex'),
      confirmations: 3,
      requiredConfirmations: 2,
    });
    expect(candidate.transition).toMatchObject({
      transactionIdHex: fixture.commitmentTransaction.txId,
      sourceBoxIdHex: fixture.refundableSourceBox.boxId,
      sourceInputIndex: 0,
      sourceInputCount: 1,
      vaultBoxIdHex: fixture.commitmentTransaction.outputs[0]!.boxId,
      vaultOutputIndex: 0,
    });
    expect(candidate.settlement).toMatchObject({
      asset: 'ERG',
      assetIdHex: '00'.repeat(32),
      amountNanoErg: SOURCE_AMOUNT.toString(),
      recipientH160Hex: TARGET_H160,
    });
    expect(Object.values(candidate.checks).every(value => value === true))
      .toBe(true);
    expect(candidate.checks.exactSourceReferencedOnceAsSpendingInput).toBe(true);
    expect(Object.values(candidate.authority).every(value => value === false))
      .toBe(true);
    expect(candidate.authority.sourceTransactionExecutionValidated).toBe(false);
    expect((await buildCommittedVaultCandidate()).candidateDigestHex)
      .toBe(candidate.candidateDigestHex);
  });

  it('rejects forged parents, another source, and altered signed bytes', async () => {
    await expect(buildCommittedVaultCandidate({
      sourceConsensusCandidate: structuredClone(buildCandidate()),
    })).rejects.toThrow(/not produced by the V1 builder/);

    await expect(buildCommittedVaultCandidate({
      refundableSourceBox: fixture.alternateRefundableSourceBox,
    })).rejects.toThrow(/reference the exact source once as a spending input/);

    const alteredTransaction = structuredClone(fixture.signedTransaction) as any;
    alteredTransaction.outputs[0].value = '99999999';
    await expect(buildCommittedVaultCandidate({
      signedCommitmentTransaction: alteredTransaction,
    })).rejects.toThrow(/canonical signed Ergo transaction JSON|canonical bytes|claimed ID/);

    const alteredSource = structuredClone(fixture.refundableSourceBox);
    alteredSource.additionalRegisters.R5 = encodeLongRegister(SOURCE_AMOUNT - 1n);
    await expect(buildCommittedVaultCandidate({
      refundableSourceBox: alteredSource,
    })).rejects.toThrow(/valid EIP-12 box|boxId does not match|serialized box contents/);
  });

  it('rejects route, asset, and source-network drift', async () => {
    await expect(buildCommittedVaultCandidate({
      route: committedVaultRoute({
        sourceLockErgoTreeHex: `0008cd02${'55'.repeat(32)}`,
      }),
    })).rejects.toThrow(/another route ErgoTree/);

    await expect(buildCommittedVaultCandidate({
      route: committedVaultRoute({
        vaultErgoTreeHex: fixture.feeSourceBox.ergoTree,
      }),
    })).rejects.toThrow(/wrong ErgoTree/);

    await expect(buildCommittedVaultCandidate({
      route: committedVaultRoute({ assetProfileId: 'unsupported.asset.v1' }),
    })).rejects.toThrow(/unsupported Substrate\/GRANDPA V1 asset profile/);

    await expect(buildCommittedVaultCandidate({
      route: committedVaultRoute({ sourceNetworkIdHex: '99'.repeat(32) }),
    })).rejects.toThrow(/source network binding mismatch/);
  });

  it('rejects independently authenticated vault semantic mutants', async () => {
    const [wrongAmount, wrongRecipient, wrongDepositor, extraRegister] =
      await Promise.all([
        candidateFixture({ vaultAmountNanoErg: SOURCE_AMOUNT - 1n }),
        candidateFixture({ vaultRecipientH160Hex: '55'.repeat(20) }),
        candidateFixture({
          vaultDepositorErgoTreeHex: `0008cd02${'66'.repeat(32)}`,
        }),
        candidateFixture({
          extraVaultRegisters: {
            R8: encodeCollByteRegister(Buffer.from('01', 'hex')),
          },
        }),
      ]);

    await expect(buildCommittedVaultCandidate({}, wrongAmount))
      .rejects.toThrow(/value does not equal the deposit value/);
    await expect(buildCommittedVaultCandidate({}, wrongRecipient))
      .rejects.toThrow(/R5 binding mismatch/);
    await expect(buildCommittedVaultCandidate({}, wrongDepositor))
      .rejects.toThrow(/R7 binding mismatch/);
    await expect(buildCommittedVaultCandidate({}, extraRegister))
      .rejects.toThrow(/must contain exactly R4-R7/);
  });

  it('rejects a source repeated as a data input', async () => {
    const repeatedSource = await candidateFixture({ sourceAlsoDataInput: true });
    await expect(buildCommittedVaultCandidate({}, repeatedSource))
      .rejects.toThrow(/must not also appear as a data input/);
  });

  it('rejects source restoration, vault absence, and current-state drift', async () => {
    await expect(buildCommittedVaultCandidate({
      currentStatePort: currentStatePort({
        sourceResponses: [fixture.refundableSourceBox, null],
      }),
    })).rejects.toThrow(/refundable source is present/);

    await expect(buildCommittedVaultCandidate({
      currentStatePort: currentStatePort({
        sourceResponses: [null, fixture.refundableSourceBox],
      }),
    })).rejects.toThrow(/refundable source is present/);

    await expect(buildCommittedVaultCandidate({
      currentStatePort: currentStatePort({ vaultResponses: [null, null] }),
    })).rejects.toThrow(/committed vault is absent/);

    await expect(buildCommittedVaultCandidate({
      currentStatePort: currentStatePort({
        vaultResponses: [
          fixture.commitmentTransaction.outputs[0]!,
          fixture.commitmentTransaction.outputs[1]!,
        ],
      }),
    })).rejects.toThrow(/committed vault changed/);
  });

  it('rejects forged ports, accessors, and cloned result provenance', async () => {
    const port = currentStatePort();
    await expect(buildCommittedVaultCandidate({
      currentStatePort: { ...port },
    })).rejects.toThrow(/not created by the static adapter/);

    const route = committedVaultRoute() as Record<string, unknown>;
    const assetProfileId = route.assetProfileId;
    Object.defineProperty(route, 'assetProfileId', {
      enumerable: true,
      get: () => assetProfileId,
    });
    await expect(buildCommittedVaultCandidate({ route: route as never }))
      .rejects.toThrow(/assetProfileId must be a data property/);

    const signed = structuredClone(fixture.signedTransaction) as any;
    const outputValue = signed.outputs[0].value;
    Object.defineProperty(signed.outputs[0], 'value', {
      enumerable: true,
      get: () => outputValue,
    });
    await expect(buildCommittedVaultCandidate({
      signedCommitmentTransaction: signed,
    })).rejects.toThrow(/must be an enumerable data property/);

    const accessorVault = structuredClone(
      fixture.commitmentTransaction.outputs[0]!,
    ) as unknown as Record<string, unknown>;
    const vaultValue = accessorVault.value;
    Object.defineProperty(accessorVault, 'value', {
      enumerable: true,
      get: () => vaultValue,
    });
    await expect(buildCommittedVaultCandidate({
      currentStatePort: currentStatePort({
        vaultResponses: [accessorVault, accessorVault],
        cloneResponses: false,
      }),
    })).rejects.toThrow(/must be an enumerable data property/);

    const candidate = await buildCommittedVaultCandidate();
    expect(() => assertErgoSourceCommittedVaultCandidateV1Provenance({
      ...candidate,
    })).toThrow(/not produced by the V1 builder/);
  });
});

describe('Frontier Ergo Autolykos committed-vault source-proof V1', () => {
  it('freezes one distinct static non-authorizing compatibility family', () => {
    const registry = createFrontierErgoAutolykosCommittedVaultSourceProofRegistryV1();

    expect(registry).toMatchObject({
      formatVersion: 1,
      proofSystemIdHex:
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_SYSTEM_ID_V1_HEX,
      proofProfileIdHex:
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_PROFILE_ID_V1_HEX,
      finalityPolicyIdHex:
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_FINALITY_POLICY_ID_V1_HEX,
      verifierProfileIdHex:
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_VERIFIER_PROFILE_ID_V1_HEX,
      statementBytes:
        FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_STATEMENT_BYTES,
      boundary: {
        staticallyRegistered: true,
        compatibilityFamilyOnly: true,
        compileTimeActivationAllowed: false,
        proofEnvelopeAccepted: false,
        runtimeStateMutationAllowed: false,
        mintAuthorizationAllowed: false,
        pooledReserveV4ReinterpretationAllowed: false,
        reservedStarkProofSystemUsed: false,
      },
    });
    expect(Object.isFrozen(registry)).toBe(true);
    expect(new Set([
      registry.proofSystemIdHex,
      registry.proofProfileIdHex,
      registry.finalityPolicyIdHex,
      registry.verifierProfileIdHex,
    ]).size).toBe(4);
    expect({
      proofSystemIdHex: registry.proofSystemIdHex,
      proofProfileIdHex: registry.proofProfileIdHex,
      finalityPolicyIdHex: registry.finalityPolicyIdHex,
      verifierProfileIdHex: registry.verifierProfileIdHex,
      routeProfileIdHex: FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
      assetProfileIdHex: FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
    }).toEqual({
      proofSystemIdHex:
        '0xb6517c26c379e1d65f70dff790471de08236e2027694c08912b5c0c6466717a0',
      proofProfileIdHex:
        '0x80d67ed354e61233677648640949e02d74e01b00c06ad0d39c66ddead690152a',
      finalityPolicyIdHex:
        '0xc2779cae59997011ee5683991487dbd9410bb42744491e8c9b4b87169a12960b',
      verifierProfileIdHex:
        '0x75a7cb1a3cb5220e159570260e6885341cf75d1255f0151874079a5044d42304',
      routeProfileIdHex:
        '0x736825614576ee8ebba529e874f0f8241f18c02515856e0801d5272d38f7393d',
      assetProfileIdHex:
        '0x5bb3ce0607d7e883244a43807c1c8182c9e4ab4fd092ae8f02fb65908992a5dc',
    });
  });

  it('reproduces the cross-language 1,065-byte golden statement', () => {
    const statement = syntheticFrontierSourceProofStatement();
    const statementHex =
      encodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex(
        statement,
      );
    expect(statementHex).toHaveLength(2 + 1_065 * 2);
    expect(`0x${createHash('sha256')
      .update(Buffer.from(statementHex.slice(2), 'hex'))
      .digest('hex')}`).toBe(
      '0x99bc746ed6e612f117aa5737d57a164772ee9c342e717bec85e50410ab073491',
    );
    expect(
      deriveFrontierErgoAutolykosCommittedVaultSourceProofStatementIdV1Hex(
        statement,
      ),
    ).toBe(
      '0x09e2e5be46c7304710aba50cbac66b92b6f1d2b22eff14603ed878d90163da3b',
    );
    expect(decodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex(
      statementHex,
    )).toEqual(statement);
  });

  it('ports every WP-01D public input into one exact canonical statement', async () => {
    const sourceConsensusCandidate = buildCandidate();
    const committedVaultCandidate = await buildCommittedVaultCandidate({
      sourceConsensusCandidate,
    });
    const candidate =
      buildFrontierErgoAutolykosCommittedVaultSourceProofCandidateV1({
        sourceConsensusCandidate,
        committedVaultCandidate,
      });

    expect(candidate.statementHex).toHaveLength(
      2 + FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_STATEMENT_BYTES * 2,
    );
    expect(decodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex(
      candidate.statementHex,
    )).toEqual(candidate.statement);
    expect(candidate.statement).toMatchObject({
      sourceConsensusCandidateDigestHex: `0x${sourceConsensusCandidate.candidateDigestHex}`,
      committedVaultCandidateDigestHex: `0x${committedVaultCandidate.candidateDigestHex}`,
      spvProfileIdHex: `0x${sourceConsensusCandidate.branchSet.profileIdHex}`,
      checkpointHeaderIdHex:
        `0x${sourceConsensusCandidate.branchSet.checkpointHeaderIdHex}`,
      knownBranchCount: sourceConsensusCandidate.branchSet.knownBranches.length,
      transactionIdHex: `0x${sourceConsensusCandidate.transaction.commitmentTxIdHex}`,
      committedTransactionIdHex:
        `0x${committedVaultCandidate.transition.transactionIdHex}`,
      routeProfileIdHex: FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
      assetProfileIdHex: FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
      amountNanoErg: committedVaultCandidate.settlement.amountNanoErg,
      recipientH160Hex: `0x${committedVaultCandidate.settlement.recipientH160Hex}`,
    });
    expect(Object.values(candidate.authority).every(value => value === false))
      .toBe(true);
    expect(candidate.limitations.join(' ')).toMatch(/must not be reinterpreted/i);
  });

  it('rejects unknown families and each funds-facing shape mutation', async () => {
    const sourceConsensusCandidate = buildCandidate();
    const committedVaultCandidate = await buildCommittedVaultCandidate({
      sourceConsensusCandidate,
    });
    const statement =
      buildFrontierErgoAutolykosCommittedVaultSourceProofCandidateV1({
        sourceConsensusCandidate,
        committedVaultCandidate,
      }).statement;

    const cases = [
      [{ ...statement, proofSystemIdHex: `0x${'99'.repeat(32)}` }, /proof-system ID/],
      [{ ...statement, proofProfileIdHex: `0x${'98'.repeat(32)}` }, /proof-profile ID/],
      [{ ...statement, targetBlockVersion: 2.5 }, /block version/],
      [{ ...statement, targetBlockVersion: Number.NaN }, /block version/],
      [{ ...statement, confirmations: statement.requiredConfirmations - 1 }, /confirmation policy/],
      [{ ...statement, selectedTipHeight: statement.targetHeight - 1 }, /header heights/],
      [{ ...statement, committedTransactionIdHex: `0x${'97'.repeat(32)}` }, /transaction identities/],
      [{ ...statement, sourceInputCount: 2 }, /transition shape/],
      [{ ...statement, vaultOutputIndex: 1 }, /transition shape/],
      [{ ...statement, assetIdHex: `0x${'01'.repeat(32)}` }, /only native ERG/],
      [{ ...statement, amountNanoErg: '0' }, /positive Ergo Long/],
      [{ ...statement, amountNanoErg: (0x8000_0000_0000_0000n).toString() }, /positive Ergo Long/],
    ] as const;
    for (const [mutant, error] of cases) {
      expect(() =>
        encodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex(
          mutant as never,
        )
      ).toThrow(error);
    }
  });

  it('rejects forged or cross-wired WP-01D candidates before encoding', async () => {
    const sourceConsensusCandidate = buildCandidate();
    const committedVaultCandidate = await buildCommittedVaultCandidate({
      sourceConsensusCandidate,
    });
    expect(() =>
      buildFrontierErgoAutolykosCommittedVaultSourceProofCandidateV1({
        sourceConsensusCandidate: { ...sourceConsensusCandidate },
        committedVaultCandidate,
      } as never)
    ).toThrow(/not produced by the V1 builder/);

    const accessor = {
      sourceConsensusCandidate,
    } as Record<string, unknown>;
    Object.defineProperty(accessor, 'committedVaultCandidate', {
      enumerable: true,
      get: () => committedVaultCandidate,
    });
    expect(() =>
      buildFrontierErgoAutolykosCommittedVaultSourceProofCandidateV1(
        accessor as never,
      )
    ).toThrow(/must be a data property/);

    const alternate = await candidateFixture({
      vaultAmountNanoErg: SOURCE_AMOUNT - 1n,
    });
    const otherSource = buildCandidate(alternate);
    const crossWired = await buildCommittedVaultCandidate();
    expect(() =>
      buildFrontierErgoAutolykosCommittedVaultSourceProofCandidateV1({
        sourceConsensusCandidate: otherSource,
        committedVaultCandidate: crossWired,
      })
    ).toThrow(/do not form one exact join/);
  });
});

describe('WP-01D reconstructible relay witness recovery V1', () => {
  it('preserves special JSON keys without packet-digest collisions', () => {
    const base = relayWitnessPacket();
    const blockWithValue = (value: string): object => {
      const block = structuredClone(base.block) as object;
      Object.defineProperty(block, '__proto__', {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      return block;
    };
    const first = relayWitnessPacket({ block: blockWithValue('first') });
    const second = relayWitnessPacket({ block: blockWithValue('second') });

    expect((first.block as Record<string, unknown>).__proto__).toBe('first');
    expect((second.block as Record<string, unknown>).__proto__).toBe('second');
    expect(first.packetDigestHex).not.toBe(second.packetDigestHex);
  });

  it('rebuilds the exact non-authorizing statement after a durable restart', async () => {
    const packet = relayWitnessPacket();
    const direct = await replayErgoSourceRelayWitnessPacketV1(packet);
    assertErgoSourceRelayRecoveryV1Provenance(direct);
    expect(Object.values(direct.authority).every(value => value === false))
      .toBe(true);

    const databasePath = await relayDatabasePath();
    let store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.append(packet)).toBe('stored');
    expect(store.append(packet)).toBe('deduplicated');
    store.close();

    store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    const recovered = await recoverLatestErgoSourceRelayWitnessV1({
      store,
      relayIdHex: packet.relayIdHex,
    });
    store.close();
    expect(recovered.status).toBe('replayed');
    if (recovered.status !== 'replayed') throw new Error('expected replay');
    assertErgoSourceRelayRecoveryV1Provenance(recovered.recovery);
    expect(recovered.recovery).toMatchObject({
      packetDigestHex: packet.packetDigestHex,
      recoveryDigestHex: direct.recoveryDigestHex,
      frontierStatementIdHex: direct.frontierStatementIdHex,
      frontierStatementHex: direct.frontierStatementHex,
    });

    const raw = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    const columns = raw.pragma(
      'table_info(ergo_source_relay_witness_packets_v1)',
    ) as { name: string }[];
    raw.close();
    expect(columns.map(column => column.name)).toEqual([
      'relay_id_hex',
      'generation',
      'previous_packet_digest_hex',
      'packet_digest_hex',
      'packet_json',
    ]);
    expect(columns.map(column => column.name).join(' ')).not.toMatch(
      /verified|candidate|authority|mint|funds|status/,
    );
  });

  it('replays a strictly heavier competing branch as the next generation', async () => {
    const first = relayWitnessPacket();
    const extension = mineSuffix(
      fixture.selectedSuffix.at(-1)!,
      1,
      1_700,
    );
    const extended = [...fixture.selectedSuffix, ...extension];
    const second = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      consensusWitness: relayConsensusWitness([extended]),
    });
    const databasePath = await relayDatabasePath();
    let store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.append(first)).toBe('stored');
    expect(store.append(second)).toBe('stored');
    store.close();

    store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    const recovered = await recoverLatestErgoSourceRelayWitnessV1({
      store,
      relayIdHex: first.relayIdHex,
    });
    store.close();
    expect(recovered.status).toBe('replayed');
    if (recovered.status !== 'replayed') throw new Error('expected replay');
    expect(recovered.recovery.generation).toBe(2);
    expect(recovered.recovery.selectedTipHeaderIdHex).toBe(
      computeErgoHeaderId(extended.at(-1)!).toString('hex'),
    );
    expect(recovered.recovery.frontierStatementIdHex)
      .not.toBe((await replayErgoSourceRelayWitnessPacketV1(first))
        .frontierStatementIdHex);
  });

  it('rejects regressing work, equal-work tip replacement, and binding drift', async () => {
    const first = relayWitnessPacket();
    const lowerWork = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      consensusWitness: relayConsensusWitness([], {
        currentSuffix: fixture.selectedSuffix.slice(0, -1),
      }),
    });
    const alternateEqualWork = mineSuffix(
      fixture.checkpoint.header,
      fixture.selectedSuffix.length,
      4_000,
    );
    const equalWorkReplacement = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      consensusWitness: relayConsensusWitness([], {
        currentSuffix: alternateEqualWork,
      }),
    });
    const profileDrift = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      consensusWitness: relayConsensusWitness([], {
        profile: {
          ...fixture.profile,
          requiredConfirmations: 1,
        },
      }),
    });
    const checkpointDrift = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      consensusWitness: {
        ...first.consensusWitness,
        checkpoint: {
          ...first.consensusWitness.checkpoint,
          sourceNetworkIdHex: '22'.repeat(32),
        },
      },
    });
    const routeDrift = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      route: committedVaultRoute({ assetProfileId: 'alternate-native-erg' }),
    });
    const transactionIdDrift = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      commitmentTransactionIdHex: '33'.repeat(32),
    });
    const signedTransactionDrift = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      signedCommitmentTransaction: {
        ...(fixture.signedTransaction as unknown as Record<string, unknown>),
        id: '44'.repeat(32),
      },
    });
    const refundableSourceDrift = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      refundableSourceBox: {
        ...(fixture.refundableSourceBox as unknown as Record<string, unknown>),
        value: String(SOURCE_AMOUNT - 1n),
      },
    });
    const databasePath = await relayDatabasePath();
    const store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    try {
      expect(store.append(first)).toBe('stored');
      expect(store.append(lowerWork)).toBe('conflict');
      expect(store.append(equalWorkReplacement)).toBe('conflict');
      expect(store.append(profileDrift)).toBe('conflict');
      expect(store.append(checkpointDrift)).toBe('conflict');
      expect(store.append(routeDrift)).toBe('conflict');
      expect(store.append(transactionIdDrift)).toBe('conflict');
      expect(store.append(signedTransactionDrift)).toBe('conflict');
      expect(store.append(refundableSourceDrift)).toBe('conflict');
    } finally {
      store.close();
    }

    const raw = new Database(databasePath);
    raw.prepare(`
      INSERT INTO ergo_source_relay_witness_packets_v1 (
        relay_id_hex,
        generation,
        previous_packet_digest_hex,
        packet_digest_hex,
        packet_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      routeDrift.relayIdHex,
      routeDrift.generation,
      routeDrift.previousPacketDigestHex,
      routeDrift.packetDigestHex,
      canonicalJson(routeDrift),
    );
    raw.close();
    const reopened = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(reopened.readLatest(first.relayIdHex)).toEqual({
      status: 'unavailable',
    });
    reopened.close();
  });

  it('fails closed after restart when a later observation restores the source', async () => {
    const first = relayWitnessPacket();
    const restored = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      currentStateReads: relayCurrentStateReads({
        sourceBefore: fixture.refundableSourceBox,
        sourceAfter: fixture.refundableSourceBox,
      }),
    });
    const databasePath = await relayDatabasePath();
    let store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.append(first)).toBe('stored');
    expect(store.append(restored)).toBe('stored');
    store.close();

    store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    try {
      await expect(recoverLatestErgoSourceRelayWitnessV1({
        store,
        relayIdHex: first.relayIdHex,
      })).rejects.toThrow(/refundable source is present/);
    } finally {
      store.close();
    }
  });

  it('fails closed after restart when a later observation replaces the vault', async () => {
    const first = relayWitnessPacket();
    const replaced = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      currentStateReads: relayCurrentStateReads({
        vaultBefore: fixture.alternateRefundableSourceBox,
        vaultAfter: fixture.alternateRefundableSourceBox,
      }),
    });
    const databasePath = await relayDatabasePath();
    let store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.append(first)).toBe('stored');
    expect(store.append(replaced)).toBe('stored');
    store.close();

    store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    try {
      await expect(recoverLatestErgoSourceRelayWitnessV1({
        store,
        relayIdHex: first.relayIdHex,
      })).rejects.toThrow(/another box ID|does not match/);
    } finally {
      store.close();
    }
  });

  it('treats complete database loss as missing rather than recovered authority', async () => {
    const packet = relayWitnessPacket();
    const databasePath = await relayDatabasePath();
    let store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.append(packet)).toBe('stored');
    store.close();
    await Promise.all([
      rm(databasePath, { force: true }),
      rm(`${databasePath}-wal`, { force: true }),
      rm(`${databasePath}-shm`, { force: true }),
    ]);

    store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    const recovered = await recoverLatestErgoSourceRelayWitnessV1({
      store,
      relayIdHex: packet.relayIdHex,
    });
    store.close();
    expect(recovered).toEqual({ status: 'missing' });
  });

  it('keeps a rolled-back database snapshot visibly non-authorizing', async () => {
    const first = relayWitnessPacket();
    const extension = mineSuffix(
      fixture.selectedSuffix.at(-1)!,
      1,
      1_800,
    );
    const second = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
      consensusWitness: relayConsensusWitness([
        [...fixture.selectedSuffix, ...extension],
      ]),
    });
    const databasePath = await relayDatabasePath();
    const rollbackPath = `${databasePath}.rollback`;
    let store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.append(first)).toBe('stored');
    store.close();
    await copyFile(databasePath, rollbackPath);

    store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.append(second)).toBe('stored');
    store.close();
    const current = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    const currentRecovery = await recoverLatestErgoSourceRelayWitnessV1({
      store: current,
      relayIdHex: first.relayIdHex,
    });
    current.close();
    expect(currentRecovery.status).toBe('replayed');
    if (currentRecovery.status !== 'replayed') throw new Error('expected replay');
    expect(currentRecovery.recovery.generation).toBe(2);

    const rolledBack = new SqliteErgoSourceRelayWitnessStoreV1(rollbackPath);
    const rollbackRecovery = await recoverLatestErgoSourceRelayWitnessV1({
      store: rolledBack,
      relayIdHex: first.relayIdHex,
    });
    rolledBack.close();
    expect(rollbackRecovery.status).toBe('replayed');
    if (rollbackRecovery.status !== 'replayed') throw new Error('expected replay');
    expect(rollbackRecovery.recovery.generation).toBe(1);
    expect(Object.values(rollbackRecovery.recovery.authority)
      .every(value => value === false)).toBe(true);
  });

  it('rejects out-of-order reads, skipped generations, and stored-byte corruption', async () => {
    const packet = relayWitnessPacket();
    const reads = relayCurrentStateReads();
    expect(() => relayWitnessPacket({
      currentStateReads: [reads[1]!, reads[0]!, reads[2]!, reads[3]!],
    })).toThrow(/out of order/);

    const skipped = relayWitnessPacket({
      generation: 3,
      previousPacketDigestHex: packet.packetDigestHex,
    });
    const databasePath = await relayDatabasePath();
    let store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.append(packet)).toBe('stored');
    expect(store.append(skipped)).toBe('conflict');
    store.close();

    const raw = new Database(databasePath);
    raw.prepare(`
      INSERT INTO ergo_source_relay_witness_packets_v1 (
        relay_id_hex,
        generation,
        previous_packet_digest_hex,
        packet_digest_hex,
        packet_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      skipped.relayIdHex,
      skipped.generation,
      skipped.previousPacketDigestHex,
      skipped.packetDigestHex,
      canonicalJson(skipped),
    );
    raw.close();
    store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.readLatest(packet.relayIdHex)).toEqual({
      status: 'unavailable',
    });
    store.close();

    const repair = new Database(databasePath);
    repair.prepare(`
      DELETE FROM ergo_source_relay_witness_packets_v1
      WHERE relay_id_hex = ? AND generation = 3
    `).run(packet.relayIdHex);
    repair.prepare(`
      UPDATE ergo_source_relay_witness_packets_v1
      SET packet_json = '{}'
      WHERE relay_id_hex = ?
    `).run(packet.relayIdHex);
    repair.close();
    store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.readLatest(packet.relayIdHex)).toEqual({
      status: 'unavailable',
    });
    store.close();
  });

  it('validates every historical packet and bounds rows before JSON parsing', async () => {
    const first = relayWitnessPacket();
    const second = relayWitnessPacket({
      generation: 2,
      previousPacketDigestHex: first.packetDigestHex,
    });
    const databasePath = await relayDatabasePath();
    let store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.append(first)).toBe('stored');
    expect(store.append(second)).toBe('stored');
    store.close();

    let raw = new Database(databasePath);
    raw.prepare(`
      UPDATE ergo_source_relay_witness_packets_v1
      SET packet_json = '{}'
      WHERE relay_id_hex = ? AND generation = 1
    `).run(first.relayIdHex);
    raw.close();
    store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.readLatest(first.relayIdHex)).toEqual({
      status: 'unavailable',
    });
    store.close();

    raw = new Database(databasePath);
    raw.prepare(`
      UPDATE ergo_source_relay_witness_packets_v1
      SET packet_json = ?
      WHERE relay_id_hex = ? AND generation = 1
    `).run(
      'x'.repeat(ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_JSON_BYTES + 1),
      first.relayIdHex,
    );
    raw.close();
    store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.readLatest(first.relayIdHex)).toEqual({
      status: 'unavailable',
    });
    store.close();

    raw = new Database(databasePath);
    raw.prepare(`
      UPDATE ergo_source_relay_witness_packets_v1
      SET packet_json = ?
      WHERE relay_id_hex = ? AND generation = 1
    `).run(
      Buffer.from(canonicalJson(first), 'utf8'),
      first.relayIdHex,
    );
    raw.close();
    store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    expect(store.readLatest(first.relayIdHex)).toEqual({
      status: 'unavailable',
    });
    store.close();
  });

  it('rejects the durable generation bound in both packet and SQL layers', async () => {
    expect(() => relayWitnessPacket({
      generation: ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_GENERATIONS + 1,
      previousPacketDigestHex: '11'.repeat(32),
    })).toThrow(/no greater than 100000/);

    const databasePath = await relayDatabasePath();
    const store = new SqliteErgoSourceRelayWitnessStoreV1(databasePath);
    store.close();
    const raw = new Database(databasePath);
    expect(() => raw.prepare(`
      INSERT INTO ergo_source_relay_witness_packets_v1 (
        relay_id_hex,
        generation,
        previous_packet_digest_hex,
        packet_digest_hex,
        packet_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      '55'.repeat(32),
      ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_GENERATIONS + 1,
      '66'.repeat(32),
      '77'.repeat(32),
      '{}',
    )).toThrow(/CHECK constraint failed/);
    const count = raw.prepare(`
      SELECT COUNT(*) AS count
      FROM ergo_source_relay_witness_packets_v1
    `).get() as { count: number };
    raw.close();
    expect(count.count).toBe(0);
  });
});

function buildCandidate(target: CandidateFixture = fixture) {
  return buildErgoSourceConsensusCandidateV1({
    currentBranch: target.currentBranch,
    competingBranches: [target.selectedBranch],
    targetHeader: target.targetHeader,
    staticCommitmentVerification: target.verification,
  });
}

type CommittedVaultBuildOverrides = Partial<Parameters<
  typeof buildErgoSourceCommittedVaultCandidateV1
>[0]>;

function buildCommittedVaultCandidate(
  overrides: CommittedVaultBuildOverrides = {},
  target: CandidateFixture = fixture,
) {
  return buildErgoSourceCommittedVaultCandidateV1({
    sourceConsensusCandidate: buildCandidate(target),
    signedCommitmentTransaction: target.signedTransaction,
    refundableSourceBox: target.refundableSourceBox,
    currentStatePort: currentStatePort({}, target),
    route: committedVaultRoute(),
    ...overrides,
  });
}

function committedVaultRoute(
  overrides: Partial<{
    routeProfileId: 'committed-vault-v3';
    sourceNetworkIdHex: string;
    assetProfileId: string;
    sourceLockErgoTreeHex: string;
    vaultErgoTreeHex: string;
  }> = {},
) {
  return {
    routeProfileId: 'committed-vault-v3' as const,
    sourceNetworkIdHex: NETWORK_ID.toString('hex'),
    assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
    sourceLockErgoTreeHex: SOURCE_LOCK_TREE,
    vaultErgoTreeHex: VAULT_TREE,
    ...overrides,
  };
}

function currentStatePort(options: {
  sourceResponses?: readonly (unknown | null)[];
  vaultResponses?: readonly (unknown | null)[];
  sourceNetworkIdHex?: string;
  cloneResponses?: boolean;
} = {}, target: CandidateFixture = fixture) {
  const sourceResponses = options.sourceResponses ?? [null, null];
  const vaultResponses = options.vaultResponses ?? [
    target.commitmentTransaction.outputs[0]!,
    target.commitmentTransaction.outputs[0]!,
  ];
  let sourceRead = 0;
  let vaultRead = 0;
  return createErgoCommittedVaultCurrentStatePortV1({
    sourceNetworkIdHex:
      options.sourceNetworkIdHex ?? NETWORK_ID.toString('hex'),
    backend: {
      async getBoxByIdOrNull(boxIdHex: string): Promise<unknown | null> {
        if (boxIdHex === target.refundableSourceBox.boxId) {
          return cloneResponse(
            sourceResponses[sourceRead++],
            options.cloneResponses ?? true,
          );
        }
        if (boxIdHex === target.commitmentTransaction.outputs[0]!.boxId) {
          return cloneResponse(
            vaultResponses[vaultRead++],
            options.cloneResponses ?? true,
          );
        }
        throw new Error(`unexpected current-state box query: ${boxIdHex}`);
      },
    },
  });
}

interface RelayPacketOptions {
  readonly generation?: number;
  readonly previousPacketDigestHex?: string | null;
  readonly consensusWitness?: Readonly<ErgoAutolykosV2RelayWitnessV1>;
  readonly block?: unknown;
  readonly route?: ReturnType<typeof committedVaultRoute>;
  readonly commitmentTransactionIdHex?: string;
  readonly signedCommitmentTransaction?: unknown;
  readonly refundableSourceBox?: unknown;
  readonly currentStateReads?:
    readonly Readonly<ErgoSourceRelayBoxReadWitnessV1>[];
}

function relayConsensusWitness(
  competingSuffixes: readonly (readonly ErgoHeaderIdentityFields[])[] = [],
  options: Readonly<{
    profile?: ErgoAutolykosV2SpvProfile;
    currentSuffix?: readonly ErgoHeaderIdentityFields[];
  }> = {},
): Readonly<ErgoAutolykosV2RelayWitnessV1> {
  const currentSuffix = options.currentSuffix ?? fixture.selectedSuffix;
  return buildErgoAutolykosV2RelayWitnessV1({
    profile: options.profile ?? fixture.profile,
    checkpoint: fixture.checkpoint,
    currentBranch: {
      suffix: currentSuffix,
      observedAtTimestamp: currentSuffix.at(-1)!.timestamp,
    },
    competingBranches: competingSuffixes.map(suffix => ({
      suffix,
      observedAtTimestamp: suffix.at(-1)!.timestamp,
    })),
    targetHeader: fixture.targetHeader,
  });
}

function relayWitnessPacket(
  options: RelayPacketOptions = {},
): Readonly<ErgoSourceRelayWitnessPacketV1> {
  const headerIdHex = computeErgoHeaderId(fixture.targetHeader).toString('hex');
  return buildErgoSourceRelayWitnessPacketV1({
    relayIdHex: fixture.refundableSourceBox.boxId,
    generation: options.generation ?? 1,
    previousPacketDigestHex: options.previousPacketDigestHex ?? null,
    consensusWitness: options.consensusWitness ?? relayConsensusWitness(),
    commitmentTransactionIdHex:
      options.commitmentTransactionIdHex ?? fixture.commitmentTransaction.txId,
    block: options.block ?? {
      header: nodeHeader(fixture.targetHeader),
      blockTransactions: {
        headerId: headerIdHex,
        blockVersion: 4,
        transactions: [fixture.signedTransaction],
      },
    },
    signedCommitmentTransaction:
      options.signedCommitmentTransaction ?? fixture.signedTransaction,
    refundableSourceBox:
      options.refundableSourceBox ?? fixture.refundableSourceBox,
    route: options.route ?? committedVaultRoute(),
    currentStateReads:
      options.currentStateReads ?? relayCurrentStateReads(),
  });
}

function relayCurrentStateReads(options: Readonly<{
  sourceBefore?: unknown | null;
  sourceAfter?: unknown | null;
  vaultBefore?: unknown | null;
  vaultAfter?: unknown | null;
}> = {}): readonly Readonly<ErgoSourceRelayBoxReadWitnessV1>[] {
  const sourceBoxIdHex = fixture.refundableSourceBox.boxId;
  const vaultBoxIdHex = fixture.commitmentTransaction.outputs[0]!.boxId;
  const vault = fixture.commitmentTransaction.outputs[0]!;
  return [
    {
      sequence: 0,
      role: 'source_before',
      boxIdHex: sourceBoxIdHex,
      box: options.sourceBefore ?? null,
    },
    {
      sequence: 1,
      role: 'vault_before',
      boxIdHex: vaultBoxIdHex,
      box: options.vaultBefore ?? vault,
    },
    {
      sequence: 2,
      role: 'source_after',
      boxIdHex: sourceBoxIdHex,
      box: options.sourceAfter ?? null,
    },
    {
      sequence: 3,
      role: 'vault_after',
      boxIdHex: vaultBoxIdHex,
      box: options.vaultAfter ?? vault,
    },
  ] as const;
}

async function relayDatabasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-wp01d-relay-'));
  relayTestDirectories.push(directory);
  return join(directory, 'relay.sqlite');
}

function cloneResponse(
  value: unknown | null | undefined,
  clone: boolean,
): unknown | null {
  if (value === null) return null;
  if (value === undefined) throw new Error('test current-state response is missing');
  return clone ? structuredClone(value) : value;
}

function syntheticFrontierSourceProofStatement():
  FrontierErgoAutolykosCommittedVaultSourceProofStatementV1 {
  const h256 = (byte: number) =>
    `0x${byte.toString(16).padStart(2, '0').repeat(32)}`;
  return {
    formatVersion: 1,
    proofSystemIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_PROFILE_ID_V1_HEX,
    finalityPolicyIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_FINALITY_POLICY_ID_V1_HEX,
    verifierProfileIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_VERIFIER_PROFILE_ID_V1_HEX,
    sourceConsensusCandidateDigestHex: h256(0x11),
    committedVaultCandidateDigestHex: h256(0x12),
    spvProfileIdHex: h256(0x13),
    sourceNetworkIdHex: h256(0x14),
    checkpointHeaderIdHex: h256(0x15),
    checkpointHeight: 100,
    knownBranchesDigestHex: h256(0x16),
    knownBranchCount: 2,
    selectedTipHeaderIdHex: h256(0x17),
    selectedTipHeight: 110,
    selectedCumulativeWork: '1000',
    targetHeaderIdHex: h256(0x18),
    targetHeight: 101,
    targetBlockVersion: 4,
    targetTransactionsRootHex: h256(0x19),
    targetCanonicalHeaderSha256Hex: h256(0x1a),
    targetCanonicalHeaderLength: 200,
    confirmations: 10,
    requiredConfirmations: 2,
    wp01cVerificationDigestHex: h256(0x1b),
    transactionIdHex: h256(0x1c),
    transactionSigmaDigestHex: h256(0x1d),
    transactionIndex: 0,
    transactionCount: 1,
    routeProfileIdHex: FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
    sourceLockErgoTreeSha256Hex: h256(0x1e),
    vaultErgoTreeSha256Hex: h256(0x1f),
    committedTransactionIdHex: h256(0x1c),
    committedTransactionSigmaDigestHex: h256(0x1d),
    transactionSemanticsDigestHex: h256(0x20),
    sourceBoxIdHex: h256(0x21),
    sourceBoxContentDigestHex: h256(0x22),
    sourceInputIndex: 1,
    sourceInputCount: 1,
    vaultBoxIdHex: h256(0x23),
    vaultOutputIndex: 0,
    currentStateObservationDigestHex: h256(0x24),
    assetProfileIdHex: FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
    assetIdHex: h256(0),
    amountNanoErg: '100000000',
    recipientH160Hex: `0x${'44'.repeat(20)}`,
    depositorErgoTreeSha256Hex: h256(0x25),
  };
}

async function candidateFixture(
  options: CandidateFixtureOptions = {},
): Promise<CandidateFixture> {
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: SOURCE_AMOUNT,
      ergoTree: SOURCE_LOCK_TREE,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(TARGET_H160, 'hex')),
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
        R4: encodeCollByteRegister(Buffer.from(TARGET_H160, 'hex')),
        R5: encodeLongRegister(SOURCE_AMOUNT),
        R6: encodeCollByteRegister(GENERATOR),
        R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
      },
      creationHeight: 111,
    }, {
      value: 100_000_000n,
      ergoTree: BASE_INPUT.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: 111,
    }],
  }, 'Ergo source-consensus refundable source fixture');
  const refundableSourceBox = funding.outputs[0]!;
  const alternateRefundableSourceBox = funding.outputs[1]!;
  const feeSourceBox = funding.outputs[2]!;
  const vaultAmountNanoErg = options.vaultAmountNanoErg ?? SOURCE_AMOUNT;
  const commitmentTransaction: Eip12UnsignedTransaction = {
    inputs: [
      { ...refundableSourceBox, extension: {} },
      { ...feeSourceBox, extension: {} },
    ],
    dataInputs: options.sourceAlsoDataInput ? [refundableSourceBox] : [],
    outputs: [{
      value: vaultAmountNanoErg,
      ergoTree: VAULT_TREE,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(refundableSourceBox.boxId, 'hex')),
        R5: encodeCollByteRegister(Buffer.from(
          options.vaultRecipientH160Hex ?? TARGET_H160,
          'hex',
        )),
        R6: encodeLongRegister(SOURCE_AMOUNT),
        R7: encodeCollByteRegister(Buffer.from(
          options.vaultDepositorErgoTreeHex ?? DEPOSITOR_TREE,
          'hex',
        )),
        ...options.extraVaultRegisters,
      },
      creationHeight: 112,
    }, {
      value: SOURCE_AMOUNT + 100_000_000n - vaultAmountNanoErg,
      ergoTree: feeSourceBox.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: 112,
    }],
  };
  const transaction = options.sourceAlsoDataInput
    ? await materializeUncheckedUnsignedTransaction(commitmentTransaction)
    : await materializeUnsignedTransaction(
      commitmentTransaction,
      'Ergo source-consensus candidate transaction fixture',
    );
  const signed = signedTransaction(transaction);
  const transactionsRoot = computeErgoBlockTransactionsRoot({
    blockVersion: 4,
    transactions: [{
      transactionId: Buffer.from(transaction.txId, 'hex'),
      spendingProofs: [Buffer.alloc(0), Buffer.alloc(0)],
    }],
  });
  const { profile, checkpoint } = fixtureState();
  const currentSuffix = mineSuffix(checkpoint.header, 2, 100);
  const selectedSuffix = mineSuffix(
    checkpoint.header,
    3,
    200,
    transactionsRoot,
  );
  const currentBranch = verifyErgoAutolykosV2SpvBranch(
    profile,
    checkpoint,
    currentSuffix,
    currentSuffix.at(-1)!.timestamp,
  );
  const selectedBranch = verifyErgoAutolykosV2SpvBranch(
    profile,
    checkpoint,
    selectedSuffix,
    selectedSuffix.at(-1)!.timestamp,
  );
  const targetHeader = selectedSuffix[0]!;
  const headerIdHex = computeErgoHeaderId(targetHeader).toString('hex');
  const verification = await verifyErgoBlockTransactionCommitment({
    block: {
      header: nodeHeader(targetHeader),
      blockTransactions: {
        headerId: headerIdHex,
        blockVersion: 4,
        transactions: [signed],
      },
    },
    expectedHeaderIdHex: headerIdHex,
    expectedHeight: targetHeader.height,
    expectedTransactionIdHex: transaction.txId,
    expectedTransaction: signed,
  });
  return {
    profile,
    checkpoint,
    currentSuffix,
    selectedSuffix,
    currentBranch,
    selectedBranch,
    targetHeader,
    verification,
    signedTransaction: signed,
    commitmentTransaction: transaction,
    refundableSourceBox,
    alternateRefundableSourceBox,
    feeSourceBox,
  };
}

async function materializeUncheckedUnsignedTransaction(
  transaction: Eip12UnsignedTransaction,
): Promise<MaterializedUnsignedTransaction> {
  const module = await import('ergo-lib-wasm-nodejs');
  const wasm = module.default ?? module;
  let unsigned: any;
  let transactionId: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
      inputs: transaction.inputs.map(input => ({
        boxId: input.boxId,
        extension: input.extension,
      })),
      dataInputs: transaction.dataInputs.map(input => ({ boxId: input.boxId })),
      outputs: transaction.outputs.map(output => ({
        value: String(output.value),
        ergoTree: output.ergoTree,
        assets: (output.assets ?? []).map(asset => ({
          tokenId: asset.tokenId,
          amount: String(asset.amount),
        })),
        additionalRegisters: output.additionalRegisters ?? {},
        creationHeight: output.creationHeight,
      })),
    }));
    transactionId = unsigned.id();
    const txId = String(transactionId.to_str()).toLowerCase();
    const candidates = unsigned.output_candidates();
    const outputs: Eip12Box[] = [];
    for (let index = 0; index < candidates.len(); index += 1) {
      const output = wasm.ErgoBox.from_box_candidate(
        candidates.get(index),
        transactionId,
        index,
      );
      try {
        outputs.push(output.to_js_eip12() as Eip12Box);
      } finally {
        output.free?.();
      }
    }
    return {
      txId,
      eip12Tx: structuredClone(transaction),
      outputs,
    };
  } finally {
    transactionId?.free?.();
    unsigned?.free?.();
  }
}

function fixtureState(): {
  profile: ErgoAutolykosV2SpvProfile;
  checkpoint: ErgoAutolykosV2SpvCheckpoint;
} {
  const context = [{ height: 0, timestamp: 0n, nBits: NBITS }];
  const checkpointHeader = baseHeader({
    height: 128,
    timestamp: 128n * INTERVAL,
    parentId: hex('aa'.repeat(32)),
    nonce: 0n,
  });
  const checkpoint = {
    sourceNetworkId: NETWORK_ID,
    header: checkpointHeader,
    difficultyContext: context,
  };
  return {
    checkpoint,
    profile: {
      sourceNetworkId: NETWORK_ID,
      checkpointHeaderId: computeErgoHeaderId(checkpointHeader),
      checkpointDifficultyContextDigest:
        computeErgoDifficultyContextDigest(context),
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
    },
  };
}

function mineSuffix(
  checkpoint: ErgoHeaderIdentityFields,
  length: number,
  salt: number,
  firstTransactionsRoot?: Uint8Array,
): ErgoHeaderIdentityFields[] {
  const headers: ErgoHeaderIdentityFields[] = [];
  let parent = checkpoint;
  for (let index = 0; index < length; index += 1) {
    const candidate = baseHeader({
      height: parent.height + 1,
      timestamp: parent.timestamp + INTERVAL,
      parentId: computeErgoHeaderId(parent),
      nonce: 0n,
      salt: salt + index + 1,
      transactionsRoot: index === 0 ? firstTransactionsRoot : undefined,
    });
    const mined = mineHeader(candidate);
    headers.push(mined);
    parent = mined;
  }
  return headers;
}

function mineHeader(
  candidate: ErgoHeaderIdentityFields,
): ErgoHeaderIdentityFields {
  for (let nonce = 0n; nonce < 10_000n; nonce += 1n) {
    const nonceBytes = Buffer.alloc(8);
    nonceBytes.writeBigUInt64BE(nonce);
    const header = {
      ...candidate,
      powSolution: { ...candidate.powSolution, nonce: nonceBytes },
    };
    if (verifyClaimedAutolykosV2ProofOfWork(header)) return header;
  }
  throw new Error('test miner did not find a bounded Autolykos nonce');
}

function baseHeader(input: {
  height: number;
  timestamp: bigint;
  parentId: Uint8Array;
  nonce: bigint;
  salt?: number;
  transactionsRoot?: Uint8Array;
}): ErgoHeaderIdentityFields {
  const salt = input.salt ?? 0;
  const nonce = Buffer.alloc(8);
  nonce.writeBigUInt64BE(input.nonce);
  return {
    version: 4,
    parentId: Buffer.from(input.parentId),
    adProofsRoot: filled(32, salt + 1),
    stateRoot: filled(33, salt + 2),
    transactionsRoot: input.transactionsRoot === undefined
      ? filled(32, salt + 3)
      : Buffer.from(input.transactionsRoot),
    timestamp: input.timestamp,
    nBits: NBITS,
    height: input.height,
    extensionHash: filled(32, salt + 4),
    votes: hex('000000'),
    powSolution: { publicKey: GENERATOR, nonce },
  };
}

function nodeHeader(header: ErgoHeaderIdentityFields): Record<string, unknown> {
  return {
    id: computeErgoHeaderId(header).toString('hex'),
    parentId: Buffer.from(header.parentId).toString('hex'),
    height: header.height,
    version: header.version,
    adProofsRoot: Buffer.from(header.adProofsRoot).toString('hex'),
    stateRoot: Buffer.from(header.stateRoot).toString('hex'),
    transactionsRoot: Buffer.from(header.transactionsRoot).toString('hex'),
    timestamp: Number(header.timestamp),
    nBits: header.nBits,
    extensionHash: Buffer.from(header.extensionHash).toString('hex'),
    powSolutions: {
      pk: Buffer.from(header.powSolution.publicKey).toString('hex'),
      w: GENERATOR.toString('hex'),
      n: Buffer.from(header.powSolution.nonce).toString('hex'),
      d: '0',
    },
    votes: Buffer.from(header.votes).toString('hex'),
  };
}

function signedTransaction(
  transaction: MaterializedUnsignedTransaction,
): Record<string, unknown> {
  return {
    id: transaction.txId,
    inputs: transaction.eip12Tx.inputs.map(input => ({
      boxId: input.boxId,
      spendingProof: { proofBytes: '', extension: input.extension },
    })),
    dataInputs: transaction.eip12Tx.dataInputs.map(input => ({
      boxId: input.boxId,
    })),
    outputs: transaction.outputs,
  };
}

function filled(length: number, value: number): Buffer {
  return Buffer.alloc(length, value & 0xff);
}

function hex(value: string): Buffer {
  return Buffer.from(value, 'hex');
}
