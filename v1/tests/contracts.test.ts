import { describe, expect, it } from 'vitest';
import {
  AvlEntry,
  dupEmptyDigestHex,
  reserveEmptyDigestHex,
  sigmaAvlTreeHex,
  sigmaCollByteHex,
  sigmaIntHex,
  sigmaLongHex,
  trackerEmptyDigestHex,
  trackerInsertProof,
} from '../src/core/avl.js';
import {
  AUTH_MODE_EIP0045_STARK,
  BurnLeafV1,
  ZERO_32_HEX,
  blake2b256Hex,
  buildBurnMerkleTree,
  bytesToHex,
  computeTrackerKeyHex,
  decodeTrackerGovernanceR9,
  encodeBurnLeafV1,
  encodePegInIntentV2,
  encodeStarkPayloadV1,
  encodeTrackerValueV1,
  hexToBytes,
  initialTrackerGovernanceR9,
} from '../src/core/codecs.js';
import {
  JvmVerifyCase,
  compileBridgeV1Family,
  compileRotatedTracker,
  renderStarkTrackerSource,
  verifyTransactionsJvm,
} from '../src/core/contracts.js';
import {
  buildBurnPayoutTx,
  buildCommitDepositTx,
  buildRefundDepositTx,
  buildRentRefreshTx,
  buildTrackerAdmitTx,
  buildTrackerCancelUpgradeTx,
  buildTrackerExecuteUpgradeTx,
  buildTrackerProposeUpgradeTx,
} from '../src/core/tx-builders.js';
import {
  ErgoBoxJson,
  SignedTxResult,
  committeeGenerateCommitmentsJson,
  committeePartialSignAndExtractHintsJson,
  deriveKeyPairFromSecretHex,
  finalizeDistributedCommitteeTx,
  makeSyntheticErgoBox,
  signTransaction,
  signTransactionDistributedCommittee,
} from '../src/crypto/signer.js';

// Deterministic test keys (ONLY for offline unit tests!)
const SEC_C1 = '11'.repeat(32);
const SEC_C2 = '22'.repeat(32);
const SEC_C3 = '33'.repeat(32);
const SEC_C4 = '44'.repeat(32);
const SEC_C5 = '55'.repeat(32);
const SEC_FEE = '66'.repeat(32);
const SEC_USER = '77'.repeat(32);
const SEC_ATTACKER = '88'.repeat(32);

const K_C1 = deriveKeyPairFromSecretHex(SEC_C1, 16);
const K_C2 = deriveKeyPairFromSecretHex(SEC_C2, 16);
const K_C3 = deriveKeyPairFromSecretHex(SEC_C3, 16);
const K_C4 = deriveKeyPairFromSecretHex(SEC_C4, 16);
const K_C5 = deriveKeyPairFromSecretHex(SEC_C5, 16);
const K_FEE = deriveKeyPairFromSecretHex(SEC_FEE, 16);
const K_USER = deriveKeyPairFromSecretHex(SEC_USER, 16);
const K_ATTACKER = deriveKeyPairFromSecretHex(SEC_ATTACKER, 16);

const SOURCE_NET_ID = 'a1'.repeat(32);
const SIDECHAIN_ID = 'b2'.repeat(32);
const BRIDGE_ADDR = 'c3'.repeat(20);
const TOKEN_ADDR = 'd4'.repeat(20);
const TRACKER_NFT = 'e1'.repeat(32);
const DUP_NFT = 'e2'.repeat(32);
const RESERVE_NFT = 'e3'.repeat(32);

function makeFeeBox(idSeed: string, value: bigint, creationHeight = 100): ErgoBoxJson {
  return makeSyntheticErgoBox({
    txIdHex: idSeed.repeat(32),
    index: 0,
    value,
    ergoTreeHex: K_FEE.p2pkErgoTreeHex,
    creationHeight,
  });
}

function boxFromTxOutput(signed: SignedTxResult, outputIndex: number): ErgoBoxJson {
  const outputs = (signed.signedTxJson as { outputs: ErgoBoxJson[] }).outputs;
  return outputs[outputIndex];
}

describe('Bridge V1 Contracts — Full SigmaState 6.0.2 JVM Matrix & Distributed Multisig Parity', () => {
  const family = compileBridgeV1Family({
    networkPrefix: 16,
    sourceNetworkIdHex: SOURCE_NET_ID,
    sidechainIdHex: SIDECHAIN_ID,
    bridgeAddressHex: BRIDGE_ADDR,
    tokenAddressHex: TOKEN_ADDR,
    trackerNftIdHex: TRACKER_NFT,
    dupNftIdHex: DUP_NFT,
    reserveNftIdHex: RESERVE_NFT,
    committeePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
    committeeThreshold: 2,
    committeeEpoch: 1n,
    escapeTimeoutBlocks: 50,
    minConfirmations: 10n,
    upgradeTimelockBlocks: 20n,
    maxAdmissionLagBlocks: 5n,
    minDepositNanoErg: 10_000_000n,
    minRefreshAgeBlocks: 15,
  });

  const rotated = compileRotatedTracker(family, {
    pubKeysHex: [K_C3.pubKeyHex, K_C4.pubKeyHex, K_C5.pubKeyHex],
    threshold: 2,
    epoch: 2n,
    minRefreshAgeBlocks: 15,
  });

  const genesisTrackerBox = makeSyntheticErgoBox({
    txIdHex: '01'.repeat(32),
    index: 0,
    value: 10_000_000n,
    ergoTreeHex: family.tracker.ergoTreeHex,
    creationHeight: 100,
    assets: [{ tokenId: TRACKER_NFT, amount: 1n }],
    additionalRegisters: {
      R4: sigmaCollByteHex(hexToBytes(family.familyIdHex, 32)),
      R5: sigmaAvlTreeHex(trackerEmptyDigestHex(), 370),
      R6: sigmaCollByteHex(hexToBytes(SIDECHAIN_ID, 32)),
      R7: sigmaLongHex(0n),
      R8: sigmaIntHex(0),
      R9: sigmaCollByteHex(initialTrackerGovernanceR9(1n)),
    },
  });

  const genesisDupBox = makeSyntheticErgoBox({
    txIdHex: '01'.repeat(32),
    index: 1,
    value: 10_000_000n,
    ergoTreeHex: family.dup.ergoTreeHex,
    creationHeight: 100,
    assets: [{ tokenId: DUP_NFT, amount: 1n }],
    additionalRegisters: {
      R4: sigmaCollByteHex(hexToBytes(family.familyIdHex, 32)),
      R5: sigmaAvlTreeHex(dupEmptyDigestHex(), 1),
    },
  });

  const genesisReserveBox = makeSyntheticErgoBox({
    txIdHex: '01'.repeat(32),
    index: 2,
    value: 20_000_000n,
    ergoTreeHex: family.reserve.ergoTreeHex,
    creationHeight: 100,
    assets: [{ tokenId: RESERVE_NFT, amount: 1n }],
    additionalRegisters: {
      R4: sigmaCollByteHex(hexToBytes(family.familyIdHex, 32)),
      R5: sigmaAvlTreeHex(reserveEmptyDigestHex(), 32),
      R6: sigmaLongHex(0n),
    },
  });

  it('compiles all 4 canonical V1 contracts cleanly under 4095 bytes', () => {
    expect(family.depositLock.byteLength).toBeLessThan(4095);
    expect(family.reserve.byteLength).toBeLessThan(4095);
    expect(family.dup.byteLength).toBeLessThan(4095);
    expect(family.tracker.byteLength).toBeLessThan(4095);
    expect(rotated.tracker.byteLength).toBeLessThan(4095);
    expect(rotated.tracker.contractIdHex).not.toBe(family.tracker.contractIdHex);
  });

  it('verifies full lifecycle, distributed 2-of-3 multisig, rotation, EIP-0045 graduation, rent refresh, and 1-field negative falsifiers in SigmaState 6.0.2 JVM', () => {
    const jvmBatch: Array<{
      testCase: JvmVerifyCase;
      expectedPass: boolean;
      expectedTxId: string;
      desc: string;
    }> = [];

    const enqueue = (
      id: string,
      height: number,
      signed: SignedTxResult,
      expectedPass: boolean,
      desc: string,
    ) => {
      jvmBatch.push({
        testCase: {
          id,
          height,
          txBytesHex: signed.txBytesHex,
          inputBoxesBytesHex: signed.inputBoxesBytesHex,
          dataBoxesBytesHex: signed.dataBoxesBytesHex,
        },
        expectedPass,
        expectedTxId: signed.txId,
        desc,
      });
    };

    // ------------------------------------------------------------------------
    // 1. Peg-In: DepositLock -> CommitToReserve (with & without change) + Refund
    // ------------------------------------------------------------------------
    const depositAmount = 50_000_000n;
    const intent1 = encodePegInIntentV2({
      sourceNetworkIdHex: SOURCE_NET_ID,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddressHex: BRIDGE_ADDR,
      tokenAddressHex: TOKEN_ADDR,
      familyIdHex: family.familyIdHex,
      reserveNftIdHex: RESERVE_NFT,
      amountNanoErg: depositAmount,
      evmRecipientHex: 'ab'.repeat(20),
    });
    const depositBox1 = makeSyntheticErgoBox({
      txIdHex: '02'.repeat(32),
      index: 0,
      value: depositAmount,
      ergoTreeHex: family.depositLock.ergoTreeHex,
      creationHeight: 110,
      additionalRegisters: {
        R4: sigmaCollByteHex(intent1),
        R5: sigmaCollByteHex(hexToBytes(K_USER.p2pkErgoTreeHex)),
      },
    });

    // 1a. Positive commit WITH fee change output (flexible fee!)
    const commit1 = buildCommitDepositTx({
      family,
      reserveBox: genesisReserveBox,
      reserveLiabilityNanoErg: 0n,
      reserveHistory: [],
      depositLockBox: depositBox1,
      encodedIntent: intent1,
      feeInBox: makeFeeBox('f1', 10_000_000n, 100),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      feeNanoErg: 1_100_000n,
      creationHeight: 112,
    });
    expect(commit1.unsignedTx.outputs.length).toBe(3);
    const signedCommit1 = signTransaction({
      ...commit1,
      secretKeysHex: [SEC_FEE],
      height: 112,
    });
    enqueue('commit1_with_change', 112, signedCommit1, true, 'Deposit commit with fee change');

    // 1b. Positive commit WITHOUT change (exact fee)
    const commitExact = buildCommitDepositTx({
      family,
      reserveBox: genesisReserveBox,
      reserveLiabilityNanoErg: 0n,
      reserveHistory: [],
      depositLockBox: depositBox1,
      encodedIntent: intent1,
      feeInBox: makeFeeBox('f2', 1_100_000n, 100),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      feeNanoErg: 1_100_000n,
      creationHeight: 112,
    });
    expect(commitExact.unsignedTx.outputs.length).toBe(2);
    enqueue(
      'commit1_exact_fee',
      112,
      signTransaction({ ...commitExact, secretKeysHex: [SEC_FEE], height: 112 }),
      true,
      'Deposit commit exact fee',
    );

    // 1c. Negative: commit AFTER escapeTimeout (110 + 50 = 160)
    enqueue(
      'neg_commit_after_timeout',
      160,
      signedCommit1,
      false,
      'Commit rejected at/after escapeTimeout',
    );

    // 1d. Negative: commit redirects fee change to BridgeDepositLock script (deposit rediscovery attack)
    const badChangeCommit = buildCommitDepositTx({
      family,
      reserveBox: genesisReserveBox,
      reserveLiabilityNanoErg: 0n,
      reserveHistory: [],
      depositLockBox: depositBox1,
      encodedIntent: intent1,
      feeInBox: makeFeeBox('f3', 10_000_000n, 100),
      changeErgoTreeHex: family.depositLock.ergoTreeHex,
      feeNanoErg: 1_100_000n,
      creationHeight: 112,
    });
    // Note: sigma-rust will reject during signing if proposition reduces to false; verify by building signed fee-only tx or catching!
    expect(() =>
      signTransaction({ ...badChangeCommit, secretKeysHex: [SEC_FEE], height: 112 }),
    ).toThrow();

    // 1e. Positive refund at HEIGHT == creationHeight + escapeTimeout (160) + negative 1 block early (159)
    const refund1 = buildRefundDepositTx({
      depositLockBox: depositBox1,
      depositorErgoTreeHex: K_USER.p2pkErgoTreeHex,
      feeInBox: makeFeeBox('f4', 5_000_000n, 100),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 160,
    });
    const signedRefund1 = signTransaction({
      ...refund1,
      secretKeysHex: [SEC_FEE],
      height: 160,
    });
    enqueue('refund_at_timeout', 160, signedRefund1, true, 'Refund passes at escapeTimeout');
    enqueue('neg_refund_early', 159, signedRefund1, false, 'Refund rejected 1 block early');

    // 1f. Negative: refund stolen to attacker ErgoTree
    const stolenRefund = buildRefundDepositTx({
      depositLockBox: depositBox1,
      depositorErgoTreeHex: K_ATTACKER.p2pkErgoTreeHex,
      feeInBox: makeFeeBox('f5', 5_000_000n, 100),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 160,
    });
    expect(() =>
      signTransaction({ ...stolenRefund, secretKeysHex: [SEC_FEE], height: 160 }),
    ).toThrow();

    // 1g. Positive [L-1]: Deposit box with wrong-typed R4 (SLong instead of Coll[Byte]) still refunds after timeout!
    const badTypedR4DepositBox = makeSyntheticErgoBox({
      txIdHex: '09'.repeat(32),
      index: 0,
      value: 15_000_000n,
      ergoTreeHex: family.depositLock.ergoTreeHex,
      creationHeight: 110,
      additionalRegisters: {
        R4: sigmaLongHex(999n),
        R5: sigmaCollByteHex(hexToBytes(K_USER.p2pkErgoTreeHex)),
      },
    });
    const refundBadR4 = buildRefundDepositTx({
      depositLockBox: badTypedR4DepositBox,
      depositorErgoTreeHex: K_USER.p2pkErgoTreeHex,
      feeInBox: makeFeeBox('e1', 5_000_000n, 100),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 160,
    });
    enqueue(
      'refund_wrong_typed_r4_recovers',
      160,
      signTransaction({ ...refundBadR4, secretKeysHex: [SEC_FEE], height: 160 }),
      true,
      'Depositor with wrong-typed R4 can still recover funds at escapeTimeout [L-1]',
    );

    // 1h. Negative [H-2]: Dust peg-in (< minDepositNanoErg=10M) rejected on-chain
    const dustAmount = 2_000_000n;
    const dustIntent = encodePegInIntentV2({
      sourceNetworkIdHex: SOURCE_NET_ID,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddressHex: BRIDGE_ADDR,
      tokenAddressHex: TOKEN_ADDR,
      familyIdHex: family.familyIdHex,
      reserveNftIdHex: RESERVE_NFT,
      amountNanoErg: dustAmount,
      evmRecipientHex: 'ab'.repeat(20),
    });
    const dustDepositBox = makeSyntheticErgoBox({
      txIdHex: '08'.repeat(32),
      index: 0,
      value: dustAmount,
      ergoTreeHex: family.depositLock.ergoTreeHex,
      creationHeight: 110,
      additionalRegisters: {
        R4: sigmaCollByteHex(dustIntent),
        R5: sigmaCollByteHex(hexToBytes(K_USER.p2pkErgoTreeHex)),
      },
    });
    const dustCommit = buildCommitDepositTx({
      family,
      reserveBox: genesisReserveBox,
      reserveLiabilityNanoErg: 0n,
      reserveHistory: [],
      depositLockBox: dustDepositBox,
      encodedIntent: dustIntent,
      feeInBox: makeFeeBox('e2', 5_000_000n, 100),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 112,
    });
    expect(() =>
      signTransaction({ ...dustCommit, secretKeysHex: [SEC_FEE], height: 112 }),
    ).toThrow();

    // Advance Reserve state after Commit 1 (now holds 70M ERG, 50M liability, 20M buffer)
    const reserveAfterCommit1 = boxFromTxOutput(signedCommit1, 0);
    const reserveHistory1: AvlEntry[] = [
      { key: depositBox1.boxId, value: commit1.commitmentHex },
    ];

    // ------------------------------------------------------------------------
    // 2. Permissionless Storage-Rent Refresh + Age Gate [H-1] + DUP R6 Sealing
    // ------------------------------------------------------------------------
    // Reserve created at 112, minRefreshAgeBlocks = 15 => eligible at 127, rejected at 126 (unless topUp >= 1 ERG)!
    const reserveRefresh = buildRentRefreshTx({
      singletonBox: reserveAfterCommit1,
      feeInBox: makeFeeBox('f6', 20_000_000n, 115),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      topUpNanoErg: 5_000_000n,
      creationHeight: 127,
    });
    const signedReserveRefresh = signTransaction({
      ...reserveRefresh,
      secretKeysHex: [SEC_FEE],
      height: 127,
    });
    enqueue(
      'neg_reserve_refresh_before_min_age',
      126,
      signedReserveRefresh,
      false,
      'Reserve small-topUp rentRefresh rejected before minRefreshAgeBlocks [H-1]',
    );
    enqueue(
      'reserve_rent_refresh_topup',
      127,
      signedReserveRefresh,
      true,
      'Permissionless reserve rent refresh passes at minRefreshAgeBlocks with ERG top-up',
    );
    const reserveRefreshed = boxFromTxOutput(signedReserveRefresh, 0);
    expect(BigInt(reserveRefreshed.value)).toBe(75_000_000n); // 25M buffer, 50M liability!

    // DUP created at 100, minRefreshAgeBlocks = 15 => eligible at 120; R6 bloat MUST be rejected!
    const dupRefresh = buildRentRefreshTx({
      singletonBox: genesisDupBox,
      feeInBox: makeFeeBox('f7', 10_000_000n, 115),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      topUpNanoErg: 2_000_000n,
      creationHeight: 120,
    });
    const signedDupRefresh = signTransaction({
      ...dupRefresh,
      secretKeysHex: [SEC_FEE],
      height: 120,
    });
    enqueue('dup_rent_refresh_topup', 120, signedDupRefresh, true, 'DUP rent refresh with top-up');
    const dupRefreshed = boxFromTxOutput(signedDupRefresh, 0);

    // Negative [H-1]: attaching junk R6 to BridgeDup successor MUST fail!
    const dupBloat = buildRentRefreshTx({
      singletonBox: genesisDupBox,
      feeInBox: makeFeeBox('e3', 10_000_000n, 115),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      topUpNanoErg: 0n,
      creationHeight: 120,
    });
    dupBloat.unsignedTx.outputs[0].additionalRegisters.R6 = sigmaLongHex(12345n);
    expect(() =>
      signTransaction({ ...dupBloat, secretKeysHex: [SEC_FEE], height: 120 }),
    ).toThrow();

    const trackerRefresh = buildRentRefreshTx({
      singletonBox: genesisTrackerBox,
      feeInBox: makeFeeBox('f8', 10_000_000n, 115),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      topUpNanoErg: 1_000_000n,
      creationHeight: 120,
    });
    const signedTrackerRefresh = signTransaction({
      ...trackerRefresh,
      secretKeysHex: [SEC_FEE],
      height: 120,
    });
    enqueue(
      'neg_tracker_refresh_before_min_age',
      114,
      signedTrackerRefresh,
      false,
      'Tracker rentRefresh rejected before minRefreshAgeBlocks [H-1]',
    );
    enqueue(
      'tracker_rent_refresh_topup',
      120,
      signedTrackerRefresh,
      true,
      'Tracker permissionless rent refresh with top-up',
    );
    const trackerRefreshed = boxFromTxOutput(signedTrackerRefresh, 0);

    // ------------------------------------------------------------------------
    // 3. Tracker Admit Checkpoint 1 (3-leaf odd-width Merkle block) via TRUE DISTRIBUTED 2-of-3 Multisig!
    // ------------------------------------------------------------------------
    const block1ExecHash = '31'.repeat(32);
    const block1SourceHash = '30'.repeat(32);
    const block1Leaves: BurnLeafV1[] = [
      {
        sidechainIdHex: SIDECHAIN_ID,
        executionBlockHashHex: block1ExecHash,
        sidechainTxHashHex: '41'.repeat(32),
        eventIndex: 0,
        recipientErgoTreeHex: K_USER.p2pkErgoTreeHex,
        amountNanoErg: 10_000_000n,
      },
      {
        sidechainIdHex: SIDECHAIN_ID,
        executionBlockHashHex: block1ExecHash,
        sidechainTxHashHex: '42'.repeat(32),
        eventIndex: 1,
        recipientErgoTreeHex: K_USER.p2pkErgoTreeHex,
        amountNanoErg: 12_000_000n,
      },
      {
        sidechainIdHex: SIDECHAIN_ID,
        executionBlockHashHex: block1ExecHash,
        sidechainTxHashHex: '43'.repeat(32),
        eventIndex: 2,
        recipientErgoTreeHex: K_USER.p2pkErgoTreeHex,
        amountNanoErg: 8_000_000n,
      },
    ];
    const block1Merkle = buildBurnMerkleTree(block1Leaves.map((l) => encodeBurnLeafV1(l).encodedLeaf));
    const admit1 = buildTrackerAdmitTx({
      family,
      trackerBox: trackerRefreshed,
      trackerHistory: [],
      checkpoint: {
        sourceNetworkIdHex: SOURCE_NET_ID,
        sidechainIdHex: SIDECHAIN_ID,
        sourceHeight: 10n,
        sourceBlockHashHex: block1SourceHash,
        executionBlockHashHex: block1ExecHash,
        bridgeEventRootHex: block1Merkle.rootHex,
        burnCount: 3,
      },
      currentR9Bytes: initialTrackerGovernanceR9(1n),
      feeInBox: makeFeeBox('f9', 10_000_000n, 120),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 125,
    });

    // TRUE DISTRIBUTED 2-of-3 signing — also tests [H-4] passing > threshold secrets (3 of 2-of-3)!
    const signedAdmit1 = signTransactionDistributedCommittee({
      ...admit1,
      committeeMemberSecretsHex: [SEC_C1, SEC_C2, SEC_C3],
      allCommitteePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
      threshold: 2,
      feePayerSecretHex: SEC_FEE,
      height: 125,
    });
    enqueue(
      'tracker_admit1_distributed_2of3',
      125,
      signedAdmit1,
      true,
      'Distributed 2-of-3 multisig checkpoint admission (no 0x0401, slices >t safely [H-4])',
    );

    // [H-4] Regression: feePayer IS simulated committee member C3 while C1+C2 sign!
    const feeBoxC3 = makeSyntheticErgoBox({
      txIdHex: 'e4'.repeat(32),
      index: 0,
      value: 10_000_000n,
      ergoTreeHex: K_C3.p2pkErgoTreeHex,
      creationHeight: 120,
    });
    const admit1FeeC3 = buildTrackerAdmitTx({
      family,
      trackerBox: trackerRefreshed,
      trackerHistory: [],
      checkpoint: {
        sourceNetworkIdHex: SOURCE_NET_ID,
        sidechainIdHex: SIDECHAIN_ID,
        sourceHeight: 10n,
        sourceBlockHashHex: block1SourceHash,
        executionBlockHashHex: block1ExecHash,
        bridgeEventRootHex: block1Merkle.rootHex,
        burnCount: 3,
      },
      currentR9Bytes: initialTrackerGovernanceR9(1n),
      feeInBox: feeBoxC3,
      changeErgoTreeHex: K_C3.p2pkErgoTreeHex,
      creationHeight: 125,
    });
    const signedAdmit1FeeC3 = signTransactionDistributedCommittee({
      ...admit1FeeC3,
      committeeMemberSecretsHex: [SEC_C1, SEC_C2],
      allCommitteePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
      threshold: 2,
      feePayerSecretHex: SEC_C3,
      height: 125,
    });
    enqueue(
      'tracker_admit1_fee_is_simulated_committee_c3',
      125,
      signedAdmit1FeeC3,
      true,
      'Distributed 2-of-3 succeeds when feePayer is simulated committee key C3 [H-4]',
    );

    // [H-4 / L-8] Full 3-round serializable multi-host JSON ceremony (zero Schnorr nonces on the wire!)
    const r1C1 = committeeGenerateCommitmentsJson({
      ...admit1,
      memberSecretHex: SEC_C1,
      inputIndex: 0,
      height: 125,
    });
    const r1C2 = committeeGenerateCommitmentsJson({
      ...admit1,
      memberSecretHex: SEC_C2,
      inputIndex: 0,
      height: 125,
    });
    const r1Fee = committeeGenerateCommitmentsJson({
      ...admit1,
      memberSecretHex: SEC_FEE,
      inputIndex: admit1.inputBoxes.length - 1,
      height: 125,
    });
    expect(typeof r1C1.publicCommitmentsJson).toBe('string');
    expect(typeof r1C2.publicCommitmentsJson).toBe('string');
    expect(typeof r1Fee.publicCommitmentsJson).toBe('string');
    expect(r1C1.privateCommitmentsJson).toContain('cmtWithSecret');
    expect(r1C1.publicCommitmentsJson).not.toContain('cmtWithSecret');
    expect(r1C1.publicCommitmentsJson).not.toContain('"secret"');
    expect(r1C1.publicCommitmentsJson).toContain('cmtReal');
    expect(JSON.parse(r1C1.publicCommitmentsJson).secretHints).toEqual({});
    expect(r1C2.publicCommitmentsJson).not.toContain('cmtWithSecret');
    expect(r1C2.publicCommitmentsJson).not.toContain('"secret"');
    expect(r1C2.publicCommitmentsJson).toContain('cmtReal');
    expect(JSON.parse(r1C2.publicCommitmentsJson).secretHints).toEqual({});
    expect(r1Fee.publicCommitmentsJson).not.toContain('cmtWithSecret');
    expect(r1Fee.publicCommitmentsJson).not.toContain('"secret"');
    expect(r1Fee.publicCommitmentsJson).toContain('cmtReal');
    expect(JSON.parse(r1Fee.publicCommitmentsJson).secretHints).toEqual({});

    // Fail-closed: coordinator and peers MUST reject any bag leaking secret nonce material
    expect(() =>
      committeePartialSignAndExtractHintsJson({
        ...admit1,
        memberSecretHex: SEC_C2,
        ownPrivateCommitmentsJson: r1C2.privateCommitmentsJson,
        publicHintsJsonList: [r1C1.privateCommitmentsJson, r1Fee.publicCommitmentsJson],
        simulatedPubKeysHex: [],
        height: 125,
      }),
    ).toThrow(/secret/i);
    expect(() =>
      finalizeDistributedCommitteeTx({
        ...admit1,
        publicHintsJsonList: [r1C1.privateCommitmentsJson],
        feePayerSecretHex: SEC_FEE,
        height: 125,
      }),
    ).toThrow(/secret/i);

    // Round 2: Host C1 signs with its private commitments + C2 & fee PUBLIC commitments and locks simulated C3
    const r2C1Public = committeePartialSignAndExtractHintsJson({
      ...admit1,
      memberSecretHex: SEC_C1,
      ownPrivateCommitmentsJson: r1C1.privateCommitmentsJson,
      publicHintsJsonList: [r1C2.publicCommitmentsJson, r1Fee.publicCommitmentsJson],
      simulatedPubKeysHex: [K_C3.pubKeyHex],
      height: 125,
    });
    expect(r2C1Public).not.toContain('cmtWithSecret');
    expect(r2C1Public).not.toContain('"secret"');
    expect(r2C1Public).toContain('proofReal');

    // Round 2: Host C2 signs with its private commitments + C1 & fee PUBLIC commitments + C1 PUBLIC extracted hints
    const r2C2Public = committeePartialSignAndExtractHintsJson({
      ...admit1,
      memberSecretHex: SEC_C2,
      ownPrivateCommitmentsJson: r1C2.privateCommitmentsJson,
      publicHintsJsonList: [r1C1.publicCommitmentsJson, r1Fee.publicCommitmentsJson, r2C1Public],
      simulatedPubKeysHex: [],
      height: 125,
    });
    expect(r2C2Public).not.toContain('cmtWithSecret');
    expect(r2C2Public).not.toContain('"secret"');
    expect(r2C2Public).toContain('proofReal');

    // Round 3: Coordinator finalizes using ONLY committee public JSON hints + its own fee secret/commitment
    const signedAdmit1MultiHost = finalizeDistributedCommitteeTx({
      ...admit1,
      publicHintsJsonList: [
        r1C1.publicCommitmentsJson,
        r1C2.publicCommitmentsJson,
        r2C1Public,
        r2C2Public,
      ],
      feePayerSecretHex: SEC_FEE,
      feePrivateCommitmentsJson: r1Fee.privateCommitmentsJson,
      height: 125,
    });
    enqueue(
      'tracker_admit1_multihost_json_3round',
      125,
      signedAdmit1MultiHost,
      true,
      '3-round multi-host JSON ceremony (zero secret nonces on wire) verifies in SigmaState 6.0.2 [H-4]',
    );

    // Same 3-round multi-host ceremony when feePayer is simulated committee key C3!
    const r1FeeC3C1 = committeeGenerateCommitmentsJson({
      ...admit1FeeC3,
      memberSecretHex: SEC_C1,
      inputIndex: 0,
      height: 125,
    });
    const r1FeeC3C2 = committeeGenerateCommitmentsJson({
      ...admit1FeeC3,
      memberSecretHex: SEC_C2,
      inputIndex: 0,
      height: 125,
    });
    const r1FeeC3Fee = committeeGenerateCommitmentsJson({
      ...admit1FeeC3,
      memberSecretHex: SEC_C3,
      inputIndex: admit1FeeC3.inputBoxes.length - 1,
      height: 125,
    });
    const r2FeeC3C1 = committeePartialSignAndExtractHintsJson({
      ...admit1FeeC3,
      memberSecretHex: SEC_C1,
      ownPrivateCommitmentsJson: r1FeeC3C1.privateCommitmentsJson,
      publicHintsJsonList: [r1FeeC3C2.publicCommitmentsJson, r1FeeC3Fee.publicCommitmentsJson],
      simulatedPubKeysHex: [K_C3.pubKeyHex],
      height: 125,
    });
    const r2FeeC3C2 = committeePartialSignAndExtractHintsJson({
      ...admit1FeeC3,
      memberSecretHex: SEC_C2,
      ownPrivateCommitmentsJson: r1FeeC3C2.privateCommitmentsJson,
      publicHintsJsonList: [
        r1FeeC3C1.publicCommitmentsJson,
        r1FeeC3Fee.publicCommitmentsJson,
        r2FeeC3C1,
      ],
      simulatedPubKeysHex: [],
      height: 125,
    });
    const signedAdmit1MultiHostFeeC3 = finalizeDistributedCommitteeTx({
      ...admit1FeeC3,
      publicHintsJsonList: [
        r1FeeC3C1.publicCommitmentsJson,
        r1FeeC3C2.publicCommitmentsJson,
        r2FeeC3C1,
        r2FeeC3C2,
      ],
      feePayerSecretHex: SEC_C3,
      feePrivateCommitmentsJson: r1FeeC3Fee.privateCommitmentsJson,
      height: 125,
    });
    enqueue(
      'tracker_admit1_multihost_json_fee_c3',
      125,
      signedAdmit1MultiHostFeeC3,
      true,
      '3-round multi-host JSON ceremony succeeds when feePayer is simulated C3 [H-4]',
    );

    // [M-4] Parameter bounds on compileRotatedTracker & renderStarkTrackerSource
    expect(() =>
      compileRotatedTracker(family, {
        pubKeysHex: [K_C4.pubKeyHex, K_C5.pubKeyHex],
        threshold: 2,
        epoch: 2n,
        maxAdmissionLagBlocks: -1n,
      }),
    ).toThrow(/maxAdmissionLagBlocks/);
    expect(() =>
      compileRotatedTracker(family, {
        pubKeysHex: [K_C4.pubKeyHex, K_C5.pubKeyHex],
        threshold: 2,
        epoch: 2n,
        minRefreshAgeBlocks: -1,
      }),
    ).toThrow(/minRefreshAgeBlocks/);
    expect(() =>
      renderStarkTrackerSource(family, {
        programIdHex: '11'.repeat(32),
        profileIdHex: '22'.repeat(32),
        maxAdmissionLagBlocks: -1n,
      }),
    ).toThrow(/maxAdmissionLagBlocks/);
    expect(() =>
      renderStarkTrackerSource(family, {
        programIdHex: '11'.repeat(32),
        profileIdHex: '22'.repeat(32),
        minRefreshAgeBlocks: -1,
      }),
    ).toThrow(/minRefreshAgeBlocks/);
    // Negative: too-old admission (HEIGHT=131 > creationHeight 125 + maxAdmissionLag 5)
    enqueue(
      'neg_admit1_lag_exceeded',
      131,
      signedAdmit1,
      false,
      'Admission rejected when HEIGHT exceeds creationHeight + maxAdmissionLag',
    );
    // Positive at exact boundary HEIGHT=130 (125 + 5)
    enqueue(
      'admit1_at_max_lag_boundary',
      130,
      signedAdmit1,
      true,
      'Admission succeeds at exact maxAdmissionLag boundary',
    );

    // Negative: 1-of-3 committee signer MUST fail signing/verification
    expect(() =>
      signTransaction({
        ...admit1,
        secretKeysHex: [SEC_C1, SEC_FEE],
        height: 125,
      }),
    ).toThrow();

    const trackerAfterAdmit1 = boxFromTxOutput(signedAdmit1, 0);
    const trackerHistory1: AvlEntry[] = [
      { key: admit1.trackerKeyHex, value: admit1.trackerValueHex },
    ];

    // ------------------------------------------------------------------------
    // 4. Peg-Out Payout (odd-width 3-leaf Merkle proof, leaf 2 — duplicate-right edge case!)
    // ------------------------------------------------------------------------
    const payout1 = buildBurnPayoutTx({
      family,
      trackerBox: trackerAfterAdmit1,
      trackerHistory: trackerHistory1,
      trackerKeyHex: admit1.trackerKeyHex,
      reserveBox: reserveRefreshed,
      reserveLiabilityNanoErg: depositAmount,
      dupBox: dupRefreshed,
      dupHistoryBurnIdsHex: [],
      sidechainHeight: 10n,
      blockBurnLeaves: block1Leaves,
      targetLeafIndex: 2, // index 2 of 3 exercises duplicateRight Merkle branch!
      feeInBox: makeFeeBox('fa', 10_000_000n, 130),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 135, // admissionHeight=125, minConfirmations=10 => 135 exact boundary!
    });
    const signedPayout1 = signTransaction({
      ...payout1,
      secretKeysHex: [SEC_FEE],
      height: 135,
    });
    enqueue(
      'payout1_odd_merkle_leaf2',
      135,
      signedPayout1,
      true,
      'Burn payout leaf 2/3 passes at exact minConfirmations=10',
    );
    // Negative: premature payout at HEIGHT=134 (134 - 125 = 9 < 10)
    enqueue(
      'neg_payout1_premature_confirmation',
      134,
      signedPayout1,
      false,
      'Burn payout rejected 1 block before minConfirmations',
    );

    const reserveAfterPayout1 = boxFromTxOutput(signedPayout1, 0);
    const dupAfterPayout1 = boxFromTxOutput(signedPayout1, 1);
    const dupHistory1 = [payout1.burnIdHex];
    expect(BigInt(reserveAfterPayout1.value)).toBe(75_000_000n - 8_000_000n); // 67M (42M liability + 25M buffer preserved!)

    // Negative: replay of same burnId MUST throw in AVL proof generator AND fail if old proof reused
    expect(() =>
      buildBurnPayoutTx({
        family,
        trackerBox: trackerAfterAdmit1,
        trackerHistory: trackerHistory1,
        trackerKeyHex: admit1.trackerKeyHex,
        reserveBox: reserveAfterPayout1,
        reserveLiabilityNanoErg: 42_000_000n,
        dupBox: dupAfterPayout1,
        dupHistoryBurnIdsHex: dupHistory1,
        sidechainHeight: 10n,
        blockBurnLeaves: block1Leaves,
        targetLeafIndex: 2,
        feeInBox: makeFeeBox('fb', 10_000_000n, 136),
        changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
        creationHeight: 136,
      }),
    ).toThrow();

    // Negative: attacker steals payout by mutating OUTPUTS(2).ergoTree
    const payoutStolenRecipient = buildBurnPayoutTx({
      family,
      trackerBox: trackerAfterAdmit1,
      trackerHistory: trackerHistory1,
      trackerKeyHex: admit1.trackerKeyHex,
      reserveBox: reserveAfterPayout1,
      reserveLiabilityNanoErg: 42_000_000n,
      dupBox: dupAfterPayout1,
      dupHistoryBurnIdsHex: dupHistory1,
      sidechainHeight: 10n,
      blockBurnLeaves: block1Leaves,
      targetLeafIndex: 0,
      feeInBox: makeFeeBox('fc', 10_000_000n, 136),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 136,
    });
    payoutStolenRecipient.unsignedTx.outputs[2].ergoTree = K_ATTACKER.p2pkErgoTreeHex;
    expect(() =>
      signTransaction({ ...payoutStolenRecipient, secretKeysHex: [SEC_FEE], height: 136 }),
    ).toThrow();

    // ------------------------------------------------------------------------
    // 5. Timelocked Committee Rotation (Epoch 1 -> Cancel -> Re-propose -> Execute -> Epoch 2 Admit -> Payout!)
    // ------------------------------------------------------------------------
    const proposeRot1 = buildTrackerProposeUpgradeTx({
      family,
      trackerBox: trackerAfterAdmit1,
      currentEpoch: 1n,
      upgradeTimelockBlocks: 20n,
      mode: 1,
      targetScriptHashHex: rotated.tracker.contractIdHex,
      trustAnchorDigestHex: ZERO_32_HEX,
      feeInBox: makeFeeBox('fd', 10_000_000n, 136),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 140,
    });
    const signedProposeRot1 = signTransactionDistributedCommittee({
      ...proposeRot1,
      committeeMemberSecretsHex: [SEC_C2, SEC_C3], // quorum (C2, C3)!
      allCommitteePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
      feePayerSecretHex: SEC_FEE,
      height: 140,
    });
    enqueue('tracker_propose_rotate', 140, signedProposeRot1, true, 'Propose committee rotation');
    const trackerPendingRot = boxFromTxOutput(signedProposeRot1, 0);

    // [H-1] Negative: rentRefresh on Tracker MUST be blocked while pendingMode != 0 (prevents cancelUpgrade censorship!)
    const blockedTrackerRefresh = buildRentRefreshTx({
      singletonBox: trackerPendingRot,
      feeInBox: makeFeeBox('d9', 10_000_000n, 150),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 158, // >= 140 + 15 age, STILL blocked because pendingMode == 1!
    });
    expect(() =>
      signTransaction({ ...blockedTrackerRefresh, secretKeysHex: [SEC_FEE], height: 158 }),
    ).toThrow();

    // 5a. Cancel pending rotation (committee C1 + C3)
    const cancelRot = buildTrackerCancelUpgradeTx({
      family,
      trackerBox: trackerPendingRot,
      currentEpoch: 1n,
      feeInBox: makeFeeBox('fe', 10_000_000n, 141),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 142,
    });
    const signedCancelRot = signTransactionDistributedCommittee({
      ...cancelRot,
      committeeMemberSecretsHex: [SEC_C1, SEC_C3],
      allCommitteePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
      feePayerSecretHex: SEC_FEE,
      height: 142,
    });
    enqueue('tracker_cancel_rotate', 142, signedCancelRot, true, 'Cancel pending rotation');

    // 5b. Execute pending rotation: fails 1 block early (159), passes permissionlessly at 160!
    const execRot = buildTrackerExecuteUpgradeTx({
      family,
      trackerBox: trackerPendingRot,
      currentR9Bytes: proposeRot1.nextR9Bytes,
      targetErgoTreeHex: rotated.tracker.ergoTreeHex,
      feeInBox: makeFeeBox('ff', 10_000_000n, 155),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 160,
    });
    const signedExecRot = signTransaction({
      ...execRot,
      secretKeysHex: [SEC_FEE], // Permissionless! ZERO committee keys needed!
      height: 160,
    });
    enqueue('neg_exec_rotate_early', 159, signedExecRot, false, 'Execute rotation rejected 1 block early');
    enqueue('exec_rotate_permissionless', 160, signedExecRot, true, 'Execute rotation permissionless at timelock');
    const trackerEpoch2 = boxFromTxOutput(signedExecRot, 0);
    expect(trackerEpoch2.ergoTree).toBe(rotated.tracker.ergoTreeHex);
    expect(decodeTrackerGovernanceR9(execRot.nextR9Bytes).epoch).toBe(2n);

    // 5c. Admit Checkpoint 2 under NEW rotated Epoch 2 committee (C4 + C5) — old C1+C2 rejected!
    const block2ExecHash = '51'.repeat(32);
    const block2SourceHash = '50'.repeat(32);
    const block2Leaves: BurnLeafV1[] = [
      {
        sidechainIdHex: SIDECHAIN_ID,
        executionBlockHashHex: block2ExecHash,
        sidechainTxHashHex: '61'.repeat(32),
        eventIndex: 0,
        recipientErgoTreeHex: K_USER.p2pkErgoTreeHex,
        amountNanoErg: 15_000_000n,
      },
    ];
    const block2Merkle = buildBurnMerkleTree(block2Leaves.map((l) => encodeBurnLeafV1(l).encodedLeaf));
    const admit2 = buildTrackerAdmitTx({
      family,
      trackerBox: trackerEpoch2,
      trackerHistory: trackerHistory1,
      checkpoint: {
        sourceNetworkIdHex: SOURCE_NET_ID,
        sidechainIdHex: SIDECHAIN_ID,
        sourceHeight: 20n,
        sourceBlockHashHex: block2SourceHash,
        executionBlockHashHex: block2ExecHash,
        bridgeEventRootHex: block2Merkle.rootHex,
        burnCount: 1,
      },
      ergoKeySetDigestHex: rotated.ergoKeySetDigestHex,
      committeeEpoch: 2n,
      currentR9Bytes: initialTrackerGovernanceR9(2n),
      feeInBox: makeFeeBox('e9', 10_000_000n, 160),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 165,
    });
    // Old committee (C1 + C2) MUST fail on Epoch 2 tracker!
    expect(() =>
      signTransaction({ ...admit2, secretKeysHex: [SEC_C1, SEC_C2, SEC_FEE], height: 165 }),
    ).toThrow();
    // New committee (C4 + C5) succeeds via distributed signing!
    const signedAdmit2 = signTransactionDistributedCommittee({
      ...admit2,
      committeeMemberSecretsHex: [SEC_C4, SEC_C5],
      allCommitteePubKeysHex: [K_C3.pubKeyHex, K_C4.pubKeyHex, K_C5.pubKeyHex],
      feePayerSecretHex: SEC_FEE,
      height: 165,
    });
    enqueue('tracker_epoch2_admit2', 165, signedAdmit2, true, 'Epoch 2 rotated committee admits checkpoint 2');
    const trackerEpoch2AfterAdmit2 = boxFromTxOutput(signedAdmit2, 0);
    const trackerHistory2: AvlEntry[] = [
      ...trackerHistory1,
      { key: admit2.trackerKeyHex, value: admit2.trackerValueHex },
    ];

    // 5d. Payout from Checkpoint 2 via UNCHANGED BridgeDup + BridgeReserve!
    const payout2 = buildBurnPayoutTx({
      family,
      trackerBox: trackerEpoch2AfterAdmit2,
      trackerHistory: trackerHistory2,
      trackerKeyHex: admit2.trackerKeyHex,
      reserveBox: reserveAfterPayout1,
      reserveLiabilityNanoErg: 42_000_000n,
      dupBox: dupAfterPayout1,
      dupHistoryBurnIdsHex: dupHistory1,
      sidechainHeight: 20n,
      blockBurnLeaves: block2Leaves,
      targetLeafIndex: 0,
      feeInBox: makeFeeBox('e8', 10_000_000n, 170),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 175,
    });
    const signedPayout2 = signTransaction({
      ...payout2,
      secretKeysHex: [SEC_FEE],
      height: 175,
    });
    enqueue(
      'payout2_after_committee_rotation',
      175,
      signedPayout2,
      true,
      'Unchanged BridgeDup + BridgeReserve settle burn from rotated Epoch 2 tracker',
    );
    const reserveAfterPayout2 = boxFromTxOutput(signedPayout2, 0);
    const dupAfterPayout2 = boxFromTxOutput(signedPayout2, 1);
    const dupHistory2 = [...dupHistory1, payout2.burnIdHex];

    // ------------------------------------------------------------------------
    // 6. Irreversible EIP-0045 STARK Graduation (mode=2) + authMode=2 Payout Parity!
    // ------------------------------------------------------------------------
    const trustAnchorDigest = '9a'.repeat(32);
    // Use a valid target ErgoTree (representing future compiled BridgeTrackerStark v4)
    const mockStarkTrackerErgoTree = K_USER.p2pkErgoTreeHex; // any valid script hash committed in R9
    const mockStarkContractId = blake2b256Hex(hexToBytes(mockStarkTrackerErgoTree));

    const proposeStark = buildTrackerProposeUpgradeTx({
      family,
      trackerBox: trackerEpoch2AfterAdmit2,
      currentEpoch: 2n,
      upgradeTimelockBlocks: 20n,
      mode: 2,
      targetScriptHashHex: mockStarkContractId,
      trustAnchorDigestHex: trustAnchorDigest,
      feeInBox: makeFeeBox('e7', 10_000_000n, 175),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 180,
    });
    const signedProposeStark = signTransactionDistributedCommittee({
      ...proposeStark,
      committeeMemberSecretsHex: [SEC_C3, SEC_C4],
      allCommitteePubKeysHex: [K_C3.pubKeyHex, K_C4.pubKeyHex, K_C5.pubKeyHex],
      feePayerSecretHex: SEC_FEE,
      height: 180,
    });
    enqueue(
      'tracker_propose_stark_graduation',
      180,
      signedProposeStark,
      true,
      'Propose irreversible EIP-0045 STARK graduation (mode=2)',
    );
    const trackerPendingStark = boxFromTxOutput(signedProposeStark, 0);

    const execStark = buildTrackerExecuteUpgradeTx({
      family,
      trackerBox: trackerPendingStark,
      currentR9Bytes: proposeStark.nextR9Bytes,
      targetErgoTreeHex: mockStarkTrackerErgoTree,
      feeInBox: makeFeeBox('e6', 10_000_000n, 195),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 200,
    });
    const signedExecStark = signTransaction({
      ...execStark,
      secretKeysHex: [SEC_FEE],
      height: 200,
    });
    enqueue(
      'exec_stark_graduation_permissionless',
      200,
      signedExecStark,
      true,
      'Permissionless EIP-0045 STARK graduation preserves R5 AVL and sets R9=trustAnchorDigest',
    );
    const graduatedTracker = boxFromTxOutput(signedExecStark, 0);
    expect(graduatedTracker.additionalRegisters.R9).toBe(
      sigmaCollByteHex(hexToBytes(trustAnchorDigest, 32)),
    );

    // Prove UNCHANGED BridgeDup + BridgeReserve also accept an authMode=2 (EIP-0045 STARK) AVL entry!
    const block3ExecHash = '71'.repeat(32);
    const block3SourceHash = '70'.repeat(32);
    const block3Leaves: BurnLeafV1[] = [
      {
        sidechainIdHex: SIDECHAIN_ID,
        executionBlockHashHex: block3ExecHash,
        sidechainTxHashHex: '81'.repeat(32),
        eventIndex: 0,
        recipientErgoTreeHex: K_USER.p2pkErgoTreeHex,
        amountNanoErg: 10_000_000n,
      },
    ];
    const block3Merkle = buildBurnMerkleTree(block3Leaves.map((l) => encodeBurnLeafV1(l).encodedLeaf));
    const starkPayload = encodeStarkPayloadV1({
      trackerNftIdHex: TRACKER_NFT,
      familyIdHex: family.familyIdHex,
      sourceNetworkIdHex: SOURCE_NET_ID,
      sidechainIdHex: SIDECHAIN_ID,
      sourceHeight: 30n,
      sourceBlockHashHex: block3SourceHash,
      executionBlockHashHex: block3ExecHash,
      bridgeEventRootHex: block3Merkle.rootHex,
      burnCount: 1,
      trustAnchorDigestHex: trustAnchorDigest,
    });
    const starkTrackerKey = computeTrackerKeyHex({
      sourceNetworkIdHex: SOURCE_NET_ID,
      sidechainIdHex: SIDECHAIN_ID,
      sourceHeight: 30n,
      sourceBlockHashHex: block3SourceHash,
      executionBlockHashHex: block3ExecHash,
    });
    const starkTrackerVal = encodeTrackerValueV1({
      authMode: AUTH_MODE_EIP0045_STARK,
      familyIdHex: family.familyIdHex,
      sidechainIdHex: SIDECHAIN_ID,
      sourceHeight: 30n,
      sourceBlockHashHex: block3SourceHash,
      executionBlockHashHex: block3ExecHash,
      bridgeEventRootHex: block3Merkle.rootHex,
      burnCount: 1,
      statementIdHex: blake2b256Hex(starkPayload),
      admissionHeight: 205n,
      authorityEpoch: 0n,
      authorityDigestHex: blake2b256Hex(hexToBytes('cc'.repeat(64))),
      trustAnchorDigestHex: trustAnchorDigest,
      sourceNetworkIdHex: SOURCE_NET_ID,
    });
    const starkInsert = trackerInsertProof(
      trackerHistory2,
      starkTrackerKey,
      bytesToHex(starkTrackerVal),
    );
    const trackerHistory3: AvlEntry[] = [
      ...trackerHistory2,
      { key: starkTrackerKey, value: bytesToHex(starkTrackerVal) },
    ];
    const starkTrackerBox = makeSyntheticErgoBox({
      txIdHex: '99'.repeat(32),
      index: 0,
      value: 11_000_000n,
      ergoTreeHex: mockStarkTrackerErgoTree,
      creationHeight: 205,
      assets: [{ tokenId: TRACKER_NFT, amount: 1n }],
      additionalRegisters: {
        R4: sigmaCollByteHex(hexToBytes(family.familyIdHex, 32)),
        R5: sigmaAvlTreeHex(starkInsert.newDigestHex, 370),
        R6: sigmaCollByteHex(hexToBytes(SIDECHAIN_ID, 32)),
        R7: sigmaLongHex(30n),
        R8: sigmaIntHex(205),
        R9: sigmaCollByteHex(hexToBytes(trustAnchorDigest, 32)),
      },
    });
    const payout3Stark = buildBurnPayoutTx({
      family,
      trackerBox: starkTrackerBox,
      trackerHistory: trackerHistory3,
      trackerKeyHex: starkTrackerKey,
      reserveBox: reserveAfterPayout2,
      reserveLiabilityNanoErg: 27_000_000n,
      dupBox: dupAfterPayout2,
      dupHistoryBurnIdsHex: dupHistory2,
      sidechainHeight: 30n,
      blockBurnLeaves: block3Leaves,
      targetLeafIndex: 0,
      feeInBox: makeFeeBox('e5', 10_000_000n, 210),
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 215,
    });
    const signedPayout3Stark = signTransaction({
      ...payout3Stark,
      secretKeysHex: [SEC_FEE],
      height: 215,
    });
    enqueue(
      'payout3_eip0045_stark_entry_seamless',
      215,
      signedPayout3Stark,
      true,
      'Unchanged BridgeDup + BridgeReserve settle EIP-0045 STARK (authMode=2) checkpoint seamlessly',
    );

    // ------------------------------------------------------------------------
    // Execute ALL cases in ONE SigmaState 6.0.2 JVM batch verification call!
    // ------------------------------------------------------------------------
    const results = verifyTransactionsJvm(jvmBatch.map((b) => b.testCase));
    expect(results.length).toBe(jvmBatch.length);

    for (let i = 0; i < jvmBatch.length; i++) {
      const expected = jvmBatch[i];
      const actual = results[i];
      expect(actual.ok, `${expected.testCase.id}: JVM error=${actual.error}`).toBe(true);
      // Assert 100% sigma-rust <-> SigmaState 6.0.2 JVM txId parity on EVERY tx!
      expect(actual.txId, `${expected.testCase.id}: txId parity`).toBe(expected.expectedTxId);
      if (expected.expectedPass) {
        expect(actual.totalCost ?? 0, `${expected.testCase.id}: total tx cost`).toBeLessThanOrEqual(
          1_000_000,
        );
      }
      expect(
        actual.allPassed,
        `${expected.testCase.id} (${expected.desc}): expected=${expected.expectedPass}, got=${actual.allPassed}, inputs=${JSON.stringify(actual.inputs)}`,
      ).toBe(expected.expectedPass);
    }

    // Sanity-check reserve history usage
    expect(reserveHistory1.length).toBe(1);
  });
});
