import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeSigmaAvlTreeDigestHex,
  decodeSigmaCollByteHex,
  decodeSigmaIntHex,
  decodeSigmaLongHex,
  dupEmptyDigestHex,
  reserveEmptyDigestHex,
  sigmaAvlTreeHex,
  sigmaCollByteHex,
  sigmaIntHex,
  sigmaLongHex,
  trackerEmptyDigestHex,
} from '../src/core/avl.js';
import {
  AUTH_MODE_EIP0045_STARK,
  AUTH_MODE_FEDERATED,
  DOMAIN_BURN_LEAF,
  DOMAIN_BURN_NODE,
  DOMAIN_EIP0045_STATEMENT,
  TRACKER_VALUE_LENGTH,
  ZERO_32_HEX,
  blake2b256,
  buildBurnMerkleTree,
  bytesToHex,
  concatBytes,
  decodePegInIntentV2,
  decodeTrackerGovernanceR9,
  decodeTrackerValueV1,
  encodeBurnLeafV1,
  encodeEip0045StatementV1,
  encodePegInIntentV2,
  encodeStarkPayloadV1,
  encodeTrackerGovernanceR9,
  encodeTrackerValueV1,
  hexToBytes,
  normalizeRecipientErgoTreeHex,
  p2pkErgoTreeFromPubKeyHex,
} from '../src/core/codecs.js';
import { loadSolidityArtifact } from '../src/clients/evm-client.js';
import { compileBridgeV1Family } from '../src/core/contracts.js';
import { makeSyntheticErgoBox, serializeBoxJsonToHex } from '../src/crypto/signer.js';
import { BridgeStateDb } from '../src/state/db.js';

const GEN_PK = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

describe('Bridge V1 Codecs, Odd-Width Merkle, Sigma Serialization, Solidity Closure & SQLite Store', () => {
  it('round-trips 229-byte PegInIntentV2, 81-byte TrackerGovernanceR9, and 370-byte TrackerValueV1', () => {
    const intent = {
      sourceNetworkIdHex: '11'.repeat(32),
      sidechainIdHex: '22'.repeat(32),
      bridgeAddressHex: '33'.repeat(20),
      tokenAddressHex: '44'.repeat(20),
      familyIdHex: '55'.repeat(32),
      reserveNftIdHex: '66'.repeat(32),
      amountNanoErg: 123_456_789n,
      evmRecipientHex: `0x${'ab'.repeat(20)}`,
    };
    const encodedIntent = encodePegInIntentV2(intent);
    expect(encodedIntent.length).toBe(229);
    const decodedIntent = decodePegInIntentV2(encodedIntent);
    expect(decodedIntent.amountNanoErg).toBe(intent.amountNanoErg);
    expect(decodedIntent.evmRecipientHex).toBe(intent.evmRecipientHex);
    expect(decodedIntent.familyIdHex).toBe(intent.familyIdHex);

    const gov = {
      epoch: 3n,
      pendingMode: 2 as const,
      pendingTargetScriptHashHex: '77'.repeat(32),
      pendingActivatesAtHeight: 1_234_567n,
      pendingTrustAnchorDigestHex: '88'.repeat(32),
    };
    const encodedGov = encodeTrackerGovernanceR9(gov);
    expect(encodedGov.length).toBe(81);
    expect(decodeTrackerGovernanceR9(encodedGov)).toEqual(gov);

    for (const authMode of [AUTH_MODE_FEDERATED, AUTH_MODE_EIP0045_STARK] as const) {
      const val = {
        authMode,
        familyIdHex: '55'.repeat(32),
        sidechainIdHex: '22'.repeat(32),
        sourceHeight: 99n,
        sourceBlockHashHex: 'a1'.repeat(32),
        executionBlockHashHex: 'a2'.repeat(32),
        bridgeEventRootHex: 'a3'.repeat(32),
        burnCount: 4,
        statementIdHex: 'a4'.repeat(32),
        admissionHeight: 500_000n,
        authorityEpoch: authMode === 1 ? 2n : 0n,
        authorityDigestHex: 'a5'.repeat(32),
        trustAnchorDigestHex: authMode === 2 ? 'a6'.repeat(32) : ZERO_32_HEX,
        sourceNetworkIdHex: '11'.repeat(32),
      };
      const encVal = encodeTrackerValueV1(val);
      expect(encVal.length).toBe(TRACKER_VALUE_LENGTH);
      expect(decodeTrackerValueV1(encVal)).toEqual(val);
    }
  });

  it('verifies odd-width Blake2b Merkle inclusion for leaf counts 1, 2, 3, 5, 7, 8, 9, and 17', () => {
    const p2pk = p2pkErgoTreeFromPubKeyHex(GEN_PK);
    expect(normalizeRecipientErgoTreeHex(GEN_PK)).toBe(p2pk);
    expect(normalizeRecipientErgoTreeHex(p2pk)).toBe(p2pk);

    for (const count of [1, 2, 3, 5, 7, 8, 9, 17]) {
      const leaves = Array.from({ length: count }, (_, idx) =>
        encodeBurnLeafV1({
          sidechainIdHex: '22'.repeat(32),
          executionBlockHashHex: '33'.repeat(32),
          sidechainTxHashHex: (idx + 1).toString(16).padStart(2, '0').repeat(32),
          eventIndex: idx,
          recipientErgoTreeHex: p2pk,
          amountNanoErg: BigInt(10_000_000 + idx),
        }).encodedLeaf,
      );
      const tree = buildBurnMerkleTree(leaves);
      expect(tree.leafCount).toBe(count);

      for (let i = 0; i < count; i++) {
        const steps = tree.getProof(i);
        let cur = blake2b256(concatBytes(DOMAIN_BURN_LEAF, leaves[i]));
        for (const step of steps) {
          cur =
            step.side === 0
              ? blake2b256(concatBytes(DOMAIN_BURN_NODE, step.siblingHash, cur))
              : blake2b256(concatBytes(DOMAIN_BURN_NODE, cur, step.siblingHash));
        }
        expect(bytesToHex(cur)).toBe(tree.rootHex);
      }
    }
  });

  it('round-trips Sigma Coll[Byte], Int, Long, and SAvlTree register encodings', () => {
    const sample = hexToBytes('deadbeef01020304');
    expect(bytesToHex(decodeSigmaCollByteHex(sigmaCollByteHex(sample)))).toBe('deadbeef01020304');
    for (const n of [0, 1, 42, 123_456, 2_000_000, 0x7fffffff, -0x80000000]) {
      expect(decodeSigmaIntHex(sigmaIntHex(n))).toBe(n);
    }
    for (const n of [0n, 1n, 1_000_000_000n, 999_999_999_999n, 0x7fffffffffffffffn, -0x8000000000000000n]) {
      expect(decodeSigmaLongHex(sigmaLongHex(n))).toBe(n);
    }
    // Reject VLQ final-byte uint32 and uint64 overflow
    expect(() => decodeSigmaIntHex('04ffffffff10')).toThrow(/overflow/i);
    expect(() => decodeSigmaLongHex('05ffffffffffffffffff02')).toThrow(/overflow/i);
    expect(decodeSigmaAvlTreeDigestHex(sigmaAvlTreeHex(dupEmptyDigestHex(), 1))).toBe(
      dupEmptyDigestHex(),
    );
    expect(decodeSigmaAvlTreeDigestHex(sigmaAvlTreeHex(reserveEmptyDigestHex(), 32))).toBe(
      reserveEmptyDigestHex(),
    );
    expect(decodeSigmaAvlTreeDigestHex(sigmaAvlTreeHex(trackerEmptyDigestHex(), 370))).toBe(
      trackerEmptyDigestHex(),
    );
  });

  it('encodes EIP-0045 ErgoStatementV1 and BridgeStarkPayloadV1 deterministically', () => {
    const payload = encodeStarkPayloadV1({
      trackerNftIdHex: '11'.repeat(32),
      familyIdHex: '22'.repeat(32),
      sourceNetworkIdHex: '33'.repeat(32),
      sidechainIdHex: '44'.repeat(32),
      sourceHeight: 42n,
      sourceBlockHashHex: '55'.repeat(32),
      executionBlockHashHex: '66'.repeat(32),
      bridgeEventRootHex: '77'.repeat(32),
      burnCount: 3,
      trustAnchorDigestHex: '88'.repeat(32),
    });
    expect(payload.length).toBe(300);

    const stmt = encodeEip0045StatementV1({
      chainDomainIdHex: 'aa'.repeat(32),
      profileIdHex: '5649af920f3119ca06e8566d836d3c89de81af52ef3d140a0ad7012ca364d35c',
      programIdHex: 'bb'.repeat(32),
      selfContractIdHex: 'cc'.repeat(32),
      applicationPayload: payload,
    });
    // 26 (domain) + 1 (ver) + 4*32 (ids) + 4 (u32le len) + 300 (payload) = 459 bytes
    expect(stmt.length).toBe(459);
    expect(bytesToHex(stmt.slice(0, 26))).toBe(bytesToHex(DOMAIN_EIP0045_STATEMENT));
    expect(stmt[26]).toBe(1);
    // u32le(300) = 0x2c 0x01 0x00 0x00
    expect(Array.from(stmt.slice(155, 159))).toEqual([0x2c, 0x01, 0x00, 0x00]);
  });

  it('loads hardened V1 Solidity artifacts (SERG, ErgoBridge, BridgeCommitteeTimelock) and initializes SQLite WAL store cleanly', () => {
    const serg = loadSolidityArtifact('SERG');
    const bridge = loadSolidityArtifact('ErgoBridge');
    const timelock = loadSolidityArtifact('BridgeCommitteeTimelock');
    expect(serg.bytecode.startsWith('0x')).toBe(true);
    expect(bridge.bytecode.startsWith('0x')).toBe(true);
    expect(timelock.bytecode.startsWith('0x')).toBe(true);
    expect(serg.bytecode.length).toBeGreaterThan(200);
    expect(bridge.bytecode.length).toBeGreaterThan(200);
    expect(timelock.bytecode.length).toBeGreaterThan(200);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-v1-db-test-'));
    try {
      const db = new BridgeStateDb(path.join(tmpDir, 'state.db'));
      db.setMeta('test_key', 'test_val');
      expect(db.getMeta('test_key')).toBe('test_val');
      expect(db.getReserveAvlHistory()).toEqual([]);
      expect(db.getTrackerAvlHistory()).toEqual([]);
      expect(db.getDupHistoryBurnIds()).toEqual([]);
      db.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('preserves > 2^53 nanoERG box values without IEEE-754 precision loss [M-1] and enforces parameter safety [M-4]', () => {
    const bigVal = 9_007_199_254_740_993n; // 2^53 + 1
    const box = makeSyntheticErgoBox({
      txIdHex: '11'.repeat(32),
      index: 0,
      value: bigVal,
      ergoTreeHex: p2pkErgoTreeFromPubKeyHex(GEN_PK),
      creationHeight: 100,
    });
    expect(BigInt(box.value)).toBe(bigVal);
    expect(serializeBoxJsonToHex(box).length).toBeGreaterThan(20);

    // Parameter safety checks [M-4]
    const baseParams = {
      networkPrefix: 16 as const,
      sourceNetworkIdHex: '11'.repeat(32),
      sidechainIdHex: '22'.repeat(32),
      bridgeAddressHex: '33'.repeat(20),
      tokenAddressHex: '44'.repeat(20),
      trackerNftIdHex: '55'.repeat(32),
      dupNftIdHex: '66'.repeat(32),
      reserveNftIdHex: '77'.repeat(32),
      committeePubKeysHex: [GEN_PK],
      committeeThreshold: 1,
      committeeEpoch: 1n,
      escapeTimeoutBlocks: 100,
      minConfirmations: 10n,
      upgradeTimelockBlocks: 20n,
      maxAdmissionLagBlocks: 5n,
    };
    // Rejects zero/identity pubkey
    expect(() =>
      compileBridgeV1Family({ ...baseParams, committeePubKeysHex: ['00'.repeat(33)] }),
    ).toThrow(/prefix/);
    // Rejects duplicate committee pubkeys
    expect(() =>
      compileBridgeV1Family({ ...baseParams, committeePubKeysHex: [GEN_PK, GEN_PK] }),
    ).toThrow(/Duplicate/);
    // Rejects minConfirmations <= maxAdmissionLagBlocks
    expect(() =>
      compileBridgeV1Family({ ...baseParams, minConfirmations: 5n, maxAdmissionLagBlocks: 5n }),
    ).toThrow(/minConfirmations/);
    // Rejects duplicate NFT IDs
    expect(() =>
      compileBridgeV1Family({ ...baseParams, dupNftIdHex: baseParams.trackerNftIdHex }),
    ).toThrow(/distinct/);
  });
});
