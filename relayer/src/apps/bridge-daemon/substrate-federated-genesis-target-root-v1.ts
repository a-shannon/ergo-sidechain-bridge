import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createFederatedGenesisOperatorV1, assertFederatedGenesisOperatorV1, disposeFederatedGenesisOperatorV1,
  type FederatedGenesisOperatorV1,
} from '../../adapters/federated-genesis-operator-v1.js';
import { observeFederatedGenesisTargetsV1 } from '../../adapters/federated-genesis-target-observation-v1.js';
import { assertNoDuplicateJsonKeys, canonicalJson } from '../../ergo-settlement-core/strict-json.js';
import { createBoundedAuthenticatedSpvTrackerReadOnlySource } from '../../authenticated-spv-tracker-read-only-node-client.js';
import { StateTracker } from '../../state-tracker.js';
import { verifyExecutableSha256 } from '../../native-executable-pin.js';
import { runBoundedProcess } from '../../pinned-local-native-verifier-build.js';
import { buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1 } from '../../substrate-federated-authority-safe-devnet-build-environment-v1.js';
import { withOwnedFederatedGenesisDevnetProcessesV1, assertOwnedFederatedGenesisDevnetTargetV1 } from '../../substrate-federated-authority-safe-devnet-process-v1.js';
import { buildSubstrateFederatedGenesisNodeV1, type BuildSubstrateFederatedGenesisNodeV1Input } from '../../substrate-federated-genesis-node-build-v1.js';
import { collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2 } from '../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import { buildSubstrateFederatedIsolatedDevnetErgoNodeV1, type BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input } from '../../substrate-federated-isolated-devnet-ergo-node-build-v1.js';
import { createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2, assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1, type SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2 } from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import { discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1, assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1 } from '../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
  claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2,
} from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import { assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance } from '../../substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
import { createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2, readSubstrateFederatedGenesisProfilesFromSessionV2, produceSubstrateFederatedNativeGenesisMintSourceProofV1, type SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2 } from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import { compileObservedSubstrateFederatedGenesisV1 } from '../../substrate-federated-observed-genesis-v1.js';
import { assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1 } from '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import { createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1 } from '../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import { SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS } from '../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import { normalizeEip12Box } from '../../unsigned-ergo-transaction.js';
import { buildSubstrateFederatedNativeGenesisPegInPacketV1 } from '../../substrate-federated-isolated-devnet-peg-in-candidate-v2.js';
import { buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV1 } from '../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import { collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV1 } from '../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import {
  executeSubstrateFederatedNativeGenesisBatchV1,
  executeSubstrateFederatedNativeGenesisPegInSourceLockV1,
  executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1,
} from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import { executeFrontierNativeProofBoundReservationAndMintV1 } from './frontier-native-proof-bound-reservation-signing-v1.js';

const PRIMARY = 'http://127.0.0.1:19955';
const WITNESS = 'http://127.0.0.1:19956';
const MAX_RESPONSE_BYTES = 34 * 1024 * 1024;
const KEYS = {
  code: '0x3a636f6465',
  profile: '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde',
  enforced: '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1',
  bridge: '0xaf86fef4216ac2bcd1c592b204011ad0c1586bde54b249fb7f521faf831ade45',
  sudo: '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b',
} as const;

export interface RunSubstrateFederatedGenesisTargetRootV1Input {
  readonly frontierBuild: Omit<BuildSubstrateFederatedGenesisNodeV1Input, 'sourceSession'>;
  readonly ergoBuild: BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input;
}

/** Static local target composition. No caller callback, signer or transport escapes. */
export async function runSubstrateFederatedGenesisTargetRootV1(input: RunSubstrateFederatedGenesisTargetRootV1Input) {
  const captured = exact(input, ['frontierBuild', 'ergoBuild']);
  const frontierInput = exact(captured.frontierBuild, ['bridgeRoot', 'frontierSourcePath',
    'buildParentDirectory', 'cargoHomeDirectory', 'cargoExecutablePath', 'rustcExecutablePath',
    'gitExecutablePath', 'protocExecutablePath']);
  const ergoInput = exact(captured.ergoBuild, ['worktreeRoot', 'bridgeRoot', 'ergoSourcePath',
    'gitExecutablePath', 'javaExecutablePath', 'sbtLauncherJarPath']);
  if (realpathSync(frontierInput.bridgeRoot) !== realpathSync(ergoInput.bridgeRoot)) {
    throw new Error('FED target builders must use the same bridge repository');
  }
  const setup = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
  let source: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2> | undefined;
  let operator: Readonly<FederatedGenesisOperatorV1> | undefined;
  let ergo: Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessSessionV2> | undefined;
  try {
    source = createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
      ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [setup.signer.publicKeyHex],
    });
    operator = createFederatedGenesisOperatorV1();
    const retainedSource = source;
    const retainedOperator = operator;
    const assertCustody = () => {
      assertFederatedGenesisOperatorV1(retainedOperator);
      assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup.signer);
      readSubstrateFederatedGenesisProfilesFromSessionV2(retainedSource);
    };
    // Compile before starting the bounded Ergo mining lifetime.
    const frontier = await buildSubstrateFederatedGenesisNodeV1({ ...frontierInput, sourceSession: retainedSource });
    assertCustody();
    const builtErgo = await buildSubstrateFederatedIsolatedDevnetErgoNodeV1(ergoInput);
    assertCustody();
    ergo = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2({
      javaExecutablePath: builtErgo.javaExecutablePath,
      expectedJavaExecutableSha256Hex: builtErgo.receipt.toolchain.javaExecutableSha256Hex,
      nodeAssemblyJarPath: builtErgo.nodeAssemblyJarPath,
      expectedNodeAssemblyJarSha256Hex: builtErgo.receipt.build.artifactSha256Hex,
      buildIdentityDigestHex: builtErgo.receipt.buildIdentityDigestHex,
    }, {
      miningTargetPublicKeyHex: setup.signer.publicKeyHex,
      p2pkErgoTreeHex: setup.signer.p2pkErgoTreeHex,
      rewardInputErgoTrees: setup.signer.rewardInputErgoTrees,
      networkPrefix: 16, primaryNodeOrigin: 'http://127.0.0.1:9051', witnessNodeOrigin: 'http://127.0.0.1:9052',
    }, claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2(setup));
    await ergo.startMining();
    const executed = await ergo.withMiningActiveExecutionTarget(async target => {
      const ownedDiscovery = await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(setup.signer, target);
      const history = await collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2(ownedDiscovery.observation);
      assertCustody();
      const compiled = await compileObservedSubstrateFederatedGenesisV1({
        setupSigner: setup.signer, sourceSession: retainedSource, target, ownedDiscovery, history,
        genesis: {
          bridgeRoot: frontierInput.bridgeRoot, launchDomainHex: retainedOperator.launchDomainHex,
          evmChainId: '4242', operatorAddressHex: retainedOperator.addressHex,
          bridgeAddressHex: '33'.repeat(20), tokenAddressHex: '44'.repeat(20),
          runtimeWasm: readFileSync(frontier.wasm.path), expectedRuntimeWasmSha256Hex: frontier.wasm.sha256Hex,
          endowments: [{ addressHex: retainedOperator.addressHex, balance: retainedOperator.nativeFunding.amountUnits }],
        },
      });
      const candidate = compiled.candidate;
      if (compiled.preparation.mintProofProfileScaleHex !== frontier.sourceProofProfileScaleHex
        || compiled.preparation.mintProofProfile.proofProfileIdHex !== frontier.sourceProofProfileIdHex) {
        throw new Error('FED compiled target federation differs from retained build custody');
      }
      const candidateBytes = Buffer.from(candidate.genesisJson);
      const candidatePath = join(frontier.targetDirectory, 'fed-genesis.json');
      writeFileSync(candidatePath, candidateBytes, { flag: 'wx' });
      await verifyExecutableSha256(frontier.node.path, `0x${frontier.node.sha256Hex}`, 'FED node');
      const raw = await runBoundedProcess({ executablePath: frontier.node.path,
        args: ['build-spec', '--chain', `fed-genesis:${candidatePath}`, '--disable-default-bootnode', '--raw'],
        cwd: frontier.sourceDirectory, env: buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1(),
        timeoutMs: 120_000, maxOutputBytes: MAX_RESPONSE_BYTES, label: 'FED typed genesis materialization' });
      await verifyExecutableSha256(frontier.node.path, `0x${frontier.node.sha256Hex}`, 'FED node');
      if (!readFileSync(candidatePath).equals(candidateBytes)) throw new Error('FED typed genesis bytes changed');
      const expected = materializedStorage(raw.stdout, candidate.runtimeProfileScaleHex,
        compiled.preparation.application.bridgeAddressHex, frontier.wasm.sha256Hex);
      if (expected[retainedOperator.nativeFunding.storageKeyHex] !== retainedOperator.nativeFunding.accountInfoScaleHex) {
        throw new Error('FED materialized operator funding differs from retained custody');
      }
      assertCustody();
      assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
      const running = await withOwnedFederatedGenesisDevnetProcessesV1({
        nodeBinaryPath: frontier.node.path, expectedNodeBinarySha256Hex: frontier.node.sha256Hex,
        genesisJsonBytes: candidateBytes, expectedGenesisJsonSha256Hex: candidate.genesisJsonSha256Hex,
        primaryRpcUrl: PRIMARY, witnessRpcUrl: WITNESS,
        primaryP2pPort: 30355, witnessP2pPort: 30356, primaryPrometheusPort: 19615, witnessPrometheusPort: 19616,
      }, async endpoints => {
        assertOwnedFederatedGenesisDevnetTargetV1(endpoints);
        if (endpoints.primaryRpcUrl !== PRIMARY || endpoints.witnessRpcUrl !== WITNESS) {
          throw new Error('FED owned node endpoints changed');
        }
        const genesis = await observeFederatedGenesisTargetsV1(expected);
        assertCustody();
        assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
        const batch = await setup.runNativeGenesisRetainingSigner(compiled, target);
        const assertActive = () => {
          assertCustody();
          assertOwnedFederatedGenesisDevnetTargetV1(endpoints);
          assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target);
        };
        assertActive();
        // This fresh journal stays with the build artifacts, including unresolved attempts.
        const journalDirectory = mkdtempSync(join(frontier.targetDirectory, 'issuance-journal-'));
        const markerDirectory = join(journalDirectory, 'attempt-markers');
        mkdirSync(markerDirectory);
        const state = new StateTracker(join(journalDirectory, 'state-store'));
        try {
          const transactions = await executeSubstrateFederatedNativeGenesisBatchV1({
            target, batch, state, markerDirectory,
          });
          assertActive();
          const observer = createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
            target, batch.request.target.genesisHeaderIdHex,
          );
          const primary = createBoundedAuthenticatedSpvTrackerReadOnlySource(target.primaryNodeOrigin);
          const witness = createBoundedAuthenticatedSpvTrackerReadOnlySource(target.witnessNodeOrigin);
          if (transactions.length !== compiled.issuance.orderedTransactions.length) {
            throw new Error('FED native issuance receipt count differs');
          }
          const confirm = async () => {
            for (const [index, expectedTransaction] of compiled.issuance.orderedTransactions.entries()) {
              assertActive();
              const receipt = transactions[index]!;
              if (receipt.role !== expectedTransaction.role || receipt.ordinal !== index
                || receipt.expectedTxId !== expectedTransaction.transaction.txId) {
                throw new Error('FED native issuance receipt identity differs');
              }
              const current = await observer.observe(expectedTransaction.transaction.txId, target.primaryNodeOrigin);
              assertActive();
              if (current === null || current.status !== 'confirmed'
                || current.confirmationHeight !== receipt.confirmationHeight
                || current.confirmationHeaderIdHex !== receipt.confirmationHeaderIdHex) {
                throw new Error('FED native issuance canonical inclusion changed');
              }
            }
          };
          const previousTips = new Map<typeof primary, { height: number; id: string }>();
          const readTip = async (client: typeof primary) => {
            assertCustody();
            const tip = record(await client.getBestHeader());
            assertCustody();
            if (!Number.isSafeInteger(tip.height) || Number(tip.height) <= 0
              || typeof tip.id !== 'string' || !/^[0-9a-f]{64}$/.test(tip.id)) {
              throw new Error('FED native issuance requires a canonical output-observation tip');
            }
            const current = { height: Number(tip.height), id: tip.id };
            const previous = previousTips.get(client);
            if (previous && (current.height < previous.height
              || (current.height === previous.height && current.id !== previous.id))) {
              throw new Error('FED native issuance output-observation tip changed');
            }
            previousTips.set(client, current);
            return current;
          };
          const sameTip = (first: { height: number; id: string }, second: { height: number; id: string }) => {
            if (first.height !== second.height) return false;
            if (first.id !== second.id) throw new Error('FED native issuance output-observation tips disagree');
            return true;
          };
          let stableOutputs = false;
          // Only observations retry. The three issued transactions remain one-shot.
          for (let attempt = 0; attempt < 3; attempt++) {
            await confirm();
            assertActive();
            // Stable visible tips bound these reads, not an atomic header/UTXO state.
            const before = await settleReads([readTip(primary), readTip(witness)]);
            const tip = before[0]!;
            if (!sameTip(tip, before[1]!)) { assertActive(); continue; }
            await settleReads(compiled.issuance.orderedTransactions.flatMap(({ transaction }, index) => {
              const expectedOutput = transaction.outputs[0]!;
              const receipt = transactions[index]!;
              return [primary, witness].map(async client => {
                assertCustody();
                if (!Number.isSafeInteger(receipt.confirmationHeight) || receipt.confirmationHeight <= 0
                  || tip.height - receipt.confirmationHeight < SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS) {
                  throw new Error('FED native issuance snapshot confirmation depth is insufficient');
                }
                const source = await client.getBoxByIdOrNull(batch.orderedTransactions[index]!.issuance.genesisInputBoxIdHex);
                assertCustody();
                if (source !== null) throw new Error('FED native issuance funding source remains unspent');
                const rawOutput = await client.getBoxByIdOrNull(expectedOutput.boxId);
                assertCustody();
                if (rawOutput === null) throw new Error('FED native singleton output is unavailable');
                const output = await normalizeEip12Box(rawOutput, 'FED native singleton output');
                assertCustody();
                if (canonicalJson(output) !== canonicalJson(expectedOutput) || output.creationHeight > tip.height) {
                  throw new Error('FED native singleton output differs from the compiled issuance');
                }
                const headers = await client.getBlockHeaderIdsAtHeight(receipt.confirmationHeight);
                assertCustody();
                if (headers.length !== 1 || headers[0] !== receipt.confirmationHeaderIdHex) {
                  throw new Error('FED native issuance snapshot inclusion differs from its confirmed receipt');
                }
              });
            }));
            const [primaryAfter, witnessAfter] = await settleReads([readTip(primary), readTip(witness)]);
            assertActive();
            const primaryStable = sameTip(tip, primaryAfter!);
            const witnessStable = sameTip(tip, witnessAfter!);
            // Full confirmation brackets the window; inclusion is also checked
            // inside it. Preserve its captured anchor across the closing check.
            await confirm();
            if (!primaryStable || !witnessStable) continue;
            const closingBefore = await settleReads([readTip(primary), readTip(witness)]);
            if (!sameTip(closingBefore[0]!, closingBefore[1]!)) { assertActive(); continue; }
            await settleReads([primary, witness].map(async client => {
              assertCustody();
              const headers = await client.getBlockHeaderIdsAtHeight(tip.height);
              assertCustody();
              if (headers.length !== 1 || headers[0] !== tip.id) {
                throw new Error('FED native issuance captured output anchor changed after confirmation');
              }
            }));
            const closingAfter = await settleReads([readTip(primary), readTip(witness)]);
            assertActive();
            if (sameTip(closingBefore[0]!, closingAfter[0]!)
              && sameTip(closingBefore[0]!, closingAfter[1]!)) {
              stableOutputs = true; break;
            }
          }
          if (!stableOutputs) throw new Error('FED native issuance output-observation did not stabilize');
          if (await observeFederatedGenesisTargetsV1(expected) !== genesis) {
            throw new Error('FED source genesis changed during Ergo issuance');
          }
          assertActive();
          // Issuance funding is spent. Discover a new owned input for this deposit.
          const ownedFunding = await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(setup.signer, target);
          assertActive();
          const funding = assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(ownedFunding, target);
          if (funding.target.genesisHeaderIdHex !== batch.request.target.genesisHeaderIdHex
            || funding.target.tipHeight < Math.max(...transactions.map(receipt => receipt.confirmationHeight))) {
            throw new Error('FED deposit funding does not follow the confirmed genesis issuance');
          }
          const profile = candidate.runtimeProfile;
          const packet = await buildSubstrateFederatedNativeGenesisPegInPacketV1({
            batch, target, sourceFundingInput: funding.genesisInputs.tracker,
            sourceIntent: {
              formatVersion: 2, sourceNetworkIdHex: profile.sourceNetworkIdHex,
              sidechainIdHex: profile.sidechainIdHex, bridgeAddressHex: profile.bridgeAddressHex,
              tokenAddressHex: profile.tokenAddressHex, settlementProfileIdHex: profile.settlementProfileIdHex,
              admissionProfileIdHex: profile.lineageProfileIdHex, sourceAssetIdHex: '00'.repeat(32),
              amountNanoErg: '20000000', recipientAddressHex: retainedOperator.addressHex,
            },
            depositorErgoTreeHex: setup.signer.p2pkErgoTreeHex,
            creationHeights: { currentErgoHeight: funding.target.tipHeight,
              sourceLockCreation: funding.target.tipHeight, reserveTransition: funding.target.tipHeight },
          });
          assertActive();
          const sourceLock = await executeSubstrateFederatedNativeGenesisPegInSourceLockV1({
            target, batch, packet, setupSession: setup, state,
          });
          assertActive();
          const reserve = await executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1({
            target, batch, packet, sourceLockObservation: sourceLock.outputObservation,
            setupSession: setup, state,
          });
          assertActive();
          const draftInputs = Object.freeze({ target, batch, packet, committedVaultObservation: reserve.outputObservation });
          const draft = buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV1(draftInputs);
          const evidenceReceipt = collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV1({ ...draftInputs, draft });
          const proof = produceSubstrateFederatedNativeGenesisMintSourceProofV1(retainedSource, {
            draftInputs, draft, evidenceReceipt, issuedAtNativeHeight: '0', expiresAtNativeHeight: '32',
          });
          assertActive();
          const mint = await executeFrontierNativeProofBoundReservationAndMintV1({
            signing: { operator: retainedOperator, sourceSession: retainedSource, draft, proof, compiled, target,
              frontierTarget: endpoints, expectedStorage: expected, expectedGenesisHashHex: genesis },
            attemptDirectory: mkdtempSync(join(journalDirectory, 'native-mint-')),
            broadcastScope: 'fed-native-local-synthetic-reservation-and-mint-only',
          });
          assertActive();
          return Object.freeze({ genesis, transactions, mint,
            pegIn: Object.freeze({ sourceLockTransactionIdHex: sourceLock.expectedTxId,
              reserveTransitionTransactionIdHex: reserve.expectedTxId, sourceLockBoxIdHex: packet.boxes.sourceLock.boxId,
              reserveSuccessorBoxIdHex: packet.boxes.reserveSuccessor.boxId,
              mintIdentityHex: mint.mintIdentityHex, sourceProofReceiptDigestHex: proof.receiptDigestHex }) });
        } finally {
          state.close();
        }
      });
      return Object.freeze({ nativeGenesisHashHex: running.value.genesis, frontierProcess: running.receipt,
        typedGenesisSha256Hex: candidate.genesisJsonSha256Hex, rawSpecSha256Hex: sha256(Buffer.from(raw.stdout)),
        runtimeProfileIdHex: candidate.runtimeProfileIdHex, familyIdHex: candidate.familyIdHex,
        sourceProofProfileIdHex: frontier.sourceProofProfileIdHex,
        nodeSha256Hex: frontier.node.sha256Hex, wasmSha256Hex: frontier.wasm.sha256Hex,
        operatorAddressHex: retainedOperator.addressHex, storageKeysChecked: Object.keys(expected).length,
        issuanceInputBoxIds: compiled.discovery.genesisBoxIds,
        issuedTransactions: running.value.transactions,
        pegIn: running.value.pegIn, mint: running.value.mint,
        unsignedIssuance: Object.freeze(compiled.issuance.orderedTransactions.map(({ role, transaction }) =>
          Object.freeze({ role, transactionIdHex: transaction.txId, predictedSingletonBoxIdHex: transaction.outputs[0]!.boxId }))) });
    });
    assertCustody();
    return Object.freeze({ status: 'fresh-federated-peg-in-minted' as const,
      ...executed.value, ergoExecution: executed.receipt,
      singletonIssuanceEstablished: true as const, operationalMintEstablished: true as const,
      sourceFinalityEstablished: false as const, trustless: false as const });
  } finally {
    try { if (ergo) await ergo.stop(); }
    finally {
      try { if (operator) disposeFederatedGenesisOperatorV1(operator); }
      finally { try { source?.dispose(); } finally { setup.dispose(); } }
    }
  }
}

async function settleReads<T>(reads: readonly Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(reads);
  const values: T[] = [];
  for (const result of settled) {
    if (result.status === 'rejected') throw result.reason;
    values.push(result.value);
  }
  return values;
}

function materializedStorage(text: string, profile: string, bridge: string, wasmHash: string): Readonly<Record<string, string>> {
  const spec = record(parseJson(text));
  if (spec.id !== 'bridge_federated_v4_genesis' || !Array.isArray(spec.bootNodes) || spec.bootNodes.length !== 0) {
    throw new Error('FED raw spec target or peers differ');
  }
  const raw = record(record(spec.genesis).raw);
  if (Object.keys(record(raw.childrenDefault)).length !== 0) throw new Error('FED unexpected child storage');
  const top = record(raw.top);
  if (Object.keys(top).length < 4 || Object.keys(top).length > 256
    || Object.entries(top).some(([key, value]) => !/^0x(?:[0-9a-f]{2})+$/.test(key)
      || typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(value))) {
    throw new Error('FED malformed raw storage');
  }
  const result = top as Record<string, string>;
  if (!result[KEYS.code] || sha256(Buffer.from(result[KEYS.code].slice(2), 'hex')) !== wasmHash
    || result[KEYS.profile] !== profile || result[KEYS.enforced] !== '0x01'
    || result[KEYS.bridge] !== `0x${bridge}` || result[KEYS.sudo] !== undefined) {
    throw new Error('FED raw storage differs from the compiled runtime/profile or authority');
  }
  return Object.freeze(result);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('FED object required');
  return value as Record<string, unknown>;
}
function parseJson(text: string): unknown {
  assertNoDuplicateJsonKeys(text);
  return JSON.parse(text) as unknown;
}
function exact<T>(value: T, keys: string[]): Readonly<T> {
  record(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertyNames(descriptors).length !== keys.length
    || Object.getOwnPropertySymbols(descriptors).length !== 0
    || keys.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) {
    throw new Error('FED target requires exact data fields');
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]))) as Readonly<T>;
}
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
