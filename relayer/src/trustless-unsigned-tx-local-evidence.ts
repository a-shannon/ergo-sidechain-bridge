import blakejs from 'blakejs';

import { AggregateSettlementService } from './aggregate-settlement-service.js';
import type { DeployedState } from './config.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
  EMPTY_AVL_DIGEST,
} from './ergo-helpers.js';
import type { ParsedPegOut } from './sidechain-client.js';
import {
  encodeSpvTrackerAvlRegister,
  getSpvTrackerDigest,
  toSpvTrackerHistoryEntry,
  type SpvTrackerEntry,
} from './spv-tracker.js';
import type { BoxLike } from './aggregate-settlement-tx.js';
import type { SettlementIdentity } from './aggregate-settlement-builder.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
  verifyTrustlessBurnInclusionProof,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';
import type { TrustlessBurnInstanceIdentity } from './trustless-burn-instance-binding.js';

const publicSidechainIdHex = '11'.repeat(32);
const publicRecipientTreeHex = '0008cd02' + '44'.repeat(32);
const publicRelayerPk = '02' + '99'.repeat(32);
const publicSidechainLogIndex = 7;
const publicCommittee = encodeSigmaPropRegister(publicRelayerPk);
const zeroAssetIdHex = '00'.repeat(32);

export interface PublicTrustlessSingleLeafUnsignedTxFixture {
  deployed: DeployedState;
  accepted: SpvTrackerEntry;
  pegOut: ParsedPegOut;
  trackerBox: BoxLike;
  aggregateDupBox: BoxLike;
  unlockBox: BoxLike;
  settlementIdentity: SettlementIdentity;
  state: {
    getSpvTrackerHistory: () => ReturnType<typeof toSpvTrackerHistoryEntry>[];
    getAllAvlKeys: () => string[];
  };
}

export interface BuildLocalTrustlessSingleLeafUnsignedTxEvidenceInput {
  label: string;
  generatedAt: string;
  instanceIdentity?: TrustlessUnsignedTxInstanceBindingInput;
}

export type TrustlessUnsignedTxInstanceIdentityInput = Pick<
  TrustlessBurnInstanceIdentity,
  | 'sidechainIdHex'
  | 'sidechainTxHashHex'
  | 'sidechainBlockHashHex'
  | 'eventIndex'
  | 'bridgeEventRootHex'
  | 'ergoAnchorHeight'
  | 'burnIdHex'
  | 'duplicatePreventionKeyHex'
  | 'recipientErgoTreeHashHex'
  | 'amountNanoErg'
  | 'assetIdHex'
>;

export interface TrustlessUnsignedTxInstanceBindingInput extends TrustlessUnsignedTxInstanceIdentityInput {
  recipientErgoTreeHex?: string;
  trustlessBurnProof?: TrustlessBurnMerkleProofStep[];
}

export async function buildLocalTrustlessSingleLeafUnsignedTxEvidence(
  input: BuildLocalTrustlessSingleLeafUnsignedTxEvidenceInput,
) {
  const fixture = createPublicTrustlessSingleLeafUnsignedTxFixture(input.instanceIdentity);
  const selectedAddresses: string[] = [];
  const service = new AggregateSettlementService({
    ergo: {
      addressToTree: async () => { throw new Error('public fixture uses a raw recipient ErgoTree'); },
      getCurrentHeight: async () => 330200,
      findSingletonBox: async (tokenId: string) => {
        if (tokenId === fixture.deployed.spvTracker?.nftId) return fixture.trackerBox;
        if (tokenId === fixture.deployed.doubleUnlockPreventionAggregate?.nftId) {
          return fixture.aggregateDupBox;
        }
        throw new Error(`unexpected public fixture singleton token ${tokenId}`);
      },
      getUnspentBoxesByAddress: async (address: string) => {
        selectedAddresses.push(address);
        return [fixture.unlockBox];
      },
    },
    state: fixture.state,
    deployed: fixture.deployed,
  } as any);

  const prepared = await service.prepareTrustlessSingleLeafUnsignedTx({
    pegOut: fixture.pegOut,
    trackerIdentity: {
      sidechainIdHex: fixture.accepted.sidechainIdHex,
      sidechainHeight: fixture.accepted.sidechainHeight,
      sidechainHeaderHashHex: fixture.accepted.sidechainHeaderHashHex,
    },
    settlementIdentity: fixture.settlementIdentity,
    evidenceLabel: input.label,
    evidenceGeneratedAt: input.generatedAt,
  });

  return {
    fixture,
    selectedAddresses,
    prepared,
    evidence: prepared.unsignedTxEvidence,
  };
}

export function createPublicTrustlessSingleLeafUnsignedTxFixture(
  instanceIdentity?: TrustlessUnsignedTxInstanceBindingInput,
): PublicTrustlessSingleLeafUnsignedTxFixture {
  const deployed = publicDeployedState();
  const identity = normalizeInstanceIdentity(
    instanceIdentity ?? defaultPublicTrustlessInstanceIdentity(),
  );
  const recipientErgoTreeHex = identity.recipientErgoTreeHex ?? publicRecipientTreeHex;
  const amount = BigInt(identity.amountNanoErg);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER - 1_100_000)) {
    throw new Error('local trustless unsigned tx fixture amount is outside safe fixture liquidity range');
  }
  const unlockValue = Number(amount) + 1_100_000;
  const leaf = encodeTrustlessBurnLeaf({
    sidechainIdHex: identity.sidechainIdHex,
    sidechainBlockHashHex: identity.sidechainBlockHashHex,
    burnIdHex: identity.burnIdHex,
    sidechainTxHashHex: identity.sidechainTxHashHex,
    eventIndex: identity.eventIndex,
    recipientErgoTreeHashHex: identity.recipientErgoTreeHashHex,
    amountNanoErg: amount,
    assetIdHex: identity.assetIdHex,
  });
  if (recipientTreeHashHex(recipientErgoTreeHex) !== identity.recipientErgoTreeHashHex) {
    throw new Error('instance recipientErgoTreeHex must hash to recipientErgoTreeHashHex');
  }
  if (!verifyTrustlessBurnInclusionProof({
    leaf,
    bridgeEventRootHex: identity.bridgeEventRootHex,
    proof: identity.trustlessBurnProof ?? [],
  })) {
    throw new Error('instance trustless burn proof must resolve to bridgeEventRootHex');
  }
  const accepted = publicSpvTrackerEntry(1, identity.bridgeEventRootHex, {
    sidechainIdHex: identity.sidechainIdHex,
    sidechainHeaderHashHex: identity.sidechainBlockHashHex,
    ergoAnchorHeight: identity.ergoAnchorHeight,
  });
  const pegOut: ParsedPegOut = {
    user: '0x0000000000000000000000000000000000000001',
    amount,
    ergoRecipientAddress: recipientErgoTreeHex,
    sidechainTxHash: identity.sidechainTxHashHex,
    sidechainBlockNumber: Number(accepted.sidechainHeight),
    sidechainLogIndex: identity.eventIndex,
  };

  const trackerBox = publicBox('10'.repeat(32), deployed.spvTracker!.ergoTreeHex, {
    R4: encodeLongRegister(0),
    R5: encodeSpvTrackerAvlRegister(getSpvTrackerDigest([toSpvTrackerHistoryEntry(accepted)])),
    R6: publicCommittee,
    R7: encodeLongRegister(Number(accepted.sidechainHeight)),
  }, deployed.spvTracker!.nftId, 1_000_000);

  const aggregateDupBox = publicBox('20'.repeat(32), deployed.doubleUnlockPreventionAggregate!.ergoTreeHex, {
    R4: encodeLongRegister(0),
    R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
    R6: publicCommittee,
  }, deployed.doubleUnlockPreventionAggregate!.nftId, 1_000_000);

  const unlockBox = publicBox(
    '30'.repeat(32),
    deployed.mainChainAggregateUnlockTrustless!.ergoTreeHex,
    {
      R4: encodeCollByteRegister(Buffer.from('31'.repeat(32), 'hex')),
      R5: encodeCollByteRegister(Buffer.from('01'.repeat(20), 'hex')),
      R6: encodeLongRegister(unlockValue),
      R7: encodeCollByteRegister(Buffer.from(publicRecipientTreeHex, 'hex')),
    },
    undefined,
    unlockValue,
  );

  return {
    deployed,
    accepted,
    pegOut,
    trackerBox,
    aggregateDupBox,
    unlockBox,
    settlementIdentity: {
      source: 'trustless-burn-leaf',
      duplicatePreventionKeyHex: identity.duplicatePreventionKeyHex,
      bridgeEventRootHex: identity.bridgeEventRootHex,
      recipientErgoTreeHashHex: identity.recipientErgoTreeHashHex,
      amountNanoErg: identity.amountNanoErg,
      assetIdHex: identity.assetIdHex,
      trustlessBurnProof: identity.trustlessBurnProof,
    },
    state: {
      getSpvTrackerHistory: () => [toSpvTrackerHistoryEntry(accepted)],
      getAllAvlKeys: () => [],
    },
  };
}

function defaultPublicTrustlessInstanceIdentity(): TrustlessUnsignedTxInstanceIdentityInput {
  const sidechainTxHashHex = '55'.repeat(32);
  const sidechainBlockHashHex = '01'.repeat(32);
  const eventIndex = publicSidechainLogIndex;
  const burnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: publicSidechainIdHex,
    sidechainTxHashHex,
    eventIndex,
  });
  const recipientErgoTreeHashHex = recipientTreeHashHex(publicRecipientTreeHex);
  const amountNanoErg = '1000000';
  const leaf = encodeTrustlessBurnLeaf({
    sidechainIdHex: publicSidechainIdHex,
    sidechainBlockHashHex,
    burnIdHex,
    sidechainTxHashHex,
    eventIndex,
    recipientErgoTreeHashHex,
    amountNanoErg,
    assetIdHex: zeroAssetIdHex,
  });
  return {
    sidechainIdHex: publicSidechainIdHex,
    sidechainTxHashHex,
    sidechainBlockHashHex,
    eventIndex,
    bridgeEventRootHex: leaf.leafHashHex,
    ergoAnchorHeight: 330001,
    burnIdHex,
    duplicatePreventionKeyHex: burnIdHex,
    recipientErgoTreeHashHex,
    amountNanoErg,
    assetIdHex: zeroAssetIdHex,
  };
}

function normalizeInstanceIdentity(
  identity: TrustlessUnsignedTxInstanceBindingInput,
): TrustlessUnsignedTxInstanceBindingInput {
  const normalized = {
    sidechainIdHex: normalizeHex32(identity.sidechainIdHex, 'sidechainIdHex'),
    sidechainTxHashHex: normalizeHex32(identity.sidechainTxHashHex, 'sidechainTxHashHex'),
    sidechainBlockHashHex: normalizeHex32(identity.sidechainBlockHashHex, 'sidechainBlockHashHex'),
    eventIndex: normalizeEventIndex(identity.eventIndex),
    bridgeEventRootHex: normalizeHex32(identity.bridgeEventRootHex, 'bridgeEventRootHex'),
    ergoAnchorHeight: normalizeSafeNonNegativeInteger(identity.ergoAnchorHeight, 'ergoAnchorHeight'),
    burnIdHex: normalizeHex32(identity.burnIdHex, 'burnIdHex'),
    duplicatePreventionKeyHex: normalizeHex32(identity.duplicatePreventionKeyHex, 'duplicatePreventionKeyHex'),
    recipientErgoTreeHashHex: normalizeHex32(identity.recipientErgoTreeHashHex, 'recipientErgoTreeHashHex'),
    amountNanoErg: normalizePositiveDecimalString(identity.amountNanoErg, 'amountNanoErg'),
    assetIdHex: normalizeHex32(identity.assetIdHex, 'assetIdHex'),
    ...(identity.recipientErgoTreeHex === undefined ? {} : {
      recipientErgoTreeHex: normalizeRecipientErgoTreeHex(identity.recipientErgoTreeHex),
    }),
    ...(identity.trustlessBurnProof === undefined ? {} : {
      trustlessBurnProof: normalizeTrustlessBurnProof(identity.trustlessBurnProof),
    }),
  };
  const expectedBurnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: normalized.sidechainIdHex,
    sidechainTxHashHex: normalized.sidechainTxHashHex,
    eventIndex: normalized.eventIndex,
  });
  if (normalized.burnIdHex !== expectedBurnIdHex) {
    throw new Error('instance burnIdHex must equal the derived sidechain event identity');
  }
  if (normalized.duplicatePreventionKeyHex !== normalized.burnIdHex) {
    throw new Error('instance duplicatePreventionKeyHex must equal burnIdHex');
  }
  if (normalized.assetIdHex !== zeroAssetIdHex) {
    throw new Error('local trustless unsigned tx fixture currently supports only ERG assetId 00..00');
  }
  return normalized;
}

function normalizeRecipientErgoTreeHex(value: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{72}$/.test(clean)) {
    throw new Error('recipientErgoTreeHex must be a 36-byte hex ErgoTree');
  }
  return clean.toLowerCase();
}

function normalizeTrustlessBurnProof(
  proof: TrustlessBurnMerkleProofStep[],
): TrustlessBurnMerkleProofStep[] {
  if (!Array.isArray(proof)) {
    throw new Error('trustlessBurnProof must be an array');
  }
  return proof.map((step, index) => {
    if (step.side !== 'left' && step.side !== 'right') {
      throw new Error(`trustlessBurnProof[${index}].side must be left or right`);
    }
    return {
      side: step.side,
      hashHex: normalizeHex32(step.hashHex, `trustlessBurnProof[${index}].hashHex`),
    };
  });
}

function normalizeHex32(value: string, label: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return clean.toLowerCase();
}

function normalizeEventIndex(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error('eventIndex must be a uint32 safe integer');
  }
  return value;
}

function normalizeSafeNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizePositiveDecimalString(value: string, label: string): string {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a positive decimal string`);
  }
  return value;
}

function recipientTreeHashHex(ergoTreeHex: string): string {
  return Buffer.from(blakejs.blake2b(Buffer.from(ergoTreeHex, 'hex'), undefined, 32)).toString('hex');
}

function publicDeployedState(): DeployedState {
  return {
    network: 'testnet',
    deployedAt: new Date(0).toISOString(),
    sideChainState: { nftId: '01'.repeat(32), boxId: '01'.repeat(32), address: 'scs', ergoTreeHex: '1000' },
    doubleUnlockPrevention: { nftId: '02'.repeat(32), boxId: '02'.repeat(32), address: 'dup', ergoTreeHex: '1001' },
    spvTracker: { nftId: 'aa'.repeat(32), boxId: '03'.repeat(32), address: 'spv', ergoTreeHex: '1002' },
    doubleUnlockPreventionAggregate: {
      nftId: 'bb'.repeat(32),
      boxId: '04'.repeat(32),
      address: 'agg-dup',
      ergoTreeHex: '1003',
    },
    mainChainLock: { address: 'lock', ergoTreeHex: '1004' },
    mainChainUnlock: { address: 'unlock', ergoTreeHex: '1005' },
    mainChainAggregateUnlock: { address: 'agg-unlock', ergoTreeHex: '1006' },
    mainChainAggregateUnlockTrustless: { address: 'trustless-agg-unlock', ergoTreeHex: '1007' },
    relayer: { address: 'relayer', publicKey: publicRelayerPk },
  };
}

function publicSpvTrackerEntry(
  n: number,
  bridgeEventRootHex: string,
  overrides: Partial<Pick<SpvTrackerEntry, 'sidechainIdHex' | 'sidechainHeaderHashHex' | 'ergoAnchorHeight'>> = {},
): SpvTrackerEntry {
  return {
    sidechainIdHex: overrides.sidechainIdHex ?? publicSidechainIdHex,
    sidechainHeight: BigInt(1000 + n),
    sidechainHeaderHashHex: overrides.sidechainHeaderHashHex ?? n.toString(16).padStart(2, '0').repeat(32),
    bridgeEventRootHex,
    ergoAnchorHeight: overrides.ergoAnchorHeight ?? 330000 + n,
  };
}

function publicBox(
  boxId: string,
  ergoTree: string,
  registers: Record<string, string>,
  tokenId?: string,
  value = 2_100_000,
): BoxLike {
  return {
    boxId,
    value,
    ergoTree,
    assets: tokenId ? [{ tokenId, amount: 1 }] : [],
    additionalRegisters: registers,
    creationHeight: 330100,
    transactionId: boxId,
    index: 0,
  };
}
