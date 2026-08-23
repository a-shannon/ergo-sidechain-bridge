import { describe, expect, it } from 'vitest';
import blakejs from 'blakejs';

import {
  assertBridgeValidityTrackerCanonicalHeaderContextV1,
  assertBridgeValidityTrackerObservedHeaderContextV1,
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
  buildBridgeValidityTrackerObservedHeaderContextV1,
  serializeCanonicalErgoHeaderV2,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  loadWp06CanonicalJvmHeaderVector,
} from './wp06-canonical-jvm-header-chain.js';
import {
  serializeErgoHeaderIdentity,
} from './ergo-settlement-core/ergo-header-id.js';

async function wasmModule(): Promise<any> {
  const imported = await import('ergo-lib-wasm-nodejs');
  return imported.default ?? imported;
}

describe('EIP-0045 validity tracker canonical synthetic header context', () => {
  it('reproduces every previously pinned JVM-derived WP-06 header ID', () => {
    const vector = loadWp06CanonicalJvmHeaderVector();
    for (const header of vector.headersOldestToNewest) {
      expect(
        Buffer.from(
          serializeCanonicalErgoHeaderV2(header.raw),
        ).length,
      ).toBe(220);
      const serialized = serializeCanonicalErgoHeaderV2(header.raw);
      expect(
        Buffer.from(
          blakejs.blake2b(serialized, undefined, 32),
        ).toString('hex'),
      ).toBe(header.id);
    }
  });

  it('builds one provenance-bound canonical chain for a dynamic anchor root', async () => {
    const context = buildBridgeValidityTrackerCanonicalHeaderContextV1(
      await wasmModule(),
      {
        currentHeight: 2_000,
        anchorContextIndex: 3,
        anchorExtensionRootHex: 'ab'.repeat(32),
      },
    );
    expect(context.headers).toHaveLength(10);
    expect(context.headers.map(header => header.height)).toEqual(
      Array.from({ length: 10 }, (_, index) => 1_999 - index),
    );
    expect(context.anchorHeader).toBe(context.headers[3]);
    expect(context.anchorHeader.extensionRootHex).toBe('ab'.repeat(32));
    expect(context.headers.every(header =>
      header.serializedHex.length === 438)).toBe(true);
    expect(() =>
      assertBridgeValidityTrackerCanonicalHeaderContextV1(context),
    ).not.toThrow();
  });

  it('rejects rehydrated provenance and isolated serialized-header drift', async () => {
    const context = buildBridgeValidityTrackerCanonicalHeaderContextV1(
      await wasmModule(),
      {
        currentHeight: 2_000,
        anchorContextIndex: 3,
        anchorExtensionRootHex: 'ab'.repeat(32),
      },
    );
    expect(() =>
      assertBridgeValidityTrackerCanonicalHeaderContextV1(
        structuredClone(context),
      ),
    ).toThrow(/provenance is missing/i);

    expect(() => serializeCanonicalErgoHeaderV2({
      ...context.headers[0].raw,
      version: 3,
    })).toThrow(/version must be 2/i);
    expect(() => serializeCanonicalErgoHeaderV2({
      ...context.headers[0].raw,
      powSolutions: {
        ...(context.headers[0].raw.powSolutions as Record<string, unknown>),
        d: 1,
      },
    })).toThrow(/distance must be zero/i);
  });

  it('binds exactly ten observed node headers to their canonical identities', async () => {
    const wasm = await wasmModule();
    const synthetic = buildBridgeValidityTrackerCanonicalHeaderContextV1(
      wasm,
      {
        currentHeight: 2_000,
        anchorContextIndex: 0,
        anchorExtensionRootHex: 'ab'.repeat(32),
      },
    );
    const observed = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      rawHeaders: synthetic.headers.map(header => header.raw),
      anchorContextIndex: 0,
      expectedAnchorHeaderIdHex: synthetic.anchorHeader.id,
      expectedAnchorExtensionRootHex: synthetic.anchorHeader.extensionRootHex,
    });

    expect(observed.currentHeight).toBe(2_000);
    expect(observed.headers.map(header => header.id)).toEqual(
      synthetic.headers.map(header => header.id),
    );
    expect(observed.anchorHeader).toBe(observed.headers[0]);
    expect(() =>
      assertBridgeValidityTrackerObservedHeaderContextV1(observed),
    ).not.toThrow();
    expect(() =>
      assertBridgeValidityTrackerObservedHeaderContextV1(
        structuredClone(observed),
      ),
    ).toThrow(/provenance is missing/i);
  });

  it('accepts current Autolykos V2 block-version 4 node headers', async () => {
    const wasm = await wasmModule();
    const synthetic = buildBridgeValidityTrackerCanonicalHeaderContextV1(
      wasm,
      {
        currentHeight: 2_000,
        anchorContextIndex: 0,
        anchorExtensionRootHex: 'ab'.repeat(32),
      },
    );
    const rawHeaders = observedHeadersAtVersion(synthetic.headers, 4);
    const observed = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      rawHeaders,
      anchorContextIndex: 0,
      expectedAnchorHeaderIdHex: String(rawHeaders[0]!.id),
      expectedAnchorExtensionRootHex: synthetic.anchorHeader.extensionRootHex,
    });

    expect(observed.headers.map(header => header.raw.version))
      .toEqual(Array(10).fill(4));
    expect(observed.headers.every(header => header.serializedHex.length === 438))
      .toBe(true);
    expect(() => assertBridgeValidityTrackerObservedHeaderContextV1(observed))
      .not.toThrow();
  });

  it('rejects legacy Autolykos V1 node headers from the observed context', async () => {
    const wasm = await wasmModule();
    const synthetic = buildBridgeValidityTrackerCanonicalHeaderContextV1(
      wasm,
      {
        currentHeight: 2_000,
        anchorContextIndex: 0,
        anchorExtensionRootHex: 'ab'.repeat(32),
      },
    );
    const rawHeaders = observedHeadersAtVersion(synthetic.headers, 1);

    expect(() => buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      rawHeaders,
      anchorContextIndex: 0,
      expectedAnchorHeaderIdHex: String(rawHeaders[0]!.id),
      expectedAnchorExtensionRootHex: synthetic.anchorHeader.extensionRootHex,
    })).toThrow(/version 2 to 4/i);
  });

  it('rejects non-committed observed aliases and Autolykos V2 fields', async () => {
    const wasm = await wasmModule();
    const synthetic = buildBridgeValidityTrackerCanonicalHeaderContextV1(
      wasm,
      {
        currentHeight: 2_000,
        anchorContextIndex: 0,
        anchorExtensionRootHex: 'ab'.repeat(32),
      },
    );
    const rawHeaders = observedHeadersAtVersion(synthetic.headers, 4);
    const expected = {
      anchorContextIndex: 0,
      expectedAnchorHeaderIdHex: String(rawHeaders[0]!.id),
      expectedAnchorExtensionRootHex: synthetic.anchorHeader.extensionRootHex,
    };

    expect(() => buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      ...expected,
      rawHeaders: rawHeaders.map((header, index) => index === 0
        ? { ...header, extensionRoot: 'cd'.repeat(32) }
        : header),
    })).toThrow(/extension root aliases disagree/i);
    expect(() => buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      ...expected,
      rawHeaders: rawHeaders.map((header, index) => index === 0
        ? {
          ...header,
          powSolutions: {
            ...(header.powSolutions as Readonly<Record<string, unknown>>),
            w: String(
              (synthetic.headers[0]!.raw.powSolutions as Record<string, unknown>).pk,
            ),
          },
        }
        : header),
    })).toThrow(/one-time key is not canonical/i);
    expect(() => buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      ...expected,
      rawHeaders: rawHeaders.map((header, index) => index === 0
        ? {
          ...header,
          powSolutions: {
            ...(header.powSolutions as Readonly<Record<string, unknown>>),
            d: 1,
          },
        }
        : header),
    })).toThrow(/distance is not canonical/i);
  });

  it('rejects incomplete or falsely identified observed header windows', async () => {
    const wasm = await wasmModule();
    const synthetic = buildBridgeValidityTrackerCanonicalHeaderContextV1(
      wasm,
      {
        currentHeight: 2_000,
        anchorContextIndex: 0,
        anchorExtensionRootHex: 'ab'.repeat(32),
      },
    );
    const rawHeaders = synthetic.headers.map(header => header.raw);

    expect(() => buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      rawHeaders: rawHeaders.slice(0, 9),
      anchorContextIndex: 0,
      expectedAnchorHeaderIdHex: synthetic.anchorHeader.id,
      expectedAnchorExtensionRootHex: synthetic.anchorHeader.extensionRootHex,
    })).toThrow(/exactly 10 headers/i);
    expect(() => buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      rawHeaders,
      anchorContextIndex: 0,
      expectedAnchorHeaderIdHex: 'cd'.repeat(32),
      expectedAnchorExtensionRootHex: synthetic.anchorHeader.extensionRootHex,
    })).toThrow(/anchor header binding mismatch/i);
  });
});

function observedHeadersAtVersion(
  source: readonly Readonly<{
    readonly raw: Readonly<Record<string, unknown>>;
    readonly parentId: string;
  }>[],
  version: 1 | 4,
): Readonly<Record<string, unknown>>[] {
  const oldestToNewest = [...source].reverse();
  let parentId = oldestToNewest[0]!.parentId;
  const rebuilt = oldestToNewest.map(header => {
    const raw = header.raw;
    const pow = raw.powSolutions as Readonly<Record<string, unknown>>;
    const serialized = serializeErgoHeaderIdentity({
      version,
      parentId: Buffer.from(parentId, 'hex'),
      adProofsRoot: Buffer.from(String(raw.adProofsRoot), 'hex'),
      stateRoot: Buffer.from(String(raw.stateRoot), 'hex'),
      transactionsRoot: Buffer.from(String(raw.transactionsRoot), 'hex'),
      timestamp: BigInt(Number(raw.timestamp)),
      nBits: Number(raw.nBits),
      height: Number(raw.height),
      extensionHash: Buffer.from(String(raw.extensionHash), 'hex'),
      votes: Buffer.from(String(raw.votes), 'hex'),
      powSolution: {
        publicKey: Buffer.from(String(pow.pk), 'hex'),
        nonce: Buffer.from(String(pow.n), 'hex'),
        ...(version === 1
          ? {
            oneTimePublicKey: Buffer.from(String(pow.w), 'hex'),
            distance: BigInt(String(pow.d)),
          }
          : {}),
      },
    });
    const id = Buffer.from(
      blakejs.blake2b(serialized, undefined, 32),
    ).toString('hex');
    const rebuiltRaw = {
      ...raw,
      id,
      parentId,
      ...(version === 4 ? { unparsedBytes: '' } : {}),
      version,
    };
    parentId = id;
    return rebuiltRaw;
  });
  return rebuilt.reverse();
}
