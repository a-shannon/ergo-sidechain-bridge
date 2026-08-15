import { createHash } from 'node:crypto';

import { ErgoAddress, Network } from '@fleet-sdk/core';

import {
  getPooledReserveCommitmentProof,
  getPooledReserveEmptyDigest,
  verifyPooledReserveCommitmentInsert,
  verifyPooledReserveCommitmentMembership,
} from './avl-bridge.js';
import {
  AuthenticatedV2VaultReadOnlyNodeClient,
} from './authenticated-v2-vault-read-only-node-client.js';
import {
  verifyErgoBlockTransactionCommitment,
  type ErgoBlockTransactionCommitmentVerification,
} from './adapters/ergo-block-transaction-commitment.js';
import {
  normalizeAuthenticatedSpvTrackerNodeNetwork,
  normalizeRootReadOnlyNodeEndpoint,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  decodeAvlTreeRegisterDigest,
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  decodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
  PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  assertValidityApplicationPooledReserveDepositFinalityV4Candidate,
  buildValidityApplicationPooledReserveDepositFinalityV4,
  type ValidityApplicationPooledReserveDepositFinalityV4Candidate,
  type ValidityApplicationPooledReserveDepositFinalityViewV4,
  type ValidityApplicationPooledReserveDepositObservationQueryV4,
} from './validity-application-pooled-reserve-deposit-finality-v4.js';
import {
  assertValidityApplicationPooledReserveDepositTransitionV4Packet,
  deriveValidityApplicationPooledReserveDepositCommitmentV4Hex,
  type ValidityApplicationPooledReserveDepositTransitionV4Packet,
} from './validity-application-pooled-reserve-deposit-transition-v4.js';
import {
  normalizeEip12Box,
  normalizeErgoTreeHex,
  type Eip12Box,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export const
VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_ERGO_OBSERVATION_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-deposit-ergo-observation.v4' as const;
export const
VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_PRE_MINT_REVALIDATION_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-deposit-pre-mint-revalidation.v4' as const;

const ERGO_READ_ONLY_ADAPTER_REGISTRY_SCHEMA =
  'e2s.validity-application-pooled-reserve-ergo-adapter-registry.v4' as const;
const ERGO_INDEXED_READ_ONLY_ADAPTER_ID =
  'e2s.ergo-indexed-read-only.v1' as const;
const MAX_CANONICAL_HEADER_SEGMENT_LENGTH = 4_096;

export const
VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_ERGO_ADAPTER_REGISTRY_V4 =
  deepFreeze({
    schema: ERGO_READ_ONLY_ADAPTER_REGISTRY_SCHEMA,
    version: 4 as const,
    dynamicRegistrationAllowed: false as const,
    adapters: [{
      adapterId: ERGO_INDEXED_READ_ONLY_ADAPTER_ID,
      implementation:
        'authenticated-v2-vault-read-only-node-client' as const,
      capabilities: [
        'indexed-box-observation',
        'canonical-transaction-observation',
        'transaction-block-membership',
        'cryptographic-transaction-root-verification',
        'header-ancestry-observation',
        'canonical-utxo-observation',
      ] as const,
      check: false as const,
      signing: false as const,
      submission: false as const,
      broadcast: false as const,
      persistence: false as const,
    }] as const,
  });

export interface CreateValidityApplicationPooledReserveDepositErgoSourcePairV4Input {
  readonly environment: string;
  readonly primaryNodeUrl: string;
  readonly primaryNodeIdentityDigestHex: string;
  readonly primaryAdministrationIdentityDigestHex: string;
  readonly witnessNodeUrl: string;
  readonly witnessNodeIdentityDigestHex: string;
  readonly witnessAdministrationIdentityDigestHex: string;
}

export interface ValidityApplicationPooledReserveDepositErgoSourceV4 {
  readonly sourceId: string;
  readonly origin: string;
  readonly nodeIdentityDigestHex: string;
  readonly administrationIdentityDigestHex: string;
}

export interface ValidityApplicationPooledReserveDepositErgoSourcePairV4 {
  readonly schema:
    'e2s.validity-application-pooled-reserve-ergo-source-pair.v4';
  readonly version: 4;
  readonly environment: string;
  readonly adapterId: typeof ERGO_INDEXED_READ_ONLY_ADAPTER_ID;
  readonly primary:
    Readonly<ValidityApplicationPooledReserveDepositErgoSourceV4>;
  readonly witness:
    Readonly<ValidityApplicationPooledReserveDepositErgoSourceV4>;
}

export interface ValidityApplicationPooledReserveDepositErgoObservationV4Candidate {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_ERGO_OBSERVATION_V4_SCHEMA;
  readonly version: 4;
  readonly lineageProfileIdHex: string;
  readonly mintIdentityHex: string;
  readonly adapter: {
    readonly registrySchema: typeof ERGO_READ_ONLY_ADAPTER_REGISTRY_SCHEMA;
    readonly adapterId: typeof ERGO_INDEXED_READ_ONLY_ADAPTER_ID;
    readonly staticRegistrationMatched: true;
    readonly readOnlyCapabilitiesOnly: true;
  };
  readonly finality:
    Readonly<ValidityApplicationPooledReserveDepositFinalityV4Candidate>;
  readonly transactionCommitments: {
    readonly primary: {
      readonly sourceId: string;
      readonly verification:
        Readonly<ErgoBlockTransactionCommitmentVerification>;
    };
    readonly witness: {
      readonly sourceId: string;
      readonly verification:
        Readonly<ErgoBlockTransactionCommitmentVerification>;
    };
  };
  readonly boundaries: {
    readonly transactionObservedInClaimedBlockByBothSources: true;
    readonly blockTransactionCommitmentCryptographicallyVerified: true;
    readonly depositOnlyReserveLineageReconstructedFromCurrentTip: true;
    readonly historicalLineageTransactionFinalityIndependentlyEstablished:
      false;
    readonly localPersistenceConsulted: false;
    readonly immediatePreMintRevalidationRequired: true;
    readonly immediatePreMintRevalidationCompleted: false;
    readonly independentNodeControlEstablished: false;
    readonly localMintEligibilityConditionMet: false;
    readonly mintAuthorized: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

export interface ValidityApplicationPooledReserveDepositPreMintRevalidationV4Candidate {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_PRE_MINT_REVALIDATION_V4_SCHEMA;
  readonly version: 4;
  readonly lineageProfileIdHex: string;
  readonly mintIdentityHex: string;
  readonly priorObservation:
    Readonly<ValidityApplicationPooledReserveDepositErgoObservationV4Candidate>;
  readonly currentObservation:
    Readonly<ValidityApplicationPooledReserveDepositErgoObservationV4Candidate>;
  readonly invariants: {
    readonly sameStaticSourcePairReused: true;
    readonly sameTransitionAndMintIdentity: true;
    readonly sameBlockTransactionCommitments: true;
    readonly inclusionAndFinalityTargetUnchanged: true;
    readonly canonicalTipDidNotMoveBackward: true;
    readonly completeObservationRerun: true;
  };
  readonly boundaries: {
    readonly freshObservationRerunCompleted: true;
    readonly atomicMintAdmissionHandoffEstablished: false;
    readonly localMintEligibilityConditionMet: false;
    readonly mintAuthorized: false;
    readonly localPersistenceConsulted: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

interface SourcePairRuntime {
  readonly primary: AuthenticatedV2VaultReadOnlyNodeClient;
  readonly witness: AuthenticatedV2VaultReadOnlyNodeClient;
}

interface IndexedReserveBox {
  readonly raw: Record<string, unknown>;
  readonly box: Eip12Box;
  readonly inclusionHeight: number;
  readonly spentTransactionIdHex: string | null;
  readonly spendingExtension: Readonly<Record<string, string>> | null;
}

interface NormalizedHeader {
  readonly height: number;
  readonly headerIdHex: string;
  readonly parentHeaderIdHex: string;
}

interface SyncedSnapshot {
  readonly indexedHeight: number;
  readonly fullHeight: number;
  readonly bestHeader: NormalizedHeader;
}

interface CanonicalSignedTransaction {
  readonly idHex: string;
  readonly canonical: Readonly<Record<string, unknown>>;
  readonly sigmaDigestHex: string;
  readonly inclusionHeight: number | null;
  readonly inclusionHeaderIdHex: string | null;
}

const sourcePairRuntimes =
  new WeakMap<object, Readonly<SourcePairRuntime>>();
const sourcePairCandidates = new WeakSet<object>();
const observationCandidates = new WeakSet<object>();
const observationBindings = new WeakMap<object, {
  readonly sourcePair:
    Readonly<ValidityApplicationPooledReserveDepositErgoSourcePairV4>;
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  readonly depositTransition:
    Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>;
}>();
const revalidationCandidates = new WeakSet<object>();

export function createValidityApplicationPooledReserveDepositErgoSourcePairV4(
  input: CreateValidityApplicationPooledReserveDepositErgoSourcePairV4Input,
): Readonly<ValidityApplicationPooledReserveDepositErgoSourcePairV4> {
  assertExactObject(input, [
    'environment',
    'primaryNodeUrl',
    'primaryNodeIdentityDigestHex',
    'primaryAdministrationIdentityDigestHex',
    'witnessNodeUrl',
    'witnessNodeIdentityDigestHex',
    'witnessAdministrationIdentityDigestHex',
  ], 'pooled-reserve Ergo source-pair input');
  const environment = normalizeAuthenticatedSpvTrackerNodeNetwork(
    input.environment,
    'pooled-reserve Ergo source-pair environment',
  );
  const primaryOrigin = normalizeRootReadOnlyNodeEndpoint(
    input.primaryNodeUrl,
    'primary pooled-reserve Ergo node URL',
  );
  const witnessOrigin = normalizeRootReadOnlyNodeEndpoint(
    input.witnessNodeUrl,
    'witness pooled-reserve Ergo node URL',
  );
  if (primaryOrigin === witnessOrigin) {
    throw new Error('pooled-reserve observation requires distinct Ergo node origins');
  }
  const primaryNodeIdentityDigestHex = fixedHex(
    input.primaryNodeIdentityDigestHex,
    32,
    'primary Ergo node identity digest',
  );
  const witnessNodeIdentityDigestHex = fixedHex(
    input.witnessNodeIdentityDigestHex,
    32,
    'witness Ergo node identity digest',
  );
  if (primaryNodeIdentityDigestHex === witnessNodeIdentityDigestHex) {
    throw new Error('pooled-reserve observation requires distinct node identities');
  }
  const primaryAdministrationIdentityDigestHex = fixedHex(
    input.primaryAdministrationIdentityDigestHex,
    32,
    'primary Ergo node administration identity digest',
  );
  const witnessAdministrationIdentityDigestHex = fixedHex(
    input.witnessAdministrationIdentityDigestHex,
    32,
    'witness Ergo node administration identity digest',
  );
  if (
    primaryAdministrationIdentityDigestHex
      === witnessAdministrationIdentityDigestHex
  ) {
    throw new Error(
      'pooled-reserve observation requires distinct administration identities',
    );
  }
  const source = (
    origin: string,
    nodeIdentityDigestHex: string,
    administrationIdentityDigestHex: string,
  ) => deepFreeze({
    sourceId: createHash('sha256')
      .update('E2S_POOLED_RESERVE_ERGO_SOURCE_V4\0', 'ascii')
      .update(ERGO_INDEXED_READ_ONLY_ADAPTER_ID, 'ascii')
      .update('\0', 'ascii')
      .update(origin, 'utf8')
      .update('\0', 'ascii')
      .update(nodeIdentityDigestHex, 'ascii')
      .update('\0', 'ascii')
      .update(administrationIdentityDigestHex, 'ascii')
      .digest('hex'),
    origin,
    nodeIdentityDigestHex,
    administrationIdentityDigestHex,
  });
  const candidate = deepFreeze({
    schema:
      'e2s.validity-application-pooled-reserve-ergo-source-pair.v4' as const,
    version: 4 as const,
    environment,
    adapterId: ERGO_INDEXED_READ_ONLY_ADAPTER_ID,
    primary: source(
      primaryOrigin,
      primaryNodeIdentityDigestHex,
      primaryAdministrationIdentityDigestHex,
    ),
    witness: source(
      witnessOrigin,
      witnessNodeIdentityDigestHex,
      witnessAdministrationIdentityDigestHex,
    ),
  });
  sourcePairRuntimes.set(candidate, Object.freeze({
    primary: new AuthenticatedV2VaultReadOnlyNodeClient(primaryOrigin),
    witness: new AuthenticatedV2VaultReadOnlyNodeClient(witnessOrigin),
  }));
  sourcePairCandidates.add(candidate);
  return candidate;
}

export async function observeValidityApplicationPooledReserveDepositOnErgoV4(
  input: {
    readonly compiledInstance:
      Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
    readonly depositTransition:
      Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>;
    readonly sourcePair:
      Readonly<ValidityApplicationPooledReserveDepositErgoSourcePairV4>;
  },
): Promise<
  Readonly<ValidityApplicationPooledReserveDepositErgoObservationV4Candidate>
> {
  assertExactObject(input, [
    'compiledInstance',
    'depositTransition',
    'sourcePair',
  ], 'pooled-reserve concrete Ergo observation input');
  const { compiledInstance, depositTransition, sourcePair } = input;
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
    compiledInstance,
  );
  assertValidityApplicationPooledReserveDepositTransitionV4Packet(
    depositTransition,
  );
  const runtime = assertSourcePair(sourcePair);
  const commitmentReceipts =
    new Map<string, Readonly<ErgoBlockTransactionCommitmentVerification>>();
  if (
    compiledInstance.lineageProfileIdHex
      !== depositTransition.lineageProfileIdHex
  ) {
    throw new Error(
      'pooled-reserve concrete observation profile does not match transition',
    );
  }

  const observationSources = [
    createObservationPort(
      sourcePair.primary,
      runtime.primary,
      sourcePair.environment,
      compiledInstance,
      depositTransition,
      verification => commitmentReceipts.set(
        sourcePair.primary.sourceId,
        verification,
      ),
    ),
    createObservationPort(
      sourcePair.witness,
      runtime.witness,
      sourcePair.environment,
      compiledInstance,
      depositTransition,
      verification => commitmentReceipts.set(
        sourcePair.witness.sourceId,
        verification,
      ),
    ),
  ] as const;
  const finality =
    await buildValidityApplicationPooledReserveDepositFinalityV4({
      compiledInstance,
      depositTransition,
      observationSources,
    });
  assertValidityApplicationPooledReserveDepositFinalityV4Candidate(finality);
  const primaryCommitment = commitmentReceipts.get(sourcePair.primary.sourceId);
  const witnessCommitment = commitmentReceipts.get(sourcePair.witness.sourceId);
  if (primaryCommitment === undefined || witnessCommitment === undefined) {
    throw new Error(
      'pooled-reserve observation did not retain both transaction commitment receipts',
    );
  }
  if (canonicalJson(primaryCommitment) !== canonicalJson(witnessCommitment)) {
    throw new Error(
      'pooled-reserve observation sources disagree on the exact transaction commitment receipt',
    );
  }
  const result = deepFreeze({
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_ERGO_OBSERVATION_V4_SCHEMA,
    version: 4 as const,
    lineageProfileIdHex: compiledInstance.lineageProfileIdHex,
    mintIdentityHex: finality.mintIdentityHex,
    adapter: {
      registrySchema:
        VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_ERGO_ADAPTER_REGISTRY_V4
          .schema,
      adapterId: sourcePair.adapterId,
      staticRegistrationMatched: true as const,
      readOnlyCapabilitiesOnly: true as const,
    },
    finality,
    transactionCommitments: {
      primary: {
        sourceId: sourcePair.primary.sourceId,
        verification: primaryCommitment,
      },
      witness: {
        sourceId: sourcePair.witness.sourceId,
        verification: witnessCommitment,
      },
    },
    boundaries: {
      transactionObservedInClaimedBlockByBothSources: true as const,
      blockTransactionCommitmentCryptographicallyVerified: true as const,
      depositOnlyReserveLineageReconstructedFromCurrentTip: true as const,
      historicalLineageTransactionFinalityIndependentlyEstablished:
        false as const,
      localPersistenceConsulted: false as const,
      immediatePreMintRevalidationRequired: true as const,
      immediatePreMintRevalidationCompleted: false as const,
      independentNodeControlEstablished: false as const,
      localMintEligibilityConditionMet: false as const,
      mintAuthorized: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
  observationCandidates.add(result);
  observationBindings.set(result, {
    sourcePair,
    compiledInstance,
    depositTransition,
  });
  return result;
}

/**
 * Produces fresh, non-authorizing evidence. AF-4C mint admission must call this
 * internally and must never accept a caller-supplied result as authority.
 */
export async function
revalidateValidityApplicationPooledReserveDepositBeforeMintV4(
  input: {
    readonly compiledInstance:
      Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
    readonly depositTransition:
      Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>;
    readonly sourcePair:
      Readonly<ValidityApplicationPooledReserveDepositErgoSourcePairV4>;
    readonly priorObservation:
      Readonly<ValidityApplicationPooledReserveDepositErgoObservationV4Candidate>;
  },
): Promise<
  Readonly<
    ValidityApplicationPooledReserveDepositPreMintRevalidationV4Candidate
  >
> {
  assertExactObject(input, [
    'compiledInstance',
    'depositTransition',
    'sourcePair',
    'priorObservation',
  ], 'pooled-reserve pre-mint revalidation input');
  assertValidityApplicationPooledReserveDepositErgoObservationV4Candidate(
    input.priorObservation,
  );
  const binding = observationBindings.get(input.priorObservation);
  if (
    binding === undefined
    || binding.sourcePair !== input.sourcePair
    || binding.compiledInstance !== input.compiledInstance
    || binding.depositTransition !== input.depositTransition
  ) {
    throw new Error(
      'pre-mint revalidation requires the same statically registered source pair, compiled instance, and transition',
    );
  }
  const currentObservation =
    await observeValidityApplicationPooledReserveDepositOnErgoV4({
      compiledInstance: input.compiledInstance,
      depositTransition: input.depositTransition,
      sourcePair: input.sourcePair,
    });
  const prior = input.priorObservation.finality;
  const current = currentObservation.finality;
  if (
    current.mintIdentityHex !== prior.mintIdentityHex
    || current.transitionTxIdHex !== prior.transitionTxIdHex
    || current.sourceLockBoxIdHex !== prior.sourceLockBoxIdHex
    || current.depositCommitmentHex !== prior.depositCommitmentHex
  ) {
    throw new Error('pre-mint revalidation changed the transition or mint identity');
  }
  if (
    canonicalJson(currentObservation.transactionCommitments)
      !== canonicalJson(input.priorObservation.transactionCommitments)
  ) {
    throw new Error(
      'pre-mint revalidation changed the exact block transaction commitments',
    );
  }
  if (
    current.finality.inclusionHeight !== prior.finality.inclusionHeight
    || current.finality.inclusionHeaderIdHex
      !== prior.finality.inclusionHeaderIdHex
    || current.finality.targetHeight !== prior.finality.targetHeight
    || current.finality.targetHeaderIdHex
      !== prior.finality.targetHeaderIdHex
  ) {
    throw new Error(
      'pre-mint revalidation changed the inclusion or finality target',
    );
  }
  if (
    current.finality.currentCanonicalTipHeight
      < prior.finality.currentCanonicalTipHeight
    || (
      current.finality.currentCanonicalTipHeight
        === prior.finality.currentCanonicalTipHeight
      && current.finality.currentCanonicalTipHeaderIdHex
        !== prior.finality.currentCanonicalTipHeaderIdHex
    )
  ) {
    throw new Error('pre-mint revalidation canonical tip moved backward');
  }
  const result = deepFreeze({
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_PRE_MINT_REVALIDATION_V4_SCHEMA,
    version: 4 as const,
    lineageProfileIdHex: current.lineageProfileIdHex,
    mintIdentityHex: current.mintIdentityHex,
    priorObservation: input.priorObservation,
    currentObservation,
    invariants: {
      sameStaticSourcePairReused: true as const,
      sameTransitionAndMintIdentity: true as const,
      sameBlockTransactionCommitments: true as const,
      inclusionAndFinalityTargetUnchanged: true as const,
      canonicalTipDidNotMoveBackward: true as const,
      completeObservationRerun: true as const,
    },
    boundaries: {
      freshObservationRerunCompleted: true as const,
      atomicMintAdmissionHandoffEstablished: false as const,
      localMintEligibilityConditionMet: false as const,
      mintAuthorized: false as const,
      localPersistenceConsulted: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
  revalidationCandidates.add(result);
  return result;
}

export function
assertValidityApplicationPooledReserveDepositErgoObservationV4Candidate(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveDepositErgoObservationV4Candidate
> {
  if (
    value === null
    || typeof value !== 'object'
    || !observationCandidates.has(value)
  ) {
    throw new Error(
      'pooled-reserve concrete Ergo observation was not built in this process',
    );
  }
}

export function
assertValidityApplicationPooledReserveDepositPreMintRevalidationV4Candidate(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveDepositPreMintRevalidationV4Candidate
> {
  if (
    value === null
    || typeof value !== 'object'
    || !revalidationCandidates.has(value)
  ) {
    throw new Error(
      'pooled-reserve pre-mint revalidation was not built in this process',
    );
  }
}

function createObservationPort(
  source:
    Readonly<ValidityApplicationPooledReserveDepositErgoSourceV4>,
  client: AuthenticatedV2VaultReadOnlyNodeClient,
  environment: string,
  compiled:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  transition:
    Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>,
  retainTransactionCommitment: (
    verification: Readonly<ErgoBlockTransactionCommitmentVerification>,
  ) => void,
) {
  return Object.freeze({
    sourceId: source.sourceId,
    origin: source.origin,
    readCanonicalDepositView: (
      query:
        Readonly<ValidityApplicationPooledReserveDepositObservationQueryV4>,
    ) => readCanonicalDepositView(
      client,
      environment,
      compiled,
      transition,
      query,
      retainTransactionCommitment,
    ),
  });
}

async function readCanonicalDepositView(
  client: AuthenticatedV2VaultReadOnlyNodeClient,
  environment: string,
  compiled:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  transition:
    Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>,
  query: Readonly<ValidityApplicationPooledReserveDepositObservationQueryV4>,
  retainTransactionCommitment: (
    verification: Readonly<ErgoBlockTransactionCommitmentVerification>,
  ) => void,
): Promise<Readonly<ValidityApplicationPooledReserveDepositFinalityViewV4>> {
  assertExactQuery(query, transition);
  client.beginAuthenticatedTrackerReconstruction();
  try {
    const before = await captureStableSnapshot(client, environment);
    const observedTransaction = await normalizeSignedTransaction(
      await client.getTransaction(query.transitionTxIdHex),
      query.transitionTxIdHex,
      'indexed pooled-reserve transition',
      true,
    );
    assertSignedTransactionMatchesMaterialized(
      observedTransaction,
      transition.transactions.reserveTransition,
      'indexed pooled-reserve transition',
    );
    const inclusionHeight = observedTransaction.inclusionHeight!;
    const inclusionHeaderIdHex = observedTransaction.inclusionHeaderIdHex!;
    const claimedBlock = await assertTransactionInClaimedBlock(
      client,
      observedTransaction,
      inclusionHeaderIdHex,
      inclusionHeight,
    );
    retainTransactionCommitment(claimedBlock.verification);
    const canonicalHeaders = await readCanonicalHeaderSegment(
      client,
      before.bestHeader,
      inclusionHeaderIdHex,
      inclusionHeight,
    );
    if (
      canonicalJson(claimedBlock.header) !== canonicalJson(canonicalHeaders[0])
    ) {
      throw new Error(
        'claimed inclusion block header disagrees with canonical ancestry',
      );
    }
    const requiredDepth = positiveSafeInteger(
      Number(compiled.ergoDepositFinalityPolicy.requiredSuccessorDepth),
      'pooled-reserve required successor depth',
    );
    const target = canonicalHeaders[requiredDepth];
    if (target === undefined) {
      throw new Error(
        'pooled-reserve transition has insufficient canonical successor depth',
      );
    }
    const reserveState = await reconstructReserveState(
      client,
      compiled,
      transition,
      query,
    );
    const after = await captureStableSnapshot(client, environment);
    assertSameSnapshot(before, after);
    return deepFreeze({
      transaction: transition.transactions.reserveTransition,
      inclusion: {
        height: inclusionHeight,
        headerIdHex: inclusionHeaderIdHex,
      },
      canonicalHeaders,
      canonicalTarget: {
        height: target.height,
        headerIdHex: target.headerIdHex,
      },
      currentTip: {
        height: before.bestHeader.height,
        headerIdHex: before.bestHeader.headerIdHex,
      },
      reserveState,
    });
  } finally {
    client.endAuthenticatedTrackerReconstruction();
  }
}

async function captureStableSnapshot(
  client: AuthenticatedV2VaultReadOnlyNodeClient,
  expectedEnvironment: string,
): Promise<SyncedSnapshot> {
  const [infoValue, progressValue, bestHeaderValue] = await Promise.all([
    client.getInfo(),
    client.getIndexedHeight(),
    client.getBestHeader(),
  ]);
  const info = record(infoValue, 'Ergo node info');
  const network = normalizeAuthenticatedSpvTrackerNodeNetwork(
    info.network ?? info.networkType,
    'observed Ergo node',
  );
  if (network !== expectedEnvironment) {
    throw new Error(
      `observed Ergo node network ${network} does not match ${expectedEnvironment}`,
    );
  }
  const progress = record(progressValue, 'Ergo indexed-height response');
  const indexedHeight = nonnegativeSafeInteger(
    progress.indexedHeight,
    'Ergo indexed height',
  );
  const fullHeight = nonnegativeSafeInteger(
    progress.fullHeight,
    'Ergo full height',
  );
  if (indexedHeight !== fullHeight) {
    throw new Error('Ergo extra index is not synchronized with full height');
  }
  const bestHeader = normalizeHeader(bestHeaderValue, 'Ergo best header');
  if (bestHeader.height !== fullHeight) {
    throw new Error('Ergo best header does not match indexed full height');
  }
  return { indexedHeight, fullHeight, bestHeader };
}

async function assertTransactionInClaimedBlock(
  client: AuthenticatedV2VaultReadOnlyNodeClient,
  indexed: CanonicalSignedTransaction,
  inclusionHeaderIdHex: string,
  inclusionHeight: number,
): Promise<{
  readonly header: NormalizedHeader;
  readonly verification: Readonly<ErgoBlockTransactionCommitmentVerification>;
}> {
  const blockValue = await client.getBlockByHeaderId(inclusionHeaderIdHex);
  if (blockValue === null) {
    throw new Error('claimed inclusion block is unavailable');
  }
  const block = record(blockValue, 'claimed inclusion block');
  const header = normalizeHeader(block.header, 'claimed inclusion block header');
  const verification = await verifyErgoBlockTransactionCommitment({
    block,
    expectedHeaderIdHex: inclusionHeaderIdHex,
    expectedHeight: inclusionHeight,
    expectedTransactionIdHex: indexed.idHex,
    expectedTransaction: {
      ...indexed.canonical,
      id: indexed.idHex,
    },
  });
  return { header, verification };
}

async function readCanonicalHeaderSegment(
  client: AuthenticatedV2VaultReadOnlyNodeClient,
  tip: NormalizedHeader,
  inclusionHeaderIdHex: string,
  inclusionHeight: number,
): Promise<readonly Readonly<NormalizedHeader>[]> {
  if (tip.height < inclusionHeight) {
    throw new Error('canonical tip predates pooled-reserve transition');
  }
  const count = tip.height - inclusionHeight + 1;
  if (count > MAX_CANONICAL_HEADER_SEGMENT_LENGTH) {
    throw new Error(
      `pooled-reserve header ancestry exceeds ${MAX_CANONICAL_HEADER_SEGMENT_LENGTH} headers`,
    );
  }
  const reverse: NormalizedHeader[] = [];
  let cursor = tip;
  for (;;) {
    reverse.push(cursor);
    if (cursor.height === inclusionHeight) break;
    const parent = await client.getBlockHeaderById(cursor.parentHeaderIdHex);
    if (parent === null) {
      throw new Error('pooled-reserve canonical header ancestry is unavailable');
    }
    const normalized = normalizeHeader(parent, 'pooled-reserve parent header');
    if (
      normalized.headerIdHex !== cursor.parentHeaderIdHex
      || normalized.height !== cursor.height - 1
    ) {
      throw new Error('pooled-reserve canonical header ancestry is not direct');
    }
    cursor = normalized;
  }
  if (cursor.headerIdHex !== inclusionHeaderIdHex) {
    throw new Error('pooled-reserve transition is not on canonical header ancestry');
  }
  return deepFreeze(reverse.reverse());
}

async function reconstructReserveState(
  client: AuthenticatedV2VaultReadOnlyNodeClient,
  compiled:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  transition:
    Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>,
  query: Readonly<ValidityApplicationPooledReserveDepositObservationQueryV4>,
): Promise<{
  readonly sourceLock: null;
  readonly reservePredecessor: null;
  readonly canonicalReserveTip: Eip12Box;
  readonly depositMembershipProofHex: string;
}> {
  const nftIdHex = fixedHex(
    compiled.genesis.settlementVaultNftIdHex,
    32,
    'pooled-reserve singleton NFT ID',
  );
  const rawReserveBoxes = await client.getIndexedBoxesByTokenId(nftIdHex);
  if (rawReserveBoxes.length === 0) {
    throw new Error('pooled-reserve indexed singleton lineage is empty');
  }
  const reserveBoxes = await Promise.all(rawReserveBoxes.map(
    (value, index) => normalizeIndexedReserveBox(
      value,
      index,
      compiled,
      nftIdHex,
    ),
  ));
  const ordered = orderReserveLineage(reserveBoxes);
  const sourceAddress = ErgoAddress.fromErgoTree(
    compiled.contracts.sourceLock.receipt.propositionHex,
    Network.Testnet,
  ).toString();
  const rawSources = await client.getIndexedBoxesByAddress(sourceAddress);
  const sources = new Map<string, IndexedReserveBox>();
  for (let index = 0; index < rawSources.length; index += 1) {
    const source = await normalizeIndexedSourceBox(
      rawSources[index],
      index,
      compiled,
    );
    if (sources.has(source.box.boxId)) {
      throw new Error(`duplicate source-lock history box ${source.box.boxId}`);
    }
    sources.set(source.box.boxId, source);
  }

  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  const history: Array<{ key: string; value: string }> = [];
  let expectedDigest = getPooledReserveEmptyDigest();
  let expectedLiability = 0n;
  const root = ordered[0];
  if (
    root.box.additionalRegisters.R5
      !== encodeAvlTreeRegister(
        Buffer.from(expectedDigest, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
      )
    || decodeCanonicalLongRegister(
      root.box.additionalRegisters.R6,
      'pooled-reserve root liability',
    ) !== 0n
  ) {
    throw new Error('pooled-reserve root is not the reviewed empty reserve');
  }
  await assertReserveIssuanceTransaction(client, root, nftIdHex);
  const protectedSeed = BigInt(root.box.value);

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const predecessor = ordered[index];
    const successor = ordered[index + 1];
    const spendingTxId = predecessor.spentTransactionIdHex;
    if (
      spendingTxId === null
      || successor.box.transactionId !== spendingTxId
      || successor.box.index !== 0
    ) {
      throw new Error('pooled-reserve singleton successor linkage drifted');
    }
    const transaction = await normalizeSignedTransaction(
      await client.getTransaction(spendingTxId),
      spendingTxId,
      `pooled-reserve lineage transaction ${index}`,
      true,
    );
    if (transaction.inclusionHeight !== successor.inclusionHeight) {
      throw new Error(
        'pooled-reserve lineage transaction and successor inclusion heights disagree',
      );
    }
    await assertTransactionInClaimedBlock(
      client,
      transaction,
      transaction.inclusionHeaderIdHex!,
      transaction.inclusionHeight,
    );
    const tx = transaction.canonical;
    const inputs = array(tx.inputs, 'pooled-reserve lineage transaction inputs');
    const dataInputs = array(
      tx.dataInputs,
      'pooled-reserve lineage transaction data inputs',
    );
    const outputs = array(
      tx.outputs,
      'pooled-reserve lineage transaction outputs',
    );
    if (inputs.length !== 3 || dataInputs.length !== 0 || outputs.length !== 2) {
      throw new Error(
        'unsupported pooled-reserve transition before AF-4C burn settlement',
      );
    }
    assertInputId(inputs[0], predecessor.box.boxId, 'pooled-reserve input 0');
    const sourceId = inputId(inputs[1], 'pooled-reserve source input');
    const feeInputId = inputId(inputs[2], 'pooled-reserve fee input');
    const source = sources.get(sourceId);
    if (
      source === undefined
      || source.spentTransactionIdHex !== spendingTxId
    ) {
      throw new Error(
        `source-lock history omits deposit source ${sourceId}`,
      );
    }
    const extension = inputExtension(
      inputs[0],
      'pooled-reserve predecessor input extension',
    );
    if (
      Object.keys(extension).length !== 1
      || extension['0'] === undefined
      || Object.keys(inputExtension(
        inputs[1],
        'pooled-reserve source input extension',
      )).length !== 0
      || Object.keys(inputExtension(
        inputs[2],
        'pooled-reserve fee input extension',
      )).length !== 0
    ) {
      throw new Error('pooled-reserve deposit input extensions drifted');
    }
    if (
      canonicalJson(predecessor.spendingExtension) !== canonicalJson(extension)
      || canonicalJson(source.spendingExtension)
        !== canonicalJson(inputExtension(
          inputs[1],
          'pooled-reserve source input extension',
        ))
    ) {
      throw new Error(
        'pooled-reserve indexed spending extensions disagree with transaction',
      );
    }
    const insertProofHex = decodeCollByteRegister(
      extension['0'],
      'pooled-reserve deposit insert proof',
    );
    const intentHex = decodeCollByteRegister(
      source.box.additionalRegisters.R4,
      'pooled-reserve source intent',
    );
    assertSourceIntentBindings(
      decodePegInSourceIntentV2Hex(`0x${intentHex}`),
      profile,
      compiled.lineageProfileIdHex,
      source.box,
    );
    const commitment =
      deriveValidityApplicationPooledReserveDepositCommitmentV4Hex({
        lineageProfileIdHex: compiled.lineageProfileIdHex,
        sourceLockBoxIdHex: source.box.boxId,
        sourceIntentHex: intentHex,
      });
    const nextDigest = verifyPooledReserveCommitmentInsert(
      expectedDigest,
      source.box.boxId,
      commitment,
      insertProofHex,
    );
    expectedLiability += BigInt(source.box.value);
    if (
      decodeAvlTreeRegisterDigest(
        successor.box.additionalRegisters.R5,
        'pooled-reserve successor digest',
      ) !== nextDigest
      || decodeCanonicalLongRegister(
        successor.box.additionalRegisters.R6,
        'pooled-reserve successor liability',
      ) !== expectedLiability
      || BigInt(successor.box.value) - expectedLiability !== protectedSeed
    ) {
      throw new Error(
        'pooled-reserve successor does not preserve deposit conservation',
      );
    }
    await assertTransactionOutput(
      outputs[0],
      successor.box,
      'pooled-reserve successor output',
    );
    assertFeeOutput(outputs[1], 'pooled-reserve deposit fee output');
    await assertValueNeutralFeeFunding(
      client,
      source,
      feeInputId,
      outputs[1],
    );
    history.push({ key: source.box.boxId, value: commitment });
    expectedDigest = nextDigest;
  }
  const tip = ordered[ordered.length - 1];
  if (
    tip.spentTransactionIdHex !== null
    || decodeAvlTreeRegisterDigest(
      tip.box.additionalRegisters.R5,
      'pooled-reserve current tip digest',
    ) !== expectedDigest
  ) {
    throw new Error('pooled-reserve current tip does not close reconstructed history');
  }
  const canonicalTip = await canonicalUnspentBox(
    client,
    tip.box.boxId,
    'pooled-reserve tip canonical UTXO',
  );
  if (
    canonicalJson(canonicalTip) !== canonicalJson(tip.box)
  ) {
    throw new Error('pooled-reserve tip canonical UTXO disagrees with index');
  }
  if (
    await client.getBoxByIdOrNull(query.sourceLockBoxIdHex) !== null
  ) {
    throw new Error('pooled-reserve source lock is still unspent');
  }
  if (
    await client.getBoxByIdOrNull(query.reservePredecessorBoxIdHex) !== null
  ) {
    throw new Error('pooled-reserve reserve predecessor is still unspent');
  }
  const targetHistory = history.find(entry =>
    entry.key === query.sourceLockBoxIdHex
  );
  if (
    targetHistory === undefined
    || targetHistory.value !== transition.depositCommitmentHex
    || transition.boxes.reserveSuccessor.boxId
      !== query.reserveSuccessorBoxIdHex
    || !ordered.some(box =>
      box.box.boxId === query.reserveSuccessorBoxIdHex
      && box.box.transactionId === query.transitionTxIdHex
    )
  ) {
    throw new Error(
      'pooled-reserve reconstructed lineage does not contain the queried deposit',
    );
  }
  const proof = getPooledReserveCommitmentProof(
    history,
    query.sourceLockBoxIdHex,
  );
  const verified = verifyPooledReserveCommitmentMembership(
    expectedDigest,
    query.sourceLockBoxIdHex,
    transition.depositCommitmentHex,
    proof.get_proof_hex,
  );
  if (
    verified.digest_hex !== expectedDigest
    || verified.value_hex !== transition.depositCommitmentHex
  ) {
    throw new Error('pooled-reserve deposit membership proof did not verify');
  }
  return deepFreeze({
    sourceLock: null,
    reservePredecessor: null,
    canonicalReserveTip: canonicalTip,
    depositMembershipProofHex: proof.get_proof_hex,
  });
}

async function normalizeIndexedReserveBox(
  value: unknown,
  index: number,
  compiled:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  nftIdHex: string,
): Promise<IndexedReserveBox> {
  const label = `indexed pooled-reserve box ${index}`;
  const raw = record(value, label);
  const box = await normalizeIndexedBoxPayload(raw, label);
  if (
    box.index !== 0
    || box.ergoTree
      !== compiled.contracts.pooledReserve.receipt.propositionHex
    || box.assets.length !== 1
    || box.assets[0].tokenId !== nftIdHex
    || box.assets[0].amount !== '1'
    || Object.keys(box.additionalRegisters).sort().join(',') !== 'R4,R5,R6'
    || decodeCollByteRegister(
      box.additionalRegisters.R4,
      `${label} lineage profile`,
    ) !== fixedHex(
      compiled.lineageProfileIdHex,
      32,
      `${label} expected lineage profile`,
    )
  ) {
    throw new Error(`${label} is not the exact configured reserve singleton`);
  }
  const digest = decodeAvlTreeRegisterDigest(
    box.additionalRegisters.R5,
    `${label} deposit-state digest`,
  );
  if (
    box.additionalRegisters.R5
      !== encodeAvlTreeRegister(
        Buffer.from(digest, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
      )
  ) {
    throw new Error(`${label} has a non-canonical deposit-state AVL shape`);
  }
  const liability = decodeCanonicalLongRegister(
    box.additionalRegisters.R6,
    `${label} liability`,
  );
  if (liability < 0n || liability > BigInt(box.value)) {
    throw new Error(`${label} has invalid reserve liability`);
  }
  return indexedBoxMetadata(raw, box, label);
}

async function normalizeIndexedSourceBox(
  value: unknown,
  index: number,
  compiled:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
): Promise<IndexedReserveBox> {
  const label = `indexed pooled-reserve source-lock box ${index}`;
  const raw = record(value, label);
  const box = await normalizeIndexedBoxPayload(raw, label);
  if (
    box.ergoTree !== compiled.contracts.sourceLock.receipt.propositionHex
    || box.assets.length !== 0
    || Object.keys(box.additionalRegisters).sort().join(',') !== 'R4,R5'
  ) {
    throw new Error(`${label} is not an exact configured source lock`);
  }
  decodeCollByteRegister(box.additionalRegisters.R4, `${label} source intent`);
  await normalizeErgoTreeHex(
    decodeCollByteRegister(box.additionalRegisters.R5, `${label} refund tree`),
    `${label} refund tree`,
  );
  return indexedBoxMetadata(raw, box, label);
}

async function normalizeIndexedBoxPayload(
  raw: Record<string, unknown>,
  label: string,
): Promise<Eip12Box> {
  return normalizeEip12Box({
    boxId: raw.boxId,
    value: raw.value,
    ergoTree: raw.ergoTree,
    assets: raw.assets,
    additionalRegisters: raw.additionalRegisters,
    creationHeight: raw.creationHeight,
    transactionId: raw.transactionId,
    index: raw.index,
  }, label);
}

function indexedBoxMetadata(
  raw: Record<string, unknown>,
  box: Eip12Box,
  label: string,
): IndexedReserveBox {
  const inclusionHeight = nonnegativeSafeInteger(
    raw.inclusionHeight,
    `${label} inclusion height`,
  );
  const spentTransactionIdHex =
    raw.spentTransactionId === null
      || raw.spentTransactionId === undefined
      ? null
      : fixedHex(
        raw.spentTransactionId,
        32,
        `${label} spending transaction ID`,
      );
  if (spentTransactionIdHex === null) {
    if (raw.spendingProof !== null && raw.spendingProof !== undefined) {
      throw new Error(`${label} is unspent but exposes a spending proof`);
    }
    return {
      raw,
      box,
      inclusionHeight,
      spentTransactionIdHex,
      spendingExtension: null,
    };
  }
  const proof = record(raw.spendingProof, `${label} spending proof`);
  const spendingExtension = normalizeExtension(
    proof.extension,
    `${label} spending extension`,
  );
  return {
    raw,
    box,
    inclusionHeight,
    spentTransactionIdHex,
    spendingExtension,
  };
}

function orderReserveLineage(
  boxes: readonly IndexedReserveBox[],
): readonly IndexedReserveBox[] {
  const byBoxId = new Map<string, IndexedReserveBox>();
  const byCreationTx = new Map<string, IndexedReserveBox>();
  for (const box of boxes) {
    if (byBoxId.has(box.box.boxId)) {
      throw new Error(`duplicate pooled-reserve box ${box.box.boxId}`);
    }
    if (byCreationTx.has(box.box.transactionId)) {
      throw new Error(
        `multiple reserve singleton outputs from ${box.box.transactionId}`,
      );
    }
    byBoxId.set(box.box.boxId, box);
    byCreationTx.set(box.box.transactionId, box);
  }
  const predecessorCount = new Map<string, number>();
  for (const box of boxes) {
    if (box.spentTransactionIdHex === null) continue;
    const successor = byCreationTx.get(box.spentTransactionIdHex);
    if (successor === undefined) {
      throw new Error(
        `pooled-reserve successor ${box.spentTransactionIdHex} is missing`,
      );
    }
    predecessorCount.set(
      successor.box.boxId,
      (predecessorCount.get(successor.box.boxId) ?? 0) + 1,
    );
  }
  const roots = boxes.filter(box =>
    (predecessorCount.get(box.box.boxId) ?? 0) === 0
  );
  const tips = boxes.filter(box => box.spentTransactionIdHex === null);
  if (roots.length !== 1 || tips.length !== 1) {
    throw new Error(
      'pooled-reserve singleton lineage requires one root and one unspent tip',
    );
  }
  const ordered: IndexedReserveBox[] = [];
  const visited = new Set<string>();
  let cursor: IndexedReserveBox | undefined = roots[0];
  while (cursor !== undefined) {
    if (visited.has(cursor.box.boxId)) {
      throw new Error('pooled-reserve singleton lineage contains a cycle');
    }
    visited.add(cursor.box.boxId);
    ordered.push(cursor);
    cursor = cursor.spentTransactionIdHex === null
      ? undefined
      : byCreationTx.get(cursor.spentTransactionIdHex);
  }
  if (
    ordered.length !== boxes.length
    || ordered[ordered.length - 1].box.boxId !== tips[0].box.boxId
  ) {
    throw new Error('pooled-reserve singleton lineage is disconnected');
  }
  return ordered;
}

async function assertReserveIssuanceTransaction(
  client: AuthenticatedV2VaultReadOnlyNodeClient,
  root: IndexedReserveBox,
  nftIdHex: string,
): Promise<void> {
  const transaction = await normalizeSignedTransaction(
    await client.getTransaction(root.box.transactionId),
    root.box.transactionId,
    'pooled-reserve issuance transaction',
    false,
  );
  const inputs = array(
    transaction.canonical.inputs,
    'pooled-reserve issuance inputs',
  );
  const outputs = array(
    transaction.canonical.outputs,
    'pooled-reserve issuance outputs',
  );
  if (
    inputs.length === 0
    || inputId(inputs[0], 'pooled-reserve issuance first input') !== nftIdHex
  ) {
    throw new Error(
      'pooled-reserve singleton NFT is not issued from its bound genesis input',
    );
  }
  await assertTransactionOutput(
    outputs[root.box.index],
    root.box,
    'pooled-reserve issuance output',
  );
}

async function assertValueNeutralFeeFunding(
  client: AuthenticatedV2VaultReadOnlyNodeClient,
  source: IndexedReserveBox,
  feeInputIdHex: string,
  feeOutputValue: unknown,
): Promise<void> {
  const creation = await normalizeSignedTransaction(
    await client.getTransaction(source.box.transactionId),
    source.box.transactionId,
    'pooled-reserve source-lock creation transaction',
    false,
  );
  const outputs = array(
    creation.canonical.outputs,
    'pooled-reserve source-lock creation outputs',
  );
  if (source.box.index !== 0 || outputs.length < 2) {
    throw new Error(
      'pooled-reserve source-lock creation does not expose exact fee funding',
    );
  }
  await assertTransactionOutput(
    outputs[0],
    source.box,
    'pooled-reserve source-lock creation source output',
  );
  const funding = record(
    outputs[1],
    'pooled-reserve source-lock creation fee-funding output',
  );
  const fee = record(feeOutputValue, 'pooled-reserve deposit fee output');
  if (
    fixedHex(
      funding.boxId,
      32,
      'pooled-reserve fee-funding output ID',
    ) !== feeInputIdHex
    || funding.value !== fee.value
    || !Array.isArray(funding.assets)
    || funding.assets.length !== 0
    || canonicalJson(funding.additionalRegisters) !== '{}'
  ) {
    throw new Error(
      'pooled-reserve external fee input is not value-neutral',
    );
  }
}

function assertSourceIntentBindings(
  intent: ReturnType<typeof decodePegInSourceIntentV2Hex>,
  profile: ReturnType<typeof decodePegInPooledReserveLineageProfileV4Hex>,
  lineageProfileIdHex: string,
  sourceBox: Eip12Box,
): void {
  const checks = [
    ['source network', intent.sourceNetworkIdHex, profile.sourceNetworkIdHex],
    ['sidechain', intent.sidechainIdHex, profile.sidechainIdHex],
    ['bridge address', intent.bridgeAddressHex, profile.bridgeAddressHex],
    ['token address', intent.tokenAddressHex, profile.tokenAddressHex],
    [
      'settlement profile',
      intent.settlementProfileIdHex,
      profile.settlementProfileIdHex,
    ],
    ['lineage profile', intent.admissionProfileIdHex, lineageProfileIdHex],
    [
      'settlement asset',
      intent.sourceAssetIdHex,
      PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX,
    ],
    ['amount', intent.amountNanoErg, sourceBox.value],
  ] as const;
  for (const [label, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(`pooled-reserve source intent ${label} binding drifted`);
    }
  }
  if (intent.recipientAddressHex === `0x${'00'.repeat(20)}`) {
    throw new Error('pooled-reserve source intent recipient is zero');
  }
}

async function normalizeSignedTransaction(
  value: unknown,
  expectedIdHex: string,
  label: string,
  requireInclusion: boolean,
): Promise<CanonicalSignedTransaction> {
  const raw = record(value, label);
  const claimedIdHex = fixedHex(
    raw.id ?? raw.txId,
    32,
    `${label} claimed transaction ID`,
  );
  if (claimedIdHex !== expectedIdHex) {
    throw new Error(`${label} claimed transaction ID drifted`);
  }
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  let parsed: any;
  let parsedId: any;
  try {
    parsed = wasm.Transaction.from_json(JSON.stringify(raw));
    parsedId = parsed.id();
    const computedIdHex = fixedHex(
      parsedId.to_str(),
      32,
      `${label} computed transaction ID`,
    );
    if (computedIdHex !== expectedIdHex) {
      throw new Error(`${label} canonical bytes do not match transaction ID`);
    }
    const inclusionHeightValue = raw.inclusionHeight ?? raw.blockHeight;
    const inclusionHeaderValue =
      raw.headerId ?? raw.blockId ?? raw.inclusionBlockId;
    const inclusionHeight = inclusionHeightValue === undefined
      ? null
      : nonnegativeSafeInteger(
        inclusionHeightValue,
        `${label} inclusion height`,
      );
    const inclusionHeaderIdHex = inclusionHeaderValue === undefined
      ? null
      : fixedHex(
        inclusionHeaderValue,
        32,
        `${label} inclusion header ID`,
      );
    if (
      requireInclusion
      && (inclusionHeight === null || inclusionHeaderIdHex === null)
    ) {
      throw new Error(`${label} lacks confirmed inclusion metadata`);
    }
    return {
      idHex: computedIdHex,
      canonical: deepFreeze(parsed.to_js_eip12()),
      sigmaDigestHex: createHash('sha256')
        .update(Buffer.from(parsed.sigma_serialize_bytes()))
        .digest('hex'),
      inclusionHeight,
      inclusionHeaderIdHex,
    };
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message.startsWith(label)
        || error.message.includes('must be')
      )
    ) {
      throw error;
    }
    throw new Error(
      `${label} is not canonical Ergo transaction JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    parsedId?.free?.();
    parsed?.free?.();
  }
}

function assertSignedTransactionMatchesMaterialized(
  observed: CanonicalSignedTransaction,
  expected: Readonly<MaterializedUnsignedTransaction>,
  label: string,
): void {
  if (observed.idHex !== expected.txId) {
    throw new Error(`${label} does not match constructed transition ID`);
  }
  const inputs = array(observed.canonical.inputs, `${label} inputs`);
  const dataInputs = array(observed.canonical.dataInputs, `${label} data inputs`);
  const outputs = array(observed.canonical.outputs, `${label} outputs`);
  if (
    inputs.length !== expected.eip12Tx.inputs.length
    || dataInputs.length !== expected.eip12Tx.dataInputs.length
    || outputs.length !== expected.outputs.length
  ) {
    throw new Error(`${label} topology does not match constructed transition`);
  }
  for (let index = 0; index < inputs.length; index += 1) {
    assertInputId(
      inputs[index],
      expected.eip12Tx.inputs[index].boxId,
      `${label} input ${index}`,
    );
    if (
      canonicalJson(inputExtension(inputs[index], `${label} input ${index}`))
        !== canonicalJson(expected.eip12Tx.inputs[index].extension)
    ) {
      throw new Error(`${label} input ${index} extension drifted`);
    }
  }
  for (let index = 0; index < dataInputs.length; index += 1) {
    if (
      inputId(dataInputs[index], `${label} data input ${index}`)
        !== expected.eip12Tx.dataInputs[index].boxId
    ) {
      throw new Error(`${label} data input ${index} drifted`);
    }
  }
  for (let index = 0; index < outputs.length; index += 1) {
    const raw = record(outputs[index], `${label} output ${index}`);
    if (
      canonicalJson({
        boxId: raw.boxId,
        value: raw.value,
        ergoTree: raw.ergoTree,
        assets: raw.assets,
        additionalRegisters: raw.additionalRegisters,
        creationHeight: raw.creationHeight,
        transactionId: raw.transactionId,
        index: raw.index,
      }) !== canonicalJson(expected.outputs[index])
    ) {
      throw new Error(`${label} output ${index} drifted`);
    }
  }
}

async function assertTransactionOutput(
  value: unknown,
  expected: Eip12Box,
  label: string,
): Promise<void> {
  const raw = record(value, label);
  const observed = await normalizeEip12Box({
    boxId: raw.boxId,
    value: raw.value,
    ergoTree: raw.ergoTree,
    assets: raw.assets,
    additionalRegisters: raw.additionalRegisters,
    creationHeight: raw.creationHeight,
    transactionId: raw.transactionId,
    index: raw.index,
  }, label);
  if (canonicalJson(observed) !== canonicalJson(expected)) {
    throw new Error(`${label} does not match indexed singleton output`);
  }
}

function assertFeeOutput(value: unknown, label: string): void {
  const raw = record(value, label);
  if (
    typeof raw.value !== 'string'
    || BigInt(raw.value) < 1n
    || raw.ergoTree !== MINER_FEE_TREE
    || !Array.isArray(raw.assets)
    || raw.assets.length !== 0
    || canonicalJson(raw.additionalRegisters) !== '{}'
  ) {
    throw new Error(`${label} is not a pure ERG miner fee output`);
  }
}

async function canonicalUnspentBox(
  client: AuthenticatedV2VaultReadOnlyNodeClient,
  boxIdHex: string,
  label: string,
): Promise<Eip12Box> {
  const value = await client.getBoxByIdOrNull(boxIdHex);
  if (value === null) {
    throw new Error(`${label} is unavailable`);
  }
  return normalizeEip12Box(value, label);
}

function assertExactQuery(
  query: Readonly<ValidityApplicationPooledReserveDepositObservationQueryV4>,
  transition:
    Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>,
): void {
  assertExactObject(query, [
    'transitionTxIdHex',
    'sourceLockBoxIdHex',
    'reservePredecessorBoxIdHex',
    'reserveSuccessorBoxIdHex',
  ], 'pooled-reserve concrete observation query');
  const expected = {
    transitionTxIdHex: transition.transactions.reserveTransition.txId,
    sourceLockBoxIdHex: transition.boxes.sourceLock.boxId,
    reservePredecessorBoxIdHex: transition.boxes.reservePredecessor.boxId,
    reserveSuccessorBoxIdHex: transition.boxes.reserveSuccessor.boxId,
  };
  if (canonicalJson(query) !== canonicalJson(expected)) {
    throw new Error('pooled-reserve concrete observation query drifted');
  }
}

function assertSourcePair(
  value: Readonly<ValidityApplicationPooledReserveDepositErgoSourcePairV4>,
): Readonly<SourcePairRuntime> {
  if (
    value === null
    || typeof value !== 'object'
    || !sourcePairCandidates.has(value)
  ) {
    throw new Error(
      'pooled-reserve Ergo source pair was not statically built in this process',
    );
  }
  const runtime = sourcePairRuntimes.get(value);
  if (runtime === undefined) {
    throw new Error('pooled-reserve Ergo source-pair runtime is unavailable');
  }
  return runtime;
}

function normalizeHeader(value: unknown, label: string): NormalizedHeader {
  const raw = record(value, label);
  return {
    height: nonnegativeSafeInteger(raw.height, `${label} height`),
    headerIdHex: fixedHex(raw.id, 32, `${label} ID`),
    parentHeaderIdHex: fixedHex(raw.parentId, 32, `${label} parent ID`),
  };
}

function assertSameSnapshot(
  before: SyncedSnapshot,
  after: SyncedSnapshot,
): void {
  if (canonicalJson(before) !== canonicalJson(after)) {
    throw new Error(
      'Ergo full-block and extra-index snapshot changed during observation',
    );
  }
}

function inputId(value: unknown, label: string): string {
  const raw = record(value, label);
  return fixedHex(raw.boxId, 32, `${label} box ID`);
}

function assertInputId(
  value: unknown,
  expected: string,
  label: string,
): void {
  if (inputId(value, label) !== expected) {
    throw new Error(`${label} box ID drifted`);
  }
}

function inputExtension(
  value: unknown,
  label: string,
): Readonly<Record<string, string>> {
  const raw = record(value, label);
  const proof = record(raw.spendingProof, `${label} spending proof`);
  return normalizeExtension(proof.extension, `${label} extension`);
}

function normalizeExtension(
  value: unknown,
  label: string,
): Readonly<Record<string, string>> {
  const raw = record(value, label);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (!/^(0|[1-9][0-9]*)$/.test(key)) {
      throw new Error(`${label} key ${key} is not canonical`);
    }
    result[key] = variableHex(entry, `${label} Var(${key})`);
  }
  return Object.freeze(result);
}

function record(value: unknown, label: string): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const normalized = typeof value === 'string'
    ? value.replace(/^0x/, '')
    : value;
  if (
    typeof value !== 'string'
    || value !== value.toLowerCase()
    || typeof normalized !== 'string'
    || normalized.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be ${bytes}-byte canonical lowercase hex`);
  }
  return normalized;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase hex`);
  }
  return value;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function assertExactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): void {
  const raw = record(value, label);
  const actual = Object.keys(raw).sort();
  const expected = [...keys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} fields do not match the canonical schema`);
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(
        (value as Record<string, unknown>)[key],
      )}`
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
