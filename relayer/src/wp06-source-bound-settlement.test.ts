import blakejs from 'blakejs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';

const provenance = vi.hoisted(() => ({
  assertHandoff: vi.fn(),
}));

vi.mock('./scripts/spikes/spike15-wp06-source-to-tracker-vm.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./scripts/spikes/spike15-wp06-source-to-tracker-vm.js')
  >();
  return {
    ...actual,
    assertWp06SourceToTrackerVmResultProvenance: provenance.assertHandoff,
  };
});

import { deriveBridgeFinalityProgramIdHex } from './bridge-finality-proof.js';
import {
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from './ergo-encoding.js';
import {
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerAvlRegister,
  encodeAuthenticatedSpvTrackerValue,
  getAuthenticatedSpvTrackerDigest,
} from './spv-tracker-authenticated.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
} from './trustless-burn-proof.js';
import { WP06_SOURCE_DERIVED_NEGATIVE_CASES } from './test-fixtures/wp06-source-derived-fixture.js';
import type {
  Wp06SourceToTrackerVmResult,
} from './scripts/spikes/spike15-wp06-source-to-tracker-vm.js';
import { buildWp06SourceBoundSettlementPlan } from './wp06-source-bound-settlement.js';

const SIDECHAIN_ID = '11'.repeat(32);
const EXECUTION_HASH = '22'.repeat(32);
const TX_HASH = '33'.repeat(32);
const RECIPIENT_TREE = `0008cd02${'41'.repeat(32)}`;
const TRACKER_TREE = '10010100';
const TRACKER_NFT = 'a1'.repeat(32);
const TRACKER_HEIGHT = 1_024;
const ANCHOR_HEIGHT = 99_995;
const FINALITY_PUBLIC_KEY =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

describe('WP-06 source-bound settlement planning', () => {
  it('derives tracker, payout, and DUP bindings from one handoff capability', () => {
    const handoff = buildHandoff();
    const result = buildWp06SourceBoundSettlementPlan({
      sourceToTrackerHandoff: handoff,
      dupHistoryKeys: ['90'.repeat(32)],
    });

    expect(provenance.assertHandoff).toHaveBeenCalledWith(handoff);
    expect(result.trackerBox).toBe(handoff.admittedTrackerSuccessor);
    expect(result.plan.trackerInputDigestHex)
      .toBe(handoff.trackerAdmission.successorDigestHex);
    expect(result.plan.claims[0].trackerKeyHex)
      .toBe(handoff.sourceBindings.trackerKeyHex);
    expect(result.plan.claims[0].trackerValueHex)
      .toBe(handoff.sourceBindings.trackerValueHex);
    expect(result.plan.claims[0].duplicatePreventionKeyHex)
      .toBe(handoff.sourceBindings.burnIdHex);
    expect(result.recipientErgoTreeHex).toBe(RECIPIENT_TREE);
    expect(result.payoutAmountNanoErg).toBe('1000000');
    expect(result.minimumSettlementHeight).toBe(ANCHOR_HEIGHT + 10);
    expect(result.bindings.anchor).toEqual({
      headerIdHex: '55'.repeat(32),
      headerHeight: ANCHOR_HEIGHT,
      extensionRootHex: 'ab'.repeat(32),
      trackerAdmissionCurrentHeight: 100_000,
      settlementHeight: ANCHOR_HEIGHT + 10,
    });
    expect(result.boundary).toEqual({
      processLocalProvenanceRequired: true,
      serializedRehydrationAuthorizesSettlement: false,
      sourceTrackerBoxReconstructed: false,
      r9FinalityAuthority: true,
      gate5Closed: false,
      submitOrBroadcastEnabled: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.plan.claims[0].settlementIdentity)).toBe(true);
  });

  it('rejects settlement identity drift from the proved burn leaf', () => {
    const handoff = structuredClone(buildHandoff());
    handoff.burnProofBundle.settlementIdentity.amountNanoErg = '1000001';

    expect(() => buildWp06SourceBoundSettlementPlan({
      sourceToTrackerHandoff: handoff,
    })).toThrow(/derived exactly from the proved burn leaf/i);
  });

  it('rejects payout and tracker-history substitutions independently', () => {
    const wrongPayout = structuredClone(buildHandoff());
    wrongPayout.pegOut.amount = 1_000_001n;
    expect(() => buildWp06SourceBoundSettlementPlan({
      sourceToTrackerHandoff: wrongPayout,
    })).toThrow(/payout preimage/i);

    const wrongHistory = structuredClone(buildHandoff());
    (wrongHistory.trackerHistoryAfterAdmission as Array<{ key: string; value: string }>)[0].value =
      'fe'.repeat(264);
    expect(() => buildWp06SourceBoundSettlementPlan({
      sourceToTrackerHandoff: wrongHistory,
    })).toThrow(/tracker history/i);
  });

  it('rejects admitted tracker register and singleton substitutions', () => {
    const wrongRegister = structuredClone(buildHandoff());
    const trackerBox = wrongRegister.admittedTrackerSuccessor as any;
    trackerBox.additionalRegisters = {
      ...trackerBox.additionalRegisters,
      R7: encodeLongRegister(TRACKER_HEIGHT + 1),
    };
    expect(() => buildWp06SourceBoundSettlementPlan({
      sourceToTrackerHandoff: wrongRegister,
    })).toThrow(/registers drifted/i);

    const wrongNft = structuredClone(buildHandoff());
    (wrongNft.admittedTrackerSuccessor as any).assets[0].amount = 2;
    expect(() => buildWp06SourceBoundSettlementPlan({
      sourceToTrackerHandoff: wrongNft,
    })).toThrow(/singleton NFT/i);
  });

  it('isolates every remaining tracker successor and history identity branch', () => {
    const cases: Array<{
      label: string;
      mutate: (handoff: Wp06SourceToTrackerVmResult) => void;
      pattern: RegExp;
    }> = [
      {
        label: 'signed transaction id',
        mutate: handoff => {
          (handoff.admittedTrackerSuccessor as any).transactionId = 'ef'.repeat(32);
        },
        pattern: /transaction ID mismatch/i,
      },
      {
        label: 'signed output index',
        mutate: handoff => { (handoff.admittedTrackerSuccessor as any).index = 1; },
        pattern: /output index mismatch/i,
      },
      {
        label: 'box id',
        mutate: handoff => { (handoff.admittedTrackerSuccessor as any).boxId = 'not-a-box-id'; },
        pattern: /boxId/i,
      },
      {
        label: 'ErgoTree',
        mutate: handoff => { (handoff.admittedTrackerSuccessor as any).ergoTree = '10010200'; },
        pattern: /ErgoTree/i,
      },
      {
        label: 'value',
        mutate: handoff => { (handoff.admittedTrackerSuccessor as any).value = 0; },
        pattern: /value must be positive/i,
      },
      {
        label: 'creation height',
        mutate: handoff => { (handoff.admittedTrackerSuccessor as any).creationHeight = 99_999; },
        pattern: /creationHeight/i,
      },
      {
        label: 'history key',
        mutate: handoff => {
          (handoff.trackerHistoryAfterAdmission as any)[0].key = 'ef'.repeat(32);
        },
        pattern: /tracker history/i,
      },
      {
        label: 'successor digest',
        mutate: handoff => {
          (handoff.trackerAdmission as any).successorDigestHex = 'ef'.repeat(32);
        },
        pattern: /tracker history/i,
      },
      {
        label: 'history cardinality',
        mutate: handoff => {
          (handoff.trackerHistoryAfterAdmission as any).push({
            key: 'ed'.repeat(32),
            value: 'ec'.repeat(264),
          });
        },
        pattern: /tracker history/i,
      },
      {
        label: 'R5 digest binding',
        mutate: handoff => {
          const wrongR5 = encodeAuthenticatedSpvTrackerAvlRegister('ef'.repeat(33));
          (handoff.admittedTrackerSuccessor as any).additionalRegisters.R5 = wrongR5;
          (handoff.trackerAdmission as any).successorRegisters.R5 = wrongR5;
        },
        pattern: /R5 does not bind/i,
      },
      {
        label: 'token id format',
        mutate: handoff => {
          (handoff.admittedTrackerSuccessor as any).assets[0].tokenId = 'invalid-token';
        },
        pattern: /singleton NFT/i,
      },
      {
        label: 'extra singleton asset',
        mutate: handoff => {
          (handoff.admittedTrackerSuccessor as any).assets.push({
            tokenId: 'ee'.repeat(32),
            amount: 1,
          });
        },
        pattern: /singleton NFT/i,
      },
    ];

    for (const testCase of cases) {
      const handoff = structuredClone(buildHandoff());
      testCase.mutate(handoff);
      expect(
        () => buildWp06SourceBoundSettlementPlan({ sourceToTrackerHandoff: handoff }),
        testCase.label,
      ).toThrow(testCase.pattern);
    }
  });

  it('rejects retained tracker anchor drift before deriving settlement height', () => {
    const handoff = structuredClone(buildHandoff());
    (handoff.trackerAdmissionHeaderContext.anchorHeader as any).id = 'ef'.repeat(32);
    expect(() => buildWp06SourceBoundSettlementPlan({ sourceToTrackerHandoff: handoff }))
      .toThrow(/retained tracker anchor/i);
  });

  it('exposes one bounded source-to-settlement command with no check or broadcast route', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(packageJson.scripts['trustless:wp06-source-to-settlement-vm'])
      .toBe('tsx src/scripts/spikes/spike16-wp06-source-to-settlement-vm.ts');

    const orchestratorSource = readFileSync(
      join(process.cwd(), 'src', 'scripts', 'spikes', 'spike16-wp06-source-to-settlement-vm.ts'),
      'utf8',
    );
    const settlementVmSource = readFileSync(
      join(process.cwd(), 'src', 'scripts', 'spikes', 'spike14-authenticated-settlement-full-tx-eval.ts'),
      'utf8',
    );
    const trackerOrchestratorSource = readFileSync(
      join(process.cwd(), 'src', 'scripts', 'spikes', 'spike15-wp06-source-to-tracker-vm.ts'),
      'utf8',
    );
    const trackerVmSource = readFileSync(
      join(process.cwd(), 'src', 'scripts', 'spikes', 'spike13-authenticated-spv-tracker-vm.ts'),
      'utf8',
    );
    const consumerSource = readFileSync(
      join(process.cwd(), 'src', 'wp06-source-bound-settlement.ts'),
      'utf8',
    );
    const jvmFixtureSource = readFileSync(
      join(process.cwd(), 'src', 'authenticated-v2-jvm-vm-conformance.ts'),
      'utf8',
    );
    const jvmRunnerSource = readFileSync(
      join(process.cwd(), 'src', 'authenticated-v2-source-tree-conformance.ts'),
      'utf8',
    );
    const canonicalHeaderSource = readFileSync(
      join(process.cwd(), 'src', 'wp06-canonical-jvm-header-chain.ts'),
      'utf8',
    );
    const sourceBoundJvmValidationSource = readFileSync(
      join(process.cwd(), 'src', 'wp06-source-bound-jvm-validation.ts'),
      'utf8',
    );
    const transitiveSurface = [
      orchestratorSource,
      settlementVmSource,
      trackerOrchestratorSource,
      trackerVmSource,
      consumerSource,
      jvmFixtureSource,
      jvmRunnerSource,
      canonicalHeaderSource,
      sourceBoundJvmValidationSource,
    ].join('\n');
    expect(transitiveSurface)
      .not.toMatch(/\b(?:submit_transaction|sendTransaction|signAndSubmit)\s*\(/);
    expect(transitiveSurface)
      .not.toMatch(/fetch\s*\(\s*[^)]*\/transactions\/check/);
    expect(transitiveSurface)
      .not.toMatch(/from ['"][^'"]*(?:sqlite|database|submit|broadcast)[^'"]*['"]/i);
    expect(orchestratorSource).toContain('assertWp06SourceToTrackerVmResultProvenance');
    expect(orchestratorSource).toContain('runWp06SourceBoundAuthenticatedSettlementVm');
    expect(orchestratorSource).toContain('deeply frozen handoff copy rejected');
    expect(trackerOrchestratorSource).toContain('jvmConformance: true');
    expect(trackerOrchestratorSource).toContain('JVM_EXECUTABLE_TARGET_BURN_ID_HEX');
    expect(trackerVmSource).toContain('verifyAuthenticatedV2JvmVmFixture');
    expect(settlementVmSource).toContain('verifyAuthenticatedV2JvmVmFixture');
    expect(jvmFixtureSource).toContain('signedTransactionBytes: Uint8Array');
    expect(jvmFixtureSource).toContain('wallet serialization');
    expect(jvmRunnerSource).toContain('report fixture SHA-256 does not match');
    expect(canonicalHeaderSource).toContain('must share one exact anchor object');
    expect(sourceBoundJvmValidationSource).toContain('assertWp06TrackerJvmReplayReport');
    expect(sourceBoundJvmValidationSource).toContain('assertWp06SettlementJvmReplayReport');
    expect(sourceBoundJvmValidationSource).toContain('assertWp06SourceToSettlementJvmContinuity');
    expect(consumerSource).toContain('serializedRehydrationAuthorizesSettlement: false');
    expect(settlementVmSource).toContain('sourceToTrackerHandoff.admittedTrackerSuccessor');
    expect(settlementVmSource).toContain('assertExactExecutableErgoTree');
  });
});

function buildHandoff(): Wp06SourceToTrackerVmResult {
  const eventIndex = 1;
  const burnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainTxHashHex: TX_HASH,
    eventIndex,
  });
  const recipientHashHex = Buffer.from(blakejs.blake2b(
    Buffer.from(RECIPIENT_TREE, 'hex'),
    undefined,
    32,
  )).toString('hex');
  const proof = buildTrustlessBurnInclusionProof([{
    sidechainIdHex: SIDECHAIN_ID,
    sidechainBlockHashHex: EXECUTION_HASH,
    burnIdHex,
    sidechainTxHashHex: TX_HASH,
    eventIndex,
    recipientErgoTreeHashHex: recipientHashHex,
    amountNanoErg: '1000000',
    assetIdHex: '00'.repeat(32),
  }], burnIdHex);
  const trackerKeyHex = deriveAuthenticatedSpvTrackerKey({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainHeight: TRACKER_HEIGHT,
    executionBlockHashHex: EXECUTION_HASH,
  });
  const trackerValueHex = encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex: proof.bridgeEventRootHex,
    checkpointCommitmentHex: '44'.repeat(32),
    anchorHeaderIdHex: '55'.repeat(32),
    anchorHeaderHeight: ANCHOR_HEIGHT,
    finalityProofSystemId: 1,
    finalityStatementDigestHex: '66'.repeat(32),
    finalityProgramIdHex: deriveBridgeFinalityProgramIdHex(),
    finalityVerifierProfileIdHex: '77'.repeat(32),
    finalityProofPayloadDigestHex: '88'.repeat(32),
    finalityProofDigestHex: '99'.repeat(32),
  });
  const history = [{ key: trackerKeyHex, value: trackerValueHex }];
  const successorDigestHex = getAuthenticatedSpvTrackerDigest(history);
  const successorRegisters = {
    R4: encodeLongRegister(1),
    R5: encodeAuthenticatedSpvTrackerAvlRegister(successorDigestHex),
    R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID, 'hex')),
    R7: encodeLongRegister(TRACKER_HEIGHT),
    R8: encodeIntRegister(99_999),
    R9: encodeSigmaPropRegister(FINALITY_PUBLIC_KEY),
  };
  const settlementIdentity = {
    source: 'trustless-burn-leaf' as const,
    duplicatePreventionKeyHex: burnIdHex,
    bridgeEventRootHex: proof.bridgeEventRootHex,
    recipientErgoTreeHashHex: recipientHashHex,
    amountNanoErg: '1000000',
    assetIdHex: '00'.repeat(32),
    trustlessBurnProof: proof.proof,
  };
  const admittedTrackerSuccessor = {
    boxId: 'aa'.repeat(32),
    value: 2_000_000,
    ergoTree: TRACKER_TREE,
    assets: [{ tokenId: TRACKER_NFT, amount: 1 }],
    additionalRegisters: successorRegisters,
    creationHeight: 100_000,
    transactionId: 'bb'.repeat(32),
    index: 0,
  };

  return {
    sourceBindings: {
      sidechainIdHex: SIDECHAIN_ID,
      sidechainHeight: String(TRACKER_HEIGHT),
      executionBlockHashHex: EXECUTION_HASH,
      bridgeEventRootHex: proof.bridgeEventRootHex,
      checkpointCommitmentHex: '44'.repeat(32),
      aggregateFinalityProofDigestHex: '99'.repeat(32),
      burnIdHex,
      extensionKeyHex: '0401',
      extensionRootHex: 'ab'.repeat(32),
      trackerKeyHex,
      trackerValueHex,
      trackerAdmissionTransactionIdHex: 'bb'.repeat(32),
    },
    nativeBuildIdentity: {
      verifierExecutableSha256Hex: '77'.repeat(32),
      codecExecutableSha256Hex: 'ee'.repeat(32),
    },
    canonicalHeaderVector: {
      fileSha256Hex: 'dd'.repeat(32),
      anchorIdHex: '55'.repeat(32),
      anchorHeight: ANCHOR_HEIGHT,
      anchorExtensionRootHex: 'ab'.repeat(32),
    },
    checkpoint: {} as never,
    aggregateFinalityProof: {} as never,
    aggregateFinalityCommitment: {} as never,
    targetBurn: {
      transactionIndex: 0,
      logIndex: eventIndex,
      eventIndex,
      sidechainTxHashHex: TX_HASH,
      burnIdHex,
      userAddress: `0x${'12'.repeat(20)}`,
      amountNanoErg: '1000000',
      recipientErgoTreeHex: RECIPIENT_TREE,
      recipientErgoTreeHashHex: recipientHashHex,
    },
    pegOut: {
      user: `0x${'12'.repeat(20)}`,
      amount: 1_000_000n,
      ergoRecipientAddress: RECIPIENT_TREE,
      sidechainTxHash: TX_HASH,
      sidechainBlockNumber: TRACKER_HEIGHT,
      sidechainBlockHash: EXECUTION_HASH,
      sidechainLogIndex: eventIndex,
    },
    burnProofBundle: { proof, settlementIdentity },
    extensionMembership: {} as never,
    trackerHistoryBefore: [],
    trackerHistoryAfterAdmission: history,
    trackerAdmission: {
      trackerKeyHex,
      trackerValueHex,
      successorDigestHex,
      successorRegisters,
      anchorHeader: {
        idHex: '55'.repeat(32),
        height: ANCHOR_HEIGHT,
        extensionRootHex: 'ab'.repeat(32),
        contextIndex: 4,
      },
    } as never,
    trackerAdmissionHeaderContext: buildTrackerHeaderContext(),
    trackerAdmissionJvmConformanceReport: {} as never,
    trackerAdmissionJvmReplayBinding: {} as never,
    admittedTrackerSuccessor,
    trackerTree: TRACKER_TREE,
    negativeCases: [],
    sourceNegativeCases: [...WP06_SOURCE_DERIVED_NEGATIVE_CASES],
    boundary: {
      sourceDerivedPublicFixture: true,
      sourceDependencyFetchPrevented: false,
      chainRpcAccessEnabled: false,
      chainRpcWritesEnabled: false,
      ephemeralInMemorySigningUsed: true,
      externalWalletStateAccessed: false,
      sourceBoundPinnedJvmTrackerReplayVerified: true,
      r9FinalityAuthority: true,
      gate5Closed: false,
      submitOrBroadcastEnabled: false,
    },
  };
}

function buildTrackerHeaderContext(): Wp06SourceToTrackerVmResult['trackerAdmissionHeaderContext'] {
  const ids = Array.from({ length: 11 }, (_, index) => (
    index === 4 ? '55'.repeat(32) : (0xc0 + index).toString(16).repeat(32)
  ));
  const headers = Array.from({ length: 10 }, (_, index) => {
    const id = ids[index];
    const parentId = ids[index + 1];
    const height = 99_999 - index;
    const extensionRootHex = index === 4
      ? 'ab'.repeat(32)
      : (0xd0 + index).toString(16).repeat(32);
    return {
      raw: {
        id,
        parentId,
        height,
        extensionHash: extensionRootHex,
        timestamp: 1_700_000_000_000 - index * 120_000,
      },
      id,
      parentId,
      height,
      extensionRootHex,
    };
  });
  return {
    currentHeight: 100_000,
    anchorContextIndex: 4,
    anchorHeader: headers[4],
    headers,
    vectorFileSha256Hex: 'dd'.repeat(32),
    provenance: 'wp06-jvm-canonical-synthetic-header-context',
  };
}
