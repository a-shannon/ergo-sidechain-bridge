/**
 * Proof Object Inspector — Phase 011b
 * =====================================
 * Prints a human-readable breakdown of every cryptographic proof object
 * used by the Ergo sidechain bridge. Designed for EVM developers who
 * understand calldata and Merkle proofs but not Ergo context extensions.
 *
 * Usage:
 *   npm run showcase:proofs
 *   npm run showcase:proofs -- --out ../evidence/benchmarks/artifacts/<report.md>
 */

import blakejs from 'blakejs';
import {
  packClaimCore,
  buildBatchDupExtension,
  buildBatchUnlockExtension,
} from '../aggregate-settlement-builder.js';
import {
  buildSpvTrackerGetProof,
  buildSpvTrackerInsertProof,
  deriveSpvTrackerKey,
  encodeSpvTrackerValue,
  getEmptySpvTrackerDigest,
  getSpvTrackerDigest,
  SPV_TRACKER_DOMAIN,
  SPV_TRACKER_KEY_LENGTH,
  SPV_TRACKER_VALUE_LENGTH,
  type SpvTrackerHistoryEntry,
} from '../spv-tracker.js';
import { insertLockRecordsBatch, getEmptyDigest } from '../avl-bridge.js';
import { encodeCollByteRegister, encodeIntRegister } from '../ergo-helpers.js';
import {
  commandResultSection,
  markdownTableEscape,
  parseShowcaseOutputArgs,
  type ShowcaseOutputArgs,
  writeShowcaseReport,
} from '../showcase-evidence-report.js';

// ── Helpers ────────────────────────────────────────────────────────────

function b256(d: Buffer): Buffer { return Buffer.from(blakejs.blake2b(d, undefined, 32)); }
function hexSlice(hex: string, from: number, len: number): string {
  return hex.slice(from * 2, (from + len) * 2);
}

const SIDECHAIN_ID = Buffer.alloc(32, 0x11).toString('hex');
const PAYOUT = 10_000_000n;
const ANCHOR_H = 500_000;
const RECIP = '0008cd' + '02' + 'a'.repeat(64);
const BURN_DOMAIN = Buffer.from('E2S_BURN_V1', 'ascii');
const SPV_D = Buffer.from(SPV_TRACKER_DOMAIN, 'ascii');

// ── Generate sample data ───────────────────────────────────────────────

const burnTxId = b256(Buffer.from('showcase-burn-0'));
const scHeight = 1000;
const scHeaderHash = b256(Buffer.from('showcase-header-0'));
const recipBuf = Buffer.from(RECIP, 'hex');
const amountBuf = Buffer.alloc(8); amountBuf.writeBigUInt64BE(PAYOUT);
const eventRoot = b256(Buffer.concat([BURN_DOMAIN, burnTxId, recipBuf, amountBuf]));

const sidBuf = Buffer.from(SIDECHAIN_ID, 'hex');
const hBuf = Buffer.alloc(8); hBuf.writeBigUInt64BE(BigInt(scHeight));
const trackerKey = b256(Buffer.concat([SPV_D, sidBuf, hBuf, scHeaderHash]));
const anchorBuf = Buffer.alloc(4); anchorBuf.writeUInt32BE(ANCHOR_H);
const trackerValue = Buffer.concat([eventRoot, anchorBuf]);

// ── Build proofs ───────────────────────────────────────────────────────

const history: SpvTrackerHistoryEntry[] = [
  { key: trackerKey.toString('hex'), value: trackerValue.toString('hex') },
];

const trackerProof = buildSpvTrackerGetProof(history, {
  sidechainIdHex: SIDECHAIN_ID,
  sidechainHeight: scHeight,
  sidechainHeaderHashHex: scHeaderHash.toString('hex'),
});

const dupProofs = insertLockRecordsBatch([], [burnTxId.toString('hex')]);
const claimCore = packClaimCore(
  trackerKey.toString('hex'), burnTxId.toString('hex'),
  PAYOUT, RECIP, 0,
);

// ── Print functions ────────────────────────────────────────────────────

function section(title: string) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(72));
}

function field(name: string, value: string, size?: string) {
  const sizeStr = size ? ` (${size})` : '';
  console.log(`  ${name.padEnd(28)} ${value.slice(0, 40)}${value.length > 40 ? '...' : ''}${sizeStr}`);
}

function explain(text: string) {
  console.log(`  → ${text}`);
}

// ── Main ───────────────────────────────────────────────────────────────

function proofRow(object: string, size: string, purpose: string): string {
  return [object, size, purpose].map(markdownTableEscape).join(' | ');
}

function formatProofObjectsEvidenceReport(args: ShowcaseOutputArgs): string {
  const lookupProof = dupProofs.lookup_proofs_hex[0];
  const insertProof = dupProofs.insert_proof_hex;
  return [
    '# Completed Offline Proof Objects Output',
    '',
    'This report records deterministic offline proof-object inspection command output evidence.',
    'It performs no node calls, signing, broadcast, local database access, runtime-state reads, or deployment-state reads.',
    '',
    ...commandResultSection('npm run showcase:proofs', args),
    '',
    '## Proof Object Output',
    '',
    '| Object | Size | Purpose |',
    '|---|---:|---|',
    `| ${proofRow('Tracker key', '32 B', 'Sidechain block ID')} |`,
    `| ${proofRow('Tracker value', '36 B', 'Event root plus anchor')} |`,
    `| ${proofRow('Tracker get proof', `${trackerProof.getProofHex.length / 2} B`, 'Membership proof')} |`,
    `| ${proofRow('DUP lookup proof', `${lookupProof.length / 2} B`, 'Non-membership proof')} |`,
    `| ${proofRow('DUP insert proof', `${insertProof.length / 2} B`, 'State transition proof')} |`,
    `| ${proofRow('AVL digest', '33 B', 'Committed tree root')} |`,
    `| ${proofRow('Claim core', `${claimCore.length} B`, 'Packed claim struct')} |`,
    `| ${proofRow('Event root', `${eventRoot.length} B`, 'Burn commitment hash')} |`,
    '',
    '## Boundary',
    '',
    '- This is offline proof-object inspection evidence only.',
    '- This is not live benchmark evidence.',
    '- This does not authorize trustless burn completion, production throughput, mainnet capacity, live settlement, or full parallel L1 settlement claims.',
  ].join('\n');
}

function main() {
  const args = parseShowcaseOutputArgs(
    process.argv.slice(2),
    'npm run showcase:proofs',
    'Builds deterministic offline proof-object inspection output.',
  );
  console.log('═'.repeat(72));
  console.log('  Ergo Sidechain Bridge — Proof Object Inspector');
  console.log('  For EVM developers: each object below maps to');
  console.log('  calldata / proof data you would pass to a Solidity verifier.');
  console.log('═'.repeat(72));

  // 1. Tracker Key
  section('1. SPV Tracker Key');
  field('Domain prefix', SPV_TRACKER_DOMAIN);
  field('Sidechain ID', SIDECHAIN_ID, '32 bytes');
  field('Sidechain height', String(scHeight), '8 bytes BE');
  field('Sidechain header hash', scHeaderHash.toString('hex'), '32 bytes');
  field('Derived tracker key', trackerKey.toString('hex'), `${SPV_TRACKER_KEY_LENGTH} bytes`);
  explain('EVM analogy: keccak256(abi.encodePacked(domain, chainId, height, blockHash))');
  explain('This is the key used to look up or insert a sidechain block entry in the tracker AVL tree.');

  // 2. Tracker Value
  section('2. SPV Tracker Value');
  field('Bridge event root', eventRoot.toString('hex'), '32 bytes');
  field('Ergo anchor height', String(ANCHOR_H), '4 bytes BE');
  field('Packed tracker value', trackerValue.toString('hex'), `${SPV_TRACKER_VALUE_LENGTH} bytes`);
  explain('EVM analogy: abi.encodePacked(merkleRoot, l1BlockNumber)');
  explain('The event root commits to the burn details; the anchor height proves the Ergo block that validated it.');

  // 3. Event Root Derivation
  section('3. Bridge Event Root (burn commitment)');
  field('Burn domain', 'E2S_BURN_V1', 'ASCII prefix');
  field('Burn TX ID (sidechain)', burnTxId.toString('hex'), '32 bytes');
  field('Recipient ErgoTree', RECIP, '36 bytes');
  field('Amount (nanoERG)', String(PAYOUT), '8 bytes BE');
  field('Derived event root', eventRoot.toString('hex'), '32 bytes');
  explain('EVM analogy: keccak256(abi.encodePacked("BURN_V1", txHash, recipient, amount))');
  explain('This proves the settlement pays the right user the right amount for the right burn.');

  // 4. AVL Digest
  section('4. AVL Tree Digest');
  field('DUP empty digest', getEmptyDigest(), '33 bytes');
  field('DUP after 1 insert', dupProofs.new_digest_hex, '33 bytes');
  field('Tracker digest', trackerProof.digestHex, '33 bytes');
  explain('EVM analogy: mapping storage root in a Merkle Patricia trie.');
  explain('The digest commits to the entire tree. 33 bytes = 32-byte hash + 1-byte tree height.');

  // 5. DUP Lookup Proof
  section('5. DUP Lookup Proof (non-membership)');
  const lp = dupProofs.lookup_proofs_hex[0];
  field('Burn TX ID', burnTxId.toString('hex'), '32 bytes');
  field('Lookup proof', lp, `${lp.length / 2} bytes`);
  explain('EVM analogy: Merkle non-inclusion proof for a mapping key.');
  explain('Proves the burn TX ID has NOT been processed yet. Prevents double-unlock.');

  // 6. DUP Insert Proof
  section('6. DUP Insert Proof');
  const ip = dupProofs.insert_proof_hex;
  field('Insert proof', ip, `${ip.length / 2} bytes`);
  field('New digest after insert', dupProofs.new_digest_hex, '33 bytes');
  explain('EVM analogy: state transition proof for updating a mapping.');
  explain('Proves the burn TX ID was correctly inserted into the replay-protection tree.');

  // 7. Tracker Get Proof
  section('7. SPV Tracker Get Proof (membership)');
  field('Tracker key', trackerProof.keyHex, '32 bytes');
  field('Tracker value', trackerProof.valueHex, '36 bytes');
  field('Get proof', trackerProof.getProofHex, `${trackerProof.getProofHex.length / 2} bytes`);
  explain('EVM analogy: Merkle inclusion proof for a state root entry.');
  explain('Proves the sidechain block entry exists in the tracker tree with the expected event root.');

  // 8. Packed Claim Core
  section('8. Packed Claim Core (batch settlement)');
  field('Total size', '', `${claimCore.length} bytes`);
  field('  [0..32)  trackerKey', hexSlice(claimCore.toString('hex'), 0, 32), '32 bytes');
  field('  [32..64) burnTxId', hexSlice(claimCore.toString('hex'), 32, 32), '32 bytes');
  field('  [64..72) amount', hexSlice(claimCore.toString('hex'), 64, 8), '8 bytes BE');
  field('  [72..108) recipientTree', hexSlice(claimCore.toString('hex'), 72, 36), '36 bytes');
  field('  [108]    treeSelector', hexSlice(claimCore.toString('hex'), 108, 1), '1 byte');
  explain('EVM analogy: abi.encodePacked(key, txHash, amount, recipient, selector)');
  explain('109 bytes per claim, packed into Var slots for the batch unlock contract.');

  // 9. Context Extension Mapping
  section('9. Context Extension Var Layout → EVM Calldata Mapping');
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │ Contract Input       │ Var Key │ Content    │ EVM Analogy   │');
  console.log('  ├──────────────────────┼─────────┼────────────┼───────────────┤');
  console.log('  │ SPVTracker (INPUT 0) │ 0       │ key        │ proof.key     │');
  console.log('  │                      │ 1       │ value      │ proof.value   │');
  console.log('  │                      │ 2       │ insertPrf  │ proof.siblings│');
  console.log('  │                      │ 3       │ scHeight   │ proof.height  │');
  console.log('  │ Batch DUP (INPUT 1)  │ 0       │ count      │ batch.length  │');
  console.log('  │                      │ 1       │ insertPrf  │ proof.root    │');
  console.log('  │                      │ 2..21   │ burnTxIds  │ batch.ids[]   │');
  console.log('  │                      │ 22..41  │ lookupPrfs │ batch.proofs[]│');
  console.log('  │ Batch Unlock (IN 2)  │ 0       │ count      │ batch.length  │');
  console.log('  │                      │ 1       │ dupInsert  │ dup.proof     │');
  console.log('  │                      │ 2..11   │ claimCores │ claims[]      │');
  console.log('  │                      │ 12..21  │ trackerPrf │ tracker.prfs[]│');
  console.log('  │                      │ 22..31  │ dupLookups │ dup.proofs[]  │');
  console.log('  └──────────────────────┴─────────┴────────────┴───────────────┘');
  explain('Each Var is a Sigma-encoded Coll[Byte] or Int.');
  explain('In EVM terms: this is the calldata struct layout for each contract input.');

  // 10. Summary
  section('10. Proof Size Summary');
  console.log('');
  console.log('  ┌───────────────────────┬───────────┬─────────────────────────┐');
  console.log('  │ Object                │ Size      │ Purpose                 │');
  console.log('  ├───────────────────────┼───────────┼─────────────────────────┤');
  console.log(`  │ Tracker key           │ 32 B      │ Sidechain block ID      │`);
  console.log(`  │ Tracker value         │ 36 B      │ Event root + anchor     │`);
  console.log(`  │ Tracker get proof     │ ${String(trackerProof.getProofHex.length / 2).padEnd(5)} B  │ Membership proof        │`);
  console.log(`  │ DUP lookup proof      │ ${String(lp.length / 2).padEnd(5)} B  │ Non-membership proof    │`);
  console.log(`  │ DUP insert proof      │ ${String(ip.length / 2).padEnd(5)} B  │ State transition proof  │`);
  console.log(`  │ AVL digest            │ 33 B      │ Committed tree root     │`);
  console.log(`  │ Claim core            │ 109 B     │ Packed claim struct     │`);
  console.log(`  │ Event root            │ 32 B      │ Burn commitment hash    │`);
  console.log('  └───────────────────────┴───────────┴─────────────────────────┘');
  console.log('');
  if (args.out) writeShowcaseReport(args.out, formatProofObjectsEvidenceReport(args));
}

main();
