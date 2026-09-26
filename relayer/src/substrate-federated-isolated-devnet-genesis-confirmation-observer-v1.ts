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
const MAX_SEQUENTIAL_REQUEST_WAVES = 5;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVATION_MAX_MS_V1 =
  REQUEST_TIMEOUT_MS * MAX_SEQUENTIAL_REQUEST_WAVES;
const MAX_RESPONSE_BYTES = 256 * 1024;
const OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_V1';
const PROGRESS_REQUEST_TIMEOUT_MS = 2_000;

type ProgressUnavailable = Readonly<{
  status: 'unavailable';
  reason: 'http_error' | 'request_failed' | 'invalid_response';
  httpStatus: number | null;
}>;
type IndexProgress = Readonly<{ status: 'observed'; indexedHeight: number; fullHeight: number }>
  | ProgressUnavailable;
type PoolProgress = Readonly<{ status: 'present' | 'not_found' }> | ProgressUnavailable;
interface NodeProgress {
  readonly index: IndexProgress;
  readonly pool: PoolProgress;
}
interface BoundedNodeProgress extends NodeProgress {
  readonly fullHeightBefore: number;
  readonly fullHeightAfter: number;
}
export interface SubstrateFederatedIsolatedDevnetConfirmationProgressV1 {
  readonly schema: 'e2s.substrate-federated-isolated-devnet-confirmation-progress.v1';
  readonly version: 1;
  readonly expectedErgoTransactionIdHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly targetGenesisHeaderIdHex: string;
  readonly observationSequence: number;
  readonly observedAtUnixMs: number;
  readonly primary: Readonly<BoundedNodeProgress>;
  readonly witness: Readonly<BoundedNodeProgress>;
  readonly diagnosticDigestHex: string;
}
interface ProgressCapture {
  readonly expectedTxId: string;
  sequence: number;
  latest: Readonly<SubstrateFederatedIsolatedDevnetConfirmationProgressV1> | null;
}

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
  readonly progress?: ProgressCapture;
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
  progressTransactionIdHex?: string,
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
  const progress: ProgressCapture | undefined = progressTransactionIdHex === undefined ? undefined : {
    expectedTxId: fixedHex32(progressTransactionIdHex, 'diagnostic Ergo transaction ID'),
    sequence: 0,
    latest: null,
  };
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
      // Clear before any validation can fail; never return an earlier attempt.
      const sequence = progress === undefined ? 0 : ++progress.sequence;
      if (progress !== undefined) progress.latest = null;
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
      const capture = progress?.expectedTxId === expectedTxId;
      const identityBefore = await observeExactTargetIdentity(
        primaryClient,
        witnessClient,
        targetGenesisHeaderIdHex,
      );
      const transactionReads = Promise.all([
        readTransaction(primaryClient, expectedTxId, 'primary'),
        readTransaction(witnessClient, expectedTxId, 'witness'),
      ]);
      let nodeProgress: readonly NodeProgress[] | undefined;
      let transactions: Awaited<typeof transactionReads>;
      if (capture) {
        // Drain optional reads in the existing request wave before propagating
        // a required read failure. No diagnostic IO survives the observe call.
        const [required, optional] = await Promise.allSettled([
          transactionReads,
          Promise.all([
            readNodeProgress(primaryClient, expectedTxId),
            readNodeProgress(witnessClient, expectedTxId),
          ]),
        ]);
        if (required.status === 'rejected') throw required.reason;
        transactions = required.value;
        if (optional.status === 'fulfilled') nodeProgress = optional.value;
      } else {
        transactions = await transactionReads;
      }
      const [primaryTransaction, witnessTransaction] = transactions;
      // Mining may advance between the identity and transaction reads. The
      // second identity bounds each node's reported depth without freezing it.
      const identityAfter = await observeExactTargetIdentity(
        primaryClient,
        witnessClient,
        targetGenesisHeaderIdHex,
      );
      assertNonRegressingIdentity(identityBefore, identityAfter);
      const finish = (observation: SubstrateFederatedLocalDevnetGenesisConfirmation) => {
        if (capture && nodeProgress !== undefined && progress?.sequence === sequence) {
          try {
            assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
              observer, binding.executionTargetIdentityDigestHex,
            );
            const payload = Object.freeze({
              schema: 'e2s.substrate-federated-isolated-devnet-confirmation-progress.v1' as const,
              version: 1 as const,
              expectedErgoTransactionIdHex: expectedTxId,
              executionTargetIdentityDigestHex: binding.executionTargetIdentityDigestHex,
              targetGenesisHeaderIdHex,
              observationSequence: sequence,
              observedAtUnixMs: Date.now(),
              primary: boundNodeProgress(nodeProgress[0]!, identityBefore.primaryHeight, identityAfter.primaryHeight),
              witness: boundNodeProgress(nodeProgress[1]!, identityBefore.witnessHeight, identityAfter.witnessHeight),
            });
            progress.latest = Object.freeze({ ...payload, diagnosticDigestHex: sha256CanonicalJson(
              payload, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONFIRMATION_PROGRESS_V1',
            ) });
          } catch { /* Optional data cannot replace required confirmation behavior. */ }
        }
        return observation;
      };
      if (primaryTransaction === null && witnessTransaction === null) {
        return finish(createObservation(observer, binding, {
          status: 'not_found',
          expectedTxId,
          observedTxId: null,
          confirmations: 0,
          observedAtHeight: identityAfter.observedAtHeight,
          confirmationHeight: null,
          confirmationHeaderIdHex: null,
          targetGenesisHeaderIdHex,
        }));
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
        return finish(createObservation(observer, binding, {
          status: 'pending',
          expectedTxId,
          observedTxId,
          confirmations,
          observedAtHeight: identityAfter.observedAtHeight,
          confirmationHeight: null,
          confirmationHeaderIdHex: null,
          targetGenesisHeaderIdHex,
        }));
      }
      const primaryInclusion = await confirmedInclusion(
        primaryClient,
        primaryTransaction,
        identityBefore.primaryHeight,
        identityAfter.primaryHeight,
        primaryConfirmations,
        'primary',
      );
      const witnessInclusion = await confirmedInclusion(
        witnessClient,
        witnessTransaction,
        identityBefore.witnessHeight,
        identityAfter.witnessHeight,
        witnessConfirmations,
        'witness',
      );
      if (
        primaryInclusion.height !== witnessInclusion.height
        || primaryInclusion.headerIdHex !== witnessInclusion.headerIdHex
      ) {
        throw new Error('isolated genesis canonical inclusion observations disagree');
      }
      const confirmedObservedAtHeight = primaryInclusion.height + confirmations;
      return finish(createObservation(observer, binding, {
        status: 'confirmed',
        expectedTxId,
        observedTxId,
        confirmations,
        observedAtHeight: confirmedObservedAtHeight,
        confirmationHeight: primaryInclusion.height,
        confirmationHeaderIdHex: primaryInclusion.headerIdHex,
        targetGenesisHeaderIdHex,
      }));
    },
  });
  OBSERVERS.set(observer, Object.freeze({
    target,
    binding,
    targetGenesisHeaderIdHex,
    progress,
  }));
  return observer;
}

/** Observation data only; never an artifact accepted by the confirmation consumer. */
export function projectSubstrateFederatedIsolatedDevnetConfirmationProgressV1(
  observer: Readonly<SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1>,
  expectedTxId: string,
  expectedTargetIdentityDigestHex: string,
): Readonly<SubstrateFederatedIsolatedDevnetConfirmationProgressV1> | null {
  try {
    const material = OBSERVERS.get(observer);
    if (material?.progress === undefined || material.progress.expectedTxId !== expectedTxId) return null;
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(observer, expectedTargetIdentityDigestHex);
    const latest = material.progress.latest;
    return latest?.observationSequence === material.progress.sequence ? latest : null;
  } catch { return null; }
}

function unavailable(reason: ProgressUnavailable['reason'], httpStatus: number | null = null): ProgressUnavailable {
  return Object.freeze({ status: 'unavailable', reason, httpStatus });
}

function requestUnavailable(error: unknown): ProgressUnavailable {
  try {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (Number.isInteger(status) && status! >= 100 && status! <= 599) return unavailable('http_error', status!);
    }
  } catch { /* Unavailable diagnostics never propagate an exception accessor. */ }
  return unavailable('request_failed');
}

async function readNodeProgress(client: ReturnType<typeof axios.create>, expectedTxId: string): Promise<NodeProgress> {
  const readIndex = async (): Promise<IndexProgress> => {
    let value: unknown;
    try { value = (await client.get('/blockchain/indexedHeight', { timeout: PROGRESS_REQUEST_TIMEOUT_MS })).data; }
    catch (error) { return requestUnavailable(error); }
    try {
      const row = plainRecord(value, 'index progress');
      const indexedHeight = nonNegativeInteger(row.indexedHeight, 'indexed height');
      const fullHeight = nonNegativeInteger(row.fullHeight, 'index full height');
      if (indexedHeight > fullHeight || fullHeight > 0x7fffffff) return unavailable('invalid_response');
      return Object.freeze({ status: 'observed', indexedHeight, fullHeight });
    } catch { return unavailable('invalid_response'); }
  };
  const readPool = async (): Promise<PoolProgress> => {
    let value: unknown;
    try {
      value = (await client.get(`/transactions/unconfirmed/byTransactionId/${expectedTxId}`,
        { timeout: PROGRESS_REQUEST_TIMEOUT_MS })).data;
    } catch (error) {
      // Pinned ApiResponse maps the endpoint's null pool lookup to HTTP 404.
      // Keep that literal observation distinct from chain absence or invalidity.
      const failure = requestUnavailable(error);
      return failure.reason === 'http_error' && failure.httpStatus === 404
        ? Object.freeze({ status: 'not_found' }) : failure;
    }
    try {
      return plainRecord(value, 'pool transaction').id === expectedTxId
        ? Object.freeze({ status: 'present' }) : unavailable('invalid_response');
    } catch { return unavailable('invalid_response'); }
  };
  const [index, pool] = await Promise.all([readIndex(), readPool()]);
  return Object.freeze({ index, pool });
}

function boundNodeProgress(value: NodeProgress, before: number, after: number): Readonly<BoundedNodeProgress> {
  const index = value.index.status === 'observed'
    && (value.index.fullHeight < before || value.index.fullHeight > after)
    ? unavailable('invalid_response') : value.index;
  return Object.freeze({ fullHeightBefore: before, fullHeightAfter: after, index, pool: value.pool });
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
  fullHeightBefore: number,
  fullHeightAfter: number,
  confirmations: number,
  role: 'primary' | 'witness',
): Promise<Readonly<{ height: number; headerIdHex: string }>> {
  const height = positiveInteger(
    transaction.inclusionHeight,
    `isolated genesis ${role} transaction inclusion height`,
  );
  const confirmationObservationHeight = height + confirmations;
  if (
    confirmationObservationHeight < fullHeightBefore
    || confirmationObservationHeight > fullHeightAfter
  ) {
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

function assertNonRegressingIdentity(
  before: Readonly<{
    primaryHeight: number;
    witnessHeight: number;
  }>,
  after: Readonly<{
    primaryHeight: number;
    witnessHeight: number;
  }>,
): void {
  if (
    after.primaryHeight < before.primaryHeight
    || after.witnessHeight < before.witnessHeight
  ) {
    throw new Error('isolated genesis node height regressed during observation');
  }
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
