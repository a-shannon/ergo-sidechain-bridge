/**
 * Spike 5: Frontier PegOut Event Extraction
 * =========================================
 *
 * Validates the PegOut extraction path for the Frontier sidechain:
 * - PegOut is an EVM log in Frontier receipts, not a native Substrate pallet event.
 * - Successful receipts (status=1) are accepted.
 * - Reverted receipts (status=0) are rejected even if a malformed fixture contains
 *   a matching PegOut-looking log.
 * - No RPC, signer, deployment, mint, approval, peg-out, or broadcast capability
 *   is present. Runtime behavior is covered by separate reviewed paths.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ethers } from 'ethers';

const BRIDGE_ABI = [
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
] as const;

const PEG_OUT_EVENT = 'PegOut(address,uint256,bytes)';
const PEG_OUT_TOPIC = ethers.id(PEG_OUT_EVENT);
const bridgeIface = new ethers.Interface(BRIDGE_ABI);

interface ExtractedPegOut {
  user: string;
  amount: bigint;
  ergoRecipientPubKey: string;
  sidechainTxHash: string;
  sidechainBlockNumber: number;
  blockHash: string;
  logIndex: number;
}

interface ReceiptLike {
  status: number | string | bigint | null | undefined;
  transactionHash: string;
  blockNumber: number | string | bigint;
  blockHash: string;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
    index?: number;
    logIndex?: number;
    transactionHash?: string;
    blockNumber?: number | string | bigint;
    blockHash?: string;
  }>;
}

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

function normalizeHex(value: string): string {
  return value.toLowerCase();
}

function receiptSucceeded(status: ReceiptLike['status']): boolean {
  if (status === null || status === undefined) return false;
  if (typeof status === 'bigint') return status === 1n;
  if (typeof status === 'number') return status === 1;
  const normalized = status.toLowerCase();
  return normalized === '0x1' || normalized === '1';
}

function toNumber(value: number | string | bigint): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return value.startsWith('0x') ? Number(BigInt(value)) : Number(value);
}

function extractPegOutsFromReceipt(receipt: ReceiptLike, bridgeAddress: string): ExtractedPegOut[] {
  if (!receiptSucceeded(receipt.status)) return [];

  const target = normalizeHex(bridgeAddress);
  const out: ExtractedPegOut[] = [];

  for (const log of receipt.logs) {
    if (normalizeHex(log.address) !== target) continue;
    if (normalizeHex(log.topics[0] ?? '') !== normalizeHex(PEG_OUT_TOPIC)) continue;

    const parsed = bridgeIface.parseLog({
      topics: log.topics,
      data: log.data,
    });
    if (!parsed || parsed.name !== 'PegOut') continue;

    out.push({
      user: parsed.args[0] as string,
      amount: parsed.args[1] as bigint,
      ergoRecipientPubKey: parsed.args[2] as string,
      sidechainTxHash: log.transactionHash ?? receipt.transactionHash,
      sidechainBlockNumber: toNumber(log.blockNumber ?? receipt.blockNumber),
      blockHash: log.blockHash ?? receipt.blockHash,
      logIndex: log.logIndex ?? log.index ?? 0,
    });
  }

  return out;
}

function buildPegOutLog(bridgeAddress: string, user: string, amount: bigint, ergoRecipient: string) {
  const encoded = bridgeIface.encodeEventLog(
    bridgeIface.getEvent('PegOut')!,
    [user, amount, ergoRecipient],
  );

  return {
    address: bridgeAddress,
    topics: [...encoded.topics],
    data: encoded.data,
    transactionHash: '0x' + '11'.repeat(32),
    blockNumber: 1234,
    blockHash: '0x' + '22'.repeat(32),
    logIndex: 7,
  };
}

function staticRuntimeChecks(): Check[] {
  const runtimePath = resolve(process.cwd(), '../substrate-node/template/runtime/src/lib.rs');
  const source = readFileSync(runtimePath, 'utf-8');
  return [
    {
      name: 'Runtime exposes Frontier current_receipts',
      pass: source.includes('fn current_receipts()') &&
        source.includes('pallet_ethereum::CurrentReceipts::<Runtime>::get()'),
      detail: 'EthereumRuntimeRPCApi reads pallet_ethereum::CurrentReceipts.',
    },
    {
      name: 'Runtime exposes Frontier transaction statuses',
      pass: source.includes('fn current_transaction_statuses()') &&
        source.includes('pallet_ethereum::CurrentTransactionStatuses::<Runtime>::get()'),
      detail: 'Receipt status is available through Frontier transaction statuses.',
    },
    {
      name: 'Runtime filters Ethereum extrinsics only',
      pass: source.includes('RuntimeCall::Ethereum(transact { transaction }) => Some(transaction)'),
      detail: 'Frontier RPC maps EVM transactions from pallet_ethereum::Call::transact.',
    },
  ];
}

function syntheticChecks(): Check[] {
  const bridgeAddress = '0x970951a12F975E6762482ACA81E57D5A2A4e73F4';
  const user = '0xf24FF3a9CF04c71Dbc94D0b566f7A27B94566cac';
  const amount = 45_000_000n;
  const ergoRecipient = '0x02' + 'ab'.repeat(32);
  const pegOutLog = buildPegOutLog(bridgeAddress, user, amount, ergoRecipient);

  const okReceipt: ReceiptLike = {
    status: 1,
    transactionHash: pegOutLog.transactionHash,
    blockNumber: pegOutLog.blockNumber,
    blockHash: pegOutLog.blockHash,
    logs: [pegOutLog],
  };

  const wrongAddressReceipt: ReceiptLike = {
    ...okReceipt,
    logs: [{ ...pegOutLog, address: '0x000000000000000000000000000000000000dEaD' }],
  };

  const revertedReceiptWithFakeLog: ReceiptLike = {
    ...okReceipt,
    status: 0,
    logs: [pegOutLog],
  };

  const extracted = extractPegOutsFromReceipt(okReceipt, bridgeAddress);
  const wrongAddress = extractPegOutsFromReceipt(wrongAddressReceipt, bridgeAddress);
  const reverted = extractPegOutsFromReceipt(revertedReceiptWithFakeLog, bridgeAddress);

  return [
    {
      name: 'Successful receipt extracts PegOut',
      pass: extracted.length === 1 &&
        normalizeHex(extracted[0].user) === normalizeHex(user) &&
        extracted[0].amount === amount &&
        normalizeHex(extracted[0].ergoRecipientPubKey) === normalizeHex(ergoRecipient) &&
        extracted[0].sidechainBlockNumber === 1234 &&
        extracted[0].logIndex === 7,
      detail: extracted.length === 1
        ? `tx=${extracted[0].sidechainTxHash.slice(0, 18)} block=${extracted[0].sidechainBlockNumber}`
        : `expected 1 event, got ${extracted.length}`,
    },
    {
      name: 'Wrong bridge address ignored',
      pass: wrongAddress.length === 0,
      detail: `events=${wrongAddress.length}`,
    },
    {
      name: 'Reverted receipt ignored even with fake PegOut log',
      pass: reverted.length === 0,
      detail: `events=${reverted.length}`,
    },
    {
      name: 'PegOut topic matches Solidity ABI',
      pass: PEG_OUT_TOPIC === bridgeIface.getEvent('PegOut')!.topicHash,
      detail: PEG_OUT_TOPIC,
    },
  ];
}

function printChecks(title: string, checks: Check[]) {
  console.log(`\n${title}`);
  for (const check of checks) {
    console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name} — ${check.detail}`);
  }
}

async function main() {
  console.log('Spike 5: Frontier PegOut Event Extraction');
  console.log(`PegOut topic: ${PEG_OUT_TOPIC}`);

  const runtime = staticRuntimeChecks();
  const synthetic = syntheticChecks();

  printChecks('Static Frontier/runtime checks', runtime);
  printChecks('Synthetic receipt extraction checks', synthetic);

  const all = [...runtime, ...synthetic];
  const failed = all.filter(x => !x.pass);

  console.log('\nSpike 5 summary');
  if (failed.length > 0) {
    for (const check of failed) {
      console.log(`FAIL ${check.name}: ${check.detail}`);
    }
    throw new Error(`${failed.length} Spike 5 check(s) failed`);
  }

  console.log('PASS: PegOut extraction is receipt-log based, status-gated, and deterministic.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
