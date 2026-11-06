export function extendedRootResult() {
  const legacy = rootResult();
  return {
    ...legacy,
    recoveryEvidence: {
      buildDirectoryName: 'bridge-fed-genesis-Ab3D4e',
      directoryName: 'two-cycle-recovery-Ab3D4e', manifestSha256Hex: hex(203),
    },
    withdrawal: {
      ...legacy.withdrawal,
      tracker: { ...legacy.withdrawal.tracker, durableAttemptDigestHex: hex(201) },
    },
    secondCycle: {
      ...legacy.secondCycle,
      tracker: { ...legacy.secondCycle.tracker, durableAttemptDigestHex: hex(202) },
    },
  };
}

export function rootResult() {
  const cycleOne = cycle(1);
  const cycleTwo = cycle(2);
  return {
    status: 'fresh-federated-round-trip-confirmed',
    nativeGenesisHashHex: hex(10, true),
    typedGenesisSha256Hex: hex(11),
    rawSpecSha256Hex: hex(12),
    runtimeProfileIdHex: hex(13),
    familyIdHex: hex(14),
    sourceProofProfileIdHex: hex(15),
    nodeSha256Hex: hex(16),
    wasmSha256Hex: hex(17),
    operatorAddressHex: `0x${'12'.repeat(20)}`,
    storageKeysChecked: 6,
    issuanceInputBoxIds: [hex(18), hex(19), hex(20)],
    issuedTransactions: ['tracker', 'duplicatePrevention', 'pooledReserve']
      .map((role, ordinal) => ({
        ordinal,
        role,
        expectedTxId: hex(21 + ordinal),
        transportStatus: 'accepted',
        durableAttemptDigestHex: hex(31 + ordinal),
        journalDigestHex: hex(41 + ordinal),
        confirmationDigestHex: hex(51 + ordinal),
        confirmationHeight: 100 + ordinal,
        confirmationHeaderIdHex: hex(61 + ordinal),
      })),
    pegIn: cycleOne.pegIn,
    mint: nativeMint(2, cycleOne.pegIn, 70),
    burn: nativeBurn(4, 80),
    unsignedIssuance: ['tracker', 'duplicatePrevention', 'pooledReserve']
      .map((role, ordinal) => ({
        role,
        transactionIdHex: hex(21 + ordinal),
        predictedSingletonBoxIdHex: hex(91 + ordinal),
      })),
    frontierProcess: { stopped: true },
    ergoExecution: { stopped: true },
    withdrawal: { ...cycleOne.return, feeFunding: {
      withdrawal: fullFee(21), tracker: fullFee(22),
    } },
    completedCycles: 2 as const,
    secondCycle: {
      pegIn: cycleTwo.pegIn,
      mint: nativeMint(6, cycleTwo.pegIn, 100),
      burn: nativeBurn(8, 110),
      checkpoint: {},
      feeFunding: cycleTwo.return.feeFunding,
      anchor: cycleTwo.return.anchor,
      tracker: cycleTwo.return.tracker,
      payout: cycleTwo.return.payout,
      confirmationExecution: {},
    },
    singletonIssuanceEstablished: true,
    operationalMintEstablished: true,
    canonicalPayoutEstablished: true,
    sourceFinalityEstablished: false,
    trustless: false,
  };
}

function cycle(ordinal: number) {
  const seed = ordinal * 20;
  return {
    pegIn: {
      sourceLockTransactionIdHex: hex(seed + 1),
      reserveTransitionTransactionIdHex: hex(seed + 2),
      sourceLockBoxIdHex: hex(seed + 3),
      reserveSuccessorBoxIdHex: hex(seed + 4),
      mintIdentityHex: `0x${hex(seed + 5)}`,
      sourceProofReceiptDigestHex: hex(seed + 6),
    },
    return: cycleReturn(seed),
  };
}

function nativeMint(
  blockHeight: number,
  pegIn: ReturnType<typeof cycle>['pegIn'],
  seed: number,
) {
  return {
    blockHashHex: `0x${hex(seed + 1)}`,
    ethereumBlockHashHex: `0x${hex(seed + 2)}`,
    blockHeight,
    transactionHashHex: `0x${hex(seed + 3)}`,
    transactionIndex: 0,
    eventIndex: 1,
    mintIdentityHex: pegIn.mintIdentityHex,
    amountNanoErg: '20000000',
    recipientAddressHex: `0x${'34'.repeat(20)}`,
    sourceProofReceiptDigestHex: pegIn.sourceProofReceiptDigestHex,
    consumedReservationScaleHex: '0x0102',
    runtimeReservationConsumed: true,
    mintExecuted: true,
    sourceFinalityEstablished: false,
    trustless: false,
  };
}

function nativeBurn(blockHeight: number, seed: number) {
  return {
    phase: 'burn',
    blockHashHex: `0x${hex(seed + 1)}`,
    ethereumBlockHashHex: `0x${hex(seed + 2)}`,
    blockHeight,
    transactionHashHex: `0x${hex(seed + 3)}`,
    transactionIndex: 0,
    eventIndex: 2,
    grossAmountNanoErg: '15000000',
    netAmountNanoErg: '10000000',
    recipientErgoTreeHex: '0x0102',
    sourceFinalityEstablished: false,
    trustless: false,
  };
}

function cycleReturn(seed: number) {
  return {
    checkpoint: {},
    feeFunding: {
      withdrawal: fee(seed + 1),
      tracker: fee(seed + 2),
    },
    anchor: { observation: {}, execution: {} },
    tracker: {
      expectedTxId: hex(seed + 3),
      confirmationHeight: 150 + seed,
      confirmationHeaderIdHex: hex(seed + 4),
      authorizationDigestHex: hex(seed + 5),
      checkDigestHex: hex(seed + 6),
      frozenExecution: {},
      freshnessExecution: {},
      transportExecution: {},
      transportStatus: 'accepted',
      journalDigestHex: hex(seed + 7),
    },
    payout: {
      expectedTxId: hex(seed + 8),
      confirmationHeight: 160 + seed,
      confirmationHeaderIdHex: hex(seed + 9),
      observationDigestHex: hex(seed + 10),
      authorizationDigestHex: hex(seed + 11),
      durableAttemptDigestHex: hex(seed + 12),
      transportStatus: 'accepted',
      journalDigestHex: hex(seed + 13),
      payoutBoxIdHex: hex(seed + 14),
      amountNanoErg: '10000000',
      reserveSuccessorBoxIdHex: hex(seed + 15),
      duplicatePreventionSuccessorBoxIdHex: hex(seed + 16),
    },
    confirmationExecution: {},
  };
}

function fullFee(seed: number) {
  const { feeInputBoxIdHex, ...summary } = fee(seed);
  return { ...summary, feeInputBox: {
    boxId: feeInputBoxIdHex, value: '4000000', ergoTree: '0008cd' + '02'.repeat(33),
    assets: [], additionalRegisters: {}, creationHeight: summary.confirmationHeight - 1,
    transactionId: summary.expectedTxId, index: 0,
  } };
}

export function fee(seed: number) {
  return {
    expectedTxId: hex(seed),
    durableAttemptDigestHex: hex(seed + 1),
    transportStatus: 'accepted',
    journalDigestHex: hex(seed + 2),
    confirmationDigestHex: hex(seed + 3),
    confirmationHeight: 120 + seed,
    confirmationHeaderIdHex: hex(seed + 4),
    feeInputBoxIdHex: hex(seed + 5),
  };
}

export function hex(seed: number, prefix = false): string {
  const value = (seed % 256).toString(16).padStart(2, '0').repeat(32);
  return prefix ? `0x${value}` : value;
}
