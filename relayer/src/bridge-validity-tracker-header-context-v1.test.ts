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
