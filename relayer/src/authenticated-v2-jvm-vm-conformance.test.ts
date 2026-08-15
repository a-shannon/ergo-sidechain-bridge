import { describe, expect, it, vi } from 'vitest';

import {
  AUTHENTICATED_V2_JVM_VM_FIXTURE_SCHEMA,
  buildAuthenticatedV2JvmVmFixture,
  type AuthenticatedV2JvmHeaderRecord,
} from './authenticated-v2-jvm-vm-conformance.js';
import { parseNodeJsonPreservingPowDistance } from './ergo-node-json.js';
import {
  deriveSimplifiedUpcomingPreHeader,
  orderAndValidateMinedHeaderWindow,
  SIMPLIFIED_UPCOMING_MINER_PK_HEX,
} from './ergo-upcoming-state-context.js';

const TRANSACTION_ID = 'ab'.repeat(32);
const CANONICAL_TREES = {
  tracker: '03cc',
  unlock: '01aa',
  duplicatePrevention: '02bb',
};

function fixed(byte: number, length: number): string {
  return byte.toString(16).padStart(2, '0').repeat(length);
}

function rawHeader(input: {
  idByte: number;
  parentId: string;
  height: number;
  distance?: string;
}): Record<string, unknown> {
  return {
    id: fixed(input.idByte, 32),
    version: 2,
    parentId: input.parentId,
    adProofsRoot: fixed(1, 32),
    stateRoot: fixed(2, 33),
    transactionsRoot: fixed(3, 32),
    timestamp: 1_720_000_000_000 + input.height,
    nBits: 117_440_511,
    height: input.height,
    extensionRoot: fixed(4, 32),
    powSolutions: {
      pk: fixed(5, 33),
      w: fixed(6, 33),
      n: fixed(7, 8),
      d: input.distance ?? '12345678901234567890',
    },
    votes: fixed(8, 3),
  };
}

function headerContext(): {
  preHeader: AuthenticatedV2JvmHeaderRecord;
  headers: AuthenticatedV2JvmHeaderRecord[];
} {
  const headers = Array.from({ length: 10 }, (_, index) => ({
    id: fixed(20 + index, 32),
    raw: rawHeader({
      idByte: 20 + index,
      parentId: fixed(index === 9 ? 99 : 21 + index, 32),
      height: 200 - index,
    }),
  }));
  return {
    preHeader: { raw: deriveSimplifiedUpcomingPreHeader(headers[0].raw) },
    headers,
  };
}

function wasmFacade(): any {
  const transaction = {
    id: () => ({ to_str: () => TRANSACTION_ID }),
    sigma_serialize_bytes: () => Uint8Array.from([1, 2, 3, 4]),
  };
  return {
    Transaction: {
      from_json: vi.fn(() => transaction),
      sigma_parse_bytes: vi.fn(() => transaction),
    },
    UnsignedTransaction: {
      from_json: vi.fn(() => ({ id: () => ({ to_str: () => TRANSACTION_ID }) })),
    },
    ErgoBox: {
      from_json: vi.fn((source: string) => ({
        sigma_serialize_bytes: () => Buffer.from(source, 'utf8'),
      })),
    },
  };
}

function build(overrides: Partial<ReturnType<typeof headerContext>> = {}) {
  const context = headerContext();
  return buildAuthenticatedV2JvmVmFixture({
    wasm: wasmFacade(),
    mode: 'settlement',
    signedTransaction: { inputs: [{}, {}] },
    signedTransactionBytes: Uint8Array.from([1, 2, 3, 4]),
    unsignedTransaction: { inputs: [{}, {}] },
    inputBoxes: [
      { boxId: fixed(30, 32), ergoTree: '02bb' },
      { boxId: fixed(31, 32), ergoTree: '01aa' },
    ],
    dataInputBoxes: [{ boxId: fixed(32, 32), ergoTree: '03cc' }],
    contractBindings: {
      inputs: [
        { role: 'duplicatePrevention', ergoTreeHex: '02bb' },
        { role: 'unlock', ergoTreeHex: '01aa' },
      ],
      dataInputs: [{ role: 'tracker', ergoTreeHex: '03cc' }],
    },
    canonicalContractTrees: CANONICAL_TREES,
    preHeader: overrides.preHeader ?? context.preHeader,
    headers: overrides.headers ?? context.headers,
  });
}

describe('authenticated V2 JVM VM fixture', () => {
  it('orders and validates an exact H through H-9 mined-header window', () => {
    const context = headerContext();
    const raw = context.headers.map(header => header.raw);
    const ordered = orderAndValidateMinedHeaderWindow([...raw].reverse());

    expect(ordered.map(header => header.height)).toEqual(
      Array.from({ length: 10 }, (_, index) => 200 - index),
    );

    const brokenParent = raw.map(header => ({ ...header }));
    brokenParent[0].parentId = fixed(77, 32);
    expect(() => orderAndValidateMinedHeaderWindow(brokenParent)).toThrow(
      'mined header 0 must extend mined header 1',
    );

    const brokenHeight = raw.map(header => ({ ...header }));
    brokenHeight[1].height = 198;
    expect(() => orderAndValidateMinedHeaderWindow(brokenHeight)).toThrow(
      'mined header 0 height must be exactly one above mined header 1',
    );
  });

  it('preserves the exact lexical PoW distance beyond JavaScript safe integers', () => {
    const distance = '12345678901234567890123456789012345678901234567890';
    const boxValue = '9007199254740993';
    const parsed = parseNodeJsonPreservingPowDistance(
      `[{"powSolutions":{"d":${distance}},"value":${boxValue},"height":100}]`,
    ) as Array<{ powSolutions: { d: string }; value: string; height: number }>;

    expect(parsed[0].powSolutions.d).toBe(distance);
    expect(parsed[0].value).toBe(boxValue);
    expect(parsed[0].height).toBe(100);
    expect(() => parseNodeJsonPreservingPowDistance('{"d":1e20}')).toThrow(
      'PoW distance must be a canonical non-negative decimal integer',
    );
    expect(() => parseNodeJsonPreservingPowDistance('{"value":1.5}')).toThrow(
      'unsafe node JSON number must be a canonical decimal integer',
    );
  });

  it('binds exact transaction bytes, boxes, roles, trees, and node upcoming context', () => {
    const fixture = build();

    expect(fixture).toMatchObject({
      schema: AUTHENTICATED_V2_JVM_VM_FIXTURE_SCHEMA,
      mode: 'settlement',
      contextKind: 'node-simplified-upcoming',
      signedTransactionHex: '01020304',
      expectedTransactionIdHex: TRANSACTION_ID,
      expectedUnsignedIdHex: TRANSACTION_ID,
      contractBindings: {
        inputs: [
          { role: 'duplicatePrevention', ergoTreeHex: '02bb' },
          { role: 'unlock', ergoTreeHex: '01aa' },
        ],
        dataInputs: [{ role: 'tracker', ergoTreeHex: '03cc' }],
      },
      costLimit: 1_000_000,
      initCost: 0,
      activatedScriptVersion: 3,
      boundaries: {
        nodeStatefulAcceptance: false,
        broadcastPerformed: false,
        gate5Closed: false,
      },
    });
    expect(fixture.inputBoxesHex).toHaveLength(2);
    expect(fixture.dataInputBoxesHex).toHaveLength(1);
    expect(fixture.headers).toHaveLength(10);
    expect(fixture.preHeaderJson).toContain(`\"parentId\":\"${fixture.headers[0].expectedIdHex}\"`);
    expect(fixture.preHeaderJson).toContain(`\"minerPk\":\"${SIMPLIFIED_UPCOMING_MINER_PK_HEX}\"`);
    expect(fixture.preHeaderJson).toContain('\"votes\":\"\"');
    expect(fixture.contextSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(fixture.headers[0].headerJson).toContain('"powDistance":12345678901234567890');
  });

  it('rejects upcoming and mined header linkage divergence', () => {
    const context = headerContext();
    const wrongCandidate = {
      ...context.preHeader,
      raw: {
        ...context.preHeader.raw,
        parentId: fixed(77, 32),
      },
    };
    expect(() => build({ preHeader: wrongCandidate })).toThrow(
      'preheader must extend the context tip',
    );

    const wrongHeaders = context.headers.map(header => ({ ...header, raw: { ...header.raw } }));
    wrongHeaders[0].raw.parentId = fixed(78, 32);
    expect(() => build({ headers: wrongHeaders })).toThrow('header 0 must extend header 1');

    const heightGap = context.headers.map(header => ({ ...header, raw: { ...header.raw } }));
    heightGap[1].raw.height = Number(heightGap[1].raw.height) - 1;
    expect(() => build({ headers: heightGap })).toThrow(
      'header 0 height must be exactly one above header 1',
    );
  });

  it('rejects noncanonical proof context shape before invoking the JVM', () => {
    const context = headerContext();
    expect(() => build({ headers: context.headers.slice(0, 9) })).toThrow(
      'requires exactly 10 headers',
    );
    context.headers[0].raw = {
      ...context.headers[0].raw,
      powSolutions: {
        ...(context.headers[0].raw.powSolutions as Record<string, unknown>),
        d: '01',
      },
    };
    expect(() => build({ headers: context.headers })).toThrow(
      'PoW distance must be a canonical non-negative decimal integer',
    );
  });

  it('rejects mode-role cardinality and box-tree divergence before invoking the JVM', () => {
    const context = headerContext();
    const common = {
      wasm: wasmFacade(),
      signedTransaction: { inputs: [{}] },
      signedTransactionBytes: Uint8Array.from([1, 2, 3, 4]),
      unsignedTransaction: { inputs: [{}] },
      inputBoxes: [{ boxId: fixed(30, 32), ergoTree: '01aa' }],
      dataInputBoxes: [] as Record<string, unknown>[],
      canonicalContractTrees: CANONICAL_TREES,
      preHeader: context.preHeader,
      headers: context.headers,
    };

    expect(() => buildAuthenticatedV2JvmVmFixture({
      ...common,
      mode: 'tracker',
      contractBindings: {
        inputs: [{ role: 'unlock', ergoTreeHex: '01aa' }],
        dataInputs: [],
      },
    })).toThrow('tracker fixture input roles must be exactly tracker');

    expect(() => buildAuthenticatedV2JvmVmFixture({
      ...common,
      mode: 'tracker',
      contractBindings: {
        inputs: [{ role: 'tracker', ergoTreeHex: '02bb' }],
        dataInputs: [],
      },
    })).toThrow('input binding 0 ErgoTree must match input box 0');

    expect(() => buildAuthenticatedV2JvmVmFixture({
      ...common,
      mode: 'tracker',
      contractBindings: {
        inputs: [{ role: 'tracker', ergoTreeHex: '01aa' }],
        dataInputs: [],
      },
    })).toThrow('tracker ErgoTree must match the pinned canonical compilation');
  });

  it('changes the context digest when one exact header field changes', () => {
    const original = build();
    const context = headerContext();
    context.headers[9] = {
      ...context.headers[9],
      raw: {
        ...context.headers[9].raw,
        timestamp: Number(context.headers[9].raw.timestamp) + 1,
      },
    };
    const changed = build({ headers: context.headers });

    expect(changed.contextSha256Hex).not.toBe(original.contextSha256Hex);
  });

  it('rejects signer-byte substitution and empty exact serialization', () => {
    const context = headerContext();
    const common = {
      wasm: wasmFacade(),
      mode: 'tracker' as const,
      signedTransaction: { inputs: [{}] },
      unsignedTransaction: { inputs: [{}] },
      inputBoxes: [{ boxId: fixed(30, 32), ergoTree: '03cc' }],
      dataInputBoxes: [] as Record<string, unknown>[],
      contractBindings: {
        inputs: [{ role: 'tracker' as const, ergoTreeHex: '03cc' }],
        dataInputs: [],
      },
      canonicalContractTrees: CANONICAL_TREES,
      preHeader: context.preHeader,
      headers: context.headers,
    };

    expect(() => buildAuthenticatedV2JvmVmFixture({
      ...common,
      signedTransactionBytes: new Uint8Array(),
    })).toThrow('exact signed transaction serialization is empty');

    const wasm = wasmFacade();
    wasm.Transaction.from_json = vi.fn(() => ({
      id: () => ({ to_str: () => TRANSACTION_ID }),
      sigma_serialize_bytes: () => Uint8Array.from([9, 9, 9, 9]),
    }));
    expect(() => buildAuthenticatedV2JvmVmFixture({
      ...common,
      wasm,
      signedTransactionBytes: Uint8Array.from([1, 2, 3, 4]),
    })).toThrow('signed transaction JSON differs from the exact wallet serialization');
  });
});
