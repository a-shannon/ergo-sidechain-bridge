import axios from 'axios';

import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1,
  type SubstrateFederatedLocalDevnetGenesisConfirmation,
  type SubstrateFederatedLocalDevnetGenesisExecutionPorts,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVER_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-genesis-confirmation-observer.v1' as const;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_V1';

type ConfirmationObserver =
  SubstrateFederatedLocalDevnetGenesisExecutionPorts['confirmationObserver'];

export interface SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1
  extends ConfirmationObserver {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVER_V1_SCHEMA;
  readonly reconciliationIdentityDigestHex: string;
}

interface ObserverMaterialV1 {
  readonly target:
    Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly binding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  readonly targetGenesisHeaderIdHex: string;
}

interface ArtifactMaterialV1 {
  readonly observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>;
  readonly targetGenesisHeaderIdHex: string;
  readonly expectedTxId: string;
  readonly observationDigestHex: string;
}

const OBSERVERS = new WeakMap<object, ObserverMaterialV1>();
const ARTIFACTS = new WeakMap<object, ArtifactMaterialV1>();

export function createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  targetGenesisHeaderIdHexValue: string,
): Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  const targetGenesisHeaderIdHex = fixedHex32(
    targetGenesisHeaderIdHexValue,
    'isolated devnet target genesis header ID',
  );
  if (
    target.primaryNodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
    || target.primaryMining !== true
    || target.witnessReadOnly !== true
  ) {
    throw new Error('isolated genesis observer target binding is invalid');
  }
  const primaryClient = createClient(target.primaryNodeOrigin);
  const witnessClient = createClient(target.witnessNodeOrigin);
  let observer!:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>;
  observer = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVER_V1_SCHEMA,
    reconciliationIdentityDigestHex:
      binding.executionTargetIdentityDigestHex,
    observe: async (
      expectedTxIdValue: string,
      nodeOrigin:
        typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    ) => {
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        observer,
        binding.executionTargetIdentityDigestHex,
      );
      if (nodeOrigin !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN) {
        throw new Error('isolated genesis confirmation origin changed');
      }
      const expectedTxId = fixedHex32(
        expectedTxIdValue,
        'isolated genesis expected transaction ID',
      );
      const identity = await observeExactTargetIdentity(
        primaryClient,
        witnessClient,
        targetGenesisHeaderIdHex,
      );
      const [primaryTransaction, witnessTransaction] = await Promise.all([
        readTransaction(primaryClient, expectedTxId, 'primary'),
        readTransaction(witnessClient, expectedTxId, 'witness'),
      ]);
      if (primaryTransaction === null && witnessTransaction === null) {
        return createObservation(observer, binding, {
          status: 'not_found',
          expectedTxId,
          observedTxId: null,
          confirmations: 0,
          observedAtHeight: identity.observedAtHeight,
          confirmationHeight: null,
          confirmationHeaderIdHex: null,
          targetGenesisHeaderIdHex,
        });
      }
      if (primaryTransaction === null || witnessTransaction === null) {
        throw new Error('isolated genesis transaction observations disagree');
      }
      const observedTxId = fixedHex32(
        primaryTransaction.id,
        'isolated genesis observed transaction ID',
      );
      const witnessObservedTxId = fixedHex32(
        witnessTransaction.id,
        'isolated genesis witness transaction ID',
      );
      if (
        observedTxId !== expectedTxId
        || witnessObservedTxId !== expectedTxId
      ) {
        throw new Error('isolated genesis observer returned another transaction');
      }
      const primaryConfirmations = confirmationCount(
        primaryTransaction,
        'primary',
      );
      const witnessConfirmations = confirmationCount(
        witnessTransaction,
        'witness',
      );
      const confirmations = Math.min(
        primaryConfirmations,
        witnessConfirmations,
      );
      if (confirmations < SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS) {
        return createObservation(observer, binding, {
          status: 'pending',
          expectedTxId,
          observedTxId,
          confirmations,
          observedAtHeight: identity.observedAtHeight,
          confirmationHeight: null,
          confirmationHeaderIdHex: null,
          targetGenesisHeaderIdHex,
        });
      }
      const primaryInclusion = await confirmedInclusion(
        primaryClient,
        primaryTransaction,
        identity.primaryHeight,
        primaryConfirmations,
        'primary',
      );
      const witnessInclusion = await confirmedInclusion(
        witnessClient,
        witnessTransaction,
        identity.witnessHeight,
        witnessConfirmations,
        'witness',
      );
      if (
        primaryInclusion.height !== witnessInclusion.height
        || primaryInclusion.headerIdHex !== witnessInclusion.headerIdHex
      ) {
        throw new Error('isolated genesis canonical inclusion observations disagree');
      }
      return createObservation(observer, binding, {
        status: 'confirmed',
        expectedTxId,
        observedTxId,
        confirmations,
        observedAtHeight: identity.observedAtHeight,
        confirmationHeight: primaryInclusion.height,
        confirmationHeaderIdHex: primaryInclusion.headerIdHex,
        targetGenesisHeaderIdHex,
      });
    },
  });
  OBSERVERS.set(observer, Object.freeze({
    target,
    binding,
    targetGenesisHeaderIdHex,
  }));
  return observer;
}

export function assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
  observer: Readonly<
    SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1
  >,
  expectedReconciliationIdentityDigestHex: string,
): void {
  const material = OBSERVERS.get(observer);
  const expectedDigest = fixedHex32(
    expectedReconciliationIdentityDigestHex,
    'expected isolated genesis reconciliation identity',
  );
  if (
    material === undefined
    || material.binding.executionTargetIdentityDigestHex !== expectedDigest
    || observer.reconciliationIdentityDigestHex !== expectedDigest
  ) {
    throw new Error(
      'isolated genesis confirmation observer lacks active process provenance',
    );
  }
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(
      material.target,
    );
  if (
    current.executionTargetIdentityDigestHex !== expectedDigest
    || current.processBindingDigestHex
      !== material.binding.processBindingDigestHex
  ) {
    throw new Error(
      'isolated genesis confirmation observer process binding changed',
    );
  }
}

export function assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
  artifact: object,
  expectedReconciliationIdentityDigestHex: string,
  expectedTargetGenesisHeaderIdHexValue: string,
  expectedTxIdValue: string,
  expectedConfirmation: SubstrateFederatedLocalDevnetGenesisConfirmation,
): void {
  const material = ARTIFACTS.get(artifact);
  const expectedTargetGenesisHeaderIdHex = fixedHex32(
    expectedTargetGenesisHeaderIdHexValue,
    'expected isolated genesis target header ID',
  );
  const expectedTxId = fixedHex32(
    expectedTxIdValue,
    'expected isolated genesis confirmation transaction ID',
  );
  const exact = normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(
    expectedConfirmation,
  );
  if (
    material === undefined
    || material.targetGenesisHeaderIdHex !== expectedTargetGenesisHeaderIdHex
    || material.expectedTxId !== expectedTxId
    || material.observationDigestHex !== exact.observationDigestHex
    || exact.observerArtifact !== artifact
  ) {
    throw new Error(
      'isolated genesis confirmation artifact lacks exact process provenance',
    );
  }
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
    material.observer,
    expectedReconciliationIdentityDigestHex,
  );
  const observerMaterial = OBSERVERS.get(material.observer)!;
  const recomputedObservationDigestHex = sha256CanonicalJson({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVER_V1_SCHEMA,
    processBindingDigestHex: observerMaterial.binding.processBindingDigestHex,
    reconciliationIdentityDigestHex:
      observerMaterial.binding.executionTargetIdentityDigestHex,
    nodeOrigin: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    targetGenesisHeaderIdHex: expectedTargetGenesisHeaderIdHex,
    expectedTxId,
    observedTxId: exact.status === 'not_found' ? null : expectedTxId,
    status: exact.status,
    confirmations: exact.confirmations,
    observedAtHeight: exact.observedAtHeight,
    confirmationHeight: exact.confirmationHeight,
    confirmationHeaderIdHex: exact.confirmationHeaderIdHex,
  }, OBSERVATION_DIGEST_DOMAIN);
  if (recomputedObservationDigestHex !== exact.observationDigestHex) {
    throw new Error(
      'isolated genesis confirmation fields differ from the observed artifact',
    );
  }
}

export async function reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
  input: Readonly<{
    artifact: object;
    expectedReconciliationIdentityDigestHex: string;
    expectedTargetGenesisHeaderIdHex: string;
    expectedTxId: string;
    priorConfirmation: SubstrateFederatedLocalDevnetGenesisConfirmation;
  }>,
): Promise<SubstrateFederatedLocalDevnetGenesisConfirmation> {
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
    input.artifact,
    input.expectedReconciliationIdentityDigestHex,
    input.expectedTargetGenesisHeaderIdHex,
    input.expectedTxId,
    input.priorConfirmation,
  );
  const material = ARTIFACTS.get(input.artifact)!;
  const expectedTxId = fixedHex32(
    input.expectedTxId,
    'expected isolated genesis confirmation transaction ID',
  );
  const latest = await material.observer.observe(
    expectedTxId,
    SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  );
  if (latest === null) {
    throw new Error('isolated genesis confirmation reobservation is unavailable');
  }
  const normalized =
    normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(latest);
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
    normalized.observerArtifact,
    input.expectedReconciliationIdentityDigestHex,
    input.expectedTargetGenesisHeaderIdHex,
    expectedTxId,
    normalized,
  );
  return normalized;
}

async function observeExactTargetIdentity(
  primaryClient: ReturnType<typeof axios.create>,
  witnessClient: ReturnType<typeof axios.create>,
  targetGenesisHeaderIdHex: string,
): Promise<Readonly<{
  primaryHeight: number;
  witnessHeight: number;
  observedAtHeight: number;
}>> {
  const [primary, witness] = await Promise.all([
    readNodeIdentity(primaryClient, targetGenesisHeaderIdHex, 'primary'),
    readNodeIdentity(witnessClient, targetGenesisHeaderIdHex, 'witness'),
  ]);
  return Object.freeze({
    primaryHeight: primary.fullHeight,
    witnessHeight: witness.fullHeight,
    observedAtHeight: Math.min(primary.fullHeight, witness.fullHeight),
  });
}

async function readNodeIdentity(
  client: ReturnType<typeof axios.create>,
  targetGenesisHeaderIdHex: string,
  role: 'primary' | 'witness',
): Promise<Readonly<{ fullHeight: number }>> {
  const [infoResponse, genesisResponse] = await Promise.all([
    client.get('/info'),
    client.get('/blocks/at/1'),
  ]);
  const info = plainRecord(infoResponse.data, 'isolated genesis node info');
  if (String(info.network ?? info.networkType).trim().toLowerCase() !== 'devnet') {
    throw new Error(`isolated genesis ${role} requires devnet identity`);
  }
  const fullHeight = positiveInteger(
    info.fullHeight,
    `isolated genesis ${role} height`,
  );
  const observedGenesisHeaderIdHex = uniqueHeaderId(
    genesisResponse.data,
    `isolated genesis ${role} chain anchor`,
  );
  if (observedGenesisHeaderIdHex !== targetGenesisHeaderIdHex) {
    throw new Error(`isolated genesis ${role} target identity changed`);
  }
  return Object.freeze({ fullHeight });
}

function createClient(origin: string): ReturnType<typeof axios.create> {
  return axios.create({
    baseURL: origin,
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    proxy: false,
    maxContentLength: MAX_RESPONSE_BYTES,
    headers: Object.freeze({ Accept: 'application/json' }),
  });
}

async function readTransaction(
  client: ReturnType<typeof axios.create>,
  expectedTxId: string,
  role: 'primary' | 'witness',
): Promise<Record<string, unknown> | null> {
  try {
    const response = await client.get(
      `/blockchain/transaction/byId/${expectedTxId}`,
    );
    return plainRecord(
      response.data,
      `isolated genesis ${role} transaction response`,
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
}

function confirmationCount(
  transaction: Readonly<Record<string, unknown>>,
  role: 'primary' | 'witness',
): number {
  return nonNegativeInteger(
    transaction.numConfirmations ?? 0,
    `isolated genesis ${role} transaction confirmation count`,
  );
}

async function confirmedInclusion(
  client: ReturnType<typeof axios.create>,
  transaction: Readonly<Record<string, unknown>>,
  fullHeight: number,
  confirmations: number,
  role: 'primary' | 'witness',
): Promise<Readonly<{ height: number; headerIdHex: string }>> {
  const height = positiveInteger(
    transaction.inclusionHeight,
    `isolated genesis ${role} transaction inclusion height`,
  );
  if (fullHeight - height !== confirmations) {
    throw new Error(`isolated genesis ${role} confirmation depth is inconsistent`);
  }
  const canonicalHeaderResponse = await client.get(`/blocks/at/${height}`);
  const headerIdHex = uniqueHeaderId(
    canonicalHeaderResponse.data,
    `isolated genesis ${role} canonical inclusion header`,
  );
  const claimedHeaderIdHex = fixedHex32(
    transaction.headerId ?? transaction.blockId,
    `isolated genesis ${role} claimed inclusion header ID`,
  );
  if (claimedHeaderIdHex !== headerIdHex) {
    throw new Error(
      `isolated genesis ${role} transaction is not in its canonical inclusion header`,
    );
  }
  return Object.freeze({ height, headerIdHex });
}

interface ObservationInputV1 {
  readonly status: 'confirmed' | 'pending' | 'not_found';
  readonly expectedTxId: string;
  readonly observedTxId: string | null;
  readonly confirmations: number;
  readonly observedAtHeight: number;
  readonly confirmationHeight: number | null;
  readonly confirmationHeaderIdHex: string | null;
  readonly targetGenesisHeaderIdHex: string;
}

function createObservation(
  observer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  binding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>,
  input: ObservationInputV1,
): SubstrateFederatedLocalDevnetGenesisConfirmation {
  const observationDigestHex = sha256CanonicalJson({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVER_V1_SCHEMA,
    processBindingDigestHex: binding.processBindingDigestHex,
    reconciliationIdentityDigestHex:
      binding.executionTargetIdentityDigestHex,
    nodeOrigin: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    targetGenesisHeaderIdHex: input.targetGenesisHeaderIdHex,
    expectedTxId: input.expectedTxId,
    observedTxId: input.observedTxId,
    status: input.status,
    confirmations: input.confirmations,
    observedAtHeight: input.observedAtHeight,
    confirmationHeight: input.confirmationHeight,
    confirmationHeaderIdHex: input.confirmationHeaderIdHex,
  }, OBSERVATION_DIGEST_DOMAIN);
  const observerArtifact = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVER_V1_SCHEMA,
    targetGenesisHeaderIdHex: input.targetGenesisHeaderIdHex,
    expectedTxId: input.expectedTxId,
    observationDigestHex,
  });
  ARTIFACTS.set(observerArtifact, Object.freeze({
    observer,
    targetGenesisHeaderIdHex: input.targetGenesisHeaderIdHex,
    expectedTxId: input.expectedTxId,
    observationDigestHex,
  }));
  return Object.freeze({
    status: input.status,
    confirmations: input.confirmations,
    observedAtHeight: input.observedAtHeight,
    observationDigestHex,
    confirmationHeight: input.confirmationHeight,
    confirmationHeaderIdHex: input.confirmationHeaderIdHex,
    observerArtifact,
  });
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function uniqueHeaderId(value: unknown, label: string): string {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error(`${label} must contain exactly one header ID`);
  }
  return fixedHex32(value[0], label);
}

function fixedHex32(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be 32-byte lowercase hexadecimal`);
  }
  const normalized = value.replace(/^0x/iu, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be 32-byte lowercase hexadecimal`);
  }
  return normalized;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function positiveInteger(value: unknown, label: string): number {
  const normalized = nonNegativeInteger(value, label);
  if (normalized === 0) throw new Error(`${label} must be positive`);
  return normalized;
}
