import { Interface } from 'ethers';
import { describe, expect, it } from 'vitest';

import {
  createFrontierBackingReadAgreementSources,
  observeFrontierBackingReadAgreement,
  type FrontierBackingReadClient,
} from '../../adapters/frontier-backing-read-agreement.js';
import {
  deriveTrustlessBurnIdHex,
} from '../../ergo-settlement-core/trustless-burn-id.js';
import {
  projectSubstrateFederatedDatabaseLossInventoryObservationV1,
} from './substrate-federated-database-loss-recovery-v1.js';

const BRIDGE = `0x${'11'.repeat(20)}`;
const USER = `0x${'22'.repeat(20)}`;
const SERG = `0x${'23'.repeat(20)}`;
const SERG_OWNER = `0x${'24'.repeat(20)}`;
const SIDECHAIN_ID = '33'.repeat(32);
const BRIDGE_CODE_HASH = '34'.repeat(32);
const SERG_CODE_HASH = '35'.repeat(32);
const TRANSACTION_HASH = '44'.repeat(32);
const BURN_BLOCK_HASH = '55'.repeat(32);
const PIN_BLOCK_HASH = '66'.repeat(32);
const RECIPIENT = `02${'77'.repeat(32)}`;
const BURN_HEIGHT = 1;
const PINNED_HEIGHT = 2;
const LOG_INDEX = 3;
const AMOUNT = 25_000_000n;
const PEG_OUT_INTERFACE = new Interface([
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
]);

function client(): FrontierBackingReadClient {
  const encoded = PEG_OUT_INTERFACE.encodeEventLog(
    PEG_OUT_INTERFACE.getEvent('PegOut')!,
    [USER, AMOUNT, `0x${RECIPIENT}`],
  );
  const event = Object.freeze({
    user: USER,
    amount: AMOUNT,
    ergoRecipientAddress: RECIPIENT,
    sidechainTxHash: TRANSACTION_HASH,
    sidechainBlockNumber: BURN_HEIGHT,
    sidechainBlockHash: BURN_BLOCK_HASH,
    sidechainLogIndex: LOG_INDEX,
  });
  const receipt = Object.freeze({
    status: 1,
    hash: `0x${TRANSACTION_HASH}`,
    blockNumber: BURN_HEIGHT,
    blockHash: `0x${BURN_BLOCK_HASH}`,
    logs: Object.freeze([Object.freeze({
      address: BRIDGE,
      topics: Object.freeze(encoded.topics),
      data: encoded.data,
      transactionHash: `0x${TRANSACTION_HASH}`,
      blockNumber: BURN_HEIGHT,
      blockHash: `0x${BURN_BLOCK_HASH}`,
      index: LOG_INDEX,
    })]),
  });
  return {
    getCurrentBlockNumber: async () => PINNED_HEIGHT,
    getBlock: async blockNumber => {
      if (blockNumber === BURN_HEIGHT) {
        return { number: blockNumber, hash: `0x${BURN_BLOCK_HASH}` };
      }
      if (blockNumber === PINNED_HEIGHT) {
        return { number: blockNumber, hash: `0x${PIN_BLOCK_HASH}` };
      }
      return null;
    },
    scanForPegOuts: async (fromBlock, toBlock) =>
      fromBlock <= BURN_HEIGHT && BURN_HEIGHT <= toBlock ? [event] : [],
    getTransactionReceipt: async transactionHash =>
      transactionHash.toLowerCase() === `0x${TRANSACTION_HASH}`
        ? receipt
        : null,
    getTotalSERGSupplyAtBlockHash: async blockHashHex => {
      if (blockHashHex !== PIN_BLOCK_HASH) throw new Error('unexpected pin');
      return 5_000_000_000n;
    },
    getRuntimeIdentityAtBlockHash: async blockHashHex => {
      if (blockHashHex !== PIN_BLOCK_HASH) throw new Error('unexpected pin');
      return {
        chainId: '31337',
        bridgeCodeHashHex: BRIDGE_CODE_HASH,
        sergAddress: SERG,
        sergCodeHashHex: SERG_CODE_HASH,
        sergOwnerAddress: SERG_OWNER,
      };
    },
  };
}

function sources(identityOffset = 0) {
  const digest = (value: number) =>
    value.toString(16).padStart(2, '0').repeat(32);
  return createFrontierBackingReadAgreementSources({
    primaryClient: client(),
    primaryRpcUrl: `http://127.0.0.1:${9945 + identityOffset}`,
    primaryNodeIdentityDigestHex: digest(0x10 + identityOffset),
    primaryAdministrationIdentityDigestHex: digest(0x20 + identityOffset),
    witnessClient: client(),
    witnessRpcUrl: `http://127.0.0.1:${9955 + identityOffset}`,
    witnessNodeIdentityDigestHex: digest(0x30 + identityOffset),
    witnessAdministrationIdentityDigestHex: digest(0x40 + identityOffset),
    expectedChainId: '31337',
    expectedBridgeAddress: BRIDGE,
    expectedBridgeCodeHashHex: BRIDGE_CODE_HASH,
    expectedSergAddress: SERG,
    expectedSergCodeHashHex: SERG_CODE_HASH,
  });
}

describe('substrate federated database-loss inventory projection', () => {
  it('projects the exact process-provenant dual-source snapshot', async () => {
    const pair = sources();
    const snapshot = await observeFrontierBackingReadAgreement({
      sources: pair,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    });

    const observation =
      projectSubstrateFederatedDatabaseLossInventoryObservationV1({
        sources: pair,
        snapshot,
      });

    expect(observation).toEqual({
      scanFromHeight: 0,
      pinnedHeight: PINNED_HEIGHT,
      pinnedBlockHashHex: PIN_BLOCK_HASH,
      entries: [{
        burnIdHex: deriveTrustlessBurnIdHex({
          sidechainIdHex: SIDECHAIN_ID,
          sidechainTxHashHex: TRANSACTION_HASH,
          eventIndex: LOG_INDEX,
        }),
        sidechainIdHex: SIDECHAIN_ID,
        sidechainTransactionHashHex: TRANSACTION_HASH,
        sidechainBlockHashHex: BURN_BLOCK_HASH,
        sidechainLogIndex: LOG_INDEX,
        sidechainBurnHeight: BURN_HEIGHT,
        amountNanoErg: AMOUNT,
        ergoRecipientAddress: RECIPIENT,
        user: USER.toLowerCase(),
      }],
    });
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation.entries)).toBe(true);
    expect(Object.isFrozen(observation.entries[0])).toBe(true);
  });

  it('rejects copied snapshots and snapshots from another source pair', async () => {
    const pair = sources();
    const snapshot = await observeFrontierBackingReadAgreement({
      sources: pair,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    });

    expect(() => projectSubstrateFederatedDatabaseLossInventoryObservationV1({
      sources: pair,
      snapshot: { ...snapshot },
    })).toThrow(/provenance/i);
    expect(() => projectSubstrateFederatedDatabaseLossInventoryObservationV1({
      sources: sources(1),
      snapshot,
    })).toThrow(/provenance/i);
  });
});
