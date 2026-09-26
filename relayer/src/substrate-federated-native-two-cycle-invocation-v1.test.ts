import {
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

import { canonicalJson } from './ergo-settlement-core/strict-json.js';
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

function rootResult() {
  const cycleOne = cycle(1);
  const cycleTwo = cycle(2);
  return {
    status: 'fresh-federated-round-trip-confirmed',
    nativeGenesisHashHex: hex(10, true),
    typedGenesisSha256Hex: hex(11),
    rawSpecSha256Hex: hex(12),
    runtimeProfileIdHex: hex(13),
    familyIdHex: hex(14),
    sourceProofProfileIdHex: hex(15),
    nodeSha256Hex: hex(16),
    wasmSha256Hex: hex(17),
    operatorAddressHex: `0x${'12'.repeat(20)}`,
    storageKeysChecked: 6,
    issuanceInputBoxIds: [hex(18), hex(19), hex(20)],
    issuedTransactions: ['tracker', 'duplicatePrevention', 'pooledReserve']
      .map((role, ordinal) => ({
        ordinal,
        role,
        expectedTxId: hex(21 + ordinal),
        transportStatus: 'accepted',
        durableAttemptDigestHex: hex(31 + ordinal),
        journalDigestHex: hex(41 + ordinal),
        confirmationDigestHex: hex(51 + ordinal),
        confirmationHeight: 100 + ordinal,
        confirmationHeaderIdHex: hex(61 + ordinal),
      })),
    pegIn: cycleOne.pegIn,
    mint: nativeMint(2, cycleOne.pegIn, 70),
    burn: nativeBurn(4, 80),
    unsignedIssuance: ['tracker', 'duplicatePrevention', 'pooledReserve']
      .map((role, ordinal) => ({
        role,
        transactionIdHex: hex(21 + ordinal),
        predictedSingletonBoxIdHex: hex(91 + ordinal),
      })),
    frontierProcess: { stopped: true },
    ergoExecution: { stopped: true },
    withdrawal: { ...cycleOne.return, feeFunding: {
      withdrawal: fullFee(21), tracker: fullFee(22),
    } },
    completedCycles: 2 as const,
    secondCycle: {
      pegIn: cycleTwo.pegIn,
      mint: nativeMint(6, cycleTwo.pegIn, 100),
      burn: nativeBurn(8, 110),
      checkpoint: {},
      feeFunding: cycleTwo.return.feeFunding,
      anchor: cycleTwo.return.anchor,
      tracker: cycleTwo.return.tracker,
      payout: cycleTwo.return.payout,
      confirmationExecution: {},
    },
    singletonIssuanceEstablished: true,
    operationalMintEstablished: true,
    canonicalPayoutEstablished: true,
    sourceFinalityEstablished: false,
    trustless: false,
  };
}

function cycle(ordinal: number) {
  const seed = ordinal * 20;
  return {
    pegIn: {
      sourceLockTransactionIdHex: hex(seed + 1),
      reserveTransitionTransactionIdHex: hex(seed + 2),
      sourceLockBoxIdHex: hex(seed + 3),
      reserveSuccessorBoxIdHex: hex(seed + 4),
      mintIdentityHex: `0x${hex(seed + 5)}`,
      sourceProofReceiptDigestHex: hex(seed + 6),
    },
    return: cycleReturn(seed),
  };
}

function nativeMint(
  blockHeight: number,
  pegIn: ReturnType<typeof cycle>['pegIn'],
  seed: number,
) {
  return {
    blockHashHex: `0x${hex(seed + 1)}`,
    ethereumBlockHashHex: `0x${hex(seed + 2)}`,
    blockHeight,
    transactionHashHex: `0x${hex(seed + 3)}`,
    transactionIndex: 0,
    eventIndex: 1,
    mintIdentityHex: pegIn.mintIdentityHex,
    amountNanoErg: '20000000',
    recipientAddressHex: `0x${'34'.repeat(20)}`,
    sourceProofReceiptDigestHex: pegIn.sourceProofReceiptDigestHex,
    consumedReservationScaleHex: '0x0102',
    runtimeReservationConsumed: true,
    mintExecuted: true,
    sourceFinalityEstablished: false,
    trustless: false,
  };
}

function nativeBurn(blockHeight: number, seed: number) {
  return {
    phase: 'burn',
    blockHashHex: `0x${hex(seed + 1)}`,
    ethereumBlockHashHex: `0x${hex(seed + 2)}`,
    blockHeight,
    transactionHashHex: `0x${hex(seed + 3)}`,
    transactionIndex: 0,
    eventIndex: 2,
    grossAmountNanoErg: '15000000',
    netAmountNanoErg: '10000000',
    recipientErgoTreeHex: '0x0102',
    sourceFinalityEstablished: false,
    trustless: false,
  };
}

function cycleReturn(seed: number) {
  return {
    checkpoint: {},
    feeFunding: {
      withdrawal: fee(seed + 1),
      tracker: fee(seed + 2),
    },
    anchor: { observation: {}, execution: {} },
    tracker: {
      expectedTxId: hex(seed + 3),
      confirmationHeight: 150 + seed,
      confirmationHeaderIdHex: hex(seed + 4),
      authorizationDigestHex: hex(seed + 5),
      checkDigestHex: hex(seed + 6),
      frozenExecution: {},
      freshnessExecution: {},
      transportExecution: {},
      transportStatus: 'accepted',
      journalDigestHex: hex(seed + 7),
    },
    payout: {
      expectedTxId: hex(seed + 8),
      confirmationHeight: 160 + seed,
      confirmationHeaderIdHex: hex(seed + 9),
      observationDigestHex: hex(seed + 10),
      authorizationDigestHex: hex(seed + 11),
      durableAttemptDigestHex: hex(seed + 12),
      transportStatus: 'accepted',
      journalDigestHex: hex(seed + 13),
      payoutBoxIdHex: hex(seed + 14),
      amountNanoErg: '10000000',
      reserveSuccessorBoxIdHex: hex(seed + 15),
      duplicatePreventionSuccessorBoxIdHex: hex(seed + 16),
    },
    confirmationExecution: {},
  };
}

function fullFee(seed: number) {
  const { feeInputBoxIdHex, ...summary } = fee(seed);
  return { ...summary, feeInputBox: {
    boxId: feeInputBoxIdHex, value: '4000000', ergoTree: '0008cd' + '02'.repeat(33),
    assets: [], additionalRegisters: {}, creationHeight: summary.confirmationHeight - 1,
    transactionId: summary.expectedTxId, index: 0,
  } };
}

function fee(seed: number) {
  return {
    expectedTxId: hex(seed),
    durableAttemptDigestHex: hex(seed + 1),
    transportStatus: 'accepted',
    journalDigestHex: hex(seed + 2),
    confirmationDigestHex: hex(seed + 3),
    confirmationHeight: 120 + seed,
    confirmationHeaderIdHex: hex(seed + 4),
    feeInputBoxIdHex: hex(seed + 5),
  };
}

function hex(seed: number, prefix = false): string {
  const value = (seed % 256).toString(16).padStart(2, '0').repeat(32);
  return prefix ? `0x${value}` : value;
}
