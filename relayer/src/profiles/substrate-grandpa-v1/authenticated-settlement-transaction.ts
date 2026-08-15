import {
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeLongRegister,
} from '../../ergo-settlement-core/ergo-encoding.js';
import type {
  AggregateSettlementUnsignedTx,
  BoxLike,
} from '../../ergo-settlement-core/settlement-transaction.js';
import {
  planChangeOrFee,
  safeNanoErgNumber,
} from '../../ergo-settlement-core/tx-balance.js';
import {
  buildTrustlessSingleLeafAggregateUnlockExtension,
  type AuthenticatedSettlementPlan,
} from './authenticated-settlement-plan.js';
import {
  decodeCanonicalDlogSigmaPropRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-settlement-policy.js';
import { encodeAuthenticatedSpvTrackerAvlRegister } from './spv-tracker-authenticated.js';

export interface AuthenticatedTrackerDeploymentIdentity {
  nftId: string;
  ergoTreeHex: string;
}

export interface AuthenticatedDupDeploymentIdentity {
  nftId: string;
  ergoTreeHex: string;
}

export interface AuthenticatedVaultDeploymentIdentity {
  ergoTreeHex: string;
}

export interface AuthenticatedSettlementDeploymentIdentity {
  spvTrackerAuthenticated?: AuthenticatedTrackerDeploymentIdentity;
  doubleUnlockPreventionAuthenticated?: AuthenticatedDupDeploymentIdentity;
  mainChainAggregateUnlockAuthenticated?: AuthenticatedVaultDeploymentIdentity;
}

export interface BuildAuthenticatedSettlementTxInput {
  deployed: AuthenticatedSettlementDeploymentIdentity;
  plan: AuthenticatedSettlementPlan;
  trackerBox: BoxLike;
  duplicatePreventionBox: BoxLike;
  unlockBox: BoxLike;
  recipientErgoTreeHex: string;
  creationHeight: number;
  minerFee?: number;
}

const MIN_BOX_VALUE = 1_000_000;

function decodeLongRegister(hex: string | undefined, label: string): number {
  if (!hex || !hex.startsWith('05')) return 0;
  const bytes = Buffer.from(hex.slice(2), 'hex');
  let result = 0n;
  let shift = 0n;
  for (const byte of bytes) {
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
  }
  const zigzag = (result >> 1n) ^ -(result & 1n);
  return safeNanoErgNumber(zigzag, label);
}

function normalizeHex(hex: string, expectedBytes: number, label: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be hex`);
  }
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean.toLowerCase();
}

function getRegister(box: BoxLike, register: string, label: string): string {
  const value = box.additionalRegisters?.[register];
  if (!value) throw new Error(`${label} missing ${register}`);
  return value;
}

function assertSingletonToken(
  box: BoxLike,
  expectedTokenId: string,
  label: string,
): void {
  if ((box.assets?.length ?? 0) !== 1) {
    throw new Error(`${label} must contain exactly one singleton token`);
  }
  const token = box.assets![0];
  if (
    normalizeHex(token.tokenId, 32, `${label} token ID`)
      !== normalizeHex(expectedTokenId, 32, `${label} expected token ID`)
  ) {
    throw new Error(`${label} singleton token ID does not match deployed contract`);
  }
  if (BigInt(token.amount) !== 1n) {
    throw new Error(`${label} singleton token amount must be 1`);
  }
}

function decodeCanonicalDupAvlRegister(registerHex: string, label: string): {
  digestHex: string;
  flags: number;
} {
  const clean = registerHex.startsWith('0x') ? registerHex.slice(2) : registerHex;
  if (
    !/^[0-9a-fA-F]+$/.test(clean)
    || clean.length !== 76
    || clean.slice(0, 2).toLowerCase() !== '64'
  ) {
    throw new Error(`${label} must be a canonical AvlTree register`);
  }
  if (clean.slice(70, 72).toLowerCase() !== '20' || clean.slice(72).toLowerCase() !== '0101') {
    throw new Error(`${label} must use 32-byte keys and one-byte values`);
  }
  const flags = Number.parseInt(clean.slice(68, 70), 16);
  if ((flags & 0x01) === 0) {
    throw new Error(`${label} must permit append-only inserts`);
  }
  return {
    digestHex: clean.slice(2, 68).toLowerCase(),
    flags,
  };
}

function getSettlementVaultRegisters(box: BoxLike): Record<string, string> {
  if ((box.assets?.length ?? 0) !== 0) {
    throw new Error('trustless settlement vault input must be pure ERG');
  }
  return {
    R4: getRegister(box, 'R4', 'trustless settlement vault input'),
    R5: getRegister(box, 'R5', 'trustless settlement vault input'),
    R6: getRegister(box, 'R6', 'trustless settlement vault input'),
    R7: getRegister(box, 'R7', 'trustless settlement vault input'),
  };
}

export function buildAuthenticatedSettlementTx(
  input: BuildAuthenticatedSettlementTxInput,
): AggregateSettlementUnsignedTx {
  const deployed = input.deployed;
  if (!deployed.spvTrackerAuthenticated) {
    throw new Error('deployed.spvTrackerAuthenticated is required');
  }
  if (!deployed.doubleUnlockPreventionAuthenticated) {
    throw new Error('deployed.doubleUnlockPreventionAuthenticated is required');
  }
  if (!deployed.mainChainAggregateUnlockAuthenticated) {
    throw new Error('deployed.mainChainAggregateUnlockAuthenticated is required');
  }
  if (input.plan.contractCompatibility !== 'authenticated-v2') {
    throw new Error('authenticated settlement TX assembly requires an authenticated-v2 plan');
  }
  if (input.plan.claims.length !== 1 || !input.plan.dupV1Extension) {
    throw new Error('authenticated settlement TX assembly requires one claim and one DUP extension');
  }

  const trackerDeployment = deployed.spvTrackerAuthenticated;
  const dupDeployment = deployed.doubleUnlockPreventionAuthenticated;
  const unlockDeployment = deployed.mainChainAggregateUnlockAuthenticated;
  if (input.trackerBox.ergoTree.toLowerCase() !== trackerDeployment.ergoTreeHex.toLowerCase()) {
    throw new Error('authenticated tracker box ErgoTree does not match deployed contract');
  }
  if (
    input.duplicatePreventionBox.ergoTree.toLowerCase()
      !== dupDeployment.ergoTreeHex.toLowerCase()
  ) {
    throw new Error('authenticated DUP box ErgoTree does not match deployed contract');
  }
  if (input.unlockBox.ergoTree.toLowerCase() !== unlockDeployment.ergoTreeHex.toLowerCase()) {
    throw new Error('authenticated settlement vault ErgoTree does not match deployed contract');
  }
  assertSingletonToken(input.trackerBox, trackerDeployment.nftId, 'authenticated tracker box');
  assertSingletonToken(
    input.duplicatePreventionBox,
    dupDeployment.nftId,
    'authenticated DUP box',
  );

  const claim = input.plan.claims[0];
  const trackerRegister = getRegister(input.trackerBox, 'R5', 'authenticated tracker box');
  const expectedTrackerRegister = encodeAuthenticatedSpvTrackerAvlRegister(
    input.plan.trackerInputDigestHex,
  );
  if (trackerRegister.toLowerCase() !== expectedTrackerRegister.toLowerCase()) {
    throw new Error('authenticated tracker box R5 does not match the plan input digest');
  }
  const trackerSidechainId = decodeCollByteRegister(
    getRegister(input.trackerBox, 'R6', 'authenticated tracker box'),
    'authenticated tracker box R6',
  );
  if (trackerSidechainId !== claim.claim.trackerIdentity.sidechainIdHex.toLowerCase()) {
    throw new Error('authenticated tracker box R6 does not match the claim sidechain ID');
  }
  const trackerFinalityAttestorPubKeyHex = decodeCanonicalDlogSigmaPropRegister(
    getRegister(input.trackerBox, 'R9', 'authenticated tracker box'),
    'authenticated tracker box R9',
  );
  const bridgeCommitteePubKeyHex = decodeCanonicalDlogSigmaPropRegister(
    getRegister(input.duplicatePreventionBox, 'R6', 'authenticated DUP box'),
    'authenticated DUP box R6',
  );
  if (trackerFinalityAttestorPubKeyHex === bridgeCommitteePubKeyHex) {
    throw new Error(
      'authenticated settlement requires distinct tracker finality-attestor and bridge-committee Sigma propositions',
    );
  }

  const dupRegister = decodeCanonicalDupAvlRegister(
    getRegister(input.duplicatePreventionBox, 'R5', 'authenticated DUP box'),
    'authenticated DUP box R5',
  );
  if (dupRegister.digestHex !== input.plan.dupInputDigestHex) {
    throw new Error('authenticated DUP box R5 does not match the plan input digest');
  }

  const amount = BigInt(claim.claim.pegOut.amount);
  if (amount <= 0n || amount > 0x7fff_ffff_ffff_ffffn) {
    throw new Error('authenticated settlement payout must fit a positive signed Long');
  }
  const payoutValue = safeNanoErgNumber(amount, 'authenticated settlement payout');
  const minerFee = safeNanoErgNumber(input.minerFee ?? MINER_FEE, 'miner fee');
  const dupValue = safeNanoErgNumber(
    input.duplicatePreventionBox.value,
    'authenticated DUP box value',
  );
  const unlockValue = safeNanoErgNumber(
    input.unlockBox.value,
    'authenticated settlement vault value',
  );
  const vaultRegisters = getSettlementVaultRegisters(input.unlockBox);
  if (unlockValue < payoutValue + minerFee) {
    throw new Error(
      `authenticated settlement vault value ${unlockValue} does not cover payout ${payoutValue} + fee ${minerFee}`,
    );
  }
  const changePlan = planChangeOrFee(
    unlockValue - payoutValue - minerFee,
    minerFee,
    MIN_BOX_VALUE,
  );
  const dupCounter = decodeLongRegister(
    input.duplicatePreventionBox.additionalRegisters?.R4,
    'authenticated DUP counter',
  );
  const dupAuthMetadata = getRegister(
    input.duplicatePreventionBox,
    'R6',
    'authenticated DUP box',
  );

  const outputs: any[] = [
    {
      value: dupValue,
      ergoTree: dupDeployment.ergoTreeHex,
      assets: [{ tokenId: dupDeployment.nftId, amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(dupCounter + 1),
        R5: encodeAvlTreeRegister(
          Buffer.from(input.plan.dupOutputDigestHex, 'hex'),
          dupRegister.flags,
          1,
        ),
        R6: dupAuthMetadata,
      },
      creationHeight: input.creationHeight,
    },
    {
      value: payoutValue,
      ergoTree: normalizeHex(input.recipientErgoTreeHex, 36, 'recipientErgoTree'),
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    },
  ];

  if (changePlan.changeOutputValue > 0) {
    outputs.push({
      value: changePlan.changeOutputValue,
      ergoTree: unlockDeployment.ergoTreeHex,
      assets: [],
      additionalRegisters: vaultRegisters,
      creationHeight: input.creationHeight,
    });
  }
  outputs.push({
    value: changePlan.minerFeeValue,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: input.creationHeight,
  });

  return {
    inputs: [
      {
        boxId: input.duplicatePreventionBox.boxId,
        extension: input.plan.dupV1Extension,
      },
      {
        boxId: input.unlockBox.boxId,
        extension: buildTrustlessSingleLeafAggregateUnlockExtension({
          claim,
          recipientErgoTreeHex: input.recipientErgoTreeHex,
          insertProofHex: input.plan.dupProofs.insert_proof_hex,
        }),
      },
    ],
    dataInputs: [{ boxId: input.trackerBox.boxId }],
    outputs,
  };
}
