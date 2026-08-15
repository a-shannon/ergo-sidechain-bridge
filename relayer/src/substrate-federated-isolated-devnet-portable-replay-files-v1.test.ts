import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsFault = vi.hoisted(() => ({
  mode: 'none' as string,
  targetPath: '',
  targetLstatCalls: 0,
  readFaulted: false,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const callLstatSync = actual.lstatSync as unknown as
    (...args: unknown[]) => unknown;
  const callReadSync = actual.readSync as unknown as
    (...args: unknown[]) => number;
  return {
    ...actual,
    lstatSync: (...args: unknown[]) => {
      const stat = callLstatSync(...args) as Record<PropertyKey, unknown>;
      if (
        fsFault.targetPath.length === 0
        || String(args[0]).toLowerCase() !== fsFault.targetPath.toLowerCase()
        || typeof stat.dev !== 'bigint'
      ) {
        return stat;
      }
      fsFault.targetLstatCalls += 1;
      if (fsFault.mode === 'zero-identity' && fsFault.targetLstatCalls === 2) {
        return statWithOverrides(stat, { dev: 0n, ino: 0n });
      }
      if (fsFault.mode === 'metadata-drift' && fsFault.targetLstatCalls === 3) {
        return statWithOverrides(stat, {
          mtimeNs: (stat.mtimeNs as bigint) + 1n,
        });
      }
      if (fsFault.mode === 'path-replacement' && fsFault.targetLstatCalls === 3) {
        return statWithOverrides(stat, { ino: (stat.ino as bigint) + 1n });
      }
      if (
        fsFault.mode === 'post-open-metadata-drift'
        && fsFault.targetLstatCalls === 4
      ) {
        return statWithOverrides(stat, {
          mtimeNs: (stat.mtimeNs as bigint) + 1n,
        });
      }
      if (
        fsFault.mode === 'post-read-path-replacement'
        && fsFault.targetLstatCalls === 5
      ) {
        return statWithOverrides(stat, { ino: (stat.ino as bigint) + 1n });
      }
      return stat;
    },
    readSync: (...args: unknown[]) => {
      const length = Number(args[3]);
      if (fsFault.mode === 'partial-read' && !fsFault.readFaulted && length > 1) {
        fsFault.readFaulted = true;
        const partialArgs = [...args];
        partialArgs[3] = length - 1;
        return callReadSync(...partialArgs);
      }
      if (fsFault.mode === 'premature-eof' && !fsFault.readFaulted) {
        fsFault.readFaulted = true;
        return 0;
      }
      if (fsFault.mode === 'growth' && !fsFault.readFaulted && length === 1) {
        fsFault.readFaulted = true;
        return 1;
      }
      return callReadSync(...args);
    },
  };
});

import { canonicalJson } from './strict-json.js';
import {
  loadSubstrateFederatedIsolatedDevnetPortableReplayInputV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-portable-replay-files-v1.js';

const TRUST_PINS = Object.freeze({
  expectedTargetDescriptorDigestHex: '11'.repeat(32),
  expectedSourceAttestationKeySetDigestHex: '22'.repeat(32),
});

let root: string;
let requestPath: string;
let expectedBytes: Readonly<Record<string, Buffer>>;

describe('Substrate federated isolated-devnet portable replay file loader V1', () => {
  beforeEach(() => {
    resetFsFault();
    root = mkdtempSync(join(tmpdir(), 'e2s-isolated-replay-files-'));
    expectedBytes = writeBundle(root);
    requestPath = writeRequest(root, portableRequest());
  });

  afterEach(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('loads exactly the canonical 17-file closure and two explicit pins', () => {
    const input = loadSubstrateFederatedIsolatedDevnetPortableReplayInputV1(
      requestPath,
      TRUST_PINS,
    );

    expect(Object.keys(input.artifacts).sort()).toEqual(
      Object.keys(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1)
        .sort(),
    );
    for (const key of Object.keys(input.artifacts)) {
      expect(Buffer.from(input.artifacts[key as keyof typeof input.artifacts]))
        .toEqual(expectedBytes[key]);
    }
    expect(input.trustPins).toEqual(TRUST_PINS);
    expect(input).not.toHaveProperty('requestPath');
    expect(input).not.toHaveProperty('files');
  });

  it('rejects unknown fields, duplicate keys and noncanonical request JSON', () => {
    const request = portableRequest();
    const variants = [
      canonicalBytes({ ...request, authority: 'accepted' }),
      Buffer.from(
        `{"schema":"${SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA}",${canonicalJson(request).slice(1)}\n`,
        'utf8',
      ),
      Buffer.from(`${JSON.stringify(request, null, 2)}\n`, 'utf8'),
    ];

    for (const [index, bytes] of variants.entries()) {
      const variantPath = join(root, `invalid-request-${index}.json`);
      writeFileSync(variantPath, bytes);
      expect(() => load(
        variantPath,
      )).toThrow();
    }
  });

  it('redacts attacker-controlled strict-JSON parser details', () => {
    const marker = 'attacker-controlled-diagnostic-marker';
    const key = JSON.stringify(marker);
    const malicious = join(root, 'malicious-duplicate-key.json');
    writeFileSync(malicious, Buffer.from(`{${key}:1,${key}:2}\n`, 'utf8'));

    let message = '';
    try {
      load(malicious);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('isolated portable replay request is not strict JSON');
    expect(message).not.toContain(marker);
    expect(message).not.toContain(root);
  });

  it('rejects traversal, absolute, sensitive and alternate artifact paths', () => {
    const variants = [
      '../outside.bin',
      'C:/outside.bin',
      'artifacts/.env.bridge',
      'artifacts/relayer/build-artifact-copy.v1.bin',
    ];
    for (const [index, value] of variants.entries()) {
      const request = portableRequest({ relayerBuildArtifact: value });
      const variantPath = writeRequest(root, request, `unsafe-${index}.json`);
      expect(() => load(variantPath)).toThrow(/unsafe|canonical/i);
    }
  });

  it('rejects a canonical artifact replaced by a symbolic link', () => {
    const artifact = artifactPath(root, 'relayerBuildArtifact');
    const retained = join(root, 'retained-build-artifact.bin');
    renameSync(artifact, retained);
    try {
      symlinkSync(retained, artifact, 'file');
    } catch (error) {
      expectUnsupportedLink(error);
      return;
    }
    expect(() => load()).toThrow(/links|single-link/i);
  });

  it('rejects a linked directory component even when it resolves inside the bundle', () => {
    const relayerDirectory = join(root, 'artifacts', 'relayer');
    const retainedDirectory = join(root, 'retained-relayer-artifacts');
    renameSync(relayerDirectory, retainedDirectory);
    try {
      symlinkSync(retainedDirectory, relayerDirectory, 'junction');
    } catch (error) {
      expectUnsupportedLink(error);
      return;
    }
    expect(() => load()).toThrow(/must not contain links/i);
  });

  it('rejects two semantic artifacts backed by one hard-linked file identity', () => {
    const target = artifactPath(root, 'relayerBuildArtifact');
    rmSync(target);
    try {
      linkSync(artifactPath(root, 'relayerPackageLock'), target);
    } catch (error) {
      expectUnsupportedLink(error);
      return;
    }
    expect(() => load()).toThrow(/single-link/i);
  });

  it('rejects one canonical artifact hard-linked to a file outside the bundle', () => {
    const outside = `${root}-outside-artifact.bin`;
    writeFileSync(outside, Buffer.from('outside-artifact', 'ascii'));
    const target = artifactPath(root, 'relayerBuildArtifact');
    rmSync(target);
    try {
      linkSync(outside, target);
      expect(() => load()).toThrow(/single-link/i);
    } catch (error) {
      if (error instanceof Error && /single-link/i.test(error.message)) {
        throw error;
      }
      expectUnsupportedLink(error);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it('rejects directories and artifacts outside the 16 MiB bound', () => {
    const target = artifactPath(root, 'relayerBuildArtifact');
    rmSync(target);
    mkdirSync(target);
    expect(() => load()).toThrow(/regular directories to a file/i);

    rmSync(target, { recursive: true });
    writeFileSync(target, Buffer.from('bounded-artifact', 'ascii'));
    truncateSync(target, 16 * 1024 * 1024 + 1);
    expect(() => load()).toThrow(/size is outside/i);
  });

  it('handles a partial descriptor read and rejects premature EOF or growth', () => {
    fsFault.mode = 'partial-read';
    expect(load().trustPins).toEqual(TRUST_PINS);

    resetFsFault('premature-eof');
    expect(() => load()).toThrow(/changed while it was being read/i);

    resetFsFault('growth');
    expect(() => load()).toThrow(/grew while it was being read/i);
  });

  it('rejects identity drift before open, after open and after completed read', () => {
    fsFault.targetPath = artifactPath(root, 'trackerTemplate');
    fsFault.mode = 'metadata-drift';
    expect(() => load()).toThrow(/changed after bundle resolution/i);

    resetFsFault('path-replacement', artifactPath(root, 'trackerTemplate'));
    expect(() => load()).toThrow(/changed after bundle resolution/i);

    resetFsFault('zero-identity', artifactPath(root, 'trackerTemplate'));
    expect(() => load()).toThrow(/single-link/i);

    resetFsFault(
      'post-open-metadata-drift',
      artifactPath(root, 'trackerTemplate'),
    );
    expect(() => load()).toThrow(/identity changed while it was being opened/i);

    resetFsFault(
      'post-read-path-replacement',
      artifactPath(root, 'trackerTemplate'),
    );
    expect(() => load()).toThrow(/identity changed while it was being opened/i);
  });

  it('rejects a request path that is a symbolic link', () => {
    const retained = join(root, 'retained-request.json');
    renameSync(requestPath, retained);
    try {
      symlinkSync(retained, requestPath, 'file');
    } catch (error) {
      expectUnsupportedLink(error);
      return;
    }
    expect(() => load()).toThrow(/single-link/i);
  });

  it('rejects suffixed env request names and explicit remote/device namespaces', () => {
    const sensitive = join(root, '.env.local');
    writeFileSync(sensitive, canonicalBytes(portableRequest()));
    expect(() => load(sensitive)).toThrow(/non-sensitive/i);

    for (const value of [
      '\\\\server\\share\\request.json',
      '\\\\?\\C:\\bundle\\request.json',
      'C:drive-relative-request.json',
    ]) {
      expect(() => load(value)).toThrow(/remote or device/i);
    }
  });

  it('requires trust pins to be exact own data properties', () => {
    expect(() => load(requestPath, {
      ...TRUST_PINS,
      approval: true,
    } as typeof TRUST_PINS)).toThrow(/unexpected fields/i);

    const pins = {
      get expectedTargetDescriptorDigestHex() {
        return TRUST_PINS.expectedTargetDescriptorDigestHex;
      },
      expectedSourceAttestationKeySetDigestHex:
        TRUST_PINS.expectedSourceAttestationKeySetDigestHex,
    };
    expect(() => load(requestPath, pins)).toThrow(/data property/i);
  });

  it('keeps ambient configuration, explicit network clients, persistence and execution capabilities out', () => {
    const source = readFileSync(new URL(
      './substrate-federated-isolated-devnet-portable-replay-files-v1.ts',
      import.meta.url,
    ), 'utf8');
    expect(source).not.toMatch(/node:http|node:https|axios|\bfetch\s*\(/);
    expect(source).not.toMatch(/process\.env|dotenv|config(?:uration)?-loader/i);
    expect(source).not.toMatch(/(?:ergo|sidechain)-client|state-tracker|database/i);
    expect(source).not.toMatch(/signer|submitter|broadcaster|profile-registry/i);
    expect(source).not.toMatch(/readFileSync\s*\(\s*descriptor/);
    expect(source).toMatch(/readSync\s*\(/);
  });
});

function load(
  path = requestPath,
  pins: Readonly<typeof TRUST_PINS> = TRUST_PINS,
) {
  return loadSubstrateFederatedIsolatedDevnetPortableReplayInputV1(path, pins);
}

function writeBundle(targetRoot: string): Readonly<Record<string, Buffer>> {
  const bytesByKey: Record<string, Buffer> = {};
  for (const [key, relativePath] of Object.entries(
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
  )) {
    const bytes = Buffer.from(`isolated-portable-artifact:${key}`, 'utf8');
    const path = join(targetRoot, ...relativePath.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    bytesByKey[key] = bytes;
  }
  return Object.freeze(bytesByKey);
}

function portableRequest(
  overrides: Readonly<Record<string, string>> = {},
) {
  return {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
    version: 1,
    files: {
      ...SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
      ...overrides,
    },
  };
}

function writeRequest(
  targetRoot: string,
  request: ReturnType<typeof portableRequest>,
  name = 'portable-replay-request.v1.json',
): string {
  const path = join(targetRoot, name);
  writeFileSync(path, canonicalBytes(request));
  return path;
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

function artifactPath(
  targetRoot: string,
  key: keyof typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
): string {
  return join(
    targetRoot,
    ...SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1[key]
      .split('/'),
  );
}

function expectUnsupportedLink(error: unknown): void {
  const code = (error as NodeJS.ErrnoException).code;
  expect(['EPERM', 'EACCES', 'UNKNOWN', 'ENOTSUP']).toContain(code);
}

function resetFsFault(mode = 'none', targetPath = ''): void {
  fsFault.mode = mode;
  fsFault.targetPath = targetPath;
  fsFault.targetLstatCalls = 0;
  fsFault.readFaulted = false;
}

function statWithOverrides(
  stat: Record<PropertyKey, unknown>,
  overrides: Readonly<Record<string, bigint>>,
): object {
  return new Proxy(stat, {
    get(target, property) {
      if (typeof property === 'string' && property in overrides) {
        return overrides[property];
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
