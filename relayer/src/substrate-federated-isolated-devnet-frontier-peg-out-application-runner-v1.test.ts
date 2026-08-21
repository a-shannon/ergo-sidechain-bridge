import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BoundedProcessExitError } from './pinned-local-native-verifier-build.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1Provenance,
  buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV1,
  preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1,
  restoreExactSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationSourceV1,
  runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1,
} from './substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const bridgeRoot = path.resolve(sourceDirectory, '..', '..');
const requiredIntegrationEnvironment = [
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_SOURCE',
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_TEMP_ROOT',
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_CARGO_CACHE',
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_CARGO',
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_RUSTC',
  'BRIDGE_FRONTIER_APPLICATION_RUNNER_GIT',
] as const;
const integrationEnabled = requiredIntegrationEnvironment.every(
  name => process.env[name] !== undefined,
);

describe('federated isolated-devnet Frontier peg-out application runner V1', () => {
  it('requires offline execution and an exact input shape', () => {
    expect(() => preflight({
      ...syntheticInput(),
      offline: false,
    } as never))
      .toThrow(/requires offline Cargo/u);
    expect(() => preflight({
      ...syntheticInput(),
      authority: true,
    } as never)).toThrow(/must contain exactly/u);
  });

  it('refuses to apply the overlay inside the bridge worktree', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'e2s-runner-root-'));
    try {
      expect(() => preflight({
        ...syntheticInput(),
        frontierSourceDirectory: path.join(bridgeRoot, 'substrate-node'),
        temporaryDirectoryRoot: temporaryRoot,
        cargoDependencyCacheDirectory: temporaryRoot,
      })).toThrow(/refuses to mutate the bridge worktree/u);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('requires the source, build root, and dependency cache to stay outside the worktree', () => {
    const sourceRoot = mkdtempSync(path.join(tmpdir(), 'e2s-frontier-source-root-'));
    const source = mkdtempSync(path.join(sourceRoot, 'source-'));
    const separateRoot = mkdtempSync(path.join(tmpdir(), 'e2s-runner-root-'));
    try {
      expect(() => preflight({
        ...syntheticInput(),
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: path.join(bridgeRoot, 'substrate-node'),
        cargoDependencyCacheDirectory: separateRoot,
      })).toThrow(/external temporary root/u);
      expect(() => preflight({
        ...syntheticInput(),
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: sourceRoot,
        cargoDependencyCacheDirectory: path.join(bridgeRoot, 'substrate-node'),
      })).toThrow(/external Cargo dependency cache/u);
      expect(() => preflight({
        ...syntheticInput(),
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: separateRoot,
        cargoDependencyCacheDirectory: sourceRoot,
      })).toThrow(/source must be inside its external temporary root/u);
    } finally {
      rmSync(sourceRoot, { recursive: true, force: true });
      rmSync(separateRoot, { recursive: true, force: true });
    }
  });

  it('canonicalizes one external scratch plan without creating authority', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'e2s-runner-root-'));
    const source = mkdtempSync(path.join(temporaryRoot, 'source-'));
    try {
      const plan = preflight({
        ...syntheticInput(),
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: temporaryRoot,
        cargoDependencyCacheDirectory: temporaryRoot,
      });
      expect(plan).toEqual({
        frontierSourceDirectory: source,
        temporaryDirectoryRoot: temporaryRoot,
        cargoDependencyCacheDirectory: temporaryRoot,
        cargoExecutablePath: process.execPath,
        rustcExecutablePath: process.execPath,
        gitExecutablePath: process.execPath,
        offline: true,
      });
      expect(Object.isFrozen(plan)).toBe(true);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('builds the exact application-specific mint reservation environment', () => {
    const environment =
      buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV1();
    expect(environment).toMatchObject({
      BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX:
        '0x9b0b09bad81ef29e8d132786a8bfb27dc5ccc8444403b2ad4354c9b578c664ba',
      BRIDGE_LAB_FEDERATED_MINT_IDENTITY_V4_HEX:
        '0x12e324cd5af496b2e9de353ad80a5dc2d778e655ef3df2960d6c5dce0d62f704',
    });
    expect(environment.BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_V4_HEX)
      .toHaveLength(2 + 603 * 2);
    expect(environment.BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_ID_V4_HEX)
      .toBe('0x93473aa29d814e70310349dc74ac8ff67982381def2adaa1435a24c81ad78d01');
    expect(Object.isFrozen(environment)).toBe(true);
  });

  it('restores the exact source snapshot when Git reversal fails', async () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'e2s-overlay-restore-'));
    const sourcePath = path.join(temporaryRoot, 'source.rs');
    const original = Buffer.from('original source\r\n', 'utf8');
    const applied = Buffer.from('overlay source\r\n', 'utf8');
    writeFileSync(sourcePath, applied);
    try {
      const result =
        await restoreExactSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationSourceV1({
          sourcePath,
          originalSourceBytes: original,
          expectedAppliedSourceLfSha256: createHash('sha256')
            .update('overlay source\n', 'utf8')
            .digest('hex'),
          reverseOverlay: async () => {
            throw new Error('injected reversal failure');
          },
        });
      expect(result).toBe('snapshot_fallback');
      expect(readFileSync(sourcePath)).toEqual(original);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('does not overwrite unrecognized source drift during restoration', async () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'e2s-overlay-drift-'));
    const sourcePath = path.join(temporaryRoot, 'source.rs');
    const drifted = Buffer.from('concurrent drift\n', 'utf8');
    writeFileSync(sourcePath, drifted);
    try {
      await expect(
        restoreExactSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationSourceV1({
          sourcePath,
          originalSourceBytes: Buffer.from('original source\n', 'utf8'),
          expectedAppliedSourceLfSha256: createHash('sha256')
            .update('overlay source\n', 'utf8')
            .digest('hex'),
          reverseOverlay: async () => undefined,
        }),
      ).rejects.toThrow(/unexpected bytes before restoration/u);
      expect(readFileSync(sourcePath)).toEqual(drifted);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it.runIf(integrationEnabled)(
    'applies, executes, consumes, and reverses the exact application overlay',
    async () => {
      let receipt;
      try {
        receipt =
          await runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1(
            integrationInput(),
          );
      } catch (error) {
        if (error instanceof BoundedProcessExitError) {
          process.stderr.write(error.stderr);
        }
        throw error;
      }
      expect(receipt.status).toBe('same_process_application_burn_executed');
      expect(receipt.applicationEvidence.status)
        .toBe('local_application_burn_transcript_validated');
      expect(receipt.checks).toMatchObject({
        exactSourceBaselineRevalidatedBeforeAndAfter: true,
        overlayAppliedOnlyForBoundedExecution: true,
        exactNamedCargoTestPassedOnce: true,
        sameProcessCargoExecutionProvenanceEstablished: true,
        pureApplicationEvidenceConsumedInSameProcess: true,
      });
      expect(receipt.boundary).toMatchObject({
        callerSuppliedStdoutAccepted: false,
        sidechainFinalityEstablished: false,
        trackerAdmissionEstablished: false,
        globalReplayInsertionEstablished: false,
        payoutAuthorized: false,
        broadcastAuthorized: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      });
      assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1Provenance(
        receipt,
      );
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1Provenance({
          ...receipt,
        })
      ).toThrow(/lacks process provenance/u);
    },
    45 * 60_000,
  );

  it.runIf(integrationEnabled)(
    'restores the source when post-application Cargo isolation rejects',
    async () => {
      const input = integrationInput();
      const cargoConfigDirectory = path.join(
        input.temporaryDirectoryRoot,
        '.cargo',
      );
      if (existsSync(cargoConfigDirectory)) {
        throw new Error('integration temporary root must not contain .cargo');
      }
      const sourcePath = path.join(
        input.frontierSourceDirectory,
        'template',
        'node',
        'src',
        'bridge_federated_lab_reservation_tests.rs',
      );
      const sourceBefore = readFileSync(sourcePath);
      mkdirSync(cargoConfigDirectory);
      writeFileSync(
        path.join(cargoConfigDirectory, 'config.toml'),
        '[net]\noffline = true\n',
        'utf8',
      );
      try {
        await expect(
          runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1(
            input,
          ),
        ).rejects.toThrow(/Cargo configuration must be absent/u);
        expect(readFileSync(sourcePath)).toEqual(sourceBefore);
      } finally {
        rmSync(cargoConfigDirectory, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

function preflight(value: Parameters<
  typeof preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1
>[0]) {
  return preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1(
    value,
  );
}

function syntheticInput() {
  return {
    frontierSourceDirectory: tmpdir(),
    temporaryDirectoryRoot: tmpdir(),
    cargoDependencyCacheDirectory: tmpdir(),
    cargoExecutablePath: process.execPath,
    rustcExecutablePath: process.execPath,
    gitExecutablePath: process.execPath,
    offline: true as const,
  };
}

function integrationInput() {
  const value = (name: typeof requiredIntegrationEnvironment[number]): string => {
    const selected = process.env[name];
    if (selected === undefined) throw new Error(`${name} is required`);
    return selected;
  };
  return {
    frontierSourceDirectory: value('BRIDGE_FRONTIER_APPLICATION_RUNNER_SOURCE'),
    temporaryDirectoryRoot: value('BRIDGE_FRONTIER_APPLICATION_RUNNER_TEMP_ROOT'),
    cargoDependencyCacheDirectory: value(
      'BRIDGE_FRONTIER_APPLICATION_RUNNER_CARGO_CACHE',
    ),
    cargoExecutablePath: value('BRIDGE_FRONTIER_APPLICATION_RUNNER_CARGO'),
    rustcExecutablePath: value('BRIDGE_FRONTIER_APPLICATION_RUNNER_RUSTC'),
    gitExecutablePath: value('BRIDGE_FRONTIER_APPLICATION_RUNNER_GIT'),
    offline: true as const,
  };
}
