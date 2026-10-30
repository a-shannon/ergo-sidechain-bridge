import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { rootResult, extendedRootResult, fee, hex } from './test-support/substrate-federated-native-two-cycle-root-result.js';

import { canonicalJson, sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  loadSubstrateFederatedNativeTwoCycleInvocationV1,
  projectSubstrateFederatedNativeTwoCycleResultV1,
} from './substrate-federated-native-two-cycle-invocation-v1.js';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('native two-cycle invocation V1', () => {
  it.each([false, true])('binds copied Ergo selection %s without changing root inputs', enabled => {
    const fixture = invocationFixture();
    const original = loadSubstrateFederatedNativeTwoCycleInvocationV1(fixture.configPath);
    writeConfig(fixture.configPath, { ...fixture.config, captureCopiedErgoRecoverySelection: enabled });
    const loaded = loadSubstrateFederatedNativeTwoCycleInvocationV1(fixture.configPath);
    expect(loaded.config.captureCopiedErgoRecoverySelection).toBe(enabled);
    expect(loaded.configSha256Hex).not.toBe(original.configSha256Hex);
    expect(loaded.rootInput).toEqual(original.rootInput);
  });

  it.each([false, true])('keeps confirmation progress independent of copied selection %s', enabled => {
    const fixture = invocationFixture();
    const config = { ...fixture.config, captureCommittedReserveConfirmationProgress: true };
    writeConfig(fixture.configPath, config);
    const original = loadSubstrateFederatedNativeTwoCycleInvocationV1(fixture.configPath);
    writeConfig(fixture.configPath, { ...config, captureCopiedErgoRecoverySelection: enabled });
    const loaded = loadSubstrateFederatedNativeTwoCycleInvocationV1(fixture.configPath);
    expect(loaded.config.captureCopiedErgoRecoverySelection).toBe(enabled);
    expect(loaded.rootInput).toEqual(original.rootInput);
    expect(loaded.rootInput.captureCommittedReserveConfirmationProgress).toBe(true);
  });

  it.each([null, 0, 1, 'true', 'false', [], {}])('refuses non-Boolean copied selection %j', value => {
    const fixture = invocationFixture();
    writeConfig(fixture.configPath, { ...fixture.config, captureCopiedErgoRecoverySelection: value });
    expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(fixture.configPath))
      .toThrow(/selection option must be Boolean/);
    expect(existsSync(join(fixture.config.outputParentDirectory, fixture.config.attemptName))).toBe(false);
  });

  it.each([false, true])('binds explicit confirmation progress %s to config bytes', enabled => {
    const fixture = invocationFixture();
    const original = loadSubstrateFederatedNativeTwoCycleInvocationV1(fixture.configPath);
    const config = { ...fixture.config, captureCommittedReserveConfirmationProgress: enabled };
    writeConfig(fixture.configPath, config);
    const loaded = loadSubstrateFederatedNativeTwoCycleInvocationV1(fixture.configPath);
    expect(loaded.config).toEqual(config);
    expect(loaded.configSha256Hex).not.toBe(original.configSha256Hex);
    if (enabled) expect(loaded.rootInput.captureCommittedReserveConfirmationProgress).toBe(true);
    else expect(loaded.rootInput).toEqual(original.rootInput);
  });

  it.each([null, 0, 1, 'true', 'false', [], {}])(
    'refuses a non-Boolean confirmation progress option %j before effects', value => {
      const fixture = invocationFixture();
      writeConfig(fixture.configPath, { ...fixture.config, captureCommittedReserveConfirmationProgress: value });
      expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(fixture.configPath))
        .toThrow(/option must be Boolean/);
    });

  it('loads only the exact canonical fixed-profile config', () => {
    const fixture = invocationFixture();
    const loaded = loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
    );
    expect(loaded.config).toEqual(fixture.config);
    expect(loaded.attemptPath).toBe(join(
      fixture.config.outputParentDirectory,
      fixture.config.attemptName,
    ));
    expect(loaded.rootInput.frontierBuild.bridgeRoot)
      .toBe(fixture.config.bridgeRoot);
    expect(loaded.rootInput.ergoBuild.worktreeRoot)
      .toBe(fixture.config.bridgeRoot);
  });

  it('preserves the exact bytes of readable JSON configuration', () => {
    const fixture = invocationFixture();
    const bytes = Buffer.from(`${JSON.stringify(fixture.config, null, 2)}\n`, 'utf8');
    writeFileSync(fixture.configPath, bytes);
    const loaded = loadSubstrateFederatedNativeTwoCycleInvocationV1(fixture.configPath);
    expect(loaded.config).toEqual(fixture.config);
    expect(Buffer.from(loaded.configBytes)).toEqual(bytes);
  });

  it('rejects duplicate keys, extra keys and occupied attempts', () => {
    const fixture = invocationFixture();
    writeFileSync(
      fixture.configPath,
      '{"schema":"x","schema":"y"}\n',
      'utf8',
    );
    expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
    )).toThrow(/duplicate/iu);

    writeConfig(fixture.configPath, { ...fixture.config, extra: true });
    expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
    )).toThrow(/fields differ/iu);

    writeConfig(fixture.configPath, fixture.config);
    mkdirSync(join(
      fixture.config.outputParentDirectory,
      fixture.config.attemptName,
    ));
    expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
    )).toThrow(/must be absent/iu);
  });

  it('rejects wrong identity, bounds, commit form and non-absolute paths', () => {
    const fixture = invocationFixture();
    for (const invalid of [
      { ...fixture.config, schema: 'e2s.wrong' },
      { ...fixture.config, version: 2 },
      { ...fixture.config, profile: 'caller-selected' },
      { ...fixture.config, expectedBridgeCommit: 'A'.repeat(40) },
      { ...fixture.config, attemptName: 'a'.repeat(65) },
      { ...fixture.config, frontierSourcePath: 'relative-frontier' },
    ]) {
      writeConfig(fixture.configPath, invalid);
      expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(
        fixture.configPath,
      )).toThrow();
    }

    writeConfig(fixture.configPath, fixture.config);
    const attemptPath = join(
      fixture.config.outputParentDirectory,
      fixture.config.attemptName,
    );
    const differentAttempt = directory(fixture.root, 'different-attempt');
    mkdirSync(attemptPath);
    expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(
      fixture.configPath,
      differentAttempt,
    )).toThrow(/differs from the captured config/iu);
  });

  it('rejects attempt overlap and reparse aliases', ({ skip }) => {
    if (process.platform !== 'win32') skip();
    const overlap = invocationFixture();
    const outputInsideBridge = join(overlap.config.bridgeRoot, 'attempts');
    mkdirSync(outputInsideBridge);
    writeConfig(overlap.configPath, {
      ...overlap.config,
      outputParentDirectory: outputInsideBridge,
    });
    expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(
      overlap.configPath,
    )).toThrow(/must not overlap/iu);

    const linked = invocationFixture();
    const alias = join(linked.root, 'frontier-alias');
    symlinkSync(linked.config.frontierSourcePath, alias, 'junction');
    writeConfig(linked.configPath, {
      ...linked.config,
      frontierSourcePath: alias,
    });
    expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(
      linked.configPath,
    )).toThrow(/symbolic link or junction/iu);
  });

  it('projects one exact path-free two-cycle result', () => {
    const result = rootResult();
    const projected = projectSubstrateFederatedNativeTwoCycleResultV1(result);
    expect(projected.status).toBe('two_cycle_local_synthetic_execution_completed');
    expect(projected.checks.completedCycles).toBe(2);
    expect(projected.firstCycle.mintIdentityHex)
      .not.toBe(projected.secondCycle.mintIdentityHex);
    expect(projected.boundaries.releaseReadinessEstablished).toBe(false);
    expect(projected.rootResultDigestHex).toBe(sha256CanonicalJson(
      result, 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_RESULT_V1',
    ));
  });

  it('normalizes exactly the recovery pointer and two tracker digests to frozen V1', () => {
    const legacy = rootResult();
    const extended = extendedRootResult();
    const before = structuredClone(extended);
    const projected = projectSubstrateFederatedNativeTwoCycleResultV1(extended);
    expect(projected).toEqual(projectSubstrateFederatedNativeTwoCycleResultV1(legacy));
    expect(extended).toEqual(before);
    expect(projected).not.toHaveProperty('recoveryEvidence');
    expect(projected.firstCycle).not.toHaveProperty('durableAttemptDigestHex');
    expect(projected.secondCycle).not.toHaveProperty('durableAttemptDigestHex');

    extended.recoveryEvidence.directoryName = 'two-cycle-recovery-X9y8Z7';
    extended.recoveryEvidence.buildDirectoryName = 'bridge-fed-genesis-X9y8Z7';
    extended.recoveryEvidence.manifestSha256Hex = hex(204);
    extended.withdrawal.tracker.durableAttemptDigestHex = hex(205);
    extended.secondCycle.tracker.durableAttemptDigestHex = hex(206);
    expect(projectSubstrateFederatedNativeTwoCycleResultV1(extended)).toEqual(projected);
  });

  it.each([
    { buildDirectoryName: '../bridge-fed-genesis-Ab3D4e' },
    { buildDirectoryName: '/bridge-fed-genesis-Ab3D4e' },
    { buildDirectoryName: 'C:\\bridge-fed-genesis-Ab3D4e' },
    { buildDirectoryName: 'bridge-fed-genesis-Ab3D4e/target' },
    { buildDirectoryName: 'bridge-fed-genesis-Ab3D4e\\target' },
    { buildDirectoryName: 'bridge-fed-genesis-Ab3D4' },
    { buildDirectoryName: 'bridge-fed-genesis-Ab3D4e7' },
    { buildDirectoryName: 'bridge-fed-genesis-Ab3D4-' },
    { buildDirectoryName: 'bridge-fed-genesis-Ab3D4é' },
    { buildDirectoryName: 'bridge-fed-genesis-Ab3D4e\n' },
    { directoryName: '../two-cycle-recovery-Ab3D4e' },
    { directoryName: '/two-cycle-recovery-Ab3D4e' },
    { directoryName: 'C:\\two-cycle-recovery-Ab3D4e' },
    { directoryName: 'two-cycle-recovery-Ab3D4e/child' },
    { directoryName: 'two-cycle-recovery-Ab3D4e\\child' },
    { directoryName: 'two-cycle-recovery-Ab3D4' },
    { directoryName: 'two-cycle-recovery-Ab3D4e7' },
    { directoryName: 'two-cycle-recovery-Ab3D4-' },
    { directoryName: 'two-cycle-recovery-Ab3D4é' },
    { directoryName: 'two-cycle-recovery-Ab3D4e\n' },
    { manifestSha256Hex: 'A'.repeat(64) },
    { manifestSha256Hex: '0x' + hex(203) },
    { manifestSha256Hex: 'a'.repeat(63) },
    { manifestSha256Hex: hex(203) + '\n' },
    { manifestSha256Hex: 1 },
    { extra: true },
    { manifest: {} },
  ])('rejects an invalid recovery pointer %j', mutation => {
    const result = extendedRootResult();
    Object.assign(result.recoveryEvidence, mutation);
    expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(result))
      .toThrow(/relative (?:capture|build) name|lowercase hexadecimal|fields differ/iu);
  });

  it.each(['first', 'second'] as const)(
    'requires the %s tracker digest only in the exact extended root', cycleName => {
      const select = <T extends ReturnType<typeof rootResult>>(result: T) =>
        cycleName === 'first' ? result.withdrawal.tracker : result.secondCycle.tracker;
      const legacy = rootResult();
      Object.assign(select(legacy), { durableAttemptDigestHex: hex(203) });
      expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(legacy))
        .toThrow(/tracker fields differ/iu);

      for (const mutation of ['missing', 'extra', 'uppercase', 'short', 'non-string', 'newline']) {
        const result = extendedRootResult();
        const tracker = select(result);
        if (mutation === 'missing') Reflect.deleteProperty(tracker, 'durableAttemptDigestHex');
        if (mutation === 'extra') Object.assign(tracker, { extra: true });
        if (mutation === 'uppercase') Object.assign(tracker, { durableAttemptDigestHex: 'A'.repeat(64) });
        if (mutation === 'short') Object.assign(tracker, { durableAttemptDigestHex: 'a'.repeat(63) });
        if (mutation === 'non-string') Object.assign(tracker, { durableAttemptDigestHex: 1 });
        if (mutation === 'newline') Object.assign(tracker, { durableAttemptDigestHex: hex(203) + '\n' });
        expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(result))
          .toThrow(/tracker fields differ|lowercase hexadecimal/iu);
      }
    },
  );

  it.each(['buildDirectoryName', 'directoryName', 'manifestSha256Hex'] as const)(
    'requires recovery pointer field %s', key => {
      const result = extendedRootResult();
      Reflect.deleteProperty(result.recoveryEvidence, key);
      expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(result))
        .toThrow(/recovery evidence fields differ/iu);
    },
  );

  it.each(['root', 'pointer', 'withdrawal', 'second', 'first-tracker', 'second-tracker'] as const)(
    'rejects extra %s fields before traversing their values', location => {
      const result = extendedRootResult();
      const targets = {
        root: result,
        pointer: result.recoveryEvidence,
        withdrawal: result.withdrawal,
        second: result.secondCycle,
        'first-tracker': result.withdrawal.tracker,
        'second-tracker': result.secondCycle.tracker,
      };
      const extra: Record<string, unknown> = {};
      extra.self = extra;
      Object.assign(targets[location], { extra });
      expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(result))
        .toThrow(/fields differ/iu);
    },
  );

  it.each([
    'recoveryEvidence', 'buildDirectoryName', 'directoryName', 'manifestSha256Hex', 'withdrawal',
    'first-tracker', 'first-digest', 'secondCycle', 'second-tracker', 'second-digest',
  ] as const)('rejects %s accessors without executing them', location => {
    const result = extendedRootResult();
    let target: object = result;
    let key: string = location;
    if (location === 'buildDirectoryName' || location === 'directoryName' || location === 'manifestSha256Hex') {
      target = result.recoveryEvidence;
    } else if (location === 'first-tracker') {
      target = result.withdrawal; key = 'tracker';
    } else if (location === 'second-tracker') {
      target = result.secondCycle; key = 'tracker';
    } else if (location === 'first-digest' || location === 'second-digest') {
      target = location === 'first-digest' ? result.withdrawal.tracker : result.secondCycle.tracker;
      key = 'durableAttemptDigestHex';
    }
    let calls = 0;
    Object.defineProperty(target, key, {
      enumerable: true, get: () => { calls++; throw new Error('getter executed'); },
    });
    expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(result))
      .toThrow(/fields differ/iu);
    expect(calls).toBe(0);
  });

  it.each(['frontierBuildParentDirectory', 'frontierCargoHomeDirectory'] as const)(
    'rejects %s inside repository, source or the other mutable root', field => {
      const fixture = invocationFixture();
      for (const parent of [fixture.config.bridgeRoot, join(fixture.config.bridgeRoot, '.git'),
        fixture.config.frontierSourcePath, fixture.config.ergoSourcePath,
        field === 'frontierBuildParentDirectory'
          ? fixture.config.frontierCargoHomeDirectory : fixture.config.frontierBuildParentDirectory]) {
        const nested = directory(parent, 'mutable-child');
        writeConfig(fixture.configPath, { ...fixture.config, [field]: nested });
        expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(fixture.configPath))
          .toThrow(/must not overlap/iu);
      }
    },
  );

  it('requires the original config outside the checkout and the worker copy at its exact path', () => {
    const fixture = invocationFixture();
    const inside = join(fixture.config.bridgeRoot, 'config.json');
    writeConfig(inside, fixture.config);
    expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(inside))
      .toThrow(/outside the checkout/iu);
    const attempt = directory(fixture.config.outputParentDirectory, fixture.config.attemptName);
    expect(() => loadSubstrateFederatedNativeTwoCycleInvocationV1(fixture.configPath, attempt))
      .toThrow(/captured attempt config/iu);
    const captured = join(attempt, 'config.json');
    writeConfig(captured, fixture.config);
    expect(loadSubstrateFederatedNativeTwoCycleInvocationV1(captured, attempt).attemptPath)
      .toBe(attempt);
  });

  it('rejects one-cycle, substituted, extra and path-bearing results', () => {
    const oneCycle = structuredClone(rootResult());
    oneCycle.completedCycles = 1 as unknown as 2;
    expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(oneCycle))
      .toThrow(/fixed profile/iu);

    const substituted = structuredClone(rootResult());
    substituted.secondCycle.pegIn.mintIdentityHex =
      substituted.pegIn.mintIdentityHex;
    substituted.secondCycle.mint.mintIdentityHex =
      substituted.pegIn.mintIdentityHex;
    expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(substituted))
      .toThrow(/must be distinct/iu);

    const extra = { ...rootResult(), extra: true };
    expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(extra))
      .toThrow(/fields differ/iu);

    const pathBearing = structuredClone(rootResult());
    Object.assign(pathBearing.frontierProcess, { diagnostic: 'C:\\private\\runtime.log' });
    expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(pathBearing))
      .toThrow(/unsupported string/iu);
  });

  it.each(['sparse', 'extra', 'accessor'] as const)(
    'rejects a %s array before projecting a result', kind => {
      const result = rootResult();
      const values = result.issuanceInputBoxIds;
      if (kind === 'sparse') delete values[0];
      if (kind === 'extra') Object.defineProperty(values, 'extra', { value: true });
      if (kind === 'accessor') Object.defineProperty(values, '0', {
        enumerable: true, get: () => { throw new Error('accessor must not execute'); },
      });
      expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(result))
        .toThrow(/sparse or extended array|hidden or accessor fields/iu);
    },
  );

  it('rejects a first-cycle fee box from another funding transaction', () => {
    const result = rootResult();
    result.withdrawal.feeFunding.withdrawal.feeInputBox.transactionId = hex(200);
    expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(result))
      .toThrow(/input box differs from its funding transaction/iu);
  });

  it('requires a full fee box in the first cycle', () => {
    const result = rootResult();
    Object.assign(result.withdrawal.feeFunding, { withdrawal: fee(21) });
    expect(() => projectSubstrateFederatedNativeTwoCycleResultV1(result))
      .toThrow(/first cycle return withdrawal fee fields differ/iu);
  });
});

function invocationFixture() {
  // Hosted Windows TEMP may use an alias; fixtures must supply canonical paths.
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'e2s-native-two-cycle-')));
  temporaryRoots.push(root);
  const bridgeRoot = directory(root, 'bridge');
  directory(bridgeRoot, '.git');
  const frontierSourcePath = directory(root, 'frontier-source');
  const frontierBuildParentDirectory = directory(root, 'frontier-builds');
  const frontierCargoHomeDirectory = directory(root, 'cargo-home');
  const ergoSourcePath = directory(root, 'ergo-source');
  const outputParentDirectory = directory(root, 'attempts');
  const tools = directory(root, 'tools');
  const javaHome = directory(tools, 'java');
  const javaBin = directory(javaHome, 'bin');
  const config = {
    schema: 'e2s.substrate-federated-native-two-cycle-invocation.v1' as const,
    version: 1 as const,
    profile: 'synthetic-loopback-two-cycle' as const,
    expectedBridgeCommit: '1'.repeat(40),
    bridgeRoot,
    frontierSourcePath,
    frontierBuildParentDirectory,
    frontierCargoHomeDirectory,
    frontierCargoExecutablePath: file(tools, 'cargo.exe'),
    frontierRustcExecutablePath: file(tools, 'rustc.exe'),
    frontierGitExecutablePath: file(tools, 'git.exe'),
    frontierProtocExecutablePath: file(tools, 'protoc.exe'),
    ergoSourcePath,
    ergoGitExecutablePath: join(tools, 'git.exe'),
    ergoJavaExecutablePath: file(javaBin, 'java.exe'),
    ergoSbtLauncherJarPath: file(tools, 'sbt-launch.jar'),
    outputParentDirectory,
    attemptName: 'fresh-attempt-1',
  };
  const configPath = join(root, 'config.json');
  writeConfig(configPath, config);
  return { root, config, configPath };
}

function directory(root: string, name: string): string {
  const path = join(root, name);
  mkdirSync(path);
  return path;
}

function file(root: string, name: string): string {
  const path = join(root, name);
  writeFileSync(path, `${name}\n`, 'utf8');
  return path;
}

function writeConfig(path: string, value: unknown): void {
  writeFileSync(path, `${canonicalJson(value)}\n`, 'utf8');
}
