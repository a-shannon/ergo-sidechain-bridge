import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import axios from 'axios';
import { SigningKey } from 'ethers';
import { describe, expect, it, vi } from 'vitest';

const nodeDouble = vi.hoisted(() => ({
  funding: undefined as unknown,
  provedFunding: new WeakSet<object>(),
  provedHistory: new WeakSet<object>(),
  genesisBoxes: new Map<string, unknown>(),
  genesisBinary: new Map<string, string>(),
  tipHeaderIdHex: undefined as string | undefined,
  tipHeight: undefined as number | undefined,
  frontierTargetCustody: new WeakMap<object, () => void>(),
  observeReservationTarget: vi.fn(),
  reserveReservationAttempt: vi.fn(),
  submitReservation: vi.fn(),
  sealReservation: vi.fn(),
  observeReservationInclusion: vi.fn(),
}));

// Upstream Ergo reads and downstream Frontier custody/observation are doubled.
// The V3 packet, source-lock journal and output-observation provenance are real.
vi.mock('../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js',
  async importOriginal => ({
    ...await importOriginal<typeof import('../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js')>(),
    discoverSubstrateFederatedRewardInputsV2: async () => nodeDouble.funding,
    assertSubstrateFederatedRewardInputDiscoveryV2Provenance: (value: object) => {
      if (!nodeDouble.provedFunding.has(value)) throw new Error('unproved funding observation');
    },
  }));
vi.mock('../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js',
  async importOriginal => ({
    ...await importOriginal<typeof import('../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js')>(),
    assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance: (value: object) => {
      if (!nodeDouble.provedHistory.has(value)) throw new Error('unproved history observation');
    },
  }));
vi.mock('../../authenticated-spv-tracker-read-only-node-client.js',
  async importOriginal => ({
    ...await importOriginal<typeof import('../../authenticated-spv-tracker-read-only-node-client.js')>(),
    createBoundedAuthenticatedSpvTrackerReadOnlySource: (origin: string) => {
      if (origin !== 'http://127.0.0.1:9051' && origin !== 'http://127.0.0.1:9052') {
        throw new Error('unexpected fixture node origin');
      }
      return {
        async getInfo() {
          if (nodeDouble.tipHeight === undefined) throw new Error('fixture tip is unset');
          return { network: 'devnet', fullHeight: nodeDouble.tipHeight };
        },
        async getBestHeader() {
          if (nodeDouble.tipHeaderIdHex === undefined || nodeDouble.tipHeight === undefined) {
            throw new Error('fixture tip is unset');
          }
          return { id: nodeDouble.tipHeaderIdHex, height: nodeDouble.tipHeight };
        },
        async getBlockHeaderIdsAtHeight(height: number) {
          if (height === 1) return ['72'.repeat(32)];
          if (nodeDouble.tipHeight !== undefined && height === nodeDouble.tipHeight) {
            if (nodeDouble.tipHeaderIdHex === undefined) throw new Error('fixture tip is unset');
            return [nodeDouble.tipHeaderIdHex];
          }
          throw new Error('unexpected genesis header height');
        },
        async getBoxByIdOrNull(id: string) { return nodeDouble.genesisBoxes.get(id) ?? null; },
        async getBoxBinaryByIdOrNull(id: string) {
          const bytes = nodeDouble.genesisBinary.get(id);
          if (bytes === undefined) throw new Error('unexpected genesis binary request');
          return { bytes };
        },
      };
    },
  }));
vi.mock('../../adapters/federated-genesis-target-observation-v1.js', () => ({
  observeFederatedGenesisReservationTargetV1: nodeDouble.observeReservationTarget,
}));
vi.mock('../../adapters/federated-native-reservation-execution-v1.js',
  async importOriginal => ({
    ...await importOriginal<typeof import('../../adapters/federated-native-reservation-execution-v1.js')>(),
    reserveFederatedNativeReservationAttemptV1: nodeDouble.reserveReservationAttempt,
    submitFederatedNativeReservationV1: nodeDouble.submitReservation,
    sealFederatedNativeReservationV1: nodeDouble.sealReservation,
    observeFederatedNativeReservationInclusionV1: nodeDouble.observeReservationInclusion,
  }));
vi.mock('../../substrate-federated-authority-safe-devnet-process-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('../../substrate-federated-authority-safe-devnet-process-v1.js')>();
    return { ...actual,
      assertOwnedFederatedGenesisDevnetTargetV1:
        (value: Parameters<typeof actual.assertOwnedFederatedGenesisDevnetTargetV1>[0]) => {
          const guard = nodeDouble.frontierTargetCustody.get(value);
          if (guard) guard();
          else actual.assertOwnedFederatedGenesisDevnetTargetV1(value);
        },
    };
  });

import {
  createFederatedGenesisOperatorV1,
  disposeFederatedGenesisOperatorV1,
} from '../../adapters/federated-genesis-operator-v1.js';
import { createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2 }
  from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import {
  assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV3,
  createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2,
  createSubstrateFederatedNativeGenesisSourceAttestationOperationV1,
  produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV3,
} from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import { compileObservedSubstrateFederatedGenesisV3 }
  from '../../substrate-federated-observed-genesis-v3.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1 }
  from '../../bridge-validity-tracker-header-context-v1.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile }
  from '../../substrate-federated-settlement-family-v1.js';
import { buildSubstrateFederatedNativeGenesisPegInPacketV3 }
  from '../../substrate-federated-isolated-devnet-peg-in-candidate-v3.js';
import { buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV3 }
  from '../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  assertSubstrateFederatedNativeGenesisCommittedReserveEvidenceReceiptV3Provenance,
  collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV3,
} from '../../substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import { discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1 }
  from '../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
import { assertSubstrateFederatedNativeGenesisPegInSourceLockOutputObservationV3 }
  from '../../substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js';
import { assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV3 }
  from '../../substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js';
import { AuthenticatedSpvTrackerReadOnlyNodeClient }
  from '../../authenticated-spv-tracker-read-only-node-client.js';
import * as owned from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import * as helpers from '../../ergo-helpers.js';
import * as unsigned from '../../unsigned-ergo-transaction.js';
import { StateTracker } from '../../state-tracker.js';
import { ORIGINAL_NODE_OPTIONS } from '../../test-node-env.js';
import { derivePooledReserveMintReservationRuntimeStorageKeysV4 }
  from '../../pooled-reserve-mint-reservation-runtime-state-v4.js';
import {
  executeSubstrateFederatedNativeGenesisPegInCommittedVaultV3,
  executeSubstrateFederatedNativeGenesisPegInSourceLockV3,
} from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import { executeFrontierNativeProofBoundReservationV3 }
  from './frontier-native-proof-bound-reservation-signing-v1.js';

const bridgeRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const primary = 'http://127.0.0.1:9051';
const witness = 'http://127.0.0.1:9052';
const baseInput = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000', ergoTree: '0008cd02' + '22'.repeat(32),
  assets: [], additionalRegisters: {}, creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0,
};

describe('native V3 source-lock and vault producers retain one real observation chain', () => {
  it('rejects a same-digest foreign source object then commits the original through the vault', async () => {
    const wasmModule = await import('ergo-lib-wasm-nodejs');
    const wasm = wasmModule.default ?? wasmModule;
    const headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
      currentHeight: 1001, anchorContextIndex: 0,
      anchorExtensionRootHex: '94'.repeat(32),
    }).headers.map(header => header.raw);
    const tip = headers[0]!;
    if (typeof tip.id !== 'string' || !/^[0-9a-f]{64}$/u.test(tip.id)
      || typeof tip.height !== 'number' || !Number.isSafeInteger(tip.height)) {
      throw new Error('canonical fixture tip is invalid');
    }
    nodeDouble.tipHeaderIdHex = tip.id;
    nodeDouble.tipHeight = tip.height;
    const target = Object.freeze({ primaryNodeOrigin: primary, witnessNodeOrigin: witness,
      primaryMining: true, witnessReadOnly: true });
    const binding = Object.freeze({ processBindingDigestHex: '74'.repeat(32),
      executionTargetIdentityDigestHex: '75'.repeat(32) });
    const operator = createFederatedGenesisOperatorV1();
    const state = new StateTracker(':memory:');
    const setup = await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    const source = createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
      ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: [setup.signer.publicKeyHex],
    });
    const sent = new Set<string>();
    try {
      vi.spyOn(owned, 'assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1')
        .mockImplementation(current => {
          if (current !== target) throw new Error('fixture target changed');
          return binding;
        });
      vi.spyOn(owned, 'completeSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1')
        .mockImplementation(async () => undefined as never);
      vi.spyOn(helpers, 'ngetDirect').mockResolvedValue(headers);
      vi.spyOn(helpers, 'ncheck').mockImplementation(async (_path, body) => {
        const transaction = wasm.Transaction.from_json(JSON.stringify(body));
        const id = transaction.id();
        try { return id.to_str(); } finally { id.free(); transaction.free(); }
      });

      const genesisBoxes = (await unsigned.materializeUnsignedTransaction({
        inputs: [{ ...baseInput, extension: {} }], dataInputs: [],
        outputs: [50, 60, 70, 120].map(amount => ({
          value: String(amount * 1_000_000), ergoTree: setup.signer.rewardInputErgoTrees.delay1,
          creationHeight: 120,
        })),
      }, 'fresh V3 source-lock genesis funding fixture')).outputs;
      const genesisInputs = Object.freeze({ tracker: genesisBoxes[0]!,
        duplicatePrevention: genesisBoxes[1]!, pooledReserve: genesisBoxes[2]! });
      const genesisObservation = Object.freeze({
        reportDigestHex: '71'.repeat(32),
        target: Object.freeze({ network: 'devnet', genesisHeaderIdHex: '72'.repeat(32),
          tipHeight: headers[0]!.height, tipHeaderIdHex: headers[0]!.id }),
        sources: Object.freeze({ primaryNodeOrigin: primary, witnessNodeOrigin: witness }),
        signer: Object.freeze({ publicKeyHex: setup.signer.publicKeyHex,
          p2pkErgoTreeHex: setup.signer.p2pkErgoTreeHex, rewardDelayBlocks: 1 as const,
          rewardInputErgoTreeHex: setup.signer.rewardInputErgoTrees.delay1 }),
        genesisBoxIds: Object.freeze({ tracker: genesisInputs.tracker.boxId,
          duplicatePrevention: genesisInputs.duplicatePrevention.boxId,
          pooledReserve: genesisInputs.pooledReserve.boxId }),
        genesisInputs,
        boundary: Object.freeze({ fixedDualLoopbackOrigins: true,
          targetBinaryRevalidationRequired: true }),
      });
      nodeDouble.funding = genesisObservation;
      nodeDouble.provedFunding.add(genesisObservation);
      for (const box of Object.values(genesisInputs)) {
        nodeDouble.genesisBoxes.set(box.boxId, box);
        const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
        try {
          nodeDouble.genesisBinary.set(box.boxId,
            Buffer.from(parsed.sigma_serialize_bytes()).toString('hex'));
        } finally { parsed.free(); }
      }
      const ownedGenesis = await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(
        setup.signer, target as never);
      const history = Object.freeze({ receipt: Object.freeze({
        rewardInputDiscoveryDigestHex: genesisObservation.reportDigestHex,
        genesisBoxIds: genesisObservation.genesisBoxIds,
        target: Object.freeze({ genesisHeaderIdHex: genesisObservation.target.genesisHeaderIdHex,
          setupAnchorHeaderIdHex: genesisObservation.target.tipHeaderIdHex,
          setupAnchorHeight: genesisObservation.target.tipHeight }),
      }) });
      nodeDouble.provedHistory.add(history);
      const runtimeWasm = Buffer.from('0061736d01000000', 'hex');
      const compileInput = {
        target, ownedDiscovery: ownedGenesis, history, setupSigner: setup.signer,
        sourceSession: source,
        genesis: { bridgeRoot, launchDomainHex: operator.launchDomainHex, evmChainId: '198407',
          operatorAddressHex: operator.addressHex, bridgeAddressHex: '33'.repeat(20),
          tokenAddressHex: '44'.repeat(20), runtimeWasm,
          expectedRuntimeWasmSha256Hex: createHash('sha256').update(runtimeWasm).digest('hex'),
          endowments: [{ addressHex: operator.addressHex, balance: '1000000000000000000' }] },
      };
      const previousOptions = process.env.NODE_OPTIONS;
      if (ORIGINAL_NODE_OPTIONS === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = ORIGINAL_NODE_OPTIONS;
      let compiled: Awaited<ReturnType<typeof compileObservedSubstrateFederatedGenesisV3>>;
      try { compiled = await compileObservedSubstrateFederatedGenesisV3(compileInput as never); }
      finally {
        if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
        else process.env.NODE_OPTIONS = previousOptions;
      }
      const batch = await setup.runNativeGenesisRetainingSignerV3(compiled, target as never);
      const funding = (await unsigned.materializeUnsignedTransaction({
        inputs: [{ ...baseInput, extension: {} }], dataInputs: [],
        outputs: [20, 20, 260].map(amount => ({ value: String(amount * 1_000_000),
          ergoTree: setup.signer.p2pkErgoTreeHex, creationHeight: 1001 })),
      }, 'fresh V3 source-lock deposit funding fixture')).outputs;
      const family = decodeSubstrateFederatedSettlementFamilyV1Profile(compiled.familyReceipt.profile);
      const packet = await buildSubstrateFederatedNativeGenesisPegInPacketV3({
        batch, target: target as never, sourceFundingInput: funding[0]!,
        sourceIntent: { formatVersion: 2, sourceNetworkIdHex: family.sourceNetworkIdHex,
          sidechainIdHex: family.sidechainIdHex, bridgeAddressHex: family.bridgeAddressHex,
          tokenAddressHex: family.tokenAddressHex,
          settlementProfileIdHex: family.settlementProfileIdHex,
          admissionProfileIdHex: compiled.familyReceipt.profile.familyIdHex,
          sourceAssetIdHex: family.settlementAssetIdHex,
          amountNanoErg: '10000000', recipientAddressHex: operator.addressHex },
        depositorErgoTreeHex: setup.signer.p2pkErgoTreeHex,
        creationHeights: { currentErgoHeight: 1001, sourceLockCreation: 1001,
          reserveTransition: 1001 },
      });
      const armedIds: string[] = [];
      const arm = vi.spyOn(owned, 'armSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1')
        .mockImplementation(async (current, transactionIdHex) => {
          expect(current).toBe(target);
          expect(transactionIdHex).toBe([
            packet.transactions.sourceLockCreation.txId,
            packet.transactions.reserveTransition.txId,
          ][armedIds.length]);
          armedIds.push(transactionIdHex);
        });
      const depositObservation = Object.freeze({ ...genesisObservation,
        genesisBoxIds: Object.freeze({ tracker: funding[0]!.boxId,
          duplicatePrevention: funding[1]!.boxId, pooledReserve: funding[2]!.boxId }),
        genesisInputs: Object.freeze({ tracker: funding[0]!, duplicatePrevention: funding[1]!,
          pooledReserve: funding[2]! }),
      });
      nodeDouble.funding = depositObservation;
      nodeDouble.provedFunding.add(depositObservation);

      const inclusionHeight = batch.request.target.preSetupAnchor.height;
      const inclusionId = batch.request.target.preSetupAnchor.headerIdHex;
      const tipHeight = inclusionHeight + 20;
      const tipId = '79'.repeat(32);
      const finalityIds = new Map<number, string>([[inclusionHeight, inclusionId]]);
      for (let height = inclusionHeight + 1; height < tipHeight; height += 1) {
        finalityIds.set(height, height.toString(16).padStart(64, '0'));
      }
      finalityIds.set(tipHeight, tipId);
      const finalityHeaders = new Map([...finalityIds].map(([height, id]) => [
        id, Object.freeze({ id, height,
          parentId: finalityIds.get(height - 1) ?? batch.request.target.genesisHeaderIdHex }),
      ]));
      vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBestHeader')
        .mockImplementation(async () => ({ height: tipHeight, id: tipId }) as never);
      vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBlockHeaderById')
        .mockImplementation(async id => finalityHeaders.get(id) ?? null);
      vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBlockHeaderIdsAtHeight')
        .mockImplementation(async height => {
          if (height === 1) return [batch.request.target.genesisHeaderIdHex];
          if (height === inclusionHeight) return [inclusionId];
          if (height === tipHeight) return [tipId];
          throw new Error('unexpected output-observer header height');
        });
      vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBoxByIdOrNull')
        .mockImplementation(async id => {
          const reserveCommitted = sent.has(packet.transactions.reserveTransition.txId);
          if (id === packet.boxes.sourceFundingInput.boxId) return null;
          if (id === packet.boxes.reservePredecessor.boxId)
            return reserveCommitted ? null : packet.boxes.reservePredecessor;
          if (id === packet.boxes.sourceLock.boxId)
            return reserveCommitted ? null : packet.boxes.sourceLock;
          if (id === packet.boxes.transitionFeeFunding.boxId)
            return reserveCommitted ? null : packet.boxes.transitionFeeFunding;
          if (id === packet.boxes.reserveSuccessor.boxId)
            return reserveCommitted ? packet.boxes.reserveSuccessor : null;
          throw new Error('unexpected output-observer box ID');
        });
      vi.spyOn(axios, 'create').mockImplementation(config => {
        if (config?.baseURL !== primary && config?.baseURL !== witness) {
          throw new Error('unexpected confirmation node origin');
        }
        return {
        get: async (path: string) => {
          if (path === '/info') return { data: { network: 'devnet', fullHeight: tipHeight } };
          if (path === '/blocks/at/1')
            return { data: [batch.request.target.genesisHeaderIdHex] };
          if (path === `/blocks/at/${inclusionHeight}`) return { data: [inclusionId] };
          const match = /^\/blockchain\/transaction\/byId\/([0-9a-f]{64})$/.exec(path);
          if (match && sent.has(match[1]!)) return { data: {
            id: match[1], numConfirmations: 20, inclusionHeight, headerId: inclusionId,
          } };
          throw new Error(`unexpected confirmation request ${path}`);
        },
        } as ReturnType<typeof axios.create>;
      });
      const post = vi.spyOn(axios, 'post').mockImplementation(async (url, body) => {
        expect(url).toBe(`${primary}/transactions`);
        if (!body || typeof body !== 'object' || !('id' in body)
          || body.id !== [
            packet.transactions.sourceLockCreation.txId,
            packet.transactions.reserveTransition.txId,
          ][sent.size]) {
          throw new Error('unexpected V3 signed transaction order');
        }
        expect(state.getErgoOperationalTransactionAttempt(body.id)).not.toBeNull();
        sent.add(body.id);
        return { status: 200, data: body.id };
      });
      const execution = { target: target as never, batch, packet, setupSession: setup, state };
      const sourceResult = await executeSubstrateFederatedNativeGenesisPegInSourceLockV3(execution);
      expect(sourceResult.expectedTxId).toBe(packet.transactions.sourceLockCreation.txId);
      expect(sourceResult.transportStatus).toBe('accepted');
      expect(state.getErgoOperationalTransactionAttempt(sourceResult.expectedTxId)?.status)
        .toBe('confirmed');
      expect(assertSubstrateFederatedNativeGenesisPegInSourceLockOutputObservationV3(
        sourceResult.outputObservation, target as never, batch, packet)).toBe(packet);
      expect(arm).toHaveBeenCalledOnce();
      expect(post).toHaveBeenCalledTimes(1);

      const sameDigestForeignObservation = Object.freeze({ ...sourceResult.outputObservation });
      expect(sameDigestForeignObservation.observationDigestHex)
        .toBe(sourceResult.outputObservation.observationDigestHex);
      await expect(executeSubstrateFederatedNativeGenesisPegInCommittedVaultV3({
        ...execution, sourceLockObservation: sameDigestForeignObservation,
      })).rejects.toThrow(/source-lock output observation lacks exact packet and batch provenance/);
      expect(state.getErgoOperationalTransactionAttempt(packet.transactions.reserveTransition.txId))
        .toBeNull();
      expect(post).toHaveBeenCalledTimes(1);

      const vaultResult = await executeSubstrateFederatedNativeGenesisPegInCommittedVaultV3({
        ...execution, sourceLockObservation: sourceResult.outputObservation,
      });
      expect(vaultResult.expectedTxId).toBe(packet.transactions.reserveTransition.txId);
      expect(vaultResult.transportStatus).toBe('accepted');
      expect(state.getErgoOperationalTransactionAttempt(vaultResult.expectedTxId)?.status)
        .toBe('confirmed');
      expect(assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV3(
        vaultResult.outputObservation, target as never, batch, packet)).toBe(packet);
      expect(vaultResult.outputObservation.boundaries).toMatchObject({
        mintAuthorized: false, fundsAuthorityEstablished: false, gate5Closed: false,
      });
      const draftInputs = Object.freeze({ batch, target: target as never, packet,
        committedVaultObservation: vaultResult.outputObservation });
      const operation = createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(source);
      try {
        const sameDigestForeignVault = Object.freeze({ ...vaultResult.outputObservation });
        expect(sameDigestForeignVault.observationDigestHex)
          .toBe(vaultResult.outputObservation.observationDigestHex);
        expect(() => buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV3({
          ...draftInputs, committedVaultObservation: sameDigestForeignVault,
        })).toThrow(/isolated committed-vault output observation lacks provenance/);

        const draft = buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV3(draftInputs);
        const evidenceReceipt = collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV3({
          ...draftInputs, draft,
        });
        assertSubstrateFederatedNativeGenesisCommittedReserveEvidenceReceiptV3Provenance(
          evidenceReceipt);
        const proof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV3(
          operation, { draftInputs, draft, evidenceReceipt,
            issuedAtNativeHeight: '0', expiresAtNativeHeight: '32' });
        assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV3(
          proof, operation, draft);
        expect(proof.sourceEvidenceReceiptDigestHex).toBe(evidenceReceipt.receiptDigestHex);
        expect(proof.mintReservationDraftDigestHex).toBe(draft.draftDigestHex);
        expect(proof.mintIdentityHex).toBe(draft.reservationKeyHex);
        expect(proof.familyIdHex).toBe(`0x${packet.familyIdHex}`);
        expect(proof).toMatchObject({
          checks: { exactV3FamilyCompilerBound: true, oneShotCapabilityConsumed: true },
          boundary: { mintExecuted: false, fundsAuthorityEstablished: false,
            productionReadinessEstablished: false },
        });
        const frontierTarget = Object.freeze({
          genesisJsonSha256Hex: compiled.candidate.genesisJsonSha256Hex,
          primaryRpcUrl: 'http://127.0.0.1:19955', witnessRpcUrl: 'http://127.0.0.1:19956',
        });
        const runtimeKeys = derivePooledReserveMintReservationRuntimeStorageKeysV4(proof.mintIdentityHex);
        const expectedStorage = Object.freeze({
          [runtimeKeys.runtimeCodeStorageKeyHex]: `0x${runtimeWasm.toString('hex')}`,
        });
        const expectedGenesisHashHex = `0x${'94'.repeat(32)}`;
        const signing = Object.freeze({ operator, sourceOperation: operation, draftInputs, draft, proof,
          compiled, target: target as never, frontierTarget: frontierTarget as never,
          expectedStorage, expectedGenesisHashHex });
        nodeDouble.observeReservationTarget.mockReset();
        nodeDouble.observeReservationTarget.mockResolvedValue({ genesisHashHex: expectedGenesisHashHex,
          nonce: 0 });
        nodeDouble.reserveReservationAttempt.mockReset().mockImplementation(
          (_directory: string, candidate: object) => Object.freeze({ ...candidate }));
        nodeDouble.submitReservation.mockReset().mockImplementation(
          async (_attempt: object, authorize: () => void) => { authorize(); });
        nodeDouble.sealReservation.mockReset().mockImplementation(
          async (_attempt: object, authorize: () => void) => {
            authorize(); return `0x${'ab'.repeat(32)}`;
          });
        nodeDouble.observeReservationInclusion.mockReset().mockImplementation(
          async (_observation: object, authorize: () => void) => {
            authorize(); return { blockHeight: 1, blockHashHex: `0x${'ab'.repeat(32)}` };
          });
        const primitiveSign = vi.spyOn(SigningKey.prototype, 'sign');
        try {
          nodeDouble.frontierTargetCustody.set(frontierTarget, () => undefined);
          const attemptDirectory = 'C:/synthetic-v3-source-proof-reservation';
          await expect(executeFrontierNativeProofBoundReservationV3({
            signing: { ...signing, proof: Object.freeze({ ...proof }) },
            attemptDirectory, broadcastScope: 'fed-native-local-synthetic-v3-reservation-only',
          })).rejects.toThrow(/provenance/u);
          expect(nodeDouble.observeReservationTarget).not.toHaveBeenCalled();
          expect(nodeDouble.reserveReservationAttempt).not.toHaveBeenCalled();
          expect(primitiveSign).not.toHaveBeenCalled();

          const reserved = await executeFrontierNativeProofBoundReservationV3({
            signing, attemptDirectory, broadcastScope: 'fed-native-local-synthetic-v3-reservation-only',
          });
          expect(reserved.sourceProofReceiptDigestHex).toBe(proof.receiptDigestHex);
          expect(reserved.mintIdentityHex).toBe(proof.mintIdentityHex);
          expect(reserved.runtimeProfileIdHex).toBe(proof.runtimeProfileIdHex);
          expect(reserved).toMatchObject({ runtimeReservationObserved: true,
            mintExecuted: false, sourceFinalityEstablished: false, trustless: false });
          expect(nodeDouble.observeReservationTarget).toHaveBeenCalledTimes(2);
          const expectedObservationInput = {
            expectedStorage, expectedGenesisHashHex,
            sourceRuntimeCodeSha256Hex: compiled.preparation.application.sourceRuntimeCodeSha256Hex,
            sourceRuntimeCodeBytes: compiled.preparation.application.sourceRuntimeCodeBytes,
            runtimeProfileScaleHex: compiled.candidate.runtimeProfileScaleHex,
            operatorStorageKeyHex: operator.nativeFunding.storageKeyHex,
            operatorAccountInfoHex: operator.nativeFunding.accountInfoScaleHex,
          };
          expect(nodeDouble.observeReservationTarget).toHaveBeenNthCalledWith(1, expectedObservationInput);
          expect(nodeDouble.observeReservationTarget).toHaveBeenNthCalledWith(2, expectedObservationInput);
          expect(nodeDouble.reserveReservationAttempt).toHaveBeenCalledTimes(1);
          expect(nodeDouble.reserveReservationAttempt.mock.calls[0]?.[0]).toBe(attemptDirectory);
          expect(nodeDouble.submitReservation).toHaveBeenCalledTimes(1);
          expect(nodeDouble.sealReservation).toHaveBeenCalledTimes(1);
          expect(nodeDouble.observeReservationInclusion).toHaveBeenCalledTimes(1);
          const observation = nodeDouble.observeReservationInclusion.mock.calls[0]?.[0] as {
            attempt: object;
            blockHashHex: string;
            expectedStorage: Record<string, string | null>;
          };
          const attempt = nodeDouble.reserveReservationAttempt.mock.results[0]?.value as object;
          expect(nodeDouble.submitReservation.mock.calls[0]?.[0]).toBe(attempt);
          expect(nodeDouble.sealReservation.mock.calls[0]?.[0]).toBe(attempt);
          expect(observation.attempt).toBe(attempt);
          const sealedHash = await nodeDouble.sealReservation.mock.results[0]?.value;
          expect(observation.blockHashHex).toBe(sealedHash);
          expect(reserved.blockHashHex).toBe(sealedHash);
          const callOrder = [nodeDouble.observeReservationTarget.mock.invocationCallOrder[0],
            primitiveSign.mock.invocationCallOrder[0],
            nodeDouble.reserveReservationAttempt.mock.invocationCallOrder[0],
            nodeDouble.observeReservationTarget.mock.invocationCallOrder[1],
            nodeDouble.submitReservation.mock.invocationCallOrder[0],
            nodeDouble.sealReservation.mock.invocationCallOrder[0],
            nodeDouble.observeReservationInclusion.mock.invocationCallOrder[0]];
          expect(callOrder.every((value, index) => typeof value === 'number'
            && (index === 0 || value > callOrder[index - 1]!))).toBe(true);
          expect(observation.expectedStorage[runtimeKeys.pendingReservationStorageKeyHex])
            .toBe(reserved.pendingReservationScaleHex);
          expect(reserved.pendingReservationScaleHex).toContain(proof.request.statementHex.slice(2));
          expect(primitiveSign).toHaveBeenCalledTimes(1);
        } finally {
          primitiveSign.mockRestore();
          nodeDouble.frontierTargetCustody.delete(frontierTarget);
          nodeDouble.observeReservationTarget.mockReset();
          nodeDouble.reserveReservationAttempt.mockReset();
          nodeDouble.submitReservation.mockReset();
          nodeDouble.sealReservation.mockReset();
          nodeDouble.observeReservationInclusion.mockReset();
        }
      } finally {
        operation.dispose();
      }
      expect(armedIds).toEqual([
        packet.transactions.sourceLockCreation.txId,
        packet.transactions.reserveTransition.txId,
      ]);
      expect(arm).toHaveBeenCalledTimes(2);
      expect(post).toHaveBeenCalledTimes(2);
    } finally {
      source.dispose();
      setup.dispose();
      state.close();
      disposeFederatedGenesisOperatorV1(operator);
      vi.restoreAllMocks();
      nodeDouble.funding = undefined;
      nodeDouble.genesisBoxes.clear();
      nodeDouble.genesisBinary.clear();
      nodeDouble.tipHeaderIdHex = undefined;
      nodeDouble.tipHeight = undefined;
    }
  }, 120_000);
});
