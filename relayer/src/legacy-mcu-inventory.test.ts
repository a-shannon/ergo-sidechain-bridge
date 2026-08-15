import { readFileSync } from 'fs';

import { describe, expect, it, vi } from 'vitest';

import { encodeCollByteRegister, encodeLongRegister } from './ergo-helpers.js';
import {
  classifyLegacyMcuBox,
  collectLegacyMcuInventory,
  parseLegacyMcuAddresses,
  type LegacyMcuBoxLike,
  type LegacyMcuInventoryClient,
} from './legacy-mcu-inventory.js';

const ADDRESS_A = 'legacy-address-a';
const ADDRESS_B = 'legacy-address-b';
const BOX_ID = 'ab'.repeat(32);
const BURN_TX_ID = 'cd'.repeat(32);
const RECIPIENT_TREE = '0008cd' + '02' + '11'.repeat(32);
const LEGACY_ERGO_TREE = '10010100d17300';

function syntheticBox(overrides: Partial<LegacyMcuBoxLike> = {}): LegacyMcuBoxLike {
  return {
    boxId: BOX_ID,
    transactionId: 'ef'.repeat(32),
    creationHeight: 500,
    ergoTree: LEGACY_ERGO_TREE,
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(BURN_TX_ID, 'hex')),
      R5: encodeLongRegister(5_000_000),
      R6: encodeCollByteRegister(Buffer.from(RECIPIENT_TREE, 'hex')),
      R7: encodeLongRegister(1_234),
      R8: encodeLongRegister(500),
    },
    ...overrides,
  };
}

describe('legacy MCU inventory', () => {
  it('accepts repeatable and comma-separated explicit addresses', () => {
    expect(parseLegacyMcuAddresses([`${ADDRESS_A}, ${ADDRESS_B}`, ADDRESS_A]))
      .toEqual([ADDRESS_A, ADDRESS_B]);
    expect(() => parseLegacyMcuAddresses([])).toThrow(/explicit --address/);
    expect(() => parseLegacyMcuAddresses([`${ADDRESS_A},`])).toThrow(/empty address/);
  });

  it('parses the legacy register layout and applies the exact timeout boundary', () => {
    const before = classifyLegacyMcuBox(ADDRESS_A, 0, syntheticBox(), 10_499);
    const atBoundary = classifyLegacyMcuBox(ADDRESS_A, 0, syntheticBox(), 10_500);

    expect(before).toMatchObject({
      classification: 'quarantined',
      malformed: false,
      boxId: BOX_ID,
      ergoTreeHex: LEGACY_ERGO_TREE,
      burnTransactionId: BURN_TX_ID,
      amountNanoErg: '5000000',
      recipientErgoTreeHex: RECIPIENT_TREE,
      sidechainHeight: '1234',
      registerCreationHeight: '500',
      timeoutHeight: '10500',
      unsafeLegacyTimeoutReachable: false,
      errors: [],
    });
    expect(atBoundary.unsafeLegacyTimeoutReachable).toBe(true);
  });

  it('keeps malformed boxes visible with structured register errors', async () => {
    const malformed = syntheticBox({
      boxId: 'not-a-box-id',
      creationHeight: 501,
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.alloc(31, 0xaa)),
        R5: encodeCollByteRegister(Buffer.from('not-a-long')),
        R6: '0e04aabb',
        R7: encodeLongRegister(-1),
        R8: { renderedValue: '500' },
      },
    });
    const client: LegacyMcuInventoryClient = {
      getCurrentHeight: vi.fn(async () => 12_000),
      getUnspentBoxesByAddress: vi.fn(async () => [malformed, syntheticBox()]),
    };

    const report = await collectLegacyMcuInventory({
      addresses: [ADDRESS_A],
      client,
      generatedAt: '2026-07-10T00:00:00.000Z',
    });

    expect(report.boxes).toHaveLength(2);
    expect(report.summary).toMatchObject({
      boxesFound: 2,
      quarantinedBoxes: 2,
      malformedBoxes: 1,
    });
    expect(report.boxes[0].classification).toBe('quarantined');
    expect(report.boxes[0].malformed).toBe(true);
    expect(report.boxes[0].timeoutHeight).toBeNull();
    expect(report.boxes[0].unsafeLegacyTimeoutReachable).toBeNull();
    expect(report.boxes[0].errors.map(error => [error.field, error.code])).toEqual(expect.arrayContaining([
      ['boxId', 'invalid_box_id'],
      ['R4', 'invalid_byte_length'],
      ['R5', 'invalid_long_register'],
      ['R6', 'invalid_coll_byte_register'],
      ['R7', 'negative_sidechain_height'],
      ['R8', 'invalid_register_shape'],
    ]));
    expect(report.boundary).toMatchObject({
      receiptPresenceVerified: false,
      receiptPresenceStatement: 'Receipt presence is not verified.',
      migrationInferred: false,
      migrationStatement: 'Migration cannot be inferred from this inventory.',
      exhaustiveAddressSetVerified: false,
      networkIdentityVerified: false,
      cutoverClaimed: false,
      cutoverStatement:
        'Cutover readiness is not assessed without a reviewed network-bound legacy address manifest.',
      transactionOperationsPerformed: false,
    });
  });

  it('uses an explicit current height without reading node height and exposes query failures', async () => {
    const getCurrentHeight = vi.fn(async () => {
      throw new Error('must not be called');
    });
    const client: LegacyMcuInventoryClient = {
      getCurrentHeight,
      getUnspentBoxesByAddress: vi.fn(async address => {
        if (address === ADDRESS_B) throw new Error('unavailable');
        return [syntheticBox()];
      }),
    };

    const report = await collectLegacyMcuInventory({
      addresses: [ADDRESS_A, ADDRESS_B],
      client,
      currentHeight: 10_500,
      generatedAt: '2026-07-10T00:00:00.000Z',
    });

    expect(getCurrentHeight).not.toHaveBeenCalled();
    expect(report.addressQueriesComplete).toBe(false);
    expect(report.summary.addressQueryFailures).toBe(1);
    expect(report.boxes).toHaveLength(1);
    expect(report.addressQueries[1]).toMatchObject({
      address: ADDRESS_B,
      status: 'error',
      error: { code: 'unspent_box_query_failed' },
    });
  });

  it('does not convert successful explicit queries into an exhaustive cutover claim', async () => {
    const report = await collectLegacyMcuInventory({
      addresses: [ADDRESS_A],
      client: {
        getCurrentHeight: async () => 12_000,
        getUnspentBoxesByAddress: async () => [],
      },
      generatedAt: '2026-07-10T00:00:00.000Z',
    });

    expect(report.schemaVersion).toBe(2);
    expect(report.addressQueriesComplete).toBe(true);
    expect(report.summary.boxesFound).toBe(0);
    expect(report.boundary).toMatchObject({
      exhaustiveAddressSetVerified: false,
      networkIdentityVerified: false,
      cutoverClaimed: false,
    });
  });

  it('keeps the CLI on the read-only client and out of private or transaction helpers', () => {
    const source = readFileSync(new URL('./scripts/legacy-mcu-inventory.ts', import.meta.url), 'utf8');
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(source).toContain('new ErgoClient(args.nodeUrl, { readOnly: true })');
    expect(source).not.toMatch(/fleet-signer|StateTracker|deployed_state|dotenv|process\.env/);
    expect(source).not.toMatch(/submitTransaction|signAndSubmit|checkTransaction|buildTransaction/);
    expect(packageJson.scripts['inventory:legacy-mcu'])
      .toBe('tsx src/scripts/legacy-mcu-inventory.ts');
  });
});
