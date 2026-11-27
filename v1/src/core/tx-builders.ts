import {
  AvlEntry,
  dupEmptyDigestHex,
  dupGenerateProofs,
  reserveEmptyDigestHex,
  reserveInsertProof,
  sigmaAvlTreeHex,
  sigmaCollByteHex,
  sigmaIntHex,
  sigmaLongHex,
  trackerEmptyDigestHex,
  trackerGetProof,
  trackerInsertProof,
} from './avl.js';
import {
  AUTH_MODE_FEDERATED,
  BurnLeafV1,
  CheckpointAdmitParams,
  DEFAULT_MINER_FEE,
  MIN_BOX_VALUE,
  MINER_FEE_ERGO_TREE_HEX,
  ZERO_32_HEX,
  buildBurnMerkleTree,
  bytesToHex,
  computeDepositCommitmentHex,
  computeFederatedStatementIdHex,
  computeTrackerKeyHex,
  decodePegInIntentV2,
  decodeTrackerGovernanceR9,
  encodeBurnLeafV1,
  encodePegInIntentV2,
  encodeProofBundleV1,
  encodeTrackerAdmitAction,
  encodeTrackerCancelAction,
  encodeTrackerExecuteAction,
  encodeTrackerGovernanceR9,
  encodeTrackerProposeAction,
  encodeTrackerValueV1,
  hexToBytes,
  initialTrackerGovernanceR9,
} from './codecs.js';
import { CompiledBridgeFamily } from './contracts.js';
import { ErgoBoxJson, UnsignedOutputJson, UnsignedTxJson } from '../crypto/signer.js';

export interface BuiltTransaction {
  unsignedTx: UnsignedTxJson;
  inputBoxes: ErgoBoxJson[];
  dataBoxes: ErgoBoxJson[];
}

function makeFeeAndChangeOutputs(params: {
  feeInBox: ErgoBoxJson;
  feeNanoErg?: bigint;
  topUpNanoErg?: bigint;
  changeErgoTreeHex: string;
  creationHeight: number;
}): UnsignedOutputJson[] {
  const fee = params.feeNanoErg ?? DEFAULT_MINER_FEE;
  const topUp = params.topUpNanoErg ?? 0n;
  const feeInVal = BigInt(params.feeInBox.value);
  const remaining = feeInVal - fee - topUp;
  if (remaining < 0n) {
    throw new Error(
      `Insufficient fee input value: have ${feeInVal}, need fee(${fee}) + topUp(${topUp})`,
    );
  }
  if (remaining > 0n && remaining < MIN_BOX_VALUE) {
    throw new Error(
      `Change output ${remaining} below minimum box value ${MIN_BOX_VALUE} (either absorb into fee or use larger fee box)`,
    );
  }
  const outputs: UnsignedOutputJson[] = [
    {
      value: fee.toString(),
      ergoTree: MINER_FEE_ERGO_TREE_HEX,
      creationHeight: params.creationHeight,
      assets: [],
      additionalRegisters: {},
    },
  ];
  if (remaining > 0n) {
    outputs.push({
      value: remaining.toString(),
      ergoTree: params.changeErgoTreeHex,
      creationHeight: params.creationHeight,
      assets: [],
      additionalRegisters: {},
    });
  }
  return outputs;
}

// ============================================================================
// 0. Genesis Singleton Mint & Genesis Deploy Builders
// ============================================================================

/**
 * Mint one EIP-004 singleton NFT (tokenId == fundingBox.boxId, amount == 1)
 * back to recipientErgoTreeHex so all 3 NFT IDs are known before compiling contracts.
 */
export function buildMintSingletonNftTx(params: {
  fundingBox: ErgoBoxJson;
  recipientErgoTreeHex: string;
  tokenName: string;
  tokenDescription: string;
  nftBoxValue?: bigint;
  feeNanoErg?: bigint;
  creationHeight: number;
}): BuiltTransaction & { tokenIdHex: string } {
  const nftVal = params.nftBoxValue ?? 2_000_000n;
  const fee = params.feeNanoErg ?? DEFAULT_MINER_FEE;
  const totalIn = BigInt(params.fundingBox.value);
  const change = totalIn - nftVal - fee;
  if (change < 0n || (change > 0n && change < MIN_BOX_VALUE)) {
    throw new Error(`Invalid funding balance for NFT mint: in=${totalIn}, nft=${nftVal}, fee=${fee}`);
  }
  const tokenIdHex = params.fundingBox.boxId;
  const outputs: UnsignedOutputJson[] = [
    {
      value: nftVal.toString(),
      ergoTree: params.recipientErgoTreeHex,
      creationHeight: params.creationHeight,
      assets: [{ tokenId: tokenIdHex, amount: '1' }],
      additionalRegisters: {
        R4: sigmaCollByteHex(Buffer.from(params.tokenName, 'utf8')),
        R5: sigmaCollByteHex(Buffer.from(params.tokenDescription, 'utf8')),
        R6: sigmaCollByteHex(Buffer.from('0', 'utf8')),
      },
    },
    {
      value: fee.toString(),
      ergoTree: MINER_FEE_ERGO_TREE_HEX,
      creationHeight: params.creationHeight,
      assets: [],
      additionalRegisters: {},
    },
  ];
  if (change > 0n) {
    outputs.push({
      value: change.toString(),
      ergoTree: params.recipientErgoTreeHex,
      creationHeight: params.creationHeight,
      assets: [],
      additionalRegisters: {},
    });
  }
  return {
    tokenIdHex,
    unsignedTx: {
      inputs: [{ boxId: params.fundingBox.boxId, extension: {} }],
      dataInputs: [],
      outputs,
    },
    inputBoxes: [params.fundingBox],
    dataBoxes: [],
  };
}

/**
 * Deploy all 3 canonical V1 singletons (BridgeTracker, BridgeDup, BridgeReserve)
 * atomically in a single transaction once the 3 singleton NFTs have been minted.
 */
export function buildGenesisDeployTx(params: {
  family: CompiledBridgeFamily;
  trackerNftBox: ErgoBoxJson;
  dupNftBox: ErgoBoxJson;
  reserveNftBox: ErgoBoxJson;
  fundingBox: ErgoBoxJson;
  changeErgoTreeHex: string;
  trackerErg?: bigint;
  dupErg?: bigint;
  reserveBufferErg?: bigint;
  feeNanoErg?: bigint;
  creationHeight: number;
}): BuiltTransaction {
  const trackerErg = params.trackerErg ?? 10_000_000n;
  const dupErg = params.dupErg ?? 10_000_000n;
  const reserveErg = params.reserveBufferErg ?? 20_000_000n;
  const fee = params.feeNanoErg ?? DEFAULT_MINER_FEE;

  const inputBoxes = [
    params.trackerNftBox,
    params.dupNftBox,
    params.reserveNftBox,
    params.fundingBox,
  ];
  const totalIn = inputBoxes.reduce((acc, b) => acc + BigInt(b.value), 0n);
  const change = totalIn - trackerErg - dupErg - reserveErg - fee;
  if (change < 0n || (change > 0n && change < MIN_BOX_VALUE)) {
    throw new Error(
      `Insufficient ERG for Genesis deploy: in=${totalIn}, need=${trackerErg + dupErg + reserveErg + fee}`,
    );
  }

  const familyBytes = hexToBytes(params.family.familyIdHex, 32);
  const sidechainBytes = hexToBytes(params.family.params.sidechainIdHex, 32);

  const outputs: UnsignedOutputJson[] = [
    // OUTPUTS(0): BridgeTracker
    {
      value: trackerErg.toString(),
      ergoTree: params.family.tracker.ergoTreeHex,
      creationHeight: params.creationHeight,
      assets: [{ tokenId: params.family.params.trackerNftIdHex, amount: '1' }],
      additionalRegisters: {
        R4: sigmaCollByteHex(familyBytes),
        R5: sigmaAvlTreeHex(trackerEmptyDigestHex(), 370),
        R6: sigmaCollByteHex(sidechainBytes),
        R7: sigmaLongHex(0n),
        R8: sigmaIntHex(0),
        R9: sigmaCollByteHex(initialTrackerGovernanceR9(params.family.params.committeeEpoch)),
      },
    },
    // OUTPUTS(1): BridgeDup
    {
      value: dupErg.toString(),
      ergoTree: params.family.dup.ergoTreeHex,
      creationHeight: params.creationHeight,
      assets: [{ tokenId: params.family.params.dupNftIdHex, amount: '1' }],
      additionalRegisters: {
        R4: sigmaCollByteHex(familyBytes),
        R5: sigmaAvlTreeHex(dupEmptyDigestHex(), 1),
      },
    },
    // OUTPUTS(2): BridgeReserve
    {
      value: reserveErg.toString(),
      ergoTree: params.family.reserve.ergoTreeHex,
      creationHeight: params.creationHeight,
      assets: [{ tokenId: params.family.params.reserveNftIdHex, amount: '1' }],
      additionalRegisters: {
        R4: sigmaCollByteHex(familyBytes),
        R5: sigmaAvlTreeHex(reserveEmptyDigestHex(), 32),
        R6: sigmaLongHex(0n),
      },
    },
    // OUTPUTS(3): Miner fee
    {
      value: fee.toString(),
      ergoTree: MINER_FEE_ERGO_TREE_HEX,
      creationHeight: params.creationHeight,
      assets: [],
      additionalRegisters: {},
    },
  ];
  if (change > 0n) {
    outputs.push({
      value: change.toString(),
      ergoTree: params.changeErgoTreeHex,
      creationHeight: params.creationHeight,
      assets: [],
      additionalRegisters: {},
    });
  }

  return {
    unsignedTx: {
      inputs: inputBoxes.map((b) => ({ boxId: b.boxId, extension: {} })),
      dataInputs: [],
      outputs,
    },
    inputBoxes,
    dataBoxes: [],
  };
}

// ============================================================================
// 1. Peg-In: DepositLock -> CommitToReserve (or Refund after timeout)
// ============================================================================

export function buildDepositLockTx(params: {
  family: CompiledBridgeFamily;
  depositorFundingBox: ErgoBoxJson;
  depositorErgoTreeHex: string;
  evmRecipientHex: string;
  amountNanoErg: bigint;
  feeNanoErg?: bigint;
  creationHeight: number;
}): BuiltTransaction {
  const fee = params.feeNanoErg ?? DEFAULT_MINER_FEE;
  const totalIn = BigInt(params.depositorFundingBox.value);
  const change = totalIn - params.amountNanoErg - fee;
  if (change < 0n || (change > 0n && change < MIN_BOX_VALUE)) {
    throw new Error(
      `Insufficient depositor ERG: have ${totalIn}, need amount(${params.amountNanoErg}) + fee(${fee})`,
    );
  }
  const intent = encodePegInIntentV2({
    sourceNetworkIdHex: params.family.params.sourceNetworkIdHex,
    sidechainIdHex: params.family.params.sidechainIdHex,
    bridgeAddressHex: params.family.params.bridgeAddressHex,
    tokenAddressHex: params.family.params.tokenAddressHex,
    familyIdHex: params.family.familyIdHex,
    reserveNftIdHex: params.family.params.reserveNftIdHex,
    amountNanoErg: params.amountNanoErg,
    evmRecipientHex: params.evmRecipientHex,
  });
  const outputs: UnsignedOutputJson[] = [
    {
      value: params.amountNanoErg.toString(),
      ergoTree: params.family.depositLock.ergoTreeHex,
      creationHeight: params.creationHeight,
      assets: [],
      additionalRegisters: {
        R4: sigmaCollByteHex(intent),
        R5: sigmaCollByteHex(hexToBytes(params.depositorErgoTreeHex)),
      },
    },
    {
      value: fee.toString(),
      ergoTree: MINER_FEE_ERGO_TREE_HEX,
      creationHeight: params.creationHeight,
      assets: [],
      additionalRegisters: {},
    },
  ];
  if (change > 0n) {
    outputs.push({
      value: change.toString(),
      ergoTree: params.depositorErgoTreeHex,
      creationHeight: params.creationHeight,
      assets: [],
      additionalRegisters: {},
    });
  }
  return {
    unsignedTx: {
      inputs: [{ boxId: params.depositorFundingBox.boxId, extension: {} }],
      dataInputs: [],
      outputs,
    },
    inputBoxes: [params.depositorFundingBox],
    dataBoxes: [],
  };
}

export function buildCommitDepositTx(params: {
  family: CompiledBridgeFamily;
  reserveBox: ErgoBoxJson;
  reserveLiabilityNanoErg: bigint;
  reserveHistory: AvlEntry[];
  depositLockBox: ErgoBoxJson;
  encodedIntent: Uint8Array;
  feeInBox: ErgoBoxJson;
  changeErgoTreeHex: string;
  feeNanoErg?: bigint;
  creationHeight: number;
}): BuiltTransaction & { commitmentHex: string; newReserveDigestHex: string; newLiabilityNanoErg: bigint } {
  const intent = decodePegInIntentV2(params.encodedIntent);
  const commitmentHex = computeDepositCommitmentHex(
    params.family.familyIdHex,
    params.depositLockBox.boxId,
    params.encodedIntent,
  );
  const { insertProofHex, newDigestHex } = reserveInsertProof(
    params.reserveHistory,
    params.depositLockBox.boxId,
    commitmentHex,
  );
  const nextReserveValue = BigInt(params.reserveBox.value) + intent.amountNanoErg;
  const nextLiability = params.reserveLiabilityNanoErg + intent.amountNanoErg;

  const outputs: UnsignedOutputJson[] = [
    {
      value: nextReserveValue.toString(),
      ergoTree: params.reserveBox.ergoTree,
      creationHeight: params.creationHeight,
      assets: [{ tokenId: params.family.params.reserveNftIdHex, amount: '1' }],
      additionalRegisters: {
        R4: sigmaCollByteHex(hexToBytes(params.family.familyIdHex, 32)),
        R5: sigmaAvlTreeHex(newDigestHex, 32),
        R6: sigmaLongHex(nextLiability),
      },
    },
    ...makeFeeAndChangeOutputs({
      feeInBox: params.feeInBox,
      feeNanoErg: params.feeNanoErg,
      changeErgoTreeHex: params.changeErgoTreeHex,
      creationHeight: params.creationHeight,
    }),
  ];

  const inputBoxes = [params.reserveBox, params.depositLockBox, params.feeInBox];
  return {
    commitmentHex,
    newReserveDigestHex: newDigestHex,
    newLiabilityNanoErg: nextLiability,
    unsignedTx: {
      inputs: [
        {
          boxId: params.reserveBox.boxId,
          extension: { '0': sigmaCollByteHex(hexToBytes(insertProofHex)) },
        },
        { boxId: params.depositLockBox.boxId, extension: {} },
        { boxId: params.feeInBox.boxId, extension: {} },
      ],
      dataInputs: [],
      outputs,
    },
    inputBoxes,
    dataBoxes: [],
  };
}

export function buildRefundDepositTx(params: {
  depositLockBox: ErgoBoxJson;
  depositorErgoTreeHex: string;
  feeInBox: ErgoBoxJson;
  changeErgoTreeHex: string;
  feeNanoErg?: bigint;
  creationHeight: number;
}): BuiltTransaction {
  const outputs: UnsignedOutputJson[] = [
    {
      value: BigInt(params.depositLockBox.value).toString(),
      ergoTree: params.depositorErgoTreeHex,
      creationHeight: params.creationHeight,
      assets: [],
      additionalRegisters: {
        R4: sigmaCollByteHex(hexToBytes(params.depositLockBox.boxId, 32)),
      },
    },
    ...makeFeeAndChangeOutputs({
      feeInBox: params.feeInBox,
      feeNanoErg: params.feeNanoErg,
      changeErgoTreeHex: params.changeErgoTreeHex,
      creationHeight: params.creationHeight,
    }),
  ];
  return {
    unsignedTx: {
      inputs: [
        { boxId: params.depositLockBox.boxId, extension: {} },
        { boxId: params.feeInBox.boxId, extension: {} },
      ],
      dataInputs: [],
      outputs,
    },
    inputBoxes: [params.depositLockBox, params.feeInBox],
    dataBoxes: [],
  };
}

// ============================================================================
// 2. Tracker Operations: Admit, ProposeUpgrade, CancelUpgrade, ExecuteUpgrade
// ============================================================================

export function buildTrackerAdmitTx(params: {
  family: CompiledBridgeFamily;
  trackerBox: ErgoBoxJson;
  trackerHistory: AvlEntry[];
  checkpoint: CheckpointAdmitParams;
  ergoKeySetDigestHex?: string;
  committeeEpoch?: bigint;
  currentR9Bytes: Uint8Array;
  feeInBox: ErgoBoxJson;
  changeErgoTreeHex: string;
  topUpNanoErg?: bigint;
  feeNanoErg?: bigint;
  creationHeight: number;
}): BuiltTransaction & {
  trackerKeyHex: string;
  trackerValueHex: string;
  newTrackerDigestHex: string;
} {
  const action = encodeTrackerAdmitAction(params.checkpoint);
  const statementIdHex = computeFederatedStatementIdHex(action);
  const trackerKeyHex = computeTrackerKeyHex({
    sourceNetworkIdHex: params.checkpoint.sourceNetworkIdHex,
    sidechainIdHex: params.checkpoint.sidechainIdHex,
    sourceHeight: params.checkpoint.sourceHeight,
    sourceBlockHashHex: params.checkpoint.sourceBlockHashHex,
    executionBlockHashHex: params.checkpoint.executionBlockHashHex,
  });
  const trackerValueBytes = encodeTrackerValueV1({
    authMode: AUTH_MODE_FEDERATED,
    familyIdHex: params.family.familyIdHex,
    sidechainIdHex: params.checkpoint.sidechainIdHex,
    sourceHeight: params.checkpoint.sourceHeight,
    sourceBlockHashHex: params.checkpoint.sourceBlockHashHex,
    executionBlockHashHex: params.checkpoint.executionBlockHashHex,
    bridgeEventRootHex: params.checkpoint.bridgeEventRootHex,
    burnCount: params.checkpoint.burnCount,
    statementIdHex,
    admissionHeight: BigInt(params.creationHeight),
    authorityEpoch: params.committeeEpoch ?? params.family.params.committeeEpoch,
    authorityDigestHex: params.ergoKeySetDigestHex ?? params.family.ergoKeySetDigestHex,
    trustAnchorDigestHex: ZERO_32_HEX,
    sourceNetworkIdHex: params.checkpoint.sourceNetworkIdHex,
  });
  const trackerValueHex = bytesToHex(trackerValueBytes);
  const { insertProofHex, newDigestHex } = trackerInsertProof(
    params.trackerHistory,
    trackerKeyHex,
    trackerValueHex,
  );
  const topUp = params.topUpNanoErg ?? 0n;
  const nextVal = BigInt(params.trackerBox.value) + topUp;

  const outputs: UnsignedOutputJson[] = [
    {
      value: nextVal.toString(),
      ergoTree: params.trackerBox.ergoTree,
      creationHeight: params.creationHeight,
      assets: [{ tokenId: params.family.params.trackerNftIdHex, amount: '1' }],
      additionalRegisters: {
        R4: sigmaCollByteHex(hexToBytes(params.family.familyIdHex, 32)),
        R5: sigmaAvlTreeHex(newDigestHex, 370),
        R6: sigmaCollByteHex(hexToBytes(params.family.params.sidechainIdHex, 32)),
        R7: sigmaLongHex(params.checkpoint.sourceHeight),
        R8: sigmaIntHex(params.creationHeight),
        R9: sigmaCollByteHex(params.currentR9Bytes),
      },
    },
    ...makeFeeAndChangeOutputs({
      feeInBox: params.feeInBox,
      feeNanoErg: params.feeNanoErg,
      topUpNanoErg: topUp,
      changeErgoTreeHex: params.changeErgoTreeHex,
      creationHeight: params.creationHeight,
    }),
  ];

  return {
    trackerKeyHex,
    trackerValueHex,
    newTrackerDigestHex: newDigestHex,
    unsignedTx: {
      inputs: [
        {
          boxId: params.trackerBox.boxId,
          extension: {
            '0': sigmaCollByteHex(action),
            '1': sigmaCollByteHex(hexToBytes(insertProofHex)),
          },
        },
        { boxId: params.feeInBox.boxId, extension: {} },
      ],
      dataInputs: [],
      outputs,
    },
    inputBoxes: [params.trackerBox, params.feeInBox],
    dataBoxes: [],
  };
}

export function buildTrackerProposeUpgradeTx(params: {
  family: CompiledBridgeFamily;
  trackerBox: ErgoBoxJson;
  currentEpoch: bigint;
  upgradeTimelockBlocks: bigint;
  mode: 1 | 2;
  targetScriptHashHex: string;
  trustAnchorDigestHex: string;
  feeInBox: ErgoBoxJson;
  changeErgoTreeHex: string;
  feeNanoErg?: bigint;
  creationHeight: number;
}): BuiltTransaction & { nextR9Bytes: Uint8Array; activatesAtHeight: bigint } {
  const action = encodeTrackerProposeAction({
    mode: params.mode,
    targetScriptHashHex: params.targetScriptHashHex,
    trustAnchorDigestHex: params.trustAnchorDigestHex,
  });
  const activatesAtHeight = BigInt(params.creationHeight) + params.upgradeTimelockBlocks;
  const nextR9Bytes = encodeTrackerGovernanceR9({
    epoch: params.currentEpoch,
    pendingMode: params.mode,
    pendingTargetScriptHashHex: params.targetScriptHashHex,
    pendingActivatesAtHeight: activatesAtHeight,
    pendingTrustAnchorDigestHex: params.trustAnchorDigestHex,
  });
  const outputs: UnsignedOutputJson[] = [
    {
      value: BigInt(params.trackerBox.value).toString(),
      ergoTree: params.trackerBox.ergoTree,
      creationHeight: params.creationHeight,
      assets: [{ tokenId: params.family.params.trackerNftIdHex, amount: '1' }],
      additionalRegisters: {
        R4: params.trackerBox.additionalRegisters.R4,
        R5: params.trackerBox.additionalRegisters.R5,
        R6: params.trackerBox.additionalRegisters.R6,
        R7: params.trackerBox.additionalRegisters.R7,
        R8: params.trackerBox.additionalRegisters.R8,
        R9: sigmaCollByteHex(nextR9Bytes),
      },
    },
    ...makeFeeAndChangeOutputs({
      feeInBox: params.feeInBox,
      feeNanoErg: params.feeNanoErg,
      changeErgoTreeHex: params.changeErgoTreeHex,
      creationHeight: params.creationHeight,
    }),
  ];
  return {
    nextR9Bytes,
    activatesAtHeight,
    unsignedTx: {
      inputs: [
        {
          boxId: params.trackerBox.boxId,
          extension: { '0': sigmaCollByteHex(action) },
        },
        { boxId: params.feeInBox.boxId, extension: {} },
      ],
      dataInputs: [],
      outputs,
    },
    inputBoxes: [params.trackerBox, params.feeInBox],
    dataBoxes: [],
  };
}

export function buildTrackerCancelUpgradeTx(params: {
  family: CompiledBridgeFamily;
  trackerBox: ErgoBoxJson;
  currentEpoch: bigint;
  feeInBox: ErgoBoxJson;
  changeErgoTreeHex: string;
  feeNanoErg?: bigint;
  creationHeight: number;
}): BuiltTransaction & { nextR9Bytes: Uint8Array } {
  const nextR9Bytes = initialTrackerGovernanceR9(params.currentEpoch);
  const outputs: UnsignedOutputJson[] = [
    {
      value: BigInt(params.trackerBox.value).toString(),
      ergoTree: params.trackerBox.ergoTree,
      creationHeight: params.creationHeight,
      assets: [{ tokenId: params.family.params.trackerNftIdHex, amount: '1' }],
      additionalRegisters: {
        R4: params.trackerBox.additionalRegisters.R4,
        R5: params.trackerBox.additionalRegisters.R5,
        R6: params.trackerBox.additionalRegisters.R6,
        R7: params.trackerBox.additionalRegisters.R7,
        R8: params.trackerBox.additionalRegisters.R8,
        R9: sigmaCollByteHex(nextR9Bytes),
      },
    },
    ...makeFeeAndChangeOutputs({
      feeInBox: params.feeInBox,
      feeNanoErg: params.feeNanoErg,
      changeErgoTreeHex: params.changeErgoTreeHex,
      creationHeight: params.creationHeight,
    }),
  ];
  return {
    nextR9Bytes,
    unsignedTx: {
      inputs: [
        {
          boxId: params.trackerBox.boxId,
          extension: { '0': sigmaCollByteHex(encodeTrackerCancelAction()) },
        },
        { boxId: params.feeInBox.boxId, extension: {} },
      ],
      dataInputs: [],
      outputs,
    },
    inputBoxes: [params.trackerBox, params.feeInBox],
    dataBoxes: [],
  };
}

export function buildTrackerExecuteUpgradeTx(params: {
  family: CompiledBridgeFamily;
  trackerBox: ErgoBoxJson;
  currentR9Bytes: Uint8Array;
  targetErgoTreeHex: string;
  feeInBox: ErgoBoxJson;
  changeErgoTreeHex: string;
  feeNanoErg?: bigint;
  creationHeight: number;
}): BuiltTransaction & { nextR9Bytes: Uint8Array } {
  const gov = decodeTrackerGovernanceR9(params.currentR9Bytes);
  if (gov.pendingMode !== 1 && gov.pendingMode !== 2) {
    throw new Error('Cannot execute upgrade when pendingMode == 0');
  }
  const nextR9Bytes =
    gov.pendingMode === 1
      ? initialTrackerGovernanceR9(gov.epoch + 1n)
      : hexToBytes(gov.pendingTrustAnchorDigestHex, 32);

  const outputs: UnsignedOutputJson[] = [
    {
      value: BigInt(params.trackerBox.value).toString(),
      ergoTree: params.targetErgoTreeHex,
      creationHeight: params.creationHeight,
      assets: [{ tokenId: params.family.params.trackerNftIdHex, amount: '1' }],
      additionalRegisters: {
        R4: params.trackerBox.additionalRegisters.R4,
        R5: params.trackerBox.additionalRegisters.R5,
        R6: params.trackerBox.additionalRegisters.R6,
        R7: params.trackerBox.additionalRegisters.R7,
        R8: params.trackerBox.additionalRegisters.R8,
        R9: sigmaCollByteHex(nextR9Bytes),
      },
    },
    ...makeFeeAndChangeOutputs({
      feeInBox: params.feeInBox,
      feeNanoErg: params.feeNanoErg,
      changeErgoTreeHex: params.changeErgoTreeHex,
      creationHeight: params.creationHeight,
    }),
  ];
  return {
    nextR9Bytes,
    unsignedTx: {
      inputs: [
        {
          boxId: params.trackerBox.boxId,
          extension: { '0': sigmaCollByteHex(encodeTrackerExecuteAction()) },
        },
        { boxId: params.feeInBox.boxId, extension: {} },
      ],
      dataInputs: [],
      outputs,
    },
    inputBoxes: [params.trackerBox, params.feeInBox],
    dataBoxes: [],
  };
}

// ============================================================================
// 3. Peg-Out Payout: Reserve + DUP (reading Tracker via DATA_INPUTS(0))
// ============================================================================

export function buildBurnPayoutTx(params: {
  family: CompiledBridgeFamily;
  trackerBox: ErgoBoxJson;
  trackerHistory: AvlEntry[];
  trackerKeyHex: string;
  reserveBox: ErgoBoxJson;
  reserveLiabilityNanoErg: bigint;
  dupBox: ErgoBoxJson;
  dupHistoryBurnIdsHex: string[];
  sidechainHeight: bigint;
  blockBurnLeaves: BurnLeafV1[];
  targetLeafIndex: number;
  feeInBox: ErgoBoxJson;
  changeErgoTreeHex: string;
  feeNanoErg?: bigint;
  creationHeight: number;
}): BuiltTransaction & {
  burnIdHex: string;
  newDupDigestHex: string;
  newLiabilityNanoErg: bigint;
} {
  const encodedLeaves = params.blockBurnLeaves.map((l) => encodeBurnLeafV1(l));
  const merkle = buildBurnMerkleTree(encodedLeaves.map((e) => e.encodedLeaf));
  const targetLeaf = params.blockBurnLeaves[params.targetLeafIndex];
  const targetEncoded = encodedLeaves[params.targetLeafIndex];
  const merkleProofBytes = merkle.getProofBytes(params.targetLeafIndex);

  const trackerLookup = trackerGetProof(params.trackerHistory, params.trackerKeyHex);
  const dupProofs = dupGenerateProofs(params.dupHistoryBurnIdsHex, targetEncoded.burnIdHex);
  const proofBundle = encodeProofBundleV1({
    sidechainHeight: params.sidechainHeight,
    leafIndex: params.targetLeafIndex,
    leafCount: params.blockBurnLeaves.length,
    merkleProofBytes,
    dupLookupProofBytes: hexToBytes(dupProofs.lookupProofHex),
    dupInsertProofBytes: hexToBytes(dupProofs.insertProofHex),
  });

  const nextReserveValue = BigInt(params.reserveBox.value) - targetLeaf.amountNanoErg;
  const nextLiability = params.reserveLiabilityNanoErg - targetLeaf.amountNanoErg;
  if (nextLiability < 0n || nextReserveValue < MIN_BOX_VALUE) {
    throw new Error(
      `Reserve balance/liability insufficient for payout ${targetLeaf.amountNanoErg}`,
    );
  }

  const outputs: UnsignedOutputJson[] = [
    // OUTPUTS(0): BridgeReserve successor
    {
      value: nextReserveValue.toString(),
      ergoTree: params.reserveBox.ergoTree,
      creationHeight: params.creationHeight,
      assets: [{ tokenId: params.family.params.reserveNftIdHex, amount: '1' }],
      additionalRegisters: {
        R4: params.reserveBox.additionalRegisters.R4,
        R5: params.reserveBox.additionalRegisters.R5,
        R6: sigmaLongHex(nextLiability),
      },
    },
    // OUTPUTS(1): BridgeDup successor
    {
      value: BigInt(params.dupBox.value).toString(),
      ergoTree: params.dupBox.ergoTree,
      creationHeight: params.creationHeight,
      assets: [{ tokenId: params.family.params.dupNftIdHex, amount: '1' }],
      additionalRegisters: {
        R4: params.dupBox.additionalRegisters.R4,
        R5: sigmaAvlTreeHex(dupProofs.newDigestHex, 1),
      },
    },
    // OUTPUTS(2): Exact payout
    {
      value: targetLeaf.amountNanoErg.toString(),
      ergoTree: targetLeaf.recipientErgoTreeHex,
      creationHeight: params.creationHeight,
      assets: [],
      additionalRegisters: {},
    },
    // OUTPUTS(3) [+ optional OUTPUTS(4)]: miner fee [+ fee change]
    ...makeFeeAndChangeOutputs({
      feeInBox: params.feeInBox,
      feeNanoErg: params.feeNanoErg,
      changeErgoTreeHex: params.changeErgoTreeHex,
      creationHeight: params.creationHeight,
    }),
  ];

  return {
    burnIdHex: targetEncoded.burnIdHex,
    newDupDigestHex: dupProofs.newDigestHex,
    newLiabilityNanoErg: nextLiability,
    unsignedTx: {
      inputs: [
        { boxId: params.reserveBox.boxId, extension: {} },
        {
          boxId: params.dupBox.boxId,
          extension: {
            '0': sigmaCollByteHex(hexToBytes(params.trackerKeyHex, 32)),
            '1': sigmaCollByteHex(hexToBytes(trackerLookup.getProofHex)),
            '2': sigmaCollByteHex(targetEncoded.encodedLeaf),
            '3': sigmaCollByteHex(proofBundle),
          },
        },
        { boxId: params.feeInBox.boxId, extension: {} },
      ],
      dataInputs: [{ boxId: params.trackerBox.boxId }],
      outputs,
    },
    inputBoxes: [params.reserveBox, params.dupBox, params.feeInBox],
    dataBoxes: [params.trackerBox],
  };
}

// ============================================================================
// 4. Permissionless Storage-Rent Refresh (+ optional ERG buffer top-up)
//    Works identically for BridgeReserve, BridgeDup, and BridgeTracker!
// ============================================================================

export function buildRentRefreshTx(params: {
  singletonBox: ErgoBoxJson;
  feeInBox: ErgoBoxJson;
  changeErgoTreeHex: string;
  topUpNanoErg?: bigint;
  feeNanoErg?: bigint;
  creationHeight: number;
}): BuiltTransaction {
  const topUp = params.topUpNanoErg ?? 0n;
  if (topUp < 0n) {
    throw new Error('topUpNanoErg must be >= 0');
  }
  const nextVal = BigInt(params.singletonBox.value) + topUp;
  const outputs: UnsignedOutputJson[] = [
    {
      value: nextVal.toString(),
      ergoTree: params.singletonBox.ergoTree,
      creationHeight: params.creationHeight,
      assets: params.singletonBox.assets.map((a) => ({
        tokenId: a.tokenId,
        amount: String(a.amount),
      })),
      additionalRegisters: { ...params.singletonBox.additionalRegisters },
    },
    ...makeFeeAndChangeOutputs({
      feeInBox: params.feeInBox,
      feeNanoErg: params.feeNanoErg,
      topUpNanoErg: topUp,
      changeErgoTreeHex: params.changeErgoTreeHex,
      creationHeight: params.creationHeight,
    }),
  ];
  return {
    unsignedTx: {
      inputs: [
        { boxId: params.singletonBox.boxId, extension: {} },
        { boxId: params.feeInBox.boxId, extension: {} },
      ],
      dataInputs: [],
      outputs,
    },
    inputBoxes: [params.singletonBox, params.feeInBox],
    dataBoxes: [],
  };
}
