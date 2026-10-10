/**
 * Consolidate matured local patched-devnet mining rewards into the Fleet P2PK
 * address. The command requires the explicit canonical patched-devnet endpoint
 * and never uses node-wallet signing.
 */

import { fileURLToPath } from 'node:url';

import axios, { type AxiosInstance } from 'axios';
import { ErgoAddress } from '@fleet-sdk/core';
import { ErgoHDKey } from '@fleet-sdk/wallet';

import { assertBroadcastAllowed } from '../broadcast-policy.js';
import { ncheck, npostDirect } from '../ergo-helpers.js';
import {
  deriveUnsignedTransactionId,
  sanitizeSignerErrorText,
  signTransactionForSubmission,
} from '../fleet-signer.js';
import {
  buildDevnetRewardConsolidationPlan,
  DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
  DEVNET_REWARD_CONSOLIDATION_FINAL_CONFIRMATIONS,
  DEVNET_REWARD_CONSOLIDATION_NODE_NETWORK,
  devnetRewardConsolidationSessionIdentityDigestHex,
  deriveDevnetRewardErgoTreeHex,
  executeDevnetRewardConsolidation,
  normalizeLocalDevnetRewardNodeOrigin,
  revalidateDevnetRewardConsolidationPlan,
  type DevnetRewardConsolidationCheckedCandidate,
  type DevnetRewardConsolidationConfirmation,
  type DevnetRewardConsolidationDurableAttempt,
  type DevnetRewardConsolidationPlan,
  type DevnetRewardConsolidationRevalidatedCandidate,
  type DevnetRewardConsolidationSignedCandidate,
} from '../relayer-core/devnet-reward-consolidation.js';
import {
  DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
} from '../relayer-core/ergo-operational-transaction-lifecycle.js';
import { sha256CanonicalJson } from '../ergo-settlement-core/strict-json.js';
import { StateTracker } from '../state-tracker.js';

const LABEL = 'devnet reward consolidation';
const HTTP_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const JOURNAL_PATH = './devnet-reward-consolidation.sqlite';

type JsonRecord = Record<string, unknown>;

interface FleetIdentity {
  readonly address: string;
  readonly ergoTreeHex: string;
  readonly publicKeyHex: string;
  readonly networkPrefix: number;
}

interface RewardIdentity {
  readonly address: string;
  readonly ergoTreeHex: string;
}

function fixedHex32(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be 32-byte hex`);
  const normalized = value.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return normalized;
}

function createNodeClient(nodeOrigin: string): AxiosInstance {
  return axios.create({
    baseURL: nodeOrigin,
    timeout: HTTP_TIMEOUT_MS,
    maxRedirects: 0,
    proxy: false,
    maxContentLength: MAX_RESPONSE_BYTES,
  });
}

async function deriveFleetIdentity(): Promise<FleetIdentity> {
  const mnemonic = process.env.WALLET_MNEMONIC?.trim();
  if (!mnemonic) throw new Error('WALLET_MNEMONIC not set');
  const rawNetworkPrefix = process.env.ERGO_NETWORK_PREFIX?.trim() ?? '16';
  if (!/^[0-9]+$/.test(rawNetworkPrefix)) {
    throw new Error('ERGO_NETWORK_PREFIX must be a canonical unsigned integer');
  }
  const networkPrefix = Number(rawNetworkPrefix);
  const masterKey = await ErgoHDKey.fromMnemonic(mnemonic);
  const childKey = masterKey.deriveChild(0);
  const address = childKey.address.toString(networkPrefix);
  return Object.freeze({
    address,
    ergoTreeHex: ErgoAddress.fromBase58(address).ergoTree,
    publicKeyHex: Buffer.from(childKey.publicKey).toString('hex'),
    networkPrefix,
  });
}

async function discoverRewardIdentity(
  client: AxiosInstance,
  signerPublicKeyHex: string,
): Promise<RewardIdentity | null> {
  const expectedErgoTreeHex = deriveDevnetRewardErgoTreeHex(signerPublicKeyHex);
  const headers = await client.get('/blocks/lastHeaders/1');
  if (!Array.isArray(headers.data) || headers.data.length !== 1) return null;
  const blockId = fixedHex32(headers.data[0]?.id, 'latest devnet block ID');
  const block = await client.get(`/blocks/${blockId}`);
  const transactions = block.data?.blockTransactions?.transactions;
  if (!Array.isArray(transactions) || transactions.length === 0) return null;
  const rewardOutput = transactions[0]?.outputs?.[1];
  if (rewardOutput === null || typeof rewardOutput !== 'object') return null;
  const ergoTreeHex = String(rewardOutput.ergoTree ?? '').toLowerCase();
  if (ergoTreeHex !== expectedErgoTreeHex) return null;
  const response = await client.get(`/utils/ergoTreeToAddress/${ergoTreeHex}`);
  if (typeof response.data?.address !== 'string') return null;
  return Object.freeze({
    address: response.data.address,
    ergoTreeHex,
  });
}

async function getChainAnchorHeaderId(client: AxiosInstance): Promise<string> {
  const response = await client.get(
    `/blocks/at/${DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT}`,
  );
  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new Error('patched devnet chain anchor lookup must return exactly one header ID');
  }
  return fixedHex32(
    response.data[0],
    'patched devnet chain anchor header ID',
  );
}

async function getUnspentBoxesByAddress(
  client: AxiosInstance,
  address: string,
  limit: number,
): Promise<readonly unknown[]> {
  const response = await client.get(
    `/blockchain/box/unspent/byAddress/${encodeURIComponent(address)}`
      + `?offset=0&limit=${limit}`,
  );
  if (!Array.isArray(response.data)) {
    throw new Error('devnet unspent-box response must be an array');
  }
  return response.data;
}

async function getNodeInfo(client: AxiosInstance): Promise<{
  fullHeight: number;
  network: string;
}> {
  const response = await client.get('/info');
  const fullHeight = response.data?.fullHeight;
  const network = response.data?.network;
  if (!Number.isSafeInteger(fullHeight) || fullHeight <= 0) {
    throw new Error('devnet node returned an invalid full height');
  }
  if (typeof network !== 'string' || network.trim().length === 0) {
    throw new Error('devnet node returned an invalid network identity');
  }
  return { fullHeight, network };
}

export async function assertExactNodeIdentity(
  client: AxiosInstance,
  expectedChainAnchorHeaderIdHex: string,
): Promise<Readonly<{
  fullHeight: number;
  network: string;
  chainAnchorHeaderIdHex: string;
}>> {
  const [info, chainAnchorHeaderIdHex] = await Promise.all([
    getNodeInfo(client),
    getChainAnchorHeaderId(client),
  ]);
  if (info.network.trim().toLowerCase() !== DEVNET_REWARD_CONSOLIDATION_NODE_NETWORK) {
    throw new Error('reward consolidation requires the patched node devnet identity');
  }
  if (chainAnchorHeaderIdHex !== expectedChainAnchorHeaderIdHex) {
    throw new Error('patched devnet chain anchor differs from the explicit session identity');
  }
  return Object.freeze({
    ...info,
    chainAnchorHeaderIdHex,
  });
}

async function observeSelectedInputs(
  client: AxiosInstance,
  plan: DevnetRewardConsolidationPlan,
): Promise<readonly unknown[]> {
  const boxes: unknown[] = [];
  for (const boxId of plan.inputBoxIds) {
    try {
      const response = await client.get(`/utxo/byId/${boxId}`);
      boxes.push(response.data);
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`reward consolidation input ${boxId} is no longer unspent`);
      }
      throw error;
    }
  }
  return boxes;
}

export async function observeRewardConsolidationTransaction(
  client: AxiosInstance,
  transactionId: string,
  nodeOrigin: string,
  expectedChainAnchorHeaderIdHex: string,
): Promise<DevnetRewardConsolidationConfirmation> {
  const expectedTxId = fixedHex32(
    transactionId,
    'expected reward consolidation transaction ID',
  );
  const normalizedNodeOrigin = normalizeLocalDevnetRewardNodeOrigin(nodeOrigin);
  if (client.defaults.baseURL !== normalizedNodeOrigin) {
    throw new Error('reward consolidation observation client does not match its node origin');
  }
  const identity = await assertExactNodeIdentity(
    client,
    expectedChainAnchorHeaderIdHex,
  );
  let transaction: JsonRecord | null = null;
  try {
    const response = await client.get(
      `/blockchain/transaction/byId/${expectedTxId}`,
    );
    if (
      response.data === null
      || typeof response.data !== 'object'
      || Array.isArray(response.data)
    ) {
      throw new Error('reward consolidation transaction response must be an object');
    }
    transaction = response.data as JsonRecord;
  } catch (error: unknown) {
    if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error;
  }
  if (transaction === null) {
    return Object.freeze({
      status: 'not_found',
      confirmations: 0,
      observedAtHeight: identity.fullHeight,
      confirmationHeight: null,
      confirmationHeaderIdHex: null,
      observationDigestHex: sha256CanonicalJson({
        expectedTxId,
        observedId: null,
        confirmations: 0,
        observedAtHeight: identity.fullHeight,
        nodeOrigin: normalizedNodeOrigin,
        chainAnchorHeaderIdHex: identity.chainAnchorHeaderIdHex,
      }, 'E2S_DEVNET_REWARD_CONSOLIDATION_CONFIRMATION_V1'),
    });
  }
  const observedId = fixedHex32(
    transaction.id,
    'observed reward consolidation transaction ID',
  );
  if (observedId !== expectedTxId) {
    throw new Error('reward consolidation confirmation returned another transaction');
  }
  const rawConfirmations = transaction.numConfirmations ?? 0;
  if (!Number.isSafeInteger(rawConfirmations) || Number(rawConfirmations) < 0) {
    throw new Error('reward consolidation transaction has an invalid confirmation count');
  }
  const confirmations = rawConfirmations as number;
  if (confirmations < DEVNET_REWARD_CONSOLIDATION_FINAL_CONFIRMATIONS) {
    return Object.freeze({
      status: 'pending',
      confirmations,
      observedAtHeight: identity.fullHeight,
      confirmationHeight: null,
      confirmationHeaderIdHex: null,
      observationDigestHex: sha256CanonicalJson({
        expectedTxId,
        observedId,
        confirmations,
        observedAtHeight: identity.fullHeight,
        nodeOrigin: normalizedNodeOrigin,
        chainAnchorHeaderIdHex: identity.chainAnchorHeaderIdHex,
      }, 'E2S_DEVNET_REWARD_CONSOLIDATION_CONFIRMATION_V1'),
    });
  }
  const rawConfirmationHeight = transaction.inclusionHeight;
  if (
    !Number.isSafeInteger(rawConfirmationHeight)
    || Number(rawConfirmationHeight) <= 0
  ) {
    throw new Error('reward consolidation transaction has an invalid inclusion height');
  }
  const confirmationHeight = rawConfirmationHeight as number;
  const derivedConfirmations = identity.fullHeight - confirmationHeight;
  if (
    derivedConfirmations !== confirmations
    || derivedConfirmations < DEVNET_REWARD_CONSOLIDATION_FINAL_CONFIRMATIONS
  ) {
    throw new Error('reward consolidation transaction confirmation depth is inconsistent');
  }
  const canonicalHeaderResponse = await client.get(`/blocks/at/${confirmationHeight}`);
  if (
    !Array.isArray(canonicalHeaderResponse.data)
    || canonicalHeaderResponse.data.length !== 1
  ) {
    throw new Error('reward consolidation inclusion height is not uniquely canonical');
  }
  const canonicalHeaderIdHex = fixedHex32(
    canonicalHeaderResponse.data[0],
    'canonical reward consolidation inclusion header ID',
  );
  const claimedHeaderIdHex = fixedHex32(
    transaction.headerId ?? transaction.blockId,
    'reward consolidation inclusion header ID',
  );
  if (claimedHeaderIdHex !== canonicalHeaderIdHex) {
    throw new Error('reward consolidation transaction is not in the canonical header');
  }
  return Object.freeze({
    status: 'confirmed',
    confirmations,
    observedAtHeight: identity.fullHeight,
    confirmationHeight,
    confirmationHeaderIdHex: canonicalHeaderIdHex,
    observationDigestHex: sha256CanonicalJson({
      expectedTxId,
      observedId,
      confirmations,
      observedAtHeight: identity.fullHeight,
      confirmationHeight,
      confirmationHeaderIdHex: canonicalHeaderIdHex,
      nodeOrigin: normalizedNodeOrigin,
      chainAnchorHeaderIdHex: identity.chainAnchorHeaderIdHex,
    }, 'E2S_DEVNET_REWARD_CONSOLIDATION_CONFIRMATION_V1'),
  });
}

function signedTransactionDigest(signedTransaction: unknown): string {
  return sha256CanonicalJson(
    signedTransaction,
    'E2S_DEVNET_REWARD_CONSOLIDATION_SIGNED_TRANSACTION_V1',
  );
}

async function executePlan(
  plan: DevnetRewardConsolidationPlan,
  client: AxiosInstance,
  state: StateTracker,
): Promise<Awaited<ReturnType<typeof executeDevnetRewardConsolidation>>> {
  const expectedTxId = await deriveUnsignedTransactionId(
    plan.unsignedTransaction,
  );
  const signedMaterial = new WeakMap<object, JsonRecord>();
  const checkedMaterial = new WeakMap<
    object,
    DevnetRewardConsolidationSignedCandidate
  >();
  const authorizationMaterial = new WeakMap<object, Readonly<{
    revalidated: DevnetRewardConsolidationRevalidatedCandidate;
    preTransportEvidenceDigestHex: string;
  }>>();
  const durableMaterial = new WeakMap<object, Readonly<{
    candidate: DevnetRewardConsolidationDurableAttempt['candidate'];
    durableAttemptDigestHex: string;
  }>>();

  return executeDevnetRewardConsolidation({ plan, expectedTxId }, {
    signer: {
      sign: async admission => {
        assertBroadcastAllowed(`${LABEL} signing preflight`);
        const signed = await signTransactionForSubmission(
          admission.plan.unsignedTransaction,
          LABEL,
          admission.expectedTxId,
          admission.plan.nodeOrigin,
        );
        if (!signed) return null;
        const signerArtifact = Object.freeze({
          profile: 'e2s.devnet-reward-consolidation-signer.v1',
          expectedTxId: admission.expectedTxId,
        });
        signedMaterial.set(signerArtifact, signed.signedTx as JsonRecord);
        return Object.freeze({
          signedTransactionDigestHex: signedTransactionDigest(signed.signedTx),
          signerArtifact,
        });
      },
    },
    checker: {
      check: async signed => {
        const signedTransaction = signedMaterial.get(signed.signerArtifact);
        if (!signedTransaction) {
          throw new Error('reward consolidation signed material is unavailable');
        }
        const response = await ncheck(
          '/transactions/check',
          signedTransaction,
          plan.nodeOrigin,
        );
        if (
          typeof response !== 'string'
          || fixedHex32(response, 'reward consolidation check response')
            !== signed.admission.expectedTxId
        ) {
          return null;
        }
        const checkerArtifact = Object.freeze({
          profile: 'e2s.devnet-reward-consolidation-checker.v1',
          expectedTxId: signed.admission.expectedTxId,
        });
        checkedMaterial.set(checkerArtifact, signed);
        return Object.freeze({
          checkResponseDigestHex: sha256CanonicalJson({
            expectedTxId: signed.admission.expectedTxId,
            nodeOrigin: plan.nodeOrigin,
            path: '/transactions/check',
            method: 'POST',
          }, 'E2S_DEVNET_REWARD_CONSOLIDATION_CHECK_V1'),
          checkerArtifact,
        });
      },
    },
    revalidator: {
      revalidate: async (checked, phase) => {
        if (checkedMaterial.get(checked.checkerArtifact) !== checked.signed) {
          throw new Error('reward consolidation check lacks process provenance');
        }
        const [identity, boxes] = await Promise.all([
          assertExactNodeIdentity(client, plan.chainAnchorHeaderIdHex),
          observeSelectedInputs(client, plan),
        ]);
        const evidence = revalidateDevnetRewardConsolidationPlan({
          plan,
          nodeOrigin: plan.nodeOrigin,
          nodeNetwork: identity.network,
          chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
          chainAnchorHeaderIdHex: identity.chainAnchorHeaderIdHex,
          addressNetworkPrefix: plan.addressNetworkPrefix,
          observedAtHeight: identity.fullHeight,
          boxes,
        });
        return Object.freeze({
          ...evidence,
          observationDigestHex: sha256CanonicalJson({
            phase,
            evidence,
          }, 'E2S_DEVNET_REWARD_CONSOLIDATION_PHASE_REVALIDATION_V1'),
        });
      },
    },
    broadcastAuthorizer: {
      authorize: (revalidated, preTransportEvidence) => {
        assertBroadcastAllowed(`${LABEL} authorization`);
        const authorizationDigestHex = sha256CanonicalJson({
          planDigestHex: plan.planDigestHex,
          expectedTxId,
          signedTransactionDigestHex:
            revalidated.checked.signed.signedTransactionDigestHex,
          checkResponseDigestHex: revalidated.checked.checkResponseDigestHex,
          postCheckRevalidationDigestHex: revalidated.evidence.observationDigestHex,
          preTransportRevalidationDigestHex:
            preTransportEvidence.observationDigestHex,
        }, 'E2S_DEVNET_REWARD_CONSOLIDATION_AUTHORIZATION_V1');
        const authorizationArtifact = Object.freeze({
          profile: 'e2s.devnet-reward-consolidation-authorization.v1',
          expectedTxId,
        });
        authorizationMaterial.set(authorizationArtifact, Object.freeze({
          revalidated,
          preTransportEvidenceDigestHex:
            preTransportEvidence.observationDigestHex,
        }));
        return Object.freeze({ authorizationDigestHex, authorizationArtifact });
      },
    },
    journal: {
      reserve: candidate => {
        if (
          authorizationMaterial.get(
            candidate.authorization.authorizationArtifact,
          )?.revalidated !== candidate.authorization.revalidated
          || authorizationMaterial.get(
            candidate.authorization.authorizationArtifact,
          )?.preTransportEvidenceDigestHex
            !== candidate.authorization.preTransportEvidence.observationDigestHex
        ) {
          throw new Error('reward consolidation authorization lacks process provenance');
        }
        const checked = candidate.authorization.revalidated.checked;
        const attempt = state.reserveErgoOperationalTransactionAttempt({
          operationProfile: DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
          expectedTxId,
          sourceBoxId: plan.inputBoxIds[0],
          inputBoxIds: plan.inputBoxIds,
          attemptedAtHeight: plan.currentHeight,
          targetSidechainHeight: null,
          targetSidechainBlockHashHex: null,
          heartbeatKeyHex: null,
          reconciliationIdentityDigestHex: plan.sessionIdentityDigestHex,
          bindingDigestHex: plan.planDigestHex,
          signedTransactionDigestHex: checked.signed.signedTransactionDigestHex,
          checkResponseDigestHex: checked.checkResponseDigestHex,
          revalidationDigestHex:
            candidate.authorization.preTransportEvidence.observationDigestHex,
          authorizationDigestHex: candidate.authorization.authorizationDigestHex,
        });
        const durableArtifact = Object.freeze({
          profile: 'e2s.devnet-reward-consolidation-durable-attempt.v1',
          expectedTxId,
        });
        durableMaterial.set(durableArtifact, Object.freeze({
          candidate,
          durableAttemptDigestHex: attempt.durableAttemptDigestHex,
        }));
        return Object.freeze({
          durableAttemptDigestHex: attempt.durableAttemptDigestHex,
          durableArtifact,
        });
      },
      finalize: ({ attempt, submission }) => {
        const durable = durableMaterial.get(attempt.durableArtifact);
        if (
          !durable
          || durable.candidate !== attempt.candidate
          || durable.durableAttemptDigestHex !== attempt.durableAttemptDigestHex
        ) {
          throw new Error('reward consolidation durable attempt lacks process provenance');
        }
        const finalized = state.finalizeErgoOperationalTransactionAttempt({
          expectedTxId,
          durableAttemptDigestHex: attempt.durableAttemptDigestHex,
          disposition: submission.status,
          submittedTxId: submission.submittedTxId,
          responseDigestHex: submission.responseDigestHex,
        });
        return Object.freeze({
          status: submission.status,
          journalDigestHex: finalized.journalDigestHex,
        });
      },
      confirm: ({ attempt, confirmation }) => {
        const durable = durableMaterial.get(attempt.durableArtifact);
        if (!durable || durable.candidate !== attempt.candidate) {
          throw new Error('reward consolidation confirmation lacks durable provenance');
        }
        if (
          confirmation.status !== 'confirmed'
          || confirmation.confirmationHeight === null
          || confirmation.confirmationHeaderIdHex === null
        ) {
          throw new Error('reward consolidation durable confirmation lacks a block identity');
        }
        state.confirmErgoOperationalTransactionAttempt({
          expectedTxId,
          confirmationHeight: confirmation.confirmationHeight,
          confirmationHeaderId: confirmation.confirmationHeaderIdHex,
        });
      },
    },
    transport: {
      submit: async attempt => {
        const durable = durableMaterial.get(attempt.durableArtifact);
        if (
          !durable
          || durable.candidate !== attempt.candidate
          || durable.durableAttemptDigestHex !== attempt.durableAttemptDigestHex
        ) {
          throw new Error('reward consolidation transport lacks a durable attempt');
        }
        const candidate = attempt.candidate;
        if (
          authorizationMaterial.get(
            candidate.authorization.authorizationArtifact,
          )?.revalidated !== candidate.authorization.revalidated
          || authorizationMaterial.get(
            candidate.authorization.authorizationArtifact,
          )?.preTransportEvidenceDigestHex
            !== candidate.authorization.preTransportEvidence.observationDigestHex
        ) {
          throw new Error('reward consolidation authorization lacks process provenance');
        }
        const signed = candidate.authorization.revalidated.checked.signed;
        const signedTransaction = signedMaterial.get(signed.signerArtifact);
        if (!signedTransaction) {
          throw new Error('reward consolidation transport lost signed material');
        }
        assertBroadcastAllowed(`${LABEL} transport`);
        const response = await npostDirect(
          '/transactions',
          signedTransaction,
          plan.nodeOrigin,
        );
        if (typeof response !== 'string') return null;
        const submittedTxId = fixedHex32(
          response,
          'reward consolidation submission response',
        );
        return Object.freeze({
          status: 'accepted' as const,
          submittedTxId,
          responseDigestHex: sha256CanonicalJson({
            submittedTxId,
            nodeOrigin: plan.nodeOrigin,
            path: '/transactions',
            method: 'POST',
          }, 'E2S_DEVNET_REWARD_CONSOLIDATION_SUBMISSION_V1'),
        });
      },
    },
    confirmationObserver: {
      observe: async (transactionId, nodeOrigin) => {
        if (nodeOrigin !== plan.nodeOrigin) {
          throw new Error('reward consolidation confirmation node changed');
        }
        return observeRewardConsolidationTransaction(
          client,
          transactionId,
          nodeOrigin,
          plan.chainAnchorHeaderIdHex,
        );
      },
    },
  });
}

function assertAttemptSessionIdentity(
  attempt: Readonly<{ reconciliationIdentityDigestHex: string | null }>,
  sessionIdentityDigestHex: string,
): void {
  if (attempt.reconciliationIdentityDigestHex !== sessionIdentityDigestHex) {
    throw new Error(
      'durable reward consolidation attempt belongs to another node/signer session',
    );
  }
}

export async function reconcileConfirmedRewardConsolidations(
  state: StateTracker,
  client: AxiosInstance,
  nodeOrigin: string,
  chainAnchorHeaderIdHex: string,
  sessionIdentityDigestHex: string,
): Promise<void> {
  const confirmed = state.getConfirmedErgoOperationalTransactionAttempts(
    DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
  );
  for (const attempt of confirmed) {
    assertAttemptSessionIdentity(attempt, sessionIdentityDigestHex);
    const observation = await observeRewardConsolidationTransaction(
      client,
      attempt.expectedTxId,
      nodeOrigin,
      chainAnchorHeaderIdHex,
    );
    if (
      observation.status !== 'confirmed'
      || observation.confirmationHeight === null
      || observation.confirmationHeaderIdHex === null
    ) {
      throw new Error(
        `confirmed consolidation ${attempt.expectedTxId} lost final canonical inclusion `
          + `(${observation.status}); no new transaction will be built`,
      );
    }
    if (
      attempt.confirmationHeight !== observation.confirmationHeight
      || attempt.confirmationHeaderId !== observation.confirmationHeaderIdHex
    ) {
      state.rebindConfirmedErgoOperationalTransactionAttempt({
        expectedTxId: attempt.expectedTxId,
        confirmationHeight: observation.confirmationHeight,
        confirmationHeaderId: observation.confirmationHeaderIdHex,
      });
    }
  }
}

export async function reconcileActiveRewardConsolidation(
  state: StateTracker,
  client: AxiosInstance,
  nodeOrigin: string,
  chainAnchorHeaderIdHex: string,
  sessionIdentityDigestHex: string,
): Promise<boolean> {
  const active = state.getActiveErgoOperationalTransactionAttempts(
    DEVNET_REWARD_CONSOLIDATION_OPERATION_PROFILE,
  );
  if (active.length > 1) {
    throw new Error('multiple active reward consolidation attempts violate the static profile');
  }
  const attempt = active[0];
  if (!attempt) return false;
  assertAttemptSessionIdentity(attempt, sessionIdentityDigestHex);
  const observation = await observeRewardConsolidationTransaction(
    client,
    attempt.expectedTxId,
    nodeOrigin,
    chainAnchorHeaderIdHex,
  );
  if (
    observation.status !== 'confirmed'
    || observation.confirmationHeight === null
    || observation.confirmationHeaderIdHex === null
  ) {
    throw new Error(
      `durable consolidation attempt ${attempt.expectedTxId} is unresolved `
        + `(${observation.status}); no replacement transaction will be built`,
    );
  }
  state.confirmErgoOperationalTransactionAttempt({
    expectedTxId: attempt.expectedTxId,
    confirmationHeight: observation.confirmationHeight,
    confirmationHeaderId: observation.confirmationHeaderIdHex,
  });
  console.log(`  [PASS] Reconciled durable consolidation TX: ${attempt.expectedTxId}`);
  console.log(`         Confirmed at height ${observation.confirmationHeight}`);
  return true;
}

async function runFreshConsolidation(
  state: StateTracker,
  client: AxiosInstance,
  nodeOrigin: string,
  chainIdentity: Awaited<ReturnType<typeof assertExactNodeIdentity>>,
  fleet: FleetIdentity,
): Promise<void> {
  console.log(`  Fleet P2PK address: ${fleet.address}`);

  const reward = await discoverRewardIdentity(client, fleet.publicKeyHex);
  if (!reward) {
    throw new Error('cannot discover a signer-bound reward address; is the devnet mining?');
  }
  console.log(`  Reward address:     ${reward.address}`);

  const [p2pkBoxes, rewardBoxes] = await Promise.all([
    getUnspentBoxesByAddress(client, fleet.address, 10),
    getUnspentBoxesByAddress(client, reward.address, 100),
  ]);
  const p2pkBalance = p2pkBoxes.reduce<bigint>(
    (sum, box: any) => sum + BigInt(box.value),
    0n,
  );
  console.log(`  Current P2PK balance: ${Number(p2pkBalance) / 1e9} ERG`);
  console.log(`  Current height:       ${chainIdentity.fullHeight}`);

  const plan = buildDevnetRewardConsolidationPlan({
    nodeOrigin,
    nodeNetwork: chainIdentity.network,
    chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
    chainAnchorHeaderIdHex: chainIdentity.chainAnchorHeaderIdHex,
    addressNetworkPrefix: fleet.networkPrefix,
    currentHeight: chainIdentity.fullHeight,
    signerPublicKeyHex: fleet.publicKeyHex,
    rewardErgoTreeHex: reward.ergoTreeHex,
    destinationErgoTreeHex: fleet.ergoTreeHex,
    rewardBoxes,
  });
  if (!plan) {
    console.log('');
    console.log('  [INFO] No mature pure-ERG reward boxes to consolidate.');
    return;
  }

  console.log(`  Eligible reward boxes: ${plan.eligibleBoxCount}`);
  console.log(`  Ignored reward boxes:  ${plan.ignoredBoxCount}`);
  console.log('');
  console.log(`  Consolidating ${plan.inputBoxIds.length} reward boxes:`);
  console.log(`    Target P2PK:  ${fleet.address}`);
  console.log(`    Input/output: ${Number(BigInt(plan.selectedValueNanoErg)) / 1e9} ERG`);
  console.log('    Fee:          0 ERG (local patched-devnet only)');

  const result = await executePlan(plan, client, state);
  if (!result.transportAttempted) {
    throw new Error(`consolidation stopped at ${result.status}`);
  }
  if (result.status === 'ambiguous') {
    throw new Error(
      `submission outcome is ambiguous for ${result.expectedTxId}; `
        + `confirmation observation: ${result.confirmationStatus}`,
    );
  }
  const outcome = result.status === 'reconciled' ? 'reconciled' : 'accepted';
  console.log(`  [PASS] Consolidation TX ${outcome}: ${result.submittedTxId}`);
  console.log(`         Confirmation observation: ${result.confirmationStatus}`);
  console.log('');
  console.log('  Run demo:devnet:funding to verify the P2PK balance.');
  console.log('');
}

async function main(): Promise<void> {
  console.log('======================================================================');
  console.log('  Devnet Reward Consolidation');
  console.log('======================================================================');
  console.log('');

  if (process.env.PATCHED_STACK_MODE !== 'true') {
    throw new Error('PATCHED_STACK_MODE=true is required for devnet reward consolidation');
  }
  const configuredNodeOrigin = process.env.PATCHED_ERGO_NODE_URL?.trim();
  if (!configuredNodeOrigin) {
    throw new Error('PATCHED_ERGO_NODE_URL must explicitly select the local patched devnet');
  }
  const configuredChainAnchor = process.env.PATCHED_ERGO_CHAIN_ANCHOR_ID?.trim();
  if (!configuredChainAnchor) {
    throw new Error(
      'PATCHED_ERGO_CHAIN_ANCHOR_ID must explicitly bind the session height-1 header',
    );
  }
  const expectedChainAnchorHeaderIdHex = fixedHex32(
    configuredChainAnchor,
    'PATCHED_ERGO_CHAIN_ANCHOR_ID',
  );
  const nodeOrigin = normalizeLocalDevnetRewardNodeOrigin(configuredNodeOrigin);
  const client = createNodeClient(nodeOrigin);
  const chainIdentity = await assertExactNodeIdentity(
    client,
    expectedChainAnchorHeaderIdHex,
  );
  const fleet = await deriveFleetIdentity();
  const sessionIdentityDigestHex =
    devnetRewardConsolidationSessionIdentityDigestHex({
      nodeOrigin,
      nodeNetwork: chainIdentity.network,
      chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
      chainAnchorHeaderIdHex: chainIdentity.chainAnchorHeaderIdHex,
      addressNetworkPrefix: fleet.networkPrefix,
      signerPublicKeyHex: fleet.publicKeyHex,
      destinationErgoTreeHex: fleet.ergoTreeHex,
    });
  const state = new StateTracker(JOURNAL_PATH);
  try {
    await reconcileConfirmedRewardConsolidations(
      state,
      client,
      nodeOrigin,
      expectedChainAnchorHeaderIdHex,
      sessionIdentityDigestHex,
    );
    if (await reconcileActiveRewardConsolidation(
      state,
      client,
      nodeOrigin,
      expectedChainAnchorHeaderIdHex,
      sessionIdentityDigestHex,
    )) return;
    await runFreshConsolidation(state, client, nodeOrigin, chainIdentity, fleet);
  } finally {
    state.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Consolidation error: ${sanitizeSignerErrorText(message)}`);
    process.exitCode = 1;
  });
}
