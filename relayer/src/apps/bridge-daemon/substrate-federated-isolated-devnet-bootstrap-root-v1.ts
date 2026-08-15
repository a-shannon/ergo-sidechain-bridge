import { sha256CanonicalJson } from '../../ergo-settlement-core/strict-json.js';
import {
  collectSubstrateFederatedAuthoritySafeDevnetHistoryV1,
} from '../../substrate-federated-authority-safe-devnet-history-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1,
  type RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input,
  type SubstrateFederatedIsolatedDevnetBootstrapLifecycleV1,
  type SubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Ports,
  type SubstrateFederatedIsolatedDevnetErgoNodeSessionV1,
  type SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1,
} from '../../substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetErgoNodeV1,
  type BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input,
  type SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt,
} from '../../substrate-federated-isolated-devnet-ergo-node-build-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
  type SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Receipt,
} from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1,
} from '../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetPacketSessionV1,
} from '../../substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  discoverSubstrateFederatedRewardInputsV1,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
} from '../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import {
  claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2,
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
} from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_ROOT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-bootstrap-root.v1' as const;

const ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_ROOT_V1';
const STATIC_CALLBACK_MANIFEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_STATIC_CALLBACK_MANIFEST_V1';
const PROCESS_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROCESS_RECEIPT_V1';

const STATIC_CALLBACK_MANIFEST = Object.freeze({
  schema: 'e2s.substrate-federated-isolated-devnet-static-callback.v1',
  version: 1 as const,
  lifecycle:
    'runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1',
  operations: Object.freeze([
    Object.freeze({
      port: 'createSetupSession',
      implementation:
        'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2',
      completionOwner: 'setup-check-execution-v2',
    }),
    Object.freeze({
      port: 'setupSession.miningCredential',
      implementation:
        'claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2',
      completionOwner: 'setup-runner-weakmap-and-owned-process-one-shot-consumer',
    }),
    Object.freeze({
      port: 'packetSession.produce',
      implementation:
        'createSubstrateFederatedIsolatedDevnetPacketSessionV1',
      completionOwner: 'packet-producer-v1-and-pinned-compiler-runners',
    }),
    Object.freeze({
      port: 'ergoNodeSession.lifecycle',
      implementation:
        'createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1',
      completionOwner: 'owned-process-adapter',
    }),
    Object.freeze({
      port: 'collectSourceHistory',
      implementation:
        'collectSubstrateFederatedAuthoritySafeDevnetHistoryV1',
      completionOwner: 'authority-safe-target-process-owner',
    }),
    Object.freeze({
      port: 'discoverRewardInputs',
      implementation: 'discoverSubstrateFederatedRewardInputsV1',
      completionOwner: 'fixed-read-only-node-client-request-bounds',
    }),
    Object.freeze({
      port: 'collectErgoHistory',
      implementation:
        'collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1',
      completionOwner: 'fixed-read-only-node-client-request-bounds',
    }),
    Object.freeze({
      port: 'setupCheckSession.run',
      implementation: 'fixed setup-check V2 one-shot run',
      completionOwner: 'setup-check-execution-v2-and-pinned-runners',
    }),
  ]),
  exposedCapabilities: Object.freeze([]),
});

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_STATIC_CALLBACK_MANIFEST_DIGEST_V1 =
  sha256CanonicalJson(
    STATIC_CALLBACK_MANIFEST,
    STATIC_CALLBACK_MANIFEST_DIGEST_DOMAIN,
  );

export interface RunSubstrateFederatedIsolatedDevnetBootstrapRootV1Input {
  readonly build:
    Readonly<BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input>;
  readonly lifecycle:
    Readonly<RunSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Input>;
}

export interface SubstrateFederatedIsolatedDevnetBootstrapRootV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_ROOT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'static_owned_node_no_submit_bootstrap_passed';
  readonly staticCallbackManifestDigestHex: string;
  readonly build:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  readonly process: Readonly<{
    readonly receiptDigestHex: string;
    readonly receipt:
      Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Receipt>;
  }>;
  readonly lifecycle: Readonly<{
    readonly federationProfileIdHex: string;
    readonly sourceAttestationKeySetDigestHex: string;
    readonly ergoAdmissionKeySetDigestHex: string;
    readonly packetReceiptDigestHex: string;
    readonly setupCheckReceiptDigestHex: string;
  }>;
  readonly checks: Readonly<{
    readonly exactLockedPatchedNodeBuiltBeforeSignerCreation: true;
    readonly staticLifecycleFunctionSelected: true;
    readonly staticRuntimePortsBound: true;
    readonly replacementCallbackAccepted: false;
    readonly setupAndPacketSessionsOneShotWrapped: true;
    readonly producerCompletionAwaitedBeforeTeardown: true;
    readonly rootLevelTimeoutRaceAbsent: true;
    readonly exactProcessReceiptNormalizedBeforeDigest: true;
    readonly buildProcessAndLifecycleDigestsJoined: true;
    readonly returnedValueContainsCapabilities: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localCompatibilityExecutionOnly: true;
    readonly transitiveProducerCancellationEstablished: false;
    readonly loadedBytesAttestedAgainstHostileSameUserProcess: false;
    readonly sourceConsensusIndependentlyAuthenticated: false;
    readonly ergoConsensusIndependentlyAuthenticated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetBootstrapRootV1 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetBootstrapRootV1Receipt>;
}

/**
 * Static G1dI3b compatibility composition root. Its exact reviewed imports
 * remain a temporary Gate 5 seam until WP-08A extracts the dependency closure.
 * The caller supplies only reviewed paths and lifecycle data; it cannot replace any
 * producer, process adapter, callback, signer, checker, submitter, or
 * broadcaster.
 */
export async function runSubstrateFederatedIsolatedDevnetBootstrapRootV1(
  input: Readonly<RunSubstrateFederatedIsolatedDevnetBootstrapRootV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetBootstrapRootV1>> {
  const built = await buildSubstrateFederatedIsolatedDevnetErgoNodeV1(
    input.build,
  );
  let processReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Receipt>
    | undefined;
  let miningCredential:
    ReturnType<
      typeof claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2
    > | undefined;
  let nodeOwnerCreated = false;

  const ports: SubstrateFederatedIsolatedDevnetBootstrapLifecycleV1Ports = {
    createSetupSession: async () => {
      const session =
        await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
      if (miningCredential !== undefined) {
        session.dispose();
        throw new Error('static bootstrap root created multiple setup credentials');
      }
      miningCredential =
        claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2(session);
      return Object.freeze({
        signer: session.signer,
        dispose: () => session.dispose(),
        run: (setupInput: Parameters<typeof session.run>[0]) =>
          session.run(setupInput),
      });
    },
    createPacketSession: signer => {
      const session =
        createSubstrateFederatedIsolatedDevnetPacketSessionV1(signer);
      return Object.freeze({
        signer: session.signer,
        dispose: () => session.dispose(),
        produce: (packetInput: Parameters<typeof session.produce>[0]) =>
          session.produce(packetInput),
      });
    },
    createErgoNodeSession: binding => {
      if (nodeOwnerCreated) {
        throw new Error('static bootstrap root may create one Ergo node owner');
      }
      nodeOwnerCreated = true;
      const credential = miningCredential;
      if (credential === undefined) {
        throw new Error(
          'static bootstrap root requires the setup mining credential',
        );
      }
      miningCredential = undefined;
      const session = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1(
        {
          javaExecutablePath: built.javaExecutablePath,
          expectedJavaExecutableSha256Hex:
            built.receipt.toolchain.javaExecutableSha256Hex,
          nodeAssemblyJarPath: built.nodeAssemblyJarPath,
          expectedNodeAssemblyJarSha256Hex:
            built.receipt.build.artifactSha256Hex,
          buildIdentityDigestHex: built.receipt.buildIdentityDigestHex,
        },
        binding,
        credential,
      );
      return captureProcessReceipt(session, receipt => {
        if (processReceipt !== undefined) {
          throw new Error('static bootstrap root captured multiple process receipts');
        }
        processReceipt = receipt;
      });
    },
    collectSourceHistory: sourceInput =>
      collectSubstrateFederatedAuthoritySafeDevnetHistoryV1(sourceInput),
    discoverRewardInputs: signer =>
      discoverSubstrateFederatedRewardInputsV1(signer),
    collectErgoHistory: discovery =>
      collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(discovery),
  };

  const lifecycle =
    await runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1(
      input.lifecycle,
      Object.freeze(ports),
    );
  const exactProcessReceipt = requireExactProcessReceipt(
    processReceipt,
    built.receipt,
    lifecycle,
  );
  const processReceiptDigestHex = sha256CanonicalJson(
    exactProcessReceipt,
    PROCESS_RECEIPT_DIGEST_DOMAIN,
  );
  const body = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_ROOT_V1_SCHEMA,
    version: 1 as const,
    status: 'static_owned_node_no_submit_bootstrap_passed' as const,
    staticCallbackManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_STATIC_CALLBACK_MANIFEST_DIGEST_V1,
    build: built.receipt,
    process: {
      receiptDigestHex: processReceiptDigestHex,
      receipt: exactProcessReceipt,
    },
    lifecycle: {
      federationProfileIdHex: fixedDigest(
        lifecycle.profilePins.federationProfileIdHex,
        'federation profile ID',
      ),
      sourceAttestationKeySetDigestHex: fixedDigest(
        lifecycle.profilePins.sourceAttestationKeySetDigestHex,
        'source-attestation key-set digest',
      ),
      ergoAdmissionKeySetDigestHex: fixedDigest(
        lifecycle.profilePins.ergoAdmissionKeySetDigestHex,
        'Ergo-admission key-set digest',
      ),
      packetReceiptDigestHex: fixedDigest(
        lifecycle.packet.receiptDigestHex,
        'packet receipt digest',
      ),
      setupCheckReceiptDigestHex: fixedDigest(
        lifecycle.setupCheck.receiptDigestHex,
        'setup-check receipt digest',
      ),
    },
    checks: {
      exactLockedPatchedNodeBuiltBeforeSignerCreation: true as const,
      staticLifecycleFunctionSelected: true as const,
      staticRuntimePortsBound: true as const,
      replacementCallbackAccepted: false as const,
      setupAndPacketSessionsOneShotWrapped: true as const,
      producerCompletionAwaitedBeforeTeardown: true as const,
      rootLevelTimeoutRaceAbsent: true as const,
      exactProcessReceiptNormalizedBeforeDigest: true as const,
      buildProcessAndLifecycleDigestsJoined: true as const,
      returnedValueContainsCapabilities: false as const,
    },
    boundaries: {
      localCompatibilityExecutionOnly: true as const,
      transitiveProducerCancellationEstablished: false as const,
      loadedBytesAttestedAgainstHostileSameUserProcess: false as const,
      sourceConsensusIndependentlyAuthenticated: false as const,
      ergoConsensusIndependentlyAuthenticated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      profileActivated: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, ROOT_RECEIPT_DIGEST_DOMAIN),
  });
  assertNoCapabilityValue(receipt);
  return Object.freeze({ receipt });
}

function captureProcessReceipt(
  session: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeSessionV1>,
  capture: (
    receipt: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Receipt>,
  ) => void,
): Readonly<SubstrateFederatedIsolatedDevnetErgoNodeSessionV1> {
  return Object.freeze({
    startMining: () => session.startMining(),
    withMiningStoppedReadOnlyTarget: async <T>(
      action: (
        target: Readonly<
          SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1
        >,
      ) => Promise<T>,
    ) => {
      const managed =
        await session.withMiningStoppedReadOnlyTarget<T>(action);
      const receipt = managed.receipt as
        Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Receipt>;
      capture(receipt);
      return managed;
    },
    stop: () => session.stop(),
  });
}

function requireExactProcessReceipt(
  value:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Receipt>
    | undefined,
  build: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>,
  lifecycle: Readonly<SubstrateFederatedIsolatedDevnetBootstrapLifecycleV1>,
): Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Receipt> {
  const record = exactDataRecord(value, [
    'schema',
    'version',
    'primaryNodeOrigin',
    'witnessNodeOrigin',
    'miningStoppedBeforeAction',
    'buildIdentityDigestHex',
    'executableIdentityDigestHex',
    'processBindingDigestHex',
    'finalSnapshot',
    'checks',
  ], 'static bootstrap process receipt');
  const finalSnapshot = exactDataRecord(record.finalSnapshot, [
    'network',
    'fullHeight',
    'indexedHeight',
    'headerIdHex',
  ], 'static bootstrap process final snapshot');
  const checks = exactDataRecord(record.checks, [
    'directJavaAssemblyLaunch',
    'javaImageAndPinnedFilesRechecked',
    'isolatedFreshRuntimeStateUsed',
    'setupSignerSecretNeverExposedToCompositionRoot',
    'setupSignerMiningCredentialConsumedOnce',
    'ephemeralPowSecretPassedOnlyViaProcessEnvironment',
    'ephemeralPowSecretDiscardedBeforeAction',
    'miningTargetBoundToSessionPublicKey',
    'miningPhaseStoppedBeforeTargetFreeze',
    'sameDataDirectoriesResumedNonMining',
    'managedActionCompletionJoinedBeforeCleanup',
    'managedActionOverrunRejectedAfterJoin',
    'unverifiedProcessTerminationFailsStop',
    'exactNonMiningSnapshotStableAcrossAction',
    'spawnedProcessListenersExclusivelyLoopbackOwned',
    'configurationAndArtifactRecheckedAfterAction',
  ], 'static bootstrap process checks');
  const buildIdentityDigestHex = fixedDigest(
    record.buildIdentityDigestHex,
    'process build identity digest',
  );
  const executableIdentityDigestHex = fixedDigest(
    record.executableIdentityDigestHex,
    'process executable identity digest',
  );
  const processBindingDigestHex = fixedDigest(
    record.processBindingDigestHex,
    'process binding digest',
  );
  if (
    record.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA
    || record.version !== 1
    || record.primaryNodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
    || record.witnessNodeOrigin
      !== SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN
    || record.miningStoppedBeforeAction !== true
    || finalSnapshot.network !== 'devnet'
    || exactHeight(finalSnapshot.fullHeight, 'process full height') < 8
    || exactHeight(finalSnapshot.indexedHeight, 'process indexed height') < 8
    || exactHeight(finalSnapshot.indexedHeight, 'process indexed height')
      !== exactHeight(finalSnapshot.fullHeight, 'process full height')
    || Object.values(checks).some(check => check !== true)
    || buildIdentityDigestHex !== build.buildIdentityDigestHex
    || lifecycle.ergoNodeExecution.buildIdentityDigestHex
      !== buildIdentityDigestHex
    || lifecycle.ergoNodeExecution.executableIdentityDigestHex
      !== executableIdentityDigestHex
    || lifecycle.ergoNodeExecution.processBindingDigestHex
      !== processBindingDigestHex
  ) {
    throw new Error(
      'static bootstrap lifecycle does not bind the exact full process receipt',
    );
  }
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
    version: 1 as const,
    primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    miningStoppedBeforeAction: true as const,
    buildIdentityDigestHex,
    executableIdentityDigestHex,
    processBindingDigestHex,
    finalSnapshot: {
      network: 'devnet' as const,
      fullHeight: exactHeight(finalSnapshot.fullHeight, 'process full height'),
      indexedHeight: exactHeight(
        finalSnapshot.indexedHeight,
        'process indexed height',
      ),
      headerIdHex: fixedDigest(
        finalSnapshot.headerIdHex,
        'process final header ID',
      ),
    },
    checks: {
      directJavaAssemblyLaunch: true as const,
      javaImageAndPinnedFilesRechecked: true as const,
      isolatedFreshRuntimeStateUsed: true as const,
      setupSignerSecretNeverExposedToCompositionRoot: true as const,
      setupSignerMiningCredentialConsumedOnce: true as const,
      ephemeralPowSecretPassedOnlyViaProcessEnvironment: true as const,
      ephemeralPowSecretDiscardedBeforeAction: true as const,
      miningTargetBoundToSessionPublicKey: true as const,
      miningPhaseStoppedBeforeTargetFreeze: true as const,
      sameDataDirectoriesResumedNonMining: true as const,
      managedActionCompletionJoinedBeforeCleanup: true as const,
      managedActionOverrunRejectedAfterJoin: true as const,
      unverifiedProcessTerminationFailsStop: true as const,
      exactNonMiningSnapshotStableAcrossAction: true as const,
      spawnedProcessListenersExclusivelyLoopbackOwned: true as const,
      configurationAndArtifactRecheckedAfterAction: true as const,
    },
  });
}

function fixedDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be 32-byte lowercase hexadecimal`);
  }
  return value;
}

function exactHeight(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function exactDataRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(record).sort())
      !== JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} fields differ from V1`);
  }
  return record;
}

function assertNoCapabilityValue(value: unknown): void {
  const visit = (current: unknown): void => {
    if (typeof current === 'function') {
      throw new Error('static bootstrap receipt must not retain capabilities');
    }
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (current !== null && typeof current === 'object') {
      Object.values(current).forEach(visit);
    }
  };
  visit(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
