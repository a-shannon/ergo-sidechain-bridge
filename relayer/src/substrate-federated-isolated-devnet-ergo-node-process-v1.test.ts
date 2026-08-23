import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import {
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1,
} from './substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1,
  observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1,
} from './substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetManagedActionCompletionBudgetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1,
  buildSubstrateFederatedIsolatedDevnetErgoNodeConfigV1,
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1,
  deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1,
  decideSubstrateFederatedIsolatedDevnetCleanupAuthorityV1,
  type SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Input,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1,
} from './substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  issueSubstrateFederatedIsolatedDevnetMiningCredentialV1,
} from './substrate-federated-isolated-devnet-mining-credential-v1.js';
import {
  claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2,
  claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2,
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
} from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import {
  discoverSubstrateFederatedRewardInputsV1,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';

const MNEMONIC =
  'test test test test test test test test test test test junk';
const PUBLIC_KEY_HEX =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const temporaryDirectories: string[] = [];

describe.skipIf(process.platform !== 'win32')(
  'isolated devnet Ergo owned process V1',
  () => {
    afterEach(() => {
      for (const path of temporaryDirectories.splice(0)) {
        rmSync(path, { recursive: true, force: true, maxRetries: 3 });
      }
    });

    it('builds exact mining and non-mining configs without wallet material', () => {
      const directory = ownedTestDirectory();
      const cases = [
        ['primary', 'mining', true, 'knownPeers = []', '127.0.0.1:9051'],
        ['witness', 'mining', false, 'knownPeers = ["127.0.0.1:9021"]', '127.0.0.1:9052'],
        ['primary', 'non-mining', false, 'knownPeers = []', '127.0.0.1:9051'],
        ['witness', 'non-mining', false, 'knownPeers = ["127.0.0.1:9021"]', '127.0.0.1:9052'],
      ] as const;
      for (const [role, mode, mining, peerLine, restOrigin] of cases) {
        const config = buildSubstrateFederatedIsolatedDevnetErgoNodeConfigV1({
          role,
          mode,
          dataDirectory: directory,
          binding: launchBinding(),
        }).toString('ascii');
        expect(config).toContain(`mining = ${mining}`);
        expect(config).toContain(`offlineGeneration = ${mining}`);
        expect(config).toContain(peerLine);
        expect(config).toContain(`bindAddress = "${restOrigin}"`);
        expect(config).toContain(`miningPubKeyHex = "${PUBLIC_KEY_HEX}"`);
        expect(config).toContain('monetary.minerRewardDelay = 1');
        expect(config).toContain(
          'genesisStateDigestHex = "840ca0b8aec2d7a6c4f1589ca6070c8a5ed5924c835cdb8f816aa773b6fe1b6302"',
        );
        if (role === 'primary' && mode === 'mining') {
          expect(config).toContain('internalMinerPollingInterval = 8s');
          expect(config).toContain(
            'wallet.testMnemonic = ${?E2S_FED6G1DI3B_EPHEMERAL_MINING_MNEMONIC}',
          );
          expect(config).toContain('wallet.testKeysQty = 1');
        } else {
          expect(config).not.toContain('internalMinerPollingInterval');
          expect(config).not.toMatch(/testMnemonic|testKeysQty/iu);
        }
        expect(config).not.toMatch(/testMnemonic\s*=\s*["']|secretStorage/iu);
      }
    });

    it('validates exact executable, assembly and public signer bindings while inert', async () => {
      const session = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
        processInput(),
        launchBinding(),
        testMiningCredential(),
      );
      await expect(session.withMiningStoppedReadOnlyTarget(async () => 'never'))
        .rejects.toThrow(/requires the active mining phase/);
      await expect(session.withMiningActiveExecutionTarget(async () => 'never'))
        .rejects.toThrow(/requires the active mining phase/);
      await expect(session.withCheckpointExtensionMiningTarget(
        '11'.repeat(64),
        {},
        async () => 'never',
      )).rejects.toThrow(/requires the frozen first execution/);
      await expect(session.stop()).resolves.toBeUndefined();
      expect(() => assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1({
        primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
        witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
        miningStopped: true,
      })).toThrow(/not owned by the active managed process action/);
      expect(() => assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1({
        primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
        witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
        primaryMining: true,
        witnessReadOnly: true,
      })).toThrow(/not owned by the active mining action/);
      await expect(session.startMining()).rejects.toThrow(/exactly once/);
      await expect(session.stop()).resolves.toBeUndefined();
    });

    it('hands the setup-issued mining credential to the inert process owner', async () => {
      const setup =
        await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
      const session = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
        processInput(),
        launchBindingForSigner(setup.signer),
        claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2(setup),
      );
      await expect(session.stop()).resolves.toBeUndefined();
      expect(() => setup.dispose()).not.toThrow();
    });

    it('requires an independently one-shot checkpoint mining credential', async () => {
      const credential = testMiningCredential();
      expect(() => createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
        processInput(),
        launchBinding(),
        credential,
        credential,
      )).toThrow(/must be independently one-shot/);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          credential,
          PUBLIC_KEY_HEX,
        )
      ).toThrow(/absent, consumed, or revoked/);
    });

    it('joins managed action completion before any overrun cleanup', () => {
      expect(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1,
      ).toBe(1_860_000);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetManagedActionCompletionBudgetV1(
          1_000,
          1_861_000,
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1,
        )
      ).not.toThrow();
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetManagedActionCompletionBudgetV1(
          1_000,
          1_861_001,
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1,
        )
      ).toThrow(/exceeded its completion budget/);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetManagedActionCompletionBudgetV1(
          2_000,
          1_000,
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1,
        )
      ).toThrow(/timing is invalid/);
      const source = readFileSync(
        join(
          import.meta.dirname,
          'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
        ),
        'utf8',
      );
      expect(source).toContain('managedActionCompletionJoinedBeforeCleanup');
      expect(source).toContain('managedActionOverrunRejectedAfterJoin');
      expect(source).toContain('performance.now()');
      expect(source).not.toContain('Promise.race([');
    });

    it('applies an explicit checkpoint tip floor without changing the generic path', () => {
      expect(deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1(0))
        .toBe(1);
      expect(deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1(8))
        .toBe(9);
      expect(deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1(8, 11))
        .toBe(11);
      expect(deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1(11, 11))
        .toBe(12);
      expect(() =>
        deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1(-1)
      ).toThrow(/prior height is invalid/);
      expect(() =>
        deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1(
          Number.MAX_SAFE_INTEGER,
        )
      ).toThrow(/prior height is invalid/);
      expect(() =>
        deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1(8, -1)
      ).toThrow(/minimum tip height is invalid/);
      expect(() =>
        deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1(
          8,
          Number.MAX_SAFE_INTEGER + 1,
        )
      ).toThrow(/minimum tip height is invalid/);
      const source = readFileSync(
        join(
          import.meta.dirname,
          'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
        ),
        'utf8',
      );
      const checkpointActionIndex = source.indexOf(
        'withCheckpointExtensionMiningTarget: async',
      );
      const policyDerivationIndex = source.indexOf(
        'const requiredCheckpointTipHeight =',
        checkpointActionIndex,
      );
      const credentialConsumptionIndex = source.indexOf(
        'checkpointMiningCredential = undefined;',
        checkpointActionIndex,
      );
      const firstNodeStopIndex = source.indexOf(
        'await stopOwnedNode(primary, true);',
        checkpointActionIndex,
      );
      expect(checkpointActionIndex).toBeGreaterThan(-1);
      expect(policyDerivationIndex).toBeGreaterThan(-1);
      expect(firstNodeStopIndex).toBeGreaterThan(policyDerivationIndex);
      expect(credentialConsumptionIndex).toBeGreaterThan(policyDerivationIndex);
    });

    it('fails stop before runtime cleanup when process termination is unverified', () => {
      expect(decideSubstrateFederatedIsolatedDevnetCleanupAuthorityV1(true, true))
        .toBe('release_cleanup_authority');
      expect(decideSubstrateFederatedIsolatedDevnetCleanupAuthorityV1(false, true))
        .toBe('hold_cleanup_authority');
      expect(decideSubstrateFederatedIsolatedDevnetCleanupAuthorityV1(true, false))
        .toBe('hold_cleanup_authority');
      expect(decideSubstrateFederatedIsolatedDevnetCleanupAuthorityV1(false, false))
        .toBe('hold_cleanup_authority');
      const source = readFileSync(
        join(
          import.meta.dirname,
          'substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
        ),
        'utf8',
      );
      expect(source).toContain('unverifiedProcessTerminationFailsStop: true');
      expect(source).toContain('return await holdOwnedNodeCleanupAuthority()');
      expect(source).toContain('Get-NetTCPConnection -State Listen -ErrorAction Stop');
      expect(source.indexOf('return await holdOwnedNodeCleanupAuthority()'))
        .toBeLessThan(source.indexOf('removeOwnedRuntime(ownedRuntimeRoot)'));
      expect(source).not.toContain('processDiagnosticHint');
      expect(source).not.toContain('startupError.message');
    });

    it('rejects executable and assembly drift before any process can start', () => {
      expect(() => createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1({
        ...processInput(),
        expectedJavaExecutableSha256Hex: '11'.repeat(32),
      }, launchBinding(), testMiningCredential()))
        .toThrow(/Java executable differs/);
      expect(() => createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1({
        ...processInput(),
        expectedNodeAssemblyJarSha256Hex: '22'.repeat(32),
      }, launchBinding(), testMiningCredential()))
        .toThrow(/assembly JAR differs/);
    });

    it('rejects key, reward-tree, network and origin drift before launch', () => {
      const mutations: Array<{
        binding: SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1;
        error: RegExp;
      }> = [
        {
          binding: { ...launchBinding(), p2pkErgoTreeHex: `0008cd03${'11'.repeat(32)}` },
          error: /P2PK tree differs/,
        },
        {
          binding: {
            ...launchBinding(),
            rewardInputErgoTrees: {
              ...launchBinding().rewardInputErgoTrees,
              delay1: '00',
            },
          },
          error: /reward trees differ/,
        },
        {
          binding: { ...launchBinding(), networkPrefix: 0 as 16 },
          error: /network prefix 16/,
        },
        {
          binding: {
            ...launchBinding(),
            primaryNodeOrigin: 'http://127.0.0.1:19051' as typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          },
          error: /fixed loopback origins/,
        },
      ];
      for (const mutation of mutations) {
        expect(() => createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
          processInput(),
          mutation.binding,
          testMiningCredential(),
        )).toThrow(mutation.error);
      }
    });

    const liveJavaPath = process.env.G1DI3B_JAVA_PATH;
    const liveJarPath = process.env.G1DI3B_ERGO_JAR_PATH;
    it.skipIf(!liveJavaPath || !liveJarPath)(
      'owns a real direct-Java mining to non-mining lifecycle without submission',
      async () => {
        const setup =
          await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
        const session = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
          {
            javaExecutablePath: liveJavaPath!,
            expectedJavaExecutableSha256Hex: fileSha256(liveJavaPath!),
            nodeAssemblyJarPath: liveJarPath!,
            expectedNodeAssemblyJarSha256Hex: fileSha256(liveJarPath!),
            buildIdentityDigestHex:
              sha256(Buffer.from('live-process-only', 'ascii')),
          },
          launchBindingForSigner(setup.signer),
          claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2(setup),
        );
        try {
          const starting = session.startMining();
          await expect(session.startMining()).rejects.toThrow(/exactly once/);
          await expect(session.stop()).rejects.toThrow(/while start is active/);
          await starting;

          let enterAction!: () => void;
          let releaseAction!: () => void;
          const actionEntered = new Promise<void>(resolvePromise => {
            enterAction = resolvePromise;
          });
          const actionReleased = new Promise<void>(resolvePromise => {
            releaseAction = resolvePromise;
          });
          let ownedTarget:
            Parameters<typeof assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1>[0]
              | undefined;
          let actionProcessBindingDigestHex: string | undefined;
          const managed = session.withMiningStoppedReadOnlyTarget(
            async target => {
              ownedTarget = target;
              actionProcessBindingDigestHex =
                assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1(target);
              expect(() =>
                assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1({
                  ...target,
                })
              ).toThrow(/not owned by the active managed process action/);
              enterAction();
              await actionReleased;
              const discovery =
                await discoverSubstrateFederatedRewardInputsV1(setup.signer);
              const history =
                await collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(
                  discovery,
                );
              return { target: { ...target }, discovery, history };
            },
          );
          await actionEntered;
          await expect(session.withMiningStoppedReadOnlyTarget(async () => 'never'))
            .rejects.toThrow(/requires the active mining phase/);
          await expect(session.stop()).rejects.toThrow(/while transition is active/);
          releaseAction();
          const result = await managed;
          expect(result.value.target).toEqual({
            primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
            witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
            miningStopped: true,
          });
          expect(result.value.discovery.inventory.usableRewardBoxCount)
            .toBeGreaterThanOrEqual(3);
          expect(result.value.discovery.signer.publicKeyHex)
            .toBe(setup.signer.publicKeyHex);
          expect(result.value.history.receipt.target.headerCount)
            .toBeGreaterThanOrEqual(8);
          const headerManifest = JSON.parse(
            result.value.history.artifacts.greatestWorkHeadersManifest,
          ) as { headers: Array<{ version: number }> };
          expect(headerManifest.headers[0]?.version).toBe(1);
          expect(headerManifest.headers.every(
            header => header.version >= 1 && header.version <= 4,
          )).toBe(true);
          expect(result.receipt.miningStoppedBeforeAction).toBe(true);
          expect(result.receipt.processBindingDigestHex).toMatch(/^[0-9a-f]{64}$/u);
          expect(result.receipt.processBindingDigestHex)
            .toBe(actionProcessBindingDigestHex);
          expect(() =>
            assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1(
              ownedTarget!,
            )
          ).toThrow(/not owned by the active managed process action/);
          expect(result.receipt.checks).toMatchObject({
            javaImageAndPinnedFilesRechecked: true,
            ephemeralPowSecretPassedOnlyViaProcessEnvironment: true,
            ephemeralPowSecretDiscardedBeforeAction: true,
            spawnedProcessListenersExclusivelyLoopbackOwned: true,
            unverifiedProcessTerminationFailsStop: true,
          });
        } finally {
          await session.stop();
          setup.dispose();
        }
      },
      240_000,
    );

    it.skipIf(!liveJavaPath || !liveJarPath)(
      'owns a mining-active execution capability and freezes the final target',
      async () => {
        const setup =
          await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
        const credentials =
          claimSubstrateFederatedIsolatedDevnetMiningCredentialPairV2(setup);
        const session = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
          {
            javaExecutablePath: liveJavaPath!,
            expectedJavaExecutableSha256Hex: fileSha256(liveJavaPath!),
            nodeAssemblyJarPath: liveJarPath!,
            expectedNodeAssemblyJarSha256Hex: fileSha256(liveJarPath!),
            buildIdentityDigestHex:
              sha256(Buffer.from('live-execution-process-only', 'ascii')),
          },
          launchBindingForSigner(setup.signer),
          credentials.miningCredential,
          credentials.checkpointMiningCredential,
        );
        let ownedTarget:
          Parameters<typeof assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1>[0]
            | undefined;
        try {
          await session.startMining();
          const managed = await session.withMiningActiveExecutionTarget(
            async target => {
              ownedTarget = target;
              const binding =
                assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
                  target,
                );
              expect(binding.processBindingDigestHex).toMatch(/^[0-9a-f]{64}$/u);
              expect(binding.executionTargetIdentityDigestHex)
                .toMatch(/^[0-9a-f]{64}$/u);
              expect(() =>
                assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1({
                  ...target,
                })
              ).toThrow(/not owned by the active mining action/);
              const discovery =
                await discoverSubstrateFederatedRewardInputsV1(setup.signer);
              return Object.freeze({
                ...binding,
                genesisHeaderIdHex: discovery.target.genesisHeaderIdHex,
              });
            },
          );
          expect(managed.receipt.processBindingDigestHex)
            .toBe(managed.value.processBindingDigestHex);
          expect(managed.receipt.executionTargetIdentityDigestHex)
            .toBe(managed.value.executionTargetIdentityDigestHex);
          expect(managed.receipt.finalSnapshot.fullHeight)
            .toBeGreaterThanOrEqual(managed.receipt.initialSnapshot.fullHeight);
          expect(() =>
            assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
              ownedTarget!,
            )
          ).toThrow(/not owned by the active mining action/);
          const anchored = await session.withCheckpointExtensionMiningTarget(
            'ab'.repeat(64),
            { minimumTipHeight: 11 },
            async target =>
              await observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1({
                target,
                targetGenesisHeaderIdHex: managed.value.genesisHeaderIdHex,
                expectedPriorHeaderIdHex:
                  managed.receipt.finalSnapshot.headerIdHex,
                expectedPriorHeight: managed.receipt.finalSnapshot.fullHeight,
                expectedExtensionValueHex: 'ab'.repeat(64),
              }),
          );
          expect(() =>
            assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1(
              anchored.value,
            )
          ).not.toThrow();
          expect(anchored.receipt.extensionKeyHex).toBe('0401');
          expect(anchored.receipt.extensionValueHex).toBe('ab'.repeat(64));
          expect(anchored.receipt.priorSnapshot)
            .toEqual(managed.receipt.finalSnapshot);
          expect(anchored.receipt.minedSnapshot.fullHeight)
            .toBeGreaterThan(managed.receipt.finalSnapshot.fullHeight);
          expect(anchored.receipt.minedSnapshot.fullHeight)
            .toBeGreaterThanOrEqual(11);
          expect(anchored.receipt.miningStoppedBeforeObservation).toBe(true);
          expect(anchored.receipt.finalSnapshot.fullHeight)
            .toBeGreaterThanOrEqual(anchored.receipt.minedSnapshot.fullHeight);
          expect(anchored.value.anchorHeaderIdHex)
            .toBe(anchored.receipt.finalSnapshot.headerIdHex);
          expect(anchored.value.anchorHeight)
            .toBe(anchored.receipt.finalSnapshot.fullHeight);
          expect(anchored.value.priorHeaderIdHex)
            .toBe(managed.receipt.finalSnapshot.headerIdHex);
          expect(anchored.value.processBindingDigestHex)
            .toBe(anchored.receipt.processBindingDigestHex);
          expect(anchored.receipt.processBindingDigestHex)
            .not.toBe(managed.receipt.processBindingDigestHex);
          await expect(session.withCheckpointExtensionMiningTarget(
            'ab'.repeat(64),
            { minimumTipHeight: 11 },
            async () => 'never',
          )).rejects.toThrow(/absent, consumed, or revoked/);
        } finally {
          await session.stop();
          setup.dispose();
        }
      },
      240_000,
    );
  },
);

function launchBinding(): SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1 {
  return {
    miningTargetPublicKeyHex: PUBLIC_KEY_HEX,
    p2pkErgoTreeHex: `0008cd${PUBLIC_KEY_HEX}`,
    rewardInputErgoTrees: {
      delay1: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1),
      delay720: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 720),
    },
    networkPrefix: 16,
    primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  };
}

function launchBindingForSigner(
  signer: Readonly<{
    publicKeyHex: string;
    p2pkErgoTreeHex: string;
    rewardInputErgoTrees: Readonly<{ delay1: string; delay720: string }>;
    networkPrefix: 16;
  }>,
): SubstrateFederatedIsolatedDevnetErgoNodeLaunchBindingV1 {
  return {
    miningTargetPublicKeyHex: signer.publicKeyHex,
    p2pkErgoTreeHex: signer.p2pkErgoTreeHex,
    rewardInputErgoTrees: signer.rewardInputErgoTrees,
    networkPrefix: signer.networkPrefix,
    primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  };
}

function testMiningCredential() {
  return issueSubstrateFederatedIsolatedDevnetMiningCredentialV1(
    MNEMONIC,
    PUBLIC_KEY_HEX,
  );
}

function processInput(): SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Input {
  const executableSha256Hex = fileSha256(process.execPath);
  return {
    javaExecutablePath: process.execPath,
    expectedJavaExecutableSha256Hex: executableSha256Hex,
    nodeAssemblyJarPath: process.execPath,
    expectedNodeAssemblyJarSha256Hex: executableSha256Hex,
    buildIdentityDigestHex: sha256(Buffer.from('unit-test-build', 'ascii')),
  };
}

function ownedTestDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), 'e2s-fed6g1di3b-test-'));
  temporaryDirectories.push(path);
  return path;
}

function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
