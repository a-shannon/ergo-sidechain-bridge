import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  inspectSubstrateFederatedAuthoritySafePinnedProtocV1,
  validateSubstrateFederatedAuthoritySafeProtocLockV1,
} from './substrate-federated-authority-safe-devnet-protoc-v1.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const roots: string[] = [];
const OBSERVATION = Object.freeze({
  platformKey: 'win32-x64',
  version: 'libprotoc 35.0',
  sha256Hex: '1e5e6cee88d61bed799dd45aa5b45b61f5f30398f15153cd61a8d155b8b8e087',
});

afterEach(() => {
  vi.unstubAllEnvs();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('authority-safe Frontier Protobuf compiler V1', () => {
  it('accepts only the exact platform profile and conservative boundaries', () => {
    expect(validateSubstrateFederatedAuthoritySafeProtocLockV1(
      lock(),
      OBSERVATION,
    )).toEqual([]);

    const wrongVersion = lock();
    wrongVersion.profiles['win32-x64']!.version = 'libprotoc 34.0';
    expect(validateSubstrateFederatedAuthoritySafeProtocLockV1(
      wrongVersion,
      OBSERVATION,
    )).toContain('Protobuf compiler version differs from the observation');

    const promoted = lock();
    promoted.boundaries.admissionEligible = true;
    expect(validateSubstrateFederatedAuthoritySafeProtocLockV1(
      promoted,
      OBSERVATION,
    )).toContain('Protobuf compiler lock must keep admissionEligible false');
  });

  it('requires one explicit absolute PROTOC path before inspecting the tool', () => {
    const cwd = temporaryDirectory();
    vi.stubEnv('PROTOC', '');
    expect(() => inspectSubstrateFederatedAuthoritySafePinnedProtocV1({
      bridgeRoot: BRIDGE_ROOT,
      cwd,
    })).toThrow(/PROTOC executable must be one explicit absolute regular file/i);
  });

  it('rejects a missing PROTOC file without disclosing its absolute path', () => {
    const cwd = temporaryDirectory();
    const missing = join(cwd, 'sensitive-local-tooling', 'protoc.exe');
    vi.stubEnv('PROTOC', missing);

    const message = captureError(() =>
      inspectSubstrateFederatedAuthoritySafePinnedProtocV1({
        bridgeRoot: BRIDGE_ROOT,
        cwd,
      }));
    expect(message).toBe(
      'PROTOC executable must be one explicit absolute regular file',
    );
    expect(message).not.toContain(missing);
  });

  it('rejects an explicit executable whose bytes or version do not match the lock', () => {
    const cwd = temporaryDirectory();
    vi.stubEnv('PROTOC', process.execPath);
    expect(() => inspectSubstrateFederatedAuthoritySafePinnedProtocV1({
      bridgeRoot: BRIDGE_ROOT,
      cwd,
    })).toThrow(/Protobuf compiler differs from its pin/i);
  });
});

function temporaryDirectory(): string {
  const root = mkdtempSync(join(tmpdir(), 'fed-protoc-v1-'));
  roots.push(root);
  return root;
}

function captureError(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected action to reject');
}

function lock(): {
  schemaVersion: number;
  kind: string;
  profiles: Record<string, { version: string; sha256: string }>;
  boundaries: Record<string, boolean>;
} {
  return {
    schemaVersion: 1,
    kind: 'substrate-federated-authority-safe-devnet-protoc-lock',
    profiles: {
      'win32-x64': {
        version: OBSERVATION.version,
        sha256: OBSERVATION.sha256Hex,
      },
    },
    boundaries: {
      explicitEnvironmentPathRequired: true,
      absoluteToolPathRequired: true,
      toolDigestRequired: true,
      toolVersionRequired: true,
      unsupportedPlatformsFailClosed: true,
      completeBuildToolClosureVerifiedByThisLock: false,
      dependencyCacheContentAttestedByThisLock: false,
      independentBuildAttestationVerifiedByThisLock: false,
      localConformanceOnly: true,
      admissionEligible: false,
    },
  };
}
