import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readBoundedRegularFile, writeNewFile } from '../create-only-out-of-repository-artifact.js';
import { assertNoDuplicateJsonKeys, canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  createNativeTwoCycleWorkerFailureDiagnosticV1,
  type NativeTwoCycleFailureStageV1,
} from '../substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV1 } from '../substrate-federated-native-two-cycle-root-phase-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 } from '../substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { createNativeTwoCycleWorkerCycleStepV1 } from '../substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { createNativeTwoCycleWorkerCallbackTimingV1, projectNativeTwoCycleCallbackTimingFailureV1 }
  from '../substrate-federated-native-two-cycle-callback-timing-v1.js';
import { projectNativeTwoCycleCycleStepFailureV1 } from '../substrate-federated-native-two-cycle-cycle-step-v1.js';
import { createNativeTwoCycleWorkerTrackerContextV1,
  projectSubstrateFederatedTrackerV2BuildFailurePhaseV1,
  createNativeTwoCycleWorkerTrackerStatementV1,
  projectSubstrateFederatedTrackerV2StatementFailureCheckV1 }
  from '../substrate-federated-tracker-context-failure-v1.js';
import { createNativeTwoCycleWorkerSourceLockStageV1,
  projectSubstrateFederatedNativeSourceLockFailureStageV1 }
  from '../substrate-federated-native-source-lock-failure-v1.js';
import { createNativeTwoCycleWorkerCommittedReserveStageV1,
  projectSubstrateFederatedNativeCommittedReserveFailureStageV1 }
  from '../substrate-federated-native-committed-reserve-failure-v1.js';
import { projectNativeTwoCycleSetupFailureStageV1 } from '../substrate-federated-native-genesis-setup-stage-v1.js';
import { createNativeTwoCycleWorkerSetupStageV1 } from '../substrate-federated-native-two-cycle-setup-stage-diagnostic-v1.js';
import { projectNativeTwoCycleErgoNodeCompletionFailureReasonV1,
  projectNativeTwoCycleErgoNodePostCallbackStageV1 }
  from '../substrate-federated-isolated-devnet-ergo-node-post-callback-stage-v1.js';
import { createNativeTwoCycleWorkerOwnerStageV1,
  createNativeTwoCycleWorkerOwnerStageV2 }
  from '../substrate-federated-native-two-cycle-owner-stage-diagnostic-v1.js';
import {
  validateWasmAvlBuildToolHashV2,
  type WasmAvlBuildToolNameV2,
} from '../substrate-federated-native-wasm-avl-build-tool-pins-v1.js';
import { projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 } from '../substrate-federated-native-two-cycle-root-phase-v1.js';
import { projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2 } from '../substrate-federated-native-two-cycle-root-phase-v2.js';
import {
  loadSubstrateFederatedNativeTwoCycleInvocationV1,
  projectSubstrateFederatedNativeTwoCycleResultV1,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1,
} from '../substrate-federated-native-two-cycle-invocation-v1.js';
import { createNativeTwoCycleWorkerRecoveryLocatorV1 }
  from '../substrate-federated-native-two-cycle-recovery-locator-v1.js';
import {
  assertSubstrateFederatedNativeWasmAvlPackageMatchesV1,
  type SubstrateFederatedNativeWasmAvlPackageIdentityV1,
} from '../substrate-federated-native-wasm-avl-package-v1.js';

const WORKER_TRANSPORT_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-worker-transport.v1';
const WASM_PACKAGE_EVIDENCE_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-wasm-avl-package.v2';
const WORKER_WASM_PACKAGE_CHECK_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-worker-wasm-avl-package.v1';

export async function runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
  argv: readonly string[],
): Promise<void> {
  const args = parseArguments(argv);
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('native two-cycle worker requires Windows x64');
  }
  const invocation = loadSubstrateFederatedNativeTwoCycleInvocationV1(
    args.configPath,
    args.attemptPath,
  );
  if (invocation.configSha256Hex !== args.expectedConfigSha256Hex) {
    throw new Error('native two-cycle worker config digest differs');
  }
  if (['result.json', 'failure.json'].some(name => existsSync(join(invocation.attemptPath, name)))) {
    throw new Error('native two-cycle attempt already has a terminal artifact');
  }
  const startBytes = readBoundedRegularFile(join(invocation.attemptPath, 'start.json'),
    'native two-cycle parent start', 16 * 1024).bytes;
  const startText = new TextDecoder('utf-8', { fatal: true }).decode(startBytes);
  assertNoDuplicateJsonKeys(startText);
  const start = JSON.parse(startText) as unknown;
  if (start === null || typeof start !== 'object' || Array.isArray(start)) {
    throw new Error('native two-cycle parent start must be an object');
  }
  const parent = start as Record<string, unknown>;
  if (parent.schema !== 'e2s.substrate-federated-native-two-cycle-start.v1'
    || parent.version !== 1 || parent.status !== 'two_cycle_invocation_started'
    || parent.configSha256Hex !== invocation.configSha256Hex
    || parent.expectedBridgeCommit !== invocation.config.expectedBridgeCommit
    || parent.pathIdentityDigestHex !== invocation.pathIdentityDigestHex) {
    throw new Error('native two-cycle parent start differs from the captured invocation');
  }
  const wasmPackageEvidence = readWasmAvlPackageEvidence(
    join(invocation.attemptPath, 'wasm-avl-package.json'),
    args.expectedWasmAvlPackageSha256Hex,
    invocation.config.expectedBridgeCommit,
    String(parent.expectedBridgeTree),
  );
  // Claim the attempt before entering signing custody. Even a failed root call
  // permanently consumes this worker entry; a retained attempt cannot replay it.
  writeNewFile(
    join(invocation.attemptPath, 'worker-start.json'),
    Buffer.from(`${canonicalJson({ configSha256Hex: invocation.configSha256Hex })}\n`, 'utf8'),
    'native two-cycle worker claim',
  );
  let stage: NativeTwoCycleFailureStageV1 = 'pre-root';
  try {
    const before =
      await validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(
        invocation,
      );
    if (before.repository.tree !== parent.expectedBridgeTree
      || before.toolIdentityDigestHex !== parent.toolIdentityDigestHex) {
      throw new Error('native two-cycle worker environment differs from parent start');
    }
    assertSubstrateFederatedNativeWasmAvlPackageMatchesV1(
      invocation.config.bridgeRoot,
      wasmPackageEvidence,
    );
    const { runSubstrateFederatedGenesisTargetRootV1 } = await import(
      '../apps/bridge-daemon/substrate-federated-genesis-target-root-v1.js'
    );
    assertSubstrateFederatedNativeWasmAvlPackageMatchesV1(
      invocation.config.bridgeRoot,
      wasmPackageEvidence,
    );
    stage = 'root-or-cleanup';
    const rootResult = await runSubstrateFederatedGenesisTargetRootV1(
      invocation.rootInput,
    );
    stage = 'projection';
    const result = projectSubstrateFederatedNativeTwoCycleResultV1(rootResult);
    stage = 'post-root-identity';
    const after =
      await validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(
        invocation,
      );
    if (
      before.repository.commit !== after.repository.commit
      || before.repository.tree !== after.repository.tree
      || before.toolIdentityDigestHex !== after.toolIdentityDigestHex
      || before.runtime.nodeExecutableSha256
        !== after.runtime.nodeExecutableSha256
      || before.runtime.relayerPackageLockSha256
        !== after.runtime.relayerPackageLockSha256
      || before.runtime.gitExecutableSha256
        !== after.runtime.gitExecutableSha256
    ) throw new Error('native two-cycle worker identities changed during execution');
    assertSubstrateFederatedNativeWasmAvlPackageMatchesV1(
      invocation.config.bridgeRoot,
      wasmPackageEvidence,
    );
    writeNewFile(
      join(invocation.attemptPath, 'worker-wasm-avl-package.json'),
      Buffer.from(`${canonicalJson({
        schema: WORKER_WASM_PACKAGE_CHECK_SCHEMA,
        version: 1,
        status: 'package_identity_revalidated',
        bridgeCommit: after.repository.commit,
        bridgeTree: after.repository.tree,
        sourceSha256Hex: wasmPackageEvidence.sourceSha256Hex,
        packageSha256Hex: wasmPackageEvidence.packageSha256Hex,
        checks: {
          matchedBeforeImport: true,
          matchedAfterImport: true,
          matchedAfterRoot: true,
        },
      })}\n`, 'utf8'),
      'native two-cycle worker WASM AVL package check',
    );
    const transport = Object.freeze({
      schema: WORKER_TRANSPORT_SCHEMA,
      version: 1 as const,
      status: 'root_completed_and_cleaned' as const,
      configSha256Hex: invocation.configSha256Hex,
      bridgeCommit: after.repository.commit,
      bridgeTree: after.repository.tree,
      pathIdentityDigestHex: invocation.pathIdentityDigestHex,
      toolIdentityDigestHex: after.toolIdentityDigestHex,
      result,
    });
    stage = 'transport-publication';
    const recoveryLocator = createNativeTwoCycleWorkerRecoveryLocatorV1(
      rootResult.recoveryEvidence,
      {
        configSha256Hex: invocation.configSha256Hex,
        bridgeCommit: after.repository.commit,
        bridgeTree: after.repository.tree,
        pathIdentityDigestHex: invocation.pathIdentityDigestHex,
        toolIdentityDigestHex: after.toolIdentityDigestHex,
        rootResultDigestHex: result.rootResultDigestHex,
      },
    );
    writeNewFile(
      join(invocation.attemptPath, 'worker-recovery-locator-v1.json'),
      Buffer.from(`${canonicalJson(recoveryLocator)}\n`, 'utf8'),
      'native two-cycle worker recovery locator',
    );
    writeNewFile(
      join(invocation.attemptPath, 'worker-result.json'),
      Buffer.from(`${canonicalJson(transport)}\n`, 'utf8'),
      'native two-cycle worker transport',
    );
  } catch (primaryFailure) {
    let workerFailureText: string | undefined;
    let workerRootPhaseV2Text: string | undefined;
    let workerCycleStepText: string | undefined;
    let workerOwnerStageText: string | undefined;
    let workerOwnerStageV2Text: string | undefined;
    try {
      const diagnostic = createNativeTwoCycleWorkerFailureDiagnosticV1({
        configSha256Hex: invocation.configSha256Hex,
        expectedBridgeCommit: invocation.config.expectedBridgeCommit,
        pathIdentityDigestHex: invocation.pathIdentityDigestHex,
      }, stage, primaryFailure);
      writeNewFile(
        join(invocation.attemptPath, 'worker-failure.json'),
        Buffer.from(`${canonicalJson(diagnostic)}\n`, 'utf8'),
        'native two-cycle worker failure diagnostic',
      );
      workerFailureText = `${canonicalJson(diagnostic)}\n`;
    } catch {
      // Optional diagnostics never replace the failure or release the worker claim.
    }
    if (stage === 'root-or-cleanup') {
      try {
        const projection = projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
          primaryFailure,
        );
        if (projection !== null) {
          const companion = createNativeTwoCycleWorkerRootPhaseV1({
            configSha256Hex: invocation.configSha256Hex,
            expectedBridgeCommit: invocation.config.expectedBridgeCommit,
            pathIdentityDigestHex: invocation.pathIdentityDigestHex,
          }, projection);
          writeNewFile(
            join(invocation.attemptPath, 'worker-root-phase.json'),
            Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
            'native two-cycle worker root phase companion',
          );
        }
      } catch {
        // The optional root phase cannot change the existing diagnostic or failure.
      }
      try {
        const projection = projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
          primaryFailure,
        );
        if (projection !== null) {
          const companion = createNativeTwoCycleWorkerRootPhaseV2({
            configSha256Hex: invocation.configSha256Hex,
            expectedBridgeCommit: invocation.config.expectedBridgeCommit,
            pathIdentityDigestHex: invocation.pathIdentityDigestHex,
          }, projection);
          writeNewFile(
            join(invocation.attemptPath, 'worker-root-phase-v2.json'),
            Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
            'native two-cycle worker root phase V2 companion',
          );
          workerRootPhaseV2Text = `${canonicalJson(companion)}\n`;
        }
      } catch {
        // The optional V2 phase detail cannot change the existing failure or V1 evidence.
      }
      try {
        const projection = projectNativeTwoCycleCycleStepFailureV1(primaryFailure);
        if (projection !== null && workerFailureText !== undefined && workerRootPhaseV2Text !== undefined) {
          const companion = createNativeTwoCycleWorkerCycleStepV1({
            configSha256Hex: invocation.configSha256Hex,
            expectedBridgeCommit: invocation.config.expectedBridgeCommit,
            pathIdentityDigestHex: invocation.pathIdentityDigestHex,
          }, workerFailureText, workerRootPhaseV2Text, projection);
          writeNewFile(join(invocation.attemptPath, 'worker-cycle-step.json'),
            Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
            'native two-cycle worker cycle step companion');
          workerCycleStepText = `${canonicalJson(companion)}\n`;
        }
      } catch {
        // Optional step capture cannot replace failure or release the consumed claim.
      }
      try {
        const stage = projectSubstrateFederatedNativeSourceLockFailureStageV1(primaryFailure);
        if (stage !== null && workerFailureText !== undefined
          && workerRootPhaseV2Text !== undefined && workerCycleStepText !== undefined) {
          const companion = createNativeTwoCycleWorkerSourceLockStageV1({
            configSha256Hex: invocation.configSha256Hex,
            expectedBridgeCommit: invocation.config.expectedBridgeCommit,
            pathIdentityDigestHex: invocation.pathIdentityDigestHex,
          }, workerFailureText, workerRootPhaseV2Text, workerCycleStepText,
          stage.sourceLockStage, stage.sourceLockKind);
          writeNewFile(join(invocation.attemptPath, 'worker-source-lock-stage.json'),
            Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
            'native two-cycle worker source-lock stage companion');
        }
      } catch {
        // Optional operation detail never replaces failure or releases the claim.
      }
      try {
        const stage = projectSubstrateFederatedNativeCommittedReserveFailureStageV1(primaryFailure);
        if (stage !== null && workerFailureText !== undefined
          && workerRootPhaseV2Text !== undefined && workerCycleStepText !== undefined) {
          const companion = createNativeTwoCycleWorkerCommittedReserveStageV1({
            configSha256Hex: invocation.configSha256Hex,
            expectedBridgeCommit: invocation.config.expectedBridgeCommit,
            pathIdentityDigestHex: invocation.pathIdentityDigestHex,
          }, workerFailureText, workerRootPhaseV2Text, workerCycleStepText,
          stage.committedReserveStage, stage.committedReserveKind);
          writeNewFile(join(invocation.attemptPath, 'worker-committed-reserve-stage.json'),
            Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
            'native two-cycle worker committed-reserve stage companion');
        }
      } catch {
        // Optional reserve detail cannot replace failure or release the claim.
      }
      try {
        const phase = projectSubstrateFederatedTrackerV2BuildFailurePhaseV1(primaryFailure);
        if (phase !== null && workerFailureText !== undefined
          && workerRootPhaseV2Text !== undefined && workerCycleStepText !== undefined) {
          const companion = createNativeTwoCycleWorkerTrackerContextV1({
            configSha256Hex: invocation.configSha256Hex,
            expectedBridgeCommit: invocation.config.expectedBridgeCommit,
            pathIdentityDigestHex: invocation.pathIdentityDigestHex,
          }, workerFailureText, workerRootPhaseV2Text, workerCycleStepText, phase);
          writeNewFile(join(invocation.attemptPath, 'worker-tracker-context.json'),
            Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
            'native two-cycle worker tracker context companion');
          // Only a newly created preceding receipt may supply this optional join.
          const check = projectSubstrateFederatedTrackerV2StatementFailureCheckV1(primaryFailure);
          if (check !== null) {
            const statement = createNativeTwoCycleWorkerTrackerStatementV1({
              configSha256Hex: invocation.configSha256Hex,
              expectedBridgeCommit: invocation.config.expectedBridgeCommit,
              pathIdentityDigestHex: invocation.pathIdentityDigestHex,
            }, workerFailureText, workerRootPhaseV2Text, workerCycleStepText,
            `${canonicalJson(companion)}\n`, check);
            writeNewFile(join(invocation.attemptPath, 'worker-tracker-statement.json'),
              Buffer.from(`${canonicalJson(statement)}\n`, 'utf8'),
              'native two-cycle worker tracker statement companion');
          }
        }
      } catch {
        // Optional constructor detail cannot replace failure or release the claim.
      }
      try {
        const setupStage = projectNativeTwoCycleSetupFailureStageV1(primaryFailure);
        if (setupStage !== null && workerFailureText !== undefined
          && workerRootPhaseV2Text !== undefined && workerCycleStepText !== undefined) {
          const companion = createNativeTwoCycleWorkerSetupStageV1({
            configSha256Hex: invocation.configSha256Hex,
            expectedBridgeCommit: invocation.config.expectedBridgeCommit,
            pathIdentityDigestHex: invocation.pathIdentityDigestHex,
          }, workerFailureText, workerRootPhaseV2Text, workerCycleStepText, setupStage);
          writeNewFile(join(invocation.attemptPath, 'worker-setup-stage.json'),
            Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
            'native two-cycle worker setup stage companion');
        }
      } catch {
        // Optional setup detail cannot replace the original failure or release its claim.
      }
      try {
        const ownerStage = projectNativeTwoCycleErgoNodePostCallbackStageV1(primaryFailure);
        if (ownerStage !== null && workerFailureText !== undefined
          && workerRootPhaseV2Text !== undefined && workerCycleStepText !== undefined) {
          const companion = createNativeTwoCycleWorkerOwnerStageV1({
            configSha256Hex: invocation.configSha256Hex,
            expectedBridgeCommit: invocation.config.expectedBridgeCommit,
            pathIdentityDigestHex: invocation.pathIdentityDigestHex,
          }, workerFailureText, workerRootPhaseV2Text, workerCycleStepText, ownerStage);
          writeNewFile(join(invocation.attemptPath, 'worker-owner-stage.json'),
            Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
            'native two-cycle worker owner stage companion');
          workerOwnerStageText = `${canonicalJson(companion)}\n`;
        }
      } catch {
        // Optional owner detail cannot replace failure or older companions.
      }
      try {
        const reason = projectNativeTwoCycleErgoNodeCompletionFailureReasonV1(primaryFailure);
        if (reason !== null && workerFailureText !== undefined
          && workerRootPhaseV2Text !== undefined && workerCycleStepText !== undefined
          && workerOwnerStageText !== undefined) {
          const companion = createNativeTwoCycleWorkerOwnerStageV2({
            configSha256Hex: invocation.configSha256Hex,
            expectedBridgeCommit: invocation.config.expectedBridgeCommit,
            pathIdentityDigestHex: invocation.pathIdentityDigestHex,
          }, workerFailureText, workerRootPhaseV2Text, workerCycleStepText,
          workerOwnerStageText, reason);
          writeNewFile(join(invocation.attemptPath, 'worker-owner-stage-v2.json'),
            Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
            'native two-cycle worker owner completion reason companion');
          workerOwnerStageV2Text = `${canonicalJson(companion)}\n`;
        }
      } catch {
        // Optional reason cannot replace failure or any earlier companion.
      }
      try {
        const trace = projectNativeTwoCycleCallbackTimingFailureV1(primaryFailure);
        if (trace !== null && workerFailureText !== undefined && workerRootPhaseV2Text !== undefined
          && workerCycleStepText !== undefined && workerOwnerStageText !== undefined
          && workerOwnerStageV2Text !== undefined) {
          const companion = createNativeTwoCycleWorkerCallbackTimingV1({
            configSha256Hex: invocation.configSha256Hex,
            expectedBridgeCommit: invocation.config.expectedBridgeCommit,
            pathIdentityDigestHex: invocation.pathIdentityDigestHex,
          }, { workerFailureText, workerRootPhaseV2Text, workerCycleStepText,
            workerOwnerStageText, workerOwnerStageV2Text }, trace);
          writeNewFile(join(invocation.attemptPath, 'worker-callback-timing-v1.json'),
            Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
            'native two-cycle worker callback timing companion');
        }
      } catch {
        // Optional timing cannot replace the original failure or any previous receipt.
      }
    }
    throw primaryFailure;
  }
}

function parseArguments(argv: readonly string[]): Readonly<{
  configPath: string;
  expectedConfigSha256Hex: string;
  expectedWasmAvlPackageSha256Hex: string;
  attemptPath: string;
}> {
  if (
    argv.length !== 8
    || argv[0] !== '--config'
    || argv[1] === undefined
    || argv[1].length === 0
    || argv[1].startsWith('--')
    || argv[2] !== '--expected-config-sha256'
    || argv[3] === undefined
    || !/^[0-9a-f]{64}$/u.test(argv[3])
    || argv[4] !== '--expected-wasm-avl-package-sha256'
    || argv[5] === undefined
    || !/^[0-9a-f]{64}$/u.test(argv[5])
    || argv[6] !== '--attempt'
    || argv[7] === undefined
    || argv[7].length === 0
    || argv[7].startsWith('--')
  ) throw new Error('native two-cycle worker arguments are invalid');
  return Object.freeze({
    configPath: argv[1],
    expectedConfigSha256Hex: argv[3],
    expectedWasmAvlPackageSha256Hex: argv[5],
    attemptPath: argv[7],
  });
}

function readWasmAvlPackageEvidence(
  evidencePath: string,
  expectedPackageSha256Hex: string,
  expectedBridgeCommit: string,
  expectedBridgeTree: string,
): Readonly<SubstrateFederatedNativeWasmAvlPackageIdentityV1> {
  const bytes = readBoundedRegularFile(
    evidencePath,
    'native two-cycle generated WASM AVL package evidence',
    32 * 1024,
  ).bytes;
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assertNoDuplicateJsonKeys(text);
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; }
  catch { throw new Error('native two-cycle WASM AVL package evidence is invalid JSON'); }
  if (text !== `${canonicalJson(parsed)}\n`) {
    throw new Error('native two-cycle WASM AVL package evidence must be canonical JSON plus one LF');
  }
  const evidence = exactRecord(parsed, [
    'schema', 'version', 'status', 'bridgeCommit', 'bridgeTree', 'build',
  ], 'native two-cycle WASM AVL package evidence');
  const build = exactRecord(evidence.build, [
    'sourceSha256Hex', 'packageSha256Hex', 'wasmPackVersion',
    'wasmPackExecutableSha256Hex', 'wasmBindgenVersion',
    'wasmBindgenExecutableSha256Hex', 'rustcVersion', 'rustcExecutableSha256Hex',
    'cargoVersion', 'cargoExecutableSha256Hex',
  ], 'native two-cycle WASM AVL package build identity');
  const hash = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
      throw new Error(`${label} is invalid`);
    }
    return value;
  };
  const validateToolHash = (
    name: WasmAvlBuildToolNameV2,
    value: unknown,
    label: string,
  ): void => {
    validateWasmAvlBuildToolHashV2(name, hash(value, label), 'win32-x64');
  };
  if (
    evidence.schema !== WASM_PACKAGE_EVIDENCE_SCHEMA
    || evidence.version !== 1
    || evidence.status !== 'source-and-tool-bound-package-built'
    || evidence.bridgeCommit !== expectedBridgeCommit
    || evidence.bridgeTree !== expectedBridgeTree
    || build.wasmPackVersion !== 'wasm-pack 0.14.0'
    || build.wasmBindgenVersion !== 'wasm-bindgen 0.2.120'
    || build.rustcVersion !== 'rustc 1.97.1 (8bab26f4f 2026-07-14)'
    || build.cargoVersion !== 'cargo 1.97.1 (c980f4866 2026-06-30)'
  ) throw new Error('native two-cycle WASM AVL package evidence identity differs');
  const identity = Object.freeze({
    sourceSha256Hex: hash(build.sourceSha256Hex, 'WASM AVL source digest'),
    packageSha256Hex: hash(build.packageSha256Hex, 'WASM AVL package digest'),
  });
  validateToolHash('wasmPack', build.wasmPackExecutableSha256Hex, 'wasm-pack executable digest');
  validateToolHash('wasmBindgen', build.wasmBindgenExecutableSha256Hex, 'wasm-bindgen executable digest');
  validateToolHash('rustc', build.rustcExecutableSha256Hex, 'rustc executable digest');
  validateToolHash('cargo', build.cargoExecutableSha256Hex, 'cargo executable digest');
  if (identity.packageSha256Hex !== expectedPackageSha256Hex) {
    throw new Error('native two-cycle worker WASM AVL package digest differs from parent');
  }
  return identity;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields are invalid`);
  }
  return record;
}

async function main(): Promise<void> {
  await runSubstrateFederatedNativeTwoCycleWorkerFromArguments(
    process.argv.slice(2),
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('native two-cycle worker failed\n');
    process.exitCode = 1;
  });
}
