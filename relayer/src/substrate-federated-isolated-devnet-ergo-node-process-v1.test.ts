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
import { buildErgoExtensionMembershipProof } from './ergo-settlement-core/ergo-extension-membership.js';
import { computeErgoHeaderId } from './ergo-settlement-core/ergo-header-id.js';
import {
  assertSubstrateFederatedIsolatedDevnetManagedActionCompletionBudgetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2,
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2,
  assertSubstrateFederatedIsolatedDevnetPostRestartContinuityV1,
  buildSubstrateFederatedIsolatedDevnetErgoNodeConfigV1,
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1,
  deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionNodeObservationDigestV1,
  deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestV1,
  deriveSubstrateFederatedIsolatedDevnetCheckpointTipHeightV1,
  issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CONFIRMATION_EXECUTION_V2_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_EXECUTION_V2_SCHEMA,
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
  claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2,
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
      await expect(session.withCheckpointBoundMiningStoppedExecutionTarget(
        async () => 'never',
      )).rejects.toThrow(/requires one completed checkpoint observation/);
      await expect(
        session.withCheckpointBoundReservationFreshnessRevalidationTarget(
          async () => 'never',
        ),
      ).rejects.toThrow(/requires one completed frozen tracker check/);
      await expect(
        session.withCheckpointBoundTrackerTransportTarget(
          Object.freeze({
            schema:
              'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-completion.v1',
            version: 1,
          }),
          async () => 'never',
        ),
      ).rejects.toThrow(/requires one completed reservation freshness check/);
      await expect(
        session.withTrackerTransportConfirmationMiningTarget(
          '11'.repeat(32),
          async () => 'never',
        ),
      ).rejects.toThrow(/requires one completed transport attempt/);
      await expect(session.withCheckpointBoundMiningActiveExecutionTarget(
        async () => 'never',
      )).rejects.toThrow(/requires one completed checkpoint observation/);
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
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          primaryMining: true,
          witnessReadOnly: true,
          checkpointBound: true,
        })
      ).toThrow(/not owned by the active tracker-admission action/);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          primaryMining: false,
          primaryReadOnly: true,
          witnessReadOnly: true,
          miningStopped: true,
          checkpointBound: true,
        })
      ).toThrow(/not owned by the active tracker-check action/);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          primaryMining: false,
          primaryReadOnly: true,
          witnessReadOnly: true,
          miningStopped: true,
          checkpointBound: true,
          reservationFreshnessRevalidation: true,
        })
      ).toThrow(/not owned by the active reservation-freshness action/);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV1({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          primaryMining: false,
          witnessReadOnly: true,
          miningStopped: true,
          checkpointBound: true,
          reservationFreshnessCheckBound: true,
          trackerTransport: true,
        })
      ).toThrow(/not owned by the active tracker-transport action/);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2({
          primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
          witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
          primaryMining: true,
          witnessReadOnly: true,
          checkpointBound: true,
          reservationFreshnessCheckBound: true,
          trackerTransport: true,
          sameProcessCanonicalConfirmation: true,
        })
      ).toThrow(/not owned by the active tracker-transport action/);
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

    it('requires an independently one-shot tracker-admission mining credential', () => {
      const setupCredential = testMiningCredential();
      const checkpointCredential = testMiningCredential();
      expect(() => createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
        processInput(),
        launchBinding(),
        setupCredential,
        checkpointCredential,
        checkpointCredential,
      )).toThrow(/tracker-admission mining credential must be independently one-shot/);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          setupCredential,
          PUBLIC_KEY_HEX,
        )
      ).toThrow(/absent, consumed, or revoked/);
    });

    it('requires an independently one-shot tracker-confirmation mining credential', () => {
      const setupCredential = testMiningCredential();
      const checkpointCredential = testMiningCredential();
      const trackerAdmissionCredential = testMiningCredential();
      expect(() => createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
        processInput(),
        launchBinding(),
        setupCredential,
        checkpointCredential,
        trackerAdmissionCredential,
        trackerAdmissionCredential,
      )).toThrow(
        /tracker-confirmation mining credential must be independently one-shot/,
      );
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
          setupCredential,
          PUBLIC_KEY_HEX,
        )
      ).toThrow(/absent, consumed, or revoked/);
    });

    it('rejects every relaxed checkpoint-extension observation boundary', () => {
      const fixture = checkpointExtensionFixture();
      const primaryDigestHex =
        deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionNodeObservationDigestV1(
          'primary',
          fixture.checkpoint,
          fixture.extensionValueHex,
          fixture.block,
        );
      expect(primaryDigestHex).toMatch(/^[0-9a-f]{64}$/u);
      expect(
        deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestV1(
          fixture.checkpoint,
          fixture.extensionValueHex,
          primaryDigestHex,
          primaryDigestHex,
        ),
      ).toMatch(/^[0-9a-f]{64}$/u);

      const changedIdentity = structuredClone(fixture.block);
      changedIdentity.header.transactionsRoot = 'ff'.repeat(32);
      expect(() => observeFixture(fixture, changedIdentity))
        .toThrow(/canonical bytes|block identity changed/);

      const changedHeight = structuredClone(fixture.block);
      changedHeight.header.height += 1;
      expect(() => observeFixture(fixture, changedHeight))
        .toThrow(/canonical bytes|block identity changed/);

      const changedCheckpointValue = structuredClone(fixture.block);
      changedCheckpointValue.extension.fields[1]![1] = 'cd'.repeat(64);
      expect(() => observeFixture(fixture, changedCheckpointValue))
        .toThrow(/does not contain the exact 0x0401 value/);

      const changedSideField = structuredClone(fixture.block);
      changedSideField.extension.fields[0]![1] = Buffer.from(
        'changed-side-field',
        'ascii',
      ).toString('hex');
      expect(() => observeFixture(fixture, changedSideField))
        .toThrow(/extension root changed/);

      expect(() =>
        deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestV1(
          fixture.checkpoint,
          fixture.extensionValueHex,
          primaryDigestHex,
          'ee'.repeat(32),
        )
      ).toThrow(/observations disagree/);
    });

    it('authenticates the checkpoint after the callback and before continuation minting', () => {
      const source = readFileSync(
        new URL(
          './substrate-federated-isolated-devnet-ergo-node-process-v1.ts',
          import.meta.url,
        ),
        'utf8',
      );
      const methodStart = source.indexOf(
        'withCheckpointExtensionMiningTarget: async',
      );
      const methodEnd = source.indexOf(
        'withCheckpointBoundMiningActiveExecutionTarget: async',
        methodStart,
      );
      expect(methodStart).toBeGreaterThanOrEqual(0);
      expect(methodEnd).toBeGreaterThan(methodStart);
      const method = source.slice(methodStart, methodEnd);
      const callbackCompletion = method.indexOf(
        'value = await runManagedAction(action, target);',
      );
      const observation = method.indexOf(
        'await observeExactCheckpointExtensionOnBothNodes(',
      );
      const continuation = method.indexOf(
        'checkpointExecutionContinuation = Object.freeze({',
      );
      const observationBinding = method.indexOf(
        'checkpointExtensionObservationDigestHex,',
        continuation,
      );

      expect(callbackCompletion).toBeGreaterThanOrEqual(0);
      expect(observation).toBeGreaterThan(callbackCompletion);
      expect(continuation).toBeGreaterThan(observation);
      expect(observationBinding).toBeGreaterThan(continuation);
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
      expect(source).toContain(
        'Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction Stop',
      );
      expect(source).toContain(
        'Get-NetTCPConnection -State Listen -OwningProcess $pids -ErrorAction Stop',
      );
      expect(source).toContain('CmdletizationQuery_NotFound,Get-NetTCPConnection*');
      expect(source).toContain('{ $rows=@() } else { throw }');
      expect(source).not.toContain('Where-Object { $ports -contains $_.LocalPort }');
      expect(source).not.toContain('Where-Object { $pids -contains $_.OwningProcess }');
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

    it('accepts a higher indexed tip when the exact frozen block remains canonical', () => {
      const frozenSnapshot = Object.freeze({
        network: 'devnet' as const,
        fullHeight: 11,
        indexedHeight: 11,
        headerIdHex: '11'.repeat(32),
      });
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetPostRestartContinuityV1({
          actionStartSnapshot: Object.freeze({
            network: 'devnet' as const,
            fullHeight: 12,
            indexedHeight: 12,
            headerIdHex: '22'.repeat(32),
          }),
          frozenSnapshot,
          primaryHeaderIdsAtFrozenHeight: [frozenSnapshot.headerIdHex],
          witnessHeaderIdsAtFrozenHeight: [frozenSnapshot.headerIdHex],
        })
      ).not.toThrow();
    });

    it.each([
      ['primary', '33'.repeat(32), '11'.repeat(32)],
      ['witness', '11'.repeat(32), '33'.repeat(32)],
    ] as const)(
      'rejects a %s frozen-block replacement beneath a higher indexed tip',
      (role, primaryHeaderIdHex, witnessHeaderIdHex) => {
        const frozenSnapshot = Object.freeze({
          network: 'devnet' as const,
          fullHeight: 11,
          indexedHeight: 11,
          headerIdHex: '11'.repeat(32),
        });
        expect(() =>
          assertSubstrateFederatedIsolatedDevnetPostRestartContinuityV1({
            actionStartSnapshot: Object.freeze({
              network: 'devnet' as const,
              fullHeight: 12,
              indexedHeight: 12,
              headerIdHex: '22'.repeat(32),
            }),
            frozenSnapshot,
            primaryHeaderIdsAtFrozenHeight: [primaryHeaderIdHex],
            witnessHeaderIdsAtFrozenHeight: [witnessHeaderIdHex],
          })
        ).toThrow(new RegExp(`${role} frozen snapshot is not canonical`, 'u'));
      },
    );

    it('rejects a common indexed tip below the frozen height', () => {
      const frozenSnapshot = Object.freeze({
        network: 'devnet' as const,
        fullHeight: 12,
        indexedHeight: 12,
        headerIdHex: '11'.repeat(32),
      });
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetPostRestartContinuityV1({
          actionStartSnapshot: Object.freeze({
            network: 'devnet' as const,
            fullHeight: 11,
            indexedHeight: 11,
            headerIdHex: '22'.repeat(32),
          }),
          frozenSnapshot,
          primaryHeaderIdsAtFrozenHeight: [frozenSnapshot.headerIdHex],
          witnessHeaderIdsAtFrozenHeight: [frozenSnapshot.headerIdHex],
        })
      ).toThrow(/not an indexed descendant of the frozen target/);
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
          claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2(setup);
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
          credentials.trackerAdmissionMiningCredential,
          credentials.trackerConfirmationMiningCredential,
        );
        let ownedTarget:
          Parameters<typeof assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1>[0]
            | undefined;
        let freshnessTarget:
          Parameters<typeof assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1>[0]
            | undefined;
        let transportTarget:
          Parameters<typeof assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2>[0]
            | undefined;
        let freshnessCompletion:
          ReturnType<
            typeof issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1
          > | undefined;
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
            async () => 'checkpoint-callback-no-op',
          );
          expect(anchored.value).toBe('checkpoint-callback-no-op');
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
          expect(anchored.receipt.processBindingDigestHex)
            .not.toBe(managed.receipt.processBindingDigestHex);
          await expect(session.withCheckpointExtensionMiningTarget(
            'ab'.repeat(64),
            { minimumTipHeight: 11 },
            async () => 'never',
          )).rejects.toThrow(/absent, consumed, or revoked/);
          const resumed =
            await session.withCheckpointBoundMiningStoppedExecutionTarget(
              async target => {
                expect(target).toMatchObject({
                  primaryMining: false,
                  primaryReadOnly: true,
                  witnessReadOnly: true,
                  miningStopped: true,
                  checkpointBound: true,
                });
                expect(() =>
                  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
                    target as unknown as Parameters<
                      typeof assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1
                    >[0],
                  )
                ).toThrow(/not owned by the active mining action/);
                expect(() =>
                  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1(
                    target as unknown as Parameters<
                      typeof assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1
                    >[0],
                  )
                ).toThrow(/not owned by the active tracker-admission action/);
                expect(() =>
                  assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1(
                    target as unknown as Parameters<
                      typeof assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1
                    >[0],
                  )
                ).toThrow(/not owned by the active reservation-freshness action/);
                return assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(
                  target,
                );
              },
            );
          expect(resumed.receipt.checkpointExtensionBoundDuringAction).toBe(true);
          expect(resumed.receipt.primaryMiningDuringAction).toBe(false);
          expect(resumed.receipt.primaryReadOnlyDuringAction).toBe(true);
          expect(resumed.receipt.witnessReadOnlyDuringAction).toBe(true);
          expect(resumed.receipt.miningStoppedBeforeAction).toBe(true);
          expect(resumed.receipt.exactFrozenSnapshotStableAcrossAction).toBe(true);
          expect(resumed.receipt.trackerAdmissionMiningCredentialConsumedOnce)
            .toBe(true);
          expect(resumed.receipt.checkpointSnapshotRevalidatedOnBothNodes)
            .toBe(true);
          expect(resumed.receipt.checkpointExtensionObservationDigestHex)
            .toMatch(/^[0-9a-f]{64}$/u);
          expect(resumed.receipt.extensionKeyHex).toBe('0401');
          expect(resumed.receipt.extensionValueHex).toBe('ab'.repeat(64));
          expect(resumed.receipt.checkpointSnapshot)
            .toEqual(anchored.receipt.finalSnapshot);
          expect(resumed.receipt.executionTargetIdentityDigestHex)
            .toBe(anchored.receipt.executionTargetIdentityDigestHex);
          expect(resumed.receipt.processBindingDigestHex)
            .not.toBe(anchored.receipt.processBindingDigestHex);
          expect(resumed.receipt.actionStartSnapshot)
            .toEqual(resumed.receipt.actionEndSnapshot);
          expect(resumed.receipt.actionStartSnapshot.fullHeight)
            .toBeGreaterThanOrEqual(
              resumed.receipt.preFreezeMiningSnapshot.fullHeight,
            );
          expect(resumed.value.processBindingDigestHex)
            .toBe(resumed.receipt.processBindingDigestHex);
          const freshness = await session
            .withCheckpointBoundReservationFreshnessRevalidationTarget(
              async target => {
                freshnessTarget = target;
                expect(target).toMatchObject({
                  primaryMining: false,
                  primaryReadOnly: true,
                  witnessReadOnly: true,
                  miningStopped: true,
                  checkpointBound: true,
                  reservationFreshnessRevalidation: true,
                });
                expect(() =>
                  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(
                    target as unknown as Parameters<
                      typeof assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2
                    >[0],
                  )
                ).toThrow(/not owned by the active tracker-check action/);
                const binding =
                  assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1(
                    target,
                  );
                freshnessCompletion =
                  issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1(
                    target,
                  );
                expect(() =>
                  issueSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCompletionV1(
                    target,
                  )
                ).toThrow(/completion is already issued/);
                return binding;
              },
            );
          expect(freshness.receipt.schema).toBe(
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_EXECUTION_V1_SCHEMA,
          );
          expect(freshness.receipt.sameProcessesAsTrackerCheck).toBe(true);
          expect(freshness.receipt.trackerCheckProcessBindingDigestHex)
            .toBe(resumed.receipt.processBindingDigestHex);
          expect(
            freshness.receipt.trackerCheckExecutionTargetIdentityDigestHex,
          ).toBe(resumed.receipt.executionTargetIdentityDigestHex);
          expect(freshness.receipt.processBindingDigestHex)
            .not.toBe(resumed.receipt.processBindingDigestHex);
          expect(freshness.receipt.executionTargetIdentityDigestHex)
            .not.toBe(resumed.receipt.executionTargetIdentityDigestHex);
          expect(freshness.receipt.trackerCheckSnapshot)
            .toEqual(resumed.receipt.actionEndSnapshot);
          expect(freshness.receipt.actionStartSnapshot)
            .toEqual(resumed.receipt.actionEndSnapshot);
          expect(freshness.receipt.actionEndSnapshot)
            .toEqual(resumed.receipt.actionEndSnapshot);
          expect(freshness.receipt.checkpointSnapshot)
            .toEqual(resumed.receipt.checkpointSnapshot);
          expect(freshness.receipt.checkpointExtensionObservationDigestHex)
            .toBe(resumed.receipt.checkpointExtensionObservationDigestHex);
          expect(freshness.receipt.extensionValueHex)
            .toBe(resumed.receipt.extensionValueHex);
          expect(freshness.value.processBindingDigestHex)
            .toBe(freshness.receipt.processBindingDigestHex);
          expect(freshness.value.executionTargetIdentityDigestHex)
            .toBe(freshness.receipt.executionTargetIdentityDigestHex);
          expect(() =>
            assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1(
              freshnessTarget!,
            )
          ).toThrow(/not owned by the active reservation-freshness action/);
          await expect(
            session.withCheckpointBoundTrackerTransportTarget(
              structuredClone(freshnessCompletion!),
              async () => 'never',
            ),
          ).rejects.toThrow(/lacks exact reservation freshness completion/);
          const transport = await session
            .withCheckpointBoundTrackerTransportTarget(
              freshnessCompletion!,
              async target => {
                transportTarget = target;
                expect(target).toMatchObject({
                  primaryMining: true,
                  witnessReadOnly: true,
                  checkpointBound: true,
                  reservationFreshnessCheckBound: true,
                  trackerTransport: true,
                  sameProcessCanonicalConfirmation: true,
                });
                const binding =
                  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2(
                    target,
                  );
                expect(binding.reservationFreshnessProcessBindingDigestHex)
                  .toBe(freshness.receipt.processBindingDigestHex);
                expect(
                  binding.reservationFreshnessExecutionTargetIdentityDigestHex,
                ).toBe(freshness.receipt.executionTargetIdentityDigestHex);
                return binding;
              },
            );
          expect(transport.receipt.schema).toBe(
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_EXECUTION_V2_SCHEMA,
          );
          expect(transport.receipt.sameProcessesAsReservationFreshness)
            .toBe(false);
          expect(transport.receipt.primaryMiningDuringAction)
            .toBe(true);
          expect(
            transport.receipt
              .trackerConfirmationMiningCredentialConsumedBeforeTransportOnce,
          ).toBe(true);
          expect(
            transport.receipt
              .exactReservationFreshnessSnapshotRevalidatedBeforeAction,
          ).toBe(true);
          expect(transport.receipt.trackerTransportTargetActiveOnlyDuringAction)
            .toBe(true);
          expect(transport.receipt.reservationFreshnessProcessBindingDigestHex)
            .toBe(freshness.receipt.processBindingDigestHex);
          expect(
            transport.receipt
              .reservationFreshnessExecutionTargetIdentityDigestHex,
          ).toBe(freshness.receipt.executionTargetIdentityDigestHex);
          expect(transport.receipt.reservationFreshnessSnapshot)
            .toEqual(freshness.receipt.actionEndSnapshot);
          expect(transport.receipt.actionStartSnapshot.fullHeight)
            .toBeGreaterThanOrEqual(
              freshness.receipt.actionEndSnapshot.fullHeight,
            );
          expect(transport.receipt.actionStartSnapshot.indexedHeight)
            .toBe(transport.receipt.actionStartSnapshot.fullHeight);
          expect(transport.receipt.actionEndSnapshot.fullHeight)
            .toBeGreaterThanOrEqual(transport.receipt.actionStartSnapshot.fullHeight);
          expect(transport.value.processBindingDigestHex)
            .toBe(transport.receipt.processBindingDigestHex);
          expect(() =>
            assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2(
              transportTarget!,
            )
          ).toThrow(/not owned by the active tracker-transport action/);
          await expect(
            session.withCheckpointBoundTrackerTransportTarget(
              freshnessCompletion!,
              async () => 'never',
            ),
          ).rejects.toThrow(/requires one completed reservation freshness check/);
          await expect(
            session.withCheckpointBoundReservationFreshnessRevalidationTarget(
              async () => 'never',
            ),
          ).rejects.toThrow(/requires one completed frozen tracker check/);
          await expect(session.withCheckpointBoundMiningStoppedExecutionTarget(
            async () => 'never',
          )).rejects.toThrow(/requires one completed checkpoint observation/);
          const confirmationTransactionIdHex = 'ac'.repeat(32);
          const confirmation = await session
            .withTrackerTransportConfirmationMiningTarget(
              confirmationTransactionIdHex,
              async target =>
                assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
                  target,
                ),
            );
          expect(confirmation.receipt.schema).toBe(
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CONFIRMATION_EXECUTION_V2_SCHEMA,
          );
          expect(confirmation.receipt.confirmedTransactionIdHex)
            .toBe(confirmationTransactionIdHex);
          expect(confirmation.receipt.sameProcessesAsTrackerTransport)
            .toBe(true);
          expect(confirmation.receipt.exactTrackerTransportBound).toBe(true);
          expect(
            confirmation.receipt.trackerTransportProcessBindingDigestHex,
          ).toBe(transport.receipt.processBindingDigestHex);
          expect(
            confirmation.receipt
              .trackerTransportExecutionTargetIdentityDigestHex,
          ).toBe(transport.receipt.executionTargetIdentityDigestHex);
          expect(confirmation.receipt.transportSnapshot)
            .toEqual(transport.receipt.actionEndSnapshot);
          expect(confirmation.value.processBindingDigestHex)
            .toBe(confirmation.receipt.processBindingDigestHex);
          await expect(
            session.withTrackerTransportConfirmationMiningTarget(
              confirmationTransactionIdHex,
              async () => 'never',
            ),
          ).rejects.toThrow(/requires one completed transport attempt/);
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

interface CheckpointExtensionFixture {
  readonly checkpoint: Readonly<{
    readonly network: 'devnet';
    readonly fullHeight: number;
    readonly indexedHeight: number;
    readonly headerIdHex: string;
  }>;
  readonly extensionValueHex: string;
  readonly block: {
    header: Record<string, unknown> & { height: number; transactionsRoot: string };
    extension: { fields: string[][] };
  };
}

function checkpointExtensionFixture(): CheckpointExtensionFixture {
  const extensionValueHex = 'ab'.repeat(64);
  const fields = [
    ['0100', Buffer.from('side-field', 'ascii').toString('hex')],
    ['0401', extensionValueHex],
  ];
  const extensionHash = buildErgoExtensionMembershipProof(
    fields.map(([keyHex, valueHex]) => ({
      key: Buffer.from(keyHex!, 'hex'),
      value: Buffer.from(valueHex!, 'hex'),
    })),
    Buffer.from('0401', 'hex'),
  ).root.toString('hex');
  const height = 11;
  const identity = {
    version: 2,
    parentId: Buffer.alloc(32, 0x40),
    adProofsRoot: Buffer.alloc(32, 0x41),
    stateRoot: Buffer.alloc(33, 0x42),
    transactionsRoot: Buffer.alloc(32, 0x43),
    timestamp: 1_700_000_000_011n,
    nBits: 0x01010000,
    height,
    extensionHash: Buffer.from(extensionHash, 'hex'),
    votes: Buffer.alloc(3),
    powSolution: {
      publicKey: Buffer.concat([Buffer.from([2]), Buffer.alloc(32, 0x44)]),
      nonce: Buffer.alloc(8, 0x45),
    },
  };
  const headerIdHex = computeErgoHeaderId(identity).toString('hex');
  return {
    checkpoint: Object.freeze({
      network: 'devnet' as const,
      fullHeight: height,
      indexedHeight: height,
      headerIdHex,
    }),
    extensionValueHex,
    block: {
      header: {
        id: headerIdHex,
        version: identity.version,
        parentId: identity.parentId.toString('hex'),
        adProofsRoot: identity.adProofsRoot.toString('hex'),
        stateRoot: identity.stateRoot.toString('hex'),
        transactionsRoot: identity.transactionsRoot.toString('hex'),
        timestamp: Number(identity.timestamp),
        nBits: identity.nBits,
        height,
        extensionHash,
        votes: identity.votes.toString('hex'),
        powSolutions: {
          pk: identity.powSolution.publicKey.toString('hex'),
          w: Buffer.concat([Buffer.from([2]), Buffer.alloc(32, 0x46)])
            .toString('hex'),
          n: identity.powSolution.nonce.toString('hex'),
          d: 0,
        },
      },
      extension: { fields },
    },
  };
}

function observeFixture(
  fixture: CheckpointExtensionFixture,
  block: CheckpointExtensionFixture['block'],
): string {
  return deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionNodeObservationDigestV1(
    'primary',
    fixture.checkpoint,
    fixture.extensionValueHex,
    block,
  );
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
