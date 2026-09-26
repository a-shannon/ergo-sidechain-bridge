import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1,
  validateSubstrateFederatedAuthoritySafeRustSrcLockV1,
} from './substrate-federated-authority-safe-devnet-rust-src-v1.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const roots: string[] = [];
const OBSERVATION = Object.freeze({
  cargoManifestSha256Hex:
    '8087c942d4595535495a8b9e90028693bf0028a156449807ee017979cafbd08e',
  cargoLockSha256Hex:
    'de6cdc3b08816eeed333936c31b81bc19be043596a75042afff6b5c81e35f210',
});

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('authority-safe Frontier rust-src V1', () => {
  it('accepts only the exact Rust 1.82 source identities and boundaries', () => {
    expect(validateSubstrateFederatedAuthoritySafeRustSrcLockV1(
      lock(),
      OBSERVATION,
    )).toEqual([]);

    const wrongCargoLock = lock();
    wrongCargoLock.cargoLockSha256 = '0'.repeat(64);
    expect(validateSubstrateFederatedAuthoritySafeRustSrcLockV1(
      wrongCargoLock,
      OBSERVATION,
    )).toContain('rust-src Cargo lock SHA-256 differs from the observation');

    const promoted = lock();
    promoted.boundaries.admissionEligible = true;
    expect(validateSubstrateFederatedAuthoritySafeRustSrcLockV1(
      promoted,
      OBSERVATION,
    )).toContain('rust-src lock must keep admissionEligible false');
  });

  it('rejects a missing Rust compiler without disclosing its absolute path', () => {
    const root = temporaryDirectory();
    const missingRustc = join(root, 'sensitive-local-tooling', 'rustc.exe');

    expect(expectCapturedError(() =>
      inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1({
        bridgeRoot: BRIDGE_ROOT,
        rustcExecutablePath: missingRustc,
      }), 'Rust compiler executable must be one explicit absolute regular file',
    )).not.toContain(missingRustc);
  });

  it('rejects a missing derived rust-src tree without disclosing its path', () => {
    const root = temporaryDirectory();
    const bin = join(root, 'toolchain', 'bin');
    mkdirSync(bin, { recursive: true });
    const rustc = join(bin, process.platform === 'win32' ? 'rustc.exe' : 'rustc');
    writeFileSync(rustc, 'fixture');

    expect(expectCapturedError(() =>
      inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1({
        bridgeRoot: BRIDGE_ROOT,
        rustcExecutablePath: rustc,
      }), 'pinned Rust standard-library source must be one absolute directory',
    )).not.toContain(root);
  });
});

function temporaryDirectory(): string {
  const root = mkdtempSync(join(tmpdir(), 'fed-rust-src-v1-'));
  roots.push(root);
  return root;
}

function expectCapturedError(action: () => unknown, message: string): string {
  try {
    action();
  } catch (error) {
    const actual = error instanceof Error ? error.message : String(error);
    expect(actual).toBe(message);
    return actual;
  }
  throw new Error('expected action to reject');
}

function lock(): {
  schemaVersion: number;
  kind: string;
  nativeVerifierToolchainLockSha256: string;
  libraryRelativePath: string;
  cargoManifestSha256: string;
  cargoLockSha256: string;
  boundaries: Record<string, boolean>;
} {
  return {
    schemaVersion: 1,
    kind: 'substrate-federated-authority-safe-devnet-rust-src-lock',
    nativeVerifierToolchainLockSha256:
      '2480775ab0f14b3389a021e2645e0e082d81ebaaef3e797063fb14d18e67f189',
    libraryRelativePath: 'lib/rustlib/src/rust/library',
    cargoManifestSha256: OBSERVATION.cargoManifestSha256Hex,
    cargoLockSha256: OBSERVATION.cargoLockSha256Hex,
    boundaries: {
      exactRustcLayoutRequired: true,
      cargoManifestDigestRequired: true,
      cargoLockDigestRequired: true,
      beforeAfterObservationRequired: true,
      completeBuildToolClosureVerifiedByThisLock: false,
      dependencyCacheContentAttestedByThisLock: false,
      independentBuildAttestationVerifiedByThisLock: false,
      localConformanceOnly: true,
      admissionEligible: false,
    },
  };
}
