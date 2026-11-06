import { join } from 'node:path';

import { writeNewFile } from './create-only-out-of-repository-artifact.js';
import { canonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  createNativeTwoCycleWorkerFailureDiagnosticV1,
  type NativeTwoCycleFailureBindingsV1,
  type NativeTwoCycleFailureStageV1,
} from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { createNativeTwoCycleWorkerCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1,
  createNativeTwoCycleWorkerDepositFundingSubstageV1, projectNativeDepositFundingSubstageV1 }
  from './substrate-federated-native-deposit-funding-substage-v1.js';
import { selectNativeDepositFundingWorkerStageV2,
  type NativeDepositFundingStageObserverV2,
  type NativeDepositFundingStageObservationV2 }
  from './substrate-federated-native-deposit-funding-stage-v2.js';
import { projectNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-v2.js';

/** Process-local observation only; a cleared or invalid callback forgets the stage. */
export function createNativeTwoCyclePublicFailureLatchV2(): Readonly<{
  observe: NativeDepositFundingStageObserverV2;
  selected: () => Readonly<NativeDepositFundingStageObservationV2> | null;
}> {
  let lastDepositFunding: Readonly<NativeDepositFundingStageObservationV2> | null = null;
  const observe: NativeDepositFundingStageObserverV2 = (cycle, fundingStage) => {
    if (fundingStage === null) { lastDepositFunding = null; return; }
    if ((cycle !== 'cycle-1' && cycle !== 'cycle-2')
        || !NATIVE_DEPOSIT_FUNDING_SUBSTAGES_V1.includes(fundingStage)) {
      lastDepositFunding = null;
      return;
    }
    lastDepositFunding = Object.freeze({ cycle, lastEnteredStage: fundingStage });
  };
  return Object.freeze({ observe, selected: () => lastDepositFunding });
}

/** Optional create-only public sidecars; the caller retains its original failure. */
export function publishNativeTwoCycleWorkerPublicFailureV2(
  attemptPath: string,
  bindings: Readonly<NativeTwoCycleFailureBindingsV1>,
  stage: NativeTwoCycleFailureStageV1,
  primaryFailure: unknown,
  lastDepositFunding: Readonly<NativeDepositFundingStageObservationV2> | null,
): Readonly<{
  workerFailureText: string | undefined;
  workerRootPhaseV2Text: string | undefined;
  workerCycleStepText: string | undefined;
}> {
  let workerFailureText: string | undefined;
  let workerRootPhaseV2Text: string | undefined;
  let workerCycleStepText: string | undefined;
  try {
    const diagnostic = createNativeTwoCycleWorkerFailureDiagnosticV1({
      configSha256Hex: bindings.configSha256Hex,
      expectedBridgeCommit: bindings.expectedBridgeCommit,
      pathIdentityDigestHex: bindings.pathIdentityDigestHex,
    }, stage, primaryFailure);
    writeNewFile(
      join(attemptPath, 'worker-failure.json'),
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
          configSha256Hex: bindings.configSha256Hex,
          expectedBridgeCommit: bindings.expectedBridgeCommit,
          pathIdentityDigestHex: bindings.pathIdentityDigestHex,
        }, projection);
        writeNewFile(
          join(attemptPath, 'worker-root-phase.json'),
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
          configSha256Hex: bindings.configSha256Hex,
          expectedBridgeCommit: bindings.expectedBridgeCommit,
          pathIdentityDigestHex: bindings.pathIdentityDigestHex,
        }, projection);
        writeNewFile(
          join(attemptPath, 'worker-root-phase-v2.json'),
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
          configSha256Hex: bindings.configSha256Hex,
          expectedBridgeCommit: bindings.expectedBridgeCommit,
          pathIdentityDigestHex: bindings.pathIdentityDigestHex,
        }, workerFailureText, workerRootPhaseV2Text, projection);
        writeNewFile(join(attemptPath, 'worker-cycle-step.json'),
          Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
          'native two-cycle worker cycle step companion');
        workerCycleStepText = `${canonicalJson(companion)}\n`;
      }
    } catch {
      // Optional step capture cannot replace failure or release the consumed claim.
    }
    try {
      const substage = projectNativeDepositFundingSubstageV1(primaryFailure);
      if (substage !== null && workerFailureText !== undefined
        && workerRootPhaseV2Text !== undefined && workerCycleStepText !== undefined) {
        const companion = createNativeTwoCycleWorkerDepositFundingSubstageV1({
          configSha256Hex: bindings.configSha256Hex,
          expectedBridgeCommit: bindings.expectedBridgeCommit,
          pathIdentityDigestHex: bindings.pathIdentityDigestHex,
        }, { workerFailureText, workerRootPhaseV2Text, workerCycleStepText }, substage);
        writeNewFile(join(attemptPath, 'worker-deposit-funding-substage.json'),
          Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
          'native two-cycle worker deposit funding substage companion');
      }
    } catch {
      // Optional substage detail cannot replace failure or older receipts.
    }
    try {
      const selectedDepositFunding = lastDepositFunding;
      if (workerFailureText !== undefined && workerRootPhaseV2Text !== undefined
          && workerCycleStepText !== undefined) {
        const companion = selectNativeDepositFundingWorkerStageV2(
          primaryFailure, stage, selectedDepositFunding, {
            configSha256Hex: bindings.configSha256Hex,
            expectedBridgeCommit: bindings.expectedBridgeCommit,
            pathIdentityDigestHex: bindings.pathIdentityDigestHex,
          }, { workerFailureText, workerRootPhaseV2Text, workerCycleStepText });
        if (companion !== null) {
          writeNewFile(join(attemptPath, 'worker-deposit-funding-stage-v2.json'),
            Buffer.from(`${canonicalJson(companion)}\n`, 'utf8'),
            'native two-cycle worker deposit funding stage V2 companion');
        }
      }
    } catch {
      // Optional observation cannot replace the original failure or V1 receipts.
    }
  }
  return Object.freeze({ workerFailureText, workerRootPhaseV2Text, workerCycleStepText });
}
