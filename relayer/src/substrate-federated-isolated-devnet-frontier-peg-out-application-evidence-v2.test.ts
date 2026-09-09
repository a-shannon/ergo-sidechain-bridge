import { readFileSync } from 'node:fs';
import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import { FRONTIER_PEG_OUT_TOPIC } from './frontier-bridge-event-root.js';
import { sha256CanonicalJson } from './strict-json.js';
import { buildTrustlessBurnCommitment, deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1 as TOKEN,
} from './substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  consumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV2 as consume,
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV2ConsumerConstruction as assertConstructed,
  type ConsumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV2Input as Input,
} from './substrate-federated-isolated-devnet-frontier-peg-out-application-evidence-v2.js';

const patches = {
  canonicalFrontierPatchBytes: readFileSync(new URL('../../sources/frontier/0001-bridge-runtime-commitment.patch', import.meta.url)),
  applicationEvidenceOverlayPatchBytes: readFileSync(new URL('../../sources/frontier/0002-federated-lab-peg-out-application-proof.patch', import.meta.url)),
  signedApplicationOverlayPatchBytes: readFileSync(new URL('../../sources/frontier/0003-federated-lab-signed-application-calls.patch', import.meta.url)),
};
const BRIDGE = '0x970951a12f975e6762482aca81e57d5a2a4e73f4';
const DEPLOYER = '0xf24ff3a9cf04c71dbc94d0b566f7a27b94566cac';
const PEG = 'bridge-lab-peg-out-';
const SIGNED = 'bridge-lab-signed-application-';
const DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_EVIDENCE_V2';
// Public curve points only; these fixtures neither sign nor execute transactions.
const POINTS = [
  '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  '0x0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
];
const hex = (byte: string, length = 32): string => `0x${byte.repeat(length)}`;
const word = (n: bigint): string => n.toString(16).padStart(64, '0');

function fixture(index = 0, amount = 10_000_000n): Input {
  const ownerAddressHex = hex(index ? '22' : '11', 20);
  const ergoRecipientPublicKeyHex = POINTS[index];
  const transactionHashes = { mint: hex(index ? '41' : '31'), approval: hex(index ? '42' : '32'), pegOut: hex(index ? '43' : '33') };
  const sidechainIdHex = hex('55');
  const blockHashHex = hex(index ? '67' : '66');
  const tree = `0x0008cd${ergoRecipientPublicKeyHex.slice(2)}`;
  const treeHash = `0x${Buffer.from(blakejs.blake2b(Buffer.from(tree.slice(2), 'hex'), undefined, 32)).toString('hex')}`;
  const burnIdHex = deriveTrustlessBurnIdHex({ sidechainIdHex, sidechainTxHashHex: transactionHashes.pegOut, eventIndex: 3 });
  const commitment = buildTrustlessBurnCommitment([{
    sidechainIdHex, sidechainBlockHashHex: blockHashHex, sidechainTxHashHex: transactionHashes.pegOut,
    eventIndex: 3, burnIdHex, recipientErgoTreeHashHex: treeHash, amountNanoErg: amount,
  }]);
  const markers: Record<string, string> = {
    'sidechain-id': sidechainIdHex, 'source-native-block-height': '7', 'source-native-block-hash': hex('77'),
    'execution-block-number': '7', 'execution-block-hash': blockHashHex,
    'bridge-address': BRIDGE, 'token-address': TOKEN, 'transaction-index': '1',
    'transaction-hash': transactionHashes.pegOut, 'receipt-status': '1', 'log-index': '3',
    topic0: FRONTIER_PEG_OUT_TOPIC, topic1: `0x${'00'.repeat(12)}${ownerAddressHex.slice(2)}`,
    data: `0x${word(amount)}${word(64n)}${word(33n)}${ergoRecipientPublicKeyHex.slice(2)}${'00'.repeat(31)}`,
    'bridge-event-root': `0x${commitment.bridgeEventRootHex}`, 'burn-leaf-count': '1',
    'burn-id': `0x${burnIdHex}`, 'burn-leaf-hash': `0x${commitment.leaves[0].leafHashHex}`,
    'net-amount-nano-erg': amount.toString(), 'recipient-ergo-tree': tree, 'recipient-ergo-tree-hash': treeHash,
    'supply-before': '15000000', 'supply-after': '5000000', 'escrow-after': '5000000',
  };
  return {
    ...patches,
    expected: { ownerAddressHex, ergoRecipientPublicKeyHex, transactionHashes },
    stdout: [...Object.entries(markers).map(([name, value]) => `${PEG}${name}=${value}`),
      `${SIGNED}format=1`, `${SIGNED}owner=${ownerAddressHex}`, `${SIGNED}mint-hash=${transactionHashes.mint}`,
      `${SIGNED}approval-hash=${transactionHashes.approval}`].join('\n'),
  };
}

function change(input: Input, name: string, value: string): Input {
  const prefix = name.startsWith(SIGNED) ? '' : PEG;
  const key = prefix + name;
  const lines = input.stdout.split('\n');
  const index = lines.findIndex(line => line.startsWith(`${key}=`));
  if (index < 0) throw new Error(`absent test marker ${key}`);
  lines[index] = `${key}=${value}`;
  return { ...input, stdout: lines.join('\n') };
}

function abi(input: Input, start: number, end: number, replacement: string): Input {
  const data = input.stdout.split('\n').find(line => line.startsWith(`${PEG}data=`))!.split('=')[1].slice(2);
  return change(input, 'data', `0x${data.slice(0, start * 2)}${replacement}${data.slice(end * 2)}`);
}

describe('signed application evidence V2', () => {
  it.each([0, 1])('accepts fully rebound public-only transcript %s', index => {
    const input = fixture(index);
    const receipt = consume(input);
    expect(receipt.schema).toBe('e2s.substrate-federated-isolated-devnet-frontier-peg-out-application-evidence.v2');
    expect(receipt.version).toBe(2);
    expect(receipt.application).toEqual({ bridgeAddressHex: BRIDGE, tokenAddressHex: TOKEN, ownerAddressHex: input.expected.ownerAddressHex });
    expect(receipt.signedApplication).toEqual({ format: 1, ergoRecipientPublicKeyHex: POINTS[index], transactionHashes: input.expected.transactionHashes });
    expect(receipt.source.signedApplicationOverlayPatchSha256).toBe('921d1488b78f8123b1772d20d88da00670140e70b7a1a763381e1158416250dd');
    expect(receipt.sourceNativeBlock).toEqual({ height: 7, hashHex: hex('77') });
    expect(receipt.execution).toMatchObject({ blockNumber: 7, transactionIndex: 1, eventIndex: 3, transactionHashHex: input.expected.transactionHashes.pegOut });
    expect(receipt.burn).toMatchObject({ burnLeafCount: 1, amountNanoErg: '10000000', recipientErgoTreeHex: `0x0008cd${POINTS[index].slice(2)}` });
    expect(receipt.burn.bridgeEventRootHex).toBe(receipt.burn.burnLeafHashHex);
    expect(receipt.conservation).toEqual({ supplyBeforeNanoErg: '15000000', supplyAfterNanoErg: '5000000', bridgeEscrowAfterNanoErg: '5000000', bridgeFeeNanoErg: '5000000' });
    for (const [key, value] of Object.entries(receipt.boundary)) expect(value).toBe(key === 'isolatedTestClientOnly');
    expect(Object.values(receipt.checks).every(value => value === true)).toBe(true);
    const { receiptDigestHex, ...body } = receipt;
    expect(receiptDigestHex).toBe(sha256CanonicalJson(body, DOMAIN));
    expect(receiptDigestHex).not.toBe(sha256CanonicalJson(body, DOMAIN.replace(/V2$/u, 'V1')));
    assertConstructed(receipt);
    const visit = (value: unknown): void => {
      if (value && typeof value === 'object') {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(visit);
      }
    };
    visit(receipt);
    expect(Object.isFrozen(input.expected.transactionHashes)).toBe(false);
    expect(() => assertConstructed({ ...receipt })).toThrow(/construction provenance/u);
    expect(() => assertConstructed(JSON.parse(JSON.stringify(receipt)))).toThrow(/construction provenance/u);
  });

  it('keeps nonzero native hash substitution non-authorizing and digest-bound', () => {
    const first = consume(fixture());
    const second = consume(change(fixture(), 'source-native-block-hash', hex('88')));
    expect(second.receiptDigestHex).not.toBe(first.receiptDigestHex);
    expect(second.boundary.callerSuppliedStdoutHasProcessProvenance).toBe(false);
  });

  it('accepts CRLF and unrelated test harness text', () => {
    const input = fixture();
    expect(consume({ ...input, stdout: `test harness\r\n${input.stdout.replaceAll('\n', '\r\n')}\r\nfinished` })).toEqual(consume(input));
  });

  const names = fixture().stdout.split('\n').map(line => line.split('=')[0]);
  it.each(names)('rejects missing, duplicate and empty marker %s', name => {
    const input = fixture();
    const line = input.stdout.split('\n').find(value => value.startsWith(`${name}=`))!;
    expect(() => consume({ ...input, stdout: input.stdout.split('\n').filter(value => value !== line).join('\n') })).toThrow(/missing marker/u);
    expect(() => consume({ ...input, stdout: `${input.stdout}\n${line}` })).toThrow(/duplicate marker/u);
    expect(() => consume({ ...input, stdout: input.stdout.replace(line, `${name}=`) })).toThrow(/empty marker/u);
  });
  it.each([PEG, SIGNED])('rejects unknown and valueless markers in %s', prefix => {
    expect(() => consume({ ...fixture(), stdout: `${fixture().stdout}\n${prefix}authority=true` })).toThrow(/unknown marker/u);
    expect(() => consume({ ...fixture(), stdout: `${fixture().stdout}\n${prefix}format` })).toThrow(/lacks a value/u);
  });
  it.each(['0', '2', '01', '-1'])('rejects signed format %s', value => {
    expect(() => consume(change(fixture(), `${SIGNED}format`, value))).toThrow(/format changed/u);
  });
  it('rejects legacy-only output', () => {
    const input = fixture();
    expect(() => consume({ ...input, stdout: input.stdout.split('\n').filter(line => !line.startsWith(SIGNED)).join('\n') })).toThrow(/missing marker/u);
  });

  it.each(Object.keys(patches) as (keyof typeof patches)[])('rejects changed and unbounded patch %s', key => {
    const bytes = Buffer.from(patches[key]);
    bytes[0] ^= 1;
    expect(() => consume({ ...fixture(), [key]: bytes })).toThrow(/patch bytes changed/u);
    for (const invalid of [undefined, 'bytes', new Uint8Array(), new Uint8Array(4 * 1024 * 1024 + 1)]) {
      expect(() => consume({ ...fixture(), [key]: invalid } as unknown as Input)).toThrow(/patch bytes invalid/u);
    }
  });
  it.each([null, 1, '\0', 'x'.repeat(1024 * 1024 + 1)])('rejects invalid stdout %#', stdout => {
    expect(() => consume({ ...fixture(), stdout } as unknown as Input)).toThrow(/stdout invalid/u);
  });

  it.each([DEPLOYER, BRIDGE, TOKEN, hex('00', 20)])('rejects fully matched forbidden owner %s', owner => {
    let input = fixture();
    input = change(input, `${SIGNED}owner`, owner);
    input = change(input, 'topic1', `0x${'00'.repeat(12)}${owner.slice(2)}`);
    expect(() => consume({ ...input, expected: { ...input.expected, ownerAddressHex: owner } })).toThrow(/forbidden application owner|expected owner must be nonzero/u);
  });
  it('rejects valid but different expected owner and fully rebound recipient', () => {
    const input = fixture(1);
    expect(() => consume({ ...input, expected: { ...input.expected, ownerAddressHex: fixture(0).expected.ownerAddressHex } })).toThrow(/owner binding/u);
    expect(() => consume({ ...input, expected: { ...input.expected, ergoRecipientPublicKeyHex: POINTS[0] } })).toThrow(/expected recipient binding/u);
  });
  it.each(['mint', 'approval', 'pegOut'] as const)('rejects expected %s hash substitution and malformed values', role => {
    const input = fixture();
    for (const value of [hex('99'), hex('00'), '0x12', 1]) {
      expect(() => consume({ ...input, expected: { ...input.expected, transactionHashes: { ...input.expected.transactionHashes, [role]: value } } } as unknown as Input)).toThrow(/hash/u);
    }
  });

  it.each([
    ['bridge-address', hex('11', 20), /different application/u],
    ['token-address', hex('11', 20), /different application/u],
    ['topic0', hex('11'), /different event topic/u],
    ['topic1', `0x01${'00'.repeat(11)}${'11'.repeat(20)}`, /padding/u],
    ['topic1', `0x${'00'.repeat(12)}${'22'.repeat(20)}`, /indexed owner binding/u],
    [`${SIGNED}owner`, hex('22', 20), /owner binding/u],
    [`${SIGNED}mint-hash`, hex('99'), /transaction hash binding/u],
    [`${SIGNED}approval-hash`, hex('99'), /transaction hash binding/u],
    ['transaction-hash', hex('99'), /transaction hash binding/u],
    ['burn-id', hex('99'), /commitment binding/u],
    ['burn-leaf-hash', hex('99'), /commitment binding/u],
    ['bridge-event-root', hex('99'), /commitment binding/u],
    ['recipient-ergo-tree', `0x0008cd${POINTS[1].slice(2)}`, /commitment binding/u],
    ['recipient-ergo-tree-hash', hex('99'), /commitment binding/u],
    ['sidechain-id', hex('99'), /commitment binding/u],
    ['execution-block-hash', hex('99'), /commitment binding/u],
  ] as const)('rejects isolated %s mutation', (name, value, error) => {
    expect(() => consume(change(fixture(), name, value))).toThrow(error);
  });
  it.each(['source-native-block-height', 'execution-block-number', 'transaction-index', 'receipt-status', 'log-index', 'burn-leaf-count'])('rejects topology %s', name => {
    for (const value of ['0', '8', '01', '-1', '9007199254740992']) {
      expect(() => consume(change(fixture(), name, value))).toThrow(/topology/u);
    }
  });
  it.each(['net-amount-nano-erg', 'supply-before', 'supply-after', 'escrow-after'])('rejects conservation %s', name => {
    for (const value of ['1', '0', '05000000', '-1']) expect(() => consume(change(fixture(), name, value))).toThrow(/conservation/u);
  });
  it('rejects a fully rebound wrong ABI amount', () => {
    expect(() => consume(fixture(0, 9_999_999n))).toThrow(/conservation/u);
  });
  it.each([
    [0, 32, word(0n), /amount must be positive/u],
    [32, 64, word(65n), /offset/u],
    [64, 96, word(32n), /length/u],
    [96, 129, `02${'ff'.repeat(32)}`, /valid secp256k1/u],
    [96, 97, '04', /compressed/u],
    [159, 160, '01', /padding/u],
    [159, 160, '', /160-byte hex/u],
  ] as const)('rejects isolated ABI mutation at %s', (start, end, value, error) => {
    expect(() => consume(abi(fixture(), start, end, value))).toThrow(error);
  });
  it.each(['sidechain-id', 'source-native-block-hash', 'execution-block-hash', 'burn-id', 'burn-leaf-hash', 'bridge-event-root', 'recipient-ergo-tree-hash', 'transaction-hash', `${SIGNED}mint-hash`, `${SIGNED}approval-hash`])('rejects zero and malformed hash %s', name => {
    for (const value of [hex('00'), '0x12', 'xyz']) expect(() => consume(change(fixture(), name, value))).toThrow(/nonzero|hex/u);
  });
  it.each(['0x12', `0x04${'11'.repeat(32)}`, `0x02${'ff'.repeat(32)}`])('rejects invalid expected recipient %s', key => {
    const input = fixture();
    expect(() => consume({ ...input, expected: { ...input.expected, ergoRecipientPublicKeyHex: key } })).toThrow(/recipient/u);
  });
  it('rejects missing, extra, inherited, symbolic and accessor input fields at every level', () => {
    for (const level of ['input', 'expected', 'hashes']) {
      for (const mode of ['missing', 'extra', 'inherited', 'symbol', 'accessor', 'array', 'null']) {
        const input = fixture();
        const original = level === 'input' ? input : level === 'expected' ? input.expected : input.expected.transactionHashes;
        let changed: unknown = { ...original };
        const record = changed as Record<string | symbol, unknown>;
        const key = Object.keys(original)[0];
        if (mode === 'missing') delete record[key];
        if (mode === 'extra') record.extra = true;
        if (mode === 'symbol') record[Symbol('extra')] = true;
        if (mode === 'accessor') Object.defineProperty(record, key, { get: () => { throw new Error('must not invoke'); }, enumerable: true });
        if (mode === 'inherited') changed = Object.create(original);
        if (mode === 'array') changed = [];
        if (mode === 'null') changed = null;
        const candidate = level === 'input' ? changed : level === 'expected' ? { ...input, expected: changed }
          : { ...input, expected: { ...input.expected, transactionHashes: changed } };
        expect(() => consume(candidate as Input)).toThrow(/fields|object/u);
      }
    }
  });
});
