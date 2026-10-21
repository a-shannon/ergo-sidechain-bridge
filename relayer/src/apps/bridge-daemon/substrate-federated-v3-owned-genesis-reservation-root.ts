import { lstatSync, mkdtempSync, mkdirSync, opendirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { createFederatedGenesisOperatorV1, assertFederatedGenesisOperatorV1,
  disposeFederatedGenesisOperatorV1, type FederatedGenesisOperatorV1 }
  from '../../adapters/federated-genesis-operator-v1.js';
import { StateTracker } from '../../state-tracker.js';
import { buildSubstrateFederatedGenesisNodeV1, type BuildSubstrateFederatedGenesisNodeV1Input }
  from '../../substrate-federated-genesis-node-build-v1.js';
import { buildSubstrateFederatedIsolatedDevnetErgoNodeV3,
  type BuildSubstrateFederatedIsolatedDevnetErgoNodeV3Input }
  from '../../substrate-federated-isolated-devnet-ergo-node-build-v3.js';
import { createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2,
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  holdSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1,
  type SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2 }
  from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import { createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckSessionV2 }
  from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import { assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance }
  from '../../substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
import { revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1,
  type SubstrateFederatedIsolatedDevnetMiningCredentialV1 }
  from '../../substrate-federated-isolated-devnet-mining-credential-v1.js';
import { createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2,
  readSubstrateFederatedGenesisProfilesFromSessionV2,
  createSubstrateFederatedNativeGenesisSourceAttestationOperationV1,
  produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV3,
  type SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2,
  type SubstrateFederatedNativeGenesisSourceAttestationOperationV1 }
  from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import { discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1,
  createSubstrateFederatedDepositFundingRequirementsV1,
  discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1 }
  from '../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
import { collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2 }
  from '../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import { compileObservedSubstrateFederatedGenesisV3 }
  from '../../substrate-federated-observed-genesis-v3.js';
import { assertSubstrateFederatedNativeGenesisSetupExecutionBatchV3 }
  from '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile }
  from '../../substrate-federated-settlement-family-v1.js';
import { decodePegInSourceIntentV2Hex }
  from '../../peg-in-causal-admission-v2.js';
import { buildSubstrateFederatedNativeGenesisPegInPacketV3 }
  from '../../substrate-federated-isolated-devnet-peg-in-candidate-v3.js';
import { buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV3 }
  from '../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import { collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV3 }
  from '../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import { executeSubstrateFederatedNativeGenesisBatchV3,
  executeSubstrateFederatedNativeGenesisPegInSourceLockV3,
  executeSubstrateFederatedNativeGenesisPegInCommittedVaultV3 }
  from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import { assertSubstrateFederatedV3HeldIssuanceConfirmations }
  from './substrate-federated-v3-held-issuance-confirmation.js';
import { executeSubstrateFederatedV3FrontierReservationTarget }
  from './substrate-federated-v3-frontier-reservation-target-root.js';

export interface RunSubstrateFederatedV3OwnedGenesisReservationRootInput {
  readonly frontierBuild: Omit<BuildSubstrateFederatedGenesisNodeV1Input, 'sourceSession'>;
  readonly ergoBuild: BuildSubstrateFederatedIsolatedDevnetErgoNodeV3Input;
  readonly attemptDirectory: string;
  readonly sourceAmountNanoErg: string;
  readonly genesis: Readonly<{ evmChainId: string; bridgeAddressHex: string; tokenAddressHex: string }>;
  readonly sourceProofWindow: Readonly<{ issuedAtNativeHeight: string; expiresAtNativeHeight: string }>;
}

/** Owns one fresh V3 issuance, deposit and reservation lifetime. No mint or campaign is authorized. */
export async function runSubstrateFederatedV3OwnedGenesisReservationRoot(
  supplied: Readonly<RunSubstrateFederatedV3OwnedGenesisReservationRootInput>,
): Promise<Awaited<ReturnType<typeof executeSubstrateFederatedV3FrontierReservationTarget>>> {
  const input = exact(supplied, ['frontierBuild', 'ergoBuild', 'attemptDirectory',
    'sourceAmountNanoErg', 'genesis', 'sourceProofWindow']);
  const frontierInput = exact(input.frontierBuild, ['bridgeRoot', 'frontierSourcePath',
    'buildParentDirectory', 'cargoHomeDirectory', 'cargoExecutablePath', 'rustcExecutablePath',
    'gitExecutablePath', 'protocExecutablePath']);
  const ergoInput = exact(input.ergoBuild, ['worktreeRoot', 'bridgeRoot', 'ergoSourcePath',
    'gitExecutablePath', 'javaExecutablePath', 'sbtLauncherJarPath']);
  const genesis = exact(input.genesis, ['evmChainId', 'bridgeAddressHex', 'tokenAddressHex']);
  const window = exact(input.sourceProofWindow, ['issuedAtNativeHeight', 'expiresAtNativeHeight']);
  if (realpathSync(frontierInput.bridgeRoot) !== realpathSync(ergoInput.bridgeRoot)
    || !/^[1-9][0-9]*$/u.test(input.sourceAmountNanoErg)
    || !/^(0|[1-9][0-9]*)$/u.test(window.issuedAtNativeHeight)
    || !/^[1-9][0-9]*$/u.test(window.expiresAtNativeHeight)
    || BigInt(window.expiresAtNativeHeight) <= BigInt(window.issuedAtNativeHeight)) {
    throw new Error('FED V3 owned genesis reservation input differs');
  }
  const attemptDirectory = directDirectory(input.attemptDirectory);
  if (lstatSync(join(attemptDirectory, 'native-reservation-attempt.json'),
    { throwIfNoEntry: false }) !== undefined) {
    throw new Error('FED V3 reservation attempt already exists before owned setup');
  }
  for (const selected of [frontierInput.bridgeRoot, frontierInput.frontierSourcePath,
    frontierInput.buildParentDirectory, frontierInput.cargoHomeDirectory,
    ergoInput.worktreeRoot, ergoInput.ergoSourcePath, ergoInput.bridgeRoot]) {
    if (pathsOverlap(attemptDirectory, directDirectory(selected))) {
      throw new Error('FED V3 reservation attempt overlaps selected source or build custody');
    }
  }
  const entries = opendirSync(attemptDirectory);
  try {
    if (entries.readSync() !== null) {
      throw new Error('FED V3 reservation attempt directory must be empty');
    }
  } finally { entries.closeSync(); }

  let setup: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckSessionV2> | undefined;
  let source: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2> | undefined;
  let operation: Readonly<SubstrateFederatedNativeGenesisSourceAttestationOperationV1> | undefined;
  let operator: Readonly<FederatedGenesisOperatorV1> | undefined;
  let ergo: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2> | undefined;
  let state: StateTracker | undefined;
  let mining: Readonly<Record<'miningCredential' | 'checkpointMiningCredential'
    | 'trackerAdmissionMiningCredential' | 'trackerConfirmationMiningCredential',
    Readonly<SubstrateFederatedIsolatedDevnetMiningCredentialV1>>> | undefined;
  let failure: unknown;
  let failed = false;
  let value: Awaited<ReturnType<typeof executeSubstrateFederatedV3FrontierReservationTarget>> | undefined;

  try {
    setup = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    source = createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
      ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [setup.signer.publicKeyHex],
    });
    operator = createFederatedGenesisOperatorV1();
    const retainedSetup = setup;
    const retainedSource = source;
    const retainedOperator = operator;
    const assertCustody = () => {
      assertFederatedGenesisOperatorV1(retainedOperator);
      assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(retainedSetup.signer);
      readSubstrateFederatedGenesisProfilesFromSessionV2(retainedSource);
    };
    assertCustody();
    // The original builder result is retained for the later one-shot target claim.
    const frontier = await buildSubstrateFederatedGenesisNodeV1({ ...frontierInput,
      sourceSession: retainedSource });
    const buildDirectory = dirname(frontier.targetDirectory);
    if (basename(frontier.targetDirectory) !== 'target'
      || !/^bridge-fed-genesis-[A-Za-z0-9]{6}$/u.test(basename(buildDirectory))
      || realpathSync(dirname(buildDirectory)) !== realpathSync(frontierInput.buildParentDirectory)) {
      throw new Error('FED V3 Frontier builder target differs from its owned build parent');
    }
    assertCustody();
    const builtErgo = await buildSubstrateFederatedIsolatedDevnetErgoNodeV3(ergoInput);
    assertCustody();
    mining = claimSubstrateFederatedIsolatedDevnetMiningCredentialSequenceV2(retainedSetup);
    ergo = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2({
      javaExecutablePath: builtErgo.javaExecutablePath,
      expectedJavaExecutableSha256Hex: builtErgo.receipt.toolchain.javaExecutableSha256Hex,
      nodeAssemblyJarPath: builtErgo.nodeAssemblyJarPath,
      expectedNodeAssemblyJarSha256Hex: builtErgo.receipt.build.artifactSha256Hex,
      buildIdentityDigestHex: builtErgo.receipt.buildIdentityDigestHex,
    }, {
      miningTargetPublicKeyHex: retainedSetup.signer.publicKeyHex,
      p2pkErgoTreeHex: retainedSetup.signer.p2pkErgoTreeHex,
      rewardInputErgoTrees: retainedSetup.signer.rewardInputErgoTrees,
      networkPrefix: 16, primaryNodeOrigin: 'http://127.0.0.1:9051',
      witnessNodeOrigin: 'http://127.0.0.1:9052',
    }, mining.miningCredential, mining.checkpointMiningCredential,
    mining.trackerAdmissionMiningCredential, mining.trackerConfirmationMiningCredential);
    await ergo.startMining();
    const execution = await ergo.withMiningActiveExecutionTarget(async target => {
      const assertActive = () => {
        assertCustody();
        assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
      };
      assertActive();
      const ownedDiscovery = await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(
        retainedSetup.signer, target);
      const history = await collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2(
        ownedDiscovery.observation);
      assertActive();
      const compiled = await compileObservedSubstrateFederatedGenesisV3({
        setupSigner: retainedSetup.signer, sourceSession: retainedSource, target,
        ownedDiscovery, history,
        genesis: {
          bridgeRoot: frontierInput.bridgeRoot, launchDomainHex: retainedOperator.launchDomainHex,
          evmChainId: genesis.evmChainId, operatorAddressHex: retainedOperator.addressHex,
          bridgeAddressHex: genesis.bridgeAddressHex, tokenAddressHex: genesis.tokenAddressHex,
          runtimeWasm: readFileSync(frontier.wasm.path),
          expectedRuntimeWasmSha256Hex: frontier.wasm.sha256Hex,
          endowments: [{ addressHex: retainedOperator.addressHex,
            balance: retainedOperator.nativeFunding.amountUnits }],
        },
      });
      if (compiled.preparation.mintProofProfileScaleHex !== frontier.sourceProofProfileScaleHex
        || compiled.preparation.mintProofProfile.proofProfileIdHex !== frontier.sourceProofProfileIdHex) {
        throw new Error('FED V3 compiled proof profile differs from the retained builder');
      }
      assertActive();
      const batch = await retainedSetup.runNativeGenesisRetainingSignerV3(compiled, target);
      const assertBatchActive = () => {
        assertActive();
        assertSubstrateFederatedNativeGenesisSetupExecutionBatchV3(batch, target);
      };
      assertBatchActive();
      const journalDirectory = mkdtempSync(join(frontier.targetDirectory, 'issuance-journal-'));
      const markerDirectory = join(journalDirectory, 'attempt-markers');
      mkdirSync(markerDirectory);
      state = new StateTracker(join(journalDirectory, 'state-store'));
      const retainedState = state;
      const transactions = await executeSubstrateFederatedNativeGenesisBatchV3({
        target, batch, state: retainedState, markerDirectory,
      });
      assertBatchActive();
      if (transactions.length !== 3 || batch.orderedTransactions.length !== 3
        || compiled.issuance.orderedTransactions.length !== 3
        || transactions.some((receipt, index) => receipt.role !== compiled.issuance.orderedTransactions[index]!.role
          || receipt.ordinal !== index
          || receipt.expectedTxId !== compiled.issuance.orderedTransactions[index]!.transaction.txId)) {
        throw new Error('FED V3 issuance receipts differ from the compiled ordered transactions');
      }
      const issuanceBoxes = compiled.issuance.orderedTransactions.map((ordered, index) => {
        const sourceBoxIdHex = batch.orderedTransactions[index]?.issuance.genesisInputBoxIdHex;
        const singletonOutput = ordered.transaction.outputs[0];
        if (sourceBoxIdHex === undefined || singletonOutput === undefined) {
          throw new Error('FED V3 issuance source or singleton output is absent');
        }
        return Object.freeze({ sourceBoxIdHex, singletonOutput });
      });
      const held = await holdSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1(target);
      assertBatchActive();
      await assertSubstrateFederatedV3HeldIssuanceConfirmations(target, held, transactions, issuanceBoxes,
        assertBatchActive);
      assertBatchActive();
      const requirements = createSubstrateFederatedDepositFundingRequirementsV1(
        input.sourceAmountNanoErg);
      const ownedFunding = await discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1(
        retainedSetup.signer, target, requirements);
      const funding = assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1(
        ownedFunding, target, requirements);
      if (funding.target.genesisHeaderIdHex !== batch.request.target.genesisHeaderIdHex
        || funding.target.tipHeight !== held.fullHeight
        || funding.target.tipHeaderIdHex !== held.headerIdHex
        || funding.target.tipHeight < Math.max(...transactions.map(receipt => receipt.confirmationHeight))) {
        throw new Error('FED V3 deposit funding differs from the held issuance and owned genesis');
      }
      assertBatchActive();
      const family = decodeSubstrateFederatedSettlementFamilyV1Profile(compiled.familyReceipt.profile);
      const packet = await buildSubstrateFederatedNativeGenesisPegInPacketV3({
        batch, target, sourceFundingInput: funding.fundingInput,
        sourceIntent: {
          formatVersion: 2, sourceNetworkIdHex: family.sourceNetworkIdHex,
          sidechainIdHex: family.sidechainIdHex, bridgeAddressHex: family.bridgeAddressHex,
          tokenAddressHex: family.tokenAddressHex,
          settlementProfileIdHex: family.settlementProfileIdHex,
          admissionProfileIdHex: compiled.familyReceipt.profile.familyIdHex,
          sourceAssetIdHex: family.settlementAssetIdHex,
          amountNanoErg: requirements.sourceAmountNanoErg,
          recipientAddressHex: retainedOperator.addressHex,
        },
        depositorErgoTreeHex: retainedSetup.signer.p2pkErgoTreeHex,
        creationHeights: { currentErgoHeight: funding.target.tipHeight,
          sourceLockCreation: funding.target.tipHeight,
          reserveTransition: funding.target.tipHeight },
        fees: { sourceLockCreationNanoErg: requirements.sourceLockCreationFeeNanoErg,
          reserveTransitionNanoErg: requirements.reserveTransitionFeeNanoErg },
      });
      if (decodePegInSourceIntentV2Hex(packet.sourceIntentHex).amountNanoErg
        !== requirements.sourceAmountNanoErg) {
        throw new Error('FED V3 packet amount differs from the owned funding request');
      }
      assertBatchActive();
      const executionInput = { target, batch, packet, setupSession: retainedSetup, state: retainedState };
      const sourceLock = await executeSubstrateFederatedNativeGenesisPegInSourceLockV3(executionInput);
      assertBatchActive();
      const vault = await executeSubstrateFederatedNativeGenesisPegInCommittedVaultV3({
        ...executionInput, sourceLockObservation: sourceLock.outputObservation,
      });
      assertBatchActive();
      const draftInputs = Object.freeze({ target, batch, packet,
        committedVaultObservation: vault.outputObservation });
      operation = createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(retainedSource);
      const retainedOperation = operation;
      const draft = buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV3(draftInputs);
      const evidenceReceipt = collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV3({
        ...draftInputs, draft,
      });
      const proof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV3(
        retainedOperation, { draftInputs, draft, evidenceReceipt,
          issuedAtNativeHeight: window.issuedAtNativeHeight,
          expiresAtNativeHeight: window.expiresAtNativeHeight });
      assertBatchActive();
      return executeSubstrateFederatedV3FrontierReservationTarget({
        built: frontier, buildParentDirectory: frontierInput.buildParentDirectory,
        signing: { operator: retainedOperator, sourceOperation: retainedOperation,
          draftInputs, draft, proof, compiled, target },
        attemptDirectory,
        broadcastScope: 'fed-native-local-synthetic-v3-reservation-only',
      });
    });
    value = execution.value;
  } catch (cause) {
    failed = true;
    failure = cause;
  }

  const cleanupFailures: unknown[] = [];
  for (const close of [
    async () => { await ergo?.stop(); },
    ...Object.values(mining ?? {}).map(credential => async () => {
      revokeSubstrateFederatedIsolatedDevnetMiningCredentialV1(credential);
    }),
    async () => { operation?.dispose(); },
    async () => { source?.dispose(); },
    async () => { if (operator) disposeFederatedGenesisOperatorV1(operator); },
    async () => { setup?.dispose(); },
    async () => { state?.close(); },
  ]) {
    try { await close(); } catch (cause) { cleanupFailures.push(cause); }
  }
  if (cleanupFailures.length !== 0) {
    throw new AggregateError(failed ? [failure, ...cleanupFailures] : cleanupFailures,
      'FED V3 owned reservation execution and cleanup failed');
  }
  if (failed) throw failure;
  return value!;
}

function exact<T extends object>(value: T, keys: readonly string[]): T {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('FED V3 owned reservation input fields differ');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertyNames(descriptors).length
      + Object.getOwnPropertySymbols(descriptors).length !== keys.length
    || keys.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) {
    throw new Error('FED V3 owned reservation input fields differ');
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]))) as T;
}

function directDirectory(path: string): string {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    throw new Error('FED V3 direct attempt directory required');
  }
  const stat = lstatSync(path);
  const canonical = resolve(realpathSync(path));
  if (!stat.isDirectory() || stat.isSymbolicLink() || canonical !== resolve(path)) {
    throw new Error('FED V3 indirect attempt directory is forbidden');
  }
  return canonical;
}

function pathsOverlap(left: string, right: string): boolean {
  const fromLeft = relative(left, right);
  const fromRight = relative(right, left);
  if (isAbsolute(fromLeft) || isAbsolute(fromRight)) {
    if (isAbsolute(fromLeft) && isAbsolute(fromRight)) return false;
    throw new Error('FED V3 ambiguous selected root relationship');
  }
  const inside = (part: string) => part === ''
    || (part !== '..' && !part.startsWith(`..${sep}`));
  return inside(fromLeft) || inside(fromRight);
}
