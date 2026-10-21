import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({
  directories: new Set<string>(), files: new Map<string, Buffer>(),
  activeTargets: new WeakSet<object>(), currentTarget: null as object | null,
  builds: new WeakMap<object, { parent: string; operation: object }>(),
  events: [] as string[], raw: '',
  cloneTarget: false, revokeAfterGenesis: false,
  run: vi.fn(), verifyNode: vi.fn(), observeGenesis: vi.fn(), execute: vi.fn(),
  createSession: vi.fn(), close: vi.fn(),
  claim: vi.fn(),
}));

// This is a modeled owner and attempt consumer. It creates no real process or durable hold.
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const key = (path: fs.PathLike | fs.PathOrFileDescriptor) => resolve(String(path));
  const realpath = Object.assign((path: fs.PathLike) => {
    const value = key(path);
    return model.directories.has(value) || model.files.has(value)
      ? value : actual.realpathSync(path);
  }, { native: actual.realpathSync.native });
  return { ...actual,
    lstatSync: (path: fs.PathLike, options?: { throwIfNoEntry?: boolean }) => {
      const value = key(path);
      if (model.directories.has(value)) return {
        isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false, nlink: 1, size: 0,
      };
      const bytes = model.files.get(value);
      if (bytes) return {
        isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false,
        nlink: 1, size: bytes.length,
      };
      if (options?.throwIfNoEntry === false) return undefined;
      return actual.lstatSync(path);
    },
    realpathSync: realpath,
    readFileSync: (path: fs.PathOrFileDescriptor, options?: unknown) => {
      const bytes = model.files.get(key(path));
      return bytes === undefined ? actual.readFileSync(path, options as never) : Buffer.from(bytes);
    },
    writeFileSync: (path: fs.PathOrFileDescriptor, data: Uint8Array,
      options?: { flag?: string }) => {
      const value = key(path);
      if (!model.directories.has(dirname(value))) throw new Error('fixture write left the selected target');
      if (options?.flag !== 'wx' || model.files.has(value)) throw new Error('fixture requires exclusive creation');
      model.files.set(value, Buffer.from(data));
      model.events.push('typed-candidate-wx');
    },
  };
});
vi.mock('../../adapters/federated-genesis-operator-v1.js', () => ({
  assertFederatedGenesisOperatorV1: () => undefined,
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1: () => undefined,
}));
vi.mock('../../substrate-federated-observed-genesis-v3.js', () => ({
  assertObservedSubstrateFederatedGenesisV3: () => undefined,
}));
vi.mock('../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js', () => ({
  assertSubstrateFederatedNativeGenesisPegInMintReservationDraftV3: () => undefined,
}));
vi.mock('../../substrate-federated-isolated-devnet-source-attestation-session-v1.js', () => ({
  assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV3: () => undefined,
}));
vi.mock('../../native-executable-pin.js', () => ({ verifyExecutableSha256: model.verifyNode }));
vi.mock('../../pinned-local-native-verifier-build.js', () => ({ runBoundedProcess: model.run }));
vi.mock('../../substrate-federated-authority-safe-devnet-build-environment-v1.js', () => ({
  buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1: () => ({}),
}));
vi.mock('../../adapters/federated-genesis-target-observation-v1.js', () => ({
  observeFederatedGenesisTargetsV1: model.observeGenesis,
}));
vi.mock('../../substrate-federated-authority-safe-devnet-process-v1.js', () => ({
  createOwnedFederatedGenesisDevnetProcessSessionV1: model.createSession,
  assertOwnedFederatedGenesisDevnetTargetV1: (target: object) => {
    if (!model.activeTargets.has(target)) throw new Error('original active owned-process provenance');
  },
}));
vi.mock('../../substrate-federated-genesis-node-build-v1.js', () => ({
  buildSubstrateFederatedGenesisNodeV1: vi.fn(),
  claimSubstrateFederatedGenesisNodeBuildForOperationV3: model.claim,
}));
vi.mock('./frontier-native-proof-bound-reservation-signing-v1.js', () => ({
  executeFrontierNativeProofBoundReservationV3: model.execute,
}));

import {
  executeSubstrateFederatedV3FrontierReservationTarget,
  parseSubstrateFederatedV3RawGenesisStorage,
} from './substrate-federated-v3-frontier-reservation-target-root.js';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const root = resolve('synthetic-v3-reservation');
const sourceTree = '8dca3c37da8e24cb37d40c8121465e5d14e8a58c';
const parent = join(root, 'builds');
const build = join(parent, 'bridge-fed-genesis-Abc123');
const source = join(build, 'source');
const targetDirectory = join(build, 'target');
const attemptDirectory = join(root, 'attempt');
const nodePath = join(targetDirectory, 'debug', process.platform === 'win32'
  ? 'frontier-template-node.exe' : 'frontier-template-node');
const wasmPath = join(targetDirectory, 'debug', 'wbuild',
  'frontier-template-v4-fed-genesis-runtime', 'frontier_template_v4_fed_genesis_runtime.wasm');
const candidatePath = join(targetDirectory, 'fed-genesis.json');
const wasm = Buffer.from('0061736d01000000', 'hex');
const wasmHash = hash(wasm);
const profile = `0x${'ab'.repeat(349)}`;
const bridgeAddressHex = '33'.repeat(20);
const operatorStorageKeyHex = `0x${'cd'.repeat(68)}`;
const operatorAccountInfoHex = `0x${'ef'.repeat(80)}`;
const genesisHashHex = `0x${'94'.repeat(32)}`;
const rawTop = () => ({
  '0x3a636f6465': `0x${wasm.toString('hex')}`,
  '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde': profile,
  '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1': '0x01',
  '0xaf86fef4216ac2bcd1c592b204011ad0c1586bde54b249fb7f521faf831ade45': `0x${bridgeAddressHex}`,
  [operatorStorageKeyHex]: operatorAccountInfoHex,
});
const rawSpec = (top: Record<string, string> = rawTop()) => JSON.stringify({
  id: 'bridge_federated_v4_genesis', bootNodes: [], genesis: { raw: { childrenDefault: {}, top } },
});
const parseInput = (rawSpecJson = rawSpec()) => ({ rawSpecJson, runtimeWasmSha256Hex: wasmHash,
  runtimeProfileScaleHex: profile, bridgeAddressHex, operatorStorageKeyHex, operatorAccountInfoHex });

function input() {
  const genesisJson = '{"fresh":"v3"}';
  const operator = { addressHex: '22'.repeat(20), nativeFunding: {
    storageKeyHex: operatorStorageKeyHex, accountInfoScaleHex: operatorAccountInfoHex } };
  const target = Object.freeze({});
  const draftInputs = { target };
  const compiled = { preparation: {
    mintProofProfileScaleHex: '0x1234', mintProofProfile: { proofProfileIdHex: `0x${'aa'.repeat(32)}` },
    application: { sourceRuntimeCodeSha256Hex: wasmHash, bridgeAddressHex },
  }, candidate: { genesisJson, genesisJsonSha256Hex: hash(Buffer.from(genesisJson)),
    runtimeProfileScaleHex: profile, runtimeProfileIdHex: `0x${'bb'.repeat(32)}` } };
  const signing = { operator, sourceOperation: {}, draftInputs, draft: {},
    proof: { genesisJsonSha256Hex: compiled.candidate.genesisJsonSha256Hex,
      runtimeProfileScaleHex: profile, runtimeProfileIdHex: compiled.candidate.runtimeProfileIdHex },
    compiled, target };
  const built = { sourceTreeId: sourceTree, sourceDirectory: source, targetDirectory,
    sourceProofProfileScaleHex: compiled.preparation.mintProofProfileScaleHex,
    sourceProofProfileIdHex: compiled.preparation.mintProofProfile.proofProfileIdHex,
    node: { path: nodePath, bytes: 1024 * 1024, sha256Hex: '11'.repeat(32) },
    wasm: { path: wasmPath, bytes: wasm.length, sha256Hex: wasmHash },
    toolchain: {}, protocSha256Hex: '22'.repeat(32) };
  model.builds.set(built, { parent, operation: signing.sourceOperation });
  return { built, buildParentDirectory: parent, signing, attemptDirectory,
    broadcastScope: 'fed-native-local-synthetic-v3-reservation-only' as const };
}

beforeEach(() => {
  vi.clearAllMocks();
  model.directories.clear(); model.files.clear(); model.activeTargets = new WeakSet<object>();
  model.builds = new WeakMap<object, { parent: string; operation: object }>();
  model.currentTarget = null;
  model.events.length = 0; model.cloneTarget = false; model.revokeAfterGenesis = false;
  model.claim.mockImplementation((built: object, expectedParent: string, operation: object) => {
    const retained = model.builds.get(built);
    if (!retained) throw new Error('original successful node build required');
    model.builds.delete(built);
    if (resolve(expectedParent) !== retained.parent || operation !== retained.operation) {
      throw new Error('retained build parent or operation differs');
    }
  });
  for (const path of [parent, build, source, targetDirectory, attemptDirectory]) model.directories.add(path);
  model.files.set(nodePath, Buffer.alloc(1024 * 1024));
  model.files.set(wasmPath, Buffer.from(wasm));
  model.raw = rawSpec();
  model.verifyNode.mockResolvedValue(undefined);
  model.run.mockImplementation(async (request: { args: string[]; timeoutMs: number; maxOutputBytes: number }) => {
    model.events.push('build-spec');
    expect(request.args).toEqual(['build-spec', '--chain', `fed-genesis:${candidatePath}`,
      '--disable-default-bootnode', '--raw']);
    expect(request.timeoutMs).toBe(120_000);
    expect(request.maxOutputBytes).toBe(34 * 1024 * 1024);
    return { stdoutBytes: Buffer.from(model.raw), stdout: model.raw, stderrBytes: Buffer.alloc(0), stderr: '',
      pid: 1, exitCode: 0 };
  });
  model.observeGenesis.mockImplementation(async () => {
    model.events.push('observe-genesis');
    if (model.revokeAfterGenesis) model.activeTargets = new WeakSet<object>();
    return genesisHashHex;
  });
  model.execute.mockImplementation(async (request: { signing: { frontierTarget: object } }) => {
    expect(model.activeTargets.has(request.signing.frontierTarget)).toBe(true);
    model.events.push('reservation-consumer');
    return Object.freeze({ runtimeReservationObserved: true, mintExecuted: false });
  });
  model.close.mockImplementation(async () => {
    model.events.push('close-owned-target');
    if (model.currentTarget) model.activeTargets.delete(model.currentTarget);
    return { schema: 'modeled' };
  });
  model.createSession.mockImplementation(async () => {
    model.events.push('start-owned-target');
    const original = Object.freeze({ primaryRpcUrl: 'http://127.0.0.1:19955',
      witnessRpcUrl: 'http://127.0.0.1:19956', genesisJsonSha256Hex: hash(Buffer.from('{"fresh":"v3"}')) });
    model.activeTargets.add(original);
    model.currentTarget = original;
    return { withTarget: async (action: (target: object) => Promise<unknown>) => {
      try { return await action(model.cloneTarget ? { ...original } : original); }
      catch (error) { model.activeTargets.delete(original); throw error; }
    }, close: model.close };
  });
});

describe('V3 raw genesis materialization and owned reservation boundary', () => {
  it('accepts only a bounded raw storage snapshot with the selected runtime and operator', () => {
    expect(parseSubstrateFederatedV3RawGenesisStorage(parseInput())).toEqual(rawTop());
    expect(Object.isFrozen(parseSubstrateFederatedV3RawGenesisStorage(parseInput()))).toBe(true);
  });

  it.each([
    ['runtime code', (top: Record<string, string>) => { top['0x3a636f6465'] = '0x00'; }],
    ['profile', (top: Record<string, string>) => {
      top['0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde'] = '0x00';
    }],
    ['enforcement', (top: Record<string, string>) => {
      top['0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1'] = '0x00';
    }],
    ['bridge', (top: Record<string, string>) => {
      top['0xaf86fef4216ac2bcd1c592b204011ad0c1586bde54b249fb7f521faf831ade45'] = '0x00';
    }],
    ['operator funding', (top: Record<string, string>) => { top[operatorStorageKeyHex] = '0x00'; }],
    ['sudo', (top: Record<string, string>) => {
      top['0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b'] = '0x00';
    }],
  ] as const)('rejects %s before process ownership', (_label, mutate) => {
    const top: Record<string, string> = rawTop(); mutate(top);
    expect(() => parseSubstrateFederatedV3RawGenesisStorage(parseInput(rawSpec(top)))).toThrow();
    expect(model.createSession).not.toHaveBeenCalled();
  });

  it('rejects duplicate keys, peers, child storage and a wrong target id', () => {
    const duplicate = rawSpec().replace('"bootNodes":[]', '"bootNodes":[],"bootNodes":[]');
    expect(() => parseSubstrateFederatedV3RawGenesisStorage(parseInput(duplicate))).toThrow();
    for (const mutation of [
      { id: 'foreign', bootNodes: [], genesis: { raw: { childrenDefault: {}, top: rawTop() } } },
      { id: 'bridge_federated_v4_genesis', bootNodes: ['peer'], genesis: { raw: { childrenDefault: {}, top: rawTop() } } },
      { id: 'bridge_federated_v4_genesis', bootNodes: [], genesis: { raw: { childrenDefault: { child: {} }, top: rawTop() } } },
    ]) expect(() => parseSubstrateFederatedV3RawGenesisStorage(parseInput(JSON.stringify(mutation)))).toThrow();
  });

  it('rejects a UTF-8 BOM through the full bounded build-spec path before node start', async () => {
    const bom = '\uFEFF' + rawSpec();
    expect(() => parseSubstrateFederatedV3RawGenesisStorage(parseInput(bom))).toThrow(/BOM/);
    model.raw = bom;
    await expect(executeSubstrateFederatedV3FrontierReservationTarget(input() as never)).rejects.toThrow(/BOM/);
    expect(model.run).toHaveBeenCalledOnce();
    expect(model.createSession).not.toHaveBeenCalled();
    expect(model.execute).not.toHaveBeenCalled();
  });

  it('rejects malformed funded-operator storage after build-spec but before node start', async () => {
    model.raw = rawSpec({ ...rawTop(), [operatorStorageKeyHex]: '0x00' });
    await expect(executeSubstrateFederatedV3FrontierReservationTarget(input() as never)).rejects.toThrow(/raw storage differs/);
    expect(model.run).toHaveBeenCalledOnce();
    expect(model.createSession).not.toHaveBeenCalled();
    expect(model.execute).not.toHaveBeenCalled();
  });

  it('refuses an existing durable-attempt pathname before materialization', async () => {
    model.files.set(join(attemptDirectory, 'native-reservation-attempt.json'), Buffer.from('{}'));
    await expect(executeSubstrateFederatedV3FrontierReservationTarget(input() as never)).rejects.toThrow(/already present/);
    expect(model.files.has(candidatePath)).toBe(false);
    expect(model.run).not.toHaveBeenCalled();
  });

  it('materializes once, keeps the original owner through reservation and closes it', async () => {
    const selected = input();
    const result = await executeSubstrateFederatedV3FrontierReservationTarget(selected as never);
    expect(result).toMatchObject({ runtimeReservationObserved: true, mintExecuted: false });
    expect(model.claim).toHaveBeenCalledExactlyOnceWith(
      selected.built, selected.buildParentDirectory, selected.signing.sourceOperation);
    expect(model.events).toEqual(['typed-candidate-wx', 'build-spec', 'start-owned-target',
      'observe-genesis', 'reservation-consumer', 'close-owned-target']);
    expect(model.execute).toHaveBeenCalledOnce();
    const request = model.execute.mock.calls[0]![0] as { signing: { frontierTarget: object;
      expectedStorage: Record<string, string>; expectedGenesisHashHex: string } };
    expect(model.activeTargets.has(request.signing.frontierTarget)).toBe(false);
    expect(request.signing.expectedStorage).toEqual(rawTop());
    expect(request.signing.expectedGenesisHashHex).toBe(genesisHashHex);
  });

  it('canonicalizes Windows slash spelling before comparing builder paths and native argv', async () => {
    if (process.platform !== 'win32') return;
    const selected = input();
    const slash = (value: string) => value.replaceAll('\\', '/');
    const mixed = { ...selected, buildParentDirectory: slash(parent) };
    await expect(executeSubstrateFederatedV3FrontierReservationTarget(mixed as never))
      .resolves.toMatchObject({ runtimeReservationObserved: true });
    expect(model.run.mock.calls[0]![0].executablePath).toBe(nodePath);
  });

  it('rejects an artifact outside its selected builder target', async () => {
    const selected = input();
    const foreign = join(root, 'foreign-node.exe');
    model.files.set(foreign, Buffer.alloc(1024 * 1024));
    selected.built.node.path = foreign;
    await expect(executeSubstrateFederatedV3FrontierReservationTarget(selected as never))
      .rejects.toThrow(/outside the selected build target/);
    expect(model.run).not.toHaveBeenCalled();
  });

  it('rejects a forged or cloned build before candidate creation or process work', async () => {
    const selected = input();
    for (const built of [{ ...selected.built }, { ...selected.built,
      node: { ...selected.built.node } }]) {
      await expect(executeSubstrateFederatedV3FrontierReservationTarget(
        { ...selected, built } as never)).rejects.toThrow(/original successful node build/);
    }
    expect(model.files.has(candidatePath)).toBe(false);
    expect(model.run).not.toHaveBeenCalled();
    expect(model.createSession).not.toHaveBeenCalled();
  });

  it('consumes the original build on a mismatched source operation and rejects replay', async () => {
    const selected = input();
    await expect(executeSubstrateFederatedV3FrontierReservationTarget({ ...selected,
      signing: { ...selected.signing, sourceOperation: {} } } as never))
      .rejects.toThrow(/retained build parent or operation differs/);
    await expect(executeSubstrateFederatedV3FrontierReservationTarget(selected as never))
      .rejects.toThrow(/original successful node build/);
    expect(model.files.has(candidatePath)).toBe(false);
    expect(model.run).not.toHaveBeenCalled();
    expect(model.createSession).not.toHaveBeenCalled();
  });

  it('rejects materialized candidate size drift before creating a process', async () => {
    model.run.mockImplementationOnce(async () => {
      model.files.set(candidatePath, Buffer.from('changed'));
      return { stdoutBytes: Buffer.from(rawSpec()), exitCode: 0 };
    });
    await expect(executeSubstrateFederatedV3FrontierReservationTarget(input() as never))
      .rejects.toThrow(/selected artifact differs or is indirect/);
    expect(model.createSession).not.toHaveBeenCalled();
    expect(model.execute).not.toHaveBeenCalled();
  });

  it('rejects materialized candidate same-size byte drift before creating a process', async () => {
    model.run.mockImplementationOnce(async () => {
      model.files.set(candidatePath, Buffer.from('{"fresh":"v4"}'));
      return { stdoutBytes: Buffer.from(rawSpec()), exitCode: 0 };
    });
    await expect(executeSubstrateFederatedV3FrontierReservationTarget(input() as never))
      .rejects.toThrow(/typed genesis bytes changed/);
    expect(model.createSession).not.toHaveBeenCalled();
    expect(model.execute).not.toHaveBeenCalled();
  });

  it.each([['cloned', true, false], ['revoked', false, true]] as const)(
    'refuses a %s owner before the reservation consumer',
    async (_name, clone, revoke) => {
      model.cloneTarget = clone;
      model.revokeAfterGenesis = revoke;
      await expect(executeSubstrateFederatedV3FrontierReservationTarget(input() as never))
        .rejects.toThrow(/original active owned-process provenance/);
      expect(model.execute).not.toHaveBeenCalled();
      expect(model.close).toHaveBeenCalledOnce();
    },
  );

  it('holds an ambiguous modeled submission without retry and closes the owner', async () => {
    model.execute.mockRejectedValueOnce(new Error('ambiguous modeled submit'));
    await expect(executeSubstrateFederatedV3FrontierReservationTarget(input() as never))
      .rejects.toThrow(/ambiguous modeled submit/);
    expect(model.execute).toHaveBeenCalledOnce();
    expect(model.close).toHaveBeenCalledOnce();
    // The doubled consumer creates no file and proves no real CREATE_NEW hold.
    expect(model.files.has(join(attemptDirectory, 'native-reservation-attempt.json'))).toBe(false);
  });

  it('retains both modeled reservation and close failures without a second submit', async () => {
    const submit = new Error('ambiguous modeled submit');
    const cleanup = new Error('modeled close failed');
    model.execute.mockRejectedValueOnce(submit);
    model.close.mockImplementationOnce(async () => {
      model.events.push('close-owned-target');
      if (model.currentTarget) model.activeTargets.delete(model.currentTarget);
      throw cleanup;
    });
    let failure: unknown;
    try { await executeSubstrateFederatedV3FrontierReservationTarget(input() as never); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([submit, cleanup]);
    expect(model.execute).toHaveBeenCalledOnce();
    expect(model.close).toHaveBeenCalledOnce();
  });

  it('rejects the wrong V3 scope before typed-candidate creation', async () => {
    await expect(executeSubstrateFederatedV3FrontierReservationTarget(
      { ...input(), broadcastScope: 'other' } as never,
    )).rejects.toThrow(/scope differs/);
    expect(model.files.has(candidatePath)).toBe(false);
    expect(model.run).not.toHaveBeenCalled();
  });

  it('rejects extra symbols, hidden fields and getters before typed-candidate creation', async () => {
    const accessed = vi.fn();
    const mutations: Array<(value: object) => void> = [
      value => { Object.defineProperty(value, Symbol('extra'), { value: true }); },
      value => { Object.defineProperty(value, 'hidden', { value: true }); },
      value => { Object.defineProperty(value, 'signing', {
        enumerable: true, configurable: true, get: accessed,
      }); },
    ];
    for (const mutate of mutations) {
      const value = input();
      mutate(value);
      await expect(executeSubstrateFederatedV3FrontierReservationTarget(value as never))
        .rejects.toThrow(/exact data fields/);
    }
    expect(accessed).not.toHaveBeenCalled();
    expect(model.files.has(candidatePath)).toBe(false);
    expect(model.run).not.toHaveBeenCalled();
  });
});
