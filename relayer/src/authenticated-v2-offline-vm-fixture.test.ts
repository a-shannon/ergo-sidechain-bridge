import { describe, expect, it } from 'vitest';

import {
  buildContinuedDeterministicSyntheticVmHeaderContext,
  buildDeterministicSyntheticVmHeaderContext,
} from './authenticated-v2-offline-vm-fixture.js';

describe('authenticated V2 offline VM fixture', () => {
  it('builds a deterministic parent-linked ten-header sigma-rust context', async () => {
    const wasmImport: any = await import('ergo-lib-wasm-nodejs');
    const wasm = wasmImport.default ?? wasmImport;
    const anchorExtensionRootHex = 'ab'.repeat(32);
    const context = buildDeterministicSyntheticVmHeaderContext(wasm, {
      currentHeight: 1_024,
      anchorContextIndex: 4,
      anchorExtensionRootHex,
    });

    expect(context.provenance).toBe('deterministic-synthetic-header-context');
    expect(context.currentHeight).toBe(1_024);
    expect(context.headers).toHaveLength(10);
    expect(context.anchorHeader).toBe(context.headers[4]);
    expect(context.anchorHeader.extensionRootHex).toBe(anchorExtensionRootHex);
    expect(context.headers.map(header => header.height)).toEqual([
      1_023, 1_022, 1_021, 1_020, 1_019, 1_018, 1_017, 1_016, 1_015, 1_014,
    ]);
    for (let index = 0; index < context.headers.length - 1; index += 1) {
      expect(context.headers[index].parentId).toBe(context.headers[index + 1].id);
    }
  });

  it('rejects invalid height, index, and extension-root inputs', async () => {
    const wasmImport: any = await import('ergo-lib-wasm-nodejs');
    const wasm = wasmImport.default ?? wasmImport;
    const valid = {
      currentHeight: 1_024,
      anchorContextIndex: 0,
      anchorExtensionRootHex: 'ab'.repeat(32),
    };

    expect(() => buildDeterministicSyntheticVmHeaderContext(wasm, {
      ...valid,
      currentHeight: 8,
    })).toThrow(/current height must be at least 10/);
    expect(() => buildDeterministicSyntheticVmHeaderContext(wasm, {
      ...valid,
      anchorContextIndex: 10,
    })).toThrow(/anchor context index must be between 0 and 9/);
    expect(() => buildDeterministicSyntheticVmHeaderContext(wasm, {
      ...valid,
      anchorExtensionRootHex: 'ab',
    })).toThrow(/anchor extension root must be 32 bytes/);
  });

  it('continues the exact retained anchor to the ten-confirmation window', async () => {
    const wasmImport: any = await import('ergo-lib-wasm-nodejs');
    const wasm = wasmImport.default ?? wasmImport;
    const prior = buildDeterministicSyntheticVmHeaderContext(wasm, {
      currentHeight: 100_000,
      anchorContextIndex: 4,
      anchorExtensionRootHex: 'ab'.repeat(32),
    });
    const continued = buildContinuedDeterministicSyntheticVmHeaderContext(wasm, {
      priorContext: prior,
      targetCurrentHeight: 100_005,
    });

    expect(continued.anchorContextIndex).toBe(9);
    expect(continued.anchorHeader).toBe(prior.anchorHeader);
    expect(continued.headers[9]).toBe(prior.anchorHeader);
    expect(continued.currentHeight - continued.anchorHeader.height).toBe(10);
    expect(continued.headers.map(header => header.height)).toEqual([
      100_004, 100_003, 100_002, 100_001, 100_000,
      99_999, 99_998, 99_997, 99_996, 99_995,
    ]);
    for (let index = 0; index < 5; index += 1) {
      expect(continued.headers[index + 5]).toBe(prior.headers[index]);
    }
    expect(continued.headers[4].parentId).toBe(prior.headers[0].id);
    for (let index = 0; index < continued.headers.length - 1; index += 1) {
      expect(continued.headers[index].parentId).toBe(continued.headers[index + 1].id);
    }
  });

  it('rejects retained raw-header drift and non-exact anchor depths independently', async () => {
    const wasmImport: any = await import('ergo-lib-wasm-nodejs');
    const wasm = wasmImport.default ?? wasmImport;
    const makePrior = () => {
      const context = buildDeterministicSyntheticVmHeaderContext(wasm, {
        currentHeight: 100_000,
        anchorContextIndex: 4,
        anchorExtensionRootHex: 'ab'.repeat(32),
      });
      const headers = structuredClone(context.headers);
      return {
        currentHeight: context.currentHeight,
        anchorContextIndex: context.anchorContextIndex,
        anchorHeader: headers[context.anchorContextIndex],
        headers,
        provenance: context.provenance,
      };
    };
    const mutations: Array<(prior: ReturnType<typeof makePrior>) => void> = [
      prior => { prior.headers[0].raw.id = 'ef'.repeat(32); },
      prior => { prior.headers[0].raw.height = 99_998; },
      prior => { prior.headers[0].raw.extensionHash = 'ef'.repeat(32); },
      prior => { prior.headers[0].raw.parentId = 'ef'.repeat(32); },
    ];
    for (const mutate of mutations) {
      const prior = makePrior();
      mutate(prior);
      expect(() => buildContinuedDeterministicSyntheticVmHeaderContext(wasm, {
        priorContext: prior,
        targetCurrentHeight: 100_005,
      })).toThrow(/normalized identity/i);
    }

    expect(() => buildContinuedDeterministicSyntheticVmHeaderContext(wasm, {
      priorContext: makePrior(),
      targetCurrentHeight: 100_004,
    })).toThrow(/anchor depth must equal 10/i);
    expect(() => buildContinuedDeterministicSyntheticVmHeaderContext(wasm, {
      priorContext: makePrior(),
      targetCurrentHeight: 100_006,
    })).toThrow(/anchor depth must equal 10/i);
  });
});
