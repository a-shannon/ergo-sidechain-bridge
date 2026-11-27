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
} from '../src/core/avl.js';
import {
  BurnLeafV1,
  ZERO_32_HEX,
  blake2b256Hex,
  buildBurnMerkleTree,
  encodeBurnLeafV1,
  encodePegInIntentV2,
  hexToBytes,
  initialTrackerGovernanceR9,
} from '../src/core/codecs.js';
import {
  JvmVerifyCase,
  compileBridgeV1Family,
  compileRotatedTracker,
  verifyTransactionsJvm,
} from '../src/core/contracts.js';
import {
  buildBurnPayoutTx,
  buildCommitDepositTx,
  buildRefundDepositTx,
  buildRentRefreshTx,
  buildTrackerAdmitTx,
  buildTrackerExecuteUpgradeTx,
  buildTrackerProposeUpgradeTx,
} from '../src/core/tx-builders.js';
import {
  ErgoBoxJson,
  SignedTxResult,
  deriveKeyPairFromSecretHex,
  makeSyntheticErgoBox,
  signTransaction,
  signTransactionDistributedCommittee,
} from '../src/crypto/signer.js';

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

function makeFeeBox(seed: string, value: bigint, creationHeight = 100): ErgoBoxJson {
  return makeSyntheticErgoBox({
    txIdHex: seed.repeat(32),
    index: 0,
    value,
    ergoTreeHex: K_FEE.p2pkErgoTreeHex,
    creationHeight,
  });
}

function outBox(signed: SignedTxResult, idx: number): ErgoBoxJson {
  return (signed.signedTxJson as { outputs: ErgoBoxJson[] }).outputs[idx];
}

describe('Bridge V1 ErgoScript — 24 Systematic 1-Field Adversarial Mutations (sigma-rust + SigmaState 6.0.2 JVM)', () => {
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

  const rotatedEpoch2 = compileRotatedTracker(family, {
    pubKeysHex: [K_C3.pubKeyHex, K_C4.pubKeyHex, K_C5.pubKeyHex],
    threshold: 2,
    epoch: 2n,
    minRefreshAgeBlocks: 15,
  });

  it('rejects all 24 surgical 1-field adversarial mutations across DepositLock, Reserve, Dup, and Tracker while accepting valid baselines', () => {
    const jvmCases: Array<JvmVerifyCase & { expectPass: boolean }> = [];
    const rejectedAtProver: string[] = [];

    const checkMutation = <T>(
      id: string,
      height: number,
      buildTx: () => T,
      signFn: (built: T) => SignedTxResult,
    ) => {
      // Build outside try/catch so accidental JS/builder TypeErrors NEVER count vacuously as prover rejections!
      const built = buildTx();
      try {
        const signed = signFn(built);
        // If sigma-rust produced a tx, SigmaState 6.0.2 JVM MUST reject it!
        jvmCases.push({
          id,
          height,
          txBytesHex: signed.txBytesHex,
          inputBoxesBytesHex: signed.inputBoxesBytesHex,
          dataBoxesBytesHex: signed.dataBoxesBytesHex,
          expectPass: false,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Must be a genuine sigma-rust / ErgoScript / AVL evaluation failure, not an unrelated TypeError
        expect(msg).toMatch(/Script reduced to false|prove|ErgoTree|eval|False|TxSigningError|Sigma/i);
        rejectedAtProver.push(id);
      }
    };

    const enqueueJvm = (id: string, height: number, signed: SignedTxResult, expectPass: boolean) => {
      jvmCases.push({
        id,
        height,
        txBytesHex: signed.txBytesHex,
        inputBoxesBytesHex: signed.inputBoxesBytesHex,
        dataBoxesBytesHex: signed.dataBoxesBytesHex,
        expectPass,
      });
    };

    // Genesis singletons
    const reserve0 = makeSyntheticErgoBox({
      txIdHex: '01'.repeat(32),
      index: 0,
      value: 20_000_000n,
      ergoTreeHex: family.reserve.ergoTreeHex,
      assets: [{ tokenId: RESERVE_NFT, amount: 1n }],
      additionalRegisters: {
        R4: sigmaCollByteHex(hexToBytes(family.familyIdHex, 32)),
        R5: sigmaAvlTreeHex(reserveEmptyDigestHex(), 32),
        R6: sigmaLongHex(0n),
      },
      creationHeight: 100,
    });

    const dup0 = makeSyntheticErgoBox({
      txIdHex: '02'.repeat(32),
      index: 0,
      value: 10_000_000n,
      ergoTreeHex: family.dup.ergoTreeHex,
      assets: [{ tokenId: DUP_NFT, amount: 1n }],
      additionalRegisters: {
        R4: sigmaCollByteHex(hexToBytes(family.familyIdHex, 32)),
        R5: sigmaAvlTreeHex(dupEmptyDigestHex(), 1),
      },
      creationHeight: 100,
    });

    const tracker0 = makeSyntheticErgoBox({
      txIdHex: '03'.repeat(32),
      index: 0,
      value: 10_000_000n,
      ergoTreeHex: family.tracker.ergoTreeHex,
      assets: [{ tokenId: TRACKER_NFT, amount: 1n }],
      additionalRegisters: {
        R4: sigmaCollByteHex(hexToBytes(family.familyIdHex, 32)),
        R5: sigmaAvlTreeHex(trackerEmptyDigestHex(), 370),
        R6: sigmaCollByteHex(hexToBytes(SIDECHAIN_ID, 32)),
        R7: sigmaLongHex(0n),
        R8: sigmaIntHex(100),
        R9: sigmaCollByteHex(initialTrackerGovernanceR9(1n)),
      },
      creationHeight: 100,
    });

    const depositAmount = 30_000_000n;
    const intentBytes = encodePegInIntentV2({
      sourceNetworkIdHex: SOURCE_NET_ID,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddressHex: BRIDGE_ADDR,
      tokenAddressHex: TOKEN_ADDR,
      familyIdHex: family.familyIdHex,
      reserveNftIdHex: RESERVE_NFT,
      evmRecipientHex: '3cd0a705a2dc65e5b1e1205896baa2be8a07c6e0',
      amountNanoErg: depositAmount,
    });

    const depositBox = makeSyntheticErgoBox({
      txIdHex: '04'.repeat(32),
      index: 0,
      value: depositAmount,
      ergoTreeHex: family.depositLock.ergoTreeHex,
      additionalRegisters: {
        R4: sigmaCollByteHex(intentBytes),
        R5: sigmaCollByteHex(hexToBytes(K_USER.p2pkErgoTreeHex)),
      },
      creationHeight: 100,
    });

    const feeBox = makeFeeBox('f0', 50_000_000n, 100);

    // =========================================================================
    // 1. BridgeDepositLock.es — refund & commitToReserve mutations (1..6)
    // =========================================================================
    const validRefund = buildRefundDepositTx({
      depositLockBox: depositBox,
      depositorErgoTreeHex: K_USER.p2pkErgoTreeHex,
      feeInBox: feeBox,
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 150, // 100 + 50 escapeTimeoutBlocks
    });
    const signedValidRefund = signTransaction({
      ...validRefund,
      secretKeysHex: [SEC_FEE],
      height: 150,
    });
    enqueueJvm('base_valid_refund', 150, signedValidRefund, true);

    // Mut 1: Refund 1 block BEFORE timeout (height 149 < 150) — direct JVM boundary check!
    enqueueJvm('mut_01_deposit_refund_before_timeout', 149, signedValidRefund, false);

    // Mut 2: Refund output redirected to attacker instead of R5
    checkMutation(
      'mut_02_deposit_refund_wrong_recipient',
      150,
      () => {
        const tx = structuredClone(validRefund);
        tx.unsignedTx.outputs[0].ergoTree = K_ATTACKER.p2pkErgoTreeHex;
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 150 }),
    );

    // Mut 3: Refund skims 1 nanoERG from user refund output into change
    checkMutation(
      'mut_03_deposit_refund_skim_value',
      150,
      () => {
        const tx = structuredClone(validRefund);
        tx.unsignedTx.outputs[0].value = (depositAmount - 1n).toString();
        tx.unsignedTx.outputs[2].value = (BigInt(tx.unsignedTx.outputs[2].value) + 1n).toString();
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 150 }),
    );

    // Mut 4: Refund output R4 != SELF.id (breaks anti-double-satisfaction receipt binding)
    checkMutation(
      'mut_04_deposit_refund_wrong_r4_boxid',
      150,
      () => {
        const tx = structuredClone(validRefund);
        tx.unsignedTx.outputs[0].additionalRegisters.R4 = sigmaCollByteHex(
          hexToBytes('aa'.repeat(32), 32),
        );
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 150 }),
    );

    // Baseline valid commitToReserve
    const validCommit = buildCommitDepositTx({
      family,
      reserveBox: reserve0,
      reserveLiabilityNanoErg: 0n,
      reserveHistory: [],
      depositLockBox: depositBox,
      encodedIntent: intentBytes,
      feeInBox: feeBox,
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 110,
    });
    const signedValidCommit = signTransaction({
      ...validCommit,
      secretKeysHex: [SEC_FEE],
      height: 110,
    });
    enqueueJvm('base_valid_commit_deposit', 110, signedValidCommit, true);

    // Mut 5: Commit at exact timeout boundary (height 150 >= 100 + 50) — direct JVM boundary check!
    enqueueJvm('mut_05_deposit_commit_at_timeout_boundary', 150, signedValidCommit, false);

    // Mut 6: Commit change output disguised as BridgeDepositLock script
    checkMutation(
      'mut_06_deposit_commit_change_disguised_as_lock',
      110,
      () => {
        const tx = structuredClone(validCommit);
        tx.unsignedTx.outputs[2].ergoTree = family.depositLock.ergoTreeHex;
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 110 }),
    );

    // =========================================================================
    // 2. BridgeReserve.es — liability, buffer, NFT & rentRefresh mutations (7..11)
    // =========================================================================
    // Mut 7: Under-increment R6 liability by 1 nanoERG
    checkMutation(
      'mut_07_reserve_under_increment_liability',
      110,
      () => {
        const tx = structuredClone(validCommit);
        tx.unsignedTx.outputs[0].additionalRegisters.R6 = sigmaLongHex(depositAmount - 1n);
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 110 }),
    );

    // Mut 8: Skim 1 nanoERG from Reserve ERG buffer into fee change
    checkMutation(
      'mut_08_reserve_skim_buffer_erg',
      110,
      () => {
        const tx = structuredClone(validCommit);
        tx.unsignedTx.outputs[0].value = (BigInt(tx.unsignedTx.outputs[0].value) - 1n).toString();
        tx.unsignedTx.outputs[2].value = (BigInt(tx.unsignedTx.outputs[2].value) + 1n).toString();
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 110 }),
    );

    // Mut 9: Drop Reserve singleton NFT onto change output
    checkMutation(
      'mut_09_reserve_drop_singleton_nft',
      110,
      () => {
        const tx = structuredClone(validCommit);
        tx.unsignedTx.outputs[0].assets = [];
        tx.unsignedTx.outputs[2].assets = [{ tokenId: RESERVE_NFT, amount: '1' }];
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 110 }),
    );

    const reserve1 = outBox(signedValidCommit, 0);

    // Valid Reserve rentRefresh at height 125 (age 15 == minRefreshAgeBlocks) — verified positive baseline!
    const validRefresh = buildRentRefreshTx({
      singletonBox: reserve1,
      feeInBox: feeBox,
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 125,
    });
    const signedValidRefresh = signTransaction({ ...validRefresh, secretKeysHex: [SEC_FEE], height: 125 });
    enqueueJvm('base_valid_rent_refresh', 125, signedValidRefresh, true);

    // Mut 10: Reserve rentRefresh 1 block too early (creationHeight=124 at height=124 so creationInfo._1 <= HEIGHT passes, isolating minRefreshAgeBlocks!)
    checkMutation(
      'mut_10_reserve_rent_refresh_too_early',
      124,
      () =>
        buildRentRefreshTx({
          singletonBox: reserve1,
          feeInBox: feeBox,
          changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
          creationHeight: 124,
        }),
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 124 }),
    );

    // Mut 11: Reserve rentRefresh skims 1 nanoERG from singleton
    checkMutation(
      'mut_11_reserve_rent_refresh_skim_erg',
      125,
      () => {
        const tx = structuredClone(validRefresh);
        tx.unsignedTx.outputs[0].value = (BigInt(tx.unsignedTx.outputs[0].value) - 1n).toString();
        tx.unsignedTx.outputs[2].value = (BigInt(tx.unsignedTx.outputs[2].value) + 1n).toString();
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 125 }),
    );

    // =========================================================================
    // 3. BridgeTracker.es + BridgeDup.es — admit, payout & governance mutations (12..24)
    // =========================================================================
    const burnLeaf: BurnLeafV1 = {
      sidechainIdHex: SIDECHAIN_ID,
      executionBlockHashHex: '31'.repeat(32),
      sidechainTxHashHex: '41'.repeat(32),
      eventIndex: 0,
      recipientErgoTreeHex: K_USER.p2pkErgoTreeHex,
      amountNanoErg: 15_000_000n,
    };
    const encodedBurn = encodeBurnLeafV1(burnLeaf);
    const burnTree = buildBurnMerkleTree([encodedBurn.encodedLeaf]);

    const validAdmit = buildTrackerAdmitTx({
      family,
      trackerBox: tracker0,
      trackerHistory: [],
      checkpoint: {
        sourceNetworkIdHex: SOURCE_NET_ID,
        sidechainIdHex: SIDECHAIN_ID,
        sourceHeight: 42n,
        sourceBlockHashHex: '30'.repeat(32),
        executionBlockHashHex: '31'.repeat(32),
        bridgeEventRootHex: burnTree.rootHex,
        burnCount: 1,
      },
      currentR9Bytes: initialTrackerGovernanceR9(1n),
      feeInBox: feeBox,
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 125,
    });
    const signedValidAdmit = signTransactionDistributedCommittee({
      ...validAdmit,
      allCommitteePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
      threshold: 2,
      committeeMemberSecretsHex: [SEC_C1, SEC_C2],
      feePayerSecretHex: SEC_FEE,
      height: 125,
    });
    enqueueJvm('base_valid_admit_checkpoint', 125, signedValidAdmit, true);

    const tracker1 = outBox(signedValidAdmit, 0);
    const trackerHistory1: AvlEntry[] = [{ key: validAdmit.trackerKeyHex, value: validAdmit.trackerValueHex }];

    // Valid burnPayout at height 135 (125 + 10 minConfirmations)
    const validPayout = buildBurnPayoutTx({
      family,
      trackerBox: tracker1,
      trackerHistory: trackerHistory1,
      trackerKeyHex: validAdmit.trackerKeyHex,
      reserveBox: reserve1,
      reserveLiabilityNanoErg: depositAmount,
      dupBox: dup0,
      dupHistoryBurnIdsHex: [],
      sidechainHeight: 42n,
      blockBurnLeaves: [burnLeaf],
      targetLeafIndex: 0,
      feeInBox: feeBox,
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 135,
    });
    const signedValidPayout = signTransaction({
      ...validPayout,
      secretKeysHex: [SEC_FEE],
      height: 135,
    });
    enqueueJvm('base_valid_burn_payout', 135, signedValidPayout, true);

    // Mut 12: Payout 1 block BEFORE minConfirmations (creationHeight=134 at height=134 so creationInfo._1 <= HEIGHT passes, isolating minConfirmations!)
    checkMutation(
      'mut_12_payout_before_min_confirmations',
      134,
      () =>
        buildBurnPayoutTx({
          family,
          trackerBox: tracker1,
          trackerHistory: trackerHistory1,
          trackerKeyHex: validAdmit.trackerKeyHex,
          reserveBox: reserve1,
          reserveLiabilityNanoErg: depositAmount,
          dupBox: dup0,
          dupHistoryBurnIdsHex: [],
          sidechainHeight: 42n,
          blockBurnLeaves: [burnLeaf],
          targetLeafIndex: 0,
          feeInBox: feeBox,
          changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
          creationHeight: 134,
        }),
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 134 }),
    );

    // Mut 13: Payout redirected to attacker instead of burnLeaf.recipientErgoTreeHex
    checkMutation(
      'mut_13_payout_wrong_recipient',
      135,
      () => {
        const tx = structuredClone(validPayout);
        tx.unsignedTx.outputs[2].ergoTree = K_ATTACKER.p2pkErgoTreeHex;
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 135 }),
    );

    // Mut 14: Payout inflated by +1 nanoERG (draining extra Reserve ERG & R6)
    checkMutation(
      'mut_14_payout_inflated_amount',
      135,
      () => {
        const tx = structuredClone(validPayout);
        tx.unsignedTx.outputs[0].value = (BigInt(tx.unsignedTx.outputs[0].value) - 1n).toString();
        tx.unsignedTx.outputs[0].additionalRegisters.R6 = sigmaLongHex(
          depositAmount - burnLeaf.amountNanoErg - 1n,
        );
        tx.unsignedTx.outputs[2].value = (burnLeaf.amountNanoErg + 1n).toString();
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 135 }),
    );

    // Mut 15: Replay same burnId against updated Reserve + DUP (double-spend attempt!)
    const reserve2 = outBox(signedValidPayout, 0);
    const dup1 = outBox(signedValidPayout, 1);
    checkMutation(
      'mut_15_payout_double_spend_burn_replay',
      136,
      () => {
        const tx = structuredClone(validPayout);
        tx.unsignedTx.inputs[0].boxId = reserve2.boxId;
        tx.unsignedTx.inputs[1].boxId = dup1.boxId;
        tx.inputBoxes[0] = reserve2;
        tx.inputBoxes[1] = dup1;
        tx.unsignedTx.outputs[0].value = (BigInt(reserve2.value) - burnLeaf.amountNanoErg).toString();
        tx.unsignedTx.outputs[0].additionalRegisters.R6 = sigmaLongHex(0n);
        tx.unsignedTx.outputs[1].additionalRegisters.R5 = dup1.additionalRegisters.R5;
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 136 }),
    );

    // Mut 16: Forged tracker dataInput carrying wrong NFT ID (constructed with valid boxId so BridgeDup.es evaluates it!)
    checkMutation(
      'mut_16_payout_forged_tracker_nft',
      135,
      () => {
        const fakeTracker = makeSyntheticErgoBox({
          txIdHex: 'fe'.repeat(32),
          index: 0,
          value: BigInt(tracker1.value),
          ergoTreeHex: tracker1.ergoTree,
          assets: [{ tokenId: 'ff'.repeat(32), amount: 1n }],
          additionalRegisters: { ...tracker1.additionalRegisters },
          creationHeight: tracker1.creationHeight,
        });
        const tx = structuredClone(validPayout);
        tx.unsignedTx.dataInputs[0].boxId = fakeTracker.boxId;
        tx.dataBoxes[0] = fakeTracker;
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 135 }),
    );

    // Mut 17: 1-bit corruption in ContextExtension Var(2) encodedLeaf on BridgeDup
    checkMutation(
      'mut_17_payout_corrupted_merkle_leaf',
      135,
      () => {
        const tx = structuredClone(validPayout);
        const origVar2 = tx.unsignedTx.inputs[1].extension['2'];
        const flippedLastByte = ((parseInt(origVar2.slice(-2), 16) ^ 0x01) & 0xff)
          .toString(16)
          .padStart(2, '0');
        tx.unsignedTx.inputs[1].extension['2'] = origVar2.slice(0, -2) + flippedLastByte;
        return tx;
      },
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 135 }),
    );

    // Mut 18: 1-of-3 committee signing (insufficient quorum < threshold 2!)
    checkMutation(
      'mut_18_tracker_1of3_insufficient_quorum',
      125,
      () => validAdmit,
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_C1, SEC_FEE], height: 125 }),
    );

    // Mut 19: Non-monotonic sourceHeight (sourceHeight == R7 == 42)
    checkMutation(
      'mut_19_tracker_non_monotonic_source_height',
      130,
      () =>
        buildTrackerAdmitTx({
          family,
          trackerBox: tracker1,
          trackerHistory: trackerHistory1,
          checkpoint: {
            sourceNetworkIdHex: SOURCE_NET_ID,
            sidechainIdHex: SIDECHAIN_ID,
            sourceHeight: 42n, // NOT strictly greater than 42!
            sourceBlockHashHex: '32'.repeat(32),
            executionBlockHashHex: '33'.repeat(32),
            bridgeEventRootHex: '34'.repeat(32),
            burnCount: 1,
          },
          currentR9Bytes: initialTrackerGovernanceR9(1n),
          feeInBox: feeBox,
          changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
          creationHeight: 130,
        }),
      (tx) =>
        signTransactionDistributedCommittee({
          ...tx,
          allCommitteePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
          threshold: 2,
          committeeMemberSecretsHex: [SEC_C1, SEC_C2],
          feePayerSecretHex: SEC_FEE,
          height: 130,
        }),
    );

    // Mut 20: Stale admissionHeight backdated past maxAdmissionLagBlocks (height 131 vs creationHeight 125 -> lag 6 > 5) — direct JVM check!
    enqueueJvm('mut_20_tracker_stale_admission_height', 131, signedValidAdmit, false);

    // Valid proposeUpgrade (Epoch 1 -> Epoch 2) at height 130 (activates at 150)
    const validPropose = buildTrackerProposeUpgradeTx({
      family,
      trackerBox: tracker1,
      currentEpoch: 1n,
      upgradeTimelockBlocks: 20n,
      mode: 1,
      targetScriptHashHex: rotatedEpoch2.tracker.contractIdHex,
      trustAnchorDigestHex: ZERO_32_HEX,
      feeInBox: feeBox,
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 130,
    });
    const signedValidPropose = signTransactionDistributedCommittee({
      ...validPropose,
      allCommitteePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
      threshold: 2,
      committeeMemberSecretsHex: [SEC_C1, SEC_C2],
      feePayerSecretHex: SEC_FEE,
      height: 130,
    });
    enqueueJvm('base_valid_propose_upgrade', 130, signedValidPropose, true);
    const trackerPending = outBox(signedValidPropose, 0);

    const validExec = buildTrackerExecuteUpgradeTx({
      family,
      trackerBox: trackerPending,
      currentR9Bytes: validPropose.nextR9Bytes,
      targetErgoTreeHex: rotatedEpoch2.tracker.ergoTreeHex,
      feeInBox: feeBox,
      changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
      creationHeight: 150,
    });
    const signedValidExec = signTransaction({ ...validExec, secretKeysHex: [SEC_FEE], height: 150 });
    enqueueJvm('base_valid_execute_upgrade', 150, signedValidExec, true);

    // Mut 21: executeUpgrade 1 block BEFORE pendingActivatesAtHeight (creationHeight=149 at height=149 so creationInfo._1 <= HEIGHT passes, isolating timelock!)
    checkMutation(
      'mut_21_tracker_execute_upgrade_before_timelock',
      149,
      () =>
        buildTrackerExecuteUpgradeTx({
          family,
          trackerBox: trackerPending,
          currentR9Bytes: validPropose.nextR9Bytes,
          targetErgoTreeHex: rotatedEpoch2.tracker.ergoTreeHex,
          feeInBox: feeBox,
          changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
          creationHeight: 149,
        }),
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 149 }),
    );

    // Mut 22: executeUpgrade redirects trackerNftId to attacker script instead of pendingTargetScriptHash
    checkMutation(
      'mut_22_tracker_execute_upgrade_wrong_target_script',
      150,
      () =>
        buildTrackerExecuteUpgradeTx({
          family,
          trackerBox: trackerPending,
          currentR9Bytes: validPropose.nextR9Bytes,
          targetErgoTreeHex: K_ATTACKER.p2pkErgoTreeHex,
          feeInBox: feeBox,
          changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
          creationHeight: 150,
        }),
      (tx) => signTransaction({ ...tx, secretKeysHex: [SEC_FEE], height: 150 }),
    );

    // Mut 23: proposeUpgrade silently overwrites existing pending upgrade (pendingMode != 0)
    checkMutation(
      'mut_23_tracker_silent_overwrite_pending_upgrade',
      135,
      () =>
        buildTrackerProposeUpgradeTx({
          family,
          trackerBox: trackerPending,
          currentEpoch: 1n,
          upgradeTimelockBlocks: 20n,
          mode: 1,
          targetScriptHashHex: 'ab'.repeat(32),
          trustAnchorDigestHex: ZERO_32_HEX,
          feeInBox: feeBox,
          changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
          creationHeight: 135,
        }),
      (tx) =>
        signTransactionDistributedCommittee({
          ...tx,
          allCommitteePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
          threshold: 2,
          committeeMemberSecretsHex: [SEC_C1, SEC_C2],
          feePayerSecretHex: SEC_FEE,
          height: 135,
        }),
    );

    // Mut 24: admitCheckpoint tries to tamper R9 epoch directly (1 -> 2)
    checkMutation(
      'mut_24_tracker_direct_epoch_tamper',
      125,
      () => {
        const tx = structuredClone(validAdmit);
        tx.unsignedTx.outputs[0].additionalRegisters.R9 = sigmaCollByteHex(
          initialTrackerGovernanceR9(2n),
        );
        return tx;
      },
      (tx) =>
        signTransactionDistributedCommittee({
          ...tx,
          allCommitteePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
          threshold: 2,
          committeeMemberSecretsHex: [SEC_C1, SEC_C2],
          feePayerSecretHex: SEC_FEE,
          height: 125,
        }),
    );

    // Execute all queued baseline & boundary cases in ONE SigmaState 6.0.2 JVM batch!
    const results = verifyTransactionsJvm(jvmCases);
    expect(results.length).toBe(jvmCases.length);

    const failures: string[] = [];
    for (let i = 0; i < jvmCases.length; i++) {
      const c = jvmCases[i];
      const r = results[i];
      const actualPass = Boolean(r.ok && r.allPassed);
      if (actualPass !== c.expectPass) {
        failures.push(
          `${c.id}: expected=${c.expectPass ? 'PASS' : 'FAIL'}, actual=${actualPass ? 'PASS' : 'FAIL'} (err=${r.error ?? 'none'})`,
        );
      }
      if (c.expectPass) {
        expect(r.totalCost).toBeLessThanOrEqual(1_000_000);
      }
    }
    expect(failures).toEqual([]);
    // Confirm all 24 adversarial mutations were accounted for (either rejected by sigma-rust or SigmaState 6.0.2 JVM)
    const jvmRejectedCount = jvmCases.filter((c) => !c.expectPass).length;
    expect(rejectedAtProver.length + jvmRejectedCount).toBe(24);
  }, 60_000);
});
