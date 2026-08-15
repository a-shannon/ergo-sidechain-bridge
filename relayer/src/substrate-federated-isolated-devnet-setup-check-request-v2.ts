/**
 * Exact, non-executable setup-check request for the isolated local-devnet
 * profile. This module freezes bytes and policy; it exposes no signing,
 * checking, transport, submission, or broadcast capability.
 */

import blakejs from 'blakejs';

import { toUnsignedTransactionJson } from './ergo-unsigned-transaction.js';
import { snapshotStrictData } from './strict-data-snapshot.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  assertSubstrateFederatedIsolatedDevnetLocalProvisioningV2Provenance,
  getSubstrateFederatedIsolatedDevnetLocalCheckTargetV2,
  reobserveSubstrateFederatedIsolatedDevnetLocalProvisioningV2,
  type SubstrateFederatedIsolatedDevnetLocalProvisioningV2,
} from './substrate-federated-isolated-devnet-local-provisioning-v2.js';
import type {
  SubstrateFederatedGenesisObservationV1,
} from './substrate-federated-genesis-observation-v1.js';
import type {
  MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_REQUEST_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-setup-check-request.v2' as const;

const REQUEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_REQUEST_V2';
const OUTPUT_BODY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_OUTPUT_BODY_V2';
const V1_BODY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_UNSIGNED_BODY_V1';
const V1_MATERIALIZED_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MATERIALIZED_TX_V1';
const V1_IDENTITY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROVISIONING_IDENTITY_V1';
const REQUIRED_NETWORK_PREFIX = 16;
const CHECK_HEADERS_PATH = '/blocks/lastHeaders/10';
const CHECK_TRANSACTION_PATH = '/transactions/check';
const requests = new WeakMap<
  object,
  Readonly<SubstrateFederatedIsolatedDevnetLocalProvisioningV2>
>();

type SetupRole = 'tracker' | 'duplicate-prevention' | 'pooled-reserve';
type ProvisioningKey = 'tracker' | 'duplicatePrevention' | 'pooledReserve';

export interface SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2 {
  readonly ordinal: 0 | 1 | 2;
  readonly role: SetupRole;
  readonly provisioningIdentityDigestHex: string;
  readonly genesisInputBoxIdHex: string;
  readonly requiredInputErgoTreeHex: string;
  readonly unsignedTransactionIdHex: string;
  readonly unsignedTransactionBody: Readonly<Record<string, unknown>>;
  readonly unsignedTransactionBodyDigestHex: string;
  readonly materializedTransactionDigestHex: string;
  readonly bytesToSignHex: string;
  readonly bytesToSignBytes: number;
  readonly bytesToSignBlake2b256Hex: string;
  readonly predictedStateOutput: Readonly<{
    readonly boxIdHex: string;
    readonly transactionIdHex: string;
    readonly index: 0;
    readonly creationHeight: number;
    readonly bodyDigestHex: string;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetSetupCheckRequestV2 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_REQUEST_V2_SCHEMA;
  readonly version: 2;
  readonly status: 'exact_non_executable_local_setup_check_request';
  readonly requestDigestHex: string;
  readonly sourceBindings: Readonly<{
    readonly provisioningPlanDigestHex: string;
    readonly launchIntentIdHex: string;
    readonly settlementTargetDigestHex: string;
    readonly sourceAndCompilerClosureDigestHex: string;
    readonly compatibilityTargetV1AuditDigestHex: string;
    readonly freshObservationDigestHex: string;
    readonly genesisPayloadSetDigestHex: string;
    readonly provisioningIdentitySetDigestHex: string;
  }>;
  readonly target: Readonly<{
    readonly sourceNetworkScope: 'isolated-devnet';
    readonly settlementNetworkScope: 'ergo-local-devnet';
    readonly environment: 'devnet' | 'patched-devnet';
    readonly nodeReportedNetwork: 'devnet';
    readonly genesisHeaderIdHex: string;
    readonly profileIdHex: string;
    readonly profileDigestHex: string;
    readonly preSetupAnchor: Readonly<{
      readonly headerIdHex: string;
      readonly height: number;
    }>;
    readonly observedAt: string;
    readonly maximumObservationAgeMs: 60_000;
    readonly primary: Readonly<{
      readonly nodeOrigin: string;
      readonly sourceIdHex: string;
    }>;
    readonly witness: Readonly<{
      readonly nodeOrigin: string;
      readonly sourceIdHex: string;
    }>;
  }>;
  readonly checkPolicy: Readonly<{
    readonly signingNetworkPrefix: 16;
    readonly stateContext: Readonly<{
      readonly nodeOrigin: string;
      readonly method: 'GET';
      readonly path: '/blocks/lastHeaders/10';
    }>;
    readonly nodeCheck: Readonly<{
      readonly nodeOrigin: string;
      readonly method: 'POST';
      readonly path: '/transactions/check';
      readonly transactionOrder: readonly SetupRole[];
    }>;
    readonly sameOriginRequired: true;
    readonly transportPolicy: 'no-redirect-no-proxy';
    readonly submissionEndpointPresent: false;
    readonly broadcastEndpointPresent: false;
  }>;
  readonly orderedIssuances:
    readonly Readonly<SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2>[];
  readonly stages: Readonly<{
    readonly requestFreeze: 'complete';
    readonly unsignedBytes: 'complete';
    readonly signedBytes: 'absent';
    readonly jvmCheck: 'not-performed';
    readonly nodeCheck: 'not-performed';
    readonly submission: 'not-authorized';
    readonly broadcast: 'not-authorized';
    readonly confirmation: 'not-established';
  }>;
  readonly boundaries: Readonly<{
    readonly containsSignedTransactionBytes: false;
    readonly containsPrivateKeyOrSignerMaterial: false;
    readonly containsSignerCapability: false;
    readonly containsJvmCheckerCapability: false;
    readonly containsNodeClientOrTransportCapability: false;
    readonly containsSubmissionCapability: false;
    readonly containsBroadcastCapability: false;
    readonly v1TestnetPromotionAccepted: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly setupTransactionsSigned: false;
    readonly setupTransactionsSubmitted: false;
    readonly setupTransactionsBroadcast: false;
    readonly canonicalLineagesEstablished: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

let wasmPromise: Promise<any> | undefined;

async function getWasm(): Promise<any> {
  if (!wasmPromise) {
    wasmPromise = import('ergo-lib-wasm-nodejs')
      .then(module => module.default ?? module);
  }
  return wasmPromise;
}

export async function buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
  plan: Readonly<SubstrateFederatedIsolatedDevnetLocalProvisioningV2>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>> {
  const request = await deriveRequest(plan);
  requests.set(request, plan);
  return request;
}

export async function validateSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
  value: unknown,
  plan: Readonly<SubstrateFederatedIsolatedDevnetLocalProvisioningV2>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>> {
  const candidate = snapshotStrictData(
    value,
    'isolated local setup-check request',
  );
  const expected = await deriveRequest(plan);
  if (canonicalJson(candidate) !== canonicalJson(expected)) {
    throw new Error(
      'isolated local setup-check request does not match the provisioning plan',
    );
  }
  return expected;
}

export async function assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV2Provenance(
  value: unknown,
  plan: Readonly<SubstrateFederatedIsolatedDevnetLocalProvisioningV2>,
): Promise<void> {
  assertSetupCheckRequestV2ProcessProvenance(
    value,
  );
  if (requests.get(value as object) !== plan) {
    throw new Error(
      'isolated local setup-check request belongs to another provisioning plan',
    );
  }
  await validateSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(value, plan);
}

export async function assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV2RuntimeProvenance(
  value: unknown,
): Promise<void> {
  assertSetupCheckRequestV2ProcessProvenance(value);
  const plan = requests.get(value as object);
  if (plan === undefined) {
    throw new Error(
      'isolated local setup-check request provisioning plan is unavailable',
    );
  }
  await assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV2Provenance(
    value,
    plan,
  );
}

export async function reobserveSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
  value: unknown,
): Promise<Readonly<SubstrateFederatedGenesisObservationV1>> {
  await assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV2RuntimeProvenance(
    value,
  );
  const plan = requests.get(value as object)!;
  return reobserveSubstrateFederatedIsolatedDevnetLocalProvisioningV2(plan);
}

function assertSetupCheckRequestV2ProcessProvenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetSetupCheckRequestV2
> {
  if (value === null || typeof value !== 'object' || !requests.has(value)) {
    throw new Error(
      'isolated local setup-check request was not built in this process',
    );
  }
  const request = value as Readonly<
    SubstrateFederatedIsolatedDevnetSetupCheckRequestV2
  >;
  const { requestDigestHex, ...body } = request;
  if (
    !Object.isFrozen(request)
    || requestDigestHex !== sha256CanonicalJson(body, REQUEST_DIGEST_DOMAIN)
  ) {
    throw new Error('isolated local setup-check request process identity drifted');
  }
}

async function deriveRequest(
  plan: Readonly<SubstrateFederatedIsolatedDevnetLocalProvisioningV2>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>> {
  assertPlanBoundaryAndFreshness(plan);
  const target = getSubstrateFederatedIsolatedDevnetLocalCheckTargetV2(plan);
  const wasm = await getWasm();
  const orderedIssuances = deepFreeze([
    await issuanceBinding(plan, wasm, 0, 'tracker', 'tracker'),
    await issuanceBinding(
      plan,
      wasm,
      1,
      'duplicate-prevention',
      'duplicatePrevention',
    ),
    await issuanceBinding(plan, wasm, 2, 'pooled-reserve', 'pooledReserve'),
  ] as const);
  assertPlanBoundaryAndFreshness(plan);

  const body = deepFreeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_REQUEST_V2_SCHEMA,
    version: 2 as const,
    status: 'exact_non_executable_local_setup_check_request' as const,
    sourceBindings: {
      provisioningPlanDigestHex: plan.planDigestHex,
      launchIntentIdHex: plan.launchIntentIdHex,
      settlementTargetDigestHex: plan.target.settlementTargetDigestHex,
      sourceAndCompilerClosureDigestHex:
        plan.target.sourceAndCompilerClosureDigestHex,
      compatibilityTargetV1AuditDigestHex:
        plan.target.compatibilityTargetV1AuditDigestHex,
      freshObservationDigestHex: plan.freshObservation.reportDigestHex,
      genesisPayloadSetDigestHex: plan.genesisPayloads.payloadSetDigestHex,
      provisioningIdentitySetDigestHex:
        plan.provisioning.identitySetDigestHex,
    },
    target: {
      sourceNetworkScope: plan.target.sourceNetworkScope,
      settlementNetworkScope: plan.target.settlementNetworkScope,
      environment: target.environment,
      nodeReportedNetwork: target.nodeReportedNetwork,
      genesisHeaderIdHex: target.genesisHeaderIdHex,
      profileIdHex: plan.target.profileIdHex,
      profileDigestHex: plan.target.profileDigestHex,
      preSetupAnchor: plan.freshObservation.preSetupAnchor,
      observedAt: plan.freshObservation.observedAt,
      maximumObservationAgeMs: plan.freshObservation.maxAgeMs,
      primary: target.primary,
      witness: target.witness,
    },
    checkPolicy: {
      signingNetworkPrefix: REQUIRED_NETWORK_PREFIX as 16,
      stateContext: {
        nodeOrigin: target.primary.nodeOrigin,
        method: 'GET' as const,
        path: CHECK_HEADERS_PATH as '/blocks/lastHeaders/10',
      },
      nodeCheck: {
        nodeOrigin: target.primary.nodeOrigin,
        method: 'POST' as const,
        path: CHECK_TRANSACTION_PATH as '/transactions/check',
        transactionOrder: deepFreeze([
          'tracker',
          'duplicate-prevention',
          'pooled-reserve',
        ] as const),
      },
      sameOriginRequired: true as const,
      transportPolicy: 'no-redirect-no-proxy' as const,
      submissionEndpointPresent: false as const,
      broadcastEndpointPresent: false as const,
    },
    orderedIssuances,
    stages: {
      requestFreeze: 'complete' as const,
      unsignedBytes: 'complete' as const,
      signedBytes: 'absent' as const,
      jvmCheck: 'not-performed' as const,
      nodeCheck: 'not-performed' as const,
      submission: 'not-authorized' as const,
      broadcast: 'not-authorized' as const,
      confirmation: 'not-established' as const,
    },
    boundaries: falseBoundaries(),
  });
  return deepFreeze({
    ...body,
    requestDigestHex: sha256CanonicalJson(body, REQUEST_DIGEST_DOMAIN),
  });
}

async function issuanceBinding(
  plan: Readonly<SubstrateFederatedIsolatedDevnetLocalProvisioningV2>,
  wasm: any,
  ordinal: 0 | 1 | 2,
  role: SetupRole,
  key: ProvisioningKey,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2>> {
  const entry = plan.provisioning[key];
  const identity = entry.identity;
  const transaction = entry.transaction as Readonly<
    MaterializedUnsignedTransaction
  >;
  const input = transaction.eip12Tx.inputs[0];
  const stateOutput = transaction.outputs[identity.stateOutputIndex];
  if (
    identity.role !== role
    || transaction.eip12Tx.inputs.length !== 1
    || transaction.eip12Tx.dataInputs.length !== 0
    || input === undefined
    || stateOutput === undefined
    || input.boxId !== identity.genesisInputBoxIdHex
    || transaction.txId !== identity.unsignedTransactionIdHex
    || stateOutput.boxId !== identity.stateOutputBoxIdHex
    || stateOutput.transactionId !== transaction.txId
    || stateOutput.index !== identity.stateOutputIndex
    || stateOutput.creationHeight !== identity.creationHeight
  ) {
    throw new Error(`isolated local ${role} setup-check identity drifted`);
  }
  const bodyDigestHex = sha256CanonicalJson(
    transaction.eip12Tx,
    V1_BODY_DIGEST_DOMAIN,
  );
  const materializedDigestHex = sha256CanonicalJson(
    transaction,
    V1_MATERIALIZED_DIGEST_DOMAIN,
  );
  const { identityDigestHex, ...identityBody } = identity;
  if (
    bodyDigestHex !== identity.unsignedTransactionBodyDigestHex
    || materializedDigestHex !== identity.materializedTransactionDigestHex
    || sha256CanonicalJson(identityBody, V1_IDENTITY_DIGEST_DOMAIN)
      !== identityDigestHex
  ) {
    throw new Error(`isolated local ${role} provisioning digest drifted`);
  }

  const proofless = serializeProoflessTransaction(
    wasm,
    transaction,
    role,
  );
  return deepFreeze({
    ordinal,
    role,
    provisioningIdentityDigestHex: identity.identityDigestHex,
    genesisInputBoxIdHex: identity.genesisInputBoxIdHex,
    requiredInputErgoTreeHex: fixedVariableHex(
      input.ergoTree,
      `${role} input ErgoTree`,
    ),
    unsignedTransactionIdHex: identity.unsignedTransactionIdHex,
    unsignedTransactionBody: transaction.eip12Tx as unknown as Readonly<
      Record<string, unknown>
    >,
    unsignedTransactionBodyDigestHex: bodyDigestHex,
    materializedTransactionDigestHex: materializedDigestHex,
    bytesToSignHex: proofless.bytesToSignHex,
    bytesToSignBytes: proofless.bytesToSignBytes,
    bytesToSignBlake2b256Hex: proofless.bytesToSignBlake2b256Hex,
    predictedStateOutput: {
      boxIdHex: identity.stateOutputBoxIdHex,
      transactionIdHex: identity.unsignedTransactionIdHex,
      index: identity.stateOutputIndex,
      creationHeight: identity.creationHeight,
      bodyDigestHex: sha256CanonicalJson(
        stateOutput,
        OUTPUT_BODY_DIGEST_DOMAIN,
      ),
    },
  });
}

function serializeProoflessTransaction(
  wasm: any,
  transaction: Readonly<MaterializedUnsignedTransaction>,
  role: SetupRole,
): Readonly<{
  bytesToSignHex: string;
  bytesToSignBytes: number;
  bytesToSignBlake2b256Hex: string;
}> {
  let unsigned: any;
  let proofless: any;
  let unsignedId: any;
  let prooflessId: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(
      toUnsignedTransactionJson(transaction.eip12Tx),
    ));
    unsignedId = unsigned.id();
    const unsignedIdHex = fixedHex(unsignedId.to_str(), 32, `${role} ID`);
    unsignedId.free?.();
    unsignedId = undefined;
    const consumedUnsigned = unsigned;
    unsigned = undefined;
    proofless = wasm.Transaction.from_unsigned_tx(
      consumedUnsigned,
      [new Uint8Array()],
    );
    prooflessId = proofless.id();
    const prooflessIdHex = fixedHex(
      prooflessId.to_str(),
      32,
      `${role} proofless ID`,
    );
    const bytes = Buffer.from(proofless.sigma_serialize_bytes());
    const bytesDigestHex = blake2b256Hex(bytes);
    if (
      unsignedIdHex !== transaction.txId
      || prooflessIdHex !== transaction.txId
      || bytesDigestHex !== transaction.txId
    ) {
      throw new Error(
        `isolated local ${role} unsigned bytes and transaction ID differ`,
      );
    }
    return Object.freeze({
      bytesToSignHex: bytes.toString('hex'),
      bytesToSignBytes: bytes.length,
      bytesToSignBlake2b256Hex: bytesDigestHex,
    });
  } finally {
    prooflessId?.free?.();
    unsignedId?.free?.();
    proofless?.free?.();
    unsigned?.free?.();
  }
}

function assertPlanBoundaryAndFreshness(
  plan: Readonly<SubstrateFederatedIsolatedDevnetLocalProvisioningV2>,
): void {
  assertSubstrateFederatedIsolatedDevnetLocalProvisioningV2Provenance(plan);
  if (
    plan.status
      !== 'fresh_observation_bound_non_authorizing_local_provisioning'
    || plan.target.sourceNetworkScope !== 'isolated-devnet'
    || plan.target.settlementNetworkScope !== 'ergo-local-devnet'
    || plan.freshObservation.maxAgeMs !== 60_000
    || plan.execution.networkAccessPerformed
    || plan.execution.signerOrWalletMaterialRead
    || plan.execution.nodeCheckPerformed
    || plan.execution.signedTransactionConstructed
    || plan.execution.submissionPerformed
    || plan.execution.broadcastPerformed
    || !plan.boundaries.localCompatibilityIntentOnly
    || !plan.boundaries.currentGenesisInputsObservedUnspent
    || Object.entries(plan.boundaries).some(([key, value]) =>
      key !== 'localCompatibilityIntentOnly'
      && key !== 'currentGenesisInputsObservedUnspent'
      && value !== false)
  ) {
    throw new Error(
      'isolated local setup-check request requires a non-authorizing V2 plan',
    );
  }
  const observedAtMs = Date.parse(plan.freshObservation.observedAt);
  const ageMs = Date.now() - observedAtMs;
  if (
    !Number.isSafeInteger(observedAtMs)
    || ageMs < 0
    || ageMs > plan.freshObservation.maxAgeMs
  ) {
    throw new Error(
      'isolated local setup-check request exceeded its fixed freshness window',
    );
  }
}

function falseBoundaries(): SubstrateFederatedIsolatedDevnetSetupCheckRequestV2[
  'boundaries'
] {
  return Object.freeze({
    containsSignedTransactionBytes: false as const,
    containsPrivateKeyOrSignerMaterial: false as const,
    containsSignerCapability: false as const,
    containsJvmCheckerCapability: false as const,
    containsNodeClientOrTransportCapability: false as const,
    containsSubmissionCapability: false as const,
    containsBroadcastCapability: false as const,
    v1TestnetPromotionAccepted: false as const,
    targetNodeAcceptanceEstablished: false as const,
    setupTransactionsSigned: false as const,
    setupTransactionsSubmitted: false as const,
    setupTransactionsBroadcast: false as const,
    canonicalLineagesEstablished: false as const,
    profileActivated: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be ${bytes} bytes of lowercase hex`);
  }
  return value;
}

function fixedVariableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase hex`);
  }
  return value;
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
